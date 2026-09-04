"use client";

/**
 * The time-of-day scrubber — the demo's spine.
 *
 * Dragging from 6am to 10pm moves circadian colour, daylight harvesting, solar
 * generation and the dusk schedule at once. That simultaneity is the argument:
 * a client watching one slider change five things understands they are buying a
 * system, not a set of switches.
 *
 * The track is painted with the actual day: night, the sunrise band, daylight,
 * the sunset band, night again, from the space's own coordinates.
 */

import type { SpaceEnvironment } from "@/lib/sim/types";
import { useSim } from "@/lib/sim/store";
import {
  CLOCK_RATES,
  MINUTES_PER_DAY,
  formatClock,
  outdoorTemperature,
} from "@/lib/sim/clock";
import { Slider } from "@/components/ui/Primitives";

const NIGHT = "#12141a";
const TWILIGHT = "#c9834a";
const DAY = "#93b6d8";

function dayTrack(env: SpaceEnvironment): string {
  const pct = (m: number) => (Math.max(0, Math.min(MINUTES_PER_DAY, m)) / MINUTES_PER_DAY) * 100;
  const { sunriseMin: rise, sunsetMin: set } = env;
  return [
    "linear-gradient(to right",
    `${NIGHT} 0%`,
    `${NIGHT} ${pct(rise - 45)}%`,
    `${TWILIGHT} ${pct(rise + 10)}%`,
    `${DAY} ${pct(rise + 110)}%`,
    `${DAY} ${pct(set - 110)}%`,
    `${TWILIGHT} ${pct(set - 10)}%`,
    `${NIGHT} ${pct(set + 45)}%`,
    `${NIGHT} 100%)`,
  ].join(", ");
}

export function ClockScrubber() {
  const space = useSim((s) => s.space);
  const clockMin = useSim((s) => s.clockMin);
  const rate = useSim((s) => s.rate);
  const setClock = useSim((s) => s.setClock);
  const setRate = useSim((s) => s.setRate);
  const resetSpace = useSim((s) => s.resetSpace);

  if (!space) return null;

  const outdoorC = outdoorTemperature(clockMin, space.environment);

  return (
    <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-64">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="font-mono text-sm text-shell-100">
            {formatClock(clockMin)}
          </span>
          <span className="text-[10px] text-shell-500">
            outdoors {outdoorC.toFixed(0)}°C
          </span>
        </div>
        <Slider
          label="Time of day"
          value={clockMin}
          min={0}
          max={MINUTES_PER_DAY - 1}
          step={1}
          fill={dayTrack(space.environment)}
          onChange={setClock}
        />
      </div>

      <div className="flex items-center gap-1 rounded-lg bg-shell-850 p-1">
        {CLOCK_RATES.map((option) => {
          const active = Math.abs(rate - option.value) < 1e-6;
          return (
            <button
              key={option.label}
              type="button"
              onClick={() => setRate(option.value)}
              aria-pressed={active}
              className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                active
                  ? "bg-shell-700 text-shell-100"
                  : "text-shell-400 hover:text-shell-200"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={resetSpace}
        title="Return the space to its opening state before the next client"
        className="rounded-lg border border-shell-700 px-3 py-1.5 text-[11px] font-medium text-shell-300 transition-colors hover:border-shell-500 hover:text-shell-100"
      >
        Reset space
      </button>
    </div>
  );
}
