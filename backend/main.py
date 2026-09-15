from __future__ import annotations

import base64
import hashlib
import hmac
import json
import math
import os
import sqlite3
import time
from heapq import heappop, heappush
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DB_PATH = DATA / "campus.db"
SECRET = os.environ.get("CAMPUS_JWT_SECRET", "yueyang-campus-local-demo-secret").encode()

app = FastAPI(title="岳阳学院智慧校园数字孪生 API", version="1.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:4175", "http://127.0.0.1:4175"], allow_methods=["*"], allow_headers=["*"])


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
# ============================================================
TIMETABLE = {
    1: ("08:00", "09:40"),
    2: ("10:00", "11:40"),
    3: ("14:00", "15:40"),
    4: ("16:00", "17:40"),
    5: ("19:00", "20:40"),
}
SEMESTER_START = "2026-08-31"  # 第 1 周周一

# ============================================================
# DS1 课程表（2026 秋季 · 计算机2301 / 计算机2302）
# 房间编码规则与 room_anchors.json 一致：每层房间号 101~110（B01_CR_F2_101 = 2#教学楼2层101）
# ============================================================
SCHEDULE = [
    # —— 计算机2301 ——
    ("计算机2301", "数据结构", "周启明老师", 1, 1, "B01_CR_F2_101"),
    ("计算机2301", "计算机组成原理", "吴子昂老师", 1, 3, "B03_CR_F1_102"),
    ("计算机2301", "高等数学", "陈若愚老师", 2, 2, "B02_CR_F1_103"),
    ("计算机2301", "数据结构实验", "周启明老师", 2, 4, "B05_CR_F2_105"),
    ("计算机2301", "数据结构", "周启明老师", 3, 1, "B01_CR_F2_101"),
    ("计算机2301", "体育", "李劲松老师", 3, 3, "POI:sportsEast"),
    ("计算机2301", "大学英语", "沈悦老师", 4, 2, "B06_CR_F1_104"),
    ("计算机2301", "思想道德与法治", "秦岚老师", 4, 4, "B04_CR_F1_101"),
    ("计算机2301", "数据结构", "周启明老师", 5, 1, "B01_CR_F2_101"),
    ("计算机2301", "线性代数", "陈若愚老师", 5, 3, "B02_CR_F2_102"),
    # —— 计算机2302 ——
    ("计算机2302", "数据结构", "周启明老师", 1, 2, "B01_CR_F2_102"),
    ("计算机2302", "Java 程序设计", "吴子昂老师", 1, 4, "B05_CR_F3_101"),
    ("计算机2302", "离散数学", "陈若愚老师", 2, 1, "B02_CR_F2_104"),
    ("计算机2302", "体育", "李劲松老师", 2, 3, "POI:sportsEast"),
    ("计算机2302", "数据结构", "周启明老师", 3, 2, "B01_CR_F2_102"),
    ("计算机2302", "Web 开发技术", "吴子昂老师", 3, 4, "B05_CR_F2_107"),
    ("计算机2302", "大学英语", "沈悦老师", 4, 1, "B06_CR_F1_105"),
    ("计算机2302", "软件工程导论", "韩雪老师", 5, 2, "B04_CR_F1_102"),
]

# ============================================================
# DS4 班级学生宿舍信息（name, class, grade, building, floor, room, phone, home_phone）
# room 为该层房间号 101~110
# ============================================================
DORM_MEMBERS = [
    ("陈亦凡", "计算机2301", "2023级", "B11", 3, 104, "13807300001", "0730-8210001"),
    ("李婧", "计算机2301", "2023级", "B11", 3, 104, "13807300002", "0730-8210002"),
    ("张宇", "计算机2301", "2023级", "B11", 3, 102, "13807300003", "0730-8210003"),
    ("王若曦", "计算机2301", "2023级", "B11", 3, 106, "13807300004", "0730-8210004"),
    ("赵启铭", "计算机2301", "2023级", "B11", 3, 106, "13807300005", "0730-8210005"),
    ("孙嘉禾", "计算机2302", "2023级", "B12", 2, 105, "13807300006", "0730-8210006"),
    ("钱思远", "计算机2302", "2023级", "B12", 2, 105, "13807300007", "0730-8210007"),
    ("周慕云", "计算机2302", "2023级", "B12", 2, 106, "13807300008", "0730-8210008"),
]

# 辅导员 → 管理班级
COUNSELOR_CLASSES = {"counselor": ["计算机2301", "计算机2302"], "liu": ["计算机2301", "计算机2302"]}


def dorm_room_code(building: str, floor: int, room: int) -> str:
    return f"{building}_CR_F{floor}_{room:03d}"


def password_hash(password: str) -> str:
    return hashlib.sha256(f"yueyang:{password}".encode()).hexdigest()


def init_db() -> None:
    db = sqlite3.connect(DB_PATH)
    db.execute("CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password_hash TEXT NOT NULL, display_name TEXT NOT NULL, role TEXT NOT NULL, class_name TEXT)")
    rows = [
        ("student", password_hash("campus123"), "陈亦凡", "student", "计算机2301"),
        ("student2", password_hash("campus123"), "孙嘉禾", "student", "计算机2302"),
        ("teacher", password_hash("teacher123"), "周启明老师", "teacher", "计算机类"),
        ("counselor", password_hash("campus123"), "刘老师", "counselor", "计算机类"),
        ("admin", password_hash("admin123"), "系统管理员", "admin", "智慧校园中心"),
    ]
    db.executemany("INSERT OR REPLACE INTO users VALUES (?, ?, ?, ?, ?)", rows)
    db.execute("CREATE TABLE IF NOT EXISTS schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, class_name TEXT, course TEXT, teacher TEXT, weekday INTEGER, period INTEGER, location TEXT)")
    db.execute("DELETE FROM schedule")
    db.executemany("INSERT INTO schedule(class_name, course, teacher, weekday, period, location) VALUES (?, ?, ?, ?, ?, ?)", SCHEDULE)
    dorm_columns = [row[1] for row in db.execute("PRAGMA table_info(dorm_members)").fetchall()]
    if dorm_columns and ("floor" not in dorm_columns or "grade" not in dorm_columns):
        db.execute("DROP TABLE dorm_members")
    db.execute("CREATE TABLE IF NOT EXISTS dorm_members (name TEXT, class_name TEXT, grade TEXT, building_code TEXT, floor INTEGER, room_number INTEGER, phone TEXT, home_phone TEXT)")
    db.execute("DELETE FROM dorm_members")
    db.executemany("INSERT INTO dorm_members VALUES (?, ?, ?, ?, ?, ?, ?, ?)", DORM_MEMBERS)
    db.execute("CREATE TABLE IF NOT EXISTS room_anchor_overrides (room_code TEXT PRIMARY KEY, semantic_name TEXT NOT NULL, building_code TEXT NOT NULL, anchor_world TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS notices (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL)")
    if not db.execute("SELECT 1 FROM notices LIMIT 1").fetchone():
        db.execute("INSERT INTO notices(content, created_by, created_at) VALUES (?, ?, ?)", ("智慧校园模型已按公开规划与校园沙盘多视角资料更新。", "system", int(time.time())))
    db.commit(); db.close()


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
    return json.loads((DATA / "road_graph.json").read_text(encoding="utf-8"))


def room_data() -> dict:
    return json.loads((DATA / "room_anchors.json").read_text(encoding="utf-8"))


def room_index() -> dict:
    return {r["room_code"]: r for r in room_data()["rooms"]}


ROOMS = room_index()
BUILDING_NAMES = {r["building_code"]: r["semantic_name"].split("·")[0] for r in ROOMS.values()}
BUILDING_ENTRIES = sorted({r["building_code"] for r in ROOMS.values()})


def db_rows(sql: str, args: tuple = ()) -> list[dict]:
    db = sqlite3.connect(DB_PATH); db.row_factory = sqlite3.Row
    rows = db.execute(sql, args).fetchall(); db.close()
    return [dict(row) for row in rows]


def classes_of_user(user: dict) -> list[str]:
    role = user.get("role")
    if role == "student":
        return [user.get("class_name")] if user.get("class_name") else []
    if role == "counselor":
        return COUNSELOR_CLASSES.get(user.get("username"), [])
    if role == "teacher":
        return sorted({r["class_name"] for r in db_rows("SELECT DISTINCT class_name FROM schedule WHERE teacher = ?", (user.get("display_name"),))})
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
    weekday = weekday_of(date_str)
    rows = db_rows("SELECT * FROM schedule WHERE class_name IN (%s)" % ",".join("?" * len(classes)) + " AND weekday = ? AND period IN (%s) ORDER BY period" % ",".join("?" * len(periods)), tuple(classes) + (weekday,) + tuple(periods)) if classes else []
    return rows


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

def shortest_path(start: str, target: str) -> dict:
    graph = graph_data(); adjacency: dict[str, list[tuple[float, str]]] = {}
    for edge in graph["edges"]:
        adjacency.setdefault(edge["from"], []).append((edge["distance_m"], edge["to"]))
        adjacency.setdefault(edge["to"], []).append((edge["distance_m"], edge["from"]))
    queue = [(0.0, start, [])]; visited = set()
    while queue:
        distance, node, path = heappop(queue)
        if node in visited: continue
        visited.add(node); path = path + [node]
        if node == target: return {"nodes": path, "distance_m": round(distance, 1), "walking_minutes": max(1, round(distance / 72))}
        for weight, neighbor in adjacency.get(node, []):
            if neighbor not in visited: heappush(queue, (distance + weight, neighbor, path))
    return {"nodes": [], "distance_m": 0, "walking_minutes": 0}


def entry_of(location: str) -> str:
    if location.startswith("POI:"):
        return location[4:]
    room = ROOMS.get(location)
    return f"entry_{room['building_code']}" if room else "north"


def resolve_origin(user: dict, text: str, requested_origin: str) -> str:
    """优先使用学生宿舍入口，其次校门，保证问答路径从真实当前位置出发。"""
    dorm = dorm_of_user(user)
    if dorm and (user.get("role") == "student" or "宿舍" in text):
        return f"entry_{dorm['building_code']}"
    if requested_origin and requested_origin not in ("gate", "auto", "current"):
        return requested_origin
    return "gate"


def resolve_building_entry(text: str) -> tuple[str, str, str]:
    """从任意楼栋名称解析出对应入口节点；名称优先匹配，其次匹配楼栋编号。"""
    normalized = text.replace("#", "号").replace("＃", "号")
    for building in BUILDING_ENTRIES:
        name = BUILDING_NAMES.get(building, building)
        plain = name.replace("号", "").replace("#", "")
        numbered = name.replace("#", "号")
        if plain and (plain in normalized or numbered in normalized):
            return f"entry_{building}", name, building
    for building in BUILDING_ENTRIES:
        number = building.lstrip("B")
        for token in (number, f"{number}栋", f"{number}号楼"):
            if token in text:
                return f"entry_{building}", BUILDING_NAMES.get(building, building), building
    return "north", "北区中央路口", "B06"


def indoor_points(location: str) -> list[list[float]]:
    room = ROOMS.get(location)
    if not room:
        return []
    ax, ay, az = room["anchor_world"]
    return [[ax, 1.0, az], [ax, ay, az]]


def multi_stop_route(start: str, stops: list[dict]) -> dict:
    """stops: [{location, reason}] —— 已按大节时间先后排序"""
    nodes: list[str] = []
    indoor: list[list[float]] = []
    total = 0.0
    current = start
    for stop in stops:
        entry = entry_of(stop["location"])
        leg = shortest_path(current, entry)
        if not leg["nodes"] and current != entry:
            continue
        nodes.extend(leg["nodes"] if not nodes else leg["nodes"][1:])
        total += leg["distance_m"]
        indoor.extend(indoor_points(stop["location"]))
        current = entry
    return {"nodes": nodes, "distance_m": round(total, 1), "walking_minutes": max(1, round(total / 72)) if nodes else 0, "indoor_points": indoor}


# ============ 问答意图管道 ============

def answer_query(user: dict, text: str, origin: str) -> dict:
    now = time.localtime()
    today = time.strftime("%Y-%m-%d", now)
    context = {"system_date": today, "system_weekday": "一二三四五六日"[now.tm_wday], "role": user["role"]}
    dorm = dorm_of_user(user)

    has_path_kw = any(word in text for word in ("路线", "怎么走", "路径", "导航", "怎么去"))
    has_schedule_kw = any(word in text for word in ("上课", "课程", "课表", "大节", "课程表", "第几节", "教室", "课"))
    has_location_kw = any(word in text for word in ("图书馆", "教学楼", "实验楼", "宿舍", "食堂", "操场", "会堂", "体育馆", "服务中心", "看台", "风雨操场"))
    is_clock_q = any(word in text for word in ("几点", "作息", "下课时间")) and not has_path_kw

    # —— 作息时间 ——
    if is_clock_q:
        import re
        match = re.search(r"第\s*([1-5])\s*[大节节]", text)
        if match:
            period = int(match.group(1))
            start, end = TIMETABLE[period]
            return {"intent": "time", "answer": f"第{period}大节 {start}-{end}，{end} 下课。", "highlight": [], "room_highlight": [], "context": context}
        detail = "；".join(f"第{p}大节 {s}-{e}" for p, (s, e) in TIMETABLE.items())
        return {"intent": "time", "answer": f"作息时间表：{detail}。", "highlight": [], "room_highlight": [], "context": context}

    # —— 宿舍 ——
    if (
        ("宿舍" in text or "住哪" in text or "住哪儿" in text)
        and "教室" not in text
        and "怎么走" not in text
        and not has_schedule_kw
    ):
        known = next((m for m in db_rows("SELECT * FROM dorm_members") if m["name"] in text), None)
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
        fixed_targets = [("图书馆", "entry_B06", "1#图书馆", "B06"), ("食堂", "entry_B09", "11#食堂和活动中心", "B09"), ("操场", "sportsEast", "400米田径场", "B21"), ("实验", "entry_B05", "4#实验综合楼", "B05"), ("会堂", "entry_B08", "8#会堂", "B08")]
        match = next((item for item in fixed_targets if item[0] in text), None)
        target_node, target_name, highlight = (match[1], match[2], match[3]) if match else resolve_building_entry(text)
        start = resolve_origin(user, text, origin)
        route = shortest_path(start, target_node)
        origin_name = BUILDING_NAMES.get(start.replace("entry_", ""), "南校门" if start == "gate" else start)
        if has_path_kw:
            return {"intent": "route", "answer": f"已生成从{origin_name}到{target_name}的最短路径，约 {route['distance_m']} 米，步行约 {route['walking_minutes']} 分钟。", "route": {**route, "indoor_points": []}, "highlight": [highlight], "room_highlight": [], "stops": [{"label": origin_name, "reason": "起点"}, {"label": target_name, "reason": "终点"}], "context": context}
        return {"intent": "location", "answer": f"{target_name} 位于 3D 校园中的 {highlight} 区域，已为你定位。", "highlight": [highlight], "room_highlight": [], "context": context}

    # —— 课表（含混合：课表+路径） ——
    if has_schedule_kw or (has_path_kw and not has_location_kw):
        t = parse_time(text)
        classes = classes_of_user(user)
        date_str = t["date"] if t["explicit"] else next_class_day(t["date"] if weekday_of(t["date"]) <= 5 else next_class_day(t["date"]))
        rows = schedule_for(classes, date_str, t["periods"])
        shifted = weekday_of(date_str) > 5
        if not rows:
            next_day = next_class_day(date_offset(date_str, 1))
            rows = schedule_for(classes, next_day, [1, 2, 3, 4])
            dl = date_label(next_day, today)
            return {"intent": "schedule", "answer": f"{date_label(date_str, today)}没有课程；下一上课日 {dl} 有 {len(rows)} 门课，已紫色高亮。" if rows else f"{date_label(date_str, today)}没有课程。", "highlight": sorted({r['location'].split('_')[0] for r in rows if r['location'] in ROOMS}), "room_highlight": [{"room_code": r["location"], "color": "next", "label": f"第{r['period']}大节 {r['course']}"} for r in rows if r['location'] in ROOMS], "context": context}
        dl = date_label(date_str, today)
        lines = [f"第{r['period']}大节({TIMETABLE[r['period']][0]}) {r['course']}·{r['teacher']} @ {location_display(r['location'])}" for r in rows]
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
            payload["answer"] = answer + f"\n\n已按大节时间先后规划最优路径：{route['distance_m']} 米 / 步行约 {route['walking_minutes']} 分钟（黄色轨迹已显示，终点含室内路径）。"
            payload["route"] = route
            payload["stops"] = stops_info
        return payload

    return {"intent": "location", "answer": "已从校园建筑名录、公开规划资料、630 个房间锚点和室外路网中完成本地检索。可问：明天第一节课在哪、从宿舍到明天上午所有教室怎么走、张宇住哪、第3大节几点下课。", "highlight": [], "room_highlight": [], "context": context}


init_db()

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
    return {"status": "ok", "time": int(time.time()), "buildings": 21, "room_anchors": len(ROOMS), "road_nodes": len(graph["nodes"]), "road_edges": len(graph["edges"])}


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
    items = [r for r in room_data()["rooms"] if r["building_code"] == building_code]
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
