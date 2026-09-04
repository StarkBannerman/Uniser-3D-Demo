/**
 * Light physics.
 *
 * The realism of the whole demo rests on this file. Two things give away a fake
 * lighting demo instantly to anyone who has actually used a dimmer:
 *
 *  1. Linear dimming. A slider where 50% looks like half the pixels' value
 *     reads as a video game, not a room.
 *  2. Wrong colour at low level. Real warm-dim light goes amber; a fixture that
 *     stays 4000K white at 5% looks like a screen effect.
 *
 * So dimming goes through a square-law curve and colour goes through a real
 * blackbody approximation.
 */

export const SRGB_GAMMA = 2.2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Physical light output for a dimmer control level.
 *
 * Professional dimmers and DALI ballasts use a square-law curve, because the
 * eye's response to luminance is compressive — square-law output is what makes
 * the *control* feel linear. This is the number to use for lux and for anything
 * claiming to be photometric.
 */
export function lightOutput(level: number): number {
  const s = clamp01(level / 100);
  return s * s;
}

/**
 * Opacity to composite an additive glow at, for a given dimmer level.
 *
 * Browsers composite in gamma-encoded sRGB, not linear light, so physical output
 * has to be re-encoded before it can be used as an opacity. Skipping this step
 * double-darkens every dimmed state and the room falls off a cliff below ~40%,
 * which is exactly the range the demo spends most of its time in.
 */
export function glowAlpha(level: number): number {
  return Math.pow(lightOutput(level), 1 / SRGB_GAMMA);
}

/**
 * Correlated colour temperature to sRGB, via Tanner Helland's piecewise fit to
 * the blackbody locus. Accurate enough to be indistinguishable by eye across
 * 1800K–6500K, which covers every tunable-white fixture Uniser sells.
 *
 * Returns channels 0..255, normalized so the brightest channel is always 255 —
 * brightness is the dimmer's job, this is chromaticity only.
 */
export function cctToRgb(kelvin: number): [number, number, number] {
  const t = clamp(kelvin, 1000, 40000) / 100;

  let r: number;
  let g: number;
  let b: number;

  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  }

  if (t >= 66) {
    b = 255;
  } else if (t <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  }

  return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)];
}

/** HSV to sRGB, channels 0..255. `h` in degrees, `s`/`v` in 0..1. */
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;

  let rgb: [number, number, number];
  if (hh < 60) rgb = [c, x, 0];
  else if (hh < 120) rgb = [x, c, 0];
  else if (hh < 180) rgb = [0, c, x];
  else if (hh < 240) rgb = [0, x, c];
  else if (hh < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255];
}

/**
 * The colour a fixture is currently emitting. Saturated colour wins over CCT,
 * which mirrors how the hardware actually behaves: pushing an RGB channel takes
 * the fixture off the white locus entirely.
 */
export function lightColor(state: {
  cct: number;
  hue: number;
  sat: number;
}): [number, number, number] {
  if (state.sat > 0) {
    const white = cctToRgb(state.cct);
    const colored = hsvToRgb(state.hue, 1, 1);
    const t = clamp01(state.sat / 100);
    return [
      lerp(white[0], colored[0], t),
      lerp(white[1], colored[1], t),
      lerp(white[2], colored[2], t),
    ];
  }
  return cctToRgb(state.cct);
}

export function rgbToCss([r, g, b]: [number, number, number]): string {
  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;
}

/* ------------------------------------------------------------------ */
/* Daylight                                                            */
/* ------------------------------------------------------------------ */

/**
 * Normalized sun elevation, 0 at or below the horizon and 1 at solar noon.
 * A half-sine across the daylight hours — not astronomically exact, but the
 * shape that matters for daylight harvesting and solar generation is right.
 */
export function sunElevation01(
  minutes: number,
  sunriseMin: number,
  sunsetMin: number,
): number {
  if (minutes <= sunriseMin || minutes >= sunsetMin) return 0;
  const t = (minutes - sunriseMin) / (sunsetMin - sunriseMin);
  return Math.sin(Math.PI * t);
}

/**
 * Horizontal illuminance outdoors. Falls off faster than elevation because of
 * atmospheric path length near the horizon, hence the exponent.
 */
export function daylightLux(elevation01: number, peakLux: number): number {
  return Math.pow(clamp01(elevation01), 1.3) * peakLux;
}

/**
 * Daylight colour temperature. Deep amber at the horizon climbing to overcast
 * blue-white overhead — this is what makes the clock scrubber read as a real
 * day passing rather than a brightness ramp.
 */
export function daylightCct(elevation01: number): number {
  const t = Math.pow(clamp01(elevation01), 0.45);
  return lerp(2000, 6200, t);
}

/* ------------------------------------------------------------------ */
/* Room appearance                                                     */
/* ------------------------------------------------------------------ */

/**
 * How lit the room *looks*, 0..1, from its illuminance.
 *
 * Stevens' power law: perceived brightness goes as luminance to roughly 1/3.
 * The practical effect is a long, useful low end — a room at 30 lux still reads
 * as visible and atmospheric rather than black, which is precisely the range a
 * Movie Night scene lives in.
 */
export function roomIllumination(lux: number, designLux: number): number {
  if (designLux <= 0) return 0;
  return clamp01(Math.pow(clamp01(lux / designLux), 1 / 3));
}

/**
 * Illuminance contributed by a set of lights, in lux.
 *
 * Utilization folds together the coefficient of utilization and maintenance
 * factor a lighting designer would apply — roughly half the raw lumens end up
 * on the working plane.
 */
export function estimateLux(
  contributions: { lumensEach: number; fixtures: number; on: boolean; level: number }[],
  areaM2: number,
  utilization = 0.5,
): number {
  if (areaM2 <= 0) return 0;
  let lumens = 0;
  for (const c of contributions) {
    if (!c.on) continue;
    lumens += c.lumensEach * c.fixtures * lightOutput(c.level);
  }
  return (lumens * utilization) / areaM2;
}

/**
 * Fraction of daylight that gets past the shades.
 *
 * Blackout fabric is treated as near-opaque with a sliver of edge spill, sheer
 * as roughly a 65% cut. Both layers multiply, so sheer plus blackout is darker
 * than either alone — which is the whole reason clients buy dual-track.
 */
export function shadeTransmission(sheer: number, blackout: number): number {
  const sheerPass = 1 - 0.65 * clamp01(sheer / 100);
  const blackoutPass = 1 - 0.97 * clamp01(blackout / 100);
  return clamp01(sheerPass * blackoutPass);
}
