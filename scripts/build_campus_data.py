"""岳阳学院 · 校园建筑与房间数据重建

按需求顺序执行第 1、2 步：
  第 1 步  修正建筑命名、补齐缺失建筑
  第 2 步  教学楼/实验楼改为 5 层，每层由 2 列 5 行(10 间) 改为 4 列 5 行(20 间)

输出：
  data/campus_layout.json   建筑名录（改名 / 新增 / 层数层高修正）
  data/room_anchors.json    全部房间锚点（供 3D 高亮、点击、排课使用）

运行：python scripts/build_campus_data.py
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import campus_program as CP  # noqa: E402

DATA = ROOT / "data"
LAYOUT_PATH = DATA / "campus_layout.json"
ANCHORS_PATH = DATA / "room_anchors.json"

# ============================================================
# 建筑名录修正表
#   依据：岳阳学院项目（一期）工程名录 ——
#   1#图书馆；2#、3#教学楼；4#实验综合楼；5#、6#实验楼；7#实训实习楼；
#   8#会堂；9#综合服务楼；10#风雨操场；11#食堂和活动中心；12#~17#宿舍楼；
#   18#主大门；19#、20#门卫；22#、23#垃圾站；24#看台及地下车库
# ============================================================
# id → 覆盖字段
OVERRIDES = {
    # —— 命名修正 ——
    # 原「4#实验综合楼」实为校园中心地上 9 层、高 45m 的标志性建筑，即图书馆
    "B05": {"name": "1#图书馆", "type": "LIB", "h": 45, "floors": 9,
            "color": "#c9d2d4", "accent": "#5f8998", "shape": "tower", "region": "central_axis"},
    # 原「1#图书馆」实为北侧文化核心的半圆形教学综合楼
    "B06": {"name": "2#教学综合楼", "type": "CR", "h": 21.9, "floors": 5,
            "color": "#e7e2d7", "accent": "#d29c45", "shape": "arc", "region": "cultural_core"},

    # —— 教学楼 / 实验楼：统一 5 层、层高 4.2m、占地放大以容纳 4 列 5 行 ——
    "B01": {"w": 46, "d": 30, "h": 21.9, "floors": 5},
    "B02": {"w": 46, "d": 30, "h": 21.9, "floors": 5},
    "B03": {"w": 46, "d": 30, "h": 21.9, "floors": 5},
    "B04": {"w": 46, "d": 30, "h": 21.9, "floors": 5},
    "B18": {"w": 46, "d": 30, "h": 21.9, "floors": 5},

    # —— B07（9#综合服务楼）/ B17（7#实训实习楼A）/ B10（24#看台及地下车库）
    #    / B23（4#实验综合楼）已按规划要求拆除 ——
    # 四栋楼从 campus_layout.json 中移除，路网与排课数据随之重建。

    # —— 西片区布局定稿（2026-09-21 第四轮，用户确认）：
    #    8#会堂南移到 (-156,66)，与 11#食堂(-156,22) 同一南北轴线、正对食堂北侧；
    #    17#学生宿舍移到 (-156,135)，在会堂正后方、与 7#实训B(-210,135) 同一东西线。
    #    显式写坐标保证幂等（覆盖上一版的 -154,98 / -98,98）——
    "B08": {"x": -156, "z": 66},

    # —— 宿舍楼：统一 6 层（每间 6 人）；B16 同时带轴线移动坐标
    "B11": {"floors": 6, "h": 25}, "B12": {"floors": 6, "h": 25},
    "B13": {"floors": 6, "h": 25}, "B14": {"floors": 6, "h": 25},
    "B15": {"floors": 6, "h": 25},
    "B16": {"floors": 6, "h": 25, "x": -156, "z": 135},
    "B19": {"floors": 6, "h": 25}, "B20": {"floors": 6, "h": 25},
}

# 新增建筑（按需求补齐）
NEW_BUILDINGS = [
    # 1#教学综合楼：与 2#教学综合楼同心镜像，两栋合起来是一个完整圆环
    {"id": "B22", "name": "1#教学综合楼", "type": "CR", "region": "cultural_core",
     "x": 0, "z": 70, "w": 95, "d": 31, "h": 21.9, "floors": 5,
     "color": "#e2ddd2", "accent": "#c8923f", "shape": "arc_mirror"},
    # 4#实验综合楼（B23）与 24#看台及地下车库（B10）已按规划要求拆除，
    # 不再作为新增建筑补回。
    # 新增学生宿舍（按在校生规模扩容；每间 6 人）
    {"id": "B24", "name": "25#学生宿舍", "type": "DOR", "region": "academic_east",
     "x": 118, "z": -25, "w": 40, "d": 26, "h": 25, "floors": 6,
     "color": "#d9dedc", "accent": "#6f9eae", "shape": "rect"},
    {"id": "B25", "name": "26#学生宿舍", "type": "DOR", "region": "academic_east",
     "x": 182, "z": -25, "w": 40, "d": 26, "h": 25, "floors": 6,
     "color": "#d6dcdb", "accent": "#6f9eae", "shape": "rect"},
    {"id": "B26", "name": "27#学生宿舍", "type": "DOR", "region": "academic_east",
     "x": 127, "z": -140, "w": 40, "d": 26, "h": 25, "floors": 6,
     "color": "#d0d9d9", "accent": "#7caab7", "shape": "rect"},
    {"id": "B27", "name": "28#学生宿舍", "type": "DOR", "region": "academic_east",
     "x": 187, "z": -140, "w": 40, "d": 26, "h": 25, "floors": 6,
     "color": "#cfd9d8", "accent": "#80b696", "shape": "rect"},
]


def footprint(b: dict) -> tuple[float, float, float, float]:
    """返回 (xmin, xmax, zmin, zmax)。弧形楼按外接圆计。"""
    if CP.is_arc(b.get("shape", "rect")):
        outer, _ = CP._arc_radii(b["w"], b["d"])
        return b["x"] - outer, b["x"] + outer, b["z"] - outer, b["z"] + outer
    return b["x"] - b["w"] / 2, b["x"] + b["w"] / 2, b["z"] - b["d"] / 2, b["z"] + b["d"] / 2


def check_overlaps(buildings: list[dict]) -> list[str]:
    """检查建筑外接矩形是否互相压叠（仅提示，不阻断）。"""
    issues = []
    for i in range(len(buildings)):
        for j in range(i + 1, len(buildings)):
            a, b = buildings[i], buildings[j]
            ax0, ax1, az0, az1 = footprint(a)
            bx0, bx1, bz0, bz1 = footprint(b)
            if ax0 < bx1 and bx0 < ax1 and az0 < bz1 and bz0 < az1:
                ox = min(ax1, bx1) - max(ax0, bx0)
                oz = min(az1, bz1) - max(az0, bz0)
                issues.append(f"{a['id']}({a['name']}) 与 {b['id']}({b['name']}) 压叠 "
                              f"{ox:.1f}m × {oz:.1f}m")
    return issues


def main() -> None:
    layout = json.loads(LAYOUT_PATH.read_text(encoding="utf-8"))
    by_id = {b["id"]: b for b in layout["buildings"]}

    # 1) 应用覆盖字段
    for bid, patch in OVERRIDES.items():
        if bid in by_id:
            by_id[bid].update(patch)

    # 2) 追加新增建筑
    for spec in NEW_BUILDINGS:
        if spec["id"] not in by_id:
            layout["buildings"].append(spec)
            by_id[spec["id"]] = spec

    # 3) 让 floors 与房间网格保持一致
    for b in layout["buildings"]:
        b["floors"] = CP.floor_count(b.get("type", "OTH"))
        b["floor_height"] = CP.FLOOR_HEIGHT

    layout["building_program_source"] = (
        "岳阳学院项目（一期）工程名录；命名修正依据：校园中心地上9层/高45m标志性建筑为1#图书馆，"
        "北侧半圆形单体为2#教学综合楼，其同心镜像单体为1#教学综合楼。"
    )
    layout["modeling_revision"] = {
        "date": "2026-09-20",
        "classrooms": "教学楼/实验楼统一 5 层，每层由 2 列 5 行(10 间) 改为 4 列 5 行(20 间)",
        "room_numbering": "每层 101~120（101 + 列序*5 + 行序）",
        "schedulable": "仅教学楼(CR)与实验楼(LB)可排课",
    }

    # 4) 生成房间锚点
    rooms: list[dict] = []
    for b in layout["buildings"]:
        rooms.extend(CP.build_rooms(b))

    # 房间码唯一性
    codes = [r["room_code"] for r in rooms]
    dup = {c for c in codes if codes.count(c) > 1}
    assert not dup, f"房间码重复: {sorted(dup)[:5]}"

    # 可排课房间数
    schedulable = [r for r in rooms if r["room_type"] in CP.SCHEDULABLE_TYPES]
    dorms = [r for r in rooms if r["room_type"] == "DOR"]

    anchors = {
        "coordinate_system": {"unit": "meter", "up_axis": "Y", "origin": "campus_geographic_center"},
        "grid_spec": {
            "rooms_per_floor": 20,
            "layout": "4 列(进深 Z) × 5 行(面宽 X)",
            "numbering": "101 + 列序*5 + 行序",
            "floor_height_m": CP.FLOOR_HEIGHT,
        },
        "rooms": rooms,
    }

    LAYOUT_PATH.write_text(json.dumps(layout, ensure_ascii=False, indent=2), encoding="utf-8")
    ANCHORS_PATH.write_text(json.dumps(anchors, ensure_ascii=False, indent=2), encoding="utf-8")

    issues = check_overlaps(layout["buildings"])
    report = {
        "buildings": len(layout["buildings"]),
        "rooms_total": len(rooms),
        "rooms_schedulable": len(schedulable),
        "rooms_dorm": len(dorms),
        "dorm_beds": len(dorms) * 6,
        "schedulable_buildings": sorted({r["building_code"] for r in schedulable}),
        "overlap_warnings": issues,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
