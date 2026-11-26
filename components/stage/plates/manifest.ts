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
  /**
   * A hash of this set's cached bytes, written by `scripts/stamp-plates.mts`.
   *
   * The plates are served `immutable` for a year and their paths never change
   * between renders, so without this a browser that has seen the room once
   * keeps that version for good — see the script for the whole story. This is
   * hung on the query string by `plateUrl` and `stillUrl`, which makes a
   * re-rendered set a new URL and leaves an unchanged one alone.
   *
   * Optional because a set that has never been stamped should still load. It
   * will simply cache the old way, which is the behaviour we are replacing
   * rather than a failure.
   */
  rev?: string;
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
  /**
   * The window opening, for rooms whose curtains travel.
   *
   * Projected by the offline renderer alongside the points of interest,
   * because it is the same job — a thing in the room located on screen —
   * and because it has to be re-measured every time the camera moves.
   */
  curtain?: {
    /** Four `[u, v]` corners: near-bottom, far-bottom, far-top, near-top. */
    quad: [number, number][];
    order?: string;
    travel?: string;
    pad?: number;
  };
  /**
   * Named screen-space rectangles the offline renderer projected, such as
   * `fan_rect`: `[u0, v0, u1, v1]` with v down.
   *
   * Looked up by name rather than declared one by one, because the set
   * decides what it has projected and a space only says which one it
   * wants. See `rectNamed`.
   */
  [named: string]: unknown;
}

/**
 * One of the hotspot file's named rectangles, normalised, or null.
 *
 * Null for anything unusable, which is a working outcome rather than a
 * failure — a caller falls back to not compositing. Unusable covers more
 * than absent: the office set shipped `fan_rect` as
 * `[1.1018, 0, 1, 0.2976]`, which is inverted *and* entirely off the right
 * edge of the frame, and a rectangle that cannot contain a pixel is the
 * same thing as no rectangle at all.
 */
export function rectNamed(
  file: HotspotFile | null,
  name: string,
): [number, number, number, number] | null {
  const raw = file ? (file as Record<string, unknown>)[name] : null;
  if (!Array.isArray(raw) || raw.length !== 4 || !raw.every((n) => typeof n === "number" && Number.isFinite(n))) {
    return null;
  }
  const [a, b, c, d] = raw as number[];
  const u0 = Math.max(0, Math.min(a, c));
  const u1 = Math.min(1, Math.max(a, c));
  const v0 = Math.max(0, Math.min(b, d));
  const v1 = Math.min(1, Math.max(b, d));
  // A rectangle clipped to the frame has to still have some frame in it.
  if (u1 - u0 < 1e-3 || v1 - v0 < 1e-3) return null;
  return [u0, v0, u1, v1];
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

/** Order the sun passes are crossfaded in, earliest first. */
export const DAY_ORDER = ["day_morning", "day_midday", "day_evening"];

export function layerRole(name: string): LayerRole {
  // Two spellings for the daytime view, because two plate sets were rendered
  // by different hands. Both mean "the world outside, in daylight".
  if (name === "sky_day" || name === "day_sky") return "skyDay";
  if (name === "sky") return "sky";
  if (DAY_ORDER.includes(name)) return "day";
  return "circuit";
}



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

/**
 * `?v=` and nothing else, so an unstamped set keeps the URL it always had.
 *
 * A query string is enough: HTTP caches key on the whole URL, so changing it
 * is a miss even though the file on disk is at the same path. Renaming 600
 * files would also work and is what the `next.config.mjs` comment imagined,
 * but it would put a hash in every filename the render pipeline writes and
 * the converter would have to learn about it. This keeps the knowledge in
 * one place.
 */
function rev(r: string | undefined): string {
  return r ? `?v=${r}` : "";
}

export function plateUrl(
  dir: string,
  tier: PlateTier,
  layer: string,
  r?: string,
): string {
  return `${dir}/${tier}/${layer}.webp${rev(r)}`;
}

export function stillUrl(dir: string, tier: PlateTier, r?: string): string {
  return `${dir}/still_${tier}.jpg${rev(r)}`;
}
