/**
 * Residence — Living Room.
 *
 * Built in 3D from the client's reference photograph: glazing with sheers and
 * drapes on one wall, a media wall opposite the seating, hallway beyond, stepped
 * cove ceiling with field downlights and a wall-wash grazing the media wall.
 *
 * Fixture placement lives in the 3D scene rather than in `glow`, because the
 * lights are real objects positioned in metres. `glow` stays empty so the
 * illustrated fallback renderer still has a valid array to iterate.
 *
 * Wattages and lumen figures remain the placeholders flagged in
 * `lib/catalog/products.ts`.
 */

import type { Space } from "@/lib/sim/types";

/** 6.0 x 7.2 m. */
const AREA = 43.2;

export const livingRoom: Space = {
  id: "living-room",
  name: "Living Room",
  segment: "residential",
  category: "Residence",
  blurb:
    "A 43 m² living room in real-time 3D — perimeter cove, field downlights, a wall-wash on the media wall and concealed TV accent, on sheers and drapes.",
  renderer: "3d",
  model: "living-room",

  zones: [{ id: "lv-main", name: "Living Room", areaM2: AREA }],

  devices: [
    {
      id: "lv-cove",
      kind: "light",
      name: "Cove",
      zoneId: "lv-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "24 metres of tunable strip in the perimeter step. It lights the ceiling, and the ceiling lights the room.",
      dimmable: true,
      tunable: { minK: 2200, maxK: 6500 },
      fixtures: 24,
      wattsEach: 9,
      lumensEach: 900,
      glow: [],
    },
    {
      id: "lv-downlights",
      kind: "light",
      name: "Downlights",
      zoneId: "lv-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch: "Five recessed heads over the seating. The layer you switch off first.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5700 },
      fixtures: 5,
      wattsEach: 9,
      lumensEach: 800,
      baselineWattsEach: 60,
      glow: [],
    },
    {
      id: "lv-wash",
      kind: "light",
      name: "Media Wall Wash",
      zoneId: "lv-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Three heads grazing the media wall. It is what makes a flat wall look designed rather than just lit.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 4000 },
      fixtures: 3,
      wattsEach: 12,
      lumensEach: 900,
      baselineWattsEach: 50,
      glow: [],
    },
    {
      id: "lv-accent",
      kind: "light",
      name: "TV Accent",
      zoneId: "lv-main",
      productId: "flexi-delta-rgb",
      subsystem: "lighting",
      pitch:
        "Concealed RGBW behind the television. This is the one clients play with for ten minutes.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 6500 },
      rgb: true,
      fixtures: 4,
      wattsEach: 12,
      lumensEach: 700,
      glow: [],
    },

    {
      id: "lv-curtain",
      kind: "shade",
      name: "Curtains",
      zoneId: "lv-main",
      productId: "uniser-curtain-track",
      subsystem: "shades",
      pitch:
        "Sheers for the glare, drapes for the film. Two tracks, one keypad button each.",
      layers: ["sheer", "blackout"],
      watts: 50,
      travelMs: 8500,
      window: { x: 0.06, y: 0.16, w: 0.4, h: 0.66 },
      draw: "both",
    },

    {
      id: "lv-av",
      kind: "av",
      name: "Television",
      zoneId: "lv-main",
      productId: "smartspaces-av",
      subsystem: "av",
      pitch: "One press drops the lights, closes the drapes and picks the source.",
      sources: ["Streaming", "Live TV", "Music", "Console"],
      hasScreen: false,
      ratedWatts: 130,
      glow: [],
    },

    {
      id: "lv-ac",
      kind: "climate",
      name: "Air Conditioning",
      zoneId: "lv-main",
      productId: "sensibo-airbend",
      subsystem: "climate",
      pitch: "Retrofits the existing split unit — no HVAC replacement.",
      minC: 16,
      maxC: 30,
      ratedWatts: 1750,
    },

    {
      id: "lv-solar",
      kind: "solar",
      name: "Rooftop Solar",
      zoneId: "lv-main",
      productId: "myminigrid",
      subsystem: "energy",
      kwp: 3,
      batteryKwh: 5,
    },

    {
      id: "lv-occ",
      kind: "sensor",
      name: "Occupancy",
      zoneId: "lv-main",
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
      id: "lv-lux",
      kind: "sensor",
      name: "Ambient Light",
      zoneId: "lv-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      metric: "lux",
      unit: "lux",
      derived: true,
      min: 0,
    },
    {
      id: "lv-temp",
      kind: "sensor",
      name: "Room Temperature",
      zoneId: "lv-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      metric: "temperature",
      unit: "°C",
      derived: true,
    },
  ],

  scenes: [
    {
      id: "bright",
      name: "Bright",
      icon: "☀",
      blurb: "Everything up, sheers closed against the glare. The daytime setting.",
      fadeMs: 1400,
      targets: {
        // Colour left unset so circadian tuning owns it — Bright at breakfast
        // is cool, Bright at ten at night is warm, from the same button.
        "lv-cove": { on: true, level: 100 },
        "lv-downlights": { on: true, level: 85 },
        "lv-wash": { on: true, level: 70 },
        "lv-accent": { on: false },
        "lv-curtain": { sheer: 100, blackout: 0 },
        "lv-ac": { on: true, setpointC: 24, mode: "cool", fan: 2 },
        "lv-av": { on: false },
      },
      highlight: ["connekt-profile", "proplus-downlight"],
    },
    {
      id: "relax",
      name: "Relax",
      icon: "◐",
      blurb: "Cove at 55% and warm, downlights out, wall wash holding the room together.",
      fadeMs: 2400,
      targets: {
        "lv-cove": { on: true, level: 55, cct: 2500 },
        "lv-downlights": { on: false },
        "lv-wash": { on: true, level: 40, cct: 2700 },
        "lv-accent": { on: true, level: 35, cct: 2700, sat: 0 },
        "lv-curtain": { sheer: 100, blackout: 0 },
        "lv-ac": { on: true, setpointC: 24, fan: 1 },
        "lv-av": { on: false },
      },
      highlight: ["magneto-track"],
    },
    {
      id: "movie",
      name: "Movie",
      icon: "▶",
      blurb: "Drapes closed, cove down to 10%, colour behind the screen, TV on.",
      fadeMs: 2600,
      targets: {
        "lv-cove": { on: true, level: 10, cct: 2300 },
        "lv-downlights": { on: false },
        "lv-wash": { on: false },
        "lv-accent": { on: true, level: 55, hue: 224, sat: 72 },
        "lv-curtain": { sheer: 100, blackout: 100 },
        "lv-ac": { on: true, setpointC: 23, fan: 1 },
        "lv-av": { on: true, source: "Streaming", volume: 42 },
      },
      highlight: ["flexi-delta-rgb", "uniser-curtain-track"],
    },
    {
      id: "off",
      name: "Off",
      icon: "⏻",
      blurb: "Everything down over three seconds.",
      fadeMs: 3000,
      targets: {
        "lv-cove": { on: false },
        "lv-downlights": { on: false },
        "lv-wash": { on: false },
        "lv-accent": { on: false },
        "lv-av": { on: false },
        "lv-ac": { on: false },
      },
    },
  ],

  rules: [
    {
      id: "lv-occupancy",
      kind: "occupancy",
      name: "Occupancy",
      explain:
        "Lights and air conditioning shut down 20 minutes after the room empties, and come back when someone walks in.",
      enabledByDefault: true,
      sensorId: "lv-occ",
      holdMin: 20,
      onOccupied: {
        "lv-cove": { on: true, level: 60, fadeMs: 1600 },
        "lv-downlights": { on: true, level: 55, fadeMs: 1600 },
      },
      onVacant: {
        "lv-cove": { on: false, fadeMs: 4000 },
        "lv-downlights": { on: false, fadeMs: 4000 },
        "lv-wash": { on: false, fadeMs: 4000 },
        "lv-accent": { on: false, fadeMs: 3000 },
        "lv-ac": { on: false },
      },
    },
    {
      id: "lv-daylight",
      kind: "daylight",
      name: "Daylight Harvesting",
      explain:
        "That window is the largest light source in the room. The cove and downlights give back exactly what the sun is already supplying — switch this off at midday and watch them climb back to full.",
      enabledByDefault: true,
      deviceIds: ["lv-cove", "lv-downlights"],
      targetLux: 520,
      minLevel: 0,
    },
    {
      id: "lv-circadian",
      kind: "circadian",
      name: "Circadian Tuning",
      explain:
        "Colour temperature follows the day. Run the clock and press Bright at different hours — the same scene is cool at breakfast and warm at bedtime.",
      enabledByDefault: true,
      deviceIds: ["lv-cove", "lv-downlights"],
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
    "lv-occ": { value: 1 },
    "lv-lux": { value: 0 },
    "lv-temp": { value: 29 },
    "lv-ac": { currentC: 29, setpointC: 24 },
    "lv-curtain": { sheer: 100, blackout: 0 },
  },
  openingSceneId: "bright",
  // Late afternoon. The reference is daylit, but opening at midday lets daylight
  // harvesting switch every fixture off — correct behaviour, and a first frame
  // with no cove in it. This hour has both.
  openingClockMin: 17 * 60 + 15,

  // Mumbai.
  environment: {
    sunriseMin: 6 * 60 + 20,
    sunsetMin: 18 * 60 + 55,
    outdoorPeakLux: 95000,
    // A near-full-height glazed wall, so a good deal more daylight reaches the
    // room than through the bedroom's window.
    windowFactor: 0.028,
    designLux: 320,
    outdoorMinC: 26,
    outdoorMaxC: 34,
  },

  baseline: {
    lightingWatts: 560,
    hvacWatts: 1950,
    operatingHours: { startMin: 17 * 60 + 30, endMin: 23 * 60 + 30 },
    hvacHours: { startMin: 18 * 60, endMin: 24 * 60 },
    note:
      "Baseline is 8 × 60 W halogen downlights plus 2 × 40 W lamps (560 W) from 5:30 PM to 11:30 PM, and a non-inverter 1.5 ton split at a fixed setpoint (1950 W) from 6:00 PM to midnight. Correct to the client's installed load before quoting.",
  },

  tariffPerKwh: 11,
  currency: "₹",
};
