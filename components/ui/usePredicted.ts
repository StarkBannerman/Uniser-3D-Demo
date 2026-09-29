"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Show what the person just asked for, until the simulation agrees.
 *
 * Every control in the app is driven straight off `useSim`, which is the point
 * — there is one state, not one per interface. But some device properties are
 * deliberately slow to reflect a press, and a control wired directly to those
 * sits there looking dead:
 *
 *   - A light switched **off** keeps `on === true` for the whole 700ms dim-down,
 *     because the driver only cuts once the level reaches zero. The switch did
 *     not move for most of a second.
 *   - A curtain is "closed" once it is past halfway, and the motor runs for
 *     eight seconds. The Close button did not light up for four of them.
 *
 * In both cases the simulation is right and the control is right; they just
 * disagree about *when*. So the control shows the asked-for value immediately
 * and hands back to the store the moment the two agree.
 *
 * This is not the same as decoupling them. The prediction is dropped as soon as
 * the store reaches the requested value, or as soon as something else moves the
 * device somewhere third — a scene press, a rule — so the control still follows
 * the room rather than remembering what it was told.
 *
 * `settleMs` is the safety net for the case neither of those happens: a rule
 * may clamp a fixture so the store never lands on exactly what was asked for,
 * and without a deadline the control would hold a stale value forever. Set it a
 * little longer than the movement itself.
 */
export function usePredicted<T>(
  actual: T,
  settleMs = 1200,
): [T, (next: T) => void] {
  const [pending, setPending] = useState<{ value: T; from: T } | null>(null);

  useEffect(() => {
    if (!pending) return;
    // Agreed, or overruled. Either way the store is the better answer now.
    if (actual === pending.value || actual !== pending.from) setPending(null);
  }, [actual, pending]);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(null), settleMs);
    return () => clearTimeout(timer);
  }, [pending, settleMs]);

  const predict = useCallback((next: T) => {
    setPending((prev) => ({ value: next, from: prev?.from ?? actual }));
  }, [actual]);

  return [pending ? pending.value : actual, predict];
}
