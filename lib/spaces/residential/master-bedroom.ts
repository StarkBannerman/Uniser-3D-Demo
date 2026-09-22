/**
 * Residence — Master Bedroom.
 *
 * Built to Section 4 of the client's requirement document: general, cove,
 * bedside, reading, wardrobe and night/path lighting, all tunable white, with
 * curtains, AC and a fan, six scenes, and the staged Good Night demonstration.
 *
 * Bedside and reading are each split into two devices rather than grouped. The
 * document asks for individual control, and "one side of the bed reads while
 * the other sleeps" is the clearest thirty-second argument for it — which a
 * grouped device cannot make.
 *
 * Left and right are named as the camera sees them, not as someone lying in the
 * bed would. The presenter is looking at a screen, and a keypad that disagreed
 * with the picture in front of them would be worse than either convention.
 *
 * Fixture placement lives in the 3D scene, not in `glow` — the lights are real
 * light objects in metres, so 2D glow coordinates would be meaningless. `glow`
 * is left empty rather than removed so the illustrated fallback renderer still
 * has something valid to iterate over.
 *
 * Wattages and lumen figures remain the placeholders flagged in
 * `lib/catalog/products.ts`.
 */

import type { Space } from "@/lib/sim/types";

/** Floor area of the 7.0 x 6.0 m suite, used for lux and energy density. */
const AREA = 42;

export const masterBedroom: Space = {
  id: "master-bedroom",
  name: "Master Bedroom",
  segment: "residential",
  category: "Residence",
  blurb:
    "A 42 m² primary suite in real-time 3D — six lighting groups from cove to under-bed path light, on curtains, air conditioning and a fan, with a staged Good Night sequence.",
  renderer: "3d",
  model: "master-bedroom",

  zones: [{ id: "bd-main", name: "Master Bedroom", areaM2: AREA }],

  devices: [
    {
      id: "bd-general",
      kind: "light",
      name: "General",
      zoneId: "bd-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "Four recessed heads on the bed, the walkway and the wardrobe. The layer you switch off first, and the one nobody misses.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5700 },
      fixtures: 4,
      wattsEach: 9,
      lumensEach: 800,
      baselineWattsEach: 60,
      glow: [],
    },
    {
      id: "bd-cove",
      kind: "light",
      name: "Cove",
      zoneId: "bd-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "24 metres of tunable strip in the perimeter coffer. It lights the ceiling, not the room, and you never see the source.",
      dimmable: true,
      tunable: { minK: 2200, maxK: 6500 },
      fixtures: 24, // metres of strip
      wattsEach: 9,
      lumensEach: 900,
      glow: [],
    },
    {
      id: "bd-bedside-l",
      kind: "light",
      name: "Bedside Left",
      zoneId: "bd-main",
      productId: "pipeline-pendant",
      subsystem: "lighting",
      pitch:
        "Table lamp on its own channel. Press this and the right-hand one and nothing else changes — that is what individual control means.",
      dimmable: true,
      tunable: { minK: 2200, maxK: 3500 },
      fixtures: 1,
      wattsEach: 8,
      lumensEach: 400,
      baselineWattsEach: 40,
      glow: [],
    },
    {
      id: "bd-bedside-r",
      kind: "light",
      name: "Bedside Right",
      zoneId: "bd-main",
      productId: "pipeline-pendant",
      subsystem: "lighting",
      pitch: "The other side of the bed, and a separate circuit all the way back.",
      dimmable: true,
      tunable: { minK: 2200, maxK: 3500 },
      fixtures: 1,
      wattsEach: 8,
      lumensEach: 400,
      baselineWattsEach: 40,
      glow: [],
    },
    {
      id: "bd-reading-l",
      kind: "light",
      name: "Reading Left",
      zoneId: "bd-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Articulated wall light, aimed at the pillow and nowhere else. 300 lux on the page and the rest of the room untouched.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 4000 },
      fixtures: 1,
      wattsEach: 6,
      lumensEach: 450,
      baselineWattsEach: 40,
      glow: [],
    },
    {
      id: "bd-reading-r",
      kind: "light",
      name: "Reading Right",
      zoneId: "bd-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch: "Press Reading and watch one pillow light while the other stays dark.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 4000 },
      fixtures: 1,
      wattsEach: 6,
      lumensEach: 450,
      baselineWattsEach: 40,
      glow: [],
    },
    {
      id: "bd-wardrobe",
      kind: "light",
      name: "Wardrobe",
      zoneId: "bd-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Strips above each bay behind smoked glass. Off it is a dark slab; on, you can see what is in it.",
      dimmable: true,
      tunable: { minK: 3000, maxK: 5000 },
      fixtures: 6, // metres of strip
      wattsEach: 7,
      lumensEach: 550,
      glow: [],
    },
    {
      id: "bd-night",
      kind: "light",
      name: "Path Light",
      zoneId: "bd-main",
      productId: "flexi-delta-rgb",
      subsystem: "lighting",
      pitch:
        "Under the bed and along the wardrobe plinth. The one fixture Good Night leaves on — enough to cross the room at 3am without waking anyone.",
      dimmable: true,
      tunable: { minK: 2200, maxK: 3000 },
      fixtures: 7, // metres
      wattsEach: 5,
      lumensEach: 220,
      glow: [],
    },

    {
      id: "bd-curtain",
      kind: "shade",
      name: "Curtains",
      zoneId: "bd-main",
      productId: "uniser-curtain-track",
      subsystem: "shades",
      pitch:
        "Dual track. Sheer for the view, blackout for sleeping — and the keypad picks which.",
      layers: ["sheer", "blackout"],
      watts: 55,
      travelMs: 9000,
      // Only used by the 2D fallback renderer; the 3D scene owns the real window.
      window: { x: 0.62, y: 0.14, w: 0.34, h: 0.62 },
      draw: "both",
    },

    {
      id: "bd-ac",
      kind: "climate",
      name: "Air Conditioning",
      zoneId: "bd-main",
      productId: "sensibo-airbend",
      subsystem: "climate",
      pitch: "Retrofits the existing split unit — no HVAC replacement.",
      minC: 16,
      maxC: 30,
      ratedWatts: 1800,
    },
    {
      id: "bd-fan",
      kind: "fan",
      name: "Ceiling Fan",
      zoneId: "bd-main",
      productId: "smartspaces-fan",
      subsystem: "climate",
      pitch:
        "A BLDC fan at speed 2 draws under five watts and lets the AC sit two degrees higher. That trade is most of the comfort argument in an Indian bedroom.",
      speeds: 5,
      ratedWatts: 32,
    },

    {
      id: "bd-solar",
      kind: "solar",
      name: "Rooftop Solar",
      zoneId: "bd-main",
      productId: "myminigrid",
      subsystem: "energy",
      kwp: 3,
      batteryKwh: 5,
    },

    {
      id: "bd-occ",
      kind: "sensor",
      name: "Occupancy",
      zoneId: "bd-main",
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
      id: "bd-lux",
      kind: "sensor",
      name: "Ambient Light",
      zoneId: "bd-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      metric: "lux",
      unit: "lux",
      derived: true,
      min: 0,
    },
    {
      id: "bd-temp",
      kind: "sensor",
      name: "Room Temperature",
      zoneId: "bd-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      metric: "temperature",
      unit: "°C",
      derived: true,
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Scenes — the six the requirement document names                   */
  /* ---------------------------------------------------------------- */

  scenes: [
    {
      id: "morning",
      name: "Morning",
      icon: "☀",
      blurb: "Curtains open to the city, general and cove up, everything else out.",
      fadeMs: 1600,
      targets: {
        // Colour deliberately unspecified so circadian tuning owns it: Morning
        // at 7am is cool and alerting. That difference is the whole point of
        // the feature and it needs a scene that does not fight it.
        "bd-general": { on: true, level: 75 },
        "bd-cove": { on: true, level: 60 },
        "bd-bedside-l": { on: false },
        "bd-bedside-r": { on: false },
        "bd-reading-l": { on: false },
        "bd-reading-r": { on: false },
        "bd-wardrobe": { on: true, level: 70, cct: 4000 },
        "bd-night": { on: false },
        "bd-curtain": { sheer: 0, blackout: 0 },
        "bd-ac": { on: true, setpointC: 25, mode: "cool", fan: 1 },
        "bd-fan": { on: true, speed: 2 },
      },
      highlight: ["uniser-curtain-track", "proplus-downlight"],
    },
    {
      id: "relax",
      name: "Relax",
      icon: "◐",
      blurb: "General out, cove down to 45% and warm, both bedside lamps on.",
      fadeMs: 2400,
      targets: {
        "bd-general": { on: false },
        "bd-cove": { on: true, level: 45, cct: 2400 },
        "bd-bedside-l": { on: true, level: 55, cct: 2300 },
        "bd-bedside-r": { on: true, level: 55, cct: 2300 },
        "bd-reading-l": { on: false },
        "bd-reading-r": { on: false },
        "bd-wardrobe": { on: false },
        "bd-night": { on: false },
        "bd-curtain": { sheer: 100, blackout: 0 },
        "bd-ac": { on: true, setpointC: 24, fan: 1 },
        "bd-fan": { on: true, speed: 3 },
      },
      highlight: ["connekt-profile"],
    },
    {
      id: "reading",
      name: "Reading",
      icon: "❑",
      blurb:
        "The right side reads, the left side sleeps. Reading light and bedside lamp on one side only.",
      fadeMs: 1400,
      targets: {
        "bd-general": { on: false },
        "bd-cove": { on: true, level: 15, cct: 2200 },
        "bd-bedside-l": { on: false },
        "bd-bedside-r": { on: true, level: 40, cct: 2400 },
        "bd-reading-l": { on: false },
        "bd-reading-r": { on: true, level: 90, cct: 3200 },
        "bd-wardrobe": { on: false },
        "bd-night": { on: true, level: 25, cct: 2200 },
        "bd-curtain": { sheer: 100, blackout: 100 },
        "bd-ac": { on: true, setpointC: 24, fan: 1 },
        "bd-fan": { on: true, speed: 2 },
      },
      highlight: ["magneto-track"],
    },
    {
      id: "evening",
      name: "Evening",
      icon: "◑",
      blurb: "Every layer working at once — cove, a little general, bedside and wardrobe.",
      fadeMs: 2200,
      targets: {
        "bd-general": { on: true, level: 35, cct: 2700 },
        "bd-cove": { on: true, level: 70, cct: 2700 },
        "bd-bedside-l": { on: true, level: 60, cct: 2400 },
        "bd-bedside-r": { on: true, level: 60, cct: 2400 },
        "bd-reading-l": { on: false },
        "bd-reading-r": { on: false },
        "bd-wardrobe": { on: true, level: 45, cct: 3200 },
        "bd-night": { on: false },
        "bd-curtain": { sheer: 100, blackout: 0 },
        "bd-ac": { on: true, setpointC: 24, fan: 2 },
        "bd-fan": { on: true, speed: 3 },
      },
      highlight: ["connekt-profile", "flexi-delta-rgb"],
    },
    {
      id: "night",
      name: "Night",
      icon: "☾",
      blurb: "Path light and a trace of cove. Blackout drawn, fan down, AC for sleeping.",
      fadeMs: 3000,
      targets: {
        "bd-general": { on: false },
        "bd-cove": { on: true, level: 8, cct: 2200 },
        "bd-bedside-l": { on: false },
        "bd-bedside-r": { on: false },
        "bd-reading-l": { on: false },
        "bd-reading-r": { on: false },
        "bd-wardrobe": { on: false },
        "bd-night": { on: true, level: 35, cct: 2200 },
        "bd-curtain": { sheer: 100, blackout: 100 },
        "bd-ac": { on: true, setpointC: 24, fan: 1 },
        "bd-fan": { on: true, speed: 2 },
      },
      highlight: ["flexi-delta-rgb"],
    },
    {
      /**
       * The staged demonstration the requirement document specifies:
       *
       *   lights dim → bedside lights reduce → curtains close
       *     → AC activates → selected lights switch OFF
       *
       * Every hold is chosen against what the room is actually doing. The long
       * one is stage three, because the curtains genuinely take nine seconds to
       * travel and cutting the lights while they are still moving would throw
       * away the most convincing thing in the sequence.
       */
      id: "goodnight",
      name: "Good Night",
      icon: "⏻",
      blurb:
        "Five stages over about fifteen seconds: lights dim, bedside reduces, curtains close, air conditioning drops to its sleeping setpoint, and everything goes out but the path light.",
      fadeMs: 2600,
      targets: {
        "bd-general": { on: true, level: 22, cct: 2300 },
        "bd-cove": { on: true, level: 30, cct: 2300 },
        "bd-reading-l": { on: false },
        "bd-reading-r": { on: false },
        "bd-wardrobe": { on: false },
      },
      steps: [
        {
          label: "Bedside lights reduce",
          holdMs: 2000,
          targets: {
            "bd-bedside-l": { on: true, level: 22, cct: 2200, fadeMs: 2200 },
            "bd-bedside-r": { on: true, level: 22, cct: 2200, fadeMs: 2200 },
          },
        },
        {
          label: "Curtains close",
          holdMs: 1800,
          targets: { "bd-curtain": { sheer: 100, blackout: 100 } },
        },
        {
          // Held until the curtains have finished travelling — 9s of motor, so
          // the AC lands as they seat rather than halfway across the glazing.
          label: "Air conditioning to sleeping setpoint",
          holdMs: 9200,
          targets: {
            "bd-ac": { on: true, setpointC: 24, mode: "cool", fan: 1 },
            "bd-fan": { on: true, speed: 2 },
          },
        },
        {
          label: "Lights off, path light stays",
          holdMs: 1600,
          targets: {
            "bd-general": { on: false, fadeMs: 3200 },
            "bd-cove": { on: false, fadeMs: 3200 },
            "bd-bedside-l": { on: false, fadeMs: 2600 },
            "bd-bedside-r": { on: false, fadeMs: 2600 },
            "bd-night": { on: true, level: 30, cct: 2200, fadeMs: 2000 },
          },
        },
      ],
      highlight: ["uniser-curtain-track", "sensibo-airbend"],
    },
  ],

  rules: [
    {
      id: "bd-occupancy",
      kind: "occupancy",
      name: "Occupancy",
      explain:
        "Room light and air conditioning shut down 20 minutes after the suite empties. The path light stays.",
      enabledByDefault: true,
      sensorId: "bd-occ",
      holdMin: 20,
      onOccupied: {
        "bd-cove": { on: true, level: 55, fadeMs: 1600 },
      },
      onVacant: {
        "bd-general": { on: false, fadeMs: 4000 },
        "bd-cove": { on: false, fadeMs: 4000 },
        "bd-bedside-l": { on: false, fadeMs: 4000 },
        "bd-bedside-r": { on: false, fadeMs: 4000 },
        "bd-reading-l": { on: false, fadeMs: 4000 },
        "bd-reading-r": { on: false, fadeMs: 4000 },
        "bd-wardrobe": { on: false, fadeMs: 2000 },
        "bd-ac": { on: false },
      },
    },
    {
      id: "bd-daylight",
      kind: "daylight",
      name: "Daylight Harvesting",
      explain:
        "With the curtains open, the general lighting and the cove give back exactly the light the sun is already supplying. Switch it off at midday and watch them climb back to full.",
      enabledByDefault: true,
      deviceIds: ["bd-general", "bd-cove"],
      targetLux: 150,
      minLevel: 0,
    },
    {
      id: "bd-circadian",
      kind: "circadian",
      name: "Circadian Tuning",
      explain:
        "Colour temperature follows the day. Run the clock and press Morning at different hours — the same scene is cool at breakfast and warm at bedtime.",
      enabledByDefault: true,
      deviceIds: ["bd-general", "bd-cove"],
      curve: [
        { min: 0, cct: 2200 },
        { min: 330, cct: 2300 },
        { min: 450, cct: 3600 },
        { min: 720, cct: 5000 },
        { min: 1020, cct: 3600 },
        { min: 1230, cct: 2600 },
        { min: 1380, cct: 2200 },
      ],
    },
  ],

  defaults: {
    "bd-occ": { value: 1 },
    "bd-lux": { value: 0 },
    "bd-temp": { value: 28 },
    "bd-ac": { currentC: 28, setpointC: 24 },
    "bd-curtain": { sheer: 100, blackout: 0 },
    "bd-fan": { speed: 2 },
  },
  openingSceneId: "evening",
  // Just after sunset. Evening is the scene with every layer working at once,
  // and this is the hour at which it reads — the cove and the lamps against a
  // city that has just come on.
  openingClockMin: 19 * 60 + 20,

  // Mumbai.
  environment: {
    sunriseMin: 6 * 60 + 20,
    sunsetMin: 18 * 60 + 55,
    outdoorPeakLux: 95000,
    windowFactor: 0.02,
    // Bedrooms are designed far lower than living rooms; 150 lux is an
    // appropriate ambient target and makes the Night scene read correctly.
    designLux: 150,
    outdoorMinC: 26,
    outdoorMaxC: 34,
  },

  baseline: {
    // 6 x 60 W halogen downlights plus two 40 W bedside lamps.
    lightingWatts: 440,
    hvacWatts: 2000,
    operatingHours: { startMin: 18 * 60, endMin: 23 * 60 + 30 },
    hvacHours: { startMin: 21 * 60, endMin: 7 * 60 },
    note:
      "Baseline is 6 × 60 W halogen downlights plus 2 × 40 W bedside lamps (440 W) from 6:00 PM to 11:30 PM, and a non-inverter 2 ton split at a fixed setpoint (2000 W) from 9:00 PM to 7:00 AM. Correct to the client's installed load before quoting.",
  },

  tariffPerKwh: 11,
  currency: "₹",
};
