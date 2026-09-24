/**
 * How fast a ceiling fan's blades turn, and how far they may turn per frame.
 *
 * Pure arithmetic with no three.js in it, so the renderer and the verification
 * harness can agree on the numbers. The bug this exists to prevent is a fan
 * whose five-speed control looks the same at every setting.
 */

import type { FanState } from "./types";

/**
 * Angular rate at the lowest and highest setting, radians per second.
 *
 * A real ceiling fan runs roughly 90 rpm at its lowest setting and 320 at its
 * highest. We render slower than that, because without motion blur a fan at
 * true speed breaks into a flickering triple image. But the first pass was
 * slowed far too much — 15 rpm at speed 1 and 48 at speed 5 — and both of those
 * simply read as "slow". The point of a five-speed control is being able to see
 * which speed you are on.
 *
 * 29 to 134 rpm keeps every step distinguishable while staying smooth.
 */
export const BLADE_RAD_PER_SEC = { min: 3, max: 14 } as const;

/**
 * The furthest the blades may turn in one frame.
 *
 * Three blades sit 120 degrees apart, so the shape repeats every 120 degrees
 * and the eye cannot tell one blade from the next. Past half of that in a
 * single frame the rotation aliases: the fan appears to slow, stop, then run
 * backwards — which is exactly how a fast setting ends up looking identical to
 * a slow one on a machine that is dropping frames. A late frame therefore
 * under-turns the fan rather than jumping it across the ambiguity.
 *
 * At 60fps even the top speed only needs 0.23 rad per frame, so this never
 * engages on a healthy frame rate; it is a floor under bad ones.
 */
export const MAX_BLADE_STEP_RAD = 0.9;

export function bladeRadPerSec(
  state: FanState | undefined,
  speeds: number,
): number {
  if (!state?.on) return 0;
  const { min, max } = BLADE_RAD_PER_SEC;
  const steps = Math.max(1, speeds - 1);
  const clamped = Math.min(Math.max(state.speed, 1), speeds);
  return min + ((max - min) * (clamped - 1)) / steps;
}
