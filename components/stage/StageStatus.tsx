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

  const showing = Boolean(sequence) || settling || Boolean(travelling);
  if (!space || !showing) return null;

  /**
   * The step counter alone, and only on a wide enough screen.
   *
   * The scene's name used to lead this. It is already lit in the scene pad
   * beside the room, and repeating it in a chip this small crowded out the one
   * thing shown nowhere else — which stage of a staged scene is running.
   *
   * `sequence.step` counts the stages in `steps`, and a scene's own `targets`
   * run before the first of them, so a staged scene publishes step 0 the
   * moment it is pressed. Nobody counts from zero out loud; while stage zero
   * settles there is no step to name and the counter waits for one.
   */
  const eyebrow =
    sequence && sequence.step > 0
      ? `${sequence.step}/${sequence.total}`
      : null;

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
    /**
     * A chip, not a band.
     *
     * The first version was a full-width gradient scrim with two-line type and
     * a progress bar across the bottom of the picture. It was legible from the
     * back of a room, which was the point — and it also covered the bottom
     * sixth of the render and read as the software telling you to wait.
     *
     * What a client actually needs is one short fact, placed where it does not
     * sit on the furniture, that they can ignore. So: a single line in a small
     * pill, bottom left, over a blur rather than a scrim. The progress bar is
     * gone with it — the room itself is the progress indicator, and a bar
     * beside a visibly moving blind is telling somebody something they can
     * already see.
     */
    <div
      className="pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 backdrop-blur-sm ring-1 ring-white/10 sm:bottom-4 sm:left-4"
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brass-400 ${
          travelling ? "animate-pulse" : ""
        }`}
      />
      <span className="text-[12px] font-medium text-white/90 sm:text-[13px]">
        {headline}
      </span>
      {eyebrow && (
        <span className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40 sm:inline">
          {eyebrow}
        </span>
      )}
    </div>
  );
}
