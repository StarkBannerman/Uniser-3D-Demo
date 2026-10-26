"""
Uniser SmartSpaces - Luxury Hotel Common Area (lobby, reception, lounge)
Builds the lobby in Blender (v11: rebuilt structure) and renders one linear EXR pass per lighting circuit.

Run from Terminal (Blender 4.2 LTS), in the folder holding this script:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P lobby_build.py -- --build     # build + save .blend only
  /Applications/Blender.app/Contents/MacOS/Blender -b -P lobby_build.py -- --preview   # 960x540, 128 spp
  /Applications/Blender.app/Contents/MacOS/Blender -b -P lobby_build.py -- --final     # 1920x1080, 512 spp + daylight

Output (./out_lobby): lobby.blend, preview_<mode>.png, passes_<mode>_0001.exr, hotspots.json
Coordinates: Blender native. x across the lobby (0 = reception wall, 21.4 = glass facade), y into the room, z up.
"""

import bpy, bmesh, math, os, sys, json, random, glob
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MODE = "final" if "--final" in ARGS else "build" if "--build" in ARGS else "preview"
DAYLIGHT = MODE == "final" or "--daylight" in ARGS
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out_lobby")
os.makedirs(OUT, exist_ok=True)
random.seed(11)
rad = math.radians

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
VL = scene.view_layers[0]
ROOT = bpy.data.collections.new("Lobby")
scene.collection.children.link(ROOT)


# ---------------------------------------------------------------- plan
# x across (0 = reception wall, GX = glass facade), y into the room, z up
GX = 24.0
YF, YB = -4.0, 40.0            # front wall (behind camera), back wall
LOW = 4.6                      # reception soffit, x 0..XS
XS = 5.5
MID = 6.4                      # central ceiling band
H = 7.6                        # coffer
HH = 11.5                      # double-height facade zone, x XB..GX
XB = 19.0
COF = dict(x0=9.5, x1=17.5, y0=4.0, y1=32.0)
ROW_A = [10.0, 16.0, 22.0, 28.0, 34.0]   # stone pillars on the double-height edge (x 18.6-19.4)
ROW_B = [12.0, 18.0, 24.0, 30.0, 36.0]   # stone pillars along the glass (x 21.9-22.9)
ROW_W = [(4.5, 24.0), (8.5, 24.0)]       # free-standing walnut pillars
CHAND = (13.5, 18.0)
TABLE = (12.6, 8.2)
CIRCUITS = ["ca_arch", "ca_deco", "ca_feature", "ca_accent", "ca_cove", "ca_facade", "ca_tunable"]
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
                     0.28, scale=0.75, distortion=3.0, detail=10, coat=0.18, tiles=1.2),
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


# ---------------------------------------------------------------- shell
boxb("floor", 0, GX, YF, YB, -0.1, 0, MAT["floor"])
boxb("wall_left", -0.3, 0, YF, YB, 0, HH, MAT["plaster"])
boxb("wall_back", 0, GX, YB, YB + 0.3, 0, HH, MAT["plaster"])
boxb("wall_front", 0, GX, YF - 0.3, YF, 0, HH, MAT["plaster"])
# reception soffit and the step up to the central band
boxb("soffit", 0, XS, YF, YB, LOW, LOW + 0.3, MAT["ceiling"])
boxb("soffit_step", XS - 0.3, XS, YF, YB, LOW + 0.3, MID, MAT["ceiling"])
# central band with the coffer opening
for nm, x0, x1, y0, y1 in (("l", XS - 0.3, COF["x0"], YF, YB), ("r", COF["x1"], XB - 0.4, YF, YB),
                           ("f", COF["x0"], COF["x1"], YF, COF["y0"]), ("b", COF["x0"], COF["x1"], COF["y1"], YB)):
    boxb(f"band_{nm}", x0, x1, y0, y1, MID, MID + 0.3, MAT["ceiling"])
boxb("coffer_slab", COF["x0"], COF["x1"], COF["y0"], COF["y1"], H, H + 0.3, MAT["ceiling"])
for nm, x0, x1, y0, y1 in (("l", COF["x0"] - 0.05, COF["x0"], COF["y0"], COF["y1"]), ("r", COF["x1"], COF["x1"] + 0.05, COF["y0"], COF["y1"]),
                           ("f", COF["x0"], COF["x1"], COF["y0"] - 0.05, COF["y0"]), ("b", COF["x0"], COF["x1"], COF["y1"], COF["y1"] + 0.05)):
    boxb(f"coffer_side_{nm}", x0, x1, y0, y1, MID + 0.3, H, MAT["ceiling"])
# edge beam where the ceiling steps up to double height, and the high timber ceiling
boxb("edge_beam", XB - 0.4, XB + 0.4, YF, YB, MID, HH, MAT["walnut"])
boxb("high_slab", XB + 0.4, GX, YF, YB, HH, HH + 0.3, MAT["timber_dark"])
for i in range(int((YB - YF) / 0.3)):
    y = YF + i * 0.3
    boxb(f"high_slat_{i:03d}", XB + 0.4, GX, y, y + 0.1, HH - 0.3, HH, MAT["walnut"])

def cove_up(name, x0, x1, y0, y1, z, wpm):
    """Up-lit LED line with an area light facing up, for a ceiling step."""
    boxb(f"{name}_led", x0, x1, y0, y1, z, z + 0.02, MAT["led_cove"], group="ca_cove")
    L = max(x1 - x0, y1 - y0)
    light(f"{name}_light", "AREA", wpm * L, ((x0 + x1) / 2, (y0 + y1) / 2, z + 0.05), "ca_cove",
          size=(max(x1 - x0, 0.1), max(y1 - y0, 0.1)), rot=(math.pi, 0, 0))

# soffit step cove: washes the 1.5 m face up to the central band
boxb("soffit_lip", XS, XS + 0.25, YF, YB, LOW + 0.1, LOW + 0.3, MAT["ceiling"])
cove_up("cove_soffit", XS + 0.03, XS + 0.08, YF, YB, LOW + 0.3, 65)
# coffer cove on all four sides
for nm, x0, x1, y0, y1 in (("l", COF["x0"] - 0.3, COF["x0"] - 0.25, COF["y0"], COF["y1"]), ("r", COF["x1"] + 0.25, COF["x1"] + 0.3, COF["y0"], COF["y1"]),
                           ("f", COF["x0"], COF["x1"], COF["y0"] - 0.3, COF["y0"] - 0.25), ("b", COF["x0"], COF["x1"], COF["y1"] + 0.25, COF["y1"] + 0.3)):
    cove_up(f"cove_coffer_{nm}", x0, x1, y0, y1, MID + 0.3, 75)
# linear lines: reception soffit and the underside of the edge beam
for k, x in enumerate((1.3, 2.7, 4.1)):
    boxb(f"soffit_line_{k}", x, x + 0.04, YF, YB, LOW - 0.02, LOW, MAT["led"], group="ca_arch")
    light(f"soffit_line_{k}_light", "AREA", 8 * (YB - YF), (x + 0.02, (YF + YB) / 2, LOW - 0.04), "ca_arch", size=(0.05, YB - YF))
for k, x in enumerate((XB - 0.38, XB + 0.34)):
    boxb(f"beam_line_{k}", x, x + 0.04, YF, YB, MID - 0.02, MID, MAT["led"], group="ca_arch")
for k, x in enumerate((20.6, 22.4)):
    boxb(f"high_line_{k}", x, x + 0.05, YF, YB, HH - 0.33, HH - 0.3, MAT["led"], group="ca_arch")
    light(f"high_line_{k}_light", "AREA", 10 * (YB - YF), (x + 0.025, (YF + YB) / 2, HH - 0.36), "ca_arch", size=(0.06, YB - YF))

# ---------------------------------------------------------------- tunable white: downlights
def downlight(name, x, y, z, watts=55, spot=60):
    cyl(f"{name}_lens", 0.07, 0.07, 0.01, (x, y, z - 0.01), MAT["lens"], seg=24, group="ca_tunable")
    light(name, "SPOT", watts, (x, y, z - 0.03), "ca_tunable", spot=spot, blend=0.6, radius=0.03)

n = 0
for y in [YF + 2.0 + 2.6 * k for k in range(16)]:
    downlight(f"dl_soffit_{n}", 2.0, y, LOW, 45); n += 1
    downlight(f"dl_soffit_{n}", 3.5, y, LOW, 45); n += 1
for x in (7.0, 8.4, 18.2):
    for y in [YF + 2.0 + 3.0 * k for k in range(14)]:
        downlight(f"dl_band_{n}", x, y, MID, 70); n += 1
for x in (11.0, 13.5, 16.0):
    for y in [COF["y0"] + 2.0 + 3.2 * k for k in range(9)]:
        if math.hypot(x - CHAND[0], y - CHAND[1]) > 2.6:
            downlight(f"dl_coffer_{n}", x, y, H, 110, 50); n += 1
for y in [YF + 2.0 + 3.0 * k for k in range(15)]:
    downlight(f"dl_high_{n}", 21.0, y, HH - 0.3, 220, 40); n += 1

# ---------------------------------------------------------------- reception wall
for i in range(int((YB - YF) / 0.16)):
    y = YF + i * 0.16
    if 8.4 <= y <= 14.6 or 17.6 <= y <= 22.4:
        continue
    boxb(f"wall_slat_{i:03d}", 0, 0.07, y, y + 0.08, 0, LOW, MAT["walnut"])
for k, y in enumerate((5.0, 16.0, 26.0, 34.0)):
    boxb(f"pilaster_{k}", 0, 0.6, y - 0.55, y + 0.55, 0, LOW, MAT["walnut"])
    for sd, yy in (("a", y - 0.6), ("b", y + 0.56)):
        boxb(f"pilaster_{k}_reveal_{sd}", 0.05, 0.55, yy, yy + 0.04, 0.05, LOW - 0.05, MAT["led"], group="ca_arch")
boxb("logo_panel", 0.0, 0.16, 8.4, 14.6, 0.0, LOW, MAT["timber_dark"])
for sd, (y0, y1, z0, z1) in (("top", (8.5, 14.5, LOW - 0.14, LOW - 0.1)), ("bot", (8.5, 14.5, 1.2, 1.24)),
                             ("l", (8.5, 8.54, 1.2, LOW - 0.1)), ("r", (14.46, 14.5, 1.2, LOW - 0.1))):
    boxb(f"logo_panel_led_{sd}", 0.16, 0.2, y0, y1, z0, z1, MAT["led"], group="ca_feature")
light("logo_wash", "AREA", 300, (1.2, 11.5, LOW - 0.15), "ca_feature", target=(0.1, 11.5, 2.8), size=(0.4, 6.0))
for i, (txt, size, z) in enumerate((("THE GRAND", 0.6, 2.95), ("LUXURY HOTEL", 0.2, 2.5))):
    cu = bpy.data.curves.new(f"logo_text_{i}", "FONT"); cu.body = txt; cu.size = size; cu.extrude = 0.012
    cu.align_x = "CENTER"; cu.align_y = "CENTER"; cu.space_character = 1.15
    ob = bpy.data.objects.new(f"logo_text_{i}", cu); ob.data.materials.append(MAT["brass"])
    ob.location = (0.18, 11.5, z); ob.rotation_euler = (math.pi / 2, 0, math.pi / 2); ROOT.objects.link(ob)
cyl("logo_emblem", 0.3, 0.3, 0.02, (0.18, 11.5, 3.75), MAT["brass"], seg=48, rot=(0, math.pi / 2, 0))

boxb("desk_body", 2.6, 3.5, 7.6, 15.4, 0.08, 1.08, MAT["desk"], bevel=0.01)
boxb("desk_plinth", 2.75, 3.35, 7.75, 15.25, 0.0, 0.08, MAT["metal"])
boxb("desk_top", 2.5, 3.65, 7.5, 15.5, 1.08, 1.13, MAT["marble_top"], bevel=0.01)
boxb("desk_glow", 3.37, 3.4, 7.75, 15.25, 0.02, 0.05, MAT["led"], group="ca_feature")
light("desk_glow_light", "AREA", 100, (3.45, 11.5, 0.06), "ca_feature", size=(0.15, 7.4), rot=(math.pi, 0, 0))
def table_lamp(name, x, y, z, h=0.55, r=0.2, watts=22):
    cyl(f"{name}_base", 0.07, 0.05, h, (x, y, z), MAT["brass"], seg=24)
    cyl(f"{name}_shade", r, r * 0.8, r * 1.2, (x, y, z + h), MAT["shade"], seg=40, caps=False)
    sphere(f"{name}_bulb", 0.03, (x, y, z + h + r * 0.5), MAT["filament"], seg=12, group="ca_deco")
    light(f"{name}_light", "POINT", watts, (x, y, z + h + r * 0.5), "ca_deco", radius=0.05)


table_lamp("desk_lamp_a", 3.0, 8.0, 1.13)
table_lamp("desk_lamp_b", 3.0, 15.0, 1.13)

boxb("art_frame", 0.07, 0.15, 17.8, 22.2, 1.4, 4.0, MAT["metal"])
boxb("art_canvas", 0.15, 0.17, 17.9, 22.1, 1.5, 3.9, MAT["canvas"])
for k, y in enumerate((19.0, 21.0)):
    light(f"art_spot_{k}", "SPOT", 260, (2.2, y, LOW - 0.05), "ca_accent", target=(0.16, y, 2.7), spot=26, blend=0.35)

# ---------------------------------------------------------------- free-standing walnut pillars with LED corners
for k, (x, y) in enumerate(ROW_W):
    boxb(f"walnut_pillar_{k}", x - 0.5, x + 0.5, y - 0.5, y + 0.5, 0, MID, MAT["walnut"])
    for j, (dx, dy) in enumerate(((-0.5, -0.5), (0.5, -0.5), (-0.5, 0.5), (0.5, 0.5))):
        boxb(f"walnut_pillar_{k}_led_{j}", x + dx - 0.02, x + dx + 0.02, y + dy - 0.02, y + dy + 0.02, 0.05, MID - 0.05, MAT["led"], group="ca_arch")
    boxb(f"walnut_pillar_{k}_base", x - 0.56, x + 0.56, y - 0.56, y + 0.56, 0, 0.12, MAT["desk"])

# ---------------------------------------------------------------- back wall: water feature + sculpture
for k, x in enumerate((10.9, 16.1)):
    boxb(f"water_flank_{k}", x - 0.6, x + 0.6, YB - 0.8, YB, 0, H, MAT["walnut"])
boxb("water_wall", 11.5, 15.5, YB - 0.32, YB - 0.3, 0.4, H, MAT["water"], group="ca_feature")
boxb("water_basin", 11.4, 15.6, YB - 1.0, YB - 0.3, 0, 0.4, MAT["desk"])
boxb("water_basin_led", 11.5, 15.5, YB - 1.02, YB - 1.0, 0.34, 0.37, MAT["led"], group="ca_feature")
wl = light("water_wash", "AREA", 450, (13.5, YB - 1.0, 3.5), "ca_feature", target=(13.5, 0, 3.0), size=(4.0, 6.0))
wl.data.color = lin("#5f9cff")
boxb("sculpture_plinth", 12.8, 14.2, YB - 3.0, YB - 1.9, 0, 0.9, MAT["desk"], bevel=0.01)
bpy.ops.mesh.primitive_torus_add(major_radius=0.6, minor_radius=0.15, major_segments=64, minor_segments=24,
                                 location=(13.5, YB - 2.45, 1.75), rotation=(rad(70), rad(25), rad(15)))
sc = bpy.context.active_object; sc.name = "sculpture"; sc.data.materials.append(MAT["metal"])
for c in list(sc.users_collection):
    c.objects.unlink(sc)
ROOT.objects.link(sc); sc.scale = (1.0, 0.7, 1.35)
light("sculpture_spot", "SPOT", 220, (13.5, YB - 5.0, H - 0.05), "ca_accent", target=(13.5, YB - 2.45, 1.6), spot=18, blend=0.4)

# ---------------------------------------------------------------- stone pillars: double-height edge (row A) and along the glass (row B)
def stone_pillar(name, x0, x1, y, h, face_x):
    boxb(name, x0, x1, y - 0.5, y + 0.5, 0, h, MAT["stone"])
    boxb(f"{name}_groove", face_x - 0.02, face_x + 0.02, y - 0.03, y + 0.03, 0.1, h - 0.3, MAT["led"], group="ca_arch")
    light(f"{name}_graze", "SPOT", 140 if h > 8 else 90, (face_x - 0.3, y, 0.05), "ca_arch", target=(face_x, y, h), spot=20, blend=0.4)
for k, y in enumerate(ROW_A):
    stone_pillar(f"pillar_a_{k}", XB - 0.4, XB + 0.4, y, MID, XB - 0.42)
for k, y in enumerate(ROW_B):
    stone_pillar(f"pillar_b_{k}", 21.9, 22.9, y, HH, 21.88)

# ---------------------------------------------------------------- glazing and exterior
boxb("facade_glass", GX, GX + 0.04, YF, YB, 0, HH, MAT["window"])
for k in range(int((YB - YF) / 3.0) + 1):
    y = YF + k * 3.0
    boxb(f"mullion_{k}", GX - 0.03, GX + 0.07, y - 0.04, y + 0.04, 0, HH, MAT["metal"])
for z in (3.6, 7.6):
    boxb(f"transom_{z}", GX - 0.03, GX + 0.07, YF, YB, z, z + 0.08, MAT["metal"])
boxb("ground_out", GX + 0.04, 260, -200, 260, -0.15, -0.05, MAT["paving"])
boxb("kerb_led", GX + 0.4, GX + 0.45, YF, YB, -0.05, -0.02, MAT["led"], group="ca_facade")
boxb("canopy", GX + 0.1, 31.0, 6.0, 34.0, 5.6, 5.95, MAT["ceiling"])
boxb("canopy_fascia", 30.96, 31.0, 6.0, 34.0, 5.6, 5.68, MAT["led"], group="ca_facade")
for k in range(7):
    y = 8.0 + k * 4.0
    cyl(f"canopy_dl_{k}_lens", 0.07, 0.07, 0.01, (27.5, y, 5.59), MAT["lens"], seg=24, group="ca_facade")
    light(f"canopy_dl_{k}", "SPOT", 280, (27.5, y, 5.57), "ca_facade", spot=55, blend=0.6)
for k, y in enumerate((8.0, 18.0, 28.0)):
    cyl(f"canopy_col_{k}", 0.18, 0.18, 5.6, (30.6, y, -0.05), MAT["stone"], seg=24)


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
ASSET_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "lobby")
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

PLANTS = find_assets("plant_")
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



for k, y in enumerate((-2.0, 5.0, 12.0, 19.0, 26.0, 33.0, 40.0)):
    palm(f"palm_a_{k}", 33.5 + (k % 2) * 1.5, y, random.uniform(7.0, 9.5))
for k, y in enumerate((2.0, 11.0, 20.0, 29.0, 38.0)):
    palm(f"palm_b_{k}", 46.0, y, random.uniform(8.0, 10.0))


# ---------------------------------------------------------------- car at the entrance (models/2004_audi_s4.glb if present)
BASE = os.path.dirname(os.path.abspath(__file__))
PAINT = {"black": principled("paint_black", "#07080a", 0.18, 0.6, Coat_Weight=1.0, Coat_Roughness=0.03)}
MAT["rubber"] = principled("rubber", "#0c0c0c", 0.85)
def import_car(path, length, paint=None):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    root = bpy.data.objects.new(os.path.basename(path) + "_root", None); ROOT.objects.link(root)
    for o in new:
        for c in list(o.users_collection):
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
    if sy_ > sx_:
        root.rotation_euler = (0, 0, rad(-90)); cx, cy = cy, -cx
    root.scale = (s, s, s); root.location = (-cx * s, -cy * s, -mn.z * s)
    return root


car_e = bpy.data.objects.new("entrance_car", None); car_e.location = (27.4, 20.0, -0.05); car_e.rotation_euler = (0, 0, rad(-110))
light("car_key", "SPOT", 1500, (26.0, 18.0, 5.55), "ca_facade", target=(27.4, 20.0, 0.6), spot=35, blend=0.6)
light("car_rim", "AREA", 800, (29.5, 22.5, 5.5), "ca_facade", target=(27.4, 20.0, 0.5), size=(3.0, 1.0))
ROOT.objects.link(car_e)
car_path = os.path.join(BASE, "models", "2004_audi_s4.glb")
if os.path.exists(car_path):
    import_car(car_path, 4.57, "black").parent = car_e
else:
    print("no car model at", car_path, "- placeholder used")
    b = boxb("car_body", -2.3, 2.3, -0.9, 0.9, 0.25, 0.85, PAINT["black"]); modifiers(b, bevel=0.12, subsurf=2); b.parent = car_e
    c = boxb("car_cabin", -1.4, 0.8, -0.78, 0.78, 0.8, 1.32, MAT["window"]); modifiers(c, bevel=0.18, subsurf=2); c.parent = car_e


def sofa_arc(name, cx, cy, r, a0, a1, segs=18, mat=None):
    mat = mat or MAT["cream"]
    for i in range(segs):
        a = rad(a0 + (a1 - a0) * (i + 0.5) / segs)
        w = 2 * r * math.sin(rad(abs(a1 - a0)) / segs / 2) + 0.04
        px, py = cx + math.cos(a) * r, cy + math.sin(a) * r
        rbox(f"{name}_seat_{i}", px, py, 0.0, w + 0.03, 0.95, 0.42, a + math.pi / 2, mat, bevel=0.03)
        bx, by = cx + math.cos(a) * (r + 0.42), cy + math.sin(a) * (r + 0.42)
        rbox(f"{name}_back_{i}", bx, by, 0.4, w + 0.03, 0.22, 0.42, a + math.pi / 2, mat, bevel=0.04)
        if i % 3 == 1:
            cx2, cy2 = cx + math.cos(a) * (r + 0.22), cy + math.sin(a) * (r + 0.22)
            rbox(f"{name}_cushion_{i}", cx2, cy2, 0.42, 0.45, 0.14, 0.42, a + math.pi / 2,
                 MAT["green"] if i % 2 else MAT["caramel"], bevel=0.06)

def armchair(name, cx, cy, ang, mat=None):
    mat = mat or MAT["caramel"]
    rbox(f"{name}_seat", cx, cy, 0.0, 0.85, 0.8, 0.44, ang, mat, bevel=0.06)
    bx, by = local(cx, cy, ang, 0, -0.42)
    rbox(f"{name}_back", bx, by, 0.3, 0.9, 0.18, 0.55, ang, mat, bevel=0.07)
    for s in (-1, 1):
        ax, ay = local(cx, cy, ang, s * 0.45, -0.05)
        rbox(f"{name}_arm_{s}", ax, ay, 0.25, 0.14, 0.8, 0.38, ang, mat, bevel=0.06)


CHAIRS = find_assets("armchair")
if CHAIRS:
    def armchair(name, cx, cy, ang, mat=None):
        place_asset(name, CHAIRS[_seed(name) % len(CHAIRS)], cx, cy, 0.0, ang, height=0.9)
def side_table(name, x, y, lamp=True):
    cyl(f"{name}_top", 0.3, 0.3, 0.04, (x, y, 0.56), MAT["marble_top"], seg=40)
    cyl(f"{name}_stem", 0.05, 0.05, 0.56, (x, y, 0), MAT["brass"], seg=16)
    if lamp:
        table_lamp(f"{name}_lamp", x, y, 0.6, h=0.5, r=0.22)


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

def floor_lamp(name, x, y):
    cyl(f"{name}_base", 0.18, 0.18, 0.03, (x, y, 0), MAT["brass"], seg=32)
    cyl(f"{name}_stem", 0.015, 0.015, 1.4, (x, y, 0.03), MAT["brass"], seg=12)
    cyl(f"{name}_shade", 0.26, 0.21, 0.34, (x, y, 1.36), MAT["shade"], seg=40, caps=False)
    sphere(f"{name}_bulb", 0.03, (x, y, 1.5), MAT["filament"], seg=12, group="ca_deco")
    light(f"{name}_light", "POINT", 30, (x, y, 1.5), "ca_deco", radius=0.05)

def luggage_cart(name, x, y):
    boxb(f"{name}_deck", x - 0.6, x + 0.6, y - 0.35, y + 0.35, 0.12, 0.16, MAT["walnut"])
    for sd in (-1, 1):
        cyl(f"{name}_post_{sd}", 0.025, 0.025, 1.75, (x + sd * 0.55, y, 0.16), MAT["brass"], seg=12)
    cyl(f"{name}_bar", 0.025, 0.025, 1.1, (x - 0.55, y, 1.91), MAT["brass"], seg=12, rot=(0, math.pi / 2, 0))
    boxb(f"{name}_case_a", x - 0.5, x + 0.1, y - 0.3, y + 0.2, 0.16, 0.86, MAT["leather"], bevel=0.03)
    boxb(f"{name}_case_b", x + 0.12, x + 0.5, y - 0.25, y + 0.15, 0.16, 0.66, MAT["caramel"], bevel=0.03)
    boxb(f"{name}_case_c", x - 0.45, x + 0.45, y - 0.22, y + 0.18, 0.86, 1.08, MAT["metal"], bevel=0.03)


# ---------------------------------------------------------------- lounge (dense, close to camera)
boxb("rug_main", 7.6, 17.4, 3.4, 13.4, 0.0, 0.012, MAT["rug"])
sofa_arc("sofa_main", TABLE[0], TABLE[1], 3.0, 140, 280)
sofa_arc("sofa_far", TABLE[0], TABLE[1], 3.0, 15, 105)
armchair("chair_a", TABLE[0] + 2.9, TABLE[1] - 1.0, rad(-105))
armchair("chair_b", TABLE[0] + 2.6, TABLE[1] + 1.6, rad(-70))
cyl("coffee_table_top", 1.1, 1.1, 0.07, (TABLE[0], TABLE[1], 0.36), MAT["marble_top"], seg=64)
cyl("coffee_table_base", 0.7, 0.7, 0.36, (TABLE[0], TABLE[1], 0), MAT["metal"], seg=48)
side_table("side_main_a", TABLE[0] - 3.3, TABLE[1] + 1.4)
side_table("side_main_b", TABLE[0] + 1.6, TABLE[1] + 3.6)
# foreground sweep, bottom left of frame
sofa_arc("sofa_fg", 15.6, 3.0, 1.9, 120, 255, segs=14)
side_table("side_fg", 13.4, 4.2)
floor_lamp("floor_lamp_fg", 14.0, 1.0)
# second lounge between the walnut pillars and the reception
boxb("rug_mid", 4.4, 10.4, 17.0, 22.6, 0.0, 0.012, MAT["rug"])
sofa_straight("sofa_mid", 7.4, 22.0, math.pi, L=2.8)
armchair("chair_mid_a", 5.4, 18.4, rad(-30))
armchair("chair_mid_b", 9.4, 18.4, rad(30))
cyl("mid_table_top", 0.6, 0.6, 0.05, (7.4, 19.9, 0.38), MAT["marble_top"], seg=48)
cyl("mid_table_base", 0.4, 0.4, 0.38, (7.4, 19.9, 0), MAT["brass"], seg=32)
# centrepiece under the chandelier
cyl("centre_table_base", 0.45, 0.6, 0.72, (CHAND[0], CHAND[1], 0), MAT["desk"], seg=48)
cyl("centre_table_top", 0.85, 0.85, 0.05, (CHAND[0], CHAND[1], 0.72), MAT["marble_top"], seg=64)
flowers("centre_flowers", CHAND[0], CHAND[1], 0.77, r=0.6, vase_h=0.45)
light("centre_spot", "SPOT", 160, (CHAND[0] + 0.6, CHAND[1] - 1.5, H - 0.05), "ca_accent", target=(CHAND[0], CHAND[1], 1.2), spot=20, blend=0.4)
# back lounge, in front of the water wall
boxb("rug_back", 7.0, 18.0, 27.0, 35.0, 0.0, 0.012, MAT["rug"])
sofa_arc("sofa_back", 12.4, 31.6, 2.2, 200, 340)
armchair("chair_back_a", 9.6, 29.2, rad(-35))
armchair("chair_back_b", 15.4, 29.4, rad(35))
cyl("back_table_top", 0.7, 0.7, 0.06, (12.4, 30.8, 0.36), MAT["marble_top"], seg=48)
cyl("back_table_base", 0.45, 0.45, 0.36, (12.4, 30.8, 0), MAT["metal"], seg=32)
sofa_straight("sofa_back_left", 2.0, 30.0, rad(-90), L=3.0)
side_table("side_back_left", 2.0, 27.6)
# window seating between the two pillar rows
for k, y in enumerate((6.5, 13.0, 19.0, 25.0, 31.0)):
    armchair(f"chair_win_{k}_a", 20.4, y - 0.8, rad(-20) + math.pi * 0, MAT["cream"])
    armchair(f"chair_win_{k}_b", 20.4, y + 0.8, rad(200), MAT["cream"])
    side_table(f"side_win_{k}", 21.1, y, lamp=(k % 2 == 0))
# planting: big pots everywhere the reference has them
for nm, x, y, h, sp in (("plant_fg_left", 13.3, 1.4, 2.4, 1.5), ("plant_desk_front", 1.3, 3.4, 2.2, 1.35),
                        ("plant_desk_back", 1.6, 16.6, 2.1, 1.3), ("plant_art_r", 1.2, 23.4, 1.9, 1.2),
                        ("plant_wp_0", 4.5, 25.2, 2.0, 1.3), ("plant_wp_1", 8.5, 25.2, 2.0, 1.3),
                        ("plant_water_l", 9.6, YB - 1.2, 2.4, 1.4), ("plant_water_r", 17.4, YB - 1.2, 2.4, 1.4),
                        ("plant_lounge_r", 17.0, 12.6, 1.9, 1.25), ("plant_lounge_l", 8.6, 12.8, 1.7, 1.15),
                        ("plant_back_left", 2.0, 32.8, 2.0, 1.3), ("plant_edge_0", 18.0, 16.0, 2.0, 1.3),
                        ("plant_edge_1", 18.0, 28.0, 2.0, 1.3)):
    plant(nm, x, y, h, sp)
for k, (x, y) in enumerate(((23.2, 3.2), (23.2, 9.6))):
    plant(f"plant_near_{k}", x, y, 2.3, 1.4)
for k, y in enumerate(ROW_B):
    plant(f"plant_glass_{k}", 23.3, y + 1.4, 2.2, 1.35)
for k, (x, y) in enumerate(((1.3, 3.4), (4.5, 25.2), (8.5, 25.2), (9.6, YB - 1.2), (17.4, YB - 1.2), (13.3, 1.4))):
    light(f"plant_uplight_{k}", "SPOT", 45, (x + 0.35, y, 0.05), "ca_accent", target=(x, y, 2.0), spot=40, blend=0.5)
floor_lamp("floor_lamp_desk", 4.4, 6.4)
floor_lamp("floor_lamp_mid", 10.6, 21.8)
flowers("desk_flowers", 3.0, 11.5, 1.13, r=0.3, vase_h=0.3)
flowers("lounge_flowers", TABLE[0], TABLE[1], 0.43, r=0.28, vase_h=0.22)
flowers("back_flowers", 12.4, 30.8, 0.42, r=0.22, vase_h=0.2)
luggage_cart("luggage_cart", 4.6, 16.6)

DECOR = find_assets("decor_")
if DECOR:
    for i, (x, y, z) in enumerate(((3.0, 9.6, 1.13), (3.0, 13.4, 1.13), (TABLE[0] - 0.6, TABLE[1] + 0.3, 0.43),
                                   (12.8, 30.4, 0.42), (CHAND[0] + 0.7, CHAND[1] - 0.2, 0.77), (7.7, 19.7, 0.43))):
        place_asset(f"decor_{i}", DECOR[i % len(DECOR)], x, y, z, rad(i * 53), height=0.28, face=0)
print(f"[uniser] assets: plants={len(PLANTS)} armchairs={len(CHAIRS)} sofas={len(SOFAS)} decor={len(DECOR)}")


# ---------------------------------------------------------------- chandelier: three-tier crystal ring chandelier
MAT["crystal"] = shadow_clear(principled("crystal", "#ffffff", 0.06, Transmission_Weight=1.0, IOR=1.9), "#ffffff")
bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
bmesh.ops.scale(bm, vec=Vector((0.028, 0.028, 0.055)), verts=bm.verts)
CRYSTAL = bpy.data.meshes.new("crystal_drop"); bm.to_mesh(CRYSTAL); bm.free(); CRYSTAL.materials.append(MAT["crystal"])
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.018, radius2=0.018, depth=0.12,
                                         matrix=Matrix.Translation((0, 0, 0.06)))
CANDLE = bpy.data.meshes.new("candle_sleeve"); bm.to_mesh(CANDLE); bm.free(); CANDLE.materials.append(MAT["china"])

def ring(name, r, z, minor=0.025):
    bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=minor, major_segments=96, minor_segments=12,
                                     location=(CHAND[0], CHAND[1], z))
    ob = bpy.context.active_object; ob.name = name; ob.data.materials.append(MAT["brass"])
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    ROOT.objects.link(ob)
    return ob

cx, cy = CHAND
TIERS = [(2.1, 5.3, 28, 1.6), (1.45, 4.55, 20, 1.3), (0.8, 3.85, 12, 1.0)]   # radius, height, candles, strand length
ci = 0
for t, (r, z, nc, sl) in enumerate(TIERS):
    ring(f"chand_ring_{t}", r, z)
    ring(f"chand_ring_{t}_inner", r - 0.12, z + 0.06, 0.015)
    for k in range(6):
        a = k * math.pi / 3 + t * 0.3
        cyl(f"chand_spoke_{t}_{k}", 0.008, 0.008, r, (cx, cy, z), MAT["brass"], seg=8, rot=(0, math.pi / 2, a))
    for k in range(nc):
        a = 2 * math.pi * k / nc
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r
        sl_ob = bpy.data.objects.new(f"chand_candle_{t}_{k}", CANDLE); sl_ob.location = (x, y, z + 0.02); ROOT.objects.link(sl_ob)
        sphere(f"chand_flame_{t}_{k}", 0.022, (x, y, z + 0.17), MAT["filament"], seg=10, group="ca_deco")
        if k % 2 == 0:
            light(f"chand_light_{ci}", "POINT", 14, (x, y, z + 0.19), "ca_deco", radius=0.03); ci += 1
    strands = int(2 * math.pi * r / 0.11)
    for k in range(strands):
        a = 2 * math.pi * (k + 0.5) / strands
        x, y = cx + math.cos(a) * (r - 0.02), cy + math.sin(a) * (r - 0.02)
        n = int(sl / 0.12) - (k % 3)
        for j in range(n):
            ob = bpy.data.objects.new(f"chand_drop_{t}_{k}_{j}", CRYSTAL)
            ob.location = (x, y, z - 0.08 - j * 0.12); ob.rotation_euler = (0, 0, a); ROOT.objects.link(ob)
# central stem, bowl of drops and finial
cyl("chand_stem", 0.04, 0.04, H - 3.4, (cx, cy, 3.4), MAT["brass"], seg=16)
for j in range(10):
    rr = 0.45 - j * 0.04
    for k in range(max(6, int(2 * math.pi * rr / 0.1))):
        a = 2 * math.pi * k / max(6, int(2 * math.pi * rr / 0.1))
        ob = bpy.data.objects.new(f"chand_bowl_{j}_{k}", CRYSTAL)
        ob.location = (cx + math.cos(a) * rr, cy + math.sin(a) * rr, 3.6 - j * 0.1); ROOT.objects.link(ob)
sphere("chand_finial", 0.09, (cx, cy, 2.55), MAT["crystal"], seg=24)
light("chand_core", "POINT", 60, (cx, cy, 4.4), "ca_deco", radius=0.3)
for k in range(3):
    a = k * 2 * math.pi / 3
    cyl(f"chand_chain_{k}", 0.006, 0.006, H - TIERS[0][1], (cx + math.cos(a) * 1.0, cy + math.sin(a) * 1.0, TIERS[0][1]),
        MAT["brass"], seg=6, rot=(0, -math.atan2(1.0, H - TIERS[0][1]) * 0, 0))
cyl("chand_canopy", 0.5, 0.5, 0.08, (cx, cy, H - 0.08), MAT["brass"], seg=48)


# ---------------------------------------------------------------- day sky card (its own pass)
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=False, segments=48, radius1=420, radius2=420, depth=520, matrix=Matrix.Translation((0, 0, 230)))
sky_ob = finish("day_sky_card", bm, MAT["skycard"], loc=(GX, 17.0, 0))
sky_ob.lightgroup = "day_sky"
for f in sky_ob.data.polygons:
    pass
world_card = sky_ob

# ---------------------------------------------------------------- night: dusk world + distant skyline
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
for i in range(70):
    th = rad(-50 + random.random() * 100); dist = 500 + random.random() * 500
    x = GX + math.cos(th) * dist; y = 17 + math.sin(th) * dist
    tall = random.random() < 0.15
    w = random.uniform(18, 40) if tall else random.uniform(25, 60); d = w * random.uniform(0.7, 1.3)
    h = random.uniform(120, 220) if tall else 20 + random.random() ** 1.6 * 70
    boxb(f"tower_{i:03d}", x, x + w, y, y + d, -0.1, h, MAT["city"], group="sky")

# ---------------------------------------------------------------- daylight (rendered as its own passes)
if DAYLIGHT:
    for name, elev, azi, strength in (("day_morning", 14, 10, 3.5), ("day_midday", 58, 40, 4.5), ("day_evening", 10, -35, 3.0)):
        ld = bpy.data.lights.new(name, "SUN"); ld.energy = strength; ld.angle = rad(1.5)
        ob = bpy.data.objects.new(name, ld); ROOT.objects.link(ob); ob.lightgroup = name
        e, a = rad(elev), rad(azi)
        d = Vector((-math.cos(e) * math.cos(a), -math.cos(e) * math.sin(a), -math.sin(e)))
        ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()



# ---------------------------------------------------------------- camera (LOBBY_CAMERA): 2-point perspective, straight verticals
cd = bpy.data.cameras.new("hero"); cd.sensor_fit = "VERTICAL"; cd.angle_y = rad(64); cd.clip_end = 4000
cd.shift_y = 0.06
cam = bpy.data.objects.new("hero", cd); ROOT.objects.link(cam)
CX, CY, CZ = 19.5, -1.0, 1.4
cam.location = (CX, CY, CZ)
yaw = rad(22.0)
aim(cam, (CX - math.sin(yaw) * 30, CY + math.cos(yaw) * 30, CZ)); scene.camera = cam


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
scene.cycles.sample_clamp_indirect = 3.0; scene.cycles.sample_clamp_direct = 6.0; scene.cycles.blur_glossy = 1.0
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
    "ca-arch": (XB - 0.42, ROW_A[1], 3.0), "ca-deco": (CHAND[0], CHAND[1], 4.6), "ca-feature": (13.5, YB - 0.4, 3.0),
    "ca-accent": (0.16, 20.0, 2.7), "ca-cove": (XS + 0.05, 10.0, LOW + 0.3), "ca-facade": (27.4, 20.0, 1.0),
    "ca-tunable": (11.0, 8.0, H), "reception": (3.0, 11.5, 1.1),
}

bpy.context.view_layer.update()
spots = {}
for k, co in HOT.items():
    v = world_to_camera_view(scene, cam, Vector(co))
    spots[k] = {"u": round(v.x, 4), "v": round(1 - v.y, 4), "visible": bool(0 <= v.x <= 1 and 0 <= v.y <= 1 and v.z > 0)}
with open(os.path.join(OUT, "hotspots.json"), "w") as f:
    json.dump({"camera": "hero", "points": spots}, f, indent=2)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "lobby.blend"))
print(f"[uniser] built lobby, mode={MODE}, passes={written}")

if MODE != "build":
    scene.render.filepath = os.path.join(OUT, f"preview_{MODE}.png")
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    print("[uniser] done:", OUT)
