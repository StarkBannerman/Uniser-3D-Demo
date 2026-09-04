"use client";

/**
 * The wall keypad.
 *
 * Modelled on the reference prototype, and the reason it is the front door
 * rather than a list of sliders: Uniser supplies this panel. A client who can
 * see the thing that will be on their wall, with their scenes on it, is being
 * sold hardware. A generic app screen sells nothing.
 *
 * Left column runs scenes, right column runs functions, and the rocker dims
 * within whatever scene is active — the same division as the reference.
 */

import { useSim } from "@/lib/sim/store";
import type { ClimateState, LightDevice, LightState, ShadeState } from "@/lib/sim/types";
import { clamp } from "@/lib/sim/photometry";

/** How much one rocker press moves the level, in dimmer points. */
const ROCKER_STEP = 9;

function Button({
  label,
  active,
  onPress,
  title,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      title={title}
      aria-pressed={active}
      className={`relative flex h-[52px] items-center justify-center rounded-[5px] border text-[13px] font-medium tracking-wide transition-colors duration-150 ${
        active
          ? "border-brass-500 bg-shell-800 text-brass-300"
          : "border-shell-700 bg-shell-850 text-shell-300 hover:border-shell-600 hover:text-shell-100"
      }`}
    >
      {label}
      {/* Status LED, as on the real panel. */}
      <span
        className={`absolute right-1.5 top-1.5 h-1 w-1 rounded-full transition-colors ${
          active ? "bg-brass-400" : "bg-shell-700"
        }`}
      />
    </button>
  );
}

export function Keypad() {
  const space = useSim((s) => s.space);
  const states = useSim((s) => s.states);
  const activeSceneId = useSim((s) => s.activeSceneId);
  const applyScene = useSim((s) => s.applyScene);
  const patch = useSim((s) => s.patch);

  if (!space) return null;

  const shade = space.devices.find((d) => d.kind === "shade");
  const climate = space.devices.find((d) => d.kind === "climate");
  const shadeState = shade ? (states[shade.id] as ShadeState | undefined) : undefined;
  const climateState = climate
    ? (states[climate.id] as ClimateState | undefined)
    : undefined;

  const lights = space.devices.filter((d): d is LightDevice => d.kind === "light");

  /**
   * Dim every fixture the current scene has lit, proportionally.
   *
   * Fixtures that are off stay off — a rocker that switched things back on would
   * be a different control. Accents are excluded because they are architectural
   * and hold their level through every scene.
   */
  const rock = (direction: 1 | -1) => {
    for (const device of lights) {
      if (device.id.endsWith("-accent")) continue;
      const state = states[device.id] as LightState | undefined;
      if (!state?.on) continue;
      const level = clamp(state.level + direction * ROCKER_STEP, 1, 100);
      patch(device.id, { level }, 320);
    }
  };

  const sheerOnly = (shadeState?.sheer ?? 0) > 50 && (shadeState?.blackout ?? 0) <= 50;
  const blackoutOn = (shadeState?.blackout ?? 0) > 50;

  return (
    <div className="rounded-lg border border-shell-700 bg-shell-900 p-3 shadow-lg">
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-2">
          {space.scenes.map((scene) => (
            <Button
              key={scene.id}
              label={scene.name}
              active={scene.id === activeSceneId}
              onPress={() => applyScene(scene.id)}
              title={scene.blurb}
            />
          ))}
        </div>

        <div className="grid gap-2">
          {shade && (
            <>
              <Button
                label="Sheer"
                active={sheerOnly}
                title="Draw the sheer layer, open the blackout"
                onPress={() => patch(shade.id, { sheer: 100, blackout: 0 })}
              />
              <Button
                label="Blackout"
                active={blackoutOn}
                title="Draw the blackout layer"
                onPress={() => patch(shade.id, { sheer: 100, blackout: 100 })}
              />
            </>
          )}
          {climate && climateState && (
            <Button
              label="Ac"
              active={climateState.on}
              title="Toggle air conditioning"
              onPress={() => patch(climate.id, { on: !climateState.on })}
            />
          )}

          {/* Rocker — one physical control, two halves. */}
          <div className="flex h-[52px] overflow-hidden rounded-[5px] border border-shell-700 bg-shell-850">
            <button
              type="button"
              onClick={() => rock(-1)}
              aria-label="Dim down"
              className="flex-1 text-shell-300 transition-colors hover:bg-shell-800 hover:text-shell-100"
            >
              ˅
            </button>
            <span className="w-px bg-shell-700" />
            <button
              type="button"
              onClick={() => rock(1)}
              aria-label="Dim up"
              className="flex-1 text-shell-300 transition-colors hover:bg-shell-800 hover:text-shell-100"
            >
              ˄
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
