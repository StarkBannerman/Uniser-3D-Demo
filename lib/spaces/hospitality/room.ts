import type { Space } from "@/lib/sim/types";

/**
 * A luxury hotel guest room.
 *
 * The lobby sells the building; this sells the stay. It is the only space in
 * the demo where the person using the controls is a guest rather than an
 * operator, and that changes what the room has to prove: not that a facilities
 * manager can save money, but that someone who has never seen this panel
 * before can walk in at midnight, press one thing, and have the room be right.
 *
 * Hence the two features a lobby does not need. The curtains are a real motor
 * with a real travel time, because a guest judges automation by whether the
 * blackout closes without them getting out of bed. And the door panel carries
 * the two indicators every hotel in the world has in some form — do not
 * disturb, and make up the room — on the same bus as the light, which is the
 * argument for wiring the room this way rather than as eleven separate things.
 *
 * Eleven circuits, and only the downlights are tunable. Everything else is
 * fixed 2700 K: a guest room is a warm room at every hour, and the one circuit
 * that moves is the one that has to go cool for housekeeping.
 */

/** 48 m² of king room with an en-suite, a wardrobe run and a desk. */
const AREA = 48;

export const room: Space = {
  id: "room",
  name: "Hotel Room",
  segment: "hospitality",
  category: "Commercial",
  blurb:
    "A 48 m² luxury guest room — bed, bath, wardrobe and desk — path-traced offline and relit live. Eleven lighting circuits, motorised blackout curtains over a full-height window, a fan-coil on the panel and the two door indicators every hotel runs, with the guest-arrival sequence a room like this is specified for.",
  renderer: "plates",
  plates: {
    dir: "/plates/room",
    profile: "room",
    /**
     * The second plate set, and the motor that crossfades to it.
     *
     * Two complete renders of the same camera, one with the curtains open and
     * one with the blackout shut, composited `mix(open, closed, position)`.
     * A curtain is the one thing in a room that light cannot be summed
     * around: it is an occluder, so its effect is on every other circuit's
     * plate rather than a plate of its own.
     */
    curtain: { dir: "/plates/room_closed", deviceId: "rm-curtain" },
    hotspotAliases: {
      curtains: { deviceId: "rm-curtain", label: "Blackout curtains" },
      hvac: { deviceId: "rm-ac", label: "Air conditioning" },
    },
  },

  keypad: {
    layout: "grid",
    finish: "brass",
    scenes: ["welcome", "relax", "reading", "good-night"],
  },

  zones: [{ id: "rm-main", name: "Guest Room", areaM2: AREA }],

  /**
   * Do not disturb and make up the room, which cannot both be true.
   *
   * Declared rather than wired, so the engine enforces the interlock on every
   * path — scene, hand, panel — and the automation tab gets its card from the
   * same line. The physical panel outside the door is two latching buttons
   * with exactly this behaviour.
   */
  exclusive: [
    {
      label: "Door panel",
      deviceIds: ["rm-dnd", "rm-service"],
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Devices — the sheet's eleven circuits, the curtain and the fan-coil */
  /* ---------------------------------------------------------------- */

  devices: [
    {
      id: "rm-tunable",
      kind: "light",
      name: "Tunable White",
      zoneId: "rm-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "Eight recessed heads over the bed, the walkway and the desk, 2700 K to 6500 K. The only circuit in the room whose colour moves, and it moves for housekeeping rather than for the guest — nobody checks in wanting 6500 K, and nobody cleans a bathroom at 2700 K.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 6500 },
      fixtures: 8,
      wattsEach: 11,
      lumensEach: 1100,
      baselineWattsEach: 50,
      glow: [],
    },
    {
      id: "rm-entry",
      kind: "light",
      name: "Entry",
      zoneId: "rm-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "Three downlights in the lobby of the room, between the door and the wardrobe. The first circuit a guest ever sees and the one that has to come on without being asked — a dark entry is the whole of a bad first impression.",
      dimmable: true,
      fixtures: 3,
      wattsEach: 9,
      lumensEach: 650,
      baselineWattsEach: 35,
      glow: [],
    },
    {
      id: "rm-bedside",
      kind: "light",
      name: "Bedside",
      zoneId: "rm-main",
      productId: "pipeline-pendant",
      subsystem: "lighting",
      pitch:
        "Wall lamps either side of the bed, on one circuit. The sheet does not split them left and right and it is right not to: two switches by a pillow is a decision a guest has to make in the dark, and the room should not be asking.",
      dimmable: true,
      fixtures: 2,
      wattsEach: 6,
      lumensEach: 320,
      glow: [],
    },
    {
      id: "rm-reading",
      kind: "light",
      name: "Reading",
      zoneId: "rm-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Two narrow beams aimed at the pillows and nowhere else. The circuit that lets one person read while the other sleeps, which is the single most requested thing in a hotel bedroom and almost never delivered.",
      dimmable: true,
      fixtures: 2,
      wattsEach: 4,
      lumensEach: 300,
      glow: [],
    },
    {
      id: "rm-cove",
      kind: "light",
      name: "Cove",
      zoneId: "rm-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Twenty-six metres in the tray ceiling, down the marble headboard wall and along the window head. The light that makes a 48 m² box read as a suite: no source a guest can point at, and the ceiling appears to be floating.",
      dimmable: true,
      fixtures: 26, // metres of run
      wattsEach: 5,
      lumensEach: 500,
      glow: [],
    },
    {
      id: "rm-bath",
      kind: "light",
      name: "Bathroom",
      zoneId: "rm-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "The mirror halo, the vanity under-light and the downlight over the bath. Spill from the en-suite is what a guest actually navigates by at three in the morning, which is why it is dimmable rather than switched.",
      dimmable: true,
      fixtures: 5,
      wattsEach: 8,
      lumensEach: 500,
      baselineWattsEach: 30,
      glow: [],
    },
    {
      id: "rm-wardrobe",
      kind: "light",
      name: "Wardrobe",
      zoneId: "rm-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Shelf and top LEDs inside the wardrobe, on the door contact. The cheapest circuit in the room and the one guests mention in reviews, because every hotel wardrobe anybody has ever opened was a black hole.",
      dimmable: true,
      fixtures: 6,
      wattsEach: 4,
      lumensEach: 280,
      glow: [],
    },
    {
      id: "rm-deco",
      kind: "light",
      name: "Decorative",
      zoneId: "rm-main",
      productId: "pipeline-pendant",
      subsystem: "lighting",
      pitch:
        "The faceted pendant over the side table, the floor lamp by the window and the glow off the desk tablet. Not an illumination layer — this is the circuit that makes the photograph, and it is the last one the arrival sequence brings up for exactly that reason.",
      dimmable: true,
      fixtures: 3,
      wattsEach: 7,
      lumensEach: 400,
      glow: [],
    },
    {
      id: "rm-night",
      kind: "light",
      name: "Night Path",
      zoneId: "rm-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Under-bed glow, nightstand underlights and a step light at the entry. Two watts a fixture to solve the problem every other circuit in the room makes worse: getting to the bathroom at four without waking anybody, including yourself.",
      dimmable: true,
      fixtures: 7,
      wattsEach: 2,
      lumensEach: 90,
      glow: [],
    },
    {
      id: "rm-dnd",
      kind: "light",
      name: "Do Not Disturb",
      zoneId: "rm-main",
      productId: "smartspaces-wired",
      subsystem: "lighting",
      pitch:
        "The red indicator on the door panel, carried on the lighting bus like everything else. Switched rather than dimmed, because an indicator at 40% is an indicator nobody trusts.",
      dimmable: false,
      fixtures: 1,
      wattsEach: 1,
      lumensEach: 8,
      glow: [],
    },
    {
      id: "rm-service",
      kind: "light",
      name: "Make Up Room",
      zoneId: "rm-main",
      productId: "smartspaces-wired",
      subsystem: "lighting",
      pitch:
        "The green indicator beside it, and the other half of the interlock. Housekeeping reads the corridor rather than a list, so this is the circuit that decides whether a trolley stops at the door.",
      dimmable: false,
      fixtures: 1,
      wattsEach: 1,
      lumensEach: 8,
      glow: [],
    },

    {
      id: "rm-curtain",
      kind: "shade",
      name: "Curtains",
      zoneId: "rm-main",
      productId: "uniser-curtain-track",
      subsystem: "shades",
      /**
       * One track, two plate sets, and a position rather than two layers.
       *
       * The engine's shade model carries a sheer and a blackout separately,
       * which is the right model for a window with two tracks on it. This
       * window has one, and the render is a pair — fully drawn back, fully
       * shut — so the honest control is a single position and "sheer" is the
       * halfway point of it. Declaring only `blackout` is what says so.
       */
      layers: ["blackout"],
      watts: 45,
      travelMs: 4000,
      window: { x: 0.74, y: 0.18, w: 0.24, h: 0.62 },
      draw: "both",
    },
    {
      id: "rm-ac",
      kind: "climate",
      name: "Air Conditioning",
      zoneId: "rm-main",
      productId: "sensibo-airbend",
      subsystem: "climate",
      pitch:
        "One concealed fan-coil on the room's own setpoint, reached from the panel, the app or the arrival sequence. A guest who has to hunt for a thermostat has already decided what they think of the room.",
      minC: 16,
      maxC: 30,
      ratedWatts: 1400,
    },

    {
      id: "rm-occ",
      kind: "sensor",
      name: "Room Occupancy",
      zoneId: "rm-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Presence in the room, which in a hotel is worth more than it is anywhere else: a guest room is empty about seventy per cent of the time it is sold, and every one of those hours is lit and cooled for nobody.",
      metric: "occupancy",
      unit: "",
      min: 0,
      max: 1,
    },
    {
      id: "rm-lux",
      kind: "sensor",
      name: "Ambient Light",
      zoneId: "rm-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Measured light at the desk, which is where daylight response regulates. With the blackout shut it reads what the fixtures are doing and nothing else, which is the point of a blackout.",
      metric: "lux",
      unit: "lx",
      derived: true,
    },
    {
      id: "rm-temp",
      kind: "sensor",
      name: "Room Temperature",
      zoneId: "rm-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Air temperature at head height. The number the guest argues with the front desk about, and the one the fan-coil is actually regulating to.",
      metric: "temperature",
      unit: "°C",
      derived: true,
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Scenes — the client's eight                                       */
  /* ---------------------------------------------------------------- */

  /**
   * Every scene names both door indicators.
   *
   * The sheet only asks three of them to — Housekeeping lights the green
   * one, Night and Good Night light the red — but an indicator that is not
   * named is an indicator that persists, and the first time a presenter goes
   * Good Night then Welcome they would hand a guest a room with Do Not
   * Disturb still showing on the corridor. The interlock in `exclusive`
   * stops the two ever being lit together; it cannot know that arriving
   * means neither.
   *
   * Four of the eight pin the exterior layers and four do not, and the
   * split is the curtain. Guest Arrival, Welcome, Evening and Housekeeping
   * are each *about* an hour — an arrival after dark, a dusk skyline, a
   * mid-morning turnaround — and they draw the curtain back to show it, so
   * the hour is part of the preset. Relax, Reading, Night and Good Night
   * have the curtain at half or shut, where the window contributes almost
   * nothing whatever the sky is doing. Those follow the clock instead,
   * which is what keeps the scrubber live: press Relax and drag the day
   * across, and the sheer glows and goes out.
   */
  scenes: [
    {
      id: "guest-arrival",
      clockMin: 20 * 60,
      name: "Guest Arrival",
      icon: "✧",
      blurb:
        "The room answering a key card, run as one button: entry light, curtains back, the room up to preset, the air conditioning away and the decoratives last. Five stages, about eight seconds — this is the sequence the client specified and the only one a guest ever sees.",
      fadeMs: 1000,
      /**
       * Stage zero is the dark room, and nothing else.
       *
       * A staged scene applies `targets` before its first step, and the
       * runner skips any step that commands nothing new — so anything the
       * five beats talk about must be set here to the state they start
       * *from*, never the state they end at. Everything is therefore off,
       * the curtain is shut and the air conditioning is down: a room nobody
       * has walked into yet.
       */
      daylight: { day_sky: 0, day_morning: 0, day_midday: 0, day_evening: 0, sky: 100 },
      targets: {
        "rm-tunable": { on: false },
        "rm-entry": { on: false },
        "rm-bedside": { on: false },
        "rm-reading": { on: false },
        "rm-cove": { on: false },
        "rm-bath": { on: false },
        "rm-wardrobe": { on: false },
        "rm-deco": { on: false },
        "rm-night": { on: false },
        "rm-dnd": { on: false },
        "rm-service": { on: false },
        "rm-curtain": { blackout: 100 },
        "rm-ac": { on: false },
      },
      steps: [
        {
          label: "Welcome. Entry lights on",
          holdMs: 2600,
          targets: {
            "rm-entry": { on: true, level: 100, fadeMs: 800 },
          },
        },
        {
          label: "Curtains opening",
          holdMs: 3700,
          targets: {
            // No `fadeMs`: a motor's travel is its own and a scene cannot
            // shorten it. Four seconds, which is what the track does.
            "rm-curtain": { blackout: 0 },
          },
        },
        {
          label: "Room lighting to preset",
          holdMs: 4200,
          targets: {
            "rm-cove": { on: true, level: 80, fadeMs: 1400 },
            "rm-tunable": { on: true, level: 70, cct: 3500, sat: 0, fadeMs: 1400 },
            "rm-bedside": { on: true, level: 60, fadeMs: 1400 },
            "rm-wardrobe": { on: true, level: 60, fadeMs: 1400 },
            "rm-bath": { on: true, level: 40, fadeMs: 1400 },
          },
        },
        {
          label: "AC cooling to 22 °C",
          holdMs: 4200,
          targets: {
            "rm-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
          },
        },
        {
          label: "Decorative lighting on",
          holdMs: 3950,
          targets: {
            "rm-deco": { on: true, level: 100, fadeMs: 1000 },
          },
        },
      ],
      highlight: ["uniser-curtain-track", "pipeline-pendant", "sensibo-airbend"],
    },
    {
      id: "welcome",
      clockMin: 19 * 60,
      name: "Welcome",
      icon: "◈",
      blurb:
        "The room as the guest finds it, with the curtains back on a dusk skyline. Warm, even and bright enough to unpack in — every circuit on except the reading spots and the night path, which are the two nobody wants on walking through the door.",
      fadeMs: 1800,
      daylight: { day_sky: 30, day_morning: 0, day_midday: 0, day_evening: 45, sky: 70 },
      targets: {
        "rm-entry": { on: true, level: 80 },
        "rm-bedside": { on: true, level: 70 },
        "rm-reading": { on: false },
        "rm-cove": { on: true, level: 90 },
        "rm-bath": { on: true, level: 50 },
        "rm-wardrobe": { on: false },
        "rm-deco": { on: true, level: 90 },
        "rm-night": { on: false },
        "rm-tunable": { on: true, level: 75, cct: 3500, sat: 0 },
        "rm-dnd": { on: false },
        "rm-service": { on: false },
        "rm-curtain": { blackout: 0 },
        "rm-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
      },
      highlight: ["proplus-downlight", "connekt-profile"],
    },
    {
      id: "relax",
      clockMin: 20 * 60 + 30,
      name: "Relax",
      icon: "◎",
      blurb:
        "Curtains to sheer and everything down to about a quarter. The downlights go to 2700 K and stay there — a room you are sitting in rather than moving through wants the ceiling almost out of it, with the cove and the lamps doing the work.",
      fadeMs: 2200,
      targets: {
        "rm-entry": { on: true, level: 20 },
        "rm-bedside": { on: true, level: 50 },
        "rm-reading": { on: false },
        "rm-cove": { on: true, level: 60 },
        "rm-bath": { on: true, level: 20 },
        "rm-wardrobe": { on: false },
        "rm-deco": { on: true, level: 50 },
        "rm-night": { on: false },
        "rm-tunable": { on: true, level: 25, cct: 2700, sat: 0 },
        "rm-dnd": { on: false },
        "rm-service": { on: false },
        "rm-curtain": { blackout: 50 },
        "rm-ac": { on: true, setpointC: 23, mode: "cool", fan: 1 },
      },
      highlight: ["connekt-profile", "uniser-curtain-track"],
    },
    {
      id: "reading",
      clockMin: 21 * 60 + 30,
      name: "Reading",
      icon: "❑",
      blurb:
        "The two narrow beams on the pillows at full, the entry and the bathroom out entirely. The scene that makes the case for a separate reading circuit: one person reads at task level while the rest of the room stays at the level the other one is falling asleep in.",
      fadeMs: 1600,
      targets: {
        "rm-entry": { on: false },
        "rm-bedside": { on: true, level: 60 },
        "rm-reading": { on: true, level: 100 },
        "rm-cove": { on: true, level: 40 },
        "rm-bath": { on: false },
        "rm-wardrobe": { on: false },
        "rm-deco": { on: true, level: 30 },
        "rm-night": { on: false },
        "rm-tunable": { on: true, level: 30, cct: 3000, sat: 0 },
        "rm-dnd": { on: false },
        "rm-service": { on: false },
        "rm-curtain": { blackout: 50 },
        "rm-ac": { on: true, setpointC: 23, mode: "cool", fan: 1 },
      },
      highlight: ["magneto-track"],
    },
    {
      id: "evening",
      clockMin: 18 * 60 + 30,
      name: "Evening",
      icon: "◑",
      blurb:
        "Back from dinner with the curtains open on the city. Warmer and lower than Welcome but still a working room — the bedside lamps lead, the cove holds the ceiling and the downlights drop to 2700 K behind both.",
      fadeMs: 2000,
      daylight: { day_sky: 15, day_morning: 0, day_midday: 0, day_evening: 30, sky: 85 },
      targets: {
        "rm-entry": { on: true, level: 30 },
        "rm-bedside": { on: true, level: 70 },
        "rm-reading": { on: false },
        "rm-cove": { on: true, level: 80 },
        "rm-bath": { on: true, level: 30 },
        "rm-wardrobe": { on: false },
        "rm-deco": { on: true, level: 80 },
        "rm-night": { on: false },
        "rm-tunable": { on: true, level: 40, cct: 2700, sat: 0 },
        "rm-dnd": { on: false },
        "rm-service": { on: false },
        "rm-curtain": { blackout: 0 },
        "rm-ac": { on: true, setpointC: 23, mode: "cool", fan: 2 },
      },
      highlight: ["pipeline-pendant", "connekt-profile"],
    },
    {
      id: "night",
      clockMin: 23 * 60,
      name: "Night",
      icon: "☽",
      blurb:
        "Blackout shut, the downlights out and the path lighting on. Do Not Disturb goes up on the door with it, because the two are the same decision and a guest should only have to make it once.",
      fadeMs: 2600,
      targets: {
        "rm-entry": { on: false },
        "rm-bedside": { on: true, level: 25 },
        "rm-reading": { on: false },
        "rm-cove": { on: true, level: 30 },
        "rm-bath": { on: true, level: 10 },
        "rm-wardrobe": { on: false },
        "rm-deco": { on: true, level: 20 },
        "rm-night": { on: true, level: 60 },
        "rm-tunable": { on: false },
        "rm-dnd": { on: true, level: 100 },
        "rm-service": { on: false },
        "rm-curtain": { blackout: 100 },
        "rm-ac": { on: true, setpointC: 24, mode: "cool", fan: 1 },
      },
      highlight: ["connekt-profile", "uniser-curtain-track"],
    },
    {
      id: "good-night",
      clockMin: 23 * 60 + 30,
      name: "Good Night",
      icon: "⏻",
      blurb:
        "Everything off but the path. The under-bed glow at 40% is the whole of the lighting in the room — enough to find the bathroom, not enough to read the time by — with the fan-coil on low and the door flagged.",
      fadeMs: 3000,
      targets: {
        "rm-entry": { on: false },
        "rm-bedside": { on: false },
        "rm-reading": { on: false },
        "rm-cove": { on: false },
        "rm-bath": { on: false },
        "rm-wardrobe": { on: false },
        "rm-deco": { on: false },
        "rm-night": { on: true, level: 40 },
        "rm-tunable": { on: false },
        "rm-dnd": { on: true, level: 100 },
        "rm-service": { on: false },
        "rm-curtain": { blackout: 100 },
        "rm-ac": { on: true, setpointC: 24, mode: "cool", fan: 1 },
      },
      highlight: ["connekt-profile", "sensibo-airbend"],
    },
    {
      id: "housekeeping",
      clockMin: 11 * 60,
      name: "Housekeeping",
      icon: "✚",
      blurb:
        "Mid-morning, curtains back and every circuit at full on cool white. The one scene in the room that is not for a guest, and the only reason the downlights are tunable at all — you cannot clean a bathroom at 2700 K.",
      fadeMs: 900,
      daylight: { day_sky: 100, day_morning: 0, day_midday: 100, day_evening: 0, sky: 0 },
      targets: {
        "rm-entry": { on: true, level: 100 },
        "rm-bedside": { on: true, level: 100 },
        "rm-reading": { on: false },
        "rm-cove": { on: true, level: 100 },
        "rm-bath": { on: true, level: 100 },
        "rm-wardrobe": { on: true, level: 100 },
        "rm-deco": { on: false },
        "rm-night": { on: false },
        "rm-tunable": { on: true, level: 100, cct: 5000, sat: 0 },
        "rm-dnd": { on: false },
        "rm-service": { on: true, level: 100 },
        "rm-curtain": { blackout: 0 },
        "rm-ac": { on: true, setpointC: 24, mode: "fan", fan: 2 },
      },
      highlight: ["proplus-downlight"],
    },
  ],

  /* ---------------------------------------------------------------- */

  rules: [
    {
      id: "rm-occupancy",
      kind: "occupancy",
      name: "Key Card Presence",
      explain:
        "The room falls back when the guest leaves and comes up when they return. The path lighting is left alone — an empty room still has to be safe to walk into — and so is the air conditioning, which is a setback rather than a shutdown because a Mumbai guest room that has been off all afternoon takes half an hour to recover.",
      enabledByDefault: true,
      sensorId: "rm-occ",
      holdMin: 15,
      onOccupied: {
        "rm-tunable": { on: true, level: 60, fadeMs: 1200, sat: 0 },
        "rm-cove": { on: true, level: 70, fadeMs: 1400 },
        "rm-bath": { on: true, level: 40, fadeMs: 1400 },
      },
      onVacant: {
        "rm-tunable": { on: false, fadeMs: 3000 },
        "rm-cove": { on: true, level: 15, fadeMs: 3200 },
        "rm-bath": { on: false, fadeMs: 3000 },
      },
    },
    {
      id: "rm-daylight",
      kind: "daylight",
      name: "Daylight Harvesting",
      explain:
        "The downlights give back what the window is already supplying, regulated at the desk. It is the one rule in the room the curtain can switch off by itself: draw the blackout and the measured daylight goes to almost nothing, so the trim releases without anybody telling it to.",
      enabledByDefault: true,
      deviceIds: ["rm-tunable"],
      /**
       * 900 lux, which is not the room's design level and is not meant to be.
       *
       * The desk is designed to 200, and regulating to that would take the
       * downlights to their floor every time the curtain is open in daylight
       * — correct for a guest sitting by the window and wrong for
       * Housekeeping, which is the only daytime scene in the room and wants
       * the ceiling at full. Measured: the window supplies about 110 lux at
       * eleven in the morning with the blackout back, so this trims
       * Housekeeping's downlights by about an eighth and leaves the scene
       * its character. The saving is real and the scene survives, which is
       * the trade the lobby's rule makes for the same reason.
       */
      targetLux: 900,
      minLevel: 60,
    },
    {
      id: "rm-circadian",
      kind: "circadian",
      name: "Circadian Tuning",
      explain:
        "The downlights follow the hour when no scene has claimed them — cool through the middle of the day, 2700 K from the evening on. The other ten circuits are fixed warm white and hold their colour around the clock, which is what a guest room should do: the room gets warmer as the night goes on and never gets colder.",
      enabledByDefault: true,
      deviceIds: ["rm-tunable"],
      curve: [
        { min: 0, cct: 2700 },
        { min: 360, cct: 3200 },
        { min: 600, cct: 5000 },
        { min: 840, cct: 4600 },
        { min: 1020, cct: 3400 },
        { min: 1200, cct: 2700 },
        { min: 1380, cct: 2700 },
      ],
    },
  ],

  /* ---------------------------------------------------------------- */

  /**
   * A serviced room with the light off, which is what Reset returns to.
   *
   * The curtain starts drawn back, and that is a decision about the first
   * frame rather than about housekeeping. The opening scene is Welcome,
   * which wants it open; a curtain is a four-second motor and a scene
   * cannot hurry one, so starting it shut would mean the room spent its
   * first four seconds opening a curtain underneath a still image that
   * already shows it open. The guest arrives to a room that is ready.
   */
  defaults: {
    "rm-tunable": { on: false, level: 0, cct: 3000, sat: 0 },
    "rm-entry": { on: false, level: 0 },
    "rm-bedside": { on: false, level: 0 },
    "rm-reading": { on: false, level: 0 },
    "rm-cove": { on: false, level: 0 },
    "rm-bath": { on: false, level: 0 },
    "rm-wardrobe": { on: false, level: 0 },
    "rm-deco": { on: false, level: 0 },
    "rm-night": { on: false, level: 0 },
    "rm-dnd": { on: false, level: 0 },
    "rm-service": { on: false, level: 0 },
    "rm-curtain": { blackout: 0 },
    "rm-ac": { on: true, setpointC: 24, mode: "cool", fan: 1 },
  },

  openingSceneId: "welcome",
  openingClockMin: 19 * 60,

  environment: {
    sunriseMin: 6 * 60 + 20,
    sunsetMin: 18 * 60 + 55,
    outdoorPeakLux: 95000,
    /**
     * One window in a 48 m² room, and a deep one.
     *
     * Below the lobby's by a wide margin: that is a glazed double-height
     * entrance wall and this is a single full-height pane on one side of a
     * rectangular room, with the bathroom and wardrobe block taking the
     * other half of the floor. The curtain multiplies this by its own
     * transmission, so the figure is for the window fully drawn back.
     */
    windowFactor: 0.0026,
    designLux: 200,
    outdoorMinC: 26,
    outdoorMaxC: 34,
  },

  baseline: {
    lightingWatts: 430,
    hvacWatts: 1800,
    operatingHours: { startMin: 17 * 60, endMin: 24 * 60 },
    hvacHours: { startMin: 0, endMin: 24 * 60 },
    note:
      "50 W halogen downlights, switched bedside and bath circuits with no dimming, no night path lighting at all and a fan-coil left running whether the room is sold or not — a five-star room fitted out around 2012.",
  },

  tariffPerKwh: 11.5,
  currency: "₹",
};
