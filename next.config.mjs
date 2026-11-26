/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * Caching for the plate sets.
   *
   * A plate is a large, immutable image that changes only when the room is
   * re-rendered, and the whole point of the plates path is that the second
   * visit costs nothing. The manifest is the opposite: it is small, it names
   * the layers and carries their scales, and a stale one quietly mis-exposes
   * the room rather than failing, so it gets a short life and has to be
   * revalidated.
   *
   * The plates are not content-hashed — they are authored assets dropped
   * into `public/`, not build output — so the long cache used to be a
   * promise that a re-render would land under a new path or a cache purge.
   * That promise was broken by every re-render we have done. `immutable`
   * means a browser will not revalidate, will not send `If-None-Match` and
   * will not ask again for a year, so anyone who had opened the demo kept
   * the old room; and because each deployment gets a fresh hostname and a
   * cache is keyed by hostname, the preview link always looked right while
   * the real domain stayed stale.
   *
   * It is kept now rather than shortened, because shortening it would not
   * have helped: entries already in people's browsers are not revalidated
   * whatever this says, so only a change of URL reaches them.
   * `scripts/stamp-plates.mts` hashes each set's bytes into its
   * `manifest.json`, and `plateUrl`/`stillUrl` hang that on the query
   * string — a re-rendered set becomes a new URL and is fetched once, an
   * untouched one keeps this cache and costs nothing. The manifest below is
   * the pointer, which is why it is the file that must stay fresh.
   */
  async headers() {
    return [
      {
        source: "/plates/:space/:tier(hd|sd)/:file*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/plates/:space/:file(still_hd.jpg|still_sd.jpg)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/plates/:space/:file(manifest.json|hotspots.json)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=60, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
