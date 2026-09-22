import fs from 'fs';
const p = 'E:/practice-examples/competition/campus-new/public/assets/yueyang_campus.glb';
const buf = fs.readFileSync(p);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
function bboxOfNode(n) {
  if (n.mesh === undefined) return null;
  const prim = json.meshes[n.mesh].primitives[0];
  const acc = json.accessors[prim.attributes.POSITION];
  const t = n.translation || [0,0,0];
  const s = n.scale || [1,1,1];
  return {min:[t[0]+acc.min[0]*s[0],t[1]+acc.min[1]*s[1],t[2]+acc.min[2]*s[2]],
          max:[t[0]+acc.max[0]*s[0],t[1]+acc.max[1]*s[1],t[2]+acc.max[2]*s[2]]};
}
for (const n of json.nodes || []) {
  if (n.name && /CAMPUS_GROUND|主轴铺装|主轴西|主轴东|环形广场|景观岛|跑道|草坪|水渠/.test(n.name)) {
    const b = bboxOfNode(n);
    console.log(n.name, 'x[%.0f,%.0f] y[%.3f,%.3f] z[%.0f,%.0f]', b.min[0],b.max[0],b.min[1],b.max[1],b.min[2],b.max[2]);
  }
}
