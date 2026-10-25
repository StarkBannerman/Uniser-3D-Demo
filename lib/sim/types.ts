/**
 * Core simulation types.
 *
 * Nothing in `lib/sim` knows anything about Uniser. Spaces, devices, scenes and
 * automation rules are all declarative data (see `lib/spaces`), so adding a new
 * demo space or product means adding a config file, not writing components.
 */

/**
 * Which door a visit comes in through.
 *
 * "commercial" is the workplace: offices, boardrooms, executive cabins.
 * "hospitality" is separate rather than a category inside it, because the two
 * are sold in different meetings to different buyers — a hotel group is not
 * shopping for a boardroom, and putting the lobby in the same row as the
 * workspace made the switcher a list to scan rather than a door to walk
 * through.
 */
export type Segment = "commercial" | "hospitality" | "residential";

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
  | "air"
  | "fan";

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
  /**
   * Named colours the control offers as one-tap swatches.
   *
   * Declared rather than global, because the useful eight are a property
   * of the installation: a credenza shelf wants brand colours and a
   * living room wants the warm half of the wheel plus whatever the
   * client asked for. A circuit that declares none gets the hue and
   * saturation sliders on their own, which is what every RGB circuit had
   * before this and still the right answer for one nobody has thought
   * about.
   *
   * `sat: 0` with a `cct` is a white preset — the one thing a hue slider
   * cannot reach, and the one most people settle on.
   */
  swatches?: { label: string; hue: number; sat: number; cct?: number }[];
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
  /**
   * The named positions the automation panel offers as buttons.
   *
   * Declared rather than inferred, because the middle one is the part
   * with a name worth printing and only the space knows it: a window with
   * two tracks calls half-covered "Sheer", and a cabin with one venetian
   * calls it the meeting preset. Omitted, the panel derives Open / Half /
   * Close from `layers`, which is right for a shade nobody has thought
   * about yet.
   */
  presets?: { label: string; sheer?: number; blackout: number; hint?: string }[];
  /**
   * Whether the card offers Stop as well as the presets.
   *
   * Declared, like the presets, because only the space knows what is on
   * the wall. A curtain track's plate has three buttons and the third
   * one is this; a blind run from a preset controller has two, and
   * showing a permanently greyed third on it would be inventing
   * hardware. Stop is enabled only while the motor is actually running —
   * see `stopDevice`, which is the only way to drop the travel lock.
   */
  stoppable?: boolean;
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
  /**
   * The modes this unit's controller actually offers.
   *
   * A commercial cassette shows Cool / Heat / Auto / Fan; a bedroom
   * split shows Cool / Dry / Auto / Sleep. Same engine, different
   * printing on the handset — which is a property of the unit rather
   * than of the panel, so it is declared here. Omitted gives the
   * commercial four.
   */
  modes?: ClimateMode[];
  /** Compressor + fan draw at full load. */
  ratedWatts: number;
}

export interface AvDevice extends DeviceBase {
  kind: "av";
  sources: string[];
  /**
   * A scene this device's card offers as a button.
   *
   * For the one case where a preset is really an AV function rather than
   * a lighting one: Movie mode draws the curtains, takes the room down
   * to the bias light and starts the picture, and somebody looking for
   * it looks at the television card rather than at the scene pad. The
   * button runs the ordinary scene — there is no second code path, so it
   * cannot drift from what the pad does.
   */
  sceneButton?: { sceneId: string; label: string };
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

/**
 * A ceiling fan.
 *
 * Distinct from `air` (purifiers and diffusers) because in India it is not an
 * accessory — it is the control every client looks for on the keypad, and a
 * BLDC fan at speed 2 is most of the reason the AC can sit two degrees higher.
 * Its speed is also visible: the renderer turns the blades from it, so "off"
 * has to be unmistakable across a room.
 */
export interface FanDevice extends DeviceBase {
  kind: "fan";
  /** Number of selectable speeds, 1..`speeds`. Indian fans are usually 5. */
  speeds: number;
  /** Draw at the top speed. Consumption scales with the cube of airflow. */
  ratedWatts: number;
  /**
   * Whether the fan can run in reverse (winter mode). Rare in Mumbai; present
   * so the type does not have to change when a northern project needs it.
   */
  reversible?: boolean;
}

export type Device =
  | LightDevice
  | ShadeDevice
  | ClimateDevice
  | AvDevice
  | LockDevice
  | SensorDevice
  | SolarDevice
  | AirDevice
  | FanDevice;

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

/**
 * `auto` lets the unit choose between heating and cooling against the
 * setpoint, which is what the mode selector on a real fan-coil controller
 * offers and what the hotel room's panel exposes. `dry` is the
 * dehumidification mode the residential units carry, and `sleep` is the
 * overnight programme that lets the setpoint drift up — the single
 * biggest saving in a residence and the one a bedroom is sold on.
 */
export type ClimateMode = "cool" | "heat" | "fan" | "dry" | "auto" | "sleep";

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

export interface FanState {
  on: boolean;
  /** 1..`FanDevice.speeds`. Retained while off, so the fan restarts where it was. */
  speed: number;
  reverse: boolean;
}

export type DeviceState =
  | LightState
  | ShadeState
  | ClimateState
  | AvState
  | LockState
  | SensorState
  | SolarState
  | AirState
  | FanState;

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

/**
 * One stage of a staged scene.
 *
 * The requirement document specifies a demonstration sequence for every
 * environment — "lights dim → bedside lights reduce → curtains close → AC
 * activates → selected lights switch OFF". Applying all of that at once shows a
 * state change; applying it in order shows a building responding, which is the
 * entire point of the feature.
 */
export interface SceneStep {
  /** Stage name, surfaced while it runs so the room narrates itself. */
  label: string;
  /** Device id -> partial state, exactly as `Scene.targets`. */
  targets: Record<string, StatePatch & { fadeMs?: number }>;
  /** Exterior layer weights for this stage, exactly as `Scene.daylight`. */
  daylight?: Record<string, number>;
  /** Exterior tint for this stage, exactly as `Scene.daylightTint`. */
  daylightTint?: string;
  /**
   * Wall-clock pause before this stage is applied, measured from the previous
   * stage.
   *
   * Real milliseconds, deliberately not simulated minutes: a demonstration
   * should take the same time to watch whether the clock is paused or running
   * at a day a minute.
   */
  holdMs?: number;
}

/**
 * A slow colour movement held for as long as its scene is the active one.
 *
 * Only hue, and only one device, because that is the whole of what a colour
 * wash in a dining room should ever do. The swing is a raised cosine rather
 * than a triangle so it decelerates into each end: a linear ramp reverses
 * with a visible corner, and anything faster than this reads as a nightclub
 * effect rather than as a room that is quietly alive.
 *
 * It stops the moment another scene is applied, because `activeSceneId` is
 * what drives it. Moving a control by hand also stops it — letting go of the
 * scene is how this app says "you are driving now".
 */
/**
 * A group of devices the presenter picks one of, and scenes can aim at.
 *
 * The showroom's six vehicle zones are the case this exists for: the client
 * asked to "select different vehicles and demonstrate individual lighting
 * focus", which means a scene has to be able to say "this one to a hundred,
 * the rest to twenty-five" without naming a car. Scene targets express that
 * with two pseudo-device ids, `SELECTED_TARGET` and `OTHERS_TARGET`, which
 * the store expands against the current choice when the scene is applied.
 *
 * Nothing about vehicles is in the engine. A space that declares a selection
 * of anything else — meeting pods, display bays — gets the same behaviour.
 */
export interface SpaceSelection {
  /** Shown as the heading of the picker, e.g. "Vehicles". */
  label: string;
  /** Devices in the group, in the order the picker lists them. */
  options: {
    deviceId: string;
    name: string;
    /**
     * Circuits that follow this option as though they were part of it.
     *
     * The turntable vehicle is the case: its four adjustable spots barely
     * register in the plates, and what actually lights that car is the ring
     * of high-CRI product spots above it. Naming `sr-spot` here means
     * selecting the turntable car brings the ring with it, and selecting any
     * other car leaves the ring with the rest of the room.
     */
    alsoDeviceIds?: string[];
  }[];
  /** Used until the presenter chooses, and whenever the choice is invalid. */
  defaultDeviceId: string;
}

/** Scene-target keys that stand for the selection rather than a device. */
export const SELECTED_TARGET = "@selected";
export const OTHERS_TARGET = "@others";

export interface SceneDrift {
  /** The device whose hue moves. */
  deviceId: string;
  /** Degrees. The cycle starts at `fromHue` when the scene is applied. */
  fromHue: number;
  toHue: number;
  /** Milliseconds for a full there-and-back. */
  periodMs: number;
}

/**
 * What an empty room does, for the Automation tab's occupancy demonstration.
 *
 * Deliberately separate from the `occupancy` rule in `rules`, which works in
 * simulated minutes against a sensor and is the honest model. This one is
 * the showable version: real seconds, a button to trigger it, and a named
 * set of circuits that fall back while the architecture stays lit — because
 * the point being made is that an empty lobby should still look like a
 * lobby, not that a sensor exists.
 */
export interface SpaceAutoDim {
  /** Circuits that fall back. Everything else holds its level. */
  deviceIds: string[];
  /** Fraction of the scene level they fall to, 0..1. */
  toFraction: number;
  /** Real milliseconds of vacancy before they do. */
  afterMs: number;
  /** Real milliseconds to come back over. */
  restoreMs: number;
}

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
  /** A hue drift that runs while this scene is the active one. */
  drift?: SceneDrift;
  /**
   * What the sky and daylight layers should be doing, 0-100 per layer.
   *
   * Omitted means "follow the clock", which is what every space did before
   * this existed and what most scenes still want. A scene that names it is
   * saying the hour is part of the preset — the lobby's Evening is a dusk
   * whatever the scrubber says, because the demonstration is *about* the
   * light going.
   *
   * Only the exterior layers can be set this way. The circuits are devices
   * and go through `targets` like everything else.
   */
  daylight?: Record<string, number>;
  /**
   * A colour for the exterior layers, as a hex string.
   *
   * The sky plate is one render of one sky, and a scene set after dark
   * needs it dim and blue rather than dim and the same daylight colour —
   * a view plate at 8% reads as an overcast afternoon, not as night. This
   * multiplies the exterior layers only; the circuits have their own
   * colour and are not touched.
   *
   * Omitted means the plate's own colour, which is what every space did
   * before a room had to show the same window at noon and at nine.
   */
  daylightTint?: string;
  /**
   * Ordered stages that run after `targets` is applied.
   *
   * Optional: a scene without `steps` behaves exactly as it always has. With
   * them, `targets` is stage zero and these follow in order.
   */
  steps?: SceneStep[];
  /**
   * Move the simulated clock to this time, minutes past midnight.
   *
   * A scene named after an hour has to arrive at that hour. Pressing Morning at
   * half past seven in the evening otherwise opened the curtains onto a night
   * skyline and lit the room cool white, which reads as a bug rather than as a
   * scene.
   *
   * Omit it on scenes that are about a mood rather than a time. Those should
   * work at whatever hour the presenter is standing in, and moving the clock
   * under them would take away the circadian demonstration — the same button
   * being cool at breakfast and warm at bedtime.
   */
  clockMin?: number;
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

/**
 * Which physical keypad is on this room's wall.
 *
 * The requirement document asks for different keypad designs and different
 * finishes, and it is asking for a commercial reason: the panel is the product
 * a client actually buys and touches. So the layout is a property of the space,
 * not of the component — a bedroom gets the eight-gang icon plate, a room with
 * seven scenes and no fan gets the scene column.
 */
export type KeypadLayout = "column" | "grid";
export type KeypadFinish = "graphite" | "brass" | "ivory";

export interface KeypadSpec {
  layout: KeypadLayout;
  /** Starting finish. The presenter can change it live — that is the demo. */
  finish: KeypadFinish;
  /**
   * Scene ids to engrave on the plate, in order.
   *
   * A real keypad has a fixed number of buttons, so a room with more scenes
   * than gangs surfaces a chosen subset here and leaves the rest to the app.
   * Omitted means every scene, which is what the column layout does.
   */
  scenes?: string[];
}

export interface Space {
  id: string;
  name: string;
  segment: Segment;
  /** e.g. "Residence", "Hospitality". */
  category: string;
  blurb: string;
  /** Which stage renderer to use. */
  renderer: "illustrated" | "photo" | "floorplan" | "3d" | "plates";
  /** Selects the SVG scene when `renderer` is "illustrated". */
  illustration?: string;
  /** Selects the 3D room when `renderer` is "3d". */
  model?: string;
  /**
   * Where the plate set lives when `renderer` is "plates", e.g. "/plates".
   *
   * The directory and nothing else, because everything else about a plate set
   * — its two tiers, their dimensions, the decode gamma and the per-layer
   * scales — is written by the offline renderer that produced it and read back
   * from its `manifest.json`. Restating any of that here would be a second
   * source of truth for numbers the room cannot be composited without, and the
   * failure mode of the two disagreeing is a silently mis-exposed room rather
   * than anything that throws.
   */
  plates?: {
    /** Directory the plate set is served from, e.g. "/plates/restaurant". */
    dir: string;
    /** Names the calibration in `components/stage/plates/profiles`. */
    profile: string;
    /**
     * Two further plate sets for the window's two tracks, and the shade
     * that drives them.
     *
     * A curtain is the one thing in a room that light cannot be summed
     * around. Every other control changes how much a fixture contributes;
     * a curtain changes what the room *is*, because it occludes the window
     * and so alters every other circuit's plate as well as the view. The
     * honest answer is three complete renders of the same camera — drawn
     * back, sheer across, blackout shut — and a mask that says which pixels
     * each one owns as the panels travel. See `plates/window.ts`.
     *
     * `deviceId` names a shade whose `sheer` and `blackout` positions, 0 to
     * 100 each, drive the two wipes. All the sets must have the same layer
     * names; each one's `manifest.json` supplies its own per-layer scales,
     * because they are separate renders.
     *
     * `sheerDir` is optional, and leaving it out is the ordinary case: a
     * window with one covering — blinds that lower, a single curtain —
     * has two states, not three, and its shade declares only `blackout`.
     * A covering with no window quad in `hotspots.json` crossfades rather
     * than wiping, which is what a venetian blind lowering and tilting
     * actually looks like: the whole aperture closes at once rather than
     * an edge travelling along a track.
     */
    curtain?: {
      sheerDir?: string;
      closedDir: string;
      deviceId: string;
      /**
       * The opening the covering crosses, when the plate set does not
       * carry one.
       *
       * The offline renderer projects a `curtain` quad into
       * `hotspots.json` for the sets that have been asked for one, and
       * that is the better home: it is re-measured every time the camera
       * moves. A set without one needs the quad measuring by hand, and
       * then it belongs here rather than edited into a generated file —
       * `scripts/measure-plates.py --dir <set>` checks the declaration
       * against where lowering the covering actually changes the picture,
       * so a re-render that moves the window fails loudly instead of
       * quietly wiping the wrong rectangle.
       */
      window?: {
        quad: [number, number][];
        pad?: number;
        travel?: "split" | "drop";
        /**
         * How far each panel of a `split` reaches at full travel.
         *
         * Half and half for curtains meeting in the middle. A bedroom
         * drape that stacks unevenly meets off centre, and these two
         * shares say where.
         */
        split?: [number, number];
        /** Feathered edge in pixels. Default four. */
        softPx?: number;
      };
    };
    /**
     * A plate set composited *over* the room rather than summed into it.
     *
     * Spinning fan blades are not a lighting circuit. They are the same
     * room with one object in a different state, so inside their own
     * rectangle they replace the base image rather than adding to it —
     * `final = mix(base, overlay, opacity)` — and outside it they do
     * nothing at all.
     *
     * `rect` names a `[u0, v0, u1, v1]` in `hotspots.json` (v down).
     * `deviceId` is the fan whose speed sets the opacity. Both the set
     * and the rectangle are optional at runtime: the stage probes for the
     * directory and validates the rectangle, and falls back to marking
     * the hotspot when either is missing, so the real blur appears the
     * moment the render does.
     */
    overlay?: {
      dir: string;
      deviceId: string;
      rect: string;
      /**
       * How the overlay arrives.
       *
       * `fade` is an opacity across the whole rectangle, driven by a fan's
       * speed. `drop` is an edge rolling down it, driven by an av device's
       * `screen` position — a projection screen is either there or it is
       * not, and what moves is its bottom edge.
       */
      travel?: "fade" | "drop";
      /**
       * Layers that always come from the overlay set, whichever pass is
       * drawing.
       *
       * The boardroom's `bd_projection` is the case: it is a projected
       * image and its spill, and it only exists in the set rendered with
       * the screen down — it measures exactly 0.00000 in the other two.
       * Pinning it means every pass samples the one plate that has it,
       * and because the passes' shares sum to one it lands across the
       * whole frame at its own weight rather than only inside the
       * screen's rectangle. The spill is most of the effect.
       */
      pinLayers?: string[];
    };
    /**
     * Soft overlays drawn on top of the composite, by name.
     *
     * Things no plate was rendered for: a television's own screen, the
     * air moving out of a diffuser. They are opt-in rather than
     * automatic because they are not photometry — every other room in
     * this project shows exactly what was path-traced, and a room that
     * starts shimmering because it happens to have an `hvac` marker is
     * a room that changed without anybody asking.
     *
     * `tv` is a soft glow centred on the television's hotspot, for a set
     * that projected a point and no rectangle. `screen` is the same idea
     * for a set that projected `tv_rect`: a moving picture clipped to
     * the glass, plus the cool spill it throws down onto the floor in
     * front of it. A rectangle is the whole difference between a light
     * near a television and a television that is on.
     */
    cues?: ("tv" | "screen" | "airflow")[];
    /**
     * Hotspots that are not named after a device, and what they mean.
     *
     * The offline renderer projects points of interest as well as circuits,
     * so a plate set can carry a marker like `reception` that no device
     * answers to. Rather than edit `hotspots.json` — which is generated and
     * is overwritten by every re-render — the space says what the point is
     * for, and gets to name it in the room's own words.
     */
    hotspotAliases?: Record<string, { deviceId: string; label: string }>;
  };
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
  /** The wall keypad. Defaults to the scene column when omitted. */
  keypad?: KeypadSpec;
  /** State every device starts in, and what "Reset space" returns to. */
  defaults: Record<string, StatePatch>;
  /** Scene applied when the space first loads. */
  openingSceneId?: string;
  /**
   * Clock position the space opens at, minutes past midnight. Defaults to 7pm.
   * A daylit room and an evening room want different opening hours, and the
   * first frame a client sees is the one that has to land.
   */
  openingClockMin?: number;
  /** A group of devices the presenter picks one of. See `SpaceSelection`. */
  selection?: SpaceSelection;
  /**
   * Scenes on a timetable, in clock order.
   *
   * Read-only as data: it drives the Automation tab's schedule card, and the
   * time-based toggle there plays it. Nothing applies it on its own — a
   * building that changed scene while a presenter was mid-sentence would be
   * a worse demonstration than one that did not.
   */
  schedule?: { atMin: number; sceneId: string }[];
  /** Fall-back dimming when the room is empty. See `SpaceAutoDim`. */
  autoDim?: SpaceAutoDim;
  /**
   * A circuit that lights itself for a while and then falls back.
   *
   * A wardrobe on a door contact: open it, it comes to full, and twenty
   * seconds later it goes back to whatever the scene asked for. Declared
   * rather than wired into a panel so that the hotspot and the card do
   * the same thing — tapping the wardrobe in the room *is* opening the
   * door, and it should not matter which one you press.
   */
  momentary?: {
    deviceId: string;
    label: string;
    /** Where it goes while it is held. */
    level: number;
    riseMs: number;
    holdMs: number;
    fallMs: number;
  };
  /**
   * One card for a room's audio-visual system.
   *
   * Declared rather than inferred because the pieces are separate devices
   * that only make sense together: a motorised screen, a projector that
   * cannot show anything until the screen is down, speakers, and a
   * conference camera. The panel reads the relationships from here —
   * which device is which — instead of guessing from device kinds, which
   * would break the moment a room had two `av` devices. The boardroom has
   * three.
   */
  avPanel?: {
    /** The av device carrying the screen position and the speakers. */
    deviceId: string;
    /** The light circuit that is the projected image, if there is one. */
    projectorId?: string;
    /** An av device standing in for the conference camera and its mic. */
    cameraId?: string;
    /** The circuit the camera brings up when it starts, and to what. */
    cameraLight?: { deviceId: string; level: number };
  };
  /**
   * Proportional trim against the daylight the glazing is supplying.
   *
   * Distinct from the `daylight` *rule*, which models the real thing in
   * simulated minutes against a design illuminance. This is the panel
   * version: one toggle, a read-out of what it is doing right now, and a
   * straight `1 - strength x daylight` on the named circuits, so a client
   * can drop the blinds and watch the ceiling come up to meet them.
   */
  daylightResponse?: {
    deviceIds: string[];
    /** How much of the circuit the full sun is allowed to take, 0..1. */
    strength: number;
    /** Real milliseconds to ease a change over. */
    easeMs: number;
  };
  /**
   * Zoned presence, for the automation tab's occupancy demonstration.
   *
   * `SpaceAutoDim` is the one-group version and stays for the rooms that
   * only ever make the point once. This is for a floor where the point is
   * that the zones *disagree*: half the desks going home should take half
   * the task light with it and leave the other half alone, which a single
   * group cannot show.
   *
   * Real seconds and a button per zone, like `SpaceAutoDim` and for the
   * same reason — the honest sensor model is the `occupancy` rule, and
   * this is the showable one.
   */
  occupancyZones?: {
    /** Real milliseconds of vacancy before a zone falls back. */
    afterMs: number;
    /** Real milliseconds to come back over. */
    restoreMs: number;
    zones: {
      id: string;
      name: string;
      /** Circuits that go out when this zone alone is empty. */
      deviceIds: string[];
      /** The sensor this zone would be wired to, for the marker. */
      sensorId?: string;
    }[];
    /**
     * Circuits that fall back only when every zone is empty, and how far.
     *
     * The shared layer, which is the interesting case: one zone leaving
     * should not touch the light over the other one's heads, and both
     * leaving should.
     */
    whenAllVacant?: { deviceIds: string[]; toFraction: number };
    /**
     * Simulated foot traffic: one zone flips every `minMs`..`maxMs`.
     *
     * For leaving the tab running on a screen. It pauses while a staged
     * scene is playing, because a demonstration being narrated should not
     * have a sensor changing the room underneath it.
     */
    auto?: { minMs: number; maxMs: number };
  };
  /**
   * Sets of circuits of which at most one may be lit.
   *
   * The hotel room's door panel is the case: do not disturb and make up the
   * room are two latching buttons that physically cannot both be in, and a
   * demo that lights both is showing a room nobody would ship. Declaring it
   * here rather than wiring it into a panel means the engine holds the
   * interlock on every path into the state — a scene, a slider, the app —
   * and the automation tab gets its card from the same line.
   *
   * Lights only. The rule is "turning one on turns the others off", which
   * needs an `on` to act on.
   */
  exclusive?: { label: string; deviceIds: string[] }[];
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
