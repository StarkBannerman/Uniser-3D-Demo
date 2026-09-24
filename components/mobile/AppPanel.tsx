"use client";

/**
 * The mobile app, drawn as a phone.
 *
 * Section 14 of the requirement document asks that the 3D room, the keypad, the
 * app and the scene engine always show the same live system state. The cheapest
 * way to *claim* that is a screenshot; the only way to *demonstrate* it is to
 * put a real second interface on screen, wired to the same store, and let the
 * client press either one.
 *
 * So there is no local state in here beyond which tab is open. Every control
 * reads and writes `useSim` exactly as the keypad and the device panel do, which
 * is why pressing Reading on the phone lights the keypad's Reading button and
 * moves the room — not because anything synchronises them, but because there is
 * only ever one state.
 */

import { useSim } from "@/lib/sim/store";
import type {
  ClimateState,
  FanDevice,
  FanState,
  LightDevice,
  LightState,
  ShadeDevice,
  ShadeState,
} from "@/lib/sim/types";
import { formatClock } from "@/lib/sim/clock";
import { cctGradient, Segmented, Slider, Toggle } from "@/components/ui/Primitives";
import { Icon, sceneIcon, type IconName } from "@/components/keypad/icons";

/**
 * Which half of the app is showing.
 *
 * Driven from the rail's tabs rather than from a second row of tabs inside the
 * phone. Two tab strips one above the other for the same three destinations was
 * a nesting nobody could parse at a glance.
 */
export type AppView = "scenes" | "controls";

/** The phone shell. Styling only — everything inside is live. */
function Phone({ children, title }: { children: React.ReactNode; title: string }) {
  const clockMin = useSim((s) => s.clockMin);

  return (
    <div className="mx-auto w-full max-w-[560px] rounded-[30px] border border-shell-700 bg-shell-950 p-2 shadow-2xl lg:max-w-[300px]">
      <div className="overflow-hidden rounded-[24px] bg-shell-900">
        {/* Status bar. The time is the simulated clock, so scrubbing the day
            moves it — a static 9:41 would be the one obviously fake thing on
            an otherwise live panel. */}
        <div className="flex items-center justify-between px-4 pt-2.5 pb-1 text-[10px] text-shell-400">
          <span className="font-mono">{formatClock(clockMin)}</span>
          <span className="h-3.5 w-16 rounded-full bg-shell-950" />
          <span className="font-mono tracking-tight">• • ▮</span>
        </div>
        <div className="px-3 pb-3">
          <div className="pb-2 pt-1">
            <div className="text-[10px] uppercase tracking-[0.16em] text-brass-500">
              SmartSpaces
            </div>
            <div className="text-base font-medium leading-tight text-shell-100">
              {title}
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * What a curtain layer is doing, in words.
 *
 * Open and Close are the only two things anyone asks a curtain for, so the
 * control is two buttons rather than a slider. The travel is still real —
 * nine seconds of motor — and this is where that shows: mid-travel the readout
 * gives the live position, which is the detail that tells a client these are
 * motorised tracks rather than an on/off graphic.
 */
function curtainStatus(position: number): string {
  if (position <= 0.5) return "Open";
  if (position >= 99.5) return "Closed";
  return `${Math.round(position)}% closed`;
}

/**
 * One slider with an icon beside it.
 *
 * The phone has no room for "Brightness" and "Colour temperature" spelled out
 * next to every fixture, and two unlabelled tracks stacked on a card is a
 * guessing game. The icon says which is which in the width of a character.
 *
 * `trailing` keeps the tracks aligned: the brightness row ends in a toggle, so
 * without a matching gap the colour row would run wider than the one above it.
 */
function SliderRow({
  icon,
  hint,
  trailing,
  children,
}: {
  icon: IconName;
  hint: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-shell-500" title={hint} aria-hidden>
        <Icon name={icon} />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
      {trailing ?? <span className="h-6 w-11 shrink-0" />}
    </div>
  );
}

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-shell-800 bg-shell-850/60 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[12px] text-shell-200">{label}</span>
        {value && (
          <span className="shrink-0 font-mono text-[11px] text-shell-400">{value}</span>
        )}
      </div>
      {children && <div className="mt-2 space-y-2">{children}</div>}
    </div>
  );
}

export function AppPanel({ view }: { view: AppView }) {
  const space = useSim((s) => s.space);
  const states = useSim((s) => s.states);
  const activeSceneId = useSim((s) => s.activeSceneId);
  const sequence = useSim((s) => s.sequence);
  const busy = useSim((s) => s.busy);
  const applyScene = useSim((s) => s.applyScene);
  const patch = useSim((s) => s.patch);

  if (!space) return null;

  const lights = space.devices.filter((d): d is LightDevice => d.kind === "light");
  const shade = space.devices.find((d): d is ShadeDevice => d.kind === "shade");
  const climate = space.devices.find((d) => d.kind === "climate");
  const fan = space.devices.find((d): d is FanDevice => d.kind === "fan");

  return (
    <div className="pb-4">
      <Phone title={space.name}>

        {/* A locked interface with no explanation reads as a crash. This is the
            difference between "the room is doing what you asked" and "nothing
            happened when I tapped". */}
        {busy && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-brass-700/40 bg-brass-600/10 px-2.5 py-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brass-400" />
            <span className="text-[10px] text-brass-300">
              {sequence ? sequence.label : "Running…"}
            </span>
          </div>
        )}

        {view === "scenes" && (
          <div className="space-y-2">
            {/* Every scene, including the ones the four-gang plate could not
                fit. That split is the argument for having an app at all. */}
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-2">
              {space.scenes.map((scene) => {
                const active = scene.id === activeSceneId;
                return (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => applyScene(scene.id)}
                    aria-pressed={active}
                    disabled={busy && !active}
                    className={`flex flex-col items-start gap-1.5 rounded-xl border px-2.5 py-2.5 text-left transition-colors ${
                      active
                        ? "border-brass-600/70 bg-brass-600/15 text-brass-300"
                        : "border-shell-800 bg-shell-850/60 text-shell-300 hover:border-shell-700"
                    } ${busy && !active ? "pointer-events-none opacity-40" : ""}`}
                  >
                    <Icon name={sceneIcon(scene)} />
                    <span className="text-[11px] font-medium leading-tight">
                      {scene.name}
                    </span>
                  </button>
                );
              })}
            </div>
            {sequence ? (
              // The stage is already named in the banner above; this is the bar.
              <div className="rounded-xl border border-brass-700/50 bg-brass-600/10 px-3 py-2.5">
                <div className="h-1 overflow-hidden rounded-full bg-shell-800">
                  <div
                    className="h-full bg-brass-500 transition-[width] duration-500"
                    style={{ width: `${(sequence.step / sequence.total) * 100}%` }}
                  />
                </div>
              </div>
            ) : (
              <p className="px-1 text-[10px] leading-snug text-shell-500">
                {activeSceneId
                  ? space.scenes.find((s) => s.id === activeSceneId)?.blurb
                  : "Adjusted by hand — no scene active."}
              </p>
            )}
          </div>
        )}

        {view === "controls" && (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
            <div className="px-1 pb-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-shell-500 sm:col-span-2 lg:col-span-1">
              Lighting
            </div>
            {lights.map((device) => {
              const state = states[device.id] as LightState | undefined;
              if (!state) return null;
              return (
                <Row
                  key={device.id}
                  label={device.name}
                  value={state.on ? `${Math.round(state.level)}%` : "Off"}
                >
                  <SliderRow
                    icon="sun"
                    hint="Brightness"
                    trailing={
                      <Toggle
                        on={state.on}
                        disabled={busy}
                        label={`${device.name} power`}
                        onChange={(on) => patch(device.id, { on }, 700)}
                      />
                    }
                  >
                    <Slider
                      label={`${device.name} brightness`}
                      value={state.level}
                      min={1}
                      max={100}
                      disabled={busy || !state.on}
                      onChange={(level) => patch(device.id, { level })}
                    />
                  </SliderRow>
                  {device.tunable && (
                    <SliderRow icon="dim" hint="Colour temperature">
                      <Slider
                        label={`${device.name} colour temperature`}
                        value={state.cct}
                        min={device.tunable.minK}
                        max={device.tunable.maxK}
                        step={50}
                        disabled={busy || !state.on}
                        fill={cctGradient(device.tunable.minK, device.tunable.maxK)}
                        onChange={(cct) => patch(device.id, { cct })}
                      />
                    </SliderRow>
                  )}
                </Row>
              );
            })}
          </div>
        )}

        {view === "controls" && (
          <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
            <div className="px-1 pb-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-shell-500 sm:col-span-2 lg:col-span-1">
              Comfort
            </div>
            {shade &&
              (() => {
                const s = states[shade.id] as ShadeState | undefined;
                if (!s) return null;
                return (
                  <Row key={shade.id} label={shade.name}>
                    {shade.layers.map((layer) => (
                      <div key={layer}>
                        <div className="mb-1 flex items-baseline justify-between text-[10px]">
                          <span className="capitalize text-shell-400">{layer}</span>
                          <span className="font-mono text-shell-300">
                            {curtainStatus(s[layer])}
                          </span>
                        </div>
                        <Segmented
                          disabled={busy}
                          label={`${shade.name} ${layer}`}
                          value={s[layer] > 50 ? "closed" : "open"}
                          options={[
                            { value: "open", label: "Open" },
                            { value: "closed", label: "Close" },
                          ]}
                          onChange={(v) =>
                            patch(shade.id, { [layer]: v === "closed" ? 100 : 0 })
                          }
                        />
                      </div>
                    ))}
                  </Row>
                );
              })()}

            {climate &&
              climate.kind === "climate" &&
              (() => {
                const s = states[climate.id] as ClimateState | undefined;
                if (!s) return null;
                return (
                  <Row
                    key={climate.id}
                    label={climate.name}
                    value={`${s.setpointC.toFixed(0)}°C`}
                  >
                    <SliderRow
                      icon="thermo"
                      hint="Target temperature"
                      trailing={
                        <Toggle
                          on={s.on}
                          disabled={busy}
                          label={`${climate.name} power`}
                          onChange={(on) => patch(climate.id, { on })}
                        />
                      }
                    >
                      <Slider
                        label={`${climate.name} setpoint`}
                        value={s.setpointC}
                        min={climate.minC}
                        max={climate.maxC}
                        disabled={busy || !s.on}
                        onChange={(setpointC) => patch(climate.id, { setpointC })}
                      />
                    </SliderRow>
                    <div className="text-[10px] text-shell-500">
                      Room is {s.currentC.toFixed(1)}°C
                    </div>
                  </Row>
                );
              })()}

            {fan &&
              (() => {
                const s = states[fan.id] as FanState | undefined;
                if (!s) return null;
                return (
                  <Row
                    key={fan.id}
                    label={fan.name}
                    value={s.on ? `Speed ${s.speed}` : "Off"}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex min-w-0 flex-1 gap-1">
                        {Array.from({ length: fan.speeds }, (_, i) => i + 1).map(
                          (speed) => (
                            <button
                              key={speed}
                              type="button"
                              onClick={() => patch(fan.id, { speed, on: true })}
                              aria-pressed={s.on && s.speed === speed}
                              disabled={busy}
                              className={`flex-1 rounded-md py-1.5 text-[11px] font-medium transition-colors ${
                                s.on && s.speed === speed
                                  ? "bg-brass-600/25 text-brass-300"
                                  : "bg-shell-800 text-shell-400 hover:text-shell-200"
                              } ${busy ? "pointer-events-none opacity-40" : ""}`}
                            >
                              {speed}
                            </button>
                          ),
                        )}
                      </div>
                      <Toggle
                        on={s.on}
                        disabled={busy}
                        label={`${fan.name} power`}
                        onChange={(on) => patch(fan.id, { on })}
                      />
                    </div>
                  </Row>
                );
              })()}
          </div>
        )}
      </Phone>

      <p className="mx-auto mt-3 max-w-[560px] text-[10px] leading-snug text-shell-500 lg:max-w-[300px]">
        Scenes, Controls and the room are one state, not three copies of it. Press
        a scene and every control moves; move one control and the scene lets go.
      </p>
    </div>
  );
}
