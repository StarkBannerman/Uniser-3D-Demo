/**
 * The automation rule engine.
 *
 * Rules are data, and each one can be switched off from the UI. That toggle is
 * the point: the strongest moment in a lighting-automation pitch is turning
 * daylight harvesting *off*, watching the perimeter fixtures go back to full
 * output against a bright window, and turning it back on. A demo that only ever
 * shows the good state proves nothing.
 */

import type {
  DeviceState,
  LightDevice,
  LightState,
  Rule,
  SensorState,
  Space,
  StatePatch,
} from "./types";
import { clamp, lerp } from "./photometry";
import { crossedTime, resolveScheduleTime, MINUTES_PER_DAY } from "./clock";
import { commandedLevelFor } from "./intent";

export interface RuleScratch {
  /** Occupancy: when the space went empty, in simulated minutes. */
  vacantSinceMin?: number;
  /** Occupancy: set once the vacancy action has run, cleared on re-occupancy. */
  vacantFired?: boolean;
  /**
   * Circadian: last CCT written, per device, to avoid re-issuing tiny changes.
   *
   * Per device rather than per rule. A single rule-wide value looks equivalent
   * until a scene takes one fixture's colour and hands it back: the rule had
   * already recorded the curve's value for fixtures it skipped, so on release
   * it saw no change worth writing and left the fixture on the scene's colour
   * indefinitely.
   */
  lastCct?: Record<string, number>;
  /** Daylight: last trim fraction narrated, so the feed is not spammed. */
  lastTrim?: number;
  /**
   * Daylight: the level this rule last *issued* per device.
   *
   * Compared against instead of the fixture's instantaneous level, because a
   * fade in flight is always some distance from its target — so comparing
   * against live level made the rule re-issue every 220ms, restarting its own
   * fade each time and crawling to the target instead of gliding there.
   */
  lastLevels?: Record<string, number>;
}

export type RuleMemory = Record<string, RuleScratch>;

export interface RuleEffect {
  ruleId: string;
  deviceId: string;
  patch: StatePatch & { fadeMs?: number };
  /**
   * True for rules that express intent (occupancy, schedule) and false for
   * continuous loops (daylight harvesting, circadian tuning).
   *
   * The store uses this to decide whether an effect may move a fixture's
   * commanded ceiling. Set here, where the rule is in hand, rather than
   * re-derived from `ruleId` downstream.
   */
  intent: boolean;
}

export interface RuleEvent {
  ruleId: string;
  ruleName: string;
  /** Client-facing, past tense — this goes straight into the activity feed. */
  message: string;
  atMin: number;
}

export interface EvaluateInput {
  space: Space;
  states: Record<string, DeviceState>;
  /** Clock position at the previous evaluation. */
  prevMin: number;
  nowMin: number;
  enabled: Record<string, boolean>;
  memory: RuleMemory;
  /**
   * The dim level each fixture was last *asked* for, by a scene or by hand —
   * never by a rule. Daylight harvesting treats this as a ceiling it may trim
   * below but never exceed, which is how a real daylight-linked dimming loop
   * behaves: the sensor removes light it does not need, it does not decide how
   * much light the room wants.
   *
   * Without this ceiling the loop would see a dark room during Movie Night,
   * conclude it was 292 lux short of target, and helpfully raise the house
   * lights in the middle of the film.
   */
  commanded: Record<string, number>;
  /**
   * Fixtures whose colour temperature the current scene set explicitly, or the
   * presenter set by hand. Circadian tuning leaves these alone.
   *
   * Scene beats tuning, which is how real systems are commissioned: Movie Night
   * asks for 2300K because someone chose 2300K for watching a film, and a
   * circadian curve that overrode it to 3067K because the wall clock says 7pm
   * would be quietly destroying the one scene the client remembers. Applying a
   * scene that says nothing about colour hands the fixture back to the curve.
   */
  cctLocked: Record<string, boolean>;
  /**
   * Interior illuminance from daylight alone, excluding every luminaire — see
   * `interiorDaylightLux`. Daylight harvesting trims against this rather than
   * against the lux sensor, which would include the fixtures' own output.
   */
  daylightLux: number;
}

export interface EvaluateResult {
  effects: RuleEffect[];
  events: RuleEvent[];
  memory: RuleMemory;
  /**
   * Commanded-level changes made by intent rules this pass, for the store to
   * merge. Computed here rather than in the store because regulating rules in
   * the same pass have to see them — see the two-pass note on `evaluateRules`.
   */
  commandedUpdates: Record<string, number>;
  /** Colour-ownership changes made by intent rules this pass. */
  cctLockUpdates: Record<string, boolean>;
}

/** Interpolate a circadian curve, wrapping across midnight. */
export function cctAt(curve: { min: number; cct: number }[], minutes: number): number {
  if (curve.length === 0) return 4000;
  if (curve.length === 1) return curve[0].cct;

  const points = [...curve].sort((a, b) => a.min - b.min);
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

  if (m <= points[0].min || m >= points[points.length - 1].min) {
    // Wrap segment: last point of the day through to the first of the next.
    const a = points[points.length - 1];
    const b = points[0];
    const span = MINUTES_PER_DAY - a.min + b.min;
    if (span <= 0) return b.cct;
    const travelled = m >= a.min ? m - a.min : MINUTES_PER_DAY - a.min + m;
    return lerp(a.cct, b.cct, travelled / span);
  }

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (m >= a.min && m <= b.min) {
      const span = b.min - a.min;
      return span <= 0 ? b.cct : lerp(a.cct, b.cct, (m - a.min) / span);
    }
  }
  return points[points.length - 1].cct;
}

function isLight(space: Space, id: string): LightDevice | null {
  const d = space.devices.find((x) => x.id === id);
  return d && d.kind === "light" ? d : null;
}

/**
 * Evaluate every enabled rule for this tick.
 *
 * Rules run in **two passes**, and the ordering is load-bearing rather than
 * tidiness. Intent rules (occupancy, schedule) go first and may change what a
 * fixture is commanded to hold; regulating rules (daylight, circadian) go
 * second and operate inside that intent.
 *
 * Running them in config order instead produced a genuinely confusing bug: the
 * occupancy rule would fire its vacancy shutdown, and daylight harvesting —
 * still reading the pre-shutdown commanded level from the same input snapshot —
 * would re-issue that level, cancel the fade-to-off mid-flight, and leave the
 * lights up in an empty room. The vacancy event appeared in the activity feed
 * while the room stayed lit, which is the worst possible failure for a demo
 * whose entire argument is "watch it shut itself down".
 */
export function evaluateRules(input: EvaluateInput): EvaluateResult {
  const {
    space,
    states,
    prevMin,
    nowMin,
    enabled,
    memory,
    commanded,
    cctLocked,
    daylightLux,
  } = input;

  const effects: RuleEffect[] = [];
  const events: RuleEvent[] = [];
  const nextMemory: RuleMemory = { ...memory };

  const commandedUpdates: Record<string, number> = {};
  const cctLockUpdates: Record<string, boolean> = {};
  // Regulating rules must see what intent rules decided this same pass.
  const workingCommanded: Record<string, number> = { ...commanded };

  const active = space.rules.filter((r) => enabled[r.id]);
  const ordered = [
    ...active.filter(expressesIntent),
    ...active.filter((r) => !expressesIntent(r)),
  ];

  for (const rule of ordered) {
    const scratch: RuleScratch = { ...(nextMemory[rule.id] ?? {}) };

    switch (rule.kind) {
      case "occupancy": {
        const sensor = states[rule.sensorId] as SensorState | undefined;
        if (!sensor) break;
        const occupied = sensor.value > 0.5;

        if (occupied) {
          if (scratch.vacantFired) {
            pushTargets(effects, rule, rule.onOccupied);
            events.push(event(rule, "Occupancy detected — lights restored", nowMin));
          }
          scratch.vacantSinceMin = undefined;
          scratch.vacantFired = false;
        } else {
          if (scratch.vacantSinceMin === undefined) {
            scratch.vacantSinceMin = nowMin;
          } else if (!scratch.vacantFired) {
            const elapsed = elapsedMinutes(scratch.vacantSinceMin, nowMin);
            if (elapsed >= rule.holdMin) {
              pushTargets(effects, rule, rule.onVacant);
              scratch.vacantFired = true;
              events.push(
                event(rule, `Vacant ${rule.holdMin} min — lights off`, nowMin),
              );
            }
          }
        }
        break;
      }

      case "daylight": {
        /**
         * Feed-forward trim, not closed-loop control.
         *
         * `trim` is the fraction of the design illuminance that daylight is
         * already supplying, so each fixture is asked for
         * `commanded x (1 - trim)`. Three properties fall out of that, and all
         * three matter:
         *
         *  - no daylight   -> trim 0 -> the fixture sits exactly where the
         *    scene put it, so the rule is inert at night rather than fighting
         *    Movie Night for control of the room
         *  - full daylight -> trim 1 -> the fixture goes to `minLevel`
         *  - monotonic in the sun's position, so scrubbing the clock produces a
         *    smooth legible ramp instead of a loop visibly settling
         *
         * The rule deliberately does not read the lux sensor. That sensor sees
         * the fixtures' own output, so closing the loop on it makes them chase
         * themselves — and with no daylight to work with it will drive a dark
         * room to full brightness trying to reach its setpoint, which is the
         * exact opposite of harvesting.
         */
        const trim = clamp(daylightLux / rule.targetLux, 0, 1);
        const lastIssued: Record<string, number> = { ...(scratch.lastLevels ?? {}) };
        let moved = false;

        for (const deviceId of rule.deviceIds) {
          const light = isLight(space, deviceId);
          const state = states[deviceId] as LightState | undefined;
          if (!light || !state) continue;

          // The commanded level - what a scene or the presenter last asked for
          // - is the reference the trim applies to. A fixture nobody has asked
          // for light from is left alone entirely, and forgetting what we
          // issued means the trim re-asserts cleanly next time it is commanded.
          const ceiling = workingCommanded[deviceId] ?? 0;
          if (ceiling <= rule.minLevel) {
            delete lastIssued[deviceId];
            continue;
          }

          const target = Math.max(rule.minLevel, ceiling * (1 - trim));
          const previous = lastIssued[deviceId];
          if (previous !== undefined && Math.abs(previous - target) < 0.5) continue;
          lastIssued[deviceId] = target;

          const patch: StatePatch & { fadeMs?: number } = {
            level: target,
            fadeMs: 900,
          };
          // A fixture trimmed to nothing should switch off rather than leave a
          // driver idling at 0%.
          if (target <= 0.5 && rule.minLevel <= 0) patch.on = false;
          else if (!state.on) patch.on = true;

          // A regulating loop, so it must not move its own setpoint.
          effects.push({ ruleId: rule.id, deviceId, patch, intent: false });
          moved = true;
        }

        scratch.lastLevels = lastIssued;

        // Narrate only a meaningful change. Logging every 220ms evaluation
        // buried the rest of the activity feed under identical lines.
        const lastTrim = scratch.lastTrim;
        if (lastTrim === undefined) {
          scratch.lastTrim = trim;
        } else if (moved && Math.abs(lastTrim - trim) > 0.12) {
          scratch.lastTrim = trim;
          events.push(
            event(
              rule,
              trim <= 0.02
                ? "No useful daylight - fixtures at their scene level"
                : `Daylight supplying ${Math.round(trim * 100)}% of target - fixtures trimmed to match`,
              nowMin,
            ),
          );
        }
        break;
      }

      case "circadian": {
        const target = cctAt(rule.curve, nowMin);
        const lastWritten: Record<string, number> = { ...(scratch.lastCct ?? {}) };

        for (const deviceId of rule.deviceIds) {
          const light = isLight(space, deviceId);
          if (!light?.tunable) continue;

          // A scene or the presenter owns this fixture's colour. Drop the memo
          // so that the moment the lock is released the curve re-asserts,
          // rather than waiting for the target to drift past the deadband from
          // a value this rule never actually managed to write.
          if (cctLocked[deviceId]) {
            delete lastWritten[deviceId];
            continue;
          }

          const cct = clamp(target, light.tunable.minK, light.tunable.maxK);
          const previous = lastWritten[deviceId];
          if (previous !== undefined && Math.abs(previous - cct) < 25) continue;

          lastWritten[deviceId] = cct;
          effects.push({
            ruleId: rule.id,
            deviceId,
            // Long fade: a circadian shift should never be perceptible as a
            // change, only as a difference between two moments in the day.
            patch: { cct, fadeMs: 4000 },
            // Continuous tuning — locking the colour here would switch the
            // curve off after its first write.
            intent: false,
          });
        }

        scratch.lastCct = lastWritten;
        break;
      }

      case "schedule": {
        const at = resolveScheduleTime(rule.at, space.environment);
        if (crossedTime(prevMin, nowMin, at)) {
          pushTargets(effects, rule, rule.targets);
          events.push(event(rule, rule.explain, nowMin));
        }
        break;
      }
    }

    nextMemory[rule.id] = scratch;

    // An intent rule's effects change what the room is being asked to hold, so
    // fold them in before the regulating pass reads them.
    if (expressesIntent(rule)) {
      for (const effect of effects) {
        if (effect.ruleId !== rule.id) continue;
        const device = space.devices.find((d) => d.id === effect.deviceId);
        const current = states[effect.deviceId];
        if (!device || !current) continue;

        const { fadeMs: _fade, ...rest } = effect.patch;
        const patchInput = rest as StatePatch;

        const level = commandedLevelFor(device, current, patchInput);
        if (level !== undefined) {
          workingCommanded[effect.deviceId] = level;
          commandedUpdates[effect.deviceId] = level;
        }
        if (device.kind === "light" && "cct" in patchInput) {
          cctLockUpdates[effect.deviceId] = true;
        }
      }
    }
  }

  return { effects, events, memory: nextMemory, commandedUpdates, cctLockUpdates };
}

function elapsedMinutes(since: number, now: number): number {
  const d = now - since;
  return d >= 0 ? d : d + MINUTES_PER_DAY;
}

/** Only occupancy and schedule rules command a state; the others regulate one. */
function expressesIntent(rule: Rule): boolean {
  return rule.kind === "occupancy" || rule.kind === "schedule";
}

function pushTargets(
  effects: RuleEffect[],
  rule: Rule,
  targets: Record<string, StatePatch & { fadeMs?: number }>,
): void {
  const intent = expressesIntent(rule);
  for (const [deviceId, patch] of Object.entries(targets)) {
    effects.push({ ruleId: rule.id, deviceId, patch, intent });
  }
}

function event(rule: Rule, message: string, atMin: number): RuleEvent {
  return { ruleId: rule.id, ruleName: rule.name, message, atMin };
}
