import Link from "next/link";
import { SEGMENT_TITLE, spacesBySegment } from "@/lib/spaces";
import type { Segment, Space } from "@/lib/sim/types";

/**
 * The front door: pick a world, then pick a room in it.
 *
 * This used to redirect straight to the bedroom, which was right while the
 * bedroom was the only finished room — a picker with one card on it is a click
 * between the client and the demo. There are several now across segments that
 * get sold to different people in different meetings, and a flat row of tabs
 * made the salesperson scan a list in front of the client to find the one they
 * came to show.
 *
 * Doors instead. A hospitality visit never needs the executive cabin in the
 * frame and an office visit never needs the restaurant, so the segment is
 * chosen once at the start and the room switcher inside stays scoped to it.
 *
 * `spacesBySegment` already hides anything `unlisted`, so a room appears here
 * by being finished rather than by being wired in.
 */

/**
 * The doors, and the segment ids behind them are not the titles.
 *
 * The titles come from `SEGMENT_TITLE`, which the in-demo switcher reads
 * too — the ids and the names are crossed, and a second copy of that
 * mapping is how the cabin ended up reachable from here and nowhere else.
 *
 * `soon` is rooms that are specified and not yet built. They are shown
 * rather than hidden because the question a client asks in the first
 * minute is what else there is, and a door with one room behind it answers
 * that badly.
 */
const DOORS: {
  segment: Segment;
  lead: string;
  blurb: string;
  soon?: string[];
}[] = [
  {
    segment: "hospitality",
    lead: "Hospitality, retail and public spaces",
    blurb:
      "A hotel restaurant, a hotel lobby, a guest room and a luxury car showroom — the rooms a business is judged on in the first ten seconds, with the lighting layers that do the judging on separate circuits.",
  },
  {
    segment: "commercial",
    lead: "Workplace and executive spaces",
    blurb:
      "The rooms a company works in and is seen working in. An executive cabin lit like hospitality rather than like an office, with the workspace and the boardroom alongside it.",
  },
  {
    segment: "residential",
    lead: "Homes and private residences",
    blurb:
      "The rooms people live in rather than work in, where the argument is not running cost but whether one press does what a person would expect it to — the bedroom putting itself to bed, the living room becoming a cinema, and the den that already is one.",
  },
];

/** A room's holding image, which is the first frame its stage will show. */
function thumb(space: Space): string | null {
  return space.plates ? `${space.plates.dir}/still_sd.jpg` : null;
}

function RoomCard({ space }: { space: Space }) {
  const image = thumb(space);
  return (
    <Link
      href={`/demo/${space.id}`}
      className="group flex items-center gap-3 overflow-hidden rounded-lg border border-shell-800 bg-shell-850 pr-3.5 transition-colors hover:border-brass-700 hover:bg-shell-800"
    >
      {image ? (
        <img
          src={image}
          alt=""
          aria-hidden
          loading="lazy"
          width={80}
          height={45}
          className="h-[45px] w-20 shrink-0 object-cover opacity-80 transition-opacity group-hover:opacity-100"
        />
      ) : (
        <span className="h-[45px] w-20 shrink-0 bg-shell-800" />
      )}
      <span className="flex-1 text-[13px] font-medium text-shell-200 group-hover:text-shell-100">
        {space.name}
      </span>
      <span
        aria-hidden
        className="text-shell-600 transition-colors group-hover:text-brass-500"
      >
        →
      </span>
    </Link>
  );
}

function SoonCard({ name }: { name: string }) {
  return (
    <div
      aria-disabled
      className="flex items-center gap-3 overflow-hidden rounded-lg border border-dashed border-shell-800 pr-3.5 opacity-55"
    >
      <span className="h-[45px] w-20 shrink-0 bg-shell-850" />
      <span className="flex-1 text-[13px] font-medium text-shell-400">{name}</span>
      <span className="text-[10px] uppercase tracking-wider text-shell-600">
        Coming soon
      </span>
    </div>
  );
}

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-6xl">
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

        {/**
          * One column per door, all three on one row.
          *
          * Two columns was right while there were two doors; with three
          * it dropped Residential onto a second row on its own, which
          * reads as an afterthought rather than as the third of three.
          * Two columns is kept at tablet width, where three would make
          * the blurbs two words wide.
          */}
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DOORS.map((door) => {
            const rooms = spacesBySegment(door.segment);
            if (rooms.length === 0 && !door.soon?.length) return null;
            return (
              <section
                key={door.segment}
                className="flex flex-col rounded-2xl border border-shell-800 bg-shell-900/70 p-5"
              >
                <div className="text-[10px] uppercase tracking-[0.2em] text-shell-500">
                  {door.lead}
                </div>
                <h2 className="mt-1.5 text-lg font-medium text-shell-100">
                  {SEGMENT_TITLE[door.segment]}
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-shell-400">
                  {door.blurb}
                </p>

                <div className="mt-5 flex flex-col gap-1.5">
                  {rooms.map((room) => (
                    <RoomCard key={room.id} space={room} />
                  ))}
                  {door.soon?.map((name) => <SoonCard key={name} name={name} />)}
                </div>
              </section>
            );
          })}
        </div>

        {/**
          * The only thing in the footer, and it is there because it has to
          * be.
          *
          * Twenty-seven of the assets the rooms are path-traced from are
          * CC-BY, which asks for the author to be credited wherever the
          * work is shared. A deployed demo shown to clients is sharing it.
          */}
        <footer className="mt-10 flex justify-center border-t border-shell-800 pt-5">
          <Link
            href="/credits"
            className="text-[11px] text-shell-500 transition-colors hover:text-shell-300"
          >
            Credits
          </Link>
        </footer>
      </div>
    </main>
  );
}
