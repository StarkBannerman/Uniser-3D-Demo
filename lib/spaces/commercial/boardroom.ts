/**
 * Commercial Office — Boardroom.
 *
 * Built to the client's boardroom sheet, which names ten things on the room and
 * six scenes under it. The ten map onto devices like this:
 *
 *   General Lighting        -> br-general   even light for meetings
 *   Cove Lighting           -> br-cove      soft indirect, the premium layer
 *   Feature Lighting        -> br-feature   the suspended linear over the table
 *   Table Lighting          -> br-table     focused heads on the table itself
 *   Presentation Lighting   -> br-front     the row nearest the screen
 *   Video Conference        -> br-vc        forward wash onto faces
 *   Tunable White           -> a property of all six, not a seventh device
 *   Blinds / Daylight       -> br-blinds    solar filter plus blackout
 *   Projector / Screen      -> br-av        motorised screen and projector
 *   Display                 -> br-display   the permanent wall panel
 *   Projector / Screen      -> br-av        projector and motorised screen
 *   Speakers                -> br-audio     column pair either side
 *   Video conferencing      -> br-conf      camera bar and codec
 *
 * Six lighting groups rather than four is the whole argument of the sheet. A
 * boardroom is the one room where "turn the lights down for the slides" is
 * actively wrong: the front of the room has to drop so the screen reads, the
 * table has to stay up so people can still write, and on a video call the
 * faces need light from the front or everyone appears as a silhouette against
 * the window. Three different answers to "dim the lights", which is why they
 * are three separately addressed circuits.
 *
 * The sheet also prints the Presentation scene as a five-frame storyboard:
 *
 *   blinds adjust to reduce glare -> front lights dim -> table lighting
 *     remains active -> screen comes down and projector ON -> AV system ON
 *
 * so Presentation is a staged scene and those are its stages, in that order.
 * The third is not a no-op: it is the stage that makes the point, so it holds
 * the table at its working level and says so while the room is dark around it.
 *
 * Wattages and lumen figures remain the placeholders flagged in
 * `lib/catalog/products.ts`.
 */

import type { Space } from "@/lib/sim/types";

/** 7.2 x 12.0 m. */
const AREA = 86;

export const boardroom: Space = {
  id: "boardroom",
  name: "Boardroom",
  segment: "commercial",
  category: "Commercial Office",
  blurb:
    "An 86 m² boardroom in real-time 3D — six separately addressed lighting groups, dual blinds, a motorised screen and projector, and the six scenes a working agenda actually needs.",
  renderer: "3d",
  model: "boardroom",

  keypad: {
    layout: "grid",
    finish: "graphite",
    scenes: ["meeting", "presentation", "video-conference", "end-meeting"],
  },

  zones: [{ id: "br-main", name: "Boardroom", areaM2: AREA }],

  devices: [
    {
      id: "br-general",
      kind: "light",
      name: "General",
      zoneId: "br-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "Twelve recessed heads on a 1.8 m grid. This is the layer that makes the room usable rather than attractive, and the one every other scene takes away from.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5700 },
      fixtures: 12,
      wattsEach: 11,
      lumensEach: 1100,
      baselineWattsEach: 72,
      glow: [],
    },
    {
      id: "br-cove",
      kind: "light",
      name: "Cove",
      zoneId: "br-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "34 metres of tunable strip in the perimeter coffer, washing the ceiling. Nothing in the room says 'this was designed' faster than a ceiling that is lit rather than merely white.",
      dimmable: true,
      tunable: { minK: 2200, maxK: 6500 },
      fixtures: 34, // metres of strip
      wattsEach: 9,
      lumensEach: 900,
      glow: [],
    },
    {
      id: "br-feature",
      kind: "light",
      name: "Feature",
      zoneId: "br-main",
      productId: "pipeline-pendant",
      subsystem: "lighting",
      pitch:
        "A 5.4 m suspended linear on axis with the table. It is the only fitting in the room anybody will remember, and it is also what stops a long table reading as a corridor.",
      dimmable: true,
      // To 5000, not 4000. At a 4000 ceiling the one fitting everybody looks at
      // could only just reach the neutral white the rest of the room works at,
      // with no headroom above it.
      tunable: { minK: 2700, maxK: 5000 },
      fixtures: 1,
      wattsEach: 110,
      lumensEach: 9000,
      glow: [],
    },
    {
      id: "br-table",
      kind: "light",
      name: "Table",
      zoneId: "br-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Narrow-beam heads aimed at the table surface and nowhere else. During a presentation this is the circuit that stays on — people keep reading while the room goes dark, which is the single most useful thing separate zoning buys a boardroom.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5000 },
      fixtures: 8,
      wattsEach: 7,
      lumensEach: 650,
      glow: [],
    },
    {
      id: "br-front",
      kind: "light",
      name: "Presentation",
      zoneId: "br-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "The row nearest the screen, on its own circuit. Light landing on a screen is the commonest reason a boardroom presentation looks washed out, and this is the only fix that does not involve turning the whole room off.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5000 },
      fixtures: 4,
      wattsEach: 11,
      lumensEach: 1100,
      baselineWattsEach: 72,
      glow: [],
    },
    {
      id: "br-vc",
      kind: "light",
      name: "Video Conference",
      zoneId: "br-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "A soft forward wash from above the camera, at 4000 K. Without it everyone on the call is a silhouette against the window — and no amount of camera is going to fix light coming from behind a face.",
      dimmable: true,
      tunable: { minK: 3000, maxK: 5000 },
      fixtures: 9, // metres of strip
      wattsEach: 9,
      lumensEach: 900,
      glow: [],
    },

    {
      id: "br-blinds",
      kind: "shade",
      name: "Blinds",
      zoneId: "br-main",
      productId: "uniser-curtain-track",
      subsystem: "shades",
      pitch:
        "A dual roller on every bay: a solar filter for glare on the table, a blackout behind it for the projector. Boardrooms get both because a west-facing window at four in the afternoon defeats any screen ever made.",
      layers: ["sheer", "blackout"],
      watts: 60,
      travelMs: 6000,
      window: { x: 0.04, y: 0.18, w: 0.3, h: 0.56 },
      draw: "both",
    },

    {
      id: "br-av",
      kind: "av",
      name: "Projector / Screen",
      zoneId: "br-main",
      productId: "smartspaces-av",
      subsystem: "av",
      pitch:
        "One press drops the blinds, dims the front of the room, lowers the screen and fires the projector — in that order, because the screen takes six seconds and the table lighting never moves at all.",
      sources: ["Laptop", "Room PC", "Wireless", "Conference"],
      hasScreen: true,
      screenTravelMs: 6000,
      ratedWatts: 380,
      glow: [],
    },
    /**
     * Section 11 lists five AV items — display, projector, screen, speakers,
     * video conferencing — and three of them were folded into one "AV System"
     * box. Split out, because the two display paths are genuinely different
     * products doing different jobs: the projector and its motorised screen
     * carry a presentation in a darkened room, and the flat panel carries a
     * call in a lit one. A room that can only do one of those is half a
     * boardroom, and the two scenes now demonstrate one each.
     */
    {
      id: "br-display",
      kind: "av",
      name: "Display",
      zoneId: "br-main",
      productId: "smartspaces-av",
      subsystem: "av",
      pitch:
        "The permanent panel. It is what a video call uses — a call wants a bright image in a lit room, which is the one thing a projector cannot give you — and what carries the room's own agenda between meetings.",
      sources: ["Conference", "Laptop", "Room PC", "Signage"],
      hasScreen: false,
      ratedWatts: 180,
      glow: [],
    },
    {
      id: "br-audio",
      kind: "av",
      name: "Speakers",
      zoneId: "br-main",
      productId: "smartspaces-audio",
      subsystem: "av",
      pitch:
        "Column speakers either side of the display, carrying programme audio and voice lift on the same pair. Across a twelve metre table the far end cannot hear the near end without them, which is the argument nobody expects to need.",
      sources: ["Conference", "Programme", "Laptop"],
      hasScreen: false,
      ratedWatts: 220,
      glow: [],
    },
    {
      id: "br-conf",
      kind: "av",
      name: "Video Conferencing",
      zoneId: "br-main",
      productId: "smartspaces-av",
      subsystem: "av",
      pitch:
        "Camera bar under the display, codec behind it. Pressing Video Conference wakes this, puts the call on the panel and brings the front wash up — one button for the three things everyone otherwise does by hand while the call waits.",
      sources: ["Room Camera", "Laptop Camera"],
      hasScreen: false,
      ratedWatts: 90,
      glow: [],
    },

    {
      id: "br-ac",
      kind: "climate",
      name: "Air Conditioning",
      zoneId: "br-main",
      productId: "sensibo-airbend",
      subsystem: "climate",
      pitch:
        "Fourteen people and a projector put about two kilowatts of heat into a sealed room. The setpoint dropping as the room fills is the least visible and most appreciated thing in here.",
      minC: 16,
      maxC: 30,
      ratedWatts: 3500,
    },

    {
      id: "br-occ",
      kind: "sensor",
      name: "Occupancy",
      zoneId: "br-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Set this to Vacant and wait. An empty boardroom with the lights, the projector and the air conditioning still running is the commonest waste in a commercial office, and it is entirely a scheduling problem.",
      metric: "occupancy",
      unit: "",
      derived: false,
      min: 0,
      max: 1,
    },
    {
      id: "br-lux",
      kind: "sensor",
      name: "Ambient Light",
      zoneId: "br-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      metric: "lux",
      unit: "lux",
      derived: true,
      min: 0,
    },
    {
      id: "br-temp",
      kind: "sensor",
      name: "Room Temperature",
      zoneId: "br-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      metric: "temperature",
      unit: "°C",
      derived: true,
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Scenes — the six printed on the sheet                             */
  /* ---------------------------------------------------------------- */

  scenes: [
    {
      id: "meeting",
      name: "Meeting",
      icon: "❑",
      blurb:
        "Everything up and even, blinds open, screen stowed. 420 lux on the table and nothing on the walls competing with it.",
      fadeMs: 1400,
      targets: {
        // Colour deliberately unset on general and table so circadian tuning
        // owns them: the same button is cooler at ten in the morning than at
        // six in the evening, which is the entire point of tunable white.
        "br-general": { on: true, level: 88 },
        // 4000 K, not 3500 and 3200.
        //
        // Office lighting standards put a conference room at 3500-4000 K, and
        // 2700-3200 is the residential band. Carrying the house palette across
        // gave this room a domestic warmth that quietly undercut the thing it
        // is meant to be selling: the warm cove and warm pendant read as a
        // hotel lounge rather than as a place anybody does work.
        //
        // Lunch is the one scene that stays warm, and it now reads as a
        // deliberate change of mode rather than as more of the same.
        "br-cove": { on: true, level: 60, cct: 4000 },
        "br-feature": { on: true, level: 70, cct: 4000 },
        "br-table": { on: true, level: 85 },
        "br-front": { on: true, level: 80 },
        "br-vc": { on: false },
        "br-blinds": { sheer: 0, blackout: 0 },
        // Screen stowed, but the wall display awake on the room's own deck.
        // A boardroom at rest is not a boardroom with a dead black rectangle
        // in it — the client's hero image has the display lit, and it is the
        // first thing anyone looks at.
        "br-av": { on: false, screen: 0 },
        "br-display": { on: true, source: "Signage", volume: 0 },
        "br-audio": { on: false },
        "br-conf": { on: false },
        "br-ac": { on: true, setpointC: 23, mode: "cool", fan: 2 },
      },
      highlight: ["proplus-downlight", "pipeline-pendant"],
    },
    {
      /**
       * The staged demonstration printed on the sheet:
       *
       *   blinds adjust -> front lights dim -> table lighting remains active
       *     -> screen comes down and projector ON -> AV system ON
       *
       * Stage three is the one worth watching. It looks like a no-op and it is
       * the reason the room has six circuits instead of two: the front of the
       * room is dark, the screen is readable, and everybody at the table can
       * still read the paper in front of them.
       */
      id: "presentation",
      name: "Presentation",
      icon: "◑",
      blurb:
        "Five stages: the blinds come down against glare, the front of the room dims, the table stays lit, the screen descends with the projector, and the AV system wakes.",
      fadeMs: 1600,
      targets: {
        // Lifted once the blinds went to full blackout. With the window
        // contributing nothing, the levels that read as "dimmed" against
        // daylight read as "switched off" against nothing, and the room beyond
        // the table went to black.
        "br-cove": { on: true, level: 44, cct: 3500 },
        "br-feature": { on: true, level: 34, cct: 3400 },
        "br-vc": { on: false },
      },
      steps: [
        {
          label: "Blinds adjust to reduce glare",
          holdMs: 4400,
          // Fully down, both layers. A partial blackout left a bright band
          // along the bottom of every bay, which reads as a blind that has
          // jammed rather than one that has been set — and a projector in a
          // glazed room wants the whole window anyway.
          targets: { "br-blinds": { sheer: 100, blackout: 100 } },
        },
        {
          label: "Front lights dim",
          holdMs: 2000,
          targets: {
            "br-front": { on: true, level: 8, cct: 3200, fadeMs: 2200 },
            "br-general": { on: true, level: 40, cct: 3700, fadeMs: 2200 },
          },
        },
        {
          label: "Table lighting stays up",
          holdMs: 1600,
          targets: { "br-table": { on: true, level: 88, cct: 4000 } },
        },
        {
          // The document separates the screen's descent from the projector
          // firing, and is right to: the motor takes six seconds, and starting
          // the image early throws away the best part of the demonstration.
          // The display goes dark here because the fabric is about to cover it.
          label: "Screen comes down",
          holdMs: 6800,
          targets: { "br-av": { screen: 100 }, "br-display": { on: false } },
        },
        {
          label: "Projector on",
          holdMs: 1600,
          targets: { "br-av": { on: true, source: "Laptop", volume: 34 } },
        },
        {
          label: "AV on",
          holdMs: 1200,
          targets: {
            "br-audio": { on: true, source: "Programme", volume: 38 },
            "br-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
          },
        },
      ],
      highlight: ["smartspaces-av", "uniser-curtain-track", "magneto-track"],
    },
    {
      id: "video-conference",
      name: "Video Conference",
      icon: "◉",
      blurb:
        "Front wash on at 4000 K, blinds filtering the window behind the table, screen down. Lit for the camera rather than for the room.",
      fadeMs: 1600,
      targets: {
        /**
         * Brighter at the front than the back, which is the opposite of every
         * other scene here. A camera meters on the whole frame: a bright window
         * behind a face turns the face into a silhouette, so the window gets
         * filtered and the faces get their own light from the front.
         */
        "br-general": { on: true, level: 55, cct: 4000 },
        "br-cove": { on: true, level: 45, cct: 4000 },
        "br-feature": { on: true, level: 40, cct: 4000 },
        "br-table": { on: true, level: 60, cct: 4000 },
        "br-front": { on: true, level: 35, cct: 4000 },
        "br-vc": { on: true, level: 92, cct: 4300 },
        "br-blinds": { sheer: 100, blackout: 35 },
        // Screen stowed, deliberately. A call belongs on the panel — it wants
        // a bright image in a lit room, which is exactly what a projector
        // cannot do. Presentation drives the other path, so between them the
        // two scenes show each product doing the job it is for.
        "br-av": { on: false, screen: 0 },
        "br-display": { on: true, source: "Conference", volume: 40 },
        "br-audio": { on: true, source: "Conference", volume: 44 },
        "br-conf": { on: true, source: "Room Camera" },
        "br-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
      },
      highlight: ["connekt-profile", "smartspaces-audio"],
    },
    {
      id: "discussion",
      name: "Discussion",
      icon: "◐",
      blurb:
        "Screen away, feature light up, general back. Warmer and lower — the room for talking rather than presenting.",
      fadeMs: 2200,
      targets: {
        // Lower than Meeting rather than warmer than it. A discussion scene
        // that drops to 3000 K is a lighting designer's instinct from a house;
        // in an office the right move is to take the level down and leave the
        // colour where people are working.
        "br-general": { on: true, level: 45, cct: 3800 },
        "br-cove": { on: true, level: 65, cct: 3600 },
        "br-feature": { on: true, level: 85, cct: 3600 },
        "br-table": { on: true, level: 70, cct: 4000 },
        "br-front": { on: true, level: 30, cct: 3600 },
        "br-vc": { on: false },
        "br-blinds": { sheer: 100, blackout: 0 },
        "br-av": { on: false, screen: 0 },
        "br-display": { on: false },
        "br-audio": { on: false },
        "br-conf": { on: false },
        "br-ac": { on: true, setpointC: 23, fan: 1 },
      },
      highlight: ["pipeline-pendant", "connekt-profile"],
    },
    {
      id: "lunch",
      name: "Lunch",
      icon: "☼",
      blurb:
        "Blinds open to the city, warm light on the table, everything technical asleep.",
      fadeMs: 2400,
      targets: {
        // The one scene in the room that goes warm, on purpose. It is the
        // only one that is not work, and against five neutral-white scenes the
        // change of colour is what tunable white looks like in one press.
        "br-general": { on: true, level: 35, cct: 2900 },
        "br-cove": { on: true, level: 75, cct: 2700 },
        "br-feature": { on: true, level: 60, cct: 2700 },
        "br-table": { on: true, level: 55, cct: 2900 },
        "br-front": { on: false },
        "br-vc": { on: false },
        "br-blinds": { sheer: 0, blackout: 0 },
        "br-av": { on: false, screen: 0 },
        "br-display": { on: false },
        "br-audio": { on: false },
        "br-conf": { on: false },
        "br-ac": { on: true, setpointC: 24, fan: 1 },
      },
      highlight: ["connekt-profile"],
    },
    {
      id: "end-meeting",
      name: "End Meeting",
      icon: "⏻",
      blurb:
        "Everything down over four seconds, screen back into its case, blinds open for the cleaners.",
      fadeMs: 4000,
      targets: {
        "br-general": { on: false },
        "br-cove": { on: false },
        "br-feature": { on: false },
        "br-table": { on: false },
        "br-front": { on: false },
        "br-vc": { on: false },
        "br-blinds": { sheer: 0, blackout: 0 },
        "br-av": { on: false, screen: 0 },
        "br-display": { on: false },
        "br-audio": { on: false },
        "br-conf": { on: false },
        "br-ac": { on: false },
      },
    },
  ],

  rules: [
    {
      id: "br-occupancy",
      kind: "occupancy",
      name: "Occupancy",
      explain:
        "Lights, projector, AV and air conditioning shut down 15 minutes after the room empties. A boardroom is booked far more often than it is used, and this is where most of a commercial office's wasted energy actually sits.",
      enabledByDefault: true,
      sensorId: "br-occ",
      holdMin: 15,
      onOccupied: {
        "br-general": { on: true, level: 70, fadeMs: 1200 },
        "br-cove": { on: true, level: 55, fadeMs: 1200 },
        "br-table": { on: true, level: 70, fadeMs: 1200 },
      },
      onVacant: {
        "br-general": { on: false, fadeMs: 4000 },
        "br-cove": { on: false, fadeMs: 4000 },
        "br-feature": { on: false, fadeMs: 4000 },
        "br-table": { on: false, fadeMs: 4000 },
        "br-front": { on: false, fadeMs: 4000 },
        "br-vc": { on: false, fadeMs: 3000 },
        "br-av": { on: false, screen: 0 },
        "br-display": { on: false },
        "br-audio": { on: false },
        "br-conf": { on: false },
        "br-ac": { on: false },
      },
    },
    {
      id: "br-daylight",
      kind: "daylight",
      name: "Daylight Harvesting",
      explain:
        "With the blinds open, the general and front circuits give back exactly the light the window is already supplying. A boardroom on a glazed façade can run at a third of its connected load for most of the working day.",
      enabledByDefault: true,
      deviceIds: ["br-general", "br-front"],
      targetLux: 420,
      minLevel: 0,
    },
    {
      id: "br-circadian",
      kind: "circadian",
      name: "Circadian Tuning",
      explain:
        "Colour temperature follows the working day — cool through the morning, warming after four. Run the clock and press Meeting at different hours: the same button, a different room.",
      enabledByDefault: true,
      deviceIds: ["br-general", "br-table"],
      curve: [
        // Flatter and cooler than the residential curves. An office holds
        // neutral white right through the working day — the swing down to
        // 2700 K that suits a bedroom at nine in the evening would put a
        // boardroom into candlelight in the middle of a late meeting. It still
        // drifts warm after hours, which is the part worth demonstrating.
        { min: 0, cct: 3000 },
        { min: 420, cct: 3500 },
        { min: 540, cct: 4500 },
        { min: 780, cct: 4800 },
        { min: 960, cct: 4300 },
        { min: 1140, cct: 3500 },
        { min: 1380, cct: 3000 },
      ],
    },
    {
      /**
       * The sheet lists "Scheduled Scenes" among the automation, and this is
       * the honest version of it: the room lets go at the end of the working
       * day rather than relying on the last person out to remember.
       */
      id: "br-close",
      kind: "schedule",
      name: "End of Day",
      explain:
        "At 7:30 PM the room closes itself down. Occupancy will have caught an empty room long before this — the schedule is the backstop for the meeting that overran and emptied without anyone pressing anything.",
      enabledByDefault: true,
      at: 19 * 60 + 30,
      targets: {
        "br-general": { on: false, fadeMs: 6000 },
        "br-cove": { on: false, fadeMs: 6000 },
        "br-feature": { on: false, fadeMs: 6000 },
        "br-table": { on: false, fadeMs: 6000 },
        "br-front": { on: false, fadeMs: 6000 },
        "br-vc": { on: false, fadeMs: 6000 },
        "br-av": { on: false, screen: 0 },
        "br-display": { on: false },
        "br-audio": { on: false },
        "br-conf": { on: false },
        "br-ac": { on: false },
      },
    },
  ],

  defaults: {
    "br-occ": { value: 1 },
    "br-lux": { value: 0 },
    "br-temp": { value: 26 },
    "br-ac": { currentC: 26, setpointC: 23 },
    "br-blinds": { sheer: 0, blackout: 0 },
    "br-av": { screen: 0 },
  },
  openingSceneId: "meeting",
  // Mid-morning. A boardroom is a daylight room, and the daylight harvesting
  // and the blinds are both invisible after dark.
  openingClockMin: 10 * 60 + 40,

  // Mumbai.
  environment: {
    sunriseMin: 6 * 60 + 20,
    sunsetMin: 18 * 60 + 55,
    outdoorPeakLux: 95000,
    // A full-height glazed façade on one long side, rather than a domestic
    // window: considerably more daylight reaches the table here than in any of
    // the residential rooms.
    windowFactor: 0.019,
    // 400-500 lux is the working figure for a conference table in every office
    // lighting standard worth citing. The residential rooms sit far below this
    // on purpose; a boardroom should read as brighter, because it is.
    designLux: 420,
    outdoorMinC: 26,
    outdoorMaxC: 34,
  },

  baseline: {
    lightingWatts: 1340,
    hvacWatts: 4200,
    operatingHours: { startMin: 9 * 60, endMin: 19 * 60 },
    hvacHours: { startMin: 9 * 60, endMin: 19 * 60 },
    note:
      "Baseline is 16 × 72 W halogen downlights plus 2 × 94 W fluorescent battens (1340 W) from 9:00 AM to 7:00 PM, and a non-inverter 4 ton package unit at a fixed setpoint (4200 W) over the same hours. Correct to the client's installed load before quoting.",
  },

  tariffPerKwh: 11,
  currency: "₹",
};
