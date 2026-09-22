// 用户可见「建筑标号」统一工具。
// 项目里有两套编号：内部 B 码（B01/B12…，数据库与 room_code 主键）和校园真实楼号
// （2#教学楼 / 13#学生宿舍…）。3D 模型、面板、问答展示一律用真实楼号；内部键值不动。
import campusLayout from "../data/campus_layout.json";
import roomAnchors from "../data/room_anchors.json";

const BUILDING_BY_ID = new Map(
  (campusLayout.buildings || []).map((building) => [building.id, building]),
);
const ROOM_BY_CODE = new Map(
  (roomAnchors.rooms || []).map((room) => [room.room_code, room]),
);

// 从建筑名称提取真实楼号：/(\d+)#/ → "N#"；无编号宿舍取末尾 A/B；都没有退回内部码数字。
export function badgeOfName(name, fallbackId) {
  const numbered = /(\d+)#/.exec(name || "");
  if (numbered) return `${numbered[1]}#`;
  const lettered = /\s([A-Z])$/.exec(name || "");
  if (lettered) return lettered[1];
  return (fallbackId || "").replace("B", "");
}

// 建筑对象（{id, name}）→ 真实楼号，如 "13#"、"A"。
export function campusBadgeOf(building) {
  return badgeOfName(building?.name, building?.id);
}

// 内部 B 码 → 真实楼号（查布局名），查不到返回原码。如 "B12" → "13#"、"B19" → "A"。
export function buildingBadge(code) {
  const building = BUILDING_BY_ID.get(code);
  if (!building) return code;
  return campusBadgeOf(building);
}

// 房间码 → 语义名（含真实楼号），如 "B12_CR_F2_113" → "13#学生宿舍·2层113室"；查不到返回原码。
export function roomFriendly(code) {
  const room = ROOM_BY_CODE.get(code);
  return room?.semantic_name || code;
}

// 楼名牌偏移：同心/重叠建筑（如 B06+B22 组成圆环）共用中心点，
// 悬浮牌与屋顶标号会叠在一起，用户会读错楼。布局里给这类楼配 label_offset 拉开到各自半环上方。
export function labelOffsetOf(building) {
  return Array.isArray(building?.label_offset) ? building.label_offset : [0, 0];
}
