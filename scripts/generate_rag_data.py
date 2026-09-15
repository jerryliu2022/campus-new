"""
生成独立 RAG 问答系统的演示数据（data/rag/*.json）
- 6 个班级（计科1班~计科6班），2025 年秋季入学，当前大二上学期（2026-2027-1）
- 每班 60 名学生 = 360 人；每间宿舍 6 人；每班 10 间宿舍（对应宿舍楼 B11~B16）
- 培养方案：必修课全班一致 + 每班 2 门不同选修课（学分一致）
- 大二上学期课表：逐班排课，保证 班级/教师/教室 三重不冲突
- 作息：夏季作息（10月1日前）/ 冬季作息（国庆后）
- 所有宿舍房间码必须在 room_anchors.json 中真实存在
运行：python scripts/generate_rag_data.py
"""
from __future__ import annotations

import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "rag"
ROOMS = {r["room_code"]: r for r in json.loads((ROOT / "data" / "room_anchors.json").read_text(encoding="utf-8"))["rooms"]}

random.seed(20250901)

CLASSES = [f"计科{i}班" for i in range(1, 7)]
DORM_BUILDINGS = {f"计科{i}班": f"B1{i}" for i in range(1, 7)}  # 班 → 宿舍楼
COUNSELORS = [
    {"name": "刘敏", "classes": ["计科1班", "计科2班", "计科3班"], "phone": "13707300001"},
    {"name": "王建国", "classes": ["计科4班", "计科5班", "计科6班"], "phone": "13707300002"},
]
SEMESTER = {
    "name": "2026-2027学年第一学期",
    "start": "2026-09-07",  # 第 1 周周一
    "weeks": 16,
    "grade": "2025级",
    "term": "大二上学期（第 3 学期）",
    "entrance": "2025年秋季入学",
    "national_day_split": "2026-10-01",
}
# 作息：夏季（国庆前）/ 冬季（国庆后）。上午一致，下午与晚间错开 30 分钟。
TIMETABLE = {
    "summer": {
        "label": "夏季作息（10月1日前执行）",
        1: ["08:00", "09:40"], 2: ["10:20", "12:00"],
        3: ["14:30", "16:10"], 4: ["16:30", "18:10"],
        5: ["19:30", "21:10"],
    },
    "winter": {
        "label": "冬季作息（国庆节后执行）",
        1: ["08:00", "09:40"], 2: ["10:20", "12:00"],
        3: ["14:00", "15:40"], 4: ["16:00", "17:40"],
        5: ["19:00", "20:40"],
    },
}

# 培养方案（计算机科学与技术 2025 级 · 大二上）
REQUIRED_COURSES = [  # (课程, 学分, 教师, 每周节数, 场地类型)
    ("数据结构", 4, "周启明", 2, "room"),
    ("计算机组成原理", 4, "吴子昂", 2, "room"),
    ("离散数学", 3, "陈若愚", 2, "room"),
    ("概率论与数理统计", 3, "林慕清", 2, "room"),
    ("数据库原理", 3, "韩雪", 2, "room"),
    ("大学英语IV", 2, "沈悦", 2, "room"),
    ("体育IV", 1, "李劲松", 1, "sports"),
    ("形势与政策", 1, "秦岚", 1, "room"),
]
ELECTIVE_POOL = [  # 每门 2 学分
    ("人工智能导论", "许志远"),
    ("Web前端开发", "苏婉"),
    ("Python数据分析", "程立"),
    ("移动应用开发", "孟子航"),
    ("网络安全导论", "欧阳振峰"),
    ("软件测试基础", "唐笑笑"),
]
ELECTIVE_PLAN = {  # 每班 2 门，班间组合部分不同
    "计科1班": ["人工智能导论", "Web前端开发"],
    "计科2班": ["Python数据分析", "移动应用开发"],
    "计科3班": ["网络安全导论", "软件测试基础"],
    "计科4班": ["人工智能导论", "Python数据分析"],
    "计科5班": ["Web前端开发", "移动应用开发"],
    "计科6班": ["网络安全导论", "人工智能导论"],
}

# 教室池：教学楼 CR 房间（来自 room_anchors.json，真实锚点）
VENUE_POOL = sorted(
    code for code, r in ROOMS.items()
    if r["building_code"] in ("B01", "B02", "B04", "B06") and r["room_type"] == "CR"
)

SURNAMES = list("王李张刘陈杨赵黄周吴徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏")
GIVEN_M = ["宇轩", "浩然", "子墨", "俊杰", "博文", "泽铭", "晨曦", "睿哲", "嘉树", "明睿", "志远", "文博", "思源", "正阳", "鸿飞", "景行", "云帆", "知行", "景琰", "望舒", "天佑", "俊驰", "雨泽", "烨磊", "伟祺", "荣轩", "昊然", "修杰", "黎昕", "子骞"]
GIVEN_F = ["雨婷", "诗涵", "梦琪", "欣怡", "书瑶", "静姝", "雅楠", "紫萱", "芷若", "清扬", "婉如", "若汐", "语汐", "悦宁", "含玉", "初晴", "映真", "南乔", "知夏", "疏影", "雅彤", "思思", "念慈", "芸熙", "若萱", "晓萱", "语嫣", "清欢", "佳琪", "慕晴"]
HOMETOWNS = ["湖南岳阳", "湖南长沙", "湖南株洲", "湖南衡阳", "湖南常德", "湖南益阳", "湖南郴州", "湖北武汉", "江西南昌", "广东广州", "广西桂林", "贵州贵阳", "四川成都", "重庆渝中", "河南郑州", "河北石家庄"]


def gen_students() -> list[dict]:
    names: set[str] = set()
    students: list[dict] = []
    per_class = 60
    for ci, cls in enumerate(CLASSES):
        # 每班 60 人，强制 30 男 30 女，保证宿舍分配整齐
        genders = ["男"] * 30 + ["女"] * 30
        random.shuffle(genders)
        # 学号：2025 + 班序(61~66) + 序号
        for i in range(per_class):
            gender = genders[i]
            pool = GIVEN_M if gender == "男" else GIVEN_F
            while True:
                name = random.choice(SURNAMES) + random.choice(pool)
                if name not in names:
                    names.add(name)
                    break
            students.append({
                "student_id": f"2025{61 + ci:02d}{i + 1:03d}",
                "name": name,
                "gender": gender,
                "class_name": cls,
                "counselor": next(c["name"] for c in COUNSELORS if cls in c["classes"]),
            })
    return students


def assign_dorms(students: list[dict]) -> None:
    """每班一栋宿舍楼（B11~B16），F1 层 101~105 男生（5间×6床），F2 层 101~105 女生（5间×6床）"""
    by_class: dict[str, list[dict]] = {}
    for s in students:
        by_class.setdefault(s["class_name"], []).append(s)
    for cls, group in by_class.items():
        building = DORM_BUILDINGS[cls]
        males = [s for s in group if s["gender"] == "男"]
        females = [s for s in group if s["gender"] == "女"]
        for floor, batch, gender in ((1, males, "男"), (2, females, "女")):
            batch.sort(key=lambda s: s["student_id"])
            for idx, student in enumerate(batch):
                room_no = 101 + idx // 6
                bed = idx % 6 + 1
                room_code = f"{building}_CR_F{floor}_{room_no:03d}"
                assert room_code in ROOMS, f"宿舍房间码不存在: {room_code}"
                student["dorm_building"] = building
                student["dorm_floor"] = floor
                student["dorm_room"] = room_no
                student["dorm_room_code"] = room_code
                student["bed"] = bed
                student["phone"] = f"13{random.randint(0, 9)}{random.randint(10**7, 10**8 - 1)}"
                student["home_phone"] = f"0730-8{random.randint(10**5, 10**6 - 1)}"
                student["hometown"] = random.choice(HOMETOWNS)


def build_schedule() -> list[dict]:
    venue_busy: set[tuple] = set()   # (room_code, weekday, period)
    teacher_busy: set[tuple] = set() # (teacher, weekday, period)
    class_busy: set[tuple] = set()   # (class, weekday, period)
    rows: list[dict] = []
    electives_teachers = {name: teacher for name, teacher in ELECTIVE_POOL}

    for cls in CLASSES:
        courses = [(c, cr, t, n, kind) for (c, cr, t, n, kind) in REQUIRED_COURSES]
        for elective in ELECTIVE_PLAN[cls]:
            teacher = electives_teachers[elective]
            courses.append((elective, 2, teacher, 1, "room"))
        # 体育课（仅限第3/4大节）优先排，避免被随机课程占满槽位
        courses.sort(key=lambda c: 0 if c[4] == "sports" else 1)
        for course, credit, teacher, sessions, kind in courses:
            placed = 0
            guard = 0
            while placed < sessions:
                guard += 1
                assert guard < 5000, f"排课失败: {cls} {course}"
                weekday = random.randint(1, 5)
                period = random.randint(1, 4) if course != "体育IV" else random.choice((3, 4))
                if (cls, weekday, period) in class_busy:
                    continue
                if (teacher, weekday, period) in teacher_busy:
                    continue
                if kind == "sports":
                    venue = "POI:sportsEast"
                    if (venue, weekday, period) in venue_busy:
                        continue
                else:
                    candidates = [v for v in VENUE_POOL if (v, weekday, period) not in venue_busy]
                    if not candidates:
                        continue
                    venue = random.choice(candidates)
                # 提交
                class_busy.add((cls, weekday, period))
                teacher_busy.add((teacher, weekday, period))
                venue_busy.add((venue, weekday, period))
                placed += 1
                rows.append({
                    "id": f"S-{len(rows) + 1:03d}",
                    "class_name": cls,
                    "course": course,
                    "teacher": teacher,
                    "weekday": weekday,
                    "period": period,
                    "location": venue,
                    "credit": credit,
                    "course_type": "必修" if (course, credit, teacher, sessions, kind) in REQUIRED_COURSES else "选修",
                })
    return rows


def main() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    students = gen_students()
    assign_dorms(students)

    # 冲突校验
    violations = []
    seen_slot = {}
    rooms = json.loads((DATA.parent / "room_anchors.json").read_text(encoding="utf-8"))["rooms"]
    dorm_room_codes = {s["dorm_room_code"] for s in students}
    missing = dorm_room_codes - {r["room_code"] for r in rooms}
    if missing:
        violations.append(f"宿舍房间码未建模: {sorted(missing)[:5]}")
    schedule = build_schedule()
    for row in schedule:
        key = (row["class_name"], row["weekday"], row["period"])
        if key in seen_slot:
            violations.append(f"班级时间冲突: {key}")
        seen_slot[key] = row["id"]
    pair = {}
    for row in schedule:
        key = (row["teacher"], row["weekday"], row["period"])
        if key in pair:
            violations.append(f"教师时间冲突: {key} {pair[key]} vs {row['id']}")
        pair[key] = row["id"]
    venue = {}
    for row in schedule:
        if row["location"].startswith("POI:"):
            continue
        key = (row["location"], row["weekday"], row["period"])
        if key in venue:
            violations.append(f"教室时间冲突: {key} {venue[key]} vs {row['id']}")
        venue[key] = row["id"]
    dorm_capacity: dict[str, int] = {}
    for s in students:
        dorm_capacity[s["dorm_room_code"]] = dorm_capacity.get(s["dorm_room_code"], 0) + 1
    over = {k: v for k, v in dorm_capacity.items() if v > 6}
    if over:
        violations.append(f"宿舍超员: {over}")
    mixed = []
    grouped: dict[str, list[dict]] = {}
    for s in students:
        grouped.setdefault(s["dorm_room_code"], []).append(s)
    for room, group in grouped.items():
        if len({g["gender"] for g in group}) > 1:
            mixed.append(room)
    if mixed:
        violations.append(f"宿舍男女混住: {mixed[:5]}")

    # 每班宿舍楼分布：10 间 × 6 人
    plan = {
        "major": "计算机科学与技术（2025级）",
        "term": SEMESTER,
        "required": [{"course": c, "credit": cr, "teacher": t, "weekly_sessions": n, "venue": {"room": "教学楼教室", "sports": "田径场"}[k]} for c, cr, t, n, k in REQUIRED_COURSES],
        "elective_pool": [{"course": c, "credit": 2, "teacher": t} for c, t in ELECTIVE_POOL],
        "elective_plan": ELECTIVE_PLAN,
        "total_credits_per_class": sum(c for _, c, _, _, _ in REQUIRED_COURSES) + 4,
        "counselors": COUNSELORS,
        "dorm_allocation": {
            cls: {
                "building": DORM_BUILDINGS[cls],
                "rooms": sorted({s["dorm_room_code"] for s in students if s["class_name"] == cls}),
            }
            for cls in CLASSES
        },
    }
    timetable_rows = [
        {"regime": regime, "label": data["label"], **{f"P{p}": f"{data[p][0]}-{data[p][1]}" for p in data if isinstance(p, int)}}
        for regime, data in TIMETABLE.items()
    ]
    validation = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "students": len(students),
        "classes": len(CLASSES),
        "dorm_rooms": len(dorm_room_codes),
        "schedule_rows": len(schedule),
        "violations": violations,
        "checks": {
            "班级大节唯一": "PASS" if not any("班级" in v for v in violations) else "FAIL",
            "教师大节唯一": "PASS" if not any("教师" in v for v in violations) else "FAIL",
            "教室大节唯一": "PASS" if not any("教室" in v for v in violations) else "FAIL",
            "宿舍容量≤6": "PASS" if not over else "FAIL",
            "宿舍分性别": "PASS" if not mixed else "FAIL",
            "宿舍房间已建模": "PASS" if not missing else "FAIL",
        },
    }

    (DATA / "students.json").write_text(json.dumps(students, ensure_ascii=False, indent=1), encoding="utf-8")
    (DATA / "schedule.json").write_text(json.dumps(schedule, ensure_ascii=False, indent=1), encoding="utf-8")
    (DATA / "timetable.json").write_text(json.dumps({"summer": TIMETABLE["summer"], "winter": TIMETABLE["winter"], "semester": SEMESTER}, ensure_ascii=False, indent=1), encoding="utf-8")
    (DATA / "training_plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=1), encoding="utf-8")
    (DATA / "validation.json").write_text(json.dumps(validation, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(validation, ensure_ascii=False, indent=1))


import time  # noqa: E402

if __name__ == "__main__":
    main()
