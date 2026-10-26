import Link from "next/link";
import { CREDITS, type Credit } from "@/lib/credits";

/**
 * Who made the things in the rooms.
 *
 * Twenty-seven of the assets the rooms are path-traced from are licensed
 * CC-BY, which requires the author to be credited wherever the work is
 * shared. This demo shares them — it is deployed publicly and shown to
 * clients — so the page is an obligation rather than a nicety, and it was
 * missing until now.
 *
 * The list is generated from the `license.txt` that ships beside each
 * asset, by `scripts/build-credits.mts`, so it cannot drift from the
 * record. Nothing here is typed by hand.
 */
export const metadata = {
  title: "Credits — Uniser SmartSpaces",
  description: "Model, HDRI and photography credits for the rooms in this demo.",
};

function Row({ credit }: { credit: Credit }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-shell-800/60 py-2 last:border-b-0">
      <a
        href={credit.source}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[13px] text-shell-200 underline decoration-shell-700 underline-offset-2 transition-colors hover:text-shell-100 hover:decoration-brass-500"
      >
        {credit.title}
      </a>
      <span className="text-[12px] text-shell-500">by</span>
      {credit.authorUrl ? (
        <a
          href={credit.authorUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] text-shell-300 transition-colors hover:text-brass-300"
        >
          {credit.author}
        </a>
      ) : (
        <span className="text-[13px] text-shell-300">{credit.author}</span>
      )}
      <a
        href={credit.licenceUrl || undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-wider text-shell-500 transition-colors hover:text-shell-300"
      >
        {credit.licence}
      </a>
    </li>
  );
}

function Section({
  title,
  lead,
  rows,
}: {
  title: string;
  lead: string;
  rows: Credit[];
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brass-500">
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-shell-400">
        {lead}
      </p>
      <ul className="mt-3">
        {rows.map((c) => (
          <Row key={c.path} credit={c} />
        ))}
      </ul>
    </section>
  );
}

export default function Credits() {
  const required = CREDITS.filter((c) => c.required);
  const courtesy = CREDITS.filter((c) => !c.required);

  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-12">
      <div className="w-full max-w-3xl">
        <Link
          href="/"
          className="text-[12px] text-shell-500 transition-colors hover:text-shell-300"
        >
          ← Back
        </Link>

        <h1 className="mt-6 text-2xl font-medium text-shell-100 sm:text-3xl">
          Credits
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-shell-400">
          Each room in this demo was path-traced offline in Blender from a
          scene built in Python. The architecture, the lighting and the
          circuit design are ours; the furniture, the skies and the artwork
          on the walls are other people&rsquo;s work, used under the licences
          below.
        </p>

        <Section
          title="Required attribution"
          lead="Licensed CC-BY, which asks that the author be credited wherever the work is shared."
          rows={required}
        />

        <Section
          title="With thanks"
          lead="Public-domain and permissively licensed work that asks for no credit. Listed anyway."
          rows={courtesy}
        />

        <p className="mt-10 max-w-2xl text-[12px] leading-relaxed text-shell-500">
          Generated from the licence file that ships beside each asset, so
          this list cannot drift from the record. Found something credited
          wrongly, or your work here without a licence you recognise? Tell us
          and we will fix it or take it out.
        </p>
      </div>
    </main>
  );
}
