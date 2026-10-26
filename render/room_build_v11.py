"""
Uniser SmartSpaces - Luxury Hotel Room
Builds the guest room in Blender and renders one linear EXR pass per lighting circuit.

  Blender -b -P room_build.py -- --preview            # 960x540, curtains open
  Blender -b -P room_build.py -- --preview --closed   # curtains closed (blackout)
  Blender -b -P room_build.py -- --final              # 1920x1080 + daylight, curtains open
  Blender -b -P room_build.py -- --final --closed     # second plate set, curtains closed
  Blender -b -P room_build.py -- --final --sheer      # third plate set, sheer drawn, blackout open
hotspots.json also carries the window quad in screen space so the app can animate the curtains as a wipe.

Assets in models/room/ (bed, nightstand, armchair, wall_lamp, floor_lamp) are used if present; plants from models/lobby.
"""

import bpy, bmesh, math, os, sys, json, random, glob
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MODE = "final" if "--final" in ARGS else "build" if "--build" in ARGS else "preview"
DAYLIGHT = MODE == "final" or "--daylight" in ARGS
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out_room")
os.makedirs(OUT, exist_ok=True)
random.seed(11)
rad = math.radians

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
VL = scene.view_layers[0]
ROOT = bpy.data.collections.new("Room")
scene.collection.children.link(ROOT)



# ---------------------------------------------------------------- plan
# x across (0 = left wall), y into the room (D = bed/window wall), z up
W, D, YF = 7.0, 5.0, 0.0
H, HT = 2.75, 3.05                     # ceiling, tray recess
TRAY = dict(x0=3.3, x1=6.6, y0=0.6, y1=4.5)
WY0, WY1 = 1.0, 4.7                   # window on the right wall (x = W)                      # window on the back wall
BED = (5.05, D - 1.15)
CLOSED = "--closed" in ARGS
SHEER = "--sheer" in ARGS and not CLOSED
TAG = MODE + ("_closed" if CLOSED else "_sheer" if SHEER else "")
CIRCUITS = ["rm_entry", "rm_bedside", "rm_reading", "rm_cove", "rm_bath", "rm_wardrobe", "rm_deco", "rm_night", "rm_tunable", "rm_dnd", "rm_service"]
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
        br = N.new("ShaderNodeTexBrick"); br.offset = 0.0
        setin(br, "Scale", 1.0); setin(br, "Mortar Size", 0.004); setin(br, "Mortar Smooth", 0.3)
        setin(br, "Brick Width", tiles); setin(br, "Row Height", tiles)
        L.new(tc.outputs["Object"], br.inputs["Vector"])
        mix = N.new("ShaderNodeMixRGB"); mix.inputs["Color2"].default_value = (*lin("#17140f"), 1)
        L.new(br.outputs["Fac"], mix.inputs["Fac"]); L.new(col, mix.inputs["Color1"]); col = mix.outputs["Color"]
        mr = N.new("ShaderNodeMapRange")
        mr.inputs["To Min"].default_value = rough; mr.inputs["To Max"].default_value = 0.6
        L.new(br.outputs["Fac"], mr.inputs["Value"]); L.new(mr.outputs["Result"], b.inputs["Roughness"])
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

def shadow_clear(m, tint="#ffffff"):
    """Lets light through glass for shadow rays, so lamps inside globes still light the room."""
    N = m.node_tree.nodes; L = m.node_tree.links
    out = next(n for n in N if n.type == "OUTPUT_MATERIAL")
    src = out.inputs["Surface"].links[0].from_socket
    lp = N.new("ShaderNodeLightPath"); tr = N.new("ShaderNodeBsdfTransparent")
    tr.inputs["Color"].default_value = (*lin(tint), 1)
    mx = N.new("ShaderNodeMixShader")
    L.new(lp.outputs["Is Shadow Ray"], mx.inputs[0]); L.new(src, mx.inputs[1]); L.new(tr.outputs[0], mx.inputs[2])
    L.new(mx.outputs[0], out.inputs["Surface"])
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

def city_material():
    m = principled("city_towers", "#1a2033", 0.6)
    nt = m.node_tree; N = nt.nodes; L = nt.links; b = N["Principled BSDF"]
    tc = N.new("ShaderNodeTexCoord"); sx = N.new("ShaderNodeSeparateXYZ"); add = N.new("ShaderNodeMath")
    cb = N.new("ShaderNodeCombineXYZ")
    L.new(tc.outputs["Object"], sx.inputs[0]); L.new(sx.outputs["X"], add.inputs[0]); L.new(sx.outputs["Y"], add.inputs[1])
    L.new(add.outputs[0], cb.inputs["X"]); L.new(sx.outputs["Z"], cb.inputs["Y"])
    br = N.new("ShaderNodeTexBrick"); br.offset = 0.0
    setin(br, "Color1", (0, 0, 0, 1)); setin(br, "Color2", (1, 1, 1, 1)); setin(br, "Mortar", (0, 0, 0, 1))
    setin(br, "Scale", 1.0); setin(br, "Mortar Size", 1.1); setin(br, "Brick Width", 3.2); setin(br, "Row Height", 4.0)
    L.new(cb.outputs[0], br.inputs["Vector"])
    cr = N.new("ShaderNodeValToRGB"); cr.color_ramp.interpolation = "CONSTANT"
    cr.color_ramp.elements[1].position = 0.9
    L.new(br.outputs["Color"], cr.inputs["Fac"])
    tint = N.new("ShaderNodeMixRGB"); tint.blend_type = "MULTIPLY"; tint.inputs["Fac"].default_value = 1
    tint.inputs["Color2"].default_value = (*lin("#ffd29a"), 1)
    L.new(cr.outputs["Color"], tint.inputs["Color1"])
    L.new(tint.outputs["Color"], b.inputs["Emission Color"]); setin(b, "Emission Strength", 1.4)
    return m


def water_wall():
    m = bpy.data.materials.new("water_wall"); m.use_nodes = True
    N = m.node_tree.nodes; L = m.node_tree.links; N.clear()
    out = N.new("ShaderNodeOutputMaterial"); em = N.new("ShaderNodeEmission")
    tc = N.new("ShaderNodeTexCoord"); mp = N.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (6.0, 6.0, 0.35)
    nz = N.new("ShaderNodeTexNoise"); setin(nz, "Scale", 3.0); setin(nz, "Detail", 6.0); setin(nz, "Distortion", 1.5)
    cr = N.new("ShaderNodeValToRGB"); e = cr.color_ramp.elements
    e[0].position = 0.35; e[0].color = (*lin("#020a24"), 1); e[1].position = 0.8; e[1].color = (*lin("#2f74ff"), 1)
    L.new(tc.outputs["Object"], mp.inputs["Vector"]); L.new(mp.outputs[0], nz.inputs["Vector"])
    L.new(nz.outputs["Fac"], cr.inputs["Fac"]); L.new(cr.outputs["Color"], em.inputs["Color"])
    em.inputs["Strength"].default_value = 6.5; L.new(em.outputs[0], out.inputs["Surface"])
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

MAT = dict(
    floor=procedural("marble_floor", [(0.0, "#8f877c"), (0.48, "#a69d91"), (0.5, "#6f675d"), (0.52, "#a69d91"), (1.0, "#988f84")],
                     0.22, scale=0.75, distortion=3.0, detail=10, coat=0.22, tiles=1.2),
    desk=procedural("marble_dark", [(0.0, "#141210"), (0.48, "#2a2622"), (0.5, "#8c8174"), (0.52, "#2a2622"), (1.0, "#171513")],
                    0.12, scale=0.5, distortion=4.0, detail=10, coat=0.6),
    plaster=procedural("plaster_wall", [(0.0, "#2c241d"), (1.0, "#382e25")], 0.85, scale=3.0, bump=0.06),
    ceiling=procedural("ceiling_plaster", [(0.0, "#4a4036"), (1.0, "#564a3e")], 0.9, scale=2.0, bump=0.04),
    stone=procedural("travertine", [(0.0, "#9c8a70"), (0.5, "#c2ad8e"), (1.0, "#ad9878")], 0.4,
                     scale=1.5, mscale=(1.4, 1.4, 9.0), distortion=1.5, bump=0.05),
    walnut=procedural("walnut", [(0.0, "#24170e"), (0.6, "#3c2818"), (1.0, "#4a3220")], 0.45,
                      kind="wave", scale=4.0, distortion=7.0, detail=4, coat=0.2),
    rug=procedural("rug", [(0.0, "#141b2c"), (0.45, "#223052"), (0.55, "#7c6a4a"), (0.62, "#223052"), (1.0, "#0f1424")],
                   0.95, scale=0.9, distortion=6.0, detail=3),
    paving=procedural("paving", [(0.0, "#3a3732"), (1.0, "#4a463f")], 0.6, scale=1.0, tiles=1.5),
    canvas=procedural("art_canvas", [(0.0, "#0d0d0d"), (0.5, "#5a5650"), (1.0, "#e6e1d8")], 0.8, scale=1.8, distortion=8.0, detail=12),
    timber_dark=principled("timber_dark", "#21160e", 0.7),
    brass=principled("brass", "#b08d4f", 0.28, 1.0),
    metal=principled("black_metal", "#1b1917", 0.4, 0.8),
    cream=principled("fabric_cream", "#cbbfae", 0.9, Sheen_Weight=0.5, Sheen_Roughness=0.6),
    caramel=principled("fabric_caramel", "#7a5232", 0.75, Sheen_Weight=0.4),
    green=principled("fabric_green", "#2c3b2c", 0.9, Sheen_Weight=0.5),
    china=principled("china", "#f2efe8", 0.3),
    marble_top=principled("marble_top", "#2b2723", 0.1, Coat_Weight=0.8),
    globe=shadow_clear(principled("clear_globe", "#ffffff", 0.02, Transmission_Weight=1.0, IOR=1.45), "#fff4e0"),
    leaf=principled("foliage", "#2d4626", 0.45, Subsurface_Weight=0.15),
    trunk=principled("palm_trunk", "#4a3b2c", 0.9),
    window=window_glass(),
    shade=lamp_shade(),
    city=city_material(),
    water=water_wall(),
    skycard=day_sky_card(),
    led=emission("led_strip", 30.0),
    led_cove=emission("led_cove", 110.0),
    lens=emission("downlight_lens", 25.0),
    filament=emission("filament", 220.0),
)

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

def boxb(name, x0, x1, y0, y1, z0, z1, mat, col=None, bevel=0.0, group=None):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))), verts=bm.verts)
    ob = finish(name, bm, mat, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), col=col)
    if bevel:
        m = ob.modifiers.new("bevel", "BEVEL"); m.width = bevel; m.segments = 3; m.limit_method = "ANGLE"
    if group:
        ob.lightgroup = group
    return ob

def cyl(name, r_bottom, r_top, h, base, mat, seg=32, caps=True, col=None, rot=(0, 0, 0), group=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, segments=seg, radius1=r_bottom, radius2=r_top, depth=h,
                          matrix=Matrix.Translation((0, 0, h / 2)))
    ob = finish(name, bm, mat, base, rot, col, smooth=lambda f: abs(f.normal.z) < 0.7)
    if group:
        ob.lightgroup = group
    return ob

def sphere(name, r, loc, mat, seg=32, col=None, group=None):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=r)
    ob = finish(name, bm, mat, loc, col=col, smooth=lambda f: True)
    if group:
        ob.lightgroup = group
    return ob

def modifiers(ob, solidify=0.0, subsurf=0, bevel=0.0):
    if bevel:
        m = ob.modifiers.new("bevel", "BEVEL"); m.width = bevel; m.segments = 3; m.limit_method = "ANGLE"
    if solidify:
        m = ob.modifiers.new("solidify", "SOLIDIFY"); m.thickness = solidify; m.offset = 0
    if subsurf:
        m = ob.modifiers.new("subsurf", "SUBSURF"); m.levels = subsurf; m.render_levels = subsurf
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

def source(name):
    return bpy.data.collections.new(name)  # not linked: only used through instances

def instance(name, col, loc, rotz=0.0):
    e = bpy.data.objects.new(name, None)
    e.instance_type = "COLLECTION"; e.instance_collection = col
    e.location = loc; e.rotation_euler = (0, 0, rotz)
    ROOT.objects.link(e)
    return e

def rrect(cx, cy, w, h, r, seg=12):
    pts = []
    for (ox, oy, a0) in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for i in range(seg + 1):
            a = rad(a0 + 90 * i / seg)
            pts.append((cx + ox + r * math.cos(a), cy + oy + r * math.sin(a)))
    return pts


# ---------------------------------------------------------------- helpers for rotated furniture
def rbox(name, cx, cy, z0, w, d, h, ang, mat, bevel=0.0, group=None):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((w, d, h)), verts=bm.verts)
    ob = finish(name, bm, mat, loc=(cx, cy, z0 + h / 2), rot=(0, 0, ang))
    if bevel:
        modifiers(ob, bevel=bevel)
    if group:
        ob.lightgroup = group
    return ob

def local(cx, cy, ang, lx, ly):
    c, s = math.cos(ang), math.sin(ang)
    return cx + lx * c - ly * s, cy + lx * s + ly * c

def tag(ob, group):
    ob.lightgroup = group
    return ob



# ---------------------------------------------------------------- planting
def leaf_mesh():
    bm = bmesh.new(); rows = []
    for i in range(9):
        t = i / 8; L, Wd = 0.34, 0.15
        half = 0.5 * Wd * math.sin(math.pi * min(1.0, t * 1.08)) + 0.004
        z = -0.35 * L * t * t
        rows.append([bm.verts.new((t * L, s * half, z + (0.012 if s == 0 else 0))) for s in (-1, 0, 1)])
    for i in range(8):
        for k in range(2):
            bm.faces.new((rows[i][k], rows[i + 1][k], rows[i + 1][k + 1], rows[i][k + 1]))
    for f in bm.faces:
        f.smooth = True
    me = bpy.data.meshes.new("leaf"); bm.to_mesh(me); bm.free(); me.materials.append(MAT["leaf"])
    return me

LEAF = leaf_mesh()

def plant(name, x, y, height, spread):
    cyl(f"{name}_pot", 0.2, 0.26, 0.55, (x, y, 0), MAT["timber_dark"], seg=40)
    cyl(f"{name}_soil", 0.24, 0.24, 0.01, (x, y, 0.53), MAT["walnut"], seg=32)
    stems = 3
    for s in range(stems):
        ox, oy = math.cos(s * 2.1) * 0.05, math.sin(s * 2.1) * 0.05
        sh = height * (0.75 + 0.25 * ((s * 7) % 3) / 2)
        cyl(f"{name}_stem_{s}", 0.014, 0.01, sh - 0.55, (x + ox, y + oy, 0.55), MAT["walnut"], seg=8, rot=(ox * 1.5, -oy * 1.5, 0))
        n = int(26 * height / 1.8)
        for i in range(n):
            t = 0.25 + 0.75 * i / n
            zz = 0.55 + (sh - 0.55) * t
            yaw = i * 2.39996 + s
            pitch = rad(random.uniform(10, 45))
            ob = bpy.data.objects.new(f"{name}_leaf_{s}_{i}", LEAF)
            ob.location = (x + ox * (1 + t * 3), y + oy * (1 + t * 3), zz)
            ob.rotation_euler = (random.uniform(-0.3, 0.3), -pitch, yaw)
            sc = spread * random.uniform(0.75, 1.15) * (1.15 - 0.4 * t)
            ob.scale = (sc, sc, sc)
            ROOT.objects.link(ob)




# ---------------------------------------------------------------- real assets (models/lobby/*), used automatically if present
ASSET_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "room")
_ASSETS = {}

def find_assets(prefix):
    out = []
    for p in (f"{prefix}*.glb", f"{prefix}*.gltf", f"{prefix}*/*.glb", f"{prefix}*/*.gltf", f"{prefix}*/**/*.gltf"):
        out += glob.glob(os.path.join(ASSET_DIR, p), recursive=True)
    return sorted(set(out))

def load_asset(path):
    if path in _ASSETS:
        return _ASSETS[path]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in new if o.type == "MESH" for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    coll = bpy.data.collections.new("asset_" + os.path.basename(path))
    for o in new:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
    coll.instance_offset = ((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z)
    _ASSETS[path] = (coll, mx - mn)
    print("[uniser] asset", os.path.basename(path), tuple(round(v, 2) for v in (mx - mn)))
    return _ASSETS[path]

def place_asset(name, path, x, y, z=0.0, ang=0.0, height=None, length=None, face=math.pi):
    coll, size = load_asset(path)
    sc = height / max(size.z, 1e-4) if height else length / max(size.x, size.y, 1e-4)
    e = bpy.data.objects.new(name, None); e.instance_type = "COLLECTION"; e.instance_collection = coll
    e.location = (x, y, z); e.rotation_euler = (0, 0, ang + face); e.scale = (sc, sc, sc); ROOT.objects.link(e)
    return e

def _seed(name):
    return sum(map(ord, name))

PLANTS = find_assets("plant_") or sorted(set(glob.glob(os.path.join(os.path.dirname(ASSET_DIR), "lobby", "plant_*", "**", "*.gltf"), recursive=True)))
if PLANTS:
    def plant(name, x, y, h=2.0, *a, **k):
        place_asset(name, PLANTS[_seed(name) % len(PLANTS)], x, y, 0.0, rad(_seed(name) * 37 % 360), height=h * 1.05, face=0)
def palm(name, x, y, h):
    lean = random.uniform(-0.08, 0.08)
    cyl(f"{name}_trunk", 0.24, 0.15, h, (x, y, -0.05), MAT["trunk"], seg=16, rot=(lean, lean * 0.5, 0))
    top = (x + math.sin(lean * 0.5) * h, y - math.sin(lean) * h, h - 0.1)
    for i in range(14):
        ob = bpy.data.objects.new(f"{name}_frond_{i}", LEAF)
        ob.location = top
        ob.rotation_euler = (random.uniform(-0.2, 0.2), rad(random.uniform(-15, 35)), i * 2.39996)
        s = random.uniform(8.0, 10.5); ob.scale = (s, s * 0.8, s)
        ROOT.objects.link(ob)
    light(f"{name}_uplight", "SPOT", 480, (x - 0.8, y, 0.05), "ca_facade", target=top, spot=30, blend=0.5)




MAT["flower_w"] = principled("flower_white", "#efe9df", 0.6, Subsurface_Weight=0.2)
MAT["flower_b"] = principled("flower_blush", "#d49b8e", 0.6, Subsurface_Weight=0.2)
MAT["leather"] = principled("luggage_leather", "#3b2416", 0.5)
frng = random.Random(21)

def sofa_straight(name, cx, cy, ang, L=2.4, mat=None):
    mat = mat or MAT["cream"]
    rbox(f"{name}_seat", cx, cy, 0.0, L, 0.95, 0.42, ang, mat, bevel=0.05)
    bx, by = local(cx, cy, ang, 0, -0.4)
    rbox(f"{name}_back", bx, by, 0.38, L, 0.22, 0.45, ang, mat, bevel=0.06)
    for sd in (-1, 1):
        ax, ay = local(cx, cy, ang, sd * (L / 2 - 0.09), 0)
        rbox(f"{name}_arm_{sd}", ax, ay, 0.0, 0.18, 0.95, 0.62, ang, mat, bevel=0.05)
    for k, lx in enumerate((-L / 3, 0, L / 3)):
        px, py = local(cx, cy, ang, lx, -0.2)
        rbox(f"{name}_cushion_{k}", px, py, 0.42, 0.45, 0.14, 0.4, ang, MAT["caramel"] if k != 1 else MAT["green"], bevel=0.06)


SOFAS = find_assets("sofa")
if SOFAS:
    def sofa_straight(name, cx, cy, ang, L=2.4, mat=None):
        place_asset(name, SOFAS[_seed(name) % len(SOFAS)], cx, cy, 0.0, ang, length=L)
def flowers(name, x, y, z, r=0.32, vase_h=0.32):
    cyl(f"{name}_vase", r * 0.38, r * 0.3, vase_h, (x, y, z), MAT["desk"], seg=32)
    top = z + vase_h
    for i in range(30):
        a = frng.random() * 2 * math.pi; e = frng.random() * 1.2; rr = r * (0.4 + 0.6 * frng.random())
        p = (x + math.cos(a) * math.cos(e) * rr, y + math.sin(a) * math.cos(e) * rr, top + 0.05 + math.sin(e) * rr * 0.9)
        sphere(f"{name}_bloom_{i}", r * frng.uniform(0.16, 0.24), p, MAT["flower_w"] if i % 3 else MAT["flower_b"], seg=12)
    for i in range(16):
        a = frng.random() * 2 * math.pi; rr = r * 0.9
        ob = sphere(f"{name}_leaf_{i}", r * 0.22, (x + math.cos(a) * rr, y + math.sin(a) * rr, top + frng.uniform(0.0, 0.25)), MAT["leaf"], seg=8)
        ob.scale = (1.0, 0.45, 0.25); ob.rotation_euler = (0, frng.uniform(-0.5, 0.5), a)



MAT["oak"] = procedural("oak_floor", [(0.0, "#5a3d27"), (0.5, "#6c4a30"), (1.0, "#7b5638")], 0.4, scale=1.5, mscale=(14.0, 0.5, 1.0), distortion=1.0, detail=6, coat=0.12)
MAT["marble_wall"] = procedural("marble_wall", [(0.0, "#8f877d"), (0.47, "#b9b1a5"), (0.5, "#6d655c"), (0.53, "#b9b1a5"), (1.0, "#a39b90")],
                                0.25, scale=0.6, distortion=4.0, detail=10, coat=0.3)
MAT["wall_warm"] = principled("wall_warm", "#857565", 0.85)
MAT["taupe"] = principled("fabric_taupe", "#8c7a66", 0.85, Sheen_Weight=0.5)
MAT["olive"] = principled("fabric_olive", "#3f4630", 0.85, Sheen_Weight=0.4)
MAT["linen"] = principled("linen", "#e9e4da", 0.8, Sheen_Weight=0.4)
MAT["sheer"] = principled("sheer", "#efe7da", 0.7, Alpha=0.45)
MAT["blackout"] = principled("blackout", "#5b4a3a", 0.9, Sheen_Weight=0.5)
MAT["mirror"] = principled("mirror", "#ffffff", 0.02, 1.0)
MAT["water_out"] = principled("bay_water", "#0b1626", 0.05)
MAT["screen"] = principled("tablet_screen", "#05070c", 0.2, Emission_Color=(*lin("#4a6cff"), 1), Emission_Strength=2.0)
MAT["dnd_red"] = principled("dnd_red", "#1a0202", 0.4, Emission_Color=(*lin("#ff2a1a"), 1), Emission_Strength=5.0)
MAT["svc_green"] = principled("svc_green", "#021a06", 0.4, Emission_Color=(*lin("#20e060"), 1), Emission_Strength=5.0)

def strip(name, x0, x1, y0, y1, z0, z1, group, watts_per_m, down=True):
    boxb(name, x0, x1, y0, y1, z0, z1, MAT["led"], group=group)
    L = max(x1 - x0, y1 - y0)
    light(f"{name}_light", "AREA", watts_per_m * L, ((x0 + x1) / 2, (y0 + y1) / 2, z0 - 0.01 if down else z1 + 0.01), group,
          size=(max(x1 - x0, 0.04), max(y1 - y0, 0.04)), rot=None if down else (math.pi, 0, 0))

def downlight(name, x, y, z, group, watts=40, spot=55):
    cyl(f"{name}_lens", 0.05, 0.05, 0.01, (x, y, z - 0.01), MAT["lens"], seg=24, group=group)
    light(name, "SPOT", watts, (x, y, z - 0.03), group, spot=spot, blend=0.6, radius=0.03)

def curtain(name, x0, x1, y, z0, z1, mat, folds_per_m=6.0, amp=0.05):
    bm = bmesh.new(); n = max(12, int((x1 - x0) * folds_per_m * 6)); rows = []
    for i in range(n + 1):
        t = i / n; x = x0 + (x1 - x0) * t
        yy = y + amp * math.sin(t * (x1 - x0) * folds_per_m * 2 * math.pi)
        rows.append((bm.verts.new((x, yy, z0)), bm.verts.new((x, yy, z1))))
    for i in range(n):
        bm.faces.new((rows[i][0], rows[i + 1][0], rows[i + 1][1], rows[i][1]))
    return finish(name, bm, mat, smooth=lambda f: True)

def asset_or(name, prefix, x, y, z=0.0, ang=0.0, height=None, length=None, face=0.0):
    found = find_assets(prefix)
    if found:
        return place_asset(name, found[0], x, y, z, ang, height=height, length=length, face=face)
    return None

# ---------------------------------------------------------------- shell  (corners: 1 = (0, D) back-left, 2 = (W, D) back-right, 3 = (W, 0) camera, 4 = (0, 0))
BX = BED[0]
boxb("floor", 0, W, YF, D, -0.1, 0, MAT["oak"])
boxb("wall_left", -0.2, 0, YF, D, 0, HT, MAT["wall_warm"])
boxb("wall_front", 0, W, YF - 0.2, YF, 0, HT, MAT["wall_warm"])
for k, (y0, y1) in enumerate(((YF, WY0), (WY1, D))):
    boxb(f"wall_right_{k}", W, W + 0.2, y0, y1, 0, HT, MAT["wall_warm"])
# back wall 1-2 with openings: wardrobe niche x 1.3-2.3, bathroom glass x 2.45-3.5
for k, (x0, x1) in enumerate(((0, 1.3), (2.3, 2.45), (3.5, W))):
    boxb(f"wall_back_{k}", x0, x1, D, D + 0.2, 0, HT, MAT["wall_warm"])
boxb("wall_back_over_ward", 1.3, 2.3, D, D + 0.2, 2.4, HT, MAT["wall_warm"])
for nm, x0, x1, y0, y1 in (("l", 0, TRAY["x0"], YF, D), ("r", TRAY["x1"], W, YF, D),
                           ("f", TRAY["x0"], TRAY["x1"], YF, TRAY["y0"]), ("b", TRAY["x0"], TRAY["x1"], TRAY["y1"], D)):
    boxb(f"ceiling_{nm}", x0, x1, y0, y1, H, H + 0.2, MAT["ceiling"])
boxb("ceiling_tray", TRAY["x0"], TRAY["x1"], TRAY["y0"], TRAY["y1"], HT, HT + 0.1, MAT["ceiling"])
for nm, x0, x1, y0, y1 in (("l", TRAY["x0"] - 0.02, TRAY["x0"], TRAY["y0"], TRAY["y1"]), ("r", TRAY["x1"], TRAY["x1"] + 0.02, TRAY["y0"], TRAY["y1"]),
                           ("f", TRAY["x0"], TRAY["x1"], TRAY["y0"] - 0.02, TRAY["y0"]), ("b", TRAY["x0"], TRAY["x1"], TRAY["y1"], TRAY["y1"] + 0.02)):
    boxb(f"tray_side_{nm}", x0, x1, y0, y1, H + 0.2, HT, MAT["ceiling"])
for nm, x0, x1, y0, y1 in (("l", TRAY["x0"] + 0.04, TRAY["x0"] + 0.08, TRAY["y0"], TRAY["y1"]), ("r", TRAY["x1"] - 0.08, TRAY["x1"] - 0.04, TRAY["y0"], TRAY["y1"]),
                           ("f", TRAY["x0"], TRAY["x1"], TRAY["y0"] + 0.04, TRAY["y0"] + 0.08), ("b", TRAY["x0"], TRAY["x1"], TRAY["y1"] - 0.08, TRAY["y1"] - 0.04)):
    strip(f"cove_{nm}", x0, x1, y0, y1, H + 0.2, H + 0.22, "rm_cove", 22, down=False)
light("marble_wash", "AREA", 160, (BX, D - 0.3, H - 0.03), "rm_cove", target=(BX, D, 1.2), size=(3.0, 0.12))

# ---------------------------------------------------------------- back wall 1-2: entry door + DND, wardrobe niche, bathroom behind glass
boxb("door", 0.1, 1.0, D - 0.03, D, 0, 2.2, MAT["walnut"])
boxb("door_frame", 0.04, 1.06, D - 0.04, D, 2.2, 2.26, MAT["metal"])
cyl("door_handle", 0.012, 0.012, 0.16, (0.88, D - 0.05, 1.02), MAT["brass"], seg=12, rot=(0, math.pi / 2, 0))
boxb("dnd_panel", 1.05, 1.25, D - 0.03, D, 0.95, 1.6, MAT["metal"], bevel=0.005)
cyl("dnd_light", 0.018, 0.018, 0.005, (1.15, D - 0.035, 1.36), MAT["dnd_red"], seg=24, rot=(math.pi / 2, 0, 0), group="rm_dnd")
light("dnd_glow", "POINT", 1.5, (1.15, D - 0.1, 1.36), "rm_dnd", radius=0.02).data.color = lin("#ff2a1a")
cyl("service_light", 0.018, 0.018, 0.005, (1.15, D - 0.035, 1.12), MAT["svc_green"], seg=24, rot=(math.pi / 2, 0, 0), group="rm_service")
light("service_glow", "POINT", 1.5, (1.15, D - 0.1, 1.12), "rm_service", radius=0.02).data.color = lin("#20e060")
cu = bpy.data.curves.new("room_number", "FONT"); cu.body = "101"; cu.size = 0.06; cu.extrude = 0.003; cu.align_x = "CENTER"
ob = bpy.data.objects.new("room_number", cu); ob.data.materials.append(MAT["brass"]); ob.location = (1.15, D - 0.035, 1.48)
ob.rotation_euler = (math.pi / 2, 0, 0); ROOT.objects.link(ob)
for k, (x, y) in enumerate(((0.6, D - 0.8), (1.8, D - 0.8))):
    downlight(f"dl_entry_{k}", x, y, H, "rm_entry", 45)
strip("entry_step", 0.1, 1.25, D - 0.04, D - 0.03, 0.18, 0.2, "rm_night", 6)

X0, X1 = 1.3, 2.3
boxb("ward_back", X0, X1, D + 0.6, D + 0.65, 0, 2.4, MAT["walnut"])
boxb("ward_top", X0, X1, D, D + 0.6, 2.3, 2.4, MAT["walnut"])
for nm, x0, x1 in (("l", X0 - 0.02, X0), ("r", X1, X1 + 0.02)):
    boxb(f"ward_side_{nm}", x0, x1, D, D + 0.65, 0, 2.4, MAT["walnut"])
for k, z in enumerate((0.05, 0.4, 0.8)):
    boxb(f"ward_shelf_{k}", X0, X0 + 0.45, D, D + 0.6, z, z + 0.03, MAT["walnut"])
    strip(f"ward_shelf_led_{k}", X0 + 0.02, X0 + 0.43, D + 0.02, D + 0.05, z + 0.32, z + 0.33, "rm_wardrobe", 15)
    boxb(f"towel_{k}", X0 + 0.04, X0 + 0.41, D + 0.1, D + 0.52, z + 0.03, z + 0.17, MAT["linen"], bevel=0.02)
cyl("ward_rail", 0.012, 0.012, 0.5, (X0 + 0.48, D + 0.32, 2.1), MAT["brass"], seg=12, rot=(0, math.pi / 2, 0))
cols = (MAT["linen"], MAT["metal"], MAT["taupe"], MAT["olive"])
for k in range(4):
    x = X0 + 0.55 + k * 0.11
    cyl(f"hanger_{k}", 0.004, 0.004, 0.36, (x, D + 0.14, 2.05), MAT["brass"], seg=6, rot=(math.pi / 2, 0, 0))
    boxb(f"garment_{k}", x - 0.025, x + 0.025, D + 0.12, D + 0.52, 0.75 if k == 0 else 1.0, 2.03, cols[k], bevel=0.015)
strip("ward_led_top", X0 + 0.02, X1 - 0.02, D + 0.02, D + 0.05, 2.26, 2.28, "rm_wardrobe", 25)

B0, B1, BD = 2.45, 3.5, D + 2.0       # bathroom behind the back wall
boxb("bath_floor", B0, B1, D, BD, 0, 0.01, MAT["marble_wall"])
boxb("bath_wall_back", B0 - 0.3, B1 + 0.3, BD, BD + 0.05, 0, H, MAT["marble_wall"])
boxb("bath_wall_l", B0 - 0.05, B0, D, BD, 0, H, MAT["marble_wall"])
boxb("bath_wall_r", B1, B1 + 0.05, D, BD, 0, H, MAT["marble_wall"])
boxb("bath_ceiling", B0, B1, D, BD, H, H + 0.1, MAT["ceiling"])
boxb("partition_glass", B0, B1, D, D + 0.02, 0, H, MAT["window"])
for x in (B0, B1):
    boxb(f"partition_mullion_{x}", x - 0.02, x + 0.02, D - 0.01, D + 0.03, 0, H, MAT["metal"])
boxb("vanity_cab", B0 + 0.05, B1 - 0.05, BD - 0.5, BD, 0.3, 0.82, MAT["walnut"])
boxb("vanity_top", B0, B1, BD - 0.55, BD, 0.82, 0.88, MAT["desk"])
cyl("basin", 0.2, 0.17, 0.14, ((B0 + B1) / 2, BD - 0.28, 0.88), MAT["china"], seg=40)
cyl("tap", 0.012, 0.012, 0.22, ((B0 + B1) / 2, BD - 0.05, 0.88), MAT["brass"], seg=12)
cyl("mirror", 0.38, 0.38, 0.02, ((B0 + B1) / 2, BD - 0.03, 1.6), MAT["mirror"], seg=64, rot=(math.pi / 2, 0, 0))
cyl("mirror_halo", 0.42, 0.42, 0.01, ((B0 + B1) / 2, BD - 0.01, 1.6), MAT["led"], seg=64, rot=(math.pi / 2, 0, 0), group="rm_bath")
light("mirror_glow", "AREA", 40, ((B0 + B1) / 2, BD - 0.15, 1.6), "rm_bath", target=((B0 + B1) / 2, D, 1.4), size=(0.8, 0.8))
strip("vanity_under", B0 + 0.1, B1 - 0.1, BD - 0.48, BD - 0.45, 0.27, 0.28, "rm_bath", 12)
downlight("dl_bath_0", (B0 + B1) / 2, D + 1.0, H, "rm_bath", 60)
plant("plant_bath", B1 - 0.2, BD - 0.3, 0.5, 0.4)

# ---------------------------------------------------------------- headboard zone on 1-2: marble, upholstered panel, bed, nightstands, wall lamps
boxb("marble_panel", 3.55, W, D - 0.04, D, 0, H, MAT["marble_wall"])
boxb("headboard_panel", BX - 1.3, BX + 1.3, D - 0.12, D - 0.04, 0.35, 1.7, MAT["taupe"], bevel=0.03)
boxb("rug", BX - 1.6, BX + 1.6, 1.4, D - 0.3, 0.0, 0.012, MAT["rug"])
if not asset_or("bed", "bed", BX, BED[1], 0.0, 0.0, length=2.25):
    boxb("bed_base", BX - 0.95, BX + 0.95, BED[1] - 1.05, BED[1] + 1.05, 0.0, 0.35, MAT["taupe"], bevel=0.03)
    boxb("mattress", BX - 0.93, BX + 0.93, BED[1] - 1.03, BED[1] + 1.03, 0.35, 0.6, MAT["linen"], bevel=0.06)
for k, x in enumerate((BX - 1.25, BX + 1.25)):
    if not asset_or(f"nightstand_{k}", "nightstand", x, D - 0.32, 0.0, 0.0, height=0.6):
        boxb(f"nightstand_{k}", x - 0.25, x + 0.25, D - 0.55, D - 0.1, 0.0, 0.6, MAT["walnut"], bevel=0.01)
    if not asset_or(f"wall_lamp_{k}", "wall_lamp", x, D - 0.2, 1.1, 0.0, height=0.5):
        cyl(f"wall_lamp_{k}_shade", 0.11, 0.1, 0.22, (x, D - 0.25, 1.3), MAT["shade"], seg=32, caps=False)
    light(f"bedside_{k}", "POINT", 22, (x, D - 0.25, 1.42), "rm_bedside", radius=0.05)
    sphere(f"bedside_{k}_bulb", 0.025, (x, D - 0.25, 1.42), MAT["filament"], seg=10, group="rm_bedside")
    rx = x + (0.35 if k == 0 else -0.35); px = BX - 0.5 if k == 0 else BX + 0.5
    light(f"reading_{k}", "SPOT", 45, (rx, D - 0.6, H - 0.03), "rm_reading", target=(px, D - 0.75, 0.75), spot=22, blend=0.35)
    cyl(f"reading_{k}_lens", 0.03, 0.03, 0.01, (rx, D - 0.6, H - 0.01), MAT["lens"], seg=16, group="rm_reading")
    strip(f"nightstand_{k}_under", x - 0.22, x + 0.22, D - 0.5, D - 0.48, 0.04, 0.05, "rm_night", 8)
for nm, x0, x1, y0, y1 in (("l", BX - 1.03, BX - 1.0, BED[1] - 1.0, BED[1] + 0.9), ("r", BX + 1.0, BX + 1.03, BED[1] - 1.0, BED[1] + 0.9),
                           ("f", BX - 1.0, BX + 1.0, BED[1] - 1.12, BED[1] - 1.09)):
    strip(f"bed_glow_{nm}", x0, x1, y0, y1, 0.06, 0.07, "rm_night", 10)
rbox("bench_seat", BX, BED[1] - 1.55, 0.3, 1.5, 0.45, 0.16, 0.0, MAT["taupe"], bevel=0.04)
for sx in (-0.68, 0.68):
    for sy in (-0.18, 0.18):
        cyl(f"bench_leg_{sx}_{sy}", 0.018, 0.014, 0.3, (BX + sx, BED[1] - 1.55 + sy, 0.0), MAT["brass"], seg=12)
rbox("bench_throw", BX + 0.35, BED[1] - 1.55, 0.46, 0.5, 0.47, 0.02, 0.0, MAT["olive"], bevel=0.01)

# ---------------------------------------------------------------- right wall 2-3: window, curtains, armchair, floor lamp, desk
def curtain_y(name, y0, y1, x, z0, z1, mat, folds_per_m=6.0, amp=0.05):
    bm = bmesh.new(); n = max(12, int((y1 - y0) * folds_per_m * 6)); rows = []
    for i in range(n + 1):
        t = i / n; y = y0 + (y1 - y0) * t
        xx = x + amp * math.sin(t * (y1 - y0) * folds_per_m * 2 * math.pi)
        rows.append((bm.verts.new((xx, y, z0)), bm.verts.new((xx, y, z1))))
    for i in range(n):
        bm.faces.new((rows[i][0], rows[i + 1][0], rows[i + 1][1], rows[i][1]))
    return finish(name, bm, mat, smooth=lambda f: True)

boxb("window_glass", W, W + 0.04, WY0, WY1, 0, H, MAT["window"])
for y in (WY0, (WY0 + WY1) / 2, WY1):
    boxb(f"window_mullion_{y:.1f}", W - 0.01, W + 0.05, y - 0.03, y + 0.03, 0, H, MAT["metal"])
boxb("curtain_pocket", W - 0.32, W, WY0 - 0.3, WY1 + 0.3, H - 0.12, H, MAT["ceiling"])
if CLOSED:
    curtain_y("blackout", WY0 - 0.2, WY1 + 0.2, W - 0.2, 0.02, H - 0.12, MAT["blackout"], 5.0, 0.05)
    curtain_y("sheer", WY0, WY1, W - 0.1, 0.02, H - 0.12, MAT["sheer"], 6.0, 0.03)
else:
    curtain_y("blackout_far", WY1 - 0.15, WY1 + 0.25, W - 0.2, 0.02, H - 0.12, MAT["blackout"], 12.0, 0.08)
    curtain_y("blackout_near", WY0 - 0.25, WY0 + 0.15, W - 0.2, 0.02, H - 0.12, MAT["blackout"], 12.0, 0.08)
    if SHEER:
        curtain_y("sheer", WY0, WY1, W - 0.1, 0.02, H - 0.12, MAT["sheer"], 6.0, 0.03)
    else:
        curtain_y("sheer_far", WY1 - 0.35, WY1 - 0.15, W - 0.1, 0.02, H - 0.12, MAT["sheer"], 14.0, 0.05)
strip("window_head_led", W - 0.3, W - 0.27, WY0, WY1, H - 0.13, H - 0.12, "rm_cove", 18)
if not asset_or("armchair", "armchair", 6.4, 1.95, 0.0, rad(-120), height=0.85):
    rbox("armchair_seat", 6.4, 1.95, 0.0, 0.8, 0.8, 0.45, rad(-120), MAT["linen"], bevel=0.06)
LX, LY = 6.7, 2.7
if not asset_or("floor_lamp", "floor_lamp", LX, LY, 0.0, 0.0, height=1.6):
    cyl("floor_lamp_stem", 0.015, 0.015, 1.4, (LX, LY, 0), MAT["brass"], seg=12)
    cyl("floor_lamp_shade", 0.24, 0.24, 0.3, (LX, LY, 1.35), MAT["shade"], seg=40, caps=False)
light("floor_lamp_light", "POINT", 35, (LX, LY, 1.42), "rm_deco", radius=0.06)
cyl("side_table_top", 0.22, 0.22, 0.03, (6.75, 3.35, 0.52), MAT["marble_top"], seg=40)
cyl("side_table_stem", 0.04, 0.04, 0.52, (6.75, 3.35, 0), MAT["brass"], seg=16)
flowers("side_flowers", 6.75, 3.35, 0.55, r=0.14, vase_h=0.14)
plant("plant_window", 6.7, 4.8, 1.3, 1.0)
flowers("nightstand_flowers", BX - 1.4, D - 0.3, 0.6, r=0.11, vase_h=0.12)
boxb("desk_top", 6.35, 6.95, 0.3, 1.35, 0.74, 0.78, MAT["walnut"], bevel=0.005)
for x in (6.4, 6.9):
    for y in (0.35, 1.3):
        cyl(f"desk_leg_{x}_{y}", 0.015, 0.015, 0.74, (x, y, 0), MAT["brass"], seg=10)
rbox("tablet", 6.6, 0.85, 0.8, 0.32, 0.02, 0.22, rad(70), MAT["metal"], bevel=0.004)
rbox("tablet_screen", 6.59, 0.85, 0.81, 0.29, 0.005, 0.19, rad(70), MAT["screen"], group="rm_deco")
flowers("desk_flowers", 6.7, 1.25, 0.78, r=0.12, vase_h=0.12)

# ---------------------------------------------------------------- decorative pendant (faceted)
PX, PY, PZ = BX, 2.9, 2.25
cyl("pendant_rod", 0.008, 0.008, HT - PZ - 0.2, (PX, PY, PZ + 0.2), MAT["brass"], seg=8)
cyl("pendant_shade", 0.45, 0.28, 0.22, (PX, PY, PZ), MAT["metal"], seg=8)
cyl("pendant_cap", 0.28, 0.28, 0.02, (PX, PY, PZ + 0.21), MAT["metal"], seg=8)
cyl("pendant_band", 0.455, 0.455, 0.03, (PX, PY, PZ + 0.02), MAT["brass"], seg=8)
cyl("pendant_diffuser", 0.42, 0.42, 0.01, (PX, PY, PZ - 0.005), MAT["led"], seg=32, group="rm_deco")
light("pendant_light", "AREA", 70, (PX, PY, PZ - 0.02), "rm_deco", size=(0.7, 0.7))
light("pendant_glow", "POINT", 25, (PX, PY, PZ + 0.1), "rm_deco", radius=0.15)

# ---------------------------------------------------------------- tunable white downlights
n = 0
for x in (3.9, 5.05, 6.2):
    for y in (1.2, 2.4, 3.7):
        if math.hypot(x - PX, y - PY) > 0.8:
            downlight(f"dl_tray_{n}", x, y, HT, "rm_tunable", 60, 50); n += 1
for y in (1.0, 2.6, 4.0):
    downlight(f"dl_side_{n}", 1.6, y, H, "rm_tunable", 45); n += 1

# ---------------------------------------------------------------- outside the right wall: high floor over the bay at dusk
boxb("bay", 60, 4000, -3000, 3000, -42.0, -41.9, MAT["water_out"])
for i in range(110):
    x = random.uniform(260, 1100); y = random.uniform(-700, 600)
    tall = random.random() < 0.18
    w = random.uniform(18, 40) if tall else random.uniform(25, 55); d = w * random.uniform(0.7, 1.3)
    h = random.uniform(140, 260) if tall else 25 + random.random() ** 1.6 * 80
    boxb(f"tower_{i:03d}", x, x + w, y, y + d, -42.0, h - 42.0, MAT["city"], group="sky")
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=False, segments=48, radius1=420, radius2=420, depth=520, matrix=Matrix.Translation((0, 0, 230)))
sky_ob = finish("day_sky_card", bm, MAT["skycard"], loc=(3.5, 2.5, 0)); sky_ob.lightgroup = "day_sky"

world = bpy.data.worlds.new("dusk"); scene.world = world; world.use_nodes = True
N = world.node_tree.nodes; L = world.node_tree.links; bg = N["Background"]
tc = N.new("ShaderNodeTexCoord"); sx = N.new("ShaderNodeSeparateXYZ"); mr = N.new("ShaderNodeMapRange")
mr.inputs["From Min"].default_value = -0.05; mr.inputs["From Max"].default_value = 0.7
cr = N.new("ShaderNodeValToRGB"); els = cr.color_ramp.elements
for i, (pos, hx) in enumerate(((0.0, "#a07a68"), (0.12, "#4c5a8c"), (0.4, "#1e2c62"), (1.0, "#0b1029"))):
    e = els[i] if i < 2 else els.new(pos); e.position = pos; e.color = (*lin(hx), 1)
L.new(tc.outputs["Generated"], sx.inputs[0]); L.new(sx.outputs["Z"], mr.inputs["Value"])
L.new(mr.outputs["Result"], cr.inputs["Fac"]); L.new(cr.outputs["Color"], bg.inputs["Color"])
bg.inputs["Strength"].default_value = 1.2
world.lightgroup = "sky"


# ---------------------------------------------------------------- daylight (own passes), sun from beyond the window (+y)
if DAYLIGHT:
    for name, elev, azi, strength in (("day_morning", 12, -30, 3.5), ("day_midday", 55, 0, 4.5), ("day_evening", 8, 35, 3.0)):
        ld = bpy.data.lights.new(name, "SUN"); ld.energy = strength; ld.angle = rad(1.5)
        ob = bpy.data.objects.new(name, ld); ROOT.objects.link(ob); ob.lightgroup = name
        e, a = rad(elev), rad(azi)
        d = Vector((-math.cos(e) * math.cos(a), -math.cos(e) * math.sin(a), -math.sin(e)))
        ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

# ---------------------------------------------------------------- camera (ROOM_CAMERA)
cd = bpy.data.cameras.new("hero"); cd.sensor_fit = "VERTICAL"; cd.angle_y = rad(67.7); cd.clip_end = 5000
cd.shift_y = 0.0
cam = bpy.data.objects.new("hero", cd); ROOT.objects.link(cam)
CX, CY, CZ = 1.25, 1.25, 1.3
cam.location = (CX, CY, CZ)
yaw = rad(45.0)
aim(cam, (CX + math.sin(yaw) * 30, CY + math.cos(yaw) * 30, CZ)); scene.camera = cam


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
    "rm-entry": (0.6, D - 0.8, 2.7), "rm-dnd": (1.15, D - 0.03, 1.3), "rm-wardrobe": (1.8, D + 0.3, 1.8), "rm-bath": ((B0 + B1) / 2, BD - 0.03, 1.6),
    "rm-bedside": (BX - 1.25, D - 0.25, 1.35), "rm-reading": (BX + 0.5, D - 0.75, 0.8), "rm-cove": (5.0, TRAY["y1"], H + 0.2),
    "rm-deco": (PX, PY, PZ), "rm-night": (BX + 1.02, BED[1], 0.07), "rm-tunable": (5.5, 3.0, HT),
    "curtains": (W - 0.2, (WY0 + WY1) / 2, 1.6), "hvac": (6.6, 0.85, 0.9),
}

bpy.context.view_layer.update()
spots = {}
for k, co in HOT.items():
    v = world_to_camera_view(scene, cam, Vector(co))
    spots[k] = {"u": round(v.x, 4), "v": round(1 - v.y, 4), "visible": bool(0 <= v.x <= 1 and 0 <= v.y <= 1 and v.z > 0)}
def uv(co):
    v = world_to_camera_view(scene, cam, Vector(co))
    return [round(v.x, 4), round(1 - v.y, 4)]
# window opening as the curtains see it: near end (WY0) and far end (WY1), bottom and top, on the curtain plane
quad = [uv((W - 0.15, WY0, 0.02)), uv((W - 0.15, WY1, 0.02)), uv((W - 0.15, WY1, H - 0.12)), uv((W - 0.15, WY0, H - 0.12))]
with open(os.path.join(OUT, "hotspots.json"), "w") as f:
    json.dump({"camera": "hero", "points": spots,
               "curtain": {"quad": quad, "order": "near-bottom, far-bottom, far-top, near-top",
                           "travel": "both ends to centre", "pad": 0.02}}, f, indent=2)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "room.blend"))
print(f"[uniser] built room, mode={MODE}, passes={written}")

if MODE != "build":
    scene.render.filepath = os.path.join(OUT, f"preview_{TAG}.png")
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    print("[uniser] done:", OUT)
