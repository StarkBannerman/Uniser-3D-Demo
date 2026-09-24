"use client";

/**
 * The demo screen.
 *
 * Laid out for a tablet held in landscape at a client's table: the room takes
 * every pixel the rest of the layout is not using, and the two interfaces that
 * drive it share a rail that never pushes it off screen.
 *
 * App and Device are tabs rather than a split because they are two ways to do
 * one job, not two jobs. Pressing either moves the room, because there is one
 * state rather than three copies of it.
 *
 * The wall keypad is still built — `components/keypad/Keypad.tsx`, with its
 * layouts and finishes — and is one import away. It comes back when the panel
 * itself is what is being sold.
 */

import { useLayoutEffect, useState } from "react";
import { useSim } from "@/lib/sim/store";
import { useTicker } from "@/lib/sim/useTicker";
import { getSpace } from "@/lib/spaces";
import { SpaceCanvas } from "@/components/stage/SpaceCanvas";
import { ScenePad, SceneCue } from "@/components/controls/ScenePad";
import { DeviceControls } from "@/components/controls/DeviceControls";
import { ClockScrubber } from "@/components/presenter/ClockScrubber";
import { AppPanel } from "@/components/mobile/AppPanel";

/**
 * The phone first, the per-device list behind it.
 *
 * App leads because it is the interface a client recognises and the one that
 * matches the keypad beside the room. Device is the same state through one
 * control per fixture — the view an architect or an integrator asks for.
 */
const TABS = [
  { id: "app", label: "App" },
  { id: "device", label: "Device" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function DemoStage({ spaceId }: { spaceId: string }) {
  const loadSpace = useSim((s) => s.loadSpace);
  const loadedId = useSim((s) => s.space?.id);
  const [tab, setTab] = useState<TabId>("app");

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
  /** A 3D room carries its own scene control on the phone; a flat one does not. */
  const roomIs3D = space?.renderer === "3d";

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

      {/* `min-h-0` on every rung of this ladder is what lets the room grow. A
          flex child defaults to min-height:auto, which refuses to shrink below
          its content and quietly caps the stage's height. */}
      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 lg:flex-row lg:overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {/* A 3D room gets the whole panel. Its scenes live on the phone, so
              there is nothing to sit beside it; a space without a 3D room still
              needs the wide scene pad underneath. */}
          <SpaceCanvas />
          {!roomIs3D && (
            <div className="shrink-0 space-y-2">
              <ScenePad />
              <SceneCue />
            </div>
          )}
        </div>

        <aside className="flex w-full shrink-0 flex-col lg:w-[368px]">
          <div className="mb-2 flex shrink-0 gap-1 rounded-lg bg-shell-850 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-pressed={tab === t.id}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.id
                    ? "bg-shell-700 text-shell-100"
                    : "text-shell-400 hover:text-shell-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="u-scroll min-h-0 flex-1 overflow-y-auto pr-1 pb-4">
            {tab === "app" && <AppPanel />}
            {tab === "device" && <DeviceControls />}
          </div>
        </aside>
      </main>
    </div>
  );
}
