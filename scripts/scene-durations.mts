/**
 * Dev report: how long every scene takes, and how much of that is physics.
 *
 * A fade is a choice. A curtain closing is not — `travelMs` is how long that
 * motor actually takes, and no amount of tuning makes a scene that closes a
 * blind finish before the blind has finished moving.
 */
import { spaces } from "@/lib/spaces";
import { paceFade, paceHold } from "@/lib/sim/pace";

type Step = { holdMs?: number; targets: Record<string, Record<string, unknown>> };

const travelFloor = (
  space: (typeof spaces)[number],
  targets: Record<string, Record<string, unknown>>,
): number => {
  let floor = 0;
  for (const [id, patch] of Object.entries(targets)) {
    const device = space.devices.find((d) => d.id === id);
    if (!device) continue;
    if (device.kind === "shade") {
      const t = (device as unknown as { travelMs: number }).travelMs;
      const moved = ["sheer", "blackout"].some((p) => typeof patch[p] === "number");
      if (moved) floor = Math.max(floor, t);
    }
    if (device.kind === "av" && typeof patch.screen === "number") {
      floor = Math.max(floor, (device as unknown as { screenTravelMs?: number }).screenTravelMs ?? 6000);
    }
  }
  return floor;
};

const over: string[] = [];
for (const space of spaces) {
  console.log(`\n  ${space.name}`);
  for (const scene of space.scenes) {
    const base = paceFade(scene.fadeMs ?? 0);
    const steps = (scene as unknown as { steps?: Step[] }).steps ?? [];
    let total = base;
    let floor = travelFloor(space, scene.targets as Record<string, Record<string, unknown>>);
    let elapsed = base;
    for (const s of steps) {
      const fades = Object.values(s.targets).map((t) => paceFade(Number(t.fadeMs ?? 0)));
      const span = Math.max(paceHold(s.holdMs ?? 0), fades.length ? Math.max(...fades) : 0);
      const t = travelFloor(space, s.targets);
      if (t > 0) floor = Math.max(floor, elapsed + t);
      elapsed += span;
      total += span;
    }
    const tag = floor > 2000 ? `  [motor floor ${floor}ms]` : "";
    if (total > 2000) over.push(`${space.name} / ${scene.name}`);
    console.log(
      `    ${scene.name.padEnd(24)} total ${String(total).padStart(6)}ms  steps ${String(steps.length).padStart(2)}${tag}${total > 2000 ? "  OVER" : ""}`,
    );
  }
}
console.log(`\n  ${over.length} scenes over 2s\n`);
