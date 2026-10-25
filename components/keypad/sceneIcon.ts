/**
 * Which of the eighteen drawings a scene wears on the pad.
 *
 * Pure, and in its own module rather than beside the SVGs, so that
 * `scripts/verify-sim.mts` can import it. The verifier runs under tsx with
 * no JSX runtime, and pulling in `icons.tsx` to reach one lookup table
 * meant pulling in every icon component with it.
 */

import type { IconName } from "./icons";

/**
 * Map a scene to an icon.
 *
 * Keyed off the scene's own `icon` character first, so a space can pick an icon
 * without knowing this file exists, and off the id as a fallback for scenes
 * named the same way across rooms.
 */
export function sceneIcon(scene: { id: string; icon: string }): IconName {
  const byChar: Record<string, IconName> = {
    "☀": "sun",
    "☼": "sunrise",
    "◐": "dim",
    "◑": "dusk",
    "❑": "book",
    "☾": "moon",
    "⏻": "power",
    "▶": "dusk",
    // Glyphs the hospitality and commercial rooms use. Without these they
    // all fell through to the default and four scenes in a row showed the
    // same half-moon, which makes a scene pad that cannot be read at a
    // glance — the one thing a scene pad is for.
    "◈": "bulb",
    "✦": "sparkle",
    "✸": "glass",
    "✚": "broom",
    "◎": "dim",
    // The guest room's eight. `verify-sim.mts` §13 now fails the build if
    // any space's scenes collide here or fall through to the default, which
    // is how two of these got missed the first time.
    "✧": "key",
    "☽": "moon",
    "🔑": "key",
    "☕": "book",
    "🍴": "book",
    // The living room needs one glyph the other rooms never used. "▣" is
    // the screen going on, which in this room is the drapes drawing
    // across first — so it wears the curtain.
    "▣": "curtain",
  };
  if (byChar[scene.icon]) return byChar[scene.icon];

  const byId: Record<string, IconName> = {
    morning: "sun",
    bright: "sun",
    relax: "dim",
    reading: "book",
    evening: "dusk",
    night: "moon",
    goodnight: "power",
    off: "power",
  };
  return byId[scene.id] ?? "dim";
}
