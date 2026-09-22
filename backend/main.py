from __future__ import annotations

import base64
import hashlib
import hmac
import json
import math
import os
import re
import sqlite3
import threading
import time
from heapq import heappop, heappush
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DB_PATH = DATA / "campus.db"
SECRET = os.environ.get("CAMPUS_JWT_SECRET", "yueyang-campus-local-demo-secret").encode()

app = FastAPI(title="岳阳学院智慧校园数字孪生 API", version="1.2.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:4175", "http://127.0.0.1:4175"], allow_methods=["*"], allow_headers=["*"])
# 大体积 JSON（students.json 2.2MB / 房间锚点等）走 gzip，传输量约降到 1/10。
# compresslevel 默认 9 对 2MB 文本要压 300~600ms，是 /api/rag/data/* 慢的直接原因；
# JSON 冗余度高，降到 5 后体积几乎不变而 CPU 减半。
app.add_middleware(GZipMiddleware, minimum_size=2048, compresslevel=5)


class LoginBody(BaseModel):
    username: str
    password: str


class QueryBody(BaseModel):
    query: str
    origin: Optional[str] = "gate"


class AnchorBody(BaseModel):
    room_code: str
    semantic_name: str
    building_code: str
    anchor_world: List[float]


class NoticeBody(BaseModel):
    content: str


# ============================================================
# DS2 作息时间表：第 N 大节 ↔ 起止时间（唯一映射源）
#   夏季作息 5.1-9.30 / 冬季作息 10.1-次年 4.30（源：岳阳学院2026-2027学年校历）
# ============================================================
RAG_DATA = DATA / "rag"
SEMESTER_START = "2026-08-31"   # 第 1 周周一（校历）
NATIONAL_DAY = "2026-10-01"     # 夏/冬作息分界

# 只读 JSON 的解析结果缓存（进程生命周期内有效）
_JSON_CACHE: dict[str, object] = {}


def _cached_json(path: Path):
    """进程级 JSON 文件缓存。

    这些数据文件是只读的（生成脚本产出后不再变），但体积不小：
    room_anchors.json 1.5MB / students.json 2.8MB / road_graph.json 39KB。
    原来 graph_data()/room_data() 每次调用都 read_text+json.loads，
    一次路径问答会重读同一文件十几次，一次 /api/rooms 请求要重读 1.5MB。
    这里按绝对路径缓存解析结果，进程内只解析一次。
    """
    key = str(path)
    cached = _JSON_CACHE.get(key)
    if cached is None:
        cached = json.loads(path.read_text(encoding="utf-8"))
        _JSON_CACHE[key] = cached
    return cached


def _rag(name: str):
    return _cached_json(RAG_DATA / name)


_TIMETABLE_CACHE: dict[str, dict[int, tuple[str, str]]] = {}


def timetable_of(date_str: str) -> dict[int, tuple[str, str]]:
    """按期次返回 大节 → (起, 止)。按 regime 缓存，避免每次问答重建整张表。"""
    regime = "winter" if date_str >= NATIONAL_DAY else "summer"
    table = _TIMETABLE_CACHE.get(regime)
    if table is None:
        raw = _rag("timetable.json")[regime]
        table = {int(k): tuple(v) for k, v in raw.items() if k.isdigit()}
        _TIMETABLE_CACHE[regime] = table
    return table


TIMETABLE = timetable_of("2026-09-01")   # 默认（开学初期为夏季作息）


def week_of(date_str: str) -> int:
    """日期 → 教学周序号（第 1 周周一 = 2026-08-31）。"""
    import datetime
    delta = (datetime.date.fromisoformat(date_str) - datetime.date.fromisoformat(SEMESTER_START)).days
    return delta // 7 + 1 if delta >= 0 else 0


# ============================================================
# DS1 课程表：来自 scripts/generate_rag_data.py 的真实排课结果
#   133 个班 · 2026-2027 学年第一学期 · 每周 12~15 大节
# ============================================================
SCHEDULE_ROWS: list[dict] = _rag("schedule.json")

# ============================================================
# DS4 学生宿舍：来自 students.json（7004 人，6 人间，同班同性别）
# ============================================================
STUDENT_ROWS: list[dict] = _rag("students.json")
CLASS_INFO: dict[str, dict] = _rag("training_plan.json")["classes"]

# 辅导员 → 管理班级（按真实数据反查）
COUNSELOR_CLASSES: dict[str, list[str]] = {}
_COUNSELOR_OF_CLASS: dict[str, str] = {c: info["counselor"] for c, info in CLASS_INFO.items()}
for _cls, _c in _COUNSELOR_OF_CLASS.items():
    COUNSELOR_CLASSES.setdefault(_c, []).append(_cls)

# 任课教师 → 承担班级
TEACHER_CLASSES: dict[str, list[str]] = {}
for _r in SCHEDULE_ROWS:
    TEACHER_CLASSES.setdefault(_r["teacher"], set()).add(_r["class_name"])
TEACHER_CLASSES = {k: sorted(v) for k, v in TEACHER_CLASSES.items()}


def _pick_demo_users() -> list[tuple]:
    """演示账号统一指向真实数据中的学生 / 教师 / 辅导员。"""
    by_class: dict[str, list[dict]] = {}
    for s in STUDENT_ROWS:
        by_class.setdefault(s["class_name"], []).append(s)
    s1 = by_class["计科2501"][0]
    s2 = by_class["汉语言2602"][0]
    s3 = by_class["机设2601"][0]
    teacher = sorted(TEACHER_CLASSES, key=lambda t: -len(TEACHER_CLASSES[t]))[0]
    counselor = sorted(COUNSELOR_CLASSES, key=lambda c: -len(COUNSELOR_CLASSES[c]))[0]
    return [
        ("student", password_hash("campus123"), s1["name"], "student", s1["class_name"]),
        ("student2", password_hash("campus123"), s2["name"], "student", s2["class_name"]),
        ("student3", password_hash("campus123"), s3["name"], "student", s3["class_name"]),
        ("teacher", password_hash("teacher123"), teacher, "teacher", "任课教师"),
        ("counselor", password_hash("campus123"), counselor, "counselor", "辅导员"),
        ("admin", password_hash("admin123"), "系统管理员", "admin", "智慧校园中心"),
    ]


def dorm_room_code(building: str, floor: int, room: int) -> str:
    return f"{building}_CR_F{floor}_{room:03d}"


def password_hash(password: str) -> str:
    return hashlib.sha256(f"yueyang:{password}".encode()).hexdigest()


def init_db() -> None:
    db = db_conn()
    db.execute("CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password_hash TEXT NOT NULL, display_name TEXT NOT NULL, role TEXT NOT NULL, class_name TEXT)")
    db.executemany("INSERT OR REPLACE INTO users VALUES (?, ?, ?, ?, ?)", _pick_demo_users())

    db.execute("CREATE TABLE IF NOT EXISTS schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, class_name TEXT, course TEXT, teacher TEXT, weekday INTEGER, period INTEGER, location TEXT, weeks TEXT, grade TEXT, major TEXT, course_type TEXT)")
    db.execute("DELETE FROM schedule")
    db.executemany(
        "INSERT INTO schedule(class_name, course, teacher, weekday, period, location, weeks, grade, major, course_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [(r["class_name"], r["course"], r["teacher"], r["weekday"], r["period"], r["location"],
          json.dumps(r["weeks"]), r["grade"], r["major"], r["course_type"]) for r in SCHEDULE_ROWS],
    )

    db.execute("CREATE TABLE IF NOT EXISTS dorm_members (name TEXT, class_name TEXT, grade TEXT, building_code TEXT, floor INTEGER, room_number INTEGER, phone TEXT, home_phone TEXT)")
    db.execute("DELETE FROM dorm_members")
    db.executemany(
        "INSERT INTO dorm_members VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [(s["name"], s["class_name"], s["grade"], s["dorm_building"], s["dorm_floor"], s["dorm_room"], s["phone"], s["home_phone"])
         for s in STUDENT_ROWS],
    )

    db.execute("CREATE TABLE IF NOT EXISTS room_anchor_overrides (room_code TEXT PRIMARY KEY, semantic_name TEXT NOT NULL, building_code TEXT NOT NULL, anchor_world TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS notices (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL)")
    if not db.execute("SELECT 1 FROM notices LIMIT 1").fetchone():
        db.execute("INSERT INTO notices(content, created_by, created_at) VALUES (?, ?, ?)", ("智慧校园模型已按公开规划与校园沙盘多视角资料更新。", "system", int(time.time())))

    # ---- 索引：schedule 1849 行、dorm_members 7004 行，全表扫描是查询慢的直接原因 ----
    # schedule：按「班级+星期+大节」取课表（schedule_for）、按教师查课（教师视角）
    db.execute("CREATE INDEX IF NOT EXISTS idx_schedule_class_day_period ON schedule(class_name, weekday, period)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_schedule_teacher ON schedule(teacher)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_schedule_day_period ON schedule(weekday, period)")
    # dorm_members：按房间查成员（宿舍卡）、按姓名定位学生、按班级聚合（辅导员高亮）
    db.execute("CREATE INDEX IF NOT EXISTS idx_dorm_room ON dorm_members(building_code, floor, room_number)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_dorm_name ON dorm_members(name)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_dorm_class ON dorm_members(class_name)")
    # 管理员空间锚点按楼栋查询（/api/rooms/{code} 的 override 关联）
    db.execute("CREATE INDEX IF NOT EXISTS idx_override_building ON room_anchor_overrides(building_code)")

    db.commit()
    db.execute("ANALYZE")   # 让查询计划器用上刚建的索引
    db.commit()


# ============ 工具 ============

def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def sign_token(user: dict) -> str:
    header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = b64(json.dumps({**user, "iat": int(time.time()), "exp": int(time.time()) + 86400}, ensure_ascii=False, separators=(",", ":")).encode())
    signature = b64(hmac.new(SECRET, f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


def verify_token(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "缺少登录令牌")
    token = authorization[7:]
    try:
        header, payload, signature = token.split(".")
        expected = b64(hmac.new(SECRET, f"{header}.{payload}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected): raise ValueError
        parsed = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        if parsed["exp"] < time.time(): raise ValueError
        return parsed
    except Exception as exc:
        raise HTTPException(401, "登录令牌无效或已过期") from exc


def graph_data() -> dict:
    return _cached_json(DATA / "road_graph.json")


def room_data() -> dict:
    return _cached_json(DATA / "room_anchors.json")


ROOM_RECORDS: list[dict] = room_data()["rooms"]
ROOMS: dict[str, dict] = {r["room_code"]: r for r in ROOM_RECORDS}
# 楼栋 → 房间列表（原来 /api/rooms/{code} 每次都把 1.5MB 全量 JSON 读进来再过滤）
ROOMS_BY_BUILDING: dict[str, list[dict]] = {}
for _r in ROOM_RECORDS:
    ROOMS_BY_BUILDING.setdefault(_r["building_code"], []).append(_r)


def _bare_building_name(room: dict) -> str:
    """房间锚点里的楼栋名可能带「（1#教学综合楼组成圆环）」这类补充说明，取主干。"""
    return re.split(r"[（(]", room["semantic_name"].split("·")[0])[0].strip()


BUILDING_NAMES = {code: _bare_building_name(rooms[0]) for code, rooms in ROOMS_BY_BUILDING.items()}
BUILDING_ENTRIES = sorted(ROOMS_BY_BUILDING.keys())
# 非楼栋 POI 路网节点 -> 展示名（用于路径分段说明）
POI_NAMES = {
    "sportsEast": "400米田径场",
    "gate": "南校门",
    "north": "北区中央路口",
}
# 楼栋布局（id -> x/z/w/d），供室内连接线裁剪到楼体 bbox 用
LAYOUT_BUILDINGS: dict[str, dict] = {
    b["id"]: b for b in _cached_json(DATA / "campus_layout.json")["buildings"]
}
# 路网节点坐标（id -> [x,y,z]），供「门->房间」室内线取门口位置用
NODE_POSITIONS: dict[str, list] = {
    n["id"]: n["position"] for n in graph_data()["nodes"]
}


# ============ SQLite：每线程复用连接 + WAL ============

_DB_LOCAL = threading.local()


def db_conn() -> sqlite3.Connection:
    """每线程一个长连接。

    原实现每次 db_rows() 都 sqlite3.connect()/close()：一次问答里 schedule_for
    会被调用 2~4 次、default_highlights 会调用更多次，一个请求开十几个连接。
    SQLite 打开连接虽不贵，但叠加 WAL/PRAGMA 与行工厂设置后是纯浪费。
    """
    conn = getattr(_DB_LOCAL, "conn", None)
    if conn is None:
        conn = sqlite3.connect(DB_PATH, timeout=15, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA temp_store=MEMORY")
        conn.execute("PRAGMA cache_size=-20000")   # 约 20MB page cache
        _DB_LOCAL.conn = conn
    return conn


def db_rows(sql: str, args: tuple = ()) -> list[dict]:
    rows = db_conn().execute(sql, args).fetchall()
    return [dict(row) for row in rows]


def classes_of_user(user: dict) -> list[str]:
    role = user.get("role")
    if role == "student":
        return [user.get("class_name")] if user.get("class_name") else []
    if role == "counselor":
        return COUNSELOR_CLASSES.get(user.get("display_name"), [])
    if role == "teacher":
        return TEACHER_CLASSES.get(user.get("display_name"), []) or sorted(
            {r["class_name"] for r in db_rows("SELECT DISTINCT class_name FROM schedule WHERE teacher = ?", (user.get("display_name"),))})
    return []


def dorm_of_user(user: dict) -> Optional[dict]:
    if user.get("role") != "student":
        return None
    rows = db_rows("SELECT * FROM dorm_members WHERE name = ? AND class_name = ?", (user.get("display_name"), user.get("class_name")))
    return rows[0] if rows else None


# ============ 时间解析（铁律：一律先取服务器当前时间） ============

def date_offset(base: str, days: int) -> str:
    import datetime
    return (datetime.date.fromisoformat(base) + datetime.timedelta(days=days)).isoformat()


def weekday_of(date_str: str) -> int:
    import datetime
    return datetime.date.fromisoformat(date_str).isoweekday()


def parse_time(text: str) -> dict:
    today = time.strftime("%Y-%m-%d")
    date = today
    explicit = False
    if "明天" in text:
        date, explicit = date_offset(today, 1), True
    elif "后天" in text:
        date, explicit = date_offset(today, 2), True
    else:
        for token, weekday in (("周一", 1), ("周二", 2), ("周三", 3), ("周四", 4), ("周五", 5), ("周六", 6), ("周日", 7), ("星期日", 7)):
            if token in text:
                delta = (weekday - weekday_of(today)) % 7 or 7
                date, explicit = date_offset(today, delta), True
                break
    import re
    periods = [1, 2, 3, 4]
    label = "全天"
    match = re.search(r"第\s*([1-5])\s*[大节节]", text)
    cn_match = re.search(r"第([一二三四五])\s*[大节节]", text)
    if match:
        periods, label = [int(match.group(1))], f"第{match.group(1)}大节"
    elif cn_match:
        num = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5}[cn_match.group(1)]
        periods, label = [num], f"第{num}大节"
    elif "上午" in text:
        periods, label = [1, 2], "上午(第1~2大节)"
    elif "下午" in text:
        periods, label = [3, 4], "下午(第3~4大节)"
    elif "晚上" in text:
        periods, label = [5], "晚上(第5大节)"
    return {"today": today, "date": date, "explicit": explicit, "periods": periods, "label": label}


def next_class_day(date_str: str) -> str:
    while weekday_of(date_str) > 5:
        date_str = date_offset(date_str, 1)
    return date_str


def schedule_for(classes: list[str], date_str: str, periods: list[int]) -> list[dict]:
    """按班级 + 星期 + 大节取课表，并按教学周过滤课程周次区间。"""
    if not classes:
        return []
    weekday = weekday_of(date_str)
    week = week_of(date_str)
    rows = db_rows(
        "SELECT * FROM schedule WHERE class_name IN (%s) AND weekday = ? AND period IN (%s) ORDER BY period"
        % (",".join("?" * len(classes)), ",".join("?" * len(periods))),
        tuple(classes) + (weekday,) + tuple(periods),
    )
    if week <= 0:
        return rows
    out = []
    for r in rows:
        try:
            w0, w1 = json.loads(r.get("weeks") or "[1,18]")
        except Exception:
            w0, w1 = 1, 18
        if w0 <= week <= w1:
            out.append(r)
    return out


def date_label(date_str: str, today: str) -> str:
    wd = "一二三四五六日"[weekday_of(date_str) - 1]
    if date_str == today:
        return f"今天(周{wd})"
    if date_str == date_offset(today, 1):
        return f"明天(周{wd})"
    return f"{date_str}(周{wd})"


def location_display(location: str) -> str:
    if location.startswith("POI:"):
        return {"POI:sportsEast": "400米田径场"}.get(location, location[4:])
    room = ROOMS.get(location)
    return room["semantic_name"] if room else location


# ============ 登录默认高亮（规格书 7.3 时段规则） ============

def default_highlights(user: dict) -> list[dict]:
    role = user.get("role")
    if role == "admin":
        return []
    classes = classes_of_user(user)
    now = time.localtime()
    today = time.strftime("%Y-%m-%d", now)
    hour = now.tm_hour
    out: list[dict] = []
    target: tuple[str, list[int]]
    if role == "counselor":
        rows = db_rows("SELECT DISTINCT building_code, floor, room_number, class_name FROM dorm_members WHERE class_name IN (%s)" % ",".join("?" * len(classes)), tuple(classes)) if classes else []
        for row in rows:
            code = dorm_room_code(row["building_code"], row["floor"], row["room_number"])
            if code in ROOMS:
                out.append({"room_code": code, "color": "dorm", "label": row["class_name"]})
    if hour < 12:
        target = (today if schedule_for(classes, today, [1, 2, 3, 4]) else next_class_day(today)), [1, 2, 3, 4]
        date_morning, date_afternoon = target[0], target[0]
    elif hour < 18:
        if schedule_for(classes, today, [3, 4]):
            date_morning, date_afternoon = next_class_day(date_offset(today, 1)), today
        else:
            fallback = next_class_day(today)
            date_morning = date_afternoon = fallback
    else:
        date_morning = date_afternoon = next_class_day(date_offset(today, 1))
    for row in schedule_for(classes, date_morning, [1, 2]):
        if row["location"] in ROOMS:
            out.append({"room_code": row["location"], "color": "morning", "label": f"第{row['period']}大节 {row['course']}"})
    for row in schedule_for(classes, date_afternoon, [3, 4]):
        if row["location"] in ROOMS:
            out.append({"room_code": row["location"], "color": "afternoon", "label": f"第{row['period']}大节 {row['course']}"})
    if date_morning > today or date_afternoon > today:
        for item in out:
            if item["color"] == "morning":
                item["color"] = "next"
    seen, unique = set(), []
    for item in out:
        key = (item["room_code"], item["color"])
        if key not in seen:
            seen.add(key); unique.append(item)
    return unique


# ============ 路网 Dijkstra + 多目的地 + 室内段 ============

# ---- 路网邻接表：进程内只建一次 ----
# 原实现每次 shortest_path() 都 graph_data()（读文件）+ 从 edges 重建邻接表，
# 而一次「宿舍到明天所有教室」的问答会串行调用 4~6 次 shortest_path。
_ADJACENCY: Optional[dict[str, list[tuple[float, str]]]] = None


def adjacency() -> dict[str, list[tuple[float, str]]]:
    global _ADJACENCY
    if _ADJACENCY is None:
        table: dict[str, list[tuple[float, str]]] = {}
        for edge in graph_data()["edges"]:
            table.setdefault(edge["from"], []).append((edge["distance_m"], edge["to"]))
            table.setdefault(edge["to"], []).append((edge["distance_m"], edge["from"]))
        _ADJACENCY = table
    return _ADJACENCY


def shortest_path(start: str, target: str) -> dict:
    """Dijkstra（堆 + prev 指针回溯）。

    原实现把「路径列表」整个塞进堆里，每次松弛都 path + [node] 复制一遍，
    节点一多就是 O(V*E) 级别的列表拷贝。改成 prev 指针回溯，只在命中时重建一次路径，
    同时用 dist 表做真正的「未访问且更短」判断（原来只判 not in visited，
    会把同一个点用更长的距离重复入堆）。
    """
    if start == target:
        return {"nodes": [start], "distance_m": 0.0, "walking_minutes": 0}
    table = adjacency()
    dist: dict[str, float] = {start: 0.0}
    prev: dict[str, Optional[str]] = {start: None}
    queue: list[tuple[float, str]] = [(0.0, start)]
    visited: set[str] = set()
    while queue:
        distance, node = heappop(queue)
        if node in visited:
            continue
        visited.add(node)
        if node == target:
            path: list[str] = []
            cursor: Optional[str] = node
            while cursor is not None:
                path.append(cursor)
                cursor = prev.get(cursor)
            path.reverse()
            return {"nodes": path, "distance_m": round(distance, 1),
                    "walking_minutes": max(1, round(distance / 72))}
        for weight, neighbor in table.get(node, ()):
            if neighbor in visited:
                continue
            candidate = distance + weight
            if candidate < dist.get(neighbor, math.inf):
                dist[neighbor] = candidate
                prev[neighbor] = node
                heappush(queue, (candidate, neighbor))
    return {"nodes": [], "distance_m": 0, "walking_minutes": 0}


def entry_of(location: str) -> str:
    if location.startswith("POI:"):
        return location[4:]
    room = ROOMS.get(location)
    return f"entry_{room['building_code']}" if room else "north"


def nearest_entry_path(start: str, target_node: str) -> tuple[str, dict]:
    """目标为建筑入口时，在前门/后门中选 Dijkstra 总距离更短的一侧（「最近入口」）。

    每栋楼前后门都接入路网，但固定走前门不一定近——比如从北侧出发，
    走后门能省掉绕到楼前的半圈。返回 (选中的入口节点, 路径)。
    """
    if not target_node.startswith("entry_") or target_node.endswith("_back"):
        return target_node, shortest_path(start, target_node)
    code = target_node[len("entry_"):]
    front = shortest_path(start, target_node)
    back_node = f"entry_{code}_back"
    back = shortest_path(start, back_node)
    if back["nodes"] and (not front["nodes"] or back["distance_m"] < front["distance_m"]):
        return back_node, back
    return target_node, front


def resolve_origin(user: dict, text: str, requested_origin: str) -> str:
    """路径起点：显式「从X…」> 学生宿舍 > 校门。

    显式起点支持楼栋名（「从8#会堂到…」）与 POI（「从南校门到…」）。
    """
    import re as _re

    m = _re.search(r"从(.{1,14}?)到", text)
    if m:
        hit = match_building_entry(m.group(1))
        if hit:
            return hit[0]
        for poi_id, poi_name in POI_NAMES.items():
            if poi_name and poi_name in m.group(1):
                return poi_id
    dorm = dorm_of_user(user)
    if dorm and (user.get("role") == "student" or "宿舍" in text):
        return f"entry_{dorm['building_code']}"
    if requested_origin and requested_origin not in ("gate", "auto", "current"):
        return requested_origin
    return "gate"


def match_building_entry(text: str):
    """楼栋名匹配，无命中返回 None（不退化到默认节点）。

    匹配优先级：编号前缀（「11#食堂」前缀命中「11#食堂和活动中心」）
    > 全名 > 去序号简称 > 「X栋/X号楼」。
    """
    import re as _re

    normalized = text.replace("#", "号").replace("＃", "号")
    m = _re.search(r"(\d{1,2})\s*号?\s*([\u4e00-\u9fa5A-Za-z]{2,8})", normalized)
    if m:
        num, frag = m.group(1), m.group(2)
        # 「11#食堂怎么走」会把「怎么走」吞进片段，先切掉疑问词/流向词
        for sw in ("怎么走", "怎么去", "怎么", "在哪", "路线", "多远", "到", "去", "往"):
            frag = frag.split(sw)[0]
        if len(frag) >= 2:
            for building in BUILDING_ENTRIES:
                name = BUILDING_NAMES.get(building, building)
                nm = _re.match(r"^(\d{1,2})号", name.replace("#", "号"))
                if nm and nm.group(1) == num and frag in name:
                    return f"entry_{building}", name, building

    def full_tokens(name: str) -> tuple[str, ...]:
        return (name, name.replace("#", "号"))

    def bare_tokens(name: str) -> tuple[str, ...]:
        return (_re.sub(r"^\d+\s*[号#＃]?", "", name),)

    for tokens_of in (full_tokens, bare_tokens):
        for building in BUILDING_ENTRIES:
            name = BUILDING_NAMES.get(building, building)
            for token in tokens_of(name):
                if len(token) >= 2 and token in normalized:
                    return f"entry_{building}", name, building
    for building in BUILDING_ENTRIES:
        number = building.lstrip("B")
        for token in (f"{number}栋", f"{number}号楼", f"{number}号"):
            if token in text:
                return f"entry_{building}", BUILDING_NAMES.get(building, building), building
    return None


def resolve_building_entry(text: str) -> tuple[str, str, str]:
    """从任意楼栋名称解析出对应入口节点（无命中退化为北区中央路口）。"""
    hit = match_building_entry(text)
    if hit:
        return hit
    return "north", "北区中央路口", "B06"


def indoor_points(location: str, from_pos: Optional[list[float]] = None) -> list[list[float]]:
    """房间室内连接点：[楼体边缘接入点(y=1), 房间正下方(y=1), 房间锚点(y=ay)]。
    from_pos 是室外路径的到达门坐标：把「门->房间」的连线裁剪到楼体 bbox 边缘再进楼。
    不裁剪的话，像 2#教学综合楼（门 z=17.8、房间 z=90.4，中间隔 37 米庭院）会画出
    一根横穿楼外空间的飞线，视觉上路径像从楼中央教室里拉出来的。
    不传 from_pos 时退化为房间正下方的竖直短线（同楼换教室场景）。"""
    room = ROOMS.get(location)
    if not room:
        return []
    ax, ay, az = room["anchor_world"]
    start = [ax, 1.0, az]
    if from_pos:
        b = LAYOUT_BUILDINGS.get(room["building_code"])
        if b:
            hw, hd = b.get("w", 20) / 2.0, b.get("d", 12) / 2.0
            bx, bz = b["x"], b["z"]
            dx, dz = ax - from_pos[0], az - from_pos[2]
            # 线段 from_pos->anchor 与楼体 bbox 的 slab 相交，取进入点
            t_lo, t_hi = 0.0, 1.0
            for p0, dp, lo, hi in (
                (from_pos[0], dx, bx - hw, bx + hw),
                (from_pos[2], dz, bz - hd, bz + hd),
            ):
                if abs(dp) < 1e-6:
                    if p0 < lo or p0 > hi:
                        t_lo, t_hi = 1.0, 0.0  # 与 bbox 平行且在外，放弃裁剪
                        break
                else:
                    ta, tb = (lo - p0) / dp, (hi - p0) / dp
                    if ta > tb:
                        ta, tb = tb, ta
                    t_lo, t_hi = max(t_lo, ta), min(t_hi, tb)
            if t_hi >= t_lo and t_lo > 0:
                start = [from_pos[0] + dx * t_lo, 1.0, from_pos[2] + dz * t_lo]
    return [start, [ax, 1.0, az], [ax, ay, az]]


def node_label(node: str) -> str:
    """路网节点 -> 人类可读名称（入口节点换算成楼栋名）。"""
    if node.startswith("entry_"):
        code = node.replace("entry_", "")
        if code.endswith("_back"):
            code = code[: -len("_back")]
        return BUILDING_NAMES.get(code, code)
    return POI_NAMES.get(node) or NODE_LABELS.get(node) or ("南校门" if node == "gate" else node)


def origin_room_highlight(user: dict, text: str) -> list[dict]:
    """路线起点是宿舍房间时，把出发的房间单元一并高亮（橙色 origin）。

    目标房间的高亮由各意图分支自己给；这里只负责「源」。
    """
    dorm = dorm_of_user(user)
    if not dorm:
        return []
    if user.get("role") == "student" or "宿舍" in text:
        code = dorm_room_code(dorm["building_code"], dorm["floor"], dorm["room_number"])
        return [{"room_code": code, "color": "origin", "label": "出发地"}]
    return []


def origin_point_of(user: dict, text: str) -> Optional[list[float]]:
    """路线起点的室内点：宿舍房间所在楼的体缘接入点（裁剪后），
    让轨迹从宿舍楼出发而不是悬空从房间锚点拉飞线。"""
    dorm = dorm_of_user(user)
    if not dorm:
        return None
    if user.get("role") == "student" or "宿舍" in text:
        code = dorm_room_code(dorm["building_code"], dorm["floor"], dorm["room_number"])
        room = ROOMS.get(code)
        if room:
            door = NODE_POSITIONS.get(entry_of(code))
            return indoor_points(code, from_pos=door)[0]
    return None


def multi_stop_route(start: str, stops: list[dict]) -> dict:
    """stops: [{location, reason}] —— 已按大节时间先后排序。
    返回 nodes/distance_m/walking_minutes/indoor_points 以及逐段 legs。
    同一栋楼内换教室不再走室外路网，而是按室内平面距离估算，避免出现「0 米」。"""
    nodes: list[str] = []
    indoor: list[list[float]] = []
    legs: list[dict] = []
    total = 0.0
    current = start
    current_label = node_label(start)
    previous_location: Optional[str] = None
    for stop in stops:
        location = stop["location"]
        entry = entry_of(location)
        same_building = (
            previous_location in ROOMS
            and location in ROOMS
            and ROOMS[previous_location]["building_code"] == ROOMS[location]["building_code"]
        )
        if same_building:
            prev_anchor = ROOMS[previous_location]["anchor_world"]
            next_anchor = ROOMS[location]["anchor_world"]
            leg_distance = round(
                math.hypot(next_anchor[0] - prev_anchor[0], next_anchor[2] - prev_anchor[2]), 1
            )
            leg_minutes = max(1, round(leg_distance / 45))  # 室内步行速度慢于室外
            hop = (
                "楼内换层"
                if ROOMS[previous_location]["floor"] != ROOMS[location]["floor"]
                else "同层换教室"
            )
            reason = f"{hop} · {stop.get('reason', '')}".strip(" ·")
            leg_nodes = []
            indoor_line = [[prev_anchor[0], 1.0, prev_anchor[2]], [next_anchor[0], 1.0, next_anchor[2]]]
        else:
            # 后门可能更近：在前/后门里选从当前点到哪边总距离更短的一侧。
            # current 是上一段结束的教学楼入口 —— 即「从上一栋楼的最近门」出发衔接下一段。
            entry, path = nearest_entry_path(current, entry)
            if not path["nodes"] and current != entry:
                continue
            nodes.extend(path["nodes"] if not nodes else path["nodes"][1:])
            leg_distance = path["distance_m"]
            leg_minutes = path["walking_minutes"]
            reason = stop.get("reason", "")
            leg_nodes = list(path["nodes"])
            indoor_line = None
        total += leg_distance
        has_indoor = location in ROOMS
        if has_indoor and not same_building:
            # 从到达门裁剪进楼：门 -> 楼缘 -> 房间，杜绝横穿楼外空间的飞线
            door_pos = NODE_POSITIONS.get(leg_nodes[-1]) if leg_nodes else None
            leg_indoor_pts = indoor_points(location, from_pos=door_pos)
        else:
            leg_indoor_pts = []
        indoor.extend(leg_indoor_pts or indoor_points(location))
        target_label = location_display(location)
        legs.append({
            "from": current_label,
            "to": target_label,
            "reason": reason,
            "distance_m": leg_distance,
            "walking_minutes": leg_minutes,
            "indoor": has_indoor,
            "indoor_hop": same_building,
            "location": location,
            # 逐段渲染所需：本段的室外路网节点序列 / 目标房间室内点 / 同楼换教室的直连线
            "node_ids": leg_nodes,
            "indoor_pts": leg_indoor_pts,
            "indoor_line": indoor_line,
        })
        current = entry
        current_label = target_label
        previous_location = location
    return {
        "nodes": nodes,
        "distance_m": round(total, 1),
        "walking_minutes": max(1, round(total / 72)) if total else 0,
        "indoor_points": indoor,
        "legs": legs,
    }


# ============ 问答意图管道 ============

def answer_query(user: dict, text: str, origin: str) -> dict:
    now = time.localtime()
    today = time.strftime("%Y-%m-%d", now)
    context = {"system_date": today, "system_weekday": "一二三四五六日"[now.tm_wday], "role": user["role"]}
    dorm = dorm_of_user(user)

    has_path_kw = any(word in text for word in ("路线", "怎么走", "路径", "导航", "怎么去"))
    has_schedule_kw = any(word in text for word in ("上课", "课程", "课表", "大节", "课程表", "第几节", "教室", "课"))
    has_location_kw = any(word in text for word in ("图书馆", "教学楼", "教学综合楼", "实验楼", "实训", "宿舍", "食堂", "操场", "会堂", "体育馆", "服务中心", "风雨操场", "校门", "湖畔", "生态湖", "山林步道", "田径场"))
    is_clock_q = any(word in text for word in ("几点", "作息", "下课时间")) and not has_path_kw

    # —— 作息时间 ——
    if is_clock_q:
        tt = timetable_of(today)
        regime_label = "冬季作息（10月1日-次年4月30日）" if today >= NATIONAL_DAY else "夏季作息（5月1日-9月30日）"
        match = re.search(r"第\s*([1-5])\s*[大节节]", text)
        if match:
            period = int(match.group(1))
            start, end = tt[period]
            return {"intent": "time", "answer": f"{regime_label}：第{period}大节 {start}-{end}，{end} 下课。", "highlight": [], "room_highlight": [], "context": context}
        detail = "；".join(f"第{p}大节 {s}-{e}" for p, (s, e) in tt.items())
        return {"intent": "time", "answer": f"{regime_label}：{detail}。", "highlight": [], "room_highlight": [], "context": context}

    # —— 宿舍 ——
    if (
        ("宿舍" in text or "住哪" in text or "住哪儿" in text)
        and "教室" not in text
        and "怎么走" not in text
        and not has_schedule_kw
    ):
        # 原来是 db_rows("SELECT * FROM dorm_members")：把 7004 行全部反序列化成 Python dict，
        # 再逐个做 m["name"] in text 子串匹配（一次问答要构造 7004 个字典）。
        # 改成让 SQLite 在存储层完成子串判断并只回传命中的那一行。
        hits = db_rows("SELECT * FROM dorm_members WHERE instr(?, name) > 0 LIMIT 1", (text,))
        known = hits[0] if hits else None
        if known:
            code = dorm_room_code(known["building_code"], known["floor"], known["room_number"])
            privacy = user["role"] in ("counselor", "admin")
            roommates = db_rows("SELECT * FROM dorm_members WHERE building_code = ? AND floor = ? AND room_number = ?", (known["building_code"], known["floor"], known["room_number"]))
            answer = f"{known['name']}（{known['class_name']}，{known['grade']}）住在 {location_display(code)}。"
            if privacy:
                answer += f" 同宿舍成员：{'、'.join(m['name'] for m in roommates)}（详见成员卡）。"
            payload = {"intent": "dormitory", "answer": answer, "highlight": [known["building_code"]], "room_highlight": [{"room_code": code, "color": "dorm", "label": known["class_name"]}], "context": context}
            if privacy:
                payload["dorm_members"] = roommates
                payload["dorm_room"] = code
            return payload
        if dorm:
            code = dorm_room_code(dorm["building_code"], dorm["floor"], dorm["room_number"])
            return {"intent": "dormitory", "answer": f"你住在 {location_display(code)}。", "highlight": [dorm["building_code"]], "room_highlight": [{"room_code": code, "color": "dorm"}], "context": context}
        if user["role"] == "counselor":
            highlights = default_highlights(user)
            return {"intent": "dormitory", "answer": "已高亮所管班级学生的宿舍房间（绿色）。", "highlight": sorted({h["room_code"].split("_")[0] for h in highlights if h["color"] == "dorm"}), "room_highlight": [h for h in highlights if h["color"] == "dorm"], "context": context}

    # —— 位置 / 纯路径（先于课表，避免“到2号教学楼怎么走”误判成课表） ——
    if has_location_kw and not has_schedule_kw and (has_path_kw or "在哪" in text or "哪里" in text or "位置" in text):
        # 先匹配「编号 + 名称」的完整写法，再匹配泛称：
        # 否则「1#教学综合楼」会被泛称「教学综合楼」抢先命中 2# 那栋。
        fixed_targets = [
            ("1#教学综合楼", "entry_B22", "1#教学综合楼", "B22"),
            ("2#教学综合楼", "entry_B06", "2#教学综合楼", "B06"),
            ("2#教学楼", "entry_B01", "2#教学楼", "B01"),
            ("3#教学楼", "entry_B02", "3#教学楼", "B02"),
            ("5#实验楼", "entry_B03", "5#实验楼", "B03"),
            ("6#实验楼", "entry_B04", "6#实验楼", "B04"),
            ("1#图书馆", "entry_B05", "1#图书馆", "B05"),
            ("8#会堂", "entry_B08", "8#会堂", "B08"),
            ("图书馆", "entry_B05", "1#图书馆", "B05"),
            ("教学综合楼", "entry_B06", "2#教学综合楼", "B06"),
            ("食堂", "entry_B09", "11#食堂和活动中心", "B09"),
            ("操场", "sportsEast", "400米田径场", "B21"),
            ("田径场", "sportsEast", "400米田径场", "B21"),
            # 景观 POI（highlight 填 POI id：前端按楼栋 code 匹配不到就不高亮，无害）
            ("湖畔", "lake", "北侧湖畔节点", "lake"),
            ("生态湖", "lake", "北侧生态湖", "lake"),
            ("山林步道", "hill", "北侧山林步道", "hill"),
            # B23（4#实验综合楼）/ B10（24#看台及地下车库）已拆除：
            # 「实验综合楼」包含「实验楼」子串，会自然落到下面泛称行命中 5#实验楼。
            ("实验楼", "entry_B03", "5#实验楼", "B03"),
            ("教学楼", "entry_B01", "2#教学楼", "B01"),
            ("会堂", "entry_B08", "8#会堂", "B08"),
            ("宿舍", "entry_B11", "12#学生宿舍", "B11"),
        ]
        # 「1号教学综合楼」这类写法统一成「1#…」再匹配
        # 显式「从X到Y」时目标只看「到」之后的目的地片段，避免起点编号抢匹配
        m_ft = re.search(r"从(.{1,14}?)到", text)
        dest_text = text[m_ft.end():] if m_ft else text
        dest_probe = dest_text.replace("号", "#").replace("＃", "#")
        # 第一优先：目的地楼栋匹配（含编号前缀，「11#食堂」可命中「11#食堂和活动中心」）。
        # 楼栋全名循环必须只在目的地片段上匹配 —— 用全文时
        # 「从16#学生宿舍到湖畔怎么走」会被起点「16#学生宿舍」抢先命中，
        # 目的地退化成起点自身（0 米路径）。
        dest_hit = match_building_entry(dest_text)
        specific = (dest_hit[1], dest_hit[0], dest_hit[1], dest_hit[2]) if dest_hit else None
        if specific is None:
            for building in BUILDING_ENTRIES:
                name = BUILDING_NAMES.get(building, building)
                if len(name) >= 2 and (name in dest_probe or name.replace("#", "号") in dest_probe):
                    specific = (name, f"entry_{building}", name, building)
                    break
        match = specific or next((item for item in fixed_targets if item[0] in dest_probe), None)
        target_node, target_name, highlight = (match[1], match[2], match[3]) if match else resolve_building_entry(text)
        start = resolve_origin(user, text, origin)
        # 目标是建筑入口时，在前/后门中选最近的一侧再算路
        target_node, route = nearest_entry_path(start, target_node)
        origin_name = BUILDING_NAMES.get(start.replace("entry_", ""), "南校门" if start == "gate" else start)
        if has_path_kw:
            leg = {
                "from": origin_name,
                "to": target_name,
                "reason": "最短路径",
                "distance_m": route["distance_m"],
                "walking_minutes": route["walking_minutes"],
                "indoor": False,
                "location": target_node,
            }
            return {"intent": "route", "answer": f"已生成从{origin_name}到{target_name}的最短路径，约 {route['distance_m']} 米，步行约 {route['walking_minutes']} 分钟。", "route": {**route, "indoor_points": [], "origin_point": origin_point_of(user, text)}, "highlight": [highlight], "room_highlight": origin_room_highlight(user, text), "stops": [{"label": origin_name, "reason": "起点"}, {"label": target_name, "reason": "终点"}], "route_stops": [leg], "context": context}
        return {"intent": "location", "answer": f"{target_name} 位于 3D 校园中的 {highlight} 区域，已为你定位。", "highlight": [highlight], "room_highlight": [], "context": context}

    # —— 课表（含混合：课表+路径） ——
    if has_schedule_kw or (has_path_kw and not has_location_kw):
        t = parse_time(text)
        classes = classes_of_user(user)
        date_str = t["date"] if t["explicit"] else next_class_day(t["date"] if weekday_of(t["date"]) <= 5 else next_class_day(t["date"]))
        rows = schedule_for(classes, date_str, t["periods"])
        # 教师视角：只看自己承担的课，而不是所带班级的全部课程
        if user.get("role") == "teacher":
            rows = [r for r in rows if r["teacher"] == user.get("display_name")]
        shifted = weekday_of(date_str) > 5
        if not rows:
            next_day = next_class_day(date_offset(date_str, 1))
            rows = schedule_for(classes, next_day, [1, 2, 3, 4])
            if user.get("role") == "teacher":
                rows = [r for r in rows if r["teacher"] == user.get("display_name")]
            dl = date_label(next_day, today)
            return {"intent": "schedule", "answer": f"{date_label(date_str, today)}没有课程；下一上课日 {dl} 有 {len(rows)} 门课，已紫色高亮。" if rows else f"{date_label(date_str, today)}没有课程。", "highlight": sorted({r['location'].split('_')[0] for r in rows if r['location'] in ROOMS}), "room_highlight": [{"room_code": r["location"], "color": "next", "label": f"第{r['period']}大节 {r['course']}"} for r in rows if r['location'] in ROOMS], "context": context}
        dl = date_label(date_str, today)
        tt = timetable_of(date_str)
        lines = [f"第{r['period']}大节({tt[r['period']][0]}) {r['course']}·{r['teacher']} @ {location_display(r['location'])}" for r in rows]
        answer = f"{dl}共 {len(rows)} 门课：\n" + "\n".join(lines)
        color = "next" if date_str > today else None
        room_hl = [{"room_code": r["location"], "color": (color or ("morning" if r["period"] <= 2 else "afternoon")), "label": f"第{r['period']}大节 {r['course']}"} for r in rows if r["location"] in ROOMS]
        payload = {"intent": "schedule", "answer": answer, "highlight": sorted({r['location'].split('_')[0] for r in rows if r['location'] in ROOMS}), "room_highlight": room_hl, "context": context}
        if has_path_kw and rows:
            start = resolve_origin(user, text, origin)
            # rows 已按 period 升序（SQL ORDER BY period）= 按上课时间先后
            stops = [{"location": r["location"], "reason": f"第{r['period']}大节 {r['course']}"} for r in rows if r["location"] in ROOMS]
            route = multi_stop_route(start, stops)
            origin_label = BUILDING_NAMES.get(start.replace("entry_", ""), "南校门" if start == "gate" else start)
            stops_info = [{"label": origin_label, "reason": "起点"}]
            stops_info += [{"label": location_display(s["location"]), "reason": s["reason"]} for s in stops]
            payload["intent"] = "schedule_route"
            # 段颜色与前端 ROUTE_LEG_COLORS 一一对应：黄 → 粉红 → 青 → 黄绿
            leg_color_names = ["黄", "粉红", "青", "黄绿"]
            seg_desc = "、".join(
                f"{leg['from']}→{leg['to']}（{leg_color_names[i % len(leg_color_names)]}色）"
                for i, leg in enumerate(route.get("legs", []))
            )
            payload["answer"] = answer + (
                f"\n\n已按大节时间先后规划最优路径：全程 {route['distance_m']} 米 / 步行约 {route['walking_minutes']} 分钟。"
                f"共分 {len(route.get('legs', []))} 段、每段不同颜色显示：{seg_desc}；"
                "段与段之间从当前教学楼的最近一门（前/后门取更近者）衔接，终点含室内路径。"
            )
            payload["route"] = {**route, "origin_point": origin_point_of(user, text)}
            payload["stops"] = stops_info
            payload["route_stops"] = route.get("legs", [])
            # 源房间（宿舍）+ 目标教室都高亮：源在列表最前，目标分支早已填好 room_hl
            payload["room_highlight"] = origin_room_highlight(user, text) + payload.get("room_highlight", [])
        return payload

    return {"intent": "location", "answer": f"已从校园建筑名录（{len(BUILDING_ENTRIES)} 栋）、室外路网（{len(graph_data()['nodes'])} 节点）和 {len(ROOMS)} 个房间锚点中完成本地检索。可问：明天第一节课在哪、从宿舍到明天上午所有教室怎么走、某同学住哪、第3大节几点下课。", "highlight": [], "room_highlight": [], "context": context}


init_db()
adjacency()   # 预热路网邻接表，避免第一个路径问答独自承担建表开销

# 独立 RAG 问答（无登录路由 /api/rag/*，与 3D 首页链路隔离）
try:
    from backend.rag import router as rag_router
except ImportError:
    from rag import router as rag_router
app.include_router(rag_router)

# 学习中心（教学演示，/api/learn/*，独立测试库）
try:
    from backend.learn import router as learn_router
except ImportError:
    from learn import router as learn_router
app.include_router(learn_router)


@app.get("/api/health")
def health():
    graph = graph_data()
    layout = _cached_json(DATA / "campus_layout.json")
    validation = _rag("validation.json")
    return {
        "status": "ok", "time": int(time.time()),
        "buildings": len(layout["buildings"]),
        "buildings_schedulable": len({r["building_code"] for r in ROOMS.values()
                                      if r["room_type"] in ("CR", "LB")}),
        "room_anchors": len(ROOMS),
        "road_nodes": len(graph["nodes"]), "road_edges": len(graph["edges"]),
        "classes": validation["classes"], "students": validation["students"],
        "schedule_rows": validation["schedule_rows"],
        "checks_all_pass": validation["all_pass"],
    }


@app.post("/api/login")
def login(body: LoginBody):
    db = sqlite3.connect(DB_PATH); db.row_factory = sqlite3.Row
    row = db.execute("SELECT * FROM users WHERE username = ?", (body.username,)).fetchone(); db.close()
    if not row or not hmac.compare_digest(row["password_hash"], password_hash(body.password)):
        raise HTTPException(401, "账号或密码错误")
    user = {"username": row["username"], "display_name": row["display_name"], "role": row["role"], "class_name": row["class_name"]}
    return {"access_token": sign_token(user), "token_type": "bearer", "user": user}


@app.get("/api/me")
def me(authorization: Optional[str] = Header(default=None)):
    return verify_token(authorization)


@app.get("/api/session/highlights")
def session_highlights(authorization: Optional[str] = Header(default=None)):
    user = verify_token(authorization)
    items = default_highlights(user)
    return {"room_highlight": items, "highlight": sorted({i["room_code"].split("_")[0] for i in items})}


@app.post("/api/query")
def query(body: QueryBody, authorization: Optional[str] = Header(default=None)):
    user = verify_token(authorization)
    return answer_query(user, body.query.strip(), body.origin or "gate")


@app.get("/api/dorm/room")
def dorm_room(room_code: str, authorization: Optional[str] = Header(default=None)):
    user = verify_token(authorization)
    parts = room_code.split("_")
    building = parts[0]
    floor = int(parts[2][1:])
    room_number = int(parts[3])
    members = db_rows("SELECT * FROM dorm_members WHERE building_code = ? AND floor = ? AND room_number = ?", (building, floor, room_number))
    if user["role"] not in ("counselor", "admin"):
        members = [{**m, "phone": m["phone"][:3] + "****" + m["phone"][-4:], "home_phone": "仅辅导员可见"} for m in members]
    return {"room_code": room_code, "semantic_name": ROOMS[room_code]["semantic_name"] if room_code in ROOMS else room_code, "members": members}


@app.get("/api/rooms/{building_code}")
def rooms_of_building(building_code: str, authorization: Optional[str] = Header(default=None)):
    verify_token(authorization)
    # 原实现把 1.5MB 的 room_anchors.json 每次请求重读一遍再列表过滤；
    # 现在直接用启动时建好的「楼栋 → 房间」索引，并返回浅拷贝避免 override 写回污染缓存。
    items = [dict(r) for r in ROOMS_BY_BUILDING.get(building_code, [])]
    overrides = {r["room_code"]: r for r in db_rows("SELECT * FROM room_anchor_overrides WHERE building_code = ?", (building_code,))}
    for item in items:
        if item["room_code"] in overrides:
            item["semantic_name"] = overrides[item["room_code"]]["semantic_name"]
            item["admin_named"] = True
    return {"rooms": items}


@app.get("/api/notices")
def notices(authorization: Optional[str] = Header(default=None)):
    verify_token(authorization)
    return {"items": db_rows("SELECT * FROM notices ORDER BY created_at DESC LIMIT 10")}


@app.post("/api/notices")
def create_notice(body: NoticeBody, authorization: Optional[str] = Header(default=None)):
    user = verify_token(authorization)
    if user.get("role") != "admin":
        raise HTTPException(403, "仅管理员可发布公告")
    db = sqlite3.connect(DB_PATH)
    db.execute("INSERT INTO notices(content, created_by, created_at) VALUES (?, ?, ?)", (body.content.strip(), user["username"], int(time.time())))
    db.commit(); db.close()
    return {"status": "saved"}


@app.get("/api/admin/anchors")
def anchors(authorization: Optional[str] = Header(default=None)):
    user = verify_token(authorization)
    if user.get("role") != "admin":
        raise HTTPException(403, "仅管理员可修改空间数据")
    return {"items": [{**r, "anchor_world": json.loads(r["anchor_world"])} for r in db_rows("SELECT * FROM room_anchor_overrides ORDER BY updated_at DESC")]}


@app.post("/api/admin/anchors")
def save_anchor(body: AnchorBody, authorization: Optional[str] = Header(default=None)):
    user = verify_token(authorization)
    if user.get("role") != "admin":
        raise HTTPException(403, "仅管理员可修改空间数据")
    db = sqlite3.connect(DB_PATH)
    db.execute("INSERT OR REPLACE INTO room_anchor_overrides VALUES (?, ?, ?, ?, ?, ?)", (body.room_code, body.semantic_name, body.building_code, json.dumps(body.anchor_world), user["username"], int(time.time())))
    db.commit(); db.close()
    return {"status": "saved", "room_code": body.room_code}


if (ROOT / "dist").exists():
    app.mount("/assets", StaticFiles(directory=ROOT / "dist" / "assets"), name="assets")
    app.mount("/reference", StaticFiles(directory=ROOT / "public" / "assets" / "reference"), name="reference")

    @app.get("/{path:path}")
    def spa(path: str):
        candidate = ROOT / "dist" / path
        return FileResponse(candidate if candidate.is_file() else ROOT / "dist" / "index.html")
