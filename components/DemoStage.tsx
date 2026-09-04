"use client";

/**
 * The demo screen.
 *
 * Laid out for a tablet held in landscape at a client's table: the room as
 * large as it can be, the scene pad permanently under the presenter's thumb,
 * and everything discursive — products, energy, automation — behind tabs in a
 * rail that never pushes the room off screen.
 */

import { useLayoutEffect, useState } from "react";
import Link from "next/link";
import { useSim } from "@/lib/sim/store";
import { useTicker } from "@/lib/sim/useTicker";
import { getSpace } from "@/lib/spaces";
import { SpaceCanvas } from "@/components/stage/SpaceCanvas";
import { ScenePad, SceneCue } from "@/components/controls/ScenePad";
import { DeviceControls } from "@/components/controls/DeviceControls";
import { SensorStrip } from "@/components/panels/SensorStrip";
import { ProductPanel } from "@/components/panels/ProductPanel";
import { EnergyPanel } from "@/components/panels/EnergyPanel";
import { AutomationPanel } from "@/components/panels/AutomationPanel";
import { ClockScrubber } from "@/components/presenter/ClockScrubber";
import { Keypad } from "@/components/keypad/Keypad";
import { StatusCard } from "@/components/panels/StatusCard";

const TABS = [
  { id: "controls", label: "Controls" },
  { id: "products", label: "Products" },
  { id: "energy", label: "Energy" },
  { id: "automation", label: "Automation" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function DemoStage({ spaceId }: { spaceId: string }) {
  const loadSpace = useSim((s) => s.loadSpace);
  const loadedId = useSim((s) => s.space?.id);
  const [tab, setTab] = useState<TabId>("controls");

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
          <Link
            href="/"
            className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brass-500 hover:text-brass-400"
          >
            Uniser
          </Link>
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
              <div className="flex w-full shrink-0 flex-col gap-3 lg:w-[224px]">
                <Keypad />
                <StatusCard />
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
            {tab === "controls" && <DeviceControls />}
            {tab === "products" && <ProductPanel />}
            {tab === "energy" && <EnergyPanel />}
            {tab === "automation" && <AutomationPanel />}
          </div>
        </aside>
      </main>
    </div>
  );
}
