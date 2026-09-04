"use client";

import { useEffect } from "react";
import { useSim } from "./store";

/**
 * Drives the simulation from a single requestAnimationFrame loop.
 *
 * Mounted once, at the top of the demo stage. Everything animated in the app —
 * fades, the clock, sensor drift, rule evaluation, energy integration — runs
 * off this one loop, so there is exactly one place where time advances and no
 * possibility of two components disagreeing about what "now" is.
 */
export function useTicker(): void {
  const tick = useSim((s) => s.tick);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();

    const loop = (t: number) => {
      // A tab left in the background can hand back an enormous delta. Clamping
      // to ~100ms stops the clock jumping hours and every schedule rule firing
      // at once when a salesperson switches back to the demo.
      const dt = Math.min(t - last, 100);
      last = t;
      tick(dt);
      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [tick]);
}
