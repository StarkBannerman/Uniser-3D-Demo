import type { PlateProfile } from "../profile";
import { NEUTRAL_PROFILE } from "../profile";
import { CABIN_PROFILE } from "./cabin";
import { BOARDROOM_PROFILE } from "./boardroom";
import { LOBBY_PROFILE } from "./lobby";
import { OFFICE_PROFILE } from "./office";
import { RESTAURANT_PROFILE } from "./restaurant";
import { ROOM_PROFILE } from "./room";
import { SHOWROOM_PROFILE } from "./showroom";

/**
 * Calibrations by name, as `Space.plates.profile` refers to them.
 *
 * Keyed by a name rather than by the plate directory so that two spaces can
 * share one render, and so a missing entry is a loud lookup failure rather
 * than a room that quietly composites at gain 1.
 */
const PROFILES: Record<string, PlateProfile> = {
  cabin: CABIN_PROFILE,
  boardroom: BOARDROOM_PROFILE,
  lobby: LOBBY_PROFILE,
  office: OFFICE_PROFILE,
  restaurant: RESTAURANT_PROFILE,
  room: ROOM_PROFILE,
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
