"use client";

/**
 * Look-dev harness. Development only — not part of the demo.
 *
 * One room, one lighting state, every tuning knob exposed as a URL parameter.
 * Iterating on lighting by editing constants and waiting for a rebuild is far
 * too slow to converge on a look; this way a pass is one URL away.
 *
 *   /lookdev?scene=evening&exp=1.1&fov=52&cx=0.95&cy=1.52&cz=5.85&tx=5.2&ty=1.05&tz=0.9
 *
 * `?view=render` gives the render alone and full-bleed, for clean screenshots.
 */

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { LightState } from "@/lib/sim/types";
import { Stage3D } from "@/components/stage/Stage3D";
import { MasterBedroom } from "@/components/stage/rooms3d/MasterBedroom";
import {
  BedroomLightRig,
  type BedroomFixtures,
} from "@/components/stage/rooms3d/BedroomLightRig";

function light(level: number, cct: number): LightState {
  return { on: level > 0, level, cct, hue: 0, sat: 0 };
}

const OFF = light(0, 2700);

/**
 * Lighting states worth looking at, taken from the space's own scenes.
 *
 * Kept as plain numbers rather than imported from the space config on purpose:
 * this harness exists to try values that are *not* in the config yet.
 */
const PRESETS: Record<string, { fixtures: BedroomFixtures; sheer: number; blackout: number }> = {
  evening: {
    fixtures: {
      general: light(35, 2700),
      cove: light(70, 2700),
      bedsideLeft: light(60, 2400),
      bedsideRight: light(60, 2400),
      readingLeft: OFF,
      readingRight: OFF,
      wardrobe: light(45, 3200),
      night: OFF,
    },
    sheer: 100,
    blackout: 0,
  },
  reading: {
    fixtures: {
      general: OFF,
      cove: light(15, 2200),
      bedsideLeft: OFF,
      bedsideRight: light(40, 2400),
      readingLeft: OFF,
      readingRight: light(90, 3200),
      wardrobe: OFF,
      night: light(25, 2200),
    },
    sheer: 100,
    blackout: 100,
  },
  night: {
    fixtures: {
      general: OFF,
      cove: light(8, 2200),
      bedsideLeft: OFF,
      bedsideRight: OFF,
      readingLeft: OFF,
      readingRight: OFF,
      wardrobe: OFF,
      night: light(35, 2200),
    },
    sheer: 100,
    blackout: 100,
  },
  morning: {
    fixtures: {
      general: light(75, 4200),
      cove: light(60, 4200),
      bedsideLeft: OFF,
      bedsideRight: OFF,
      readingLeft: OFF,
      readingRight: OFF,
      wardrobe: light(70, 4000),
      night: OFF,
    },
    sheer: 0,
    blackout: 0,
  },
  /** Everything off. The diagnostic: if the room is still visible, something
      is lighting it that should not be. */
  dark: {
    fixtures: {
      general: OFF,
      cove: OFF,
      bedsideLeft: OFF,
      bedsideRight: OFF,
      readingLeft: OFF,
      readingRight: OFF,
      wardrobe: OFF,
      night: OFF,
    },
    sheer: 100,
    blackout: 100,
  },
};

function LookDevInner() {
  const q = useSearchParams();
  const num = (key: string, fallback: number) => {
    const v = q.get(key);
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const view = q.get("view") ?? "compare";
  const scene = q.get("scene") ?? "evening";
  const preset = PRESETS[scene] ?? PRESETS.evening;

  const camera = {
    position: [num("cx", 0.95), num("cy", 1.52), num("cz", 5.85)] as [number, number, number],
    target: [num("tx", 5.2), num("ty", 1.05), num("tz", 0.9)] as [number, number, number],
    fov: num("fov", 52),
  };

  // Look-dev renders with no bounce fill unless asked, so the fixtures can be
  // judged on their own. The demo derives this from the room's illuminance.
  const ambient = {
    level: num("amb", 0.18),
    color: [255, 238, 214] as [number, number, number],
  };

  const render = (
    <Stage3D
      camera={camera}
      ambient={ambient}
      bloomIntensity={num("bloom", 0.5)}
      bloomThreshold={num("thr", 1.05)}
    >
      <MasterBedroom
        curtains={{
          sheer: num("sheer", preset.sheer),
          blackout: num("blackout", preset.blackout),
        }}
        night={q.get("day") !== "1"}
        fanRadiansPerSecond={num("fan", 2.5)}
      />
      <BedroomLightRig
        fixtures={preset.fixtures}
        gain={num("exp", 1)}
        daylight={num("sun", q.get("day") === "1" ? 0.8 : 0)}
        transmission={num("trans", 1 - num("sheer", preset.sheer) / 200)}
      />
    </Stage3D>
  );

  if (view === "render") {
    return <div className="h-screen w-screen bg-black">{render}</div>;
  }

  return (
    <div className="min-h-screen bg-shell-950 p-4">
      <div className="mb-3 flex items-baseline gap-3">
        <h1 className="text-sm font-semibold text-shell-100">
          Look-dev — Master Bedroom
        </h1>
        <span className="text-[11px] text-shell-500">
          scene={scene} · exp={num("exp", 1)} · fov={camera.fov} · cam=
          {camera.position.join(",")} → {camera.target.join(",")}
        </span>
      </div>
      <div className="aspect-[16/10] w-full max-w-[1400px] overflow-hidden rounded-lg bg-black ring-1 ring-shell-700">
        {render}
      </div>
      <p className="mt-2 text-[11px] text-shell-500">
        scenes: {Object.keys(PRESETS).join(" · ")}
      </p>
    </div>
  );
}

export default function LookDevPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-shell-500">Loading…</div>}>
      <LookDevInner />
    </Suspense>
  );
}
