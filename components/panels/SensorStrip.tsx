"use client";

/**
 * Live sensor readouts, under the room.
 *
 * Occupancy is a control rather than a readout, and deliberately sits here in
 * the most visible row on screen. Setting it to Vacant and letting the room
 * time out is the single most persuasive thing in the demo — it is the moment a
 * client stops seeing an app with switches in it and starts seeing a building
 * that runs itself.
 */

import type {
  SensorDevice,
  SensorState,
  SolarDevice,
  SolarState,
} from "@/lib/sim/types";
import { useSim } from "@/lib/sim/store";
import { formatWatts } from "@/lib/sim/energy";
import { StatTile } from "@/components/ui/Primitives";

function format(metric: SensorDevice["metric"], value: number): string {
  switch (metric) {
    case "lux":
      return Math.round(value).toLocaleString();
    case "temperature":
      return value.toFixed(1);
    case "pm25":
      return Math.round(value).toString();
    default:
      return value.toFixed(0);
  }
}

/** WHO 24-hour guidance for PM2.5 is 15 µg/m³; 35 is the looser interim step. */
function pm25Tone(value: number): "good" | "warn" | "alert" {
  if (value <= 15) return "good";
  if (value <= 35) return "warn";
  return "alert";
}

function OccupancyControl({ device }: { device: SensorDevice }) {
  const state = useSim((s) => s.states[device.id] as SensorState | undefined);
  const patch = useSim((s) => s.patch);
  if (!state) return null;

  const occupied = state.value > 0.5;

  return (
    <div className="rounded-lg border border-shell-800 bg-shell-900/60 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-shell-500">
        Occupancy
      </div>
      <div className="mt-1 flex gap-1">
        {[
          { label: "Occupied", value: 1 },
          { label: "Vacant", value: 0 },
        ].map((option) => {
          const active = occupied === (option.value === 1);
          return (
            <button
              key={option.label}
              type="button"
              onClick={() => patch(device.id, { value: option.value })}
              aria-pressed={active}
              className={`flex-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors ${
                active
                  ? "bg-brass-600 text-shell-950"
                  : "bg-shell-800 text-shell-400 hover:text-shell-200"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SensorStrip() {
  const space = useSim((s) => s.space);
  const states = useSim((s) => s.states);
  if (!space) return null;

  const sensors = space.devices.filter(
    (d): d is SensorDevice => d.kind === "sensor",
  );
  const occupancy = sensors.find((s) => s.metric === "occupancy");
  const readouts = sensors.filter((s) => s.metric !== "occupancy");
  const solar = space.devices.find((d): d is SolarDevice => d.kind === "solar");

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {occupancy && <OccupancyControl device={occupancy} />}

      {readouts.map((sensor) => {
        const state = states[sensor.id] as SensorState | undefined;
        if (!state) return null;
        return (
          <StatTile
            key={sensor.id}
            label={sensor.name}
            value={format(sensor.metric, state.value)}
            unit={sensor.unit}
            tone={sensor.metric === "pm25" ? pm25Tone(state.value) : "neutral"}
          />
        );
      })}

      {solar && (
        <StatTile
          label="Solar Now"
          value={formatWatts(
            (states[solar.id] as SolarState | undefined)?.generationW ?? 0,
          )}
          hint={`${solar.kwp} kWp array`}
          tone="good"
        />
      )}
    </div>
  );
}
