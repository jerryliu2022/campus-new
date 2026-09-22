"""岳阳学院 · 教学数据生成器（需求第 3 步：真实招生 → 分班 → 排课 → 教室/宿舍）

输入（均为项目内已核实的官方数据 / 建模数据）：
  scripts/academic_plan.py   招生计划、培养方案课程、作息、校历、排课硬约束
  scripts/campus_program.py  楼栋房间网格（唯一数据源）
  data/campus_layout.json    27 栋建筑名录
  data/room_anchors.json     2720 个房间锚点

输出（data/rag/）：
  students.json        全校学生（含班级、宿舍床位）
  schedule.json        排课结果（班-课-周次区间-星期-大节-教室）
  training_plan.json   各年级/各专业/各班级培养方案与课程安排
  timetable.json       作息时间表 + 学期（含校历关键节点）
  validation.json      零冲突校验报告

排课硬约束（需求原文）：
  1. 一个班一门课一天最多只能上两节课
  2. 一个班一门课一周只能上 4 节课
  3. 周末不能排课
  4. 一个班一门课要按连续周数安排
  5. 只有教学楼(CR)与实验楼(LB)可以排课

运行：python scripts/generate_rag_data.py
"""

from __future__ import annotations

import datetime
import json
import math
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import academic_plan as AP  # noqa: E402
import campus_program as CP  # noqa: E402

DATA = ROOT / "data"
RAG = DATA / "rag"
SEED = 20260920

# 作业容量
CLASSROOM_SEATS = 60
DORM_BEDS = 6

# 实践/实验课学科门类：这些专业的专业课安排进实验楼（LB），其余只排教学楼（CR）
LAB_CATEGORIES = {"工学", "管理学", "经济学", "艺术学", "教育学"}
# 第 1 学期（大一上）不设选修课
TERMS_WITH_ELECTIVE = {3}
# 各学期专业核心课门数上限（贴近培养方案：大一以示基础课为主，大二专业课集中）
MAX_MAJOR_COURSES = {1: 2, 3: 3}


def sessions_from_credit(credit: float) -> int:
    """每周大节数由学分推导：1 大节 = 2 学时，1 学分 ≈ 16 学时 / 18 教学周。
    例：4 学分 → 2 大节/周；6 学分（高等数学）→ 3 大节/周。"""
    return max(1, int(credit / 2 + 0.25))

# 各学科门类的男生比例（用于宿舍性别分配，贴近真实专业结构）
MALE_RATIO = {"工学": 0.75, "管理学": 0.45, "经济学": 0.45, "文学": 0.30,
              "法学": 0.40, "教育学": 0.55, "艺术学": 0.35}

# 宿舍楼（按性别动态分配）
DORM_BUILDINGS_MALE = ["B11", "B12", "B13", "B14", "B24", "B25"]
DORM_BUILDINGS_FEMALE = ["B15", "B16", "B19", "B20", "B26", "B27"]

# ============================================================
# 姓名 / 籍贯 池
# ============================================================
SURNAMES = list(
    "王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤"
)
GIVEN_A = list("伟芳娜秀英敏静丽强磊军洋勇艳杰娟涛明超霞平刚桂志建国栋海燕俊逸鹏程瑞雪天佑文博思远嘉禾望舒知行云帆景行正阳慕晴清扬若曦子昂若愚慕清劲松婉立航振峰笑雅琴洪波晓东建华丽萍志强秀春梅明辉静怡宇轩子涵欣怡佳琪浩然雨欣子墨梓涵梦泽嘉怡宁远书瑶晨曦锦程悦心")
GIVEN_CHARS2 = list("华文明杰强磊军洋勇艳杰娟涛明超霞平刚桂国栋海燕俊逸鹏程瑞雪天佑博远嘉禾知行云帆阳晴扬曦昂愚清松婉立航峰笑雅琴波东华萍强春梅辉怡轩涵欣琪然雨墨梓梦泽宁书瑶晨锦悦心")

HOMETOWNS = ["湖南岳阳", "湖南长沙", "湖南株洲", "湖南湘潭", "湖南衡阳", "湖南邵阳", "湖南常德",
             "湖南张家界", "湖南益阳", "湖南郴州", "湖南永州", "湖南怀化", "湖南娄底", "湖南湘西",
             "湖北武汉", "江西南昌", "广东广州", "广西南宁", "河南郑州", "河北石家庄",
             "四川成都", "重庆", "贵州贵阳", "云南昆明", "陕西西安", "山西太原", "山东济南",
             "江苏南京", "浙江杭州", "安徽合肥", "福建福州", "辽宁沈阳", "吉林长春", "黑龙江哈尔滨"]

COUNSELOR_SURNAMES = SURNAMES[:60]


# ============================================================
# 工具
# ============================================================

def plan_class_sizes(total: int) -> list[int]:
    """按每班 50~60 人分班；对规模不足 100 人的专业按最少班数均衡编班（44~49 人）。"""
    if total <= 0:
        return []
    n = max(1, round(total / 55))
    while total / n > CLASSROOM_SEATS:
        n += 1
    while n > 1 and total / (n - 1) <= CLASSROOM_SEATS:
        n -= 1
    base, rem = divmod(total, n)
    return [base + 1] * rem + [base] * (n - rem)


class NamePool:
    """保证全校姓名不重复（7000+ 人）。"""

    def __init__(self, rng: random.Random):
        self.rng = rng
        self.used: set[str] = set()
        self._order = SURNAMES[:]
        rng.shuffle(self._order)
        self._i = 0

    def next(self) -> str:
        for _ in range(400000):
            surname = self._order[(self._i // 2) % len(self._order)]
            self._i += 1
            given = self.rng.choice(GIVEN_A)
            if self.rng.random() < 0.55:
                given += self.rng.choice(GIVEN_CHARS2)
            name = surname + given
            if name not in self.used:
                self.used.add(name)
                return name
        raise RuntimeError("姓名池耗尽")


def load_inputs() -> tuple[dict, dict]:
    layout = json.loads((DATA / "campus_layout.json").read_text(encoding="utf-8"))
    anchors = json.loads((DATA / "room_anchors.json").read_text(encoding="utf-8"))
    return layout, anchors


# ============================================================
# 一、建筑与房间池
# ============================================================

def build_room_pools(anchors: dict) -> dict:
    rooms = anchors["rooms"]
    cr = sorted(r["room_code"] for r in rooms if r["room_type"] == "CR")
    lb = sorted(r["room_code"] for r in rooms if r["room_type"] == "LB")
    dorm = sorted(r["room_code"] for r in rooms if r["room_type"] == "DOR")
    return {"CR": cr, "LB": lb, "DOR": dorm}


# ============================================================
# 二、分班
# ============================================================

def build_classes() -> list[dict]:
    """按 2025/2026 实际招生计划分班。"""
    classes: list[dict] = []
    for grade in ("2025级", "2026级"):
        g = AP.GRADES[grade]
        yy = grade[2:4]                      # "25" / "26"
        key = "p2025" if grade == "2025级" else "p2026"
        for major, info in AP.MAJORS.items():
            total = info.get(key)
            if not total:
                continue
            sizes = plan_class_sizes(total)
            short = AP.MAJOR_SHORT[major]
            for i, size in enumerate(sizes, start=1):
                classes.append({
                    "class_name": f"{short}{yy}{i:02d}",
                    "grade": grade,
                    "grade_label": g["label"],
                    "term": g["term"],
                    "term_name": g["term_name"],
                    "major": major,
                    "major_short": short,
                    "college": info["college"],
                    "category": info["category"],
                    "major_code": info["code"],
                    "entrance": g["entrance"],
                    "seq": i,
                    "class_count": len(sizes),
                    "total_in_major": total,
                    "student_count": size,
                })
    return classes


# ============================================================
# 三、培养方案（课程安排）
# ============================================================

def course_weeks(course: str, grade: str) -> list[int]:
    """返回该课程在本学期的连续教学周区间 [起, 止]（连续周数是硬约束）。"""
    lo, hi = AP.GRADE_TEACHING_WEEKS[grade]
    if course == "军事理论" and grade == "2026级":
        return [lo, min(hi, lo + 7)]          # 第 4~11 周
    if course == "形势与政策":
        return [lo, min(hi, lo + 5)]          # 集中前 6 周
    if course == "大学生心理健康教育" and grade == "2026级":
        return [lo, min(hi, lo + 7)]
    return [lo, hi]


def build_courses(cls: dict) -> list[dict]:
    term = cls["term"]
    major = cls["major"]
    category = cls["category"]
    grade = cls["grade"]

    items: list[tuple[str, float, str, str]] = []   # (课名, 学分, 类型, 场地偏好)

    for name, _weekly, credit in AP.COMMON_COURSES[term]:
        items.append((name, credit, "必修", "CR"))
    for name, _weekly, credit in AP.FOUNDATION[term].get(category, []):
        items.append((name, credit, "必修", "CR"))
    major_list = AP.MAJOR_COURSES.get((major, term), [])[:MAX_MAJOR_COURSES.get(term, 3)]
    for idx, (name, _weekly, credit) in enumerate(major_list):
        venue = "CR"
        # 工科/管理/经济/艺术/教育类：最后一门专业课安排进实验楼（实训/实验环节）
        if category in LAB_CATEGORIES and idx == len(major_list) - 1:
            venue = "LB"
        items.append((name, credit, "必修", venue))

    if term in TERMS_WITH_ELECTIVE:
        short = cls["major_short"]
        seed = sum((i + 1) * ord(ch) for i, ch in enumerate(short))
        elective = AP.ELECTIVE_POOL[(cls["seq"] + term + seed) % len(AP.ELECTIVE_POOL)]
        items.append((elective[0], elective[1], "选修", "CR"))

    courses = []
    for name, credit, ctype, venue in items:
        courses.append({
            "course": name,
            "weekly_sessions": min(sessions_from_credit(credit), AP.MAX_SESSIONS_PER_WEEK),
            "credit": credit,
            "course_type": ctype,
            "venue_pref": venue,
            "weeks": course_weeks(name, grade),
            "teacher": None,      # 稍后统一染色分配
        })
    return courses


# ============================================================
# 四、排课（班级时间模板）
# ============================================================

def assign_slots(courses: list[dict], rng: random.Random) -> dict[str, list[tuple[int, int]]] | None:
    """为一个班把每门课排进 (星期, 大节) 槽位。

    约束：
      · 同一班所有课占用互不相同的槽位 → 班级时间天然零冲突
      · 同一门课一天最多 2 大节（MAX_SESSIONS_PER_DAY）
      · 日期按「当日已有课程数」均衡挑选，避免一周的课全挤在周三四五
    失败返回 None（由调用方换随机序重试）。
    """
    all_slots = [(wd, p) for wd in AP.WEEKDAYS for p in range(1, 6)]
    free = set(all_slots)
    day_load = {wd: 0 for wd in AP.WEEKDAYS}      # 全班当日已排大节数
    result: dict[str, list[tuple[int, int]]] = {}

    # 大节数多的课优先；随机扰动避免所有班模板雷同
    order = sorted(courses, key=lambda c: (-c["weekly_sessions"], rng.random()))
    tiebreak = list(AP.WEEKDAYS)
    rng.shuffle(tiebreak)
    rank = {wd: i for i, wd in enumerate(tiebreak)}
    head = [1, 2, 3, 4]
    rng.shuffle(head)
    period_pref = head + [5]

    for course in order:
        cday = {wd: 0 for wd in AP.WEEKDAYS}      # 本课当日已排大节数
        need = course["weekly_sessions"]
        chosen: list[tuple[int, int]] = []
        for _ in range(AP.MAX_SESSIONS_PER_DAY * len(AP.WEEKDAYS) + 5):
            if need <= 0:
                break
            # 每次只落一个大节：优先「本课当日最少」→「全班当日负载最轻」
            days_sorted = sorted(AP.WEEKDAYS, key=lambda wd: (cday[wd], day_load[wd], rank[wd]))
            placed = False
            for wd in days_sorted:
                if cday[wd] >= AP.MAX_SESSIONS_PER_DAY:
                    continue
                for p in period_pref:
                    if (wd, p) in free:
                        free.discard((wd, p))
                        day_load[wd] += 1
                        cday[wd] += 1
                        chosen.append((wd, p))
                        need -= 1
                        placed = True
                        break
                if placed:
                    break
            if not placed:
                return None
        if need > 0:
            return None
        result[course["course"]] = sorted(chosen)
    return result


def schedule_class(courses: list[dict], rng: random.Random) -> dict[str, list[tuple[int, int]]]:
    for _ in range(400):
        got = assign_slots(courses, rng)
        if got:
            return got
    raise RuntimeError("排课失败：单班模板无法满足约束")


# ============================================================
# 五、教室分配（仅教学楼 CR / 实验楼 LB）
# ============================================================

def allocate_rooms(classes: list[dict], pools: dict) -> tuple[list[dict], dict]:
    """为每条课表记录分配具体教室。

    策略：同一门课尽量固定在同一间教室；若该槽位已被占用则改用其他空教室。
    以 (星期, 大节) 为粒度保证教室不冲突。
    """
    used_by_slot: dict[tuple[int, int], set[str]] = defaultdict(set)
    course_room: dict[tuple[str, str], str] = {}
    cursor = {"CR": 0, "LB": 0}
    rows: list[dict] = []
    seq = 0

    def pick(venue: str, slot: tuple[int, int], preferred: str | None) -> str:
        pool = pools[venue] if venue in pools else pools["CR"]
        if preferred and preferred not in used_by_slot[slot]:
            return preferred
        n = len(pool)
        start = cursor[venue]
        for i in range(n):
            room = pool[(start + i) % n]
            if room not in used_by_slot[slot]:
                cursor[venue] = (start + i + 1) % n
                return room
        raise RuntimeError(f"{venue} 教室容量不足")

    for cls in classes:
        for course in cls["courses"]:
            key = (cls["class_name"], course["course"])
            venue = course["venue_pref"]
            for slot in cls["slots"][course["course"]]:
                room = pick(venue, slot, course_room.get(key))
                course_room[key] = room
                used_by_slot[slot].add(room)
                seq += 1
                rows.append({
                    "id": f"S-{seq:05d}",
                    "class_name": cls["class_name"],
                    "grade": cls["grade"],
                    "major": cls["major"],
                    "course": course["course"],
                    "teacher": course["teacher"],
                    "weekday": slot[0],
                    "period": slot[1],
                    "weeks": course["weeks"],
                    "location": room,
                    "credit": course["credit"],
                    "course_type": course["course_type"],
                })
    return rows, course_room


# ============================================================
# 六、教师分配（按课程做贪心染色，保证同一教师同一时间不冲突）
# ============================================================

def assign_teachers(classes: list[dict], names: NamePool) -> dict[str, int]:
    """返回 {course: 使用教师数}；同时写入每班的 course['teacher']。"""
    by_course: dict[str, list[tuple[str, frozenset]]] = defaultdict(list)
    for cls in classes:
        for course in cls["courses"]:
            slots = frozenset(cls["slots"][course["course"]])
            by_course[course["course"]].append((cls["class_name"], slots, course))

    stats: dict[str, int] = {}
    for course_name, entries in by_course.items():
        entries = sorted(entries, key=lambda e: (-len(e[1]), e[0]))
        colors: list[set] = []
        for _, slots, course in entries:
            for i, cs in enumerate(colors):
                if not (cs & slots):
                    colors[i] = cs | set(slots)
                    course["teacher"] = i
                    break
            else:
                colors.append(set(slots))
                course["teacher"] = len(colors) - 1
        # 染色结果 → 真实姓名
        teacher_names = [names.next() for _ in colors]
        for _, _, course in entries:
            course["teacher"] = teacher_names[course["teacher"]]
        stats[course_name] = len(colors)
    return stats


# ============================================================
# 七、学生与宿舍
# ============================================================

def allocate_dorms(classes: list[dict], pools: dict, rng: random.Random) -> None:
    """按性别分宿舍：每间 6 人，整间同性别、同班级。"""
    gender_cursor = {"男": {"b": 0, "r": 0}, "女": {"b": 0, "r": 0}}
    room_usage: dict[str, int] = defaultdict(int)

    def next_room(gender: str) -> str:
        buildings = DORM_BUILDINGS_MALE if gender == "男" else DORM_BUILDINGS_FEMALE
        cur = gender_cursor[gender]
        while cur["b"] < len(buildings):
            b = buildings[cur["b"]]
            rooms = sorted(r for r in pools["DOR"] if r.startswith(b + "_"))
            idx = cur["r"]
            while idx < len(rooms):
                room = rooms[idx]
                if room_usage[room] < DORM_BEDS:
                    cur["r"] = idx
                    return room
                idx += 1
            cur["b"] += 1
            cur["r"] = 0
        raise RuntimeError(f"{gender}生宿舍容量不足")

    for cls in classes:
        ratio = MALE_RATIO.get(cls["category"], 0.5)
        males = round(cls["student_count"] * ratio)
        females = cls["student_count"] - males
        cls["gender_count"] = {"男": males, "女": females}
        cls["dorm_rooms"] = {"男": [], "女": []}
        cls["dorm_layout"] = {"男": [], "女": []}      # [(room, 本班人数)]
        for gender, count in (("男", males), ("女", females)):
            left = count
            while left > 0:
                room = next_room(gender)
                cur = gender_cursor[gender]
                if room not in cls["dorm_rooms"][gender]:
                    cls["dorm_rooms"][gender].append(room)
                take = min(DORM_BEDS - room_usage[room], left)
                room_usage[room] += take
                if cls["dorm_layout"][gender] and cls["dorm_layout"][gender][-1][0] == room:
                    cls["dorm_layout"][gender][-1] = (room, cls["dorm_layout"][gender][-1][1] + take)
                else:
                    cls["dorm_layout"][gender].append((room, take))
                if room_usage[room] >= DORM_BEDS:
                    cur["r"] += 1
                left -= take


def build_students(classes: list[dict], names: NamePool, rng: random.Random) -> list[dict]:
    students: list[dict] = []

    major_seq: dict[tuple[str, str], int] = {}
    for grade in ("2025级", "2026级"):
        key = "p2025" if grade == "2025级" else "p2026"
        i = 0
        for major, info in AP.MAJORS.items():
            if not info.get(key):
                continue
            i += 1
            major_seq[(grade, major)] = i

    for cls in classes:
        entrance = cls["entrance"][:4]
        mseq = major_seq[(cls["grade"], cls["major"])]
        cseq = cls["seq"]
        roster: list[dict] = []
        # 学号 = 入学年份 + 专业序号 + 班序 + 班内序号。
        # k 必须跨性别连续编号：曾经写在性别循环里，男 01 与女 01 撞出 2290 个重复学号。
        k = 0
        for gender in ("男", "女"):
            for room, take in cls["dorm_layout"][gender]:
                parts = room.split("_")
                for bed in range(1, take + 1):
                    k += 1
                    roster.append({
                        "student_id": f"{entrance}{mseq:02d}{cseq:02d}{k:02d}",
                        "name": names.next(),
                        "gender": gender,
                        "grade": cls["grade"],
                        "major": cls["major"],
                        "class_name": cls["class_name"],
                        "counselor": cls["counselor"],
                        "dorm_building": parts[0],
                        "dorm_floor": int(parts[2][1:]),
                        "dorm_room": int(parts[3]),
                        "dorm_room_code": room,
                        "bed": bed,
                        "phone": f"1{rng.choice('3578')}{rng.randrange(10 ** 9):09d}",
                        "home_phone": f"0{rng.choice('730734744')}-{rng.randrange(10 ** 6, 10 ** 7)}",
                        "hometown": rng.choice(HOMETOWNS),
                    })
        rng.shuffle(roster)          # 班内男女交错，更接近真实点名册
        students.extend(roster)
    return students


def assign_counselors(classes: list[dict], names: NamePool) -> None:
    """每个辅导员带 4 个班。"""
    per = 4
    current = None
    for i, cls in enumerate(classes):
        if i % per == 0:
            current = names.next() + "老师"
        cls["counselor"] = current


# ============================================================
# 八、校验
# ============================================================

def validate(classes: list[dict], rows: list[dict], students: list[dict], pools: dict) -> dict:
    checks: dict[str, str] = {}
    violations: list[str] = []

    # 1) 班级 × 周 × 星期 × 大节 唯一
    seen = defaultdict(int)
    for r in rows:
        for w in range(r["weeks"][0], r["weeks"][1] + 1):
            seen[(r["class_name"], w, r["weekday"], r["period"])] += 1
    dup = [k for k, v in seen.items() if v > 1]
    checks["班级时间无冲突"] = "PASS" if not dup else f"FAIL({len(dup)})"
    violations += [f"班级时间冲突 {d}" for d in dup[:5]]

    # 2) 教室 × 周 × 星期 × 大节 唯一
    seen_room = defaultdict(int)
    for r in rows:
        for w in range(r["weeks"][0], r["weeks"][1] + 1):
            seen_room[(r["location"], w, r["weekday"], r["period"])] += 1
    dup_room = [k for k, v in seen_room.items() if v > 1]
    checks["教室时间无冲突"] = "PASS" if not dup_room else f"FAIL({len(dup_room)})"
    violations += [f"教室时间冲突 {d}" for d in dup_room[:5]]

    # 3) 教师 × 周 × 星期 × 大节 唯一
    seen_teacher = defaultdict(int)
    for r in rows:
        for w in range(r["weeks"][0], r["weeks"][1] + 1):
            seen_teacher[(r["teacher"], w, r["weekday"], r["period"])] += 1
    dup_t = [k for k, v in seen_teacher.items() if v > 1]
    checks["教师时间无冲突"] = "PASS" if not dup_t else f"FAIL({len(dup_t)})"
    violations += [f"教师时间冲突 {d}" for d in dup_t[:5]]

    # 4) 一门课一天 ≤ 2 大节
    day_count = Counter((r["class_name"], r["course"], r["weekday"]) for r in rows)
    over_day = {k: v for k, v in day_count.items() if v > AP.MAX_SESSIONS_PER_DAY}
    checks["同班同课每日≤2大节"] = "PASS" if not over_day else f"FAIL({len(over_day)})"
    violations += [f"每日超限 {k}={v}" for k, v in list(over_day.items())[:5]]

    # 5) 一门课一周 ≤ 4 大节
    week_count = Counter((r["class_name"], r["course"]) for r in rows)
    over_week = {k: v for k, v in week_count.items() if v > AP.MAX_SESSIONS_PER_WEEK}
    checks["同班同课每周≤4大节"] = "PASS" if not over_week else f"FAIL({len(over_week)})"
    violations += [f"每周超限 {k}={v}" for k, v in list(over_week.items())[:5]]

    # 6) 周末不排课
    weekend = [r for r in rows if r["weekday"] not in AP.WEEKDAYS]
    checks["周末无排课"] = "PASS" if not weekend else f"FAIL({len(weekend)})"

    # 7) 连续周数（每门课的周次是连续闭区间）
    bad_weeks = [r for r in rows if not (isinstance(r["weeks"], list) and len(r["weeks"]) == 2
                                         and r["weeks"][0] <= r["weeks"][1])]
    checks["课程按连续周数安排"] = "PASS" if not bad_weeks else f"FAIL({len(bad_weeks)})"

    # 8) 只排教学楼/实验楼
    cr_lb = set(pools["CR"]) | set(pools["LB"])
    bad_venue = [r for r in rows if r["location"] not in cr_lb]
    checks["仅教学楼/实验楼排课"] = "PASS" if not bad_venue else f"FAIL({len(bad_venue)})"
    violations += [f"非法场地 {r['location']}" for r in bad_venue[:5]]

    # 9) 教室容量（每班人数 ≤ 60）
    over_seat = [c["class_name"] for c in classes if c["student_count"] > CLASSROOM_SEATS]
    checks["教室60座容得下"] = "PASS" if not over_seat else f"FAIL({len(over_seat)})"

    # 10) 宿舍 6 人 / 分性别 / 房间已建模
    per_room = Counter(s["dorm_room_code"] for s in students)
    bad_dorm = {k: v for k, v in per_room.items() if v > DORM_BEDS}
    checks["宿舍每间≤6人"] = "PASS" if not bad_dorm else f"FAIL({len(bad_dorm)})"
    gender_mix = defaultdict(set)
    for s in students:
        gender_mix[s["dorm_room_code"]].add(s["gender"])
    mixed = [k for k, v in gender_mix.items() if len(v) > 1]
    checks["宿舍分性别"] = "PASS" if not mixed else f"FAIL({len(mixed)})"
    unknown = [k for k in per_room if k not in set(pools["DOR"])]
    checks["宿舍房间已建模"] = "PASS" if not unknown else f"FAIL({len(unknown)})"

    # 11) 学生班级归属一致
    bad_link = [s["student_id"] for s in students
                if not any(s["class_name"] == c["class_name"] for c in classes)]
    checks["学生归属班级有效"] = "PASS" if not bad_link else f"FAIL({len(bad_link)})"

    # 12) 学号全校唯一（rag_students 的主键；重复会让教学库静默丢行）
    id_counter = Counter(s["student_id"] for s in students)
    dup_ids = {k: v for k, v in id_counter.items() if v > 1}
    checks["学号全校唯一"] = "PASS" if not dup_ids else f"FAIL({len(dup_ids)})"

    return {
        "generated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "semester": AP.SEMESTER["name"],
        "grades": {g: sum(c["student_count"] for c in classes if c["grade"] == g) for g in ("2025级", "2026级")},
        "classes": len(classes),
        "students": len(students),
        "schedule_rows": len(rows),
        "rooms_used": len({r["location"] for r in rows}),
        "dorm_rooms_used": len(per_room),
        "teachers": len({r["teacher"] for r in rows}),
        "courses": len({r["course"] for r in rows}),
        "violations": violations,
        "checks": checks,
        "all_pass": all(v == "PASS" for v in checks.values()),
    }


# ============================================================
# 主流程
# ============================================================

def main() -> None:
    rng = random.Random(SEED)
    names = NamePool(rng)
    RAG.mkdir(parents=True, exist_ok=True)

    layout, anchors = load_inputs()
    pools = build_room_pools(anchors)
    print(f"房间池：教学楼 {len(pools['CR'])} / 实验楼 {len(pools['LB'])} / 宿舍 {len(pools['DOR'])}")

    classes = build_classes()
    print(f"分班完成：{len(classes)} 个班，"
          f"{sum(c['student_count'] for c in classes)} 名学生")

    for cls in classes:
        cls["courses"] = build_courses(cls)
        cls["slots"] = schedule_class(cls["courses"], rng)
    print("排课完成：班级时间模板已生成")

    teacher_stats = assign_teachers(classes, names)
    print(f"教师分配完成：{len(teacher_stats)} 门课，"
          f"{sum(teacher_stats.values())} 位任课教师（同一教师同一时间不冲突）")

    allocate_dorms(classes, pools, rng)
    assign_counselors(classes, names)
    students = build_students(classes, names, rng)
    print(f"学生与宿舍分配完成：{len(students)} 人")

    rows, course_room = allocate_rooms(classes, pools)
    print(f"教室分配完成：{len(rows)} 条课表记录，"
          f"使用教室 {len({r['location'] for r in rows})} 间")

    result = validate(classes, rows, students, pools)
    print(json.dumps({k: v for k, v in result.items() if k != 'violations'},
                     ensure_ascii=False, indent=2))
    if result["violations"]:
        print("违规样例：", result["violations"][:10])

    # ---------- 写出 ----------
    (RAG / "students.json").write_text(
        json.dumps(students, ensure_ascii=False, indent=1), encoding="utf-8")
    (RAG / "schedule.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")

    grade_meta = {}
    for grade in ("2025级", "2026级"):
        g = AP.GRADES[grade]
        gclasses = [c["class_name"] for c in classes if c["grade"] == grade]
        grade_meta[grade] = {
            "label": g["label"], "term": g["term"], "term_name": g["term_name"],
            "entrance": g["entrance"],
            "teaching_weeks": list(AP.GRADE_TEACHING_WEEKS[grade]),
            "class_count": len(gclasses),
            "student_count": sum(c["student_count"] for c in classes if c["grade"] == grade),
            "classes": gclasses,
        }

    majors_meta = {}
    for major, info in AP.MAJORS.items():
        item = {
            "college": info["college"], "category": info["category"], "code": info["code"],
            "short": AP.MAJOR_SHORT[major],
            "p2025": info.get("p2025"), "p2026": info.get("p2026"),
            "estimated_2026": bool(info.get("p2026_estimated")),
            "classes": {g: [c["class_name"] for c in classes
                            if c["major"] == major and c["grade"] == g] for g in ("2025级", "2026级")},
        }
        majors_meta[major] = item

    by_class = {}
    for cls in classes:
        rooms_used = sorted({course_room[(cls["class_name"], c["course"])] for c in cls["courses"]})
        by_class[cls["class_name"]] = {
            "class_name": cls["class_name"],
            "grade": cls["grade"], "grade_label": cls["grade_label"],
            "term": cls["term"], "term_name": cls["term_name"],
            "major": cls["major"], "major_short": cls["major_short"],
            "college": cls["college"], "category": cls["category"],
            "counselor": cls["counselor"],
            "student_count": cls["student_count"],
            "gender_count": cls["gender_count"],
            "teaching_weeks": list(AP.GRADE_TEACHING_WEEKS[cls["grade"]]),
            "courses": [dict(c, slots=cls["slots"][c["course"]]) for c in cls["courses"]],
            "total_credits": round(sum(c["credit"] for c in cls["courses"]), 1),
            "weekly_sessions": sum(c["weekly_sessions"] for c in cls["courses"]),
            "classrooms": rooms_used,
            "dorm": {
                "building_male": sorted({r.split("_")[0] for r in cls["dorm_rooms"]["男"]}),
                "building_female": sorted({r.split("_")[0] for r in cls["dorm_rooms"]["女"]}),
                "male_rooms": cls["dorm_rooms"]["男"],
                "female_rooms": cls["dorm_rooms"]["女"],
            },
        }

    training_plan = {
        "semester": {
            "name": AP.SEMESTER["name"], "start": AP.SEMESTER["start"],
            "weeks": AP.SEMESTER["weeks"], "teaching_weeks": AP.SEMESTER["teaching_weeks"],
            "exam_week": AP.SEMESTER["exam_week"], "national_day_split": AP.NATIONAL_DAY,
            "source": AP.SEMESTER["source"], "milestones": AP.SEMESTER["milestones"],
        },
        "grades": grade_meta,
        "majors": majors_meta,
        "class_list": [c["class_name"] for c in classes],
        "classes": by_class,
        "dorm_allocation": {c["class_name"]: by_class[c["class_name"]]["dorm"] for c in classes},
        "course_load_constraints": {
            "max_sessions_per_day": AP.MAX_SESSIONS_PER_DAY,
            "max_sessions_per_week": AP.MAX_SESSIONS_PER_WEEK,
            "weekdays": list(AP.WEEKDAYS),
            "weekend_free": True,
            "continuous_weeks": True,
            "schedulable_buildings": sorted({r["building_code"] for r in anchors["rooms"]
                                             if r["room_type"] in CP.SCHEDULABLE_TYPES}),
        },
        "summary": {
            "classes": len(classes), "students": len(students),
            "teachers": result["teachers"], "courses": result["courses"],
            "schedule_rows": len(rows), "rooms_used": result["rooms_used"],
        },
    }
    (RAG / "training_plan.json").write_text(
        json.dumps(training_plan, ensure_ascii=False, indent=1), encoding="utf-8")

    timetable = {
        "summer": {"label": "夏季作息（5月1日-9月30日）",
                   **{str(p): v["summer"] for p, v in AP.PERIODS.items()}},
        "winter": {"label": "冬季作息（10月1日-次年4月30日）",
                   **{str(p): v["winter"] for p, v in AP.PERIODS.items()}},
        "periods": {str(p): {"sections": v["sections"]} for p, v in AP.PERIODS.items()},
        "sections": AP.SECTION_TIMES,
        "semester": {
            "name": AP.SEMESTER["name"], "start": AP.SEMESTER["start"],
            "weeks": AP.SEMESTER["weeks"], "teaching_weeks": AP.SEMESTER["teaching_weeks"],
            "exam_week": AP.SEMESTER["exam_week"], "national_day_split": AP.NATIONAL_DAY,
            "grades": grade_meta, "milestones": AP.SEMESTER["milestones"],
        },
    }
    (RAG / "timetable.json").write_text(
        json.dumps(timetable, ensure_ascii=False, indent=1), encoding="utf-8")

    (RAG / "validation.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")

    print("\n数据已写出到 data/rag/")
    print("全部校验通过" if result["all_pass"] else "存在未通过项，请检查 violations")


if __name__ == "__main__":
    main()
