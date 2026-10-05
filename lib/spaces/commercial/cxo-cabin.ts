/**
 * Commercial Office — CXO Cabin.
 *
 * Built to the client's CXO sheet and to the section of the requirement
 * document that goes with it. The document opens with the instruction that
 * matters most: *this should feel more premium and hospitality-like*. So the
 * room is laid out as two rooms in one — a desk and a lounge — and the lighting
 * is specified the way a hotel suite is rather than the way an office is.
 *
 * Seven lighting groups:
 *
 *   Decorative   -> cx-decorative  the suspended linear and the table lamp
 *   Cove         -> cx-cove        perimeter, warm, the premium layer
 *   General      -> cx-general     recessed, day to day
 *   Task         -> cx-task        the desk and nowhere else
 *   Accent       -> cx-accent      shelving, artwork, the stone wall
 *   Feature/RGB  -> cx-rgb         a wash behind the stone and under the joinery
 *   Tunable white -> a property of the first five, not an eighth device
 *
 * The difference from the boardroom next door is the whole point. A boardroom
 * is a working room that happens to be handsome; this one is a handsome room
 * that happens to work. Every scene here keeps the cove and the accent layers
 * alive even when the working light goes — which is exactly what separates a
 * hotel lobby from an open-plan floor, and what the brief is asking for.
 *
 * The staged Meeting demonstration is spelled out in the document:
 *
 *   welcome lighting -> blinds preset -> ambient lighting adjusts
 *     -> table/meeting lighting increases -> AC preset -> music OFF
 *
 * Note where it ends. The last thing that happens is the music stopping, which
 * is the most human instruction in any of these documents: the room notices
 * that the conversation has started.
 *
 * Wattages and lumen figures remain the placeholders flagged in
 * `lib/catalog/products.ts`.
 */

import type { Space } from "@/lib/sim/types";

/** 9.0 x 10.2 m. */
const AREA = 92;

export const cxoCabin: Space = {
  id: "cxo-cabin",
  name: "CXO Cabin",
  segment: "commercial",
  category: "Commercial Office",
  blurb:
    "A 92 m² executive cabin in real-time 3D — seven lighting groups across a desk and a lounge, motorised drapes, audio, and the seven scenes a working day in this room actually has.",
  renderer: "3d",
  model: "cxo-cabin",

  keypad: {
    layout: "grid",
    finish: "brass",
    scenes: ["welcome", "focus", "meeting", "leave"],
  },

  zones: [{ id: "cx-main", name: "CXO Cabin", areaM2: AREA }],

  devices: [
    {
      id: "cx-decorative",
      kind: "light",
      name: "Decorative",
      zoneId: "cx-main",
      productId: "pipeline-pendant",
      subsystem: "lighting",
      pitch:
        "A 2.6 m suspended linear over the desk and a shaded lamp by the sofa. This is the layer nobody can justify on a lux calculation and nobody forgets — it is what makes the room read as somebody's office rather than as an office.",
      dimmable: true,
      tunable: { minK: 2200, maxK: 4000 },
      fixtures: 2,
      wattsEach: 48,
      lumensEach: 2600,
      glow: [],
    },
    {
      id: "cx-cove",
      kind: "light",
      name: "Cove",
      zoneId: "cx-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "31 metres of tunable strip in a curved perimeter coffer. In a hospitality room the cove is never off — it is the layer that stays when everything else goes, and the reason an empty room still looks finished.",
      dimmable: true,
      tunable: { minK: 2200, maxK: 5000 },
      fixtures: 31, // metres of strip
      wattsEach: 9,
      lumensEach: 900,
      glow: [],
    },
    {
      id: "cx-general",
      kind: "light",
      name: "General",
      zoneId: "cx-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "Ten recessed heads on a loose grid, deliberately not a ceiling of them. An executive cabin lit like an open-plan floor is the commonest way to make an expensive room look cheap.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5000 },
      fixtures: 10,
      wattsEach: 11,
      lumensEach: 1000,
      baselineWattsEach: 72,
      glow: [],
    },
    {
      id: "cx-task",
      kind: "light",
      name: "Task",
      zoneId: "cx-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Narrow-beam heads on the desk surface and nowhere else. Focus takes this to full and leaves the rest of the room where it is — which is the single clearest thing separate zoning buys anybody who reads at a desk.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5500 },
      fixtures: 4,
      wattsEach: 7,
      lumensEach: 700,
      glow: [],
    },
    {
      id: "cx-accent",
      kind: "light",
      name: "Accent",
      zoneId: "cx-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Strips in every shelf bay and a graze down the stone wall. Switch it off mid-sentence and the whole back of the room goes flat — that is the fastest demonstration of accent lighting there is, and it takes two seconds.",
      dimmable: true,
      tunable: { minK: 2400, maxK: 3500 },
      fixtures: 16,
      wattsEach: 5,
      lumensEach: 320,
      glow: [],
    },
    {
      id: "cx-rgb",
      kind: "light",
      name: "Feature Colour",
      zoneId: "cx-main",
      productId: "flexi-delta-rgb",
      subsystem: "lighting",
      pitch:
        "A concealed wash behind the stone wall and under the joinery. The document says 'where appropriate', and in a CXO cabin appropriate means almost invisible — a warm lift behind the marble, not a colour-changing ceiling.",
      dimmable: true,
      tunable: { minK: 2200, maxK: 6000 },
      rgb: true,
      fixtures: 14, // metres
      wattsEach: 11,
      lumensEach: 600,
      glow: [],
    },

    {
      id: "cx-curtain",
      kind: "shade",
      name: "Curtains",
      zoneId: "cx-main",
      productId: "uniser-curtain-track",
      subsystem: "shades",
      pitch:
        "Sheer for the glare and a heavy drape behind it for privacy and for the evening. On a glazed corner at four in the afternoon the sheer alone is what makes the room usable.",
      layers: ["sheer", "blackout"],
      watts: 55,
      travelMs: 7000,
      window: { x: 0.03, y: 0.16, w: 0.33, h: 0.6 },
      draw: "both",
    },

    {
      id: "cx-audio",
      kind: "av",
      name: "Music",
      zoneId: "cx-main",
      productId: "smartspaces-audio",
      subsystem: "av",
      pitch:
        "In-ceiling pair over the lounge. The last stage of the Meeting demonstration is this switching off — the room noticing that the conversation has started, which is the most human thing in the whole specification.",
      sources: ["Streaming", "Radio", "Phone"],
      hasScreen: false,
      ratedWatts: 120,
      glow: [],
    },

    {
      id: "cx-ac",
      kind: "climate",
      name: "Air Conditioning",
      zoneId: "cx-main",
      productId: "sensibo-airbend",
      subsystem: "climate",
      minC: 16,
      maxC: 30,
      ratedWatts: 2200,
      pitch:
        "A corner cabin behind full-height glass takes more solar gain than any other room on the floor. The setpoint moving before a meeting rather than during it is the difference nobody notices and everybody feels.",
    },
    {
      id: "cx-occ",
      kind: "sensor",
      name: "Occupancy",
      zoneId: "cx-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Set this to Vacant and wait. A cabin that empties at six and holds its lights until the cleaners arrive at nine is three hours a day of a very expensive room lit for nobody.",
      metric: "occupancy",
      unit: "",
      derived: false,
      min: 0,
      max: 1,
    },
    {
      id: "cx-lux",
      kind: "sensor",
      name: "Ambient Light",
      zoneId: "cx-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      metric: "lux",
      unit: "lux",
      derived: true,
      min: 0,
    },
    {
      id: "cx-temp",
      kind: "sensor",
      name: "Room Temperature",
      zoneId: "cx-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      metric: "temperature",
      unit: "°C",
      derived: true,
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Scenes — the seven on the sheet                                   */
  /* ---------------------------------------------------------------- */

  scenes: [
    {
      id: "welcome",
      name: "Welcome",
      icon: "☼",
      blurb:
        "A warm and impressive first impression: cove and decorative up, the stone wall grazed, music on, curtains open to the city.",
      fadeMs: 2200,
      targets: {
        // Deliberately not the brightest scene. A first impression is made by
        // contrast and by the accent layers, not by lux — this is the one place
        // the hospitality instruction in the brief is most literal.
        /**
         * Neutral white, not amber.
         *
         * The working layers were already at 3500 K, but they are not what you
         * see: the cove at 88 per cent, the decorative at 85 and the accent at
         * 92 were all sitting at 2700 K, and between them they carry the room.
         * Three bright warm layers make an orange office however cool the
         * downlights are.
         *
         * The accent stays a little warmer than the rest because it is washing
         * timber and stone, where 4000 K reads green. Everything else is white.
         */
        "cx-general": { on: true, level: 48, cct: 4000 },
        "cx-cove": { on: true, level: 88, cct: 4000 },
        "cx-decorative": { on: true, level: 85, cct: 4000 },
        "cx-task": { on: true, level: 35, cct: 4000 },
        "cx-accent": { on: true, level: 92, cct: 3400 },
        "cx-rgb": { on: true, level: 22, cct: 3000, sat: 0 },
        "cx-curtain": { sheer: 0, blackout: 0 },
        "cx-audio": { on: true, source: "Streaming", volume: 22 },
        "cx-ac": { on: true, setpointC: 24, mode: "cool", fan: 1 },
      },
      highlight: ["pipeline-pendant", "magneto-track"],
    },
    {
      id: "focus",
      name: "Focus",
      icon: "❑",
      blurb:
        "Bright and balanced for deep work: task to full, general up and cool, decoration back, sheer across the glare.",
      fadeMs: 1600,
      targets: {
        "cx-general": { on: true, level: 85, cct: 4600 },
        "cx-cove": { on: true, level: 55, cct: 4000 },
        "cx-decorative": { on: true, level: 40, cct: 3500 },
        "cx-task": { on: true, level: 100, cct: 5000 },
        "cx-accent": { on: true, level: 45, cct: 3000 },
        "cx-rgb": { on: false },
        "cx-curtain": { sheer: 100, blackout: 0 },
        "cx-audio": { on: false },
        "cx-ac": { on: true, setpointC: 23, mode: "cool", fan: 2 },
      },
      highlight: ["magneto-track", "proplus-downlight"],
    },
    {
      /**
       * The staged demonstration the document specifies:
       *
       *   welcome lighting -> blinds preset -> ambient lighting adjusts
       *     -> table/meeting lighting increases -> AC preset -> music OFF
       *
       * Six stages, in that order, ending with the music. A room that stops
       * playing when the meeting starts is a better argument for automation
       * than any lighting change in the sequence, and it costs one line.
       */
      id: "meeting",
      name: "Meeting",
      icon: "◉",
      blurb:
        "Six stages: welcome lighting comes up, the curtains take their preset, the ambient layers settle, the desk lifts for the table, the air conditioning drops and the music stops.",
      fadeMs: 1800,
      targets: {
        "cx-rgb": { on: true, level: 22, cct: 3000, sat: 0 },
      },
      steps: [
        {
          label: "Welcome lighting activates",
          holdMs: 1400,
          targets: {
            "cx-cove": { on: true, level: 80, cct: 3900, fadeMs: 1800 },
            "cx-decorative": { on: true, level: 80, cct: 3900, fadeMs: 1800 },
            "cx-accent": { on: true, level: 85, cct: 3400, fadeMs: 1800 },
          },
        },
        {
          label: "Curtains take their preset",
          holdMs: 2000,
          targets: { "cx-curtain": { sheer: 100, blackout: 0 } },
        },
        {
          label: "Ambient lighting adjusts",
          holdMs: 7400,
          targets: {
            "cx-general": { on: true, level: 64, cct: 3800, fadeMs: 2200 },
            "cx-cove": { on: true, level: 58, cct: 3900, fadeMs: 2200 },
            "cx-decorative": { on: true, level: 55, cct: 3800, fadeMs: 2200 },
          },
        },
        {
          label: "Table lighting increases",
          holdMs: 2400,
          targets: { "cx-task": { on: true, level: 94, cct: 4000, fadeMs: 2000 } },
        },
        {
          label: "Air conditioning to preset",
          holdMs: 2200,
          targets: {
            "cx-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
          },
        },
        {
          label: "Music off",
          holdMs: 1600,
          targets: { "cx-audio": { on: false } },
        },
      ],
      highlight: ["uniser-curtain-track", "magneto-track", "smartspaces-audio"],
    },
    {
      id: "relax",
      name: "Relax",
      icon: "◐",
      blurb:
        "Soft and comfortable: general out, cove and decoration warm and low, the shelves still lit, music back on.",
      fadeMs: 2600,
      targets: {
        "cx-general": { on: false },
        "cx-cove": { on: true, level: 62, cct: 2400 },
        "cx-decorative": { on: true, level: 70, cct: 2400 },
        "cx-task": { on: false },
        "cx-accent": { on: true, level: 70, cct: 2500 },
        "cx-rgb": { on: true, level: 30, cct: 2300, sat: 0 },
        "cx-curtain": { sheer: 100, blackout: 0 },
        "cx-audio": { on: true, source: "Streaming", volume: 26 },
        "cx-ac": { on: true, setpointC: 24, fan: 1 },
      },
      highlight: ["connekt-profile", "pipeline-pendant"],
    },
    {
      id: "reading",
      name: "Reading",
      icon: "◪",
      blurb:
        "Focused and comfortable: the desk lit for paper at a warm neutral, the room behind it kept low so the page is the brightest thing in it.",
      fadeMs: 2000,
      targets: {
        "cx-general": { on: true, level: 32, cct: 3800 },
        "cx-cove": { on: true, level: 45, cct: 3600 },
        "cx-decorative": { on: true, level: 55, cct: 3600 },
        "cx-task": { on: true, level: 88, cct: 4000 },
        "cx-accent": { on: true, level: 55, cct: 3300 },
        "cx-rgb": { on: false },
        "cx-curtain": { sheer: 100, blackout: 0 },
        "cx-audio": { on: false },
        "cx-ac": { on: true, setpointC: 24, fan: 1 },
      },
      highlight: ["magneto-track"],
    },
    {
      id: "evening",
      name: "Evening",
      icon: "☾",
      blurb:
        "Warm and calming: everything down and amber, the drape drawn, colour lifting the stone from behind.",
      fadeMs: 3200,
      clockMin: 20 * 60 + 15,
      targets: {
        "cx-general": { on: false },
        // Lifted: with the drape drawn there is no daylight at all behind
        // these, and the levels that read as "low" against a window read as
        // "off" against nothing.
        "cx-cove": { on: true, level: 54, cct: 2200 },
        "cx-decorative": { on: true, level: 64, cct: 2200 },
        "cx-task": { on: false },
        "cx-accent": { on: true, level: 72, cct: 2400 },
        "cx-rgb": { on: true, level: 45, cct: 2200, sat: 0 },
        "cx-curtain": { sheer: 100, blackout: 100 },
        "cx-audio": { on: true, source: "Radio", volume: 18 },
        "cx-ac": { on: true, setpointC: 24, fan: 1 },
      },
      highlight: ["flexi-delta-rgb", "uniser-curtain-track"],
    },
    {
      id: "leave",
      name: "Leave",
      icon: "⏻",
      blurb:
        "All systems to standby over four seconds, curtains drawn, and nothing left running behind a closed door.",
      fadeMs: 4000,
      targets: {
        "cx-general": { on: false },
        "cx-cove": { on: false },
        "cx-decorative": { on: false },
        "cx-task": { on: false },
        "cx-accent": { on: false },
        "cx-rgb": { on: false },
        "cx-curtain": { sheer: 100, blackout: 100 },
        "cx-audio": { on: false },
        "cx-ac": { on: false },
      },
    },
  ],

  rules: [
    {
      id: "cx-occupancy",
      kind: "occupancy",
      name: "Occupancy",
      explain:
        "Everything stands down 20 minutes after the cabin empties, and the cove comes back up to a welcome level the moment somebody walks in. The room is never found dark and never left lit.",
      enabledByDefault: true,
      sensorId: "cx-occ",
      holdMin: 20,
      onOccupied: {
        "cx-cove": { on: true, level: 70, fadeMs: 2200 },
        "cx-accent": { on: true, level: 70, fadeMs: 2200 },
        "cx-decorative": { on: true, level: 60, fadeMs: 2200 },
      },
      onVacant: {
        "cx-general": { on: false, fadeMs: 5000 },
        "cx-cove": { on: false, fadeMs: 5000 },
        "cx-decorative": { on: false, fadeMs: 5000 },
        "cx-task": { on: false, fadeMs: 5000 },
        "cx-accent": { on: false, fadeMs: 5000 },
        "cx-rgb": { on: false, fadeMs: 4000 },
        "cx-audio": { on: false },
        "cx-ac": { on: false },
      },
    },
    {
      id: "cx-daylight",
      kind: "daylight",
      name: "Daylight Harvesting",
      explain:
        "General and task give back the light the glazing is already supplying. The accent and cove layers are deliberately left out of this — they are not there to make lux, and trimming them would undo the look the scene just set.",
      enabledByDefault: true,
      deviceIds: ["cx-general", "cx-task"],
      targetLux: 320,
      minLevel: 0,
    },
    {
      id: "cx-circadian",
      kind: "circadian",
      name: "Circadian Tuning",
      explain:
        "Colour follows the day on the working layers only, and stays inside the 3500-4000K band an executive office is specified to. The cove and the accent layers hold their warmth regardless, which is what keeps the room from going amber end to end.",
      enabledByDefault: true,
      deviceIds: ["cx-general", "cx-task"],
      curve: [
        { min: 0, cct: 3000 },
        { min: 420, cct: 3400 },
        { min: 540, cct: 4000 },
        { min: 780, cct: 4200 },
        { min: 960, cct: 3900 },
        { min: 1140, cct: 3500 },
        { min: 1380, cct: 3000 },
      ],
    },
  ],

  defaults: {
    "cx-occ": { value: 1 },
    "cx-lux": { value: 0 },
    "cx-temp": { value: 27 },
    "cx-ac": { currentC: 27, setpointC: 24 },
    "cx-curtain": { sheer: 0, blackout: 0 },
  },
  openingSceneId: "welcome",
  // Late afternoon. The hour this room looks best: low sun across the glazing,
  // the cove and the accent layers already doing visible work.
  openingClockMin: 17 * 60 + 20,

  // Mumbai.
  environment: {
    sunriseMin: 6 * 60 + 20,
    sunsetMin: 18 * 60 + 55,
    outdoorPeakLux: 95000,
    // A glazed corner, so more daylight than a boardroom with one wall of it.
    windowFactor: 0.021,
    // Below the boardroom's 420. An executive cabin is not specified to a task
    // standard across the whole floor area — the desk is, and the rest of the
    // room is deliberately softer.
    designLux: 320,
    outdoorMinC: 26,
    outdoorMaxC: 34,
  },

  baseline: {
    lightingWatts: 980,
    hvacWatts: 2600,
    operatingHours: { startMin: 9 * 60, endMin: 20 * 60 },
    hvacHours: { startMin: 9 * 60, endMin: 20 * 60 },
    note:
      "Baseline is 12 × 72 W halogen downlights plus 2 × 58 W decorative (980 W) from 9:00 AM to 8:00 PM, and a non-inverter 2.5 ton split at a fixed setpoint (2600 W) over the same hours. Correct to the client's installed load before quoting.",
  },

  tariffPerKwh: 11,
  currency: "₹",
};
