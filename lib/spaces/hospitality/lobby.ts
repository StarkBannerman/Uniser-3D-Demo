import type { Space } from "@/lib/sim/types";

/**
 * A luxury hotel common area — lobby, reception and lounge.
 *
 * The room the client uses to demonstrate time-of-day lighting, and the
 * right one for it: a lobby is the only space in a hotel that is occupied
 * around the clock and expected to feel different at every hour of it. At
 * seven in the morning it is a thoroughfare and wants to be bright and cool;
 * at nine at night it is the first impression of an expensive building and
 * wants to be dark, warm and theatrical. Same fixtures, same positions.
 *
 * Seven circuits on the sheet, and six of them are fixed warm white. Only
 * the recessed downlights are tunable, which is the usual and correct
 * specification: the architectural and decorative layers are *the look* and
 * should not drift, while the downlights are the working light and have to
 * agree with the glazing through the day.
 */

/** 620 m² of lobby, reception and lounge under a double-height soffit. */
const AREA = 620;

export const lobby: Space = {
  id: "lobby",
  name: "Hotel Lobby",
  segment: "hospitality",
  category: "Hospitality",
  blurb:
    "A 620 m² hotel common area — lobby, reception and lounge — path-traced offline and relit live. Seven lighting layers across a glazed façade, a double-height soffit, a crystal chandelier and a water wall, with the time-of-day automation a building like this actually runs on.",
  renderer: "plates",
  plates: { dir: "/plates/lobby", profile: "lobby" },

  keypad: {
    layout: "grid",
    finish: "brass",
    scenes: ["morning", "day", "evening", "night"],
  },

  zones: [{ id: "ca-main", name: "Common Area", areaM2: AREA }],

  /** 06:00 Morning · 10:00 Day · 17:00 Evening · 21:00 Night · 02:00 Cleaning. */
  schedule: [
    { atMin: 6 * 60, sceneId: "morning" },
    { atMin: 10 * 60, sceneId: "day" },
    { atMin: 17 * 60, sceneId: "evening" },
    { atMin: 21 * 60, sceneId: "night" },
    { atMin: 2 * 60, sceneId: "cleaning" },
  ],

  /**
   * What an empty lobby does.
   *
   * The working light, the artwork spots and the decoratives fall back; the
   * architecture, the coves and the façade do not. That split is the whole
   * argument: a hotel cannot let its lobby go dark at two in the morning
   * because the building is still being looked at from the street, so the
   * saving has to come from the layers nobody is standing under.
   */
  autoDim: {
    deviceIds: ["ca-tunable", "ca-accent", "ca-deco"],
    toFraction: 0.3,
    afterMs: 10000,
    restoreMs: 1500,
  },

  /* ---------------------------------------------------------------- */
  /* Devices — the sheet's seven types                                 */
  /* ---------------------------------------------------------------- */

  devices: [
    {
      id: "ca-tunable",
      kind: "light",
      name: "Tunable White",
      zoneId: "ca-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "Seventy-eight recessed heads across the lobby, reception and lounge, 2700 K to 6500 K. The only circuit here whose colour moves, and it moves for one reason: at eleven in the morning it has to agree with a wall of glass, and at eleven at night it has to agree with a chandelier.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 6500 },
      fixtures: 78,
      wattsEach: 13,
      lumensEach: 1400,
      baselineWattsEach: 50,
      glow: [],
    },
    {
      id: "ca-arch",
      kind: "light",
      name: "Architectural",
      zoneId: "ca-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "A hundred and sixty metres of line: the soffit and beam runs, the high ceiling lines, the pilaster reveals, the walnut pillar corners and the stone grazers. Nobody looks at any of it and everybody would notice it gone — switch it off and the room loses its shape before it loses any light.",
      dimmable: true,
      fixtures: 160, // metres of run
      wattsEach: 5,
      lumensEach: 550,
      glow: [],
    },
    {
      id: "ca-cove",
      kind: "light",
      name: "Cove",
      zoneId: "ca-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Ninety-five metres in the soffit step and the ceiling coffers. The light whose source a guest never finds, and the reason a double-height lid reads as a designed ceiling rather than as the underside of the floor above.",
      dimmable: true,
      fixtures: 95, // metres of run
      wattsEach: 6,
      lumensEach: 700,
      glow: [],
    },
    {
      id: "ca-deco",
      kind: "light",
      name: "Decorative",
      zoneId: "ca-main",
      productId: "pipeline-pendant",
      subsystem: "lighting",
      pitch:
        "The crystal chandelier over the lounge, and the table and floor lamps around it. Statement lighting is not an illumination layer and should never be asked to be one — these are warm, they are low, and they are the thing a guest photographs on the way to the lift.",
      dimmable: true,
      fixtures: 46,
      wattsEach: 5,
      lumensEach: 260,
      glow: [],
    },
    {
      id: "ca-feature",
      kind: "light",
      name: "Feature",
      zoneId: "ca-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "The logo wall, the reception desk glow and the water wall. A hotel's feature lighting is the part a guest sees before they have been spoken to, which makes it the only layer in the building that is doing brand work rather than lighting work.",
      dimmable: true,
      fixtures: 38,
      wattsEach: 7,
      lumensEach: 700,
      glow: [],
    },
    {
      id: "ca-accent",
      kind: "light",
      name: "Accent",
      zoneId: "ca-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Thirty narrow beams on the artwork, the sculpture, the lounge centrepiece and up out of the planters. The layer that tells a guest what in the room is worth looking at, which in a hotel is a commercial decision rather than a decorative one.",
      dimmable: true,
      fixtures: 30,
      wattsEach: 9,
      lumensEach: 900,
      glow: [],
    },
    {
      id: "ca-facade",
      kind: "light",
      name: "Façade",
      zoneId: "ca-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "The entrance canopy, the kerb line, the palm uplights and the car on the forecourt. Off through the day because daylight beats it, and the single most valuable circuit in the building after dark — this is what a hotel looks like from a taxi.",
      dimmable: true,
      fixtures: 44,
      wattsEach: 11,
      lumensEach: 1100,
      glow: [],
    },

    {
      id: "ca-ac",
      kind: "climate",
      name: "Air Conditioning",
      zoneId: "ca-main",
      productId: "sensibo-airbend",
      subsystem: "climate",
      pitch:
        "Ten concealed fan-coils on one setpoint. A glazed double-height volume with a revolving door at one end is the hardest space in a hotel to hold at a temperature, and the only one every guest passes through twice a day.",
      minC: 16,
      maxC: 30,
      ratedWatts: 9800,
    },
    {
      id: "ca-music",
      kind: "av",
      name: "Music",
      zoneId: "ca-main",
      productId: "smartspaces-audio",
      subsystem: "av",
      pitch:
        "Distributed ceiling speakers through the lobby and lounge, carried on the same scenes as the light. A lobby is quiet enough that the music is part of the first impression, and a guest notices it stopping before they notice anything else.",
      sources: ["Lobby Ambient", "Morning", "Lounge Jazz", "Event Set"],
      hasScreen: false,
      ratedWatts: 380,
      glow: [],
    },

    {
      id: "ca-occ",
      kind: "sensor",
      name: "Lobby Occupancy",
      zoneId: "ca-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Presence across the lobby and lounge. A common area is never closed and rarely busy, and the hours in between are where a building like this quietly spends money.",
      metric: "occupancy",
      unit: "",
      min: 0,
      max: 1,
    },
    {
      id: "ca-lux",
      kind: "sensor",
      name: "Ambient Light",
      zoneId: "ca-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Measured light at the lounge seating, which is what daylight response regulates against. The seats by the glass need almost nothing from the ceiling at noon and all of it after dark.",
      metric: "lux",
      unit: "lx",
      derived: true,
    },
    {
      id: "ca-temp",
      kind: "sensor",
      name: "Lobby Temperature",
      zoneId: "ca-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Air temperature in the lobby, which is what the fan-coils regulate to and the first thing a guest in a coat complains about.",
      metric: "temperature",
      unit: "°C",
      derived: true,
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Scenes — the client's seven                                       */
  /* ---------------------------------------------------------------- */

  scenes: [
    {
      id: "morning",
      clockMin: 7 * 60 + 30,
      name: "Morning",
      icon: "☀",
      blurb:
        "Checkout and breakfast traffic. Cool and bright with the façade doing most of it, the decoratives barely on — a chandelier in morning daylight is a switched-on bulb and nothing more.",
      fadeMs: 2000,
      daylight: { day_sky: 100, day_morning: 100, day_midday: 0, day_evening: 0, sky: 0 },
      targets: {
        "ca-tunable": { on: true, level: 60, cct: 5000, sat: 0 },
        "ca-arch": { on: true, level: 40 },
        "ca-cove": { on: true, level: 50 },
        "ca-deco": { on: true, level: 20 },
        "ca-feature": { on: true, level: 40 },
        "ca-accent": { on: true, level: 30 },
        "ca-facade": { on: false },
        "ca-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
        "ca-music": { on: true, source: "Morning", volume: 18 },
      },
      highlight: ["proplus-downlight", "connekt-profile"],
    },
    {
      id: "day",
      clockMin: 13 * 60,
      name: "Day",
      icon: "◑",
      blurb:
        "The middle of the day, with the glass carrying the room. The leanest scene in the building: the decoratives are off entirely and the downlights are at half, because anything more is light nobody asked for against a wall of daylight.",
      fadeMs: 2000,
      daylight: { day_sky: 100, day_morning: 0, day_midday: 100, day_evening: 0, sky: 0 },
      targets: {
        "ca-tunable": { on: true, level: 50, cct: 5500, sat: 0 },
        "ca-arch": { on: true, level: 30 },
        "ca-cove": { on: true, level: 40 },
        "ca-deco": { on: false },
        "ca-feature": { on: true, level: 40 },
        "ca-accent": { on: true, level: 30 },
        "ca-facade": { on: false },
        "ca-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
        "ca-music": { on: true, source: "Lobby Ambient", volume: 16 },
      },
      highlight: ["proplus-downlight"],
    },
    {
      id: "evening",
      clockMin: 18 * 60 + 30,
      name: "Evening",
      icon: "◐",
      blurb:
        "The turn, run as one button: the daylight goes, the downlights warm, the feature and cove layers come up, the chandelier and lamps arrive and the music starts. Six stages, about six seconds — the scene that makes the glazing read as a view instead of a dark wall.",
      fadeMs: 1000,
      /**
       * Stage zero is housekeeping only.
       *
       * A staged scene applies `targets` before its first step and the
       * runner skips any step that commands nothing new, so anything named
       * here that a beat also names has already happened by the time that
       * beat runs — which turns the demonstration into a cut with captions
       * nobody sees. Every circuit the six beats talk about is therefore
       * absent, and the daylight starts where beat one puts it.
       */
      targets: {
        "ca-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
      },
      steps: [
        {
          label: "Daytime",
          holdMs: 2300,
          daylight: { day_sky: 100, day_morning: 0, day_midday: 100, day_evening: 0, sky: 0 },
          targets: {
            "ca-tunable": { on: true, level: 50, cct: 5500, fadeMs: 1000, sat: 0 },
            "ca-arch": { on: true, level: 30, fadeMs: 1000 },
            "ca-cove": { on: true, level: 40, fadeMs: 1000 },
            "ca-deco": { on: false, fadeMs: 1000 },
            "ca-feature": { on: true, level: 40, fadeMs: 1000 },
            "ca-accent": { on: true, level: 30, fadeMs: 1000 },
            "ca-facade": { on: false, fadeMs: 1000 },
          },
        },
        {
          label: "Daylight fading",
          holdMs: 2300,
          daylight: { day_sky: 30, day_morning: 0, day_midday: 0, day_evening: 40, sky: 70 },
          targets: {},
        },
        {
          label: "Warming colour temperature",
          holdMs: 2300,
          targets: {
            "ca-tunable": { on: true, level: 50, cct: 3000, fadeMs: 1000, sat: 0 },
          },
        },
        {
          label: "Feature lighting increases",
          holdMs: 2300,
          targets: {
            "ca-feature": { on: true, level: 80, fadeMs: 1000 },
            "ca-cove": { on: true, level: 80, fadeMs: 1000 },
            "ca-facade": { on: true, level: 60, fadeMs: 1000 },
            "ca-arch": { on: true, level: 70, fadeMs: 1000 },
          },
        },
        {
          label: "Decorative lighting activates",
          holdMs: 2300,
          targets: {
            "ca-deco": { on: true, level: 70, fadeMs: 1000 },
            "ca-accent": { on: true, level: 70, fadeMs: 1000 },
          },
        },
        {
          label: "Background music starts",
          holdMs: 2000,
          targets: {
            "ca-music": { on: true, source: "Lounge Jazz", volume: 30 },
          },
        },
      ],
      highlight: ["connekt-profile", "pipeline-pendant", "smartspaces-audio"],
    },
    {
      id: "night",
      clockMin: 22 * 60 + 30,
      name: "Night",
      icon: "☾",
      blurb:
        "Late. The downlights drop to a quarter and the façade goes to full — after midnight the building is lit for the street and for the few people crossing the floor, not for a full lobby.",
      fadeMs: 2600,
      daylight: { day_sky: 0, day_morning: 0, day_midday: 0, day_evening: 0, sky: 100 },
      targets: {
        "ca-tunable": { on: true, level: 25, cct: 2700, sat: 0 },
        "ca-arch": { on: true, level: 50 },
        "ca-cove": { on: true, level: 60 },
        "ca-deco": { on: true, level: 50 },
        "ca-feature": { on: true, level: 60 },
        "ca-accent": { on: true, level: 50 },
        "ca-facade": { on: true, level: 70 },
        "ca-ac": { on: true, setpointC: 23, mode: "cool", fan: 1 },
        "ca-music": { on: true, source: "Lobby Ambient", volume: 14 },
      },
      highlight: ["connekt-profile", "pipeline-pendant"],
    },
    {
      id: "welcome",
      clockMin: 16 * 60,
      name: "Welcome",
      icon: "✦",
      blurb:
        "A party is arriving and the lobby is the first thing they see. Everything up, the logo wall at full and the façade lit whatever the hour — the one scene that ignores the clock because a coach at four in the afternoon deserves the same entrance as one at nine.",
      fadeMs: 1800,
      targets: {
        "ca-tunable": { on: true, level: 70, cct: 3500, sat: 0 },
        "ca-arch": { on: true, level: 80 },
        "ca-cove": { on: true, level: 80 },
        "ca-deco": { on: true, level: 80 },
        "ca-feature": { on: true, level: 100 },
        "ca-accent": { on: true, level: 80 },
        "ca-facade": { on: true, level: 80 },
        "ca-ac": { on: true, setpointC: 22, mode: "cool", fan: 3 },
        "ca-music": { on: true, source: "Lounge Jazz", volume: 26 },
      },
      highlight: ["connekt-profile", "magneto-track"],
    },
    {
      id: "event",
      clockMin: 20 * 60,
      name: "Event",
      icon: "◈",
      blurb:
        "A function in the lounge, with the lobby as its approach. The decoratives and coves run at full and the air conditioning pre-cools to twenty-one — a room fills with people faster than a fan-coil can answer, so it goes early.",
      fadeMs: 2000,
      targets: {
        "ca-tunable": { on: true, level: 60, cct: 3000, sat: 0 },
        "ca-arch": { on: true, level: 80 },
        "ca-cove": { on: true, level: 100 },
        "ca-deco": { on: true, level: 100 },
        "ca-feature": { on: true, level: 100 },
        "ca-accent": { on: true, level: 90 },
        "ca-facade": { on: true, level: 100 },
        "ca-ac": { on: true, setpointC: 21, mode: "cool", fan: 4 },
        "ca-music": { on: true, source: "Event Set", volume: 40 },
      },
      highlight: ["pipeline-pendant", "smartspaces-audio"],
    },
    {
      id: "cleaning",
      clockMin: 2 * 60,
      name: "Cleaning",
      icon: "✚",
      blurb:
        "Two in the morning and the floor is being turned around. Full cool white on the downlights, the architecture holding the edges, and everything decorative off — nobody is being sold anything at this hour.",
      fadeMs: 900,
      targets: {
        "ca-tunable": { on: true, level: 100, cct: 5000, sat: 0 },
        "ca-arch": { on: true, level: 100 },
        "ca-cove": { on: true, level: 40 },
        "ca-deco": { on: false },
        "ca-feature": { on: false },
        "ca-accent": { on: false },
        "ca-facade": { on: false },
        "ca-ac": { on: true, setpointC: 25, mode: "fan", fan: 1 },
        "ca-music": { on: false },
      },
      highlight: ["proplus-downlight"],
    },
  ],

  /* ---------------------------------------------------------------- */

  rules: [
    {
      id: "ca-occupancy",
      kind: "occupancy",
      name: "Quiet Hours",
      explain:
        "The working light falls back when nobody has crossed the floor for twenty minutes and comes straight back when they do. The architecture, the coves and the façade are untouched: a hotel cannot let its lobby go dark, because the building is still being looked at from the street.",
      enabledByDefault: true,
      sensorId: "ca-occ",
      holdMin: 20,
      onOccupied: {
        "ca-tunable": { on: true, level: 60, fadeMs: 1500, sat: 0 },
        "ca-accent": { on: true, level: 50, fadeMs: 1600 },
      },
      onVacant: {
        "ca-tunable": { on: true, level: 20, fadeMs: 3000, sat: 0 },
        "ca-accent": { on: true, level: 20, fadeMs: 3200 },
      },
    },
    {
      id: "ca-daylight",
      kind: "daylight",
      name: "Daylight Harvesting",
      explain:
        "The downlights give back what the glazing is already supplying, regulated to 300 lux at the lounge seating. The architectural, cove and decorative layers are excluded — none of them is there to make lux, and trimming them would undo the scene.",
      enabledByDefault: true,
      deviceIds: ["ca-tunable"],
      targetLux: 300,
      minLevel: 15,
    },
    {
      id: "ca-circadian",
      kind: "circadian",
      name: "Circadian Tuning",
      explain:
        "The downlights follow the hour, cool through the middle of the day and warm at either end, so the ceiling agrees with the glass instead of fighting it. The six fixed-warm circuits hold their colour around the clock, which is what makes them the constant the room is read against.",
      enabledByDefault: true,
      deviceIds: ["ca-tunable"],
      curve: [
        { min: 0, cct: 2700 },
        { min: 360, cct: 4000 },
        { min: 600, cct: 5500 },
        { min: 840, cct: 5500 },
        { min: 1020, cct: 4200 },
        { min: 1200, cct: 3000 },
        { min: 1380, cct: 2700 },
      ],
    },
  ],

  /* ---------------------------------------------------------------- */

  defaults: {
    "ca-tunable": { on: true, level: 60, cct: 4000, sat: 0 },
    "ca-arch": { on: true, level: 40 },
    "ca-cove": { on: true, level: 50 },
    "ca-deco": { on: true, level: 20 },
    "ca-feature": { on: true, level: 40 },
    "ca-accent": { on: true, level: 30 },
    "ca-facade": { on: false, level: 0 },
    "ca-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
    "ca-music": { on: true, source: "Morning", volume: 18 },
  },

  openingSceneId: "evening",
  openingClockMin: 18 * 60 + 30,

  environment: {
    sunriseMin: 6 * 60 + 20,
    sunsetMin: 18 * 60 + 55,
    outdoorPeakLux: 95000,
    /**
     * High, and the plates agree.
     *
     * A double-height lobby behind a fully glazed entrance wall is the most
     * daylit space in a hotel, and this one has the sun passes to show it.
     * The figure is well above the restaurant's because the glass here runs
     * floor to soffit rather than to a head height.
     */
    windowFactor: 0.0085,
    designLux: 300,
    outdoorMinC: 26,
    outdoorMaxC: 34,
  },

  baseline: {
    lightingWatts: 14600,
    hvacWatts: 11800,
    operatingHours: { startMin: 0, endMin: 24 * 60 },
    hvacHours: { startMin: 0, endMin: 24 * 60 },
    note:
      "50 W halogen downlights throughout, decorative and feature circuits uncontrolled, façade on a timeclock and fan-coils with no setback — a lobby fitted out around 2011 and running twenty-four hours.",
  },

  tariffPerKwh: 11.5,
  currency: "₹",
};
