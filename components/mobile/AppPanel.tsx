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

import { useEffect, useRef, useState } from "react";
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
  HUE_GRADIENT,
  RampButtons,
  Segmented,
  Stepper,
  Toggle,
} from "@/components/ui/Primitives";
import { cctToRgb, hsvToRgb, rgbToCss } from "@/lib/sim/photometry";
import { usePredicted } from "@/components/ui/usePredicted";
import { Icon, sceneIcon, type IconName } from "@/components/keypad/icons";
import { BuildingAutomation } from "@/components/panels/BuildingAutomation";

/**
 * Which half of the app is showing.
 *
 * Driven from the rail's tabs rather than from a second row of tabs inside the
 * phone. Two tab strips one above the other for the same three destinations was
 * a nesting nobody could parse at a glance.
 */
export type AppView = "scenes" | "controls" | "automation";

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
function Phone({
  children,
  title,
  status,
}: {
  children: React.ReactNode;
  title: string;
  /** What the room is doing, or null when it is sitting still. */
  status: string | null;
}) {
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
          {/* Always rendered, even when empty. A status that appears and
              disappears pushes everything below it down and back up again, so
              the grid someone is reaching for moves while they reach. Holding
              the line costs 14px and the panel never jumps. */}
          <div className="h-3.5 truncate text-[10px] leading-[14px] text-brass-300">
            {status}
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

/**
 * The colour a full-colour circuit can be set to, in one tap.
 *
 * Hue and saturation rather than hex, because the renderer works in the
 * same colour model the rest of the lighting does — `tintLinear` takes the
 * pure hue at unit luminance and mixes toward it by `sat`, so a swatch is
 * a point on that mix rather than an sRGB triple. The numbers below are
 * the HSV of the specified hex values, which is why they are not round.
 *
 * White is not in the list: it is `sat: 0`, which hands the fixture back
 * to its colour-temperature control, and it gets its own chip so that the
 * way out of colour is as obvious as the way in.
 */
const COLOUR_SWATCHES: { label: string; hex?: string; hue: number; sat: number; cct?: number }[] = [
  { label: "Amber", hex: "#ffb36b", hue: 29, sat: 58 },
  { label: "Deep blue", hex: "#3d5cff", hue: 230, sat: 76 },
  { label: "Teal", hex: "#2ad1c9", hue: 177, sat: 80 },
  { label: "Magenta", hex: "#d93aa8", hue: 319, sat: 73 },
];

/**
 * What colour a chip should be painted, when the space did not say.
 *
 * The four above carry a hex because they were picked as hex and their
 * hue and saturation were measured back off it. A circuit that declares
 * its own list gives hue and saturation only — those are what the
 * renderer consumes — so the chip is derived the same way the shader
 * derives the light: the pure hue at full value, or the blackbody colour
 * when the preset is a white one.
 */
function swatchCss(sw: { hex?: string; hue: number; sat: number; cct?: number }): string {
  if (sw.hex) return sw.hex;
  if (sw.sat <= 0) return rgbToCss(cctToRgb(sw.cct ?? 2700));
  return rgbToCss(hsvToRgb(sw.hue, Math.max(sw.sat, 45) / 100, 1));
}

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
  const hover = useSim((s) => s.hover);
  const selected = useSim((s) => s.selectedDeviceId === device.id);
  const ref = useRef<HTMLDivElement>(null);
  const [on, predictOn] = usePredicted(state.on, TOGGLE_FADE_MS + 400);

  /**
   * Pointed at from the room.
   *
   * `selectedDeviceId` has been in the store a long time with nothing mounted
   * that renders it, so setting it was a no-op you could not see — which is
   * exactly what a hotspot tap did before this. The ring and the scroll are
   * what turn "the store knows" into "the presenter can tell".
   *
   * `block: "nearest"` rather than `center`, because the phone is a short
   * scrolling column and centring a row that is already visible jumps the
   * list for no reason anyone watching would understand.
   */
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  return (
    <div
      ref={ref}
      // Hovering a row lights that circuit's marker on the room, which is
      // the cheapest possible answer to "which of these is the cove?".
      onPointerEnter={() => hover(device.id)}
      onPointerLeave={() => hover(null)}
      className={
        selected ? "rounded-xl ring-1 ring-brass-500/70 transition-shadow" : undefined
      }
    >
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
          /* Not `state.level`. Switching a light off keeps its level so it
             comes back at the brightness it left — correct in the simulation,
             and the reason an unlit fixture was sitting there showing a bar
             filled to 60%. Off means an empty meter. */
          value={on ? state.level : 1}
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
      {device.rgb && (
        <ControlRow icon="bulb" hint="Colour">
          {/**
            * The circuit's own presets, or the house four.
            *
            * `swatches` on the device is a property of the installation
            * rather than of this panel: a credenza shelf wants brand
            * colours and a living room wants the warm half of the wheel.
            * A circuit that declares none keeps the four that were here
            * before, which is still right for one nobody has thought
            * about.
            */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={roomBusy || !on}
              onClick={() => patch(device.id, { sat: 0 })}
              aria-pressed={state.sat <= 0}
              aria-label={`${device.name} white`}
              className={`rounded-md border px-2 py-1 text-[10px] transition-colors disabled:opacity-40 ${
                state.sat <= 0
                  ? "border-brass-700 bg-shell-800 text-brass-300"
                  : "border-shell-800 text-shell-400 hover:text-shell-200"
              }`}
            >
              White
            </button>
            {(device.swatches ?? COLOUR_SWATCHES).map((swatch) => {
              // Near enough counts: a scene fade passes through intermediate
              // hues, and a chip that only lights on an exact match would be
              // off for most of every transition. A white preset is matched
              // on its colour temperature instead, because at saturation
              // zero the hue it carries is not what anybody is looking at.
              const chosen =
                swatch.sat <= 0
                  ? state.sat <= 0 &&
                    Math.abs(state.cct - (swatch.cct ?? state.cct)) <= 80
                  : state.sat > 0 &&
                    Math.abs(((state.hue - swatch.hue + 540) % 360) - 180) > 174;
              return (
                <button
                  key={swatch.label}
                  type="button"
                  disabled={roomBusy || !on}
                  onClick={() =>
                    patch(device.id, {
                      hue: swatch.hue,
                      sat: swatch.sat,
                      ...(swatch.cct === undefined ? {} : { cct: swatch.cct }),
                    })
                  }
                  aria-pressed={chosen}
                  aria-label={`${device.name} ${swatch.label.toLowerCase()}`}
                  title={swatch.label}
                  style={{ backgroundColor: swatchCss(swatch) }}
                  className={`h-5 w-5 rounded-full transition disabled:opacity-40 ${
                    chosen
                      ? "ring-2 ring-brass-300 ring-offset-1 ring-offset-shell-900"
                      : "ring-1 ring-black/40 hover:scale-110"
                  }`}
                />
              );
            })}
            {/**
              * The fourth die, as the one control it really is.
              *
              * RGBW is not another colour channel to the renderer: the
              * white emitter fires alongside the coloured ones and the
              * result lands part way between the hue and the fixture's
              * own white, which is exactly what `sat` already means to
              * `tintLinear`. So the chip moves saturation between two
              * values rather than inventing a channel — pressed, the
              * colour is diluted with white; released, it is the pure
              * hue. A plain RGB strip never shows it.
              */}
            {device.rgbw && (
              <button
                type="button"
                disabled={roomBusy || !on || state.sat <= 0}
                onClick={() => patch(device.id, { sat: state.sat <= 70 ? 95 : 60 }, 600)}
                aria-pressed={state.sat > 0 && state.sat <= 70}
                aria-label={`${device.name} white channel`}
                title="Add the white emitter"
                className={`h-5 rounded-md border px-1.5 text-[9px] font-semibold leading-[1.1rem] transition-colors disabled:opacity-30 ${
                  state.sat > 0 && state.sat <= 70
                    ? "border-brass-700 bg-shell-800 text-brass-300"
                    : "border-shell-800 text-shell-400 hover:text-shell-200"
                }`}
              >
                W
              </button>
            )}
          </div>
        </ControlRow>
      )}
      {/**
        * The hue itself, for a circuit whose space asked for the full
        * control rather than four chips.
        *
        * Gated on `swatches` so the cabin's shelves and the restaurant's
        * wash keep the card they have had all along. A room that declares
        * its own eight presets is a room where the colour is the point,
        * and in that one the chips are a shortcut rather than the whole
        * control.
        */}
      {device.rgb && device.swatches && (
        <ControlRow icon="bulb" hint="Hue">
          <RampButtons
            label={`${device.name} hue`}
            value={state.hue}
            min={0}
            max={360}
            tapStep={10}
            rampPerSecond={90}
            fill={HUE_GRADIENT}
            disabled={roomBusy || !on || state.sat <= 0}
            onChange={(hue) => patch(device.id, { hue })}
          />
        </ControlRow>
      )}
    </Row>
    </div>
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
  const settleMs = useSim((s) => s.settleMs);
  const sceneRunId = useSim((s) => s.sceneRunId);

  /**
   * True from a scene press until the room has finished landing.
   *
   * Owned here rather than read off the store because the store's `busy` is an
   * input lock with its own, shorter life — see `settleMs`. A timer started by
   * the press is the only thing that reliably spans the whole fade.
   */
  const [settling, setSettling] = useState(false);
  useEffect(() => {
    if (sceneRunId === 0 || settleMs <= 0) return;
    setSettling(true);
    const timer = setTimeout(() => setSettling(false), settleMs);
    return () => clearTimeout(timer);
  }, [sceneRunId, settleMs]);
  const busyDevices = useSim((s) => s.busyDevices);
  const applyScene = useSim((s) => s.applyScene);
  const stageStatic = useSim((s) => s.stageStatic);
  const selectionId = useSim((s) => s.selectionId);
  const setSelection = useSim((s) => s.setSelection);

  if (!space) return null;

  const lights = space.devices.filter((d): d is LightDevice => d.kind === "light");
  const shade = space.devices.find((d): d is ShadeDevice => d.kind === "shade");
  const climate = space.devices.find((d): d is ClimateDevice => d.kind === "climate");
  const fan = space.devices.find((d): d is FanDevice => d.kind === "fan");

  const moving = (id: string) => busyDevices.includes(id);

  /**
   * One line for what the room is doing: the stage of a staged scene, or just
   * the scene's name for one that lands in a single fade. Null at rest, which
   * leaves the reserved line blank rather than removing it.
   */
  const status = sequence
    ? sequence.label
    : settling
      ? `Setting ${space.scenes.find((s) => s.id === activeSceneId)?.name ?? "the scene"}…`
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col pb-4">
      <Phone title={space.name} status={status}>

        {view === "scenes" && (
          <div className="space-y-2">
            {/* Every scene, including the ones the four-gang plate could not
                fit. That split is the argument for having an app at all. */}
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-2">
              {space.scenes.map((scene) => {
                const active = scene.id === activeSceneId;
                const running = Boolean(sequence && sequence.sceneId === scene.id);
                /**
                 * One scene at a time, and the rest go quiet until it lands.
                 *
                 * This reverses an earlier decision, which was that a scene
                 * press is always safe — it sets every device, so unlike a
                 * half-moved slider it cannot leave the room in a state no
                 * scene describes, and `applyScene` already cancels whatever
                 * is in flight. All true, and it still read as ambiguous: a
                 * room mid-fade with six live buttons does not look like a
                 * room that is doing something.
                 *
                 * The button that was pressed stays lit and keeps its
                 * progress, so what is disabled is only the thing you should
                 * not be pressing yet.
                 */
                const owns = running || (settling && !sequence && active);
                // A still stage cannot show a scene, so the buttons say so.
                const blocked =
                  stageStatic || ((settling || Boolean(sequence)) && !owns);
                return (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => applyScene(scene.id)}
                    aria-pressed={active}
                    disabled={blocked}
                    className={`relative overflow-hidden rounded-xl border px-2.5 py-2.5 text-left transition-[color,background-color,border-color,opacity] ${
                      active
                        ? "border-brass-600/70 bg-brass-600/15 text-brass-300"
                        : "border-shell-800 bg-shell-850/60 text-shell-300"
                    } ${
                      blocked
                        ? "cursor-not-allowed opacity-40"
                        : active
                          ? ""
                          : "hover:border-shell-700"
                    }`}
                  >
                    {/* Progress sits on the button that was pressed, rather
                        than on a separate bar further down the panel. A staged
                        scene takes twenty seconds, and the one thing a person
                        needs to know during them is that the thing they touched
                        is working — so that is where it is said.

                        Along the bottom edge rather than filling the button: a
                        full-height fill put a hard vertical edge straight
                        through the scene's name, which read as a glitch. */}
                    {(running || (settling && !sequence && active)) && (
                      <span
                        aria-hidden
                        className="absolute inset-x-0 bottom-0 h-[3px] bg-shell-800"
                      >
                        {running ? (
                          /* Staged: by stage, because the stages are the
                             demonstration and a stage landing is the thing
                             worth marking. */
                          <span
                            className="block h-full rounded-r-full bg-brass-400 transition-[width] duration-500 ease-linear"
                            style={{
                              width: `${(sequence!.step / sequence!.total) * 100}%`,
                            }}
                          />
                        ) : (
                          /* A single fade has no stages, so it runs on the
                             clock — against the room's own hold, not a guess,
                             so it finishes exactly when the room settles.
                             Keyed on the press so pressing the same scene
                             twice restarts it rather than leaving it full. */
                          <span
                            key={sceneRunId}
                            className="block h-full rounded-r-full bg-brass-400"
                            style={{
                              animation: `scene-progress ${settleMs}ms linear forwards`,
                            }}
                          />
                        )}
                      </span>
                    )}
                    <span className="relative flex flex-col items-start gap-1.5">
                      <Icon name={sceneIcon(scene)} />
                      <span className="text-[11px] font-medium leading-tight">
                        {scene.name}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="px-1 text-[10px] leading-snug text-shell-500">
              {activeSceneId
                ? space.scenes.find((s) => s.id === activeSceneId)?.blurb
                : "Adjusted by hand — no scene active."}
            </p>
            {/* The same presets, three ways in. Worth saying out loud: a
                client looking at a phone assumes the phone is the system,
                and the thing actually being sold is the plate on the wall. */}
            {space.keypad && (
              <p className="px-1 text-[10px] leading-snug text-shell-600">
                Recall any of these from the {space.keypad.finish} keypad, this app,
                or voice.
              </p>
            )}
          </div>
        )}

        {/*
          The selection picker, for a space that declares one.
          
          Above the circuits rather than among them, because picking a car is
          not a dimmer: it changes what several of the circuits below are
          *for*, and the scenes that aim at the selection follow it live.
        */}
        {view === "automation" && <BuildingAutomation />}

        {view === "controls" && space.selection && (
          <div className="mb-1.5">
            <div className="px-1 pb-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-shell-500">
              {space.selection.label}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {space.selection.options.map((option) => {
                const chosen =
                  (selectionId ?? space.selection!.defaultDeviceId) === option.deviceId;
                return (
                  <button
                    key={option.deviceId}
                    type="button"
                    onClick={() => setSelection(option.deviceId)}
                    aria-pressed={chosen}
                    className={`rounded-lg border px-2 py-1.5 text-left text-[11px] transition-colors ${
                      chosen
                        ? "border-brass-600/70 bg-shell-800 text-shell-100"
                        : "border-shell-800 text-shell-400 hover:text-shell-200"
                    }`}
                  >
                    {option.name}
                  </button>
                );
              })}
            </div>
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
