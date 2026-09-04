"use client";

/**
 * The motorized projector screen.
 *
 * Like the curtains, this sits above the room and below the darkness overlay —
 * it is a physical object, not light. What it *emits* when a film is playing is
 * handled as a glow item in `SpaceCanvas`, which is what makes Movie Night work
 * visually: the screen becomes the brightest thing in the room and everything
 * else falls away around it.
 */

import type { AvDevice, AvState } from "@/lib/sim/types";
import { STAGE_H, STAGE_W, rectToPx } from "./geometry";
import { clamp01 } from "@/lib/sim/photometry";

export function ScreenLayer({
  device,
  state,
}: {
  device: AvDevice;
  state: AvState;
}) {
  if (!device.hasScreen || !device.screenRect) return null;

  const rect = rectToPx(device.screenRect);
  const deployed = clamp01(state.screen / 100);
  const height = rect.h * deployed;

  return (
    <svg
      viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id={`screen-${device.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#cfd4dc" />
          <stop offset="100%" stopColor="#aeb5c0" />
        </linearGradient>
      </defs>

      {height > 1 && (
        <>
          <rect
            x={rect.x}
            y={rect.y}
            width={rect.w}
            height={height}
            fill={`url(#screen-${device.id})`}
          />
          {/* Weighted bottom bar — the detail that makes it read as a screen
              rather than a white rectangle. */}
          <rect
            x={rect.x - 4}
            y={rect.y + height - 8}
            width={rect.w + 8}
            height={8}
            rx={2}
            fill="#2b2f38"
          />
        </>
      )}

      {/* The cassette stays visible whether or not the screen is down. */}
      <rect
        x={rect.x - 8}
        y={rect.y - 14}
        width={rect.w + 16}
        height={14}
        rx={3}
        fill="#1c1f26"
      />
    </svg>
  );
}
