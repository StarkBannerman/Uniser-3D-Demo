import type { PlateProfile } from "../profile";
import { NEUTRAL_PROFILE } from "../profile";
import { LOBBY_PROFILE } from "./lobby";
import { RESTAURANT_PROFILE } from "./restaurant";
import { SHOWROOM_PROFILE } from "./showroom";

/**
 * Calibrations by name, as `Space.plates.profile` refers to them.
 *
 * Keyed by a name rather than by the plate directory so that two spaces can
 * share one render, and so a missing entry is a loud lookup failure rather
 * than a room that quietly composites at gain 1.
 */
const PROFILES: Record<string, PlateProfile> = {
  lobby: LOBBY_PROFILE,
  restaurant: RESTAURANT_PROFILE,
  showroom: SHOWROOM_PROFILE,
};

export function profileFor(name: string | undefined): PlateProfile {
  if (!name) return NEUTRAL_PROFILE;
  const found = PROFILES[name];
  if (!found) {
    console.warn(`plates: no profile named "${name}" — compositing uncalibrated`);
    return NEUTRAL_PROFILE;
  }
  return found;
}
