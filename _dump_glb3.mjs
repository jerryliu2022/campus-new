import fs from 'fs';
const p = 'E:/practice-examples/competition/campus-new/public/assets/yueyang_campus.glb';
const buf = fs.readFileSync(p);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const skip = /^(TREE_|路灯_|B\d+_|足球门|篮球场)/;
for (const n of json.nodes || []) {
  if (n.name && !skip.test(n.name)) console.log(n.name, 'mesh=' + n.mesh);
}
