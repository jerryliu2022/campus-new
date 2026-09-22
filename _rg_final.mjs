import fs from 'fs';
const g = JSON.parse(fs.readFileSync('E:/practice-examples/competition/campus-new/data/road_graph.json','utf8'));
const nodes = new Map(g.nodes.map(n=>[n.id,n]));
const get = id => nodes.get(id).position;
const HW = 2.6;
function hit(a,b,r){
  for(const off of [0,-HW,HW]){
    for(let t=0;t<=60;t++){
      const cx=a[0]+(b[0]-a[0])*t/60, cz=a[2]+(b[2]-a[2])*t/60;
      const dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz)||1;
      const x=cx+(-dz/len)*off, z=cz+(dx/len)*off;
      if(x>=r[0]&&x<=r[1]&&z>=r[2]&&z<=r[3]) return true;
    }
  }
  return false;
}
// 新湖面（缩放平移后）、山林、球场、跑道、水渠的精确 bbox
const LAKE={s:0.68,tx:65.34,tz:34.86,ox:[142,207],oz:[125,171]};
const lakeBox=[LAKE.s*LAKE.ox[0]+LAKE.tx, LAKE.s*LAKE.ox[1]+LAKE.tx, LAKE.s*LAKE.oz[0]+LAKE.tz, LAKE.s*LAKE.oz[1]+LAKE.tz];
console.log('新湖面 bbox x[%.1f,%.1f] z[%.1f,%.1f]', lakeBox[0],lakeBox[1],lakeBox[2],lakeBox[3]);
const feats={
  湖:lakeBox,
  山:[129,213,165,217],
  球场:[-223,-188,6,65],
  跑道:[-230,-118,-66,-4],
  水渠:[231,239,-53,197],
};
let bad=0;
for(const e of g.edges){
  const a=get(e.from),b=get(e.to);
  for(const [k,r] of Object.entries(feats)){
    if(hit(a,b,r)){console.log('HIT',k+':',e.from,'->',e.to);bad++;}
  }
}
console.log(bad===0?'ALL_CLEAR: 168条边均不穿新湖/山/球场/跑道/水渠':'HITS='+bad);
for(const n of g.nodes) if(['lake','hill'].includes(n.id)) console.log('POI',n.id,n.position[0],n.position[2]);
