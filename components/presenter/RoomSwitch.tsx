"use client";

/**
 * Room switcher.
 *
 * Only rendered when there is more than one room to switch to, so a single-room
 * build shows nothing rather than a control with one option in it. The list
 * comes from `spacesBySegment`, which already hides anything marked `unlisted` —
 * so a room is added to this by being finished, not by being wired in here.
 */

import Link from "next/link";
import { spacesBySegment } from "@/lib/spaces";

export function RoomSwitch({ currentId }: { currentId: string }) {
  const rooms = [
    ...spacesBySegment("residential"),
    ...spacesBySegment("commercial"),
  ];
  if (rooms.length < 2) return null;

  return (
    <div className="flex shrink-0 items-center gap-1 rounded-lg bg-shell-850 p-1">
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
  );
}
