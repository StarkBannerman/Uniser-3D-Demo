"""
Uniser SmartSpaces - Commercial Office Boardroom
  Blender -b -P boardroom_build_v1.py -- --preview                     # blinds open, screen up
  Blender -b -P boardroom_build_v1.py -- --final                       # plate set 1: blinds open, screen up
  Blender -b -P boardroom_build_v1.py -- --final --closed              # plate set 2: blinds closed, screen up
  Blender -b -P boardroom_build_v1.py -- --final --closed --screen     # plate set 3: blinds closed, screen down (+ projection layer)
  add --samples=384 for faster finals, --cpu if the Mac GPU crashes
"""

import bpy, bmesh, math, os, sys, json, random, glob
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MODE = "final" if "--final" in ARGS else "build" if "--build" in ARGS else "preview"
CLOSED = "--closed" in ARGS
FANBLUR = "--fanblur" in ARGS
SKYTEST = "--skytest" in ARGS
SCREEN = "--screen" in ARGS             # projection screen down (render with --closed for the presentation state)
TAG = MODE + ("_closed" if CLOSED else "") + ("_screen" if SCREEN else "") + ("_fan" if FANBLUR else "")
BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "out_boardroom")
ASSET_DIR = os.path.join(BASE, "models", "office")
os.makedirs(OUT, exist_ok=True)
random.seed(21)
rad = math.radians

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
VL = scene.view_layers[0]
ROOT = bpy.data.collections.new("Office")
scene.collection.children.link(ROOT)

# ---------------------------------------------------------------- plan  (boardroom: windows left, front wall with motorised screen + display, table down the middle)
W, D = 8.0, 12.5
HX = 3.2                                # perimeter ceiling
COF = dict(x0=1.6, x1=6.4, y0=1.4, y1=11.0, z=3.5)    # raised tray over the table, cove in its edge
RAFT_Z = HX
RAFT_X = 0.0
WIN_L = (0.8, D - 0.6)
BAY = 1.5
TB = dict(x0=3.25, x1=4.75, y0=3.0, y1=9.4)            # table
SCR = dict(x0=2.1, x1=5.9, z_top=2.85, z_bot=0.95, y=D - 0.28)   # projection screen (16:10)
DISP = dict(x0=6.3, x1=7.74, z0=1.1, z1=1.91)          # 65" VC display, right of the screen
FAN = (4.0, 6.0)                        # unused (kept for shared code)
AC = (4.0, 1.9)
CAM_POS = (4.0, 0.5, 1.45)            # centred on the table axis
SKY_ROT = rad(float(next((a.split("=")[1] for a in ARGS if a.startswith("--skyrot=")), "90")))
SKY_SHIFT = 0.06
SKY_STRENGTH = 1.0
CHAIR_ROT = 0.0
SOFA_ROT = 0.0
RAFT = dict(x0=RAFT_X, z=RAFT_Z)

CIRCUITS = ["bd_general", "bd_table", "bd_feature", "bd_front", "bd_vc", "bd_accent", "bd_projection"]
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
    slab=procedural("exposed_slab", [(0.0, "#56544f"), (0.5, "#64615c"), (1.0, "#5b5954")], 0.9, scale=6.0, distortion=0.4, detail=12, bump=0.25, tiles=(2.4, 1.2, "#3f3d3a")),
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

BOARD_DIR = os.path.join(BASE, "models", "boardroom")
CHAIRS = find_assets("chair_board", BOARD_DIR) or find_assets("chair_task")
PROJS = find_assets("projector", BOARD_DIR)
FANS = find_assets("fan_ceiling")
SOFAS = find_assets("sofa", os.path.join(BASE, "models", "cabin"))
PLANTS = find_assets("plant_", os.path.join(BASE, "models", "lobby"))

def task_chair(name, x, y, facing):
    if CHAIRS:
        return place_asset(name, CHAIRS[0], x, y, 0.0, facing + CHAIR_ROT + rad(random.uniform(-8, 8)), height=1.15 if "chair_board" in CHAIRS[0] else 1.02)
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
    return (RAFT_A[0] <= x and y <= RAFT_A[3]) or (RAFT_B[0] <= x and y >= RAFT_B[2])

# ---------------------------------------------------------------- shell
boxb("floor", 0, W, 0, D, -0.1, 0, MAT["floor"])
boxb("ceiling", 0, W, 0, D, HX, HX + 0.1, MAT["raft"])
cutter = boxb("tray_cutter", COF["x0"], COF["x1"], COF["y0"], COF["y1"], HX - 0.1, HX + 0.3, None)
bo = bpy.data.objects["ceiling"].modifiers.new("tray", "BOOLEAN"); bo.operation = "DIFFERENCE"; bo.object = cutter
cutter.hide_render = True; cutter.hide_viewport = True
boxb("tray_top", COF["x0"], COF["x1"], COF["y0"], COF["y1"], COF["z"], COF["z"] + 0.05, MAT["raft"])
for nm, x0, x1, y0, y1 in (("l", COF["x0"] - 0.02, COF["x0"], COF["y0"], COF["y1"]), ("r", COF["x1"], COF["x1"] + 0.02, COF["y0"], COF["y1"]),
                           ("f", COF["x0"], COF["x1"], COF["y0"] - 0.02, COF["y0"]), ("b", COF["x0"], COF["x1"], COF["y1"], COF["y1"] + 0.02)):
    boxb(f"tray_side_{nm}", x0, x1, y0, y1, HX + 0.1, COF["z"], MAT["raft"])
for nm, x0, x1, y0, y1 in (("l", COF["x0"] + 0.04, COF["x0"] + 0.08, COF["y0"], COF["y1"]), ("r", COF["x1"] - 0.08, COF["x1"] - 0.04, COF["y0"], COF["y1"]),
                           ("f", COF["x0"], COF["x1"], COF["y0"] + 0.04, COF["y0"] + 0.08), ("b", COF["x0"], COF["x1"], COF["y1"] - 0.08, COF["y1"] - 0.04)):
    strip(f"cove_{nm}", x0, x1, y0, y1, HX + 0.1, HX + 0.12, "bd_feature", 22, down=False)
boxb("wall_back", 0, W, -0.2, 0, 0, HX, MAT["wall_left"])
boxb("wall_front", 0, W, D, D + 0.2, 0, HX, MAT["wall_left"])
boxb("wall_right", W, W + 0.2, 0, D, 0, HX, MAT["wall_right"])
boxb("wall_left_a", -0.2, 0, 0, WIN_L[0], 0, HX, MAT["wall_left"])
boxb("wall_left_b", -0.2, 0, WIN_L[1], D, 0, HX, MAT["wall_left"])
boxb("glass_left", -0.03, 0, WIN_L[0], WIN_L[1], 0, HX, MAT["window"])
rb = random.Random(7)
nb = max(1, int(round((WIN_L[1] - WIN_L[0]) / BAY)))
for k in range(nb + 1):
    a = WIN_L[0] + k * (WIN_L[1] - WIN_L[0]) / nb
    boxb(f"mullion_{k}", -0.04, 0.02, a - 0.02, a + 0.02, 0, HX, MAT["metal"])
for k in range(nb):
    b0 = WIN_L[0] + k * (WIN_L[1] - WIN_L[0]) / nb + 0.03; b1 = WIN_L[0] + (k + 1) * (WIN_L[1] - WIN_L[0]) / nb - 0.03
    f = 1.0 if CLOSED else rb.uniform(0.15, 0.35)
    top = HX - 0.04; n = int(f * (top - 0.1) / 0.03)
    bm = bmesh.new()
    for i in range(n):
        z = top - 0.06 - i * 0.03
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0.09, (b0 + b1) / 2, z)) @ Matrix.Rotation(rad(-55 if CLOSED else -15), 4, "Y") @ Matrix.Diagonal((0.025, b1 - b0, 0.002, 1)))
    finish(f"blind_slats_{k}", bm, MAT["blind"])
    boxb(f"blind_head_{k}", 0.05, 0.13, b0, b1, top - 0.04, top, MAT["metal"])
    boxb(f"blind_rail_{k}", 0.07, 0.11, b0, b1, top - 0.08 - n * 0.03, top - 0.065 - n * 0.03, MAT["metal"])
boxb("sill", 0, 0.08, WIN_L[0], WIN_L[1], 0, 0.04, MAT["metal"])
# right wall: full-height timber slats with a grazing wash (feature)
for k in range(int((D - 0.4) / 0.09)):
    y = 0.2 + k * 0.09
    boxb(f"slat_r_{k}", W - 0.05, W, y - 0.022, y + 0.022, 0, HX, MAT["wood"])
strip("slat_graze", W - 0.25, W - 0.2, 0.4, D - 0.4, HX - 0.04, HX - 0.02, "bd_feature", 14)
strip("slat_floor_glow", W - 0.25, W - 0.2, 0.4, D - 0.4, 0.02, 0.04, "bd_feature", 6, down=False)

# ---------------------------------------------------------------- front wall: dark stone feature panel, recessed motorised screen, projector, camera bar, speakers
boxb("front_panel", 1.4, 6.6, D - 0.08, D, 0, HX, MAT["slab"])
strip("front_panel_cove", 1.45, 6.55, D - 0.12, D - 0.09, HX - 0.04, HX - 0.02, "bd_feature", 10)
boxb("screen_slot", SCR["x0"] - 0.1, SCR["x1"] + 0.1, SCR["y"] - 0.08, SCR["y"] + 0.08, HX - 0.005, HX, MAT["beam"])
if SCREEN:
    boxb("screen_fabric", SCR["x0"], SCR["x1"], SCR["y"] - 0.005, SCR["y"] + 0.005, SCR["z_bot"], HX, MAT["ceramic_w"] if "ceramic_w" in MAT else MAT["ceramic"])
    boxb("screen_border", SCR["x0"], SCR["x1"], SCR["y"] - 0.007, SCR["y"] - 0.005, SCR["z_top"], HX, MAT["beam"])
    boxb("screen_bar", SCR["x0"] - 0.02, SCR["x1"] + 0.02, SCR["y"] - 0.02, SCR["y"] + 0.02, SCR["z_bot"] - 0.03, SCR["z_bot"], MAT["beam"])
    boxb("screen_image", SCR["x0"] + 0.05, SCR["x1"] - 0.05, SCR["y"] - 0.0072, SCR["y"] - 0.0071, SCR["z_bot"] + 0.05, SCR["z_top"] - 0.03, MAT["tv"], group="bd_projection")
    light("projection_spill", "AREA", 60, ((SCR["x0"] + SCR["x1"]) / 2, SCR["y"] - 0.05, (SCR["z_top"] + SCR["z_bot"]) / 2), "bd_projection",
          size=(SCR["x1"] - SCR["x0"], SCR["z_top"] - SCR["z_bot"]), rot=(-math.pi / 2, 0, 0))
PJ = (4.0, 6.6, HX - 0.62)
PROJ_ROT = rad(180)                     # lens toward the screen (+y); flip to 0 if it points backwards
if PROJS:
    place_asset("projector", PROJS[0], PJ[0], PJ[1], HX, PROJ_ROT, height=0.7, top=True)
else:
    cyl("projector_drop", 0.025, 0.025, 0.3, (PJ[0], PJ[1], HX - 0.3), MAT["beam"], seg=12)
    boxb("projector_body", PJ[0] - 0.22, PJ[0] + 0.22, PJ[1] - 0.2, PJ[1] + 0.2, PJ[2] - 0.08, PJ[2] + 0.08, MAT["monitor"], 0.01)
    cyl("projector_lens", 0.05, 0.05, 0.04, (PJ[0], PJ[1] + 0.2, PJ[2]), MAT["monitor_screen"], seg=24, rot=(-math.pi / 2, 0, 0))
if SCREEN:
    cyl("projector_lens_glow", 0.035, 0.035, 0.005, (PJ[0], PJ[1] + 0.245, PJ[2]), MAT["led"], seg=24, rot=(-math.pi / 2, 0, 0), group="bd_projection")
VC = (4.0, D - 0.42, 0.62)                 # VC camera bar on the credenza, centred under the screen (no TV)
boxb("vc_camera_bar", VC[0] - 0.45, VC[0] + 0.45, VC[1] - 0.05, VC[1] + 0.05, 0.55, 0.63, MAT["monitor"], 0.01)
cyl("vc_camera_lens", 0.025, 0.025, 0.01, (VC[0], VC[1] - 0.05, 0.59), MAT["monitor_screen"], seg=20, rot=(-math.pi / 2, 0, 0))
for k, x in enumerate((1.75, 6.05)):
    boxb(f"spk_tower_{k}", x - 0.13, x + 0.13, D - 0.45, D - 0.2, 0, 1.15, MAT["monitor"], 0.01)
    cyl(f"spk_tower_{k}_driver", 0.06, 0.06, 0.005, (x, D - 0.452, 0.85), MAT["beam"], seg=24, rot=(-math.pi / 2, 0, 0))
boxb("front_credenza", 2.2, 5.8, D - 0.55, D - 0.08, 0, 0.55, MAT["darkwood"], 0.006)
strip("front_credenza_glow", 2.25, 5.75, D - 0.56, D - 0.54, 0.02, 0.03, "bd_accent", 6)
for k, (x, y, h) in enumerate(((0.55, D - 0.5, 1.8), (W - 0.45, D - 0.5, 1.6), (0.5, 0.5, 1.9))):
    plant(f"plant_{k}", x, y, h)
light("accent_plant_0", "SPOT", 25, (0.8, D - 0.8, 0.05), "bd_accent", target=(0.55, D - 0.5, 1.4), spot=40)
light("accent_plant_1", "SPOT", 25, (W - 0.7, D - 0.8, 0.05), "bd_accent", target=(W - 0.45, D - 0.5, 1.4), spot=40)

# ---------------------------------------------------------------- window credenza with decor
boxb("win_credenza", 0.25, 0.75, 2.0, 9.6, 0, 0.6, MAT["darkwood"], 0.006)
strip("win_credenza_glow", 0.76, 0.78, 2.05, 9.55, 0.02, 0.03, "bd_accent", 6)
for k, y in enumerate((3.0, 5.6, 8.4)):
    cyl(f"decor_vase_{k}", 0.06, 0.08, 0.28 + 0.06 * (k % 2), (0.5, y, 0.6), MAT["ceramic"], seg=28)
if PLANTS:
    plant("credenza_plant", 0.5, 7.0, 0.45, z=0.6)

# ---------------------------------------------------------------- table (dark wood, power hatches), chairs, table pendant
X0, X1, Y0, Y1 = TB["x0"], TB["x1"], TB["y0"], TB["y1"]
boxb("table_top", X0, X1, Y0, Y1, 0.72, 0.77, MAT["darkwood"], 0.012)
boxb("table_edge", X0 + 0.02, X1 - 0.02, Y0 + 0.02, Y1 - 0.02, 0.69, 0.72, MAT["beam"])
for k, y in enumerate((Y0 + 1.0, (Y0 + Y1) / 2, Y1 - 1.0)):
    boxb(f"table_base_{k}", 3.75, 4.25, y - 0.35, y + 0.35, 0, 0.69, MAT["darkwood"], 0.01)
    boxb(f"table_hatch_{k}", 3.85, 4.15, y - 0.12, y + 0.12, 0.77, 0.772, MAT["metal"])
seats = [Y0 + 0.65 + i * 1.02 for i in range(6)]
for i, y in enumerate(seats):
    for side, x in ((-1, X0 - 0.55), (1, X1 + 0.55)):
        task_chair(f"chair_{side}_{i}", x, y, rad(90 if side < 0 else -90))
        if i % 2 == 0:
            cyl(f"glass_{side}_{i}", 0.035, 0.03, 0.12, (x - side * 0.85, y + 0.25, 0.77), MAT["partition"], seg=16)
            boxb(f"pad_{side}_{i}", x - side * 0.95 - 0.12, x - side * 0.95 + 0.12, y - 0.16, y + 0.16, 0.77, 0.775, MAT["beam"])
task_chair("chair_end", 4.0, Y0 - 0.6, rad(180))
rbox("touch_panel", 4.0, Y0 + 2.2, 0.77, 0.26, 0.18, 0.12, rad(10), MAT["monitor"], 0.005)
boxb("touch_panel_glow", 3.89, 4.11, Y0 + 2.19, Y0 + 2.21, 0.83, 0.88, MAT["keypad"], group="bd_accent")
if PLANTS:
    plant("table_plant", 4.0, (Y0 + Y1) / 2 + 0.8, 0.35, z=0.77)
L0, L1, LZ = Y0 + 0.3, Y1 - 0.3, 2.25
for j, yy in enumerate((L0 + 0.5, L1 - 0.5)):
    cyl(f"table_lin_cable_{j}", 0.0015, 0.0015, COF["z"] - LZ - 0.06, (4.0, yy, LZ + 0.06), MAT["metal"], seg=6)
boxb("table_lin_body", 3.96, 4.04, L0, L1, LZ, LZ + 0.06, MAT["beam"], 0.004)
boxb("table_lin_diffuser", 3.97, 4.03, L0 + 0.02, L1 - 0.02, LZ - 0.004, LZ, MAT["led"], group="bd_table")
light("table_lin_down", "AREA", 320, (4.0, (L0 + L1) / 2, LZ - 0.01), "bd_table", size=(0.06, L1 - L0))
light("table_lin_up", "AREA", 25, (4.0, (L0 + L1) / 2, LZ + 0.07), "bd_table", size=(0.06, L1 - L0), rot=(math.pi, 0, 0))

# ---------------------------------------------------------------- general downlights (perimeter), front/presentation downlights, VC face lighting, AC, speakers
n = 0
for y in (1.0, 3.0, 5.0, 7.0, 9.0):
    for x in (1.0, 7.0):
        downlight(f"dl_g_{n}", x, y, HX, "bd_general", 45, 60); n += 1
for x in (2.4, 4.0, 5.6):
    downlight(f"dl_g_{n}", x, 0.9, HX, "bd_general", 45, 60); n += 1
for k, x in enumerate((1.0, 2.6, 4.0, 5.4, 7.0)):          # front row: dims for presentation
    downlight(f"dl_front_{k}", x, 11.5, HX, "bd_front", 55, 55, target=(x, D, 1.2))
for k, x in enumerate((2.2, 5.8)):                         # VC face lighting: soft panels aimed at the participants
    boxb(f"vc_panel_{k}", x - 0.6, x + 0.6, 10.6, 10.9, HX - 0.004, HX, MAT["led"], group="bd_vc")
    light(f"vc_light_{k}", "AREA", 160, (x, 10.75, HX - 0.01), "bd_vc", target=(4.0, 5.5, 1.1), size=(1.2, 0.3))
cx, cy = AC; cz = HX
boxb("ac_panel", cx - 0.42, cx + 0.42, cy - 0.42, cy + 0.42, cz - 0.03, cz, MAT["grille"], 0.01)
boxb("ac_grille", cx - 0.22, cx + 0.22, cy - 0.22, cy + 0.22, cz - 0.034, cz - 0.03, MAT["grille"])
for k in range(9):
    o = -0.2 + k * 0.05
    boxb(f"ac_grille_bar_{k}", cx - 0.21, cx + 0.21, cy + o - 0.004, cy + o + 0.004, cz - 0.037, cz - 0.034, MAT["beam"])
for k, (x0, x1, y0, y1) in enumerate(((cx - 0.34, cx + 0.34, cy + 0.29, cy + 0.35), (cx - 0.34, cx + 0.34, cy - 0.35, cy - 0.29),
                                      (cx + 0.29, cx + 0.35, cy - 0.34, cy + 0.34), (cx - 0.35, cx - 0.29, cy - 0.34, cy + 0.34))):
    boxb(f"ac_slot_{k}", x0, x1, y0, y1, cz - 0.036, cz - 0.03, MAT["beam"])
for k, (x, y) in enumerate(((1.0, 4.0), (7.0, 4.0), (1.0, 8.0), (7.0, 8.0))):
    cyl(f"speaker_{k}", 0.1, 0.1, 0.004, (x, y, HX - 0.004), MAT["ceramic"], seg=40)
FAN_Z = HX
fan_obj = None

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

for name, elev, azi, strength in (("day_morning", 20, 150, 3.5), ("day_midday", 35, 120, 3.5), ("day_evening", 10, 70, 2.5)):
    ld = bpy.data.lights.new(name, "SUN"); ld.energy = strength; ld.angle = rad(3.0)
    ob = bpy.data.objects.new(name, ld); ROOT.objects.link(ob); ob.lightgroup = name
    e_, a_ = rad(elev), rad(azi)     # sun sits beyond the window wall (+y)
    d = -Vector((math.cos(e_) * math.cos(a_), math.cos(e_) * math.sin(a_), math.sin(e_)))
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

# ---------------------------------------------------------------- camera (OFFICE_CAMERA): front-left, desks foreground, meeting centre, break right
cd = bpy.data.cameras.new("hero"); cd.lens = 21.0; cd.sensor_width = 36.0; cd.sensor_fit = "HORIZONTAL"
cd.lens = 20.0; cd.shift_y = 0.04; cd.clip_end = 5000
cam = bpy.data.objects.new("hero", cd); ROOT.objects.link(cam)
cam.location = tuple(CAM_POS)
cam.rotation_euler = (rad(90), 0, 0.0)              # straight down the table to the screen wall
scene.camera = cam

# ---------------------------------------------------------------- render settings
FINAL = MODE == "final"
scene.render.engine = "CYCLES"
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"; prefs.get_devices()
    for dev in prefs.devices:
        dev.use = dev.type == "METAL"
    scene.cycles.device = "GPU"
except Exception as err:
    print("GPU setup skipped:", err)
scene.render.resolution_x, scene.render.resolution_y = (1536, 1064) if FINAL else (768, 532)
scene.render.resolution_percentage = 100
scene.cycles.samples = int(next((x.split("=")[1] for x in ARGS if x.startswith("--samples=")), 768 if FINAL else 128))
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
    "bd-general": (1.0, 7.0, HX), "bd-table": (4.0, 6.2, 2.25), "bd-feature": (W - 0.05, 7.0, 2.2), "bd-front": (4.0, 11.5, HX),
    "bd-vc": (5.8, 10.75, HX), "bd-accent": (0.5, 5.6, 0.75), "bd-projection": (4.0, SCR["y"], 1.9),
    "screen": ((SCR["x0"] + SCR["x1"]) / 2, SCR["y"], HX - 0.05), "projector": PJ, "vc": (VC[0], VC[1] - 0.05, 0.59),
    "speakers": (6.05, D - 0.45, 0.85), "blinds": (0.09, 6.0, 2.6), "hvac": (AC[0], AC[1], HX), "keypad": (4.0, Y0 + 2.2, 0.85),
}
bpy.context.view_layer.update()
spots = {}
for k, co in HOT.items():
    v = world_to_camera_view(scene, cam, Vector(co))
    spots[k] = {"u": round(v.x, 4), "v": round(1 - v.y, 4), "visible": bool(0 <= v.x <= 1 and 0 <= v.y <= 1 and v.z > 0)}
sr = []
for x in (SCR["x0"], SCR["x1"]):
    for z in (SCR["z_bot"] - 0.04, HX):
        v = world_to_camera_view(scene, cam, Vector((x, SCR["y"], z)))
        sr.append((v.x, 1 - v.y))
screen_rect = [round(min(p[0] for p in sr), 4), round(min(p[1] for p in sr), 4), round(max(p[0] for p in sr), 4), round(max(p[1] for p in sr), 4)]
with open(os.path.join(OUT, "hotspots.json"), "w") as f:
    json.dump({"camera": "hero", "points": spots, "screen_rect": screen_rect, "screen_rect_order": "u0, v0, u1, v1 (v down); screen drops from v0 to v1"}, f, indent=2)

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
TINTS = {"bd_general": CCT[3500], "bd_table": CCT[3500], "bd_feature": CCT[3000], "bd_front": CCT[3500], "bd_vc": CCT[4000],
         "bd_accent": CCT[2700], "bd_projection": (1, 1, 1, 1)}
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
print(f"[uniser] built boardroom, mode={MODE}, closed={CLOSED}, fanblur={FANBLUR}, passes={written}")
print("[uniser] chair:", os.path.relpath(CHAIRS[0], BASE) if CHAIRS else "fallback", "| projector:", "model" if PROJS else "fallback", "| chairs:", "model" if CHAIRS else "fallback", "| fan:", "model" if FANS else "fallback",
      "| sofa:", "model" if SOFAS else "fallback", "| plants:", len(PLANTS))
print("[uniser] hotspots not in view:", [k for k, s in spots.items() if not s["visible"]])

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
