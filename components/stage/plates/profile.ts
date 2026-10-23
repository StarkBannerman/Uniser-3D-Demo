/**
 * Everything about compositing a plate set that is true of one room only.
 *
 * The pipeline itself — decode, sum, tone map — is the same for every space.
 * What is not the same is the calibration: which layers are out of
 * proportion and by how much, how hard the whole composite should be driven,
 * which fixtures carry their own colour, and which of them are RGBW and
 * follow a colour bus. Those are properties of a particular render of a
 * particular room, so they live here rather than as constants in the
 * renderer, and a space names the one it wants.
 *
 * A profile is a measurement, not a preference. `scripts/measure-plates.py`
 * derives the gains and the two luminance targets, and re-running it is the
 * right response to a re-render — nudging the numbers by eye is not.
 */

export interface PlateProfile {
  /** Per-layer gain. A layer not listed is used at its encoded scale. */
  gain: Record<string, number>;
  /**
   * Exposure on the summed HDR, before the tone curve.
   *
   * Applied once, after every layer has been added in linear — never per
   * layer, which tone-maps the same pixel repeatedly and is what makes a
   * composite go flat and brown. It and the gains are one calibration: what
   * matters is their product and where that lands on the AgX curve.
   */
  exposure: number;
  /**
   * How far a colour temperature is allowed to pull the picture, 0..1.
   *
   * A blackbody tint at unit luminance really is a saturated orange at
   * 2700 K; rooms do not look like that because the eye adapts to the
   * illuminant and a still frame gives it nothing to adapt to. This pulls
   * the chroma back toward neutral so warm white reads as warm white.
   */
  tintSaturation: number;
  /** Layers whose plate already carries the colour of its own fixtures. */
  neutralLayers: string[];
  /**
   * Circuits wired at a fixed colour temperature, in kelvin.
   *
   * A dimmer-only fixture has no colour control, but the store still gives
   * its state a `cct` — 3000 K, because every state needs a number. Tinting
   * the plate by that is tinting it by an implementation detail: the sheet
   * says these circuits are 2700 K warm white and they should look it
   * whatever the engine happened to seed.
   *
   * Only for layers that are *not* in `neutralLayers`. A plate that already
   * carries its fixture colour wants no tint at all, not a different one.
   */
  fixedTint?: Record<string, number>;
  /**
   * Layers whose fixtures are RGBW rather than tunable white.
   *
   * While `colourBus` is running saturated these take its hue at full
   * saturation instead of sitting on the blackbody locus.
   */
  rgbwLayers: string[];
  /** Device id the RGBW layers take their hue from, or null for none. */
  colourBus: string | null;
}

/** Sensible nothing, for a plate set with no calibration of its own. */
export const NEUTRAL_PROFILE: PlateProfile = {
  gain: {},
  exposure: 1,
  tintSaturation: 1,
  neutralLayers: [],
  rgbwLayers: [],
  colourBus: null,
};

export function gainOf(profile: PlateProfile, layer: string): number {
  return profile.gain[layer] ?? 1;
}

/** How long clock-driven layers take to catch up, in milliseconds. */
export const CLOCK_EASE_MS = 1500;
