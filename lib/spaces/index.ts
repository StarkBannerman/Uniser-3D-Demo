/**
 * The space library.
 *
 * Every space drives the identical engine; only the renderer differs, which is
 * why `renderer` is a per-space choice rather than an app-wide one.
 */

import type { Segment, Space } from "@/lib/sim/types";
import { boardroom } from "./commercial/boardroom";
import { restaurant } from "./commercial/restaurant";
import { showroom } from "./commercial/showroom";
import { cabin } from "./commercial/cabin";
import { office } from "./commercial/office";

import { bedroom } from "./residential/bedroom";
import { living } from "./residential/living";
import { den } from "./residential/den";
import { lobby } from "./hospitality/lobby";
import { room } from "./hospitality/room";

export const spaces: Space[] = [
  restaurant,
  showroom,
  lobby,
  room,
  cabin,
  office,
  boardroom,
  bedroom,
  living,
  den,
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
