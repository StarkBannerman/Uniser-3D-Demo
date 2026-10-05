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
 * So there is no local state in here beyond which tab is open, and the one
 * deliberate exception: `usePredicted`, which lets a switch move the instant it
 * is pressed rather than waiting out the dim-down that follows it. That is a
 * disagreement about *when*, not about what the state is — see the hook.
 */

import { useSim, TOGGLE_FADE_MS } from "@/lib/sim/store";
import type {
  ClimateDevice,
  ClimateState,
  FanDevice,
  FanState,
  LightDevice,
  LightState,
  ShadeDevice,
  ShadeState,
} from "@/lib/sim/types";
import { formatClock } from "@/lib/sim/clock";
import {
  cctGradient,
  RampButtons,
  Segmented,
  Stepper,
  Toggle,
} from "@/components/ui/Primitives";
import { usePredicted } from "@/components/ui/usePredicted";
import { Icon, sceneIcon, type IconName } from "@/components/keypad/icons";

/**
 * Which half of the app is showing.
 *
 * Driven from the rail's tabs rather than from a second row of tabs inside the
 * phone. Two tab strips one above the other for the same three destinations was
 * a nesting nobody could parse at a glance.
 */
export type AppView = "scenes" | "controls";

/**
 * The phone shell. Styling only — everything inside is live.
 *
 * Fixed height, scrolling inside. A phone that grows to three thousand pixels
 * to fit its own content is the one thing on screen that could not be a phone,
 * and the handset is doing real work here: it is the interface the client
 * recognises. So the chrome holds its shape and the list moves behind it, the
 * way it would in your hand.
 *
 * The status bar and the room name stay put; only the content below them
 * scrolls. From `lg` the phone takes the rail's full height instead of a fixed
 * one, because there the rail has a height to give it.
 */
function Phone({ children, title }: { children: React.ReactNode; title: string }) {
  const clockMin = useSim((s) => s.clockMin);

  return (
    <div className="mx-auto flex h-[560px] w-full max-w-[560px] flex-col rounded-[30px] border border-shell-700 bg-shell-950 p-2 shadow-2xl sm:h-[640px] lg:h-full lg:min-h-[420px] lg:max-w-[344px]">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] bg-shell-900">
        {/* Status bar. The time is the simulated clock, so scrubbing the day
            moves it — a static 9:41 would be the one obviously fake thing on
            an otherwise live panel. */}
        <div className="flex shrink-0 items-center justify-between px-4 pt-2.5 pb-1 text-[10px] text-shell-400">
          <span className="font-mono">{formatClock(clockMin)}</span>
          <span className="h-3.5 w-16 rounded-full bg-shell-950" />
          <span className="font-mono tracking-tight">• • ▮</span>
        </div>
        <div className="shrink-0 px-3 pb-2 pt-1">
          <div className="text-[10px] uppercase tracking-[0.16em] text-brass-500">
            SmartSpaces
          </div>
          <div className="text-base font-medium leading-tight text-shell-100">
            {title}
          </div>
        </div>
        <div className="u-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3">
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
 * eight seconds of motor — and this is where that shows: mid-travel the readout
 * gives the live position, which is the detail that tells a client these are
 * motorised tracks rather than an on/off graphic.
 */
function curtainStatus(position: number): string {
  if (position <= 0.5) return "Open";
  if (position >= 99.5) return "Closed";
  return `${Math.round(position)}% closed`;
}

/**
 * One control line with an icon beside it.
 *
 * The phone has no room for "Brightness" and "Colour temperature" spelled out
 * next to every fixture, and two unlabelled rows stacked on a card is a
 * guessing game. The icon says which is which in the width of a character.
 */
function ControlRow({
  icon,
  hint,
  children,
}: {
  icon: IconName;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-shell-500" title={hint} aria-hidden>
        <Icon name={icon} />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  action,
  children,
}: {
  label: string;
  value?: string;
  /** The fixture's power toggle, sat on the header rather than on a track. */
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-shell-800 bg-shell-850/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
          <span className="truncate text-[12px] text-shell-200">{label}</span>
          {value && (
            <span className="shrink-0 font-mono text-[11px] text-shell-400">{value}</span>
          )}
        </div>
        {action}
      </div>
      {children && <div className="mt-2 space-y-2">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Device rows                                                         */
/* ------------------------------------------------------------------ */

/*
 * Each device is its own component for one reason: it needs its own
 * `usePredicted`, and hooks cannot live inside a `.map` in the parent.
 *
 * Two rules run through all of them.
 *
 * **What disables what.** `roomBusy` means a scene is playing out, and locks
 * everything — a scene is a claim about the whole room and a second press
 * mid-sequence leaves it somewhere no scene describes. `moving` means this one
 * device is mid-travel, and locks only its own control. A curtain taking eight
 * seconds must not take the lights with it.
 *
 * **What gets predicted.** Only the properties the simulation is deliberately
 * slow to report: a light's `on` (true for the whole dim-down) and a curtain's
 * open/closed (which flips at the halfway point of an eight-second run).
 * Brightness, colour temperature, fan speed and setpoint all land on the store
 * synchronously, so they are read straight from it — predicting them would add
 * machinery that never fires.
 */

function LightRow({
  device,
  state,
  roomBusy,
  moving,
}: {
  device: LightDevice;
  state: LightState;
  roomBusy: boolean;
  moving: boolean;
}) {
  const patch = useSim((s) => s.patch);
  const [on, predictOn] = usePredicted(state.on, TOGGLE_FADE_MS + 400);

  return (
    <Row
      label={device.name}
      value={on ? `${Math.round(state.level)}%` : "Off"}
      action={
        <Toggle
          on={on}
          disabled={roomBusy || moving}
          label={`${device.name} power`}
          onChange={(next) => {
            predictOn(next);
            patch(device.id, { on: next }, TOGGLE_FADE_MS);
          }}
        />
      }
    >
      <ControlRow icon="sun" hint="Brightness">
        <RampButtons
          label={`${device.name} brightness`}
          value={state.level}
          min={1}
          max={100}
          tapStep={5}
          rampPerSecond={55}
          disabled={roomBusy || !on}
          onChange={(level) => patch(device.id, { level })}
        />
      </ControlRow>
      {device.tunable && (
        <ControlRow icon="dim" hint="Colour temperature">
          <RampButtons
            label={`${device.name} colour temperature`}
            value={state.cct}
            min={device.tunable.minK}
            max={device.tunable.maxK}
            tapStep={100}
            rampPerSecond={1400}
            fill={cctGradient(device.tunable.minK, device.tunable.maxK)}
            disabled={roomBusy || !on}
            onChange={(cct) => patch(device.id, { cct })}
          />
        </ControlRow>
      )}
    </Row>
  );
}

function ShadeLayerRow({
  shade,
  layer,
  position,
  roomBusy,
  moving,
}: {
  shade: ShadeDevice;
  layer: string;
  position: number;
  roomBusy: boolean;
  moving: boolean;
}) {
  const patch = useSim((s) => s.patch);
  const [choice, predictChoice] = usePredicted<"open" | "closed">(
    position > 50 ? "closed" : "open",
    shade.travelMs + 600,
  );

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[10px]">
        <span className="capitalize text-shell-400">{layer}</span>
        {/* Straight from the store, deliberately. The button says what was
            asked for; this says where the fabric actually is. Both are true,
            and the gap between them is the motor. */}
        <span className="font-mono text-shell-300">{curtainStatus(position)}</span>
      </div>
      <Segmented
        disabled={roomBusy || moving}
        label={`${shade.name} ${layer}`}
        value={choice}
        options={[
          { value: "open", label: "Open" },
          { value: "closed", label: "Close" },
        ]}
        onChange={(v) => {
          predictChoice(v);
          patch(shade.id, { [layer]: v === "closed" ? 100 : 0 });
        }}
      />
    </div>
  );
}

function ClimateRow({
  device,
  state,
  roomBusy,
}: {
  device: ClimateDevice;
  state: ClimateState;
  roomBusy: boolean;
}) {
  const patch = useSim((s) => s.patch);

  return (
    <Row
      label={device.name}
      value={`${state.setpointC.toFixed(0)}°C`}
      action={
        <Toggle
          on={state.on}
          disabled={roomBusy}
          label={`${device.name} power`}
          onChange={(on) => patch(device.id, { on })}
        />
      }
    >
      <ControlRow icon="thermo" hint="Target temperature">
        <Stepper
          label={`${device.name} setpoint`}
          value={state.setpointC}
          min={device.minC}
          max={device.maxC}
          format={(v) => `${v.toFixed(0)}°C`}
          disabled={roomBusy || !state.on}
          onChange={(setpointC) => patch(device.id, { setpointC })}
        />
      </ControlRow>
      <div className="text-[10px] text-shell-500">
        Room is {state.currentC.toFixed(1)}°C
      </div>
    </Row>
  );
}

function FanRow({
  device,
  state,
  roomBusy,
}: {
  device: FanDevice;
  state: FanState;
  roomBusy: boolean;
}) {
  const patch = useSim((s) => s.patch);

  return (
    <Row label={device.name} value={state.on ? `Speed ${state.speed}` : "Off"}>
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-1">
          {Array.from({ length: device.speeds }, (_, i) => i + 1).map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => patch(device.id, { speed, on: true })}
              aria-pressed={state.on && state.speed === speed}
              disabled={roomBusy}
              className={`flex-1 rounded-md py-2 text-[11px] font-medium transition-colors ${
                state.on && state.speed === speed
                  ? "bg-brass-600/25 text-brass-300"
                  : "bg-shell-800 text-shell-400 hover:text-shell-200"
              } ${roomBusy ? "pointer-events-none opacity-40" : ""}`}
            >
              {speed}
            </button>
          ))}
        </div>
        <Toggle
          on={state.on}
          disabled={roomBusy}
          label={`${device.name} power`}
          onChange={(on) => patch(device.id, { on })}
        />
      </div>
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* The panel                                                           */
/* ------------------------------------------------------------------ */

export function AppPanel({ view }: { view: AppView }) {
  const space = useSim((s) => s.space);
  const states = useSim((s) => s.states);
  const activeSceneId = useSim((s) => s.activeSceneId);
  const sequence = useSim((s) => s.sequence);
  const busy = useSim((s) => s.busy);
  const busyDevices = useSim((s) => s.busyDevices);
  const applyScene = useSim((s) => s.applyScene);

  if (!space) return null;

  const lights = space.devices.filter((d): d is LightDevice => d.kind === "light");
  const shade = space.devices.find((d): d is ShadeDevice => d.kind === "shade");
  const climate = space.devices.find((d): d is ClimateDevice => d.kind === "climate");
  const fan = space.devices.find((d): d is FanDevice => d.kind === "fan");

  const moving = (id: string) => busyDevices.includes(id);

  return (
    <div className="flex min-h-0 flex-1 flex-col pb-4">
      <Phone title={space.name}>

        {/* A locked interface with no explanation reads as a crash. This is the
            difference between "the room is doing what you asked" and "nothing
            happened when I tapped".

            Scenes only. A single device travelling no longer locks the panel,
            and it announces itself where it is happening — the curtain's own
            readout counting up to Closed — rather than with a banner over
            everything else. */}
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
                <LightRow
                  key={device.id}
                  device={device}
                  state={state}
                  roomBusy={busy}
                  moving={moving(device.id)}
                />
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
                      <ShadeLayerRow
                        key={layer}
                        shade={shade}
                        layer={layer}
                        position={s[layer]}
                        roomBusy={busy}
                        moving={moving(shade.id)}
                      />
                    ))}
                  </Row>
                );
              })()}

            {climate &&
              (() => {
                const s = states[climate.id] as ClimateState | undefined;
                if (!s) return null;
                return (
                  <ClimateRow
                    key={climate.id}
                    device={climate}
                    state={s}
                    roomBusy={busy}
                  />
                );
              })()}

            {fan &&
              (() => {
                const s = states[fan.id] as FanState | undefined;
                if (!s) return null;
                return (
                  <FanRow key={fan.id} device={fan} state={s} roomBusy={busy} />
                );
              })()}
          </div>
        )}
      </Phone>

      <p className="mx-auto mt-3 max-w-[560px] shrink-0 text-[10px] leading-snug text-shell-500 lg:max-w-[344px]">
        Scenes, Controls and the room are one state, not three copies of it. Press
        a scene and every control moves; move one control and the scene lets go.
      </p>
    </div>
  );
}
