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
