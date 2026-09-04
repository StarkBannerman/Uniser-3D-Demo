"use client";

/**
 * Per-device controls.
 *
 * Rendered from the space config, grouped by subsystem, so a new device or a
 * whole new space needs no work here. Selecting a card drives the product
 * panel — that link is the commercial point of the whole tool: a client who
 * likes what a control does immediately sees the part number that does it.
 */

import type {
  AirDevice,
  AirState,
  AvDevice,
  AvState,
  ClimateDevice,
  ClimateMode,
  ClimateState,
  Device,
  LightDevice,
  LightState,
  LockDevice,
  LockState,
  ShadeDevice,
  ShadeLayerId,
  ShadeState,
  SubsystemId,
} from "@/lib/sim/types";
import { useSim, TOGGLE_FADE_MS } from "@/lib/sim/store";
import { getProduct } from "@/lib/catalog/products";
import { hsvToRgb, lightColor, rgbToCss } from "@/lib/sim/photometry";
import {
  ControlCard,
  FieldRow,
  HUE_GRADIENT,
  SectionLabel,
  Segmented,
  Slider,
  Toggle,
  cctGradient,
} from "@/components/ui/Primitives";

/* ------------------------------------------------------------------ */
/* Shared hooks                                                        */
/* ------------------------------------------------------------------ */

function useCard(deviceId: string) {
  const patch = useSim((s) => s.patch);
  const select = useSim((s) => s.select);
  const selected = useSim((s) => s.selectedDeviceId === deviceId);
  return { patch, select, selected };
}

/* ------------------------------------------------------------------ */
/* Lighting                                                            */
/* ------------------------------------------------------------------ */

function LightControl({ device }: { device: LightDevice }) {
  const state = useSim((s) => s.states[device.id] as LightState | undefined);
  const { patch, select, selected } = useCard(device.id);
  if (!state) return null;

  const product = getProduct(device.productId);
  const colored = state.sat > 0;

  return (
    <ControlCard
      title={device.name}
      subtitle={product?.family}
      selected={selected}
      onSelect={() => select(device.id)}
      right={
        <Toggle
          on={state.on}
          label={`${device.name} power`}
          onChange={(on) => patch(device.id, { on }, TOGGLE_FADE_MS)}
        />
      }
    >
      <div className={state.on ? undefined : "opacity-55"}>
        <div className="space-y-2.5">
          <FieldRow label="Brightness" value={`${Math.round(state.level)}%`}>
            <Slider
              label={`${device.name} brightness`}
              value={state.level}
              min={0}
              max={100}
              fill={rgbToCss(lightColor(state))}
              // Dragging up from zero switches the fixture on, which is how
              // every dimmer app behaves and saves a second in the pitch.
              onChange={(level) => patch(device.id, { level, on: level > 0 })}
            />
          </FieldRow>

          {device.tunable && !colored && (
            <FieldRow
              label="Colour temperature"
              value={`${Math.round(state.cct)}K`}
            >
              <Slider
                label={`${device.name} colour temperature`}
                value={state.cct}
                min={device.tunable.minK}
                max={device.tunable.maxK}
                step={50}
                fill={cctGradient(device.tunable.minK, device.tunable.maxK)}
                onChange={(cct) => patch(device.id, { cct })}
              />
            </FieldRow>
          )}

          {device.rgb && (
            <>
              <Segmented
                label="Colour mode"
                value={colored ? "colour" : "white"}
                options={[
                  { value: "white", label: "White" },
                  { value: "colour", label: "Colour" },
                ]}
                onChange={(mode) =>
                  patch(device.id, { sat: mode === "colour" ? 85 : 0 }, 600)
                }
              />
              {colored && (
                <>
                  <FieldRow label="Hue" value={`${Math.round(state.hue)}°`}>
                    <Slider
                      label={`${device.name} hue`}
                      value={state.hue}
                      min={0}
                      max={360}
                      fill={HUE_GRADIENT}
                      onChange={(hue) => patch(device.id, { hue })}
                    />
                  </FieldRow>
                  <FieldRow
                    label="Saturation"
                    value={`${Math.round(state.sat)}%`}
                  >
                    <Slider
                      label={`${device.name} saturation`}
                      value={state.sat}
                      min={0}
                      max={100}
                      fill={rgbToCss(hsvToRgb(state.hue, 1, 1))}
                      onChange={(sat) => patch(device.id, { sat })}
                    />
                  </FieldRow>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </ControlCard>
  );
}

/* ------------------------------------------------------------------ */
/* Shades                                                              */
/* ------------------------------------------------------------------ */

const SHADE_LABEL: Record<ShadeLayerId, string> = {
  sheer: "Sheer",
  blackout: "Blackout",
};

function ShadeControl({ device }: { device: ShadeDevice }) {
  const state = useSim((s) => s.states[device.id] as ShadeState | undefined);
  const { patch, select, selected } = useCard(device.id);
  if (!state) return null;

  const product = getProduct(device.productId);
  const setAll = (position: number) => {
    const next: Record<string, number> = {};
    for (const layer of device.layers) next[layer] = position;
    patch(device.id, next);
  };

  return (
    <ControlCard
      title={device.name}
      subtitle={product?.family}
      selected={selected}
      onSelect={() => select(device.id)}
    >
      {device.layers.map((layer) => (
        <FieldRow
          key={layer}
          label={SHADE_LABEL[layer]}
          value={`${Math.round(state[layer])}% closed`}
        >
          <Slider
            label={`${device.name} ${layer}`}
            value={state[layer]}
            min={0}
            max={100}
            onChange={(v) => patch(device.id, { [layer]: v })}
          />
        </FieldRow>
      ))}
      <div className="flex gap-2 pt-0.5">
        <button
          type="button"
          onClick={() => setAll(0)}
          className="flex-1 rounded-lg bg-shell-800 px-2 py-1.5 text-xs text-shell-200 hover:bg-shell-700"
        >
          Open all
        </button>
        <button
          type="button"
          onClick={() => setAll(100)}
          className="flex-1 rounded-lg bg-shell-800 px-2 py-1.5 text-xs text-shell-200 hover:bg-shell-700"
        >
          Close all
        </button>
      </div>
    </ControlCard>
  );
}

/* ------------------------------------------------------------------ */
/* Climate                                                             */
/* ------------------------------------------------------------------ */

function ClimateControl({ device }: { device: ClimateDevice }) {
  const state = useSim((s) => s.states[device.id] as ClimateState | undefined);
  const { patch, select, selected } = useCard(device.id);
  if (!state) return null;

  const product = getProduct(device.productId);

  return (
    <ControlCard
      title={device.name}
      subtitle={product?.family}
      selected={selected}
      onSelect={() => select(device.id)}
      right={
        <Toggle
          on={state.on}
          label={`${device.name} power`}
          onChange={(on) => patch(device.id, { on })}
        />
      }
    >
      <div className={state.on ? undefined : "opacity-55"}>
        <div className="space-y-2.5">
          <FieldRow
            label="Setpoint"
            value={`${state.setpointC.toFixed(1)}°C · room ${state.currentC.toFixed(1)}°C`}
          >
            <Slider
              label={`${device.name} setpoint`}
              value={state.setpointC}
              min={device.minC}
              max={device.maxC}
              step={0.5}
              fill="var(--color-brass-500)"
              onChange={(setpointC) => patch(device.id, { setpointC })}
            />
          </FieldRow>
          <Segmented
            label="Mode"
            value={state.mode}
            options={[
              { value: "cool" as ClimateMode, label: "Cool" },
              { value: "heat" as ClimateMode, label: "Heat" },
              { value: "fan" as ClimateMode, label: "Fan" },
              { value: "dry" as ClimateMode, label: "Dry" },
            ]}
            onChange={(mode) => patch(device.id, { mode })}
          />
          <Segmented
            label="Fan speed"
            value={state.fan}
            options={[
              { value: 0, label: "Auto" },
              { value: 1, label: "Low" },
              { value: 2, label: "Med" },
              { value: 3, label: "High" },
            ]}
            onChange={(fan) => patch(device.id, { fan })}
          />
        </div>
      </div>
    </ControlCard>
  );
}

/* ------------------------------------------------------------------ */
/* Entertainment                                                       */
/* ------------------------------------------------------------------ */

function AvControl({ device }: { device: AvDevice }) {
  const state = useSim((s) => s.states[device.id] as AvState | undefined);
  const { patch, select, selected } = useCard(device.id);
  if (!state) return null;

  const product = getProduct(device.productId);

  return (
    <ControlCard
      title={device.name}
      subtitle={product?.family}
      selected={selected}
      onSelect={() => select(device.id)}
      right={
        <Toggle
          on={state.on}
          label={`${device.name} power`}
          onChange={(on) => patch(device.id, { on })}
        />
      }
    >
      <div className={state.on ? undefined : "opacity-55"}>
        <div className="space-y-2.5">
          <Segmented
            label="Source"
            value={state.source}
            options={device.sources.map((s) => ({ value: s, label: s }))}
            onChange={(source) => patch(device.id, { source })}
          />
          <FieldRow label="Volume" value={`${Math.round(state.volume)}`}>
            <Slider
              label={`${device.name} volume`}
              value={state.volume}
              min={0}
              max={100}
              onChange={(volume) => patch(device.id, { volume })}
            />
          </FieldRow>
          {device.hasScreen && (
            <FieldRow
              label="Projector screen"
              value={`${Math.round(state.screen)}% down`}
            >
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => patch(device.id, { screen: 100 })}
                  className="flex-1 rounded-lg bg-shell-800 px-2 py-1.5 text-xs text-shell-200 hover:bg-shell-700"
                >
                  Lower
                </button>
                <button
                  type="button"
                  onClick={() => patch(device.id, { screen: 0 })}
                  className="flex-1 rounded-lg bg-shell-800 px-2 py-1.5 text-xs text-shell-200 hover:bg-shell-700"
                >
                  Raise
                </button>
              </div>
            </FieldRow>
          )}
        </div>
      </div>
    </ControlCard>
  );
}

/* ------------------------------------------------------------------ */
/* Access                                                              */
/* ------------------------------------------------------------------ */

function LockControl({ device }: { device: LockDevice }) {
  const state = useSim((s) => s.states[device.id] as LockState | undefined);
  const { patch, select, selected } = useCard(device.id);
  if (!state) return null;

  const product = getProduct(device.productId);

  return (
    <ControlCard
      title={device.name}
      subtitle={product?.family}
      selected={selected}
      onSelect={() => select(device.id)}
      right={
        <Toggle
          on={state.locked}
          label={`${device.name} lock`}
          onChange={(locked) => patch(device.id, { locked })}
        />
      }
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-shell-400">
          {state.doorbell
            ? "Doorbell ringing"
            : state.locked
              ? "Locked"
              : "Unlocked"}
        </span>
        <button
          type="button"
          onClick={() => {
            patch(device.id, { doorbell: true });
            // Momentary, like the real thing.
            window.setTimeout(() => patch(device.id, { doorbell: false }), 3000);
          }}
          className="rounded-lg bg-shell-800 px-2.5 py-1.5 text-xs text-shell-200 hover:bg-shell-700"
        >
          Ring doorbell
        </button>
      </div>
    </ControlCard>
  );
}

/* ------------------------------------------------------------------ */
/* Air and scent                                                       */
/* ------------------------------------------------------------------ */

function AirControl({ device }: { device: AirDevice }) {
  const state = useSim((s) => s.states[device.id] as AirState | undefined);
  const { patch, select, selected } = useCard(device.id);
  if (!state) return null;

  const product = getProduct(device.productId);

  return (
    <ControlCard
      title={device.name}
      subtitle={product?.family}
      selected={selected}
      onSelect={() => select(device.id)}
      right={
        <Toggle
          on={state.on}
          label={`${device.name} power`}
          onChange={(on) => patch(device.id, { on })}
        />
      }
    >
      {device.hasSpeed && (
        <div className={state.on ? undefined : "opacity-55"}>
          <Segmented
            label={`${device.name} speed`}
            value={state.speed}
            options={[
              { value: 1, label: "Low" },
              { value: 2, label: "Med" },
              { value: 3, label: "High" },
            ]}
            onChange={(speed) => patch(device.id, { speed })}
          />
        </div>
      )}
    </ControlCard>
  );
}

/* ------------------------------------------------------------------ */
/* Grouping                                                            */
/* ------------------------------------------------------------------ */

/** Sensors, solar and specialty readouts live in the sensor strip instead. */
const CONTROLLABLE: Device["kind"][] = [
  "light",
  "shade",
  "climate",
  "av",
  "lock",
  "air",
];

const GROUP_ORDER: SubsystemId[] = [
  "lighting",
  "specialty",
  "shades",
  "climate",
  "av",
  "access",
  "air",
];

const GROUP_LABEL: Record<SubsystemId, string> = {
  lighting: "Lighting",
  specialty: "Signature",
  shades: "Shading",
  climate: "Climate",
  av: "Entertainment",
  access: "Access",
  air: "Air",
  sensors: "Sensors",
  energy: "Energy",
};

function DeviceControl({ device }: { device: Device }) {
  switch (device.kind) {
    case "light":
      return <LightControl device={device} />;
    case "shade":
      return <ShadeControl device={device} />;
    case "climate":
      return <ClimateControl device={device} />;
    case "av":
      return <AvControl device={device} />;
    case "lock":
      return <LockControl device={device} />;
    case "air":
      return <AirControl device={device} />;
    default:
      return null;
  }
}

export function DeviceControls() {
  const space = useSim((s) => s.space);
  if (!space) return null;

  const devices = space.devices.filter((d) => CONTROLLABLE.includes(d.kind));

  return (
    <div className="space-y-1">
      {GROUP_ORDER.map((group) => {
        const inGroup = devices.filter((d) => d.subsystem === group);
        if (inGroup.length === 0) return null;
        return (
          <section key={group}>
            <SectionLabel>{GROUP_LABEL[group]}</SectionLabel>
            <div className="space-y-2">
              {inGroup.map((device) => (
                <DeviceControl key={device.id} device={device} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
