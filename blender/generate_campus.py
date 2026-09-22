"""岳阳学院智慧校园数字孪生 - Blender 5.1 场景生成器

运行方式：blender -b --python blender/generate_campus.py
输出：blender/yueyang_campus.blend、public/assets/yueyang_campus.glb、data/room_anchors.json
坐标约定：米制，Y 轴向上，原点为校园地理中心，X-Z 为校园平面。

房间网格（层数 / 每层 4 列(进深 Z) × 5 行(面宽 X) / 编号 101+列*5+行）统一来自
scripts/campus_program.py —— 与 data/room_anchors.json 的唯一数据源保持一致。
"""
import bmesh
import bpy
import json
import math
import os
import sys
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
import campus_program as CP  # noqa: E402

ASSET_DIR = os.path.join(ROOT, 'public', 'assets')
DATA_DIR = os.path.join(ROOT, 'data')
os.makedirs(ASSET_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

LAYOUT_PATH = os.path.join(DATA_DIR, 'campus_layout.json')
ROAD_PATH = os.path.join(DATA_DIR, 'road_graph.json')
with open(LAYOUT_PATH, 'r', encoding='utf-8') as _f:
    _layout = json.load(_f)
with open(ROAD_PATH, 'r', encoding='utf-8') as _f:
    _road_source = json.load(_f)

# Layout is authored in campus_layout.json; keep the generator free of a second
# hand-maintained coordinate table.
BUILDINGS = [
    (b['id'], b['name'], b.get('type', 'OTH'), b['x'], b['z'], b['w'], b['d'], b['h'], b['color'], b.get('accent', '#8cb6bd'), b.get('shape', 'rect'))
    for b in _layout.get('buildings', [])
]
ROAD_NODES = [
    (n['id'], n['position'][0], n['position'][2], n.get('label', n['id']))
    for n in _road_source.get('nodes', [])
]
ROAD_EDGES = [(e['from'], e['to']) for e in _road_source.get('edges', [])]
_CUBE_MESH_CACHE = {}

def hex_color(value):
    value = value.lstrip('#')
    return tuple(int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (1,)

def material(name, color, metallic=0.0, roughness=0.65):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = hex_color(color) if isinstance(color, str) else color
    mat.use_nodes = True
    # Node names can differ between Blender 5.x builds; identify the shader
    # by type and create one if a custom startup file removed the default.
    bsdf = mat.node_tree.nodes.get('Principled BSDF') or next(
        (node for node in mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED'),
        None,
    )
    if bsdf is None:
        bsdf = mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = mat.diffuse_color
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    return mat

def cube(name, location, scale, mat, bevel=0.0, collection=None):
    # Authoring data uses Three.js coordinates (Y up). Blender is Z up, so
    # convert (x, y, z) -> (x, -z, y). The glTF exporter converts it back.
    blender_location = (location[0], -location[2], location[1])
    blender_scale = (scale[0], scale[2], scale[1])
    target_collection = collection or bpy.context.collection
    if not bevel:
        mesh_key = mat.name
        mesh = _CUBE_MESH_CACHE.get(mesh_key)
        if mesh is None:
            mesh = bpy.data.meshes.new(f'UNIT_CUBE_{mat.name}')
            verts = [(-.5,-.5,-.5),(.5,-.5,-.5),(.5,.5,-.5),(-.5,.5,-.5),(-.5,-.5,.5),(.5,-.5,.5),(.5,.5,.5),(-.5,.5,.5)]
            faces = [(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(4,0,3,7)]
            mesh.from_pydata(verts, [], faces); mesh.update(); mesh.materials.append(mat)
            _CUBE_MESH_CACHE[mesh_key] = mesh
        obj = bpy.data.objects.new(name, mesh)
        obj.location = blender_location
        obj.scale = blender_scale
        target_collection.objects.link(obj)
        return obj
    bpy.ops.mesh.primitive_cube_add(location=blender_location)
    obj = bpy.context.object; obj.name = name
    obj.scale = (blender_scale[0] / 2, blender_scale[1] / 2, blender_scale[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        bevel_mod = obj.modifiers.new('建筑柔化边角', 'BEVEL')
        bevel_mod.width = bevel
        bevel_mod.segments = 2
    obj.data.materials.append(mat)
    if collection:
        for col in list(obj.users_collection): col.objects.unlink(obj)
        collection.objects.link(obj)
    return obj

def cylinder(name, location, radius, depth, mat, vertices=12, collection=None):
    blender_location = (location[0], -location[2], location[1])
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=blender_location)
    obj = bpy.context.object; obj.name = name; obj.data.materials.append(mat)
    if collection:
        for col in list(obj.users_collection): col.objects.unlink(obj)
        collection.objects.link(obj)
    return obj

def arc_prism(name, location, width, depth, height, mat, collection=None, mirror=False):
    """Create a semicircular annular building mass.

    mirror=False → 凹口朝南（凸向 +Z），即 2#教学综合楼；
    mirror=True  → 关于中心镜像（凸向 -Z），即 1#教学综合楼；两者同心合成完整圆环。
    """
    outer, inner = CP._arc_radii(width, depth)
    segments = 32
    sign = -1.0 if mirror else 1.0
    verts = []
    # Angles run from 0..pi, giving a U-shaped footprint in X/Z.
    for y in (0.0, height):
        for radius in (outer, inner):
            for i in range(segments + 1):
                a = math.pi * i / segments
                world_x = location[0] + radius * math.cos(a)
                world_y = location[1] + y
                world_z = location[2] + sign * radius * math.sin(a)
                verts.append((world_x, -world_z, world_y))
    n = segments + 1
    faces = []
    # bottom/top ring and outer/inner curved walls
    for i in range(segments):
        j = i + 1
        faces += [(i, n + i, n + j, j), (2*n + i, 2*n + j, 3*n + j, 3*n + i)]
        faces += [(i, j, 2*n + j, 2*n + i), (n + i, 3*n + i, 3*n + j, n + j)]
    faces += [(0, 2*n, 3*n, n), (segments, n + segments, 3*n + segments, 2*n + segments)]
    mesh = bpy.data.meshes.new(f'{name}_MESH'); mesh.from_pydata(verts, [], faces); mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    (collection or bpy.context.collection).objects.link(obj)
    obj.data.materials.append(mat)
    return obj

def gable_roof(name, x, y, z, width, depth, height, mat, collection=None):
    """Create a shallow pitched roof with its ridge running north-south."""
    half_w = width / 2
    half_d = depth / 2
    verts = [
        (x - half_w, -(z - half_d), y),
        (x + half_w, -(z - half_d), y),
        (x, -(z - half_d), y + height),
        (x - half_w, -(z + half_d), y),
        (x + half_w, -(z + half_d), y),
        (x, -(z + half_d), y + height),
    ]
    faces = [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
    mesh = bpy.data.meshes.new(f'{name}_MESH'); mesh.from_pydata(verts, [], faces); mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    (collection or bpy.context.collection).objects.link(obj)
    obj.data.materials.append(mat)
    return obj

def tag_asset(obj, code, name, lod='LOD1'):
    obj['building_code'] = code
    obj['semantic_name'] = name
    obj['lod'] = lod
    return obj

def facade_strip(name, x, y, z, width, depth, mat, code, semantic_name, collection):
    obj = cube(name, (x, y, z), (width, .34, depth), mat, 0, collection)
    return tag_asset(obj, code, semantic_name)

def merge_building_shell(code, name, collection):
    """把一栋楼的墙体/屋顶/腰带/竖挺/雨棚/台阶/窗等合并为**单个 Mesh**。

    材质各自保留为材质槽（glTF 导出时是同一个 node 上的多个 primitive），
    因此「外墙 + 窗户」在运行时是一个对象：点击弹起可整体隐藏，落回整体恢复。

    纯 bpy.data / bmesh API 实现，不依赖 bpy.ops.object.join 的上下文，
    在 --background 模式下同样可靠（ops 版本需要 temp_override，容易失败）。
    变换用 matrix_basis 而不是 matrix_world —— 后者是 depsgraph 缓存，
    刚创建的对象还没求值，直接读会拿到单位矩阵。
    """
    parts = [o for o in collection.objects if o.type == 'MESH' and o.get('lod') != 'LOD2']
    if not parts:
        return None
    if len(parts) == 1:
        return parts[0]

    merged = bpy.data.meshes.new(f'{code}_shell_MESH')
    target_mats, mat_lookup = [], {}
    bm = bmesh.new()
    src_faces = 0
    for obj in parts:
        layer = obj.data.copy()
        layer.transform(obj.matrix_basis)
        remap = []
        for slot in layer.materials:
            key = slot.name if slot else '__none__'
            if key not in mat_lookup:
                mat_lookup[key] = len(target_mats)
                target_mats.append(slot)
            remap.append(mat_lookup[key])
        for poly in layer.polygons:
            src_faces += 1
            poly.material_index = remap[poly.material_index] if poly.material_index < len(remap) else 0
        bm.from_mesh(layer)          # from_mesh 是追加语义：多次调用即合并几何
        bpy.data.meshes.remove(layer)

    bm.to_mesh(merged)
    bm.free()
    for slot in target_mats:
        if slot is not None:
            merged.materials.append(slot)

    shell = bpy.data.objects.new(f'{code}_LOD1_shell', merged)
    collection.objects.link(shell)
    tag_asset(shell, code, name)
    shell['merged_parts'] = len(parts)
    for obj in parts:
        bpy.data.objects.remove(obj, do_unlink=True)
    print(f'  [合并] {code} {len(parts):4d} 个部件 -> 1 个 Mesh，'
          f'{len(target_mats)} 个材质槽，面数 {len(merged.polygons)}/{src_faces}')
    return shell


def building_assets(spec, rooms):
    code, name, kind, x, z, w, d, h, color, accent, shape = spec
    col = bpy.data.collections.new(f'{code}_{name}')
    bpy.context.scene.collection.children.link(col)
    body_mat = material(f'{code}_body', color, 0.025, 0.58)
    concrete_mat = material(f'{code}_concrete', '#e7e8e2', 0.01, .7)
    dark_mat = material(f'{code}_dark', '#263b42', .08, .38)
    if shape in ('arc', 'arc_mirror'):
        is_mirror = shape == 'arc_mirror'
        body = arc_prism(f'{code}_LOD1_shell', (x, 0, z), w, d, h, body_mat, col, mirror=is_mirror)
        body['shape'] = shape
    elif shape == 'u':
        wing_w = max(8, w * .28)
        back_d = max(7, d * .3)
        body = cube(f'{code}_LOD1_shell', (x, h / 2, z - d / 2 + back_d / 2), (w, h, back_d), body_mat, .28, col)
        for side in (-1, 1):
            wing = cube(f'{code}_wing_{side}', (x + side * (w - wing_w) / 2, h / 2, z + back_d / 2), (wing_w, h, d - back_d), body_mat, .28, col)
            tag_asset(wing, code, name)
        body['shape'] = 'u'
    elif shape == 'tower':
        podium_h = max(5.2, h * .27)
        body = cube(f'{code}_LOD1_shell', (x, podium_h / 2, z), (w, podium_h, d), body_mat, .3, col)
        tower = cube(f'{code}_tower', (x, podium_h + (h - podium_h) / 2, z - d * .03), (w * .72, h - podium_h, d * .82), concrete_mat, .34, col)
        tag_asset(tower, code, name)
        core = cube(f'{code}_roof_core', (x, h + 1.25, z), (w * .22, 2.5, d * .34), dark_mat, .18, col)
        tag_asset(core, code, name)
    else:
        body = cube(f'{code}_LOD1_shell', (x, h / 2, z), (w, h, d), body_mat, 0.28, col)
        body['shape'] = shape
    for old_col in list(body.users_collection): old_col.objects.unlink(body)
    col.objects.link(body)
    tag_asset(body, code, name)
    if shape in ('arc', 'arc_mirror'):
        roof = arc_prism(f'{code}_roof', (x, h, z), w + 1.2, max(0.8, d * 0.3), 0.5, material(f'{code}_roof', '#71805f', 0.02, 0.86), col, mirror=(shape == 'arc_mirror'))
    else:
        roof = cube(f'{code}_roof', (x, h + 0.25, z), (w + 1, 0.5, d + 1), material(f'{code}_roof', '#a9b2b2', 0.12, 0.5), 0.18, col)
    tag_asset(roof, code, name)
    window_mat = material(f'{code}_window', accent, 0.18, 0.24)
    floor_height = h / max(2, min(6, int(h // 3)))
    floor_count = max(2, min(6, int(h // floor_height)))
    front_count = max(5, int(w // 3.2))
    side_count = max(3, int(d // 3.5))
    for floor in range(floor_count):
        wy = min(h - 1.0, floor_height * floor + floor_height * .58)
        facade_strip(f'{code}_band_front_{floor}', x, floor_height * (floor + 1), z + d / 2 + .06, w * .94, .16, dark_mat, code, name, col)
        facade_strip(f'{code}_band_back_{floor}', x, floor_height * (floor + 1), z - d / 2 - .06, w * .94, .16, dark_mat, code, name, col)
        for i in range(front_count):
            wx = x - w / 2 + 1.8 + i * ((w - 3.6) / max(1, front_count - 1))
            for side, wz in (('F', z + d / 2 + .11), ('B', z - d / 2 - .11)):
                win = cube(f'{code}_window_{side}{floor+1}_{i+1}', (wx, wy, wz), (1.42, floor_height * .46, .13), window_mat, 0, col)
                tag_asset(win, code, name)
        if shape not in ('arc', 'arc_mirror'):
            for i in range(side_count):
                wz = z - d / 2 + 1.8 + i * ((d - 3.6) / max(1, side_count - 1))
                for side, wx in (('L', x - w / 2 - .11), ('R', x + w / 2 + .11)):
                    win = cube(f'{code}_window_{side}{floor+1}_{i+1}', (wx, wy, wz), (.13, floor_height * .46, 1.35), window_mat, 0, col)
                    tag_asset(win, code, name)
    # 沙盘实景中各单体均有明显的深色竖向端墙、首层雨棚与女儿墙。
    if shape not in ('arc', 'arc_mirror'):
        for side in (-1, 1):
            fin = cube(f'{code}_vertical_fin_{side}', (x + side * (w / 2 - .7), h * .52, z + d / 2 + .15), (1.0, h * .82, .3), dark_mat, .04, col)
            tag_asset(fin, code, name)
        canopy = cube(f'{code}_entrance_canopy', (x, 2.45, z + d / 2 + 2.0), (max(6, w * .25), .35, 4.0), concrete_mat, .16, col)
        tag_asset(canopy, code, name)
        for step in range(3):
            stairs = cube(f'{code}_entrance_step_{step}', (x, .12 + step * .12, z + d / 2 + 3.6 - step * .45), (max(7, w * .29), .24, 1.0), concrete_mat, .04, col)
            tag_asset(stairs, code, name, 'LOD0')
        roof_core = cube(f'{code}_stair_core', (x + w * .24, h + .75, z - d * .13), (max(3.8, w * .12), 1.5, max(3.8, d * .24)), concrete_mat, .15, col)
        tag_asset(roof_core, code, name)

    # The built 4# complex is identified by a broad south-facing glass wall,
    # dense vertical fins and two rising white facade bands.
    if shape == 'tower':
        south_z = z - d / 2 - .18
        glass = cube(f'{code}_signature_glass', (x, h * .60, south_z), (w * .66, h * .62, .24), material(f'{code}_signature_glass_mat', '#315765', .22, .2), .04, col)
        tag_asset(glass, code, name)
        for index in range(15):
            fin_x = x - w * .32 + index * (w * .64 / 14)
            fin = cube(f'{code}_signature_fin_{index}', (fin_x, h * .60, south_z - .18), (.22, h * .64, .24), concrete_mat, .025, col)
            tag_asset(fin, code, name)
        for side in (-1, 1):
            frame = cube(f'{code}_signature_frame_{side}', (x + side * w * .345, h * .60, south_z - .2), (1.0, h * .7, .38), concrete_mat, .04, col)
            tag_asset(frame, code, name)
        for index, band_y in enumerate((h * .36, h * .47)):
            band = cube(f'{code}_rising_band_{index}', (x, band_y, south_z - .32), (w * .72, .76, .5), concrete_mat, .04, col)
            band.rotation_euler[1] = math.radians(-4.2)
            tag_asset(band, code, name)

    # The sports hall in the physical maquette uses a repeated pitched roof.
    if code == 'B21':
        roof_mat = material(f'{code}_pitched_roof', '#78868a', .1, .48)
        bay_width = w / 3
        for bay in range(3):
            roof_piece = gable_roof(f'{code}_roof_bay_{bay}', x - w / 2 + bay_width * (bay + .5), h + .45, z, bay_width + .35, d + .8, 3.1, roof_mat, col)
            tag_asset(roof_piece, code, name)
    # 外壳合并：必须在房间数据生成之前调用，此时 collection 里只有外壳部件。
    # 合并后整栋楼只占 1 个 glTF node（原来光窗户就有 220~290 个 node/栋）。
    merge_building_shell(code, name, col)

    # LOD2 房间单元：层数与每层网格统一取自 scripts/campus_program.py
    #   教学楼/实验楼 5 层 × (4 列进深 Z × 5 行面宽 X) = 每层 20 间，编号 101~120
    #   宿舍 6 层 × 20 间（每间 6 人）；图书馆地上 9 层。
    spec_dict = {'id': code, 'name': name, 'type': kind, 'shape': shape,
                 'x': x, 'z': z, 'w': w, 'd': d, 'h': h}
    # 房间**只产出锚点数据**，不再生成 Blender 对象：前端「弹起内剖」用
    # room_anchors.json 自行生成立方体，glb 里的房间节点纯属冗余
    # （原来 2720 个 node + 2720 次 primitive_cube_add，是生成耗时的大头）。
    rooms.extend(CP.build_rooms(spec_dict))

def tree_assets():
    tree_col = bpy.data.collections.new('生活场景_树木实例')
    bpy.context.scene.collection.children.link(tree_col)
    trunk = cylinder('TREE_TRUNK_SOURCE', (0, 1.8, 0), .22, 3.6, material('tree_trunk', '#584335'), 7, tree_col)
    crown = bpy.data.meshes.new('TREE_CROWN_SOURCE_MESH')
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=2.2, location=(0, 0, 4))
    crown_obj = bpy.context.object; crown_obj.name = 'TREE_CROWN_SOURCE'; crown_obj.data.materials.append(material('tree_green', '#2f6b5b', 0, .9))
    for obj in (trunk, crown_obj):
        for col in list(obj.users_collection): col.objects.unlink(obj)
        tree_col.objects.link(obj)
    trunk.hide_render = True; crown_obj.hide_render = True
    trunk.hide_viewport = True; crown_obj.hide_viewport = True
    footprints = [(x - w / 2 - 3, x + w / 2 + 3, z - d / 2 - 3, z + d / 2 + 3) for _, _, _, x, z, w, d, *_ in BUILDINGS]
    landmarks = {item['id']: item for item in _layout.get('landmarks', [])}
    lake = landmarks.get('north_lake', {'x': 173, 'z': 149})
    positions = []
    for x in range(-252, 253, 12): positions += [(x, -202), (x, 202)]
    for z in range(-190, 191, 12): positions += [(-252, z), (252, z)]
    for z in range(-176, 48, 11): positions += [(-15, z), (15, z)]
    for x in range(-230, 231, 13): positions += [(x, 182)]
    for ring in range(3):
        radius = 32 + ring * 13
        for i in range(22 + ring * 5):
            a = math.tau * i / (22 + ring * 5)
            positions.append((lake['x'] + math.cos(a) * radius, lake['z'] + math.sin(a) * radius * .62))
    for i in range(72):
        a = math.tau * i / 72
        radius = 23 + (i % 5) * 4.2
        positions.append((math.cos(a) * radius, 82 + math.sin(a) * radius * .68))
    positions += [(-116, 62), (-124, 69), (-132, 76), (-92, 92), (-72, 104), (64, 126), (78, 138), (96, 154)]
    valid = []
    for px, pz in positions:
        if any(left <= px <= right and bottom <= pz <= top for left, right, bottom, top in footprints):
            continue
        if any(math.hypot(px - x, pz - z) < 5 for x, z in valid):
            continue
        valid.append((px, pz))
    crown_mats = [material('tree_green', '#2f6b5b', 0, .9), material('tree_gold', '#b48139', 0, .92), material('tree_blossom', '#d69aa2', 0, .88)]
    crown_meshes = []
    for index, crown_mat in enumerate(crown_mats):
        mesh = crown_obj.data.copy(); mesh.name = f'TREE_CROWN_MESH_{index}'; mesh.materials.clear(); mesh.materials.append(crown_mat); crown_meshes.append(mesh)
    for i, (px, pz) in enumerate(valid):
        scale = 1.18 if i % 9 == 0 else (.72 + (i % 5) * .075)
        local_trunk = trunk.copy(); local_trunk.data = trunk.data; local_trunk.hide_render = False; local_trunk.hide_viewport = False
        local_trunk.name = f'TREE_{i:03d}_TRUNK'; local_trunk.location = (px, -pz, 1.8 * scale); local_trunk.scale = (scale, scale, scale)
        tree_col.objects.link(local_trunk)
        crown_index = 1 if 118 < pz < 190 and i % 4 == 0 else 2 if i % 13 == 0 else 0
        local_crown = crown_obj.copy(); local_crown.data = crown_meshes[crown_index]; local_crown.hide_render = False; local_crown.hide_viewport = False
        local_crown.name = f'TREE_{i:03d}_CROWN'; local_crown.location = (px, -pz, 4 * scale); local_crown.scale = (scale, scale, scale)
        local_crown['asset_type'] = 'tree'; local_crown['instance_index'] = i; tree_col.objects.link(local_crown)

def create_road_graph():
    node_map = {n[0]: n for n in ROAD_NODES}
    road_mat = material('road_surface', '#30444b', 0, .9)
    mark_mat = material('road_marking', '#b5bfaa', 0, .65)
    nodes_col = bpy.data.collections.new('路网_节点与边')
    bpy.context.scene.collection.children.link(nodes_col)
    node_mat = material('route_node', '#f0c86c', .3, .4)
    for node_id, x, z, label in ROAD_NODES:
        cylinder(f'NODE_{node_id}', (x, .18, z), .7, .22, node_mat, 16, nodes_col)['node_id'] = node_id
    edge_source = {(edge['from'], edge['to']): edge for edge in _road_source.get('edges', [])}
    for edge_index, (a, b) in enumerate(ROAD_EDGES):
        edge = edge_source[(a, b)]
        path = [(point[0], point[2]) for point in edge.get('geometry', [])]
        for segment_index, ((sx, sz), (ex, ez)) in enumerate(zip(path, path[1:])):
            length = math.hypot(ex - sx, ez - sz)
            mid = ((sx + ex) / 2, .08, (sz + ez) / 2); angle = math.atan2(ez - sz, ex - sx)
            road = cube(f'ROAD_{edge_index:02d}_{segment_index}_{a}_{b}', mid, (length, .16, 4.8), road_mat, .06, nodes_col); road.rotation_euler[2] = -angle; road['edge_from'] = a; road['edge_to'] = b; road['indoor'] = False
            mark = cube(f'ROAD_MARK_{edge_index:02d}_{segment_index}', (mid[0], .18, mid[2]), (length, .02, .12), mark_mat, .01, nodes_col); mark.rotation_euler[2] = -angle

def stadium_ring(name, x, z, straight, radius, width, mat):
    segments = 28
    def capsule(r):
        points = []
        half = straight / 2
        for i in range(segments + 1):
            a = -math.pi / 2 + math.pi * i / segments
            world_x, world_z = x + half + math.cos(a) * r, z + math.sin(a) * r
            points.append((world_x, -world_z, .12))
        for i in range(segments + 1):
            a = math.pi / 2 + math.pi * i / segments
            world_x, world_z = x - half + math.cos(a) * r, z + math.sin(a) * r
            points.append((world_x, -world_z, .12))
        return points
    outer = capsule(radius)
    inner = capsule(radius - width)
    verts = outer + inner
    count = len(outer)
    faces = []
    for i in range(count):
        j = (i + 1) % count
        faces.append((i, j, count + j, count + i))
    mesh = bpy.data.meshes.new(f'{name}_MESH'); mesh.from_pydata(verts, [], faces); mesh.update()
    obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj); obj.data.materials.append(mat)
    return obj

def irregular_disc(name, x, z, points, mat, y=.1):
    verts = [(x + px, -(z + pz), y) for px, pz in points]
    mesh = bpy.data.meshes.new(f'{name}_MESH'); mesh.from_pydata(verts, [], [tuple(range(len(verts)))]); mesh.update()
    obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj); obj.data.materials.append(mat)
    return obj

def campus_ground():
    extent_x, extent_z = _layout.get('coordinate_system', {}).get('model_extent_m', [528, 427])
    cube('CAMPUS_GROUND', (0, -.5, 0), (extent_x, 1, extent_z), material('ground', '#718368', 0, .96), .2)
    # 校园四周城市道路与东缘水渠是沙盘辨识度最高的边界元素。
    road_mat = material('perimeter_road', '#293238', .02, .84)
    cube('BOUNDARY_ROAD_SOUTH', (0, .01, -extent_z / 2 + 5), (extent_x, .12, 10), road_mat, .4)
    cube('BOUNDARY_ROAD_EAST', (extent_x / 2 - 5, .01, 0), (10, .12, extent_z), road_mat, .4)
    paving = material('campus_paving', '#c8c8bb', .01, .9)
    paving_dark = material('campus_paving_border', '#87918b', .02, .82)
    # The south gate, teaching quadrangles and central complex share one long
    # pedestrian axis in all south-facing reference photographs.
    cube('中央主轴铺装', (0, .035, -78), (31, .10, 222), paving, .6)
    cube('中央主轴西边界', (-15.8, .09, -78), (.65, .08, 222), paving_dark, .1)
    cube('中央主轴东边界', (15.8, .09, -78), (.65, .08, 222), paving_dark, .1)
    cube('实验综合楼前广场', (0, .04, -34), (78, .10, 37), paving, 1.2)
    cube('文化核心环形广场', (0, .035, 88), (112, .08, 74), paving, 7.0)
    # Long planted islands reproduce the paired rectangular lawns visible on
    # the main axis without blocking the navigation graph.
    island_mat = material('axis_lawn', '#506d4e', 0, .98)
    for island_z in (-151, -102, -55):
        cube(f'主轴景观岛_{island_z}', (0, .12, island_z), (12, .16, 26), island_mat, 1.2)
    landmarks = {item['id']: item for item in _layout.get('landmarks', [])}
    track_data = landmarks['sports_field']; tx, tz = track_data['x'], track_data['z']
    stadium_ring('运动场_400m跑道', tx, tz, 50, 31, 5.4, material('track', '#ca5962', .02, .72))
    cube('运动场_草坪', (tx, .08, tz), (58, .14, 39), material('field', '#39714a', 0, .86), 1.5)
    # 白色场线、球门与看台保留为独立资产，方便 Web 端按图层控制。
    line_mat = material('sports_line', '#e8eadf', 0, .46)
    for offset in (-19, 0, 19): cube(f'运动场_横向标线_{offset}', (tx + offset, .18, tz), (.16, .03, 38), line_mat)
    cube('运动场_中线', (tx, .18, tz), (.16, .03, 38), line_mat)
    for side in (-1, 1):
        cube(f'足球门_{side}_横梁', (tx + side * 27.6, 1.5, tz), (.18, .18, 7.3), line_mat)
        for dz in (-3.55, 3.55): cube(f'足球门_{side}_{dz}', (tx + side * 27.6, .75, tz + dz), (.18, 1.5, .18), line_mat)
    court_data = landmarks['basketball_courts']; cx, cz = court_data['x'], court_data['z']
    court_mat = material('court_surface', '#3c9d9a', 0, .8)
    for row in range(2):
        for col in range(2):
            px, pz = cx + col * 19, cz + row * 31
            cube(f'篮球场_{row}_{col}', (px, .08, pz), (16, .12, 28), court_mat, .7)
            cube(f'篮球场中线_{row}_{col}', (px, .16, pz), (15, .02, .12), line_mat)
    lake_data = landmarks['north_lake']; lx, lz = lake_data['x'], lake_data['z']
    lake_points = [(-30,-5),(-24,-18),(-7,-24),(11,-22),(29,-10),(34,5),(20,18),(5,22),(-13,19),(-31,9)]
    irregular_disc('北侧生态湖', lx, lz, lake_points, material('lake', '#2b8893', .22, .2), .11)
    hill_data = landmarks['north_hill']; hx, hz = hill_data['x'], hill_data['z']
    for i, (ox, oz, radius, height) in enumerate([(-17, 0, 22, 8), (9, 2, 26, 11), (27, -7, 18, 7), (1, 18, 20, 8)]):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1, location=(hx + ox, -(hz + oz), height * .18))
        hill = bpy.context.object; hill.name = f'北侧山林地形_{i}'; hill.scale = (radius, radius * .72, height * .72); hill.data.materials.append(material('hill', '#3d6044', 0, .98))
    channel = landmarks['east_channel']
    cube('东缘水渠', (channel['x'], .05, channel['z']), (8, .1, 250), material('channel', '#2f8993', .18, .24), 2.0)
    # 南校门按照片复刻为薄翼形门廊。
    gate_z = _layout.get('coordinate_system', {}).get('spawn', [0, 2, -188])[2] - 2
    gate_mat = material('gate_concrete', '#ece9df', .03, .5)
    cube('南校门_横梁', (0, 4.2, gate_z), (38, 1.0, 3.0), gate_mat, 1.3)
    for gx in (-17.5, 17.5): cube(f'南校门_立柱_{gx}', (gx, 2.0, gate_z), (1.2, 4, 2.2), gate_mat, .18)
    # 路灯沿主轴布置，匹配沙盘中的低矮白色灯杆。
    pole_mat = material('lamp_pole', '#d7ddd8', .35, .28)
    for index, z in enumerate(range(-170, 43, 18)):
        for side in (-1, 1):
            px = side * 18
            cylinder(f'路灯_{index}_{side}_杆', (px, 2.2, z), .08, 4.4, pole_mat, 10)
            cube(f'路灯_{index}_{side}_头', (px, 4.45, z), (1.2, .18, .45), pole_mat, .12)

def reference_photo_planes():
    """把真实沙盘照片挂入 Blender 场景作为可开关的比例/色彩校准参考。"""
    col = bpy.data.collections.new('参考图_真实沙盘照片')
    bpy.context.scene.collection.children.link(col)
    # Keep all source angles available for camera/scale checking. The empties
    # are hidden from renders and arranged as a contact sheet beside the scene.
    refs = [(f'REF_VIEW_{i:02d}', f'reference/view_{i:02d}.jpg', (-150 + ((i - 1) % 4) * 42, 32, -105 + ((i - 1) // 4) * 34), (0.18, 0.18, 0.18)) for i in range(1, 17)]
    refs += [('REF_OVERVIEW', 'photo-overview.jpg', (-115, 28, -86), (0.42, 0.42, 0.42)), ('REF_SPORTS', 'photo-sports.jpg', (-115, 28, -45), (0.25, 0.25, 0.25)), ('REF_CENTER', 'photo-center.jpg', (-115, 28, -4), (0.25, 0.25, 0.25))]
    for name, filename, location, scale in refs:
        path = os.path.join(ASSET_DIR, filename)
        if not os.path.exists(path):
            continue
        try:
            image = bpy.data.images.load(path, check_existing=True)
            empty = bpy.data.objects.new(name, None)
            empty.empty_display_type = 'IMAGE'
            empty.data = image
            empty.empty_display_size = 18
            empty.location = location
            empty.rotation_euler = (math.radians(90), 0, 0)
            empty.scale = scale
            empty.hide_render = True
            empty['source_photo'] = filename
            empty['usage'] = '建筑间距比例 / 道路色彩 / 植被与地形参考'
            col.objects.link(empty)
        except Exception as exc:
            print(f'Reference image skipped: {filename} ({exc})')

def setup_render():
    world = bpy.context.scene.world
    world.use_nodes = True
    background = world.node_tree.nodes.get('Background')
    background.inputs['Color'].default_value = (0.11, 0.16, 0.18, 1)
    background.inputs['Strength'].default_value = .68
    bpy.ops.object.light_add(type='SUN', location=(-160, -120, 240))
    sun = bpy.context.object; sun.name = 'SUN_午后主光'; sun.rotation_euler = (math.radians(28), math.radians(-18), math.radians(-32)); sun.data.energy = 3.0; sun.data.angle = math.radians(8)
    bpy.ops.object.light_add(type='AREA', location=(80, -110, 160))
    fill = bpy.context.object; fill.name = 'AREA_天空补光'; fill.data.energy = 1800; fill.data.shape = 'DISK'; fill.data.size = 180
    bpy.ops.object.camera_add(location=(325, 525, 345))
    camera = bpy.context.object; camera.name = 'CAMERA_校园总览'; bpy.context.scene.camera = camera
    target = Vector((0, -8, 4)); direction = target - camera.location; camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler(); camera.data.lens = 54
    scene = bpy.context.scene
    scene.render.resolution_x = 1600; scene.render.resolution_y = 1000; scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'; scene.render.filepath = os.path.join(ROOT, 'renders', 'campus-preview.png')
    scene.render.film_transparent = False
    try:
        scene.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    scene.view_settings.exposure = .65

def main():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for col in list(bpy.data.collections):
        if col.name != 'Collection': bpy.data.collections.remove(col)
    bpy.context.scene.unit_settings.system = 'METRIC'; bpy.context.scene.unit_settings.scale_length = 1.0
    # Blender 5.1.2 exposes the Eevee engine as BLENDER_EEVEE; keep a
    # fallback for builds that still use the newer enum name.
    try:
        bpy.context.scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        bpy.context.scene.render.engine = 'BLENDER_EEVEE'
    bpy.context.scene.world.color = (0.015, 0.04, 0.055)
    rooms = []
    for spec in BUILDINGS: building_assets(spec, rooms)
    campus_ground(); tree_assets(); create_road_graph(); reference_photo_planes(); setup_render()
    anchors = {
        'coordinate_system': {'unit': 'meter', 'up_axis': 'Y', 'origin': 'campus_geographic_center'},
        'grid_spec': {
            'rooms_per_floor': 20,
            'layout': '4 列(进深 Z) × 5 行(面宽 X)',
            'numbering': '101 + 列序*5 + 行序',
            'floor_height_m': CP.FLOOR_HEIGHT,
        },
        'rooms': rooms,
    }
    with open(os.path.join(DATA_DIR, 'room_anchors.json'), 'w', encoding='utf-8') as f:
        json.dump(anchors, f, ensure_ascii=False, indent=2)
    bpy.context.scene['project_name'] = '岳阳学院智慧校园数字孪生'
    bpy.context.scene['source_reference'] = 'public/assets/reference/view_01.jpg … view_16.jpg; multi-angle campus maquette capture'
    bpy.context.scene['layout_source'] = 'data/campus_layout.json'
    bpy.context.scene['road_source'] = 'data/road_graph.json'
    bpy.context.scene['route_rule'] = '室外路网边不进入任何建筑 footprint；室内路径只通过 LOD2 房间节点生成'
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'blender', 'yueyang_campus.blend'))
    try:
        bpy.ops.render.render(write_still=True)
    except Exception as exc:
        print(f'Preview render skipped: {exc}')
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.data.objects:
        if obj.type == 'MESH' and not obj.hide_render:
            obj.select_set(True)
    glb_path = os.path.join(ASSET_DIR, 'yueyang_campus.glb')
    # export_texcoords=False：全场景 0 张贴图，UV 纯属浪费（实测占 1.88MB / 22%）。
    # 导出后必须打印体积——原来异常被静默吞掉，看不出导出到底成没成。
    try:
        bpy.ops.export_scene.gltf(filepath=glb_path, export_format='GLB', export_apply=True,
                                  use_selection=True, export_texcoords=False)
        print(f'GLB exported: {os.path.getsize(glb_path) / 1024 / 1024:.2f} MB')
    except Exception as exc:
        print(f'GLB export 带 export_texcoords 失败，回退默认参数: {exc}')
        bpy.ops.export_scene.gltf(filepath=glb_path, export_format='GLB', export_apply=True,
                                  use_selection=True)
        print(f'GLB exported (fallback): {os.path.getsize(glb_path) / 1024 / 1024:.2f} MB')

if __name__ == '__main__': main()
