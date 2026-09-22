"""岳阳学院 · 楼栋房间网格（唯一数据源，纯 Python，无第三方依赖）

被两处消费：
1. `scripts/build_campus_data.py` —— 生成 data/room_anchors.json（不依赖 Blender）
2. `blender/generate_campus.py`    —— 同时生成 3D 房间网格与同一份 room_anchors.json

命名与编号规则（与既有 room_anchors.json 完全兼容）：
    room_code = {building_code}_CR_F{floor}_{number}
    number    = 101 + 列序 * 5 + 行序      → 每层 101~120

「4 列 5 行」定义（沿用本项目既有约定）：
    列 = 进深方向（Z）4 排；行 = 面宽方向（X）5 间；每层 20 间。
    旧规则为「2 列 5 行」= 每层 10 间，本次按要求扩容为 20 间。

只有教学楼（CR）与实验楼（LB）可排课；图书馆/宿舍/食堂等不参与排课。
"""

from __future__ import annotations

import math

# 每层房间网格：类型 → (层数, 列数(进深 Z), 行数(面宽 X))
ROOM_GRID = {
    "CR": (5, 4, 5),    # 教学楼：5 层 × 20 间 = 100 间
    "LB": (5, 4, 5),    # 实验楼：5 层 × 20 间 = 100 间
    "LIB": (9, 4, 5),   # 图书馆：地上 9 层（官方资料：地上 9 层、高 45m）
    "DOR": (6, 4, 5),   # 学生宿舍：6 层 × 20 间 = 120 间（每间 6 人）
    "OTH": (2, 4, 5),
    "GYM": (2, 4, 5),
    "CANT": (2, 4, 5),
}

FLOOR_HEIGHT = 4.2          # 层高（米），与官方「教学楼二~五层层高 4.2m」一致
ROOM_GAP = 0.2              # 房间盒之间的缝隙
FIRST_FLOOR_Y = 1.45        # 首层房间中心高度（保持与原实现一致）

# 可排课的建筑类型
SCHEDULABLE_TYPES = ("CR", "LB")


def room_numbers(cols: int, rows: int) -> list[tuple[int, int, int]]:
    """返回 [(列, 行, 房间号)]，房间号 = 101 + 列*5 + 行。"""
    return [(c, r, 101 + c * rows + r) for c in range(cols) for r in range(rows)]


def _arc_radii(w: float, d: float) -> tuple[float, float]:
    outer = max(w * 0.5, d * 1.2)
    inner = max(outer - d, outer * 0.32)
    return outer, inner


def is_arc(shape: str) -> bool:
    return shape in ("arc", "arc_mirror")


def build_rooms(building: dict) -> list[dict]:
    """按楼栋规格生成该楼全部房间锚点。

    building: campus_layout.json 里的一条建筑记录。
    返回：room_anchors.json 的 rooms 数组元素（不含坐标系统包装）。
    """
    code = building["id"]
    name = building["name"]
    kind = building.get("type", "OTH")
    shape = building.get("shape", "rect")
    x, z = building["x"], building["z"]
    w, d = building["w"], building["d"]
    floors, cols, rows = ROOM_GRID.get(kind, (2, 4, 5))
    rooms: list[dict] = []

    if is_arc(shape):
        outer, inner = _arc_radii(w, d)
        band = (outer - inner) / cols
        for floor in range(floors):
            for col in range(cols):
                radius = inner + band * (col + 0.5)
                for row in range(rows):
                    angle = math.pi * (row + 0.5) / rows
                    # arc 凸向 +Z（开口朝南）；arc_mirror 关于建筑中心镜像，凸向 -Z
                    sign = 1.0 if shape == "arc" else -1.0
                    rx = x + radius * math.cos(angle)
                    rz = z + sign * radius * math.sin(angle)
                    # 房间朝向：切向布置
                    tangent = math.atan2(sign * radius * math.cos(angle), -radius * math.sin(angle))
                    rooms.append(_room(code, name, kind, floor, col, row, rx, rz,
                                       band * 0.9, 7.0, [0.0, round(-tangent, 4), 0.0]))
        return rooms

    # 矩形 / 回字形 / 塔楼：规则网格
    usable_w = max(4.0, w - 2.0)
    usable_d = max(4.0, d - 2.0)
    room_w = usable_w / rows
    room_d = usable_d / cols
    for floor in range(floors):
        for col in range(cols):
            rz = z - usable_d / 2 + room_d * (col + 0.5)
            for row in range(rows):
                rx = x - usable_w / 2 + room_w * (row + 0.5)
                rooms.append(_room(code, name, kind, floor, col, row, rx, rz,
                                   room_w - ROOM_GAP, room_d - ROOM_GAP, [0, 0, 0]))
    return rooms


def _room(code: str, name: str, kind: str, floor: int, col: int, row: int,
          rx: float, rz: float, rw: float, rd: float, orientation: list[float]) -> dict:
    number = 101 + col * 5 + row
    y = floor * FLOOR_HEIGHT + FIRST_FLOOR_Y
    return {
        "room_code": f"{code}_CR_F{floor + 1}_{number}",
        "semantic_name": f"{name}·{floor + 1}层{number}室",
        "anchor_world": [round(rx, 2), round(y, 2), round(rz, 2)],
        "bbox_min": [round(rx - rw / 2, 2), round(floor * FLOOR_HEIGHT - 0.05, 2), round(rz - rd / 2, 2)],
        "bbox_max": [round(rx + rw / 2, 2), round(floor * FLOOR_HEIGHT + FLOOR_HEIGHT - 1.25, 2), round(rz + rd / 2, 2)],
        "orientation": orientation,
        "building_code": code,
        "floor": floor + 1,
        "room_type": kind,
        "college_code": "YY",
        "room_size": [round(rw, 2), round(rd, 2)],
    }


def building_room_count(kind: str) -> int:
    floors, cols, rows = ROOM_GRID.get(kind, (2, 4, 5))
    return floors * cols * rows


def floor_count(kind: str) -> int:
    return ROOM_GRID.get(kind, (2, 4, 5))[0]
