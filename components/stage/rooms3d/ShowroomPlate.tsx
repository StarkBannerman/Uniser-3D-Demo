"use client";

/**
 * The path-traced backplate for the car showroom, over the live room.
 *
 * Opt-in with `?plate=1`, so the two can be compared by reloading rather than
 * by remembering. Scoped to this room on purpose: it is a trial of whether a
 * baked plate reads better than the rasteriser, and until that is answered
 * nothing else should take a dependency on it.
 *
 * The plate changes with the scene, which is the whole point — a lighting
 * demo whose picture does not follow the buttons is a photograph. Two layers
 * cross-fade rather than one swapping its `src`, because swapping shows a
 * blank frame while the new file decodes, and the scene transitions this is
 * standing in for are the one thing the room is sold on.
 *
 * Nothing is composited on top yet. The blind, the fan and the screen would
 * need the depth map to sit correctly in the room, and the showroom has none
 * of the three — which is exactly why it was chosen to try this first.
 */

import { useEffect, useRef, useState } from "react";
import { useSim } from "@/lib/sim/store";

/** Scenes that have a baked plate. Anything else falls through to the live room. */
const PLATES = new Set([
  "showroom-open",
  "vehicle-presentation",
  "new-car-launch",
  "premium",
  "consultation",
  "delivery",
  "event",
  "closing",
]);

const srcFor = (id: string) => `/plates/car-showroom/${id}.jpg`;

export function ShowroomPlate() {
  const sceneId = useSim((s) => s.activeSceneId);
  const [enabled] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("plate"),
  );

  /** The plate on screen, and the one fading in over it. */
  const [shown, setShown] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !sceneId || !PLATES.has(sceneId)) return;
    if (sceneId === shown) return;

    // Decode before showing it: a plate that appears half-drawn is worse than
    // one that appears a beat late.
    const img = new Image();
    img.src = srcFor(sceneId);
    let cancelled = false;
    img.decode().catch(() => undefined).then(() => {
      if (cancelled) return;
      setIncoming(sceneId);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setShown(sceneId);
        setIncoming(null);
      }, 420);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, sceneId, shown]);

  if (!enabled) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {shown && (
        <img
          src={srcFor(shown)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {incoming && (
        <img
          key={incoming}
          src={srcFor(incoming)}
          alt=""
          className="absolute inset-0 h-full w-full animate-[plate-in_420ms_ease-out_forwards] object-cover opacity-0"
        />
      )}
      <style>{`@keyframes plate-in { to { opacity: 1 } }`}</style>
    </div>
  );
}
