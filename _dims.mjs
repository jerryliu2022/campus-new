import fs from 'fs';
const lay = JSON.parse(fs.readFileSync('E:/practice-examples/competition/campus-new/data/campus_layout.json','utf8'));
for (const b of lay.buildings) {
  if (['B15','B21','B09','B08','B16','B18','B13','B14'].includes(b.id))
    console.log(b.id, b.name, 'x='+b.x, 'z='+b.z, 'w='+b.w, 'd='+b.d, 'shape='+(b.shape||'rect'));
}
