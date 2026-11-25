/**
 * The fade engine.
 *
 * Every numeric change in the demo goes through here, because nothing in a real
 * installation snaps. A Uniser dimmer ramps over one to three seconds and a
 * curtain motor takes the better part of ten; instant state changes are the
 * single most common tell of a mocked-up demo.
 *
 * Tweens live in a module-level map rather than in the Zustand store on purpose.
 * Bookkeeping for in-flight fades changes every frame and no component needs to
 * subscribe to it — putting it in the store would re-render the whole stage 60
 * times a second for nothing.
 */

export type Easing = (t: number) => number;

export const easing = {
  linear: (t: number) => t,
  /** Default for scene fades — soft at both ends, like a real ramp. */
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  /** For curtains: motors start and stop under load, so ease the ends harder. */
  inOutCubic: (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
} satisfies Record<string, Easing>;

/** The dimming law the shader uses: a level of `L` emits `(L/100)^2.2`. */
const DIM_GAMMA = 2.2;

/**
 * One half of an equal-power crossfade, for a given pair of endpoints.
 *
 * Two circuits swapping roles — the spotlights leaving one car and
 * arriving on another — must not dip or bulge in the middle. A linear
 * crossfade dips, because level is not light: halfway between 100 and 0
 * both fixtures are at 50, which is 2 x 50^2.2, about 22% of the light
 * one of them had. A cosine crossfade on *power* holds the total still.
 *
 * So the two sides share a cos^2 / sin^2 split of the power between their
 * endpoints, and this converts that back into the fraction of the level
 * journey the tween engine wants. Give one side (from, to) and the other
 * (to, from) and their outputs sum to a constant at every instant.
 *
 * Built per call rather than stored in `easing` because the shape depends
 * on the endpoints: a fade from 100 to 15 is not the mirror of one from
 * 15 to 100 unless the floor is accounted for.
 */
export function equalPower(from: number, to: number): Easing {
  const span = to - from;
  if (span === 0) return easing.linear;
  const a = Math.pow(Math.max(from, 0) / 100, DIM_GAMMA);
  const b = Math.pow(Math.max(to, 0) / 100, DIM_GAMMA);
  return (t) => {
    const c = Math.cos((t * Math.PI) / 2) ** 2;
    const level = 100 * Math.pow(a * c + b * (1 - c), 1 / DIM_GAMMA);
    return (level - from) / span;
  };
}

interface Tween {
  from: number;
  to: number;
  startedAt: number;
  durationMs: number;
  ease: Easing;
}

/** `${deviceId}:${key}` -> tween. */
const active = new Map<string, Tween>();

function keyOf(deviceId: string, prop: string): string {
  return `${deviceId}:${prop}`;
}

export function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Start (or replace) a fade. A zero or negative duration writes the target
 * immediately, which is what manual slider drags want — the presenter's finger
 * is already the animation.
 */
export function startTween(
  deviceId: string,
  prop: string,
  from: number,
  to: number,
  durationMs: number,
  ease: Easing = easing.inOutSine,
): void {
  const k = keyOf(deviceId, prop);
  if (durationMs <= 0 || from === to) {
    active.delete(k);
    return;
  }
  active.set(k, { from, to, startedAt: now(), durationMs, ease });
}

export function cancelTween(deviceId: string, prop: string): void {
  active.delete(keyOf(deviceId, prop));
}

export function cancelDevice(deviceId: string): void {
  const prefix = `${deviceId}:`;
  for (const k of active.keys()) {
    if (k.startsWith(prefix)) active.delete(k);
  }
}

export function clearTweens(): void {
  active.clear();
}

export function hasActiveTweens(): boolean {
  return active.size > 0;
}

export interface TweenFrame {
  /** deviceId -> { prop: value } for everything that moved this frame. */
  values: Map<string, Record<string, number>>;
  /** deviceIds whose fades finished on this frame. */
  completed: string[];
}

/**
 * Advance every in-flight fade and report the new values. Finished tweens are
 * removed after emitting their exact target value, so a fade always lands on
 * the number it was asked for rather than 99.7% of it.
 */
export function advanceTweens(t = now()): TweenFrame {
  const values = new Map<string, Record<string, number>>();
  const completed: string[] = [];

  for (const [k, tw] of active) {
    const sep = k.lastIndexOf(":");
    const deviceId = k.slice(0, sep);
    const prop = k.slice(sep + 1);

    const raw = (t - tw.startedAt) / tw.durationMs;
    const done = raw >= 1;
    const value = done ? tw.to : tw.from + (tw.to - tw.from) * tw.ease(raw < 0 ? 0 : raw);

    const bucket = values.get(deviceId) ?? {};
    bucket[prop] = value;
    values.set(deviceId, bucket);

    if (done) {
      active.delete(k);
      if (!completed.includes(deviceId)) completed.push(deviceId);
    }
  }

  return { values, completed };
}
