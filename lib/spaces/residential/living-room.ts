/**
 * Residence — Living Room.
 *
 * Built to the client's living-room sheet and to Section 3A of the requirement
 * document, which agree: general downlights, cove, decorative, accent, tunable
 * white and optional RGB, on curtains, air conditioning and a fan, with a
 * television and a music system, and six scenes — Welcome, Relax, Entertain,
 * Party, Movie, All Off.
 *
 * Every callout on that sheet is a device here. "Tunable white" is the one that
 * is not: it is a property of the white fixtures rather than a fixture of its
 * own, so it appears as a `tunable` range on four of them rather than as a
 * seventh control nobody could point at in the room.
 *
 * Movie is staged, because Section 13 of the document specifies exactly what a
 * scene should be able to do at once — lights down, curtains closed, screen and
 * sound on, air conditioning to a preset — and doing that in order is the
 * difference between showing a state change and showing a room responding.
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
    "A 43 m² living room in real-time 3D — downlights, cove, decorative pendants, accent and RGB on curtains, air conditioning, a fan, a television and a music system.",
  renderer: "3d",
  model: "living-room",

  keypad: {
    layout: "grid",
    finish: "graphite",
    scenes: ["welcome", "relax", "movie", "off"],
  },

  zones: [{ id: "lv-main", name: "Living Room", areaM2: AREA }],

  devices: [
    {
      id: "lv-downlights",
      kind: "light",
      name: "General",
      zoneId: "lv-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "Eight recessed heads on an even grid. Deliberately plain — it is the layer every other one is an accent against, and the first one a scene switches off.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5700 },
      fixtures: 8,
      wattsEach: 9,
      lumensEach: 800,
      baselineWattsEach: 60,
      glow: [],
    },
    {
      id: "lv-cove",
      kind: "light",
      name: "Cove",
      zoneId: "lv-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "26 metres of tunable strip in the perimeter step. It lights the ceiling, and the ceiling lights the room — you never see the source.",
      dimmable: true,
      tunable: { minK: 2200, maxK: 6500 },
      fixtures: 26, // metres of strip
      wattsEach: 9,
      lumensEach: 900,
      glow: [],
    },
    {
      id: "lv-decorative",
      kind: "light",
      name: "Decorative",
      zoneId: "lv-main",
      productId: "pipeline-pendant",
      subsystem: "lighting",
      pitch:
        "A cluster of seven smoked-glass globes on staggered drops. This is the piece a client's eye goes to first, and it dims like everything else.",
      dimmable: true,
      tunable: { minK: 2200, maxK: 3000 },
      fixtures: 7,
      wattsEach: 6,
      lumensEach: 450,
      baselineWattsEach: 40,
      glow: [],
    },
    {
      id: "lv-accent",
      kind: "light",
      name: "Accent",
      zoneId: "lv-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Strips in the shelving niches and a graze down the stone. Switch it off mid-sentence and the wall goes flat — that is the fastest way to show what accent lighting buys.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 4000 },
      fixtures: 12,
      wattsEach: 5,
      lumensEach: 300,
      glow: [],
    },
    {
      id: "lv-rgb",
      kind: "light",
      name: "Colour",
      zoneId: "lv-main",
      productId: "flexi-delta-rgb",
      subsystem: "lighting",
      pitch:
        "Concealed RGBW along the ceiling edge and behind the television. Optional on the drawing, and the one clients play with for ten minutes.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 6500 },
      rgb: true,
      fixtures: 18, // metres
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
        "Sheers for the glare, blackout for the film. Two tracks, open, close and preset positions.",
      layers: ["sheer", "blackout"],
      watts: 50,
      travelMs: 8500,
      // Only used by the 2D fallback renderer; the 3D scene owns the real window.
      window: { x: 0.06, y: 0.16, w: 0.4, h: 0.66 },
      draw: "both",
    },

    {
      id: "lv-ac",
      kind: "climate",
      name: "Air Conditioning",
      zoneId: "lv-main",
      productId: "sensibo-airbend",
      subsystem: "climate",
      pitch: "Temperature, mode and fan speed. Retrofits the existing split unit.",
      minC: 16,
      maxC: 30,
      ratedWatts: 1750,
    },
    {
      id: "lv-fan",
      kind: "fan",
      name: "Ceiling Fan",
      zoneId: "lv-main",
      productId: "smartspaces-fan",
      subsystem: "climate",
      pitch:
        "A BLDC fan at speed 2 draws under five watts and lets the air conditioning sit two degrees higher.",
      speeds: 5,
      ratedWatts: 32,
    },

    {
      id: "lv-tv",
      kind: "av",
      name: "Television",
      zoneId: "lv-main",
      productId: "smartspaces-av",
      subsystem: "av",
      pitch:
        "One press drops the lights, closes the curtains, wakes the screen and brings up the sound.",
      sources: ["Streaming", "Live TV", "Console", "Apple TV"],
      hasScreen: false,
      ratedWatts: 130,
      glow: [],
    },
    {
      id: "lv-audio",
      kind: "av",
      name: "Music",
      zoneId: "lv-main",
      productId: "smartspaces-audio",
      subsystem: "av",
      pitch:
        "Floorstanders either side of the media wall. Watch the drivers move with the volume — the speakers are part of the scene, not a logo on a slide.",
      sources: ["Playlist", "Radio", "Turntable", "TV Audio"],
      hasScreen: false,
      ratedWatts: 240,
      glow: [],
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

  /* ---------------------------------------------------------------- */
  /* Scenes — the six on the client's sheet                            */
  /* ---------------------------------------------------------------- */

  scenes: [
    {
      id: "welcome",
      name: "Welcome",
      icon: "☀",
      blurb: "Walking in: every layer up, curtains open to the city, air conditioning on.",
      fadeMs: 1600,
      targets: {
        // Colour left unset so circadian tuning owns it — Welcome at breakfast
        // is cool, Welcome at ten at night is warm, from the same button.
        "lv-downlights": { on: true, level: 80 },
        "lv-cove": { on: true, level: 85 },
        "lv-decorative": { on: true, level: 70, cct: 2500 },
        "lv-accent": { on: true, level: 65, cct: 3000 },
        "lv-rgb": { on: false },
        "lv-curtain": { sheer: 0, blackout: 0 },
        "lv-ac": { on: true, setpointC: 24, mode: "cool", fan: 2 },
        "lv-fan": { on: true, speed: 2 },
        "lv-tv": { on: false },
        "lv-audio": { on: false },
      },
      highlight: ["proplus-downlight", "connekt-profile"],
    },
    {
      id: "relax",
      name: "Relax",
      icon: "◐",
      blurb: "General out, cove down to 45% and warm, decorative and accent carrying the room.",
      fadeMs: 2400,
      targets: {
        "lv-downlights": { on: false },
        "lv-cove": { on: true, level: 45, cct: 2400 },
        "lv-decorative": { on: true, level: 55, cct: 2300 },
        "lv-accent": { on: true, level: 55, cct: 2700 },
        "lv-rgb": { on: false },
        "lv-curtain": { sheer: 100, blackout: 0 },
        "lv-ac": { on: true, setpointC: 24, fan: 1 },
        "lv-fan": { on: true, speed: 2 },
        "lv-tv": { on: false },
        "lv-audio": { on: true, source: "Playlist", volume: 22 },
      },
      highlight: ["connekt-profile", "pipeline-pendant"],
    },
    {
      id: "entertain",
      name: "Entertain",
      icon: "◑",
      blurb: "People in the room: every layer working, music up, air conditioning ahead of the crowd.",
      fadeMs: 1800,
      targets: {
        "lv-downlights": { on: true, level: 45, cct: 3000 },
        "lv-cove": { on: true, level: 75, cct: 2700 },
        "lv-decorative": { on: true, level: 80, cct: 2500 },
        "lv-accent": { on: true, level: 80, cct: 3200 },
        "lv-rgb": { on: true, level: 35, cct: 3000, sat: 0 },
        "lv-curtain": { sheer: 100, blackout: 0 },
        // A room that is about to fill with people is cooled before it needs to
        // be, not after — which is the argument for scheduling climate at all.
        "lv-ac": { on: true, setpointC: 22, mode: "cool", fan: 3 },
        "lv-fan": { on: true, speed: 3 },
        "lv-tv": { on: false },
        "lv-audio": { on: true, source: "Playlist", volume: 48 },
      },
      highlight: ["magneto-track", "smartspaces-audio"],
    },
    {
      id: "party",
      name: "Party",
      icon: "✳",
      blurb: "Colour takes over: RGB saturated along the ceiling, white layers pulled right back.",
      fadeMs: 1200,
      targets: {
        "lv-downlights": { on: false },
        "lv-cove": { on: true, level: 18, cct: 2200 },
        "lv-decorative": { on: true, level: 35, cct: 2200 },
        "lv-accent": { on: true, level: 30, cct: 2700 },
        "lv-rgb": { on: true, level: 90, hue: 288, sat: 92 },
        "lv-curtain": { sheer: 100, blackout: 0 },
        "lv-ac": { on: true, setpointC: 21, mode: "cool", fan: 3 },
        "lv-fan": { on: true, speed: 4 },
        "lv-tv": { on: false },
        "lv-audio": { on: true, source: "Playlist", volume: 78 },
      },
      highlight: ["flexi-delta-rgb", "smartspaces-audio"],
    },
    {
      /**
       * Staged, to Section 13 of the requirement document — the one scene it
       * spells out end to end. The long hold is the curtains: they take eight
       * and a half seconds to travel, and starting the film while they are
       * still moving throws away the most convincing thing in the sequence.
       */
      id: "movie",
      name: "Movie",
      icon: "▶",
      blurb:
        "Four stages: lights down, curtains close, screen and sound come up, then colour behind the television and the air conditioning to a viewing setpoint.",
      fadeMs: 2600,
      targets: {
        "lv-downlights": { on: true, level: 10, cct: 2700 },
        "lv-cove": { on: true, level: 6, cct: 2300 },
        "lv-decorative": { on: false },
        "lv-accent": { on: true, level: 15, cct: 2700 },
        "lv-rgb": { on: false },
      },
      steps: [
        {
          label: "Curtains close",
          holdMs: 1400,
          targets: { "lv-curtain": { sheer: 100, blackout: 100 } },
        },
        {
          label: "Screen and sound on",
          holdMs: 8800,
          targets: {
            "lv-tv": { on: true, source: "Streaming", volume: 40 },
            "lv-audio": { on: true, source: "TV Audio", volume: 52 },
          },
        },
        {
          label: "Colour behind the screen",
          holdMs: 1600,
          targets: { "lv-rgb": { on: true, level: 55, hue: 224, sat: 72, fadeMs: 2400 } },
        },
        {
          label: "Air conditioning to viewing setpoint",
          holdMs: 1400,
          targets: {
            "lv-ac": { on: true, setpointC: 23, mode: "cool", fan: 1 },
            "lv-fan": { on: true, speed: 2 },
          },
        },
      ],
      highlight: ["uniser-curtain-track", "smartspaces-av", "flexi-delta-rgb"],
    },
    {
      id: "off",
      name: "All Off",
      icon: "⏻",
      blurb: "Everything down over three seconds, including the television and the music.",
      fadeMs: 3000,
      targets: {
        "lv-downlights": { on: false },
        "lv-cove": { on: false },
        "lv-decorative": { on: false },
        "lv-accent": { on: false },
        "lv-rgb": { on: false },
        "lv-tv": { on: false },
        "lv-audio": { on: false },
        "lv-ac": { on: false },
        "lv-fan": { on: false },
      },
    },
  ],

  rules: [
    {
      id: "lv-occupancy",
      kind: "occupancy",
      name: "Occupancy",
      explain:
        "Lights, air conditioning and music shut down 20 minutes after the room empties, and the ambient layers come back when someone walks in.",
      enabledByDefault: true,
      sensorId: "lv-occ",
      holdMin: 20,
      onOccupied: {
        "lv-cove": { on: true, level: 60, fadeMs: 1600 },
        "lv-accent": { on: true, level: 55, fadeMs: 1600 },
      },
      onVacant: {
        "lv-downlights": { on: false, fadeMs: 4000 },
        "lv-cove": { on: false, fadeMs: 4000 },
        "lv-decorative": { on: false, fadeMs: 4000 },
        "lv-accent": { on: false, fadeMs: 4000 },
        "lv-rgb": { on: false, fadeMs: 3000 },
        "lv-tv": { on: false },
        "lv-audio": { on: false },
        "lv-ac": { on: false },
      },
    },
    {
      id: "lv-daylight",
      kind: "daylight",
      name: "Daylight Harvesting",
      explain:
        "That glazing is the largest light source in the room. The downlights and the cove give back exactly what the sun is already supplying — switch this off at midday and watch them climb back to full.",
      enabledByDefault: true,
      deviceIds: ["lv-downlights", "lv-cove"],
      targetLux: 320,
      minLevel: 0,
    },
    {
      id: "lv-circadian",
      kind: "circadian",
      name: "Circadian Tuning",
      explain:
        "Colour temperature follows the day. Run the clock and press Welcome at different hours — the same scene is cool at breakfast and warm at bedtime.",
      enabledByDefault: true,
      deviceIds: ["lv-downlights", "lv-cove"],
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
    "lv-fan": { speed: 2 },
    "lv-curtain": { sheer: 100, blackout: 0 },
  },
  openingSceneId: "welcome",
  // Dusk, as on the client's sheet: the city has just come on behind the
  // glazing and every layer in the room is still doing visible work.
  openingClockMin: 18 * 60 + 50,

  // Mumbai.
  environment: {
    sunriseMin: 6 * 60 + 20,
    sunsetMin: 18 * 60 + 55,
    outdoorPeakLux: 95000,
    // A near-full-height glazed wall, so a good deal more daylight reaches the
    // room than through the bedroom's window.
    windowFactor: 0.012,
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
