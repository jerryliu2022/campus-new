import fs from 'node:fs';

const layoutUrl = new URL('../data/campus_layout.json', import.meta.url);
const outputUrl = new URL('../data/road_graph.json', import.meta.url);
const layout = JSON.parse(fs.readFileSync(layoutUrl, 'utf8'));

const clearance = 3.2;
const gridSize = 2;
const [extentX, extentZ] = layout.coordinate_system.model_extent_m;
const bounds = {
  minX: -extentX / 2 + 4,
  maxX: extentX / 2 - 4,
  minZ: -extentZ / 2 + 4,
  maxZ: extentZ / 2 - 4,
};
const footprints = layout.buildings.map((building) => ({
  id: building.id,
  left: building.x - building.w / 2 - clearance,
  right: building.x + building.w / 2 + clearance,
  bottom: building.z - building.d / 2 - clearance,
  top: building.z + building.d / 2 + clearance,
}));

const baseNodes = [
  ['gate', '南校门', 0, -188, 'gate'],
  ['south', '南入口广场', 0, -158, 'junction'],
  ['axisSouth', '南段中央主轴', 0, -125, 'junction'],
  ['axisMid', '中段中央主轴', 0, -67, 'junction'],
  ['plazaSouth', '实验综合楼南广场', 0, -36, 'junction'],
  ['centralWest', '实验综合楼西侧', -36, -10, 'junction'],
  ['centralEast', '实验综合楼东侧', 36, -10, 'junction'],
  ['plazaNorth', '实验综合楼北广场', 0, 26, 'junction'],
  ['libraryWest', '图书馆西环路', -58, 70, 'junction'],
  ['libraryEast', '图书馆东环路', 82, 70, 'junction'],
  ['north', '北区中央路口', 0, 118, 'junction'],
  ['northWest', '西北教学组团路口', -82, 118, 'junction'],
  ['northEast', '东北宿舍组团路口', 88, 118, 'junction'],
  ['westSouth', '西南生活区路口', -88, -122, 'junction'],
  ['westMid', '西侧林荫路', -88, -34, 'junction'],
  ['westNorth', '西北林荫路', -88, 70, 'junction'],
  ['sportsSouth', '体育区南入口', -105, -92, 'junction'],
  ['sportsEast', '田径场东入口', -112, -35, 'junction'],
  ['sportsNorth', '体育区北入口', -112, 22, 'junction'],
  ['eastSouth', '东南宿舍路口', 88, -124, 'junction'],
  ['eastMid', '东侧主路', 88, -34, 'junction'],
  ['eastAcademic', '东侧组团中路', 88, 60, 'junction'],
  ['eastOuterSouth', '东缘南路口', 222, -120, 'junction'],
  ['eastOuterMid', '东缘中路口', 222, 32, 'junction'],
  ['eastOuterNorth', '东缘北路口', 222, 128, 'junction'],
  ['lake', '北侧湖畔节点', 205, 168, 'landmark'],
  ['hill', '北侧山林步道', 148, 188, 'landmark'],
];

const baseEdges = [
  ['gate', 'south'], ['south', 'axisSouth'], ['axisSouth', 'axisMid'], ['axisMid', 'plazaSouth'],
  ['plazaSouth', 'centralWest'], ['plazaSouth', 'centralEast'], ['centralWest', 'plazaNorth'], ['centralEast', 'plazaNorth'],
  ['plazaNorth', 'libraryWest'], ['plazaNorth', 'libraryEast'], ['libraryWest', 'north'], ['libraryEast', 'north'],
  ['north', 'northWest'], ['north', 'northEast'], ['axisSouth', 'westSouth'], ['westSouth', 'westMid'],
  ['westMid', 'westNorth'], ['westNorth', 'northWest'], ['westSouth', 'sportsSouth'], ['sportsSouth', 'sportsEast'],
  ['sportsEast', 'sportsNorth'], ['sportsNorth', 'westNorth'], ['axisSouth', 'eastSouth'], ['eastSouth', 'eastMid'],
  ['eastMid', 'eastAcademic'], ['eastAcademic', 'northEast'], ['eastSouth', 'eastOuterSouth'], ['eastOuterSouth', 'eastOuterMid'],
  ['eastOuterMid', 'eastOuterNorth'], ['eastOuterNorth', 'northEast'], ['eastOuterNorth', 'lake'], ['lake', 'hill'],
  ['hill', 'northEast'], ['eastMid', 'eastOuterMid'], ['eastAcademic', 'eastOuterMid'],
];

const isBlocked = (x, z, ignoreId = null) => footprints.some((box) => box.id !== ignoreId
  && x >= box.left && x <= box.right && z >= box.bottom && z <= box.top);

function entranceFor(building) {
  const candidates = [
    [building.x, building.z - building.d / 2 - clearance - 1.5],
    [building.x + building.w / 2 + clearance + 1.5, building.z],
    [building.x, building.z + building.d / 2 + clearance + 1.5],
    [building.x - building.w / 2 - clearance - 1.5, building.z],
  ];
  return candidates.find(([x, z]) => !isBlocked(x, z, building.id)) || candidates[0];
}

const buildingNodes = layout.buildings.map((building) => {
  const [x, z] = entranceFor(building);
  return [`entry_${building.id}`, `${building.name}入口`, x, z, 'building_entry', building.id];
});
const nodes = [...baseNodes, ...buildingNodes].map(([id, label, x, z, kind, buildingId]) => ({
  id,
  label,
  position: [Number(x.toFixed(2)), 0, Number(z.toFixed(2))],
  kind,
  ...(buildingId ? { building_id: buildingId } : {}),
}));
const nodeMap = Object.fromEntries(nodes.map((node) => [node.id, node]));

for (const node of buildingNodes) {
  const [id, , x, z] = node;
  const nearest = baseNodes
    .map((candidate) => [candidate[0], Math.hypot(candidate[2] - x, candidate[3] - z)])
    .sort((a, b) => a[1] - b[1])[0][0];
  baseEdges.push([nearest, id]);
}

const key = (gx, gz) => `${gx},${gz}`;
const toGrid = (value, min) => Math.round((value - min) / gridSize);
const fromGrid = (value, min) => min + value * gridSize;
const maxGX = toGrid(bounds.maxX, bounds.minX);
const maxGZ = toGrid(bounds.maxZ, bounds.minZ);

function routeBetween(start, end) {
  const startGrid = [toGrid(start[0], bounds.minX), toGrid(start[1], bounds.minZ)];
  const endGrid = [toGrid(end[0], bounds.minX), toGrid(end[1], bounds.minZ)];
  const open = [{ point: startGrid, g: 0, f: 0 }];
  const cameFrom = new Map();
  const best = new Map([[key(...startGrid), 0]]);
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let found = null;

  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift();
    const [gx, gz] = current.point;
    if (gx === endGrid[0] && gz === endGrid[1]) { found = current.point; break; }
    for (const [dx, dz] of directions) {
      const nx = gx + dx;
      const nz = gz + dz;
      if (nx < 0 || nz < 0 || nx > maxGX || nz > maxGZ) continue;
      const worldX = fromGrid(nx, bounds.minX);
      const worldZ = fromGrid(nz, bounds.minZ);
      const nearEndpoint = (nx === endGrid[0] && nz === endGrid[1]) || (nx === startGrid[0] && nz === startGrid[1]);
      if (!nearEndpoint && isBlocked(worldX, worldZ)) continue;
      const nextG = current.g + 1;
      const nextKey = key(nx, nz);
      if (nextG >= (best.get(nextKey) ?? Infinity)) continue;
      best.set(nextKey, nextG);
      cameFrom.set(nextKey, current.point);
      const heuristic = Math.abs(endGrid[0] - nx) + Math.abs(endGrid[1] - nz);
      open.push({ point: [nx, nz], g: nextG, f: nextG + heuristic });
    }
  }
  if (!found) throw new Error(`无法生成道路: ${start.join(',')} -> ${end.join(',')}`);

  const cells = [];
  let cursor = found;
  while (cursor) {
    cells.push(cursor);
    cursor = cameFrom.get(key(...cursor));
  }
  cells.reverse();
  const points = cells.map(([gx, gz]) => [fromGrid(gx, bounds.minX), fromGrid(gz, bounds.minZ)]);
  points[0] = start;
  points[points.length - 1] = end;
  return points.filter((point, index, all) => {
    if (index === 0 || index === all.length - 1) return true;
    const before = all[index - 1];
    const after = all[index + 1];
    return !((before[0] === point[0] && point[0] === after[0]) || (before[1] === point[1] && point[1] === after[1]));
  });
}

const edges = baseEdges.map(([from, to]) => {
  const a = nodeMap[from].position;
  const b = nodeMap[to].position;
  const points = routeBetween([a[0], a[2]], [b[0], b[2]]);
  const distance = points.slice(1).reduce((sum, point, index) => sum + Math.hypot(
    point[0] - points[index][0],
    point[1] - points[index][1],
  ), 0);
  return {
    from,
    to,
    distance_m: Number(distance.toFixed(2)),
    travel_time_min: Number((distance / 72).toFixed(2)),
    indoor: false,
    geometry: points.map(([x, z]) => [Number(x.toFixed(2)), 0, Number(z.toFixed(2))]),
  };
});

const graph = {
  coordinate_system: layout.coordinate_system,
  source: '由 campus_layout.json 自动生成；A* 网格逐段避让建筑外扩 footprint',
  clearance_m: clearance,
  nodes,
  edges,
};
fs.writeFileSync(outputUrl, `${JSON.stringify(graph, null, 2)}\n`);
console.log(`ROAD_GRAPH_GENERATED: ${nodes.length} nodes / ${edges.length} edges`);
