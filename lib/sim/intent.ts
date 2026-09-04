/**
 * What a state patch is asking a fixture to hold.
 *
 * Lives in its own module because both the rule engine and the store need the
 * identical answer, and a rule engine that imports the store would be circular.
 */

import type { Device, DeviceState, LightState, StatePatch } from "./types";

/**
 * The dim level a patch commands, or undefined if the patch says nothing about
 * brightness.
 *
 * A fixture being switched off commands *zero*, not "no opinion". Treating it
 * as no opinion leaves the old ceiling standing, and daylight harvesting then
 * quietly brings a fixture the occupancy rule just shut down back on.
 */
export function commandedLevelFor(
  device: Device,
  current: DeviceState,
  patch: StatePatch,
): number | undefined {
  if (device.kind !== "light") return undefined;
  if (!("level" in patch) && !("on" in patch)) return undefined;

  const light = current as LightState;
  const on = "on" in patch ? Boolean(patch.on) : light.on;
  const level = "level" in patch ? Number(patch.level) : light.level;
  return on ? level : 0;
}
