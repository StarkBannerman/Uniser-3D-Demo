/**
 * What a plate set is, on disk.
 *
 * A plate set is one fixed camera's worth of the room, rendered once per
 * lighting circuit with that circuit alone at full output. Light adds
 * linearly, so the live room is those images summed and weighted by each
 * circuit's dimmer level and colour — a full-screen quad and one texture read
 * per layer, rather than eighteen real lights at sixty hertz.
 *
 * The encoding: each pass was divided by its own peak, raised to 1/gamma and
 * written as plain 8-bit WebP, with `scale` recording the peak. So
 *
 *     linear = pow(texel, gamma) * scale
 *
 * and the textures must be uploaded with no colour space, because a browser
 * applying an sRGB decode on top would put a second transfer curve in front
 * of that one.
 *
 * **Nothing here hardcodes the layers.** The manifest names them and the
 * runtime follows, because the set is re-rendered more often than this code
 * changes and the last reissue both renamed a layer and added one. Roles are
 * read off the names — see `layerRole`.
 */

export interface PlateManifest {
  /** Decode exponent, shared by every layer. */
  gamma: number;
  width: number;
  height: number;
  /** SD dimensions as `[width, height]`. */
  sd: [number, number];
  layers: Record<string, PlateLayerSpec>;
}

export interface PlateLayerSpec {
  /** The peak linear value divided out when the pass was encoded. */
  scale: number;
  /** Share of pixels that still clipped. Diagnostic; the runtime ignores it. */
  clipped_pct?: number;
}

export interface HotspotFile {
  camera: string;
  points: Record<string, Hotspot>;
}

export interface Hotspot {
  /** 0..1 across the frame, top-left origin. */
  u: number;
  v: number;
  visible: boolean;
}

/* ------------------------------------------------------------------ */

/**
 * What a layer is for, from its name.
 *
 * - `circuit` — one of the room's dimmable circuits, named for its device id.
 * - `day` — a sun angle, crossfaded by the clock.
 * - `sky` / `skyDay` — the view out of the glazing after dark and in daylight,
 *   crossfaded against each other so exactly one is showing at a time.
 */
export type LayerRole = "circuit" | "day" | "sky" | "skyDay";

export function layerRole(name: string): LayerRole {
  if (name === "sky_day") return "skyDay";
  if (name === "sky") return "sky";
  if (name.startsWith("day_")) return "day";
  return "circuit";
}

/** Order the day passes are crossfaded in, earliest first. */
export const DAY_ORDER = ["day_morning", "day_midday", "day_evening"];

/** `"rs_general"` -> `"rs-general"`, the device id the store knows it by. */
export function deviceIdOf(layer: string): string {
  return layer.replace(/_/g, "-");
}

/**
 * The layer list, in the order the shader binds its samplers.
 *
 * Circuits first so a glance at the uniform array matches the order the
 * controls are in, then the daylight passes, then the two views.
 */
export function layersOf(manifest: PlateManifest): string[] {
  const names = Object.keys(manifest.layers);
  const rank: Record<LayerRole, number> = { circuit: 0, day: 1, sky: 2, skyDay: 3 };
  return names.sort((a, b) => {
    const r = rank[layerRole(a)] - rank[layerRole(b)];
    if (r !== 0) return r;
    if (layerRole(a) === "day") return DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b);
    return names.indexOf(a) - names.indexOf(b);
  });
}

export type PlateTier = "hd" | "sd";

export function plateUrl(dir: string, tier: PlateTier, layer: string): string {
  return `${dir}/${tier}/${layer}.webp`;
}

export function stillUrl(dir: string, tier: PlateTier): string {
  return `${dir}/still_${tier}.jpg`;
}
