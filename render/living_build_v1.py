"""
Uniser SmartSpaces - Residential Living Room
Builds the living room and renders one linear EXR pass per lighting circuit.

  Blender -b -P living_build_v1.py -- --build             # build + save .blend only (check layout)
  Blender -b -P living_build_v1.py -- --skytest           # 4 quick renders of the city view at 0/90/180/270
  Blender -b -P living_build_v1.py -- --preview           # 960x540, curtains open
  Blender -b -P living_build_v1.py -- --final             # 1920x1080, curtains open
  Blender -b -P living_build_v1.py -- --final --closed    # curtains closed
  Blender -b -P living_build_v1.py -- --final --fanblur   # fan region only, motion-blurred blades (cheap)
  add --skyrot=<deg> to turn the city view, --cpu if the Mac GPU crashes

Models (falls back to geometry if missing):
  models/living/ sofa_sectional (lightened to warm grey)
  models/room/   armchair (recoloured olive velvet)
  models/cabin/  decor_* (shelf pieces), art/*.jpg, sky/*.exr (night city)
  models/office/ fan_ceiling      models/lobby/ plant_*
The RGB strip renders white; the app tints it to any colour (same maths as tunable white).
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
OUT = os.path.join(BASE, "out_living")
MODELS = os.path.join(BASE, "models")
os.makedirs(OUT, exist_ok=True)
random.seed(21)
rad = math.radians

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
VL = scene.view_layers[0]
ROOT = bpy.data.collections.new("Living")
scene.collection.children.link(ROOT)

# ---------------------------------------------------------------- plan
# x across (0 = left/dining wall, W = window wall), y into the room (D = TV wall), z up
W, D = 8.0, 7.6
H, HT = 2.85, 3.1                       # perimeter ceiling, tray
TRAY = dict(x0=0.9, x1=7.1, y0=0.8, y1=6.8)
WIN = (0.6, D)                          # glazing on x = W
TVW = (3.5, 6.6)                        # stone TV feature panel on y = D
TV = (4.15, 6.0, 1.15, 2.2)             # x0, x1, z0, z1  (about 85")
SHELF_X = (6.7, 7.6)                    # backlit shelving between TV wall and window
FAN = (4.8, 3.5)
AC = (2.9, 5.0)
SOFA_ROT = rad(90)                      # glTF faces -y at 0; +90 turns the seats toward +x (the room). Try 180/0/-90 if wrong.
CHAIR_ROT = rad(-130)
SOFA_TINT = (0.36, 0.34, 0.31)          # added (screen) to the sofa textures to lift dark grey to warm light grey
SKY_ROT = rad(float(next((a.split("=")[1] for a in ARGS if a.startswith("--skyrot=")), "90")))
SKY_SHIFT = 0.06

CIRCUITS = ["lv_general", "lv_cove", "lv_deco", "lv_accent", "lv_tvwall", "lv_rgb"]
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

def globe_glass():
    m = principled("globe_glass", "#e0b277", 0.04, Transmission_Weight=1.0, IOR=1.45)
    return m

MAT = dict(
    floor=procedural("floor_porcelain", [(0.0, "#a39b90"), (0.5, "#b0a89d"), (1.0, "#a8a095")], 0.14,
                     scale=0.35, distortion=3.0, detail=9, coat=0.35, tiles=(1.2, 1.2, "#8f877c")),
    wall=procedural("plaster_warm", [(0.0, "#7c7266"), (1.0, "#887e72")], 0.85, scale=3.0, bump=0.04),
    stone=procedural("tv_stone", [(0.0, "#4b4844"), (0.47, "#5d5954"), (0.5, "#3a3734"), (0.53, "#5d5954"), (1.0, "#524e49")],
                     0.5, scale=0.5, distortion=4.0, detail=10, bump=0.08, coat=0.1),
    ceiling=procedural("ceiling_plaster", [(0.0, "#a39a8f"), (1.0, "#ada499")], 0.9, scale=2.0, bump=0.02),
    walnut=procedural("walnut", [(0.0, "#1e140c"), (0.6, "#302114"), (1.0, "#3c2a19")], 0.45,
                      kind="wave", scale=4.0, distortion=7.0, detail=4, coat=0.2),
    rug=procedural("rug", [(0.0, "#6c6660"), (0.45, "#827b74"), (0.55, "#958e86"), (1.0, "#76706a")], 0.95,
                   scale=3.0, distortion=6.0, detail=4, bump=0.2),
    marble=procedural("marble_dark", [(0.0, "#1b1a19"), (0.46, "#2a2826"), (0.5, "#8d877e"), (0.54, "#2a2826"), (1.0, "#222120")],
                      0.12, scale=0.7, distortion=5.0, detail=10, coat=0.7),
    sofa=principled("sofa_fabric", "#b3aca2", 0.9, Sheen_Weight=0.5),
    velvet=principled("velvet_olive", "#3b4128", 0.75, Sheen_Weight=1.0, Sheen_Roughness=0.3),
    pillow_o=principled("pillow_olive", "#3a4427", 0.8, Sheen_Weight=0.8),
    pillow_g=principled("pillow_grey", "#7d776f", 0.9, Sheen_Weight=0.5),
    brass=principled("brass", "#b08d4f", 0.28, 1.0),
    metal=principled("black_metal", "#141312", 0.4, 0.8),
    grille=principled("grille", "#e4e0da", 0.5),
    grille_slot=principled("grille_slot", "#0b0b0b", 0.8),
    cloth=principled("speaker_cloth", "#121212", 0.95),
    ceramic_w=principled("ceramic_white", "#e8e3da", 0.35),
    ceramic_b=principled("ceramic_black", "#141312", 0.25),
    screen=principled("tv_off", "#050608", 0.08, Coat_Weight=1.0),
    window=glass("window_glass"),
    drape=principled("drape_taupe", "#5e5246", 0.9, Sheen_Weight=0.5),
    sheer=principled("sheer", "#e8e2d8", 0.9, Transmission_Weight=0.7, Alpha=0.55),
    shade=lamp_shade(),
    skycard=day_sky_card(),
    art=art_material(),
    globe=globe_glass(),
    led=emission("led_strip", 30.0),
    lens=emission("downlight_lens", 25.0),
    filament=emission("filament", 260.0),
    keypad=emission("keypad_glow", 4.0),
)
BOOKS = [principled(f"book_{i}", h, 0.7) for i, h in enumerate(("#2a1c14", "#4a3424", "#1f2430", "#6b5a44", "#c9bfae", "#14161a", "#8a7a62"))]
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


def curtain_y(name, y0, y1, x, z0, z1, mat, folds_per_m=6.0, amp=0.05):
    bm = bmesh.new(); n = max(12, int((y1 - y0) * folds_per_m * 6)); rows = []
    for i in range(n + 1):
        t = i / n; y = y0 + (y1 - y0) * t
        xx = x + amp * math.sin(t * (y1 - y0) * folds_per_m * 2 * math.pi)
        rows.append((bm.verts.new((xx, y, z0)), bm.verts.new((xx, y, z1))))
    for i in range(n):
        bm.faces.new((rows[i][0], rows[i + 1][0], rows[i + 1][1], rows[i][1]))
    return finish(name, bm, mat, smooth=lambda f: True)

def lighten(coll, add, skip=("throw", "blanket", "plaid", "cloth")):
    """Screen-adds a colour onto every material of an imported model (keeps its texture detail)."""
    done = set()
    for o in coll.all_objects:
        if o.type != "MESH":
            continue
        for slot in o.material_slots:
            m = slot.material
            if not m or m.name in done or not m.use_nodes or any(k in m.name.lower() for k in skip):
                continue
            done.add(m.name)
            N = m.node_tree.nodes; L = m.node_tree.links
            b = next((n for n in N if n.type == "BSDF_PRINCIPLED"), None)
            if not b:
                continue
            sock = b.inputs["Base Color"]
            mix = N.new("ShaderNodeMixRGB"); mix.blend_type = "SCREEN"; mix.inputs["Fac"].default_value = 1.0
            mix.inputs["Color2"].default_value = (*add, 1)
            if sock.is_linked:
                src = sock.links[0].from_socket; L.remove(sock.links[0]); L.new(src, mix.inputs["Color1"])
            else:
                mix.inputs["Color1"].default_value = sock.default_value
            L.new(mix.outputs[0], sock)

# ---------------------------------------------------------------- shell + tray ceiling: warm cove on three sides, RGB strip on the window side
boxb("floor", 0, W, 0, D, -0.1, 0, MAT["floor"])
boxb("wall_front", 0, W, -0.2, 0, 0, HT, MAT["wall"])
boxb("wall_left", -0.2, 0, 0, D, 0, HT, MAT["wall"])
boxb("wall_back", 0, W, D, D + 0.2, 0, HT, MAT["wall"])
boxb("wall_right_solid", W, W + 0.2, 0, WIN[0], 0, HT, MAT["wall"])
for nm, x0, x1, y0, y1 in (("l", 0, TRAY["x0"], 0, D), ("r", TRAY["x1"], W, 0, D),
                           ("f", TRAY["x0"], TRAY["x1"], 0, TRAY["y0"]), ("b", TRAY["x0"], TRAY["x1"], TRAY["y1"], D)):
    boxb(f"ceiling_{nm}", x0, x1, y0, y1, H, H + 0.2, MAT["ceiling"])
boxb("ceiling_tray", TRAY["x0"], TRAY["x1"], TRAY["y0"], TRAY["y1"], HT, HT + 0.1, MAT["ceiling"])
for nm, x0, x1, y0, y1 in (("l", TRAY["x0"] - 0.02, TRAY["x0"], TRAY["y0"], TRAY["y1"]), ("r", TRAY["x1"], TRAY["x1"] + 0.02, TRAY["y0"], TRAY["y1"]),
                           ("f", TRAY["x0"], TRAY["x1"], TRAY["y0"] - 0.02, TRAY["y0"]), ("b", TRAY["x0"], TRAY["x1"], TRAY["y1"], TRAY["y1"] + 0.02)):
    boxb(f"tray_side_{nm}", x0, x1, y0, y1, H + 0.2, HT, MAT["ceiling"])
for nm, x0, x1, y0, y1 in (("l", TRAY["x0"] + 0.04, TRAY["x0"] + 0.08, TRAY["y0"], TRAY["y1"]),
                           ("f", TRAY["x0"], TRAY["x1"], TRAY["y0"] + 0.04, TRAY["y0"] + 0.08), ("b", TRAY["x0"], TRAY["x1"], TRAY["y1"] - 0.08, TRAY["y1"] - 0.04)):
    strip(f"cove_{nm}", x0, x1, y0, y1, H + 0.2, H + 0.22, "lv_cove", 22, down=False)
strip("rgb_tray", TRAY["x1"] - 0.08, TRAY["x1"] - 0.04, TRAY["y0"], TRAY["y1"], H + 0.2, H + 0.22, "lv_rgb", 24, down=False)
strip("rgb_window_head", W - 0.42, W - 0.39, WIN[0], WIN[1], H - 0.03, H - 0.02, "lv_rgb", 12)
for k, (x, y) in enumerate(((0.45, 1.6), (0.45, 3.6), (0.45, 5.6), (2.4, 0.4), (4.4, 0.4), (6.4, 0.4), (1.6, 7.2), (7.55, 1.4))):
    downlight(f"dl_general_{k}", x, y, H, "lv_general", 55, 55)
for k, x in enumerate((3.9, 5.05, 6.2)):        # wall-washers on the stone TV wall
    downlight(f"dl_tvwash_{k}", x, D - 0.45, H, "lv_tvwall", 45, 32, target=(x, D, 1.0))

# ---------------------------------------------------------------- TV wall: stone feature panel, TV, floating walnut console with under-glow, slat returns, towers + soundbar
boxb("tv_stone", TVW[0], TVW[1], D - 0.06, D, 0, H, MAT["stone"])
for k, x in enumerate(TVW):
    boxb(f"tv_reveal_{k}", x - 0.012, x + 0.012, D - 0.07, D - 0.05, 0, H, MAT["led"], group="lv_tvwall")
    light(f"tv_reveal_{k}_light", "AREA", 26, (x, D - 0.09, H / 2), "lv_tvwall", size=(0.04, H), rot=(-math.pi / 2, 0, 0))
for (x0, x1), tag in (((2.95, TVW[0]), "l"), ((TVW[1], SHELF_X[0]), "r")):
    boxb(f"slat_back_{tag}", x0, x1, D - 0.02, D, 0, H, MAT["walnut"])
    for k in range(int((x1 - x0) / 0.08)):
        x = x0 + 0.04 + k * 0.08
        boxb(f"slat_{tag}_{k}", x - 0.018, x + 0.018, D - 0.06, D - 0.02, 0, H, MAT["walnut"])
X0, X1, Z0, Z1 = TV
boxb("tv_body", X0, X1, D - 0.12, D - 0.07, Z0, Z1, MAT["metal"], 0.004)
boxb("tv_glass", X0 + 0.01, X1 - 0.01, D - 0.122, D - 0.12, Z0 + 0.01, Z1 - 0.01, MAT["screen"])
boxb("console", 3.7, 6.4, D - 0.48, D - 0.06, 0.26, 0.6, MAT["walnut"], 0.006)
for k in range(3):
    x = 3.7 + (k + 1) * 0.9
    boxb(f"console_seam_{k}", x - 0.002, x + 0.002, D - 0.482, D - 0.478, 0.28, 0.58, MAT["metal"])
strip("console_glow", 3.75, 6.35, D - 0.44, D - 0.42, 0.245, 0.255, "lv_tvwall", 14)
strip("console_top_glow", 3.75, 6.35, D - 0.1, D - 0.08, 0.6, 0.61, "lv_tvwall", 6, down=False)
boxb("soundbar", 4.4, 5.75, D - 0.36, D - 0.24, 0.6, 0.68, MAT["cloth"], 0.01)
boxb("av_box", 3.95, 4.3, D - 0.36, D - 0.16, 0.6, 0.65, MAT["metal"], 0.004)
cyl("console_vase", 0.07, 0.09, 0.26, (6.1, D - 0.28, 0.6), MAT["ceramic_b"], seg=40)
for k, (x, y) in enumerate(((3.18, D - 0.5), (6.92, D - 0.85))):
    boxb(f"tower_{k}", x - 0.13, x + 0.13, y - 0.16, y + 0.16, 0.04, 1.12, MAT["metal"], 0.01)
    boxb(f"tower_{k}_cloth", x - 0.115, x + 0.115, y - 0.165, y - 0.16, 0.1, 1.08, MAT["cloth"])
    for j, z in enumerate((0.95, 0.75, 0.45)):
        cyl(f"tower_{k}_drv_{j}", 0.045 if j == 0 else 0.08, 0.045 if j == 0 else 0.08, 0.006, (x, y - 0.168, z), MAT["ceramic_b"], seg=28, rot=(math.pi / 2, 0, 0))
    for c in range(4):
        cyl(f"tower_{k}_spike_{c}", 0.01, 0.002, 0.04, (x - 0.1 + 0.2 * (c % 2), y - 0.12 + 0.24 * (c // 2), 0), MAT["metal"], seg=8)

# ---------------------------------------------------------------- backlit shelving (accent) between TV wall and window
SX0, SX1 = SHELF_X
boxb("shelf_back", SX0, SX1, D - 0.04, D, 0, H, MAT["walnut"])
for k, x in enumerate((SX0, SX1)):
    boxb(f"shelf_side_{k}", x - 0.015, x + 0.015, D - 0.4, D, 0, H, MAT["walnut"])
DEC = {k: find_assets(f"decor_{k}", "cabin") for k in ("globe", "modern_sculpture", "figure_8")}
rows = [0.55, 1.0, 1.45, 1.9, 2.35]
for j, z in enumerate(rows):
    boxb(f"shelf_board_{j}", SX0, SX1, D - 0.4, D - 0.04, z, z + 0.03, MAT["walnut"])
    strip(f"shelf_led_{j}", SX0 + 0.04, SX1 - 0.04, D - 0.38, D - 0.36, z - 0.012, z - 0.002, "lv_accent", 14)
    light(f"shelf_back_{j}", "AREA", 8, ((SX0 + SX1) / 2, D - 0.06, z + 0.2), "lv_accent", size=(SX1 - SX0 - 0.08, 0.3), rot=(math.pi / 2, 0, 0))
    zb = z + 0.03; mid = (SX0 + SX1) / 2; kind = ("books", "globe", "vases", "figure_8", "modern_sculpture")[j]
    if kind == "books":
        x = SX0 + 0.08
        while x < mid + 0.1:
            t = random.uniform(0.025, 0.04); h = random.uniform(0.2, 0.3)
            boxb(f"sbook_{j}_{x:.2f}", x, x + t, D - 0.3, D - 0.08, zb, zb + h, random.choice(BOOKS)); x += t + 0.003
        cyl(f"sbowl_{j}", 0.06, 0.1, 0.06, (SX1 - 0.2, D - 0.2, zb), MAT["brass"], seg=32)
    elif kind == "vases":
        cyl(f"svase_{j}_a", 0.05, 0.07, 0.26, (mid - 0.15, D - 0.2, zb), MAT["ceramic_b"], seg=40)
        cyl(f"svase_{j}_b", 0.04, 0.06, 0.18, (mid + 0.15, D - 0.2, zb), MAT["ceramic_w"], seg=40)
    elif DEC.get(kind):
        place_asset(f"sdecor_{j}", DEC[kind][0], mid, D - 0.2, zb, rad(random.uniform(-30, 30)), height=0.3)
    else:
        cyl(f"sdecor_{j}", 0.05, 0.07, 0.24, (mid, D - 0.2, zb), MAT["ceramic_w"], seg=40)
plant("shelf_plant_top", SX0 + 0.3, D - 0.2, 0.35, z=rows[-1] + 0.03)

# ---------------------------------------------------------------- seating: L sectional (left), marble coffee table, velvet pouf, olive armchair + side table (right foreground)
boxb("rug", 1.2, 6.0, 1.2, 5.2, 0, 0.012, MAT["rug"])
SOFAS = find_assets("sofa_sectional", "living")
USED["sofa_sectional"] = "model" if SOFAS else "fallback"
if SOFAS:
    sofa = place_asset("sofa", SOFAS[0], 1.55, 3.3, 0.0, SOFA_ROT, length=3.6)
    lighten(sofa.instance_collection, SOFA_TINT)
else:
    boxb("sofa_long_seat", 0.25, 1.3, 1.3, 5.0, 0.05, 0.44, MAT["sofa"], 0.07)
    boxb("sofa_long_back", 0.25, 0.5, 1.3, 5.0, 0.4, 0.86, MAT["sofa"], 0.08)
    boxb("sofa_ret_seat", 1.3, 3.1, 4.05, 5.0, 0.05, 0.44, MAT["sofa"], 0.07)
    boxb("sofa_ret_back", 1.3, 3.1, 4.75, 5.0, 0.4, 0.86, MAT["sofa"], 0.08)
    boxb("sofa_arm", 0.25, 1.3, 1.1, 1.32, 0.4, 0.62, MAT["sofa"], 0.07)
    for k, (y0, y1) in enumerate(((1.35, 2.6), (2.6, 3.85))):
        boxb(f"sofa_cush_{k}", 0.5, 0.75, y0 + 0.05, y1 - 0.05, 0.44, 0.84, MAT["sofa"], 0.08)
    for k, (x, y, a, m) in enumerate(((0.72, 1.8, 1.5, "pillow_o"), (0.72, 3.2, 1.6, "pillow_g"), (1.6, 4.7, 0.1, "pillow_o"), (2.5, 4.7, -0.1, "pillow_g"))):
        rbox(f"pillow_{k}", x, y, 0.46, 0.42, 0.14, 0.4, a, MAT[m], 0.06)
cyl("coffee_top", 0.62, 0.62, 0.05, (2.95, 2.9, 0.36), MAT["marble"], seg=72)
cyl("coffee_base", 0.36, 0.4, 0.36, (2.95, 2.9, 0), MAT["marble"], seg=56)
for k, (dx, dy, h) in enumerate(((-0.2, 0.05, 0.04), (-0.2, 0.05, 0.04))):
    rbox(f"coffee_book_{k}", 2.95 + dx, 2.9 + dy, 0.41 + k * h, 0.3, 0.22, h, rad(8 * k), BOOKS[k], 0.004)
cyl("coffee_tray", 0.16, 0.16, 0.02, (3.2, 3.0, 0.41), MAT["metal"], seg=40)
cyl("coffee_vase", 0.06, 0.08, 0.22, (3.05, 2.65, 0.41), MAT["ceramic_w"], seg=40)
plant("coffee_flowers", 3.05, 2.65, 0.32, z=0.6)
cyl("pouf", 0.42, 0.44, 0.42, (4.35, 2.15, 0), MAT["velvet"], seg=56)
cyl("pouf_top", 0.42, 0.38, 0.05, (4.35, 2.15, 0.42), MAT["velvet"], seg=56)
if not asset_or("armchair", "armchair", "room", 6.55, 1.75, 0.0, CHAIR_ROT, height=0.85):
    rbox("armchair_seat", 6.55, 1.75, 0.0, 0.85, 0.85, 0.45, CHAIR_ROT, MAT["velvet"], 0.1)
else:
    for o in bpy.data.objects["armchair"].instance_collection.all_objects:
        if o.type == "MESH":
            o.data.materials.clear(); o.data.materials.append(MAT["velvet"])
cyl("side_table_top", 0.24, 0.24, 0.03, (7.15, 2.55, 0.55), MAT["metal"], seg=40)
cyl("side_table_stem", 0.03, 0.03, 0.55, (7.15, 2.55, 0), MAT["metal"], seg=16)
cyl("side_table_foot", 0.18, 0.18, 0.02, (7.15, 2.55, 0), MAT["metal"], seg=32)
rbox("side_book", 7.12, 2.55, 0.58, 0.22, 0.16, 0.035, rad(15), BOOKS[3], 0.004)

# ---------------------------------------------------------------- dining (left back): table, chairs, art; globe pendant cluster (decorative)
DT = (1.55, 6.35)
boxb("dining_top", DT[0] - 0.95, DT[0] + 0.95, DT[1] - 0.48, DT[1] + 0.48, 0.73, 0.77, MAT["walnut"], 0.006)
for k, xx in enumerate((-0.6, 0.6)):
    boxb(f"dining_leg_{k}", DT[0] + xx - 0.04, DT[0] + xx + 0.04, DT[1] - 0.3, DT[1] + 0.3, 0, 0.73, MAT["metal"])
for k, (dx, side) in enumerate(((-0.55, -1), (0.0, -1), (0.55, -1), (-0.55, 1), (0.0, 1), (0.55, 1))):
    cx, cy = DT[0] + dx, DT[1] + side * 0.72
    boxb(f"dchair_{k}_seat", cx - 0.22, cx + 0.22, cy - 0.22, cy + 0.22, 0.44, 0.5, MAT["sofa"], 0.03)
    by = cy + side * 0.2
    boxb(f"dchair_{k}_back", cx - 0.21, cx + 0.21, by - 0.03, by + 0.03, 0.5, 0.92, MAT["sofa"], 0.02)
    for c in range(4):
        lx, ly = cx - 0.18 + 0.36 * (c % 2), cy - 0.18 + 0.36 * (c // 2)
        boxb(f"dchair_{k}_leg_{c}", lx - 0.012, lx + 0.012, ly - 0.012, ly + 0.012, 0, 0.44, MAT["metal"])
cyl("dining_vase", 0.07, 0.09, 0.22, (DT[0], DT[1], 0.77), MAT["ceramic_w"], seg=40)
plant("dining_flowers", DT[0], DT[1], 0.35, z=0.95)
boxb("art_frame", 0.0, 0.04, 5.45, 7.25, 1.2, 2.25, MAT["metal"], 0.003)
boxb("art_canvas", 0.04, 0.045, 5.48, 7.22, 1.23, 2.22, MAT["art"])
for k, y in enumerate((5.9, 6.8)):
    downlight(f"accent_art_{k}", 0.75, y, H, "lv_accent", 45, 30, target=(0.04, y, 1.7))
for k, (x, y, z) in enumerate(((1.15, 4.75, 2.0), (1.5, 5.15, 2.25), (1.85, 4.85, 1.85), (2.2, 5.3, 2.1), (1.7, 5.6, 1.95))):
    cyl(f"globe_{k}_cord", 0.002, 0.002, HT - z - 0.17, (x, y, z + 0.17), MAT["metal"], seg=6)
    cyl(f"globe_{k}_cap", 0.03, 0.04, 0.04, (x, y, z + 0.13), MAT["brass"], seg=20)
    sphere(f"globe_{k}", 0.15, (x, y, z), MAT["globe"], seg=40)
    sphere(f"globe_{k}_bulb", 0.03, (x, y, z), MAT["filament"], seg=12, group="lv_deco")
    light(f"globe_{k}_light", "POINT", 22, (x, y, z), "lv_deco", radius=0.04)

# ---------------------------------------------------------------- window wall (x = W): glazing, curtains + sheers, balcony with planters
boxb("glass", W, W + 0.03, WIN[0], WIN[1], 0, HT, MAT["window"])
nm_ = int(round((WIN[1] - WIN[0]) / 1.4))
for k in range(nm_ + 1):
    y = WIN[0] + k * (WIN[1] - WIN[0]) / nm_
    boxb(f"mullion_{k}", W - 0.02, W + 0.05, y - 0.025, y + 0.025, 0, HT, MAT["metal"])
boxb("curtain_pocket", W - 0.45, W, WIN[0] - 0.2, D, H - 0.06, H, MAT["ceiling"])
CY = (WIN[0] - 0.15, D - 0.05)
if CLOSED:
    curtain_y("drape_closed", CY[0], CY[1], W - 0.3, 0.02, H - 0.06, MAT["drape"], 7.0, 0.05)
    curtain_y("sheer_closed", CY[0], CY[1], W - 0.14, 0.02, H - 0.06, MAT["sheer"], 9.0, 0.03)
else:
    curtain_y("drape_near", CY[0], CY[0] + 0.45, W - 0.3, 0.02, H - 0.06, MAT["drape"], 14.0, 0.07)
    curtain_y("drape_far", CY[1] - 0.4, CY[1], W - 0.3, 0.02, H - 0.06, MAT["drape"], 14.0, 0.07)
    curtain_y("sheer_far", CY[1] - 1.4, CY[1] - 0.38, W - 0.14, 0.02, H - 0.06, MAT["sheer"], 12.0, 0.04)
boxb("balcony_floor", W + 0.05, W + 1.8, WIN[0] - 1.0, D + 1.0, -0.04, -0.02, MAT["floor"])
boxb("balcony_rail", W + 1.7, W + 1.73, WIN[0] - 1.0, D + 1.0, 1.0, 1.04, MAT["metal"])
for k in range(int((D - WIN[0] + 2.0) / 0.12)):
    y = WIN[0] - 1.0 + k * 0.12
    boxb(f"baluster_{k}", W + 1.705, W + 1.725, y - 0.008, y + 0.008, 0, 1.0, MAT["metal"])
for k, y in enumerate((2.2, 4.6, 6.8)):
    boxb(f"balcony_planter_{k}", W + 0.9, W + 1.5, y - 0.4, y + 0.4, 0, 0.55, MAT["ceramic_b"], 0.01)
    plant(f"balcony_plant_{k}", W + 1.2, y, 1.2 + 0.3 * (k % 2), z=0.55)
for k, (x, y, h) in enumerate(((0.45, 0.6, 1.7), (2.85, D - 0.45, 1.6), (W - 0.6, 0.9, 1.9), (0.5, 5.0, 1.5))):
    plant(f"floor_plant_{k}", x, y, h)
for k, (x, y) in enumerate(((W - 0.6, 0.9), (2.85, D - 0.45))):
    light(f"accent_uplight_{k}", "SPOT", 25, (x + 0.25, y - 0.25, 0.05), "lv_accent", target=(x, y, 1.4), spot=40)

# ---------------------------------------------------------------- AC cassette (tray), ceiling fan (tray), keypad
cx, cy = AC; cz = HT
boxb("ac_panel", cx - 0.42, cx + 0.42, cy - 0.42, cy + 0.42, cz - 0.03, cz, MAT["grille"], 0.01)
boxb("ac_grille", cx - 0.22, cx + 0.22, cy - 0.22, cy + 0.22, cz - 0.034, cz - 0.03, MAT["grille"])
for k in range(9):
    o = -0.2 + k * 0.05
    boxb(f"ac_grille_bar_{k}", cx - 0.21, cx + 0.21, cy + o - 0.004, cy + o + 0.004, cz - 0.037, cz - 0.034, MAT["grille_slot"])
for k, (x0, x1, y0, y1) in enumerate(((cx - 0.34, cx + 0.34, cy + 0.29, cy + 0.35), (cx - 0.34, cx + 0.34, cy - 0.35, cy - 0.29),
                                      (cx + 0.29, cx + 0.35, cy - 0.34, cy + 0.34), (cx - 0.35, cx - 0.29, cy - 0.34, cy + 0.34))):
    boxb(f"ac_slot_{k}", x0, x1, y0, y1, cz - 0.036, cz - 0.03, MAT["grille_slot"])
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
KP = (2.85, D - 0.02)
boxb("keypad_plate", KP[0] - 0.06, KP[0] + 0.06, KP[1] - 0.012, KP[1], 1.14, 1.26, MAT["metal"], 0.003)
for k in range(4):
    z = 1.16 + k * 0.026
    boxb(f"keypad_btn_{k}", KP[0] - 0.02, KP[0] + 0.02, KP[1] - 0.014, KP[1] - 0.012, z, z + 0.012, MAT["keypad"], group="lv_accent")
for k, (x, y) in enumerate(((2.0, 2.0), (6.2, 5.6))):
    cyl(f"speaker_ceiling_{k}", 0.08, 0.08, 0.004, (x, y, HT - 0.004), MAT["ceramic_w"], seg=40)

# ---------------------------------------------------------------- outside: night city HDRI (sky) + daylight card (day_sky) + suns from beyond the window (+x)
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
    e, a = rad(elev), rad(azi)
    d = Vector((-math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), -math.sin(e)))
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

# ---------------------------------------------------------------- camera: front, between sofa and armchair, looking at the TV wall with the window on the right
cd = bpy.data.cameras.new("hero"); cd.sensor_fit = "VERTICAL"; cd.angle_y = rad(60.0); cd.clip_end = 5000; cd.shift_y = 0.04
cam = bpy.data.objects.new("hero", cd); ROOT.objects.link(cam)
cam.location = (2.9, 0.3, 1.4)
aim(cam, (5.0, D, 1.2)); scene.camera = cam

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
    "lv-general": (1.6, 7.2, H), "lv-cove": (3.5, TRAY["y1"], H + 0.2), "lv-deco": (1.5, 5.15, 2.25),
    "lv-accent": ((SX0 + SX1) / 2, D - 0.2, 1.7), "lv-tvwall": (5.05, D - 0.44, 0.25), "lv-rgb": (TRAY["x1"] - 0.06, 3.8, H + 0.2),
    "curtains": (W - 0.3, D - 1.2, 1.6), "hvac": (AC[0], AC[1], HT), "fan": (FAN[0], FAN[1], FAN_Z),
    "tv": ((TV[0] + TV[1]) / 2, D - 0.12, (TV[2] + TV[3]) / 2), "music": (6.92, D - 1.01, 0.9), "keypad": (KP[0], KP[1], 1.2),
}
bpy.context.view_layer.update()
spots = {}
for k, co in HOT.items():
    v = world_to_camera_view(scene, cam, Vector(co))
    spots[k] = {"u": round(v.x, 4), "v": round(1 - v.y, 4), "visible": bool(0 <= v.x <= 1 and 0 <= v.y <= 1 and v.z > 0)}

def proj_rect(pts, pad=0.01):
    uv = [world_to_camera_view(scene, cam, Vector(p)) for p in pts]
    return [round(max(0, min(p.x for p in uv) - pad), 4), round(max(0, min(1 - p.y for p in uv) - pad), 4),
            round(min(1, max(p.x for p in uv) + pad), 4), round(min(1, max(1 - p.y for p in uv) + pad), 4)]
fan_rect = proj_rect([(FAN[0] + 0.7 * math.cos(a * math.pi / 8), FAN[1] + 0.7 * math.sin(a * math.pi / 8), z)
                      for a in range(16) for z in (FAN_Z - 0.1, FAN_TOP)])
tv_rect = proj_rect([(x, D - 0.12, z) for x in (TV[0], TV[1]) for z in (TV[2], TV[3])], 0.0)
curtain_rect = proj_rect([(W - 0.3, y, z) for y in (CY[0], CY[1]) for z in (0.0, H)], 0.0)
with open(os.path.join(OUT, "hotspots.json"), "w") as f:
    json.dump({"camera": "hero", "points": spots, "fan_rect": fan_rect, "tv_rect": tv_rect, "curtain_rect": curtain_rect,
               "rect_order": "u0, v0, u1, v1 (v down)"}, f, indent=2)

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

TINT = {"lv_rgb": (0.55, 0.25, 1.0, 1.0)}   # preview only; the EXR stays white for the app to tint
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

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f"living_{TAG}.blend"))
print(f"[uniser] built living, mode={MODE}, closed={CLOSED}, fanblur={FANBLUR}, passes={written}")
print("[uniser] models:", " | ".join(f"{k}: {v}" for k, v in USED.items()), "| plants:", len(PLANTS))
print("[uniser] fan_rect:", fan_rect, "| tv_rect:", tv_rect, "| curtain_rect:", curtain_rect, "| hotspots not in view:", [k for k, s in spots.items() if not s["visible"]])

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
