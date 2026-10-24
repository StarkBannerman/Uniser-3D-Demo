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
import argparse, json, math, pathlib, sys

try:
    import numpy as np
    from PIL import Image
except ImportError:
    sys.exit("needs Pillow and numpy:  pip3 install pillow numpy")

ROOT = pathlib.Path(__file__).resolve().parent.parent

# ------------------------------------------------------------------ #
# The profiles, mirrored from components/stage/plates/profiles/.      #
# ------------------------------------------------------------------ #

SETS = {
    "restaurant": {
        "exposure": 0.25,
        "tint": 0.55,
        "neutral": ["rs_pendant"],
        "fixed": {},
        "rgbw": ["rs_cove", "rs_arch"],
        "bus": "rs-rgb",
        "gain": {
            "rs_general": 90, "rs_tunable": 260, "rs_cove": 7, "rs_pendant": 1.2,
            "rs_arch": 5, "rs_feature": 0.1, "rs_table": 5, "rs_rgb": 1.5,
            "sky": 6.7, "sky_day": 43.5,
            "day_morning": 600, "day_midday": 25, "day_evening": 15,
        },
    },
    "showroom": {
        "exposure": 0.2,
        "tint": 0.55,
        "neutral": [],
        "fixed": {},
        "rgbw": [],
        "bus": "sr-rgb",
        "gain": {
            "sr_general": 29.4, "sr_spot": 52263, "sr_track": 296, "sr_linear": 3.4,
            "sr_accent": 1.1, "sr_floor": 6.6, "sr_arch": 2.1, "sr_tunable": 552,
            "sr_rgb": 29, "sr_zone_1": 149, "sr_zone_2": 5921, "sr_zone_3": 50,
            "sr_zone_4": 5628, "sr_zone_5": 2648, "sr_zone_6": 25301,
        },
    },
    "lobby": {
        "exposure": 0.1,
        "tint": 0.55,
        "neutral": ["ca_cove", "ca_deco", "ca_accent", "ca_feature"],
        "fixed": {"ca_arch": 2700, "ca_facade": 2700},
        "rgbw": [],
        "bus": None,
        "gain": {
            "ca_tunable": 35.1, "ca_arch": 3.6, "ca_deco": 6.4, "ca_feature": 7.9,
            "ca_accent": 2916, "ca_cove": 12.9, "ca_facade": 17.4,
            "day_sky": 6.46, "sky": 1.67,
            "day_morning": 2, "day_midday": 8.1, "day_evening": 4.5,
        },
    },
    "room": {
        "exposure": 0.08,
        "tint": 0.4,
        # The two door indicators are rendered in their own colour — the red
        # plate measures R/B 95, the green one 0.18 — so a 2700 K tint on top
        # would turn the green one yellow and the red one into a filament.
        "neutral": ["rm_dnd", "rm_service"],
        "fixed": {
            "rm_entry": 2700, "rm_bedside": 2700, "rm_reading": 2700,
            "rm_cove": 2700, "rm_bath": 2700, "rm_wardrobe": 2700,
            "rm_deco": 2700, "rm_night": 2700,
        },
        "rgbw": [],
        "bus": None,
        "gain": {"rm_tunable": 38.0, "rm_entry": 40.8, "rm_bedside": 24.2, "rm_reading": 102.3, "rm_cove": 7.6, "rm_bath": 7.4, "rm_wardrobe": 2.8, "rm_deco": 1.5, "rm_night": 1.6, "rm_dnd": 6.1, "rm_service": 2.6, "sky": 2.86, "day_sky": 5.66, "day_morning": 3.0, "day_midday": 6.0, "day_evening": 5.0},
        },
}

_ap = argparse.ArgumentParser(add_help=False)
_ap.add_argument("--dir", default="public/plates/restaurant")
_known, _ = _ap.parse_known_args()
PLATES = ROOT / _known.dir
WINDOW_X = 0.62

# `room_closed` is the same room behind a drawn curtain: same circuits, same
# calibration, a second render. It takes the profile its open twin names.
SET = SETS.get(PLATES.name.replace("_closed", ""), SETS["restaurant"])
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


def layer_weight(layer, targets, clock, g, mix=None):
    """One layer's RGB weight, exactly as `computeWeights` works it out.

    `mix` is a scene's `daylight` map, 0-100 per exterior layer; None means
    follow the clock, which is what every space did before scenes could name
    an hour of their own.
    """
    night = 1 - dayness(clock)
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
        return np.array([1.0, 1.0, 1.0]) * (mix.get(layer, 0) / 100) * g.get(layer, 1)
    if layer == "sky":
        return np.array([1.0, 1.0, 1.0]) * night * g.get(layer, 1)
    if layer in ("sky_day", "day_sky"):
        return np.array([1.0, 1.0, 1.0]) * (1 - night) * g.get(layer, 1)
    w = day_weights(clock, ENV)[DAY_ORDER.index(layer)]
    return np.array([1.0, 1.0, 1.0]) * w * g.get(layer, 1)


def render(targets, clock, gain=None, exposure=EXPOSURE, mix=None, tier="sd",
           plates=None, curtain=0.0):
    """The composite, as the browser draws it.

    `curtain` crossfades to the second plate set the way the shader does:
    `mix(open, closed, position)` per layer, with one set of weights. The sum
    is linear, so `(1-t)·Σ w·O + t·Σ w·C` and the per-layer form are the same
    picture — this does it per layer because that is what the shader does and
    the point of this file is to agree with it.
    """
    g = {**GAIN, **(gain or {})}
    base = plates or PLATES
    closed = base.parent / f"{base.name}_closed" if curtain > 0 else None
    hdr = None
    for l in LAYERS:
        w = layer_weight(l, targets, clock, g, mix)
        if w is None:
            continue
        w = np.asarray(w, np.float32)
        contrib = linear(l, tier, base) * (w * np.float32(1 - curtain)) if curtain < 1 else None
        if closed is not None:
            shut = linear(l, tier, closed) * (w * np.float32(curtain))
            contrib = shut if contrib is None else contrib + shut
        hdr = contrib if hdr is None else hdr + contrib
    if hdr is None:
        hdr = np.zeros_like(linear(LAYERS[0], tier, base))
    return to_srgb(agx(hdr * exposure))


OFF = {c.replace("_", "-"): {"on": False} for c in CIRCUITS}


def report(gain=None):
    if GLASS is None:
        print("  this plate set has no sky layers, so there is nothing to check here.")
        print("  use --gains to derive the circuit table instead.")
        return True
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
    return sky_ok and day_ok


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
    """Lumen-proportional gains, anchored so `ref` alone at full hits `target`."""
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
    if PLATES.name.endswith("_closed"):
        sys.exit(f"--dir should be the open plate set, not {PLATES.name}")
    targets = st["states"]
    clock = st["clockMin"]
    mix = st.get("daylightMix")
    curtain = st.get("curtain", 0.0)
    for tier, w, h in (("hd", MAN["width"], MAN["height"]), ("sd", *MAN["sd"])):
        img = render(targets, clock, mix=mix, tier=tier, curtain=curtain)
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
