"""
独立 RAG 问答引擎（无登录路由 /api/rag/*）
方法论（源自 Agent/RAG 教程调研）：
- LLM 只负责"理解"（可插拔），检索与推理全部走确定性工具函数 → 答案可溯源、可评估
- 检索工具（tools）以函数形式声明，与 function calling schema 同构
- 作息随日期自动切换：国庆（2026-10-01）前夏季作息，之后冬季作息
- 每条回答携带 sources（数据溯源），与 /api/rag/data/* 的源数据一一对应
- /api/rag/eval 内置评测集，回归验证检索准确率
"""
from __future__ import annotations

import datetime
import json
import re
import time
from functools import lru_cache
from heapq import heappop, heappush
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
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


STUDENT_BY_NAME = {s["name"]: s for s in students()}
CLASSES = plan()["elective_plan"].keys()
CLASS_LIST = list(CLASSES)

SEMESTER = timetable()["semester"]
NATIONAL_DAY = SEMESTER["national_day_split"]


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


# ============ 检索工具（function calling 形态，见 /api/rag/tools） ============

def tool_timetable(date_str: str) -> dict:
    return timetable_for(date_str)


def tool_schedule(class_name: str, date_str: str, periods: Optional[list[int]] = None) -> list[dict]:
    weekday = datetime.date.fromisoformat(date_str).isoweekday()
    rows = [r for r in schedule_rows() if r["class_name"] == class_name and r["weekday"] == weekday]
    if periods:
        rows = [r for r in rows if r["period"] in periods]
    return sorted(rows, key=lambda r: r["period"])


def tool_student(name: str) -> Optional[dict]:
    return STUDENT_BY_NAME.get(name)


def tool_dorm(room_code: str) -> list[dict]:
    return [s for s in students() if s["dorm_room_code"] == room_code]


def tool_classmates(student: dict) -> list[dict]:
    return [s for s in students() if s["class_name"] == student["class_name"]]


def tool_find_students(query: str) -> list[dict]:
    return [s for s in students() if s["name"] in query or s["student_id"] in query]


def tool_location_of(room_code: str) -> str:
    room = room_index().get(room_code)
    if not room:
        return "400米田径场" if "sportsEast" in room_code else room_code
    return room["semantic_name"]


def tool_route(start_node: str, stops: list[dict]) -> dict:
    """stops: [{location, reason}] —— location 为 room_code 或 POI:xxx，已按时间排序"""
    graph = road_graph()
    adjacency: dict[str, list[tuple[float, str]]] = {}
    for edge in graph["edges"]:
        adjacency.setdefault(edge["from"], []).append((edge["distance_m"], edge["to"]))
        adjacency.setdefault(edge["to"], []).append((edge["distance_m"], edge["from"]))

    def shortest(a: str, b: str):
        queue = [(0.0, a, [])]
        visited: set[str] = set()
        while queue:
            dist, node, path = heappop(queue)
            if node in visited:
                continue
            visited.add(node)
            path = path + [node]
            if node == b:
                return dist, path
            for weight, neighbor in adjacency.get(node, []):
                if neighbor not in visited:
                    heappush(queue, (dist + weight, neighbor, path))
        return None, None

    nodes: list[str] = []
    indoor: list[list[float]] = []
    total = 0.0
    current = start_node
    for stop in stops:
        location = stop["location"]
        if location.startswith("POI:"):
            entry = location[4:]
            anchor = None
        else:
            room = room_index().get(location)
            if not room:
                continue
            entry = f"entry_{room['building_code']}"
            anchor = room["anchor_world"]
        if current != entry:
            dist, path = shortest(current, entry)
            if path is None:
                continue
            nodes.extend(path if not nodes else path[1:])
            total += dist
        else:
            nodes.append(entry)
        if anchor:
            indoor.append([anchor[0], 1.0, anchor[2]])
            indoor.append([anchor[0], anchor[1], anchor[2]])
        current = entry
    return {
        "nodes": nodes,
        "distance_m": round(total, 1),
        "walking_minutes": max(1, round(total / 72)) if nodes else 0,
        "indoor_points": indoor,
    }


TOOLS = [
    {"name": "timetable_for", "description": "查询某日期适用的作息（自动区分夏季/冬季作息）", "params": {"date_str": "YYYY-MM-DD"}},
    {"name": "tool_schedule", "description": "查询班级在某日期、指定大节的课程行", "params": {"class_name": "str", "date_str": "YYYY-MM-DD", "periods": "[1..5] 可选"}},
    {"name": "tool_student", "description": "按姓名查询学生（含宿舍）", "params": {"name": "str"}},
    {"name": "tool_dorm", "description": "按宿舍房间码查询全体成员", "params": {"room_code": "str"}},
    {"name": "tool_location_of", "description": "房间码 → 3D 模型语义位置", "params": {"room_code": "str"}},
    {"name": "tool_route", "description": "室外 Dijkstra 最短路 + 室内锚点段（多目的地按时间排序）", "params": {"start_node": "str", "stops": "[{location, reason}]"}},
]


# ============ 时间/意图解析 ============

WEEKDAY_NAME = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]


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
    elif weekday_ref:
        # 仅当是"今天周几"或明确周几引用时按周几定位；范围词"周一到周五"不当作单一日期
        if re.search(r"周[一二三四五六日天1-6].*到.*周|周一到周五|星期[一二三四五六日天]至", text):
            pass  # 范围查询由调用方处理，不作为单日
        else:
            delta = (weekday_ref - datetime.date.fromisoformat(today).isoweekday()) % 7 or 7
            base, explicit = (datetime.date.fromisoformat(today) + datetime.timedelta(days=delta)).isoformat(), True
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
    return {"today": today, "date": base, "explicit": explicit, "weekday_ref": weekday_ref, "periods": periods, "label": label, "regime_override": regime_override}


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
    return f"{date_str}({wd})"


CN_DIGITS = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}


def parse_weekday(text: str) -> Optional[int]:
    """解析 周X/星期X/周四 等 → 1..7；无则 None"""
    for token, wd in (("星期一", 1), ("星期二", 2), ("星期三", 3), ("星期四", 4), ("星期五", 5), ("星期六", 6), ("星期日", 7), ("星期天", 7),
                      ("周一", 1), ("周二", 2), ("周三", 3), ("周四", 4), ("周五", 5), ("周六", 6), ("周日", 7)):
        if token in text:
            return wd
    return None


def detect_class(text: str) -> Optional[str]:
    """识别单个班级（计科1班 / 计科一班 / 计科三班），用于单班语境"""
    hits = detect_all_classes(text)
    return hits[0] if hits else None


def detect_all_classes(text: str) -> list[str]:
    """识别全部班级实体（支持顿号/逗号/和/与/加 连接的多班列举）"""
    out: list[str] = []
    for raw in re.findall(r"计科\s*[一二三四五六1-6]\s*班", text):
        token = re.search(r"[一二三四五六1-6]", raw).group(0)
        cls = f"计科{CN_DIGITS.get(token, token)}班"
        if cls not in out:
            out.append(cls)
    for cls in CLASS_LIST:
        if cls in text and cls not in out:
            out.append(cls)
    return out


def venue_display(location: str) -> str:
    if location.startswith("POI:"):
        return {"POI:sportsEast": "400米田径场"}.get(location, location[4:])
    room = room_index().get(location)
    if not room:
        return location
    name = room["semantic_name"]
    return name.replace("·CR·", " · ").replace(f"{room['building_code']}", f" {room['building_code']} ")


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
    view_class = body.class_name if body.class_name in CLASS_LIST else None

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
            return {"intent": "time", "answer": f"{regime['label']}：第{p}大节 {start}-{end}，{end} 下课。", "sources": [{"source": "timetable.json", "ref": f"{regime['regime']}·P{p}"}], "data": {"timetable": regime}}
        # 指定了周几（如"周四几点下课"）：查该班当天下课时间；未指定班则按作息第4大节（当日无晚课）
        cls_for_time = detect_class(text) or view_class
        wd = t["weekday_ref"] or datetime.date.fromisoformat(today).isoweekday()
        if wd > 5:
            wd = next_class_day((datetime.date.fromisoformat(today) + datetime.timedelta(days=1)).isoformat())
            wd = datetime.date.fromisoformat(wd).isoweekday()
        if cls_for_time and wd <= 5:
            rows = [r for r in schedule_rows() if r["class_name"] == cls_for_time and r["weekday"] == wd]
            rows = sorted(rows, key=lambda r: r["period"])
            if rows:
                last = rows[-1]
                end = regime[str(last["period"])][1]
                return {"intent": "time", "answer": f"{cls_for_time} {WEEKDAY_NAME[wd - 1]}按{regime['label']}最后一节课是第{last['period']}大节 {last['course']}，{end} 下课。",
                        "sources": [{"source": "schedule.json", "ref": f"{last['id']}·{cls_for_time}"}, {"source": "timetable.json", "ref": f"{regime['regime']}·P{last['period']}"}], "data": {"timetable": regime}}
        end = regime["4"][1]
        return {"intent": "time", "answer": f"{regime['label']}：下午第4大节 {regime['4'][0]}-{regime['4'][1]}，{end} 下课（当日课程结束）。", "sources": [{"source": "timetable.json", "ref": f"{regime['regime']}·P4"}], "data": {"timetable": regime}}

    # —— 2. 宿舍/学生 ——
    if student and ("宿舍" in text or "住" in text or "同学" in text or "哪个班" in text or "学号" in text) and not has_schedule_kw:
        found = student[0]
        room_code = found["dorm_room_code"]
        members = tool_dorm(room_code)
        sources.append({"source": "students.json", "ref": f"{found['student_id']}·{found['name']}", "detail": f"{found['class_name']} {room_code}"})
        sources.append({"source": "students.json", "ref": f"宿舍 {room_code}", "detail": f"{len(members)} 人"})
        answer = (f"{found['name']}（{found['student_id']}，{found['gender']}，{found['class_name']}，{found['counselor']} 辅导员）"
                  f"住在 {venue_display(room_code)}，床位 {found['bed']} 号，同宿舍 {len(members)} 人：{'、'.join(m['name'] for m in members)}。")
        return {"intent": "dormitory", "answer": answer, "sources": sources, "data": {"students": members, "dorm_room": room_code}}

    # —— 2b. 周课量统计（周一到周五/每周几节课） ——
    if re.search(r"(周[一二三四五六日天1-6]\s*到\s*周|周一到周五|星期[一二三四五六日天]\s*至|每周|一周|一星期)", text) and re.search(r"(几节|多少节|几门|几节课|节数|课表|上课安排)", text):
        cls = detect_class(text) or view_class
        if cls:
            day_counts = []
            total = 0
            per_day = {}
            for wd in range(1, 6):
                rows = [r for r in schedule_rows() if r["class_name"] == cls and r["weekday"] == wd]
                rows = sorted(rows, key=lambda r: r["period"])
                per_day[wd] = rows
                total += len(rows)
                detail = "、".join(f"{r['course']}(第{r['period']}大节)" for r in rows) if rows else "无课"
                day_counts.append(f"{WEEKDAY_NAME[wd - 1]}：{len(rows)} 节（{detail}）")
                for row in rows:
                    sources.append({"source": "schedule.json", "ref": f"{row['id']}·{cls}", "detail": f"{WEEKDAY_NAME[wd-1]} 第{row['period']}大节 {row['course']}"})
            answer = f"{cls} 每周一至周五共 {total} 节课：\n" + "\n".join(day_counts)
            return {"intent": "weekly_stats", "answer": answer, "sources": sources, "data": {"class_name": cls, "per_day": per_day, "total": total}}

    # —— 2c. 规模统计（几个班 / 每班人数 / 专业总人数） ——
    if ("几个班" in text or "多少个班" in text or "几个专业" in text) and ("计科" in text or "计算机" in text or "专业" in text):
        names = "、".join(CLASS_LIST)
        total_students = len(students())
        return {"intent": "stats", "answer": f"岳阳学院计算机科学与技术专业（2025 级）共 {len(CLASS_LIST)} 个班：{names}；全专业 {total_students} 名学生（每班 {total_students // len(CLASS_LIST)} 人）。",
                "sources": [{"source": "training_plan.json", "ref": "elective_plan"}, {"source": "students.json", "ref": "全部"}], "data": {"classes": CLASS_LIST, "class_count": len(CLASS_LIST)}}

    # —— 2c-1. 多班级聚合（计科1班、计科2班、计科3班加起来总共多少人 / 分别多少人） ——
    all_classes = detect_all_classes(text)
    if len(all_classes) > 1 and re.search(r"(多少|几)\s*人|多少人|人数", text):
        count_map = {c: len([s for s in students() if s["class_name"] == c]) for c in all_classes}
        dorm_map = {c: count_map[c] // 6 for c in all_classes}
        sources = [{"source": "students.json", "ref": c, "detail": f"{count_map[c]} 人"} for c in all_classes]
        if re.search(r"(加起来|加在一起|总共|一共|合计|总和|总共有)", text):
            total = sum(count_map.values())
            answer = f"{'、'.join(all_classes)}加起来共 {total} 名学生（{'、'.join(f'{c}{count_map[c]} 人' for c in all_classes)}），住宿 {sum(dorm_map.values())} 间宿舍。"
        elif re.search(r"(分别|各有多少|各是|每个)", text):
            answer = f"{'、'.join(all_classes)}人数分别如下：" + "；".join(f"{c} {count_map[c]} 人（住宿 {dorm_map[c]} 间）" for c in all_classes) + "。"
        else:
            total = sum(count_map.values())
            answer = f"{'、'.join(all_classes)}共 {total} 名学生，每班 {count_map[all_classes[0]]} 人。"
        return {"intent": "stats", "answer": answer, "sources": sources, "data": {"count_map": count_map}}

    cls_stats = detect_class(text)
    if cls_stats and re.search(r"(有|共|一共)?\s*(多少|几)\s*人|多少人", text):
        count = len([s for s in students() if s["class_name"] == cls_stats])
        return {"intent": "stats", "answer": f"{cls_stats} 共 {count} 名学生（男 {len([s for s in students() if s['class_name'] == cls_stats and s['gender'] == '男'])} 人 / 女 {len([s for s in students() if s['class_name'] == cls_stats and s['gender'] == '女'])} 人），住宿 {count // 6} 间宿舍。",
                "sources": [{"source": "students.json", "ref": cls_stats}], "data": {"class_name": cls_stats, "count": count}}
    if re.search(r"(总共|一共|合计|全专业|整个专业)", text) and re.search(r"(多少|几)\s*人|多少人|人$", text) and ("计科" in text or "计算机" in text or "专业" in text or "级" in text):
        total = len(students())
        return {"intent": "stats", "answer": f"2025 级计算机科学与技术专业（计科1班~计科6班）共 {total} 名学生，每班 {total // len(CLASS_LIST)} 人，住宿 {total // 6} 间宿舍（每间 6 人）。",
                "sources": [{"source": "students.json", "ref": "全部"}], "data": {"total": total, "classes": len(CLASS_LIST)}}

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
            fallback_date = next_class_day((datetime.date.fromisoformat(date_str) + datetime.timedelta(days=1)).isoformat())
            rows = tool_schedule(cls, fallback_date, [1, 2, 3, 4])
            dl = date_label(fallback_date, today)
            if not rows:
                return {"intent": "schedule", "answer": f"{date_label(date_str, today)}{cls}没有安排课程。", "sources": sources, "data": {}}
            note = f"（{date_label(date_str, today)}为非上课日，展示下一上课日）"
        else:
            note = ""
        for row in rows:
            sources.append({"source": "schedule.json", "ref": f"{row['id']}·{cls}", "detail": f"{WEEKDAY_NAME[row['weekday']-1]} 第{row['period']}大节 {row['course']} @ {row['location']}"})
        lines = [f"第{r['period']}大节（{regime[str(r['period'])][0]}–{regime[str(r['period'])][1]}）{r['course']} · {r['teacher']} @ {venue_display(r['location'])}" for r in rows]
        answer = f"{dl}{cls}共 {len(rows)} 门课：\n" + "\n".join(lines) + note
        payload: dict = {"intent": "schedule", "answer": answer, "sources": sources, "data": {"schedule_rows": rows, "timetable": regime, "class_name": cls}}
        if has_path_kw and rows:
            # 起点宿舍：若提问者视角班级默认，取该班宿舍楼第一个 entry
            start_class = cls
            building = plan()["dorm_allocation"][start_class]["building"]
            start_node = f"entry_{building}"
            stops = [{"location": r["location"], "reason": f"第{r['period']}大节 {r['course']}"} for r in rows if not r["location"].startswith("POI:")]
            poi_stops = [{"location": r["location"], "reason": f"第{r['period']}大节 {r['course']}"} for r in rows if r["location"].startswith("POI:")]
            stops = stops + poi_stops
            route = tool_route(start_node, stops)
            payload["intent"] = "schedule_route"
            payload["answer"] = answer + f"\n\n已按大节时间先后规划最优路径：从{building}宿舍出发，全程约 {route['distance_m']} 米，步行约 {route['walking_minutes']} 分钟，途经 {len(route['nodes'])} 个路网节点，终点含室内路径。"
            payload["route"] = route
            payload["route_stops"] = [{"label": venue_display(s["location"]), "reason": s["reason"]} for s in stops]
            sources.append({"source": "road_graph.json", "ref": f"{start_node} → {len(stops)} 个目的地", "detail": f"{route['distance_m']} m / {route['walking_minutes']} min"})
        return payload

    # —— 4. 班级/培养方案 ——
    cls = detect_class(text)
    if cls and any(w in text for w in ("培养方案", "学分", "选修", "必修", "课程")):
        courses = tool_schedule(cls, "2026-09-07", None)
        electives = plan()["elective_plan"][cls]
        total = plan()["total_credits_per_class"]
        return {
            "intent": "training_plan",
            "answer": f"{cls}（{SEMESTER['grade']}，{SEMESTER['term']}）本学期共 {total} 学分：必修 {len(plan()['required'])} 门（{('、').join(c['course'] for c in plan()['required'])}），选修 2 门（{'、'.join(electives)}，各 2 学分），辅导员为 {next(c['name'] for c in plan()['counselors'] if cls in c['classes'])}。",
            "sources": [{"source": "training_plan.json", "ref": cls}],
            "data": {"training_plan": plan(), "class_name": cls},
        }

    # —— 5. 兜底 ——
    return {
        "intent": "general",
        "answer": "我是校园 RAG 问答助手（数据溯源版）。可问：计科1班明天第一节课在哪？/ 张伟住在哪间宿舍？/ 从宿舍到明天上午所有教室怎么走？/ 第3大节几点下课？/ 计科3班的培养方案？左侧可核对全部源数据。",
        "sources": [],
        "data": {},
    }


# ============ 评测集（视频③模块4：evals / 误差分析） ============

EVAL_CASES = [
    {"q": "第3大节几点下课", "expect_intent": "time", "dynamic_timetable_period": 3},
    {"q": "冬季作息的周四几点下课", "expect_intent": "time", "expect_contains": ["17:40"]},
    {"q": "计科1班明天有什么课", "expect_intent": "schedule", "expect_contains": ["计科1班"]},
    {"q": "计科1班明天第一节课在哪？", "expect_intent": "schedule", "expect_contains": ["第1大节"]},
    {"q": "计科1班周一到周五都有几节课", "expect_intent": "weekly_stats", "expect_contains": ["共 16 节", "周五"]},
    {"q": "计科1班、计科2班、计科3班加起来总共多少人", "expect_intent": "stats", "expect_contains": ["180 名"]},
    {"q": "计科一班和计科二班分别多少人", "expect_intent": "stats", "expect_contains": ["分别如下"]},
    {"q": "从宿舍到明天上午所有教室怎么走？", "expect_intent": "schedule_route", "expect_contains": ["最优路径"]},
    {"q": "计算机科学与技术专业有几个班", "expect_intent": "stats", "expect_contains": ["6 个班"]},
    {"q": "计科一班有多少人", "expect_intent": "stats", "expect_contains": ["60 名学生"]},
    {"q": "25级计科专业总共多少人", "expect_intent": "stats", "expect_contains": ["360 名学生"]},
    {"q": "计科1班培养方案是什么", "expect_intent": "training_plan", "expect_contains": ["学分"]},
]


@router.get("/eval")
def eval_run():
    results = []
    passed = 0
    for case in EVAL_CASES:
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
        results.append({"q": case["q"], "expect_intent": case["expect_intent"], "actual_intent": payload["intent"], "pass": ok})
    return {"total": len(EVAL_CASES), "passed": passed, "rate": round(passed / len(EVAL_CASES), 3), "results": results}


# ============ 数据来源页面 ============

@router.get("/data/{kind}")
def rag_data(kind: str):
    if kind in ("students", "schedule", "timetable", "training_plan", "validation"):
        return _load(f"{kind}.json")
    raise HTTPException(404, "未知数据类别")


@router.get("/tools")
def tools():
    """检索工具清单（function calling schema 形态）"""
    return {"tools": TOOLS, "note": "检索/路径均为确定性工具函数；LLM 仅负责理解与槽位抽取，保证答案与源数据一致。"}
