"""
Convert the Blender light passes into web plates for the restaurant.

  pip3 install openexr numpy pillow
  python3 convert_plates.py out/passes_final_0001.exr

Output (./plates):
  hd/<layer>.webp     1920x1080, one per light pass
  sd/<layer>.webp     960x540, for phones
  still_hd.jpg / still_sd.jpg   default-scene composite for instant first paint
  manifest.json       layer list, sizes and decode constants
  hotspots.json       copied from out/ if present

Encoding: each pass is linear HDR. It's divided by its own scale (a high percentile of
that pass), raised to 1/GAMMA, dithered and stored as 8-bit sRGB-free WebP.
The web shader decodes with:  linear = pow(texel.rgb, vec3(GAMMA)) * scale
"""

import json, os, shutil, sys
import numpy as np
from PIL import Image

GAMMA = 5.0          # steep curve: bulbs and LEDs are ~1000x brighter than the room they light, and the room needs the precision
PCT = 99.995         # percentile used as the white point of each pass
HEADROOM = 1.2       # lets filaments and LED strips sit above the percentile before clipping
WEBP_QUALITY = 92
CIRCUITS = ["rs_general", "rs_tunable", "rs_cove", "rs_pendant", "rs_arch", "rs_feature", "rs_table", "rs_rgb"]
EXTRA = ["sky", "sky_day", "day_morning", "day_midday", "day_evening"]


def read_layers(path):
    """Returns {layer: HxWx3 float32}. Works with OpenEXR 3.x and the older 1.x bindings."""
    import OpenEXR
    layers = {}
    if hasattr(OpenEXR, "File"):  # 3.x
        with OpenEXR.File(path, separate_channels=True) as f:
            ch = f.channels()
            names = sorted({k.rsplit(".", 1)[0] for k in ch if "." in k})
            for n in names:
                if all(f"{n}.{c}" in ch for c in "RGB"):
                    layers[n] = np.stack([ch[f"{n}.{c}"].pixels.astype(np.float32) for c in "RGB"], -1)
    else:  # 1.x
        import Imath
        f = OpenEXR.InputFile(path)
        dw = f.header()["dataWindow"]
        w, h = dw.max.x - dw.min.x + 1, dw.max.y - dw.min.y + 1
        ft = Imath.PixelType(Imath.PixelType.FLOAT)
        names = sorted({k.rsplit(".", 1)[0] for k in f.header()["channels"] if "." in k})
        for n in names:
            try:
                rgb = [np.frombuffer(f.channel(f"{n}.{c}", ft), np.float32).reshape(h, w) for c in "RGB"]
                layers[n] = np.stack(rgb, -1)
            except Exception:
                pass
    return layers


def encode(img, scale, rng):
    v = np.clip(img / scale, 0, 1) ** (1.0 / GAMMA)
    v = v * 255.0 + rng.uniform(-0.5, 0.5, v.shape)  # dither: no banding on dark gradients
    return Image.fromarray(np.clip(np.round(v), 0, 255).astype(np.uint8))


def tonemap(x):
    """ACES fitted (Narkowicz), then sRGB. Only used for the first-paint still."""
    a, b, c, d, e = 2.51, 0.03, 2.43, 0.59, 0.14
    y = np.clip((x * (a * x + b)) / (x * (c * x + d) + e), 0, 1)
    return np.where(y <= 0.0031308, 12.92 * y, 1.055 * np.power(y, 1 / 2.4) - 0.055)


def kelvin_tint(k):
    """Linear RGB tint, normalised so red = 1. Matches the app's cctToRgb closely enough for a still."""
    t = k / 100.0
    r = 255.0 if t <= 66 else 329.7 * (t - 60) ** -0.1332
    g = 99.47 * np.log(t) - 161.12 if t <= 66 else 288.1 * (t - 60) ** -0.0755
    b = 255.0 if t >= 66 else (0.0 if t <= 19 else 138.52 * np.log(t - 10) - 305.04)
    srgb = np.clip(np.array([r, g, b]) / 255.0, 0, 1)
    lin = np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)
    return (lin / lin[0]).astype(np.float32)


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: python3 convert_plates_v3.py out/passes_final_0001.exr [out/passes_daysky_0001.exr ...]")
    src = sys.argv[1]
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "plates")
    for sub in ("hd", "sd"):
        os.makedirs(os.path.join(out, sub), exist_ok=True)

    print("reading", src)
    layers = {}
    for p in sys.argv[1:]:
        print("reading", p)
        layers.update({k: v for k, v in read_layers(p).items() if k != "beauty"})
    CIRC = sorted(n for n in layers if n not in EXTRA)
    wanted = CIRC + [n for n in EXTRA if n in layers]
    print("layers:", wanted)
    h, w = layers[wanted[0]].shape[:2]
    rng = np.random.default_rng(7)
    manifest = {"gamma": GAMMA, "width": w, "height": h, "sd": [w // 2, h // 2], "layers": {}}

    for n in wanted:
        img = np.nan_to_num(layers[n], nan=0.0, posinf=0.0, neginf=0.0)
        img = np.maximum(img, 0)
        lum = img.max(-1)
        nz = lum[lum > 1e-6]
        scale = float(np.percentile(nz, PCT) * HEADROOM) if nz.size else 0.0
        if scale <= 0:
            print(f"  {n:12s} empty, skipped"); continue
        hd = encode(img, scale, rng)
        hd.save(os.path.join(out, "hd", f"{n}.webp"), "WEBP", quality=WEBP_QUALITY, method=6)
        small = img.reshape(h // 2, 2, w // 2, 2, 3).mean((1, 3))  # box downsample in linear light
        encode(small, scale, rng).save(os.path.join(out, "sd", f"{n}.webp"), "WEBP", quality=WEBP_QUALITY, method=6)
        kb = os.path.getsize(os.path.join(out, "hd", f"{n}.webp")) / 1024
        clipped = float((lum > scale).mean() * 100)
        med = float(np.median(nz)) if nz.size else 0.0
        levels = int(255 * (med / scale) ** (1 / GAMMA))
        manifest["layers"][n] = {"scale": round(scale, 6), "clipped_pct": round(clipped, 3)}
        print(f"  {n:12s} scale {scale:9.4f}  clipped {clipped:5.2f}%  room-light level {levels:3d}/255  hd {kb:6.0f} KB")

    # first-paint still: every circuit at 70%, 2700 K, plus the night sky. Replace with an exact
    # render of the app's default scene once the stage is wired up.
    tint = kelvin_tint(2700)
    acc = np.zeros((h, w, 3), np.float32)
    for n in CIRC:
        if n in layers:
            acc += layers[n] * tint * 0.7
    if "sky" in layers:
        acc += layers["sky"]
    still = (tonemap(np.maximum(acc, 0)) * 255).astype(np.uint8)
    Image.fromarray(still).save(os.path.join(out, "still_hd.jpg"), quality=88)
    Image.fromarray(still).resize((w // 2, h // 2), Image.LANCZOS).save(os.path.join(out, "still_sd.jpg"), quality=85)

    hs = os.path.join(os.path.dirname(os.path.abspath(src)), "hotspots.json")
    if os.path.exists(hs):
        shutil.copy(hs, os.path.join(out, "hotspots.json"))
    with open(os.path.join(out, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    total = sum(os.path.getsize(os.path.join(out, "hd", f)) for f in os.listdir(os.path.join(out, "hd")))
    total_sd = sum(os.path.getsize(os.path.join(out, "sd", f)) for f in os.listdir(os.path.join(out, "sd")))
    print(f"done: {out}\n  HD total {total / 1e6:.1f} MB, SD total {total_sd / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
