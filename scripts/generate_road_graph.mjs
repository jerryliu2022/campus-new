import fs from 'node:fs';

/**
 * 岳阳学院 · 校园矩形路网生成器（2026-09 重构版）
 *
 * 设计原则（对应需求）：
 * 1. 删除 B07（9#综合服务楼）/ B17（7#实训实习楼A）后重新布网；
 * 2. 路网全部由横平竖直的街道段组成（尽量成矩形网格），不再用 A* 网格绕障，
 *    从源头保证「路径由路网线段连接而成、绝不跨越障碍物」；
 * 3. 距离较近的平行路一律合并：相邻建筑行共享一条街道（前楼的后街 = 后楼的前街）；
 * 4. 每栋楼前、后各有一条街道，门到街用一段垂直引入路（spur）连到楼下；
 * 5. 节点显式确定：街道交点 + 街道端点 + 门牌投影点 + POI，全部落在 data/road_graph.json。
 *
 * 生成算法：
 *   streets(轴对齐线段) → 求交点/插入点名 → 切分成边 → 每栋楼前后门各接 spur → 校验无穿楼。
 */

const layoutUrl = new URL('../data/campus_layout.json', import.meta.url);
const outputUrl = new URL('../data/road_graph.json', import.meta.url);
const layout = JSON.parse(fs.readFileSync(layoutUrl, 'utf8'));

const clearance = 3.2;
const doorOffset = clearance + 1.5; // 门到建筑外沿的距离

// 弧形楼（1#/2#教学综合楼）实际体量是外接半环，半径 = max(w/2, d*1.2)。
const isArc = (b) => b.shape === 'arc' || b.shape === 'arc_mirror';
const arcOuter = (b) => Math.max(b.w * 0.5, b.d * 1.2);
const halfW = (b) => (isArc(b) ? arcOuter(b) : b.w / 2);
const halfD = (b) => (isArc(b) ? arcOuter(b) : b.d / 2);

// ============================================================
// 1. 街道骨架（axis-aligned）
//    垂直街 { id, dir:'v', x, z1, z2, label }
//    水平街 { id, dir:'h', z, x1, x2, label }
// ============================================================
const STREETS = [
  // —— 中央轴线区 ——
  { id: 'Vaxis', dir: 'v', x: 0, z1: -188, z2: -84, label: '南主轴' },
  { id: 'Vcw', dir: 'v', x: -88, z1: -147, z2: -40.5, label: '中轴西街' },
  { id: 'Vce', dir: 'v', x: 88, z1: -170, z2: 160, label: '东侧主街' },
  { id: 'Vfw', dir: 'v', x: -54, z1: -40.5, z2: 127, label: '图书馆西街' },
  { id: 'Vfe', dir: 'v', x: 54, z1: -40.5, z2: 127, label: '图书馆东街' },
  // —— 西侧生活/运动区 ——
  { id: 'Vw1', dir: 'v', x: -113, z1: -111, z2: 160, label: '西主街' },
  { id: 'Vwe', dir: 'v', x: -70, z1: -40.5, z2: 127, label: '西林荫街' },
  { id: 'Vw2', dir: 'v', x: -240, z1: -111, z2: 160, label: '西缘路' },
  // —— 东侧宿舍区 ——
  { id: 'Ve2', dir: 'v', x: 154.5, z1: -170, z2: 160, label: '宿舍区中街' },
  // 东缘路保留到 z=160：x=214 在生态湖(东缘207)以东 4m、山林(东缘213/南缘165)以南，
  // 沿湖东岸的观景尽端路
  { id: 'Ve3', dir: 'v', x: 214, z1: -170, z2: 160, label: '东缘路' },
  // —— 中央区水平街 ——
  { id: 'Hz1', dir: 'h', z: -147, x1: -88, x2: 88, label: '教学北前街' },
  { id: 'Hz2', dir: 'h', z: -96, x1: -113, x2: 88, label: '教学中南街' },
  { id: 'Hz3', dir: 'h', z: -40.5, x1: -113, x2: 88, label: '图书馆南街' },
  { id: 'Hz4', dir: 'h', z: 16, x1: -54, x2: 54, label: '环形楼南街' },
  { id: 'Hz5', dir: 'h', z: 127, x1: -70, x2: 88, label: '环形楼北街' },
  // —— 西侧水平街 ——
  { id: 'Hz6', dir: 'h', z: -111, x1: -240, x2: -113, label: '风雨操场南街' },
  // 北移到 z=-70：夹在 400m跑道南直道(北缘-66) 与 10#风雨操场(北缘-75) 之间，
  // 原 z=-65 正压在跑道南直道上（跑道面高 0.12 > 路面 0.07，路面被盖住）
  { id: 'Hz7', dir: 'h', z: -70, x1: -240, x2: -113, label: '风雨操场北街' },
  // 南移到 z=1：夹在 400m跑道北直道(南缘-4) 与 11#食堂(南缘9) 之间，
  // 原 z=-3 压在跑道北直道上
  { id: 'Hz8', dir: 'h', z: 1, x1: -240, x2: -113, label: '食堂南街' },
  // 食堂会堂街：北移到 z=41，夹在 11#食堂(北缘35) 与 8#会堂(南缘47.5) 之间，
  // 同时作食堂北前街与会堂南前街（两排楼共享一条街，合并近距离平行路）。
  // 西端截到 x=-180：原 x1=-240 的西段横穿 4 片球场（x[-223,-188] z[6,65]，
  // 球场面高 0.14 > 路面，被球场盖住）
  { id: 'Hz9', dir: 'h', z: 41, x1: -180, x2: -113, label: '食堂会堂街' },
  // 实训楼南街：东延至西主街(-113)，同时服务 B18 / B16 两栋的南门前街
  // （B10 看台拆除后原 Hz11 看台宿舍街整条删除）
  { id: 'Hz10', dir: 'h', z: 110, x1: -260, x2: -113, label: '实训楼南街' },
  // —— 北环 ——
  // 完整北环（x 到东缘路 214）：北侧生态湖已缩小并平移进 Ve2/Ve3/Hz12/Hz18
  // 围合的街区内（前端运行时缩放 GLB 湖面），北环从湖北侧、山林南侧通过，
  // 山体（z≥165）保持在路网之外。
  { id: 'Hz12', dir: 'h', z: 160, x1: -260, x2: 214, label: '北环路' },
  // —— 东侧宿舍区水平街（行间共享：上一行的后街 = 下一行的前街） ——
  { id: 'Hz13', dir: 'h', z: -164, x1: 88, x2: 214, label: '南宿舍南街' },
  { id: 'Hz14', dir: 'h', z: -109, x1: 88, x2: 214, label: '南宿舍北街' },
  { id: 'Hz15', dir: 'h', z: -52.5, x1: 88, x2: 214, label: '中宿舍南街' },
  { id: 'Hz16', dir: 'h', z: 4.5, x1: 88, x2: 214, label: '中宿舍北街' },
  { id: 'Hz17', dir: 'h', z: 60, x1: 88, x2: 214, label: '北宿舍南街' },
  { id: 'Hz18', dir: 'h', z: 111.5, x1: 88, x2: 214, label: '北宿舍北街' },
];

// 街道端点的语义命名（未命名的端点不单独成「路口」，仅作几何端点保留）
const ENDPOINT_NAMES = {
  Vaxis: { [-188]: ['gate', '南校门', 'gate'], [-84]: ['axisEnd', '主轴北端', 'junction'] },
  Hz12: { [-260]: ['northWestEnd', '西北环岛', 'junction'] },
};

// 街道上的附加 POI 点（会切分街道）
const STREET_POINTS = [
  { street: 'Hz5', at: 0, id: 'north', label: '北区中央路口', kind: 'junction' },
];

// 独立 POI 节点（不在街道上，用一小段 spur 接入最近街道）
// 注意：POI 落点必须在真实地貌（湖面/山体/球场/跑道）之外，
// 否则标记点和引入路会被地貌网格盖住。
const POI_SPURS = [
  // 东移 2m：原 x=-118 正好压在 400m跑道东弯顶点（跑道外缘 x=-118）上
  { id: 'sportsEast', label: '400米田径场', kind: 'landmark', pos: [-116, -35], street: 'Vw1' },
  // 湖已缩小平移进北环街区内（新湖面 x[162,206] z[120,151]），
  // 节点放湖东南岸外；不能放原 (205,168) —— 那在山林_2 椭球内部，会被山体埋住
  { id: 'lake', label: '北侧湖畔节点', kind: 'landmark', pos: [205, 163], street: 'Hz12' },
  // 山体保持在路网外，节点放山南脚下（原 (148,188) 在山林_0 椭球内部会被埋）
  { id: 'hill', label: '北侧山林步道', kind: 'landmark', pos: [148, 163], street: 'Hz12' },
];

// 每栋楼的（前门→街, 后门→街）。弧形楼 arc 主入口朝南、arc_mirror 朝北。
// side: S/N/E/W；street: 接入的街道 id。
const BUILDING_SIDES = {
  B01: [['S', 'Hz1'], ['N', 'Hz2']],
  B02: [['S', 'Hz1'], ['N', 'Hz2']],
  B03: [['S', 'Hz2'], ['N', 'Hz3']],
  B04: [['S', 'Hz2'], ['N', 'Hz3']],
  B05: [['S', 'Hz3'], ['N', 'Hz4']],
  B06: [['S', 'Hz4'], ['N', 'Hz5']],
  B22: [['N', 'Hz5'], ['S', 'Hz4']],
  // 西片区定稿（2026-09-21 第四轮）：B08 会堂(-156,66) 北缘接实训楼南街(z=110)，
  // 南缘接食堂会堂街(z=41)；B16 宿舍(-156,135) 南缘接实训楼南街、北缘接北环路。
  B08: [['S', 'Hz9'], ['N', 'Hz10']],
  B09: [['S', 'Hz8'], ['N', 'Hz9']],
  B11: [['S', 'Hz16'], ['N', 'Hz17']],
  B12: [['S', 'Hz16'], ['N', 'Hz17']],
  B13: [['S', 'Hz17'], ['N', 'Hz18']],
  B14: [['S', 'Hz17'], ['N', 'Hz18']],
  B15: [['S', 'Hz18'], ['N', 'Hz12']],
  B16: [['S', 'Hz10'], ['N', 'Hz12']],
  B18: [['S', 'Hz10'], ['N', 'Hz12']],
  B19: [['S', 'Hz14'], ['N', 'Hz15']],
  B20: [['S', 'Hz14'], ['N', 'Hz15']],
  B21: [['S', 'Hz6'], ['N', 'Hz7']],
  B24: [['S', 'Hz15'], ['N', 'Hz16']],
  B25: [['S', 'Hz15'], ['N', 'Hz16']],
  B26: [['S', 'Hz13'], ['N', 'Hz14']],
  B27: [['S', 'Hz13'], ['N', 'Hz14']],
};

// ============================================================
// 2. 几何工具
// ============================================================
const streetById = Object.fromEntries(STREETS.map((s) => [s.id, s]));
const buildingById = Object.fromEntries(layout.buildings.map((b) => [b.id, b]));

function sideDoor(b, side) {
  const hw = halfW(b);
  const hd = halfD(b);
  if (side === 'S') return [b.x, b.z - hd - doorOffset];
  if (side === 'N') return [b.x, b.z + hd + doorOffset];
  if (side === 'E') return [b.x + hw + doorOffset, b.z];
  return [b.x - hw - doorOffset, b.z];
}

/** 门/POI 在街道上的垂足投影（轴线对齐：垂直街投影取 (s.x, z)，水平街取 (x, s.z)）。 */
function projectOnStreet(point, street) {
  const [x, z] = point;
  if (street.dir === 'v') {
    const cz = Math.min(street.z2, Math.max(street.z1, z));
    return [street.x, cz];
  }
  const cx = Math.min(street.x2, Math.max(street.x1, x));
  return [cx, street.z];
}

const isBlockedPoint = (x, z, ignoreId = null) =>
  layout.buildings.some((b) => {
    if (b.id === ignoreId) return false;
    const hw = halfW(b) + clearance;
    const hd = halfD(b) + clearance;
    return x >= b.x - hw && x <= b.x + hw && z >= b.z - hd && z <= b.z + hd;
  });

/** 线段（轴对齐）是否穿过任何建筑外扩 footprint。 */
function segmentHitsBuilding(x1, z1, x2, z2, ignoreIds = []) {
  for (const b of layout.buildings) {
    if (ignoreIds.includes(b.id)) continue;
    const hw = halfW(b) + clearance;
    const hd = halfD(b) + clearance;
    const left = b.x - hw;
    const right = b.x + hw;
    const bottom = b.z - hd;
    const top = b.z + hd;
    if (x1 === x2) {
      // 垂直线段
      if (x1 < left || x1 > right) continue;
      const lo = Math.min(z1, z2);
      const hi = Math.max(z1, z2);
      if (hi >= bottom && lo <= top) return b.id;
    } else {
      // 水平线段
      if (z1 < bottom || z1 > top) continue;
      const lo = Math.min(x1, x2);
      const hi = Math.max(x1, x2);
      if (hi >= left && lo <= right) return b.id;
    }
  }
  return null;
}

// ============================================================
// 3. 收集每条街道上的点（端点 + 交点 + 附加点 + 门牌投影点），切分成边
// ============================================================
// pointsOnStreet: streetId -> [{ at, nodeKey }]（at 沿街道主轴的坐标）
const pointsOnStreet = new Map();
const nodeRegistry = new Map(); // nodeKey -> { id, label, position, kind, building_id? }

function addNode(key, label, x, z, kind, extra = {}) {
  if (!nodeRegistry.has(key)) {
    nodeRegistry.set(key, { id: key, label, position: [x, 0, z], kind, ...extra });
  }
  return nodeRegistry.get(key);
}

for (const street of STREETS) {
  pointsOnStreet.set(street.id, []);
}

// 3.1 端点 + 交点
for (const street of STREETS) {
  const list = pointsOnStreet.get(street.id);
  if (street.dir === 'v') {
    list.push({ at: street.z1 }, { at: street.z2 });
  } else {
    list.push({ at: street.x1 }, { at: street.x2 });
  }
}
for (const v of STREETS.filter((s) => s.dir === 'v')) {
  for (const h of STREETS.filter((s) => s.dir === 'h')) {
    if (h.x1 <= v.x && v.x <= h.x2 && v.z1 <= h.z && h.z <= v.z2) {
      const key = `${h.id}__${v.id}`;
      addNode(key, `${h.label}·${v.label}路口`, v.x, h.z, 'junction');
      pointsOnStreet.get(v.id).push({ at: h.z, nodeKey: key });
      pointsOnStreet.get(h.id).push({ at: v.x, nodeKey: key });
    }
  }
}

// 3.2 端点语义命名
for (const [streetId, ends] of Object.entries(ENDPOINT_NAMES)) {
  for (const [at, [id, label, kind]] of Object.entries(ends)) {
    addNode(id, label, streetById[streetId].dir === 'v' ? streetById[streetId].x : Number(at),
      streetById[streetId].dir === 'v' ? Number(at) : streetById[streetId].z, kind);
    pointsOnStreet.get(streetId).push({ at: Number(at), nodeKey: id });
  }
}

// 3.3 街上附加点
for (const point of STREET_POINTS) {
  const street = streetById[point.street];
  addNode(point.id, point.label, street.dir === 'v' ? street.x : point.at,
    street.dir === 'v' ? point.at : street.z, point.kind);
  pointsOnStreet.get(street.id).push({ at: point.at, nodeKey: point.id });
}

// 3.4 建筑前后门 spur
const spurEdges = [];
for (const [buildingId, sides] of Object.entries(BUILDING_SIDES)) {
  const b = buildingById[buildingId];
  if (!b) throw new Error(`BUILDING_SIDES 引用了不存在的建筑 ${buildingId}`);
  sides.forEach(([side, streetId], index) => {
    const street = streetById[streetId];
    if (!street) throw new Error(`建筑 ${buildingId} 引用了不存在的街道 ${streetId}`);
    const door = sideDoor(b, side);
    if (isBlockedPoint(door[0], door[1], buildingId)) {
      throw new Error(`建筑 ${buildingId} 的 ${side} 门 (${door}) 落在其他建筑外扩区内`);
    }
    const proj = projectOnStreet(door, street);
    const hit = segmentHitsBuilding(door[0], door[1], proj[0], proj[1], [buildingId]);
    if (hit) throw new Error(`建筑 ${buildingId} 的 ${side} 引入路穿过 ${hit}`);
    // 门牌投影点（多数已在路口，按坐标合并键去重）
    const projKey = `p_${proj[0]}_${proj[1]}`;
    const existing = [...nodeRegistry.values()].find(
      (n) => n.position[0] === proj[0] && n.position[2] === proj[1],
    );
    const projNode = existing || addNode(projKey, `${b.name}门牌`, proj[0], proj[1], 'doorway');
    pointsOnStreet.get(streetId).push({ at: street.dir === 'v' ? proj[1] : proj[0], nodeKey: projNode.id });
    const entryId = index === 0 ? `entry_${buildingId}` : `entry_${buildingId}_back`;
    addNode(entryId, `${b.name}入口${index === 0 ? '' : '（后门）'}`, door[0], door[1], 'building_entry', { building_id: buildingId });
    spurEdges.push([entryId, projNode.id]);
  });
}

// 3.5 独立 POI spur
for (const poi of POI_SPURS) {
  const street = streetById[poi.street];
  if (isBlockedPoint(poi.pos[0], poi.pos[1])) throw new Error(`POI ${poi.id} 落在建筑内`);
  const proj = projectOnStreet(poi.pos, street);
  const hit = segmentHitsBuilding(poi.pos[0], poi.pos[1], proj[0], proj[1]);
  if (hit) throw new Error(`POI ${poi.id} 引入路穿过 ${hit}`);
  const existing = [...nodeRegistry.values()].find(
    (n) => n.position[0] === proj[0] && n.position[2] === proj[1],
  );
  const projNode = existing || addNode(`p_${proj[0]}_${proj[1]}`, `${poi.label}接入点`, proj[0], proj[1], 'doorway');
  pointsOnStreet.get(street.id).push({ at: street.dir === 'v' ? proj[1] : proj[0], nodeKey: projNode.id });
  addNode(poi.id, poi.label, poi.pos[0], poi.pos[1], poi.kind);
  spurEdges.push([poi.id, projNode.id]);
}

// 3.6 街道切分成边（沿主轴排序，相邻点连直线）
const streetEdges = [];
for (const street of STREETS) {
  const points = pointsOnStreet
    .get(street.id)
    .sort((a, b) => a.at - b.at);
  // 去重（同位置多个点 → 保留一个 nodeKey，优先有名字的）
  const merged = [];
  for (const point of points) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.at - point.at) < 0.01) {
      if (point.nodeKey && !last.nodeKey) last.nodeKey = point.nodeKey;
      continue;
    }
    merged.push({ ...point });
  }
  // 为无名的端点建节点
  for (const point of merged) {
    if (point.nodeKey) continue;
    const coord = street.dir === 'v' ? [street.x, point.at] : [point.at, street.z];
    const key = `e_${street.id}_${point.at}`;
    addNode(key, `${street.label}端点`, coord[0], coord[1], 'junction');
    point.nodeKey = key;
  }
  for (let i = 0; i < merged.length - 1; i += 1) {
    streetEdges.push([merged[i].nodeKey, merged[i + 1].nodeKey]);
  }
}

// ============================================================
// 4. 汇总节点与边（全部为直线段，几何即两端点）
// ============================================================
const nodes = [...nodeRegistry.values()];
const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));

const allEdgePairs = [...streetEdges, ...spurEdges];
const edges = allEdgePairs.map(([from, to]) => {
  const a = nodeMap[from].position;
  const b = nodeMap[to].position;
  const hit = segmentHitsBuilding(a[0], a[2], b[0], b[2]);
  if (hit && !(nodeMap[from].building_id === hit || nodeMap[to].building_id === hit)) {
    throw new Error(`边 ${from}->${to} 穿过建筑 ${hit}`);
  }
  const distance = Math.hypot(b[0] - a[0], b[2] - a[2]);
  return {
    from,
    to,
    distance_m: Number(distance.toFixed(2)),
    travel_time_min: Number((distance / 72).toFixed(2)),
    indoor: false,
    geometry: [
      [Number(a[0].toFixed(2)), 0, Number(a[2].toFixed(2))],
      [Number(b[0].toFixed(2)), 0, Number(b[2].toFixed(2))],
    ],
  };
});

const graph = {
  coordinate_system: layout.coordinate_system,
  source: '手工设计的矩形网格路网：横平竖直街道 + 每栋楼前后门引入路；节点 = 街道交点/端点/门牌投影/POI',
  clearance_m: clearance,
  nodes,
  edges,
};
fs.writeFileSync(outputUrl, `${JSON.stringify(graph, null, 2)}\n`);

const junctions = nodes.filter((n) => n.kind === 'junction').length;
const entries = nodes.filter((n) => n.kind === 'building_entry').length;
console.log(`ROAD_GRAPH_GENERATED: ${nodes.length} nodes (${junctions} junctions / ${entries} building entries) / ${edges.length} edges`);
