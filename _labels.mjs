import fs from 'fs';
const p = 'E:/practice-examples/competition/campus-new/public/assets/yueyang_campus.glb';
const buf = fs.readFileSync(p);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
for (const n of json.nodes || []) {
  if (n.name && /牌|标|label|sign|number|编号|NO|No_|Plaque/i.test(n.name)) console.log('LABEL-CANDIDATE:', n.name, 'mesh=' + n.mesh);
}
// also dump all B-numbered node names
const set = new Set();
for (const n of json.nodes || []) if (n.name && /^B\d+/.test(n.name)) set.add(n.name);
console.log([...set].sort().join('\n'));
