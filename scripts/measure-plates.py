#!/usr/bin/env python3
"""
Measure a plate set the way the shader will composite it.

The runtime's gains are calibrated numbers, not dialled ones, and this is
where the numbers come from. It reimplements `weights.ts` and the fragment
shader exactly — the gamma/scale decode, the per-layer gain, level^2.2, the
luminance-normalised and saturation-capped tint, the fixed-CCT circuits, the
sky crossfade, AgX and the sRGB encode — so a figure printed here is the
figure the browser renders.

    python3 scripts/measure-plates.py --dir public/plates/restaurant
    python3 scripts/measure-plates.py --dir public/plates/restaurant --solve
    python3 scripts/measure-plates.py --dir public/plates/showroom --gains lm.json
    python3 scripts/measure-plates.py --still state.json --out public/plates/room

`--gains` derives a lumen-proportional table for every circuit from a JSON
map of `layer -> total lumens`, anchored so the reference layer alone at full
reads about 0.25 mean display luminance. That is how every room's gains were
produced, and re-running it is the right response to a re-render.

`--still` renders the holding image a room shows before its live layers land.
It takes the JSON that `scripts/dump-state.mts` prints — real device states
out of the real store, after the real scene has settled — so the still is the
first live frame rather than an artist's impression of it. The converter's own
`still_*.jpg` is not that: it lights every layer at once, which mixes the day
and night skies and turns both door indicators on at the same time.

`SETS` below mirrors `components/stage/plates/profiles/*.ts` by hand. There is
no import path from Python to TypeScript and inventing one would be worse —
but a profile edited there and not here makes this tool lie, so the two are
checked against each other by `--check`.

Needs Pillow and numpy, which is why it is Python rather than another .mts:
Node has no image decoder without pulling in a native dependency, and a dev
measuring tool is not worth one.

Measuring the glazing needs care, and two choices here are deliberate.

The region is a *mask*, not a bounding box. A box over the right-hand third
of this camera is mostly columns, tables and chairs, and their brightness
swamps the glass: with the room lit at 1 AM that box reads 0.252 against the
daytime 0.230, which says the night sky is as bright as noon when it is not.
The mask is instead the pixels where the daytime view plate is itself bright,
which is the glass and nothing else — about 4% of the frame.

The statistic is the *median*, not the mean. The glazing is a dark sky filled
with thousands of lit tower windows, so the mean sits between the two and
describes neither. The median is the sky behind the towers and p98 is the
towers, and a night view needs the first low and the second high.

Targets, at 01:00 and 13:00 with every circuit off:

  * `sky`     — glass median 0.03–0.12, a dark navy, with p98 above 0.45 so
                the skyline still reads as points of light.
  * `sky_day` — glass mean 0.65–0.80, and the frame must not clip badly.
"""
import argparse, json, math, pathlib, re, sys

try:
    import numpy as np
    from PIL import Image
except ImportError:
    sys.exit("needs Pillow and numpy:  pip3 install pillow numpy")

ROOT = pathlib.Path(__file__).resolve().parent.parent

# ------------------------------------------------------------------ #
# The profiles, read from the TypeScript the runtime uses.             #
# ------------------------------------------------------------------ #

PROFILE_DIR = ROOT / "components/stage/plates/profiles"


def _strip_comments(src: str) -> str:
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return re.sub(r"//[^\n]*", "", src)


def _block(src: str, key: str) -> str:
    """The `{ ... }` or `[ ... ]` a property is assigned, brace-matched."""
    m = re.search(rf"\b{key}\s*:\s*([{{\[])", src)
    if not m:
        return ""
    open_c = m.group(1)
    close_c = "}" if open_c == "{" else "]"
    depth, i = 0, m.end(1) - 1
    while i < len(src):
        if src[i] == open_c:
            depth += 1
        elif src[i] == close_c:
            depth -= 1
            if depth == 0:
                return src[m.end(1):i]
        i += 1
    return ""


def load_profile(name: str) -> dict:
    """One room's calibration, parsed out of `plates/profiles/<name>.ts`.

    Read rather than restated. This table used to be kept in step with the
    TypeScript by hand, and it was not: the gains for all four rooms lived
    in one dict with duplicate keys in it, so this tool spent months
    measuring the restaurant with the lobby's sky gain and reporting that
    the restaurant was out of specification. A profile is the one thing
    here that genuinely has a single home, and this is it.
    """
    path = PROFILE_DIR / f"{name}.ts"
    if not path.exists():
        sys.exit(f"no profile at {path.relative_to(ROOT)}")
    src = _strip_comments(path.read_text())

    def number(key: str, default=None):
        m = re.search(rf"\b{key}\s*:\s*(-?[0-9.]+)", src)
        if m:
            return float(m.group(1))
        if default is None:
            sys.exit(f"{path.name}: no {key}")
        return default

    def pairs(key: str) -> dict:
        return {k: float(v) for k, v in re.findall(r"([A-Za-z_][\w]*)\s*:\s*(-?[0-9.]+)",
                                                   _block(src, key))}

    def strings(key: str) -> list:
        return re.findall(r'"([^"]+)"', _block(src, key))

    bus = re.search(r'\bcolourBus\s*:\s*(?:"([^"]+)"|null)', src)
    return {
        "gain": pairs("gain"),
        "exposure": number("exposure"),
        "tint": number("tintSaturation"),
        "neutral": strings("neutralLayers"),
        "fixed": {k: int(v) for k, v in pairs("fixedTint").items()},
        "rgbw": strings("rgbwLayers"),
        "bus": bus.group(1) if bus and bus.group(1) else None,
    }


_ap = argparse.ArgumentParser(add_help=False)
_ap.add_argument("--dir", default="public/plates/restaurant")
_known, _ = _ap.parse_known_args()
PLATES = ROOT / _known.dir
WINDOW_X = 0.62

# `room_sheer` and `room_closed` are the same room behind a drawn curtain:
# same circuits, same calibration, further renders. They take the profile
# their open twin names.
SET = load_profile(re.sub(r"_(sheer|closed)$", "", PLATES.name))
GAIN = SET["gain"]
EXPOSURE = SET["exposure"]
TINT_SATURATION = SET["tint"]

MAN = json.loads((PLATES / "manifest.json").read_text())
LAYERS = list(MAN["layers"].keys())
# Roles by name, exactly as `plates/manifest.ts` classifies them: anything
# that is not one of the two views or a sun angle is a circuit.
DAY_ORDER = ["day_morning", "day_midday", "day_evening"]
CIRCUITS = [l for l in LAYERS if l not in ("sky", "sky_day", "day_sky") and l not in DAY_ORDER]

_CACHE: dict[tuple[str, str], "np.ndarray"] = {}


def linear(layer, tier="sd", plates=None):
    """One decoded plate in linear light.

    Loaded on demand and cached. Sixteen HD plates held as float64 is 800 MB,
    which is the difference between this running on a laptop and not, so the
    still renderer accumulates one layer at a time and the measurement paths
    never ask for HD at all.
    """
    base = plates or PLATES
    # A covering set without a layer borrows the base set's, exactly as
    # `PlateStage` does: mix(a, a, t) is a, which is the statement "this
    # circuit does not change as the covering moves". The office's closed
    # render has no `ow_cove`, and a cove inside a dropped ceiling is not
    # something a blind at the window reaches.
    if base != PLATES and not (base / tier / f"{layer}.webp").exists():
        base = PLATES
    key = (str(base), f"{tier}/{layer}")
    hit = _CACHE.get(key)
    if hit is None:
        man = MAN if base == PLATES else json.loads((base / "manifest.json").read_text())
        img = np.asarray(Image.open(base / tier / f"{layer}.webp").convert("RGB"), np.float32) / np.float32(255)
        hit = (img ** np.float32(man["gamma"])) * np.float32(man["layers"][layer]["scale"])
        _CACHE[key] = hit
    return hit


class _Lin(dict):
    """`LIN[layer]`, kept for the measurement code that reads it as a map."""

    def __missing__(self, layer):
        return linear(layer)

    def __contains__(self, layer):
        return layer in LAYERS


LIN = _Lin()

AGX_IN = np.array([[0.856627153315983, 0.0951212405381588, 0.0482516061458583],
                   [0.137318972929847, 0.761241990602591, 0.101439036467562],
                   [0.11189821299995, 0.0767994186031903, 0.811302368396859]])
AGX_OUT = np.array([[1.1271005818144368, -0.11060664309660323, -0.016493938717834573],
                    [-0.1413297634984383, 1.157823702216272, -0.016493938717834257],
                    [-0.14132976349843826, -0.11060664309660294, 1.2519364065950405]])


def lum(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def agx(c):
    c = np.maximum(c @ AGX_IN, 1e-10)
    c = np.clip((np.log2(c) + 12.47393) / (4.026069 + 12.47393), 0, 1)
    x2 = c * c
    x4 = x2 * x2
    c = 15.5 * x4 * x2 - 40.14 * x4 * c + 31.96 * x4 - 6.868 * x2 * c + 0.4298 * x2 + 0.1191 * c - 0.00232
    return np.maximum(c @ AGX_OUT, 0.0) ** 2.2


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def glass_mask():
    """The glazing, as the pixels the daytime view plate actually lights.

    None for a set with no exterior at all — the showroom has no glazing, so
    there is no `sky_day` to find the glass with and nothing to measure.
    """
    day_view = "sky_day" if "sky_day" in LIN else ("day_sky" if "day_sky" in LIN else None)
    if day_view is None:
        # A set with one view plate still has glass; it just has to be
        # found with the only sky render there is.
        day_view = "sky" if "sky" in LIN else None
    if day_view is None:
        return None
    L = lum(LIN[day_view])
    return L > np.percentile(L, 99) * 0.15


GLASS = glass_mask()


def window(a):
    """Kept for the bounding-box view; `GLASS` is what the targets use."""
    return a[:, int(WINDOW_X * a.shape[1]):]


def dayness(m):
    if m <= 360: return 0.0
    if m < 480: return (m - 360) / 120
    if m <= 1020: return 1.0
    if m < 1140: return 1 - (m - 1020) / 120
    return 0.0


def cct_rgb(k):
    t = min(max(k, 1000), 40000) / 100
    r = 255.0 if t <= 66 else 329.698727446 * ((t - 60) ** -0.1332047592)
    g = 99.4708025861 * math.log(t) - 161.1195681661 if t <= 66 else 288.1221695283 * ((t - 60) ** -0.0755148492)
    b = 255.0 if t >= 66 else (0.0 if t <= 19 else 138.5177312231 * math.log(t - 10) - 305.0447927307)
    return np.array([min(max(r, 0), 255), min(max(g, 0), 255), min(max(b, 0), 255)])


def srgb_to_linear(c):
    c = np.asarray(c, float)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def unit(c):
    L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    return c / L if L > 1e-6 else c


def hsv_pure(h):
    hh = h % 360
    x = 1 - abs((hh / 60) % 2 - 1)
    return np.array([(1, x, 0), (x, 1, 0), (0, 1, x), (0, x, 1), (x, 0, 1), (1, 0, x)][int(hh // 60)], float)


def tint(cct, hue, sat):
    base = 1 + (unit(srgb_to_linear(cct_rgb(cct) / 255)) - 1) * TINT_SATURATION
    if sat <= 0:
        return base
    return base + (unit(srgb_to_linear(hsv_pure(hue))) - base) * min(max(sat / 100, 0), 1)


def day_weights(clock, env):
    lo, hi = env["sunriseMin"], env["sunsetMin"]
    el = math.sin(math.pi * (clock - lo) / (hi - lo)) if lo < clock < hi else 0.0
    amt = min((max(el, 0) ** 1.3) * env["outdoorPeakLux"] / 45000, 1.0)
    t = min(max((clock - lo) / (hi - lo), 0), 1)
    if t <= 0.2: w = [1, 0, 0]
    elif t < 0.5: k = (t - 0.2) / 0.3; w = [1 - k, k, 0]
    elif t < 0.8: k = (t - 0.5) / 0.3; w = [0, 1 - k, k]
    else: w = [0, 0, 1]
    return [x * amt for x in w]


ENV = {"sunriseMin": 380, "sunsetMin": 1135, "outdoorPeakLux": 95000}


# ------------------------------------------------------------------ #
# The curtain, mirroring plates/window.ts and the WIPE shader.         #
# ------------------------------------------------------------------ #

def _declared_window(name: str):
    """A `plates.curtain.window` a space measured by hand, if it has one.

    Read out of the TypeScript for the same reason the profiles are: a
    second copy of a measurement is a measurement that will go stale.
    """
    for path in sorted((ROOT / "lib/spaces").rglob("*.ts")):
        src = _strip_comments(path.read_text())
        if f'dir: "/plates/{name}"' not in src:
            continue
        block = _block(src, "window")
        if not block:
            continue
        quad = re.findall(r"\[\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*\]", _block(block, "quad"))
        if len(quad) != 4:
            continue
        travel = re.search(r'travel:\s*"([^"]+)"', block)
        pad = re.search(r"pad:\s*([0-9.]+)", block)
        return {
            "quad": [[float(a), float(b)] for a, b in quad],
            "pad": float(pad.group(1)) if pad else 0.02,
            "travel": travel.group(1) if travel else "split",
        }
    return None


_HOTSPOTS = PLATES / "hotspots.json"
_PROJECTED = json.loads(_HOTSPOTS.read_text()).get("curtain") if _HOTSPOTS.exists() else None
# The space's own measurement wins, exactly as `PlateStage` resolves it.
CURTAIN = _declared_window(re.sub(r"_(sheer|closed)$", "", PLATES.name)) or _PROJECTED
# A plate set with a `_closed` sibling has a covering that moves; one with
# a `_sheer` sibling as well has two of them. In shader order, and matching
# `PlateStage`: open, then the middle state if there is one, then shut.
CURTAIN_SETS = [PLATES]
if (PLATES.parent / f"{PLATES.name}_closed").is_dir():
    if (PLATES.parent / f"{PLATES.name}_sheer").is_dir():
        CURTAIN_SETS.append(PLATES.parent / f"{PLATES.name}_sheer")
    CURTAIN_SETS.append(PLATES.parent / f"{PLATES.name}_closed")
# Which blend role each set plays, as `PlateRenderer` assigns them: a
# second set is the *shut* one, not the middle one.
CURTAIN_ROLES = ([0, 1, 2] if len(CURTAIN_SETS) == 3
                 else [0, 2] if len(CURTAIN_SETS) == 2 else [0])


def smoothstep(a, b, x):
    k = np.clip((x - a) / (b - a), 0, 1)
    return k * k * (3 - 2 * k)


def _square_to_quad(q):
    """Heckbert's closed form, as `plates/window.ts` uses it."""
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = q
    sx, sy = x0 - x1 + x2 - x3, y0 - y1 + y2 - y3
    if abs(sx) < 1e-9 and abs(sy) < 1e-9:
        return np.array([[x1 - x0, x3 - x0, x0], [y1 - y0, y3 - y0, y0], [0, 0, 1]], float)
    dx1, dx2, dy1, dy2 = x1 - x2, x3 - x2, y1 - y2, y3 - y2
    den = dx1 * dy2 - dx2 * dy1
    g = (sx * dy2 - dx2 * sy) / den
    h = (dx1 * sy - sx * dy1) / den
    return np.array([[x1 - x0 + g * x1, x3 - x0 + h * x3, x0],
                     [y1 - y0 + g * y1, y3 - y0 + h * y3, y0],
                     [g, h, 1]], float)


_TS_CACHE = {}


def window_coords(shape):
    """`t` along the track, `s` up the glass, and how far inside we are."""
    if CURTAIN is None:
        return None
    if shape in _TS_CACHE:
        return _TS_CACHE[shape]
    h, w = shape
    inv = np.linalg.inv(_square_to_quad(CURTAIN["quad"]))
    # Pixel centres, in the same normalised uv the shader samples with.
    uu, vv = np.meshgrid((np.arange(w) + 0.5) / w, (np.arange(h) + 0.5) / h)
    den = inv[2, 0] * uu + inv[2, 1] * vv + inv[2, 2]
    safe = np.where(np.abs(den) < 1e-6, 1e-6, den)
    t = (inv[0, 0] * uu + inv[0, 1] * vv + inv[0, 2]) / safe
    sc = (inv[1, 0] * uu + inv[1, 1] * vv + inv[1, 2]) / safe
    pad = CURTAIN.get("pad", 0.02)
    us = [q[0] for q in CURTAIN["quad"]]
    vs = [q[1] for q in CURTAIN["quad"]]
    soft_t = 4.0 / max(1.0, (max(us) - min(us)) * w)
    soft_s = 4.0 / max(1.0, (max(vs) - min(vs)) * h)

    def axis(x, soft):
        return (smoothstep(-pad - soft, -pad + soft, x)
                * smoothstep(-pad - soft, -pad + soft, 1.0 - x))

    _TS_CACHE[shape] = (t, sc, np.where(den > 1e-6, axis(t, soft_t) * axis(sc, soft_s), 0.0))
    return _TS_CACHE[shape]


def cover_at(p, t, s):
    """How much of the opening a covering has taken. Mirrors `coverAt`.

    A blind comes down `s` on one hard edge; curtains come along `t` on a
    pair of complementary ones — complementary so the feathers add up to
    one where the panels meet rather than fading into each other and
    leaving a seam down the middle of a closed blackout.
    """
    if p <= 0:
        return 0.0
    if p >= 1:
        return 1.0
    if (CURTAIN or {}).get("travel") == "drop":
        hd = 0.008
        return smoothstep(1.0 - p - hd, 1.0 - p + hd, s)
    reach = p * 0.5 + 0.01 * math.sin(math.pi * p) * np.sin(s * 12.0)
    h = 0.015
    return np.clip((1.0 - smoothstep(reach - h, reach + h, t))
                   + smoothstep(1.0 - reach - h, 1.0 - reach + h, t), 0, 1)


def curtain_shares(curtain, shape):
    """Each plate set's per-pixel share, by role: open, middle, shut."""
    sheer, blackout = (float(np.clip(x, 0, 1)) for x in curtain)
    # A one-covering window has no middle track, whatever its shade calls it.
    if len(CURTAIN_SETS) < 3:
        sheer = 0.0
    ts = window_coords(shape)
    if ts is None:
        m1, m2 = sheer, blackout
    else:
        t, s, inside = ts
        m1 = sheer + (cover_at(sheer, t, s) - sheer) * inside
        m2 = blackout + (cover_at(blackout, t, s) - blackout) * inside
    by_role = [(1 - m1) * (1 - m2), m1 * (1 - m2), m2]
    return [by_role[r] for r in CURTAIN_ROLES]


def hex_to_linear(hex_s):
    """`#5b6f9e` to a linear multiplier at unit luminance. Mirrors `weights.ts`."""
    if not hex_s:
        return np.array([1.0, 1.0, 1.0])
    h = hex_s.strip().lstrip("#")
    if len(h) != 6:
        return np.array([1.0, 1.0, 1.0])
    rgb = srgb_to_linear(np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]))
    return unit(rgb)


def layer_weight(layer, targets, clock, g, mix=None, tint_rgb=None):
    """One layer's RGB weight, exactly as `computeWeights` works it out.

    `mix` is a scene's `daylight` map, 0-100 per exterior layer; None means
    follow the clock, which is what every space did before scenes could name
    an hour of their own.
    """
    night = 1 - dayness(clock)
    sky_tint = np.array([1.0, 1.0, 1.0]) if tint_rgb is None else tint_rgb
    # One view plate and no night render: it follows the day with a floor.
    sole_view = not any(l in LAYERS for l in ("sky_day", "day_sky"))
    if layer in CIRCUITS:
        st = targets.get(layer.replace("_", "-"))
        if not st or not st.get("on"):
            return None
        w = (st.get("level", 0) / 100) ** 2.2 * g.get(layer, 1)
        bus = targets.get(SET["bus"]) if SET["bus"] else None
        if not (bus and bus.get("on") and bus.get("sat", 0) > 0):
            bus = None
        if bus and layer in SET["rgbw"]:
            lit = {**st, "hue": bus.get("hue", 0), "sat": 100}
        elif layer in SET["fixed"]:
            lit = {**st, "cct": SET["fixed"][layer], "hue": 0, "sat": 0}
        else:
            lit = st
        t = (np.array([1.0, 1.0, 1.0]) if layer in SET["neutral"]
             else tint(lit.get("cct", 2700), lit.get("hue", 0), lit.get("sat", 0)))
        return w * t
    if mix is not None:
        return sky_tint * (mix.get(layer, 0) / 100) * g.get(layer, 1)
    if layer == "sky":
        share = max(0.08, 1 - night) if sole_view else night
        return sky_tint * share * g.get(layer, 1)
    if layer in ("sky_day", "day_sky"):
        return sky_tint * (1 - night) * g.get(layer, 1)
    w = day_weights(clock, ENV)[DAY_ORDER.index(layer)]
    return sky_tint * w * g.get(layer, 1)


def render(targets, clock, gain=None, exposure=EXPOSURE, mix=None, tier="sd",
           plates=None, curtain=(0.0, 0.0), tint=None):
    """The composite, as the browser draws it.

    `curtain` is the two tracks, each 0 drawn back to 1 drawn across. The
    three plate sets are summed separately and weighted by the per-pixel
    share `curtain_shares` works out, exactly as the three accumulate passes
    in `PlateRenderer` do — light adds linearly, so a share applied to a
    finished sum and the same share applied layer by layer are the same
    picture, and this does it the first way because that is what the shader
    does and the point of this file is to agree with it.
    """
    g = {**GAIN, **(gain or {})}
    base = plates or PLATES
    sets = CURTAIN_SETS if (base == PLATES and len(CURTAIN_SETS) > 1) else [base]
    shape = linear(LAYERS[0], tier, base).shape[:2]
    shares = curtain_shares(curtain, shape) if len(sets) > 1 else [1.0]

    hdr = None
    for k, folder in enumerate(sets):
        share = shares[k]
        if np.isscalar(share):
            if share <= 0:
                continue
        elif not np.any(share > 1e-6):
            continue
        acc = None
        for l in LAYERS:
            w = layer_weight(l, targets, clock, g, mix, hex_to_linear(tint))
            if w is None:
                continue
            contrib = linear(l, tier, folder) * np.asarray(w, np.float32)
            acc = contrib if acc is None else acc + contrib
        if acc is None:
            continue
        acc *= np.float32(share) if np.isscalar(share) else share.astype(np.float32)[..., None]
        hdr = acc if hdr is None else hdr + acc
    if hdr is None:
        hdr = np.zeros_like(linear(LAYERS[0], tier, base))
    return to_srgb(agx(hdr * exposure))


OFF = {c.replace("_", "-"): {"on": False} for c in CIRCUITS}


def check_window():
    """Does the declared opening still cover where the blind actually is?

    A hand-measured quad is a snapshot of a camera. Re-render the set with
    the camera a few degrees over and the quad still parses, still
    produces a mask, and wipes the wrong rectangle — silently. So it is
    checked against the thing it was derived from: the region where
    lowering the covering changes the view.
    """
    if CURTAIN is None or len(CURTAIN_SETS) < 2:
        return True
    shut = CURTAIN_SETS[-1]
    view = "day_sky" if "day_sky" in LAYERS else "sky_day" if "sky_day" in LAYERS else "sky"
    delta = lum(linear(view, "sd", PLATES)) - lum(linear(view, "sd", shut))
    moved = delta > delta.max() * 0.18
    ts = window_coords(delta.shape)
    inside = ts[2] > 0.5
    caught = float((moved & inside).sum() / max(moved.sum(), 1))
    stray = float((inside & ~moved).sum() / max(inside.sum(), 1))
    ok = caught >= 0.9
    print(f"  {'ok ' if ok else 'NO '}window  travel {CURTAIN.get('travel', 'split'):5s}"
          f"  covers {caught:.1%} of where the covering actually changes the view"
          f"  (target >=90%), and {stray:.1%} of the quad is elsewhere")
    return ok


def declared_circuits():
    """Light circuits a space declares that this plate set cannot draw.

    Silent today and visible here: a device with no layer still gets a
    slider, an energy figure and a place in every scene, and does exactly
    nothing to the picture. Worth one line in the report rather than a
    client finding it.
    """
    name = re.sub(r"_(sheer|closed|fan)$", "", PLATES.name)
    for path in sorted((ROOT / "lib/spaces").rglob("*.ts")):
        src = _strip_comments(path.read_text())
        if f'dir: "/plates/{name}"' not in src:
            continue
        ids = re.findall(r'id:\s*"([a-z]{2}-[a-z-]+)",\s*\n\s*kind:\s*"light"', src)
        missing = [i.replace("-", "_") for i in ids if i.replace("-", "_") not in MAN["layers"]]
        if missing:
            print(f"  NO circuit {', '.join(missing)} declared with no plate in this set"
                  f" — the control works and the picture does not move")
        return not missing
    return True


def report(gain=None):
    circuits_ok = declared_circuits()
    window_ok = check_window()
    if GLASS is None:
        print("  this plate set has no sky layers, so there is nothing to check here.")
        print("  use --gains to derive the circuit table instead.")
        return window_ok and circuits_ok
    night = lum(render(OFF, 60, gain))[GLASS]            # 01:00
    dayimg = render(OFF, 13 * 60, gain)                  # 13:00
    day = lum(dayimg)[GLASS]
    g = {**GAIN, **(gain or {})}
    nmed, np98 = float(np.median(night)), float(np.percentile(night, 98))
    dmean = float(day.mean())
    clip = float((dayimg.max(-1) >= 0.999).mean() * 100)
    ok = lambda b: "ok " if b else "NO "
    sky_ok = 0.03 <= nmed <= 0.12 and np98 >= 0.45
    day_ok = 0.65 <= dmean <= 0.80
    dayname = "sky_day" if "sky_day" in LIN else "day_sky"
    print(f"  {ok(sky_ok)}sky     gain {g.get('sky', 1):>6}   01:00 glass median {nmed:.3f} (target 0.03-0.12)"
          f"   skyline p98 {np98:.3f} (target >=0.45)")
    print(f"  {ok(day_ok)}{dayname} gain {g.get(dayname, 1):>6}   13:00 glass mean   {dmean:.3f} (target 0.65-0.80)"
          f"   frame clipped {clip:.2f}%")
    return sky_ok and day_ok and window_ok and circuits_ok


def solve():
    if GLASS is None:
        print("  no sky layers in this plate set; nothing to solve.")
        return
    print("Solving by bisection inside the glass mask:\n")
    day_view = "sky_day" if "sky_day" in LIN else "day_sky"
    for layer, clock, stat, lo_t, hi_t in [
        ("sky", 60, "median", 0.03, 0.12),
        (day_view, 13 * 60, "mean", 0.65, 0.80),
    ]:
        mid_t = (lo_t + hi_t) / 2
        lo, hi = 0.01, 4000.0
        for _ in range(40):
            mid = math.sqrt(lo * hi)
            v = lum(render(OFF, clock, {layer: mid}))[GLASS]
            got = float(np.median(v)) if stat == "median" else float(v.mean())
            if got < mid_t: lo = mid
            else: hi = mid
        print(f"  {layer:8s} -> {math.sqrt(lo*hi):8.3f}   ({stat} hits {mid_t:.3f})")


def derive(lumens: dict, ref: str, target: float = 0.25):
    """Lumen-proportional gains, anchored so `ref` alone at full hits `target`.

    A circuit the space declares but the render does not have is reported
    and skipped rather than crashing the tool. That is a real situation —
    the office floor shipped with eight of its nine circuits — and the
    useful response is the other eight's gains plus a line saying which one
    is missing, not a stack trace.
    """
    absent = [l for l in lumens if l not in MAN["layers"]]
    if absent:
        print(f"  no plate for {', '.join(absent)} — skipped; re-run when the set has them\n")
        lumens = {l: v for l, v in lumens.items() if l not in absent}
    if ref not in lumens:
        sys.exit(f"the anchor {ref} has no plate in {PLATES.name}")
    mean = {l: float(lum(LIN[l]).mean()) for l in lumens}
    lo, hi = 0.01, 1e9
    for _ in range(60):                      # find the reference gain first
        mid = math.sqrt(lo * hi)
        v = float(lum(to_srgb(agx(LIN[ref] * mid * EXPOSURE))).mean())
        if v < target: lo = mid
        else: hi = mid
    base = math.sqrt(lo * hi)
    print(f"  exposure {EXPOSURE}, reference {ref} -> {base:.3f}  (alone at full reads {target})\n")
    for l in lumens:
        g = base * (mean[ref] * lumens[l] / lumens[ref]) / max(mean[l], 1e-12)
        print(f"  {l:14s} {g:12.3f}   lumens {lumens[l]:7d}   plate mean {mean[l]:.5f}")


def still(state_path: str, out_dir: str):
    """Write `still_hd.jpg` and `still_sd.jpg` for one settled room state."""
    st = json.loads(pathlib.Path(state_path).read_text())
    out = ROOT / out_dir
    # `--dir` is always the *open* set, even when the still being written is
    # the closed one: the curtain position in the state decides which plates
    # `render` reaches for, and pointing it at `room_closed` would send it
    # looking for `room_closed_closed`.
    if PLATES.name.endswith(("_sheer", "_closed")):
        sys.exit(f"--dir should be the open plate set, not {PLATES.name}")
    targets = st["states"]
    clock = st["clockMin"]
    mix = st.get("daylightMix")
    curtain = st.get("curtain", [0.0, 0.0])
    tint = st.get("daylightTint")
    for tier, w, h in (("hd", MAN["width"], MAN["height"]), ("sd", *MAN["sd"])):
        img = render(targets, clock, mix=mix, tier=tier, curtain=curtain, tint=tint)
        L = lum(img)
        arr = np.clip(img * 255.0 + 0.5, 0, 255).astype(np.uint8)
        pic = Image.fromarray(arr)
        if pic.size != (w, h):
            pic = pic.resize((w, h), Image.LANCZOS)
        dest = out / f"still_{tier}.jpg"
        pic.save(dest, quality=92, subsampling=0, optimize=True)
        print(f"  {dest.relative_to(ROOT)}  {pic.size[0]}x{pic.size[1]}  mean {L.mean():.3f}"
              f"  p99 {np.percentile(L, 99):.3f}  clipped {float((img.max(-1) >= 0.999).mean() * 100):.2f}%")
        _CACHE.clear()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(parents=[_ap])
    ap.add_argument("--solve", action="store_true")
    ap.add_argument("--gains", metavar="JSON",
                    help="path to a {layer: lumens} map")
    ap.add_argument("--ref", default=None, help="anchor layer for --gains")
    ap.add_argument("--target", type=float, default=0.25, help="mean the anchor reads alone at full")
    ap.add_argument("--still", metavar="JSON", help="state from scripts/dump-state.mts")
    ap.add_argument("--out", default=None, help="plate directory the still is written to")
    a = ap.parse_args()
    if a.still:
        still(a.still, a.out or _known.dir)
    elif a.gains:
        lm = json.loads(pathlib.Path(a.gains).read_text())
        derive(lm, a.ref or next(iter(lm)), a.target)
    elif a.solve:
        solve()
    else:
        print("Plate calibration against the brief's targets:\n")
        sys.exit(0 if report() else 1)
