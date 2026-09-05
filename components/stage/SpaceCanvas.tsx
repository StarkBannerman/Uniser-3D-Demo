"use client";

/**
 * The stage.
 *
 * Composites the room into something that reads as a real space at any dimmer
 * level, in this order:
 *
 *   1. room          the illustration (or, later, a base photograph)
 *   2. curtains      physical objects in the room
 *   3. screen        ditto
 *   4. tint          the illuminant's colour, multiplied — reflected light is
 *                    surface reflectance × illuminant, so `multiply` is not a
 *                    stylistic choice here, it is the correct operator
 *   5. darkness      global dimming, multiplied
 *   6. light         beams, pools and bloom, added via `screen`
 *
 * The insight that makes this work with one flat image per space: a dim room is
 * not a uniformly darker bright room, it is a globally dark room with local
 * pools of light. Layer 5 does the former and layer 6 the latter, and together
 * they are convincing enough that a single base asset per space is all the
 * photoreal renderer will ever need.
 */

import type {
  AvDevice,
  AvState,
  LightDevice,
  LightState,
  ShadeDevice,
  ShadeState,
} from "@/lib/sim/types";
import { useSim } from "@/lib/sim/store";
import {
  clamp01,
  cctToRgb,
  daylightCct,
  daylightLux,
  estimateLux,
  glowAlpha,
  lightColor,
  lightOutput,
  rgbToCss,
  roomIllumination,
  shadeTransmission,
  sunElevation01,
} from "@/lib/sim/photometry";
import { LightLayer, type GlowItem } from "./LightLayer";
import { ShadeLayer } from "./ShadeLayer";
import { ScreenLayer } from "./ScreenLayer";
import { LivingRoom } from "./rooms/LivingRoom";
import { BedroomStage } from "./rooms3d/BedroomStage";
import { LivingRoomStage } from "./rooms3d/LivingRoomStage";

/** Window luminance that counts as "fully bright" for compositing. */
const WINDOW_REFERENCE_LUX = 400;
/** Never fully black — there is always some spill in a real room. */
const MAX_DARKNESS = 0.93;

function RoomArt({ illustration }: { illustration?: string }) {
  switch (illustration) {
    case "living-room":
      return <LivingRoom />;
    default:
      return <div className="absolute inset-0 bg-shell-800" />;
  }
}

export function SpaceCanvas() {
  const space = useSim((s) => s.space);
  // The canvas legitimately depends on almost every device, so it subscribes to
  // the whole state map rather than pretending otherwise with a dozen selectors.
  const states = useSim((s) => s.states);
  const clockMin = useSim((s) => s.clockMin);

  if (!space) return null;

  /**
   * A 3D space renders its own lighting and needs none of the compositing
   * below — no darkness overlay, no colour cast, no glow layer. Those exist to
   * fake illumination on a flat image; here the lights are real.
   */
  if (space.renderer === "3d") {
    return (
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-black ring-1 ring-shell-800">
        {space.model === "master-bedroom" ? (
          <BedroomStage />
        ) : space.model === "living-room" ? (
          <LivingRoomStage />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-shell-500">
            No 3D room registered for “{space.model}”.
          </div>
        )}
      </div>
    );
  }

  const env = space.environment;
  const elevation = sunElevation01(clockMin, env.sunriseMin, env.sunsetMin);
  const outdoorLux = daylightLux(elevation, env.outdoorPeakLux);
  const dayColor = cctToRgb(daylightCct(elevation));
  const totalArea = space.zones.reduce((a, z) => a + z.areaM2, 0) || 1;

  const items: GlowItem[] = [];

  // Weighted average of every illuminant in the room, used for the colour cast.
  let mixR = 0;
  let mixG = 0;
  let mixB = 0;
  let mixWeight = 0;

  const addToMix = (color: [number, number, number], weight: number) => {
    if (weight <= 0) return;
    mixR += color[0] * weight;
    mixG += color[1] * weight;
    mixB += color[2] * weight;
    mixWeight += weight;
  };

  /* ---------------- Luminaires ---------------- */

  const lights = space.devices.filter((d): d is LightDevice => d.kind === "light");
  const luxContributions: {
    lumensEach: number;
    fixtures: number;
    on: boolean;
    level: number;
  }[] = [];

  for (const device of lights) {
    const state = states[device.id] as LightState | undefined;
    if (!state) continue;

    luxContributions.push({
      lumensEach: device.lumensEach,
      fixtures: device.fixtures,
      on: state.on,
      level: state.level,
    });

    if (!state.on) continue;
    const alpha = glowAlpha(state.level);
    if (alpha <= 0.002) continue;

    const color = lightColor(state);
    device.glow.forEach((spec, i) => {
      items.push({ key: `${device.id}-${i}`, spec, color, alpha });
    });

    addToMix(color, device.lumensEach * device.fixtures * lightOutput(state.level));
  }

  /* ---------------- Daylight ---------------- */

  const shades = space.devices.filter((d): d is ShadeDevice => d.kind === "shade");
  let interiorDaylightLux = 0;

  for (const shade of shades) {
    const state = states[shade.id] as ShadeState | undefined;
    const transmission = state
      ? shadeTransmission(state.sheer, state.blackout)
      : 1;
    const lux = outdoorLux * env.windowFactor * transmission;
    interiorDaylightLux += lux;

    const win = shade.window;
    const cx = win.x + win.w / 2;
    const cy = win.y + win.h / 2;
    const alpha = clamp01(Math.pow(lux / WINDOW_REFERENCE_LUX, 1 / 2.2));

    if (alpha > 0.002) {
      items.push({
        key: `day-${shade.id}-panel`,
        spec: {
          shape: "panel",
          x: cx,
          y: cy,
          w: win.w * 0.97,
          h: win.h * 0.97,
          intensity: 1,
        },
        color: dayColor,
        alpha,
      });
      items.push({
        key: `day-${shade.id}-spill`,
        spec: { shape: "pool", x: cx, y: cy + 0.16, radius: 0.44, intensity: 0.5 },
        color: dayColor,
        alpha,
      });
    }

    // Convert lux back to a lumen-equivalent so daylight competes fairly with
    // the fixtures for the colour cast.
    addToMix(dayColor, (lux * totalArea) / 0.5);
  }

  /* ---------------- Displays ---------------- */

  const av = space.devices.find((d): d is AvDevice => d.kind === "av");
  if (av) {
    const state = states[av.id] as AvState | undefined;
    if (state?.on) {
      const screenDown = Boolean(av.hasScreen && av.screenRect && state.screen > 50);
      // Projection is cool and slightly blue; so is a television.
      const displayColor: [number, number, number] = [196, 208, 232];

      if (screenDown && av.screenRect) {
        const r = av.screenRect;
        const deployed = clamp01(state.screen / 100);
        items.push({
          key: "av-screen",
          spec: {
            shape: "panel",
            x: r.x + r.w / 2,
            y: r.y + (r.h * deployed) / 2,
            w: r.w * 0.95,
            h: r.h * deployed * 0.92,
            intensity: 0.95,
          },
          color: displayColor,
          alpha: 0.6,
        });
        items.push({
          key: "av-screen-spill",
          spec: {
            shape: "pool",
            x: r.x + r.w / 2,
            y: r.y + r.h * deployed * 0.85,
            radius: 0.42,
            intensity: 0.45,
          },
          color: displayColor,
          alpha: 0.55,
        });
      } else if (av.glow) {
        av.glow.forEach((spec, i) => {
          items.push({
            key: `av-glow-${i}`,
            spec,
            color: displayColor,
            alpha: 0.55,
          });
        });
      }

      // Displays are visibly light sources but contribute little measurable
      // illuminance, so they colour the cast without inflating the lux figure
      // the sensor and the rules are working from.
      addToMix(displayColor, 900);
    }
  }

  /* ---------------- Composite ---------------- */

  /**
   * Illuminance is recomputed here every frame rather than read from the lux
   * sensor in the store. The sensor is intentionally throttled to 10Hz with a
   * 1.5 lux deadband, which is right for panels and rule evaluation and quite
   * wrong for rendering — at low levels that deadband is a large relative step,
   * and a slow fade would visibly stair-step.
   */
  const artificialLux = estimateLux(luxContributions, totalArea);
  const lux = artificialLux + interiorDaylightLux;
  const illumination = roomIllumination(lux, env.designLux);
  const darkness = MAX_DARKNESS * (1 - illumination);

  const mix: [number, number, number] =
    mixWeight > 0
      ? [mixR / mixWeight, mixG / mixWeight, mixB / mixWeight]
      : [255, 255, 255];

  // Neutral light should barely tint; deep amber or saturated colour should
  // swamp the room. Chroma scales the effect so both fall out of one rule.
  const chroma = (Math.max(...mix) - Math.min(...mix)) / 255;
  const tintOpacity = clamp01(chroma * 0.75);

  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-shell-950 ring-1 ring-shell-800">
      <RoomArt illustration={space.illustration} />

      {shades.map((shade) => {
        const state = states[shade.id] as ShadeState | undefined;
        if (!state) return null;
        return <ShadeLayer key={shade.id} device={shade} state={state} />;
      })}

      {av && states[av.id] && (
        <ScreenLayer device={av} state={states[av.id] as AvState} />
      )}

      {/* Illuminant colour cast. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundColor: rgbToCss(mix),
          mixBlendMode: "multiply",
          opacity: tintOpacity,
        }}
      />

      {/* Global dimming. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundColor: "#05070c",
          mixBlendMode: "multiply",
          opacity: darkness,
        }}
      />

      <LightLayer items={items} />

      {/* Lens vignette — keeps the eye in the room. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 45%, transparent 55%, rgb(0 0 0 / 0.45) 100%)",
        }}
      />
    </div>
  );
}
