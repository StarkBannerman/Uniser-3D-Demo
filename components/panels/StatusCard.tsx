"use client";

/**
 * Scene status readout.
 *
 * The reference prototype's second panel: what is running, what the lighting
 * level is, where the curtains are, what the climate is doing. It exists so the
 * salesperson never has to narrate state — the client can read it.
 *
 * Lighting level is a weighted average across the room's fixtures rather than
 * any single one, weighted by connected load, so a 22 m cove counts for more
 * than one pendant. An unweighted mean would read 50% with only the pendant on.
 */

import { useSim } from "@/lib/sim/store";
import type {
  ClimateState,
  LightDevice,
  LightState,
  ShadeState,
} from "@/lib/sim/types";
import { formatClock } from "@/lib/sim/clock";

function curtainLabel(shade: ShadeState | undefined): string {
  if (!shade) return "—";
  if (shade.blackout > 50) return "Blackout";
  if (shade.sheer > 50) return "Sheer";
  if (shade.sheer > 2 || shade.blackout > 2) return "Part open";
  return "Open";
}

function climateLabel(climate: ClimateState | undefined): string {
  if (!climate) return "—";
  if (!climate.on) return "Standby";
  const verb =
    climate.mode === "cool" ? "cooling" : climate.mode === "heat" ? "heating" : climate.mode;
  return `${climate.setpointC.toFixed(0)}°C ${verb}`;
}

export function StatusCard() {
  const space = useSim((s) => s.space);
  const states = useSim((s) => s.states);
  const activeSceneId = useSim((s) => s.activeSceneId);
  const clockMin = useSim((s) => s.clockMin);

  if (!space) return null;

  const scene = space.scenes.find((s) => s.id === activeSceneId);
  const lights = space.devices.filter((d): d is LightDevice => d.kind === "light");

  let lit = 0;
  let load = 0;
  for (const device of lights) {
    const state = states[device.id] as LightState | undefined;
    if (!state) continue;
    const w = device.fixtures * device.wattsEach;
    load += w;
    if (state.on) lit += w * (state.level / 100);
  }
  const level = load > 0 ? (lit / load) * 100 : 0;

  const shade = space.devices.find((d) => d.kind === "shade");
  const climate = space.devices.find((d) => d.kind === "climate");

  const rows = [
    { label: "Curtains", value: curtainLabel(shade ? (states[shade.id] as ShadeState) : undefined) },
    {
      label: "Climate",
      value: climateLabel(climate ? (states[climate.id] as ClimateState) : undefined),
    },
  ];

  return (
    <div className="rounded-lg border border-shell-800 bg-shell-900/70 p-3.5">
      <div className="text-base font-medium leading-tight text-shell-100">
        {scene ? scene.name : "Adjusted"}
      </div>
      <div className="mt-0.5 text-[11px] text-shell-500">
        {space.name} · {formatClock(clockMin)}
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between text-[11px]">
          <span className="text-shell-400">Lighting level</span>
          <span className="font-mono text-shell-200">
            {level < 0.5 ? "—" : `${Math.round(level)}%`}
          </span>
        </div>
        <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-shell-800">
          <div
            className="h-full rounded-full bg-brass-500 transition-[width] duration-200"
            style={{ width: `${Math.min(100, level)}%` }}
          />
        </div>
      </div>

      <dl className="mt-3 space-y-1.5 border-t border-shell-800 pt-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between text-[11px]">
            <dt className="text-shell-400">{row.label}</dt>
            <dd className="text-shell-200">{row.value}</dd>
          </div>
        ))}
      </dl>

      {scene && (
        <p className="mt-3 border-t border-shell-800 pt-2.5 text-[11px] leading-snug text-shell-500">
          {scene.blurb}
        </p>
      )}
    </div>
  );
}
