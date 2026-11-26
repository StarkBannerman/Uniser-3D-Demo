/**
 * Give every plate set a revision, so a re-render lands on a new URL.
 *
 * The plates are served `public, max-age=31536000, immutable` — see
 * `next.config.mjs`, which is right to do it: a plate is a megabyte of image
 * that changes only when the room is re-rendered, and the whole point of the
 * plates path is that the second visit costs nothing.
 *
 * The trap is that `immutable` means exactly what it says. A browser that has
 * `/plates/showroom/hd/sr_zone_3.webp` in its cache will not revalidate it,
 * will not send an `If-None-Match`, and will not ask again for a year. Every
 * re-render so far has written new bytes to that same path, so anyone who had
 * opened the demo before kept the old room — and because deployment URLs get
 * a fresh hostname every time, and a cache is keyed by hostname, the preview
 * link always looked right while the real domain stayed stale. That is a
 * demo that is correct for first-time visitors and wrong for the client you
 * showed it to last month.
 *
 * Shortening the header does not fix it. The poisoned entries are already in
 * people's browsers and will not be revalidated whatever the server now says.
 * Only a change of URL reaches them, which is what this does: hash the bytes
 * of each set, write the hash into that set's `manifest.json` as `rev`, and
 * let `plateUrl`/`stillUrl` hang it on the query string. A set whose pixels
 * did not change keeps its rev and its year-long cache; a set that was
 * re-rendered gets a new one and is fetched exactly once more.
 *
 * `manifest.json` itself is already served `max-age=60, must-revalidate`, so
 * it is the one file guaranteed to be fresh — which is what makes it the
 * right place to keep the pointer.
 *
 *     tsx scripts/stamp-plates.mts            # stamp every set that changed
 *     tsx scripts/stamp-plates.mts --check    # fail if any set is out of date
 *
 * It runs on `prebuild`, so a deploy cannot ship an unstamped set. Commit the
 * manifests it touches: the rev moving in a diff is the record of which room
 * was re-rendered.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const PLATES = join(ROOT, "public/plates");

/** Files whose bytes the browser caches behind the immutable header. */
function cachedFiles(dir: string): string[] {
  const out: string[] = [];
  for (const tier of ["hd", "sd"]) {
    const d = join(dir, tier);
    let names: string[];
    try {
      names = readdirSync(d);
    } catch {
      continue;
    }
    for (const n of names.sort()) if (!n.startsWith(".")) out.push(join(d, n));
  }
  for (const n of ["still_hd.jpg", "still_sd.jpg"]) {
    const p = join(dir, n);
    try {
      statSync(p);
      out.push(p);
    } catch {
      /* a set may ship without stills */
    }
  }
  return out;
}

/**
 * One short hash over the set's cached bytes.
 *
 * Over the *contents*, not the mtimes: a fresh clone, a re-checkout and a
 * rebuild on CI all have different timestamps and identical pixels, and a rev
 * that moved for any of those would throw away a cache that was still good.
 * The path goes into the hash too, so adding a layer changes the rev even if
 * the new file happens to duplicate an existing one.
 */
function revOf(dir: string): string {
  const h = createHash("sha256");
  for (const f of cachedFiles(dir)) {
    h.update(relative(dir, f));
    h.update(readFileSync(f));
  }
  return h.digest("hex").slice(0, 12);
}

const check = process.argv.includes("--check");
const sets = readdirSync(PLATES)
  .filter((n) => !n.startsWith("."))
  .filter((n) => statSync(join(PLATES, n)).isDirectory())
  .sort();

let changed = 0;
let stale: string[] = [];

for (const name of sets) {
  const dir = join(PLATES, name);
  const manifestPath = join(dir, "manifest.json");
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    console.log(`  skip ${name} — no readable manifest.json`);
    continue;
  }
  const rev = revOf(dir);
  if (manifest.rev === rev) continue;
  if (check) {
    stale.push(`${name}: manifest says ${manifest.rev ?? "(none)"}, bytes say ${rev}`);
    continue;
  }
  // `rev` goes first so it is the line a diff shows, and the file keeps the
  // two-space shape the converter writes. Any existing `rev` is dropped on
  // the way through rather than left to shadow the new one.
  const { rev: _old, ...rest } = manifest;
  writeFileSync(manifestPath, JSON.stringify({ rev, ...rest }, null, 2));
  console.log(`  ${name.padEnd(18)} ${manifest.rev ?? "(none)"} -> ${rev}`);
  changed++;
}

if (check) {
  if (stale.length) {
    console.error("Plate sets are not stamped:\n  " + stale.join("\n  "));
    console.error("\nRun: npx tsx scripts/stamp-plates.mts");
    process.exit(1);
  }
  console.log(`All ${sets.length} plate sets are stamped.`);
} else {
  console.log(
    changed
      ? `Stamped ${changed} of ${sets.length} plate sets.`
      : `All ${sets.length} plate sets already current.`,
  );
}
