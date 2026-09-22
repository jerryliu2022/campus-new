import fs from 'fs';
const p = 'E:/practice-examples/competition/campus-new/public/assets/yueyang_campus.glb';
const buf = fs.readFileSync(p);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
for (const n of json.nodes || []) {
  if (n.name && /羽|网球场|排球|场地|球场/.test(n.name)) console.log(n.name, 'mesh=' + n.mesh);
}
console.log('---all names containing 球---');
const set = new Set();
for (const n of json.nodes||[]) if(n.name&&n.name.includes('球')) set.add(n.name.replace(/_\d+/g,'_N'));
console.log([...set].join('\n'));
