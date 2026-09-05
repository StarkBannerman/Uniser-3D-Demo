"use client";

/**
 * The simulation store.
 *
 * One `tick` drives everything: fades advance, the clock moves, derived sensors
 * recompute, rules fire, energy integrates. Components subscribe to individual
 * device states, and `tick` only replaces the state objects that actually
 * changed — so a room with thirty devices and one fading fixture re-renders one
 * control, not the whole stage.
 */

import { create } from "zustand";
import type {
  AirDevice,
  AvDevice,
  ClimateDevice,
  ClimateState,
  Device,
  DeviceState,
  LightDevice,
  LightState,
  SensorDevice,
  SensorState,
  SolarDevice,
  Space,
  StatePatch,
} from "./types";
import {
  clamp,
  estimateLux,
} from "./photometry";
import {
  MINUTES_PER_DAY,
  outdoorTemperature,
  solarGenerationW,
  wrapMinutes,
} from "./clock";
import {
  advanceTweens,
  cancelTween,
  clearTweens,
  easing,
  startTween,
} from "./tween";
import { evaluateRules, type RuleEvent, type RuleMemory } from "./automation";
import { interiorDaylightLux } from "./daylight";
import { commandedLevelFor } from "./intent";
import {
  accumulate,
  powerSnapshot,
  zeroTotals,
  type EnergyTotals,
  type PowerSnapshot,
} from "./energy";

/* ------------------------------------------------------------------ */
/* Tuning                                                              */
/* ------------------------------------------------------------------ */

/** Rule evaluation cadence, real ms. Fast enough to look responsive. */
const RULE_INTERVAL_MS = 220;
/** Derived sensor cadence, real ms. */
const SENSOR_INTERVAL_MS = 100;
/** How often the energy panel's numbers are published. */
const PUBLISH_INTERVAL_MS = 250;
/** Default fade for a manual on/off press. */
export const TOGGLE_FADE_MS = 700;
/** Thermal time constant of a room, simulated minutes. */
const THERMAL_TAU_MIN = 25;
const MAX_EVENTS = 40;

/* ------------------------------------------------------------------ */
/* Non-reactive scratch                                                */
/* ------------------------------------------------------------------ */

/**
 * Devices mid-fade-to-off, mapped to the dim setting to restore once they land.
 *
 * A real dimmer remembers where it was: switch a fixture off at 60% and back on,
 * and it returns to 60%. Fading `level` to zero would forget that, so the
 * setting is parked here and put back the moment the fade completes.
 */
const pendingOff = new Map<string, number>();

let lastRuleAt = 0;
let lastSensorAt = 0;
let lastPublishAt = 0;
let lastRuleMin = 0;
/**
 * Simulated minutes banked since the last sensor pass. Derived sensors run at
 * 10Hz while `tick` runs at 60, so they have to be handed the time that elapsed
 * across all the frames they skipped — otherwise room temperature and air
 * quality integrate at a sixth of the correct rate and never reach setpoint.
 */
let sensorSimMinutes = 0;
/** Energy integrates every frame; only the published copy is reactive. */
let liveTotals: EnergyTotals = { ...zeroTotals };

/* ------------------------------------------------------------------ */
/* Initial state                                                       */
/* ------------------------------------------------------------------ */

function initialState(device: Device): DeviceState {
  switch (device.kind) {
    case "light":
      return {
        on: false,
        level: 0,
        cct: device.tunable
          ? clamp(3000, device.tunable.minK, device.tunable.maxK)
          : 3000,
        hue: 0,
        sat: 0,
      };
    case "shade":
      return { sheer: 0, blackout: 0 };
    case "climate":
      return { on: false, setpointC: 24, mode: "cool", fan: 0, currentC: 28 };
    case "av":
      return { on: false, source: device.sources[0] ?? "Off", volume: 20, screen: 0 };
    case "lock":
      return { locked: true, doorbell: false };
    case "sensor":
      return { value: device.metric === "occupancy" ? 1 : 0 };
    case "solar":
      return { generationW: 0 };
    case "air":
      return { on: false, speed: 1 };
  }
}

function buildStates(space: Space): Record<string, DeviceState> {
  const states: Record<string, DeviceState> = {};
  for (const device of space.devices) {
    states[device.id] = initialState(device);
  }
  for (const [deviceId, patch] of Object.entries(space.defaults)) {
    const current = states[deviceId];
    if (!current) continue;
    states[deviceId] = { ...current, ...patch } as DeviceState;
  }
  return states;
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export interface SimStore {
  space: Space | null;
  states: Record<string, DeviceState>;
  clockMin: number;
  /** Simulated minutes per real second. 0 = paused. */
  rate: number;
  activeSceneId: string | null;
  ruleEnabled: Record<string, boolean>;
  ruleMemory: RuleMemory;
  events: RuleEvent[];
  totals: EnergyTotals;
  power: PowerSnapshot | null;
  selectedDeviceId: string | null;
  /** Products the presenter has actually shown. Feeds the spec sheet. */
  touchedProductIds: string[];
  /**
   * Dim level each fixture was last asked for by a scene or by hand. Rules read
   * this as a ceiling but never write it — see `EvaluateInput.commanded`.
   */
  commanded: Record<string, number>;
  /**
   * Fixtures whose colour the current scene, or the presenter, chose explicitly.
   * Circadian tuning skips these — see `EvaluateInput.cctLocked`.
   */
  cctLocked: Record<string, boolean>;

  loadSpace: (space: Space) => void;
  resetSpace: () => void;
  /** `fadeMs` omitted means "work it out" — see `resolveFade`. */
  patch: (deviceId: string, patch: StatePatch, fadeMs?: number) => void;
  applyScene: (sceneId: string) => void;
  setClock: (minutes: number) => void;
  setRate: (rate: number) => void;
  toggleRule: (ruleId: string) => void;
  select: (deviceId: string | null) => void;
  tick: (dtRealMs: number) => void;
}

export const useSim = create<SimStore>((set, get) => ({
  space: null,
  states: {},
  clockMin: 19 * 60,
  rate: 0,
  activeSceneId: null,
  ruleEnabled: {},
  ruleMemory: {},
  events: [],
  totals: { ...zeroTotals },
  power: null,
  selectedDeviceId: null,
  touchedProductIds: [],
  commanded: {},
  cctLocked: {},

  loadSpace: (space) => {
    clearTweens();
    pendingOff.clear();
    liveTotals = { ...zeroTotals };
    lastRuleAt = 0;
    lastSensorAt = 0;
    lastPublishAt = 0;

    const ruleEnabled: Record<string, boolean> = {};
    for (const rule of space.rules) ruleEnabled[rule.id] = rule.enabledByDefault;

    const clockMin = space.openingClockMin ?? 19 * 60;
    lastRuleMin = clockMin;

    const states = buildStates(space);
    const commanded: Record<string, number> = {};
    for (const device of space.devices) {
      if (device.kind !== "light") continue;
      const s = states[device.id] as LightState;
      commanded[device.id] = s.on ? s.level : 0;
    }

    set({
      space,
      states,
      clockMin,
      rate: 0,
      activeSceneId: null,
      ruleEnabled,
      ruleMemory: {},
      events: [],
      totals: { ...zeroTotals },
      power: null,
      selectedDeviceId: null,
      touchedProductIds: [],
      commanded,
      cctLocked: {},
    });

    if (space.openingSceneId) get().applyScene(space.openingSceneId);
  },

  resetSpace: () => {
    const space = get().space;
    if (space) get().loadSpace(space);
  },

  patch: (deviceId, patchInput, fadeMs) => {
    const { space, states } = get();
    const device = space?.devices.find((d) => d.id === deviceId);
    const current = states[deviceId];
    if (!device || !current) return;

    const commandedLevel = commandedLevelFor(device, current, patchInput);
    // Touching a colour slider by hand takes that fixture off circadian tuning,
    // or the curve would quietly undo the adjustment a few seconds later.
    const locksCct = device.kind === "light" && "cct" in patchInput;
    const next = applyPatchToState(device, current, patchInput, fadeMs);
    if (!next) return;

    set((s) => ({
      states: { ...s.states, [deviceId]: next },
      // The room no longer matches the scene the moment anything is touched by
      // hand — leaving the scene highlighted would be a lie.
      activeSceneId: null,
      touchedProductIds: s.touchedProductIds.includes(device.productId)
        ? s.touchedProductIds
        : [...s.touchedProductIds, device.productId],
      commanded:
        commandedLevel === undefined
          ? s.commanded
          : { ...s.commanded, [deviceId]: commandedLevel },
      cctLocked: locksCct
        ? { ...s.cctLocked, [deviceId]: true }
        : s.cctLocked,
    }));
  },

  applyScene: (sceneId) => {
    const { space, states } = get();
    const scene = space?.scenes.find((sc) => sc.id === sceneId);
    if (!space || !scene) return;

    const nextStates = { ...states };
    const touched = new Set(get().touchedProductIds);
    const commanded = { ...get().commanded };
    const cctLocked = { ...get().cctLocked };

    for (const [deviceId, raw] of Object.entries(scene.targets)) {
      const device = space.devices.find((d) => d.id === deviceId);
      const current = nextStates[deviceId];
      if (!device || !current) continue;

      const { fadeMs: perDevice, ...rest } = raw as StatePatch & { fadeMs?: number };
      const patchInput = rest as StatePatch;

      const level = commandedLevelFor(device, current, patchInput);
      if (level !== undefined) commanded[deviceId] = level;

      // A scene that names a colour owns it; a scene that stays silent hands
      // the fixture back to circadian tuning. Only fixtures this scene mentions
      // are reassigned — one it says nothing about keeps whatever it had.
      if (device.kind === "light") {
        cctLocked[deviceId] = "cct" in patchInput;
      }

      const next = applyPatchToState(
        device,
        current,
        patchInput,
        perDevice ?? scene.fadeMs,
      );
      if (next) {
        nextStates[deviceId] = next;
        touched.add(device.productId);
      }
    }

    set({
      states: nextStates,
      activeSceneId: sceneId,
      touchedProductIds: [...touched],
      commanded,
      cctLocked,
    });
  },

  setClock: (minutes) => {
    const m = wrapMinutes(minutes);
    // Scrubbing by hand should not make every schedule rule between here and
    // there fire at once, so the rule engine's reference point jumps too.
    lastRuleMin = m;
    set({ clockMin: m });
  },

  setRate: (rate) => set({ rate }),

  toggleRule: (ruleId) =>
    set((s) => ({
      ruleEnabled: { ...s.ruleEnabled, [ruleId]: !s.ruleEnabled[ruleId] },
      // Clear the rule's scratch so re-enabling starts clean rather than acting
      // on where the space was several simulated hours ago.
      ruleMemory: { ...s.ruleMemory, [ruleId]: {} },
    })),

  select: (deviceId) => set({ selectedDeviceId: deviceId }),

  tick: (dtRealMs) => {
    const state = get();
    const space = state.space;
    if (!space) return;

    const realNow =
      typeof performance !== "undefined" ? performance.now() : Date.now();

    /* 1. Clock ------------------------------------------------------- */
    const simMinutes = state.rate * (dtRealMs / 1000);
    const prevMin = state.clockMin;
    const clockMin = simMinutes !== 0 ? wrapMinutes(prevMin + simMinutes) : prevMin;

    /* 2. Fades ------------------------------------------------------- */
    let states = state.states;
    let changed = false;

    const frame = advanceTweens(realNow);
    if (frame.values.size > 0) {
      states = { ...states };
      changed = true;
      for (const [deviceId, props] of frame.values) {
        const current = states[deviceId];
        if (current) states[deviceId] = { ...current, ...props } as DeviceState;
      }
    }

    // Fixtures that have finished fading out now actually switch off, and get
    // their remembered dim setting back.
    if (frame.completed.length > 0) {
      for (const deviceId of frame.completed) {
        const restore = pendingOff.get(deviceId);
        if (restore === undefined) continue;
        pendingOff.delete(deviceId);
        const current = states[deviceId] as LightState | undefined;
        if (!current) continue;
        if (!changed) {
          states = { ...states };
          changed = true;
        }
        states[deviceId] = { ...current, on: false, level: restore };
      }
    }

    /* 3. Derived sensors -------------------------------------------- */
    sensorSimMinutes += simMinutes;
    if (realNow - lastSensorAt >= SENSOR_INTERVAL_MS) {
      const derived = deriveSensors(space, states, clockMin, sensorSimMinutes);
      if (derived) {
        states = changed ? states : { ...states };
        changed = true;
        Object.assign(states, derived);
      }
      sensorSimMinutes = 0;
      lastSensorAt = realNow;
    }

    /* 4. Rules ------------------------------------------------------- */
    let events = state.events;
    let ruleMemory = state.ruleMemory;
    // Cloned lazily — most ticks change neither.
    let nextCommanded: Record<string, number> | null = null;
    let nextCctLocked: Record<string, boolean> | null = null;

    if (realNow - lastRuleAt >= RULE_INTERVAL_MS) {
      const result = evaluateRules({
        space,
        states,
        prevMin: lastRuleMin,
        nowMin: clockMin,
        enabled: state.ruleEnabled,
        memory: ruleMemory,
        commanded: state.commanded,
        cctLocked: state.cctLocked,
        daylightLux: interiorDaylightLux(space, states, clockMin),
      });

      if (result.effects.length > 0) {
        states = changed ? states : { ...states };
        changed = true;

        for (const effect of result.effects) {
          const device = space.devices.find((d) => d.id === effect.deviceId);
          const current = states[effect.deviceId];
          if (!device || !current) continue;

          const { fadeMs, ...rest } = effect.patch;
          const next = applyPatchToState(
            device,
            current,
            rest as StatePatch,
            fadeMs,
          );
          if (next) states[effect.deviceId] = next;
        }
      }

      /**
       * Commanded-level and colour-ownership changes are decided inside
       * `evaluateRules`, not here, because a regulating rule in the same pass
       * has to see what an intent rule just changed. Working it out again in
       * this loop would be a second implementation of the same decision, one
       * pass too late.
       */
      if (Object.keys(result.commandedUpdates).length > 0) {
        nextCommanded = { ...state.commanded, ...result.commandedUpdates };
      }
      if (Object.keys(result.cctLockUpdates).length > 0) {
        nextCctLocked = { ...state.cctLocked, ...result.cctLockUpdates };
      }

      if (result.events.length > 0) {
        events = [...result.events.reverse(), ...events].slice(0, MAX_EVENTS);
      }
      ruleMemory = result.memory;
      lastRuleAt = realNow;
      lastRuleMin = clockMin;
    }

    /* 5. Energy ------------------------------------------------------ */
    const power = powerSnapshot(space, states, clockMin);
    if (simMinutes > 0) {
      liveTotals = accumulate(liveTotals, power, simMinutes);
    }

    const publish = realNow - lastPublishAt >= PUBLISH_INTERVAL_MS;
    if (publish) lastPublishAt = realNow;

    /* 6. Commit ------------------------------------------------------ */
    const next: Partial<SimStore> = {};
    if (changed) next.states = states;
    if (clockMin !== prevMin) next.clockMin = clockMin;
    if (events !== state.events) next.events = events;
    if (ruleMemory !== state.ruleMemory) next.ruleMemory = ruleMemory;
    if (nextCommanded) next.commanded = nextCommanded;
    if (nextCctLocked) next.cctLocked = nextCctLocked;
    if (publish) {
      next.power = power;
      next.totals = { ...liveTotals };
    }
    if (Object.keys(next).length > 0) set(next);
  },
}));

/* ------------------------------------------------------------------ */
/* Patch application                                                   */
/* ------------------------------------------------------------------ */

/**
 * How long a change should take.
 *
 * Curtain tracks and projector screens ignore whatever fade the caller asked
 * for, because travel time is a property of the motor, not of the scene. A
 * scene cannot make a nine-second curtain close in two — and letting an
 * authoring mistake claim otherwise is how a demo gets caught out by a client
 * who owns motorized curtains already. Travel does scale with distance: a
 * curtain asked to close the last 20% takes a fifth of the time.
 */
function resolveFade(
  device: Device,
  prop: string,
  from: number,
  to: number,
  requested?: number,
): number {
  const distance = Math.abs(to - from) / 100;

  if (device.kind === "shade") {
    return device.travelMs * distance;
  }
  if (device.kind === "av" && prop === "screen") {
    return ((device as AvDevice).screenTravelMs ?? 6000) * distance;
  }
  // Everything else moves instantly unless asked otherwise — a slider drag is
  // its own animation, and adding a fade there just feels laggy.
  return requested ?? 0;
}

function easingFor(device: Device, prop: string) {
  if (device.kind === "shade" || (device.kind === "av" && prop === "screen")) {
    // Motors load up and ease off at both ends.
    return easing.inOutCubic;
  }
  return easing.inOutSine;
}

/**
 * Merge a patch into a device's state, starting fades for numeric props.
 *
 * Returns the new state object, or null if nothing changed — the caller relies
 * on that to avoid pointless re-renders.
 */
function applyPatchToState(
  device: Device,
  current: DeviceState,
  patchInput: StatePatch,
  fadeMs?: number,
): DeviceState | null {
  const next: Record<string, number | boolean | string> = { ...current };
  let touched = false;

  // Lights get special handling so that switching on ramps up from dark and
  // switching off ramps down before the driver cuts.
  if (device.kind === "light") {
    const light = current as LightState;
    const wantsOn = "on" in patchInput ? Boolean(patchInput.on) : light.on;
    const wantsLevel =
      "level" in patchInput ? Number(patchInput.level) : light.level;
    const fade = fadeMs ?? 0;

    if (!light.on && wantsOn) {
      next.on = true;
      next.level = wantsLevel;
      touched = true;
      pendingOff.delete(device.id);
      if (fade > 0) {
        startTween(device.id, "level", 0, wantsLevel, fade, easing.inOutSine);
        next.level = 0;
      } else {
        cancelTween(device.id, "level");
      }
    } else if (light.on && !wantsOn) {
      touched = true;
      if (fade > 0) {
        startTween(device.id, "level", light.level, 0, fade, easing.inOutSine);
        pendingOff.set(device.id, wantsLevel);
        next.on = true;
      } else {
        cancelTween(device.id, "level");
        next.on = false;
        next.level = wantsLevel;
      }
    } else if (wantsLevel !== light.level) {
      touched = true;
      pendingOff.delete(device.id);
      if (fade > 0) {
        startTween(device.id, "level", light.level, wantsLevel, fade, easing.inOutSine);
      } else {
        cancelTween(device.id, "level");
        next.level = wantsLevel;
      }
    }

    // Colour properties tween independently of brightness.
    for (const prop of ["cct", "hue", "sat"] as const) {
      if (!(prop in patchInput)) continue;
      const from = light[prop];
      const to = Number(patchInput[prop]);
      if (to === from) continue;
      touched = true;
      if (fade > 0) {
        startTween(device.id, prop, from, to, fade, easing.inOutSine);
      } else {
        cancelTween(device.id, prop);
        next[prop] = to;
      }
    }

    return touched ? (next as unknown as DeviceState) : null;
  }

  for (const [prop, value] of Object.entries(patchInput)) {
    const from = (current as unknown as Record<string, unknown>)[prop];
    if (from === value) continue;
    touched = true;

    if (typeof value === "number" && typeof from === "number") {
      const fade = resolveFade(device, prop, from, value, fadeMs);
      if (fade > 0) {
        startTween(device.id, prop, from, value, fade, easingFor(device, prop));
        continue; // The tween owns this property until it lands.
      }
      cancelTween(device.id, prop);
    }
    next[prop] = value;
  }

  return touched ? (next as unknown as DeviceState) : null;
}

/* ------------------------------------------------------------------ */
/* Derived sensors                                                     */
/* ------------------------------------------------------------------ */

/**
 * Sensors the engine works out for itself: lux from the fixtures plus whatever
 * daylight gets past the shades, room temperature drifting toward the setpoint,
 * solar generation from the sun's position, particulates responding to the
 * purifier. Occupancy is deliberately not in here — that one stays in the
 * presenter's hands, because tripping it by hand is how you show cause and
 * effect.
 */
function deriveSensors(
  space: Space,
  states: Record<string, DeviceState>,
  clockMin: number,
  simMinutes: number,
): Record<string, DeviceState> | null {
  const out: Record<string, DeviceState> = {};
  let touched = false;

  const env = space.environment;
  const interiorDaylight = interiorDaylightLux(space, states, clockMin);

  const lights = space.devices.filter((d): d is LightDevice => d.kind === "light");
  const totalArea = space.zones.reduce((a, z) => a + z.areaM2, 0) || 1;

  const artificialLux = estimateLux(
    lights.map((l) => {
      const s = states[l.id] as LightState;
      return {
        lumensEach: l.lumensEach,
        fixtures: l.fixtures,
        on: s?.on ?? false,
        level: s?.level ?? 0,
      };
    }),
    totalArea,
  );

  const outdoorC = outdoorTemperature(clockMin, env);

  for (const device of space.devices) {
    if (device.kind === "solar") {
      const solar = device as SolarDevice;
      const current = states[device.id] as { generationW: number };
      const generationW = solarGenerationW(clockMin, env, solar.kwp);
      if (Math.abs(generationW - current.generationW) > 1) {
        out[device.id] = { generationW };
        touched = true;
      }
      continue;
    }

    if (device.kind !== "sensor") continue;
    const sensor = device as SensorDevice;
    if (!sensor.derived) continue;

    const current = states[device.id] as SensorState;
    let value = current.value;

    switch (sensor.metric) {
      case "lux":
        value = artificialLux + interiorDaylight;
        break;
      case "temperature": {
        const ac = space.devices.find((d): d is ClimateDevice => d.kind === "climate");
        const acState = ac ? (states[ac.id] as ClimateState | undefined) : undefined;
        const target = acState?.on ? acState.setpointC : outdoorC;
        // Exponential approach — a room does not jump to its setpoint.
        const k = simMinutes > 0 ? 1 - Math.exp(-simMinutes / THERMAL_TAU_MIN) : 0;
        value = current.value + (target - current.value) * k;
        break;
      }
      case "pm25": {
        const purifier = space.devices.find(
          (d): d is AirDevice => d.kind === "air" && Boolean(d.hasSpeed),
        );
        const pState = purifier
          ? (states[purifier.id] as { on: boolean; speed: number } | undefined)
          : undefined;
        // Mumbai ambient sits well above the WHO guideline; the purifier pulls
        // it down toward single figures and it creeps back up when off.
        const target = pState?.on ? 6 : 62;
        const tau = pState?.on ? 12 : 90;
        const k = simMinutes > 0 ? 1 - Math.exp(-simMinutes / tau) : 0;
        value = current.value + (target - current.value) * k;
        break;
      }
      case "humidity":
      case "co2":
      case "occupancy":
        break;
    }

    if (sensor.min !== undefined || sensor.max !== undefined) {
      value = clamp(value, sensor.min ?? -Infinity, sensor.max ?? Infinity);
    }

    // Only publish a meaningful change, or the panels flicker.
    const epsilon = sensor.metric === "lux" ? 1.5 : 0.05;
    if (Math.abs(value - current.value) > epsilon) {
      out[device.id] = { value };
      touched = true;
    }
  }

  return touched ? out : null;
}

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */

export function useDeviceState<T extends DeviceState>(deviceId: string): T | undefined {
  return useSim((s) => s.states[deviceId] as T | undefined);
}

export function useSpace(): Space | null {
  return useSim((s) => s.space);
}

/** Total illuminance in the space, in lux — drives how lit the room looks. */
export function useRoomLux(): number {
  return useSim((s) => {
    const space = s.space;
    if (!space) return 0;
    const sensor = space.devices.find(
      (d) => d.kind === "sensor" && d.metric === "lux" && d.derived,
    );
    if (sensor) return (s.states[sensor.id] as SensorState | undefined)?.value ?? 0;
    return 0;
  });
}

export { MINUTES_PER_DAY };
