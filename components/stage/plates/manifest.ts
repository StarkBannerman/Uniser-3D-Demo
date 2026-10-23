/**
 * What a plate set is, on disk.
 *
 * A plate set is one fixed camera's worth of the room, rendered once per
 * lighting circuit with that circuit alone at full output in neutral white.
 * Light adds linearly, so the live room is those images summed and weighted by
 * each circuit's dimmer level and colour — which is a full-screen quad and
 * twelve texture reads, rather than eighteen real lights at sixty hertz.
 *
 * The encoding is the part worth understanding before reading anything else.
 * Each pass was divided by its own peak, raised to 1/gamma, and written as
 * plain 8-bit WebP; `scale` is the peak that was divided out. So the decode is
 *
 *     linear = pow(texel, gamma) * scale
 *
 * and the scales differ by four orders of magnitude between circuits — the
 * pendants peak at 231 and the cove at 0.059 — because a filament seen
 * directly is enormously brighter than light bounced off a soffit. That spread
 * is exactly the dynamic range an 8-bit file cannot hold, and dividing it out
 * per layer is what buys it back. It is also why the textures must be uploaded
 * with no colour space: the browser treating them as sRGB would apply a second
 * transfer curve on top of the gamma one and the decode would be wrong
 * everywhere except at 0 and 1.
 */

/** `plates/manifest.json`. */
export interface PlateManifest {
  /** Decode exponent. Shared by every layer. */
  gamma: number;
  /** HD pixel dimensions. */
  width: number;
  height: number;
  /** SD pixel dimensions, as `[width, height]`. */
  sd: [number, number];
  layers: Record<string, PlateLayerSpec>;
}

export interface PlateLayerSpec {
  /** The peak linear value divided out when the pass was encoded. */
  scale: number;
  /** Share of pixels that still clipped. Diagnostic; the runtime ignores it. */
  clipped_pct?: number;
}

/**
 * `plates/hotspots.json`.
 *
 * The pipeline projects each fixture group to a screen position so the room
 * can be made clickable. Two things about it are worth knowing before
 * trusting a position:
 *
 *  - The origin is top-left, which is the opposite of the plates themselves
 *    and of GL texture space. `PlateStage` places these as CSS percentages,
 *    so it needs no flip; anything that samples a plate at a hotspot does.
 *  - The positions are only as good as the empties they were projected from,
 *    and three are not good. `rs-cove` lands on bare ceiling rather than on
 *    the cove line, `rs-arch` lands inside the pendant cluster a few pixels
 *    from the pendant marker, and `rs-rgb` is 2.8% from the right edge. The
 *    last is clamped at render time; the first two want the empties moving.
 */
export interface HotspotFile {
  camera: string;
  points: Record<string, Hotspot>;
}

export interface Hotspot {
  /** 0..1 across the 16:9 frame, top-left origin. */
  u: number;
  v: number;
  visible: boolean;
}

/* ------------------------------------------------------------------ */
/* The layer list                                                      */
/* ------------------------------------------------------------------ */

/**
 * The eight circuits, in the order the brief names them.
 *
 * These are layer *file* names. The device ids they drive are the same strings
 * with hyphens — see `deviceIdOf`. The two spellings exist because a filename
 * with a hyphen is fine and a JSON key with a hyphen needs quoting, and the
 * renderer pipeline chose the quieter one.
 */
export const CIRCUIT_LAYERS = [
  "rs_general",
  "rs_tunable",
  "rs_cove",
  "rs_pendant",
  "rs_arch",
  "rs_feature",
  "rs_table",
  "rs_rgb",
] as const;

/**
 * Three sun positions, crossfaded by the clock.
 *
 * Not three brightnesses of one sun — three *angles*, so scrubbing the clock
 * moves the light across the floor rather than just turning it up.
 */
export const DAY_LAYERS = ["day_morning", "day_midday", "day_evening"] as const;

/**
 * The view out of the glazing, emission only.
 *
 * There is no `base` pass: with every circuit off and the sun down, the room
 * is black plus whatever the city is doing, and this is that. The window's
 * *reflection* of the interior is not here — it is already baked into each
 * circuit's own pass, which is the one piece of this that would be genuinely
 * hard to fake and comes free.
 */
export const SKY_LAYER = "sky";

/** Every layer, in the order the shader's samplers are bound. */
export const LAYERS = [...CIRCUIT_LAYERS, ...DAY_LAYERS, SKY_LAYER] as const;

export type LayerName = (typeof LAYERS)[number];

/** `"rs_general"` -> `"rs-general"`, the device id the store knows it by. */
export function deviceIdOf(layer: string): string {
  return layer.replace(/_/g, "-");
}

/* ------------------------------------------------------------------ */

export interface PlateSet {
  manifest: PlateManifest;
  hotspots: HotspotFile;
  /** Directory the plates were loaded from, e.g. `"/plates"`. */
  dir: string;
  tier: PlateTier;
  width: number;
  height: number;
}

export type PlateTier = "hd" | "sd";

export function plateUrl(dir: string, tier: PlateTier, layer: string): string {
  return `${dir}/${tier}/${layer}.webp`;
}

export function stillUrl(dir: string, tier: PlateTier): string {
  return `${dir}/still_${tier}.jpg`;
}
