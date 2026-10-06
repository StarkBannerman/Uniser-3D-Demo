import Link from "next/link";
import { spacesBySegment } from "@/lib/spaces";
import type { Segment } from "@/lib/sim/types";

/**
 * The front door: pick a world, then pick a room in it.
 *
 * This used to redirect straight to the bedroom, which was right while the
 * bedroom was the only finished room — a picker with one card on it is a click
 * between the client and the demo. There are six now across two segments that
 * get sold to different people in different meetings, and a flat row of six
 * tabs made the salesperson scan a list in front of the client to find the one
 * they came to show.
 *
 * Two doors instead. A residential visit never needs the boardroom in the
 * frame, and an office visit never needs the bedroom, so the segment is chosen
 * once at the start and the room switcher inside stays scoped to it.
 *
 * `spacesBySegment` already hides anything `unlisted`, so a room appears here
 * by being finished rather than by being wired in.
 */

const DOORS: { segment: Segment; title: string; lead: string; blurb: string }[] = [
  {
    segment: "residential",
    title: "Residential",
    lead: "Homes and apartments",
    blurb:
      "Scenes a family actually presses — waking, watching, winding down — with curtains, climate and media on the same button as the light.",
  },
  {
    segment: "commercial",
    title: "Office",
    lead: "Workplaces",
    blurb:
      "Zoned floors, meeting spaces and executive rooms, with occupancy, daylight response and the tunable white a working day is specified to.",
  },
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-4xl">
        <div className="mb-10 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-brass-500">
            SmartSpaces
          </div>
          <h1 className="mt-3 text-2xl font-medium text-shell-100 sm:text-3xl">
            Choose an environment
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-shell-400">
            Every space below runs the same simulation — lighting, shading,
            climate and AV as one state, in real time.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {DOORS.map((door) => {
            const rooms = spacesBySegment(door.segment);
            if (rooms.length === 0) return null;
            return (
              <section
                key={door.segment}
                className="flex flex-col rounded-2xl border border-shell-800 bg-shell-900/70 p-5"
              >
                <div className="text-[10px] uppercase tracking-[0.2em] text-shell-500">
                  {door.lead}
                </div>
                <h2 className="mt-1.5 text-lg font-medium text-shell-100">
                  {door.title}
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-shell-400">
                  {door.blurb}
                </p>

                <div className="mt-5 flex flex-col gap-1.5">
                  {rooms.map((room) => (
                    <Link
                      key={room.id}
                      href={`/demo/${room.id}`}
                      className="group flex items-center justify-between rounded-lg border border-shell-800 bg-shell-850 px-3.5 py-2.5 transition-colors hover:border-brass-700 hover:bg-shell-800"
                    >
                      <span className="text-[13px] font-medium text-shell-200 group-hover:text-shell-100">
                        {room.name}
                      </span>
                      <span
                        aria-hidden
                        className="text-shell-600 transition-colors group-hover:text-brass-500"
                      >
                        →
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
