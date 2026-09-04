"use client";

/**
 * Curtains.
 *
 * Drawn above the room illustration but below the darkness overlay, because
 * curtains are objects in the room and get dimmed along with everything else —
 * a blackout panel that stays crisply visible in a dark room looks pasted on.
 *
 * Two independent layers, sheer and blackout, each drawing from both sides.
 * Showing them as genuinely separate tracks matters: dual-track is an upsell,
 * and a client who has only ever seen single-track curtains needs to watch the
 * sheer close for glare and the blackout close for the film.
 */

import type { ShadeDevice, ShadeState } from "@/lib/sim/types";
import { STAGE_H, STAGE_W, rectToPx } from "./geometry";
import { clamp01 } from "@/lib/sim/photometry";

/** Alternating stops read as fabric gather, and scale with the panel. */
function FoldGradient({ id, light }: { id: string; light: boolean }) {
  const base = light ? "#e8ecf2" : "#20242d";
  const shade = light ? "#b9c2cf" : "#0e1116";
  const stops = [0, 0.14, 0.28, 0.42, 0.56, 0.7, 0.84, 1];
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      {stops.map((offset, i) => (
        <stop
          key={offset}
          offset={`${offset * 100}%`}
          stopColor={i % 2 === 0 ? base : shade}
        />
      ))}
    </linearGradient>
  );
}

export function ShadeLayer({
  device,
  state,
}: {
  device: ShadeDevice;
  state: ShadeState;
}) {
  const win = rectToPx(device.window);
  const draw = device.draw ?? "both";

  // Each side carries half the travel when panels draw from both edges.
  const halves = draw === "both" ? 2 : 1;

  const panels = (position: number, layer: "sheer" | "blackout") => {
    const p = clamp01(position / 100);
    if (p <= 0.001) return null;
    const panelW = (win.w / halves) * p;
    const opacity = layer === "sheer" ? 0.42 : 0.97;
    const fill = `url(#fold-${device.id}-${layer})`;

    const rects: { x: number; key: string }[] = [];
    if (draw === "both" || draw === "left") {
      rects.push({ x: win.x, key: "l" });
    }
    if (draw === "both" || draw === "right") {
      rects.push({ x: win.x + win.w - panelW, key: "r" });
    }

    return (
      <g opacity={opacity}>
        {rects.map((r) => (
          <rect
            key={`${layer}-${r.key}`}
            x={r.x}
            y={win.y}
            width={panelW}
            height={win.h}
            fill={fill}
          />
        ))}
      </g>
    );
  };

  return (
    <svg
      viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      <defs>
        <FoldGradient id={`fold-${device.id}-sheer`} light />
        <FoldGradient id={`fold-${device.id}-blackout`} light={false} />
      </defs>

      {/* Sheer first — blackout hangs on the room side of it. */}
      {panels(state.sheer, "sheer")}
      {panels(state.blackout, "blackout")}

      {/* Track pelmet, so the panels have something to hang from. */}
      <rect
        x={win.x - 10}
        y={win.y - 16}
        width={win.w + 20}
        height={16}
        rx={4}
        fill="#191c23"
      />
    </svg>
  );
}
