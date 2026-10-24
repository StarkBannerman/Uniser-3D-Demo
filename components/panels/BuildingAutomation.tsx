"use client";

/**
 * The building-automation tab.
 *
 * Everything here is driven by what the space declares — `schedule`,
 * `autoDim`, a climate device, an av device — so a room that declares none
 * of it gets the rule list and nothing else, and no space id appears
 * anywhere below.
 *
 * The five panels are the client's list, and each one exists because it is
 * the part of building automation you cannot show with a photograph: a
 * timetable only means something if you can watch it fire, and an occupancy
 * saving only means something if you can watch the room give the light back.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSim } from "@/lib/sim/store";
import type {
  AvState,
  ClimateMode,
  ClimateState,
  LightState,
  ShadeDevice,
  ShadeState,
} from "@/lib/sim/types";
import { formatClock } from "@/lib/sim/clock";
import {
  SectionLabel,
  Segmented,
  Slider,
  Stepper,
  Toggle,
} from "@/components/ui/Primitives";

/* ------------------------------------------------------------------ */

function Card({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-shell-800 bg-shell-900/60 p-2.5">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <div className="text-[11px] font-medium text-shell-200">{title}</div>
        {note && <div className="text-[10px] text-shell-500">{note}</div>}
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1 + 3. The timetable, and the switch that plays it                  */
/* ------------------------------------------------------------------ */

/** The entry in force at `min`, which is the last one at or before it. */
function currentEntry(
  schedule: { atMin: number; sceneId: string }[],
  min: number,
) {
  const sorted = [...schedule].sort((a, b) => a.atMin - b.atMin);
  let found = sorted[sorted.length - 1];
  for (const e of sorted) if (e.atMin <= min) found = e;
  return found;
}

function nextEntry(schedule: { atMin: number; sceneId: string }[], min: number) {
  const sorted = [...schedule].sort((a, b) => a.atMin - b.atMin);
  return sorted.find((e) => e.atMin > min) ?? sorted[0];
}

function Schedule() {
  const space = useSim((s) => s.space);
  const clockMin = useSim((s) => s.clockMin);
  const applyScene = useSim((s) => s.applyScene);
  const activeSceneId = useSim((s) => s.activeSceneId);
  const [following, setFollowing] = useState(false);
  const lastFired = useRef<string | null>(null);

  const schedule = space?.schedule;

  /**
   * Fire on the boundary, not on every tick.
   *
   * The clock moves continuously and the scrubber can jump hours in one
   * drag, so this tracks which entry is in force and only applies a scene
   * when that changes. Without the guard a scrub through a whole day would
   * re-apply the same scene sixty times a second and the room would never
   * finish a fade.
   */
  useEffect(() => {
    if (!following || !schedule?.length) return;
    const entry = currentEntry(schedule, clockMin);
    if (!entry || lastFired.current === entry.sceneId) return;
    lastFired.current = entry.sceneId;
    applyScene(entry.sceneId);
  }, [following, schedule, clockMin, applyScene]);

  useEffect(() => {
    if (!following) lastFired.current = null;
  }, [following]);

  if (!schedule?.length || !space) return null;
  const next = nextEntry(schedule, clockMin);
  const name = (id: string) => space.scenes.find((sc) => sc.id === id)?.name ?? id;

  return (
    <Card title="Time-based scenes" note={following ? "following the clock" : "manual"}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-shell-400">
          Play the timetable as the clock moves
        </span>
        <Toggle on={following} onChange={setFollowing} label="Time-based scenes" />
      </div>
      <div className="flex flex-wrap gap-1">
        {[...schedule]
          .sort((a, b) => a.atMin - b.atMin)
          .map((e) => {
            const isNext = e.atMin === next?.atMin;
            const isNow = following && activeSceneId === e.sceneId;
            return (
              <span
                key={`${e.atMin}-${e.sceneId}`}
                className={`rounded px-1.5 py-1 text-[10px] tabular-nums ${
                  isNow
                    ? "bg-brass-600/30 text-brass-300"
                    : isNext
                      ? "bg-shell-800 text-shell-200 ring-1 ring-brass-600/50"
                      : "text-shell-500"
                }`}
              >
                {formatClock(e.atMin)} {name(e.sceneId)}
              </span>
            );
          })}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Occupancy                                                        */
/* ------------------------------------------------------------------ */

function Occupancy() {
  const space = useSim((s) => s.space);
  const states = useSim((s) => s.states);
  const patch = useSim((s) => s.patch);
  const [occupied, setOccupied] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [pending, setPending] = useState(false);
  /** Levels captured when the room emptied, to put back when it fills. */
  const held = useRef<Record<string, number>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cfg = space?.autoDim;

  const reduce = useCallback(() => {
    if (!cfg) return;
    const now = useSim.getState().states;
    const captured: Record<string, number> = {};
    for (const id of cfg.deviceIds) {
      const st = now[id] as LightState | undefined;
      if (!st?.on) continue;
      captured[id] = st.level;
      patch(id, { level: Math.round(st.level * cfg.toFraction) }, cfg.restoreMs);
    }
    held.current = captured;
    setReduced(true);
    setPending(false);
  }, [cfg, patch]);

  const restore = useCallback(() => {
    if (!cfg) return;
    for (const [id, level] of Object.entries(held.current)) {
      patch(id, { on: true, level }, cfg.restoreMs);
    }
    held.current = {};
    setReduced(false);
  }, [cfg, patch]);

  const setOccupancy = (next: boolean) => {
    setOccupied(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (next) {
      setPending(false);
      if (reduced) restore();
      return;
    }
    setPending(true);
    timer.current = setTimeout(reduce, cfg?.afterMs ?? 10000);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!cfg || !space) return null;
  const names = cfg.deviceIds
    .map((id) => space.devices.find((d) => d.id === id)?.name ?? id)
    .join(", ");
  const held30 = Math.round(cfg.toFraction * 100);
  void states;

  return (
    <Card
      title="Occupancy-based lighting"
      note={`after ${Math.round(cfg.afterMs / 1000)} s`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-shell-400">{space.name} occupied</span>
        <Toggle on={occupied} onChange={setOccupancy} label={`${space.name} occupied`} />
      </div>
      <button
        type="button"
        onClick={() => setOccupancy(false)}
        disabled={!occupied}
        className="w-full rounded-lg border border-shell-800 px-2 py-1.5 text-[11px] text-shell-300 transition-colors hover:text-shell-100 disabled:opacity-40"
      >
        Simulate: the room empties
      </button>
      <p className="mt-1.5 text-[10px] leading-relaxed text-shell-500">
        {reduced
          ? `Unoccupied: lighting reduced — ${names} at ${held30}% of scene level. Architecture, cove and façade stay on.`
          : pending
            ? `Empty. Falling back in ${Math.round(cfg.afterMs / 1000)} s unless someone crosses the floor…`
            : `${names} fall back to ${held30}% when the floor is empty.`}
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Curtains                                                            */
/* ------------------------------------------------------------------ */

/**
 * One track, three presets and a slider.
 *
 * The position is the shade's `blackout` layer, 0 drawn back to 100 shut,
 * and Sheer is the halfway point of it rather than a second fabric — this
 * window has one track and the plates were rendered at its two ends, so half
 * is what half looks like.
 *
 * Every button goes through `patch`, which hands the move to the motor model:
 * the travel time is the track's, scaled by how far it has to go, and the
 * control locks itself until it arrives. A curtain that answered instantly
 * would be the one obviously fake thing in the room.
 */
function Curtains() {
  const space = useSim((s) => s.space);
  const states = useSim((s) => s.states);
  const patch = useSim((s) => s.patch);
  const busyDevices = useSim((s) => s.busyDevices);
  const shade = space?.devices.find((d): d is ShadeDevice => d.kind === "shade");
  const st = shade ? (states[shade.id] as ShadeState | undefined) : undefined;
  if (!shade || !st) return null;

  const position = Math.round(st.blackout);
  const moving = busyDevices.includes(shade.id);
  const travel = Math.round(shade.travelMs / 1000);
  const where =
    position <= 2 ? "open" : position >= 98 ? "blackout" : position > 45 && position < 55 ? "sheer" : `${position}% closed`;

  const PRESETS: { label: string; to: number; hint: string }[] = [
    { label: "Open", to: 0, hint: "Drawn fully back" },
    { label: "Sheer", to: 50, hint: "Half across — daylight, no view in" },
    { label: "Close", to: 100, hint: "Blackout" },
  ];

  return (
    <Card title={shade.name} note={moving ? "travelling…" : where}>
      <div className="mb-2 flex gap-1">
        {PRESETS.map((preset) => {
          const here = Math.abs(position - preset.to) <= 2;
          return (
            <button
              key={preset.label}
              type="button"
              title={preset.hint}
              disabled={moving}
              onClick={() => patch(shade.id, { blackout: preset.to })}
              aria-pressed={here}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] transition-colors disabled:opacity-40 ${
                here
                  ? "border-brass-700 bg-shell-800 text-brass-300"
                  : "border-shell-800 text-shell-300 hover:text-shell-100"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <Slider
        value={position}
        min={0}
        max={100}
        label="Curtain position"
        disabled={moving}
        onChange={(blackout) => patch(shade.id, { blackout })}
      />
      <button
        type="button"
        disabled={moving || position >= 98}
        onClick={() => patch(shade.id, { blackout: 100 })}
        className="mt-2 w-full rounded-lg border border-shell-800 px-2 py-1.5 text-[11px] text-shell-300 transition-colors hover:text-shell-100 disabled:opacity-40"
      >
        Blackout
      </button>
      <p className="mt-1.5 text-[10px] leading-relaxed text-shell-500">
        {moving
          ? "Motor running. The control is held until the track arrives — the same lock a wall switch would have."
          : `${travel} s end to end, and proportional: asked for the last fifth, it takes a fifth of that.`}
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Interlocked indicators — the door panel                             */
/* ------------------------------------------------------------------ */

/**
 * The circuits of which at most one may be lit, from `Space.exclusive`.
 *
 * The interlock itself is in the store, not here: pressing either toggle is
 * an ordinary `patch`, and the engine puts the other one out. That matters
 * because the same thing has to happen when a scene lights one — Night
 * raises Do Not Disturb without mentioning Make Up Room — and a rule
 * enforced in a panel would only hold while somebody was looking at the
 * panel.
 */
function Indicators() {
  const space = useSim((s) => s.space);
  const states = useSim((s) => s.states);
  const patch = useSim((s) => s.patch);
  if (!space?.exclusive?.length) return null;

  return (
    <>
      {space.exclusive.map((group) => {
        const lit = group.deviceIds.find(
          (id) => (states[id] as LightState | undefined)?.on,
        );
        const name = (id: string) =>
          space.devices.find((d) => d.id === id)?.name ?? id;
        return (
          <Card
            key={group.label}
            title={group.label}
            note={lit ? name(lit) : "clear"}
          >
            <div className="space-y-1.5">
              {group.deviceIds.map((id) => {
                const on = Boolean((states[id] as LightState | undefined)?.on);
                return (
                  <div key={id} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[11px] text-shell-400">
                      <span
                        aria-hidden
                        className={`h-1.5 w-1.5 rounded-full ${
                          on
                            ? id.includes("dnd")
                              ? "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.9)]"
                              : "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]"
                            : "bg-shell-700"
                        }`}
                      />
                      {name(id)}
                    </span>
                    <Toggle
                      on={on}
                      onChange={(next) => patch(id, { on: next, level: 100 })}
                      label={name(id)}
                    />
                  </div>
                );
              })}
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-shell-500">
              Mutually exclusive, in the engine rather than in this panel —
              switching one on puts the other out wherever the press came
              from, including a scene.
            </p>
          </Card>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 4. HVAC                                                             */
/* ------------------------------------------------------------------ */

function Hvac() {
  const space = useSim((s) => s.space);
  const states = useSim((s) => s.states);
  const patch = useSim((s) => s.patch);
  const climate = space?.devices.find((d) => d.kind === "climate");
  const st = climate ? (states[climate.id] as ClimateState | undefined) : undefined;
  const setpoint = st?.setpointC ?? 22;

  /**
   * The measured temperature, animated here rather than read from the sim.
   *
   * The engine does model room temperature properly, on a thermal time
   * constant — but it integrates against *simulated* minutes, and the clock
   * sits paused unless a presenter scrubs it. So the honest number is frozen
   * at whatever it started as, which is not a reading anybody can watch
   * answer a setpoint. This is the brief's ask taken literally: a tenth of a
   * degree a second toward the setpoint, in real time, for the panel only.
   * Nothing downstream reads it and it does not touch the plates.
   */
  const [measured, setMeasured] = useState(() => setpoint + 2);
  useEffect(() => {
    const t = setInterval(() => {
      setMeasured((now) => {
        const gap = setpoint - now;
        if (Math.abs(gap) < 0.05) return setpoint;
        return now + Math.sign(gap) * 0.1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [setpoint]);

  if (!climate || !space || !st) return null;
  const settled = Math.abs(measured - setpoint) < 0.1;

  /**
   * Fan speed as four named positions, not a 0-5 slider.
   *
   * `ClimateState.fan` has carried "0 = auto, 1..3 = low/med/high" since the
   * type was written, and the slider was showing the integer. The client's
   * list asks for Low / Med / High / Auto by name, which is both what the
   * state already means and what is printed on every fan-coil controller.
   */
  const FAN: { value: number; label: string }[] = [
    { value: 0, label: "Auto" },
    { value: 1, label: "Low" },
    { value: 2, label: "Med" },
    { value: 3, label: "High" },
  ];
  const MODES: { value: ClimateMode; label: string }[] = [
    { value: "cool", label: "Cool" },
    { value: "heat", label: "Heat" },
    { value: "auto", label: "Auto" },
    { value: "fan", label: "Fan" },
  ];

  return (
    <Card title="HVAC" note={st.on ? st.mode : "off"}>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-shell-850 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wider text-shell-500">Setpoint</div>
          <div className="text-sm tabular-nums text-shell-100">{setpoint}°C</div>
        </div>
        <div className="rounded-lg bg-shell-850 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wider text-shell-500">
            {settled ? "At setpoint" : st.mode === "fan" ? "Circulating" : "Reaching"}
          </div>
          <div className="text-sm tabular-nums text-shell-100">
            {measured.toFixed(1)}°C
          </div>
        </div>
      </div>
      <div className="mb-2">
        <Stepper
          value={setpoint}
          min={climate.minC}
          max={climate.maxC}
          onChange={(setpointC) => patch(climate.id, { on: true, setpointC })}
          format={(v) => `${v}°C`}
          label="Setpoint"
        />
      </div>
      <div className="mb-2">
        <Segmented
          value={st.mode}
          options={MODES}
          onChange={(mode) => patch(climate.id, { on: true, mode })}
          label="Mode"
        />
      </div>
      <Segmented
        value={st.fan}
        options={FAN}
        onChange={(fan) => patch(climate.id, { on: true, fan })}
        label="Fan speed"
      />
      <p className="mt-1.5 text-[10px] leading-relaxed text-shell-500">
        The measured temperature moves a tenth of a degree a second toward the
        setpoint — real seconds, so it answers while you watch rather than
        waiting for the clock to be scrubbed.
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Music                                                            */
/* ------------------------------------------------------------------ */

/**
 * A soft ambient pad, synthesised.
 *
 * `public/audio/lobby.mp3` is tried first and this is what happens when
 * there is no file — three detuned sine partials through a low-pass, with a
 * slow tremolo, which is about as close to "hotel lobby" as sixty lines of
 * WebAudio gets. It is built on the first press and never before: an
 * AudioContext created without a gesture starts suspended, and a demo that
 * silently does nothing is worse than one that says why.
 */
function useAmbientPad() {
  const ctx = useRef<AudioContext | null>(null);
  const gain = useRef<GainNode | null>(null);

  const start = useCallback(async (volume: number) => {
    if (!ctx.current) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return false;
      const c = new AC();
      const out = c.createGain();
      out.gain.value = 0;
      const filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900;
      filter.Q.value = 0.6;
      filter.connect(out);
      out.connect(c.destination);
      for (const hz of [110, 164.81, 220.5]) {
        const osc = c.createOscillator();
        osc.type = "sine";
        osc.frequency.value = hz;
        const g = c.createGain();
        g.gain.value = 0.22;
        osc.connect(g).connect(filter);
        osc.start();
      }
      // A slow breath across the whole pad, so it is not a held organ chord.
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = c.createGain();
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain).connect(filter.frequency);
      lfo.start();
      ctx.current = c;
      gain.current = out;
    }
    await ctx.current.resume();
    gain.current?.gain.linearRampToValueAtTime(
      volume / 400,
      ctx.current.currentTime + 2,
    );
    return true;
  }, []);

  const stop = useCallback(() => {
    if (!ctx.current || !gain.current) return;
    gain.current.gain.linearRampToValueAtTime(0, ctx.current.currentTime + 0.4);
  }, []);

  const setVolume = useCallback((volume: number) => {
    if (!ctx.current || !gain.current) return;
    gain.current.gain.linearRampToValueAtTime(
      volume / 400,
      ctx.current.currentTime + 0.2,
    );
  }, []);

  useEffect(() => () => { void ctx.current?.close(); }, []);
  return { start, stop, setVolume };
}

function Music() {
  const space = useSim((s) => s.space);
  const states = useSim((s) => s.states);
  const patch = useSim((s) => s.patch);
  const av = space?.devices.find((d) => d.kind === "av");
  const pad = useAmbientPad();
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const st = av ? (states[av.id] as AvState | undefined) : undefined;

  useEffect(() => {
    if (playing && st) pad.setVolume(st.volume);
  }, [playing, st, pad]);

  if (!av || !st) return null;

  const toggle = async () => {
    if (playing) {
      pad.stop();
      setPlaying(false);
      return;
    }
    const ok = await pad.start(st.volume);
    setBlocked(!ok);
    setPlaying(ok);
    if (ok) patch(av.id, { on: true });
  };

  return (
    <Card title="Music" note={st.source}>
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          className="rounded-lg border border-shell-800 px-3 py-1.5 text-[11px] text-shell-200 transition-colors hover:text-shell-50"
        >
          {playing ? "Pause" : blocked ? "Tap to start music" : "Play"}
        </button>
        <span className="text-[10px] text-shell-500">
          {playing ? "Ambient pad, synthesised" : "Stopped"}
        </span>
      </div>
      <div className="mb-1 flex items-center justify-between text-[10px] text-shell-500">
        <span>Volume</span>
        <span className="tabular-nums text-shell-300">{st.volume}</span>
      </div>
      <Slider
        value={st.volume}
        min={0}
        max={100}
        label="Music volume"
        onChange={(volume) => patch(av.id, { volume })}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */

export function BuildingAutomation() {
  const space = useSim((s) => s.space);
  if (!space) return null;
  const has =
    Boolean(space.schedule?.length) ||
    Boolean(space.autoDim) ||
    Boolean(space.exclusive?.length) ||
    space.devices.some(
      (d) => d.kind === "climate" || d.kind === "av" || d.kind === "shade",
    );
  if (!has) {
    return (
      <p className="px-1 text-[11px] text-shell-500">
        This space has no building automation beyond its lighting rules.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <SectionLabel>Building automation</SectionLabel>
      <Schedule />
      <Curtains />
      <Occupancy />
      <Hvac />
      <Indicators />
      <Music />
    </div>
  );
}
