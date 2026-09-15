import fs from 'node:fs';

const graph = JSON.parse(fs.readFileSync(new URL('../data/road_graph.json', import.meta.url), 'utf8'));
const layout = JSON.parse(fs.readFileSync(new URL('../data/campus_layout.json', import.meta.url), 'utf8'));
const clearance = graph.clearance_m ?? 3.2;
const expanded = layout.buildings.map(({ x, z, w, d }) => [x - w / 2 - clearance, x + w / 2 + clearance, z - d / 2 - clearance, z + d / 2 + clearance]);
const hits = [];
for (const edge of graph.edges) {
  if (edge.indoor) hits.push(`${edge.from}->${edge.to}: indoor=true`);
  const points = edge.geometry ?? [];
  for (let i = 0; i < points.length - 1; i += 1) {
    for (let step = 0; step <= 100; step += 1) {
      const t = step / 100;
      const x = points[i][0] + (points[i + 1][0] - points[i][0]) * t;
      const z = points[i][2] + (points[i + 1][2] - points[i][2]) * t;
      if (expanded.some(([left, right, bottom, top]) => x >= left && x <= right && z >= bottom && z <= top)) {
        hits.push(`${edge.from}->${edge.to}: building footprint hit at (${x.toFixed(1)}, ${z.toFixed(1)})`);
        break;
      }
    }
  }
}
if (hits.length) {
  console.error(hits.join('\n'));
  process.exit(1);
}
console.log(`ROAD_GRAPH_VALID: ${graph.nodes.length} nodes / ${graph.edges.length} outdoor edges / no building footprint hits`);
