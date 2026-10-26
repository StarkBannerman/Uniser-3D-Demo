"""
Uniser SmartSpaces - Hotel Restaurant
Builds the room in Blender and renders one linear EXR pass per lighting circuit.

Run from Terminal (Blender 4.2 LTS):
  /Applications/Blender.app/Contents/MacOS/Blender -b -P restaurant_build_v7.py -- --build     # build + save .blend only
  /Applications/Blender.app/Contents/MacOS/Blender -b -P restaurant_build_v7.py -- --preview   # 960x540, 128 spp (~10 min)
  /Applications/Blender.app/Contents/MacOS/Blender -b -P restaurant_build_v7.py -- --final     # 1920x1080, 512 spp + daylight

Output (next to this script, in ./out):
  restaurant.blend            the scene, open it to look around
  preview_<mode>.png          all circuits at 2700 K, summed the way the web app will
  passes_<mode>_0001.exr      multilayer EXR: one denoised layer per circuit + sky + daylight
  hotspots.json               screen position of each circuit, for tap targets

v7 layout follows the "Luxury Hotel Restaurant" reference: camera near the left wall looking diagonally
across the room. Blender coordinates throughout: x left->right (windows at x=W), y into the room, z up.
"""

import bpy, bmesh, math, os, sys, json, random
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MODE = "final" if "--final" in ARGS else "build" if "--build" in ARGS else "preview"
DAYLIGHT = MODE == "final" or "--daylight" in ARGS
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
os.makedirs(OUT, exist_ok=True)
random.seed(7)
rad = math.radians

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
VL = scene.view_layers[0]
ROOT = bpy.data.collections.new("Restaurant")
scene.collection.children.link(ROOT)

# ---------------------------------------------------------------- plan
W, Y0, D = 13.0, -2.5, 18.0          # room x 0..W, y Y0..D
H1, H2, H3 = 3.5, 3.95, 4.4          # lower ceiling, cove tier 1, cove tier 2
TIER1 = (6.8, 7.25, 8.0, 15.5, 3.2)  # cx, cy, w, h, corner radius
TIER2 = (7.0, 5.2, 5.4, 6.5, 2.3)
SLAT_X = 11.0                        # timber slat ceiling from here to the glazing
BAR = dict(y0=9.2, y1=16.2)
WINE = dict(x0=6.0, x1=9.4, y=15.6)
PEND = dict(x=6.8, y=4.8, r=1.8)
PIERS = [6.8, 12.6]
TOP = 0.775
TABLES = [
    (4.6, 2.2, 0.62, 4, 0.3), (8.4, 2.6, 0.66, 4, 1.0), (10.8, 4.4, 0.6, 4, -0.4),
    (5.6, 6.0, 0.55, 4, 0.8), (8.8, 7.6, 0.62, 4, -0.2), (11.0, 9.8, 0.55, 3, 0.5),
    (4.9, 10.2, 0.55, 4, -0.7), (8.0, 11.2, 0.62, 4, 0.3), (10.9, 14.0, 0.55, 4, 1.2),
    (4.6, 13.9, 0.55, 3, 0.1),
]
CIRCUITS = ["rs_general", "rs_tunable", "rs_cove", "rs_pendant", "rs_arch", "rs_feature", "rs_table", "rs_rgb"]
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
    """Mostly clear: a faint Fresnel reflection so the view, not the room, reads through the glazing."""
    m = bpy.data.materials.new("window_glass"); m.use_nodes = True
    N = m.node_tree.nodes; L = m.node_tree.links; N.clear()
    tr = N.new("ShaderNodeBsdfTransparent")
    gl = N.new("ShaderNodeBsdfGlossy"); gl.inputs["Roughness"].default_value = 0.02
    lw = N.new("ShaderNodeLayerWeight"); lw.inputs["Blend"].default_value = 0.15
    mr = N.new("ShaderNodeMapRange"); mr.inputs["To Min"].default_value = 0.03; mr.inputs["To Max"].default_value = 0.3
    mx = N.new("ShaderNodeMixShader"); o = N.new("ShaderNodeOutputMaterial")
    lp = N.new("ShaderNodeLightPath"); inv = N.new("ShaderNodeMath"); inv.operation = "SUBTRACT"; inv.inputs[0].default_value = 1.0
    mul = N.new("ShaderNodeMath"); mul.operation = "MULTIPLY"
    L.new(lw.outputs["Fresnel"], mr.inputs["Value"]); L.new(lp.outputs["Is Camera Ray"], inv.inputs[1])
    L.new(mr.outputs["Result"], mul.inputs[0]); L.new(inv.outputs[0], mul.inputs[1]); L.new(mul.outputs[0], mx.inputs[0])
    L.new(tr.outputs[0], mx.inputs[1]); L.new(gl.outputs[0], mx.inputs[2]); L.new(mx.outputs[0], o.inputs["Surface"])
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
    L.new(tint.outputs["Color"], b.inputs["Emission Color"]); setin(b, "Emission Strength", 3.0)
    return m

MAT = dict(
    floor=procedural("marble_floor", [(0.0, "#2c2722"), (0.47, "#463e35"), (0.5, "#7d705f"), (0.53, "#463e35"), (1.0, "#2a2520")],
                     0.08, scale=0.35, distortion=3.0, detail=10, coat=0.6, tiles=1.2),
    plaster=procedural("plaster_wall", [(0.0, "#3e372f"), (1.0, "#4b4339")], 0.9, scale=3.0, bump=0.08),
    ceiling=procedural("ceiling_plaster", [(0.0, "#7c6f5e"), (1.0, "#8b7d6a")], 0.92, scale=2.0, bump=0.05),
    soffit=principled("raft_soffit", "#5a5146", 0.9),
    stone=procedural("travertine", [(0.0, "#7c6a52"), (0.5, "#a08a6c"), (1.0, "#8a765c")], 0.45,
                     scale=1.5, mscale=(1.4, 1.4, 9.0), distortion=1.5, bump=0.05),
    walnut=procedural("walnut", [(0.0, "#24170e"), (0.6, "#3c2818"), (1.0, "#4a3220")], 0.45,
                      kind="wave", scale=4.0, distortion=7.0, detail=4, coat=0.2),
    timber_dark=principled("timber_dark", "#21160e", 0.7),
    brass=principled("brass", "#b08d4f", 0.28, 1.0),
    metal=principled("black_metal", "#1b1917", 0.4, 0.8),
    fabric=principled("chair_fabric", "#5f5345", 0.9, Sheen_Weight=0.5, Sheen_Roughness=0.6),
    table=principled("table_top", "#2a211a", 0.32, Coat_Weight=0.4, Coat_Roughness=0.15),
    china=principled("china", "#f2efe8", 0.15, Coat_Weight=0.8),
    stemware=shadow_clear(principled("stemware", "#ffffff", 0.0, Transmission_Weight=1.0, IOR=1.45)),
    amber=shadow_clear(principled("amber_globe", "#e9c08e", 0.02, Transmission_Weight=1.0, IOR=1.45,
                                  Emission_Color=(*lin("#ffc27a"), 1), Emission_Strength=0.1), "#f6c27a"),
    leaf=principled("foliage", "#2d4626", 0.45, Subsurface_Weight=0.15),
    bottle_green=principled("bottle_green", "#2e4a2b", 0.08, Transmission_Weight=0.7, IOR=1.5),
    bottle_amber=principled("bottle_amber", "#5a2e12", 0.08, Transmission_Weight=0.7, IOR=1.5),
    bottle_clear=principled("bottle_clear", "#cfd8d2", 0.05, Transmission_Weight=0.9, IOR=1.5),
    window=window_glass(),
    shade=lamp_shade(),
    water=principled("bay_water", "#0d1524", 0.06),
    city=city_material(),
    led=emission("led_strip", 30.0),
    led_cove=emission("led_cove", 38.0),
    led_soft=emission("led_soft", 3.0),
    lens=emission("downlight_lens", 25.0),
    filament=emission("filament", 220.0),
    panel=procedural("walnut_panel", [(0.0, "#1c120b"), (0.6, "#2c1d12"), (1.0, "#362416")], 0.5,
                     kind="wave", scale=2.0, mscale=(1, 1, 6), distortion=4.0, detail=3),
    slate=procedural("feature_stone", [(0.0, "#2a2723"), (0.5, "#3a352f"), (1.0, "#2e2a25")], 0.55, scale=2.2, bump=0.12),
    lettering=principled("lettering", "#d9b77a", 0.3, 1.0, Emission_Color=(*lin("#ffcf8a"), 1), Emission_Strength=0.6),
    terrace=procedural("terrace_stone", [(0.0, "#3b3833"), (1.0, "#4a463f")], 0.6, scale=1.0, tiles=0.9),
    bark=principled("bark", "#2e2219", 0.85),
    petal_a=principled("petal_warm", "#f2b33a", 0.5, Subsurface_Weight=0.3),
    petal_b=principled("petal_rose", "#d9576b", 0.5, Subsurface_Weight=0.3),
    petal_c=principled("petal_cream", "#f4e8d2", 0.5, Subsurface_Weight=0.3),
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

def in_rr(x, y, t, pad=0.0):
    cx, cy, w, h, r = t
    w, h, r = w - 2 * pad, h - 2 * pad, max(r - pad, 0.05)
    ax, ay = abs(x - cx), abs(y - cy)
    if ax > w / 2 or ay > h / 2:
        return False
    dx, dy = max(ax - (w / 2 - r), 0), max(ay - (h / 2 - r), 0)
    return dx * dx + dy * dy <= r * r

def loop(t, pad=0.0, seg=16):
    cx, cy, w, h, r = t
    return rrect(cx, cy, w - 2 * pad, h - 2 * pad, max(r - pad, 0.05), seg)

def ring(name, outer, inner, z, mat, group=None):
    bm = bmesh.new(); n = len(outer)
    o = [bm.verts.new((x, y, z)) for x, y in outer]; i_ = [bm.verts.new((x, y, z)) for x, y in inner]
    for k in range(n):
        j = (k + 1) % n
        bm.faces.new((o[k], o[j], i_[j], i_[k]))
    ob = finish(name, bm, mat)
    if group:
        ob.lightgroup = group
    return ob

def band(name, pts, z0, z1, mat, group=None):
    bm = bmesh.new(); n = len(pts)
    a = [bm.verts.new((x, y, z0)) for x, y in pts]; b = [bm.verts.new((x, y, z1)) for x, y in pts]
    for k in range(n):
        j = (k + 1) % n
        bm.faces.new((a[k], a[j], b[j], b[k]))
    ob = finish(name, bm, mat, smooth=lambda f: True)
    if group:
        ob.lightgroup = group
    return ob

def cap(name, pts, z, mat):
    bm = bmesh.new(); bm.faces.new([bm.verts.new((x, y, z)) for x, y in pts])
    return finish(name, bm, mat)

def ceiling_z(x, y):
    return H3 if in_rr(x, y, TIER2) else H2 if in_rr(x, y, TIER1) else H1

# ---------------------------------------------------------------- shell
TOPZ = H3 + 0.25
boxb("floor", 0, W, Y0, D, -0.1, 0, MAT["floor"])
boxb("roof", -0.3, W + 0.3, Y0 - 0.3, D + 0.3, TOPZ, TOPZ + 0.15, MAT["ceiling"])
boxb("wall_back", -0.2, W + 0.2, D, D + 0.2, 0, TOPZ, MAT["panel"])
boxb("wall_front", -0.2, W + 0.2, Y0 - 0.2, Y0, 0, TOPZ, MAT["plaster"])
boxb("wall_left", -0.2, 0, Y0, D, 0, TOPZ, MAT["plaster"])
GL = (1.8, 17.4)
boxb("wall_right_a", W, W + 0.2, Y0, GL[0], 0, TOPZ, MAT["plaster"])
boxb("wall_right_b", W, W + 0.2, GL[1], D, 0, TOPZ, MAT["plaster"])
boxb("wall_right_head", W, W + 0.2, GL[0], GL[1], H1, TOPZ, MAT["plaster"])
boxb("glazing", W - 0.005, W + 0.005, GL[0], GL[1], 0, H1, MAT["window"])
for i in range(8):
    y = GL[0] + i * (GL[1] - GL[0]) / 7
    boxb(f"mullion_{i}", W - 0.035, W + 0.035, y - 0.03, y + 0.03, 0, H1, MAT["metal"])
boxb("sill", W - 0.06, W + 0.05, GL[0], GL[1], 0, 0.08, MAT["metal"])
for i, y in enumerate(PIERS):
    boxb(f"pier_{i}", W - 0.85, W - 0.05, y - 0.42, y + 0.42, 0, H1, MAT["stone"], bevel=0.01)

# ---------------------------------------------------------------- ceiling: lower plane + two curved cove tiers
room = rrect(W / 2, (Y0 + D) / 2, W, D - Y0, 0.02, 16)
t1, t2 = loop(TIER1), loop(TIER2)
ring("ceiling_low", room, t1, H1, MAT["ceiling"])
ring("ceiling_tier1", t1, t2, H2, MAT["ceiling"])
cap("ceiling_tier2", t2, H3, MAT["ceiling"])
band("tier1_wall", t1, H1, H2, MAT["ceiling"])
band("tier2_wall", t2, H2, H3, MAT["ceiling"])
for k, (t, z) in enumerate(((TIER1, H1), (TIER2, H2))):
    band(f"cove_{k}_upstand", loop(t, 0.12), z, z + 0.13, MAT["ceiling"])
    ring(f"cove_{k}_led", loop(t, 0.03), loop(t, 0.065), z + 0.035, MAT["led_cove"], group="rs_cove")

# timber slats over the window side
boxb("slat_soffit", SLAT_X, W, Y0, D, H1 - 0.02, H1, MAT["timber_dark"])
fin = boxb("slat_000", SLAT_X + 0.05, W - 0.05, 0, 0.05, H1 - 0.16, H1 - 0.02, MAT["walnut"])
fin.location.y = Y0 + 0.1
for i in range(1, int((D - Y0 - 0.2) / 0.15)):
    ob = fin.copy(); ob.name = f"slat_{i:03d}"; ob.location.y = Y0 + 0.1 + i * 0.15; ROOT.objects.link(ob)
boxb("slat_edge", SLAT_X - 0.06, SLAT_X, Y0, D, H1 - 0.22, H1, MAT["timber_dark"])
boxb("slat_edge_led", SLAT_X - 0.07, SLAT_X - 0.06, Y0 + 0.2, D - 0.2, H1 - 0.2, H1 - 0.19, MAT["led"], group="rs_arch")

# ---------------------------------------------------------------- general: downlights
for i in range(8):
    for j in range(10):
        x, y = 0.9 + i * 1.6, -1.8 + j * 2.1
        if x > SLAT_X - 0.3 and x < SLAT_X + 0.3:
            continue
        if math.hypot(x - PEND["x"], y - PEND["y"]) < PEND["r"] + 0.3:
            continue
        if x < SLAT_X and in_rr(x, y, TIER1, pad=-0.25):
            continue  # no downlights in the cove recesses: they sit on the flat false ceiling only
        z = H1 - 0.16 if x > SLAT_X else ceiling_z(x, y)
        cyl(f"lens_{i}_{j}", 0.055, 0.055, 0.008, (x, y, z - 0.008), MAT["lens"], seg=24, group="rs_general")
        light(f"downlight_{i}_{j}", "SPOT", 40, (x, y, z - 0.02), "rs_general", spot=70, blend=0.6, radius=0.03)

# ---------------------------------------------------------------- tunable white: two tracks over the bar side
for r, (tx, aimx, aimz) in enumerate(((1.0, 0.2, 1.6), (2.1, 4.8, 0.85))):
    boxb(f"track_rail_{r}", tx - 0.02, tx + 0.02, -1.5, 16.5, H1 - 0.04, H1, MAT["metal"])
    for k in range(8):
        y = -0.6 + k * 2.2
        base = (tx, y, H1 - 0.05)
        sp = light(f"track_spot_{r}_{k}", "SPOT", 90, (tx, y, H1 - 0.2), "rs_tunable",
                   target=(aimx, y + 0.8, aimz), spot=36, blend=0.35, radius=0.02)
        head = cyl(f"track_head_{r}_{k}", 0.05, 0.04, 0.14, (tx, y, H1 - 0.2), MAT["metal"], seg=16)
        head.rotation_euler = sp.rotation_euler
        cyl(f"track_stem_{r}_{k}", 0.008, 0.008, 0.15, (tx, y, H1 - 0.2), MAT["metal"], seg=8)

# ---------------------------------------------------------------- pendants: large amber globes
for i in range(15):
    ang = i * 2.39996
    rr_ = PEND["r"] * math.sqrt((i + 0.6) / 15)
    x, y = PEND["x"] + math.cos(ang) * rr_, PEND["y"] + math.sin(ang) * rr_
    z = 2.45 + ((i * 7) % 6) * 0.24
    r = 0.2 + ((i * 11) % 3) * 0.05
    sphere(f"globe_{i}", r, (x, y, z), MAT["amber"], seg=48, group="rs_pendant")
    cyl(f"filament_{i}", 0.012, 0.012, 0.09, (x, y, z - 0.05), MAT["filament"], seg=10, group="rs_pendant")
    cyl(f"globe_cap_{i}", 0.04, 0.03, 0.06, (x, y, z + r - 0.015), MAT["brass"], seg=24)
    cyl(f"cord_{i}", 0.003, 0.003, H3 - (z + r), (x, y, z + r), MAT["metal"], seg=6)
    light(f"globe_light_{i}", "POINT", 30, (x, y, z), "rs_pendant", radius=0.02)
cyl("pendant_canopy", 0.6, 0.6, 0.02, (PEND["x"], PEND["y"], H3 - 0.02), MAT["brass"], seg=48)

# ---------------------------------------------------------------- architectural: pillars, slat edge
for i, y in enumerate(PIERS):
    light(f"pier_graze_{i}", "SPOT", 70, (W - 1.05, y, H1 - 0.25), "rs_arch", target=(W - 0.9, y, 0.2), spot=26, blend=0.5)
light("slat_wash", "AREA", 160, (SLAT_X - 0.2, (Y0 + D) / 2, H1 - 0.3), "rs_arch", size=(0.3, D - Y0 - 1),
      rot=(0, rad(-120), 0))

# ---------------------------------------------------------------- feature: lettered stone wall, back bar, wine cabinet
FW = (4.4, 8.2)
boxb("feature_frame", 0, 0.1, FW[0] - 0.12, FW[1] + 0.12, 0.2, 3.25, MAT["panel"])
boxb("feature_stone", 0.1, 0.16, FW[0], FW[1], 0.32, 3.13, MAT["slate"])
for j, (y0, y1, z0, z1) in enumerate(((FW[0] - 0.05, FW[0], 0.32, 3.13), (FW[1], FW[1] + 0.05, 0.32, 3.13),
                                       (FW[0], FW[1], 3.13, 3.17), (FW[0], FW[1], 0.28, 0.32))):
    boxb(f"feature_reveal_{j}", 0.1, 0.13, y0, y1, z0, z1, MAT["led"], group="rs_feature")
cu = bpy.data.curves.new("feature_text", "FONT")
cu.body = "GOOD\nFOOD\nBRIGHTER\nPEOPLE"; cu.size = 0.3; cu.space_line = 1.05; cu.extrude = 0.004
cu.align_x = "LEFT"; cu.align_y = "TOP"
txt = bpy.data.objects.new("feature_text", cu); txt.data.materials.append(MAT["lettering"])
txt.location = (0.17, FW[0] + 0.9, 2.9); txt.rotation_euler = (rad(90), 0, rad(90))
ROOT.objects.link(txt); txt.lightgroup = "rs_feature"
boxb("feature_rule", 0.17, 0.175, FW[0] + 0.9, FW[0] + 1.7, 1.27, 1.28, MAT["lettering"], group="rs_feature")
light("feature_graze", "SPOT", 80, (0.7, (FW[0] + FW[1]) / 2, H1 - 0.15), "rs_feature",
      target=(0.12, (FW[0] + FW[1]) / 2, 1.4), spot=55, blend=0.7)

by0, by1 = BAR["y0"], BAR["y1"]
boxb("backbar_panel", 0, 0.08, by0, by1, 0, H1, MAT["panel"])
boxb("backbar_cabinet", 0, 0.6, by0, by1, 0, 0.95, MAT["walnut"])
boxb("backbar_top", 0, 0.65, by0, by1, 0.95, 0.99, MAT["stone"])
boxb("bar_counter", 2.0, 2.55, by0 + 0.4, by1 - 0.4, 0, 1.08, MAT["stone"], bevel=0.005)
boxb("bar_counter_top", 1.92, 2.65, by0 + 0.35, by1 - 0.35, 1.08, 1.12, MAT["walnut"], bevel=0.004)
boxb("bar_toe_led", 2.55, 2.57, by0 + 0.5, by1 - 0.5, 0.06, 0.08, MAT["led"], group="rs_feature")
boxb("bar_top_led", 2.6, 2.62, by0 + 0.5, by1 - 0.5, 1.05, 1.065, MAT["led"], group="rs_feature")

def bottle_mesh(name, mat):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.036, radius2=0.036, depth=0.2, matrix=Matrix.Translation((0, 0, 0.1)))
    bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.034, radius2=0.012, depth=0.11, matrix=Matrix.Translation((0, 0, 0.255)))
    bm.normal_update()
    for f in bm.faces:
        f.smooth = abs(f.normal.z) < 0.7
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(mat)
    return me

BOTTLES = [bottle_mesh("bottle_green", MAT["bottle_green"]), bottle_mesh("bottle_amber", MAT["bottle_amber"]),
           bottle_mesh("bottle_clear", MAT["bottle_clear"])]
_bn = [0]
def bottle(loc, kind=None):
    _bn[0] += 1
    ob = bpy.data.objects.new(f"bottle_{_bn[0]:03d}", kind or random.choice(BOTTLES))
    ob.location = loc; ROOT.objects.link(ob)

for sh, z in enumerate((1.35, 1.8, 2.25, 2.7)):
    boxb(f"bar_shelf_{sh}", 0.08, 0.4, by0 + 0.3, by1 - 0.3, z - 0.03, z, MAT["walnut"])
    boxb(f"bar_shelf_led_{sh}", 0.34, 0.38, by0 + 0.3, by1 - 0.3, z - 0.045, z - 0.03, MAT["led"], group="rs_feature")
    y = by0 + 0.45
    while y < by1 - 0.45:
        bottle((0.22 + random.uniform(-0.05, 0.05), y, z)); y += random.uniform(0.09, 0.24)
boxb("bar_shelf_cove", 0.08, 0.5, by0, by1, 3.05, 3.1, MAT["walnut"])
boxb("bar_shelf_cove_led", 0.1, 0.12, by0 + 0.2, by1 - 0.2, 3.03, 3.05, MAT["led"], group="rs_feature")
light("backbar_wash", "AREA", 200, (0.9, (by0 + by1) / 2, 2.2), "rs_feature", target=(-1, (by0 + by1) / 2, 2.0), size=(7.0, 1.6))

wx0, wx1, wy = WINE["x0"], WINE["x1"], WINE["y"]
boxb("wine_back", wx0 - 0.1, wx1 + 0.1, wy + 0.72, wy + 0.8, 0, H1, MAT["timber_dark"])
boxb("wine_side_l", wx0 - 0.1, wx0, wy, wy + 0.8, 0, H1, MAT["metal"])
boxb("wine_side_r", wx1, wx1 + 0.1, wy, wy + 0.8, 0, H1, MAT["metal"])
boxb("wine_plinth", wx0, wx1, wy, wy + 0.8, 0, 0.3, MAT["metal"])
ROWS = 7; pitch = (H1 - 0.45) / ROWS
for r in range(ROWS):
    z = 0.3 + r * pitch
    boxb(f"wine_shelf_{r}", wx0, wx1, wy + 0.05, wy + 0.72, z, z + 0.02, MAT["metal"])
    boxb(f"wine_shelf_led_{r}", wx0 + 0.02, wx1 - 0.02, wy + 0.06, wy + 0.09, z + pitch - 0.02, z + pitch - 0.008,
         MAT["led_soft"], group="rs_feature")
    x = wx0 + 0.12
    while x < wx1 - 0.1:
        if random.random() > 0.07:
            bottle((x, wy + 0.4 + random.uniform(-0.15, 0.15), z + 0.02),
                   BOTTLES[0] if random.random() < 0.6 else BOTTLES[random.choice((1, 2))])
        x += random.uniform(0.09, 0.13)
for k, x in enumerate((wx0 + (wx1 - wx0) / 3, wx0 + 2 * (wx1 - wx0) / 3)):
    boxb(f"wine_mullion_{k}", x - 0.02, x + 0.02, wy - 0.02, wy + 0.02, 0.3, H1, MAT["metal"])
boxb("wine_glass", wx0, wx1, wy - 0.006, wy + 0.004, 0.3, H1, MAT["window"])
boxb("wine_led_l", wx0 + 0.01, wx0 + 0.04, wy + 0.06, wy + 0.1, 0.3, H1 - 0.05, MAT["led_soft"], group="rs_feature")
boxb("wine_led_r", wx1 - 0.04, wx1 - 0.01, wy + 0.06, wy + 0.1, 0.3, H1 - 0.05, MAT["led_soft"], group="rs_feature")
light("wine_back_glow", "AREA", 180, ((wx0 + wx1) / 2, wy + 0.68, 1.9), "rs_feature",
      target=((wx0 + wx1) / 2, wy - 2, 1.9), size=(wx1 - wx0 - 0.2, 3.0))

# ---------------------------------------------------------------- dining floor
chair = source("src_chair")
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
bmesh.ops.scale(bm, vec=Vector((0.5, 0.48, 0.09)), verts=bm.verts)
modifiers(finish("chair_seat", bm, MAT["fabric"], (0, 0.01, 0.47), col=chair, smooth=lambda f: True), bevel=0.035, subsurf=1)
bm = bmesh.new(); lo, hi = [], []
for i in range(17):
    a = rad(195 + 150 * i / 16); x, y = 0.26 * math.cos(a), 0.26 * math.sin(a) + 0.03
    lo.append(bm.verts.new((x * 0.95, y * 0.95, 0.5)))
    hi.append(bm.verts.new((x * 1.08, y * 1.08 - 0.06, 0.9)))
for i in range(16):
    bm.faces.new((lo[i], lo[i + 1], hi[i + 1], hi[i]))
modifiers(finish("chair_back", bm, MAT["fabric"], col=chair, smooth=lambda f: True), solidify=0.06, subsurf=2)
for sx in (-1, 1):
    for sy in (-1, 1):
        cyl(f"chair_leg_{sx}_{sy}", 0.011, 0.018, 0.44, (0.19 * sx, 0.18 * sy, 0), MAT["metal"], seg=10,
            col=chair, rot=(0.07 * sy, -0.07 * sx, 0))

glass = source("src_glass")
g = cyl("glass_bowl", 0.024, 0.04, 0.1, (0, 0, 0.1), MAT["stemware"], seg=24, caps=False, col=glass)
modifiers(g, solidify=0.0015)
cyl("glass_bowl_base", 0.024, 0.024, 0.003, (0, 0, 0.1), MAT["stemware"], seg=24, col=glass)
cyl("glass_stem", 0.0045, 0.0045, 0.1, (0, 0, 0), MAT["stemware"], seg=8, col=glass)
cyl("glass_foot", 0.033, 0.031, 0.004, (0, 0, 0), MAT["stemware"], seg=24, col=glass)

plate = source("src_plate")
cyl("plate", 0.13, 0.145, 0.014, (0, 0, 0), MAT["china"], seg=40, col=plate)
cyl("napkin", 0.05, 0.05, 0.012, (0, 0, 0.014), MAT["china"], seg=12, col=plate)

flowers = []
for v, petals in enumerate((("petal_a", "petal_b"), ("petal_a", "petal_c"), ("petal_b", "petal_c"))):
    col = source(f"src_flowers_{v}")
    cyl("vase", 0.03, 0.035, 0.12, (0, 0, 0), MAT["stemware"], seg=20, col=col)
    for k in range(9):
        a = k * 2.39996; rr_ = 0.035 + 0.025 * (k % 3)
        sphere(f"bloom_{k}", 0.028 + 0.008 * (k % 2), (math.cos(a) * rr_, math.sin(a) * rr_, 0.15 + 0.03 * ((k * 5) % 3)),
               MAT[petals[k % 2]], seg=12, col=col)
        sphere(f"bud_leaf_{k}", 0.018, (math.cos(a + 1) * rr_ * 1.2, math.sin(a + 1) * rr_ * 1.2, 0.13), MAT["leaf"], seg=8, col=col)
    flowers.append(col)

for t, (x, y, r, seats, rot) in enumerate(TABLES):
    cyl(f"table_{t}_top", r, r, 0.04, (x, y, TOP - 0.04), MAT["table"], seg=64)
    cyl(f"table_{t}_column", 0.09, 0.07, TOP - 0.07, (x, y, 0.03), MAT["metal"], seg=24)
    cyl(f"table_{t}_base", 0.32, 0.3, 0.03, (x, y, 0), MAT["metal"], seg=48)
    lx, ly = x + 0.12, y + 0.1
    cyl(f"table_{t}_lamp_base", 0.055, 0.05, 0.02, (lx, ly, TOP), MAT["brass"], seg=24)
    cyl(f"table_{t}_lamp_stem", 0.009, 0.009, 0.17, (lx, ly, TOP + 0.02), MAT["brass"], seg=8)
    modifiers(cyl(f"table_{t}_lamp_shade", 0.095, 0.06, 0.13, (lx, ly, TOP + 0.15), MAT["shade"], seg=32, caps=False), solidify=0.003)
    light(f"table_{t}_lamp", "POINT", 8, (lx, ly, TOP + 0.2), "rs_table", radius=0.012)
    instance(f"table_{t}_flowers", flowers[t % 3], (x - 0.14, y - 0.08, TOP))
    for s in range(seats):
        a = rot + s / seats * 2 * math.pi
        dx, dy = math.sin(a), -math.cos(a)
        instance(f"table_{t}_chair_{s}", chair, (x + dx * (r + 0.46), y + dy * (r + 0.46), 0), a)
        instance(f"table_{t}_plate_{s}", plate, (x + dx * (r - 0.2), y + dy * (r - 0.2), TOP))
        ga = a + 0.45
        instance(f"table_{t}_glass_{s}", glass, (x + math.sin(ga) * (r - 0.1), y - math.cos(ga) * (r - 0.1), TOP))
        instance(f"table_{t}_glass2_{s}", glass, (x + math.sin(ga + 0.2) * (r - 0.14), y - math.cos(ga + 0.2) * (r - 0.14), TOP))

# ---------------------------------------------------------------- planting (indoor pots, terrace trees)
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

def plant(name, x, y, height, spread, pot=True, stems=3, trunk=0.014):
    base = 0.55 if pot else 0.0
    if pot:
        cyl(f"{name}_pot", 0.2, 0.26, 0.55, (x, y, 0), MAT["timber_dark"], seg=40)
        cyl(f"{name}_soil", 0.24, 0.24, 0.01, (x, y, 0.53), MAT["walnut"], seg=32)
    for s in range(stems):
        ox, oy = math.cos(s * 2.1) * 0.05, math.sin(s * 2.1) * 0.05
        sh = height * (0.75 + 0.25 * ((s * 7) % 3) / 2)
        cyl(f"{name}_stem_{s}", trunk, trunk * 0.7, sh - base, (x + ox, y + oy, base), MAT["bark"], seg=8, rot=(ox * 1.5, -oy * 1.5, 0))
        n = int(26 * height / 1.8)
        for i in range(n):
            t = 0.25 + 0.75 * i / n
            zz = base + (sh - base) * t
            ob = bpy.data.objects.new(f"{name}_leaf_{s}_{i}", LEAF)
            spreadxy = 1 + t * (3 if pot else 14)
            ob.location = (x + ox * spreadxy, y + oy * spreadxy, zz)
            ob.rotation_euler = (random.uniform(-0.3, 0.3), -rad(random.uniform(10, 45)), i * 2.39996 + s)
            sc = spread * random.uniform(0.75, 1.15) * (1.15 - 0.4 * t)
            ob.scale = (sc, sc, sc)
            ROOT.objects.link(ob)

plant("plant_feature_front", 0.55, FW[0] - 1.0, 2.2, 1.35)
plant("plant_feature_back", 0.55, FW[1] + 0.55, 1.9, 1.2)
plant("plant_bar_end", 0.55, BAR["y1"] + 0.6, 2.0, 1.25)
plant("plant_window_back", W - 1.3, 16.4, 1.9, 1.2)
plant("plant_wine_l", wx0 - 0.6, wy + 0.3, 1.6, 1.05)
plant("plant_wine_r", wx1 + 0.6, wy + 0.3, 1.6, 1.05)

# terrace beyond the glazing, with uplit trees (RGB)
boxb("terrace", W + 0.2, W + 7.0, Y0 - 3, D + 4, -0.12, -0.02, MAT["terrace"])
boxb("terrace_rail", W + 6.4, W + 6.45, Y0 - 3, D + 4, 0, 1.05, MAT["metal"])
for k, y in enumerate((3.4, 7.8, 11.2, 15.6)):
    tx = W + 2.4 + (k % 2) * 1.4
    boxb(f"planter_{k}", tx - 0.55, tx + 0.55, y - 0.55, y + 0.55, 0, 0.6, MAT["stone"])
    plant(f"tree_{k}", tx, y, 3.6, 2.0, pot=False, stems=4, trunk=0.05)
    light(f"tree_uplight_{k}", "SPOT", 600, (tx + 0.4, y - 0.3, 0.62), "rs_rgb", target=(tx, y, 3.2), spot=50, blend=0.6)

# ---------------------------------------------------------------- rgb: pillar uplights + sill wash
for i, y in enumerate(PIERS):
    boxb(f"pier_rgb_strip_{i}", W - 0.9, W - 0.86, y - 0.4, y + 0.4, 0.0, 0.02, MAT["led"], group="rs_rgb")
    light(f"pier_uplight_{i}", "SPOT", 90, (W - 1.0, y, 0.05), "rs_rgb", target=(W - 0.85, y, 3.0), spot=40, blend=0.5)
boxb("rgb_strip_sill", W - 0.12, W - 0.08, GL[0] + 0.2, GL[1] - 0.2, 0.08, 0.1, MAT["led"], group="rs_rgb")

# ---------------------------------------------------------------- view: dusk sky, bay, skyline
world = bpy.data.worlds.new("dusk"); scene.world = world; world.use_nodes = True
N = world.node_tree.nodes; L = world.node_tree.links; bg = N["Background"]
tc = N.new("ShaderNodeTexCoord"); sx = N.new("ShaderNodeSeparateXYZ"); mr = N.new("ShaderNodeMapRange")
mr.inputs["From Min"].default_value = -0.05; mr.inputs["From Max"].default_value = 0.7
cr = N.new("ShaderNodeValToRGB"); els = cr.color_ramp.elements
for i, (pos, hx) in enumerate(((0.0, "#c98d68"), (0.12, "#6c6b94"), (0.4, "#2d3c72"), (1.0, "#0e1430"))):
    e = els[i] if i < 2 else els.new(pos); e.position = pos; e.color = (*lin(hx), 1)
L.new(tc.outputs["Generated"], sx.inputs[0]); L.new(sx.outputs["Z"], mr.inputs["Value"])
L.new(mr.outputs["Result"], cr.inputs["Fac"]); L.new(cr.outputs["Color"], bg.inputs["Color"])
bg.inputs["Strength"].default_value = 2.0
world.lightgroup = "sky"

boxb("bay", W + 40, 3000, -1500, 2500, -31, -30, MAT["water"])
for i in range(150):
    th = rad(-35 + random.random() * 120); dist = 700 + random.random() * 1100
    x = W + math.cos(th) * dist; y = 8 + math.sin(th) * dist
    tall = random.random() < 0.14
    w = random.uniform(20, 45) if tall else random.uniform(30, 80); d = w * random.uniform(0.7, 1.3)
    h = random.uniform(170, 280) if tall else 30 + random.random() ** 1.6 * 90
    boxb(f"tower_{i:03d}", x, x + w, y, y + d, -30, -30 + h, MAT["city"], group="sky")
for k, (th, dist, h) in enumerate(((22, 520, 330), (38, 600, 260), (8, 650, 240))):
    x = W + math.cos(rad(th)) * dist; y = 8 + math.sin(rad(th)) * dist
    boxb(f"hero_tower_{k}", x, x + 40, y, y + 40, -30, -30 + h, MAT["city"], group="sky")
    cyl(f"hero_spire_{k}", 6, 0.6, 60, (x + 20, y + 20, -30 + h), MAT["city"], seg=8, group="sky")

# ---------------------------------------------------------------- daylight (rendered as its own passes; sun comes through the glazing at +x)
if DAYLIGHT:
    for name, elev, azi, strength in (("day_morning", 14, 10, 3.5), ("day_midday", 58, 40, 4.5), ("day_evening", 10, -35, 3.0)):
        ld = bpy.data.lights.new(name, "SUN"); ld.energy = strength; ld.angle = rad(1.5)
        ob = bpy.data.objects.new(name, ld); ROOT.objects.link(ob); ob.lightgroup = name
        e, a = rad(elev), rad(azi)
        d = Vector((-math.cos(e) * math.cos(a), -math.cos(e) * math.sin(a), -math.sin(e)))
        ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

# ---------------------------------------------------------------- camera: near the left wall, looking diagonally across like the reference
cd = bpy.data.cameras.new("hero"); cd.sensor_fit = "VERTICAL"; cd.angle_y = rad(52); cd.clip_end = 4000
cam = bpy.data.objects.new("hero", cd); ROOT.objects.link(cam)
cam.location = (3.2, -1.5, 1.5); aim(cam, (5.23, 8.29, 2.9)); scene.camera = cam

# ---------------------------------------------------------------- daytime sky pass (run separately with --daysky)
DAYSKY = "--daysky" in ARGS
TAG = "daysky" if DAYSKY else MODE
if DAYSKY:
    for ob in ROOT.objects:
        if ob.type == "LIGHT":
            ob.hide_render = True
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        for n in m.node_tree.nodes:
            if n.type == "EMISSION":
                n.inputs["Strength"].default_value = 0.0
            elif n.type == "BSDF_PRINCIPLED":
                setin(n, "Emission Strength", 0.0)
    cb = MAT["city"].node_tree.nodes["Principled BSDF"]
    for l in list(cb.inputs["Base Color"].links):
        MAT["city"].node_tree.links.remove(l)
    setin(cb, "Base Color", (*lin("#8d97a6"), 1)); setin(cb, "Roughness", 0.35)
    wn = world.node_tree.nodes; wl = world.node_tree.links
    sky = wn.new("ShaderNodeTexSky"); sky.sky_type = "NISHITA"; sky.sun_disc = False
    sky.sun_elevation = rad(45); sky.sun_rotation = rad(20); sky.air_density = 1.2; sky.dust_density = 1.5
    for l in list(bg.inputs["Color"].links):
        wl.remove(l)
    wl.new(sky.outputs["Color"], bg.inputs["Color"]); bg.inputs["Strength"].default_value = 0.12
    VL.lightgroups.add(name="sky_day"); world.lightgroup = "sky_day"
    for ob in ROOT.objects:
        if getattr(ob, "lightgroup", "") == "sky":
            ob.lightgroup = "sky_day"
    CIRCUITS, DAY, GROUPS = [], [], ["sky_day"]


FINAL = MODE == "final"
scene.render.engine = "CYCLES"
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    if "--cpu" in ARGS:
        raise RuntimeError("--cpu requested")
    prefs.compute_device_type = "METAL"; prefs.get_devices()
    for dev in prefs.devices:
        dev.use = dev.type == "METAL"
    try:
        prefs.kernel_optimization_level = "OFF"  # background kernel specialisation crashes on newer macOS
    except Exception:
        pass
    scene.cycles.device = "GPU"
except Exception as err:
    scene.cycles.device = "CPU"
    print("GPU setup skipped, rendering on CPU:", err)
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
lx0, ly0 = TABLES[0][0] + 0.12, TABLES[0][1] + 0.1
HOT = {
    "rs-general": Vector((5.7, 9.75, H2)), "rs-tunable": Vector((2.1, 5.0, H1 - 0.2)),
    "rs-cove": Vector((TIER1[0] - TIER1[2] / 2, 9.0, H1 + 0.05)), "rs-pendant": Vector((PEND["x"], PEND["y"], 3.0)),
    "rs-arch": Vector((W - 0.85, PIERS[0], 2.4)), "rs-feature": Vector((0.17, (FW[0] + FW[1]) / 2, 2.2)),
    "rs-table": Vector((lx0, ly0, TOP + 0.2)), "rs-rgb": Vector((W + 2.4, 7.8, 2.4)),
}
bpy.context.view_layer.update()
spots = {}
for k, co in HOT.items():
    v = world_to_camera_view(scene, cam, co)
    spots[k] = {"u": round(v.x, 4), "v": round(1 - v.y, 4), "visible": bool(0 <= v.x <= 1 and 0 <= v.y <= 1 and v.z > 0)}
with open(os.path.join(OUT, "hotspots.json"), "w") as f:
    json.dump({"camera": "hero", "points": spots}, f, indent=2)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "restaurant_daysky.blend" if DAYSKY else "restaurant.blend"))
print(f"[uniser] built scene, mode={MODE}, passes={written}")

if MODE != "build":
    scene.render.filepath = os.path.join(OUT, f"preview_{TAG}.png")
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    print("[uniser] done:", OUT)
