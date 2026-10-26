"""
Uniser SmartSpaces - Luxury Car Showroom
Builds the showroom in Blender and renders one linear EXR pass per lighting circuit.

Run from Terminal (Blender 4.2 LTS):
  /Applications/Blender.app/Contents/MacOS/Blender -b -P showroom_build.py -- --preview   # 960x540
  /Applications/Blender.app/Contents/MacOS/Blender -b -P showroom_build.py -- --final     # 1920x1080
  add --cpu if the GPU path crashes

Optional assets next to this script (used automatically if present):
  models/car_1.glb ... car_5.glb   real car models (any free GLB; scaled and placed for you)
  posters/poster_1.jpg, poster_2.jpg   brand imagery for the two back-lit posters

Output: ./out_showroom  (showroom.blend, preview_<mode>.png, passes_<mode>_0001.exr, hotspots.json)
Blender coordinates: x left->right, y into the room, z up.
"""

import bpy, bmesh, math, os, sys, json, random
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MODE = "final" if "--final" in ARGS else "build" if "--build" in ARGS else "preview"
DAYLIGHT = MODE == "final" or "--daylight" in ARGS
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out_showroom")
os.makedirs(OUT, exist_ok=True)
random.seed(7)
rad = math.radians

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
VL = scene.view_layers[0]
ROOT = bpy.data.collections.new("Showroom")
scene.collection.children.link(ROOT)

# ---------------------------------------------------------------- plan
# Positions are solved from the reference frame: camera 1.7 m high, turned 19 deg left of the room axis, horizon at 55%.
X0, X1, Y0, D, H = -14.3, 12.0, -4.0, 32.0, 7.5
RAFT = (X0, -3.2, Y0, D, 5.5)                 # lowered ceiling over the left side: x0, x1, y0, y1, underside z
PLAT = dict(x=-7.1, y=12.9, r=2.6)
DISC = dict(x=-7.1, y=12.9, r=3.0, z=4.4)
SLAT_X = -0.5
MEZZ = dict(x0=-0.5, x1=9.0, y0=18.0, y1=D, z=3.0)
PILLARS = [(-1.2, 12.7), (-0.2, 19.2)]
RGBX = 9.0
CIRCUITS = ["sr_general", "sr_spot", "sr_track", "sr_linear", "sr_tunable", "sr_accent", "sr_floor", "sr_arch", "sr_rgb"]
DAY = []
GROUPS = CIRCUITS
for g in GROUPS:
    VL.lightgroups.add(name=g)
BASE = os.path.dirname(os.path.abspath(__file__))

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

MAT.update(
    stone_floor=procedural("showroom_floor", [(0.0, "#5f5f5d"), (0.5, "#767674"), (1.0, "#646462")], 0.26,
                           scale=0.25, distortion=2.0, detail=6, coat=0.12, tiles=1.2),
    ceiling_light=procedural("ceiling_light", [(0.0, "#b4b4b2"), (1.0, "#bfbfbd")], 0.9, scale=2.0),
    dark_wall=procedural("dark_wall", [(0.0, "#1f1e1d"), (1.0, "#2a2826")], 0.7, scale=2.0, bump=0.04),
    leather=principled("leather", "#2a2826", 0.45, Coat_Weight=0.2),
    rubber=principled("rubber", "#0e0e0e", 0.8),
    rim=principled("rim", "#b9bcc0", 0.2, 1.0),
    car_glass=principled("car_glass", "#07090c", 0.04, Coat_Weight=1.0),
    rug=principled("rug", "#3c3a38", 1.0, Sheen_Weight=0.4),
    glass_rail=shadow_clear(principled("glass_rail", "#ffffff", 0.0, Transmission_Weight=1.0, IOR=1.5)),
    headlight=emission("headlight", 40.0),
    taillight=principled("taillight", "#300000", 0.3, Emission_Color=(*lin("#ff2010"), 1), Emission_Strength=6.0),
    white_text=principled("white_text", "#f4f1ea", 0.5, Emission_Color=(*lin("#ffffff"), 1), Emission_Strength=1.5),
    blue_panel=principled("blue_panel", "#0c1a2e", 0.6, Emission_Color=(*lin("#1d4f8f"), 1), Emission_Strength=0.6),
)
PAINT = dict(
    silver=principled("paint_silver", "#a7aaad", 0.22, 0.85, Coat_Weight=1.0, Coat_Roughness=0.03),
    graphite=principled("paint_graphite", "#2b2e31", 0.25, 0.8, Coat_Weight=1.0, Coat_Roughness=0.03),
    green=principled("paint_green", "#1d2a24", 0.25, 0.7, Coat_Weight=1.0, Coat_Roughness=0.03),
    red=principled("paint_red", "#8a0a0a", 0.3, 0.4, Coat_Weight=1.0, Coat_Roughness=0.03),
    white=principled("paint_white", "#e8e8e6", 0.3, 0.2, Coat_Weight=1.0, Coat_Roughness=0.03),
)

def poster_material(name, path, u_axis="Y"):
    m = bpy.data.materials.new(name); m.use_nodes = True
    N = m.node_tree.nodes; L = m.node_tree.links; N.clear()
    e = N.new("ShaderNodeEmission"); e.inputs["Strength"].default_value = 1.6
    o = N.new("ShaderNodeOutputMaterial"); L.new(e.outputs[0], o.inputs["Surface"])
    alt = os.path.splitext(path)[0] + ".png"
    path = path if os.path.exists(path) else alt
    if os.path.exists(path):
        t = N.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(path); t.extension = "EXTEND"
        tc = N.new("ShaderNodeTexCoord"); sx = N.new("ShaderNodeSeparateXYZ"); cb = N.new("ShaderNodeCombineXYZ")
        L.new(tc.outputs["Generated"], sx.inputs[0]); L.new(sx.outputs[u_axis], cb.inputs["X"]); L.new(sx.outputs["Z"], cb.inputs["Y"])
        L.new(cb.outputs[0], t.inputs["Vector"]); L.new(t.outputs["Color"], e.inputs["Color"])
    else:  # dusk road placeholder: drop posters/<name>.jpg next to the script to replace it
        tc = N.new("ShaderNodeTexCoord"); sx = N.new("ShaderNodeSeparateXYZ")
        cr = N.new("ShaderNodeValToRGB"); els = cr.color_ramp.elements
        for i, (pos, hx) in enumerate(((0.0, "#2b2620"), (0.32, "#4a4036"), (0.38, "#7c6a58"), (0.5, "#b79a80"), (0.62, "#8a90a8"), (1.0, "#3b4a68"))):
            el = els[i] if i < 2 else els.new(pos); el.position = pos; el.color = (*lin(hx), 1)
        L.new(tc.outputs["Generated"], sx.inputs[0]); L.new(sx.outputs["Z"], cr.inputs["Fac"]); L.new(cr.outputs["Color"], e.inputs["Color"])
    return m

def label(name, body, loc, rot, size, mat, group, align="LEFT", spacing=1.1):
    cu = bpy.data.curves.new(name, "FONT"); cu.body = body; cu.size = size; cu.extrude = 0.003
    cu.space_line = spacing; cu.align_x = align; cu.align_y = "TOP"
    ob = bpy.data.objects.new(name, cu); ob.data.materials.append(mat)
    ob.location = loc; ob.rotation_euler = rot; ROOT.objects.link(ob); ob.lightgroup = group
    return ob

FACE_X = (rad(90), 0, rad(90))    # text on a wall facing +x
FACE_NY = (rad(90), 0, 0)         # text on a wall facing -y (toward the camera)

# ---------------------------------------------------------------- shell
boxb("floor", X0, X1, Y0, D, -0.1, 0, MAT["stone_floor"])
boxb("ceiling", X0 - 0.2, X1 + 0.2, Y0 - 0.2, D + 0.2, H, H + 0.15, MAT["ceiling_light"])
boxb("wall_left", X0 - 0.2, X0, Y0, D, 0, H, MAT["dark_wall"])
boxb("wall_back", X0 - 0.2, X1 + 0.2, D, D + 0.2, 0, H, MAT["dark_wall"])
boxb("wall_front", X0 - 0.2, X1 + 0.2, Y0 - 0.2, Y0, 0, H, MAT["dark_wall"])
boxb("wall_right", X1, X1 + 0.2, Y0, D, 0, H, MAT["dark_wall"])
world = bpy.data.worlds.new("black"); scene.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.0

def flat_ring(name, outer, inner, z, mat, group=None):
    bm = bmesh.new(); n = len(outer)
    o = [bm.verts.new((x, y, z)) for x, y in outer]; i_ = [bm.verts.new((x, y, z)) for x, y in inner]
    for k in range(n):
        j = (k + 1) % n
        bm.faces.new((o[k], o[j], i_[j], i_[k]))
    ob = finish(name, bm, mat)
    if group:
        ob.lightgroup = group
    return ob

def circle(cx, cy, r, step=3):
    return [(cx + math.cos(rad(a)) * r, cy + math.sin(rad(a)) * r) for a in range(0, 360, step)]

# ---------------------------------------------------------------- lowered raft (left half) + general downlights
x0, x1, ry0, ry1, rz = RAFT
boxb("raft", x0, x1, ry0, ry1, rz, H, MAT["ceiling_light"])
boxb("raft_edge_led_x", x1, x1 + 0.03, ry0, ry1, rz, rz + 0.05, MAT["led_cove"], group="sr_arch")
boxb("raft_edge_led_y", x0, x1, ry1, ry1 + 0.03, rz, rz + 0.05, MAT["led_cove"], group="sr_arch")
for i in range(6):
    for j in range(12):
        x, y = -13.2 + i * 1.8, -2.5 + j * 2.2
        if math.hypot(x - DISC["x"], y - DISC["y"]) < DISC["r"] + 0.5:
            continue
        cyl(f"lens_{i}_{j}", 0.07, 0.07, 0.008, (x, y, rz - 0.008), MAT["lens"], seg=24, group="sr_general")
        light(f"downlight_{i}_{j}", "SPOT", 120, (x, y, rz - 0.02), "sr_general", spot=60, blend=0.6, radius=0.03)
for j in range(10):
    y = -2.0 + j * 2.8
    cyl(f"lens_mid_{j}", 0.07, 0.07, 0.008, (-1.9, y, H - 0.008), MAT["lens"], seg=24, group="sr_general")
    light(f"downlight_mid_{j}", "SPOT", 160, (-1.9, y, H - 0.02), "sr_general", spot=55, blend=0.6, radius=0.03)

# ---------------------------------------------------------------- high-CRI ring over the turntable
dx, dy, dr, dz = DISC["x"], DISC["y"], DISC["r"], DISC["z"]
cyl("disc", dr, dr, 0.35, (dx, dy, dz), MAT["ceiling_light"], seg=96)
for k in range(3):
    a = k * 2 * math.pi / 3
    cyl(f"disc_hanger_{k}", 0.008, 0.008, rz - dz - 0.35, (dx + math.cos(a) * 2, dy + math.sin(a) * 2, dz + 0.35), MAT["metal"], seg=6)
flat_ring("disc_led", circle(dx, dy, dr + 0.02, 4), circle(dx, dy, dr - 0.07, 4), dz - 0.005, MAT["led_cove"], group="sr_arch")
for k in range(12):
    a = k * 2 * math.pi / 12
    px, py = dx + math.cos(a) * (dr - 0.5), dy + math.sin(a) * (dr - 0.5)
    sp = light(f"cri_spot_{k}", "SPOT", 260, (px, py, dz - 0.15), "sr_spot", target=(dx, dy, 0.9), spot=28, blend=0.4, radius=0.02)
    head = cyl(f"cri_head_{k}", 0.065, 0.055, 0.18, (px, py, dz - 0.15), MAT["metal"], seg=16); head.rotation_euler = sp.rotation_euler

# ---------------------------------------------------------------- track lighting: two rails running into the room
CARS = [  # name, x, y, heading (deg, nose direction), paint, kind
    ("car_1", -7.3, 6.0, -14, "silver", "coupe"), ("car_2", -9.4, 9.6, -14, "graphite", "coupe"),
    ("car_3", PLAT["x"], PLAT["y"], -71, "green", "suv"), ("car_4", -3.6, 16.2, 200, "red", "coupe"),
    ("car_5", 2.4, 21.6, -80, "white", "sedan"), ("car_6", 5.6, 22.0, 180, "graphite", "sedan"),
]
for r, tx in enumerate((-2.6, -2.0)):
    tz = 5.6
    boxb(f"track_rail_{r}", tx - 0.025, tx + 0.025, -2.0, 20.0, tz, tz + 0.05, MAT["metal"])
    for k in range(3):
        cyl(f"track_hanger_{r}_{k}", 0.006, 0.006, H - tz - 0.05, (tx, 0.0 + k * 9, tz + 0.05), MAT["metal"], seg=6)
    for k in range(10):
        py = -1.0 + k * 2.0
        TRACK_TARGETS = [(-14.1, 12.7, 2.8), (-4.5, 18.5, 2.0), (-9.0, 25.4, 1.6), (tx - 2.5, py + 4.0, 0.0), (-14.1, 6.0, 2.4)]
        tgt = TRACK_TARGETS[(k + r) % len(TRACK_TARGETS)]
        sp = light(f"track_spot_{r}_{k}", "SPOT", 240, (tx, py, tz - 0.2), "sr_track", target=tgt, spot=26, blend=0.4, radius=0.02)
        head = cyl(f"track_head_{r}_{k}", 0.06, 0.05, 0.18, (tx, py, tz - 0.2), MAT["metal"], seg=16); head.rotation_euler = sp.rotation_euler
        cyl(f"track_stem_{r}_{k}", 0.009, 0.009, 0.2, (tx, py, tz - 0.2), MAT["metal"], seg=8)

# ---------------------------------------------------------------- linear: timber slat ceiling (right) with LED lines
boxb("slat_soffit", SLAT_X, X1, Y0, D, H - 0.02, H, MAT["timber_dark"])
fin = boxb("slat_000", 0, 0.07, Y0, D, H - 0.4, H - 0.02, MAT["walnut"])
for i in range(int((X1 - SLAT_X) / 0.24)):
    ob = fin if i == 0 else fin.copy()
    ob.location.x = SLAT_X + 0.12 + i * 0.24
    if i:
        ob.name = f"slat_{i:03d}"; ROOT.objects.link(ob)
for k, x in enumerate((1.6, 4.4, 7.2)):
    boxb(f"linear_led_{k}", x - 0.04, x + 0.04, Y0 + 0.5, D - 0.5, H - 0.42, H - 0.4, MAT["led"], group="sr_linear")
    light(f"linear_wash_{k}", "AREA", 500, (x, (Y0 + D) / 2, H - 0.45), "sr_linear", size=(0.12, D - Y0 - 1.5))

# ---------------------------------------------------------------- accent: brand posters + wall reveals
PA = (9.5, 16.0)
boxb("poster_a_frame", X0, X0 + 0.15, PA[0] - 0.2, PA[1] + 0.2, 0.8, 5.5, MAT["dark_wall"])
boxb("poster_a", X0 + 0.15, X0 + 0.16, PA[0], PA[1], 1.0, 5.33, poster_material("poster_1", os.path.join(BASE, "posters", "poster_1.jpg")), group="sr_accent")
label("poster_a_text", "DRIVEN\nBY A BRIGHTER\nTOMORROW", (X0 + 0.17, PA[0] + 0.5, 4.9), FACE_X, 0.36, MAT["white_text"], "sr_accent")
for k, y in enumerate((PA[0] - 0.9, PA[1] + 0.9, 4.0, 21.0)):
    boxb(f"wall_reveal_{k}", X0, X0 + 0.05, y - 0.025, y + 0.025, 0.2, rz - 0.15, MAT["led"], group="sr_accent")
PB = (-6.0, -3.0, 18.6)
boxb("poster_b_wall", PB[0] - 0.3, PB[1] + 0.3, PB[2], PB[2] + 0.4, 0, rz - 0.6, MAT["dark_wall"])
boxb("poster_b", PB[0], PB[1], PB[2] - 0.01, PB[2], 0.9, 3.3, poster_material("poster_2", os.path.join(BASE, "posters", "poster_2.jpg"), u_axis="X"), group="sr_accent")
label("poster_b_text", "MORE\nTHAN\nA CAR\nA LIFESTYLE", (PB[0] + 0.2, PB[2] - 0.02, 3.1), FACE_NY, 0.17, MAT["white_text"], "sr_accent")
for k, yy in enumerate((PA[0] + 1.0, (PA[0] + PA[1]) / 2, PA[1] - 1.0)):
    light(f"wall_graze_{k}", "SPOT", 160, (X0 + 1.1, yy, rz - 0.1), "sr_tunable", target=(X0 + 0.1, yy, 2.0), spot=55, blend=0.7)

# ---------------------------------------------------------------- back-left gallery: lit panel wall behind the turntable
GW = 25.5   # freestanding wall line
boxb("gallery_wall", X0, -0.6, GW, GW + 0.3, 0, rz, MAT["dark_wall"])
for k in range(7):
    gx = X0 + 1.2 + k * 1.75
    boxb(f"gallery_panel_{k}", gx, gx + 1.35, GW - 0.06, GW, 0.3, rz - 0.4, MAT["car_glass"])
    boxb(f"gallery_slot_{k}", gx + 1.5, gx + 1.54, GW - 0.08, GW - 0.04, 0.2, rz - 0.2, MAT["led"], group="sr_arch")
    light(f"gallery_graze_{k}", "SPOT", 120, (gx + 0.67, GW - 0.9, rz - 0.1), "sr_tunable", target=(gx + 0.67, GW, 1.2), spot=45, blend=0.7)
boxb("gallery_shelf", X0 + 1.0, -1.0, GW - 0.5, GW - 0.06, 0.0, 0.45, MAT["walnut"])
boxb("gallery_shelf_led", X0 + 1.0, -1.0, GW - 0.51, GW - 0.5, 0.42, 0.44, MAT["led"], group="sr_floor")

# ---------------------------------------------------------------- pillars (architectural slot + tunable wash)
for k, (px, py) in enumerate(PILLARS):
    boxb(f"pillar_{k}", px - 0.6, px + 0.6, py - 0.6, py + 0.6, 0, H, MAT["dark_wall"], bevel=0.01)
    boxb(f"pillar_slot_{k}", px - 0.62, px - 0.58, py - 0.35, py - 0.3, 0.1, H - 0.1, MAT["led"], group="sr_arch")
    for sI in range(7):
        boxb(f"pillar_fin_{k}_{sI}", px - 0.68, px - 0.62, py - 0.5 + sI * 0.15, py - 0.47 + sI * 0.15, 0.05, H - 0.8, MAT["walnut"])
    light(f"pillar_wash_{k}", "SPOT", 220, (px - 1.6, py - 1.6, rz - 0.2), "sr_tunable", target=(px, py, 2.2), spot=35, blend=0.6)

# ---------------------------------------------------------------- floor: turntable only (the reference keeps floor light subtle)
pr = PLAT["r"]
cyl("platform", pr, pr, 0.16, (PLAT["x"], PLAT["y"], 0), MAT["stone"], seg=128)
cyl("platform_top", pr - 0.05, pr - 0.05, 0.005, (PLAT["x"], PLAT["y"], 0.16), MAT["table"], seg=128)
flat_ring("platform_led", circle(PLAT["x"], PLAT["y"], pr + 0.05), circle(PLAT["x"], PLAT["y"], pr + 0.01), 0.02, MAT["led"], group="sr_floor")

# ---------------------------------------------------------------- cars (imported if models/<name>.glb exists, else placeholders)
def import_car(path, length, paint=None):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    root = bpy.data.objects.new(os.path.basename(path) + "_root", None); ROOT.objects.link(root)
    for o in new:
        for c in o.users_collection:
            c.objects.unlink(o)
        ROOT.objects.link(o)
        if o.parent is None:
            o.parent = root
    if paint:
        for o in new:
            if o.type != "MESH":
                continue
            for slot in o.material_slots:
                n = (slot.material.name if slot.material else "").lower()
                if ("body" in n or "carpaint" in n or "paint" in n) and "under" not in n:
                    slot.material = PAINT[paint]
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in new if o.type == "MESH" for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    sx_, sy_ = mx.x - mn.x, mx.y - mn.y
    s = length / max(sx_, sy_)
    cx, cy = (mn.x + mx.x) / 2, (mn.y + mx.y) / 2
    if sy_ > sx_:  # model length along y: turn it so the nose points +x (flip later if it faces backwards)
        root.rotation_euler = (0, 0, rad(-90)); cx, cy = cy, -cx
    root.scale = (s, s, s); root.location = (-cx * s, -cy * s, -mn.z * s)
    return root

def placeholder_car(name, paint, kind):
    L_, W_ = (4.85, 2.0) if kind == "suv" else (4.9, 1.9) if kind == "sedan" else (4.6, 1.95)
    b0, b1 = (0.35, 1.15) if kind == "suv" else (0.22, 0.78)
    c0, c1 = (b1, 1.95) if kind == "suv" else (b1, 1.25 if kind == "sedan" else 1.18)
    cl, co = (3.0, -0.25) if kind == "suv" else (2.4, -0.3) if kind == "sedan" else (2.0, -0.35)
    parts = []
    body = boxb(f"{name}_body", -L_ / 2, L_ / 2, -W_ / 2, W_ / 2, b0, b1, PAINT[paint]); modifiers(body, bevel=0.14 if kind != "suv" else 0.08, subsurf=2)
    cab = boxb(f"{name}_cabin", co - cl / 2, co + cl / 2, -W_ / 2 * 0.86, W_ / 2 * 0.86, c0 - 0.05, c1, MAT["car_glass"]); modifiers(cab, bevel=0.2 if kind != "suv" else 0.06, subsurf=2)
    parts += [body, cab]
    rr = 0.42 if kind == "suv" else 0.36
    for sx in (-1, 1):
        for sy in (-1, 1):
            wx, wy = sx * (L_ / 2 - 0.85), sy * (W_ / 2 - 0.08)
            parts.append(cyl(f"{name}_tyre_{sx}_{sy}", rr, rr, 0.26, (wx, wy - 0.13, rr), MAT["rubber"], seg=40, rot=(rad(-90), 0, 0)))
            parts.append(cyl(f"{name}_rim_{sx}_{sy}", rr * 0.68, rr * 0.68, 0.01, (wx, wy + sy * 0.13, rr), MAT["rim"], seg=32, rot=(rad(-90) if sy < 0 else rad(90), 0, 0)))
    for sy in (-1, 1):
        hl = boxb(f"{name}_headlight_{sy}", L_ / 2 - 0.12, L_ / 2 - 0.02, sy * W_ * 0.28 - 0.18, sy * W_ * 0.28 + 0.18, b1 - 0.2, b1 - 0.14, MAT["headlight"], group="sr_accent")
        tl = boxb(f"{name}_taillight_{sy}", -L_ / 2 + 0.02, -L_ / 2 + 0.1, sy * W_ * 0.3 - 0.2, sy * W_ * 0.3 + 0.2, b1 - 0.18, b1 - 0.12, MAT["taillight"])
        parts += [hl, tl]
    return parts

MODEL_FILES = {
    "car_1": "2008_audi_r8_4.2_fsi_quattro.glb", "car_2": "2004_audi_s4.glb", "car_3": "2024_nissan_qashqai_glory.glb",
    "car_4": "2008_audi_r8_4.2_fsi_quattro.glb", "car_5": "2004_audi_s4.glb", "car_6": "2004_audi_s4.glb",
}
CAR_LENGTH = {"car_1": 4.43, "car_2": 4.57, "car_3": 4.43, "car_4": 4.43, "car_5": 4.57, "car_6": 4.57}
FLIP = {"car_1", "car_2", "car_3", "car_4", "car_5", "car_6"}  # these models are authored nose -x
for name, x, y, heading, paint, kind in CARS:
    e = bpy.data.objects.new(name, None); e.location = (x, y, 0.16 if name == "car_3" else 0); e.rotation_euler = (0, 0, rad(heading))
    ROOT.objects.link(e)
    path = os.path.join(BASE, "models", MODEL_FILES.get(name, f"{name}.glb"))
    if os.path.exists(path):
        root = import_car(path, CAR_LENGTH.get(name, 4.7), paint); root.parent = e
        if name in FLIP:
            root.rotation_euler.z += math.pi; root.location.x *= -1; root.location.y *= -1
    else:
        for p in placeholder_car(name, paint, kind):
            p.parent = e

# ---------------------------------------------------------------- vehicle zones: adjustable high-CRI spots, one pass per car
ZONES = []
for idx, (name, x, y, heading, paint, kind) in enumerate(CARS, start=1):
    g = f"sr_zone_{idx}"
    VL.lightgroups.add(name=g)
    if g not in CIRCUITS:
        CIRCUITS.append(g)
    ZONES.append((g, x, y))
    under_raft = x < RAFT[1] and y < RAFT[3]
    under_mezz = MEZZ["x0"] < x < MEZZ["x1"] and y > MEZZ["y0"]
    z0 = MEZZ["z"] - 0.05 if under_mezz else (RAFT[4] - 0.05 if under_raft else 5.6)
    hdg = rad(heading)
    for k, (fwd, side) in enumerate(((2.6, 0.0), (-2.6, 0.0), (0.0, 2.2), (0.0, -2.2))):
        ox = math.cos(hdg) * fwd - math.sin(hdg) * side
        oy = math.sin(hdg) * fwd + math.cos(hdg) * side
        p = (x + ox, y + oy, z0)
        sp = light(f"{g}_spot_{k}", "SPOT", 340 if not under_mezz else 160, p, g, target=(x, y, 0.7), spot=28, blend=0.45, radius=0.02)
        head = cyl(f"{g}_head_{k}", 0.06, 0.05, 0.16, p, MAT["metal"], seg=16); head.rotation_euler = sp.rotation_euler

# ---------------------------------------------------------------- mezzanine
mx0, mx1, my0, my1, mz = MEZZ["x0"], MEZZ["x1"], MEZZ["y0"], MEZZ["y1"], MEZZ["z"]
boxb("mezz_slab", mx0, mx1, my0, my1, mz, mz + 0.35, MAT["ceiling_light"])
boxb("mezz_edge_led", mx0 - 0.01, mx1, my0 - 0.01, my0, mz - 0.01, mz + 0.01, MAT["led"], group="sr_arch")
boxb("mezz_rail", mx0, mx1, my0, my0 + 0.02, mz + 0.35, mz + 1.4, MAT["glass_rail"])
for k, (cx_, cy_) in enumerate(((1.4, 19.6), (3.2, 19.4), (5.0, 19.7), (6.8, 19.5))):
    boxb(f"mezz_seat_{k}", cx_ - 0.45, cx_ + 0.45, cy_ - 0.45, cy_ + 0.45, mz + 0.35, mz + 0.8, MAT["fabric"], bevel=0.05)
    light(f"mezz_down_{k}", "SPOT", 80, (cx_, cy_, H - 0.5), "sr_general", spot=70, blend=0.6)
boxb("experience_panel", 0.8, 6.8, 24.0 - 0.02, 24.0, 0.4, mz - 0.25, MAT["blue_panel"], group="sr_accent")
boxb("experience_wall", -0.5, 9.0, 24.0, 24.3, 0, mz, MAT["dark_wall"])
label("experience_text", "EXPERIENCE\nTHE EXTRAORDINARY", (1.3, 24.0 - 0.03, 2.1), FACE_NY, 0.2, MAT["white_text"], "sr_accent")
for k in range(4):
    light(f"mezz_under_{k}", "SPOT", 90, (0.8 + k * 2.2, 21.5, mz - 0.03), "sr_general", spot=70, blend=0.6)

# ---------------------------------------------------------------- reception desk + lounge (right foreground)
boxb("desk", 1.3, 5.3, 6.8, 7.6, 0.08, 1.1, MAT["walnut"], bevel=0.01)
boxb("desk_top", 1.2, 5.4, 6.75, 7.7, 1.1, 1.14, MAT["stone"])
boxb("desk_plinth", 1.45, 5.15, 6.95, 7.5, 0, 0.08, MAT["metal"])
boxb("desk_glow", 1.45, 5.15, 6.94, 6.95, 0.0, 0.03, MAT["led"], group="sr_arch")
light("desk_toe", "AREA", 60, (3.3, 6.9, 0.06), "sr_arch", size=(3.7, 0.1), rot=(math.pi, 0, 0))
label("desk_logo", "UNISER", (1.7, 6.78, 0.9), FACE_NY, 0.22, MAT["white_text"], "sr_arch")
label("desk_tag", "SMART SPACES\nFOR A BRIGHTER TOMORROW", (1.7, 6.78, 0.56), FACE_NY, 0.07, MAT["white_text"], "sr_arch")
LOUNGE = (0.3, 9.9)
MAT["rug"] = procedural("rug_wool", [(0.0, "#3a3b3c"), (0.5, "#56585a"), (1.0, "#404244")], 1.0, scale=6.0, distortion=1.0, detail=4, bump=0.15)
cyl("rug", 2.1, 2.1, 0.01, (*LOUNGE, 0), MAT["rug"], seg=128)
cyl("coffee_table", 0.48, 0.48, 0.035, (*LOUNGE, 0.45), MAT["walnut"], seg=64)
cyl("coffee_table_lip", 0.46, 0.48, 0.02, (*LOUNGE, 0.43), MAT["walnut"], seg=64)
cyl("coffee_table_stem", 0.045, 0.045, 0.42, (*LOUNGE, 0.01), MAT["metal"], seg=16)
cyl("coffee_table_foot", 0.26, 0.24, 0.02, (*LOUNGE, 0.01), MAT["metal"], seg=48)

tub = source("src_club_chair")   # open side faces local +y
shell = boxb("club_shell", -0.4, 0.4, -0.38, 0.38, 0.14, 0.42, MAT["leather"], col=tub); modifiers(shell, bevel=0.08, subsurf=2)
cush = boxb("club_cushion", -0.33, 0.33, -0.22, 0.36, 0.42, 0.52, MAT["leather"], col=tub); modifiers(cush, bevel=0.05, subsurf=2)
bm = bmesh.new(); lo, hi = [], []
N_ = 28
for k in range(N_ + 1):
    a = rad(140 + 260 * k / N_)
    back = 0.5 + 0.5 * math.cos(a - rad(270))     # 1 at the back, 0 at the arm ends
    r0 = 0.42
    lo.append(bm.verts.new((r0 * math.cos(a), r0 * math.sin(a) * 0.95, 0.3)))
    hi.append(bm.verts.new((r0 * math.cos(a), r0 * math.sin(a) * 0.95, 0.58 + 0.2 * back)))
for k in range(N_):
    bm.faces.new((lo[k], lo[k + 1], hi[k + 1], hi[k]))
modifiers(finish("club_back", bm, MAT["leather"], col=tub, smooth=lambda f: True), solidify=0.13, subsurf=2)
for sx in (-1, 1):
    for sy in (-1, 1):
        cyl(f"club_leg_{sx}_{sy}", 0.012, 0.02, 0.15, (0.3 * sx, 0.28 * sy, 0), MAT["walnut"], seg=10, col=tub, rot=(0.12 * sy, -0.12 * sx, 0))
for k, a in enumerate((rad(250), rad(20), rad(130))):
    instance(f"tub_{k}", tub, (LOUNGE[0] + math.cos(a) * 1.2, LOUNGE[1] + math.sin(a) * 1.2, 0), a + math.pi / 2)

# ---------------------------------------------------------------- RGB feature wall (far right)
boxb("rgb_wall", RGBX - 0.06, RGBX, 14.0, 24.0, 0, mz, MAT["dark_wall"])
for k in range(16):
    y = 14.3 + k * 0.6
    boxb(f"rgb_fin_{k}", RGBX - 0.4, RGBX - 0.06, y - 0.03, y + 0.03, 0, mz - 0.1, MAT["dark_wall"])
    boxb(f"rgb_fin_led_{k}", RGBX - 0.07, RGBX - 0.06, y + 0.06, y + 0.1, 0.1, mz - 0.2, MAT["led"], group="sr_rgb")
light("rgb_wash", "AREA", 800, (RGBX - 0.5, 19.0, 0.1), "sr_rgb", size=(0.4, 9.8))

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



for k, (px, py, h, sp) in enumerate(((X0 + 0.7, 8.2, 2.4, 1.45), (X0 + 0.7, 17.2, 2.2, 1.35), (X0 + 0.7, 3.5, 2.0, 1.25),
                                     (-1.2, 11.4, 1.8, 1.15), (RGBX - 0.8, 15.0, 2.0, 1.2), (RGBX - 0.8, 20.0, 2.2, 1.3), (-6.6, 18.2, 1.8, 1.15))):
    plant(f"plant_{k}", px, py, h, sp)
    if px > RGBX - 1:
        light(f"plant_rgb_{k}", "SPOT", 90, (px + 0.1, py - 0.2, 0.6), "sr_rgb", target=(px, py, 2.0), spot=55, blend=0.6)

for k, gx in enumerate((-12.4, -9.2, -4.6, -2.2)):
    plant(f"gallery_plant_{k}", gx, GW - 0.9, 1.9 + 0.2 * (k % 2), 1.2)
plant("left_front_plant_a", X0 + 0.8, 1.2, 2.2, 1.4)
plant("left_front_plant_b", X0 + 2.0, 0.2, 1.4, 1.0)

# ---------------------------------------------------------------- camera: 1.7 m, turned 19 deg left of the room axis, slight upward tilt (matches the reference)
cd = bpy.data.cameras.new("hero"); cd.sensor_fit = "VERTICAL"; cd.angle_y = rad(52); cd.clip_end = 400
cam = bpy.data.objects.new("hero", cd); ROOT.objects.link(cam)
yaw = rad(-19); cam.location = (0.0, 0.0, 1.7)
aim(cam, (10 * math.sin(yaw), 10 * math.cos(yaw), 1.7 + 10 * math.tan(rad(3)))); scene.camera = cam

# ---------------------------------------------------------------- render settings
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
fo.base_path = os.path.join(OUT, f"passes_{MODE}_")
try:
    fo.layer_slots.clear()
except Exception:
    pass

def group_socket(g):
    s = rl.outputs.get("Combined_" + g)
    if s is None:
        s = next((o for o in rl.outputs if o.name.endswith(g)), None)
    return s

TINT_2700K = (1.0, 0.62, 0.38, 1.0)  # showroom preview uses 4000 K neutral  # linear rgb, what the app's cctToRgb(2700) works out to
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
    "sr-general": Vector((-9.6, 4.0, RAFT[4])), "sr-spot": Vector((DISC["x"], DISC["y"] - DISC["r"] + 0.5, DISC["z"] - 0.15)),
    "sr-track": Vector((-2.3, 5.0, 5.4)), "sr-linear": Vector((4.4, 12.0, H - 0.41)),
    "sr-tunable": Vector((PILLARS[0][0] - 0.6, PILLARS[0][1], 3.0)), "sr-accent": Vector((X0 + 0.16, (PA[0] + PA[1]) / 2, 3.0)),
    "sr-floor": Vector((PLAT["x"], PLAT["y"] - PLAT["r"], 0.05)), "sr-arch": Vector((3.3, 6.75, 0.6)),
    "sr-rgb": Vector((RGBX - 0.3, 18.0, 2.0)),
}
for g, x, y in ZONES:
    HOT[g.replace("_", "-")] = Vector((x, y, 1.0))
bpy.context.view_layer.update()
spots = {}
for k, co in HOT.items():
    v = world_to_camera_view(scene, cam, co)
    spots[k] = {"u": round(v.x, 4), "v": round(1 - v.y, 4), "visible": bool(0 <= v.x <= 1 and 0 <= v.y <= 1 and v.z > 0)}
with open(os.path.join(OUT, "hotspots.json"), "w") as f:
    json.dump({"camera": "hero", "points": spots}, f, indent=2)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "showroom.blend"))
print(f"[uniser] built scene, mode={MODE}, passes={written}")

if MODE != "build":
    scene.render.filepath = os.path.join(OUT, f"preview_{MODE}.png")
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    print("[uniser] done:", OUT)
