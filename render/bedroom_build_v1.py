"""
Uniser SmartSpaces - Residential Bedroom
Builds the master bedroom and renders one linear EXR pass per lighting circuit.

  Blender -b -P bedroom_build_v1.py -- --build             # build + save .blend only (check layout)
  Blender -b -P bedroom_build_v1.py -- --skytest           # 4 quick renders of the city view at 0/90/180/270
  Blender -b -P bedroom_build_v1.py -- --preview           # 960x540, curtains open
  Blender -b -P bedroom_build_v1.py -- --final             # 1920x1080, curtains open
  Blender -b -P bedroom_build_v1.py -- --final --closed    # curtains closed
  Blender -b -P bedroom_build_v1.py -- --final --fanblur   # fan region only, motion-blurred blades (cheap)
  add --skyrot=<deg> to turn the city view, --cpu if the Mac GPU crashes

Models reused (falls back to geometry if missing):
  models/room/   bed*, nightstand*, wall_lamp*, armchair*
  models/cabin/  lamp_* (bedside table lamps, pair split), art/*.jpg, sky/*.exr (night city)
  models/office/ fan_ceiling      models/lobby/ plant_*
  models/bedroom/clothes*         optional hanging-clothes model for the wardrobe
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
OUT = os.path.join(BASE, "out_bedroom")
MODELS = os.path.join(BASE, "models")
os.makedirs(OUT, exist_ok=True)
random.seed(21)
rad = math.radians

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
VL = scene.view_layers[0]
ROOT = bpy.data.collections.new("Bedroom")
scene.collection.children.link(ROOT)

# ---------------------------------------------------------------- plan
# x across (0 = headboard wall, left), y into the room (D = wardrobe + balcony wall), z up
W, D = 6.0, 6.6
H, HT = 2.8, 3.05                       # perimeter ceiling, tray
TRAY = dict(x0=0.9, x1=5.3, y0=0.9, y1=5.8)
BED = (1.25, 3.4)                       # bed centre; headboard against x = 0, foot toward +x
NS = (2.0, 4.8)                         # nightstand y positions (x = 0.3)
WARD = (1.5, 3.6)                       # wardrobe x span on the back wall
DOOR = (3.9, 5.5)                       # balcony door x span
FAN = (3.1, 3.3)
BED_ROT = rad(90)                       # room models face -y at 0; +90 puts the headboard on the left wall
NS_ROT, LAMP_ROT, CHAIR_ROT = rad(90), rad(90), rad(-25)   # chair faces the camera, turned slightly toward the bed
LAMP_PICK = 1                           # which lamp of the cabin pair (0/1)
SKY_ROT = rad(float(next((a.split("=")[1] for a in ARGS if a.startswith("--skyrot=")), "90")))
SKY_SHIFT = 0.06

CIRCUITS = ["br_general", "br_cove", "br_bedside_l", "br_bedside_r", "br_reading", "br_wardrobe", "br_path"]
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
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    setin(b, "Base Color", (*lin(hexc), 1)); setin(b, "Roughness", rough); setin(b, "Metallic", metal)
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
    t = N.new("ShaderNodeTexWave") if kind == "wave" else N.new("ShaderNodeTexNoise")
    if kind == "wave":
        t.wave_type = "BANDS"
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
        setin(br, "Scale", 1.0); setin(br, "Mortar Size", 0.002); setin(br, "Mortar Smooth", 0.3)
        setin(br, "Brick Width", tiles[0]); setin(br, "Row Height", tiles[1])
        L.new(tc.outputs["Object"], br.inputs["Vector"])
        mix = N.new("ShaderNodeMixRGB"); mix.inputs["Color2"].default_value = (*lin(tiles[2]), 1)
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

def glass(name, tint="#000000", spec=0.18, tint_amt=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    N = m.node_tree.nodes; L = m.node_tree.links; N.clear()
    tr = N.new("ShaderNodeBsdfTransparent"); tr.inputs["Color"].default_value = (*[1 - tint_amt * (1 - c) for c in lin(tint)], 1) if tint_amt else (1, 1, 1, 1)
    sp = N.new("ShaderNodeBsdfPrincipled"); setin(sp, "Base Color", (0, 0, 0, 1)); setin(sp, "Roughness", 0.03); setin(sp, "Specular IOR Level", spec)
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
    d = os.path.join(MODELS, "cabin", "art")
    imgs = sorted(glob.glob(os.path.join(d, "*.jp*g")) + glob.glob(os.path.join(d, "*.png")))
    if not imgs:
        return procedural("art_canvas", [(0.0, "#141312"), (0.5, "#6a655d"), (1.0, "#d9d3c8")], 0.8, scale=1.6, distortion=8.0, detail=12)
    m = principled("art_print", "#ffffff", 0.75)
    N = m.node_tree.nodes; L = m.node_tree.links; b = N["Principled BSDF"]
    tc = N.new("ShaderNodeTexCoord"); sx = N.new("ShaderNodeSeparateXYZ"); cb = N.new("ShaderNodeCombineXYZ")
    L.new(tc.outputs["Generated"], sx.inputs[0]); L.new(sx.outputs["Y"], cb.inputs["X"]); L.new(sx.outputs["Z"], cb.inputs["Y"])
    tx = N.new("ShaderNodeTexImage"); tx.image = bpy.data.images.load(imgs[-1]); tx.extension = "EXTEND"
    L.new(cb.outputs[0], tx.inputs["Vector"]); L.new(tx.outputs["Color"], b.inputs["Base Color"])
    return m

MAT = dict(
    floor=procedural("floor_tile", [(0.0, "#8e877d"), (0.5, "#9b948a"), (1.0, "#948d83")], 0.22,
                     scale=0.5, distortion=2.0, detail=6, coat=0.2, tiles=(1.2, 0.6, "#6f6961")),
    wall=procedural("plaster_warm", [(0.0, "#8a7f72"), (1.0, "#968b7e")], 0.85, scale=3.0, bump=0.04),
    feature=procedural("feature_stone", [(0.0, "#6d665e"), (0.5, "#7d766d"), (1.0, "#736c63")], 0.7,
                       scale=1.2, mscale=(1, 1, 6), distortion=3.0, bump=0.12),
    ceiling=procedural("ceiling_plaster", [(0.0, "#a39a8f"), (1.0, "#ada499")], 0.9, scale=2.0, bump=0.02),
    walnut=procedural("walnut", [(0.0, "#1e140c"), (0.6, "#302114"), (1.0, "#3c2a19")], 0.45,
                      kind="wave", scale=4.0, distortion=7.0, detail=4, coat=0.2),
    rug=procedural("rug", [(0.0, "#3f3b37"), (0.45, "#55504a"), (0.55, "#6a645d"), (1.0, "#46423d")], 0.95,
                   scale=45.0, distortion=1.0, detail=8, bump=0.25),
    taupe=procedural("headboard_fabric", [(0.0, "#5c544c"), (1.0, "#665e55")], 0.9, scale=60.0, detail=6, bump=0.15),
    linen=principled("linen_white", "#ddd7cd", 0.85, Sheen_Weight=0.4),
    duvet=principled("duvet_greige", "#a59c90", 0.9, Sheen_Weight=0.5),
    throw=procedural("throw_knit", [(0.0, "#2c2a28"), (1.0, "#46423e")], 0.95, scale=80.0, detail=4, bump=0.3),
    pillow_a=principled("pillow_grey", "#8b847b", 0.9, Sheen_Weight=0.5),
    pillow_b=principled("pillow_charcoal", "#4a4540", 0.9, Sheen_Weight=0.5),
    cream=principled("fabric_cream", "#b8ab98", 0.9, Sheen_Weight=0.5),
    brass=principled("brass", "#b08d4f", 0.28, 1.0),
    metal=principled("black_metal", "#141312", 0.4, 0.8),
    grille=principled("grille", "#e4e0da", 0.5),
    grille_slot=principled("grille_slot", "#0b0b0b", 0.8),
    ceramic_w=principled("ceramic_white", "#e8e3da", 0.35),
    ceramic_b=principled("ceramic_black", "#141312", 0.25),
    screen=principled("tv_off", "#050608", 0.1, Coat_Weight=1.0),
    window=glass("door_glass"),
    ward_glass=glass("wardrobe_glass", "#3a2c20", 0.25, 0.35),
    drape=principled("drape_taupe", "#5e5246", 0.9, Sheen_Weight=0.5),
    sheer=principled("sheer", "#e8e2d8", 0.9, Transmission_Weight=0.7, Alpha=0.55),
    shade=lamp_shade(),
    skycard=day_sky_card(),
    art=art_material(),
    led=emission("led_strip", 30.0),
    lens=emission("downlight_lens", 25.0),
    filament=emission("filament", 220.0),
    keypad=emission("keypad_glow", 4.0),
)
SHIRTS = [principled(f"shirt_{i}", h, 0.9, Sheen_Weight=0.4) for i, h in enumerate(
    ("#e9e5de", "#c9c2b6", "#8a8479", "#3c3a37", "#b9a68c", "#dcd5ca", "#5b6270"))]
try:
    MAT["sheer"].blend_method = "BLEND"
except Exception:
    pass


# ---------------------------------------------------------------- mesh helpers
def finish(name, bm, mat, loc=(0, 0, 0), rot=(0, 0, 0), smooth=None):
    bm.normal_update()
    if smooth:
        for f in bm.faces:
            f.smooth = smooth(f)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    if mat:
        me.materials.append(mat)
    ob = bpy.data.objects.new(name, me); ob.location = loc; ob.rotation_euler = rot
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

def rbox(name, cx, cy, z0, w, d, h, ang, mat, bev=0.0, group=None, tilt=(0, 0)):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((w, d, h)), verts=bm.verts)
    ob = bevel(finish(name, bm, mat, (cx, cy, z0 + h / 2), (tilt[0], tilt[1], ang)), bev)
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

def sphere(name, r, loc, mat, seg=32, group=None):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=r)
    ob = finish(name, bm, mat, loc, smooth=lambda f: True)
    if group:
        ob.lightgroup = group
    return ob

def aim(ob, target):
    ob.rotation_euler = (Vector(target) - ob.location).to_track_quat("-Z", "Y").to_euler()

def light(name, kind, watts, loc, group, target=None, radius=0.03, spot=60, blend=0.5, size=(1, 1), rot=None):
    ld = bpy.data.lights.new(name, kind); ld.energy = watts; ld.color = (1, 1, 1)
    if kind in ("POINT", "SPOT"):
        ld.shadow_soft_size = radius
    if kind == "SPOT":
        ld.spot_size = rad(spot); ld.spot_blend = blend
    if kind == "AREA":
        ld.shape = "RECTANGLE"; ld.size = size[0]; ld.size_y = size[1]
    ob = bpy.data.objects.new(name, ld); ob.location = loc; ROOT.objects.link(ob)
    ob.lightgroup = group
    if kind == "AREA":
        ob.visible_camera = False
    if target is not None:
        aim(ob, target)
    if rot is not None:
        ob.rotation_euler = rot
    return ob

def strip(name, x0, x1, y0, y1, z0, z1, group, watts_per_m, down=True, rot=None):
    boxb(name, x0, x1, y0, y1, z0, z1, MAT["led"], group=group)
    L = max(x1 - x0, y1 - y0, z1 - z0)
    light(f"{name}_light", "AREA", watts_per_m * L, ((x0 + x1) / 2, (y0 + y1) / 2, z0 - 0.01 if down else z1 + 0.01), group,
          size=(max(x1 - x0, 0.04), max(y1 - y0, 0.04)), rot=rot if rot else (None if down else (math.pi, 0, 0)))

def downlight(name, x, y, z, group, watts=55, spot=55, target=None):
    cyl(f"{name}_lens", 0.045, 0.045, 0.01, (x, y, z - 0.01), MAT["lens"], seg=24, group=group)
    light(name, "SPOT", watts, (x, y, z - 0.03), group, target=target, spot=spot, blend=0.6)

def curtain_x(name, x0, x1, y, z0, z1, mat, folds_per_m=6.0, amp=0.05):
    bm = bmesh.new(); n = max(12, int((x1 - x0) * folds_per_m * 6)); rows = []
    for i in range(n + 1):
        t = i / n; x = x0 + (x1 - x0) * t
        yy = y + amp * math.sin(t * (x1 - x0) * folds_per_m * 2 * math.pi)
        rows.append((bm.verts.new((x, yy, z0)), bm.verts.new((x, yy, z1))))
    for i in range(n):
        bm.faces.new((rows[i][0], rows[i + 1][0], rows[i + 1][1], rows[i][1]))
    return finish(name, bm, mat, smooth=lambda f: True)


# ---------------------------------------------------------------- reused models
_ASSETS = {}

def find_assets(prefix, sub):
    folder = os.path.join(MODELS, sub); out = []
    for p in (f"{prefix}*.glb", f"{prefix}*.gltf", f"{prefix}*/*.glb", f"{prefix}*/*.gltf", f"{prefix}*/**/*.gltf"):
        out += glob.glob(os.path.join(folder, p), recursive=True)
    return sorted(set(out))

def _split_pick(new, pick, before):
    meshes = [o for o in new if o.type == "MESH"]; others = [o for o in new if o.type != "MESH"]
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
    _, i = max((vals[k + 1] - vals[k], k) for k in range(len(vals) - 1))
    cut = (vals[i] + vals[i + 1]) / 2; keep = []
    for o, c in parts:
        if (c[ax] < cut) == (pick == 0):
            keep.append(o)
        else:
            bpy.data.objects.remove(o, do_unlink=True)
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
    print("[uniser] asset", os.path.relpath(path, BASE), pick, tuple(round(v, 2) for v in (mx - mn)))
    return _ASSETS[key]

def place_asset(name, path, x, y, z=0.0, rotz=0.0, height=None, length=None, pick=None, shade_above=None, top=False):
    coll, size = load_asset(path, pick, shade_above)
    sc = height / max(size.z, 1e-4) if height else length / max(size.x, size.y, 1e-4)
    e = bpy.data.objects.new(name, None); e.instance_type = "COLLECTION"; e.instance_collection = coll
    e.location = (x, y, z - (size.z * sc if top else 0)); e.rotation_euler = (0, 0, rotz); e.scale = (sc, sc, sc)
    ROOT.objects.link(e)
    return e

USED = {}
def asset_or(name, prefix, sub, *a, **k):
    found = find_assets(prefix, sub)
    USED[prefix] = "model" if found else "fallback"
    return place_asset(name, found[0], *a, **k) if found else None

PLANTS = find_assets("plant_", "lobby")
def plant(name, x, y, h=1.4, z=0.0):
    if PLANTS:
        s = sum(map(ord, name))
        return place_asset(name, PLANTS[s % len(PLANTS)], x, y, z, rad(s * 37 % 360), height=h)
    cyl(f"{name}_pot", 0.16, 0.2, 0.4 * h / 1.4, (x, y, z), MAT["ceramic_b"], seg=40)


# ---------------------------------------------------------------- shell + tray ceiling with cove
boxb("floor", 0, W, 0, D, -0.1, 0, MAT["floor"])
boxb("wall_front", 0, W, -0.2, 0, 0, HT, MAT["wall"])
boxb("wall_left", -0.2, 0, 0, D, 0, HT, MAT["wall"])
boxb("wall_right", W, W + 0.2, 0, D, 0, HT, MAT["wall"])
for k, (x0, x1) in enumerate(((0, WARD[0]), (WARD[1], DOOR[0]), (DOOR[1], W))):
    boxb(f"wall_back_{k}", x0, x1, D, D + 0.2, 0, HT, MAT["wall"])
boxb("wall_back_ward_head", WARD[0], WARD[1], D, D + 0.2, 2.6, HT, MAT["wall"])
boxb("wall_back_door_head", DOOR[0], DOOR[1], D, D + 0.2, 2.6, HT, MAT["wall"])
for nm, x0, x1, y0, y1 in (("l", 0, TRAY["x0"], 0, D), ("r", TRAY["x1"], W, 0, D),
                           ("f", TRAY["x0"], TRAY["x1"], 0, TRAY["y0"]), ("b", TRAY["x0"], TRAY["x1"], TRAY["y1"], D)):
    boxb(f"ceiling_{nm}", x0, x1, y0, y1, H, H + 0.2, MAT["ceiling"])
boxb("ceiling_tray", TRAY["x0"], TRAY["x1"], TRAY["y0"], TRAY["y1"], HT, HT + 0.1, MAT["ceiling"])
for nm, x0, x1, y0, y1 in (("l", TRAY["x0"] - 0.02, TRAY["x0"], TRAY["y0"], TRAY["y1"]), ("r", TRAY["x1"], TRAY["x1"] + 0.02, TRAY["y0"], TRAY["y1"]),
                           ("f", TRAY["x0"], TRAY["x1"], TRAY["y0"] - 0.02, TRAY["y0"]), ("b", TRAY["x0"], TRAY["x1"], TRAY["y1"], TRAY["y1"] + 0.02)):
    boxb(f"tray_side_{nm}", x0, x1, y0, y1, H + 0.2, HT, MAT["ceiling"])
for nm, x0, x1, y0, y1 in (("l", TRAY["x0"] + 0.04, TRAY["x0"] + 0.08, TRAY["y0"], TRAY["y1"]), ("r", TRAY["x1"] - 0.08, TRAY["x1"] - 0.04, TRAY["y0"], TRAY["y1"]),
                           ("f", TRAY["x0"], TRAY["x1"], TRAY["y0"] + 0.04, TRAY["y0"] + 0.08), ("b", TRAY["x0"], TRAY["x1"], TRAY["y1"] - 0.08, TRAY["y1"] - 0.04)):
    strip(f"cove_{nm}", x0, x1, y0, y1, H + 0.2, H + 0.22, "br_cove", 22, down=False)
for k, (x, y) in enumerate(((0.45, 1.0), (0.45, 5.9), (2.6, 0.45), (4.6, 0.45), (5.65, 1.6), (5.65, 3.6), (2.6, 6.2), (5.65, 5.4))):
    downlight(f"dl_general_{k}", x, y, H, "br_general", 55, 55)
for k, x in enumerate((1.8, 2.6, 3.4)):     # wardrobe wash downlights
    downlight(f"dl_ward_{k}", x, D - 0.75, H, "br_general", 40, 40, target=(x, D - 0.3, 1.2))

# ---------------------------------------------------------------- headboard wall (x = 0): slats | stone feature | slats, upholstered headboard, art
for (y0, y1), tag in (((0.0, 1.55), "a"), ((5.25, D), "b")):
    boxb(f"slat_back_{tag}", 0, 0.02, y0, y1, 0, H, MAT["walnut"])
    n = int((y1 - y0) / 0.09)
    for k in range(n):
        y = y0 + 0.045 + k * 0.09
        boxb(f"slat_{tag}_{k}", 0.02, 0.06, y - 0.02, y + 0.02, 0, H, MAT["walnut"])
boxb("feature_panel", 0, 0.04, 1.55, 5.25, 0, H, MAT["feature"])
HB = (2.25, 4.55)
boxb("headboard_back", 0.04, 0.1, HB[0], HB[1], 0.3, 1.5, MAT["taupe"], 0.01)
nch = 14
for k in range(nch):
    y = HB[0] + (k + 0.5) * (HB[1] - HB[0]) / nch
    boxb(f"headboard_channel_{k}", 0.1, 0.17, y - (HB[1] - HB[0]) / nch / 2 + 0.004, y + (HB[1] - HB[0]) / nch / 2 - 0.004, 0.32, 1.48, MAT["taupe"], 0.025)
boxb("art_frame", 0.04, 0.08, 2.55, 4.25, 1.78, 2.52, MAT["metal"], 0.003)
boxb("art_canvas", 0.08, 0.085, 2.58, 4.22, 1.81, 2.49, MAT["art"])
light("art_wash", "AREA", 40, (0.7, 3.4, H - 0.02), "br_cove", target=(0.04, 3.4, 2.1), size=(0.06, 1.8))

# ---------------------------------------------------------------- bed + under-bed path glow
BX, BY = BED
if not asset_or("bed", "bed", "room", BX, BY, 0.0, BED_ROT, length=2.25):
    boxb("bed_base", 0.17, 2.35, BY - 0.98, BY + 0.98, 0.12, 0.36, MAT["taupe"], 0.03)
    boxb("mattress", 0.2, 2.32, BY - 0.95, BY + 0.95, 0.36, 0.6, MAT["linen"], 0.06)
    boxb("duvet", 0.75, 2.38, BY - 1.0, BY + 1.0, 0.5, 0.66, MAT["duvet"], 0.07)
    boxb("throw", 1.7, 2.4, BY - 1.02, BY + 1.02, 0.56, 0.68, MAT["throw"], 0.05)
    for k, (y, m, t) in enumerate(((BY - 0.5, "linen", 0.0), (BY + 0.5, "linen", 0.0), (BY - 0.45, "pillow_a", 0.25), (BY + 0.45, "pillow_a", 0.25), (BY, "pillow_b", 0.42))):
        rbox(f"pillow_{k}", 0.4 + t, y, 0.6, 0.18, 0.72 if t < 0.4 else 0.5, 0.42 - t * 0.3, 0.0, MAT[m], 0.08, tilt=(0, rad(-14), 0))
boxb("bed_plinth", 0.3, 2.2, BY - 0.85, BY + 0.85, 0, 0.12, MAT["metal"])
for nm, x0, x1, y0, y1 in (("foot", 2.15, 2.18, BY - 0.8, BY + 0.8), ("l", 0.35, 2.15, BY + 0.8, BY + 0.83), ("r", 0.35, 2.15, BY - 0.83, BY - 0.8)):
    strip(f"underbed_{nm}", x0, x1, y0, y1, 0.1, 0.11, "br_path", 8)
boxb("rug", 0.55, 4.1, 1.35, 5.45, 0, 0.012, MAT["rug"])
boxb("bench_top", 2.6, 3.05, BY - 0.8, BY + 0.8, 0.38, 0.47, MAT["cream"], 0.03)
for k, (x, y) in enumerate(((2.65, BY - 0.75), (3.0, BY - 0.75), (2.65, BY + 0.75), (3.0, BY + 0.75))):
    boxb(f"bench_leg_{k}", x - 0.012, x + 0.012, y - 0.012, y + 0.012, 0, 0.38, MAT["metal"])

# ---------------------------------------------------------------- nightstands, table lamps (bedside), wall reading lights, path lights
LAMPS = find_assets("lamp_", "cabin")
for k, y in enumerate(NS):
    side = "r" if y < BY else "l"          # lying in bed facing +x, +y is the left hand
    if not asset_or(f"nightstand_{k}", "nightstand", "room", 0.3, y, 0.0, NS_ROT, height=0.55):
        boxb(f"nightstand_{k}", 0.06, 0.56, y - 0.26, y + 0.26, 0.12, 0.56, MAT["walnut"], 0.006)
        boxb(f"nightstand_{k}_gap", 0.557, 0.561, y - 0.24, y + 0.24, 0.33, 0.335, MAT["metal"])
        boxb(f"nightstand_{k}_plinth", 0.1, 0.5, y - 0.22, y + 0.22, 0, 0.12, MAT["metal"])
    if LAMPS:
        place_asset(f"table_lamp_{k}", LAMPS[0], 0.3, y + (0.08 if side == "r" else -0.08), 0.56, LAMP_ROT, height=0.55, pick=LAMP_PICK, shade_above=0.5)
    else:
        cyl(f"table_lamp_{k}_base", 0.07, 0.05, 0.28, (0.3, y, 0.56), MAT["ceramic_b"], seg=40)
        cyl(f"table_lamp_{k}_shade", 0.17, 0.17, 0.24, (0.3, y, 0.86), MAT["shade"], seg=48, caps=False)
    light(f"bedside_{side}", "POINT", 28, (0.3, y + (0.08 if side == "r" else -0.08), 0.97), f"br_bedside_{side}", radius=0.06)
    sphere(f"bedside_{side}_bulb", 0.022, (0.3, y + (0.08 if side == "r" else -0.08), 0.97), MAT["filament"], seg=10, group=f"br_bedside_{side}")
    plant(f"ns_plant_{k}", 0.3, y - (0.14 if side == "r" else -0.14), 0.25, z=0.56) if PLANTS and side == "r" else None
    ry = y + (0.32 if side == "r" else -0.32)
    if not asset_or(f"reading_{k}", "wall_lamp", "room", 0.08, ry, 1.25, LAMP_ROT, height=0.35):
        boxb(f"reading_{k}_plate", 0.06, 0.08, ry - 0.04, ry + 0.04, 1.2, 1.34, MAT["metal"], 0.004)
        cyl(f"reading_{k}_arm", 0.008, 0.008, 0.3, (0.08, ry, 1.3), MAT["metal"], seg=10, rot=(0, rad(90), 0))
        cyl(f"reading_{k}_head", 0.035, 0.03, 0.14, (0.4, ry, 1.3), MAT["metal"], seg=24, rot=(0, rad(150), 0))
    light(f"reading_{side}", "SPOT", 22, (0.4, ry, 1.26), "br_reading", target=(0.75, ry + (0.25 if side == "r" else -0.25), 0.6), spot=38, radius=0.02)
    pz = 0.22                                   # low path light in the wall beside each nightstand
    py = y - (0.4 if side == "r" else -0.4)
    boxb(f"path_{side}_plate", 0.04, 0.065, py - 0.06, py + 0.06, pz - 0.03, pz + 0.03, MAT["metal"])
    boxb(f"path_{side}_lens", 0.065, 0.067, py - 0.045, py + 0.045, pz - 0.012, pz - 0.004, MAT["led"], group="br_path")
    light(f"path_{side}", "SPOT", 4, (0.08, py, pz - 0.01), "br_path", target=(0.9, py, 0), spot=110, radius=0.02)

# ---------------------------------------------------------------- wardrobe (back wall): walnut carcass, tinted glass doors, lit shelves + hanging
WY0 = D - 0.6
X0, X1 = WARD
boxb("ward_back", X0, X1, D - 0.02, D, 0, 2.6, MAT["walnut"])
boxb("ward_top", X0, X1, WY0, D, 2.55, 2.6, MAT["walnut"])
boxb("ward_plinth", X0 + 0.02, X1 - 0.02, WY0 + 0.05, D, 0, 0.08, MAT["metal"])
bays = 3; bw = (X1 - X0) / bays
for k in range(bays + 1):
    x = X0 + k * bw
    boxb(f"ward_side_{k}", x - 0.015, x + 0.015, WY0, D, 0, 2.6, MAT["walnut"])
CLOTHES = find_assets("clothes", "bedroom")
for b in range(bays):
    xa, xb = X0 + b * bw + 0.015, X0 + (b + 1) * bw - 0.015; xm = (xa + xb) / 2
    boxb(f"ward_drawers_{b}", xa, xb, WY0 + 0.02, D - 0.02, 0.08, 0.5, MAT["walnut"], 0.003)
    boxb(f"ward_drawer_gap_{b}", xa + 0.01, xb - 0.01, WY0 + 0.018, WY0 + 0.022, 0.285, 0.29, MAT["metal"])
    for z in (0.5, 2.15):
        boxb(f"ward_shelf_{b}_{z}", xa, xb, WY0 + 0.03, D - 0.02, z, z + 0.025, MAT["walnut"])
        strip(f"ward_shelf_led_{b}_{z}", xa + 0.03, xb - 0.03, WY0 + 0.06, WY0 + 0.08, z - 0.012, z - 0.002, "br_wardrobe", 12)
    for side, x in (("l", xa + 0.01), ("r", xb - 0.01)):
        strip(f"ward_v_{b}{side}", x - 0.006, x + 0.006, WY0 + 0.05, WY0 + 0.065, 0.55, 2.12, "br_wardrobe", 6, rot=(rad(90), 0, 0))
    if b == 1:                                   # centre bay: shelves of folded stacks
        for j, z in enumerate((0.95, 1.4, 1.8)):
            boxb(f"ward_shelf_mid_{j}", xa, xb, WY0 + 0.03, D - 0.02, z, z + 0.02, MAT["walnut"])
            strip(f"ward_shelf_mid_led_{j}", xa + 0.03, xb - 0.03, WY0 + 0.06, WY0 + 0.08, z - 0.012, z - 0.002, "br_wardrobe", 12)
            zz = z + 0.02 if j else 0.525
            for s, xx in enumerate((xm - 0.17, xm + 0.15)):
                for q in range(random.randint(3, 5)):
                    boxb(f"fold_{j}_{s}_{q}", xx - 0.13, xx + 0.13, WY0 + 0.12, D - 0.12, zz + q * 0.05, zz + q * 0.05 + 0.045, random.choice(SHIRTS), 0.01)
    else:                                        # hanging bays
        cyl(f"ward_rod_{b}", 0.012, 0.012, xb - xa - 0.04, (xa + 0.02, D - 0.3, 2.02), MAT["brass"], seg=12, rot=(0, rad(90), 0))
        if CLOTHES:
            place_asset(f"clothes_{b}", CLOTHES[0], xm, D - 0.3, 0.75, 0.0, length=xb - xa - 0.1)
        else:
            n = 7; x = xa + 0.07
            for q in range(n):
                hgt = random.uniform(0.85, 1.15)
                rbox(f"shirt_{b}_{q}", x, D - 0.3, 2.0 - hgt, 0.035, 0.46, hgt, rad(random.uniform(-6, 6)), random.choice(SHIRTS), 0.012)
                rbox(f"hanger_{b}_{q}", x, D - 0.3, 1.98, 0.01, 0.4, 0.02, 0.0, MAT["walnut"])
                x += (xb - xa - 0.14) / (n - 1)
        boxb(f"ward_shoes_{b}", xa + 0.05, xb - 0.05, WY0 + 0.15, D - 0.15, 0.525, 0.6, MAT["pillow_b"], 0.02)
    for d_, (x0, x1) in enumerate(((xa + 0.005, xm - 0.003), (xm + 0.003, xb - 0.005))):
        boxb(f"ward_door_{b}_{d_}", x0, x1, WY0 - 0.025, WY0 - 0.015, 0.52, 2.55, MAT["ward_glass"])
        boxb(f"ward_door_{b}_{d_}_frame", x0, x1, WY0 - 0.03, WY0 - 0.012, 0.52, 0.54, MAT["metal"])
        boxb(f"ward_door_{b}_{d_}_frame_t", x0, x1, WY0 - 0.03, WY0 - 0.012, 2.53, 2.55, MAT["metal"])
    boxb(f"ward_pull_{b}", xm - 0.01, xm + 0.01, WY0 - 0.06, WY0 - 0.03, 1.05, 1.6, MAT["brass"])
boxb("keypad_plate", X0 - 0.26, X0 - 0.14, D - 0.012, D, 1.14, 1.26, MAT["metal"], 0.003)
for k in range(4):
    z = 1.16 + k * 0.026
    boxb(f"keypad_btn_{k}", X0 - 0.22, X0 - 0.18, D - 0.014, D - 0.012, z, z + 0.012, MAT["keypad"], group="br_path")

# ---------------------------------------------------------------- balcony door, balcony, curtains + sheers
boxb("door_glass", DOOR[0], DOOR[1], D + 0.06, D + 0.08, 0, 2.6, MAT["window"])
for k, x in enumerate((DOOR[0], (DOOR[0] + DOOR[1]) / 2, DOOR[1])):
    boxb(f"door_mullion_{k}", x - 0.03, x + 0.03, D + 0.04, D + 0.1, 0, 2.6, MAT["metal"])
boxb("door_head", DOOR[0], DOOR[1], D + 0.04, D + 0.1, 2.56, 2.6, MAT["metal"])
boxb("door_sill", DOOR[0], DOOR[1], D + 0.04, D + 0.1, 0, 0.04, MAT["metal"])
boxb("balcony_floor", DOOR[0] - 1.5, DOOR[1] + 1.5, D + 0.1, D + 1.6, -0.04, -0.02, MAT["floor"])
boxb("balcony_rail", DOOR[0] - 1.5, DOOR[1] + 1.5, D + 1.5, D + 1.53, 1.0, 1.04, MAT["metal"])
for k in range(int((DOOR[1] - DOOR[0] + 3.0) / 0.12)):
    x = DOOR[0] - 1.5 + k * 0.12
    boxb(f"balcony_baluster_{k}", x - 0.008, x + 0.008, D + 1.505, D + 1.525, 0, 1.0, MAT["metal"])
for k, x in enumerate((DOOR[0] + 0.2, DOOR[1] - 0.1)):
    plant(f"balcony_plant_{k}", x, D + 1.1, 1.2 + 0.3 * k)
CT = (DOOR[0] - 0.3, W - 0.05)               # curtain track
boxb("curtain_pocket", CT[0] - 0.05, CT[1], D - 0.3, D, H - 0.06, H, MAT["ceiling"])
if CLOSED:
    curtain_x("drape_closed", CT[0], CT[1], D - 0.18, 0.02, H - 0.06, MAT["drape"], 7.0, 0.05)
    curtain_x("sheer_closed", CT[0], CT[1], D - 0.08, 0.02, H - 0.06, MAT["sheer"], 9.0, 0.03)
else:
    curtain_x("drape_left", CT[0], CT[0] + 0.32, D - 0.18, 0.02, H - 0.06, MAT["drape"], 14.0, 0.07)
    curtain_x("drape_right", CT[1] - 0.45, CT[1], D - 0.18, 0.02, H - 0.06, MAT["drape"], 14.0, 0.07)
    curtain_x("sheer_left", CT[0] + 0.3, CT[0] + 0.95, D - 0.08, 0.02, H - 0.06, MAT["sheer"], 12.0, 0.04)
strip("curtain_head_led", CT[0], CT[1], D - 0.29, D - 0.27, H - 0.065, H - 0.06, "br_cove", 14)

# ---------------------------------------------------------------- reading corner: armchair + side table, dresser + TV (right wall)
if not asset_or("armchair", "armchair", "room", 4.75, 5.0, 0.0, CHAIR_ROT, height=0.85):
    rbox("armchair_seat", 4.75, 5.0, 0.0, 0.8, 0.8, 0.45, CHAIR_ROT, MAT["cream"], 0.08)
    rbox("armchair_back", 4.95, 5.35, 0.4, 0.8, 0.22, 0.45, CHAIR_ROT, MAT["cream"], 0.08)
cyl("side_table_top", 0.24, 0.24, 0.03, (5.45, 5.55, 0.55), MAT["metal"], seg=40)
cyl("side_table_stem", 0.03, 0.03, 0.55, (5.45, 5.55, 0), MAT["metal"], seg=16)
cyl("side_table_foot", 0.18, 0.18, 0.02, (5.45, 5.55, 0), MAT["metal"], seg=32)
plant("side_plant", 5.45, 5.55, 0.35, z=0.58)
plant("floor_plant_ward", 3.78, D - 0.45, 1.2)
TVY = (2.4, 4.4)                              # dresser + TV on the right wall, facing the bed
boxb("tv_panel", W - 0.04, W, TVY[0] - 0.35, TVY[1] + 0.35, 0, H, MAT["walnut"])
for k in range(int((TVY[1] - TVY[0] + 0.7) / 0.09)):
    y = TVY[0] - 0.35 + 0.045 + k * 0.09
    boxb(f"tv_slat_{k}", W - 0.08, W - 0.04, y - 0.02, y + 0.02, 0, H, MAT["walnut"])
boxb("dresser", W - 0.55, W - 0.08, TVY[0], TVY[1], 0.12, 0.62, MAT["walnut"], 0.006)
boxb("dresser_gap", W - 0.553, W - 0.549, TVY[0] + 0.02, TVY[1] - 0.02, 0.37, 0.375, MAT["metal"])
boxb("dresser_plinth", W - 0.5, W - 0.08, TVY[0] + 0.05, TVY[1] - 0.05, 0, 0.12, MAT["metal"])
strip("dresser_glow", W - 0.5, W - 0.48, TVY[0] + 0.06, TVY[1] - 0.06, 0.1, 0.11, "br_path", 6)
boxb("tv_body", W - 0.13, W - 0.08, (TVY[0] + TVY[1]) / 2 - 0.73, (TVY[0] + TVY[1]) / 2 + 0.73, 1.0, 1.84, MAT["metal"], 0.004)
boxb("tv_glass", W - 0.132, W - 0.13, (TVY[0] + TVY[1]) / 2 - 0.71, (TVY[0] + TVY[1]) / 2 + 0.71, 1.02, 1.82, MAT["screen"])
cyl("dresser_vase", 0.07, 0.09, 0.28, (W - 0.3, TVY[1] - 0.25, 0.62), MAT["ceramic_w"], seg=40)
plant("dresser_plant", W - 0.3, TVY[0] + 0.25, 0.4, z=0.62)
boxb("dresser_books", W - 0.42, W - 0.18, TVY[0] + 0.6, TVY[0] + 0.85, 0.62, 0.68, MAT["pillow_b"], 0.004)

# ---------------------------------------------------------------- ceiling fan (tray centre) + linear AC slot (back ceiling)
FANS = find_assets("fan_ceiling", "office")
FAN_TOP = HT
if FANS:
    fan_obj = place_asset("fan", FANS[0], FAN[0], FAN[1], FAN_TOP, 0.0, length=1.3, top=True)
    FAN_Z = FAN_TOP - 0.45
else:
    FAN_Z = FAN_TOP - 0.5
    cyl("fan_rod", 0.012, 0.012, 0.42, (FAN[0], FAN[1], FAN_Z + 0.08), MAT["metal"], seg=12)
    cyl("fan_motor", 0.13, 0.11, 0.12, (FAN[0], FAN[1], FAN_Z), MAT["metal"], seg=32)
    bm = bmesh.new()
    for k in range(3):
        mtx = Matrix.Rotation(k * 2 * math.pi / 3, 4, "Z") @ Matrix.Translation((0.42, 0, 0.05)) @ Matrix.Diagonal((0.6, 0.13, 0.008, 1))
        bmesh.ops.create_cube(bm, size=1.0, matrix=mtx)
    fan_obj = finish("fan_blades", bm, MAT["metal"], (FAN[0], FAN[1], FAN_Z))
USED["fan"] = "model" if FANS else "fallback"
AC = (2.4, 5.2, 6.06, 6.22)
boxb("ac_frame", AC[0], AC[1], AC[2], AC[3], H - 0.006, H, MAT["grille"])
for k in range(int((AC[1] - AC[0]) / 0.035)):
    x = AC[0] + 0.02 + k * 0.035
    boxb(f"ac_slot_{k}", x, x + 0.018, AC[2] + 0.02, AC[3] - 0.02, H - 0.008, H - 0.006, MAT["grille_slot"])
for k, (x, y) in enumerate(((1.2, 0.45), (5.65, 4.6))):
    cyl(f"speaker_{k}", 0.08, 0.08, 0.004, (x, y, H - 0.004), MAT["ceramic_w"], seg=40)

# ---------------------------------------------------------------- outside: night city HDRI (sky) + daylight card (day_sky) + suns
world = bpy.data.worlds.new("city"); scene.world = world; world.use_nodes = True
N = world.node_tree.nodes; L = world.node_tree.links; bg = N["Background"]
hdri = sorted(glob.glob(os.path.join(MODELS, "cabin", "sky", "*.exr")) + glob.glob(os.path.join(MODELS, "cabin", "sky", "*.hdr")))
tc = N.new("ShaderNodeTexCoord"); sx = N.new("ShaderNodeSeparateXYZ"); L.new(tc.outputs["Generated"], sx.inputs[0])
if hdri:
    zs = N.new("ShaderNodeMath"); zs.operation = "ADD"; zs.inputs[1].default_value = SKY_SHIFT; L.new(sx.outputs["Z"], zs.inputs[0])
    cb = N.new("ShaderNodeCombineXYZ"); L.new(sx.outputs["X"], cb.inputs["X"]); L.new(sx.outputs["Y"], cb.inputs["Y"]); L.new(zs.outputs[0], cb.inputs["Z"])
    mp = N.new("ShaderNodeMapping"); mp.name = "sky_rot"; mp.inputs["Rotation"].default_value = (0, 0, SKY_ROT); L.new(cb.outputs[0], mp.inputs["Vector"])
    env = N.new("ShaderNodeTexEnvironment"); env.image = bpy.data.images.load(hdri[0]); L.new(mp.outputs[0], env.inputs["Vector"])
    L.new(env.outputs["Color"], bg.inputs["Color"]); bg.inputs["Strength"].default_value = 1.0
    print("[uniser] sky:", os.path.basename(hdri[0]))
else:
    bg.inputs["Color"].default_value = (*lin("#1e2c62"), 1); bg.inputs["Strength"].default_value = 1.0
world.lightgroup = "sky"
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=False, segments=48, radius1=420, radius2=420, depth=520, matrix=Matrix.Translation((0, 0, 230)))
finish("day_sky_card", bm, MAT["skycard"], loc=(W / 2, D / 2, 0)).lightgroup = "day_sky"
for name, elev, azi, strength in (("day_morning", 14, -35, 3.0), ("day_midday", 50, 0, 3.5), ("day_evening", 9, 35, 2.5)):
    ld = bpy.data.lights.new(name, "SUN"); ld.energy = strength; ld.angle = rad(2.0)
    ob = bpy.data.objects.new(name, ld); ROOT.objects.link(ob); ob.lightgroup = name
    e, a = rad(elev), rad(azi)                    # sun beyond the balcony (+y)
    d = Vector((math.cos(e) * math.sin(a), -math.cos(e) * math.cos(a), -math.sin(e)))
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

# ---------------------------------------------------------------- camera: front right, looking at bed wall, wardrobe, balcony
cd = bpy.data.cameras.new("hero"); cd.sensor_fit = "VERTICAL"; cd.angle_y = rad(62.0); cd.clip_end = 5000; cd.shift_y = 0.03
cam = bpy.data.objects.new("hero", cd); ROOT.objects.link(cam)
cam.location = (4.7, 0.35, 1.45)
aim(cam, (1.75, D, 1.2)); scene.camera = cam

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
scene.render.resolution_x, scene.render.resolution_y = (1920, 1080) if FINAL else (960, 540)
scene.render.resolution_percentage = 100
scene.cycles.samples = (384 if FANBLUR else 640) if FINAL else 128
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
scene.view_settings.view_transform = "AgX"
try:
    scene.view_settings.look = "AgX - Medium High Contrast"
except Exception:
    pass
VL.cycles.denoising_store_passes = True

# ---------------------------------------------------------------- hotspots + fan rect
HOT = {
    "br-general": (2.6, 6.2, H), "br-cove": (2.8, TRAY["y1"], H + 0.2), "br-bedside-l": (0.3, NS[1] - 0.08, 0.9),
    "br-bedside-r": (0.3, NS[0] + 0.08, 0.9), "br-reading": (0.4, NS[1] - 0.32, 1.3), "br-wardrobe": ((X0 + X1) / 2, WY0, 1.5),
    "br-path": (2.18, BY, 0.08), "curtains": (CT[1] - 0.25, D - 0.18, 1.6), "hvac": ((AC[0] + AC[1]) / 2, (AC[2] + AC[3]) / 2, H),
    "fan": (FAN[0], FAN[1], FAN_Z), "keypad": (X0 - 0.2, D, 1.2), "tv": (W - 0.13, (TVY[0] + TVY[1]) / 2, 1.42),
}
bpy.context.view_layer.update()
spots = {}
for k, co in HOT.items():
    v = world_to_camera_view(scene, cam, Vector(co))
    spots[k] = {"u": round(v.x, 4), "v": round(1 - v.y, 4), "visible": bool(0 <= v.x <= 1 and 0 <= v.y <= 1 and v.z > 0)}
fr = []
for a in range(16):
    for z in (FAN_Z - 0.1, FAN_TOP):
        v = world_to_camera_view(scene, cam, Vector((FAN[0] + 0.7 * math.cos(a * math.pi / 8), FAN[1] + 0.7 * math.sin(a * math.pi / 8), z)))
        fr.append((v.x, 1 - v.y))
fan_rect = [round(max(0, min(p[0] for p in fr) - 0.01), 4), round(max(0, min(p[1] for p in fr) - 0.01), 4),
            round(min(1, max(p[0] for p in fr) + 0.01), 4), round(min(1, max(p[1] for p in fr) + 0.01), 4)]
with open(os.path.join(OUT, "hotspots.json"), "w") as f:
    json.dump({"camera": "hero", "points": spots, "fan_rect": fan_rect, "fan_rect_order": "u0, v0, u1, v1 (v down)"}, f, indent=2)

if FANBLUR:
    if fan_rect[2] - fan_rect[0] < 0.03 or fan_rect[3] - fan_rect[1] < 0.03:
        print("[uniser] fan is outside this camera view: skipping fan render"); sys.exit(0)
    scene.frame_start = scene.frame_end = 1
    fan_obj.keyframe_insert("rotation_euler", frame=0)
    fan_obj.rotation_euler.z += rad(100); fan_obj.keyframe_insert("rotation_euler", frame=1)
    fan_obj.rotation_euler.z += rad(100); fan_obj.keyframe_insert("rotation_euler", frame=2)
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

TINT = {"br_wardrobe": (1.0, 0.62, 0.32, 1.0)}
TINT_2700K = (1.0, 0.47, 0.17, 1.0)
acc = None; written = []
for g in GROUPS:
    s = group_socket(g)
    if s is None:
        print("missing light group pass:", g); continue
    dn = T.nodes.new("CompositorNodeDenoise"); dn.use_hdr = True
    T.links.new(s, dn.inputs["Image"])
    T.links.new(rl.outputs["Denoising Normal"], dn.inputs["Normal"])
    T.links.new(rl.outputs["Denoising Albedo"], dn.inputs["Albedo"])
    fo.layer_slots.new(g); T.links.new(dn.outputs[0], fo.inputs[g]); written.append(g)
    if g in DAY:
        continue   # preview shows the evening city + lights (matches the reference mood)
    src = dn.outputs[0]
    if g in CIRCUITS:
        mul = T.nodes.new("CompositorNodeMixRGB"); mul.blend_type = "MULTIPLY"; mul.inputs[0].default_value = 1
        T.links.new(src, mul.inputs[1]); mul.inputs[2].default_value = TINT.get(g, TINT_2700K); src = mul.outputs[0]
    if acc is None:
        acc = src
    else:
        add = T.nodes.new("CompositorNodeMixRGB"); add.blend_type = "ADD"; add.inputs[0].default_value = 1
        T.links.new(acc, add.inputs[1]); T.links.new(src, add.inputs[2]); acc = add.outputs[0]
fo.layer_slots.new("beauty"); T.links.new(rl.outputs["Image"], fo.inputs["beauty"])
comp = T.nodes.new("CompositorNodeComposite")
T.links.new(acc or rl.outputs["Image"], comp.inputs["Image"])

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f"bedroom_{TAG}.blend"))
print(f"[uniser] built bedroom, mode={MODE}, closed={CLOSED}, fanblur={FANBLUR}, passes={written}")
print("[uniser] models:", " | ".join(f"{k}: {v}" for k, v in USED.items()), "| lamps:", "model" if LAMPS else "fallback",
      "| clothes:", "model" if CLOTHES else "fallback", "| plants:", len(PLANTS))
print("[uniser] fan_rect:", fan_rect, "| hotspots not in view:", [k for k, s in spots.items() if not s["visible"]])

if SKYTEST:
    scene.render.resolution_x, scene.render.resolution_y = 640, 360
    scene.cycles.samples = 24; scene.use_nodes = False
    mpn = world.node_tree.nodes.get("sky_rot")
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
