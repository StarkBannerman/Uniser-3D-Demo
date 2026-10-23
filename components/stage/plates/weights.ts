/**
 * What each plate is worth this frame.
 *
 * The whole runtime is this file plus a shader. Everything the room does —
 * every scene, fade, dimmer, colour temperature change, clock scrub — arrives
 * here as store state and leaves as twelve RGB weights. Nothing else about the
 * picture is live.
 *
 * Kept free of React and of WebGL on purpose: it is the only part of the
 * plates path whose correctness can be argued about without a GPU in the room,
 * and `pnpm verify` can reach it.
 */

import type { LightState, Space, DeviceState } from "@/lib/sim/types";
import {
  cctToRgb,
  clamp01,
  daylightLux,
  hsvToRgb,
  lerp,
  lightOutput,
  sunElevation01,
} from "@/lib/sim/photometry";
import { CIRCUIT_LAYERS, DAY_LAYERS, LAYERS, deviceIdOf } from "./manifest";

/**
 * Outdoor lux that counts as "fully daylit" for the day plates.
 *
 * The same 45 000 `RestaurantStage` divides by, and it has to be: the two
 * renderers are showing the same room at the same hour and a client can switch
 * between them. A different normalisation here would read as the clock being
 * wrong in one of them.
 */
const DAYLIGHT_REFERENCE_LUX = 45000;

/**
 * The window's weight, which is 1 and does not move.
 *
 * Held deliberately plain until the plate set is reissued. Measured inside
 * the glazing, the three daylight passes carry almost nothing — 0.0055,
 * 0.0021 and 0.0475 mean linear against this plate's 0.0317 — because they
 * are sunlight landing *inside* the room and their own windows render black.
 * So every pixel of view out of this room comes from one plate, and that
 * plate is a dusk city, which is why the morning scenes look like evening.
 *
 * Two runtime answers were tried and both were worse than leaving it alone.
 * Fading it out through the day took the only exterior away and the glazing
 * went black at nine in the morning. Driving it above unity and cooling it
 * reads as a bright hazy morning, but it is a number picked for how it looks
 * and it would have to be unpicked the moment a real daytime sky exists.
 *
 * The fix is a `sky_day` pass. With one, this becomes a crossfade between
 * two plates on `dayness` and stops being a constant.
 */
const SKY_WEIGHT = 1;

/** 0 at night, 1 through the middle of the day, ramped across dawn and dusk. */
export function dayness(clockMin: number): number {
  const DAWN_START = 6 * 60, DAWN_END = 8 * 60;
  const DUSK_START = 18 * 60, DUSK_END = 20 * 60;
  if (clockMin <= DAWN_START) return 0;
  if (clockMin < DAWN_END) return (clockMin - DAWN_START) / (DAWN_END - DAWN_START);
  if (clockMin <= DUSK_START) return 1;
  if (clockMin < DUSK_END) return 1 - (clockMin - DUSK_START) / (DUSK_END - DUSK_START);
  return 0;
}

/** sRGB 0..1 to linear. The exact piecewise curve, not the 2.2 shortcut. */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Layers whose plate is warm enough already to skip the runtime tint.
 *
 * Empty, and the measurement is why. The brief says every circuit was
 * rendered "at 100% in white"; four were not. Sampling the lit pixels of
 * each plate gives rs_general, rs_feature and rs_arch at R/B about 1.08,
 * which is neutral, against rs_pendant 1.68, rs_table 1.80, rs_tunable 2.14
 * and rs_cove 2.86 — those four carry warm light of their own, so tinting
 * them applies some of the warmth twice.
 *
 * The pendants were neutralised here for exactly that reason and it was
 * wrong. R/B 1.68 is roughly a 4000 K source and the fixture is specified at
 * 1900-2900 K, so the plate is not pre-warmed to anything like the colour
 * the scene asks for: skipping the tint left white globes over a warm room
 * and took the midtone warmth of Fine Dining from R-B +0.217 to +0.144. The
 * tint is closer to right than no tint, even double-counted.
 *
 * The real repair is upstream — re-render those four neutral — and then this
 * set stays empty because it is true rather than because it is the lesser
 * error.
 */
const NEUTRAL_LAYERS = new Set<string>();

/** Rec. 709 luminance of a linear RGB triple. */
function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The colour a circuit is emitting, in linear light, at unit luminance.
 *
 * The arithmetic is `colourOf()` from `RestaurantLightRig` — CCT to sRGB on
 * the blackbody locus, to linear, and for a saturated fixture lerped towards
 * the pure hue *in linear space* rather than in sRGB, which is where the
 * illustrated path's `lightColor` goes light through the middle of the range.
 *
 * What is added here is the renormalisation, and it matters more than it
 * looks. `cctToRgb` normalises so the brightest channel is 255, which means a
 * 2000 K triple carries about 60% of the luminance of a 5000 K one. Multiply a
 * plate by that and warming a circuit also dims it, so every scene that goes
 * warm goes dark at the same time and the dimmer has no independent meaning.
 * Dividing by luminance leaves chromaticity alone and hands brightness back to
 * `lightOutput`, which is the only thing that should own it.
 */
export function tintLinear(state: LightState): [number, number, number] {
  const [br, bg, bb] = cctToRgb(state.cct);
  const base: [number, number, number] = [
    srgbToLinear(br / 255),
    srgbToLinear(bg / 255),
    srgbToLinear(bb / 255),
  ];
  if (state.sat <= 0) return normalise(base);

  // HSL(h, 1, 0.5) and HSV(h, 1, 1) are the same colour — the pure hue — and
  // `hsvToRgb` is already here.
  const [ar, ag, ab] = hsvToRgb(state.hue, 1, 1);
  const t = clamp01(state.sat / 100);
  return normalise([
    lerp(base[0], srgbToLinear(ar / 255), t),
    lerp(base[1], srgbToLinear(ag / 255), t),
    lerp(base[2], srgbToLinear(ab / 255), t),
  ]);
}

/** Scale a tint to luminance 1, so it carries colour and nothing else. */
function normalise(c: [number, number, number]): [number, number, number] {
  const l = luminance(c);
  return l > 1e-6 ? [c[0] / l, c[1] / l, c[2] / l] : c;
}

/**
 * How bright the sun is outside, 0..1.
 */
export function daylightAmount(space: Space, clockMin: number): number {
  const env = space.environment;
  return clamp01(
    daylightLux(
      sunElevation01(clockMin, env.sunriseMin, env.sunsetMin),
      env.outdoorPeakLux,
    ) / DAYLIGHT_REFERENCE_LUX,
  );
}

/**
 * Split the daylight across the three sun positions so they sum to `amount`.
 *
 * Anchored at a fifth, a half and four fifths of the way from sunrise to
 * sunset, and linear between neighbours. Summing to `amount` rather than
 * crossfading at full strength is what keeps the total outdoor contribution
 * continuous: a crossfade that renormalised would brighten the room at the
 * midpoint between two anchors for no reason the clock can explain.
 *
 * Worth knowing what this cannot do: between two anchors the floor carries two
 * sun patches, one fading up and one fading down, because they are different
 * renders of different angles. With this room's soft north-ish glazing that
 * reads as the patch sliding; with a hard sun it would read as a double
 * shadow, and the answer then is more day plates rather than cleverer
 * weighting.
 */
export function dayWeights(amount: number, t: number): [number, number, number] {
  const MORNING = 0.2;
  const MIDDAY = 0.5;
  const EVENING = 0.8;

  let w: [number, number, number];
  if (t <= MORNING) w = [1, 0, 0];
  else if (t < MIDDAY) {
    const k = (t - MORNING) / (MIDDAY - MORNING);
    w = [1 - k, k, 0];
  } else if (t < EVENING) {
    const k = (t - MIDDAY) / (EVENING - MIDDAY);
    w = [0, 1 - k, k];
  } else w = [0, 0, 1];

  return [w[0] * amount, w[1] * amount, w[2] * amount];
}

/** Where we are between sunrise and sunset, 0..1. Clamped outside daylight. */
export function dayFraction(space: Space, clockMin: number): number {
  const { sunriseMin, sunsetMin } = space.environment;
  if (sunsetMin <= sunriseMin) return 0.5;
  return clamp01((clockMin - sunriseMin) / (sunsetMin - sunriseMin));
}

/* ------------------------------------------------------------------ */

/** One RGB weight per layer, in `LAYERS` order, flattened for `uniform3fv`. */
export type LayerWeights = Float32Array;

export function emptyWeights(): LayerWeights {
  return new Float32Array(LAYERS.length * 3);
}

/**
 * The frame's weights, written into `out` so a steady state allocates nothing.
 *
 * Returns true if anything changed, which is what decides whether the GPU is
 * asked to draw at all. An idle room writes the same twelve vectors forever
 * and never redraws.
 */
export function computeWeights(
  out: LayerWeights,
  space: Space,
  states: Record<string, DeviceState>,
  clockMin: number,
): boolean {
  let changed = false;
  const put = (i: number, r: number, g: number, b: number) => {
    const o = i * 3;
    if (out[o] !== r || out[o + 1] !== g || out[o + 2] !== b) {
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      changed = true;
    }
  };

  CIRCUIT_LAYERS.forEach((layer, i) => {
    const state = states[deviceIdOf(layer)] as LightState | undefined;
    if (!state || !state.on) {
      put(i, 0, 0, 0);
      return;
    }
    /**
     * Square-law output, exactly as the photometry and the 3D rig use it, and
     * with no separate curve for the fixture's own aperture.
     *
     * `RestaurantLightRig` dims an emitter's *geometry* on a much flatter
     * curve than its light output, because a rasterised emissive surface at 1%
     * of full disappears when a real dimmed downlight plainly does not. That
     * is a correction for a renderer that cannot hold the range. Here the
     * aperture's true peak is in the plate and `scale` carries it, so one
     * honest gain per circuit is both simpler and more nearly right.
     */
    const gain = lightOutput(state.level);
    const [r, g, b] = NEUTRAL_LAYERS.has(layer) ? [1, 1, 1] : tintLinear(state);
    put(i, gain * r, gain * g, gain * b);
  });

  const amount = daylightAmount(space, clockMin);
  const day = dayWeights(amount, dayFraction(space, clockMin));
  DAY_LAYERS.forEach((_, i) => {
    const w = day[i];
    put(CIRCUIT_LAYERS.length + i, w, w, w);
  });

  put(LAYERS.length - 1, SKY_WEIGHT, SKY_WEIGHT, SKY_WEIGHT);

  return changed;
}
