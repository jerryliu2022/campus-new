import fs from 'fs';
const p = 'E:/practice-examples/competition/campus-new/public/assets/yueyang_campus.glb';
const buf = fs.readFileSync(p);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
for (const n of json.nodes || []) {
  if (n.name && /生态湖|山林/.test(n.name)) {
    console.log(n.name, 'mesh=' + n.mesh, 't=' + JSON.stringify(n.translation || null), 's=' + JSON.stringify(n.scale || null), 'rot=' + JSON.stringify(n.rotation || null), 'children=' + (n.children ? n.children.length : 0));
  }
}
// scene roots
console.log('scene:', JSON.stringify(json.scenes?.[0]?.nodes));
for (const i of json.scenes[0].nodes) console.log('root node:', json.nodes[i].name, 't=' + JSON.stringify(json.nodes[i].translation || 0));
