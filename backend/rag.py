"""
独立 RAG 问答引擎（无登录路由 /api/rag/*）
方法论（源自 Agent/RAG 教程调研）：
- LLM 只负责"理解"（可插拔），检索与推理全部走确定性工具函数 → 答案可溯源、可评估
- 检索工具（tools）以函数形式声明，与 function calling schema 同构
- 作息随日期自动切换：国庆（2026-10-01）前夏季作息，之后冬季作息
- 每条回答携带 sources（数据溯源），与 /api/rag/data/* 的源数据一一对应
- /api/rag/eval 内置评测集，回归验证检索准确率

数据规模：2 个年级（2025 级大二 / 2026 级大一）、25 个专业、133 个班、7004 名学生。
"""
from __future__ import annotations

import datetime
import json
import math
import re
from functools import lru_cache
from heapq import heappop, heappush
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "rag"

router = APIRouter(prefix="/api/rag")


# ============ 数据加载 ============

def _load(name: str) -> Any:
    return json.loads((DATA / name).read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def students() -> list[dict]:
    return _load("students.json")


@lru_cache(maxsize=1)
def schedule_rows() -> list[dict]:
    return _load("schedule.json")


@lru_cache(maxsize=1)
def timetable() -> dict:
    return _load("timetable.json")


@lru_cache(maxsize=1)
def plan() -> dict:
    return _load("training_plan.json")


@lru_cache(maxsize=1)
def validation() -> dict:
    return _load("validation.json")


@lru_cache(maxsize=1)
def room_index() -> dict:
    rooms = json.loads((ROOT / "data" / "room_anchors.json").read_text(encoding="utf-8"))["rooms"]
    return {r["room_code"]: r for r in rooms}


@lru_cache(maxsize=1)
def road_graph() -> dict:
    return json.loads((ROOT / "data" / "road_graph.json").read_text(encoding="utf-8"))


_GRAPH_ADJACENCY: Optional[dict[str, list[tuple[float, str]]]] = None


def graph_adjacency() -> dict[str, list[tuple[float, str]]]:
    """路网邻接表：进程内只构建一次。

    原实现每次 tool_route() 都重新遍历 edges 建表，而一次「到明天所有教室」的多段
    导航会在同一请求内多次用到它。
    """
    global _GRAPH_ADJACENCY
    if _GRAPH_ADJACENCY is None:
        table: dict[str, list[tuple[float, str]]] = {}
        for edge in road_graph()["edges"]:
            table.setdefault(edge["from"], []).append((edge["distance_m"], edge["to"]))
            table.setdefault(edge["to"], []).append((edge["distance_m"], edge["from"]))
        _GRAPH_ADJACENCY = table
    return _GRAPH_ADJACENCY


STUDENT_BY_NAME = {s["name"]: s for s in students()}
CLASS_LIST: list[str] = plan()["class_list"]
CLASSES = set(CLASS_LIST)
CLASS_INFO: dict[str, dict] = plan()["classes"]
MAJORS: dict[str, dict] = plan()["majors"]
GRADES: dict[str, dict] = plan()["grades"]
SEMESTER = timetable()["semester"]
SEMESTER_START = SEMESTER["start"]
NATIONAL_DAY = SEMESTER["national_day_split"]

STUDENTS_BY_CLASS: dict[str, list[dict]] = {}
for _s in students():
    STUDENTS_BY_CLASS.setdefault(_s["class_name"], []).append(_s)

TEACHER_INDEX: dict[str, list[dict]] = {}
for _r in schedule_rows():
    TEACHER_INDEX.setdefault(_r["teacher"], []).append(_r)

# 反查索引：避免每次检索都对 1849 行课表 / 7004 名学生做全表线性扫描
SCHEDULE_BY_CLASS: dict[str, list[dict]] = {}
for _r in schedule_rows():
    SCHEDULE_BY_CLASS.setdefault(_r["class_name"], []).append(_r)

STUDENTS_BY_DORM: dict[str, list[dict]] = {}
for _s in students():
    STUDENTS_BY_DORM.setdefault(_s["dorm_room_code"], []).append(_s)

# 预热：房间锚点（1.5MB）与路网邻接表都在首次检索时才会构建，提前加载避免首个请求变慢
room_index()
graph_adjacency()


def regime_of(date_str: str) -> str:
    return "winter" if date_str >= NATIONAL_DAY else "summer"


def timetable_for(date_str: str) -> dict:
    regime = regime_of(date_str)
    raw = timetable()[regime]
    # JSON 键为字符串，统一规范为 int 大节键
    normalized = {"regime": regime, "label": raw["label"]}
    for key, value in raw.items():
        if key.isdigit():
            normalized[int(key)] = value
            normalized[key] = value  # 兼容 str/int 两种访问
    return normalized


def week_of(date_str: str) -> int:
    """日期 → 教学周序号（第 1 周周一 = 学期开始日）。非学期内返回 0。"""
    start = datetime.date.fromisoformat(SEMESTER_START)
    day = datetime.date.fromisoformat(date_str)
    delta = (day - start).days
    if delta < 0:
        return 0
    return delta // 7 + 1


# ============ 检索工具（function calling 形态，见 /api/rag/tools） ============

def tool_timetable(date_str: str) -> dict:
    return timetable_for(date_str)


def tool_schedule(class_name: str, date_str: str, periods: Optional[list[int]] = None) -> list[dict]:
    """查询班级在指定日期、指定大节的课程行（自动按教学周过滤周次区间）。"""
    weekday = datetime.date.fromisoformat(date_str).isoweekday()
    week = week_of(date_str)
    rows = []
    for r in SCHEDULE_BY_CLASS.get(class_name, ()):
        if r["weekday"] != weekday:
            continue
        if week and not (r["weeks"][0] <= week <= r["weeks"][1]):
            continue
        if periods and r["period"] not in periods:
            continue
        rows.append(r)
    return sorted(rows, key=lambda r: r["period"])


def tool_student(name: str) -> Optional[dict]:
    return STUDENT_BY_NAME.get(name)


def tool_dorm(room_code: str) -> list[dict]:
    return STUDENTS_BY_DORM.get(room_code, [])


def tool_classmates(student: dict) -> list[dict]:
    return STUDENTS_BY_CLASS.get(student["class_name"], [])


def tool_find_students(query: str) -> list[dict]:
    """从问题里找出被点名的学生。

    原实现是 `[s for s in students() if s["name"] in query or s["student_id"] in query]`，
    每次检索都要把 7004 名学生全扫一遍做子串判断。
    改成反向命中：姓名从问题里切出 2~4 字中文片段直接查索引（O(问题长度)）；
    学号只在问题里真的出现数字时才做包含判断。
    """
    hits: list[dict] = []
    seen: set[str] = set()

    def take(student: Optional[dict]) -> None:
        if student and student["student_id"] not in seen:
            seen.add(student["student_id"])
            hits.append(student)

    for segment in re.split(r"[^\u4e00-\u9fa5]+", query):
        for size in (2, 3, 4):
            for start in range(len(segment) - size + 1):
                take(STUDENT_BY_NAME.get(segment[start:start + size]))

    if any(ch.isdigit() for ch in query):
        for student in students():
            if student["student_id"] in query:
                take(student)
    return hits


def tool_location_of(room_code: str) -> str:
    room = room_index().get(room_code)
    if not room:
        return venue_display(room_code)
    return room["semantic_name"]


def tool_route(start_node: str, stops: list[dict], start_label: str = "起点") -> dict:
    """stops: [{location, reason, label?}] —— location 为 room_code 或 POI:xxx，已按时间排序。

    返回室外 Dijkstra 路径 + 室内锚点段，并附带**分段（legs）**说明，
    供前端渲染「第 N 段：A → B，约 x 米 / y 分钟」的分步导航面板。
    """
    table = graph_adjacency()

    def shortest(a: str, b: str):
        """Dijkstra（堆 + prev 回溯）。

        原实现把路径列表整个塞进堆，每次松弛都 path + [node] 复制一遍；
        现在只记录 prev 指针，命中终点后再回溯重建一次路径。
        """
        if a == b:
            return 0.0, [a]
        dist: dict[str, float] = {a: 0.0}
        prev: dict[str, Optional[str]] = {a: None}
        queue: list[tuple[float, str]] = [(0.0, a)]
        visited: set[str] = set()
        while queue:
            d, node = heappop(queue)
            if node in visited:
                continue
            visited.add(node)
            if node == b:
                path: list[str] = []
                cursor: Optional[str] = node
                while cursor is not None:
                    path.append(cursor)
                    cursor = prev.get(cursor)
                path.reverse()
                return d, path
            for weight, neighbor in table.get(node, ()):
                if neighbor in visited:
                    continue
                candidate = d + weight
                if candidate < dist.get(neighbor, math.inf):
                    dist[neighbor] = candidate
                    prev[neighbor] = node
                    heappush(queue, (candidate, neighbor))
        return None, None

    nodes: list[str] = []
    indoor: list[list[float]] = []
    legs: list[dict] = []
    total = 0.0
    current = start_node
    current_label = start_label
    for stop in stops:
        location = stop["location"]
        indoor_here = False
        if location.startswith("POI:"):
            entry = location[4:]
            anchor = None
        else:
            room = room_index().get(location)
            if not room:
                continue
            entry = f"entry_{room['building_code']}"
            anchor = room["anchor_world"]
        leg_distance = 0.0
        if current != entry:
            dist, path = shortest(current, entry)
            if path is None:
                continue
            nodes.extend(path if not nodes else path[1:])
            total += dist
            leg_distance = dist
        else:
            nodes.append(entry)
        if anchor:
            indoor.append([anchor[0], 1.0, anchor[2]])
            indoor.append([anchor[0], anchor[1], anchor[2]])
            indoor_here = True
        label = stop.get("label") or venue_display(location)
        legs.append({
            "index": len(legs) + 1,
            "from": current_label,
            "to": label,
            "reason": stop.get("reason", ""),
            "distance_m": round(leg_distance, 1),
            "walking_minutes": max(1, round(leg_distance / 72)) if leg_distance else 0,
            "indoor": indoor_here,
            "location": location,
        })
        current = entry
        current_label = label
    return {
        "nodes": nodes,
        "distance_m": round(total, 1),
        "walking_minutes": max(1, round(total / 72)) if nodes else 0,
        "indoor_points": indoor,
        "legs": legs,
    }


TOOLS = [
    {"name": "timetable_for", "description": "查询某日期适用的作息（自动区分夏季/冬季作息）", "params": {"date_str": "YYYY-MM-DD"}},
    {"name": "tool_schedule", "description": "查询班级在某日期、指定大节的课程行（按教学周过滤周次）", "params": {"class_name": "str", "date_str": "YYYY-MM-DD", "periods": "[1..5] 可选"}},
    {"name": "tool_student", "description": "按姓名查询学生（含宿舍）", "params": {"name": "str"}},
    {"name": "tool_dorm", "description": "按宿舍房间码查询全体成员", "params": {"room_code": "str"}},
    {"name": "tool_location_of", "description": "房间码 → 3D 模型语义位置", "params": {"room_code": "str"}},
    {"name": "tool_route", "description": "室外 Dijkstra 最短路 + 室内锚点段（多目的地按时间排序）", "params": {"start_node": "str", "stops": "[{location, reason}]"}},
]


# ============ 时间/意图解析 ============

WEEKDAY_NAME = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]

CN_DIGITS = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}


def parse_weekday(text: str) -> Optional[int]:
    """解析 周X/星期X 等 → 1..7；无则 None"""
    for token, wd in (("星期一", 1), ("星期二", 2), ("星期三", 3), ("星期四", 4), ("星期五", 5),
                      ("星期六", 6), ("星期日", 7), ("星期天", 7),
                      ("周一", 1), ("周二", 2), ("周三", 3), ("周四", 4), ("周五", 5),
                      ("周六", 6), ("周日", 7)):
        if token in text:
            return wd
    return None


def parse_time(text: str) -> dict:
    """解析日期引用。返回：date(显式解析的日期或今天)、weekday(周几引用)、regime(冬季/夏季显式指定)"""
    today = datetime.date.today().isoformat()
    base = today
    explicit = False
    weekday_ref = parse_weekday(text)
    if "后天" in text:
        base, explicit = (datetime.date.fromisoformat(today) + datetime.timedelta(days=2)).isoformat(), True
    elif "明天" in text:
        base, explicit = (datetime.date.fromisoformat(today) + datetime.timedelta(days=1)).isoformat(), True
    elif "今天" in text:
        base, explicit = today, True
    elif weekday_ref:
        # 范围词"周一到周五"不当作单一日期
        if re.search(r"周[一二三四五六日天1-6].*到.*周|周一到周五|星期[一二三四五六日天]至", text):
            pass
        else:
            delta = (weekday_ref - datetime.date.fromisoformat(today).isoweekday()) % 7 or 7
            base, explicit = (datetime.date.fromisoformat(today) + datetime.timedelta(days=delta)).isoformat(), True
    else:
        m = re.search(r"(20\d{2})-(\d{1,2})-(\d{1,2})", text)
        if m:
            base, explicit = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}", True
    periods: Optional[list[int]] = None
    label = "全天"
    match = re.search(r"第\s*([1-5])\s*[大节节]", text)
    if match:
        periods = [int(match.group(1))]
        label = f"第{periods[0]}大节"
    elif "上午" in text:
        periods, label = [1, 2], "上午(第1~2大节)"
    elif "下午" in text:
        periods, label = [3, 4], "下午(第3~4大节)"
    elif "晚上" in text:
        periods, label = [5], "晚上(第5大节)"
    regime_override = "winter" if "冬季" in text else ("summer" if "夏季" in text else None)
    return {"today": today, "date": base, "explicit": explicit, "weekday_ref": weekday_ref,
            "periods": periods, "label": label, "regime_override": regime_override}


def next_class_day(date_str: str) -> str:
    d = datetime.date.fromisoformat(date_str)
    while d.isoweekday() > 5:
        d += datetime.timedelta(days=1)
    return d.isoformat()


def date_label(date_str: str, today: str) -> str:
    wd = WEEKDAY_NAME[datetime.date.fromisoformat(date_str).isoweekday() - 1]
    if date_str == today:
        return f"今天({wd})"
    if date_str == (datetime.date.fromisoformat(today) + datetime.timedelta(days=1)).isoformat():
        return f"明天({wd})"
    week = week_of(date_str)
    suffix = f"·第{week}周" if week else ""
    return f"{date_str}({wd}{suffix})"


# —— 年级 / 班级识别 ——

GRADE_ALIASES = [
    ("2025级", ("2025级", "25级", "大二", "2025 级")),
    ("2026级", ("2026级", "26级", "大一", "2026 级")),
]


def detect_grade(text: str) -> Optional[str]:
    for grade, aliases in GRADE_ALIASES:
        if any(a in text for a in aliases):
            return grade
    return None


def detect_all_classes(text: str) -> list[str]:
    """识别班级实体，支持三种写法：
       ① 规范名「计科2501」② 省略年级「计科1班/计科一班」③ 多班顿号/和/与/加 列举
       ③ 中的歧义（同名不同年级）由文本里的年级词（大一/大二/2025级）消解，默认 2025 级。
    """
    out: list[str] = []

    def add(name: str) -> None:
        if name in CLASSES and name not in out:
            out.append(name)

    # ① 规范名直接命中
    for cls in CLASS_LIST:
        if cls in text:
            add(cls)

    grade_hint = detect_grade(text)

    # ② 短名 + 2位年级 + 序号（可省略前导 0）
    for m in re.finditer(r"([\u4e00-\u9fa5]{2,4})?(\d{2})(\d{1,2})\s*班?", text):
        short, yy, seq = m.group(1) or "", m.group(2), int(m.group(3))
        grade = grade_hint or ("2025级" if yy == "25" else "2026级" if yy == "26" else None)
        if not grade:
            continue
        if short:
            candidates = [c for c in CLASS_LIST if c.startswith(short) and c.endswith(f"{yy}{seq:02d}")]
        else:
            candidates = [c for c in CLASS_LIST if c.endswith(f"{yy}{seq:02d}")]
        for c in candidates:
            add(c)

    # ③ 短名 + 中文/阿拉伯序号 + 「班」
    for m in re.finditer(r"([\u4e00-\u9fa5]{2,4})\s*([一二三四五六七八九]|\d{1,2})\s*班", text):
        short, token = m.group(1), m.group(2)
        seq = CN_DIGITS.get(token) or int(token)
        for grade in ([grade_hint] if grade_hint else ["2025级", "2026级"]):
            for c in CLASS_LIST:
                if c.startswith(short) and c.endswith(f"{grade[2:4]}{seq:02d}"):
                    add(c)
    return out


def detect_class(text: str) -> Optional[str]:
    """识别单个班级，用于单班语境"""
    hits = detect_all_classes(text)
    return hits[0] if hits else None


def detect_major(text: str) -> Optional[str]:
    """识别专业名（长的优先，避免「电子」误配）"""
    hits = [m for m in MAJORS if m in text]
    if not hits:
        return None
    return max(hits, key=len)


def venue_display(location: str) -> str:
    if location.startswith("POI:"):
        return {"POI:sportsEast": "400米田径场", "POI:gate": "南校门"}.get(location, location[4:])
    room = room_index().get(location)
    return room["semantic_name"] if room else location


# ============ 问答主流程 ============

class AskBody(BaseModel):
    question: str
    class_name: "Optional[str]" = None  # 视角班级（页面选择器）

AskBody.model_rebuild()


@router.post("/ask")
def ask(body: AskBody):
    text = body.question.strip()
    t = parse_time(text)
    today = t["today"]
    sources: list[dict] = []
    view_class = body.class_name if body.class_name in CLASSES else None

    has_path_kw = any(w in text for w in ("怎么走", "路线", "路径", "导航", "怎么去"))
    has_schedule_kw = any(w in text for w in ("课", "上课", "教室", "课程表"))
    is_time_q = any(w in text for w in ("几点", "作息", "下课", "上课时间")) and not has_path_kw
    student = tool_find_students(text)

    def regime_of_ask(date_str: str) -> dict:
        """作息：显式问冬季/夏季则覆盖；否则按日期自动"""
        if t["regime_override"]:
            raw = timetable()[t["regime_override"]]
            normalized = {"regime": t["regime_override"], "label": raw["label"]}
            for key, value in raw.items():
                if key.isdigit():
                    normalized[int(key)] = value
                    normalized[key] = value
            return normalized
        return timetable_for(date_str)

    # —— 1. 作息时间 ——
    if is_time_q:
        regime = regime_of_ask(today)
        match = re.search(r"第\s*([1-5])\s*[大节节]", text)
        if match:
            p = int(match.group(1))
            start, end = regime[str(p)]
            return {"intent": "time", "answer": f"{regime['label']}：第{p}大节 {start}-{end}，{end} 下课。",
                    "sources": [{"source": "timetable.json", "ref": f"{regime['regime']}·P{p}"}],
                    "data": {"timetable": regime}}
        cls_for_time = detect_class(text) or view_class
        wd = t["weekday_ref"] or datetime.date.fromisoformat(today).isoweekday()
        if wd > 5:
            wd = datetime.date.fromisoformat(
                next_class_day((datetime.date.fromisoformat(today) + datetime.timedelta(days=1)).isoformat())).isoweekday()
        if cls_for_time and wd <= 5:
            rows = [r for r in SCHEDULE_BY_CLASS.get(cls_for_time, ()) if r["weekday"] == wd]
            rows = sorted(rows, key=lambda r: r["period"])
            if rows:
                last = rows[-1]
                end = regime[str(last["period"])][1]
                return {"intent": "time",
                        "answer": f"{cls_for_time} {WEEKDAY_NAME[wd - 1]}按{regime['label']}最后一节课是第{last['period']}大节 {last['course']}，{end} 下课。",
                        "sources": [{"source": "schedule.json", "ref": f"{last['id']}·{cls_for_time}"},
                                    {"source": "timetable.json", "ref": f"{regime['regime']}·P{last['period']}"}],
                        "data": {"timetable": regime}}
        end = regime["4"][1]
        return {"intent": "time", "answer": f"{regime['label']}：下午第4大节 {regime['4'][0]}-{regime['4'][1]}，{end} 下课（当日课程结束）。",
                "sources": [{"source": "timetable.json", "ref": f"{regime['regime']}·P4"}],
                "data": {"timetable": regime}}

    # —— 2. 宿舍 / 学生 ——
    if student and ("宿舍" in text or "住" in text or "同学" in text or "哪个班" in text or "学号" in text) and not has_schedule_kw:
        found = student[0]
        room_code = found["dorm_room_code"]
        members = tool_dorm(room_code)
        sources.append({"source": "students.json", "ref": f"{found['student_id']}·{found['name']}",
                        "detail": f"{found['class_name']} {venue_display(room_code)}（{room_code}）"})
        sources.append({"source": "students.json", "ref": f"宿舍 {venue_display(room_code)}", "detail": f"{len(members)} 人"})
        answer = (f"{found['name']}（{found['student_id']}，{found['gender']}，{found['grade']} {found['class_name']}，"
                  f"辅导员 {found['counselor']}）住在 {venue_display(room_code)}，床位 {found['bed']} 号，"
                  f"同宿舍 {len(members)} 人：{'、'.join(m['name'] for m in members)}。")
        return {"intent": "dormitory", "answer": answer, "sources": sources,
                "data": {"students": members, "dorm_room": room_code}}

    # —— 2b. 教师课表 ——
    if "老师" in text:
        hit = [name for name in TEACHER_INDEX if name in text]
        if hit:
            teacher = max(hit, key=len)
            rows = TEACHER_INDEX[teacher]
            by_class: dict[str, list[dict]] = {}
            for r in rows:
                by_class.setdefault(r["class_name"], []).append(r)
            lines = []
            for cls, rs in sorted(by_class.items()):
                course = rs[0]["course"]
                slots = "、".join(f"{WEEKDAY_NAME[x['weekday'] - 1]}第{x['period']}大节" for x in sorted(rs, key=lambda x: (x["weekday"], x["period"])))
                lines.append(f"{course}（{cls}，{slots}）")
            return {"intent": "teacher",
                    "answer": f"{teacher} 本学期承担 {len(by_class)} 个班、共 {len(rows)} 大节：\n" + "\n".join(lines),
                    "sources": [{"source": "schedule.json", "ref": f"{teacher}·{r['id']}"} for r in rows[:8]],
                    "data": {"teacher": teacher, "rows": rows}}

    # —— 2c. 周课量统计 ——
    if re.search(r"(周[一二三四五六日天1-6]\s*到\s*周|周一到周五|星期[一二三四五六日天]\s*至|每周|一周|一星期)", text) \
            and re.search(r"(几节|多少节|几门|几节课|节数|课表|上课安排)", text):
        cls = detect_class(text) or view_class
        if cls:
            day_counts = []
            total = 0
            per_day = {}
            for wd in range(1, 6):
                rows = [r for r in SCHEDULE_BY_CLASS.get(cls, ()) if r["weekday"] == wd]
                rows = sorted(rows, key=lambda r: r["period"])
                per_day[wd] = rows
                total += len(rows)
                detail = "、".join(f"{r['course']}(第{r['period']}大节)" for r in rows) if rows else "无课"
                day_counts.append(f"{WEEKDAY_NAME[wd - 1]}：{len(rows)} 节（{detail}）")
                for row in rows:
                    sources.append({"source": "schedule.json", "ref": f"{row['id']}·{cls}",
                                    "detail": f"{WEEKDAY_NAME[wd - 1]} 第{row['period']}大节 {row['course']}"})
            info = CLASS_INFO[cls]
            answer = (f"{cls}（{info['major']} {info['grade_label']}）每周一至周五共 {total} 大节"
                      f"（{total * 2} 学时，本学期 {info['total_credits']} 学分）：\n" + "\n".join(day_counts))
            return {"intent": "weekly_stats", "answer": answer, "sources": sources,
                    "data": {"class_name": cls, "per_day": per_day, "total": total}}

    # —— 2d. 规模统计（专业/年级/全校） ——
    stat_kw = re.search(r"(多少|几)\s*(个班|人|名)|多少人|几个班|多少个班", text)

    major_hit = detect_major(text)

    if stat_kw and major_hit and not detect_class(text):
        m = MAJORS[major_hit]
        grade = detect_grade(text)
        if grade:
            classes = m["classes"][grade]
            count = sum(c["student_count"] for c in (CLASS_INFO[x] for x in classes))
            answer = (f"岳阳学院 {major_hit}（{m['college']}，{m['code']}）{GRADES[grade]['label']}共 {len(classes)} 个班："
                      f"{'、'.join(classes)}；在校 {count} 人。{grade}招生计划 "
                      f"{m['p2025'] if grade == '2025级' else m['p2026']} 人。")
        else:
            c25 = m["classes"]["2025级"]
            c26 = m["classes"]["2026级"]
            answer = (f"岳阳学院 {major_hit}（{m['college']}，专业代码 {m['code']}）："
                      f"2025 级（大二）{len(c25)} 个班、{m['p2025'] or 0} 人；"
                      f"2026 级（大一）{len(c26)} 个班、{m['p2026'] or 0} 人"
                      f"{'（2026 年艺体类分专业计划为估算值）' if m['estimated_2026'] else ''}。"
                      f"班级：{'、'.join(c25 + c26)}。")
        return {"intent": "stats", "answer": answer,
                "sources": [{"source": "training_plan.json", "ref": f"majors·{major_hit}"}] + [
                    {"source": "students.json", "ref": c, "detail": f"{CLASS_INFO[c]['student_count']} 人"}
                    for c in (MAJORS[major_hit]["classes"][grade] if grade else [])][:6],
                "data": {"major": major_hit}}

    # 多班级聚合
    all_classes = detect_all_classes(text)
    if len(all_classes) > 1 and re.search(r"(多少|几)\s*人|多少人|人数", text):
        count_map = {c: len(STUDENTS_BY_CLASS.get(c, [])) for c in all_classes}
        dorm_map = {c: len(CLASS_INFO[c]["dorm"]["male_rooms"]) + len(CLASS_INFO[c]["dorm"]["female_rooms"]) for c in all_classes}
        sources = [{"source": "students.json", "ref": c, "detail": f"{count_map[c]} 人"} for c in all_classes]
        if re.search(r"(加起来|加在一起|总共|一共|合计|总和|总共有)", text):
            total = sum(count_map.values())
            answer = (f"{'、'.join(all_classes)}加起来共 {total} 名学生"
                      f"（{'、'.join(f'{c}{count_map[c]} 人' for c in all_classes)}），"
                      f"住宿 {sum(dorm_map.values())} 间宿舍（每间 6 人）。")
        elif re.search(r"(分别|各有多少|各是|每个)", text):
            answer = f"{'、'.join(all_classes)}人数分别如下：" + "；".join(
                f"{c} {count_map[c]} 人（住宿 {dorm_map[c]} 间）" for c in all_classes) + "。"
        else:
            total = sum(count_map.values())
            answer = f"{'、'.join(all_classes)}共 {total} 名学生，每个班约 {total // len(all_classes)} 人。"
        return {"intent": "stats", "answer": answer, "sources": sources, "data": {"count_map": count_map}}

    cls_stats = detect_class(text)
    if cls_stats and re.search(r"(有|共|一共)?\s*(多少|几)\s*人|多少人", text):
        info = CLASS_INFO[cls_stats]
        return {"intent": "stats",
                "answer": (f"{cls_stats}（{info['major']} {info['grade_label']}）共 {info['student_count']} 名学生"
                           f"（男 {info['gender_count']['男']} 人 / 女 {info['gender_count']['女']} 人），"
                           f"住宿 {len(info['dorm']['male_rooms']) + len(info['dorm']['female_rooms'])} 间宿舍（每间 6 人），"
                           f"辅导员 {info['counselor']}。"),
                "sources": [{"source": "students.json", "ref": cls_stats}],
                "data": {"class_name": cls_stats, "count": info["student_count"]}}

    if re.search(r"(总共|一共|合计|全校|整个专业|整个年级)", text) and re.search(r"(多少|几)\s*(人|名|个班|专业)|多少人", text):
        grade = detect_grade(text)
        if grade:
            g = GRADES[grade]
            return {"intent": "stats",
                    "answer": (f"{g['label']}共 {len(g['classes'])} 个班、{g['student_count']} 名学生，"
                               f"教学周第 {g['teaching_weeks'][0]}~{g['teaching_weeks'][1]} 周，{g['term_name']}。"),
                    "sources": [{"source": "training_plan.json", "ref": f"grades·{grade}"}],
                    "data": {"grade": grade, "count": g["student_count"]}}
        v = validation()
        return {"intent": "stats",
                "answer": (f"岳阳学院目前在校 2025 级（大二）与 2026 级（大一）两个年级，"
                           f"共 {v['classes']} 个班、{v['students']} 名学生、{len(MAJORS)} 个招生专业；"
                           f"本学期开出 {v['courses']} 门课程、{v['schedule_rows']} 条课表记录，"
                           f"使用教室 {v['rooms_used']} 间、宿舍 {v['dorm_rooms_used']} 间。"),
                "sources": [{"source": "validation.json", "ref": "summary"},
                            {"source": "training_plan.json", "ref": "summary"}],
                "data": {"validation": v}}

    # —— 3. 课表（可带路径） ——
    if has_schedule_kw or has_path_kw:
        cls = detect_class(text) or view_class or CLASS_LIST[0]
        date_str = t["date"]
        if not t["explicit"] and datetime.date.fromisoformat(date_str).isoweekday() > 5:
            date_str = next_class_day(date_str)
        date_str = next_class_day(date_str) if datetime.date.fromisoformat(date_str).isoweekday() > 5 else date_str
        rows = tool_schedule(cls, date_str, t["periods"])
        regime = timetable_for(date_str)
        sources.append({"source": "timetable.json", "ref": regime["regime"], "detail": regime["label"]})
        dl = date_label(date_str, today)
        if not rows:
            probe = date_str
            for _ in range(7):
                probe = next_class_day((datetime.date.fromisoformat(probe) + datetime.timedelta(days=1)).isoformat())
                rows = tool_schedule(cls, probe, [1, 2, 3, 4])
                if rows:
                    break
            dl = date_label(probe, today)
            if not rows:
                return {"intent": "schedule",
                        "answer": f"{date_label(date_str, today)}{cls}没有安排课程。", "sources": sources, "data": {}}
            note = f"（{date_label(date_str, today)}本班无课，已就近展示下一个上课日）"
        else:
            note = ""
        for row in rows:
            sources.append({"source": "schedule.json", "ref": f"{row['id']}·{cls}",
                            "detail": f"{WEEKDAY_NAME[row['weekday'] - 1]} 第{row['period']}大节 {row['course']} @ {venue_display(row['location'])}（{row['location']}）"})
        lines = [f"第{r['period']}大节（{regime[str(r['period'])][0]}–{regime[str(r['period'])][1]}）"
                 f"{r['course']} · {r['teacher']} @ {venue_display(r['location'])} ［第{r['weeks'][0]}~{r['weeks'][1]}周］"
                 for r in rows]
        answer = f"{dl}{cls}共 {len(rows)} 门课：\n" + "\n".join(lines) + note
        payload: dict = {"intent": "schedule", "answer": answer, "sources": sources,
                         "data": {"schedule_rows": rows, "timetable": regime, "class_name": cls}}
        if has_path_kw and rows:
            dorm = plan()["dorm_allocation"][cls]
            building = (dorm["building_male"] or dorm["building_female"])[0]
            start_node = f"entry_{building}"
            start_label = f"{building} 宿舍"
            stops = [{"location": r["location"],
                      "reason": f"第{r['period']}大节 {r['course']}（{r['teacher']}）",
                      "label": venue_display(r["location"])} for r in rows]
            route = tool_route(start_node, stops, start_label)
            payload["intent"] = "schedule_route"
            payload["answer"] = answer + (f"\n\n已按大节时间先后规划最优路径：从 {start_label}出发，"
                                          f"全程约 {route['distance_m']} 米，步行约 {route['walking_minutes']} 分钟，"
                                          f"共 {len(route['legs'])} 段，途经 {len(route['nodes'])} 个路网节点，终点含室内路径。")
            payload["route"] = route
            payload["route_stops"] = route["legs"]
            sources.append({"source": "road_graph.json", "ref": f"{start_node} → {len(stops)} 个目的地",
                            "detail": f"{route['distance_m']} m / {route['walking_minutes']} min"})
        return payload

    # —— 4. 培养方案 ——
    cls = detect_class(text) or view_class
    if cls and any(w in text for w in ("培养方案", "学分", "选修", "必修", "课程", "教学大纲")):
        info = CLASS_INFO[cls]
        required = [c for c in info["courses"] if c["course_type"] == "必修"]
        elective = [c for c in info["courses"] if c["course_type"] == "选修"]
        lines = [f"{c['course']}（{c['credit']} 学分，每周 {c['weekly_sessions']} 大节，第{c['weeks'][0]}~{c['weeks'][1]} 周，{c['teacher']}）"
                 for c in info["courses"]]
        answer = (f"{cls} · {info['major']}（{info['college']}，{info['grade_label']}，{info['term_name']}）\n"
                  f"教学周：第 {info['teaching_weeks'][0]}~{info['teaching_weeks'][1]} 周；"
                  f"本学期共 {info['total_credits']} 学分、每周 {info['weekly_sessions']} 大节。\n"
                  f"必修 {len(required)} 门、选修 {len(elective)} 门：\n" + "\n".join(f"  {x}" for x in lines) +
                  f"\n辅导员：{info['counselor']}；班级人数 {info['student_count']} 人。")
        return {"intent": "training_plan", "answer": answer,
                "sources": [{"source": "training_plan.json", "ref": cls}],
                "data": {"class_info": info, "class_name": cls}}

    # —— 5. 兜底 ——
    samples = "、".join(CLASS_LIST[:3])
    return {
        "intent": "general",
        "answer": ("我是校园 RAG 问答助手（数据溯源版）。可问："
                   f"{samples} 明天第一节课在哪？/ 张伟住在哪间宿舍？/ 从宿舍到明天上午所有教室怎么走？/"
                   "第3大节几点下课？/ 计算机科学与技术专业有几个班？/ 会计2601班的培养方案？/ 2026级有多少人？"
                   "\n左侧可核对全部源数据。"),
        "sources": [],
        "data": {},
    }


# ============ 评测集（模块4：evals / 误差分析） ============

def _sample_class(major_short: str, grade: str = "2025级", seq: int = 1) -> str:
    return f"{major_short}{grade[2:4]}{seq:02d}"


def build_eval_cases() -> list[dict]:
    """评测集随数据动态计算期望值，保证回归时不会因数据刷新而失效。"""
    c1 = _sample_class("计科", "2025级", 1)
    c2 = _sample_class("计科", "2025级", 2)
    c3 = _sample_class("计科", "2025级", 3)
    total3 = sum(CLASS_INFO[c]["student_count"] for c in (c1, c2, c3))
    count1 = CLASS_INFO[c1]["student_count"]
    cs_classes = MAJORS["计算机科学与技术"]["classes"]["2025级"]
    g25 = GRADES["2025级"]
    week = min(18, max(1, week_of(datetime.date.today().isoformat()) or 1))
    return [
        {"q": "第3大节几点下课", "expect_intent": "time", "dynamic_timetable_period": 3},
        {"q": "冬季作息的周四几点下课", "expect_intent": "time", "expect_contains": ["下课"]},
        {"q": f"{c1}明天有什么课", "expect_intent": "schedule", "expect_contains": [c1]},
        {"q": f"{c1}明天第一节课在哪？", "expect_intent": "schedule"},
        {"q": f"{c1}周一到周五都有几节课", "expect_intent": "weekly_stats", "expect_contains": ["每周一至周五", "周五："]},
        {"q": f"{c1}、{c2}、{c3}加起来总共多少人", "expect_intent": "stats", "expect_contains": [f"{total3} 名"]},
        {"q": f"{c1}和{c2}分别多少人", "expect_intent": "stats", "expect_contains": ["分别如下"]},
        {"q": f"从宿舍到明天上午所有教室怎么走？（{c1}）", "expect_intent": "schedule_route", "expect_contains": ["最优路径"]},
        {"q": "计算机科学与技术专业有几个班", "expect_intent": "stats", "expect_contains": [f"{len(cs_classes)} 个班"]},
        {"q": f"{c1}有多少人", "expect_intent": "stats", "expect_contains": [f"{count1} 名学生"]},
        {"q": "25级总共多少人", "expect_intent": "stats", "expect_contains": [f"{g25['student_count']} 名学生"]},
        {"q": f"{c1}培养方案是什么", "expect_intent": "training_plan", "expect_contains": ["学分"]},
    ]


@router.get("/eval")
def eval_run():
    cases = build_eval_cases()
    results = []
    passed = 0
    for case in cases:
        payload = ask(AskBody(question=case["q"], class_name=None))
        ok_intent = payload["intent"] == case["expect_intent"]
        tokens = list(case.get("expect_contains", []))
        # 动态作息断言：时刻随当前日期（夏季/冬季）变化
        if "dynamic_timetable_period" in case:
            period = case["dynamic_timetable_period"]
            regime = timetable_for(datetime.date.today().isoformat())
            tokens.append("下课")
            tokens.append(regime[str(period)][0])
        ok_content = all(token in payload["answer"] for token in tokens)
        ok = ok_intent and ok_content
        passed += 1 if ok else 0
        results.append({"q": case["q"], "expect_intent": case["expect_intent"],
                        "actual_intent": payload["intent"], "pass": ok,
                        "answer": payload["answer"][:120]})
    return {"total": len(cases), "passed": passed, "rate": round(passed / len(cases), 3), "results": results}


# ============ 数据来源页面 ============

# 直接回传数据文件字节。
# 原来是 _load(...)（json.loads 成 Python 对象）→ FastAPI 再 json.dumps 回字符串，
# 对 students.json（2.8MB / 7004 条）一来一回纯属浪费；response 构造本身就是瓶颈。
# 文件内容本身就是合法 JSON，直接以 application/json 回传原始字节，语义完全一致。
_DATA_FILES = {
    "students": DATA / "students.json",
    "schedule": DATA / "schedule.json",
    "timetable": DATA / "timetable.json",
    "training_plan": DATA / "training_plan.json",
    "validation": DATA / "validation.json",
}
_RAW_BYTES: dict[str, bytes] = {}


@router.get("/data/{kind}")
def rag_data(kind: str):
    path = _DATA_FILES.get(kind)
    if path is None:
        raise HTTPException(404, "未知数据类别")
    cached = _RAW_BYTES.get(kind)
    if cached is None:
        cached = path.read_bytes()
        _RAW_BYTES[kind] = cached
    return Response(content=cached, media_type="application/json; charset=utf-8")


@router.get("/classes")
def classes():
    """班级清单（供前端选择器，支持按年级/专业过滤）。"""
    return {
        "grades": {g: {"label": v["label"], "classes": v["classes"]} for g, v in GRADES.items()},
        "majors": {m: {"college": v["college"], "category": v["category"],
                       "classes": v["classes"]} for m, v in MAJORS.items()},
        "all": CLASS_LIST,
        "total": len(CLASS_LIST),
    }


@router.get("/tools")
def tools():
    """检索工具清单（function calling schema 形态）"""
    return {"tools": TOOLS,
            "note": "检索/路径均为确定性工具函数；LLM 仅负责理解与槽位抽取，保证答案与源数据一致。"}
