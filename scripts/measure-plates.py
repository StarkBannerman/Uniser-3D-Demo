#!/usr/bin/env python3
"""
Measure a plate set the way the shader will composite it.

The runtime's gains are calibrated numbers, not dialled ones, and this is
where the numbers come from. It reimplements `weights.ts` and the fragment
shader exactly — the gamma/scale decode, the per-layer gain, level^2.2, the
luminance-normalised and saturation-capped tint, the sky crossfade, AgX and
the sRGB encode — so a figure printed here is the figure the browser renders.

    python3 scripts/measure-plates.py --dir public/plates/restaurant
    python3 scripts/measure-plates.py --dir public/plates/restaurant --solve
    python3 scripts/measure-plates.py --dir public/plates/showroom --gains

`--gains` derives a lumen-proportional table for every circuit from a JSON
map of `layer -> total lumens`, anchored so the reference layer alone at full
reads about 0.25 mean display luminance. That is how both rooms' gains were
produced, and re-running it is the right response to a re-render.

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
_ap = argparse.ArgumentParser(add_help=False)
_ap.add_argument("--dir", default="public/plates/restaurant")
_known, _ = _ap.parse_known_args()
PLATES = ROOT / _known.dir
WINDOW_X = 0.62

# Kept in step with components/stage/plates/gains.ts by hand. There is no
# import path from Python to TypeScript and inventing one would be worse.
GAIN = {
    "rs_general": 90, "rs_tunable": 260, "rs_cove": 7, "rs_pendant": 1.2,
    "rs_arch": 5, "rs_feature": 0.1, "rs_table": 5, "rs_rgb": 1.5,
    "sky": 6.7, "sky_day": 43.5,
    "day_morning": 600, "day_midday": 25, "day_evening": 15,
    "sr_general": 29.4, "sr_spot": 52263, "sr_track": 296, "sr_linear": 3.4,
    "sr_accent": 1.1, "sr_floor": 6.6, "sr_arch": 2.1, "sr_tunable": 552,
    "sr_rgb": 29, "sr_zone_1": 149, "sr_zone_2": 5921, "sr_zone_3": 50,
    "sr_zone_4": 5628, "sr_zone_5": 2648, "sr_zone_6": 25301,
    "ca_tunable": 35.1, "ca_arch": 3.6, "ca_deco": 6.4, "ca_feature": 7.9,
    "ca_accent": 2916, "ca_cove": 12.9, "ca_facade": 17.4,
    "day_sky": 6.46, "sky": 1.67, "day_morning": 2, "day_midday": 8.1, "day_evening": 4.5,
}
EXPOSURE = 0.25  # restaurant; the showroom profile uses 0.20
TINT_SATURATION = 0.55

MAN = json.loads((PLATES / "manifest.json").read_text())
LAYERS = list(MAN["layers"].keys())
# Roles by name, exactly as `plates/manifest.ts` classifies them: anything
# that is not one of the two views or a sun angle is a circuit.
DAY_ORDER = ["day_morning", "day_midday", "day_evening"]
CIRCUITS = [l for l in LAYERS if l not in ("sky", "sky_day", "day_sky") and l not in DAY_ORDER]
LIN = {
    l: (np.asarray(Image.open(PLATES / "sd" / f"{l}.webp").convert("RGB"), float) / 255.0)
    ** MAN["gamma"] * MAN["layers"][l]["scale"]
    for l in LAYERS
}

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


def render(targets, clock, gain=None, exposure=EXPOSURE):
    g = {**GAIN, **(gain or {})}
    hdr = np.zeros_like(next(iter(LIN.values())))
    night = 1 - dayness(clock)
    dw = day_weights(clock, ENV)
    # The colour bus, mirroring weights.ts: a live saturated rs-rgb pulls the
    # RGBW circuits onto its hue.
    busst = targets.get("rs-rgb")
    bus = busst if busst and busst.get("on") and busst.get("sat", 0) > 0 else None
    for l in LAYERS:
        if l in CIRCUITS:
            st = targets.get(l.replace("_", "-"))
            if not st or not st.get("on"):
                continue
            w = (st.get("level", 0) / 100) ** 2.2 * g.get(l, 1)
            lit = dict(st)
            if bus and l in ("rs_cove", "rs_arch"):
                lit = {**st, "hue": bus.get("hue", 0), "sat": 100}
            t = np.array([1.0, 1.0, 1.0]) if l == "rs_pendant" else tint(
                lit.get("cct", 2700), lit.get("hue", 0), lit.get("sat", 0))
            hdr += LIN[l] * (w * t)
        elif l == "sky":
            hdr += LIN[l] * (night * g.get(l, 1))
        elif l in ("sky_day", "day_sky"):
            hdr += LIN[l] * ((1 - night) * g.get(l, 1))
        else:
            w = dw[DAY_ORDER.index(l)]
            if w > 0:
                hdr += LIN[l] * (w * g.get(l, 1))
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
    print(f"  {ok(sky_ok)}sky     gain {g['sky']:>6}   01:00 glass median {nmed:.3f} (target 0.03-0.12)"
          f"   skyline p98 {np98:.3f} (target >=0.45)")
    print(f"  {ok(day_ok)}sky_day gain {g['sky_day']:>6}   13:00 glass mean   {dmean:.3f} (target 0.65-0.80)"
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
    lo, hi = 0.01, 100000.0
    for _ in range(50):                      # find the reference gain first
        mid = math.sqrt(lo * hi)
        v = float(lum(to_srgb(agx(LIN[ref] * mid * EXPOSURE))).mean())
        if v < target: lo = mid
        else: hi = mid
    base = math.sqrt(lo * hi)
    print(f"  reference {ref} -> {base:.3f}  (alone at full reads {target})\n")
    for l in lumens:
        g = base * (mean[ref] * lumens[l] / lumens[ref]) / max(mean[l], 1e-12)
        print(f"  {l:14s} {g:12.3f}   lumens {lumens[l]:7d}   plate mean {mean[l]:.5f}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(parents=[_ap])
    ap.add_argument("--solve", action="store_true")
    ap.add_argument("--gains", metavar="JSON",
                    help="path to a {layer: lumens} map, or '-' for the showroom default")
    ap.add_argument("--ref", default=None, help="anchor layer for --gains")
    a = ap.parse_args()
    if a.gains:
        lm = json.loads(pathlib.Path(a.gains).read_text())
        derive(lm, a.ref or next(iter(lm)))
    elif a.solve:
        solve()
    else:
        print("Plate calibration against the brief's targets:\n")
        sys.exit(0 if report() else 1)
