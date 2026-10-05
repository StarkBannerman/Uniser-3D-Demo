"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cctToRgb, rgbToCss } from "@/lib/sim/photometry";

/* ------------------------------------------------------------------ */
/* Slider                                                              */
/* ------------------------------------------------------------------ */

/**
 * A dimmer slider.
 *
 * Wired to the store like everything else, with one piece of machinery in
 * between, for a reason worth spelling out.
 *
 * A pointer drag fires an input event per mouse move — around sixty a second.
 * Passing each one straight to `patch` meant sixty store writes a second, and
 * every one of those re-renders every component subscribed to device state.
 * On a thread already spending most of its time rendering the room, that work
 * competes with the very frames that would have drawn the thumb moving, so the
 * slider got *less* responsive the harder it was pushed.
 *
 * So two things happen here:
 *
 *  - **The thumb is local while a hand is on it.** `shown` drives the input, so
 *    the control follows the pointer without waiting for a round trip through
 *    the simulation. It syncs back from `value` the moment the hand comes off,
 *    which is what lets a scene press still move every slider.
 *  - **Writes are coalesced to one per animation frame.** You cannot see more
 *    positions than the browser paints, so the ones in between were never worth
 *    anything. The final value is always flushed on release, so what the person
 *    let go of is exactly what the room gets.
 */
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
  const [shown, setShown] = useState(value);
  /** True between pointer-down and pointer-up, or while a key is held. */
  const interacting = useRef(false);
  const pending = useRef<number | null>(null);
  const frame = useRef<number | null>(null);

  // Follow the simulation whenever nobody is driving — a scene press, a rule,
  // another interface. Skipped mid-drag, or the store would fight the pointer.
  useEffect(() => {
    if (!interacting.current) setShown(value);
  }, [value]);

  const flush = useCallback(() => {
    frame.current = null;
    if (pending.current === null) return;
    const next = pending.current;
    pending.current = null;
    onChange(next);
  }, [onChange]);

  const queue = useCallback(
    (next: number) => {
      pending.current = next;
      if (frame.current === null) frame.current = requestAnimationFrame(flush);
    },
    [flush],
  );

  /**
   * Hand back control.
   *
   * The flush is synchronous rather than queued: `patch` writes the store
   * immediately, so `value` arrives on the very next render and the sync effect
   * above — now unblocked — pulls the thumb onto whatever the simulation
   * actually settled on. Any clamp a rule applied shows up straight away
   * instead of a frame later.
   */
  const release = useCallback(() => {
    interacting.current = false;
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    flush();
  }, [flush]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const pct = max > min ? ((shown - min) / (max - min)) * 100 : 0;
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
      value={shown}
      disabled={disabled}
      aria-label={label}
      onPointerDown={() => {
        interacting.current = true;
      }}
      onPointerUp={release}
      onPointerCancel={release}
      // Arrow keys move the thumb without a pointer ever going down, so the
      // keyboard needs the same ownership window the pointer gets.
      onKeyDown={() => {
        interacting.current = true;
      }}
      onKeyUp={release}
      onBlur={release}
      onChange={(e) => {
        const next = Number(e.target.value);
        setShown(next);
        queue(next);
      }}
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
      {/* `left-0.5` is load-bearing. Without an explicit inset the thumb falls
          back to its static position, and a button's UA `text-align: center`
          puts that at the track's midpoint — so the thumb started 22px in and
          the "on" transform pushed it clean off the right-hand end, in both
          states. Anchor it, then travel the track's width less both margins. */}
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-shell-100 shadow transition-transform duration-200 ${
          on ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Ramp buttons                                                        */
/* ------------------------------------------------------------------ */

/** How long a press is held before it stops being a tap and starts ramping. */
const HOLD_DELAY_MS = 320;

/**
 * Minus and plus, with a dimmer's behaviour: tap to nudge, hold to sweep.
 *
 * This is what a wall dimmer does, and it is the right answer here for the
 * reason a slider was the wrong one. A track asks someone to hold a steady hand
 * on a small moving target — the one thing that does not work on a tablet, in
 * front of a client, over a shared screen. Two fixed buttons ask only that you
 * press and wait, and the room does the moving.
 *
 * The gradual sweep a drag used to give is still here, and is now the easy
 * thing rather than the skilled one: hold `+` and the level climbs at
 * `rampPerSecond` until you let go.
 *
 * Two details worth keeping:
 *
 *  - **The ramp owns its own value** while a button is held, rather than
 *    reading it back from the store each frame. A round trip through the
 *    simulation can miss a frame, and a ramp that re-reads a stale value stalls
 *    and then jumps.
 *  - **One commit per animation frame.** The loop is already frame-driven, so
 *    this falls out for free — but it is the reason holding a button does not
 *    bury the renderer the way dragging a slider did.
 */
export function RampButtons({
  value,
  min,
  max,
  onChange,
  /** How far one tap moves it. */
  tapStep,
  /** Units per second once the press becomes a hold. */
  rampPerSecond,
  /** Full-range gradient for the read-out bar — colour temperature uses this. */
  fill,
  label,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  tapStep: number;
  rampPerSecond: number;
  fill?: string;
  label: string;
  disabled?: boolean;
}) {
  const [shown, setShown] = useState(value);
  const held = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow the simulation whenever nobody is pressing — a scene, a rule, the
  // other interface. Skipped mid-hold, or the store would fight the ramp.
  useEffect(() => {
    if (held.current === null) setShown(value);
  }, [value]);

  const stop = useCallback(() => {
    held.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (timer.current !== null) clearTimeout(timer.current);
    frame.current = null;
    timer.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const press = useCallback(
    (direction: 1 | -1) => {
      if (disabled) return;
      stop();

      const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)));
      const start = clamp(value + direction * tapStep);
      held.current = start;
      setShown(start);
      onChange(start);

      timer.current = setTimeout(() => {
        let last = performance.now();
        const loop = (now: number) => {
          const dt = (now - last) / 1000;
          last = now;
          const next = clamp((held.current ?? start) + direction * rampPerSecond * dt);
          if (next !== held.current) {
            held.current = next;
            setShown(next);
            onChange(next);
          }
          frame.current = requestAnimationFrame(loop);
        };
        frame.current = requestAnimationFrame(loop);
      }, HOLD_DELAY_MS);
    },
    [disabled, max, min, onChange, rampPerSecond, stop, tapStep, value],
  );

  const pct = max > min ? ((shown - min) / (max - min)) * 100 : 0;

  const button = (direction: 1 | -1, glyph: string, name: string) => {
    const dead = disabled || (direction === 1 ? shown >= max : shown <= min);
    return (
      <button
        type="button"
        aria-label={`${label} ${name}`}
        disabled={dead}
        // Capture so the sweep keeps running if a finger drifts off the button,
        // and still ends on release wherever the pointer happens to be.
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          press(direction);
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onLostPointerCapture={stop}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") press(direction);
        }}
        onKeyUp={stop}
        onBlur={stop}
        className={`h-9 w-10 shrink-0 touch-none rounded-md text-base font-medium transition-colors ${
          dead
            ? "bg-shell-850 text-shell-600"
            : "bg-shell-800 text-shell-100 hover:bg-shell-700 active:bg-shell-600"
        }`}
      >
        {glyph}
      </button>
    );
  };

  return (
    <div
      className={`flex items-center gap-2 ${disabled ? "opacity-50" : ""}`}
      role="group"
      aria-label={label}
    >
      {button(-1, "−", "down")}
      {/* Read-out, not a control. It gives back the one thing the track was
          good for — seeing where the fixture sits at a glance — without asking
          anyone to hit it. */}
      <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-shell-700">
        {fill ? (
          <>
            <div className="absolute inset-0" style={{ background: fill }} />
            <div
              className="absolute top-0 h-full w-1 -translate-x-1/2 rounded-full bg-shell-950 shadow"
              style={{ left: `${pct}%` }}
            />
          </>
        ) : (
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-brass-500"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      {button(1, "+", "up")}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stepper                                                             */
/* ------------------------------------------------------------------ */

/**
 * Minus / value / plus.
 *
 * The idiom for a thermostat everywhere in the world, and the right one here
 * for the same reason it is right on a wall: the range is narrow, the useful
 * move is one degree, and nobody wants to place 23°C precisely with a fingertip
 * on a 250px track.
 */
export function Stepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  label,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** How the value reads between the buttons, e.g. `24°C`. */
  format: (value: number) => string;
  label: string;
  disabled?: boolean;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const button = (delta: number, glyph: string, name: string) => {
    const next = clamp(value + delta);
    const dead = disabled || next === value;
    return (
      <button
        type="button"
        onClick={() => onChange(next)}
        disabled={dead}
        aria-label={`${label} ${name}`}
        className={`h-8 w-9 shrink-0 rounded-md text-sm font-medium transition-colors ${
          dead
            ? "bg-shell-850 text-shell-600"
            : "bg-shell-800 text-shell-200 hover:bg-shell-700"
        }`}
      >
        {glyph}
      </button>
    );
  };

  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      {button(-step, "−", "down")}
      <span
        className={`min-w-0 flex-1 text-center font-mono text-[13px] ${
          disabled ? "text-shell-600" : "text-shell-100"
        }`}
      >
        {format(value)}
      </span>
      {button(step, "+", "up")}
    </div>
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
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex gap-1 rounded-lg bg-shell-850 p-1 ${
        disabled ? "pointer-events-none opacity-40" : ""
      }`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            disabled={disabled}
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
