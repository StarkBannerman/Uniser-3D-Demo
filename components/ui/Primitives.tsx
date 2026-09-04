"use client";

import type { ReactNode } from "react";
import { cctToRgb, rgbToCss } from "@/lib/sim/photometry";

/* ------------------------------------------------------------------ */
/* Slider                                                              */
/* ------------------------------------------------------------------ */

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  /** CSS colour or gradient for the filled portion of the track. */
  fill,
  disabled,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  fill?: string;
  disabled?: boolean;
  label: string;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const filled = fill ?? "var(--color-brass-500)";
  const track = fill?.startsWith("linear-gradient")
    ? // A full-width gradient (colour temperature, hue) shows the whole range,
      // so the thumb reads as a position on a scale rather than a fill level.
      fill
    : `linear-gradient(to right, ${filled} 0%, ${filled} ${pct}%, var(--color-shell-700) ${pct}%, var(--color-shell-700) 100%)`;

  return (
    <input
      type="range"
      className="u-slider"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ["--u-track" as string]: track }}
    />
  );
}

/** Colour-temperature track showing the fixture's actual tunable range. */
export function cctGradient(minK: number, maxK: number): string {
  const steps = 6;
  const stops: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const k = minK + ((maxK - minK) * i) / steps;
    stops.push(`${rgbToCss(cctToRgb(k))} ${(i / steps) * 100}%`);
  }
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

export const HUE_GRADIENT =
  "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)";

/* ------------------------------------------------------------------ */
/* Toggle                                                              */
/* ------------------------------------------------------------------ */

export function Toggle({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
        on ? "bg-brass-600" : "bg-shell-700"
      } ${disabled ? "opacity-40" : "hover:brightness-110"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-shell-100 shadow transition-transform duration-200 ${
          on ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented control                                                   */
/* ------------------------------------------------------------------ */

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex gap-1 rounded-lg bg-shell-850 p-1"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "bg-shell-700 text-shell-100"
                : "text-shell-400 hover:text-shell-200"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export function ControlCard({
  title,
  subtitle,
  right,
  selected,
  onSelect,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        selected
          ? "border-brass-600/60 bg-shell-850"
          : "border-shell-800 bg-shell-900/60"
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onSelect}
          className="min-w-0 flex-1 text-left"
        >
          <div className="truncate text-sm font-medium text-shell-100">
            {title}
          </div>
          {subtitle && (
            <div className="truncate text-[11px] text-shell-400">{subtitle}</div>
          )}
        </button>
        {right}
      </div>
      {children && <div className="mt-3 space-y-2.5">{children}</div>}
    </div>
  );
}

export function FieldRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[11px]">
        <span className="text-shell-400">{label}</span>
        {value && <span className="font-mono text-shell-200">{value}</span>}
      </div>
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-1 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-shell-500">
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  unit,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "alert";
}) {
  const toneClass = {
    neutral: "text-shell-100",
    good: "text-signal-500",
    warn: "text-warn-500",
    alert: "text-alert-500",
  }[tone];

  return (
    <div className="rounded-lg border border-shell-800 bg-shell-900/60 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-shell-500">
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-base leading-tight ${toneClass}`}>
        {value}
        {unit && <span className="ml-0.5 text-[11px] text-shell-400">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-shell-500">{hint}</div>}
    </div>
  );
}
