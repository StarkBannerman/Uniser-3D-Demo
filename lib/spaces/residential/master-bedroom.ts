/**
 * Residence — Master Bedroom.
 *
 * The first 3D space, modelled on the reference prototype: 6.5 x 6.5 m suite,
 * slatted timber feature wall, perimeter cove, full-height glazing on dual-track
 * curtains, cool accent strips at the curtain joins.
 *
 * Fixture placement for this space lives in the 3D scene, not in `glow` — the
 * lights are real light objects in metres, so 2D glow coordinates would be
 * meaningless. `glow` is left empty rather than removed so the illustrated
 * fallback renderer still has something valid to iterate over.
 *
 * Wattages and lumen figures remain the placeholders flagged in
 * `lib/catalog/products.ts`.
 */

import type { Space } from "@/lib/sim/types";

/** Floor area of the 6.5 x 6.5 m suite, used for lux and energy density. */
const AREA = 42.25;

export const masterBedroom: Space = {
  id: "master-bedroom",
  name: "Master Bedroom",
  segment: "residential",
  category: "Residence",
  blurb:
    "A 42 m² primary suite in real-time 3D — perimeter cove, downlights, pendant and concealed accents on dual-track curtains, driven from a wall keypad.",
  renderer: "3d",
  model: "master-bedroom",

  zones: [{ id: "mb-main", name: "Master Bedroom", areaM2: AREA }],

  devices: [
    {
      id: "mb-cove",
      kind: "light",
      name: "Cove",
      zoneId: "mb-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "22 metres of tunable strip in the perimeter coffer. It lights the ceiling, not the room, and you never see the source.",
      dimmable: true,
      tunable: { minK: 2200, maxK: 6500 },
      fixtures: 22, // metres of strip
      wattsEach: 9,
      lumensEach: 900,
      glow: [],
    },
    {
      id: "mb-downlights",
      kind: "light",
      name: "Downlights",
      zoneId: "mb-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch: "Three recessed heads on the bed and the walkway. Task light, not ambience.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5700 },
      fixtures: 3,
      wattsEach: 9,
      lumensEach: 800,
      baselineWattsEach: 60,
      glow: [],
    },
    {
      id: "mb-pendant",
      kind: "light",
      name: "Bedside Pendant",
      zoneId: "mb-main",
      productId: "pipeline-pendant",
      subsystem: "lighting",
      pitch: "Reading light on its own channel, so one side of the bed can stay dark.",
      dimmable: true,
      tunable: { minK: 2200, maxK: 4000 },
      fixtures: 1,
      wattsEach: 12,
      lumensEach: 900,
      baselineWattsEach: 40,
      glow: [],
    },
    {
      id: "mb-accent",
      kind: "light",
      name: "Curtain Accents",
      zoneId: "mb-main",
      productId: "flexi-delta-rgb",
      subsystem: "lighting",
      pitch:
        "Concealed RGBW at the curtain joins. Deliberately still lit in the All Off scene — architectural light, not room light.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 6500 },
      rgb: true,
      fixtures: 8, // metres
      wattsEach: 12,
      lumensEach: 700,
      glow: [],
    },

    {
      id: "mb-curtain",
      kind: "shade",
      name: "Curtains",
      zoneId: "mb-main",
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
      id: "mb-ac",
      kind: "climate",
      name: "Air Conditioning",
      zoneId: "mb-main",
      productId: "sensibo-airbend",
      subsystem: "climate",
      pitch: "Retrofits the existing split unit — no HVAC replacement.",
      minC: 16,
      maxC: 30,
      ratedWatts: 1800,
    },

    {
      id: "mb-solar",
      kind: "solar",
      name: "Rooftop Solar",
      zoneId: "mb-main",
      productId: "myminigrid",
      subsystem: "energy",
      kwp: 3,
      batteryKwh: 5,
    },

    {
      id: "mb-occ",
      kind: "sensor",
      name: "Occupancy",
      zoneId: "mb-main",
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
      id: "mb-lux",
      kind: "sensor",
      name: "Ambient Light",
      zoneId: "mb-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      metric: "lux",
      unit: "lux",
      derived: true,
      min: 0,
    },
    {
      id: "mb-temp",
      kind: "sensor",
      name: "Room Temperature",
      zoneId: "mb-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      metric: "temperature",
      unit: "°C",
      derived: true,
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Scenes — the four on the reference keypad                         */
  /* ---------------------------------------------------------------- */

  scenes: [
    {
      id: "bright",
      name: "Bright",
      icon: "☀",
      blurb: "Full cove wash, downlights on the bed, blackout drawn.",
      fadeMs: 1400,
      targets: {
        // Colour deliberately unspecified so circadian tuning owns it: Bright
        // at 7am is cool and alerting, Bright at 10pm is warm. That difference
        // is the whole point of the feature and it needs one scene to show it.
        "mb-cove": { on: true, level: 100 },
        "mb-downlights": { on: true, level: 55 },
        "mb-pendant": { on: true, level: 70, cct: 2700 },
        "mb-accent": { on: true, level: 60, hue: 218, sat: 88 },
        "mb-curtain": { sheer: 100, blackout: 100 },
        "mb-ac": { on: true, setpointC: 23, mode: "cool", fan: 2 },
      },
      highlight: ["connekt-profile", "proplus-downlight"],
    },
    {
      id: "relax",
      name: "Relax",
      icon: "◐",
      blurb: "Cove down to 62% and warm, sheers open to the city.",
      fadeMs: 2200,
      targets: {
        "mb-cove": { on: true, level: 62, cct: 2500 },
        "mb-downlights": { on: false },
        "mb-pendant": { on: true, level: 65, cct: 2400 },
        "mb-accent": { on: true, level: 70, hue: 218, sat: 88 },
        "mb-curtain": { sheer: 100, blackout: 0 },
        "mb-ac": { on: true, setpointC: 23, fan: 1 },
      },
      highlight: ["uniser-curtain-track"],
    },
    {
      id: "night",
      name: "Night",
      icon: "☾",
      blurb: "Twelve percent on the cove to find your way. Blackout closed.",
      fadeMs: 3200,
      targets: {
        "mb-cove": { on: true, level: 12, cct: 2200 },
        "mb-downlights": { on: false },
        "mb-pendant": { on: true, level: 22, cct: 2200 },
        "mb-accent": { on: true, level: 45, hue: 218, sat: 88 },
        "mb-curtain": { sheer: 100, blackout: 100 },
        "mb-ac": { on: true, setpointC: 24, fan: 1 },
      },
    },
    {
      id: "off",
      name: "Off",
      icon: "⏻",
      blurb: "Room light out over three seconds. Accents stay — they are architecture.",
      fadeMs: 3000,
      targets: {
        "mb-cove": { on: false },
        "mb-downlights": { on: false },
        "mb-pendant": { on: false },
        // Left lit on purpose: the reference video's blue slivers persist in its
        // all-off state, which is what identifies them as architectural rather
        // than room lighting.
        "mb-accent": { on: true, level: 40, hue: 218, sat: 88 },
        "mb-ac": { on: false },
      },
    },
  ],

  rules: [
    {
      id: "mb-occupancy",
      kind: "occupancy",
      name: "Occupancy",
      explain:
        "Room light and air conditioning shut down 20 minutes after the suite empties. The accents stay lit.",
      enabledByDefault: true,
      sensorId: "mb-occ",
      holdMin: 20,
      onOccupied: {
        "mb-cove": { on: true, level: 55, fadeMs: 1600 },
      },
      onVacant: {
        "mb-cove": { on: false, fadeMs: 4000 },
        "mb-downlights": { on: false, fadeMs: 4000 },
        "mb-pendant": { on: false, fadeMs: 4000 },
        "mb-ac": { on: false },
      },
    },
    {
      id: "mb-daylight",
      kind: "daylight",
      name: "Daylight Harvesting",
      explain:
        "With the sheers open, the cove and downlights give back exactly the light the sun is already supplying. Switch it off at midday and watch them climb back to full.",
      enabledByDefault: true,
      deviceIds: ["mb-cove", "mb-downlights"],
      targetLux: 150,
      minLevel: 0,
    },
    {
      id: "mb-circadian",
      kind: "circadian",
      name: "Circadian Tuning",
      explain:
        "Colour temperature follows the day. Run the clock and press Bright at different hours — the same scene is cool at breakfast and warm at bedtime.",
      enabledByDefault: true,
      deviceIds: ["mb-cove", "mb-downlights"],
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
    "mb-occ": { value: 1 },
    "mb-lux": { value: 0 },
    "mb-temp": { value: 28 },
    "mb-ac": { currentC: 28, setpointC: 23 },
  },
  openingSceneId: "bright",

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
