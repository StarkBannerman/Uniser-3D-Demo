/**
 * The space library.
 *
 * The master bedroom is the reference space and uses the 3D renderer; the living
 * room predates it and still uses the illustrated one. Both drive the identical
 * engine — which is the point of keeping the renderer a per-space choice.
 */

import type { Segment, Space } from "@/lib/sim/types";
import { masterBedroom } from "./residential/master-bedroom";
import { livingRoom } from "./residential/living-room";

export const spaces: Space[] = [masterBedroom, livingRoom];

export function getSpace(id: string): Space | undefined {
  return spaces.find((s) => s.id === id);
}

export function spacesBySegment(segment: Segment): Space[] {
  return spaces.filter((s) => s.segment === segment);
}

/** Space ids that exist, for `generateStaticParams`. */
export function spaceIds(): string[] {
  return spaces.map((s) => s.id);
}
