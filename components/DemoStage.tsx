"use client";

/**
 * The demo screen.
 *
 * Laid out for a tablet held in landscape at a client's table: the room as
 * large as it can be, the wall keypad beside it where it would be beside the
 * door, and the phone in a rail that never pushes the room off screen.
 *
 * Two interfaces, not three. Both are things a client will actually touch, and
 * pressing either moves the other — which is the whole cross-platform claim,
 * demonstrated rather than asserted.
 */

import { useLayoutEffect } from "react";
import { useSim } from "@/lib/sim/store";
import { useTicker } from "@/lib/sim/useTicker";
import { getSpace } from "@/lib/spaces";
import { SpaceCanvas } from "@/components/stage/SpaceCanvas";
import { ScenePad, SceneCue } from "@/components/controls/ScenePad";
import { SensorStrip } from "@/components/panels/SensorStrip";
import { ClockScrubber } from "@/components/presenter/ClockScrubber";
import { Keypad } from "@/components/keypad/Keypad";
import { AppPanel } from "@/components/mobile/AppPanel";

export function DemoStage({ spaceId }: { spaceId: string }) {
  const loadSpace = useSim((s) => s.loadSpace);
  const loadedId = useSim((s) => s.space?.id);

  useTicker();

  /**
   * Layout effect, not a plain effect: this runs after render but before the
   * browser paints, so the "Preparing…" state never actually reaches the
   * screen. With `useEffect` the placeholder gets one painted frame, which is a
   * visible flicker every time a salesperson opens a space in front of a
   * client — cheap to avoid, and the sort of thing that reads as unfinished.
   */
  useLayoutEffect(() => {
    const space = getSpace(spaceId);
    if (space) loadSpace(space);
  }, [spaceId, loadSpace]);

  const space = useSim((s) => s.space);
  /**
   * 3D spaces are driven from the wall keypad rather than the wide scene pad —
   * the panel is the product, and showing both would be two controls for one job.
   */
  const keypadLed = space?.renderer === "3d";

  // The store loads in an effect, so the first paint has no space yet.
  if (!space || loadedId !== spaceId) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-shell-500">
        Preparing {spaceId.replace(/-/g, " ")}…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-shell-800 bg-shell-900/80 px-3 py-2.5">
        <div className="flex items-center gap-3">
          {/* A mark, not a link. Home redirects here, so clicking it would tear
              down and rebuild the WebGL scene — which mid-pitch looks like a
              crash. Make it a Link again when there is more than one room. */}
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brass-500">
            Uniser
          </span>
          <div className="h-5 w-px bg-shell-700" />
          <div>
            <div className="text-sm font-medium leading-tight text-shell-100">
              {space.name}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-shell-500">
              {space.category}
            </div>
          </div>
        </div>
        <ClockScrubber />
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 lg:flex-row lg:overflow-hidden">
        <div className="u-scroll flex min-w-0 flex-1 flex-col gap-3 lg:overflow-y-auto">
          {/* The keypad sits beside the room, as it would on the wall beside the
              door. Spaces without a 3D room keep the wider scene pad below. */}
          {keypadLed ? (
            <div className="flex flex-col gap-3 lg:flex-row">
              <div className="min-w-0 flex-1">
                <SpaceCanvas />
              </div>
              {/* Keypad only. The status card under it restated the active
                  scene, the curtain position and the setpoint — all of which
                  the phone already shows, live. */}
              <div className="flex w-full shrink-0 flex-col gap-3 lg:w-[248px]">
                <Keypad />
              </div>
            </div>
          ) : (
            <SpaceCanvas />
          )}
          <SensorStrip />
          {!keypadLed && (
            <div className="space-y-2">
              <ScenePad />
              <SceneCue />
            </div>
          )}
        </div>

        {/* The phone. The per-device control list that used to sit beside it
            drove the same state through a second set of sliders, so it was two
            interfaces for one job — and the phone is the one a client
            recognises. `components/controls/DeviceControls.tsx` is still on
            disk if the engineering-facing view is wanted back. */}
        <aside className="u-scroll flex w-full shrink-0 flex-col overflow-y-auto pr-1 lg:w-[368px]">
          <AppPanel />
        </aside>
      </main>
    </div>
  );
}
