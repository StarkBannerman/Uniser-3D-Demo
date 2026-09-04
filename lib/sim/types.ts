/**
 * Core simulation types.
 *
 * Nothing in `lib/sim` knows anything about Uniser. Spaces, devices, scenes and
 * automation rules are all declarative data (see `lib/spaces`), so adding a new
 * demo space or product means adding a config file, not writing components.
 */

export type Segment = "commercial" | "residential";

export type SubsystemId =
  | "lighting"
  | "shades"
  | "climate"
  | "av"
  | "access"
  | "sensors"
  | "energy"
  | "air"
  | "specialty";

export type DeviceKind =
  | "light"
  | "shade"
  | "climate"
  | "av"
  | "lock"
  | "sensor"
  | "solar"
  | "air";

/* ------------------------------------------------------------------ */
/* Render hints                                                        */
/* ------------------------------------------------------------------ */

export type GlowShape = "pool" | "strip" | "cone" | "panel" | "ambient";

/**
 * Where a fixture's light lands, in normalized space coordinates (0..1 of the
 * canvas). Authored once per space; the renderer scales these to whatever
 * viewBox or photo it is drawing into, which is what lets the illustrated and
 * photoreal renderers share one lighting model.
 */
export interface GlowSpec {
  shape: GlowShape;
  /** Fixture / light-centre position, 0..1. */
  x: number;
  y: number;
  /** `pool` and `cone`: radius as a fraction of canvas width. */
  radius?: number;
  /** `strip`, `panel` and `ambient`: size as a fraction of the canvas. */
  w?: number;
  h?: number;
  /** `cone`: direction in degrees, 0 = straight down, negative = tilted left. */
  angle?: number;
  /** `cone`: beam spread in degrees (full angle). */
  spread?: number;
  /** `cone`: throw length as a fraction of canvas height. */
  reach?: number;
  /** Brightness multiplier for this glow, ~0.2..1.6. Default 1. */
  intensity?: number;
  /** Extra softness in canvas-width fractions. Default varies per shape. */
  blur?: number;
}

/* ------------------------------------------------------------------ */
/* Device definitions (static)                                         */
/* ------------------------------------------------------------------ */

interface DeviceBase {
  id: string;
  name: string;
  zoneId: string;
  /** Key into `lib/catalog/products.ts` — what the client would actually buy. */
  productId: string;
  subsystem: SubsystemId;
  /** One line the salesperson can read aloud. */
  pitch?: string;
}

export interface LightDevice extends DeviceBase {
  kind: "light";
  dimmable: boolean;
  /** Present if the fixture is tunable white. */
  tunable?: { minK: number; maxK: number };
  /** Present if the fixture can do saturated colour. */
  rgb?: boolean;
  /** Number of physical fixtures this control represents. */
  fixtures: number;
  wattsEach: number;
  lumensEach: number;
  /**
   * What a conventional (halogen / CFL / T5) fixture doing the same job would
   * draw. Drives the energy baseline; omit to exclude from the comparison.
   */
  baselineWattsEach?: number;
  glow: GlowSpec[];
}

export type ShadeLayerId = "sheer" | "blackout";

export interface ShadeDevice extends DeviceBase {
  kind: "shade";
  layers: ShadeLayerId[];
  /** Motor draw while travelling. Negligible, but honest. */
  watts: number;
  /** Full open -> fully closed travel time. */
  travelMs: number;
  /** Window opening in normalized space coordinates. */
  window: { x: number; y: number; w: number; h: number };
  /** Which side(s) the panels draw from. */
  draw?: "both" | "left" | "right";
}

export interface ClimateDevice extends DeviceBase {
  kind: "climate";
  minC: number;
  maxC: number;
  /** Compressor + fan draw at full load. */
  ratedWatts: number;
}

export interface AvDevice extends DeviceBase {
  kind: "av";
  sources: string[];
  /** True if a motorized projector screen is part of the package. */
  hasScreen?: boolean;
  ratedWatts: number;
  /** Screen position in normalized space coordinates, if `hasScreen`. */
  screenRect?: { x: number; y: number; w: number; h: number };
  /** Full stow -> fully deployed travel time. */
  screenTravelMs?: number;
  /**
   * Light the display itself throws when it is on and the projector screen is
   * stowed — a television in a dark room is a light source, and the space owns
   * that geometry rather than the renderer.
   */
  glow?: GlowSpec[];
}

export interface LockDevice extends DeviceBase {
  kind: "lock";
}

export type SensorMetric =
  | "occupancy"
  | "lux"
  | "temperature"
  | "humidity"
  | "co2"
  | "pm25";

export interface SensorDevice extends DeviceBase {
  kind: "sensor";
  metric: SensorMetric;
  unit: string;
  /**
   * Sensors the engine computes from the rest of the simulation (lux from the
   * lights and the sun, temperature from the AC) are `derived` — the UI shows
   * them read-only. The rest the presenter can set by hand, which is how you
   * demo cause and effect.
   */
  derived?: boolean;
  min?: number;
  max?: number;
}

export interface SolarDevice extends DeviceBase {
  kind: "solar";
  /** Array size in kWp. */
  kwp: number;
  batteryKwh?: number;
}

export interface AirDevice extends DeviceBase {
  kind: "air";
  ratedWatts: number;
  /** Scent diffusers have no fan speed; purifiers do. */
  hasSpeed?: boolean;
}

export type Device =
  | LightDevice
  | ShadeDevice
  | ClimateDevice
  | AvDevice
  | LockDevice
  | SensorDevice
  | SolarDevice
  | AirDevice;

/* ------------------------------------------------------------------ */
/* Device state (dynamic)                                              */
/* ------------------------------------------------------------------ */

export interface LightState {
  on: boolean;
  /** Dimmer level 0..100 as set on the control, not physical output. */
  level: number;
  /** Correlated colour temperature in kelvin. */
  cct: number;
  /** 0..360. Only meaningful when `sat` > 0. */
  hue: number;
  /** 0..100. At 0 the fixture renders as white at `cct`. */
  sat: number;
}

/** 0 = fully open, 100 = fully closed. */
export interface ShadeState {
  sheer: number;
  blackout: number;
}

export type ClimateMode = "cool" | "heat" | "fan" | "dry";

export interface ClimateState {
  on: boolean;
  setpointC: number;
  mode: ClimateMode;
  /** 0 = auto, 1..3 = low/med/high. */
  fan: number;
  /** Simulated room temperature, drifts toward the setpoint. */
  currentC: number;
}

export interface AvState {
  on: boolean;
  source: string;
  volume: number;
  /** Projector screen deployment, 0 = stowed, 100 = fully down. */
  screen: number;
}

export interface LockState {
  locked: boolean;
  /** Set briefly when the doorbell is pressed, for the Welcome Home demo. */
  doorbell: boolean;
}

export interface SensorState {
  value: number;
}

export interface SolarState {
  /** Instantaneous generation in watts. */
  generationW: number;
}

export interface AirState {
  on: boolean;
  speed: number;
}

export type DeviceState =
  | LightState
  | ShadeState
  | ClimateState
  | AvState
  | LockState
  | SensorState
  | SolarState
  | AirState;

/**
 * A partial state write. Scenes and rules are authored as plain objects keyed by
 * device id, which is far nicer to write than a discriminated array; the trade
 * is that this type is permissive. `validateSpace` checks every patch key
 * against its device kind at load time so authoring mistakes surface in dev
 * rather than silently doing nothing.
 */
export type StatePatch = Record<string, number | boolean | string>;

/* ------------------------------------------------------------------ */
/* Scenes                                                             */
/* ------------------------------------------------------------------ */

export interface Scene {
  id: string;
  name: string;
  /** Single glyph or short emoji shown on the scene pad. */
  icon: string;
  /** Shown under the scene name — the salesperson's cue. */
  blurb: string;
  /** Default fade for every target in this scene. */
  fadeMs: number;
  /** Device id -> partial state. Per-device `fadeMs` overrides the default. */
  targets: Record<string, StatePatch & { fadeMs?: number }>;
  /** Products worth calling out while this scene is running. */
  highlight?: string[];
}

/* ------------------------------------------------------------------ */
/* Automation rules                                                    */
/* ------------------------------------------------------------------ */

interface RuleBase {
  id: string;
  name: string;
  /** Why this rule exists, in client-facing language. */
  explain: string;
  enabledByDefault: boolean;
}

export interface OccupancyRule extends RuleBase {
  kind: "occupancy";
  sensorId: string;
  /** Minutes of vacancy before the vacant action fires (simulated minutes). */
  holdMin: number;
  onOccupied: Record<string, StatePatch & { fadeMs?: number }>;
  onVacant: Record<string, StatePatch & { fadeMs?: number }>;
}

export interface DaylightRule extends RuleBase {
  kind: "daylight";
  /** Fixtures the rule is allowed to trim. */
  deviceIds: string[];
  /**
   * Illuminance the space is designed to. Daylight supplying this much means
   * the fixtures trim all the way to `minLevel`; daylight supplying half of it
   * trims them to half their commanded level.
   *
   * This is a feed-forward trim against the *daylight* component only, never a
   * feedback loop on measured total illuminance — a ceiling sensor reads the
   * fixtures' own output, so closing the loop on it makes the fixtures chase
   * themselves and, at night, drive the room to full output to hit the setpoint.
   */
  targetLux: number;
  /** The rule will not dim below this level. */
  minLevel: number;
}

export interface CircadianRule extends RuleBase {
  kind: "circadian";
  deviceIds: string[];
  /** Breakpoints in minutes-past-midnight, interpolated across the day. */
  curve: { min: number; cct: number }[];
}

export interface ScheduleRule extends RuleBase {
  kind: "schedule";
  /** Minutes past midnight, or a solar event. */
  at: number | "dawn" | "dusk";
  targets: Record<string, StatePatch & { fadeMs?: number }>;
}

export type Rule = OccupancyRule | DaylightRule | CircadianRule | ScheduleRule;

/* ------------------------------------------------------------------ */
/* Zones and spaces                                                    */
/* ------------------------------------------------------------------ */

export interface Zone {
  id: string;
  name: string;
  /** Floor area, used for lux and energy density. */
  areaM2: number;
}

export interface SpaceEnvironment {
  /** Local sunrise / sunset in minutes past midnight. */
  sunriseMin: number;
  sunsetMin: number;
  /** Clear-sky horizontal illuminance at solar noon, lux. */
  outdoorPeakLux: number;
  /** Fraction of outdoor lux that reaches the room through unshaded glazing. */
  windowFactor: number;
  /** Lux the space is designed to, used to scale apparent room brightness. */
  designLux: number;
  /** Outdoor temperature swing, drives the climate simulation. */
  outdoorMinC: number;
  outdoorMaxC: number;
}

export interface SpaceBaseline {
  /** Conventional lighting load for the same space, watts. */
  lightingWatts: number;
  /** Conventional HVAC load, watts. */
  hvacWatts: number;
  /**
   * When a conventional space has its lights on — regardless of whether anyone
   * is in it. This is deliberately not occupancy-driven: leaving lights on
   * through empty hours is exactly what conventional installations do, and
   * exactly where occupancy sensing earns its money.
   */
  operatingHours: { startMin: number; endMin: number };
  /**
   * When a conventional space runs its air conditioning. Separate from lighting
   * hours because the two patterns are genuinely different — a Mumbai residence
   * runs lights for the evening and the AC through the night — and folding them
   * together produced a baseline that a full simulated day could exceed, which
   * made the savings figure negative and useless. Falls back to
   * `operatingHours` when omitted.
   */
  hvacHours?: { startMin: number; endMin: number };
  /** How the baseline was arrived at — shown in the energy panel. */
  note: string;
}

export interface Space {
  id: string;
  name: string;
  segment: Segment;
  /** e.g. "Residence", "Hospitality". */
  category: string;
  blurb: string;
  /** Which stage renderer to use. */
  renderer: "illustrated" | "photo" | "floorplan" | "3d";
  /** Selects the SVG scene when `renderer` is "illustrated". */
  illustration?: string;
  /** Selects the 3D room when `renderer` is "3d". */
  model?: string;
  /**
   * Keep this space out of the space picker.
   *
   * The space stays registered and its route keeps working — this hides it from
   * the client-facing list without deleting a room that is still useful
   * internally or as a renderer fallback.
   */
  unlisted?: boolean;
  /** Base image and its aspect ratio when `renderer` is "photo". */
  photo?: { base: string; aspect: number };
  zones: Zone[];
  devices: Device[];
  scenes: Scene[];
  rules: Rule[];
  /** State every device starts in, and what "Reset space" returns to. */
  defaults: Record<string, StatePatch>;
  /** Scene applied when the space first loads. */
  openingSceneId?: string;
  environment: SpaceEnvironment;
  baseline: SpaceBaseline;
  /** Electricity tariff in local currency per kWh. */
  tariffPerKwh: number;
  currency: string;
}

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

export interface Product {
  id: string;
  /** Product name as Uniser markets it. */
  name: string;
  /** Uniser range / family, e.g. "Magneto Series". */
  family: string;
  subsystem: SubsystemId;
  /** One-line description for the product panel. */
  summary: string;
  /** Label -> value, shown as a spec table. */
  specs: Record<string, string>;
  /**
   * Whether the listed specs have been confirmed against Uniser's real
   * datasheets. Anything still `false` renders with a visible warning so
   * placeholder figures can never reach a client demo unnoticed.
   */
  verified: boolean;
}
