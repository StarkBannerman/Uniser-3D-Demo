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
  AvDevice,
  AvState,
  ClimateDevice,
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
  const stopDevice = useSim((s) => s.stopDevice);
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
        {/**
          * Stop, for a track whose space says it has one.
          *
          * Enabled only mid-travel, because that is the only moment it
          * means anything. It goes through `stopDevice` rather than a
          * patch: patching a curtain to where it already is leaves the
          * lock the original command armed, and the card stays dead for
          * the rest of a travel that is no longer happening.
          */}
        {shade.stoppable && (
          <button
            type="button"
            disabled={!moving}
            onClick={() => stopDevice(shade.id)}
            className="rounded-lg border border-shell-800 px-2.5 py-1.5 text-[11px] text-shell-300 transition-colors hover:text-shell-100 disabled:opacity-30"
          >
            Stop
          </button>
        )}
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
      {/**
        * A travel bar, for a covering the room cannot show you.
        *
        * Driven straight off `states`, which the tick rewrites every
        * frame while the motor runs — so the fill moves with the fabric
        * rather than with a CSS guess at how long it should take.
        */}
      {shade.offFrame && (
        <div className="mb-2">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[11px] font-medium text-shell-200">
              {position <= 2 ? "Open" : position >= 98 ? "Closed" : `${position}% across`}
            </span>
            <span className="text-[10px] text-shell-500">
              {moving ? "travelling" : "at rest"}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-shell-800">
            <div
              className="h-full rounded-full bg-brass-500/80"
              style={{ width: `${position}%` }}
            />
          </div>
        </div>
      )}
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
  const climate = space?.devices.find((d): d is ClimateDevice => d.kind === "climate");
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

  const LABEL: Record<ClimateMode, string> = {
    cool: "Cool",
    heat: "Heat",
    auto: "Auto",
    fan: "Fan",
    dry: "Dry",
    sleep: "Sleep",
  };
  const MODES = (climate.modes ?? ["cool", "heat", "auto", "fan"]).map((value) => ({
    value,
    label: LABEL[value],
  }));

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
/* AV system                                                           */
/* ------------------------------------------------------------------ */

/**
 * One card for a room whose AV pieces only make sense together.
 *
 * The client lists Display, Projector, Screen, Speakers and Video
 * conferencing as five items, and four of them are one decision: there is
 * no separate display, the projector *is* the display, and it cannot show
 * anything until the screen is down. So the card enforces that rather than
 * describing it — Projector is disabled with the screen up, and pressing
 * it anyway sends the screen down first and waits.
 *
 * What is wired to what comes from `Space.avPanel`, not from device kinds.
 * This room has three `av` devices and guessing between them by kind would
 * pick whichever happened to be declared first.
 */
function AvSystem() {
  const space = useSim((s) => s.space);
  const states = useSim((s) => s.states);
  const patch = useSim((s) => s.patch);
  const busyDevices = useSim((s) => s.busyDevices);
  const cfg = space?.avPanel;

  const av = space?.devices.find((d): d is AvDevice => d.id === cfg?.deviceId);
  const avSt = av ? (states[av.id] as AvState | undefined) : undefined;
  const projector = cfg?.projectorId
    ? (states[cfg.projectorId] as LightState | undefined)
    : undefined;
  const camera = cfg?.cameraId ? (states[cfg.cameraId] as AvState | undefined) : undefined;
  const mediaDev = space?.devices.find((d): d is AvDevice => d.id === cfg?.mediaId);
  const media = mediaDev ? (states[mediaDev.id] as AvState | undefined) : undefined;

  if (!cfg || !space || !av || !avSt) return null;

  const screen = Math.round(avSt.screen);
  const down = screen >= 98;
  const moving = busyDevices.includes(av.id);
  const travel = Math.round((av.screenTravelMs ?? 6000) / 1000);

  const setScreen = (to: number) => {
    // The image goes before the screen does. A projector throwing three
    // and a half thousand lumens at a screen on its way up paints the
    // slide across the ceiling slot as it passes.
    if (to < screen && cfg.projectorId) patch(cfg.projectorId, { on: false }, 600);
    patch(av.id, { screen: to });
  };

  const setProjector = (on: boolean) => {
    if (!cfg.projectorId) return;
    if (on && !down) {
      // Asked for with the screen up: send the screen down and let the
      // presenter press it again when it arrives, rather than queueing
      // something they cannot see.
      setScreen(100);
      return;
    }
    patch(cfg.projectorId, on ? { on: true, level: 100 } : { on: false }, 1500);
  };

  const setCamera = (on: boolean) => {
    if (!cfg.cameraId) return;
    patch(cfg.cameraId, { on });
    const lift = cfg.cameraLight;
    if (!on || !lift) return;
    // A board member lit from the ceiling alone looks like a hostage
    // video, so the face panels come up with the camera — but only if
    // they are lower than the call needs. Turning the camera on should
    // never take light away.
    const st = states[lift.deviceId] as LightState | undefined;
    if (!st || !st.on || st.level < lift.level) {
      patch(lift.deviceId, { on: true, level: lift.level }, 1200);
    }
  };

  const avOn = () => {
    patch(av.id, { on: true, source: av.sources[0] });
    if (down) setProjector(true);
  };

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-[11px] text-shell-400">{label}</span>
      {children}
    </div>
  );

  return (
    <Card
      title="AV system"
      note={moving ? "screen moving…" : down ? "screen down" : "screen up"}
    >
      <div className="mb-2 flex gap-1">
        {[
          { label: "Screen up", to: 0 },
          { label: "Screen down", to: 100 },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            disabled={moving}
            onClick={() => setScreen(b.to)}
            aria-pressed={b.to === 100 ? down : screen <= 2}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] transition-colors disabled:opacity-40 ${
              (b.to === 100 ? down : screen <= 2)
                ? "border-brass-700 bg-shell-800 text-brass-300"
                : "border-shell-800 text-shell-300 hover:text-shell-100"
            }`}
          >
            {b.label}
          </button>
        ))}
        <button
          type="button"
          onClick={avOn}
          className="rounded-lg border border-shell-800 px-2.5 py-1.5 text-[11px] text-shell-300 transition-colors hover:text-shell-100"
        >
          AV on
        </button>
      </div>

      {cfg.projectorId && (
        <Row label={`Projector${down ? "" : " — screen up"}`}>
          <Toggle
            on={Boolean(projector?.on)}
            onChange={setProjector}
            label="Projector"
            disabled={moving}
          />
        </Row>
      )}
      {cfg.projectorId && !cfg.mediaId && (
        <div className="mb-1">
          <Segmented
            value={avSt.source}
            options={av.sources.map((src) => ({ value: src, label: src }))}
            onChange={(source) => patch(av.id, { source })}
            label="Projector source"
            disabled={!projector?.on}
          />
        </div>
      )}

      <Row label="Speakers">
        <Toggle on={avSt.on} onChange={(on) => patch(av.id, { on })} label="Speakers" />
      </Row>
      <Slider
        value={avSt.volume}
        min={0}
        max={100}
        label="Speaker volume"
        disabled={!avSt.on}
        onChange={(volume) => patch(av.id, { volume })}
      />

      {/**
        * Media playback, for a rack that has a transport in it.
        *
        * A wrapping row of chips rather than a `Segmented`, because six
        * sources at "Game console" length do not fit on one line of a
        * phone — and the source is the row people actually press, so it
        * is worth the space. The title under it is the difference
        * between a remote control and a room playing something.
        */}
      {cfg.mediaId && mediaDev && media && (
        <div className="mt-1.5 border-t border-shell-800 pt-1.5">
          <Row label="Media">
            <Toggle
              on={media.on}
              onChange={(on) => patch(mediaDev.id, { on })}
              label="Media playback"
            />
          </Row>
          <div className="mb-1.5 flex flex-wrap gap-1">
            {mediaDev.sources.map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => patch(mediaDev.id, { source: src, on: true })}
                aria-pressed={media.source === src}
                className={`grow basis-[30%] rounded-lg border px-2 py-1 text-[10px] transition-colors ${
                  media.source === src
                    ? "border-brass-700 bg-shell-800 text-brass-300"
                    : "border-shell-800 text-shell-300 hover:text-shell-100"
                }`}
              >
                {src}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-shell-500">
            {media.on
              ? `Now playing — ${mediaDev.nowPlaying?.[media.source] ?? media.source}`
              : "Stopped"}
          </p>
        </div>
      )}

      {cfg.cameraId && camera && (
        <div className="mt-1.5 border-t border-shell-800 pt-1">
          <Row label="Camera">
            <span className="flex items-center gap-2">
              {camera.on && (
                <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-red-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]" />
                  Live
                </span>
              )}
              <Toggle on={camera.on} onChange={setCamera} label="Conference camera" />
            </span>
          </Row>
          <Row label="Microphone">
            <Toggle
              on={camera.volume > 0}
              onChange={(live) => patch(cfg.cameraId!, { volume: live ? 60 : 0 })}
              label="Microphone"
            />
          </Row>
        </div>
      )}

      <p className="mt-1.5 text-[10px] leading-relaxed text-shell-500">
        {moving
          ? `The screen takes ${travel} s and the control is held until it arrives.`
          : down
            ? "Screen down. The projector is the display — there is no second screen in this room."
            : "The projector cannot show an image on a stowed screen; pressing it sends the screen down first."}
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* A circuit on a door contact                                         */
/* ------------------------------------------------------------------ */

/**
 * The wardrobe: open the door and it lights, then falls back.
 *
 * Twenty seconds is a real door contact's hold — long enough to pick
 * something out, short enough that an open door does not light the room
 * all evening. Auto is on by default and the whole point; the toggle is
 * there because the one thing worse than a light that does not come on
 * is a light that will not stay off.
 *
 * Touching the dimmer by hand switches Auto off, for the same reason
 * touching a colour slider takes a fixture off circadian tuning: a hand
 * on the control is the person saying they are driving now.
 */
function Momentary() {
  const space = useSim((s) => s.space);
  const states = useSim((s) => s.states);
  const patch = useSim((s) => s.patch);
  const cfg = space?.momentary;
  const [auto, setAuto] = useState(true);
  const [open, setOpen] = useState(false);
  /** The level to come back to, captured before the door opened. */
  const restore = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fire = useCallback(() => {
    if (!cfg) return;
    const now = useSim.getState().states;
    const st = now[cfg.deviceId] as LightState | undefined;
    if (restore.current === null) restore.current = st?.on ? st.level : 0;
    patch(cfg.deviceId, { on: true, level: cfg.level }, cfg.riseMs);
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const back = restore.current ?? 0;
      patch(cfg.deviceId, back > 0 ? { on: true, level: back } : { on: false }, cfg.fallMs);
      restore.current = null;
      setOpen(false);
    }, cfg.holdMs);
  }, [cfg, patch]);

  // The hotspot in the room is the same door. Firing from either is the
  // same event, so the stage asks for it through the store rather than
  // this card owning a behaviour the room cannot reach.
  const doorEvent = useSim((s) => s.momentaryTick);
  useEffect(() => {
    if (doorEvent > 0 && auto) fire();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doorEvent]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!cfg || !space) return null;
  const st = states[cfg.deviceId] as LightState | undefined;
  const name = space.devices.find((d) => d.id === cfg.deviceId)?.name ?? cfg.deviceId;

  return (
    <Card title={name} note={open ? "door open" : auto ? "auto" : "manual"}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-shell-400">{cfg.label}</span>
        <Toggle on={auto} onChange={setAuto} label={`${cfg.label} auto`} />
      </div>
      <button
        type="button"
        disabled={!auto}
        onClick={fire}
        className="w-full rounded-lg border border-shell-800 px-2 py-1.5 text-[11px] text-shell-300 transition-colors hover:text-shell-100 disabled:opacity-40"
      >
        Simulate: door opened
      </button>
      <div className="mt-2 flex items-center justify-between text-[10px] text-shell-500">
        <span>Level</span>
        <span className="tabular-nums text-shell-300">{Math.round(st?.on ? st.level : 0)}%</span>
      </div>
      <Slider
        value={Math.round(st?.on ? st.level : 0)}
        min={0}
        max={100}
        label={`${name} level`}
        onChange={(level) => {
          setAuto(false);
          restore.current = null;
          patch(cfg.deviceId, level > 0 ? { on: true, level } : { on: false });
        }}
      />
      <p className="mt-1.5 text-[10px] leading-relaxed text-shell-500">
        {open
          ? `Door open — full for ${Math.round(cfg.holdMs / 1000)} s, then back to the scene level.`
          : auto
            ? `On the door contact: full in ${(cfg.riseMs / 1000).toFixed(1)} s, held ${Math.round(cfg.holdMs / 1000)} s, then back. Tapping it in the room does the same thing.`
            : "Manual. Moving the dimmer switched the door contact out of the way."}
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Television                                                          */
/* ------------------------------------------------------------------ */

/**
 * The one av device in a room that has no AV panel.
 *
 * Deliberately small: a bedroom television is on or off and has a
 * volume, and a demo that puts a source picker and an EQ on it is
 * selling the wrong thing. Spaces with a full `avPanel` render that
 * instead — see `AvSystem`.
 */
function Television() {
  const space = useSim((s) => s.space);
  const states = useSim((s) => s.states);
  const patch = useSim((s) => s.patch);
  const applyScene = useSim((s) => s.applyScene);
  const busy = useSim((s) => s.busy);
  if (space?.avPanel) return null;
  const tv = space?.devices.find((d) => d.kind === "av" && d.subsystem === "av" && d.id.endsWith("-tv"));
  const st = tv ? (states[tv.id] as AvState | undefined) : undefined;
  if (!tv || !st) return null;

  /**
   * Whether any preset in this room switches the thing on.
   *
   * The footnote below used to be about the bedroom, because the bedroom
   * was the only room with a television card. It is a real distinction
   * rather than copy: a set whose scenes all leave the screen off is
   * making a point about restraint, and a room with a Movie scene is
   * making the opposite one.
   *
   * It gates the source picker as well as the wording, which is why this
   * is a condition rather than two strings. A television nothing ever
   * switches on does not need Netflix offering from it, and the bedroom
   * card is exactly as it was before this room existed.
   */
  const inScenes = space?.scenes.some((sc) => sc.targets[tv.id]?.on) ?? false;
  const button = (tv as AvDevice).sceneButton;

  return (
    <Card title={tv.name} note={st.on ? st.source : "off"}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-shell-400">Screen</span>
        <Toggle on={st.on} onChange={(on) => patch(tv.id, { on })} label={tv.name} />
      </div>
      {inScenes && tv.kind === "av" && tv.sources.length > 1 && (
        <div className="mb-2">
          <Segmented
            label="Source"
            value={st.source}
            disabled={!st.on}
            options={tv.sources.map((s) => ({ value: s, label: s }))}
            onChange={(source) => patch(tv.id, { source })}
          />
        </div>
      )}
      <div className="mb-1 flex items-center justify-between text-[10px] text-shell-500">
        <span>Volume</span>
        <span className="tabular-nums text-shell-300">{st.volume}</span>
      </div>
      <Slider
        value={st.volume}
        min={0}
        max={100}
        label="Television volume"
        disabled={!st.on}
        onChange={(volume) => patch(tv.id, { volume })}
      />
      {button && (
        <button
          type="button"
          disabled={busy}
          onClick={() => applyScene(button.sceneId)}
          className="mt-2 w-full rounded-lg border border-brass-700 px-2 py-1.5 text-[11px] text-brass-300 transition-colors hover:bg-shell-800 disabled:opacity-40"
        >
          {button.label}
        </button>
      )}
      <p className="mt-1.5 text-[10px] leading-relaxed text-shell-500">
        {inScenes
          ? "The glow is drawn over the composite rather than rendered into it — there is no plate of this room with the television awake, and pretending otherwise would be the one thing on this stage that is not photometry."
          : "Off in every scene. A bedroom preset that switches a television on is a preset nobody presses twice."}
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
  /**
   * A room with its own AV card owns its speakers, and a television is
   * not a music system.
   *
   * This card would otherwise take whichever `av` device happened to be
   * declared first and offer to play a synthesised lobby pad through
   * the bedroom's TV.
   */
  const hasAvCard = Boolean(space?.avPanel);
  const states = useSim((s) => s.states);
  const patch = useSim((s) => s.patch);
  const av = space?.devices.find((d) => d.kind === "av" && !d.id.endsWith("-tv"));
  const pad = useAmbientPad();
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const st = av ? (states[av.id] as AvState | undefined) : undefined;

  useEffect(() => {
    if (playing && st) pad.setVolume(st.volume);
  }, [playing, st, pad]);

  if (!av || !st || hasAvCard) return null;

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
    Boolean(space.avPanel) ||
    Boolean(space.momentary) ||
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
      <AvSystem />
      <Television />
      <Momentary />
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
