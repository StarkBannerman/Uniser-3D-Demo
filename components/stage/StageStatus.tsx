"use client";

/**
 * What the room is doing, said on the room.
 *
 * The information was already there — a staged scene has published its stage
 * label since the Good Night work, and the phone panel prints it under the
 * scene pad. The problem is where it is: a client watching a seven-second
 * curtain travel is looking at the *curtains*, not at a caption two hundred
 * pixels away in a side panel. By the time anyone notices the label the
 * motors have stopped, and the demo's best moment — a physical thing moving
 * because somebody pressed a button — reads as a delay.
 *
 * So it is said over the picture, in type you can read across a meeting room.
 *
 * **It is derived from what is actually moving, not from what was asked for.**
 * `busyDevices` holds the ids of devices mid-travel, and only shades and AV
 * screens ever enter it — those are the two things in these rooms with a
 * physical position. The direction comes from sampling that position twice:
 * a shade whose value is rising is closing, an AV screen whose value is rising
 * is coming down. Nothing here reads a scene's intent, so it stays honest when
 * a scene is interrupted, when a rule moves a blind on its own, or when the
 * presenter drags a slider by hand — none of which any scene label would
 * have covered.
 */

import { useEffect, useRef, useState } from "react";
import { useSim } from "@/lib/sim/store";
import type { AvState, ShadeState } from "@/lib/sim/types";

/** How often the travel sampler looks. Fast enough to name a direction
 *  within a fifth of a second, slow enough to cost nothing. */
const SAMPLE_MS = 180;

/**
 * Where a travelling device has got to, as one number.
 *
 * A shade has two layers and either can be moving, so they are summed: the
 * pair only ever moves the same way within a single command, and summing
 * means a sheer closing while a blackout holds still still reads as closing.
 */
function travelPosition(state: unknown, kind: string): number | null {
  if (kind === "shade") {
    const s = state as ShadeState | undefined;
    if (!s) return null;
    return s.sheer + s.blackout;
  }
  if (kind === "av") {
    const s = state as AvState | undefined;
    // Audio and music are `av` devices too and have no position at all. Only
    // something with a screen is physically going anywhere.
    if (!s || typeof s.screen !== "number") return null;
    return s.screen;
  }
  return null;
}

function phrase(name: string, kind: string, rising: boolean): string {
  const noun = name.toLowerCase();
  if (kind === "av") return `${rising ? "Lowering" : "Raising"} the ${noun}`;
  return `${rising ? "Closing" : "Opening"} the ${noun}`;
}

/** The one physical thing currently moving, named and directed. */
function useTravelling(): string | null {
  const busy = useSim((s) => s.busyDevices);
  const [label, setLabel] = useState<string | null>(null);
  const key = busy.join(",");

  useEffect(() => {
    if (busy.length === 0) {
      setLabel(null);
      return;
    }

    const previous = new Map<string, number>();

    const sample = () => {
      const { space, states, busyDevices } = useSim.getState();
      if (!space) return;
      let best: string | null = null;

      for (const id of busyDevices) {
        const device = space.devices.find((d) => d.id === id);
        if (!device) continue;
        const now = travelPosition(states[id], device.kind);
        if (now === null) continue;

        const before = previous.get(id);
        previous.set(id, now);
        if (before === undefined) continue;

        // A motor that has reached its stop is still locked for a moment
        // afterwards; saying nothing is better than naming a direction from
        // rounding noise.
        const delta = now - before;
        if (Math.abs(delta) < 0.25) continue;
        best = phrase(device.name, device.kind, delta > 0);
        break;
      }

      setLabel((current) => best ?? current);
    };

    sample();
    const timer = setInterval(sample, SAMPLE_MS);
    return () => clearInterval(timer);
    // `key` rather than `busy`: the array identity changes on membership, and
    // membership is exactly when the sampler needs restarting.
  }, [key, busy.length]);

  return label;
}

export function StageStatus() {
  const space = useSim((s) => s.space);
  const sequence = useSim((s) => s.sequence);
  const settleMs = useSim((s) => s.settleMs);
  const sceneRunId = useSim((s) => s.sceneRunId);
  const travelling = useTravelling();

  /**
   * The same decoupling the phone panel's progress bar needed.
   *
   * `busy` is an input lock and a rule firing mid-fade clears it, which is
   * right for a lock and wrong for anything the eye is following. This runs
   * off the settle time the press itself published and nothing cancels it
   * early.
   */
  const [settling, setSettling] = useState(false);
  const started = useRef(0);
  useEffect(() => {
    if (sceneRunId === 0 || settleMs <= 0) return;
    setSettling(true);
    started.current = Date.now();
    const timer = setTimeout(() => setSettling(false), settleMs);
    return () => clearTimeout(timer);
  }, [sceneRunId, settleMs]);

  const scene = sequence
    ? space?.scenes.find((s) => s.id === sequence.sceneId)
    : undefined;

  const showing = Boolean(sequence) || settling || Boolean(travelling);
  if (!space || !showing) return null;

  /**
   * Stage zero is not step zero.
   *
   * `sequence.step` counts the stages in `steps`, and a scene's own `targets`
   * run before the first of them — so the moment a staged scene is pressed it
   * publishes step 0, and the band said "STEP 0 OF 4". Nobody counts from
   * zero out loud. While stage zero is settling there is no step to name, so
   * the counter simply waits for one.
   */
  const eyebrow = [
    scene?.name?.toUpperCase(),
    sequence && sequence.step > 0
      ? `STEP ${sequence.step} OF ${sequence.total}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  /**
   * What is physically moving wins over what the scene calls this stage.
   *
   * "Closing the blinds" is a fact about the room; "Curtains close" is a line
   * in a config file. When they agree the first is better written, and when
   * they disagree the first is the true one.
   */
  const headline =
    travelling ??
    // At stage zero `sequence.label` is the scene's own name, which would
    // have the band say "EVENING / Evening". There is no stage to narrate
    // yet, so it says what is actually happening.
    (sequence && sequence.step > 0 ? sequence.label : null) ??
    (settling || sequence ? "Setting the scene" : null);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 bg-gradient-to-t from-black/75 via-black/45 to-transparent px-4 pb-5 pt-14 sm:pb-7"
      // Announced politely: a salesperson may be running this with a screen
      // reader on a shared display, and it changes several times a scene.
      role="status"
      aria-live="polite"
    >
      {eyebrow && (
        <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brass-400 sm:text-[11px]">
          {eyebrow}
        </div>
      )}
      <div className="flex items-center gap-2.5 text-center text-lg font-medium text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] sm:text-2xl">
        {travelling && (
          <span
            aria-hidden
            className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-brass-400 sm:h-2.5 sm:w-2.5"
          />
        )}
        {headline}
      </div>

      <div className="mt-1 h-[3px] w-full max-w-sm overflow-hidden rounded-full bg-white/15">
        {sequence ? (
          <div
            className="h-full bg-brass-400 transition-[width] duration-500 ease-out"
            style={{ width: `${(sequence.step / sequence.total) * 100}%` }}
          />
        ) : (
          <div
            // Keyed on the run id so pressing the same scene twice restarts
            // the animation instead of leaving a finished bar on screen.
            key={sceneRunId}
            className="h-full bg-brass-400"
            style={{ animation: `scene-progress ${settleMs}ms linear forwards` }}
          />
        )}
      </div>
    </div>
  );
}
