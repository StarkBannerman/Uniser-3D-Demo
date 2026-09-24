"use client";

/**
 * The wall keypad.
 *
 * The reason this is the front door rather than a list of sliders: the panel is
 * what the client buys and what ends up on their wall. Someone who can see the
 * thing that will be beside their bedroom door, with their scenes engraved on
 * it, is being sold hardware. A generic app screen sells nothing.
 *
 * Two layouts, chosen by the space (`Space.keypad`):
 *
 *   column — scenes down one side, functions down the other, dimmer rocker
 *            below. Right for a room with many scenes and few functions.
 *   grid   — a 4x2 icon plate: scenes on the top row, functions on the bottom.
 *            Right for a room whose scenes fit on four gangs.
 *
 * The finish selector is not decoration either: the requirement document asks
 * for different keypad finishes, and changing it live in front of a client
 * answers "what does it look like in brass" without a sample box.
 */

import { useEffect, useState } from "react";
import { useSim } from "@/lib/sim/store";
import type {
  ClimateState,
  FanDevice,
  FanState,
  KeypadFinish,
  LightDevice,
  LightState,
  Scene,
  ShadeState,
} from "@/lib/sim/types";
import { clamp } from "@/lib/sim/photometry";
import { Icon, sceneIcon, type IconName } from "./icons";

/** How much one rocker press moves the level, in dimmer points. */
const ROCKER_STEP = 9;

/* ------------------------------------------------------------------ */
/* Finishes                                                            */
/* ------------------------------------------------------------------ */

/**
 * Each finish is a plate colour, a button colour, an engraving colour and the
 * colour the engraving lights up in. The last one is what sells it — a real
 * keypad's icons are backlit, and the lit/unlit difference is most of what a
 * client is looking at.
 */
const FINISHES: Record<
  KeypadFinish,
  { label: string; plate: string; button: string; edge: string; ink: string; lit: string; glow: string }
> = {
  graphite: {
    label: "Graphite",
    plate: "#1b1d20",
    button: "#26292d",
    edge: "#33373c",
    ink: "#7d848c",
    lit: "#f2e2c0",
    glow: "#d9b169",
  },
  brass: {
    label: "Brass",
    plate: "#3a2f1e",
    button: "#4d3f28",
    edge: "#6b5836",
    ink: "#b09a6e",
    lit: "#fff1cf",
    glow: "#e7bd72",
  },
  ivory: {
    label: "Ivory",
    plate: "#d9d3c7",
    button: "#e7e2d8",
    edge: "#c3bcae",
    ink: "#6f6a60",
    // Dark engraving on a pale plate: an ivory keypad's icons are printed, not
    // backlit white, so "lit" here is a deeper ink plus the LED, not a glow.
    lit: "#3d3a33",
    glow: "#b8894a",
  },
};

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

function Button({
  icon,
  label,
  active,
  onPress,
  title,
  finish,
  compact = false,
}: {
  icon?: IconName;
  label: string;
  active: boolean;
  onPress: () => void;
  title?: string;
  finish: KeypadFinish;
  compact?: boolean;
}) {
  const f = FINISHES[finish];
  return (
    <button
      type="button"
      onClick={onPress}
      title={title}
      aria-pressed={active}
      className={`relative flex flex-col items-center justify-center gap-1 rounded-[5px] border transition-colors duration-150 ${
        compact ? "h-[58px] px-1" : "h-[52px]"
      }`}
      style={{
        background: f.button,
        borderColor: active ? f.glow : f.edge,
        color: active ? f.lit : f.ink,
        boxShadow: active ? `0 0 10px -2px ${f.glow}55` : undefined,
      }}
    >
      {icon && <Icon name={icon} />}
      <span
        className={`font-medium tracking-wide ${
          compact ? "text-[9px] uppercase tracking-[0.08em]" : "text-[13px]"
        }`}
      >
        {label}
      </span>
      {/* Status LED, as on the real panel. */}
      <span
        className="absolute right-1.5 top-1.5 h-1 w-1 rounded-full transition-colors"
        style={{ background: active ? f.glow : f.edge }}
      />
    </button>
  );
}

function Rocker({
  finish,
  onStep,
}: {
  finish: KeypadFinish;
  onStep: (direction: 1 | -1) => void;
}) {
  const f = FINISHES[finish];
  return (
    <div
      className="flex h-[52px] overflow-hidden rounded-[5px] border"
      style={{ background: f.button, borderColor: f.edge, color: f.ink }}
    >
      <button
        type="button"
        onClick={() => onStep(-1)}
        aria-label="Dim down"
        className="flex flex-1 items-center justify-center transition-opacity hover:opacity-70"
      >
        <Icon name="down" />
      </button>
      <span className="w-px" style={{ background: f.edge }} />
      <button
        type="button"
        onClick={() => onStep(1)}
        aria-label="Dim up"
        className="flex flex-1 items-center justify-center transition-opacity hover:opacity-70"
      >
        <Icon name="up" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function Keypad() {
  const space = useSim((s) => s.space);
  const states = useSim((s) => s.states);
  const activeSceneId = useSim((s) => s.activeSceneId);
  const sequence = useSim((s) => s.sequence);
  const applyScene = useSim((s) => s.applyScene);
  const patch = useSim((s) => s.patch);

  const configured = space?.keypad?.finish ?? "graphite";
  const [finish, setFinish] = useState<KeypadFinish>(configured);
  // Follow the space when the presenter changes room, but leave their own
  // choice alone while they stay in one.
  useEffect(() => setFinish(configured), [configured]);

  if (!space) return null;

  const layout = space.keypad?.layout ?? "column";
  const f = FINISHES[finish];

  const shade = space.devices.find((d) => d.kind === "shade");
  const climate = space.devices.find((d) => d.kind === "climate");
  const fan = space.devices.find((d): d is FanDevice => d.kind === "fan");
  const shadeState = shade ? (states[shade.id] as ShadeState | undefined) : undefined;
  const climateState = climate
    ? (states[climate.id] as ClimateState | undefined)
    : undefined;
  const fanState = fan ? (states[fan.id] as FanState | undefined) : undefined;

  const lights = space.devices.filter((d): d is LightDevice => d.kind === "light");

  /**
   * Dim every fixture the current scene has lit, proportionally.
   *
   * Fixtures that are off stay off — a rocker that switched things back on would
   * be a different control. Accents and path lighting are excluded because they
   * are architectural and hold their level through every scene.
   */
  const rock = (direction: 1 | -1) => {
    for (const device of lights) {
      if (device.id.endsWith("-accent") || device.id.endsWith("-night")) continue;
      const state = states[device.id] as LightState | undefined;
      if (!state?.on) continue;
      const level = clamp(state.level + direction * ROCKER_STEP, 1, 100);
      patch(device.id, { level }, 320);
    }
  };

  const sheerOnly = (shadeState?.sheer ?? 0) > 50 && (shadeState?.blackout ?? 0) <= 50;
  const blackoutOn = (shadeState?.blackout ?? 0) > 50;

  const scenesOnPlate: Scene[] = space.keypad?.scenes
    ? space.keypad.scenes
        .map((id) => space.scenes.find((sc) => sc.id === id))
        .filter((sc): sc is Scene => Boolean(sc))
    : space.scenes;

  const onPlate = new Set(scenesOnPlate.slice(0, 4).map((sc) => sc.id));
  const offPlate = space.scenes.filter((sc) => !onPlate.has(sc.id));

  /** Any room light on? Drives the Lights button's state and what it does. */
  const anyLightOn = lights.some(
    (d) => !d.id.endsWith("-night") && (states[d.id] as LightState | undefined)?.on,
  );

  const toggleLights = () => {
    for (const device of lights) {
      if (device.id.endsWith("-night")) continue;
      patch(device.id, { on: !anyLightOn }, 900);
    }
  };

  /**
   * One button, three positions: open → sheer → blackout → open.
   *
   * A real two-gang curtain keypad has separate buttons per layer, which the
   * column layout keeps. On an eight-gang plate the layers have to share a
   * gang, and cycling is how the physical product does it.
   */
  const cycleCurtain = () => {
    if (!shade || shade.kind !== "shade") return;
    const hasSheer = shade.layers.includes("sheer");
    if (blackoutOn) {
      patch(shade.id, hasSheer ? { sheer: 0, blackout: 0 } : { blackout: 0 });
    } else if (sheerOnly || !hasSheer) {
      patch(shade.id, hasSheer ? { sheer: 100, blackout: 100 } : { blackout: 100 });
    } else {
      patch(shade.id, { sheer: 100, blackout: 0 });
    }
  };

  /** Off → 1 → … → max → off, as a pull-cord regulator behaves. */
  const cycleFan = () => {
    if (!fan || !fanState) return;
    if (!fanState.on) {
      patch(fan.id, { on: true, speed: fanState.speed });
    } else if (fanState.speed >= fan.speeds) {
      patch(fan.id, { on: false });
    } else {
      patch(fan.id, { speed: fanState.speed + 1 });
    }
  };

  const plate = (children: React.ReactNode) => (
    <div
      className="rounded-lg border p-3 shadow-lg"
      style={{ background: f.plate, borderColor: f.edge }}
    >
      {children}
      <FinishPicker finish={finish} onChange={setFinish} />
      {/* While a staged scene is running, the plate says which stage it is on.
          A sequence that takes fifteen seconds needs to narrate itself, or the
          presenter has to talk over silence. */}
      {sequence && (
        <div
          className="mt-2 rounded-[4px] px-2 py-1.5 text-[10px] leading-tight"
          style={{ background: f.button, color: f.lit }}
        >
          <span className="opacity-60">
            {sequence.step}/{sequence.total} ·{" "}
          </span>
          {sequence.label}
        </div>
      )}
    </div>
  );

  if (layout === "grid") {
    return plate(
      <div className="grid grid-cols-4 gap-1.5">
        {scenesOnPlate.slice(0, 4).map((scene) => (
          <Button
            key={scene.id}
            compact
            icon={sceneIcon(scene)}
            label={scene.name}
            active={scene.id === activeSceneId}
            onPress={() => applyScene(scene.id)}
            title={scene.blurb}
            finish={finish}
          />
        ))}

        <Button
          compact
          icon="bulb"
          label="Lights"
          active={anyLightOn}
          onPress={toggleLights}
          title="All room lighting on or off"
          finish={finish}
        />
        {shade && shadeState ? (
          <Button
            compact
            icon="curtain"
            label={blackoutOn ? "Blackout" : sheerOnly ? "Sheer" : "Open"}
            active={(shadeState.sheer ?? 0) > 50 || blackoutOn}
            onPress={cycleCurtain}
            title="Cycle open, sheer, blackout"
            finish={finish}
          />
        ) : (
          <span />
        )}
        {climate && climateState ? (
          <Button
            compact
            icon="snow"
            label="AC"
            active={climateState.on}
            onPress={() => patch(climate.id, { on: !climateState.on })}
            title="Toggle air conditioning"
            finish={finish}
          />
        ) : (
          <span />
        )}
        {fan && fanState ? (
          <Button
            compact
            icon="fan"
            label={fanState.on ? `Fan ${fanState.speed}` : "Fan"}
            active={fanState.on}
            onPress={cycleFan}
            title="Step the fan speed, then off"
            finish={finish}
          />
        ) : (
          <span />
        )}

        <div className="col-span-4">
          <Rocker finish={finish} onStep={rock} />
        </div>

        {/* Scenes that did not fit on the plate. Saying so is more honest than
            hiding them, and it is the natural cue for the app. */}
        {offPlate.length > 0 && (
          <p className="col-span-4 text-[9px] leading-snug" style={{ color: f.ink }}>
            {offPlate.map((s) => s.name).join(", ")} on the app
          </p>
        )}
      </div>,
    );
  }

  return plate(
    <div className="grid grid-cols-2 gap-2">
      <div className="grid gap-2">
        {scenesOnPlate.map((scene) => (
          <Button
            key={scene.id}
            label={scene.name}
            active={scene.id === activeSceneId}
            onPress={() => applyScene(scene.id)}
            title={scene.blurb}
            finish={finish}
          />
        ))}
      </div>

      <div className="grid gap-2">
        {shade && shadeState && (
          <>
            {/* Buttons come from the device's actual layers. A room with a
                single roman blind should not offer a Sheer button that does
                nothing — the keypad is meant to be the panel that ships. */}
            {shade.kind === "shade" && shade.layers.includes("sheer") && (
              <Button
                label="Sheer"
                active={sheerOnly}
                title="Draw the sheer layer, open the blackout"
                onPress={() => patch(shade.id, { sheer: 100, blackout: 0 })}
                finish={finish}
              />
            )}
            <Button
              label={
                shade.kind === "shade" && shade.layers.length > 1 ? "Blackout" : "Blind"
              }
              active={blackoutOn}
              title={
                shade.kind === "shade" && shade.layers.length > 1
                  ? "Draw the blackout layer"
                  : "Lower the blind"
              }
              onPress={() =>
                patch(shade.id, {
                  ...(shade.kind === "shade" && shade.layers.includes("sheer")
                    ? { sheer: 100 }
                    : {}),
                  blackout: blackoutOn ? 0 : 100,
                })
              }
              finish={finish}
            />
          </>
        )}
        {climate && climateState && (
          <Button
            label="Ac"
            active={climateState.on}
            title="Toggle air conditioning"
            onPress={() => patch(climate.id, { on: !climateState.on })}
            finish={finish}
          />
        )}
        {fan && fanState && (
          <Button
            label={fanState.on ? `Fan ${fanState.speed}` : "Fan"}
            active={fanState.on}
            title="Step the fan speed, then off"
            onPress={cycleFan}
            finish={finish}
          />
        )}

        <Rocker finish={finish} onStep={rock} />
      </div>
    </div>,
  );
}

function FinishPicker({
  finish,
  onChange,
}: {
  finish: KeypadFinish;
  onChange: (f: KeypadFinish) => void;
}) {
  return (
    <div className="mt-2.5 flex items-center gap-1.5">
      {(Object.keys(FINISHES) as KeypadFinish[]).map((id) => {
        const f = FINISHES[id];
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            title={`${f.label} finish`}
            aria-label={`${f.label} finish`}
            aria-pressed={finish === id}
            className="h-4 w-4 rounded-full border transition-transform hover:scale-110"
            style={{
              background: f.button,
              borderColor: finish === id ? f.glow : f.edge,
              outline: finish === id ? `1px solid ${f.glow}` : undefined,
              outlineOffset: 1,
            }}
          />
        );
      })}
    </div>
  );
}
