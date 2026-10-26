"""
Uniser SmartSpaces - Residential Living Room
Builds the living room and renders one linear EXR pass per lighting circuit.

  Blender -b -P den_build_v4.py -- --build             # build + save .blend only (check layout)
  Blender -b -P den_build_v4.py -- --skytest           # 4 quick renders of the city view at 0/90/180/270
  Blender -b -P den_build_v4.py -- --preview           # 960x540, curtains open
  Blender -b -P den_build_v4.py -- --final             # 1920x1080, curtains open
  Blender -b -P den_build_v4.py -- --final --closed    # curtains closed
  Blender -b -P den_build_v4.py -- --final --fanblur   # fan region only, motion-blurred blades (cheap)
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
SCREEN = "--screen" in ARGS             # motorised screen down + projection layer (render with --closed)
SKYTEST = "--skytest" in ARGS
TAG = MODE + ("_closed" if CLOSED else "") + ("_screen" if SCREEN else "") + ("_fan" if FANBLUR else "")
BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "out_den")
MODELS = os.path.join(BASE, "models")
os.makedirs(OUT, exist_ok=True)
random.seed(21)
rad = math.radians

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
VL = scene.view_layers[0]
ROOT = bpy.data.collections.new("Den")
scene.collection.children.link(ROOT)

# ---------------------------------------------------------------- plan  (v4: wide + shallow + enclosed; back wall = desk nook | screen niche | column; deep tray ceiling)
# x across (0 = left shelving wall, W = right curtain wall), y into the room (D = back wall plane), z up
W, D = 6.8, 5.6
H, HT = 2.8, 3.1                        # bulkhead underside, raised central panel
TRAY = dict(x0=0.8, x1=6.0, y0=0.8, y1=D - 0.8)
NOOK = dict(x0=0.0, x1=1.75, back=D + 0.75)            # recessed desk bay, back-left
NICHE = dict(x0=2.25, x1=6.05, back=D + 0.18)          # screen niche, recessed 180 mm
COLS = ((1.8, 2.25), (6.05, 6.45))                     # full-height slat columns either side of the niche
SCR = dict(x0=2.65, x1=5.65, y=D + 0.1, z_top=2.4, z_bot=0.7)   # ~3 m wide motorised screen
WIN = (1.0, D - 1.2)                    # window on the right wall, hidden when the curtains close
AC = (5.55, 0.4)                        # cassette in the front bulkhead
PJ = (4.15, 2.85)                       # projector hangs from the central panel above the coffee table
PROJ_ROT = rad(180)
SOFA = (3.9, 1.75)
SOFA_ROT = rad(180)                          # main run parallel to the screen, chaise toward the screen; try rad(180) or rad(90) if it faces wrong
LOUNGE_ROT = rad(143)                   # lounge chair now front-left, turned toward the screen
SPK_PICK = 1
SPK_ROT = 0.0
SKY_ROT = rad(float(next((a.split("=")[1] for a in ARGS if a.startswith("--skyrot=")), "90")))
SKY_SHIFT = 0.06

CIRCUITS = ["dn_general", "dn_cove", "dn_accent", "dn_rgb", "dn_bias", "dn_projection"]
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
    proj_image=emission("proj_image", 5.0),
    spk=principled("speaker_black", "#121212", 0.5),
    marble_b=principled("marble_black", "#1b1a19", 0.12, Coat_Weight=0.7),
    charcoal=principled("fabric_charcoal", "#3b3936", 0.95, Sheen_Weight=0.5),
    panel=principled("screen_wall_panel", "#17181b", 0.7),
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
# den mood: dark walls + ceiling, dark timber floor, charcoal shag rug, charcoal drapes (reference is a dark media room)
MAT["wall"] = principled("den_wall", "#2a2623", 0.85)
MAT["ceiling"] = principled("den_ceiling", "#36322f", 0.9)
MAT["floor"] = principled("den_floor", "#2b211a", 0.35, Coat_Weight=0.2)
MAT["rug"] = principled("den_rug", "#34312e", 1.0, Sheen_Weight=0.8)
MAT["drape"] = principled("den_drape", "#1d1c1e", 0.95, Sheen_Weight=0.4)
MAT["sheer"] = principled("den_sheer", "#3a3836", 0.9, Transmission_Weight=0.3)
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
    for p in (f"{prefix}*.glb", f"{prefix}*.gltf", f"{prefix}*/*.glb", f"{prefix}*/*.gltf", f"{prefix}*/**/*.gltf", f"{prefix}*/**/*.fbx"):
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
    if path.lower().endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=path)
    else:
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

# ---------------------------------------------------------------- shell: enclosed on four sides, deep tray ceiling (800 mm bulkhead, 300 mm drop), cove at the inner edge
DB = NOOK["back"] + 0.05
boxb("floor", 0, W, 0, DB, -0.1, 0, MAT["floor"])
boxb("wall_front", 0, W, -0.2, 0, 0, HT, MAT["wall"])
boxb("wall_left", -0.2, 0, 0, DB, 0, HT, MAT["wall"])
boxb("wall_right", W, W + 0.2, 0, DB, 0, HT, MAT["wall"])
boxb("wall_back_nook", NOOK["x0"], NOOK["x1"], NOOK["back"], NOOK["back"] + 0.2, 0, HT, MAT["wall"])
boxb("nook_side", NOOK["x1"], COLS[0][0], D, NOOK["back"] + 0.2, 0, HT, MAT["wall"])
boxb("wall_back_mid", COLS[0][0], NICHE["x0"], D, D + 0.2, 0, HT, MAT["wall"])
boxb("niche_back", NICHE["x0"], NICHE["x1"], NICHE["back"], NICHE["back"] + 0.2, 0, HT, MAT["panel"])
for k, x in enumerate((NICHE["x0"], NICHE["x1"])):
    boxb(f"niche_return_{k}", x - 0.01, x + 0.01, D, NICHE["back"], 0, HT, MAT["panel"])
boxb("wall_back_right", NICHE["x1"], W, D, D + 0.2, 0, HT, MAT["wall"])
for nm, x0, x1, y0, y1 in (("l", 0, TRAY["x0"], 0, DB), ("r", TRAY["x1"], W, 0, DB),
                           ("f", TRAY["x0"], TRAY["x1"], 0, TRAY["y0"]), ("b", TRAY["x0"], TRAY["x1"], TRAY["y1"], DB)):
    boxb(f"bulkhead_{nm}", x0, x1, y0, y1, H, H + 0.3, MAT["ceiling"])
boxb("ceiling_panel", TRAY["x0"], TRAY["x1"], TRAY["y0"], TRAY["y1"], HT, HT + 0.1, MAT["ceiling"])
for nm, x0, x1, y0, y1 in (("l", TRAY["x0"] - 0.02, TRAY["x0"], TRAY["y0"], TRAY["y1"]), ("r", TRAY["x1"], TRAY["x1"] + 0.02, TRAY["y0"], TRAY["y1"]),
                           ("f", TRAY["x0"], TRAY["x1"], TRAY["y0"] - 0.02, TRAY["y0"]), ("b", TRAY["x0"], TRAY["x1"], TRAY["y1"], TRAY["y1"] + 0.02)):
    boxb(f"tray_side_{nm}", x0, x1, y0, y1, H + 0.3, HT, MAT["ceiling"])
for nm, x0, x1, y0, y1 in (("l", TRAY["x0"] + 0.04, TRAY["x0"] + 0.08, TRAY["y0"], TRAY["y1"]),
                           ("f", TRAY["x0"], TRAY["x1"], TRAY["y0"] + 0.04, TRAY["y0"] + 0.08), ("b", TRAY["x0"], TRAY["x1"], TRAY["y1"] - 0.08, TRAY["y1"] - 0.04)):
    strip(f"cove_{nm}", x0, x1, y0, y1, H + 0.3, H + 0.32, "dn_cove", 22, down=False)
strip("rgb_tray", TRAY["x1"] - 0.08, TRAY["x1"] - 0.04, TRAY["y0"], TRAY["y1"], H + 0.3, H + 0.32, "dn_rgb", 24, down=False)
DLS = [(1.4, 0.4), (2.9, 0.4), (4.3, 0.4), (0.55, 1.6), (0.55, 3.0), (0.55, 4.3), (6.2, 1.6), (6.2, 3.2), (2.0, D - 0.4), (4.15, D - 0.4), (6.2, D - 0.4)]
for k, (x, y) in enumerate(DLS):
    downlight(f"dl_general_{k}", x, y, H, "dn_general", 55, 55)

# ---------------------------------------------------------------- screen niche: slat columns, RGB reveals, ~3 m screen with bias glow, 3.5 m floating console, tower speakers
for k, (x0, x1) in enumerate(COLS):
    boxb(f"col_{k}_core", x0, x1, D - 0.06, D, 0, H, MAT["walnut"])
    for j in range(int((x1 - x0) / 0.075)):
        x = x0 + 0.04 + j * 0.075
        boxb(f"col_{k}_slat_{j}", x - 0.017, x + 0.017, D - 0.1, D - 0.06, 0, H, MAT["walnut"])
for k, x in enumerate((NICHE["x0"] + 0.03, NICHE["x1"] - 0.03)):
    boxb(f"rgb_reveal_{k}", x - 0.012, x + 0.012, NICHE["back"] - 0.02, NICHE["back"], 0, H, MAT["led"], group="dn_rgb")
    light(f"rgb_reveal_{k}_light", "AREA", 34, (x, NICHE["back"] - 0.04, H / 2), "dn_rgb", size=(0.04, H), rot=(-math.pi / 2, 0, 0))
X0, X1 = SCR["x0"], SCR["x1"]
BY = NICHE["back"] - 0.015
for nm, (x0, x1, z0, z1) in (("t", (X0 - 0.06, X1 + 0.06, SCR["z_top"] + 0.02, SCR["z_top"] + 0.04)), ("b", (X0 - 0.06, X1 + 0.06, SCR["z_bot"] - 0.08, SCR["z_bot"] - 0.06)),
                            ("l", (X0 - 0.08, X0 - 0.06, SCR["z_bot"] - 0.08, SCR["z_top"] + 0.04)), ("r", (X1 + 0.06, X1 + 0.08, SCR["z_bot"] - 0.08, SCR["z_top"] + 0.04))):
    boxb(f"bias_{nm}", x0, x1, BY - 0.005, BY, z0, z1, MAT["led"], group="dn_bias")
    light(f"bias_{nm}_light", "AREA", 14 * max(x1 - x0, z1 - z0), ((x0 + x1) / 2, BY - 0.01, (z0 + z1) / 2), "dn_bias",
          size=(max(x1 - x0, 0.03), max(z1 - z0, 0.03)), rot=(-math.pi / 2, 0, 0))
boxb("screen_case", X0 - 0.12, X1 + 0.12, SCR["y"] - 0.07, SCR["y"] + 0.06, SCR["z_top"] + 0.04, SCR["z_top"] + 0.16, MAT["metal"], 0.006)
if SCREEN:
    boxb("screen_fabric", X0, X1, SCR["y"] - 0.004, SCR["y"] + 0.004, SCR["z_bot"], SCR["z_top"] + 0.04, MAT["ceramic_w"])
    boxb("screen_bar", X0 - 0.02, X1 + 0.02, SCR["y"] - 0.018, SCR["y"] + 0.018, SCR["z_bot"] - 0.03, SCR["z_bot"], MAT["metal"])
    boxb("screen_image", X0 + 0.04, X1 - 0.04, SCR["y"] - 0.0062, SCR["y"] - 0.0058, SCR["z_bot"] + 0.04, SCR["z_top"] - 0.02, MAT["proj_image"], group="dn_projection")
    light("projection_spill", "AREA", 80, ((X0 + X1) / 2, SCR["y"] - 0.06, (SCR["z_top"] + SCR["z_bot"]) / 2), "dn_projection",
          size=(X1 - X0, SCR["z_top"] - SCR["z_bot"]), rot=(-math.pi / 2, 0, 0))
CX0, CX1 = 2.4, 5.9
boxb("console", CX0, CX1, D - 0.27, NICHE["back"] - 0.02, 0.22, 0.5, MAT["walnut"], 0.006)
strip("console_glow", CX0 + 0.05, CX1 - 0.05, D - 0.23, D - 0.21, 0.205, 0.215, "dn_bias", 14)
boxb("media_player", 3.5, 3.95, D - 0.15, D + 0.07, 0.5, 0.56, MAT["metal"], 0.004)
boxb("soundbar", 3.7, 4.6, D - 0.2, D - 0.1, 0.5, 0.57, MAT["cloth"], 0.01)
SPKS = find_assets("speaker_tower", "den")
USED["speaker_tower"] = "model" if SPKS else "fallback"
SPK = ((2.03, D - 0.35), (6.25, D - 0.35))
for k, (x, y) in enumerate(SPK):
    if SPKS:
        sp = place_asset(f"tower_{k}", SPKS[0], x, y, 0.0, SPK_ROT, height=1.2, pick=SPK_PICK)
        for o in sp.instance_collection.all_objects:
            if o.type == "MESH" and not any("steel" in (m.name.lower() if m else "") for m in o.data.materials):
                o.data.materials.clear(); o.data.materials.append(MAT["spk"])
    else:
        boxb(f"tower_{k}", x - 0.13, x + 0.13, y - 0.16, y + 0.16, 0.04, 1.2, MAT["spk"], 0.01)
PROJS = find_assets("projector", "boardroom")
USED["projector"] = "model" if PROJS else "fallback"
PJ_Z = HT - 0.45
if PROJS:
    place_asset("projector", PROJS[0], PJ[0], PJ[1], HT, PROJ_ROT, height=0.6, top=True)
else:
    cyl("projector_drop", 0.025, 0.025, 0.35, (PJ[0], PJ[1], HT - 0.35), MAT["metal"], seg=12)
    boxb("projector_body", PJ[0] - 0.22, PJ[0] + 0.22, PJ[1] - 0.2, PJ[1] + 0.2, PJ_Z - 0.08, PJ_Z + 0.08, MAT["metal"], 0.01)
if SCREEN:
    cyl("projector_lens_glow", 0.035, 0.035, 0.005, (PJ[0], PJ[1] + 0.25, PJ_Z), MAT["led"], seg=24, rot=(-math.pi / 2, 0, 0), group="dn_projection")

# ---------------------------------------------------------------- desk nook (back-left bay): desk, monitor, keyboard, task chair, lit shelves above
NB = NOOK["back"]
boxb("desk_top", 0.1, 1.65, D + 0.08, NB - 0.02, 0.73, 0.76, MAT["walnut"], 0.004)
for k, x in enumerate((0.14, 1.61)):
    boxb(f"desk_leg_{k}", x - 0.02, x + 0.02, D + 0.1, NB - 0.04, 0, 0.73, MAT["metal"])
mx = 0.88
boxb("monitor_body", mx - 0.4, mx + 0.4, NB - 0.16, NB - 0.13, 0.98, 1.45, MAT["metal"], 0.004)
boxb("monitor_glass", mx - 0.38, mx + 0.38, NB - 0.162, NB - 0.16, 1.0, 1.43, MAT["screen"])
boxb("monitor_neck", mx - 0.02, mx + 0.02, NB - 0.12, NB - 0.08, 0.76, 1.0, MAT["metal"])
boxb("keyboard", mx - 0.25, mx + 0.25, D + 0.2, D + 0.35, 0.76, 0.775, MAT["metal"], 0.003)
for j, z in enumerate((1.6, 2.0, 2.4)):
    boxb(f"nook_shelf_{j}", 0.05, 1.7, NB - 0.28, NB, z, z + 0.03, MAT["walnut"])
    strip(f"nook_shelf_led_{j}", 0.1, 1.65, NB - 0.26, NB - 0.24, z - 0.012, z - 0.002, "dn_accent", 12)
    x = 0.12
    while x < 1.0:
        t = random.uniform(0.025, 0.04); h = random.uniform(0.18, 0.26)
        boxb(f"nook_book_{j}_{x:.2f}", x, x + t, NB - 0.24, NB - 0.04, z + 0.03, z + 0.03 + h, random.choice(BOOKS)); x += t + 0.003
    cyl(f"nook_vase_{j}", 0.05, 0.06, 0.18, (1.35, NB - 0.14, z + 0.03), MAT["ceramic_w" if j % 2 else "ceramic_b"], seg=32)
light("desk_task", "SPOT", 35, (mx, D + 0.35, H - 0.02), "dn_accent", target=(mx, D + 0.4, 0.76), spot=45)
TASKS = find_assets("chair_task", "office")
if TASKS:
    place_asset("desk_chair", TASKS[0], mx, D - 0.2, 0.0, rad(180), height=1.0)
plant("desk_plant", 1.45, D + 0.5, 0.35, z=0.76)

# ---------------------------------------------------------------- left wall: full-height built-in joinery, 420 mm deep: shelf bay | slat | recessed poster | slat | shelf bay | slat
boxb("left_wall_base", 0, 0.03, 0.3, D, 0, H, MAT["walnut"])
def slat_x(name, y0, y1):
    for k in range(int((y1 - y0) / 0.075)):
        y = y0 + 0.04 + k * 0.075
        boxb(f"{name}_{k}", 0.03, 0.42, y - 0.017, y + 0.017, 0, H, MAT["walnut"])
DEC = {k: find_assets(f"decor_{k}", "cabin") for k in ("globe", "modern_sculpture", "figure_8")}
rows = [0.5, 0.95, 1.4, 1.85, 2.3]
def shelf_unit(tag, y0, y1, kinds):
    boxb(f"{tag}_back", 0.03, 0.06, y0, y1, 0, H, MAT["panel"])
    for k, y in enumerate((y0, y1)):
        boxb(f"{tag}_side_{k}", 0.03, 0.42, y - 0.015, y + 0.015, 0, H, MAT["walnut"])
    for j, z in enumerate(rows):
        boxb(f"{tag}_board_{j}", 0.06, 0.42, y0, y1, z, z + 0.03, MAT["walnut"])
        strip(f"{tag}_led_{j}", 0.36, 0.38, y0 + 0.04, y1 - 0.04, z - 0.012, z - 0.002, "dn_accent", 14)
        light(f"{tag}_back_{j}", "AREA", 7, (0.08, (y0 + y1) / 2, z + 0.2), "dn_accent", size=(0.3, y1 - y0 - 0.08), rot=(0, math.pi / 2, 0))
        zb = z + 0.03; mid = (y0 + y1) / 2; kind = kinds[j]
        if kind == "books":
            y = y0 + 0.08
            while y < mid + 0.15:
                t = random.uniform(0.025, 0.04); h = random.uniform(0.2, 0.3)
                boxb(f"{tag}_book_{j}_{y:.2f}", 0.1, 0.32, y, y + t, zb, zb + h, random.choice(BOOKS)); y += t + 0.003
            cyl(f"{tag}_bowl_{j}", 0.05, 0.08, 0.05, (0.22, y1 - 0.2, zb), MAT["brass"], seg=32)
        elif kind == "vases":
            cyl(f"{tag}_vase_{j}_a", 0.05, 0.07, 0.24, (0.22, mid - 0.15, zb), MAT["ceramic_b"], seg=40)
            cyl(f"{tag}_vase_{j}_b", 0.04, 0.06, 0.16, (0.22, mid + 0.15, zb), MAT["ceramic_w"], seg=40)
        elif kind == "plant":
            plant(f"{tag}_plant_{j}", 0.22, mid, 0.32, z=zb)
        elif DEC.get(kind):
            place_asset(f"{tag}_decor_{j}", DEC[kind][0], 0.22, mid, zb, rad(random.uniform(-30, 30)), height=0.3)
        else:
            cyl(f"{tag}_decor_{j}", 0.05, 0.07, 0.24, (0.22, mid, zb), MAT["ceramic_w"], seg=40)
SX0, SX1 = 0.9, 2.0
slat_x("slatA", 0.3, SX0)
shelf_unit("shelfA", SX0, SX1, ("books", "figure_8", "vases", "books", "plant"))
slat_x("slatB", SX1, 2.35)
boxb("poster_recess", 0.0, 0.03, 2.35, 3.45, 0, H, MAT["panel"])
boxb("poster_frame", 0.03, 0.07, 2.45, 3.35, 0.95, 2.25, MAT["metal"], 0.004)
boxb("poster_canvas", 0.07, 0.075, 2.49, 3.31, 0.99, 2.21, MAT["art"])
light("accent_poster", "SPOT", 60, (0.85, 2.9, H - 0.02), "dn_accent", target=(0.07, 2.9, 1.6), spot=30)
slat_x("slatC", 3.45, 3.8)
shelf_unit("shelfB", 3.8, 4.9, ("vases", "books", "globe", "modern_sculpture", "books"))
slat_x("slatD", 4.9, D)

# ---------------------------------------------------------------- seating: large charcoal sectional (left foreground), 1.2 m round coffee table + ottoman on the screen axis, angled lounge chair (front right)
boxb("rug", 0.8, 6.2, 1.0, 4.9, 0, 0.012, MAT["rug"])
SOFAS = find_assets("sofa_sectional", "living")
USED["sofa_sectional"] = "model" if SOFAS else "fallback"
if SOFAS:
    place_asset("sofa", SOFAS[0], SOFA[0], SOFA[1], 0.0, SOFA_ROT, length=3.9)
else:
    boxb("sofa_run_seat", 0.95, 4.85, 1.3, 2.25, 0.05, 0.44, MAT["sofa"], 0.07)
    boxb("sofa_run_back", 0.95, 4.85, 1.3, 1.55, 0.4, 0.86, MAT["sofa"], 0.08)
    boxb("sofa_chaise", 0.95, 1.95, 2.25, 3.55, 0.05, 0.44, MAT["sofa"], 0.07)
CT = ((X0 + X1) / 2, 3.0)
cyl("coffee_top", 0.6, 0.6, 0.06, (CT[0], CT[1], 0.34), MAT["marble_b"], seg=72)
cyl("coffee_base", 0.5, 0.55, 0.34, (CT[0], CT[1], 0), MAT["marble_b"], seg=64)
rbox("coffee_book", CT[0] - 0.2, CT[1] + 0.1, 0.4, 0.3, 0.22, 0.04, rad(8), BOOKS[0], 0.004)
cyl("coffee_bowl", 0.08, 0.14, 0.08, (CT[0] + 0.2, CT[1] - 0.1, 0.4), MAT["ceramic_w"], seg=40)
POUFS = find_assets("pouf", "den")
USED["pouf"] = "model" if POUFS else "fallback"
if POUFS:
    pf = place_asset("pouf", POUFS[0], CT[0], 4.2, 0.0, rad(200), height=0.55)
    for o in pf.instance_collection.all_objects:
        if o.type == "MESH":
            o.data.materials.clear(); o.data.materials.append(MAT["charcoal"])
else:
    cyl("pouf", 0.38, 0.4, 0.42, (CT[0], 4.2, 0), MAT["charcoal"], seg=56)
LOUNGES = find_assets("chair_lounge", "den")
USED["chair_lounge"] = "model" if LOUNGES else "fallback"
if LOUNGES:
    place_asset("lounge_chair", LOUNGES[0], 1.05, 1.65, 0.0, LOUNGE_ROT, height=1.0)
else:
    rbox("lounge_seat", 1.05, 1.65, 0.0, 0.85, 0.85, 0.45, LOUNGE_ROT, MAT["sofa"], 0.1)
cyl("lounge_ottoman", 0.28, 0.28, 0.4, (1.45, 2.55, 0), MAT["charcoal"], seg=48)
cyl("side_table_top", 0.22, 0.22, 0.03, (1.75, 3.8, 0.55), MAT["metal"], seg=40)
cyl("side_table_stem", 0.03, 0.03, 0.55, (1.75, 3.8, 0), MAT["metal"], seg=16)
boxb("tablet_dock", 1.63, 1.87, 3.7, 3.9, 0.58, 0.6, MAT["metal"], 0.004)
boxb("tablet", 1.65, 1.85, 3.75, 3.76, 0.6, 0.76, MAT["screen"], 0.004)

# ---------------------------------------------------------------- right wall: solid, full-height curtain track (window behind it, hidden when closed), structural column at the back corner
boxb("column_r", COLS[1][1], W, D - 0.4, D, 0, H, MAT["wall"])
boxb("glass", W - 0.01, W, WIN[0], WIN[1], 0.35, H - 0.1, MAT["window"])
boxb("window_frame", W - 0.03, W - 0.01, WIN[0] - 0.05, WIN[1] + 0.05, 0.3, H - 0.05, MAT["metal"])
boxb("curtain_pocket", W - 0.45, W, 0.0, D - 0.4, H - 0.06, H, MAT["ceiling"])
CY = (0.2, D - 0.45)
if CLOSED:
    curtain_y("drape_closed", CY[0], CY[1], W - 0.3, 0.02, H - 0.06, MAT["drape"], 7.0, 0.05)
    curtain_y("sheer_closed", CY[0], CY[1], W - 0.14, 0.02, H - 0.06, MAT["sheer"], 9.0, 0.03)
else:
    curtain_y("drape_near", CY[0], WIN[0] - 0.1, W - 0.3, 0.02, H - 0.06, MAT["drape"], 14.0, 0.07)
    curtain_y("drape_far", WIN[1] + 0.1, CY[1], W - 0.3, 0.02, H - 0.06, MAT["drape"], 14.0, 0.07)
    curtain_y("sheer_far", WIN[1] - 1.0, WIN[1] + 0.1, W - 0.14, 0.02, H - 0.06, MAT["sheer"], 12.0, 0.04)
strip("rgb_curtain_head", W - 0.42, W - 0.39, CY[0], CY[1], H - 0.03, H - 0.02, "dn_rgb", 12)
plant("floor_plant_0", 0.6, 0.6, 1.5)

# ---------------------------------------------------------------- AC cassette in the front bulkhead, keypad on the right column, ceiling speakers in the bulkhead
cx, cy = AC; cz = H
boxb("ac_panel", cx - 0.42, cx + 0.42, cy - 0.38, cy + 0.38, cz - 0.03, cz, MAT["grille"], 0.01)
boxb("ac_grille", cx - 0.22, cx + 0.22, cy - 0.2, cy + 0.2, cz - 0.034, cz - 0.03, MAT["grille"])
for k in range(8):
    o = -0.18 + k * 0.05
    boxb(f"ac_grille_bar_{k}", cx - 0.21, cx + 0.21, cy + o - 0.004, cy + o + 0.004, cz - 0.037, cz - 0.034, MAT["grille_slot"])
KP = (COLS[1][1] - 0.012, D - 0.2)
boxb("keypad_plate", KP[0], KP[0] + 0.012, KP[1] - 0.06, KP[1] + 0.06, 1.14, 1.26, MAT["metal"], 0.003)
for k in range(4):
    z = 1.16 + k * 0.026
    boxb(f"keypad_btn_{k}", KP[0] - 0.002, KP[0], KP[1] - 0.02, KP[1] + 0.02, z, z + 0.012, MAT["keypad"], group="dn_accent")
for k, (x, y) in enumerate(((0.45, 2.2), (6.3, 2.4), (1.2, 0.4), (3.0, D - 0.4))):
    cyl(f"speaker_ceiling_{k}", 0.08, 0.08, 0.004, (x, y, H - 0.004), MAT["ceramic_w"], seg=40)
FAN_TOP = HT; FAN_Z = HT; fan_obj = None
USED["fan"] = "none (not in den brief)"

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

# ---------------------------------------------------------------- camera: front-left corner behind the sofa, 1.55 m, slight down tilt, aimed at the screen niche right of centre
cd = bpy.data.cameras.new("hero"); cd.sensor_fit = "VERTICAL"; cd.angle_y = rad(60.0); cd.clip_end = 5000
cam = bpy.data.objects.new("hero", cd); ROOT.objects.link(cam)
cam.location = (W - 0.5, 0.3, 1.55)
aim(cam, (3.6, D, 1.15)); scene.camera = cam

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
    "dn-general": (6.2, 3.2, H), "dn-cove": (3.4, TRAY["y1"], H + 0.3), "dn-accent": (0.25, (3.8 + 4.9) / 2, 1.6), "workstation": (mx, NB - 0.16, 1.2),
    "dn-rgb": (NICHE["x1"] - 0.03, NICHE["back"] - 0.02, 1.6), "dn-bias": ((CX0 + CX1) / 2, D - 0.22, 0.21),
    "screen": ((X0 + X1) / 2, SCR["y"], SCR["z_top"] + 0.1), "projector": (PJ[0], PJ[1], PJ_Z),
    "speakers": (SPK[1][0], SPK[1][1] - 0.15, 0.9), "media": (3.72, D - 0.15, 0.53),
    "curtains": (W - 0.3, 3.0, 1.6), "hvac": (AC[0], AC[1], H), "keypad": (KP[0], KP[1], 1.2),
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
fan_rect = [0, 0, 0, 0]
screen_rect = proj_rect([(x, SCR["y"], z) for x in (X0, X1) for z in (SCR["z_bot"] - 0.03, SCR["z_top"] + 0.04)], 0.0)
curtain_rect = proj_rect([(W - 0.3, y, z) for y in (CY[0], CY[1]) for z in (0.0, H)], 0.0)
with open(os.path.join(OUT, "hotspots.json"), "w") as f:
    json.dump({"camera": "hero", "points": spots, "screen_rect": screen_rect, "curtain_rect": curtain_rect,
               "rect_order": "u0, v0, u1, v1 (v down); screen drops from v0 to v1"}, f, indent=2)

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

TINT = {"dn_rgb": (0.25, 0.3, 1.0, 1.0), "dn_bias": (0.35, 0.15, 1.0, 1.0), "dn_projection": (1, 1, 1, 1),
        "dn_general": (0.3, 0.14, 0.05, 1.0), "dn_cove": (1.0, 0.42, 0.12, 1.0)}   # preview mood only; EXRs stay neutral   # preview only; the EXR stays white for the app to tint
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

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f"den_{TAG}.blend"))
print(f"[uniser] built den, mode={MODE}, closed={CLOSED}, fanblur={FANBLUR}, passes={written}")
print("[uniser] models:", " | ".join(f"{k}: {v}" for k, v in USED.items()), "| plants:", len(PLANTS))
print("[uniser] fan_rect:", fan_rect, "| screen_rect:", screen_rect, "| curtain_rect:", curtain_rect, "| hotspots not in view:", [k for k, s in spots.items() if not s["visible"]])

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
