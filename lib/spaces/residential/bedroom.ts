import type { Space } from "@/lib/sim/types";

/**
 * A primary bedroom, and the first residential room on the plates path.
 *
 * Everything the commercial rooms argue about — running cost, occupancy,
 * daylight harvesting — is irrelevant here. A bedroom is sold on one
 * thing: that the last thing you do before sleeping is press one button,
 * and the room puts itself to bed. So the circuits are split the way a
 * person moves through the room rather than the way an electrician would
 * wire it: the two bedside lamps are separate because two people go to
 * sleep at different times, the path lighting is its own circuit because
 * it is the only one that stays on, and the wardrobe lights itself when
 * you open it.
 */

/** 34 m² of bedroom: bed, wardrobe run, dresser and a balcony door. */
const AREA = 34;

export const bedroom: Space = {
  id: "bedroom",
  name: "Bedroom",
  segment: "residential",
  category: "Residence",
  blurb:
    "A 34 m² primary bedroom — bed, glass wardrobe, dresser and a balcony — path-traced offline and relit live. Seven lighting circuits, drapes that draw in from both sides, a ceiling fan and the one-button good-night sequence a bedroom is actually bought for.",
  renderer: "plates",
  plates: {
    dir: "/plates/bedroom",
    profile: "bedroom",
    /**
     * The drapes, which draw rather than dissolve.
     *
     * `hotspots.json` carries no curtain quad for this set, so the
     * opening is measured here: the rectangle the daytime view plate
     * actually lights, which is the balcony glazing the drapes cover.
     * The brief's alternative — the bounding box of pixels that change
     * by more than 2% — comes out at 84% of the frame, because shutting
     * the daylight out darkens the whole room. The window is the thing
     * the drapes move across, so the window is what the mask should be.
     *
     * The panels reach 0.45 and 0.55 of the opening, so they meet right
     * of centre where the fabric actually stacks, and the feather is 12
     * pixels because a drape edge is cloth rather than a blind's rail.
     */
    curtain: {
      closedDir: "/plates/bedroom_closed",
      deviceId: "br-curtain",
      window: {
        quad: [
          [0.6542, 0.7759],
          [0.999, 0.7759],
          [0.999, 0.3278],
          [0.6542, 0.3278],
        ],
        pad: 0.02,
        travel: "split",
        split: [0.45, 0.55],
        softPx: 12,
      },
    },
    /** The fan, composited inside its own rectangle. See the office. */
    overlay: {
      dir: "/plates/bedroom_fan",
      deviceId: "br-fan",
      rect: "fan_rect",
    },
    /**
     * The two things in this room that no plate was rendered for: the
     * television's own screen and the air out of the slot diffuser.
     */
    cues: ["tv", "airflow"],
    hotspotAliases: {
      curtains: { deviceId: "br-curtain", label: "Motorised drapes" },
      hvac: { deviceId: "br-ac", label: "Air conditioning" },
      fan: { deviceId: "br-fan", label: "Ceiling fan" },
      tv: { deviceId: "br-tv", label: "Television" },
      keypad: { deviceId: "br-path", label: "Bedside keypad · scene recall" },
    },
  },

  keypad: {
    layout: "grid",
    finish: "graphite",
    scenes: ["morning", "relax", "reading", "good-night"],
  },

  zones: [{ id: "br-main", name: "Bedroom", areaM2: AREA }],

  /* ---------------------------------------------------------------- */
  /* Devices                                                           */
  /* ---------------------------------------------------------------- */

  devices: [
    {
      id: "br-general",
      kind: "light",
      name: "General",
      zoneId: "br-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "Nine ceiling downlights and the wash over the wardrobe run, 2700 K to 5000 K. The circuit that is at seventy in the morning and off by bedtime, which is the whole argument for tunable white in a room somebody wakes up in.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5000 },
      fixtures: 9,
      wattsEach: 9,
      lumensEach: 800,
      baselineWattsEach: 40,
      glow: [],
    },
    {
      id: "br-cove",
      kind: "light",
      name: "Cove",
      zoneId: "br-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Twenty-four metres in the tray ceiling, across the artwork and along the curtain head, 2700 K to 5000 K. It is the only circuit in the room with no source a person lying in bed can see, which is exactly why it carries the evening.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5000 },
      fixtures: 24, // metres of run
      wattsEach: 5,
      lumensEach: 450,
      glow: [],
    },
    {
      id: "br-bedside-l",
      kind: "light",
      name: "Bedside — far",
      zoneId: "br-main",
      productId: "pipeline-pendant",
      subsystem: "lighting",
      pitch:
        "The table lamp on the far side. Separate from the near one for the only reason that matters in a bedroom: two people do not go to sleep at the same time, and a shared switch makes that an argument.",
      dimmable: true,
      fixtures: 1,
      wattsEach: 6,
      lumensEach: 320,
      glow: [],
    },
    {
      id: "br-bedside-r",
      kind: "light",
      name: "Bedside — near",
      zoneId: "br-main",
      productId: "pipeline-pendant",
      subsystem: "lighting",
      pitch:
        "The same lamp on the near side, on its own circuit and its own half of the keypad. Scenes move both together; the person in the bed moves one.",
      dimmable: true,
      fixtures: 1,
      wattsEach: 6,
      lumensEach: 320,
      glow: [],
    },
    {
      id: "br-reading",
      kind: "light",
      name: "Reading",
      zoneId: "br-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Swing-arm spots over the pillows, fixed 3000 K. Narrow enough to read by without lighting the other half of the bed, which is the difference between a reading light and a lamp somebody has pointed at a book.",
      dimmable: true,
      fixtures: 2,
      wattsEach: 5,
      lumensEach: 350,
      glow: [],
    },
    {
      id: "br-wardrobe",
      kind: "light",
      name: "Wardrobe",
      zoneId: "br-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Shelf and upright LEDs behind the glass. On the door contact in a real fit-out and on the hotspot here — open it and it comes to full for twenty seconds, which is the single most convincing thing in a bedroom demo and costs four watts.",
      dimmable: true,
      fixtures: 8,
      wattsEach: 4,
      lumensEach: 260,
      glow: [],
    },
    {
      id: "br-path",
      kind: "light",
      name: "Path",
      zoneId: "br-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Under-bed glow, low wall lights, the dresser strip and the keypad backlight. Fixed 2200 K — amber on purpose, because the one circuit that is on at three in the morning must not be the one that wakes anybody up.",
      dimmable: true,
      fixtures: 11,
      wattsEach: 2,
      lumensEach: 70,
      glow: [],
    },

    {
      id: "br-curtain",
      kind: "shade",
      name: "Drapes",
      zoneId: "br-main",
      productId: "uniser-curtain-track",
      subsystem: "shades",
      /**
       * One position, because the render is a pair.
       *
       * The open set already has the sheer half drawn and the drapes
       * stacked at the sides, and the closed set has everything across.
       * There is no third render for sheer-only, so one track is the
       * honest control — unlike the hotel room, which was rendered three
       * times and gets two.
       */
      layers: ["blackout"],
      presets: [
        { label: "Open", blackout: 0, hint: "Drapes stacked, sheer half drawn" },
        { label: "Half", blackout: 50, hint: "Part way across" },
        { label: "Close", blackout: 100, hint: "Drapes and sheer fully across" },
      ],
      watts: 40,
      /** Five seconds end to end, eased — which is what a drape track does. */
      travelMs: 5000,
      window: { x: 0.65, y: 0.33, w: 0.35, h: 0.45 },
      draw: "both",
    },
    {
      id: "br-fan",
      kind: "fan",
      name: "Ceiling Fan",
      zoneId: "br-main",
      productId: "smartspaces-fan",
      subsystem: "climate",
      pitch:
        "A BLDC fan over the bed. Three speeds, about twenty-two watts at the top, and the reason the air conditioning can sit at twenty-five overnight instead of twenty-three — which in a Mumbai bedroom is most of the electricity bill.",
      speeds: 3,
      ratedWatts: 22,
    },
    {
      id: "br-ac",
      kind: "climate",
      name: "Air Conditioning",
      zoneId: "br-main",
      productId: "sensibo-airbend",
      subsystem: "climate",
      pitch:
        "A concealed unit on the linear slot by the balcony. Sleep mode is the setting that matters: it lets the setpoint drift up through the night, which is both more comfortable and the single biggest saving in a residence.",
      minC: 16,
      maxC: 30,
      // A residential split's handset, not a commercial cassette's.
      modes: ["cool", "dry", "auto", "sleep"],
      ratedWatts: 1600,
    },
    {
      id: "br-tv",
      kind: "av",
      name: "Television",
      zoneId: "br-main",
      productId: "smartspaces-av",
      subsystem: "av",
      pitch:
        "The screen on the slat wall opposite the bed. Off in every scene, because a bedroom scene that switches a television on is a scene nobody presses twice.",
      sources: ["Streaming", "Set-top", "Cast"],
      hasScreen: false,
      ratedWatts: 120,
      glow: [],
    },

    {
      id: "br-lux",
      kind: "sensor",
      name: "Ambient Light",
      zoneId: "br-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Measured light at the bedside. Draw the drapes and it falls to almost nothing, which is what a bedroom is for and what the balcony glazing otherwise prevents.",
      metric: "lux",
      unit: "lx",
      derived: true,
    },
    {
      id: "br-temp",
      kind: "sensor",
      name: "Room Temperature",
      zoneId: "br-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Air temperature at the bed. With the fan running, the same comfort sits about two degrees higher — which is the whole case for having one over the bed rather than relying on the unit.",
      metric: "temperature",
      unit: "°C",
      derived: true,
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Scenes — the client's six                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Every scene names an hour, and the two that are *about* the view pin
   * the sky.
   *
   * This set was rendered with a day view and a night one, like the
   * cabin, so the clock crossfades between them on its own and the
   * scrubber stays live in the scenes that leave it alone. Morning pins
   * a sunrise and Evening a dusk, because those two are the hour rather
   * than a mood — a Morning that lands at midnight is not a morning.
   */
  scenes: [
    {
      id: "morning",
      clockMin: 7 * 60,
      name: "Morning",
      icon: "☼",
      blurb:
        "Waking up. The drapes go back first and the room comes up behind them at 5000 K — daylight arrives before the fittings do, which is the only order that feels like morning rather than like a light being switched on.",
      fadeMs: 2400,
      daylight: { day_sky: 85, day_morning: 100, day_midday: 0, day_evening: 0, sky: 0 },
      targets: {
        "br-general": { on: true, level: 70, cct: 5000, sat: 0 },
        "br-cove": { on: true, level: 50, cct: 5000, sat: 0 },
        "br-bedside-l": { on: false },
        "br-bedside-r": { on: false },
        "br-reading": { on: false },
        "br-wardrobe": { on: true, level: 40 },
        "br-path": { on: false },
        "br-fan": { on: true, speed: 1 },
        "br-curtain": { blackout: 0 },
        "br-ac": { on: false },
        "br-tv": { on: false },
      },
      highlight: ["uniser-curtain-track", "proplus-downlight"],
    },
    {
      id: "relax",
      clockMin: 19 * 60,
      name: "Relax",
      icon: "◎",
      blurb:
        "Early evening, drapes half across. The cove carries the room at 2700 K with the downlights almost out and both lamps on — the state a bedroom should sit in for the two hours before anybody is actually tired.",
      fadeMs: 2400,
      daylight: { day_sky: 25, day_morning: 0, day_midday: 0, day_evening: 45, sky: 70 },
      targets: {
        "br-general": { on: true, level: 20, cct: 2700, sat: 0 },
        "br-cove": { on: true, level: 70, cct: 2700, sat: 0 },
        "br-bedside-l": { on: true, level: 50 },
        "br-bedside-r": { on: true, level: 50 },
        "br-reading": { on: false },
        "br-wardrobe": { on: true, level: 20 },
        "br-path": { on: true, level: 30 },
        "br-fan": { on: true, speed: 1 },
        "br-curtain": { blackout: 50 },
        "br-ac": { on: true, setpointC: 24, mode: "cool", fan: 1 },
        "br-tv": { on: false },
      },
      highlight: ["connekt-profile", "pipeline-pendant"],
    },
    {
      id: "reading",
      clockMin: 22 * 60,
      name: "Reading",
      icon: "❑",
      blurb:
        "One person reading. The swing-arm spots at ninety over the pillows and everything else pulled right back, so the page is bright and the other half of the bed is not.",
      fadeMs: 1600,
      targets: {
        "br-general": { on: true, level: 15, cct: 3000, sat: 0 },
        "br-cove": { on: true, level: 40, cct: 3000, sat: 0 },
        "br-bedside-l": { on: true, level: 30 },
        "br-bedside-r": { on: true, level: 30 },
        "br-reading": { on: true, level: 90 },
        "br-wardrobe": { on: false },
        "br-path": { on: true, level: 20 },
        "br-fan": { on: false },
        "br-curtain": { blackout: 70 },
        "br-ac": { on: true, setpointC: 24, mode: "cool", fan: 1 },
        "br-tv": { on: false },
      },
      highlight: ["magneto-track"],
    },
    {
      id: "evening",
      clockMin: 19 * 60 + 30,
      name: "Evening",
      icon: "◑",
      blurb:
        "The room at its best, with the drapes open on the balcony. Cove at eighty, both lamps up and the wardrobe lit behind its glass — the scene a bedroom gets photographed in.",
      fadeMs: 2200,
      daylight: { day_sky: 15, day_morning: 0, day_midday: 0, day_evening: 30, sky: 85 },
      targets: {
        "br-general": { on: true, level: 50, cct: 3000, sat: 0 },
        "br-cove": { on: true, level: 80, cct: 3000, sat: 0 },
        "br-bedside-l": { on: true, level: 60 },
        "br-bedside-r": { on: true, level: 60 },
        "br-reading": { on: false },
        "br-wardrobe": { on: true, level: 40 },
        "br-path": { on: true, level: 30 },
        "br-fan": { on: true, speed: 2 },
        "br-curtain": { blackout: 0 },
        "br-ac": { on: true, setpointC: 24, mode: "cool", fan: 2 },
        "br-tv": { on: false },
      },
      highlight: ["connekt-profile", "pipeline-pendant"],
    },
    {
      id: "night",
      clockMin: 23 * 60,
      name: "Night",
      icon: "☾",
      blurb:
        "Still awake, but only just. The ceiling is out entirely, the lamps are at a fifth and the path lighting is up — the last state before the room belongs to whoever is asleep in it.",
      fadeMs: 2600,
      targets: {
        "br-general": { on: false },
        "br-cove": { on: true, level: 15, cct: 2700, sat: 0 },
        "br-bedside-l": { on: true, level: 20 },
        "br-bedside-r": { on: true, level: 20 },
        "br-reading": { on: false },
        "br-wardrobe": { on: false },
        "br-path": { on: true, level: 50 },
        "br-fan": { on: true, speed: 1 },
        "br-curtain": { blackout: 100 },
        "br-ac": { on: true, setpointC: 24, mode: "cool", fan: 1 },
        "br-tv": { on: false },
      },
      highlight: ["connekt-profile"],
    },
    {
      id: "good-night",
      clockMin: 23 * 60 + 30,
      name: "Good Night",
      icon: "⏻",
      blurb:
        "One button at the bedside and the room puts itself to bed: the ceiling dims, the lamps come down, the drapes draw across, the air conditioning goes to sleep mode and everything but the path lighting goes out. Five stages, about fourteen seconds.",
      fadeMs: 1200,
      /**
       * Stage zero is the Evening room, which is where the client's
       * wording begins.
       *
       * A staged scene applies `targets` before its first step and the
       * runner skips a step that commands nothing new, so everything the
       * five beats talk about is set here to what they start *from*.
       */
      targets: {
        "br-general": { on: true, level: 50, cct: 3000, sat: 0 },
        "br-cove": { on: true, level: 80, cct: 3000, sat: 0 },
        "br-bedside-l": { on: true, level: 60 },
        "br-bedside-r": { on: true, level: 60 },
        "br-reading": { on: false },
        "br-wardrobe": { on: true, level: 40 },
        "br-path": { on: true, level: 30 },
        "br-fan": { on: true, speed: 1 },
        "br-curtain": { blackout: 0 },
        "br-ac": { on: true, setpointC: 24, mode: "cool", fan: 2 },
        "br-tv": { on: false },
      },
      steps: [
        {
          label: "Dimming the room",
          holdMs: 2630,
          targets: {
            "br-general": { on: true, level: 10, cct: 2700, sat: 0, fadeMs: 2000 },
            "br-cove": { on: true, level: 30, cct: 2700, sat: 0, fadeMs: 2000 },
            "br-wardrobe": { on: false, fadeMs: 2000 },
          },
        },
        {
          label: "Bedside lights lowered",
          holdMs: 4210,
          targets: {
            "br-bedside-l": { on: true, level: 15, fadeMs: 1500 },
            "br-bedside-r": { on: true, level: 15, fadeMs: 1500 },
          },
        },
        {
          label: "Closing curtains",
          holdMs: 15790,
          targets: {
            // No `fadeMs`: travel belongs to the motor. Five seconds,
            // and the hold is sized to clear it before the next beat.
            "br-curtain": { blackout: 100 },
          },
        },
        {
          label: "AC set to 25 °C sleep",
          holdMs: 4210,
          targets: {
            "br-ac": { on: true, setpointC: 25, mode: "sleep", fan: 1 },
          },
        },
        {
          label: "Lights off. Path light on",
          holdMs: 5260,
          targets: {
            "br-general": { on: false, fadeMs: 2000 },
            "br-cove": { on: false, fadeMs: 2000 },
            "br-bedside-l": { on: false, fadeMs: 2000 },
            "br-bedside-r": { on: false, fadeMs: 2000 },
            "br-reading": { on: false, fadeMs: 2000 },
            "br-path": { on: true, level: 15, fadeMs: 2000 },
          },
        },
      ],
      highlight: ["uniser-curtain-track", "sensibo-airbend", "connekt-profile"],
    },
  ],
  /**
   * The wardrobe lights itself when the door opens.
   *
   * Declared so the panel and the hotspot share one definition: tapping
   * the wardrobe marker is "door opened", and it does the same thing the
   * card's button does. Twenty seconds is a real door contact's hold —
   * long enough to pick something out, short enough that leaving the
   * door open does not light the room all evening.
   */
  momentary: {
    deviceId: "br-wardrobe",
    label: "Wardrobe door",
    level: 100,
    riseMs: 600,
    holdMs: 20000,
    fallMs: 1200,
  },

  rules: [
    {
      id: "br-circadian",
      kind: "circadian",
      name: "Circadian Tuning",
      explain:
        "The ceiling and the cove follow the hour when no scene has claimed them — 5000 K at seven in the morning, 2700 K by ten at night. The lamps, the reading spots and the path lighting hold their colour, which is what lets the room get warmer through the evening without anything appearing to change.",
      enabledByDefault: true,
      deviceIds: ["br-general", "br-cove"],
      curve: [
        { min: 0, cct: 2700 },
        { min: 360, cct: 4000 },
        { min: 420, cct: 5000 },
        { min: 720, cct: 5000 },
        { min: 1020, cct: 3500 },
        { min: 1200, cct: 2700 },
        { min: 1380, cct: 2700 },
      ],
    },
  ],

  /**
   * A dark room with the drapes open, and what Reset returns to.
   *
   * Open because the opening scene is Evening and it wants them open —
   * a five-second track is not something a scene can hurry, so starting
   * them closed would mean the room spent its first five seconds
   * drawing a curtain underneath a still that already shows it back.
   */
  defaults: {
    "br-general": { on: false, level: 0, cct: 3000, sat: 0 },
    "br-cove": { on: false, level: 0, cct: 3000, sat: 0 },
    "br-bedside-l": { on: false, level: 0 },
    "br-bedside-r": { on: false, level: 0 },
    "br-reading": { on: false, level: 0 },
    "br-wardrobe": { on: false, level: 0 },
    "br-path": { on: false, level: 0 },
    "br-curtain": { blackout: 0 },
    "br-fan": { on: false, speed: 2 },
    "br-ac": { on: true, setpointC: 24, mode: "cool", fan: 1 },
    "br-tv": { on: false, source: "Streaming", volume: 20 },
  },

  openingSceneId: "evening",
  openingClockMin: 19 * 60 + 30,

  environment: {
    sunriseMin: 6 * 60 + 20,
    sunsetMin: 18 * 60 + 55,
    outdoorPeakLux: 95000,
    /** One balcony door and a side light, on a 34 m² room. */
    windowFactor: 0.0031,
    designLux: 150,
    outdoorMinC: 26,
    outdoorMaxC: 34,
  },

  baseline: {
    lightingWatts: 420,
    hvacWatts: 1800,
    operatingHours: { startMin: 18 * 60, endMin: 24 * 60 },
    hvacHours: { startMin: 21 * 60, endMin: 7 * 60 },
    note:
      "40 W downlights on one switch, a pair of uncontrolled bedside lamps, no cove or path lighting at all and a split unit left at twenty-three all night — a flat fitted out around 2014.",
  },

  tariffPerKwh: 11.5,
  currency: "₹",
};
