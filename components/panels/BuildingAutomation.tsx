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
  FanDevice,
  FanState,
  LightState,
  ShadeDevice,
  ShadeState,
} from "@/lib/sim/types";
import { interiorDaylightLux } from "@/lib/sim/daylight";
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
 * One or two tracks, the space's own presets, and a slider.
 *
 * The buttons come from `ShadeDevice.presets` rather than from anything in
 * here, because the middle one is the part with a name worth printing and
 * only the space knows it: a hotel window with two tracks calls
 * half-covered "Sheer", and a cabin with one venetian calls it the meeting
 * preset. The slider then drives whichever track is still free to move —
 * the blackout once the sheer is already across, the sheer otherwise, and
 * on a one-track window simply the one track. That is one control for two
 * motors without ever asking which motor you meant.
 *
 * Every press goes through `patch`, which hands the move to the motor
 * model: travel time is the track's, scaled by how far it has to go, and
 * the control locks itself until it arrives. A blind that answered
 * instantly would be the one obviously fake thing in the room.
 */
function Curtains() {
  const space = useSim((s) => s.space);
  const states = useSim((s) => s.states);
  const patch = useSim((s) => s.patch);
  const busyDevices = useSim((s) => s.busyDevices);
  const shade = space?.devices.find((d): d is ShadeDevice => d.kind === "shade");
  const st = shade ? (states[shade.id] as ShadeState | undefined) : undefined;
  if (!shade || !st) return null;

  const twoTrack = shade.layers.includes("sheer");
  const sheer = Math.round(st.sheer);
  const blackout = Math.round(st.blackout);
  const moving = busyDevices.includes(shade.id);
  const travel = (shade.travelMs / 1000).toFixed(1).replace(/\.0$/, "");

  const presets =
    shade.presets ??
    (twoTrack
      ? [
          { label: "Open", sheer: 0, blackout: 0, hint: undefined as string | undefined },
          { label: "Half", sheer: 100, blackout: 0, hint: undefined },
          { label: "Close", sheer: 100, blackout: 100, hint: undefined },
        ]
      : [
          { label: "Open", blackout: 0, hint: undefined as string | undefined },
          { label: "Half", blackout: 50, hint: undefined },
          { label: "Close", blackout: 100, hint: undefined },
        ]);

  const at = (p: { sheer?: number; blackout: number }) =>
    Math.abs(blackout - p.blackout) <= 2 &&
    (!twoTrack || Math.abs(sheer - (p.sheer ?? 0)) <= 2);
  const here = presets.find(at);

  // The track the slider holds: on a two-track window, the blackout once
  // the sheer is across; on a one-track window there is only ever one.
  const live: keyof ShadeState = !twoTrack || sheer >= 98 ? "blackout" : "sheer";
  const liveName = !twoTrack ? shade.name : live === "blackout" ? "Blackout" : "Sheer";
  const position = live === "blackout" ? blackout : sheer;

  return (
    <Card
      title={shade.name}
      note={
        moving
          ? "travelling…"
          : (here?.label.toLowerCase() ??
            (twoTrack ? `sheer ${sheer}% · blackout ${blackout}%` : `${blackout}% down`))
      }
    >
      <div className="mb-2 flex gap-1">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            title={preset.hint}
            disabled={moving}
            onClick={() =>
              patch(shade.id, twoTrack
                ? { sheer: preset.sheer ?? 0, blackout: preset.blackout }
                : { blackout: preset.blackout })
            }
            aria-pressed={here?.label === preset.label}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] transition-colors disabled:opacity-40 ${
              here?.label === preset.label
                ? "border-brass-700 bg-shell-800 text-brass-300"
                : "border-shell-800 text-shell-300 hover:text-shell-100"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="mb-1 flex items-center justify-between text-[10px] text-shell-500">
        <span>{liveName}</span>
        <span className="tabular-nums text-shell-300">{position}%</span>
      </div>
      <Slider
        value={position}
        min={0}
        max={100}
        label={`${liveName} position`}
        disabled={moving}
        onChange={(v) => patch(shade.id, { [live]: v })}
      />
      <p className="mt-1.5 text-[10px] leading-relaxed text-shell-500">
        {moving
          ? "Motor running. The control is held until it arrives — the same lock a wall switch would have."
          : `${travel} s ${twoTrack ? "a track" : "end to end"}, and proportional: asked for the last fifth, it takes a fifth of that.`}
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
      <Segmented
        value={st.mode}
        options={MODES}
        onChange={(mode) => patch(climate.id, { on: true, mode })}
        label="Mode"
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
/* Fan                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Fan speed, on its own card and not inside the thermostat.
 *
 * Every client list in this project names the fan separately from the air
 * conditioning, and they are right to: the setpoint is a decision about
 * comfort and the fan speed is a decision about noise, and in a room where
 * somebody is on a call those are not the same conversation.
 *
 * It drives a real `fan` device where the space has one — the office floor
 * has a BLDC fan over the lounge with blades you can watch — and otherwise
 * the fan speed on the fan coil, which is what a cabin with a concealed
 * diffuser and no ceiling fan actually has. Four named positions either
 * way, because that is what is printed on both kinds of controller.
 */
function Fan() {
  const space = useSim((s) => s.space);
  const states = useSim((s) => s.states);
  const patch = useSim((s) => s.patch);
  const ceiling = space?.devices.find((d): d is FanDevice => d.kind === "fan");
  const climate = space?.devices.find((d) => d.kind === "climate");
  const fanSt = ceiling ? (states[ceiling.id] as FanState | undefined) : undefined;
  const acSt = climate ? (states[climate.id] as ClimateState | undefined) : undefined;

  if (ceiling && !fanSt) return null;
  if (!ceiling && !acSt) return null;

  const SPEEDS = [
    { value: 0, label: ceiling ? "Off" : "Auto" },
    { value: 1, label: "Low" },
    { value: 2, label: "Med" },
    { value: 3, label: "High" },
  ];
  // A ceiling fan's "off" is the device off rather than speed zero, so it
  // keeps the speed it was on and restarts where it left off.
  const value = ceiling
    ? fanSt!.on
      ? Math.min(fanSt!.speed, 3)
      : 0
    : Math.min(acSt!.fan, 3);
  const name = SPEEDS.find((f) => f.value === value)?.label ?? String(value);

  const choose = (next: number) => {
    if (ceiling) patch(ceiling.id, next === 0 ? { on: false } : { on: true, speed: next });
    else patch(climate!.id, { on: true, fan: next });
  };

  return (
    <Card title={ceiling?.name ?? "Fan"} note={name.toLowerCase()}>
      <Segmented value={value} options={SPEEDS} onChange={choose} label="Fan speed" />
      <p className="mt-1.5 text-[10px] leading-relaxed text-shell-500">
        {ceiling
          ? `About ${ceiling.ratedWatts} W at the top speed, and the reason the setpoint on this floor can sit two degrees higher than it otherwise would.`
          : "A concealed fan coil, not a ceiling fan — the speed is how much air the diffuser moves, and it is the control somebody on a call reaches for before they touch the setpoint."}
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Daylight response                                                   */
/* ------------------------------------------------------------------ */

/**
 * Give back what the glazing is already supplying, and show the sum.
 *
 * Distinct from the `daylight` *rule*, which models the real thing against
 * a design illuminance in simulated minutes. This is the panel version and
 * it exists to be watched: one toggle, a straight `1 - strength x daylight`
 * on the named circuits, and a read-out saying what it is doing right now.
 * Drop the blinds and the number falls and the ceiling comes up to meet
 * it, in front of the client — which is a thing no amount of explaining
 * the rule achieves.
 *
 * It reads `interiorDaylightLux`, the same function the lux sensor and the
 * rule use, so the three cannot disagree about how much light is coming in.
 */
function DaylightResponse() {
  const space = useSim((s) => s.space);
  const states = useSim((s) => s.states);
  const clockMin = useSim((s) => s.clockMin);
  const patch = useSim((s) => s.patch);
  const cfg = space?.daylightResponse;
  const [on, setOn] = useState(true);
  /** What each circuit was asked for before any trim, so it can be undone. */
  const base = useRef<Record<string, number>>({});
  const applied = useRef(-1);

  const peak = space
    ? space.environment.outdoorPeakLux * space.environment.windowFactor
    : 1;
  const share = space
    ? Math.min(1, Math.max(0, interiorDaylightLux(space, states, clockMin) / Math.max(peak, 1e-6)))
    : 0;
  const factor = cfg ? 1 - cfg.strength * share : 1;

  useEffect(() => {
    if (!cfg) return;
    const now = useSim.getState().states;
    if (!on) {
      for (const [id, level] of Object.entries(base.current)) {
        patch(id, { on: true, level }, cfg.easeMs);
      }
      base.current = {};
      applied.current = -1;
      return;
    }
    // Only act when the trim has actually moved, or this fights every
    // scene change and every rule pass for control of the same circuits.
    if (Math.abs(applied.current - factor) < 0.01) return;
    const previous = applied.current;
    for (const id of cfg.deviceIds) {
      const st = now[id] as LightState | undefined;
      if (!st?.on) continue;
      if (base.current[id] === undefined) {
        base.current[id] = previous < 0 ? st.level : st.level / Math.max(previous, 0.01);
      }
      patch(id, { on: true, level: Math.round(base.current[id] * factor) }, cfg.easeMs);
    }
    applied.current = factor;
  }, [cfg, on, factor, patch]);

  if (!cfg || !space) return null;
  const names = cfg.deviceIds
    .map((id) => space.devices.find((d) => d.id === id)?.name ?? id)
    .join(" and ");
  const first = states[cfg.deviceIds[0]] as LightState | undefined;

  return (
    <Card title="Daylight response" note={on ? `${Math.round(share * 100)}% daylight` : "off"}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-shell-400">Trim against the glazing</span>
        <Toggle on={on} onChange={setOn} label="Daylight response" />
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-shell-850">
        <div
          className="h-full rounded-full bg-brass-500/70 transition-[width] duration-700"
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </div>
      <p className="mt-1.5 text-[10px] leading-relaxed text-shell-500">
        {on
          ? `Daylight ${Math.round(share * 100)}% → ${names.toLowerCase()} trimmed to ${Math.round(factor * 100)}%${first?.on ? `, now at ${Math.round(first.level)}%.` : "."}`
          : `${names} run at whatever the scene asked for. Switch it on and move the blinds to watch them answer.`}
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Zoned occupancy                                                     */
/* ------------------------------------------------------------------ */

/**
 * Two zones that can disagree, which is the only reason to zone at all.
 *
 * `Occupancy` above is the one-group card and stays for the rooms that
 * make the point once. This is for a floor: a button per zone, each taking
 * out its own task circuit, and a shared layer that only falls back when
 * every zone has gone — because light over an occupied row is not a
 * saving, it is the job.
 *
 * The Auto switch walks the floor on its own for a screen left running,
 * and pauses while a staged scene is playing: a demonstration being
 * narrated should not have a sensor changing the room underneath it.
 */
function OccupancyZones() {
  const space = useSim((s) => s.space);
  const patch = useSim((s) => s.patch);
  const sequence = useSim((s) => s.sequence);
  const cfg = space?.occupancyZones;
  const [vacant, setVacant] = useState<Record<string, boolean>>({});
  const [auto, setAuto] = useState(false);
  /** Levels captured when a circuit was put out, to put back. */
  const held = useRef<Record<string, number>>({});

  const setZone = useCallback(
    (id: string, isVacant: boolean) => {
      if (!cfg) return;
      const zone = cfg.zones.find((z) => z.id === id);
      if (!zone) return;
      const now = useSim.getState().states;
      for (const deviceId of zone.deviceIds) {
        const st = now[deviceId] as LightState | undefined;
        if (isVacant) {
          if (st?.on) held.current[deviceId] = st.level;
          patch(deviceId, { on: false }, cfg.afterMs);
        } else {
          patch(deviceId, { on: true, level: held.current[deviceId] ?? 60 }, cfg.restoreMs);
        }
      }
      setVacant((v) => ({ ...v, [id]: isVacant }));
    },
    [cfg, patch],
  );

  // The shared layer answers to the whole floor rather than to one zone.
  useEffect(() => {
    const all = cfg?.whenAllVacant;
    if (!all || !cfg) return;
    const everyoneGone = cfg.zones.every((z) => vacant[z.id]);
    const now = useSim.getState().states;
    for (const deviceId of all.deviceIds) {
      const st = now[deviceId] as LightState | undefined;
      if (!st) continue;
      if (everyoneGone) {
        if (held.current[deviceId] === undefined && st.on) held.current[deviceId] = st.level;
        const to = Math.round((held.current[deviceId] ?? st.level) * all.toFraction);
        patch(deviceId, { on: true, level: to }, cfg.afterMs);
      } else if (held.current[deviceId] !== undefined) {
        patch(deviceId, { on: true, level: held.current[deviceId] }, cfg.restoreMs);
        delete held.current[deviceId];
      }
    }
  }, [cfg, vacant, patch]);

  // Simulated foot traffic, paused while a demonstration is narrating.
  useEffect(() => {
    if (!auto || !cfg?.auto || sequence) return;
    const { minMs, maxMs } = cfg.auto;
    const t = setTimeout(
      () => {
        const zone = cfg.zones[Math.floor(Math.random() * cfg.zones.length)];
        setZone(zone.id, !vacant[zone.id]);
      },
      minMs + Math.random() * Math.max(0, maxMs - minMs),
    );
    return () => clearTimeout(t);
  }, [auto, cfg, sequence, vacant, setZone]);

  if (!cfg || !space) return null;
  const empty = cfg.zones.filter((z) => vacant[z.id]).length;
  const shared = (cfg.whenAllVacant?.deviceIds ?? [])
    .map((id) => space.devices.find((d) => d.id === id)?.name ?? id)
    .join(", ");

  return (
    <Card
      title="Occupancy"
      note={
        empty === 0
          ? "all occupied"
          : empty === cfg.zones.length
            ? "floor empty"
            : `${empty} zone empty`
      }
    >
      <div className="space-y-1.5">
        {cfg.zones.map((zone) => (
          <div key={zone.id} className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-shell-400">{zone.name}</span>
            <Toggle
              on={!vacant[zone.id]}
              onChange={(occupied) => setZone(zone.id, !occupied)}
              label={`${zone.name} occupied`}
            />
          </div>
        ))}
        <div className="flex items-center justify-between gap-2 border-t border-shell-800 pt-1.5">
          <span className="text-[11px] text-shell-400">
            Auto{sequence && auto ? " — paused for the demonstration" : ""}
          </span>
          <Toggle on={auto} onChange={setAuto} label="Simulate foot traffic" />
        </div>
      </div>
      <p className="mt-1.5 text-[10px] leading-relaxed text-shell-500">
        {empty === cfg.zones.length && shared
          ? `Floor empty — task light out in every zone and ${shared.toLowerCase()} down to ${Math.round((cfg.whenAllVacant?.toFraction ?? 0) * 100)}%.`
          : `Each zone takes out only its own task circuit. ${shared} follows the whole floor, not one half of it.`}
      </p>
    </Card>
  );
}


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
    Boolean(space.occupancyZones) ||
    Boolean(space.daylightResponse) ||
    Boolean(space.exclusive?.length) ||
    space.devices.some(
      (d) =>
        d.kind === "climate" || d.kind === "av" || d.kind === "shade" || d.kind === "fan",
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
      <DaylightResponse />
      <Occupancy />
      <OccupancyZones />
      <Hvac />
      <Fan />
      <Indicators />
      <Music />
    </div>
  );
}
