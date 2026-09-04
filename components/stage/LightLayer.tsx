"use client";

/**
 * The additive light layer.
 *
 * Composited over the room with `mix-blend-mode: screen`, so light adds rather
 * than paints. Deliberately uses no SVG filters: gradient falloff alone carries
 * the softness, which keeps a layer of twenty-odd shapes cheap enough to
 * animate at 60fps on the mid-range tablets salespeople actually carry. It also
 * happens to look more correct — a 24° track spot really does have a fairly
 * defined beam edge, and blurring it into a haze reads as fog, not light.
 */

import type { GlowSpec } from "@/lib/sim/types";
import { rgbToCss, clamp01 } from "@/lib/sim/photometry";
import { STAGE_H, STAGE_W, conePoints, pr, px, py } from "./geometry";

export interface GlowItem {
  key: string;
  spec: GlowSpec;
  color: [number, number, number];
  /** Compositing alpha from the dimmer level — see `glowAlpha`. */
  alpha: number;
}

function Gradient({ item }: { item: GlowItem }) {
  const { key, spec, color } = item;
  const stop = rgbToCss(color);
  const id = `glow-${key}`;

  if (spec.shape === "cone") {
    const cone = conePoints(spec);
    return (
      <radialGradient
        id={id}
        gradientUnits="userSpaceOnUse"
        cx={cone.apex.x}
        cy={cone.apex.y}
        r={cone.length}
      >
        <stop offset="0%" stopColor={stop} stopOpacity={1} />
        <stop offset="35%" stopColor={stop} stopOpacity={0.6} />
        <stop offset="100%" stopColor={stop} stopOpacity={0} />
      </radialGradient>
    );
  }

  if (spec.shape === "pool") {
    return (
      <radialGradient
        id={id}
        gradientUnits="userSpaceOnUse"
        cx={px(spec.x)}
        cy={py(spec.y)}
        r={pr(spec.radius ?? 0.2)}
      >
        <stop offset="0%" stopColor={stop} stopOpacity={1} />
        <stop offset="40%" stopColor={stop} stopOpacity={0.5} />
        <stop offset="100%" stopColor={stop} stopOpacity={0} />
      </radialGradient>
    );
  }

  // strip / panel / ambient — the halo scales with each shape's own bounding box.
  return (
    <radialGradient id={id}>
      <stop offset="0%" stopColor={stop} stopOpacity={0.85} />
      <stop offset="55%" stopColor={stop} stopOpacity={0.32} />
      <stop offset="100%" stopColor={stop} stopOpacity={0} />
    </radialGradient>
  );
}

function Shape({ item }: { item: GlowItem }) {
  const { key, spec, color, alpha } = item;
  const a = clamp01(alpha * (spec.intensity ?? 1));
  if (a <= 0.002) return null;

  const fill = `url(#glow-${key})`;
  const solid = rgbToCss(color);

  switch (spec.shape) {
    case "pool":
      return (
        <circle
          cx={px(spec.x)}
          cy={py(spec.y)}
          r={pr(spec.radius ?? 0.2)}
          fill={fill}
          opacity={a}
        />
      );

    case "cone": {
      const c = conePoints(spec);
      return (
        <g opacity={a}>
          <polygon
            points={`${c.apex.x},${c.apex.y} ${c.left.x},${c.left.y} ${c.right.x},${c.right.y}`}
            fill={fill}
          />
          {/* The fixture aperture itself, which is the brightest thing in shot. */}
          <circle
            cx={c.apex.x}
            cy={c.apex.y}
            r={pr(spec.radius ?? 0.03)}
            fill={solid}
          />
        </g>
      );
    }

    case "strip": {
      const w = px(spec.w ?? 0.5);
      const h = py(spec.h ?? 0.02);
      const cx = px(spec.x);
      const cy = py(spec.y);
      return (
        <g opacity={a}>
          {/* Bloom around the strip. */}
          <ellipse cx={cx} cy={cy} rx={(w / 2) * 1.06} ry={h * 3.2} fill={fill} />
          {/* The bright core line the eye reads as the source. */}
          <rect
            x={cx - w / 2}
            y={cy - h / 2}
            width={w}
            height={h}
            rx={h / 2}
            fill={solid}
          />
        </g>
      );
    }

    case "panel": {
      const w = px(spec.w ?? 0.2);
      const h = py(spec.h ?? 0.1);
      const cx = px(spec.x);
      const cy = py(spec.y);
      return (
        <g opacity={a}>
          <ellipse cx={cx} cy={cy} rx={(w / 2) * 1.3} ry={(h / 2) * 2.1} fill={fill} />
          <rect
            x={cx - w / 2}
            y={cy - h / 2}
            width={w}
            height={h}
            rx={Math.min(w, h) * 0.1}
            fill={solid}
            opacity={0.92}
          />
        </g>
      );
    }

    case "ambient":
      return (
        <ellipse
          cx={px(spec.x)}
          cy={py(spec.y)}
          rx={px(spec.w ?? 1) / 2}
          ry={py(spec.h ?? 1) / 2}
          fill={fill}
          opacity={a}
        />
      );
  }
}

export function LightLayer({ items }: { items: GlowItem[] }) {
  const visible = items.filter(
    (i) => clamp01(i.alpha * (i.spec.intensity ?? 1)) > 0.002,
  );

  return (
    <svg
      viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ mixBlendMode: "screen" }}
      aria-hidden
    >
      <defs>
        {visible.map((item) => (
          <Gradient key={item.key} item={item} />
        ))}
      </defs>
      {visible.map((item) => (
        <Shape key={item.key} item={item} />
      ))}
    </svg>
  );
}
