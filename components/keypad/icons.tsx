/**
 * Engraved keypad icons.
 *
 * Drawn as SVG strokes rather than set as unicode characters, for two reasons.
 * A real keypad's icons are laser-etched into the plate and lit from behind, so
 * they are one consistent weight — mixing ☀ and ⏻ from whatever font the browser
 * picks looks like a web page, not a product. And `currentColor` lets the whole
 * icon take the button's illuminated state without a second set of assets.
 */

import type { ReactNode } from "react";

export type IconName =
  | "sun"
  | "dim"
  | "book"
  | "dusk"
  | "moon"
  | "power"
  | "bulb"
  | "curtain"
  | "snow"
  | "fan"
  | "up"
  | "down";

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const PATHS: Record<IconName, ReactNode> = {
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  dim: (
    <>
      <circle cx="12" cy="12" r="6" />
      <path d="M12 6a6 6 0 0 0 0 12z" fill="currentColor" stroke="none" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z" />
    </>
  ),
  dusk: (
    <>
      <path d="M2 18h20" />
      <path d="M7 18a5 5 0 0 1 10 0" />
      <path d="M12 4v3M5.2 7.2l1.6 1.6M18.8 7.2l-1.6 1.6" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  power: (
    <>
      <path d="M12 3v9" />
      <path d="M6.3 7A8 8 0 1 0 17.7 7" />
    </>
  ),
  bulb: (
    <>
      <path d="M9.5 18h5M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2h5c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />
    </>
  ),
  curtain: (
    <>
      <path d="M3 4h18" />
      <path d="M6 4v16c2.5-1 3.5-4 3.5-8S8.5 5 6 4z" />
      <path d="M18 4v16c-2.5-1-3.5-4-3.5-8S15.5 5 18 4z" />
    </>
  ),
  snow: (
    <>
      <path d="M12 2v20M3.5 7l17 10M20.5 7l-17 10" />
      <path d="M12 6l-2-2M12 6l2-2M12 18l-2 2M12 18l2 2" />
    </>
  ),
  fan: (
    <>
      <circle cx="12" cy="12" r="1.8" />
      <path d="M12 10.2c0-3 .8-5.2 3-5.2s2.6 3.4.6 4.6" />
      <path d="M13.6 13a5.6 5.6 0 0 1 4.6-2.4c2 0 2.7 2.6.8 3.7" />
      <path d="M10.7 13.3c-1.7 2.4-3.6 3.7-5.3 2.5s0-4 2.2-4" />
    </>
  ),
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
};

export function Icon({ name }: { name: IconName }) {
  return <Svg>{PATHS[name]}</Svg>;
}

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
    "◐": "dim",
    "◑": "dusk",
    "❑": "book",
    "☾": "moon",
    "⏻": "power",
    "▶": "dusk",
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
