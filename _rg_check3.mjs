import fs from 'fs';
const g = JSON.parse(fs.readFileSync('E:/practice-examples/competition/campus-new/data/road_graph.json','utf8'));
const nodes = new Map(g.nodes.map(n=>[n.id,n]));
const get = id => nodes.get(id).position;
function segRect(a,b,r){
  for(let t=0;t<=40;t++){const x=a[0]+(b[0]-a[0])*t/40,z=a[2]+(b[2]-a[2])*t/40;
    if(x>=r[0]&&x<=r[1]&&z>=r[2]&&z<=r[3])return true;}
  return false;
}
// basketball courts rect (west) x[-223,-188] z[6,65]; with road half width 2.6 -> pad
const courts=[-225,-186,4,67];
// track x[-230,-118] z[-66,-4] pad
const track=[-232,-116,-68,-2];
// axis pavement x[-15.5,15.5] z[-189,33]
const axis=[-18,18,-191,35];
// ring plaza x[-56,56] z[51,125]
const ring=[-58,58,49,127];
const sets={courts,axis,ring,track};
for(const e of g.edges){
  const a=get(e.from),b=get(e.to);
  for(const [k,r] of Object.entries(sets)){
    if(segRect(a,b,r)) console.log(k+':',e.from,'('+a[0]+','+a[2]+') ->',e.to,'('+b[0]+','+b[2]+')');
  }
}
// count how many edges overlap axis/ring (the z-fight candidates)
