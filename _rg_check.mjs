import fs from 'fs';
const g = JSON.parse(fs.readFileSync('E:/practice-examples/competition/campus-new/data/road_graph.json','utf8'));
const nodes = new Map(g.nodes.map(n=>[n.id,n]));
console.log('nodes:', g.nodes.length, 'edges:', g.edges.length);
// feature rectangles: lake, mountain, badminton(badminton courts?)
const feats = {
  lake: [142,207,125,171],
  mountain: [129,213,165,217],
  badmintonArea: null,
};
// search edges intersecting lake/mountain
for (const e of g.edges) {
  const a = nodes.get(e.from), b = nodes.get(e.to);
  const seg = (x0,z0,x1,z1,rx0,rx1,rz0,rz1)=>{
    // sample
    for(let t=0;t<=20;t++){
      const x=x0+(x1-x0)*t/20, z=z0+(z1-z0)*t/20;
      if(x>=rx0&&x<=rx1&&z>=rz0&&z<=rz1) return true;
    } return false;
  };
  if (seg(a.x,a.z,b.x,b.z,...feats.lake)) console.log('LAKE edge:', e.from, a.x,a.z, '->', e.to, b.x,b.z);
  if (seg(a.x,a.z,b.x,b.z,...feats.mountain)) console.log('MTN edge:', e.from, a.x,a.z, '->', e.to, b.x,b.z);
}
// print all node ids with x>120 && z>110 (north-east area)
for (const n of g.nodes) if (n.x>115 && n.z>105) console.log('NE node', n.id, n.x, n.z);
