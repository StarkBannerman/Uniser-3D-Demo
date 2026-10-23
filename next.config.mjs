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
   * into `public/`, not build output — so the long cache is a promise that a
   * re-render will land under a new path or a cache purge. If that becomes
   * awkward, hashing the filenames and listing them in the manifest is the
   * better answer than shortening this.
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
