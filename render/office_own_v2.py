"""
Uniser SmartSpaces - Commercial Office Workspace  ("light runway" concept, own design)
Built to the art-direction spec: 26 x 18 m, window wall left, camera near-right corner (21 mm, 1.45 m, level, shift 0.08),
benches perpendicular to the window, glass conference room centre, lounge right. Final 1536 x 1064.
Renders one linear EXR pass per lighting circuit, same pipeline as the cabin.

  Blender -b -P office_own_v2.py -- --build              # build + save .blend only
  Blender -b -P office_own_v2.py -- --skytest            # 4 quick renders at HDRI rotations 0/90/180/270
  add --skyrot=<deg> to any command to use the rotation you picked
  Blender -b -P office_own_v2.py -- --preview            # 960x540, blinds open
  Blender -b -P office_own_v2.py -- --final              # 1920x1080, blinds open
  Blender -b -P office_own_v2.py -- --final --closed     # blinds lowered + tilted
  Blender -b -P office_own_v2.py -- --final --fanblur    # fan region only, motion-blurred blades (cheap)

Assets in models/office/: chair_task, fan_ceiling, sky/*.exr (daytime). Falls back to geometry if missing.
Also uses models/lobby/plant_* and models/cabin/sofa_*.
"""

import bpy, bmesh, math, os, sys, json, random, glob
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MODE = "final" if "--final" in ARGS else "build" if "--build" in ARGS else "preview"
CLOSED = "--closed" in ARGS
FANBLUR = "--fanblur" in ARGS
SKYTEST = "--skytest" in ARGS
TAG = MODE + ("_closed" if CLOSED else "") + ("_fan" if FANBLUR else "")
BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "out_office")
ASSET_DIR = os.path.join(BASE, "models", "office")
os.makedirs(OUT, exist_ok=True)
random.seed(21)
rad = math.radians

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
VL = scene.view_layers[0]
ROOT = bpy.data.collections.new("Office")
scene.collection.children.link(ROOT)

# ---------------------------------------------------------------- plan  ("light runway": one-point view down a central spine to a full-width window wall)
# left: desk pods in two occupancy zones (A front, B back) | centre: white spine ceiling with cove + AC
# right: break lounge (front, fan) and glass meeting room (back) | far end: full-width curtain wall + blinds
W, D = 16.0, 20.0
HX = 3.6
RAFT_Z = 3.0
SPINE = (6.2, 9.8)                      # white spine raft over the walkway
COF = dict(x0=6.8, x1=9.2, y0=0.8, y1=D - 1.6, z=3.35)
RAFT_X = SPINE[0]
WIN_B = (0.0, W)
BAY = 1.6
ROWS_A = [5.2, 8.0]                     # occupancy zone A (front)
ROWS_B = [11.2, 14.0, 16.8]             # occupancy zone B (back)
POD = (0.9, 6.5)                        # 2 x 4 seats, perpendicular to the spine
CAP_X = (6.5, 7.1)
MR = dict(x0=10.4, x1=W, y0=11.0, y1=17.0)
TC = (13.2, 14.0)
FAN = (13.8, 6.5)
AC = (8.0, 10.0)
CAM_POS = (8.0, 0.4, 1.6)
SKY_ROT = rad(float(next((a.split("=")[1] for a in ARGS if a.startswith("--skyrot=")), "180")))
SKY_SHIFT = 0.06
SKY_STRENGTH = 1.2
CHAIR_ROT = 0.0
SOFA_ROT = 0.0
RAFT = dict(x0=RAFT_X, z=RAFT_Z)

CIRCUITS = ["ow_general", "ow_linear", "ow_task_a", "ow_task_b", "ow_cove", "ow_meeting", "ow_break", "ow_accent", "ow_display"]
DAY = ["day_morning", "day_midday", "day_evening"]
GROUPS = CIRCUITS + DAY + ["sky"]
for g in GROUPS:
    VL.lightgroups.add(name=g)


# ---------------------------------------------------------------- materials
def lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)

def setin(node, name, val):
    s = node.inputs.get(name)
    if s is not None:
        s.default_value = val

def principled(name, hexc, rough=0.5, metal=0.0, **kw):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    setin(b, "Base Color", (*lin(hexc), 1)); setin(b, "Roughness", rough); setin(b, "Metallic", metal)
    for k, v in kw.items():
        setin(b, k.replace("_", " "), v)
    return m

def procedural(name, stops, rough, kind="noise", scale=1.0, mscale=(1, 1, 1), distortion=2.0,
               detail=8.0, bump=0.0, coat=0.0, tiles=None):
    m = principled(name, "#808080", rough, Coat_Weight=coat, Coat_Roughness=0.05)
    nt = m.node_tree; N = nt.nodes; L = nt.links; b = N["Principled BSDF"]
    tc = N.new("ShaderNodeTexCoord")
    mp = N.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = mscale
    L.new(tc.outputs["Object"], mp.inputs["Vector"])
    if kind == "wave":
        t = N.new("ShaderNodeTexWave"); t.wave_type = "BANDS"
    else:
        t = N.new("ShaderNodeTexNoise")
    setin(t, "Scale", scale); setin(t, "Distortion", distortion); setin(t, "Detail", detail)
    L.new(mp.outputs["Vector"], t.inputs["Vector"])
    cr = N.new("ShaderNodeValToRGB"); els = cr.color_ramp.elements
    for i, (pos, hx) in enumerate(stops):
        e = els[i] if i < 2 else els.new(pos)
        e.position = pos; e.color = (*lin(hx), 1)
    L.new(t.outputs["Fac"], cr.inputs["Fac"])
    col = cr.outputs["Color"]
    if tiles:
        br = N.new("ShaderNodeTexBrick"); br.offset = 0.5
        setin(br, "Scale", 1.0); setin(br, "Mortar Size", 0.003); setin(br, "Mortar Smooth", 0.3)
        setin(br, "Brick Width", tiles[0]); setin(br, "Row Height", tiles[1])
        L.new(tc.outputs["Object"], br.inputs["Vector"])
        mix = N.new("ShaderNodeMixRGB"); mix.inputs["Color2"].default_value = (*lin(tiles[2] if len(tiles) > 2 else "#4a4641"), 1)
        L.new(br.outputs["Fac"], mix.inputs["Fac"]); L.new(col, mix.inputs["Color1"]); col = mix.outputs["Color"]
    L.new(col, b.inputs["Base Color"])
    if bump:
        bp = N.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = bump
        L.new(t.outputs["Fac"], bp.inputs["Height"]); L.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m

def emission(name, strength, hexc="#ffffff"):
    m = bpy.data.materials.new(name); m.use_nodes = True
    N = m.node_tree.nodes; L = m.node_tree.links; N.clear()
    e = N.new("ShaderNodeEmission"); e.inputs["Strength"].default_value = strength; e.inputs["Color"].default_value = (*lin(hexc), 1)
    o = N.new("ShaderNodeOutputMaterial"); L.new(e.outputs[0], o.inputs["Surface"])
    return m

def glass(name, tint=0.18):
    m = bpy.data.materials.new(name); m.use_nodes = True
    N = m.node_tree.nodes; L = m.node_tree.links; N.clear()
    tr = N.new("ShaderNodeBsdfTransparent")
    sp = N.new("ShaderNodeBsdfPrincipled"); setin(sp, "Base Color", (0, 0, 0, 1)); setin(sp, "Roughness", 0.02); setin(sp, "Specular IOR Level", tint)
    add = N.new("ShaderNodeAddShader"); o = N.new("ShaderNodeOutputMaterial")
    L.new(tr.outputs[0], add.inputs[0]); L.new(sp.outputs[0], add.inputs[1]); L.new(add.outputs[0], o.inputs["Surface"])
    return m

def screen_mat():
    """Wall TV: a soft mountain-and-lake style gradient (no image needed)."""
    m = bpy.data.materials.new("tv_screen"); m.use_nodes = True
    N = m.node_tree.nodes; L = m.node_tree.links; N.clear()
    tc = N.new("ShaderNodeTexCoord"); sx = N.new("ShaderNodeSeparateXYZ"); cr = N.new("ShaderNodeValToRGB")
    els = cr.color_ramp.elements
    for i, (pos, hx) in enumerate(((0.0, "#1d3b52"), (0.45, "#6f8fa6"), (0.5, "#2a3a44"), (0.62, "#9db6c8"), (1.0, "#cfdce6"))):
        e = els[i] if i < 2 else els.new(pos); e.position = pos; e.color = (*lin(hx), 1)
    L.new(tc.outputs["Generated"], sx.inputs[0]); L.new(sx.outputs["Z"], cr.inputs["Fac"])
    em = N.new("ShaderNodeEmission"); em.inputs["Strength"].default_value = 6.0
    o = N.new("ShaderNodeOutputMaterial")
    L.new(cr.outputs["Color"], em.inputs["Color"]); L.new(em.outputs[0], o.inputs["Surface"])
    return m

MAT = dict(
    floor=procedural("polished_concrete", [(0.0, "#77746f"), (0.5, "#8a8782"), (1.0, "#7f7c77")], 0.22,
                     scale=0.35, distortion=2.5, detail=9, coat=0.18),
    slab=procedural("exposed_slab", [(0.0, "#8a8783"), (0.5, "#97948f"), (1.0, "#8f8c87")], 0.9, scale=6.0, distortion=0.4, detail=12, bump=0.25, tiles=(2.4, 1.2, "#6f6c68")),
    moss=procedural("moss_wall", [(0.0, "#24361d"), (0.45, "#3d5a2c"), (0.7, "#557a38"), (1.0, "#2f4624")], 0.95, scale=28.0, distortion=1.5, detail=14, bump=0.6),
    duct=principled("duct_metal", "#4a4a4a", 0.45, 0.8),
    darkwood=procedural("dark_wood", [(0.0, "#1e1611"), (0.6, "#2b1f17"), (1.0, "#35271c")], 0.35, kind="wave", scale=11.0, mscale=(1, 0.12, 1), distortion=2.0, detail=3, coat=0.4),
    wall_left=procedural("plaster_offwhite", [(0.0, "#ddd6ca"), (1.0, "#e6e0d5")], 0.85, scale=3.0, bump=0.02),
    wall_right=procedural("plaster_beige", [(0.0, "#c4b39b"), (1.0, "#cfbfa8")], 0.85, scale=4.0, bump=0.05),
    matte=principled("matte_panel", "#bba98f", 0.95),
    roller=principled("roller_blind", "#d2cbc0", 0.9, Transmission_Weight=0.25),
    raft=procedural("raft_plaster", [(0.0, "#d9d3ca"), (1.0, "#e4dfd7")], 0.9, scale=2.0, bump=0.02),
    wall=procedural("wall_plaster", [(0.0, "#b9b0a3"), (1.0, "#c6beb2")], 0.85, scale=3.0, bump=0.03),
    wood=procedural("oak", [(0.0, "#5e4027"), (0.6, "#74512f"), (1.0, "#86603b")], 0.5,
                    kind="wave", scale=14.0, mscale=(1, 1, 0.12), distortion=2.5, detail=3, coat=0.1),
    desk=procedural("desk_ash", [(0.0, "#cdb795"), (0.6, "#d8c4a4"), (1.0, "#e0ceb0")], 0.4, kind="wave", scale=11.0, mscale=(1, 0.12, 1), distortion=2.0, detail=3, coat=0.1),
    beam=principled("black_beam", "#1e1e1e", 0.6, 0.2),
    metal=principled("black_metal", "#1b1917", 0.4, 0.8),
    alu=principled("aluminium", "#9a9a98", 0.35, 1.0),
    screen_fabric=principled("screen_fabric", "#77746f", 0.95, Sheen_Weight=0.4),
    planter=principled("planter_black", "#1d1c1a", 0.6),
    monitor=principled("monitor_black", "#0c0c0d", 0.3),
    monitor_screen=principled("monitor_off", "#050608", 0.08, Coat_Weight=1.0),
    laptop=principled("laptop_alu", "#b7b8ba", 0.3, 1.0),
    blind=principled("blind_slat", "#bdb7ad", 0.55, 0.2),
    green=principled("fabric_olive", "#6a6b44", 0.9, Sheen_Weight=0.5),
    grey=principled("fabric_grey", "#bdb7ae", 0.9, Sheen_Weight=0.5),
    pillow=principled("fabric_pillow", "#8d8a6a", 0.9, Sheen_Weight=0.5),
    rug_grey=procedural("rug_grey", [(0.0, "#5d5b58"), (0.45, "#6e6b67"), (0.55, "#7c7975"), (1.0, "#64615d")], 0.95, scale=55.0, distortion=1.0, detail=8, bump=0.2),
    marble=principled("marble_top", "#2b2723", 0.12, Coat_Weight=0.8),
    ceramic=principled("ceramic_white", "#e8e3da", 0.35),
    grille=principled("grille", "#e6e3de", 0.6),
    rug=procedural("rug", [(0.0, "#7d756b"), (0.45, "#948b80"), (0.55, "#a39a8e"), (1.0, "#857d73")], 0.95, scale=40.0, distortion=1.0, detail=6, bump=0.15),
    engrave=principled("letters", "#3a352f", 0.6),
    leaf=principled("foliage", "#2d4626", 0.45, Subsurface_Weight=0.15),
    window=glass("window_glass"),
    partition=glass("partition_glass", 0.3),
    tv=screen_mat(),
    led=emission("led_strip", 30.0),
    lens=emission("downlight_lens", 25.0),
    keypad=emission("keypad_glow", 4.0),
)
BOOKS = [principled(f"book_{i}", h, 0.7) for i, h in enumerate(("#2a1c14", "#4a3424", "#1f2430", "#6b5a44", "#c9bfae", "#5e2a20"))]


# ---------------------------------------------------------------- mesh helpers (same as cabin)
def finish(name, bm, mat, loc=(0, 0, 0), rot=(0, 0, 0), smooth=None):
    bm.normal_update()
    if smooth:
        for f in bm.faces:
            f.smooth = smooth(f)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    if mat:
        me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.location = loc; ob.rotation_euler = rot
    ROOT.objects.link(ob)
    return ob

def bevel(ob, w):
    if w:
        m = ob.modifiers.new("bevel", "BEVEL"); m.width = w; m.segments = 3; m.limit_method = "ANGLE"
    return ob

def boxb(name, x0, x1, y0, y1, z0, z1, mat, bev=0.0, group=None):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))), verts=bm.verts)
    ob = bevel(finish(name, bm, mat, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)), bev)
    if group:
        ob.lightgroup = group
    return ob

def cyl(name, r0, r1, h, base, mat, seg=32, caps=True, rot=(0, 0, 0), group=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, segments=seg, radius1=r0, radius2=r1, depth=h, matrix=Matrix.Translation((0, 0, h / 2)))
    ob = finish(name, bm, mat, base, rot, smooth=lambda f: abs(f.normal.z) < 0.7)
    if group:
        ob.lightgroup = group
    return ob

def sphere(name, r, loc, mat, seg=24, group=None):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=r)
    ob = finish(name, bm, mat, loc, smooth=lambda f: True)
    if group:
        ob.lightgroup = group
    return ob

def torus(name, R, r, loc, mat, group=None):
    bm = bmesh.new(); seg, ring = 64, 12
    rows = []
    for i in range(seg):
        a = 2 * math.pi * i / seg; row = []
        for j in range(ring):
            b = 2 * math.pi * j / ring
            row.append(bm.verts.new(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b))))
        rows.append(row)
    for i in range(seg):
        for j in range(ring):
            bm.faces.new((rows[i][j], rows[(i + 1) % seg][j], rows[(i + 1) % seg][(j + 1) % ring], rows[i][(j + 1) % ring]))
    ob = finish(name, bm, mat, loc, smooth=lambda f: True)
    if group:
        ob.lightgroup = group
    return ob

def arc_wall(name, cx, cy, z0, z1, r_in, r_out, a0, a1, rotz, mat, seg=24):
    """Curved shell (tub-chair back)."""
    bm = bmesh.new(); rings = []
    for i in range(seg + 1):
        a = a0 + (a1 - a0) * i / seg
        c, s = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((r * c, r * s, z)) for r, z in ((r_in, z0), (r_out, z0), (r_out, z1), (r_in, z1))])
    for i in range(seg):
        for k in range(4):
            bm.faces.new((rings[i][k], rings[i + 1][k], rings[i + 1][(k + 1) % 4], rings[i][(k + 1) % 4]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    return bevel(finish(name, bm, mat, (cx, cy, 0), (0, 0, rotz), smooth=lambda f: True), 0.02)

def aim(ob, target):
    ob.rotation_euler = (Vector(target) - ob.location).to_track_quat("-Z", "Y").to_euler()

def light(name, kind, watts, loc, group, target=None, radius=0.03, spot=60, blend=0.5, size=(1, 1), rot=None):
    ld = bpy.data.lights.new(name, kind); ld.energy = watts
    if kind in ("POINT", "SPOT"):
        ld.shadow_soft_size = radius
    if kind == "SPOT":
        ld.spot_size = rad(spot); ld.spot_blend = blend
    if kind == "AREA":
        ld.shape = "RECTANGLE"; ld.size = size[0]; ld.size_y = size[1]
    ob = bpy.data.objects.new(name, ld); ob.location = loc
    ROOT.objects.link(ob); ob.lightgroup = group
    if kind == "AREA":
        ob.visible_camera = False
    if target is not None:
        aim(ob, target)
    if rot is not None:
        ob.rotation_euler = rot
    return ob

def strip(name, x0, x1, y0, y1, z0, z1, group, w_per_m, down=True):
    boxb(name, x0, x1, y0, y1, z0, z1, MAT["led"], group=group)
    L = max(x1 - x0, y1 - y0)
    light(f"{name}_light", "AREA", w_per_m * L, ((x0 + x1) / 2, (y0 + y1) / 2, z0 - 0.01 if down else z1 + 0.01), group,
          size=(max(x1 - x0, 0.04), max(y1 - y0, 0.04)), rot=None if down else (math.pi, 0, 0))

def downlight(name, x, y, z, group, watts=50, spot=60, target=None):
    cyl(f"{name}_lens", 0.05, 0.05, 0.01, (x, y, z - 0.01), MAT["lens"], seg=24, group=group)
    light(name, "SPOT", watts, (x, y, z - 0.03), group, target=target, spot=spot, blend=0.6)


# ---------------------------------------------------------------- assets
_ASSETS = {}

def find_assets(prefix, folder=ASSET_DIR):
    out = []
    for p in (f"{prefix}*.glb", f"{prefix}*.gltf", f"{prefix}*/*.glb", f"{prefix}*/*.gltf", f"{prefix}*/**/*.gltf"):
        out += glob.glob(os.path.join(folder, p), recursive=True)
    return sorted(set(out))

def load_asset(path):
    if path in _ASSETS:
        return _ASSETS[path]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    bpy.context.view_layer.update()
    meshes = [o for o in new if o.type == "MESH"]
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    for o in meshes:
        for p in o.data.polygons:
            p.use_smooth = True
    coll = bpy.data.collections.new(f"asset_{os.path.basename(os.path.dirname(path))}")
    for o in new:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
    coll.instance_offset = ((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z)
    _ASSETS[path] = (coll, mx - mn, mx.z - mn.z)
    print("[uniser] asset", os.path.relpath(path, BASE), tuple(round(v, 2) for v in (mx - mn)))
    return _ASSETS[path]

def place_asset(name, path, x, y, z=0.0, rotz=0.0, height=None, length=None, top=False):
    coll, size, h = load_asset(path)
    sc = height / max(size.z, 1e-4) if height else length / max(size.x, size.y, 1e-4)
    e = bpy.data.objects.new(name, None); e.instance_type = "COLLECTION"; e.instance_collection = coll
    e.location = (x, y, z - (h * sc if top else 0)); e.rotation_euler = (0, 0, rotz); e.scale = (sc, sc, sc)
    ROOT.objects.link(e)
    return e

CHAIRS = find_assets("chair_task")
FANS = find_assets("fan_ceiling")
SOFAS = find_assets("sofa", os.path.join(BASE, "models", "cabin"))
PLANTS = find_assets("plant_", os.path.join(BASE, "models", "lobby"))

def task_chair(name, x, y, facing):
    if CHAIRS:
        return place_asset(name, CHAIRS[0], x, y, 0.0, facing + CHAIR_ROT + rad(random.uniform(-12, 12)), height=1.02)
    cyl(f"{name}_base", 0.3, 0.3, 0.04, (x, y, 0.04), MAT["metal"], seg=5)
    cyl(f"{name}_post", 0.025, 0.025, 0.38, (x, y, 0.06), MAT["metal"], seg=12)
    boxb(f"{name}_seat", x - 0.25, x + 0.25, y - 0.25, y + 0.25, 0.44, 0.52, MAT["monitor"], 0.03)

def plant(name, x, y, h=1.5, z=0.0):
    s = sum(map(ord, name))
    if PLANTS:
        return place_asset(name, PLANTS[s % len(PLANTS)], x, y, z, rad(s * 37 % 360), height=h)
    cyl(f"{name}_pot", 0.18, 0.22, 0.4, (x, y, z), MAT["planter"], seg=32)
    for i in range(12):
        a = i * 2.39996; r = 0.1 + 0.16 * (i % 5) / 4
        ob = sphere(f"{name}_leaf_{i}", 0.15, (x + math.cos(a) * r, y + math.sin(a) * r, z + h * (0.45 + 0.5 * (i % 7) / 6)), MAT["leaf"], 10)
        ob.scale = (1.0, 0.5, 0.35)


# ---------------------------------------------------------------- helpers
def rbox(name, cx, cy, z0, w, d, h, ang, mat, bev=0.0, group=None):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((w, d, h)), verts=bm.verts)
    ob = bevel(finish(name, bm, mat, (cx, cy, z0 + h / 2), (0, 0, ang)), bev)
    if group:
        ob.lightgroup = group
    return ob

def raft_zone(x, y):
    return SPINE[0] <= x <= SPINE[1]

# ---------------------------------------------------------------- shell
boxb("floor", 0, W, 0, D, -0.1, 0, MAT["floor"])
boxb("slab", 0, W, 0, D, HX, HX + 0.2, MAT["slab"])
for k, x in enumerate((3.1, 12.9)):                            # thin conduits either side
    cyl(f"conduit_{k}", 0.03, 0.03, D - 0.4, (x, 0.2, HX - 0.12), MAT["duct"], seg=12, rot=(-math.pi / 2, 0, 0))
boxb("spine", SPINE[0], SPINE[1], 0, D - 1.0, RAFT_Z, RAFT_Z + 0.1, MAT["raft"])
for k, x in enumerate(SPINE):
    boxb(f"spine_edge_{k}", x - 0.03, x + 0.03, 0, D - 1.0, RAFT_Z, HX, MAT["raft"])
boxb("spine_end", SPINE[0], SPINE[1], D - 1.03, D - 1.0, RAFT_Z, HX, MAT["raft"])
cutter = boxb("tray_cutter", COF["x0"], COF["x1"], COF["y0"], COF["y1"], RAFT_Z - 0.1, RAFT_Z + 0.3, None)
bo = bpy.data.objects["spine"].modifiers.new("tray", "BOOLEAN"); bo.operation = "DIFFERENCE"; bo.object = cutter
cutter.hide_render = True; cutter.hide_viewport = True
boxb("coffer_top", COF["x0"], COF["x1"], COF["y0"], COF["y1"], COF["z"], COF["z"] + 0.05, MAT["raft"])
for nm, x0, x1, y0, y1 in (("l", COF["x0"] - 0.02, COF["x0"], COF["y0"], COF["y1"]), ("r", COF["x1"], COF["x1"] + 0.02, COF["y0"], COF["y1"]),
                           ("f", COF["x0"], COF["x1"], COF["y0"] - 0.02, COF["y0"]), ("b", COF["x0"], COF["x1"], COF["y1"], COF["y1"] + 0.02)):
    boxb(f"coffer_side_{nm}", x0, x1, y0, y1, RAFT_Z + 0.1, COF["z"], MAT["raft"])
for nm, x0, x1, y0, y1 in (("l", COF["x0"] - 0.1, COF["x0"] - 0.06, COF["y0"], COF["y1"]), ("r", COF["x1"] + 0.06, COF["x1"] + 0.1, COF["y0"], COF["y1"]),
                           ("b", COF["x0"], COF["x1"], COF["y1"] + 0.06, COF["y1"] + 0.1)):
    strip(f"cove_{nm}", x0, x1, y0, y1, RAFT_Z + 0.1, RAFT_Z + 0.12, "ow_cove", 22, down=False)

boxb("wall_front", 0, W, -0.2, 0, 0, HX, MAT["wall_left"])
boxb("wall_left", -0.2, 0, 0, D, 0, HX, MAT["wall_left"])
boxb("wall_right", W, W + 0.2, 0, D, 0, HX, MAT["wall_right"])
boxb("moss_wall", 0, 0.06, 2.0, D - 1.2, 0.35, HX - 0.35, MAT["moss"])
boxb("moss_frame_t", 0, 0.08, 2.0, D - 1.2, HX - 0.37, HX - 0.33, MAT["beam"])
boxb("moss_frame_b", 0, 0.08, 2.0, D - 1.2, 0.33, 0.37, MAT["beam"])
light("accent_moss", "AREA", 260, (0.5, D / 2, HX - 0.15), "ow_accent", target=(0, D / 2, 1.6), size=(0.1, D - 3.4))
boxb("glass_back", WIN_B[0], WIN_B[1], D, D + 0.03, 0, HX, MAT["window"])
rb = random.Random(5)
def venetian(name, a0, a1):
    nb = max(1, int(round((a1 - a0) / BAY)))
    for k in range(nb + 1):
        a = a0 + k * (a1 - a0) / nb
        boxb(f"{name}_mullion_{k}", a - 0.02, a + 0.02, D - 0.02, D + 0.04, 0, HX, MAT["metal"])
    for k in range(nb):
        b0 = a0 + k * (a1 - a0) / nb + 0.03; b1 = a0 + (k + 1) * (a1 - a0) / nb - 0.03
        f = 1.0 if CLOSED else rb.uniform(0.15, 0.4)
        top = HX - 0.04; n = int(f * (top - 0.1) / 0.03)
        bm = bmesh.new()
        for i in range(n):
            z = top - 0.06 - i * 0.03
            mtx = Matrix.Translation(((b0 + b1) / 2, D - 0.09, z)) @ Matrix.Rotation(rad(50 if CLOSED else 15), 4, "X") @ Matrix.Diagonal((b1 - b0, 0.025, 0.002, 1))
            bmesh.ops.create_cube(bm, size=1.0, matrix=mtx)
        finish(f"{name}_slats_{k}", bm, MAT["blind"])
        boxb(f"{name}_head_{k}", b0, b1, D - 0.13, D - 0.05, top - 0.04, top, MAT["metal"])
        boxb(f"{name}_rail_{k}", b0, b1, D - 0.11, D - 0.07, top - 0.08 - n * 0.03, top - 0.065 - n * 0.03, MAT["metal"])
venetian("win", *WIN_B)
boxb("sill", WIN_B[0], WIN_B[1], D - 0.08, D, 0, 0.04, MAT["metal"])

# ---------------------------------------------------------------- desks: 2 x 3 pods perpendicular to the spine, two occupancy zones
DW, DD = 1.4, 0.7
r = 0
for zone, rows in (("ow_task_a", ROWS_A), ("ow_task_b", ROWS_B)):
    for ry in rows:
        x0, x1 = POD
        boxb(f"pod_{r}_top", x0, x1, ry - DD, ry + DD, 0.72, 0.75, MAT["desk"], 0.004)
        for k, x in enumerate((x0 + 0.05, x1 - 0.05)):
            boxb(f"pod_{r}_leg_{k}", x - 0.025, x + 0.025, ry - DD + 0.05, ry + DD - 0.05, 0, 0.72, MAT["beam"])
        boxb(f"pod_{r}_beam", x0 + 0.1, x1 - 0.1, ry - 0.03, ry + 0.03, 0.3, 0.72, MAT["beam"])
        boxb(f"pod_{r}_screen", x0 + 0.05, x1 - 0.05, ry - 0.02, ry + 0.02, 0.75, 1.10, MAT["screen_fabric"], 0.008)
        for side in (-1, 1):
            sy = ry + side * 0.06
            strip(f"task_{r}_{'n' if side < 0 else 'f'}", x0 + 0.15, x1 - 0.15, sy - 0.01, sy + 0.01, 1.07, 1.09, zone, 7)
            for s_ in range(4):
                x = x0 + (s_ + 0.5) * DW; mz = 0.75; my = ry + side * 0.24
                rbox(f"mon_{r}_{side}_{s_}_body", x, my, mz + 0.12, 0.62, 0.022, 0.36, 0.0, MAT["monitor"], 0.003)
                rbox(f"mon_{r}_{side}_{s_}_glass", x, my + side * 0.012, mz + 0.13, 0.6, 0.002, 0.34, 0.0, MAT["monitor_screen"])
                rbox(f"mon_{r}_{side}_{s_}_neck", x, my - side * 0.02, mz, 0.04, 0.02, 0.2, 0.0, MAT["monitor"])
                rbox(f"mon_{r}_{side}_{s_}_foot", x, my - side * 0.03, mz, 0.24, 0.16, 0.01, 0.0, MAT["monitor"])
                ky = ry + side * 0.48
                boxb(f"kb_{r}_{side}_{s_}", x - 0.22, x + 0.22, ky - 0.07, ky + 0.07, mz, mz + 0.015, MAT["monitor"], 0.003)
                boxb(f"mouse_{r}_{side}_{s_}", x + 0.3, x + 0.36, ky - 0.05, ky + 0.05, mz, mz + 0.02, MAT["monitor"], 0.008)
                py0, py1 = sorted((ry + side * 0.12, ry + side * 0.6))
                boxb(f"ped_{r}_{side}_{s_}", x + 0.22, x + 0.62, py0, py1, 0.02, 0.62, MAT["desk"], 0.004)
                if random.random() < 0.35 and PLANTS:
                    plant(f"deskplant_{r}_{side}_{s_}", x - 0.55, ry + side * 0.34, 0.28, z=mz)
                task_chair(f"chair_{r}_{side}_{s_}", x, ry + side * 1.15, rad(0 if side > 0 else 180))
        boxb(f"cap_{r}", CAP_X[0], CAP_X[1], ry - DD, ry + DD, 0, 0.75, MAT["darkwood"], 0.01)
        for i, yy in enumerate((ry - 0.42, ry, ry + 0.42)):
            plant(f"cap_{r}_plant_{i}", (CAP_X[0] + CAP_X[1]) / 2, yy, 0.55 + 0.25 * (i % 2), z=0.75)
        L0, L1 = x0 + 0.1, x1 - 0.1
        for j, xx in enumerate((L0 + 0.4, L1 - 0.4)):
            cyl(f"lin_{r}_cable_{j}", 0.0015, 0.0015, HX - 2.86, (xx, ry, 2.86), MAT["metal"], seg=6)
        boxb(f"lin_{r}_body", L0, L1, ry - 0.02, ry + 0.02, 2.8, 2.86, MAT["beam"], 0.003)
        boxb(f"lin_{r}_diffuser", L0 + 0.02, L1 - 0.02, ry - 0.016, ry + 0.016, 2.796, 2.8, MAT["led"], group="ow_linear")
        light(f"lin_{r}_down", "AREA", 170, ((L0 + L1) / 2, ry, 2.79), "ow_linear", size=(L1 - L0, 0.04))
        light(f"lin_{r}_up", "AREA", 14, ((L0 + L1) / 2, ry, 2.87), "ow_linear", size=(L1 - L0, 0.04), rot=(math.pi, 0, 0))
        r += 1
for k, (x, y) in enumerate(((3.1, 6.6), (3.1, 14.0))):        # one occupancy sensor per zone
    cyl(f"occupancy_{k}", 0.05, 0.05, 0.03, (x, y, HX - 0.03), MAT["ceramic"], seg=24)
for k, y in enumerate((3.4, 15.4, 18.6)):                      # planters along the spine edge
    boxb(f"spine_planter_{k}", 7.15, 7.4, y - 0.5, y + 0.5, 0, 0.45, MAT["planter"], 0.01)
    plant(f"spine_plant_{k}", 7.27, y, 0.9 + 0.3 * (k % 2), z=0.45)
# collaboration table down the spine (low enough to keep the window view)
CT = (8.3, 9.4, 13.8)
boxb("collab_top", CT[0] - 0.55, CT[0] + 0.55, CT[1], CT[2], 0.72, 0.76, MAT["desk"], 0.006)
for k, y in enumerate((CT[1] + 0.2, CT[2] - 0.2)):
    boxb(f"collab_leg_{k}", CT[0] - 0.45, CT[0] + 0.45, y - 0.03, y + 0.03, 0, 0.72, MAT["beam"])
for side in (-1, 1):
    bx = CT[0] + side * 0.95
    boxb(f"collab_bench_{side}", bx - 0.18, bx + 0.18, CT[1] + 0.2, CT[2] - 0.2, 0.0, 0.46, MAT["darkwood"], 0.01)
for k, y in enumerate((10.2, 11.6, 13.0)):
    rbox(f"collab_laptop_{k}", CT[0] + (0.2 if k % 2 else -0.2), y, 0.76, 0.32, 0.22, 0.015, rad(90 if k % 2 else -90), MAT["laptop"], 0.003)
    if PLANTS and k == 1:
        plant("collab_plant", CT[0], y, 0.3, z=0.76)

# ---------------------------------------------------------------- glass meeting room (back right)
X0, X1, Y0, Y1 = MR["x0"], MR["x1"], MR["y0"], MR["y1"]
GZ = HX - 0.02
boxb("mr_floor", X0, X1, Y0, Y1, 0, 0.006, MAT["rug_grey"])
boxb("mr_wall_b", X0, X1, Y1, Y1 + 0.12, 0, GZ, MAT["wood"])
for k in range(int((X1 - X0) / 0.08)):
    x = X0 + 0.04 + k * 0.08
    boxb(f"mr_slat_{k}", x - 0.02, x + 0.02, Y1 - 0.05, Y1, 0, GZ, MAT["wood"])
boxb("mr_glass_f", X0, X1, Y0 - 0.006, Y0 + 0.006, 0, GZ, MAT["partition"])
boxb("mr_glass_l", X0 - 0.006, X0 + 0.006, Y0, Y1, 0, GZ, MAT["partition"])
for nm, (x0, x1, y0, y1) in (("f", (X0 - 0.015, X1, Y0 - 0.015, Y0 + 0.015)), ("l", (X0 - 0.015, X0 + 0.015, Y0, Y1))):
    boxb(f"mr_top_{nm}", x0, x1, y0, y1, GZ - 0.03, GZ, MAT["metal"])
    boxb(f"mr_bot_{nm}", x0, x1, y0, y1, 0, 0.03, MAT["metal"])
for k, y in enumerate((Y0 + 2.0, Y0 + 4.0)):
    boxb(f"mr_mull_l_{k}", X0 - 0.012, X0 + 0.012, y - 0.01, y + 0.01, 0, GZ, MAT["metal"])
boxb("mr_door_handle", X0 - 0.05, X0 - 0.03, Y0 + 0.9, Y0 + 0.92, 0.8, 1.6, MAT["metal"])
boxb("mr_table", TC[0] - 0.6, TC[0] + 0.6, TC[1] - 1.9, TC[1] + 1.9, 0.72, 0.76, MAT["darkwood"], 0.01)
for k, yy in enumerate((-1.1, 1.1)):
    boxb(f"mr_table_leg_{k}", TC[0] - 0.35, TC[0] + 0.35, TC[1] + yy - 0.06, TC[1] + yy + 0.06, 0, 0.72, MAT["beam"])
for k, yy in enumerate((-1.35, -0.45, 0.45, 1.35)):
    task_chair(f"mr_chair_l_{k}", TC[0] - 0.95, TC[1] + yy, rad(90))
    task_chair(f"mr_chair_r_{k}", TC[0] + 0.95, TC[1] + yy, rad(-90))
task_chair("mr_chair_e0", TC[0], TC[1] - 2.3, rad(180))
task_chair("mr_chair_e1", TC[0], TC[1] + 2.25, 0.0)
boxb("tv_body", TC[0] - 1.0, TC[0] + 1.0, Y1 - 0.11, Y1 - 0.05, 1.2, 2.33, MAT["monitor"], 0.005)
boxb("tv_screen", TC[0] - 0.98, TC[0] + 0.98, Y1 - 0.112, Y1 - 0.11, 1.22, 2.31, MAT["tv"], group="ow_display")
torus("mr_ring", 0.85, 0.018, (TC[0], TC[1], 2.45), MAT["led"], group="ow_meeting")
for k in range(3):
    a = k * 2 * math.pi / 3
    cyl(f"mr_ring_wire_{k}", 0.0015, 0.0015, HX - 2.45, (TC[0] + 0.85 * math.cos(a), TC[1] + 0.85 * math.sin(a), 2.45), MAT["metal"], seg=6)
light("mr_ring_down", "AREA", 220, (TC[0], TC[1], 2.43), "ow_meeting", size=(1.6, 1.6))
light("mr_wash_slats", "AREA", 120, (TC[0], Y1 - 0.5, GZ - 0.05), "ow_meeting", target=(TC[0], Y1, 1.4), size=(4.0, 0.08))
for k, (x, y, h) in enumerate(((X0 + 0.5, Y1 + 1.4, 1.8), (13.2, Y1 + 1.5, 1.6), (W - 0.5, Y1 + 1.3, 1.9))):
    plant(f"window_plant_{k}", x, y, h)

# ---------------------------------------------------------------- break lounge (front right) + pantry counter
boxb("lounge_rug", 11.6, 15.8, 4.0, 9.0, 0, 0.012, MAT["rug_grey"])
SXL = W - 0.95
boxb("sofa_seat", SXL, W - 0.05, 4.6, 8.4, 0.05, 0.44, MAT["grey"], 0.07)
boxb("sofa_back", W - 0.28, W - 0.05, 4.6, 8.4, 0.4, 0.86, MAT["grey"], 0.08)
for k, (y0, y1) in enumerate(((4.6, 5.9), (5.9, 7.2), (7.2, 8.4))):
    boxb(f"sofa_cush_{k}", W - 0.5, W - 0.28, y0 + 0.05, y1 - 0.05, 0.44, 0.84, MAT["grey"], 0.08)
for k, y in enumerate((4.45, 8.55)):
    boxb(f"sofa_arm_{k}", SXL, W - 0.05, y - 0.15, y + 0.15, 0.4, 0.62, MAT["grey"], 0.07)
for k, (y, a) in enumerate(((5.6, 0.25), (7.6, -0.25))):
    rbox(f"pillow_{k}", W - 0.45, y, 0.46, 0.14, 0.42, 0.4, a, MAT["pillow"], 0.06)
for k, (x, y, a) in enumerate(((12.8, 5.5, rad(10)), (12.8, 7.5, rad(-10)))):
    cyl(f"arm_{k}_seat", 0.4, 0.4, 0.42, (x, y, 0.08), MAT["green"], seg=44)
    arc_wall(f"arm_{k}_back", x, y, 0.32, 0.8, 0.33, 0.46, rad(100), rad(260), a, MAT["green"])
    for j in range(4):
        aa = a + rad(45 + 90 * j)
        cyl(f"arm_{k}_leg_{j}", 0.015, 0.01, 0.08, (x + 0.28 * math.cos(aa), y + 0.28 * math.sin(aa), 0), MAT["beam"], seg=8)
cyl("coffee_top", 0.55, 0.55, 0.04, (14.1, 6.5, 0.34), MAT["monitor"], seg=56)
cyl("coffee_base", 0.45, 0.47, 0.34, (14.1, 6.5, 0), MAT["monitor"], seg=48)
cyl("coffee_vase", 0.05, 0.07, 0.16, (14.0, 6.4, 0.38), MAT["ceramic"], seg=24)
cyl("cafe_top", 0.38, 0.38, 0.03, (15.1, 2.6, 0.72), MAT["marble"], seg=40)
cyl("cafe_stem", 0.03, 0.03, 0.72, (15.1, 2.6, 0), MAT["metal"], seg=12)
for k, a in enumerate((rad(90), rad(270))):
    cx, cy = 15.1 + 0.7 * math.cos(a), 2.6 + 0.7 * math.sin(a)
    cyl(f"cafe_{k}_seat", 0.28, 0.28, 0.44, (cx, cy, 0.02), MAT["green"], seg=36)
    arc_wall(f"cafe_{k}_back", cx, cy, 0.32, 0.76, 0.24, 0.34, a - rad(70), a + rad(70), 0.0, MAT["green"])
# front lounge: low sofa facing into the room + coffee table
boxb("front_sofa_seat", 11.2, 14.2, 1.0, 1.9, 0.05, 0.42, MAT["grey"], 0.07)
boxb("front_sofa_back", 11.2, 14.2, 1.0, 1.25, 0.38, 0.82, MAT["grey"], 0.08)
for k, x in enumerate((11.95, 13.45)):
    boxb(f"front_sofa_cush_{k}", x - 0.7, x + 0.7, 1.25, 1.48, 0.42, 0.78, MAT["grey"], 0.08)
for k, x in enumerate((11.05, 14.35)):
    boxb(f"front_sofa_arm_{k}", x - 0.15, x + 0.15, 1.0, 1.9, 0.38, 0.6, MAT["grey"], 0.07)
rbox("front_pillow", 13.6, 1.55, 0.44, 0.42, 0.14, 0.38, 0.2, MAT["pillow"], 0.06)
cyl("front_coffee_top", 0.45, 0.45, 0.04, (12.7, 2.9, 0.34), MAT["monitor"], seg=48)
cyl("front_coffee_base", 0.36, 0.38, 0.34, (12.7, 2.9, 0), MAT["monitor"], seg=40)
boxb("front_rug", 10.9, 14.6, 0.7, 3.8, 0, 0.012, MAT["rug_grey"])
boxb("lounge_planter", 10.25, 10.6, 3.8, 9.0, 0, 0.6, MAT["planter"], 0.01)        # green edge between walkway and lounge
for k in range(6):
    plant(f"lounge_planter_{k}", 10.42, 4.25 + k * 0.9, 0.7 + 0.35 * (k % 2), z=0.6)
CY0 = 9.5
boxb("counter", 11.2, W - 0.2, CY0, CY0 + 0.6, 0, 1.0, MAT["wood"], 0.006)
boxb("counter_top", 11.15, W - 0.15, CY0 - 0.05, CY0 + 0.65, 1.0, 1.04, MAT["darkwood"], 0.004)
for k, x in enumerate((12.0, 12.9, 13.8, 14.7)):
    cyl(f"stool_{k}_seat", 0.18, 0.18, 0.05, (x, CY0 - 0.42, 0.72), MAT["wood"], seg=32)
    for j in range(4):
        aa = rad(45 + 90 * j)
        cyl(f"stool_{k}_leg_{j}", 0.015, 0.015, 0.72, (x + 0.13 * math.cos(aa), CY0 - 0.42 + 0.13 * math.sin(aa), 0), MAT["wood"], seg=8)
for k, x in enumerate((12.3, 13.4, 14.5)):
    z0 = 1.95
    cyl(f"pend_{k}_cord", 0.003, 0.003, HX - z0 - 0.26, (x, CY0 + 0.3, z0 + 0.26), MAT["metal"], seg=6)
    cyl(f"pend_{k}_shade", 0.17, 0.03, 0.26, (x, CY0 + 0.3, z0), MAT["monitor"], seg=40, caps=False)
    sphere(f"pend_{k}_bulb", 0.035, (x, CY0 + 0.3, z0 + 0.03), MAT["led"], group="ow_break")
    light(f"pend_{k}_light", "SPOT", 70, (x, CY0 + 0.3, z0 + 0.02), "ow_break", target=(x, CY0 + 0.3, 0), spot=80, radius=0.05)
for j, (x, y, h) in enumerate(((W - 0.5, 3.9, 2.0), (10.5, 0.8, 1.9), (0.6, 1.2, 1.8), (W - 0.5, 1.0, 1.7))):
    plant(f"floor_plant_{j}", x, y, h)
for k, (x, y) in enumerate(((W - 0.5, 3.9), (10.5, 0.8))):
    light(f"accent_plant_{k}", "SPOT", 25, (x - 0.25, y - 0.25, 0.05), "ow_accent", target=(x, y, 1.4), spot=40)
boxb("keypad_col", 10.05, 10.35, CY0 + 0.75, CY0 + 1.05, 0, HX, MAT["wall_right"])
boxb("keypad_plate", 10.14, 10.26, CY0 + 0.738, CY0 + 0.75, 1.14, 1.26, MAT["metal"], 0.003)
for k in range(4):
    z = 1.16 + k * 0.026
    boxb(f"keypad_btn_{k}", 10.18, 10.22, CY0 + 0.736, CY0 + 0.738, z, z + 0.012, MAT["keypad"], group="ow_accent")

# ---------------------------------------------------------------- general downlights, AC (in the spine), fan (break), speakers
n = 0
for x in (2.0, 4.2, 11.2, 13.4, 15.2):
    for y in (3.6, 6.6, 9.6, 12.6, 15.4, 18.4):
        if x > 10 and MR["y0"] - 0.3 < y:
            continue
        cyl(f"dl_c_{n}_can", 0.06, 0.06, 0.16, (x, y, HX - 0.16), MAT["beam"], seg=24)
        cyl(f"dl_c_{n}_lens", 0.045, 0.045, 0.005, (x, y, HX - 0.165), MAT["lens"], seg=20, group="ow_general")
        light(f"dl_c_{n}", "SPOT", 90, (x, y, HX - 0.17), "ow_general", spot=55, blend=0.6); n += 1
for y in [1.6 + j * 1.6 for j in range(11)]:
    for x in (6.5, 9.5):
        if abs(y - AC[1]) < 0.6:
            continue
        downlight(f"dl_s_{n}", x, y, RAFT_Z, "ow_general", 40, 60); n += 1
cx, cy = AC; cz = COF["z"]
boxb("ac_panel", cx - 0.42, cx + 0.42, cy - 0.42, cy + 0.42, cz - 0.03, cz, MAT["grille"], 0.01)
boxb("ac_grille", cx - 0.22, cx + 0.22, cy - 0.22, cy + 0.22, cz - 0.034, cz - 0.03, MAT["grille"])
for k in range(9):
    o = -0.2 + k * 0.05
    boxb(f"ac_grille_bar_{k}", cx - 0.21, cx + 0.21, cy + o - 0.004, cy + o + 0.004, cz - 0.037, cz - 0.034, MAT["beam"])
for k, (x0, x1, y0, y1) in enumerate(((cx - 0.34, cx + 0.34, cy + 0.29, cy + 0.35), (cx - 0.34, cx + 0.34, cy - 0.35, cy - 0.29),
                                      (cx + 0.29, cx + 0.35, cy - 0.34, cy + 0.34), (cx - 0.35, cx - 0.29, cy - 0.34, cy + 0.34))):
    boxb(f"ac_slot_{k}", x0, x1, y0, y1, cz - 0.036, cz - 0.03, MAT["beam"])
FAN_Z = HX - 0.75
if FANS:
    fan_obj = place_asset("fan", FANS[0], FAN[0], FAN[1], HX, 0.0, length=1.3, top=True)
    cyl("fan_downrod", 0.015, 0.015, 0.2, (FAN[0], FAN[1], HX - 0.2), MAT["beam"], seg=12)
else:
    cyl("fan_rod", 0.012, 0.012, 0.6, (FAN[0], FAN[1], FAN_Z + 0.1), MAT["metal"], seg=12)
    cyl("fan_motor", 0.12, 0.1, 0.12, (FAN[0], FAN[1], FAN_Z), MAT["metal"], seg=32)
    bm = bmesh.new()
    for k in range(3):
        mtx = Matrix.Rotation(k * 2 * math.pi / 3, 4, "Z") @ Matrix.Translation((0.4, 0, 0.05)) @ Matrix.Diagonal((0.55, 0.11, 0.008, 1))
        bmesh.ops.create_cube(bm, size=1.0, matrix=mtx)
    fan_obj = finish("fan_blades", bm, MAT["metal"], (FAN[0], FAN[1], FAN_Z))
for k, (x, y, z) in enumerate(((8.0, 5.0, COF["z"]), (8.0, 15.0, COF["z"]), (13.4, 5.0, HX), (3.1, 10.0, HX))):
    cyl(f"speaker_{k}", 0.1, 0.1, 0.004, (x, y, z - 0.004), MAT["ceramic"], seg=40)

# ---------------------------------------------------------------- outside: Nishita daylight sky (lighting) + city/canopy backplate seen through the glass
world = bpy.data.worlds.new("day"); scene.world = world; world.use_nodes = True
N = world.node_tree.nodes; L = world.node_tree.links; bg = N["Background"]
sky = N.new("ShaderNodeTexSky")
try:
    sky.sky_type = "NISHITA"; sky.sun_disc = False; sky.sun_elevation = rad(35); sky.sun_rotation = rad(0); sky.air_density = 1.4; sky.dust_density = 2.0
except Exception as err:
    print("[uniser] Nishita setup:", err)
L.new(sky.outputs["Color"], bg.inputs["Color"]); bg.inputs["Strength"].default_value = SKY_STRENGTH
world.lightgroup = "sky"

CAM_POS = Vector(CAM_POS)
bp = bpy.data.materials.new("backplate"); bp.use_nodes = True
N = bp.node_tree.nodes; L = bp.node_tree.links; N.clear()
out = N.new("ShaderNodeOutputMaterial"); em = N.new("ShaderNodeEmission"); em.inputs["Strength"].default_value = 1.6
tc = N.new("ShaderNodeTexCoord"); nrm = N.new("ShaderNodeVectorMath"); nrm.operation = "NORMALIZE"
L.new(tc.outputs["Object"], nrm.inputs[0])
sx = N.new("ShaderNodeSeparateXYZ"); L.new(nrm.outputs["Vector"], sx.inputs[0])
zs = N.new("ShaderNodeMath"); zs.operation = "ADD"; zs.inputs[1].default_value = SKY_SHIFT; L.new(sx.outputs["Z"], zs.inputs[0])
cb = N.new("ShaderNodeCombineXYZ"); L.new(sx.outputs["X"], cb.inputs["X"]); L.new(sx.outputs["Y"], cb.inputs["Y"]); L.new(zs.outputs[0], cb.inputs["Z"])
mp = N.new("ShaderNodeMapping"); mp.name = "sky_rot"; mp.inputs["Rotation"].default_value = (0, 0, SKY_ROT); L.new(cb.outputs[0], mp.inputs["Vector"])
hdri = sorted(glob.glob(os.path.join(ASSET_DIR, "sky", "*.exr")) + glob.glob(os.path.join(ASSET_DIR, "sky", "*.hdr")))
haze = (*lin("#c9d8e4"), 1)
if hdri:
    env = N.new("ShaderNodeTexEnvironment"); env.image = bpy.data.images.load(hdri[0]); L.new(mp.outputs[0], env.inputs["Vector"])
    city = env.outputs["Color"]; print("[uniser] backplate:", os.path.basename(hdri[0]))
else:
    rgb = N.new("ShaderNodeRGB"); rgb.outputs[0].default_value = (*lin("#8fb3d8"), 1); city = rgb.outputs[0]
hz = N.new("ShaderNodeMixRGB"); hz.inputs["Fac"].default_value = 0.12; hz.inputs["Color2"].default_value = haze
L.new(city, hz.inputs["Color1"]); city = hz.outputs[0]
nz = N.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 60.0; nz.inputs["Detail"].default_value = 10.0
L.new(nrm.outputs["Vector"], nz.inputs["Vector"])
cr = N.new("ShaderNodeValToRGB"); e = cr.color_ramp.elements
e[0].position = 0.35; e[0].color = (*lin("#2f4a2a"), 1); e[1].position = 0.7; e[1].color = (*lin("#6e8f52"), 1)
L.new(nz.outputs["Fac"], cr.inputs["Fac"])
top = N.new("ShaderNodeMath"); top.operation = "ADD"; top.inputs[1].default_value = -0.02
L.new(nz.outputs["Fac"], top.inputs[0])
tmul = N.new("ShaderNodeMath"); tmul.operation = "MULTIPLY"; tmul.inputs[1].default_value = 0.05; L.new(top.outputs[0], tmul.inputs[0])
cut_ = N.new("ShaderNodeMath"); cut_.operation = "LESS_THAN"; L.new(zs.outputs[0], cut_.inputs[0]); L.new(tmul.outputs[0], cut_.inputs[1])
mixc = N.new("ShaderNodeMixRGB"); L.new(cut_.outputs[0], mixc.inputs["Fac"]); L.new(city, mixc.inputs["Color1"]); L.new(cr.outputs["Color"], mixc.inputs["Color2"])
L.new(mixc.outputs[0], em.inputs["Color"]); L.new(em.outputs[0], out.inputs["Surface"])
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, segments=64, radius1=250, radius2=250, depth=500)
bpo = finish("backplate", bm, bp, CAM_POS)
bpo.lightgroup = "sky"
for attr in ("visible_diffuse", "visible_shadow", "visible_volume_scatter"):
    setattr(bpo, attr, False)

for name, elev, azi, strength in (("day_morning", 18, 120, 3.5), ("day_midday", 40, 90, 3.5), ("day_evening", 12, 60, 2.5)):
    ld = bpy.data.lights.new(name, "SUN"); ld.energy = strength; ld.angle = rad(3.0)
    ob = bpy.data.objects.new(name, ld); ROOT.objects.link(ob); ob.lightgroup = name
    e_, a_ = rad(elev), rad(azi)     # sun sits beyond the window wall (+y)
    d = -Vector((math.cos(e_) * math.cos(a_), math.cos(e_) * math.sin(a_), math.sin(e_)))
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

# ---------------------------------------------------------------- camera (OFFICE_CAMERA): front-left, desks foreground, meeting centre, break right
cd = bpy.data.cameras.new("hero"); cd.lens = 21.0; cd.sensor_width = 36.0; cd.sensor_fit = "HORIZONTAL"
cd.lens = 18.0; cd.shift_y = 0.05; cd.clip_end = 5000
cam = bpy.data.objects.new("hero", cd); ROOT.objects.link(cam)
cam.location = tuple(CAM_POS)
cam.rotation_euler = (rad(90), 0, 0.0)          # eye level in the central corridor, turned slightly toward the left windows + glass room
scene.camera = cam

# ---------------------------------------------------------------- render settings
FINAL = MODE == "final"
scene.render.engine = "CYCLES"
try:
    if "--cpu" in ARGS:
        raise RuntimeError("CPU requested")
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"; prefs.get_devices()
    for dev in prefs.devices:
        dev.use = dev.type == "METAL"
    scene.cycles.device = "GPU"
except Exception as err:
    print("GPU setup skipped:", err)
scene.render.resolution_x, scene.render.resolution_y = (1536, 1064) if FINAL else (768, 532)
scene.render.resolution_percentage = 100
scene.cycles.samples = 768 if FINAL else 128
scene.cycles.use_adaptive_sampling = True; scene.cycles.adaptive_threshold = 0.02 if FINAL else 0.05
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 12; scene.cycles.diffuse_bounces = 4; scene.cycles.glossy_bounces = 4
scene.cycles.transmission_bounces = 8; scene.cycles.transparent_max_bounces = 16
scene.cycles.caustics_reflective = False; scene.cycles.caustics_refractive = False
scene.cycles.sample_clamp_indirect = 10.0; scene.cycles.blur_glossy = 1.0
scene.render.use_persistent_data = True
try:
    scene.cycles.tile_size = 1024
except Exception:
    pass
scene.view_settings.view_transform = "AgX"
try:
    scene.view_settings.look = "AgX - Medium High Contrast"
except Exception:
    pass
scene.view_settings.exposure = 0.3   # preview PNG only; EXR passes stay scene-linear
VL.cycles.denoising_store_passes = True

# ---------------------------------------------------------------- hotspots (+ fan rectangle for the spinning-fan crop)
HOT = {
    "ow-general": (4.2, 9.6, HX - 0.17), "ow-linear": (3.1, ROWS_A[1], 2.8), "ow-task-a": (3.7, ROWS_A[0], 1.0),
    "ow-task-b": (3.7, ROWS_B[0], 1.0), "ow-cove": (COF["x0"] - 0.08, 8.0, RAFT_Z + 0.1), "ow-meeting": (TC[0], TC[1], 2.45),
    "ow-break": (13.4, CY0 + 0.3, 1.9), "ow-accent": (0.05, 9.0, 1.8), "ow-display": (TC[0], Y1 - 0.11, 1.7),
    "blinds": (8.0, D - 0.09, 3.3), "hvac": (AC[0], AC[1], COF["z"]), "fan": (FAN[0], FAN[1], FAN_Z),
    "occupancy": (3.1, 6.6, HX - 0.03), "occupancy-b": (3.1, 14.0, HX - 0.03), "music": (8.0, 5.0, COF["z"]),
    "keypad": (10.2, CY0 + 0.74, 1.2),
}
bpy.context.view_layer.update()
spots = {}
for k, co in HOT.items():
    v = world_to_camera_view(scene, cam, Vector(co))
    spots[k] = {"u": round(v.x, 4), "v": round(1 - v.y, 4), "visible": bool(0 <= v.x <= 1 and 0 <= v.y <= 1 and v.z > 0)}
fr = []
for a in range(16):
    for z in (FAN_Z - 0.15, COF["z"]):
        v = world_to_camera_view(scene, cam, Vector((FAN[0] + 0.75 * math.cos(a * math.pi / 8), FAN[1] + 0.75 * math.sin(a * math.pi / 8), z)))
        fr.append((v.x, 1 - v.y))
fan_rect = [round(max(0, min(p[0] for p in fr) - 0.01), 4), round(max(0, min(p[1] for p in fr) - 0.01), 4),
            round(min(1, max(p[0] for p in fr) + 0.01), 4), round(min(1, max(p[1] for p in fr) + 0.01), 4)]
with open(os.path.join(OUT, "hotspots.json"), "w") as f:
    json.dump({"camera": "hero", "points": spots, "fan_rect": fan_rect, "fan_rect_order": "u0, v0, u1, v1 (v down)"}, f, indent=2)

if FANBLUR:   # spin the fan over one frame with motion blur, render only its rectangle
    scene.frame_start = scene.frame_end = 1; scene.frame_set(1)
    piv = fan_obj
    piv.keyframe_insert("rotation_euler", frame=0)
    piv.rotation_euler.z += rad(100); piv.keyframe_insert("rotation_euler", frame=1)
    piv.rotation_euler.z += rad(100); piv.keyframe_insert("rotation_euler", frame=2)
    scene.frame_set(1)
    scene.render.use_motion_blur = True; scene.render.motion_blur_shutter = 1.0
    scene.render.use_border = True; scene.render.use_crop_to_border = False
    scene.render.border_min_x, scene.render.border_max_x = fan_rect[0], fan_rect[2]
    scene.render.border_min_y, scene.render.border_max_y = 1 - fan_rect[3], 1 - fan_rect[1]

# ---------------------------------------------------------------- compositor: denoise each pass, write EXR, build preview
scene.use_nodes = True
T = scene.node_tree; T.nodes.clear()
rl = T.nodes.new("CompositorNodeRLayers")
fo = T.nodes.new("CompositorNodeOutputFile")
fo.format.file_format = "OPEN_EXR_MULTILAYER"; fo.format.color_depth = "16"; fo.format.exr_codec = "ZIP"
fo.base_path = os.path.join(OUT, f"passes_{TAG}_")
try:
    fo.layer_slots.clear()
except Exception:
    pass

def group_socket(g):
    s = rl.outputs.get("Combined_" + g)
    return s if s is not None else next((o for o in rl.outputs if o.name.endswith(g)), None)

CCT = {2700: (1.0, 0.76, 0.52, 1), 3000: (1.0, 0.82, 0.62, 1), 3500: (1.0, 0.88, 0.72, 1), 4000: (1.0, 0.93, 0.82, 1)}   # relative to a ~4500 K white balance
TINTS = {"ow_general": CCT[3000], "ow_linear": CCT[3500], "ow_task_a": CCT[4000], "ow_task_b": CCT[4000], "ow_cove": CCT[3000],
         "ow_meeting": CCT[4000], "ow_break": CCT[2700], "ow_accent": CCT[3000], "ow_display": (1, 1, 1, 1)}
acc = None; written = []
for g in GROUPS:
    s = group_socket(g)
    if s is None:
        print("missing light group pass:", g); continue
    dn = T.nodes.new("CompositorNodeDenoise"); dn.use_hdr = True
    T.links.new(s, dn.inputs["Image"]); T.links.new(rl.outputs["Denoising Normal"], dn.inputs["Normal"]); T.links.new(rl.outputs["Denoising Albedo"], dn.inputs["Albedo"])
    fo.layer_slots.new(g); T.links.new(dn.outputs[0], fo.inputs[g]); written.append(g)
    if g in DAY and g != "day_midday":
        continue   # preview: midday sun only
    src = dn.outputs[0]
    if g in CIRCUITS:
        mul = T.nodes.new("CompositorNodeMixRGB"); mul.blend_type = "MULTIPLY"; mul.inputs[0].default_value = 1
        T.links.new(src, mul.inputs[1]); mul.inputs[2].default_value = TINTS[g]; src = mul.outputs[0]
    if acc is None:
        acc = src
    else:
        add = T.nodes.new("CompositorNodeMixRGB"); add.blend_type = "ADD"; add.inputs[0].default_value = 1
        T.links.new(acc, add.inputs[1]); T.links.new(src, add.inputs[2]); acc = add.outputs[0]
fo.layer_slots.new("beauty"); T.links.new(rl.outputs["Image"], fo.inputs["beauty"])
comp = T.nodes.new("CompositorNodeComposite")
img = acc or rl.outputs["Image"]
gl = T.nodes.new("CompositorNodeGlare"); gl.glare_type = "FOG_GLOW"; gl.threshold = 3.0; gl.size = 7; gl.mix = -0.8
T.links.new(img, gl.inputs["Image"]); img = gl.outputs["Image"]
em = T.nodes.new("CompositorNodeEllipseMask"); em.width = 1.1; em.height = 1.1
bl = T.nodes.new("CompositorNodeBlur"); bl.use_relative = True; bl.factor_x = 0.25; bl.factor_y = 0.25
T.links.new(em.outputs[0], bl.inputs["Image"])
ma = T.nodes.new("CompositorNodeMath"); ma.operation = "MULTIPLY_ADD"; ma.inputs[1].default_value = 0.25; ma.inputs[2].default_value = 0.75
T.links.new(bl.outputs[0], ma.inputs[0])
vg = T.nodes.new("CompositorNodeMixRGB"); vg.blend_type = "MULTIPLY"; vg.inputs[0].default_value = 1
T.links.new(img, vg.inputs[1]); T.links.new(ma.outputs[0], vg.inputs[2])
T.links.new(vg.outputs[0], comp.inputs["Image"])

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f"office_{TAG}.blend"))
print(f"[uniser] built office, mode={MODE}, closed={CLOSED}, fanblur={FANBLUR}, passes={written}")
print("[uniser] chairs:", "model" if CHAIRS else "fallback", "| fan:", "model" if FANS else "fallback",
      "| sofa:", "model" if SOFAS else "fallback", "| plants:", len(PLANTS))
print("[uniser] fan_rect:", fan_rect, "| hotspots not in view:", [k for k, s in spots.items() if not s["visible"]])

if SKYTEST:   # quick look at 4 HDRI rotations: out_office/skytest_<deg>.png
    scene.render.resolution_x, scene.render.resolution_y = 640, 360
    scene.cycles.samples = 24; scene.use_nodes = False
    mpn = bpy.data.materials["backplate"].node_tree.nodes.get("sky_rot")
    for deg in (0, 90, 180, 270):
        if mpn:
            mpn.inputs["Rotation"].default_value = (0, 0, rad(deg))
        scene.render.filepath = os.path.join(OUT, f"skytest_{deg}.png")
        scene.render.image_settings.file_format = "PNG"
        bpy.ops.render.render(write_still=True)
    print("[uniser] sky test written; pick a rotation and pass --skyrot=<deg>")
    sys.exit(0)

if MODE != "build":
    scene.render.filepath = os.path.join(OUT, f"preview_{TAG}.png")
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    print("[uniser] done:", OUT)
