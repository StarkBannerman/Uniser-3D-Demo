/**
 * The space library.
 *
 * Every space drives the identical engine; only the renderer differs, which is
 * why `renderer` is a per-space choice rather than an app-wide one.
 */

import type { Segment, Space } from "@/lib/sim/types";
import { masterBedroom } from "./residential/master-bedroom";
import { livingRoom } from "./residential/living-room";
import { kitchen } from "./residential/kitchen";
import { den } from "./residential/den";
import { livingRoomIllustrated } from "./residential/living-room-illustrated";
import { boardroom } from "./commercial/boardroom";
import { cxoCabin } from "./commercial/cxo-cabin";
import { workspace } from "./commercial/workspace";
import { restaurant } from "./commercial/restaurant";
import { showroom } from "./commercial/showroom";
import { cabin } from "./commercial/cabin";
import { office } from "./commercial/office";
import { hotelLobby } from "./hospitality/hotel-lobby";
import { lobby } from "./hospitality/lobby";
import { room } from "./hospitality/room";

export const spaces: Space[] = [restaurant, showroom, lobby, room, cabin, office];

/**
 * Registered but not offered.
 *
 * The live 3D hotel lobby, retired when the plates lobby replaced it, and
 * the residential rooms. Kept rather than deleted: `/bake` still
 * path-traces the 3D lobby, and an import is what keeps all of them
 * compiling, so a change to the engine still has to satisfy them.
 */
export const retired: Space[] = [
  hotelLobby,
  masterBedroom,
  livingRoom,
  den,
  kitchen,
  livingRoomIllustrated,
  workspace,
  boardroom,
  cxoCabin,
];

/**
 * What each segment is called in front of a client.
 *
 * The ids and the titles are crossed and have been since before the plates
 * work: `hospitality` is the door a client sees as "Commercial" — the rooms
 * a business is judged on by the people who walk into them — and
 * `commercial` is the Office door. Renaming the segments would touch every
 * space file, so the mapping lives here, once, and both the front door and
 * the in-demo switcher read it. They disagreed for exactly as long as there
 * were two of them: the switcher knew about one door, so the cabin could be
 * reached from the home page and never left.
 */
export const SEGMENT_TITLE: Record<Segment, string> = {
  hospitality: "Commercial",
  commercial: "Office",
  residential: "Residential",
};

export function getSpace(id: string): Space | undefined {
  return spaces.find((s) => s.id === id);
}

/**
 * Spaces to offer in the picker — `unlisted` ones are excluded.
 *
 * `getSpace` and `spaceIds` deliberately do not filter, so an unlisted space
 * still routes and still builds.
 */
export function spacesBySegment(segment: Segment): Space[] {
  return spaces.filter((s) => s.segment === segment && !s.unlisted);
}

/** Space ids that exist, for `generateStaticParams`. */
export function spaceIds(): string[] {
  return spaces.map((s) => s.id);
}
