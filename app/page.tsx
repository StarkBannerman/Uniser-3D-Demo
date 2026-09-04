import Link from "next/link";
import type { Segment } from "@/lib/sim/types";
import { spacesBySegment } from "@/lib/spaces";

/**
 * Spaces still to be built, shown as disabled cards rather than hidden.
 *
 * A salesperson opening this needs to know what the tool does and does not
 * cover yet, and a client seeing the roadmap reads breadth rather than a gap.
 * Hospitality and retail lead the commercial list because Uniser already has
 * capability decks for both.
 */
const ROADMAP: { segment: Segment; name: string; note: string }[] = [
  { segment: "commercial", name: "Hotel Lobby & Guest Room", note: "Welcome, DND, housekeeping" },
  { segment: "commercial", name: "Retail Floor", note: "Accent and merchandise CCT" },
  { segment: "commercial", name: "Open-Plan Office Floor", note: "Zoned floor plan, occupancy, daylight harvesting" },
  { segment: "commercial", name: "Board Room", note: "Presentation, video call, brainstorm" },
  { segment: "commercial", name: "Restaurant", note: "Day-to-night dining ambiance" },
  { segment: "commercial", name: "Building Façade", note: "Uniser 360, LiteJewel" },
  { segment: "residential", name: "Master Bedroom", note: "Circadian wake, goodnight" },
  { segment: "residential", name: "Home Theatre", note: "Full cinema scene set" },
  { segment: "residential", name: "Villa Exterior", note: "Landscape and façade" },
];

function SegmentColumn({
  segment,
  title,
  blurb,
}: {
  segment: Segment;
  title: string;
  blurb: string;
}) {
  const ready = spacesBySegment(segment);
  const upcoming = ROADMAP.filter((r) => r.segment === segment);

  return (
    <section className="flex-1">
      <h2 className="text-lg font-semibold text-shell-100">{title}</h2>
      <p className="mt-1 text-[13px] leading-snug text-shell-400">{blurb}</p>

      <div className="mt-4 space-y-2">
        {ready.map((space) => (
          <Link
            key={space.id}
            href={`/demo/${space.id}`}
            className="group block rounded-xl border border-shell-700 bg-shell-900 p-4 transition-colors hover:border-brass-600 hover:bg-shell-850"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-base font-medium text-shell-100">
                {space.name}
              </span>
              <span className="shrink-0 text-[11px] text-brass-500 opacity-0 transition-opacity group-hover:opacity-100">
                Open →
              </span>
            </div>
            <p className="mt-1.5 text-[12px] leading-snug text-shell-400">
              {space.blurb}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1">
              {space.scenes.slice(0, 5).map((scene) => (
                <span
                  key={scene.id}
                  className="rounded bg-shell-800 px-1.5 py-0.5 text-[10px] text-shell-400"
                >
                  {scene.name}
                </span>
              ))}
            </div>
          </Link>
        ))}

        {upcoming.map((item) => (
          <div
            key={item.name}
            className="rounded-xl border border-dashed border-shell-800 p-3.5 opacity-70"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] text-shell-400">{item.name}</span>
              <span className="shrink-0 rounded border border-shell-700 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-shell-500">
                Not built
              </span>
            </div>
            <p className="mt-1 text-[11px] text-shell-600">{item.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <header className="border-b border-shell-800 pb-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brass-500">
          Uniser SmartSpaces
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-shell-100">
          Sales Demonstration
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-shell-400">
          A simulated Uniser installation you can run in front of a client
          anywhere, with or without internet. Pick a space, run a scene, and the
          room responds — while the panel names the products doing the work.
        </p>
      </header>

      <div className="mt-8 flex flex-col gap-10 lg:flex-row lg:gap-8">
        <SegmentColumn
          segment="residential"
          title="Residential"
          blurb="For the private-client conversation — ambiance, convenience and the signature products a generic installer cannot supply."
        />
        <SegmentColumn
          segment="commercial"
          title="Commercial"
          blurb="For the facilities and design conversation — zoning, occupancy, daylight harvesting and a payback period."
        />
      </div>

      <footer className="mt-12 border-t border-shell-800 pt-4 text-[11px] leading-snug text-shell-600">
        Product specifications in this build are placeholder figures pending
        Uniser datasheets, and are badged as unverified throughout. Correct them
        in{" "}
        <code className="rounded bg-shell-900 px-1 py-0.5 font-mono text-shell-500">
          lib/catalog/products.ts
        </code>{" "}
        before showing this to a client.
      </footer>
    </div>
  );
}
