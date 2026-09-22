import fs from 'fs';
const p = 'E:/practice-examples/competition/campus-new/public/assets/yueyang_campus.glb';
const buf = fs.readFileSync(p);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
// map mesh index -> accessor min/max for POSITION
function bboxOfNode(n) {
  if (n.mesh === undefined) return null;
  const prim = json.meshes[n.mesh].primitives[0];
  const acc = json.accessors[prim.attributes.POSITION];
  const [minx,miny,minz] = acc.min, [maxx,maxy,maxz] = acc.max;
  const t = n.translation || [0,0,0];
  const s = n.scale || [1,1,1];
  return {
    min: [t[0]+minx*s[0], t[1]+miny*s[1], t[2]+minz*s[2]],
    max: [t[0]+maxx*s[0], t[1]+maxy*s[1], t[2]+maxz*s[2]],
  };
}
const keys = /羽毛球|湖|山林|山|CAMPUS_GROUND|水渠|网球|排球场|球场/;
for (const n of json.nodes || []) {
  if (n.name && keys.test(n.name)) {
    const b = bboxOfNode(n);
    if (b) console.log(n.name, 'bbox x[%.1f,%.1f] y[%.2f,%.2f] z[%.1f,%.1f]', b.min[0], b.max[0], b.min[1], b.max[1], b.min[2], b.max[2]);
    else console.log(n.name, '(no mesh, children)');
  }
}
