"use client";

/**
 * Room switcher, scoped to the segment you came in through.
 *
 * It used to list every finished room in one row. That reads as complete and
 * behaves badly: a residential visit had the boardroom and the CXO cabin
 * sitting in the header all afternoon, an office visit had the bedroom, and in
 * both cases the salesperson was scanning six names in front of the client to
 * find the one room they came to show.
 *
 * So the row carries the current segment's rooms, and the segment itself is a
 * separate, smaller control beside it. Switching segment lands on that
 * segment's first room rather than on a list, because the one thing nobody
 * wants mid-pitch is another page between them and a room.
 *
 * `spacesBySegment` already hides anything `unlisted`, so a room joins this by
 * being finished rather than by being wired in here.
 */

import Link from "next/link";
import { spacesBySegment } from "@/lib/spaces";
import type { Segment } from "@/lib/sim/types";

const SEGMENTS: { id: Segment; label: string }[] = [
  { id: "residential", label: "Residential" },
  { id: "commercial", label: "Office" },
];

export function RoomSwitch({
  currentId,
  segment,
}: {
  currentId: string;
  segment: Segment;
}) {
  const rooms = spacesBySegment(segment);
  const others = SEGMENTS.filter((s) => s.id !== segment).filter(
    (s) => spacesBySegment(s.id).length > 0,
  );

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      {others.map((other) => {
        const first = spacesBySegment(other.id)[0];
        return (
          <Link
            key={other.id}
            href={`/demo/${first.id}`}
            title={`Switch to ${other.label}`}
            className="rounded-md border border-shell-800 bg-shell-900 px-2.5 py-1.5 text-[11px] font-medium text-shell-400 transition-colors hover:border-brass-700 hover:text-shell-200"
          >
            {other.label}
            <span aria-hidden className="ml-1 text-shell-600">
              ↗
            </span>
          </Link>
        );
      })}

      {rooms.length > 1 && (
        <div className="flex items-center gap-1 rounded-lg bg-shell-850 p-1">
          {rooms.map((room) => {
            const active = room.id === currentId;
            return (
              <Link
                key={room.id}
                href={`/demo/${room.id}`}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                  active
                    ? "bg-shell-700 text-shell-100"
                    : "text-shell-400 hover:text-shell-200"
                }`}
              >
                {room.name}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
