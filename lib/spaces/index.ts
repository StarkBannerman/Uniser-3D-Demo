/**
 * The space library.
 *
 * Every space drives the identical engine; only the renderer differs, which is
 * why `renderer` is a per-space choice rather than an app-wide one.
 */

import type { Segment, Space } from "@/lib/sim/types";
import { masterBedroom } from "./residential/master-bedroom";
import { livingRoom } from "./residential/living-room";
import { livingRoomIllustrated } from "./residential/living-room-illustrated";

export const spaces: Space[] = [masterBedroom, livingRoom, livingRoomIllustrated];

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
