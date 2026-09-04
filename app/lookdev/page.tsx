"use client";

/**
 * Look-dev harness. Development only — not part of the demo.
 *
 * One room, one state, side by side with the reference frame at matched size,
 * with every tuning knob exposed as a URL parameter. Iterating on lighting by
 * editing constants and waiting for a rebuild is far too slow to converge on a
 * look; this way a pass is one URL away.
 *
 *   /lookdev?exp=1.1&cove=100&fov=46&cx=0.8&cy=1.55&cz=4.2&tx=4.2&ty=1.1&tz=0.5
 *
 * `?view=render` gives the render alone, for clean screenshots.
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

/** Reference frame dimensions, so both panels compare at 1:1. */
const REF_W = 678;
const REF_H = 470;

function light(
  level: number,
  cct: number,
  extra?: Partial<LightState>,
): LightState {
  return { on: level > 0, level, cct, hue: 0, sat: 0, ...extra };
}

function LookDevInner() {
  const q = useSearchParams();
  const num = (key: string, fallback: number) => {
    const v = q.get(key);
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const view = q.get("view") ?? "compare";
  const scene = q.get("scene") ?? "bright";

  // Reference states, read off the video frames.
  const presets: Record<string, { fixtures: BedroomFixtures; blackout: number; sheer: number; ref: string }> = {
    bright: {
      fixtures: {
        cove: light(num("cove", 100), num("covek", 3500)),
        downlights: light(num("dl", 42), num("dlk", 3000)),
        pendant: light(num("pend", 80), num("pendk", 2700)),
        accent: light(num("acc", 70), 6500, { hue: 218, sat: 88 }),
      },
      blackout: num("blackout", 100),
      sheer: num("sheer", 0),
      ref: "/reference/bedroom-bright-blackout.jpg",
    },
    relax: {
      fixtures: {
        cove: light(num("cove", 62), num("covek", 2500)),
        downlights: light(num("dl", 0), num("dlk", 3000)),
        pendant: light(num("pend", 70), num("pendk", 2400)),
        accent: light(num("acc", 70), 6500, { hue: 218, sat: 88 }),
      },
      blackout: num("blackout", 0),
      sheer: num("sheer", 100),
      ref: "/reference/bedroom-relax-sheer.jpg",
    },
  };

  const preset = presets[scene] ?? presets.bright;

  const camera = {
    position: [num("cx", 1.6), num("cy", 1.45), num("cz", 5.9)] as [number, number, number],
    target: [num("tx", 6.3), num("ty", 1.05), num("tz", 0.6)] as [number, number, number],
    fov: num("fov", 44),
  };

  const render = (
    <div
      style={{ width: REF_W, height: REF_H }}
      className="overflow-hidden rounded-lg bg-black ring-1 ring-shell-700"
    >
      <Stage3D
        camera={camera}
        bloomIntensity={num("bloom", 0.62)}
        bloomThreshold={num("thr", 1.0)}
      >
        <MasterBedroom
          curtains={{ sheer: preset.sheer, blackout: preset.blackout }}
          night={q.get("day") !== "1"}
        />
        <BedroomLightRig fixtures={preset.fixtures} gain={num("exp", 1)} />
      </Stage3D>
    </div>
  );

  if (view === "render") {
    return <div className="flex min-h-screen items-center justify-center bg-shell-950">{render}</div>;
  }

  return (
    <div className="min-h-screen bg-shell-950 p-4">
      <div className="mb-3 flex items-baseline gap-3">
        <h1 className="text-sm font-semibold text-shell-100">
          Look-dev — Master Bedroom
        </h1>
        <span className="text-[11px] text-shell-500">
          scene={scene} · exp={num("exp", 1.05)} · fov={camera.fov} · cam=
          {camera.position.join(",")} → {camera.target.join(",")}
        </span>
      </div>

      <div className="flex flex-wrap gap-4">
        <figure className="m-0">
          <figcaption className="mb-1 text-[11px] uppercase tracking-wider text-shell-500">
            Reference (video frame)
          </figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preset.ref}
            alt="reference frame"
            width={REF_W}
            height={REF_H}
            className="rounded-lg ring-1 ring-shell-700"
          />
        </figure>

        <figure className="m-0">
          <figcaption className="mb-1 text-[11px] uppercase tracking-wider text-brass-500">
            Real-time 3D
          </figcaption>
          {render}
        </figure>
      </div>
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
