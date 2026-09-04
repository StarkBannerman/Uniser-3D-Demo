/**
 * Stage geometry.
 *
 * Every stage layer draws into the same 1600×900 viewBox inside a container
 * locked to 16/9, so `preserveAspectRatio` is a no-op and the layers align
 * exactly. Device glow and window coordinates are authored normalized (0..1) in
 * the space config and converted here — that indirection is what lets a
 * photoreal base image stand in for the illustration later without any of the
 * configs changing.
 */

import type { GlowSpec } from "@/lib/sim/types";

export const STAGE_W = 1600;
export const STAGE_H = 900;

export function px(nx: number): number {
  return nx * STAGE_W;
}

export function py(ny: number): number {
  return ny * STAGE_H;
}

/** Radii and other width-relative measures scale off the width only. */
export function pr(n: number): number {
  return n * STAGE_W;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Normalized rect (top-left origin) to viewBox pixels. */
export function rectToPx(r: Rect): Rect {
  return { x: px(r.x), y: py(r.y), w: px(r.w), h: py(r.h) };
}

export interface ConePoints {
  apex: { x: number; y: number };
  left: { x: number; y: number };
  right: { x: number; y: number };
  /** Throw length in viewBox units, for sizing the falloff gradient. */
  length: number;
}

/**
 * Beam geometry for a `cone` glow.
 *
 * `angle` is degrees off straight down, positive tilting right; `spread` is the
 * full beam angle. Track spots are genuinely fairly hard-edged at 24°, so the
 * cone is drawn as a plain polygon with a radial falloff rather than a blurred
 * shape — no SVG filter, which also keeps the whole layer cheap enough to
 * animate at 60fps on a mid-range tablet.
 */
export function conePoints(spec: GlowSpec): ConePoints {
  const apexX = px(spec.x);
  const apexY = py(spec.y);
  const length = (spec.reach ?? 0.7) * STAGE_H;
  const angle = ((spec.angle ?? 0) * Math.PI) / 180;
  const half = (((spec.spread ?? 30) / 2) * Math.PI) / 180;

  return {
    apex: { x: apexX, y: apexY },
    left: {
      x: apexX + length * Math.sin(angle - half),
      y: apexY + length * Math.cos(angle - half),
    },
    right: {
      x: apexX + length * Math.sin(angle + half),
      y: apexY + length * Math.cos(angle + half),
    },
    length,
  };
}
