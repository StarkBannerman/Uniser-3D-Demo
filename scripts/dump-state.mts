/**
 * Print the room, settled, as JSON.
 *
 * `scripts/measure-plates.py` can composite a plate set exactly the way the
 * shader does, but it has no idea what the room is *doing* — and working
 * that out from the scene table by hand is how a measurement ends up
 * describing a state the app never reaches. Daylight harvesting trims the
 * downlights, circadian tuning owns the colour of anything a scene did not
 * claim, and a staged scene is only itself once every beat has run.
 *
 * So this drives the real store: load the space, press the scene, advance a
 * virtual clock until nothing is moving, and print what the devices actually
 * hold. The Python side renders those numbers. Between them there is one
 * source of truth for the state and one for the pixels, and neither
 * reimplements the other.
 *
 *     tsx scripts/dump-state.mts room welcome > state.json
 *     tsx scripts/dump-state.mts room --all        # every scene, measured
 */

let virtualNow = 0;
// @ts-expect-error - replacing the host timer with a controllable one
globalThis.performance = { now: () => virtualNow };

import { useSim } from "../lib/sim/store";
import { getSpace, spaces } from "../lib/spaces";
import type { AvState, LightState, ShadeState } from "../lib/sim/types";

const FRAME = 16.7;

/** Advance the simulation by `ms` of virtual real time. */
function run(ms: number) {
  for (let i = 0; i < Math.ceil(ms / FRAME); i++) {
    virtualNow += FRAME;
    useSim.getState().tick(FRAME);
  }
}

/**
 * Long enough for the slowest thing in any of these rooms.
 *
 * The hotel room's Guest Arrival is about eight seconds of beats with a
 * four-second curtain inside it, and the rules keep nudging levels for a
 * while after. Twenty-five seconds of virtual time costs nothing here and
 * removes the question.
 */
const SETTLE_MS = 25000;

function dump(spaceId: string, sceneId: string) {
  const space = getSpace(spaceId);
  if (!space) throw new Error(`no space "${spaceId}" — have ${spaces.map((s) => s.id).join(", ")}`);
  if (!space.scenes.some((sc) => sc.id === sceneId)) {
    throw new Error(`no scene "${sceneId}" in ${spaceId}`);
  }
  useSim.getState().loadSpace(space);
  run(FRAME * 2);
  useSim.getState().applyScene(sceneId);
  run(SETTLE_MS);

  const { states, clockMin, daylightMix, daylightTint } = useSim.getState();
  const out: Record<string, unknown> = {};
  for (const device of space.devices) {
    if (device.kind !== "light") continue;
    const st = states[device.id] as LightState;
    out[device.id] = {
      on: st.on,
      level: Math.round(st.level * 10) / 10,
      cct: Math.round(st.cct),
      hue: Math.round(st.hue),
      sat: Math.round(st.sat),
    };
  }

  // The two curtain tracks, as the plates shader wants them: 0 drawn back,
  // 1 drawn across, sheer first.
  const shadeId = space.plates?.curtain?.deviceId;
  const shade = shadeId ? (states[shadeId] as ShadeState | undefined) : undefined;
  const track = (v: number) => Math.round(Math.min(Math.max(v, 0), 100)) / 100;

  return {
    space: spaceId,
    scene: sceneId,
    clockMin: Math.round(clockMin),
    daylightMix: daylightMix ?? null,
    daylightTint: daylightTint ?? null,
    curtain: shade ? [track(shade.sheer), track(shade.blackout)] : [0, 0],
    /**
     * How far the overlay set is showing: a screen's drop, or a fan's
     * blur. Zero for a space with no overlay.
     */
    overlay: (() => {
      const id = space.plates?.overlay?.deviceId;
      if (!id) return 0;
      const st = states[id] as AvState | undefined;
      return st?.screen === undefined ? 0 : track(st.screen);
    })(),
    states: out,
  };
}

const [spaceId, sceneArg] = process.argv.slice(2);
if (!spaceId) throw new Error("usage: dump-state.mts <spaceId> <sceneId|--all>");

if (sceneArg === "--all") {
  const space = getSpace(spaceId);
  if (!space) throw new Error(`no space "${spaceId}"`);
  console.log(JSON.stringify(space.scenes.map((sc) => dump(spaceId, sc.id)), null, 1));
} else {
  console.log(JSON.stringify(dump(spaceId, sceneArg), null, 1));
}
