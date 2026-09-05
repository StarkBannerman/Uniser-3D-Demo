/**
 * Residence — Living Room.
 *
 * The reference space. Every coordinate here is normalized (0..1) against the
 * illustrated room's 1600×900 viewBox in
 * `components/stage/rooms/LivingRoom.tsx`; if the illustration moves, these
 * move with it. Keeping the geometry in the config rather than the component is
 * what lets a photoreal base image replace the illustration later without
 * touching a line of control logic.
 *
 * Wattages and lumen figures are the placeholder values flagged in
 * `lib/catalog/products.ts` and need correcting against real datasheets before
 * this is shown to a client.
 */

import type { Space } from "@/lib/sim/types";

export const livingRoomIllustrated: Space = {
  id: "living-room-illustrated",
  name: "Living Room (illustrated)",
  segment: "residential",
  category: "Residence",
  blurb:
    "A 32 m² living room with a full lighting layer set — cove, track, downlights, pendant and concealed accent — on dual-track curtains and retrofitted climate control.",
  renderer: "illustrated",
  illustration: "living-room",
  // Superseded by the 3D living room. Kept, and kept unlisted, because it is
  // the only space exercising the illustrated renderer — which is the fallback
  // when WebGL is unavailable. Delete this and that path goes untested.
  unlisted: true,

  zones: [{ id: "lr-main", name: "Living Room", areaM2: 32 }],

  /* ---------------------------------------------------------------- */
  /* Devices                                                           */
  /* ---------------------------------------------------------------- */

  devices: [
    {
      id: "lr-cove",
      kind: "light",
      name: "Cove",
      zoneId: "lr-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "14 metres of tunable strip in the ceiling coffer. It is the layer that sets the mood, and you never see the source.",
      dimmable: true,
      tunable: { minK: 2200, maxK: 6500 },
      fixtures: 14, // metres of strip
      wattsEach: 9,
      lumensEach: 900,
      glow: [
        // Uplight into the coffer — the bright line the eye reads as the source.
        { shape: "strip", x: 0.5, y: 0.049, w: 0.75, h: 0.033, intensity: 1.1 },
        // The wash it throws back down into the room.
        { shape: "pool", x: 0.5, y: 0.2, radius: 0.52, intensity: 0.38, blur: 0.05 },
      ],
    },
    {
      id: "lr-track",
      kind: "light",
      name: "Track Spots",
      zoneId: "lr-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Four magnetic heads. The client can move them by hand when the art changes — no electrician, no tools.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 4000 },
      fixtures: 4,
      wattsEach: 12,
      lumensEach: 900,
      baselineWattsEach: 50, // the halogen spot it replaces
      glow: [
        { shape: "cone", x: 0.15, y: 0.116, angle: 5, spread: 26, reach: 0.62, radius: 0.06 },
        { shape: "cone", x: 0.269, y: 0.116, angle: -8, spread: 26, reach: 0.62, radius: 0.06 },
        { shape: "cone", x: 0.4375, y: 0.116, angle: 10, spread: 24, reach: 0.58, radius: 0.06 },
        { shape: "cone", x: 0.55, y: 0.116, angle: -6, spread: 24, reach: 0.58, radius: 0.06 },
      ],
    },
    {
      id: "lr-downlights",
      kind: "light",
      name: "Downlights",
      zoneId: "lr-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "The ambient layer. On its own it is a lit room; the point is that it is almost never on its own.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5700 },
      fixtures: 5,
      wattsEach: 9,
      lumensEach: 800,
      baselineWattsEach: 60,
      glow: [
        { shape: "cone", x: 0.1875, y: 0.131, spread: 58, reach: 0.8, radius: 0.045 },
        { shape: "cone", x: 0.35, y: 0.131, spread: 58, reach: 0.8, radius: 0.045 },
        { shape: "cone", x: 0.5125, y: 0.131, spread: 58, reach: 0.8, radius: 0.045 },
        { shape: "cone", x: 0.675, y: 0.131, spread: 58, reach: 0.8, radius: 0.045 },
        { shape: "cone", x: 0.8375, y: 0.131, spread: 58, reach: 0.8, radius: 0.045 },
        { shape: "ambient", x: 0.5, y: 0.55, w: 1, h: 0.9, intensity: 0.3 },
      ],
    },
    {
      id: "lr-pendant",
      kind: "light",
      name: "Pendant",
      zoneId: "lr-main",
      productId: "pipeline-pendant",
      subsystem: "lighting",
      pitch: "Decorative, but on the same dimming channel as everything else.",
      dimmable: true,
      tunable: { minK: 2200, maxK: 4000 },
      fixtures: 1,
      wattsEach: 15,
      lumensEach: 1100,
      baselineWattsEach: 60,
      glow: [
        { shape: "pool", x: 0.654, y: 0.378, radius: 0.11, intensity: 1.05 },
        { shape: "pool", x: 0.654, y: 0.63, radius: 0.15, intensity: 0.42, blur: 0.04 },
      ],
    },
    {
      id: "lr-tvglow",
      kind: "light",
      name: "Media Wall Accent",
      zoneId: "lr-main",
      productId: "flexi-delta-rgb",
      subsystem: "lighting",
      pitch:
        "Concealed RGBW behind the media wall. This is the one clients play with for ten minutes.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 6500 },
      rgb: true,
      fixtures: 3, // metres
      wattsEach: 12,
      lumensEach: 700,
      glow: [
        { shape: "pool", x: 0.206, y: 0.417, radius: 0.2, intensity: 0.95 },
        { shape: "pool", x: 0.206, y: 0.417, radius: 0.34, intensity: 0.35, blur: 0.06 },
      ],
    },
    {
      id: "lr-skylight",
      kind: "light",
      name: "Artificial Sky Light",
      zoneId: "lr-main",
      productId: "artificial-skylight",
      subsystem: "specialty",
      pitch:
        "A ceiling panel that reads as sky. Put this in a room with one small window and watch the client's face.",
      dimmable: true,
      tunable: { minK: 2000, maxK: 6500 },
      fixtures: 1,
      wattsEach: 95,
      lumensEach: 8000,
      glow: [
        { shape: "panel", x: 0.5, y: 0.067, w: 0.225, h: 0.058, intensity: 1.25 },
        { shape: "pool", x: 0.5, y: 0.36, radius: 0.56, intensity: 0.62, blur: 0.07 },
      ],
    },
    {
      id: "lr-canvia",
      kind: "light",
      name: "Smart Art",
      zoneId: "lr-main",
      productId: "canvia-art",
      subsystem: "specialty",
      pitch:
        "Modelled as a light because that is what it is — a matte emissive panel that changes with the scene.",
      dimmable: true,
      tunable: { minK: 2400, maxK: 5500 },
      fixtures: 1,
      wattsEach: 35,
      lumensEach: 300,
      glow: [
        { shape: "panel", x: 0.5125, y: 0.339, w: 0.15, h: 0.222, intensity: 0.85 },
      ],
    },

    {
      id: "lr-curtain",
      kind: "shade",
      name: "Curtains",
      zoneId: "lr-main",
      productId: "uniser-curtain-track",
      subsystem: "shades",
      pitch:
        "Two independent tracks. Sheer for glare, blackout for the film — and the scene decides which.",
      layers: ["sheer", "blackout"],
      watts: 45,
      travelMs: 9000,
      window: { x: 0.6875, y: 0.1889, w: 0.225, h: 0.5222 },
      draw: "both",
    },

    {
      id: "lr-ac",
      kind: "climate",
      name: "Air Conditioning",
      zoneId: "lr-main",
      productId: "sensibo-airbend",
      subsystem: "climate",
      pitch:
        "This retrofits the AC the client already owns. No HVAC replacement is the reason climate control survives the budget conversation.",
      minC: 16,
      maxC: 30,
      ratedWatts: 1450,
    },

    {
      id: "lr-av",
      kind: "av",
      name: "Entertainment",
      zoneId: "lr-main",
      productId: "smartspaces-av",
      subsystem: "av",
      pitch:
        "One press drops the screen, picks the source and takes the lights down together.",
      sources: ["Cinema", "Streaming", "Music", "Live TV"],
      hasScreen: true,
      screenRect: { x: 0.075, y: 0.1444, w: 0.275, h: 0.4333 },
      screenTravelMs: 6000,
      ratedWatts: 180,
      // The television, for when the screen is stowed.
      glow: [
        { shape: "panel", x: 0.206, y: 0.417, w: 0.2, h: 0.257, intensity: 0.7 },
        { shape: "pool", x: 0.206, y: 0.5, radius: 0.28, intensity: 0.3, blur: 0.05 },
      ],
    },

    {
      id: "lr-lock",
      kind: "lock",
      name: "Front Door",
      zoneId: "lr-main",
      productId: "smart-lock-doorbell",
      subsystem: "access",
      pitch: "The unlock is the trigger. Arriving home runs a scene, not a switch.",
    },

    {
      id: "lr-air",
      kind: "air",
      name: "Air Purifier",
      zoneId: "lr-main",
      productId: "ubreathe-airlab",
      subsystem: "air",
      pitch:
        "Watch the PM2.5 figure fall while it runs. In Mumbai that number sells itself.",
      ratedWatts: 45,
      hasSpeed: true,
    },
    {
      id: "lr-scent",
      kind: "air",
      name: "Scent",
      zoneId: "lr-main",
      productId: "dew-scent",
      subsystem: "specialty",
      pitch: "Scene-linked fragrance. The detail nobody expects in a lighting pitch.",
      ratedWatts: 8,
      hasSpeed: false,
    },

    {
      id: "lr-solar",
      kind: "solar",
      name: "Rooftop Solar",
      zoneId: "lr-main",
      productId: "myminigrid",
      subsystem: "energy",
      pitch: "Generation and consumption on one dashboard, not two portals.",
      kwp: 3,
      batteryKwh: 5,
    },

    /* Sensors ------------------------------------------------------- */
    {
      id: "lr-occ",
      kind: "sensor",
      name: "Occupancy",
      zoneId: "lr-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch: "Set this to Vacant and wait — that is the whole automation argument.",
      metric: "occupancy",
      unit: "",
      derived: false,
      min: 0,
      max: 1,
    },
    {
      id: "lr-lux",
      kind: "sensor",
      name: "Ambient Light",
      zoneId: "lr-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      metric: "lux",
      unit: "lux",
      derived: true,
      min: 0,
    },
    {
      id: "lr-temp",
      kind: "sensor",
      name: "Room Temperature",
      zoneId: "lr-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      metric: "temperature",
      unit: "°C",
      derived: true,
    },
    {
      id: "lr-pm25",
      kind: "sensor",
      name: "PM2.5",
      zoneId: "lr-main",
      productId: "ubreathe-airlab",
      subsystem: "sensors",
      metric: "pm25",
      unit: "µg/m³",
      derived: true,
      min: 0,
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Scenes                                                            */
  /* ---------------------------------------------------------------- */

  scenes: [
    {
      id: "welcome-home",
      name: "Welcome Home",
      icon: "🔑",
      blurb: "Door unlocks, room comes up warm, AC is already running.",
      fadeMs: 1600,
      targets: {
        "lr-lock": { locked: false },
        // Deliberately no `cct` on these three: Welcome Home hands their colour
        // to the circadian curve, so arriving at 8 AM gives a cool, alerting
        // room and arriving at 10 PM gives a warm one. It is the scene where
        // "the house knows what time it is" lands hardest — and the one scene
        // where a fixed colour temperature would waste the feature.
        "lr-downlights": { on: true, level: 70 },
        "lr-cove": { on: true, level: 55 },
        "lr-track": { on: true, level: 45 },
        "lr-pendant": { on: true, level: 75, cct: 2400 },
        "lr-tvglow": { on: true, level: 25, sat: 0, cct: 2700 },
        "lr-canvia": { on: true, level: 60, cct: 3000 },
        "lr-skylight": { on: false },
        "lr-curtain": { sheer: 40, blackout: 0 },
        "lr-ac": { on: true, setpointC: 24, mode: "cool", fan: 2 },
        "lr-av": { on: false, screen: 0 },
        "lr-air": { on: true, speed: 2 },
        "lr-scent": { on: true },
      },
      highlight: ["smart-lock-doorbell", "sensibo-airbend"],
    },
    {
      id: "movie-night",
      name: "Movie Night",
      icon: "🎬",
      blurb: "Screen down, blackout closed, cove holds at 8% so nobody trips.",
      fadeMs: 2600,
      targets: {
        "lr-cove": { on: true, level: 8, cct: 2300 },
        "lr-track": { on: false },
        "lr-downlights": { on: false },
        "lr-pendant": { on: false },
        "lr-canvia": { on: false },
        "lr-skylight": { on: false },
        "lr-tvglow": { on: true, level: 45, hue: 225, sat: 70 },
        "lr-curtain": { sheer: 100, blackout: 100 },
        "lr-ac": { on: true, setpointC: 22, fan: 1 },
        "lr-av": { on: true, source: "Cinema", volume: 45, screen: 100 },
        "lr-scent": { on: false },
      },
      highlight: ["smartspaces-av", "uniser-curtain-track", "connekt-profile"],
    },
    {
      id: "reading",
      name: "Reading",
      icon: "📖",
      blurb: "Track spots to 4000K on the seating, everything else pulled back.",
      fadeMs: 1200,
      targets: {
        "lr-track": { on: true, level: 92, cct: 4000 },
        "lr-cove": { on: true, level: 30, cct: 2700 },
        "lr-downlights": { on: true, level: 22, cct: 3000 },
        "lr-pendant": { on: true, level: 100, cct: 3500 },
        "lr-tvglow": { on: false },
        "lr-canvia": { on: true, level: 45, cct: 3000 },
        "lr-skylight": { on: false },
        "lr-curtain": { sheer: 60, blackout: 0 },
        "lr-av": { on: false, screen: 0 },
      },
      highlight: ["magneto-track"],
    },
    {
      id: "entertaining",
      name: "Entertaining",
      icon: "🥂",
      blurb: "Warm, saturated, fast fades. Music on, scent on.",
      fadeMs: 900,
      targets: {
        "lr-cove": { on: true, level: 65, cct: 2500 },
        "lr-track": { on: true, level: 55, cct: 3000 },
        "lr-downlights": { on: true, level: 35, cct: 2700 },
        "lr-pendant": { on: true, level: 80, cct: 2200 },
        "lr-tvglow": { on: true, level: 85, hue: 300, sat: 90 },
        "lr-canvia": { on: true, level: 70, cct: 2700 },
        "lr-skylight": { on: false },
        "lr-curtain": { sheer: 100, blackout: 0 },
        "lr-ac": { on: true, setpointC: 23, fan: 3 },
        "lr-av": { on: true, source: "Music", volume: 55, screen: 0 },
        "lr-scent": { on: true },
      },
      highlight: ["flexi-delta-rgb", "dew-scent"],
    },
    {
      id: "daylight",
      name: "Daylight",
      icon: "☀️",
      blurb:
        "Sky panel on, 5000K across the room, curtains fully open — a windowless room that reads as daylit.",
      fadeMs: 1500,
      targets: {
        "lr-skylight": { on: true, level: 100, cct: 5600 },
        "lr-downlights": { on: true, level: 80, cct: 5000 },
        "lr-cove": { on: true, level: 50, cct: 5000 },
        "lr-track": { on: true, level: 60, cct: 4000 },
        "lr-pendant": { on: false },
        "lr-tvglow": { on: false },
        "lr-canvia": { on: true, level: 80, cct: 5000 },
        "lr-curtain": { sheer: 0, blackout: 0 },
        "lr-ac": { on: true, setpointC: 24, fan: 2 },
        "lr-av": { on: false, screen: 0 },
      },
      highlight: ["artificial-skylight"],
    },
    {
      id: "goodnight",
      name: "Goodnight",
      icon: "🌙",
      blurb: "Four percent on the downlights to find your way. Door locks, blackout closes.",
      fadeMs: 4000,
      targets: {
        "lr-downlights": { on: true, level: 4, cct: 2200 },
        "lr-cove": { on: false },
        "lr-track": { on: false },
        "lr-pendant": { on: false },
        "lr-tvglow": { on: false },
        "lr-canvia": { on: false },
        "lr-skylight": { on: false },
        "lr-curtain": { sheer: 100, blackout: 100 },
        "lr-lock": { locked: true },
        "lr-ac": { on: true, setpointC: 25, fan: 1 },
        "lr-av": { on: false, screen: 0 },
        "lr-air": { on: true, speed: 1 },
        "lr-scent": { on: false },
      },
    },
    {
      id: "all-off",
      name: "All Off",
      icon: "⏻",
      blurb: "Everything down over two seconds. Reset between clients.",
      fadeMs: 2000,
      targets: {
        "lr-cove": { on: false },
        "lr-track": { on: false },
        "lr-downlights": { on: false },
        "lr-pendant": { on: false },
        "lr-tvglow": { on: false },
        "lr-canvia": { on: false },
        "lr-skylight": { on: false },
        "lr-av": { on: false, screen: 0 },
        "lr-ac": { on: false },
        "lr-air": { on: false },
        "lr-scent": { on: false },
        "lr-lock": { locked: true },
      },
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Automation                                                        */
  /* ---------------------------------------------------------------- */

  rules: [
    {
      id: "occupancy-off",
      kind: "occupancy",
      name: "Occupancy",
      explain:
        "Lights and air conditioning shut down 15 minutes after the room empties, and come back the moment someone walks in.",
      enabledByDefault: true,
      sensorId: "lr-occ",
      holdMin: 15,
      onOccupied: {
        "lr-downlights": { on: true, level: 60, fadeMs: 1200 },
        "lr-cove": { on: true, level: 45, fadeMs: 1200 },
      },
      onVacant: {
        "lr-downlights": { on: false, fadeMs: 3000 },
        "lr-cove": { on: false, fadeMs: 3000 },
        "lr-track": { on: false, fadeMs: 3000 },
        "lr-pendant": { on: false, fadeMs: 3000 },
        "lr-tvglow": { on: false, fadeMs: 3000 },
        "lr-canvia": { on: false, fadeMs: 2000 },
        "lr-skylight": { on: false, fadeMs: 3000 },
        "lr-ac": { on: false },
      },
    },
    {
      id: "daylight-harvest",
      kind: "daylight",
      name: "Daylight Harvesting",
      explain:
        "Fixtures give back exactly as much light as the sun is already supplying, holding around 300 lux on the working plane. Switch this off and watch them climb back to full output against a bright window.",
      enabledByDefault: true,
      deviceIds: ["lr-cove", "lr-downlights"],
      targetLux: 300,
      minLevel: 0,
    },
    {
      id: "circadian",
      kind: "circadian",
      name: "Circadian Tuning",
      explain:
        "Colour temperature follows the day — cool and alerting at midday, warm and settling after dark. Nobody notices it happening, only that the room feels right.",
      enabledByDefault: true,
      deviceIds: ["lr-cove", "lr-downlights", "lr-track"],
      curve: [
        { min: 0, cct: 2200 },
        { min: 360, cct: 2400 },
        { min: 480, cct: 3500 },
        { min: 720, cct: 5000 },
        { min: 1020, cct: 3800 },
        { min: 1200, cct: 2700 },
        { min: 1350, cct: 2200 },
      ],
    },
    {
      id: "night-setback",
      kind: "schedule",
      name: "Night Setback",
      explain:
        "At 1 AM the room puts itself to bed — lights out, air conditioning off — whether or not anyone remembered to.",
      enabledByDefault: true,
      at: 60,
      targets: {
        "lr-cove": { on: false, fadeMs: 8000 },
        "lr-downlights": { on: false, fadeMs: 8000 },
        "lr-track": { on: false, fadeMs: 8000 },
        "lr-pendant": { on: false, fadeMs: 8000 },
        "lr-tvglow": { on: false, fadeMs: 8000 },
        "lr-canvia": { on: false, fadeMs: 6000 },
        "lr-skylight": { on: false, fadeMs: 8000 },
        "lr-ac": { on: false },
        "lr-av": { on: false, screen: 0 },
        "lr-scent": { on: false },
      },
    },
    {
      id: "dusk-welcome",
      kind: "schedule",
      name: "Dusk",
      explain: "At dusk the cove lifts and the sheers draw, before anyone reaches for a switch.",
      enabledByDefault: true,
      at: "dusk",
      targets: {
        "lr-cove": { on: true, level: 45, fadeMs: 6000 },
        "lr-curtain": { sheer: 100 },
        "lr-canvia": { on: true, level: 55, fadeMs: 4000 },
      },
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Starting state and environment                                    */
  /* ---------------------------------------------------------------- */

  defaults: {
    "lr-occ": { value: 1 },
    "lr-lux": { value: 0 },
    "lr-temp": { value: 29 },
    "lr-pm25": { value: 58 },
    "lr-ac": { currentC: 29, setpointC: 24 },
    "lr-lock": { locked: true },
    "lr-air": { on: false, speed: 1 },
  },
  openingSceneId: "welcome-home",

  // Mumbai.
  environment: {
    sunriseMin: 6 * 60 + 20,
    sunsetMin: 18 * 60 + 55,
    outdoorPeakLux: 95000,
    // Fraction of outdoor horizontal illuminance reaching the room interior.
    // 0.015 puts an unshaded noon at ~1400 lux a few metres in, which is what a
    // large west-facing window actually delivers.
    windowFactor: 0.015,
    designLux: 300,
    outdoorMinC: 26,
    outdoorMaxC: 34,
  },

  baseline: {
    // 8 × 60 W halogen downlights + 2 × 20 W CFL, which is what this room would
    // have had before the retrofit.
    lightingWatts: 520,
    // Non-inverter 1.5 ton split running at a fixed setpoint.
    hvacWatts: 1800,
    // Residential lighting hours. Deliberately not the whole day: a home does
    // not run its living-room lights at 3am, and claiming savings against hours
    // that never existed is the fastest way to lose a technical client.
    operatingHours: { startMin: 17 * 60, endMin: 23 * 60 + 30 },
    // Air conditioning follows a different pattern to lighting in a Mumbai
    // residence: evening through to morning, not just the lit hours.
    hvacHours: { startMin: 19 * 60, endMin: 7 * 60 },
    note:
      "Baseline is 8 × 60 W halogen downlights plus 2 × 20 W CFL (520 W) on from 5:00 PM to 11:30 PM, and a non-inverter 1.5 ton split at a fixed setpoint (1800 W) from 7:00 PM to 7:00 AM. Correct these to the client's actual installed load before quoting.",
  },

  tariffPerKwh: 11,
  currency: "₹",
};
