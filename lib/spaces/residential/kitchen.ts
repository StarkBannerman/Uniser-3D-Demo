/**
 * Residence — Kitchen.
 *
 * Built in 3D from the client's reference photograph: cabinet run with an
 * under-cabinet strip, tall appliance column, island with pendants, balcony
 * glazing behind a roman blind, ceiling fan and a wall-mounted split unit.
 *
 * The under-cabinet strip is the reason this room is worth having in the demo.
 * Task lighting is the easiest lighting argument to make and the hardest to make
 * on paper: a client sees the difference between a lit worktop and a worktop in
 * a lit room immediately, and never from a photograph in a brochure.
 *
 * Wattages and lumen figures remain the placeholders flagged in
 * `lib/catalog/products.ts`.
 */

import type { Space } from "@/lib/sim/types";

/** 7.0 x 5.5 m. */
const AREA = 38.5;

export const kitchen: Space = {
  id: "kitchen",
  name: "Kitchen",
  segment: "residential",
  category: "Residence",
  blurb:
    "A 38 m² kitchen in real-time 3D — under-cabinet task lighting, island pendants, ceiling downlights and a plinth accent, on a motorized blind.",
  renderer: "3d",
  model: "kitchen",
  /**
   * Hidden from the picker while the bedroom is the room being shown.
   *
   * Not deleted and not `renderer`-downgraded: the route still resolves and the
   * space still builds, so `/demo/kitchen` keeps working for anyone who has
   * the link. Drop this flag to put it back on the home page.
   */
  unlisted: true,

  zones: [{ id: "kt-main", name: "Kitchen", areaM2: AREA }],

  devices: [
    {
      id: "kt-undercabinet",
      kind: "light",
      name: "Under-Cabinet",
      zoneId: "kt-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Four metres of tunable strip under the wall units. Switch it off mid-demo and the worktop drops into the shadow of the person standing at it — that is the whole argument for task lighting, in one press.",
      dimmable: true,
      tunable: { minK: 2200, maxK: 6500 },
      fixtures: 4,
      wattsEach: 9,
      lumensEach: 900,
      glow: [],
    },
    {
      id: "kt-pendants",
      kind: "light",
      name: "Island Pendants",
      zoneId: "kt-main",
      productId: "pipeline-pendant",
      subsystem: "lighting",
      pitch: "Two drops over the island, on their own channel so the island can stay lit alone.",
      dimmable: true,
      tunable: { minK: 2200, maxK: 4000 },
      fixtures: 2,
      wattsEach: 12,
      lumensEach: 900,
      baselineWattsEach: 60,
      glow: [],
    },
    {
      id: "kt-downlights",
      kind: "light",
      name: "Downlights",
      zoneId: "kt-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch: "Six recessed heads for general light. In a kitchen this is the layer you dim, not the one you work by.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5700 },
      fixtures: 6,
      wattsEach: 9,
      lumensEach: 800,
      baselineWattsEach: 60,
      glow: [],
    },
    {
      id: "kt-plinth",
      kind: "light",
      name: "Island Plinth",
      zoneId: "kt-main",
      productId: "flexi-delta-rgb",
      subsystem: "lighting",
      pitch:
        "Concealed RGBW in the island kickboard. Not in the client's photograph — a standard addition, and the one people ask to play with.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 6500 },
      rgb: true,
      fixtures: 5,
      wattsEach: 12,
      lumensEach: 700,
      glow: [],
    },

    {
      id: "kt-blind",
      kind: "shade",
      name: "Blind",
      zoneId: "kt-main",
      productId: "uniser-curtain-track",
      subsystem: "shades",
      pitch: "A single motorized roman blind — the keypad shows one button, because the room has one layer.",
      // One layer only. The keypad derives its buttons from this.
      layers: ["blackout"],
      watts: 35,
      travelMs: 7000,
      window: { x: 0.72, y: 0.1, w: 0.26, h: 0.72 },
      draw: "both",
    },

    {
      id: "kt-fan",
      kind: "air",
      name: "Ceiling Fan",
      zoneId: "kt-main",
      productId: "smartspaces-wired",
      subsystem: "climate",
      pitch:
        "On the same keypad as the lights. Fan control is the single most-used automation in an Indian home and the one clients ask about first.",
      ratedWatts: 70,
      hasSpeed: true,
    },
    {
      id: "kt-ac",
      kind: "climate",
      name: "Air Conditioning",
      zoneId: "kt-main",
      productId: "sensibo-airbend",
      subsystem: "climate",
      pitch: "Retrofits the existing split unit on the wall.",
      minC: 16,
      maxC: 30,
      ratedWatts: 1500,
    },

    {
      id: "kt-solar",
      kind: "solar",
      name: "Rooftop Solar",
      zoneId: "kt-main",
      productId: "myminigrid",
      subsystem: "energy",
      kwp: 3,
      batteryKwh: 5,
    },

    {
      id: "kt-occ",
      kind: "sensor",
      name: "Occupancy",
      zoneId: "kt-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch: "Set this to Vacant and wait — the room shuts itself down.",
      metric: "occupancy",
      unit: "",
      derived: false,
      min: 0,
      max: 1,
    },
    {
      id: "kt-lux",
      kind: "sensor",
      name: "Ambient Light",
      zoneId: "kt-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      metric: "lux",
      unit: "lux",
      derived: true,
      min: 0,
    },
    {
      id: "kt-temp",
      kind: "sensor",
      name: "Room Temperature",
      zoneId: "kt-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      metric: "temperature",
      unit: "°C",
      derived: true,
    },
  ],

  scenes: [
    {
      id: "cook",
      name: "Cook",
      icon: "▲",
      blurb: "Everything up and neutral. Under-cabinet at full on the worktop.",
      fadeMs: 900,
      targets: {
        // Colour unset so circadian tuning owns it.
        "kt-undercabinet": { on: true, level: 100 },
        "kt-downlights": { on: true, level: 90 },
        "kt-pendants": { on: true, level: 85, cct: 3000 },
        "kt-plinth": { on: false },
        "kt-blind": { blackout: 0 },
        "kt-fan": { on: true, speed: 2 },
        "kt-ac": { on: true, setpointC: 24, mode: "cool", fan: 2 },
      },
      highlight: ["connekt-profile", "proplus-downlight"],
    },
    {
      id: "dine",
      name: "Dine",
      icon: "◐",
      blurb: "Pendants over the island, under-cabinet warm and low, downlights out.",
      fadeMs: 2000,
      targets: {
        "kt-undercabinet": { on: true, level: 35, cct: 2500 },
        "kt-downlights": { on: false },
        "kt-pendants": { on: true, level: 75, cct: 2400 },
        "kt-plinth": { on: true, level: 40, cct: 2700, sat: 0 },
        "kt-blind": { blackout: 0 },
        "kt-fan": { on: true, speed: 1 },
        "kt-ac": { on: true, setpointC: 24, fan: 1 },
      },
      highlight: ["pipeline-pendant"],
    },
    {
      id: "night",
      name: "Night",
      icon: "☾",
      blurb: "Plinth only, at eight percent. Enough to cross the room at 2am.",
      fadeMs: 2600,
      targets: {
        "kt-undercabinet": { on: false },
        "kt-downlights": { on: false },
        "kt-pendants": { on: false },
        "kt-plinth": { on: true, level: 30, hue: 28, sat: 40 },
        "kt-blind": { blackout: 100 },
        "kt-fan": { on: false },
        "kt-ac": { on: false },
      },
      highlight: ["flexi-delta-rgb"],
    },
    {
      id: "off",
      name: "Off",
      icon: "⏻",
      blurb: "Everything down over three seconds.",
      fadeMs: 3000,
      targets: {
        "kt-undercabinet": { on: false },
        "kt-downlights": { on: false },
        "kt-pendants": { on: false },
        "kt-plinth": { on: false },
        "kt-fan": { on: false },
        "kt-ac": { on: false },
      },
    },
  ],

  rules: [
    {
      id: "kt-occupancy",
      kind: "occupancy",
      name: "Occupancy",
      explain:
        "Lights, fan and air conditioning shut down 12 minutes after the kitchen empties. A kitchen is the room lights get left on in.",
      enabledByDefault: true,
      sensorId: "kt-occ",
      holdMin: 12,
      onOccupied: {
        "kt-undercabinet": { on: true, level: 80, fadeMs: 900 },
        "kt-downlights": { on: true, level: 70, fadeMs: 900 },
      },
      onVacant: {
        "kt-undercabinet": { on: false, fadeMs: 3000 },
        "kt-downlights": { on: false, fadeMs: 3000 },
        "kt-pendants": { on: false, fadeMs: 3000 },
        "kt-plinth": { on: false, fadeMs: 2000 },
        "kt-fan": { on: false },
        "kt-ac": { on: false },
      },
    },
    {
      id: "kt-daylight",
      kind: "daylight",
      name: "Daylight Harvesting",
      explain:
        "The balcony glazing lights this room for most of the day. The downlights give back what the sun is already supplying — the under-cabinet strip is deliberately excluded, because task light should not dim just because the room is bright.",
      enabledByDefault: true,
      // Note the omission: task lighting is not a harvesting candidate.
      deviceIds: ["kt-downlights"],
      targetLux: 480,
      minLevel: 0,
    },
    {
      id: "kt-circadian",
      kind: "circadian",
      name: "Circadian Tuning",
      explain:
        "Colour temperature follows the day. Press Cook at breakfast and at ten at night — same scene, different light.",
      enabledByDefault: true,
      deviceIds: ["kt-undercabinet", "kt-downlights"],
      curve: [
        { min: 0, cct: 2200 },
        { min: 330, cct: 2400 },
        { min: 450, cct: 4000 },
        { min: 720, cct: 5000 },
        { min: 1020, cct: 3800 },
        { min: 1230, cct: 2700 },
        { min: 1380, cct: 2200 },
      ],
    },
  ],

  defaults: {
    "kt-occ": { value: 1 },
    "kt-lux": { value: 0 },
    "kt-temp": { value: 29 },
    "kt-ac": { currentC: 29, setpointC: 24 },
    "kt-blind": { sheer: 0, blackout: 0 },
  },
  openingSceneId: "cook",
  // Late morning: the reference is a daylit kitchen, and this is when one is used.
  openingClockMin: 10 * 60 + 30,

  environment: {
    sunriseMin: 6 * 60 + 20,
    sunsetMin: 18 * 60 + 55,
    outdoorPeakLux: 95000,
    windowFactor: 0.012,
    // Kitchens are designed brighter than living spaces.
    designLux: 420,
    outdoorMinC: 26,
    outdoorMaxC: 34,
  },

  baseline: {
    lightingWatts: 480,
    hvacWatts: 1650,
    operatingHours: { startMin: 6 * 60, endMin: 22 * 60 + 30 },
    hvacHours: { startMin: 11 * 60, endMin: 22 * 60 },
    note:
      "Baseline is 6 × 60 W halogen downlights plus 2 × 60 W pendants (480 W) from 6:00 AM to 10:30 PM, and a non-inverter 1.5 ton split at a fixed setpoint (1650 W) from 11:00 AM to 10:00 PM. Correct to the client's installed load before quoting.",
  },

  tariffPerKwh: 11,
  currency: "₹",
};
