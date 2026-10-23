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
  Scene,
  SceneStep,
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
  now as tweenNow,
  startTween,
} from "./tween";
import { evaluateRules, type RuleEvent, type RuleMemory } from "./automation";
import { interiorDaylightLux } from "./daylight";
import { paceFade, paceHold } from "./pace";
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

/**
 * The staged scene currently running, if any.
 *
 * Non-reactive like the tweens: it changes on a schedule and no component needs
 * to subscribe to the bookkeeping. What the UI *does* need — which stage, and
 * how many — is mirrored into `sequence` on the store.
 *
 * `fireAt` is real milliseconds from `tweenNow()`, not simulated minutes. A
 * demonstration must take the same time to watch with the clock paused as with
 * it running at a day a minute.
 */
let pendingSequence: {
  sceneId: string;
  steps: SceneStep[];
  /** Index of the step that fires next. */
  index: number;
  fireAt: number;
  /** The scene's fade, carried so stages ramp like the scene that owns them. */
  fadeMs: number;
} | null = null;

function cancelSequence(): void {
  pendingSequence = null;
}

/**
 * Wall-clock time the *whole* interface unlocks, from `tweenNow()`.
 *
 * Non-reactive for the same reason the tweens are: it is compared once a frame
 * and nothing subscribes to the number itself. `busy` on the store is the
 * boolean components actually watch.
 *
 * Armed only by `applyScene`. A scene is a claim about the entire room — Good
 * Night dims the lights, closes the curtains and drops the AC in sequence — so
 * a second press landing halfway through would leave the room in a state no
 * scene describes. That is the case the lock exists for.
 */
let busyUntil = 0;

/**
 * Wall-clock time each individual device unlocks, keyed by device id.
 *
 * Armed by `patch`. One fixture moving is not a claim about the room, so it
 * locks only itself. The curtain here travels for eight seconds; taking the
 * lights, the fan and the thermostat down with it for those eight seconds was
 * the difference between the interface feeling slow and feeling broken.
 */
const deviceBusyUntil = new Map<string, number>();

/** A little slack so a control does not re-enable a frame before it lands. */
const BUSY_TAIL_MS = 120;

/** Lock the whole interface. Scenes only. */
function holdInput(durationMs: number): boolean {
  if (durationMs <= 0) return false;
  busyUntil = Math.max(busyUntil, tweenNow() + durationMs + BUSY_TAIL_MS);
  return true;
}

/**
 * Is this device's movement the kind a second press should not interrupt?
 *
 * A dimmer ramp is cosmetic. Re-aiming one mid-fade just starts a new tween
 * from wherever it had got to, which is exactly what a person pressing a second
 * preset expects to happen — so locking a light during its own fade buys
 * nothing and costs the interface half a second of feeling stuck.
 *
 * A motor is a different thing. A curtain or a projection screen has a physical
 * position, and re-targeting it mid-travel is a real problem rather than a free
 * one. Those hold the lock; nothing else does.
 */
function physicallyTravels(device: Device): boolean {
  return device.kind === "shade" || device.kind === "av";
}

/** Lock one device's own controls while it travels. */
function holdDevice(deviceId: string, durationMs: number): boolean {
  if (durationMs <= 0) return false;
  const until = tweenNow() + durationMs + BUSY_TAIL_MS;
  const prev = deviceBusyUntil.get(deviceId) ?? 0;
  deviceBusyUntil.set(deviceId, Math.max(prev, until));
  return true;
}

/**
 * Drop every device lock that has expired.
 *
 * Returns the remaining ids, or null when nothing expired — so the tick can
 * skip the `set` entirely on the overwhelming majority of frames where no
 * device is moving at all.
 */
function expireDeviceLocks(now: number, published: string[]): string[] | null {
  for (const [id, until] of deviceBusyUntil) {
    if (now >= until) deviceBusyUntil.delete(id);
  }
  /**
   * Compared against what the store is actually showing, not against what
   * this function happened to delete.
   *
   * It used to return a list only when something *expired*, which was right
   * while locks could only be created by `patch` — that path publishes its own
   * list synchronously. Now a scene can start a motor travelling too, and
   * those locks are created inside the tick, so "nothing expired" is no longer
   * the same as "nothing changed". A blind set moving by a scene would not
   * have reached `busyDevices` until something unrelated expired.
   */
  const ids = [...deviceBusyUntil.keys()];
  if (ids.length === published.length && ids.every((id) => published.includes(id))) {
    return null;
  }
  return ids;
}

/**
 * Apply one map of scene targets.
 *
 * Shared by `applyScene` and by each stage of a sequence so that a staged scene
 * and an instant one behave identically — same fades, same commanded levels,
 * same colour ownership. `commanded`, `cctLocked` and `touched` are the
 * caller's own copies and are written through.
 */
function applyTargetMap(
  space: Space,
  states: Record<string, DeviceState>,
  targets: Record<string, StatePatch & { fadeMs?: number }>,
  defaultFadeMs: number,
  commanded: Record<string, number>,
  cctLocked: Record<string, boolean>,
  touched: Set<string>,
): Record<string, DeviceState> {
  const nextStates = { ...states };

  for (const [deviceId, raw] of Object.entries(targets)) {
    const device = space.devices.find((d) => d.id === deviceId);
    const current = nextStates[deviceId];
    if (!device || !current) continue;

    const { fadeMs: perDevice, ...rest } = raw as StatePatch & { fadeMs?: number };
    const patchInput = rest as StatePatch;

    const level = commandedLevelFor(device, current, patchInput);
    if (level !== undefined) commanded[deviceId] = level;

    // A stage that names a colour owns it; one that stays silent hands the
    // fixture back to circadian tuning. Only fixtures this stage mentions are
    // reassigned — one it says nothing about keeps whatever it had.
    if (device.kind === "light") {
      cctLocked[deviceId] = "cct" in patchInput;
    }

    const fade = perDevice ?? defaultFadeMs;

    /**
     * A motor driven by a scene is travelling exactly as it would under a
     * hand on the slider, and nothing was recording that.
     *
     * `holdDevice` was only ever called from `patch` — the manual path — so
     * for the whole of a scene `busyDevices` stayed empty however far the
     * blinds were actually moving. Two things fell out of that. The room could
     * not say what it was doing, which is the visible half; and a device the
     * scene had set travelling was not locked, so its own slider could be
     * grabbed mid-travel and re-aim a motor the scene was still driving.
     *
     * `holdDevice` ignores a zero duration, so a stage that asks a blind for
     * the position it is already in locks nothing — which is the same no-op
     * test the stage scheduler uses to decide whether to wait at all.
     */
    if (physicallyTravels(device)) {
      holdDevice(deviceId, patchDurationMs(device, current, patchInput, fade));
    }

    const next = applyPatchToState(device, current, patchInput, fade);
    if (next) {
      nextStates[deviceId] = next;
      touched.add(device.productId);
    }
  }

  return nextStates;
}

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
    case "fan":
      // Mid speed, so switching one on by hand does something visible rather
      // than creeping at speed 1.
      return { on: false, speed: Math.ceil(device.speeds / 2), reverse: false };
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
  /**
   * The control row the pointer is over, or null.
   *
   * Pure presentation, and it lives here for the same reason
   * `selectedDeviceId` does: the thing that needs to know is the stage, and
   * the thing that knows is a row inside the phone, with the whole page
   * between them. The plates stage reads it to light that circuit's hotspot
   * and nothing else does.
   */
  hoveredDeviceId: string | null;
  /**
   * The stage is a still image and cannot show a scene change.
   *
   * Set by the plates stage when there is no WebGL2 to composite with. The
   * room is then a correct photograph of one lighting state and nothing can
   * move it, so the scene buttons go quiet rather than looking live and
   * doing nothing — which is the difference between a device that cannot do
   * this and a demo that appears broken.
   */
  stageStatic: boolean;
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
  /**
   * The staged scene running right now, for the UI to narrate.
   *
   * `step` is the number of stages already applied, so it starts at 0 with only
   * `targets` on the room and reaches `total` on the last stage — which is also
   * when this clears.
   */
  /**
   * A scene is still playing out, so the whole interface is locked.
   *
   * Set only by `applyScene` — not by `patch`, and never by the rule engine.
   * Rules adjust fixtures constantly in the background, and letting those raise
   * this would leave the demo permanently unclickable.
   */
  busy: boolean;
  /**
   * How long the room takes to settle after a scene, and which press started
   * it. Deliberately *not* the input lock.
   *
   * They look like the same thing and are not. `busy` exists to stop a
   * half-finished control leaving the room in a state no scene describes, and
   * it is released the moment that stops being a risk — a rule firing
   * mid-fade clears it, which is correct for a lock and wrong for a progress
   * bar. Driving the bar from `busy` made it vanish at 1.4 s of a 2.5 s fade,
   * measured, because daylight harvesting patched a light underneath it.
   *
   * So this is set once per press, from `sceneDurationMs` — the real settle
   * time, the same figure the lock is sized from — and nothing clears it
   * early. `sceneRunId` changes on every press so pressing the same scene
   * twice restarts the animation rather than leaving it finished.
   */
  settleMs: number;
  sceneRunId: number;
  /**
   * Devices mid-travel, whose own controls are locked while they move.
   *
   * An array rather than a Set because Zustand compares selected slices by
   * identity: a new array is written only when the membership actually changes,
   * so a subscriber re-renders when a curtain starts or stops and at no other
   * time. It is never more than a couple of ids long.
   */
  busyDevices: string[];
  sequence: {
    sceneId: string;
    /** The stage's own label once one has run, otherwise the scene's name. */
    label: string;
    step: number;
    total: number;
  } | null;

  loadSpace: (space: Space) => void;
  resetSpace: () => void;
  /** `fadeMs` omitted means "work it out" — see `resolveFade`. */
  patch: (deviceId: string, patch: StatePatch, fadeMs?: number) => void;
  applyScene: (sceneId: string) => void;
  setClock: (minutes: number) => void;
  setRate: (rate: number) => void;
  toggleRule: (ruleId: string) => void;
  select: (deviceId: string | null) => void;
  hover: (deviceId: string | null) => void;
  setStageStatic: (isStatic: boolean) => void;
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
  hoveredDeviceId: null,
  stageStatic: false,
  touchedProductIds: [],
  commanded: {},
  cctLocked: {},
  busy: false,
  settleMs: 0,
  sceneRunId: 0,
  busyDevices: [],
  sequence: null,

  loadSpace: (space) => {
    clearTweens();
    cancelSequence();
    busyUntil = 0;
    deviceBusyUntil.clear();
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
      busy: false,
      busyDevices: [],
      sequence: null,
    });

    if (space.openingSceneId) get().applyScene(space.openingSceneId);

    // The opening scene is not a press. It fades in over a couple of seconds
    // and the presenter should be able to reach for anything the moment the
    // room appears, so the lock that `applyScene` just armed is released again.
    busyUntil = 0;
    deviceBusyUntil.clear();
    set({ busy: false, busyDevices: [] });
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
    const duration = patchDurationMs(device, current, patchInput, fadeMs);
    const next = applyPatchToState(device, current, patchInput, fadeMs);
    if (!next) return;

    // A hand on any control ends a running demonstration. Letting the remaining
    // stages fire would mean the room overriding the presenter mid-sentence —
    // and because the demonstration is over, the whole-interface lock it was
    // holding goes with it. Only the fixture that was actually touched stays
    // locked, and only for as long as it is still moving.
    cancelSequence();
    busyUntil = 0;
    const locked = physicallyTravels(device) && holdDevice(deviceId, duration);

    set((s) => ({
      states: { ...s.states, [deviceId]: next },
      // The room no longer matches the scene the moment anything is touched by
      // hand — leaving the scene highlighted would be a lie.
      activeSceneId: null,
      sequence: null,
      busy: false,
      busyDevices: locked ? [...deviceBusyUntil.keys()] : s.busyDevices,
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

    // Pressing any scene abandons a sequence already running. Half of one
    // demonstration continuing underneath another is the worst possible state.
    cancelSequence();
    // And it supersedes any motor a hand had set going, before `applyTargetMap`
    // records the ones this scene is about to start.
    deviceBusyUntil.clear();

    // Measured before anything is applied, while `states` still holds the
    // positions every fade is starting from.
    const holdMs = sceneDurationMs(space, states, scene);
    const locked = holdInput(holdMs);

    const touched = new Set(get().touchedProductIds);
    const commanded = { ...get().commanded };
    const cctLocked = { ...get().cctLocked };

    const nextStates = applyTargetMap(
      space,
      states,
      scene.targets,
      scene.fadeMs,
      commanded,
      cctLocked,
      touched,
    );

    // Stage zero is `targets`; anything in `steps` follows on the wall clock.
    let sequenceView: SimStore["sequence"] = null;
    if (scene.steps && scene.steps.length > 0) {
      const first = scene.steps[0];
      pendingSequence = {
        sceneId,
        steps: scene.steps,
        index: 0,
        /**
         * The same test on stage zero.
         *
         * This pause covers the scene's own `targets`, not a step — so when
         * those ask for nothing the room is not already doing, there is
         * nothing to wait for either. It is the case you hit pressing a staged
         * scene twice, where the whole base state is already set.
         */
        fireAt:
          tweenNow() +
          (Object.entries(scene.targets).every(([deviceId, raw]) => {
            const current = states[deviceId];
            if (!current) return true;
            const { fadeMs: _perDevice, ...rest } = raw as StatePatch & {
              fadeMs?: number;
            };
            return patchIsNoop(current, rest as StatePatch);
          })
            ? 0
            : paceHold(first.holdMs ?? 900)),
        fadeMs: scene.fadeMs,
      };
      sequenceView = {
        sceneId,
        label: scene.name,
        step: 0,
        total: scene.steps.length,
      };
    }

    /**
     * A scene named after an hour moves the clock to it.
     *
     * `lastRuleMin` jumps with it, exactly as `setClock` does: without that,
     * every schedule rule between the old time and the new one would fire at
     * once on the next tick, which is not what pressing Morning means.
     */
    const clockMin =
      scene.clockMin === undefined ? undefined : wrapMinutes(scene.clockMin);
    if (clockMin !== undefined) lastRuleMin = clockMin;

    set({
      states: nextStates,
      activeSceneId: sceneId,
      touchedProductIds: [...touched],
      commanded,
      cctLocked,
      busy: locked,
      // Not gated on `locked`: a scene of pure dimmer fades holds no input at
      // all and still takes two and a half seconds to land, which is exactly
      // the case somebody needs telling about.
      settleMs: holdMs,
      sceneRunId: get().sceneRunId + 1,
      sequence: sequenceView,
      /**
       * Whatever this scene has just set travelling.
       *
       * It used to be unconditionally empty, on the reasoning that a scene
       * supersedes whatever one device was doing on its own. The first half of
       * that is still true and is why the map is cleared before the targets
       * are applied; the second half was only true while scenes could not move
       * motors of their own, which they now can.
       */
      busyDevices: [...deviceBusyUntil.keys()],
      ...(clockMin === undefined ? {} : { clockMin }),
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
  hover: (deviceId) =>
    set((s) => (s.hoveredDeviceId === deviceId ? s : { hoveredDeviceId: deviceId })),
  setStageStatic: (isStatic) =>
    set((s) => (s.stageStatic === isStatic ? s : { stageStatic: isStatic })),

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

    /* 3. Staged scenes ----------------------------------------------- */
    // Cloned lazily — most ticks change neither, and the rule pass below has to
    // see whatever a stage just commanded rather than the pre-tick value.
    let commanded = state.commanded;
    let cctLocked = state.cctLocked;
    let sequenceUpdate: SimStore["sequence"] | undefined;
    let touchedProducts: string[] | null = null;

    // A `while`, not an `if`: one tick can span several holds when the tab has
    // been backgrounded, or under the headless harness where dt is whatever the
    // test says it is.
    while (pendingSequence && realNow >= pendingSequence.fireAt) {
      const { sceneId, steps, index, fadeMs } = pendingSequence;
      const step = steps[index];

      /**
       * Does this stage have anything to do?
       *
       * Measured *before* the patch is applied, against the room as it stands.
       * A stage commanding a state the devices are already in gets no pause
       * after it — see `patchIsNoop` — which is what stops Movie-from-Gaming
       * sitting under "Curtains close" with the curtains already shut.
       *
       * Setting the next stage's `fireAt` to the same instant means the
       * `while` above picks it up on this very tick, so an empty stage never
       * reaches the panel at all. It is skipped rather than flashed.
       */
      const empty = Object.entries(step.targets).every(([deviceId, raw]) => {
        const current = states[deviceId];
        if (!current) return true;
        const { fadeMs: _perDevice, ...rest } = raw as StatePatch & { fadeMs?: number };
        return patchIsNoop(current, rest as StatePatch);
      });

      const touched: Set<string> = new Set(touchedProducts ?? state.touchedProductIds);
      const stepCommanded = { ...commanded };
      const stepCctLocked = { ...cctLocked };

      states = applyTargetMap(
        space,
        states,
        step.targets,
        // A stage inherits the scene's fade unless a device names its own, so
        // an author only writes a duration where it differs.
        fadeMs,
        stepCommanded,
        stepCctLocked,
        touched,
      );
      changed = true;
      commanded = stepCommanded;
      cctLocked = stepCctLocked;
      touchedProducts = [...touched];

      const last = index + 1 >= steps.length;
      sequenceUpdate = last
        ? null
        : { sceneId, label: step.label, step: index + 1, total: steps.length };

      if (last) {
        pendingSequence = null;
      } else {
        pendingSequence = {
          ...pendingSequence,
          index: index + 1,
          // Measured from when this stage was due, not from now — so one late
          // frame does not stretch every hold after it. Zero when this stage
          // had nothing to do, because the pause exists to cover its travel.
          fireAt:
            pendingSequence.fireAt +
            (empty ? 0 : paceHold(steps[index + 1].holdMs ?? 900)),
        };
      }
    }

    /* 4. Derived sensors -------------------------------------------- */
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

    /* 5. Rules ------------------------------------------------------- */
    let events = state.events;
    let ruleMemory = state.ruleMemory;

    if (realNow - lastRuleAt >= RULE_INTERVAL_MS) {
      const result = evaluateRules({
        space,
        states,
        prevMin: lastRuleMin,
        nowMin: clockMin,
        enabled: state.ruleEnabled,
        memory: ruleMemory,
        // `commanded`, not `state.commanded` — a stage that fired earlier in
        // this same tick has already moved the ceiling, and daylight harvesting
        // trimming against the pre-stage value would undo it immediately.
        commanded,
        cctLocked,
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
        commanded = { ...commanded, ...result.commandedUpdates };
      }
      if (Object.keys(result.cctLockUpdates).length > 0) {
        cctLocked = { ...cctLocked, ...result.cctLockUpdates };
      }

      if (result.events.length > 0) {
        events = [...result.events.reverse(), ...events].slice(0, MAX_EVENTS);
      }
      ruleMemory = result.memory;
      lastRuleAt = realNow;
      lastRuleMin = clockMin;
    }

    /* 6. Energy ------------------------------------------------------ */
    const power = powerSnapshot(space, states, clockMin);
    if (simMinutes > 0) {
      liveTotals = accumulate(liveTotals, power, simMinutes);
    }

    const publish = realNow - lastPublishAt >= PUBLISH_INTERVAL_MS;
    if (publish) lastPublishAt = realNow;

    /* 7. Commit ------------------------------------------------------ */
    const next: Partial<SimStore> = {};
    if (changed) next.states = states;
    if (clockMin !== prevMin) next.clockMin = clockMin;
    if (events !== state.events) next.events = events;
    if (ruleMemory !== state.ruleMemory) next.ruleMemory = ruleMemory;
    if (commanded !== state.commanded) next.commanded = commanded;
    if (cctLocked !== state.cctLocked) next.cctLocked = cctLocked;
    if (touchedProducts) next.touchedProductIds = touchedProducts;
    if (state.busy && realNow >= busyUntil) next.busy = false;
    const movingDevices = expireDeviceLocks(realNow, state.busyDevices);
    if (movingDevices) next.busyDevices = movingDevices;
    if (sequenceUpdate !== undefined) next.sequence = sequenceUpdate;
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
  //
  // The two returns above are motor travel and are deliberately *not* paced:
  // see `lib/sim/pace.ts`. This one is a lighting fade, which is design, and
  // the demo plays it at pace.
  return paceFade(requested ?? 0);
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
    /**
     * Paced, like every other light fade.
     *
     * Levels and on/off ramps do not go through `resolveFade` — they have
     * their own path because a light coming on has no numeric `from` to
     * measure a distance against — so pacing them there missed them
     * entirely. Measured after that first attempt: Premium / Luxury still
     * took 3.0 s against the 0.98 s the report claimed, because the report
     * was reading the authored number through the pace and the engine was
     * not. This is the line that makes the two agree.
     */
    const fade = paceFade(fadeMs ?? 0);

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
/* How long an action takes                                            */
/* ------------------------------------------------------------------ */

/**
 * Milliseconds until a patch has finished moving.
 *
 * Derived from the same `resolveFade` the tweens use, so the lock and the
 * animation can never disagree about when something has landed.
 */
function patchDurationMs(
  device: Device,
  current: DeviceState,
  patchInput: StatePatch,
  fadeMs?: number,
): number {
  let longest = 0;
  for (const [prop, value] of Object.entries(patchInput)) {
    const from = (current as unknown as Record<string, unknown>)[prop];
    if (typeof value !== "number" || typeof from !== "number") {
      // A light switching on or off ramps over the requested fade even though
      // `on` itself is a boolean.
      if (device.kind === "light" && prop === "on" && from !== value) {
        longest = Math.max(longest, paceFade(fadeMs ?? 0));
      }
      continue;
    }
    if (from === value) continue;
    longest = Math.max(longest, resolveFade(device, prop, from, value, fadeMs));
  }
  return longest;
}

/**
 * Milliseconds until a whole scene has finished, stages and all.
 *
 * Walked ahead rather than watched: the rule engine starts fades of its own
 * every couple of hundred milliseconds, so "is anything tweening?" would leave
 * the interface locked more or less permanently. Reading the answer off the
 * scene definition keeps the lock tied to what the presenter actually pressed.
 *
 * Shade positions are projected forward through the stages, because a curtain's
 * travel time depends on how far it has to go and a later stage may be starting
 * from where an earlier one left it.
 */
/**
 * Does this patch ask for anything the device is not already doing?
 *
 * Staged scenes schedule each stage's pause from a number the author wrote,
 * and that number assumes the stage has work to do. Press Movie from Gaming,
 * where the curtains are already shut and the screen already down, and the
 * room still sat for 1.4 seconds under "Curtains close" and another 8.4 under
 * "Screen descends" — fifteen seconds of a twenty second sequence spent
 * waiting for motors that had nowhere to travel. That is what people were
 * reporting as the loader lying to them.
 *
 * Duration alone is the wrong test. "Projector on" takes no time either, and
 * it is a real change worth dwelling on. The test is whether the *values*
 * differ: a stage that commands a state the device is already in has nothing
 * to show, however long its motor would have taken.
 *
 * Numbers compare with a tolerance because shade and screen positions are
 * tweened floats and land a hair off their target.
 */
function patchIsNoop(current: DeviceState, patch: StatePatch): boolean {
  const now = current as unknown as Record<string, unknown>;
  for (const [key, want] of Object.entries(patch as Record<string, unknown>)) {
    if (want === undefined) continue;
    const have = now[key];
    if (typeof want === "number" && typeof have === "number") {
      if (Math.abs(want - have) > 0.5) return false;
    } else if (want !== have) {
      return false;
    }
  }
  return true;
}

export function sceneDurationMs(
  space: Space,
  states: Record<string, DeviceState>,
  scene: Scene,
): number {
  /**
   * What each device will be doing by the time a later stage runs.
   *
   * Every patched field is recorded, not just shade layers, because the
   * no-op test below needs to know what stage three will find — and stage
   * three finds whatever stages one and two left behind, not what the room
   * looked like when the button was pressed.
   */
  const projected = new Map<string, Record<string, unknown>>();

  const stage = (
    targets: Record<string, StatePatch & { fadeMs?: number }>,
  ): { longest: number; noop: boolean } => {
    let longest = 0;
    let noop = true;
    for (const [deviceId, raw] of Object.entries(targets)) {
      const device = space.devices.find((d) => d.id === deviceId);
      const current = states[deviceId];
      if (!device || !current) continue;

      const { fadeMs: perDevice, ...rest } = raw as StatePatch & { fadeMs?: number };
      const base = {
        ...(current as object),
        ...(projected.get(deviceId) ?? {}),
      } as unknown as DeviceState;

      if (!patchIsNoop(base, rest as StatePatch)) noop = false;

      longest = Math.max(
        longest,
        patchDurationMs(device, base, rest as StatePatch, perDevice ?? scene.fadeMs),
      );

      const next = { ...(projected.get(deviceId) ?? {}) };
      for (const [k, v] of Object.entries(rest as Record<string, unknown>)) {
        if (v !== undefined) next[k] = v;
      }
      projected.set(deviceId, next);
    }
    return { longest, noop };
  };

  const first = stage(scene.targets);
  let total = first.longest;
  let offset = 0;
  let previousWasNoop = first.noop;
  for (const step of scene.steps ?? []) {
    // A stage that changes nothing is not waited for — see `patchIsNoop`. The
    // hold belongs to the stage before it, so it is that one's emptiness that
    // decides whether this pause happens at all.
    offset += previousWasNoop ? 0 : paceHold(step.holdMs ?? 900);
    const s = stage(step.targets);
    total = Math.max(total, offset + s.longest);
    previousWasNoop = s.noop;
  }
  return total;
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
