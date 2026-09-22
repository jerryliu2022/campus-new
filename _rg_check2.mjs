import fs from 'fs';
const g = JSON.parse(fs.readFileSync('E:/practice-examples/competition/campus-new/data/road_graph.json','utf8'));
const P = n => n.position;
const nodes = new Map(g.nodes.map(n=>[n.id,n]));
const get = id => P(nodes.get(id));
function segRect(a,b,r){
  const [x0,,z0]=a,[x1,,z1]=b,[rx0,rx1,rz0,rz1]=r;
  for(let t=0;t<=40;t++){const x=x0+(x1-x0)*t/40,z=z0+(z1-z0)*t/40;
    if(x>=rx0&&x<=rx1&&z>=rz0&&z<=rz1)return true;}
  return false;
}
const lake=[142,207,125,171];
const mtn=[129,213,165,217];
let nh=0,nm=0;
for(const e of g.edges){
  const a=get(e.from),b=get(e.to);
  if(segRect(a,b,lake)){console.log('LAKE edge:',e.from,'->',e.to);nh++;}
  if(segRect(a,b,mtn)){console.log('MTN edge:',e.from,'->',e.to);nm++;}
}
console.log('lake hits:',nh,'mtn hits:',nm);
// extents
let xs=[],zs=[];
for(const n of g.nodes){const [x,,z]=P(n);xs.push(x);zs.push(z);}
console.log('x range',Math.min(...xs),Math.max(...xs),'z range',Math.min(...zs),Math.max(...zs));
// list nodes in NE quadrant
for(const n of g.nodes){const[x,,z]=P(n); if(x>110&&z>100) console.log('NE',n.id,x,z);}
// also edge half-width 2.6: check edges near lake border
for(const e of g.edges){
  const a=get(e.from),b=get(e.to);
  const near=(p,r)=>p[0]>=r[0]-3&&p[0]<=r[1]+3&&p[2]>=r[2]-3&&p[2]<=r[3]+3;
  if(near(a,lake)||near(b,lake)) console.log('near-lake:',e.from,a[0],a[2],'->',e.to,b[0],b[2]);
}
