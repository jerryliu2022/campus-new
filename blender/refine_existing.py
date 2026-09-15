import bpy
import os
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
camera = bpy.data.objects.get('CAMERA_校园总览')
if camera is None:
    raise RuntimeError('CAMERA_校园总览 not found')
camera.location = (325, 525, 345)
camera.rotation_euler = (Vector((0, -8, 4)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.lens = 54
bpy.context.scene.camera = camera
world = bpy.context.scene.world
if world and world.use_nodes:
    background = world.node_tree.nodes.get('Background')
    if background:
        background.inputs['Color'].default_value = (0.11, 0.16, 0.18, 1)
        background.inputs['Strength'].default_value = .68
sun = bpy.data.objects.get('SUN_午后主光')
if sun:
    sun.data.energy = 3.0
fill = bpy.data.objects.get('AREA_天空补光')
if fill:
    fill.data.energy = 1800
bpy.context.scene.view_settings.exposure = .65
bpy.context.scene.render.filepath = os.path.join(ROOT, 'renders', 'campus-preview.png')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'blender', 'yueyang_campus.blend'))
bpy.ops.render.render(write_still=True)
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.objects:
    if obj.type == 'MESH' and not obj.hide_render:
        obj.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(ROOT, 'public', 'assets', 'yueyang_campus.glb'),
    export_format='GLB',
    export_apply=True,
    use_selection=True,
)
