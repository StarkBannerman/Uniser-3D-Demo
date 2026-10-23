/**
 * What each plate is worth this frame.
 *
 * The whole runtime is this file plus a shader. Every scene, fade, dimmer,
 * colour change and clock scrub arrives here as store state and leaves as one
 * RGB weight per layer. Nothing else about the picture is live.
 *
 * Free of React and of WebGL on purpose: it is the only part of the plates
 * path whose correctness can be argued about without a GPU in the room.
 */

import type { DeviceState, LightState, Space } from "@/lib/sim/types";
import {
  cctToRgb,
  clamp01,
  daylightLux,
  hsvToRgb,
  lerp,
  sunElevation01,
} from "@/lib/sim/photometry";
import { DAY_ORDER, deviceIdOf, layerRole } from "./manifest";
import { gainOf, type PlateProfile } from "./profile";

/**
 * Outdoor lux that counts as fully daylit for the sun-angle passes.
 *
 * The same 45 000 `RestaurantStage` divides by, because the two renderers
 * show the same room at the same hour and a client can switch between them.
 */
const DAYLIGHT_REFERENCE_LUX = 45000;

/** Dawn and dusk, across which the night view hands over to the day one. */
const DAWN_START = 6 * 60;
const DAWN_END = 8 * 60;
const DUSK_START = 17 * 60;
const DUSK_END = 19 * 60;

/**
 * Perceptual dimming, and deliberately not `lightOutput`.
 *
 * `lib/sim/photometry` squares the control level, which is the square-law a
 * DALI ballast uses and the right number for lux and for the energy figures.
 * The plates want 2.2 instead: the extra exponent is what pulls Fine Dining's
 * twelve per cent far enough below Private Event's forty-eight that the two
 * scenes read as different rooms rather than as the same room at two
 * brightnesses. The simulation is untouched — this applies to the picture
 * only, and the sensors and the panels still see square law.
 */
export function plateOutput(level: number): number {
  return Math.pow(clamp01(level / 100), 2.2);
}

/** 0 at night, 1 through the middle of the day, ramped across dawn and dusk. */
export function dayness(clockMin: number): number {
  if (clockMin <= DAWN_START) return 0;
  if (clockMin < DAWN_END) return (clockMin - DAWN_START) / (DAWN_END - DAWN_START);
  if (clockMin <= DUSK_START) return 1;
  if (clockMin < DUSK_END) return 1 - (clockMin - DUSK_START) / (DUSK_END - DUSK_START);
  return 0;
}

/* ------------------------------------------------------------------ */
/* Colour                                                              */
/* ------------------------------------------------------------------ */

/** sRGB 0..1 to linear. The piecewise curve, not the 2.2 shortcut. */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Rec. 709 luminance of a linear RGB triple. */
function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Scale a tint to luminance 1, so it carries colour and nothing else. */
function unitLuminance(c: [number, number, number]): [number, number, number] {
  const l = luminance(c);
  return l > 1e-6 ? [c[0] / l, c[1] / l, c[2] / l] : c;
}

/**
 * The colour a circuit is emitting, in linear light, at unit luminance.
 *
 * Three things happen here and each fixes something visible.
 *
 * `cctToRgb` normalises so the brightest channel is 255, which leaves a
 * 2000 K triple carrying about 60% of the luminance of a 5000 K one. Multiply
 * a plate by that and warming a circuit also dims it, so every scene that
 * goes warm goes dark with it and the dimmer stops meaning anything. Dividing
 * by luminance hands brightness back to `plateOutput`, which should own it.
 *
 * That alone makes 2700 K a saturated orange, because a blackbody tint at
 * unit luminance really is — the reason rooms do not look like that is that
 * the eye adapts to the illuminant, and a still frame gives it nothing to
 * adapt to. `TINT_SATURATION` pulls the chroma back toward neutral so warm
 * white reads as warm white rather than as sodium.
 *
 * The hue mix for `rs_rgb` happens last and is *not* capped: Party is a real
 * magenta wash rather than an illuminant anybody would discount.
 */
export function tintLinear(
  state: LightState,
  tintSaturation: number,
): [number, number, number] {
  const [br, bg, bb] = cctToRgb(state.cct);
  const white = unitLuminance([
    srgbToLinear(br / 255),
    srgbToLinear(bg / 255),
    srgbToLinear(bb / 255),
  ]);
  // Mixing two unit-luminance colours leaves unit luminance, so this
  // desaturates without touching brightness.
  const base: [number, number, number] = [
    lerp(1, white[0], tintSaturation),
    lerp(1, white[1], tintSaturation),
    lerp(1, white[2], tintSaturation),
  ];
  if (state.sat <= 0) return base;

  // HSL(h, 1, 0.5) and HSV(h, 1, 1) are the same colour — the pure hue.
  const [ar, ag, ab] = hsvToRgb(state.hue, 1, 1);
  const accent = unitLuminance([
    srgbToLinear(ar / 255),
    srgbToLinear(ag / 255),
    srgbToLinear(ab / 255),
  ]);
  const t = clamp01(state.sat / 100);
  return [
    lerp(base[0], accent[0], t),
    lerp(base[1], accent[1], t),
    lerp(base[2], accent[2], t),
  ];
}

/**
 * Layers whose plate already carries the colour of its own fixtures.
 *
 * Sampling the lit pixels of this set gives rs_general, rs_feature and
 * rs_cove at R/B near 1.1 — neutral, as the brief says they all should be —
 * against rs_pendant at 1.53. The pendants are smoked amber glass and the
 * globes are in shot, so that warmth is a property of the object rather than
 * of the beam, and tinting it again by a 2000 K circuit colour applies it
 * twice and turns the cluster orange.
 */




/* ------------------------------------------------------------------ */
/* Daylight                                                            */
/* ------------------------------------------------------------------ */

export function daylightAmount(space: Space, clockMin: number): number {
  const env = space.environment;
  return clamp01(
    daylightLux(
      sunElevation01(clockMin, env.sunriseMin, env.sunsetMin),
      env.outdoorPeakLux,
    ) / DAYLIGHT_REFERENCE_LUX,
  );
}

/** Where we are between sunrise and sunset, 0..1. */
export function dayFraction(space: Space, clockMin: number): number {
  const { sunriseMin, sunsetMin } = space.environment;
  if (sunsetMin <= sunriseMin) return 0.5;
  return clamp01((clockMin - sunriseMin) / (sunsetMin - sunriseMin));
}

/**
 * Split the daylight across the three sun positions so they sum to `amount`.
 *
 * Anchored at a fifth, a half and four fifths of the way from sunrise to
 * sunset, linear between neighbours. Summing to `amount` rather than
 * crossfading at full strength keeps the outdoor contribution continuous —
 * renormalising would brighten the room between two anchors for no reason
 * the clock could explain.
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

/* ------------------------------------------------------------------ */

/** One RGB weight per layer, flattened for `uniform3fv`. */
export type LayerWeights = Float32Array;

export function emptyWeights(count: number): LayerWeights {
  return new Float32Array(count * 3);
}

/** True for layers whose weight follows the clock rather than the store. */
export function isClockDriven(layer: string): boolean {
  const role = layerRole(layer);
  return role !== "circuit";
}

/**
 * The frame's weights, written into `out` so a steady state allocates nothing.
 *
 * Returns true if anything changed, which is what decides whether the GPU is
 * asked to draw at all.
 */
export function computeWeights(
  out: LayerWeights,
  layers: string[],
  space: Space,
  states: Record<string, DeviceState>,
  clockMin: number,
  profile: PlateProfile,
  /**
   * Exterior layer weights the active scene is asking for, 0-100 per layer.
   *
   * Null means follow the clock, which is the default and what every space
   * did before scenes could name an hour of their own.
   */
  mix: Record<string, number> | null,
): boolean {
  let changed = false;
  /**
   * A change counts when it would be visible, not when a float moved.
   *
   * The simulation never quite sits still — the lux sensor resamples at
   * 10 Hz and the rules nudge levels by fractions in response — so an exact
   * comparison here reported a change about eight times a second in a room
   * nobody was touching, and the GPU redrew each time. That is not a
   * continuous loop but it is not the "nothing at rest" this renderer is
   * sold on either. A hundredth of a per cent of the larger operand is far
   * below anything the eye or the panel could show, and still catches a
   * circuit switching off, where the other operand is zero.
   */
  const SAME = (a: number, b: number) =>
    Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(a), Math.abs(b));
  const put = (i: number, r: number, g: number, b: number) => {
    const o = i * 3;
    if (SAME(out[o], r) && SAME(out[o + 1], g) && SAME(out[o + 2], b)) return;
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    changed = true;
  };

  const night = 1 - dayness(clockMin);
  const day = dayWeights(daylightAmount(space, clockMin), dayFraction(space, clockMin));

  // The colour bus, if the profile has one and it is running colour at all.
  // In a room with no RGBW circuits, or a scene with the colour off, this is
  // null and every circuit stays on the white locus.
  const busState = profile.colourBus
    ? (states[profile.colourBus] as LightState | undefined)
    : undefined;
  const bus = busState?.on && busState.sat > 0 ? busState : null;
  const rgbw = new Set(profile.rgbwLayers);
  const neutral = new Set(profile.neutralLayers);

  layers.forEach((layer, i) => {
    const gain = gainOf(profile, layer);
    switch (layerRole(layer)) {
      case "circuit": {
        const state = states[deviceIdOf(layer)] as LightState | undefined;
        if (!state || !state.on) return put(i, 0, 0, 0);
        const w = plateOutput(state.level) * gain;
        // An RGBW circuit under a live colour bus takes the bus's hue at full
        // saturation: a cove doing a pastel version of the wash reads as a
        // mistake rather than as a choice.
        const lit =
          bus && rgbw.has(layer) ? { ...state, hue: bus.hue, sat: 100 } : state;
        const [r, g, b] = neutral.has(layer)
          ? [1, 1, 1]
          : tintLinear(lit, profile.tintSaturation);
        return put(i, w * r, w * g, w * b);
      }
      case "day": {
        const w =
          (mix ? (mix[layer] ?? 0) / 100 : (day[DAY_ORDER.indexOf(layer)] ?? 0)) * gain;
        return put(i, w, w, w);
      }
      // The two views are a crossfade, not two independent layers: under the
      // clock their shares always sum to one, so the glazing never goes
      // empty between them — which is exactly what fading the night view to
      // nothing did. A scene that names them is trusted to balance itself.
      case "sky": {
        const w = (mix ? (mix[layer] ?? 0) / 100 : night) * gain;
        return put(i, w, w, w);
      }
      case "skyDay": {
        const w = (mix ? (mix[layer] ?? 0) / 100 : 1 - night) * gain;
        return put(i, w, w, w);
      }
    }
  });

  return changed;
}
