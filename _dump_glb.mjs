import fs from 'fs';
import path from 'path';
const p = 'E:/practice-examples/competition/campus-new/public/assets/yueyang_campus.glb';
const buf = fs.readFileSync(p);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const names = new Map();
for (const n of json.nodes || []) {
  const key = (n.name || '').replace(/_\d+$/, '');
  if (!names.has(key)) names.set(key, { count: 0, sample: n.name });
  names.get(key).count++;
}
for (const [k, v] of names) console.log(k, v.count, '->', v.sample);
console.log('--- meshes total:', (json.meshes||[]).length);
