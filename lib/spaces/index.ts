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
import { hotelLobby } from "./hospitality/hotel-lobby";
import { lobby } from "./hospitality/lobby";

/**
 * The rooms the demo offers, which is not every room in this repository.
 *
 * Three, all commercial, all on the plates renderer. The residential and
 * office rooms and the live 3D lobby are still here and still build — they
 * are imported below so a typo in one is still a compile error — but they
 * are off the list, which is the only thing that gives a space a route and
 * a door on the home page. Putting one back is one line.
 *
 * `/bake` reaches the 3D lobby through its own import rather than through
 * this list, so the path-tracing harness is unaffected.
 */
export const spaces: Space[] = [restaurant, showroom, lobby];

/** Registered but not offered. Kept so they keep compiling. */
export const retired: Space[] = [
  masterBedroom,
  livingRoom,
  den,
  workspace,
  boardroom,
  cxoCabin,
  hotelLobby,
  kitchen,
  livingRoomIllustrated,
];

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
