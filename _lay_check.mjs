import fs from 'fs';
const lay = JSON.parse(fs.readFileSync('E:/practice-examples/competition/campus-new/data/campus_layout.json','utf8'));
const s = JSON.stringify(lay);
// find badminton
function scan(obj, path) {
  if (obj && typeof obj === 'object') {
    for (const [k,v] of Object.entries(obj)) {
      if (typeof v === 'string' && /羽毛球/.test(v)) console.log(path+'.'+k, '=', v);
      scan(v, path+'.'+k);
    }
  }
}
scan(lay, 'layout');
// print POIs
if (lay.pois) console.log('POIS:', JSON.stringify(lay.pois, null, 1).slice(0, 3000));
// print building list names + coords
for (const b of lay.buildings || lay) {
  if (b && b.name) console.log('B', b.id||b.code, b.name, b.x, b.z, b.floors||'');
}
