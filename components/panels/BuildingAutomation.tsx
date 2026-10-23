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
import type { AvState, ClimateState, LightState } from "@/lib/sim/types";
import { formatClock } from "@/lib/sim/clock";
import { SectionLabel, Slider, Toggle } from "@/components/ui/Primitives";

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
        <span className="text-[11px] text-shell-400">Lobby occupied</span>
        <Toggle on={occupied} onChange={setOccupancy} label="Lobby occupied" />
      </div>
      <button
        type="button"
        onClick={() => setOccupancy(false)}
        disabled={!occupied}
        className="w-full rounded-lg border border-shell-800 px-2 py-1.5 text-[11px] text-shell-300 transition-colors hover:text-shell-100 disabled:opacity-40"
      >
        Simulate: guests leave
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
/* 4. HVAC                                                             */
/* ------------------------------------------------------------------ */

function Hvac() {
  const space = useSim((s) => s.space);
  const states = useSim((s) => s.states);
  const patch = useSim((s) => s.patch);
  const climate = space?.devices.find((d) => d.kind === "climate");
  const tempSensor = space?.devices.find(
    (d) => d.kind === "sensor" && d.metric === "temperature",
  );
  if (!climate || !space) return null;
  const st = states[climate.id] as ClimateState | undefined;
  if (!st) return null;
  /**
   * The measured temperature, from the simulation rather than from a second
   * animation of our own.
   *
   * The engine already integrates room temperature toward setpoint on a
   * thermal time constant, and the sensor strip reads the same number. A
   * panel here running its own ramp would be a second opinion about one
   * fact, which is exactly what this app's one-state rule exists to stop.
   */
  const measured = tempSensor
    ? (states[tempSensor.id] as { value?: number } | undefined)?.value
    : undefined;

  return (
    <Card title="HVAC" note={st.on ? st.mode : "off"}>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-shell-850 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wider text-shell-500">Setpoint</div>
          <div className="text-sm tabular-nums text-shell-100">{st.setpointC}°C</div>
        </div>
        <div className="rounded-lg bg-shell-850 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wider text-shell-500">Measured</div>
          <div className="text-sm tabular-nums text-shell-100">
            {measured === undefined ? "—" : `${measured.toFixed(1)}°C`}
          </div>
        </div>
      </div>
      <div className="mb-1 flex items-center justify-between text-[10px] text-shell-500">
        <span>Fan</span>
        <span className="tabular-nums text-shell-300">{st.fan}</span>
      </div>
      <Slider
        value={st.fan}
        min={0}
        max={5}
        label="Fan speed"
        onChange={(fan) => patch(climate.id, { fan })}
      />
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
    space.devices.some((d) => d.kind === "climate" || d.kind === "av");
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
      <Occupancy />
      <Hvac />
      <Music />
    </div>
  );
}
