/**
 * Residence — Den / Media Room.
 *
 * Built to the client's den sheet and to Section 5 of the requirement
 * document, which agree: general, cove, accent and RGB/RGBW lighting, all
 * tunable white, with a projector, a motorised screen, speakers and motorised
 * curtains, and six scenes — Work, Relax, Gaming, Movie, Presentation, All Off.
 *
 * The document spells the Movie demonstration out step by step:
 *
 *   main lights OFF -> RGB/bias lighting ON -> curtains close
 *     -> screen descends -> projector ON -> speakers ON
 *
 * so Movie is a staged scene and those are its stages, in that order. The
 * screen's descent is real travel, not a scripted pause: `screenTravelMs` is a
 * property of the motor and the engine refuses to let a scene hurry it.
 *
 * This room is deliberately not the living room with a bigger television. It
 * has a work zone, it has no ceiling fan, and its RGB is a working layer rather
 * than an optional flourish — which is what separates a media room from a
 * lounge in the client's own material.
 *
 * Wattages and lumen figures remain the placeholders flagged in
 * `lib/catalog/products.ts`.
 */

import type { Space } from "@/lib/sim/types";

/** 7.6 x 9.5 m. */
const AREA = 72;

export const den: Space = {
  id: "den",
  name: "Den / Media Room",
  segment: "residential",
  category: "Residence",
  blurb:
    "A 72 m² media room in real-time 3D — general, cove, accent and RGB on a projector, a motorised screen, floorstanding speakers, curtains and a work zone.",
  renderer: "3d",
  model: "den",

  keypad: {
    layout: "grid",
    finish: "graphite",
    scenes: ["work", "relax", "movie", "off"],
  },

  zones: [{ id: "dn-main", name: "Den", areaM2: AREA }],

  devices: [
    {
      id: "dn-general",
      kind: "light",
      name: "General",
      zoneId: "dn-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "Six recessed heads. In a media room this is the layer you spend most of the evening with switched off — which is exactly why it has to be there for Work and Presentation.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5700 },
      fixtures: 6,
      wattsEach: 9,
      lumensEach: 800,
      baselineWattsEach: 60,
      glow: [],
    },
    {
      id: "dn-cove",
      kind: "light",
      name: "Cove",
      zoneId: "dn-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "28 metres of tunable strip in the perimeter step. Soft indirect light that never lands on the screen.",
      dimmable: true,
      tunable: { minK: 2200, maxK: 6500 },
      fixtures: 28, // metres of strip
      wattsEach: 9,
      lumensEach: 900,
      glow: [],
    },
    {
      id: "dn-accent",
      kind: "light",
      name: "Accent",
      zoneId: "dn-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Strips in every shelf and a graze on the artwork. Switch it off mid-sentence and the whole wall of display goes flat — that is the fastest way to show what accent lighting buys.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 4000 },
      fixtures: 14,
      wattsEach: 5,
      lumensEach: 300,
      glow: [],
    },
    {
      id: "dn-rgb",
      kind: "light",
      name: "Colour",
      zoneId: "dn-main",
      productId: "flexi-delta-rgb",
      subsystem: "lighting",
      pitch:
        "Vertical RGBW battens on the walls, bias light behind the screen and a wash under the console. In a den this is a working layer, not a party trick — bias lighting is what stops a bright screen in a dark room being exhausting.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 6500 },
      rgb: true,
      fixtures: 22, // metres
      wattsEach: 12,
      lumensEach: 700,
      glow: [],
    },

    {
      id: "dn-curtain",
      kind: "shade",
      name: "Curtains",
      zoneId: "dn-main",
      productId: "uniser-curtain-track",
      subsystem: "shades",
      pitch:
        "Sheer for the daytime, blackout for the film. A media room lives or dies on the blackout.",
      layers: ["sheer", "blackout"],
      watts: 50,
      travelMs: 8000,
      window: { x: 0.62, y: 0.14, w: 0.34, h: 0.62 },
      draw: "both",
    },

    {
      id: "dn-av",
      kind: "av",
      name: "Projector",
      zoneId: "dn-main",
      productId: "smartspaces-av",
      subsystem: "av",
      pitch:
        "One press drops the lights, closes the curtains, lowers the screen and fires the projector — in that order, because the screen takes seven seconds and starting the film early wastes the best part of the demonstration.",
      sources: ["Streaming", "Console", "Blu-ray", "Laptop"],
      hasScreen: true,
      // The motor's own travel. A scene cannot hurry it; see `resolveFade`.
      screenTravelMs: 7000,
      ratedWatts: 320,
      glow: [],
    },
    {
      id: "dn-audio",
      kind: "av",
      name: "Speakers",
      zoneId: "dn-main",
      productId: "smartspaces-audio",
      subsystem: "av",
      pitch:
        "Floorstanders either side of the screen. Watch the drivers move with the volume — the speakers are part of the scene, not a logo on a slide.",
      sources: ["Projector", "Playlist", "Console", "Turntable"],
      hasScreen: false,
      ratedWatts: 320,
      glow: [],
    },
    {
      id: "dn-desk",
      kind: "av",
      name: "Workstation",
      zoneId: "dn-main",
      productId: "smartspaces-av",
      subsystem: "av",
      pitch:
        "The den is a work room before it is a cinema. Work wakes the desk and lifts the screen out of the way; Movie does the opposite.",
      sources: ["Desktop", "Laptop", "Conference"],
      hasScreen: false,
      ratedWatts: 140,
      glow: [],
    },

    {
      id: "dn-ac",
      kind: "climate",
      name: "Air Conditioning",
      zoneId: "dn-main",
      productId: "sensibo-airbend",
      subsystem: "climate",
      pitch:
        "A projector and six people put real heat into a sealed room. This is the one comfort control a media room genuinely needs.",
      minC: 16,
      maxC: 30,
      ratedWatts: 1800,
    },

    {
      id: "dn-solar",
      kind: "solar",
      name: "Rooftop Solar",
      zoneId: "dn-main",
      productId: "myminigrid",
      subsystem: "energy",
      kwp: 3,
      batteryKwh: 5,
    },

    {
      id: "dn-occ",
      kind: "sensor",
      name: "Occupancy",
      zoneId: "dn-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch: "Set this to Vacant and wait — that is the automation argument in one move.",
      metric: "occupancy",
      unit: "",
      derived: false,
      min: 0,
      max: 1,
    },
    {
      id: "dn-lux",
      kind: "sensor",
      name: "Ambient Light",
      zoneId: "dn-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      metric: "lux",
      unit: "lux",
      derived: true,
      min: 0,
    },
    {
      id: "dn-temp",
      kind: "sensor",
      name: "Room Temperature",
      zoneId: "dn-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      metric: "temperature",
      unit: "°C",
      derived: true,
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Scenes — the six on the client's sheet                            */
  /* ---------------------------------------------------------------- */

  scenes: [
    {
      id: "work",
      name: "Work",
      icon: "❑",
      blurb: "Screen up, desk awake, cool neutral light on the work zone, curtains open.",
      fadeMs: 1400,
      targets: {
        // Colour left unset so circadian tuning owns it. Work at nine in the
        // morning should be cooler than Work at nine at night, from one button.
        "dn-general": { on: true, level: 85 },
        "dn-cove": { on: true, level: 60 },
        "dn-accent": { on: true, level: 45, cct: 3500 },
        "dn-rgb": { on: false },
        "dn-curtain": { sheer: 100, blackout: 0 },
        "dn-av": { on: false, screen: 0 },
        "dn-audio": { on: false },
        "dn-desk": { on: true, source: "Desktop" },
        "dn-ac": { on: true, setpointC: 24, mode: "cool", fan: 1 },
      },
      highlight: ["proplus-downlight"],
    },
    {
      id: "relax",
      name: "Relax",
      icon: "◐",
      blurb: "General out, cove down and warm, shelves lit, a little colour on the walls.",
      fadeMs: 2400,
      targets: {
        "dn-general": { on: false },
        "dn-cove": { on: true, level: 40, cct: 2400 },
        "dn-accent": { on: true, level: 65, cct: 2700 },
        "dn-rgb": { on: true, level: 28, cct: 2700, sat: 0 },
        "dn-curtain": { sheer: 100, blackout: 0 },
        "dn-av": { on: false, screen: 0 },
        "dn-audio": { on: true, source: "Playlist", volume: 26 },
        "dn-desk": { on: false },
        "dn-ac": { on: true, setpointC: 24, fan: 1 },
      },
      highlight: ["connekt-profile", "magneto-track"],
    },
    {
      id: "gaming",
      name: "Gaming",
      icon: "✳",
      blurb: "Saturated colour on the battens and behind the screen, white layers right back.",
      fadeMs: 900,
      targets: {
        "dn-general": { on: false },
        "dn-cove": { on: true, level: 12, cct: 2200 },
        "dn-accent": { on: true, level: 25, cct: 2700 },
        "dn-rgb": { on: true, level: 95, hue: 288, sat: 94 },
        "dn-curtain": { sheer: 100, blackout: 100 },
        "dn-av": { on: true, source: "Console", screen: 100, volume: 55 },
        "dn-audio": { on: true, source: "Console", volume: 62 },
        "dn-desk": { on: false },
        "dn-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
      },
      highlight: ["flexi-delta-rgb", "smartspaces-audio"],
    },
    {
      /**
       * The staged demonstration the requirement document specifies:
       *
       *   main lights OFF -> RGB/bias lighting ON -> curtains close
       *     -> screen descends -> projector ON -> speakers ON
       *
       * The long hold is the curtains, which take eight seconds. The screen
       * then takes seven more of its own, which is why the projector waits.
       */
      id: "movie",
      name: "Movie",
      icon: "▶",
      blurb:
        "Six stages: the main lights go out, bias lighting comes up, the curtains close, the screen descends, the projector fires and the speakers follow.",
      fadeMs: 2400,
      targets: {
        "dn-general": { on: false },
        "dn-cove": { on: true, level: 8, cct: 2200 },
        "dn-accent": { on: true, level: 12, cct: 2700 },
        "dn-desk": { on: false },
      },
      steps: [
        {
          label: "Bias lighting on",
          holdMs: 1600,
          targets: { "dn-rgb": { on: true, level: 42, hue: 224, sat: 68, fadeMs: 2200 } },
        },
        {
          label: "Curtains close",
          holdMs: 1400,
          targets: { "dn-curtain": { sheer: 100, blackout: 100 } },
        },
        {
          label: "Screen descends",
          holdMs: 8400,
          targets: { "dn-av": { screen: 100 } },
        },
        {
          label: "Projector on",
          holdMs: 7400,
          targets: { "dn-av": { on: true, source: "Streaming", volume: 45 } },
        },
        {
          label: "Speakers on",
          holdMs: 1200,
          targets: {
            "dn-audio": { on: true, source: "Projector", volume: 58 },
            "dn-ac": { on: true, setpointC: 23, mode: "cool", fan: 1 },
          },
        },
      ],
      highlight: ["smartspaces-av", "uniser-curtain-track", "flexi-delta-rgb"],
    },
    {
      id: "presentation",
      name: "Presentation",
      icon: "◑",
      blurb:
        "Screen down and projector on, but the room stays lit enough to read a face — the opposite of Movie.",
      fadeMs: 1600,
      targets: {
        // Deliberately not a dark room. People have to see each other, and a
        // presentation scene that kills the lights is the commonest mistake in
        // a boardroom or a den.
        "dn-general": { on: true, level: 45, cct: 4000 },
        "dn-cove": { on: true, level: 35, cct: 3500 },
        "dn-accent": { on: true, level: 30, cct: 3500 },
        "dn-rgb": { on: false },
        "dn-curtain": { sheer: 100, blackout: 100 },
        "dn-av": { on: true, source: "Laptop", screen: 100, volume: 30 },
        "dn-audio": { on: true, source: "Projector", volume: 34 },
        "dn-desk": { on: true, source: "Laptop" },
        "dn-ac": { on: true, setpointC: 23, mode: "cool", fan: 2 },
      },
      highlight: ["smartspaces-av"],
    },
    {
      id: "off",
      name: "All Off",
      icon: "⏻",
      blurb: "Everything down over three seconds, and the screen back up into its case.",
      fadeMs: 3000,
      targets: {
        "dn-general": { on: false },
        "dn-cove": { on: false },
        "dn-accent": { on: false },
        "dn-rgb": { on: false },
        "dn-av": { on: false, screen: 0 },
        "dn-audio": { on: false },
        "dn-desk": { on: false },
        "dn-ac": { on: false },
      },
    },
  ],

  rules: [
    {
      id: "dn-occupancy",
      kind: "occupancy",
      name: "Occupancy",
      explain:
        "Lights, projector, speakers and air conditioning shut down 20 minutes after the room empties. A projector left running is the most expensive thing in this room to forget.",
      enabledByDefault: true,
      sensorId: "dn-occ",
      holdMin: 20,
      onOccupied: {
        "dn-cove": { on: true, level: 45, fadeMs: 1600 },
        "dn-accent": { on: true, level: 50, fadeMs: 1600 },
      },
      onVacant: {
        "dn-general": { on: false, fadeMs: 4000 },
        "dn-cove": { on: false, fadeMs: 4000 },
        "dn-accent": { on: false, fadeMs: 4000 },
        "dn-rgb": { on: false, fadeMs: 3000 },
        "dn-av": { on: false, screen: 0 },
        "dn-audio": { on: false },
        "dn-desk": { on: false },
        "dn-ac": { on: false },
      },
    },
    {
      id: "dn-daylight",
      kind: "daylight",
      name: "Daylight Harvesting",
      explain:
        "With the curtains open the general lighting and the cove give back exactly the light the sun is already supplying. Switch this off at midday and watch them climb back to full.",
      enabledByDefault: true,
      deviceIds: ["dn-general", "dn-cove"],
      targetLux: 300,
      minLevel: 0,
    },
    {
      id: "dn-circadian",
      kind: "circadian",
      name: "Circadian Tuning",
      explain:
        "Colour temperature follows the day. Run the clock and press Work at different hours — the same scene is cool in the morning and warm at night.",
      enabledByDefault: true,
      deviceIds: ["dn-general", "dn-cove"],
      curve: [
        { min: 0, cct: 2200 },
        { min: 330, cct: 2300 },
        { min: 450, cct: 3800 },
        { min: 720, cct: 5200 },
        { min: 1020, cct: 3800 },
        { min: 1230, cct: 2700 },
        { min: 1380, cct: 2200 },
      ],
    },
  ],

  defaults: {
    "dn-occ": { value: 1 },
    "dn-lux": { value: 0 },
    "dn-temp": { value: 28 },
    "dn-ac": { currentC: 28, setpointC: 24 },
    "dn-curtain": { sheer: 100, blackout: 0 },
    "dn-av": { screen: 0 },
  },
  openingSceneId: "relax",
  // Evening. A media room is an evening room, and the RGB layer that makes it
  // one is invisible at midday.
  openingClockMin: 20 * 60 + 10,

  // Mumbai.
  environment: {
    sunriseMin: 6 * 60 + 20,
    sunsetMin: 18 * 60 + 55,
    outdoorPeakLux: 95000,
    windowFactor: 0.009,
    designLux: 260,
    outdoorMinC: 26,
    outdoorMaxC: 34,
  },

  baseline: {
    lightingWatts: 620,
    hvacWatts: 2000,
    operatingHours: { startMin: 18 * 60, endMin: 24 * 60 },
    hvacHours: { startMin: 18 * 60, endMin: 24 * 60 },
    note:
      "Baseline is 10 × 60 W halogen downlights plus 2 × 10 W strip runs (620 W) from 6:00 PM to midnight, and a non-inverter 2 ton split at a fixed setpoint (2000 W) over the same hours. Correct to the client's installed load before quoting.",
  },

  tariffPerKwh: 11,
  currency: "₹",
};
