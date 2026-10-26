"""
Uniser SmartSpaces - Commercial Office, CXO Cabin
Builds the cabin in Blender and renders one linear EXR pass per lighting circuit.

  Blender -b -P cabin_build_v1.py -- --build             # build + save .blend only (check layout)
  Blender -b -P cabin_build_v1.py -- --preview           # 960x540, blinds open
  Blender -b -P cabin_build_v1.py -- --preview --closed  # blinds closed
  Blender -b -P cabin_build_v1.py -- --final             # 1920x1080 + daylight, blinds open
  Blender -b -P cabin_build_v1.py -- --final --closed    # second plate set, blinds closed
  add --nc to include the NonCommercial metal sculpture (test renders only)

Assets in models/cabin/: chair_exec (pair, split), sofa_*, lamp_* (pair, split), plant_*, decor_*,
art/*.jpg (canvas), sky/*.exr (night skyline HDRI). Anything missing falls back to simple geometry.
Shelf strips render white; the app tints them to any colour (feature RGB), same maths as tunable white.
"""

import bpy, bmesh, math, os, sys, json, random, glob
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MODE = "final" if "--final" in ARGS else "build" if "--build" in ARGS else "preview"
DAYLIGHT = MODE == "final" or "--daylight" in ARGS
CLOSED = "--closed" in ARGS
USE_NC = "--nc" in ARGS
TAG = MODE + ("_closed" if CLOSED else "")
BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "out_cabin")
ASSET_DIR = os.path.join(BASE, "models", "cabin")
os.makedirs(OUT, exist_ok=True)
random.seed(12)
rad = math.radians

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
VL = scene.view_layers[0]
ROOT = bpy.data.collections.new("Cabin")
scene.collection.children.link(ROOT)

# ---------------------------------------------------------------- plan
# x across (0 = window wall, left), y into the room (D = feature/shelf wall), z up
W, D = 8.0, 7.0
H, HT = 2.85, 3.1                      # ceiling, cove tray
TRAY = dict(x0=1.0, x1=6.8, y0=1.0, y1=6.1)
WY0, WY1 = 0.6, 6.0                    # window on the left wall (x = 0)
DESK = dict(x0=2.8, x1=5.0, y0=4.2, y1=5.1, z=0.78)
PX, PY, PZ = 3.9, 4.65, 2.15           # linear pendant over the desk
SOFA = (0.6, 2.6)
CT = (1.75, 2.6)                       # coffee table
LAMP = (0.6, 4.25)
ART = (7.15, 1.75)                     # art centre x, z on the back wall
SOFA_ROT = rad(90)                     # glTF assets face -y at 0; flip by 180 if one faces the wall
CHAIR_ROT_EXEC, CHAIR_ROT_VISIT = 0.0, rad(180)
CHAIR_PICK_EXEC, CHAIR_PICK_VISIT, LAMP_PICK = 0, 1, 1   # which model of each pair (0 = first along the long axis)
SKY_ROT = rad(-150)                     # turns the HDRI so the Bund skyline sits where the camera looks through the glass
SKY_STRENGTH = 0.7
SKY_SHIFT = 0.08                       # drops the photo's horizon below eye level (high floor)

CIRCUITS = ["cx_cove", "cx_general", "cx_task", "cx_accent", "cx_feature", "cx_shelf", "cx_plinth", "cx_deco", "cx_lounge"]
DAY = ["day_sky", "day_morning", "day_midday", "day_evening"]
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
    setin(b, "Base Color", (*lin(hexc), 1))
    setin(b, "Roughness", rough)
    setin(b, "Metallic", metal)
    for k, v in kw.items():
        setin(b, k.replace("_", " "), v)
    return m

def procedural(name, stops, rough, kind="noise", scale=1.0, mscale=(1, 1, 1), distortion=2.0,
               detail=8.0, bump=0.0, coat=0.0, tiles=None):
    m = principled(name, "#808080", rough, Coat_Weight=coat, Coat_Roughness=0.04)
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
        mix = N.new("ShaderNodeMixRGB"); mix.inputs["Color2"].default_value = (*lin("#120e0b"), 1)
        L.new(br.outputs["Fac"], mix.inputs["Fac"]); L.new(col, mix.inputs["Color1"]); col = mix.outputs["Color"]
    L.new(col, b.inputs["Base Color"])
    if bump:
        bp = N.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = bump
        L.new(t.outputs["Fac"], bp.inputs["Height"]); L.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m

def emission(name, strength):
    m = bpy.data.materials.new(name); m.use_nodes = True
    N = m.node_tree.nodes; L = m.node_tree.links; N.clear()
    e = N.new("ShaderNodeEmission"); e.inputs["Strength"].default_value = strength
    o = N.new("ShaderNodeOutputMaterial"); L.new(e.outputs[0], o.inputs["Surface"])
    return m

def window_glass():
    m = bpy.data.materials.new("window_glass"); m.use_nodes = True
    N = m.node_tree.nodes; L = m.node_tree.links; N.clear()
    tr = N.new("ShaderNodeBsdfTransparent")
    sp = N.new("ShaderNodeBsdfPrincipled"); setin(sp, "Base Color", (0, 0, 0, 1)); setin(sp, "Roughness", 0.02); setin(sp, "Specular IOR Level", 0.18)
    add = N.new("ShaderNodeAddShader"); o = N.new("ShaderNodeOutputMaterial")
    L.new(tr.outputs[0], add.inputs[0]); L.new(sp.outputs[0], add.inputs[1]); L.new(add.outputs[0], o.inputs["Surface"])
    return m

def lamp_shade():
    m = bpy.data.materials.new("lamp_shade"); m.use_nodes = True
    N = m.node_tree.nodes; L = m.node_tree.links; N.clear()
    tl = N.new("ShaderNodeBsdfTranslucent"); tl.inputs["Color"].default_value = (*lin("#fff1dc"), 1)
    df = N.new("ShaderNodeBsdfDiffuse"); df.inputs["Color"].default_value = (*lin("#e6d6bf"), 1)
    mx = N.new("ShaderNodeMixShader"); mx.inputs[0].default_value = 0.3
    o = N.new("ShaderNodeOutputMaterial")
    L.new(tl.outputs[0], mx.inputs[1]); L.new(df.outputs[0], mx.inputs[2]); L.new(mx.outputs[0], o.inputs["Surface"])
    return m

def day_sky_card():
    """Transparent + emission: adds a daylight sky in its own pass while the night world still shows through."""
    m = bpy.data.materials.new("day_sky_card"); m.use_nodes = True
    N = m.node_tree.nodes; L = m.node_tree.links; N.clear()
    out = N.new("ShaderNodeOutputMaterial"); add = N.new("ShaderNodeAddShader")
    tr = N.new("ShaderNodeBsdfTransparent"); em = N.new("ShaderNodeEmission")
    tc = N.new("ShaderNodeTexCoord"); sx = N.new("ShaderNodeSeparateXYZ"); cr = N.new("ShaderNodeValToRGB")
    e = cr.color_ramp.elements
    e[0].position = 0.08; e[0].color = (*lin("#e9eef2"), 1); e[1].position = 0.6; e[1].color = (*lin("#6f9fd6"), 1)
    L.new(tc.outputs["Generated"], sx.inputs[0]); L.new(sx.outputs["Z"], cr.inputs["Fac"])
    L.new(cr.outputs["Color"], em.inputs["Color"]); em.inputs["Strength"].default_value = 3.0
    L.new(tr.outputs[0], add.inputs[0]); L.new(em.outputs[0], add.inputs[1]); L.new(add.outputs[0], out.inputs["Surface"])
    return m

def art_material():
    imgs = sorted(glob.glob(os.path.join(ASSET_DIR, "art", "*.jp*g")) + glob.glob(os.path.join(ASSET_DIR, "art", "*.png")))
    if not imgs:
        return procedural("art_canvas", [(0.0, "#0d0d0d"), (0.5, "#5a5650"), (1.0, "#e6e1d8")], 0.8, scale=1.8, distortion=8.0, detail=12)
    m = principled("art_print", "#ffffff", 0.75)
    N = m.node_tree.nodes; L = m.node_tree.links; b = N["Principled BSDF"]
    tc = N.new("ShaderNodeTexCoord"); sx = N.new("ShaderNodeSeparateXYZ"); cb = N.new("ShaderNodeCombineXYZ")
    L.new(tc.outputs["Generated"], sx.inputs[0]); L.new(sx.outputs["X"], cb.inputs["X"]); L.new(sx.outputs["Z"], cb.inputs["Y"])
    tx = N.new("ShaderNodeTexImage"); tx.image = bpy.data.images.load(imgs[0]); tx.extension = "EXTEND"
    L.new(cb.outputs[0], tx.inputs["Vector"]); L.new(tx.outputs["Color"], b.inputs["Base Color"])
    print("[uniser] art:", os.path.basename(imgs[0]))
    return m

MAT = dict(
    floor=procedural("floor_stone", [(0.0, "#2c2824"), (0.5, "#3a3530"), (1.0, "#312c27")], 0.5,
                     scale=0.9, distortion=3.0, detail=8, coat=0.04, tiles=(1.2, 0.6)),
    desk=procedural("marble_desk", [(0.0, "#6e665d"), (0.46, "#8c8378"), (0.5, "#2c2621"), (0.54, "#8c8378"), (1.0, "#7a7166")],
                    0.14, scale=0.55, distortion=4.5, detail=10, coat=0.6),
    marble_wall=procedural("marble_feature", [(0.0, "#5f5850"), (0.47, "#7d756b"), (0.5, "#3a342e"), (0.53, "#7d756b"), (1.0, "#6c655c")],
                           0.28, scale=0.45, distortion=4.0, detail=10, coat=0.25),
    stone=procedural("travertine", [(0.0, "#6d6152"), (0.5, "#8a7c69"), (1.0, "#7a6d5c")], 0.45,
                     scale=1.5, mscale=(1.4, 1.4, 9.0), distortion=1.5, bump=0.05),
    walnut=procedural("walnut", [(0.0, "#1c120b"), (0.6, "#2e1f13"), (1.0, "#3a2818")], 0.45,
                      kind="wave", scale=4.0, distortion=7.0, detail=4, coat=0.2),
    wall=procedural("plaster_wall", [(0.0, "#2a231d"), (1.0, "#352c24")], 0.85, scale=3.0, bump=0.05),
    ceiling=procedural("ceiling_plaster", [(0.0, "#5a5046"), (1.0, "#665a4e")], 0.9, scale=2.0, bump=0.03),
    rug=procedural("rug", [(0.0, "#2a2724"), (0.45, "#3e3a35"), (0.55, "#57504a"), (0.62, "#3e3a35"), (1.0, "#24211e")],
                   0.95, scale=0.9, distortion=6.0, detail=3),
    engrave=principled("engrave", "#d9d2c6", 0.55),
    blind=principled("blind_slat", "#38332e", 0.55, 0.3),
    drape=principled("drape_taupe", "#6e5f50", 0.9, Sheen_Weight=0.5),
    leather=principled("leather_dark", "#22160f", 0.45, Coat_Weight=0.2),
    leather_pad=principled("desk_pad", "#1a120c", 0.5),
    cream=principled("fabric_cream", "#b8ab98", 0.9, Sheen_Weight=0.5),
    green=principled("fabric_green", "#2c3b2c", 0.9, Sheen_Weight=0.5),
    brass=principled("brass", "#b08d4f", 0.28, 1.0),
    metal=principled("black_metal", "#1b1917", 0.4, 0.8),
    grille=principled("grille", "#0d0d0d", 0.6),
    ceramic_w=principled("ceramic_white", "#e8e3da", 0.35),
    ceramic_b=principled("ceramic_black", "#141312", 0.25),
    marble_top=principled("marble_top", "#2b2723", 0.1, Coat_Weight=0.8),
    screen=principled("laptop_screen", "#05070c", 0.2),
    leaf=principled("foliage", "#2d4626", 0.45, Subsurface_Weight=0.15),
    window=window_glass(),
    shade=lamp_shade(),
    skycard=day_sky_card(),
    art=art_material(),
    led=emission("led_strip", 30.0),
    lens=emission("downlight_lens", 25.0),
    filament=emission("filament", 220.0),
    keypad=emission("keypad_glow", 4.0),
)
BOOKS = [principled(f"book_{i}", h, r) for i, (h, r) in enumerate((
    ("#2a1c14", 0.6), ("#4a3424", 0.7), ("#1f2430", 0.6), ("#6b5a44", 0.8), ("#c9bfae", 0.8),
    ("#3d3026", 0.7), ("#5e2a20", 0.6), ("#14161a", 0.5), ("#8a7a62", 0.8)))]


# ---------------------------------------------------------------- mesh helpers
def finish(name, bm, mat, loc=(0, 0, 0), rot=(0, 0, 0), col=None, smooth=None):
    bm.normal_update()
    if smooth:
        for f in bm.faces:
            f.smooth = smooth(f)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    if mat:
        me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.location = loc; ob.rotation_euler = rot
    (col or ROOT).objects.link(ob)
    return ob

def modifiers(ob, bevel=0.0):
    if bevel:
        m = ob.modifiers.new("bevel", "BEVEL"); m.width = bevel; m.segments = 3; m.limit_method = "ANGLE"
    return ob

def boxb(name, x0, x1, y0, y1, z0, z1, mat, bevel=0.0, group=None):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))), verts=bm.verts)
    ob = finish(name, bm, mat, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    modifiers(ob, bevel)
    if group:
        ob.lightgroup = group
    return ob

def rbox(name, cx, cy, z0, w, d, h, ang, mat, bevel=0.0, group=None):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((w, d, h)), verts=bm.verts)
    ob = finish(name, bm, mat, loc=(cx, cy, z0 + h / 2), rot=(0, 0, ang))
    modifiers(ob, bevel)
    if group:
        ob.lightgroup = group
    return ob

def cyl(name, r_bottom, r_top, h, base, mat, seg=32, caps=True, rot=(0, 0, 0), group=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, segments=seg, radius1=r_bottom, radius2=r_top, depth=h,
                          matrix=Matrix.Translation((0, 0, h / 2)))
    ob = finish(name, bm, mat, base, rot, smooth=lambda f: abs(f.normal.z) < 0.7)
    if group:
        ob.lightgroup = group
    return ob

def sphere(name, r, loc, mat, seg=32, group=None):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=r)
    ob = finish(name, bm, mat, loc, smooth=lambda f: True)
    if group:
        ob.lightgroup = group
    return ob

def aim(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

def light(name, kind, watts, loc, group, target=None, radius=0.03, spot=60, blend=0.5, size=(1, 1), rot=None):
    ld = bpy.data.lights.new(name, kind); ld.energy = watts; ld.color = (1, 1, 1)
    if kind in ("POINT", "SPOT"):
        ld.shadow_soft_size = radius
    if kind == "SPOT":
        ld.spot_size = rad(spot); ld.spot_blend = blend
    if kind == "AREA":
        ld.shape = "RECTANGLE"; ld.size = size[0]; ld.size_y = size[1]
    ob = bpy.data.objects.new(name, ld); ob.location = loc
    ROOT.objects.link(ob)
    ob.lightgroup = group
    if kind == "AREA":
        ob.visible_camera = False
    if target is not None:
        aim(ob, target)
    if rot is not None:
        ob.rotation_euler = rot
    return ob

def strip(name, x0, x1, y0, y1, z0, z1, group, watts_per_m, down=True):
    boxb(name, x0, x1, y0, y1, z0, z1, MAT["led"], group=group)
    L = max(x1 - x0, y1 - y0)
    light(f"{name}_light", "AREA", watts_per_m * L, ((x0 + x1) / 2, (y0 + y1) / 2, z0 - 0.01 if down else z1 + 0.01), group,
          size=(max(x1 - x0, 0.04), max(y1 - y0, 0.04)), rot=None if down else (math.pi, 0, 0))

def reveal(name, x, y, z0, z1, group, watts_per_m):
    """Vertical LED reveal on the back wall, shining into the room (-y)."""
    boxb(name, x - 0.012, x + 0.012, y - 0.01, y, z0, z1, MAT["led"], group=group)
    light(f"{name}_light", "AREA", watts_per_m * (z1 - z0), (x, y - 0.02, (z0 + z1) / 2), group,
          size=(0.04, z1 - z0), rot=(-math.pi / 2, 0, 0))

def downlight(name, x, y, z, group, watts=40, spot=55, target=None):
    cyl(f"{name}_lens", 0.05, 0.05, 0.01, (x, y, z - 0.01), MAT["lens"], seg=24, group=group)
    light(name, "SPOT", watts, (x, y, z - 0.03), group, target=target, spot=spot, blend=0.6, radius=0.03)

def curtain_y(name, y0, y1, x, z0, z1, mat, folds_per_m=6.0, amp=0.05):
    bm = bmesh.new(); n = max(12, int((y1 - y0) * folds_per_m * 6)); rows = []
    for i in range(n + 1):
        t = i / n; y = y0 + (y1 - y0) * t
        xx = x + amp * math.sin(t * (y1 - y0) * folds_per_m * 2 * math.pi)
        rows.append((bm.verts.new((xx, y, z0)), bm.verts.new((xx, y, z1))))
    for i in range(n):
        bm.faces.new((rows[i][0], rows[i + 1][0], rows[i + 1][1], rows[i][1]))
    return finish(name, bm, mat, smooth=lambda f: True)


# ---------------------------------------------------------------- real assets (models/cabin/*)
_ASSETS = {}

def find_assets(prefix, folder=ASSET_DIR):
    out = []
    for p in (f"{prefix}*.glb", f"{prefix}*.gltf", f"{prefix}*/*.glb", f"{prefix}*/*.gltf", f"{prefix}*/**/*.gltf"):
        out += glob.glob(os.path.join(folder, p), recursive=True)
    return sorted(set(out))

def _split_pick(new, pick, before):
    """Keeps one model from a file that holds a pair side by side (chairs, lamps)."""
    meshes = [o for o in new if o.type == "MESH"]
    others = [o for o in new if o.type != "MESH"]
    if not meshes:
        return new
    try:
        bpy.ops.object.select_all(action="DESELECT")
        for o in meshes:
            o.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.separate(type="LOOSE"); bpy.ops.object.mode_set(mode="OBJECT")
    except Exception as err:
        print("[uniser] separate skipped:", err)
    bpy.context.view_layer.update()
    parts = []
    for o in bpy.data.objects:
        if o not in before and o.type == "MESH":
            ws = [o.matrix_world @ Vector(c) for c in o.bound_box]
            parts.append((o, sum(ws, Vector()) / 8))
    if len(parts) < 2:
        return meshes + others
    xs = [c.x for _, c in parts]; ys = [c.y for _, c in parts]
    ax = 0 if max(xs) - min(xs) >= max(ys) - min(ys) else 1
    vals = sorted(c[ax] for _, c in parts)
    gap, i = max((vals[k + 1] - vals[k], k) for k in range(len(vals) - 1))
    cut = (vals[i] + vals[i + 1]) / 2
    keep = []
    for o, c in parts:
        if (c[ax] < cut) == (pick == 0):
            keep.append(o)
        else:
            bpy.data.objects.remove(o, do_unlink=True)
    print(f"[uniser] split pair: kept {len(keep)} of {len(parts)} parts (gap {gap:.2f} m)")
    return keep + others

def load_asset(path, pick=None, shade_above=None):
    key = (path, pick)
    if key in _ASSETS:
        return _ASSETS[key]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    if pick is not None:
        new = _split_pick(new, pick, before)
    bpy.context.view_layer.update()
    meshes = [o for o in new if o.type == "MESH"]
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    if shade_above is not None:
        zc = mn.z + shade_above * (mx.z - mn.z)
        for o in meshes:
            if min((o.matrix_world @ Vector(c)).z for c in o.bound_box) > zc:
                o.data.materials.clear(); o.data.materials.append(MAT["shade"])
    for o in meshes:
        for p in o.data.polygons:
            p.use_smooth = True
    coll = bpy.data.collections.new(f"asset_{os.path.basename(os.path.dirname(path))}_{pick}")
    for o in new:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
    coll.instance_offset = ((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z)
    _ASSETS[key] = (coll, mx - mn)
    print("[uniser] asset", os.path.relpath(path, ASSET_DIR), pick, tuple(round(v, 2) for v in (mx - mn)))
    return _ASSETS[key]

def place_asset(name, path, x, y, z=0.0, rotz=0.0, height=None, length=None, pick=None, shade_above=None):
    coll, size = load_asset(path, pick, shade_above)
    sc = height / max(size.z, 1e-4) if height else length / max(size.x, size.y, 1e-4)
    e = bpy.data.objects.new(name, None); e.instance_type = "COLLECTION"; e.instance_collection = coll
    e.location = (x, y, z); e.rotation_euler = (0, 0, rotz); e.scale = (sc, sc, sc); ROOT.objects.link(e)
    return e

def asset_or(name, prefix, *a, **k):
    found = find_assets(prefix)
    return place_asset(name, found[0], *a, **k) if found else None

def _seed(name):
    return sum(map(ord, name))

PLANTS = find_assets("plant_") or find_assets("plant_", os.path.join(BASE, "models", "lobby"))

def plant(name, x, y, h=1.6, z=0.0):
    if PLANTS:
        return place_asset(name, PLANTS[_seed(name) % len(PLANTS)], x, y, z, rad(_seed(name) * 37 % 360), height=h)
    cyl(f"{name}_pot", 0.18, 0.22, 0.45 * h / 1.6, (x, y, z), MAT["ceramic_b"], seg=40)
    for i in range(14):
        a = i * 2.39996; r = 0.12 + 0.18 * (i % 5) / 4
        ob = sphere(f"{name}_leaf_{i}", 0.16, (x + math.cos(a) * r, y + math.sin(a) * r, z + h * (0.45 + 0.5 * (i % 7) / 6)), MAT["leaf"], seg=10)
        ob.scale = (1.0, 0.5, 0.35); ob.rotation_euler = (0, 0.4, a)


# ---------------------------------------------------------------- shell
boxb("floor", 0, W, 0, D, -0.1, 0, MAT["floor"])
boxb("wall_right", W, W + 0.2, 0, D, 0, HT, MAT["wall"])
boxb("wall_front", 0, W, -0.2, 0, 0, HT, MAT["wall"])
boxb("wall_back", 0, W, D, D + 0.2, 0, HT, MAT["wall"])
for k, (y0, y1) in enumerate(((0, WY0), (WY1, D))):
    boxb(f"wall_left_{k}", -0.2, 0, y0, y1, 0, HT, MAT["wall"])
for nm, x0, x1, y0, y1 in (("l", 0, TRAY["x0"], 0, D), ("r", TRAY["x1"], W, 0, D),
                           ("f", TRAY["x0"], TRAY["x1"], 0, TRAY["y0"]), ("b", TRAY["x0"], TRAY["x1"], TRAY["y1"], D)):
    boxb(f"ceiling_{nm}", x0, x1, y0, y1, H, H + 0.2, MAT["ceiling"])
boxb("ceiling_tray", TRAY["x0"], TRAY["x1"], TRAY["y0"], TRAY["y1"], HT, HT + 0.1, MAT["ceiling"])
for nm, x0, x1, y0, y1 in (("l", TRAY["x0"] - 0.02, TRAY["x0"], TRAY["y0"], TRAY["y1"]), ("r", TRAY["x1"], TRAY["x1"] + 0.02, TRAY["y0"], TRAY["y1"]),
                           ("f", TRAY["x0"], TRAY["x1"], TRAY["y0"] - 0.02, TRAY["y0"]), ("b", TRAY["x0"], TRAY["x1"], TRAY["y1"], TRAY["y1"] + 0.02)):
    boxb(f"tray_side_{nm}", x0, x1, y0, y1, H + 0.2, HT, MAT["ceiling"])
for nm, x0, x1, y0, y1 in (("l", TRAY["x0"] + 0.04, TRAY["x0"] + 0.08, TRAY["y0"], TRAY["y1"]), ("r", TRAY["x1"] - 0.08, TRAY["x1"] - 0.04, TRAY["y0"], TRAY["y1"]),
                           ("f", TRAY["x0"], TRAY["x1"], TRAY["y0"] + 0.04, TRAY["y0"] + 0.08), ("b", TRAY["x0"], TRAY["x1"], TRAY["y1"] - 0.08, TRAY["y1"] - 0.04)):
    strip(f"cove_{nm}", x0, x1, y0, y1, H + 0.2, H + 0.22, "cx_cove", 22, down=False)

# ---------------------------------------------------------------- window wall (x = 0): glass, blinds, side drapes
boxb("window_glass", -0.04, 0, WY0, WY1, 0, H, MAT["window"])
nm = 4
for i in range(nm + 1):
    y = WY0 + (WY1 - WY0) * i / nm
    boxb(f"window_mullion_{i}", -0.05, 0.01, y - 0.03, y + 0.03, 0, H, MAT["metal"])
boxb("window_sill", -0.05, 0.04, WY0, WY1, 0, 0.04, MAT["metal"])
boxb("blind_headrail", 0.04, 0.12, WY0, WY1, H - 0.1, H, MAT["metal"])

def blinds(closed):
    bm = bmesh.new(); Ly = WY1 - WY0 - 0.02
    if closed:
        tilt, zs = rad(68), [0.06 + k * 0.045 for k in range(int((H - 0.2) / 0.045))]
    else:
        tilt, zs = 0.0, [H - 0.12 - k * 0.006 for k in range(36)]
    for z in zs:
        mtx = Matrix.Translation((0.08, (WY0 + WY1) / 2, z)) @ Matrix.Rotation(tilt, 4, "Y") @ Matrix.Diagonal((0.05, Ly, 0.003, 1.0))
        bmesh.ops.create_cube(bm, size=1.0, matrix=mtx)
    finish("blind_slats", bm, MAT["blind"])
    for k, y in enumerate((WY0 + 0.6, WY1 - 0.6)):
        boxb(f"blind_cord_{k}", 0.075, 0.08, y - 0.002, y + 0.002, zs[-1] if not closed else 0.06, H - 0.1, MAT["metal"])
    if not closed:
        boxb("blind_bottom_rail", 0.055, 0.105, WY0, WY1, zs[-1] - 0.02, zs[-1] - 0.005, MAT["metal"])

blinds(CLOSED)
boxb("drape_pocket", 0.12, 0.4, WY0 - 0.4, WY1 + 0.3, H - 0.1, H, MAT["ceiling"])
curtain_y("drape_near", WY0 - 0.35, WY0 + 0.2, 0.25, 0.02, H - 0.1, MAT["drape"], 12.0, 0.07)
curtain_y("drape_far", WY1 - 0.2, WY1 + 0.25, 0.25, 0.02, H - 0.1, MAT["drape"], 12.0, 0.07)
boxb("ac_slot", 0.5, 0.64, 1.0, 5.5, H - 0.004, H, MAT["grille"])   # linear supply diffuser (AC + fan coil)

# ---------------------------------------------------------------- back wall (y = D): shelves | feature marble | shelves | art panel
boxb("credenza", 0.3, 6.5, 6.45, D, 0.1, 0.78, MAT["walnut"], bevel=0.004)
boxb("credenza_plinth", 0.36, 6.44, 6.52, D, 0.0, 0.1, MAT["metal"])
for k in range(6):
    x = 0.3 + k * (6.2 / 6)
    boxb(f"credenza_seam_{k}", x - 0.002, x + 0.002, 6.448, 6.452, 0.12, 0.76, MAT["metal"])
strip("plinth_led", 0.38, 6.42, 6.5, 6.52, 0.085, 0.095, "cx_plinth", 10)

boxb("feature_marble", 2.1, 4.7, 6.92, D, 0.78, H, MAT["marble_wall"])
cu = bpy.data.curves.new("feature_words", "FONT")
cu.body = "VISION\nSTRATEGY\nPEOPLE\nPOSSIBILITIES"; cu.size = 0.15; cu.space_line = 1.35; cu.extrude = 0.002; cu.align_x = "LEFT"
ob = bpy.data.objects.new("feature_words", cu); ob.data.materials.append(MAT["engrave"])
ob.location = (2.55, 6.915, 2.35); ob.rotation_euler = (math.pi / 2, 0, 0); ROOT.objects.link(ob)
for k, x in enumerate((2.085, 4.715)):
    reveal(f"feature_reveal_{k}", x, 6.99, 0.78, H, "cx_feature", 12)
light("feature_graze", "AREA", 220, (3.4, 6.72, H - 0.02), "cx_feature", target=(3.4, D, 1.5), size=(2.4, 0.1))

boxb("art_panel", 6.5, W, 6.94, D, 0, H, MAT["stone"])
AW, AH = 0.85, 1.2
boxb("art_frame", ART[0] - AW / 2 - 0.03, ART[0] + AW / 2 + 0.03, 6.9, 6.94, ART[1] - AH / 2 - 0.03, ART[1] + AH / 2 + 0.03, MAT["metal"], bevel=0.003)
boxb("art_canvas", ART[0] - AW / 2, ART[0] + AW / 2, 6.895, 6.9, ART[1] - AH / 2, ART[1] + AH / 2, MAT["art"])
downlight("accent_art", ART[0], 6.0, H, "cx_accent", 120, 26, target=(ART[0], D, ART[1]))

SHELF_Z = [1.15, 1.55, 1.95, 2.35, 2.72]
ROW_Z = [0.78, 1.18, 1.58, 1.98, 2.38]
UNITS = {"L": (0.3, 1.2, 2.1), "R": (4.7, 5.6, 6.5)}
for u, xs in UNITS.items():
    boxb(f"shelf_{u}_back", xs[0], xs[-1], 6.96, D, 0.78, 2.75, MAT["walnut"])
    for k, x in enumerate(xs):
        boxb(f"shelf_{u}_side_{k}", x - 0.015, x + 0.015, 6.62, D, 0.78, 2.75, MAT["walnut"])
    for j, z in enumerate(SHELF_Z):
        boxb(f"shelf_{u}_board_{j}", xs[0], xs[-1], 6.62, 6.96, z, z + 0.03, MAT["walnut"])
        for b in range(len(xs) - 1):
            strip(f"shelf_{u}{b}_led_{j}", xs[b] + 0.03, xs[b + 1] - 0.03, 6.64, 6.66, z - 0.012, z - 0.002, "cx_shelf", 15)

rng = random.Random(7)
DECOR = {k: find_assets(f"decor_{k}") for k in ("globe", "modern_sculpture", "figure_8", "metal_sculpture")}

def books(name, x0, x1, zb, fill=0.75, max_h=0.3):
    x, end = x0, x0 + (x1 - x0) * fill
    i = 0
    while x < end:
        t = rng.uniform(0.022, 0.045); h = rng.uniform(0.2, max_h); d = rng.uniform(0.17, 0.23)
        boxb(f"{name}_{i}", x, x + t, 6.95 - d, 6.95, zb, zb + h, rng.choice(BOOKS)); x += t + 0.002; i += 1
    return x

def stack(name, cx, zb, n=None):
    z = zb
    for i in range(n or rng.randint(3, 4)):
        h = rng.uniform(0.03, 0.045)
        rbox(f"{name}_{i}", cx + rng.uniform(-0.01, 0.01), 6.8, z, rng.uniform(0.2, 0.25), rng.uniform(0.15, 0.19), h,
             rad(rng.uniform(-6, 6)), rng.choice(BOOKS), bevel=0.003); z += h
    return z

def vase(name, cx, zb, h=0.22, black=False):
    m = MAT["ceramic_b"] if black else MAT["ceramic_w"]
    cyl(f"{name}_body", 0.05, 0.075, h * 0.6, (cx, 6.8, zb), m, seg=40)
    cyl(f"{name}_neck", 0.075, 0.03, h * 0.4, (cx, 6.8, zb + h * 0.6), m, seg=40)

def decor(name, kind, cx, zb, h):
    paths = DECOR.get(kind) or []
    if kind == "metal_sculpture" and not USE_NC:
        paths = []
    if paths:
        return place_asset(name, paths[0], cx, 6.8, zb, rad(rng.uniform(-30, 30)), height=h)
    vase(name, cx, zb, h * 0.8, black=kind == "modern_sculpture")

def fill_row(name, kind, x0, x1, zb):
    xi0, xi1 = x0 + 0.04, x1 - 0.04; mid = (xi0 + xi1) / 2
    if kind == "books":
        e = books(name, xi0, xi1, zb, 0.72)
        if xi1 - e > 0.12:
            cyl(f"{name}_bookend", 0.035, 0.035, 0.12, ((e + xi1) / 2, 6.8, zb), MAT["brass"], seg=24)
    elif kind == "books_l":
        books(name, xi1 - (xi1 - xi0) * 0.55, xi1, zb, 1.0); stack(f"{name}_st", xi0 + 0.16, zb)
    elif kind == "stack_vase":
        top = stack(f"{name}_st", xi0 + 0.18, zb); vase(f"{name}_v", xi1 - 0.16, zb, 0.24)
        cyl(f"{name}_dish", 0.06, 0.07, 0.03, (xi0 + 0.18, 6.8, top), MAT["brass"], seg=32)
    elif kind == "vases":
        vase(f"{name}_a", mid - 0.12, zb, 0.26, black=True); vase(f"{name}_b", mid + 0.1, zb, 0.18)
    else:
        decor(name, kind, mid, zb, {"globe": 0.34, "modern_sculpture": 0.28, "figure_8": 0.32, "metal_sculpture": 0.3}[kind])
        if kind != "globe":
            stack(f"{name}_st", xi0 + 0.15, zb, 2)

LAYOUT = {
    ("L", 0): ["vases", "books", "metal_sculpture", "books_l", "books"],
    ("L", 1): ["books", "stack_vase", "books", "vases", "stack_vase"],
    ("R", 0): ["books", "globe", "books_l", "figure_8", "books"],
    ("R", 1): ["modern_sculpture", "books", "stack_vase", "books", "vases"],
}
for (u, b), rows in LAYOUT.items():
    xs = UNITS[u]
    for r, kind in enumerate(rows):
        fill_row(f"shelf_{u}{b}_r{r}", kind, xs[b], xs[b + 1], ROW_Z[r] + (0.0 if r == 0 else 0.03))
for k, (x, tz) in enumerate(((5.15, ROW_Z[1] + 0.2), (1.65, ROW_Z[2] + 0.2))):
    downlight(f"accent_pin_{k}", x, 6.25, H, "cx_accent", 45, 18, target=(x, 6.8, tz))

# ---------------------------------------------------------------- desk: marble waterfall + walnut pedestal, executive chair, two visitor chairs
X0, X1, Y0, Y1, DZ = DESK["x0"], DESK["x1"], DESK["y0"], DESK["y1"], DESK["z"]
boxb("rug_desk", 2.3, 5.9, 2.7, 6.25, 0.0, 0.012, MAT["rug"])
boxb("desk_top", X0, X1, Y0, Y1, DZ - 0.05, DZ, MAT["desk"], bevel=0.004)
boxb("desk_waterfall", X1 - 0.05, X1, Y0, Y1, 0.0, DZ - 0.05, MAT["desk"], bevel=0.003)
boxb("desk_front", X0 + 0.55, X1 - 0.05, Y0, Y0 + 0.04, 0.06, DZ - 0.05, MAT["desk"], bevel=0.003)
boxb("desk_pedestal", X0 + 0.05, X0 + 0.55, Y0 + 0.03, Y1 - 0.05, 0.0, DZ - 0.05, MAT["walnut"], bevel=0.004)
strip("desk_glow", X0 + 0.6, X1 - 0.1, Y0 + 0.05, Y0 + 0.07, 0.045, 0.055, "cx_plinth", 8)
rbox("desk_pad", 3.95, 4.82, DZ, 0.8, 0.42, 0.004, 0.0, MAT["leather_pad"], bevel=0.002)
rbox("laptop_base", 3.6, 4.78, DZ, 0.33, 0.23, 0.015, rad(4), MAT["metal"], bevel=0.003)
lid = boxb("laptop_lid", 3.435, 3.765, 4.66, 4.668, DZ + 0.015, DZ + 0.235, MAT["metal"], bevel=0.002)
lid.rotation_euler = (rad(12), 0, rad(4))
cyl("pen_cup", 0.035, 0.035, 0.1, (4.62, 4.5, DZ), MAT["leather"], seg=24)
for k in range(4):
    cyl(f"pen_{k}", 0.004, 0.004, 0.14, (4.61 + 0.01 * k, 4.5 + 0.006 * (k % 2), DZ + 0.04), MAT["brass" if k % 2 else "metal"], seg=8, rot=(rad(6 - 4 * k), 0, 0))
stack("desk_books", 3.1, DZ, 2)
if PLANTS:
    plant("plant_desk", 4.75, 4.95, 0.38, z=DZ)

if not asset_or("chair_exec", "chair_exec", 3.9, 5.65, 0.0, CHAIR_ROT_EXEC, height=1.22, pick=CHAIR_PICK_EXEC):
    rbox("chair_exec_seat", 3.9, 5.65, 0.42, 0.62, 0.6, 0.12, 0.0, MAT["leather"], bevel=0.04)
    rbox("chair_exec_back", 3.9, 5.95, 0.54, 0.6, 0.1, 0.68, 0.0, MAT["leather"], bevel=0.04)
for k, x in enumerate((3.35, 4.45)):
    if not asset_or(f"chair_visit_{k}", "chair_exec", x, 3.55, 0.0, CHAIR_ROT_VISIT + rad(8 - 16 * k), height=1.08, pick=CHAIR_PICK_VISIT):
        rbox(f"chair_visit_{k}_seat", x, 3.55, 0.42, 0.56, 0.56, 0.1, 0.0, MAT["leather"], bevel=0.04)
        rbox(f"chair_visit_{k}_back", x, 3.3, 0.52, 0.56, 0.1, 0.5, 0.0, MAT["leather"], bevel=0.04)

# ---------------------------------------------------------------- pendant (task), downlights (general), lounge
cyl("pendant_rod_a", 0.004, 0.004, HT - PZ - 0.04, (PX - 0.7, PY, PZ + 0.04), MAT["metal"], seg=8)
cyl("pendant_rod_b", 0.004, 0.004, HT - PZ - 0.04, (PX + 0.7, PY, PZ + 0.04), MAT["metal"], seg=8)
boxb("pendant_body", PX - 0.9, PX + 0.9, PY - 0.04, PY + 0.04, PZ, PZ + 0.05, MAT["metal"], bevel=0.004)
boxb("pendant_diffuser", PX - 0.88, PX + 0.88, PY - 0.03, PY + 0.03, PZ - 0.004, PZ, MAT["led"], group="cx_task")
light("pendant_down", "AREA", 170, (PX, PY, PZ - 0.01), "cx_task", size=(1.76, 0.06))
light("pendant_up", "AREA", 30, (PX, PY, PZ + 0.06), "cx_task", size=(1.7, 0.06), rot=(math.pi, 0, 0))

n = 0
for x in (2.0, 3.9, 5.8):
    for y in (1.9, 3.3, 5.55):
        if math.hypot(x - PX, y - PY) > 0.8:
            downlight(f"dl_general_{n}", x, y, HT, "cx_general", 60, 50); n += 1
for k, y in enumerate((1.9, 3.3)):
    downlight(f"dl_lounge_{k}", 0.72, y, H, "cx_lounge", 45, 45, target=(CT[0] - 0.4, y, 0))

boxb("rug_lounge", 0.85, 2.6, 1.3, 3.9, 0.0, 0.014, MAT["rug"])
if not asset_or("sofa", "sofa", SOFA[0], SOFA[1], 0.0, SOFA_ROT, length=2.6):
    rbox("sofa_seat", SOFA[0], SOFA[1], 0.0, 0.95, 2.6, 0.42, 0.0, MAT["cream"], bevel=0.05)
    rbox("sofa_back", SOFA[0] - 0.38, SOFA[1], 0.38, 0.22, 2.6, 0.45, 0.0, MAT["cream"], bevel=0.06)
cyl("coffee_top", 0.48, 0.48, 0.05, (CT[0], CT[1], 0.33), MAT["desk"], seg=64)
cyl("coffee_base", 0.3, 0.34, 0.33, (CT[0], CT[1], 0.0), MAT["marble_top"], seg=48)
stack("coffee_books", CT[0] - 0.12, 0.38, 3)
cyl("coffee_bowl", 0.06, 0.12, 0.07, (CT[0] + 0.18, CT[1] + 0.1, 0.38), MAT["ceramic_b"], seg=40)

cyl("side_table_top", 0.24, 0.24, 0.03, (LAMP[0], LAMP[1], 0.55), MAT["marble_top"], seg=40)
cyl("side_table_stem", 0.04, 0.04, 0.55, (LAMP[0], LAMP[1], 0), MAT["brass"], seg=16)
if not asset_or("table_lamp", "lamp_", LAMP[0], LAMP[1], 0.58, 0.0, height=0.62, pick=LAMP_PICK, shade_above=0.5):
    cyl("table_lamp_base", 0.09, 0.07, 0.32, (LAMP[0], LAMP[1], 0.58), MAT["ceramic_b"], seg=40)
    cyl("table_lamp_shade", 0.2, 0.2, 0.26, (LAMP[0], LAMP[1], 0.92), MAT["shade"], seg=48, caps=False)
light("table_lamp_light", "POINT", 30, (LAMP[0], LAMP[1], 1.05), "cx_deco", radius=0.06)
sphere("table_lamp_bulb", 0.025, (LAMP[0], LAMP[1], 1.05), MAT["filament"], seg=10, group="cx_deco")

plant("plant_window", 0.55, 5.55, 1.7)
plant("plant_right", 7.5, 5.0, 1.6)

# ---------------------------------------------------------------- automation hardware
boxb("keypad_plate", W - 0.012, W, 6.15, 6.27, 1.14, 1.26, MAT["metal"], bevel=0.003)
for k in range(4):
    z = 1.16 + k * 0.026
    boxb(f"keypad_btn_{k}", W - 0.014, W - 0.012, 6.19, 6.23, z, z + 0.012, MAT["keypad"], group="cx_deco")
for k, x in enumerate((2.2, 5.6)):
    cyl(f"speaker_{k}", 0.1, 0.1, 0.004, (x, 2.4, HT - 0.004), MAT["ceramic_w"], seg=40)

# ---------------------------------------------------------------- outside: night skyline HDRI (sky) + daylight card (day_sky)
world = bpy.data.worlds.new("skyline"); scene.world = world; world.use_nodes = True
N = world.node_tree.nodes; L = world.node_tree.links; bg = N["Background"]
hdri = sorted(glob.glob(os.path.join(ASSET_DIR, "sky", "*.exr")) + glob.glob(os.path.join(ASSET_DIR, "sky", "*.hdr")))
tc = N.new("ShaderNodeTexCoord"); sx = N.new("ShaderNodeSeparateXYZ"); L.new(tc.outputs["Generated"], sx.inputs[0])
if hdri:
    zs = N.new("ShaderNodeMath"); zs.operation = "ADD"; zs.inputs[1].default_value = SKY_SHIFT
    L.new(sx.outputs["Z"], zs.inputs[0])
    cb = N.new("ShaderNodeCombineXYZ"); L.new(sx.outputs["X"], cb.inputs["X"]); L.new(sx.outputs["Y"], cb.inputs["Y"]); L.new(zs.outputs[0], cb.inputs["Z"])
    mp = N.new("ShaderNodeMapping"); mp.inputs["Rotation"].default_value = (0, 0, SKY_ROT); L.new(cb.outputs[0], mp.inputs["Vector"])
    env = N.new("ShaderNodeTexEnvironment"); env.image = bpy.data.images.load(hdri[0]); L.new(mp.outputs[0], env.inputs["Vector"])
    below = N.new("ShaderNodeMath"); below.operation = "LESS_THAN"; below.inputs[1].default_value = 0.0
    L.new(zs.outputs[0], below.inputs[0])
    mix = N.new("ShaderNodeMixRGB"); mix.inputs["Color2"].default_value = (*lin("#070912"), 1)
    L.new(below.outputs[0], mix.inputs["Fac"]); L.new(env.outputs["Color"], mix.inputs["Color1"]); L.new(mix.outputs[0], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = SKY_STRENGTH
    print("[uniser] sky:", os.path.basename(hdri[0]))
else:
    mr = N.new("ShaderNodeMapRange"); mr.inputs["From Min"].default_value = -0.05; mr.inputs["From Max"].default_value = 0.7
    cr = N.new("ShaderNodeValToRGB"); els = cr.color_ramp.elements
    for i, (pos, hx) in enumerate(((0.0, "#a07a68"), (0.12, "#4c5a8c"), (0.4, "#1e2c62"), (1.0, "#0b1029"))):
        e = els[i] if i < 2 else els.new(pos); e.position = pos; e.color = (*lin(hx), 1)
    L.new(sx.outputs["Z"], mr.inputs["Value"]); L.new(mr.outputs["Result"], cr.inputs["Fac"]); L.new(cr.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 1.2
world.lightgroup = "sky"

bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=False, segments=48, radius1=420, radius2=420, depth=520, matrix=Matrix.Translation((0, 0, 230)))
sky_ob = finish("day_sky_card", bm, MAT["skycard"], loc=(W / 2, D / 2, 0)); sky_ob.lightgroup = "day_sky"

if DAYLIGHT:   # sun from beyond the window (-x)
    for name, elev, azi, strength in (("day_morning", 12, -30, 3.5), ("day_midday", 55, 0, 4.5), ("day_evening", 8, 35, 3.0)):
        ld = bpy.data.lights.new(name, "SUN"); ld.energy = strength; ld.angle = rad(1.5)
        ob = bpy.data.objects.new(name, ld); ROOT.objects.link(ob); ob.lightgroup = name
        e, a = rad(elev), rad(azi)
        d = Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), -math.sin(e)))
        ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

# ---------------------------------------------------------------- camera (CABIN_CAMERA): front-right corner, window left, desk centre, art right
cd = bpy.data.cameras.new("hero"); cd.sensor_fit = "VERTICAL"; cd.angle_y = rad(60.0); cd.clip_end = 5000
cam = bpy.data.objects.new("hero", cd); ROOT.objects.link(cam)
cam.location = (6.4, 0.25, 1.35)
aim(cam, (3.0, 7.0, 1.15)); scene.camera = cam

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
scene.render.resolution_x, scene.render.resolution_y = (1920, 1080) if FINAL else (960, 540)
scene.render.resolution_percentage = 100
scene.cycles.samples = 512 if FINAL else 128
scene.cycles.use_adaptive_sampling = True; scene.cycles.adaptive_threshold = 0.02 if FINAL else 0.05
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 8; scene.cycles.diffuse_bounces = 4; scene.cycles.glossy_bounces = 4
scene.cycles.transmission_bounces = 8; scene.cycles.transparent_max_bounces = 16
scene.cycles.caustics_reflective = False; scene.cycles.caustics_refractive = False
scene.cycles.sample_clamp_indirect = 10.0; scene.cycles.blur_glossy = 1.0
scene.render.use_persistent_data = True
try:
    scene.cycles.tile_size = 1024
except Exception:
    pass
scene.view_settings.view_transform = "AgX"  # preview PNG only; EXR passes stay scene-linear
try:
    scene.view_settings.look = "AgX - Medium High Contrast"
except Exception:
    pass
VL.cycles.denoising_store_passes = True

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
    if s is None:
        s = next((o for o in rl.outputs if o.name.endswith(g)), None)
    return s

TINT_2700K = (1.0, 0.47, 0.17, 1.0)  # linear rgb, what the app's cctToRgb(2700) works out to
acc = None
written = []
for g in GROUPS:
    s = group_socket(g)
    if s is None:
        print("missing light group pass:", g); continue
    dn = T.nodes.new("CompositorNodeDenoise"); dn.use_hdr = True
    T.links.new(s, dn.inputs["Image"])
    T.links.new(rl.outputs["Denoising Normal"], dn.inputs["Normal"])
    T.links.new(rl.outputs["Denoising Albedo"], dn.inputs["Albedo"])
    fo.layer_slots.new(g); T.links.new(dn.outputs[0], fo.inputs[g]); written.append(g)
    if g in DAY and g != "day_evening":
        continue  # preview shows the evening sun only
    src = dn.outputs[0]
    if g in CIRCUITS:
        mul = T.nodes.new("CompositorNodeMixRGB"); mul.blend_type = "MULTIPLY"; mul.inputs[0].default_value = 1
        T.links.new(src, mul.inputs[1]); mul.inputs[2].default_value = TINT_2700K; src = mul.outputs[0]
    if acc is None:
        acc = src
    else:
        add = T.nodes.new("CompositorNodeMixRGB"); add.blend_type = "ADD"; add.inputs[0].default_value = 1
        T.links.new(acc, add.inputs[1]); T.links.new(src, add.inputs[2]); acc = add.outputs[0]
fo.layer_slots.new("beauty"); T.links.new(rl.outputs["Image"], fo.inputs["beauty"])
comp = T.nodes.new("CompositorNodeComposite")
T.links.new(acc or rl.outputs["Image"], comp.inputs["Image"])

# ---------------------------------------------------------------- hotspots
HOT = {
    "cx-cove": (2.5, TRAY["y1"], H + 0.2), "cx-general": (2.0, 3.3, HT), "cx-task": (PX, PY, PZ),
    "cx-accent": (ART[0], 6.9, ART[1]), "cx-feature": (3.4, 6.92, 2.1), "cx-shelf": (5.6, 6.8, 1.75),
    "cx-plinth": (3.4, 6.45, 0.06), "cx-deco": (LAMP[0], LAMP[1], 0.95), "cx-lounge": (CT[0], CT[1], 0.4),
    "blinds": (0.08, 4.0, 1.8), "hvac": (0.57, 2.8, H), "fan": (0.57, 4.6, H), "music": (2.2, 2.4, HT),
    "keypad": (W, 6.21, 1.2),
}
bpy.context.view_layer.update()
spots = {}
for k, co in HOT.items():
    v = world_to_camera_view(scene, cam, Vector(co))
    spots[k] = {"u": round(v.x, 4), "v": round(1 - v.y, 4), "visible": bool(0 <= v.x <= 1 and 0 <= v.y <= 1 and v.z > 0)}
with open(os.path.join(OUT, "hotspots.json"), "w") as f:
    json.dump({"camera": "hero", "points": spots}, f, indent=2)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "cabin.blend"))
print(f"[uniser] built cabin, mode={MODE}, closed={CLOSED}, passes={written}")
print("[uniser] hotspots not in view:", [k for k, s in spots.items() if not s["visible"]])

if MODE != "build":
    scene.render.filepath = os.path.join(OUT, f"preview_{TAG}.png")
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    print("[uniser] done:", OUT)
