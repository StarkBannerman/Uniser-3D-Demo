/**
 * Commercial Office — Open-plan Workspace.
 *
 * Built to section 10 of the requirement document and the client's workspace
 * sheet. The sheet names eleven things on the room; they map onto devices like
 * this:
 *
 *   General Office Lighting  -> ws-general   the field of downlights
 *   Linear Lighting          -> ws-linear    suspended runs over the benches
 *   Task Lighting            -> ws-task      the lights on the desks themselves
 *   Cove Lighting            -> ws-cove      perimeter coffer, indirect
 *   Conference / Meeting     -> ws-meeting   the glazed room, separately zoned
 *   Break Area Lighting      -> ws-break     pendants and lounge, warm
 *   Daylight / Tunable White -> a property of all six, plus two automations
 *   Blinds / Daylight        -> ws-blinds    solar filter and blackout
 *   AC Control               -> ws-ac
 *   Fan Control              -> ws-fan
 *   Occupancy Sensors        -> ws-occ, and the rule that reads it
 *
 * Tunable white is deliberately not a seventh circuit, for the same reason it
 * is not one in the boardroom: it is a capability every one of these groups
 * has, and making it a device would imply there is a set of lights somewhere
 * that are tunable while the others are not.
 *
 * **Six groups, because an open-plan floor is not one room.** This is the whole
 * argument of the sheet and the reason the space is worth demonstrating at all.
 * At any hour of a working day the desks, the meeting room and the break area
 * want different light at the same time — somebody is presenting behind glass
 * while somebody else is eating and forty people are at screens — and a floor
 * wired as one circuit can serve exactly one of those. Every scene below is a
 * different answer to which zone leads.
 *
 * **Why the colour temperatures are printed on the sheet.** They are the point
 * of the room. The scenes run 5600 K at the start of the day down to 3000 K at
 * the break and back up to 5000 K after lunch, which is a deliberate curve
 * against the afternoon dip rather than decoration. The sheet prints the number
 * under every frame, so the numbers below are taken from it exactly.
 *
 * The sheet also prints Focus Work as a four-frame storyboard:
 *
 *   blinds adjust to control daylight -> task lighting increases ->
 *     cool/neutral white activated -> AC adjusts to preset temperature
 *
 * so Focus Work is a staged scene and those are its stages, in that order. The
 * requirement document writes the same sequence with "daylight is balanced"
 * between the first and second, which is the outcome of the blinds moving
 * rather than a stage of its own.
 *
 * Wattages and lumen figures remain the placeholders flagged in
 * `lib/catalog/products.ts`.
 */

import type { Space } from "@/lib/sim/types";

/** 16.0 x 12.0 m. */
const AREA = 192;

export const workspace: Space = {
  id: "workspace",
  name: "Workspace",
  segment: "commercial",
  category: "Commercial Office",
  blurb:
    "A 192 m² open-plan floor in real-time 3D — six separately zoned lighting groups across desks, a glazed meeting room and a break area, with blinds, occupancy and daylight response and the seven scenes of a working day.",
  renderer: "3d",
  model: "workspace",

  keypad: {
    layout: "grid",
    finish: "graphite",
    scenes: ["start-day", "focus-work", "collaboration", "end-of-day"],
  },

  zones: [{ id: "ws-main", name: "Workspace", areaM2: AREA }],

  devices: [
    {
      id: "ws-general",
      kind: "light",
      name: "General",
      zoneId: "ws-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "Thirty-six recessed heads on a 2.4 m grid across the whole floor. This is the layer an office is actually specified to — 400 lux on the working plane — and every other group in the room is there to do something this one cannot.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 6000 },
      fixtures: 36,
      wattsEach: 12,
      lumensEach: 1250,
      baselineWattsEach: 72,
      glow: [],
    },
    {
      id: "ws-linear",
      kind: "light",
      name: "Linear",
      zoneId: "ws-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Six suspended runs on axis with the desk benches, 42 m in total. On an exposed-services ceiling these are the only thing giving the floor a grid — without them an open plan reads as a warehouse with furniture in it.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 6000 },
      fixtures: 42, // metres of run
      wattsEach: 9,
      lumensEach: 1000,
      glow: [],
    },
    {
      id: "ws-task",
      kind: "light",
      name: "Task",
      zoneId: "ws-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "A light per desk, switched with the floor and dimmed independently of it. This is the circuit Focus Work raises: you get more light exactly where somebody is working without lifting the whole floor, which is where the energy saving and the comfort both come from.",
      dimmable: true,
      tunable: { minK: 3000, maxK: 5700 },
      fixtures: 24,
      wattsEach: 6,
      lumensEach: 520,
      glow: [],
    },
    {
      id: "ws-cove",
      kind: "light",
      name: "Cove",
      zoneId: "ws-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "52 m of tunable strip in the perimeter coffer, washing the soffit. An open-plan ceiling is mostly services and ductwork; the cove is what stops the eye going up into it.",
      dimmable: true,
      tunable: { minK: 2200, maxK: 6500 },
      fixtures: 52, // metres of strip
      wattsEach: 9,
      lumensEach: 900,
      glow: [],
    },
    {
      id: "ws-meeting",
      kind: "light",
      name: "Meeting Zone",
      zoneId: "ws-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "The glazed room on its own circuit. A meeting room inside an open plan is the one place on the floor that regularly needs to be darker than everything around it — the moment a screen goes up, the floor's light is the problem.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5700 },
      fixtures: 8,
      wattsEach: 12,
      lumensEach: 1250,
      baselineWattsEach: 72,
      glow: [],
    },
    {
      id: "ws-break",
      kind: "light",
      name: "Break Area",
      zoneId: "ws-main",
      productId: "pipeline-pendant",
      subsystem: "lighting",
      /**
       * Capped at 4000 K where the desks go to 6000.
       *
       * Deliberate, and the one group that does not follow the floor. A break
       * area exists to not feel like the desks — carrying 5600 K over to it
       * makes a canteen, and the sheet's own Break frame is the warmest image
       * on the page at 3000 K. Giving this group the daylight end of the range
       * would only ever be used by mistake.
       */
      tunable: { minK: 2200, maxK: 4000 },
      dimmable: true,
      fixtures: 6,
      wattsEach: 24,
      lumensEach: 1800,
      glow: [],
    },

    {
      id: "ws-blinds",
      kind: "shade",
      name: "Blinds",
      zoneId: "ws-main",
      productId: "uniser-curtain-track",
      subsystem: "shades",
      pitch:
        "Motorised rollers across every bay of the glazing: a solar filter for glare on screens, a blackout behind it for the meeting room. On a floor of monitors facing a window, glare control is not a comfort feature — it is what makes the desks by the glass usable at all.",
      layers: ["sheer", "blackout"],
      watts: 85,
      travelMs: 6500,
      window: { x: 0.04, y: 0.2, w: 0.34, h: 0.54 },
      draw: "both",
    },

    {
      id: "ws-display",
      kind: "av",
      name: "Meeting Display",
      zoneId: "ws-main",
      productId: "smartspaces-av",
      subsystem: "av",
      pitch:
        "The panel in the glazed room, on the floor's own deck. It is what makes the meeting zone read as in use from across the office, which is the entire reason that zone is separately lit.",
      sources: ["Signage", "Wireless", "Room PC", "Conference"],
      hasScreen: false,
      ratedWatts: 180,
      glow: [],
    },

    {
      id: "ws-ac",
      kind: "climate",
      name: "Air Conditioning",
      zoneId: "ws-main",
      productId: "sensibo-airbend",
      subsystem: "climate",
      pitch:
        "Four ceiling cassettes on one setpoint, trimmed by occupancy. HVAC is the biggest line on an office bill by a wide margin, and a floor that sets back when it empties is where most of a retrofit's saving actually comes from.",
      minC: 16,
      maxC: 30,
      ratedWatts: 5200,
    },
    {
      id: "ws-fan",
      kind: "fan",
      name: "Fan",
      zoneId: "ws-main",
      productId: "smartspaces-fan",
      subsystem: "climate",
      pitch:
        "Ceiling fans over the open floor, on the same keypad as everything else. A fan lets the setpoint sit two degrees higher for the same comfort, and two degrees across 192 m² is a great deal more than the fans cost to run.",
      speeds: 5,
      ratedWatts: 70,
    },

    {
      id: "ws-occ",
      kind: "sensor",
      name: "Occupancy",
      zoneId: "ws-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Presence across the floor, zone by zone. On an open plan this is the control that pays for itself: the break area and the meeting room are empty most of the day, and neither should be lit or cooled while they are.",
      metric: "occupancy",
      unit: "",
      min: 0,
      max: 1,
    },
    {
      id: "ws-lux",
      kind: "sensor",
      name: "Ambient Light",
      zoneId: "ws-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Measured light on the working plane, which is what daylight response regulates against. Twelve metres of glazing means the desks by the window and the desks by the meeting room are never the same room.",
      metric: "lux",
      unit: "lx",
      derived: true,
    },
    {
      id: "ws-temp",
      kind: "sensor",
      name: "Room Temperature",
      zoneId: "ws-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch: "Floor temperature, following the cassettes and the outside air.",
      metric: "temperature",
      unit: "°C",
      derived: true,
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Scenes — the seven printed on the sheet                           */
  /* ---------------------------------------------------------------- */

  scenes: [
    {
      id: "start-day",
      clockMin: 8 * 60 + 40,
      name: "Start Day",
      icon: "☀",
      blurb:
        "Full-spectrum daylight at 5600 K across the floor, blinds open, every zone up. The coldest and brightest the room goes all day, and deliberately so.",
      fadeMs: 2200,
      targets: {
        "ws-general": { on: true, level: 92, cct: 5600 },
        "ws-linear": { on: true, level: 88, cct: 5600 },
        "ws-task": { on: true, level: 70, cct: 5600 },
        "ws-cove": { on: true, level: 70, cct: 5000 },
        "ws-meeting": { on: true, level: 80, cct: 5600 },
        // Warm even at the top of the morning. See the note on the device.
        "ws-break": { on: true, level: 78, cct: 3500 },
        "ws-blinds": { sheer: 0, blackout: 0 },
        "ws-display": { on: true, source: "Signage", volume: 0 },
        "ws-ac": { on: true, setpointC: 24, mode: "cool", fan: 2 },
        "ws-fan": { on: true, speed: 2 },
      },
      highlight: ["proplus-downlight", "connekt-profile"],
    },
    {
      /**
       * The staged demonstration printed on the sheet:
       *
       *   blinds adjust to control daylight -> task lighting increases ->
       *     cool/neutral white activated -> AC adjusts to preset temperature
       *
       * Stage two is the one worth watching, and it is the opposite of what
       * people expect a "focus" button to do. The floor does not get brighter;
       * the *desks* do, while the general layer comes down. That is the whole
       * case for zoning task separately from general — more light where
       * somebody is working, less everywhere else, and a lower total load than
       * before the button was pressed.
       */
      id: "focus-work",
      clockMin: 11 * 60 + 10,
      name: "Focus Work",
      icon: "◎",
      blurb:
        "Four stages: the blinds trim the glare off the screens, the desk lights come up, the floor shifts to neutral 4000 K, and the AC settles to its working setpoint.",
      fadeMs: 1600,
      targets: {
        /**
         * The break area stays up, where it used to drop to 30.
         *
         * The reasoning for stepping it back was compositional — nobody is in
         * it during focus hours, so let it recede. On a floor plate that is
         * the wrong instinct: a zone at 30 while the desks are at 95 does not
         * read as restraint, it reads as a corner somebody forgot to light,
         * and the whole claim of the room is that the *whole* floor is lit
         * while individual zones are balanced within it. It sits below the
         * desks and comfortably above dark.
         */
        "ws-break": { on: true, level: 66, cct: 3200 },
        "ws-meeting": { on: true, level: 74, cct: 4000 },
        "ws-display": { on: true, source: "Signage", volume: 0 },
        "ws-fan": { on: true, speed: 2 },
      },
      steps: [
        {
          label: "Blinds adjust to control daylight",
          // The sheer takes about six and a half seconds end to end, and the
          // hold has to cover the travel or the next stage fires over a blind
          // that is still moving.
          holdMs: 4600,
          targets: { "ws-blinds": { sheer: 72, blackout: 0 } },
        },
        {
          label: "Task lighting increases",
          holdMs: 2200,
          targets: {
            "ws-task": { on: true, level: 95, cct: 4000, fadeMs: 1800 },
            // Down, but only a little. The point of the stage is that the
            // desks lead and the floor does not have to carry them — not that
            // the floor goes dim. Taken to 62 this read as a room with the
            // lights half off rather than as a room balanced for work.
            "ws-general": { on: true, level: 78, fadeMs: 1800 },
          },
        },
        {
          label: "Cool / neutral white activated",
          holdMs: 2000,
          targets: {
            "ws-general": { on: true, level: 78, cct: 4000, fadeMs: 2400 },
            "ws-linear": { on: true, level: 82, cct: 4000, fadeMs: 2400 },
            "ws-cove": { on: true, level: 52, cct: 4000, fadeMs: 2400 },
          },
        },
        {
          label: "AC adjusts to preset temperature",
          holdMs: 1600,
          targets: { "ws-ac": { on: true, setpointC: 23, mode: "cool", fan: 2 } },
        },
      ],
      highlight: ["magneto-track", "uniser-curtain-track"],
    },
    {
      id: "collaboration",
      clockMin: 12 * 60 + 20,
      name: "Collaboration",
      icon: "◍",
      blurb:
        "Warm white at 3500 K with the meeting zone leading and the display live. Friendlier light, and the one scene where the glazed room is brighter than the floor around it.",
      fadeMs: 2000,
      targets: {
        "ws-general": { on: true, level: 72, cct: 3500 },
        "ws-linear": { on: true, level: 70, cct: 3500 },
        "ws-task": { on: true, level: 55, cct: 3500 },
        "ws-cove": { on: true, level: 72, cct: 3200 },
        // Above the floor, which is the whole point of the scene. A room
        // people are talking in should be the brightest thing in the picture.
        "ws-meeting": { on: true, level: 92, cct: 3800 },
        "ws-break": { on: true, level: 74, cct: 3200 },
        "ws-blinds": { sheer: 35, blackout: 0 },
        "ws-display": { on: true, source: "Wireless", volume: 0 },
        "ws-ac": { on: true, setpointC: 23, mode: "cool", fan: 2 },
        "ws-fan": { on: true, speed: 3 },
      },
      highlight: ["smartspaces-av", "proplus-downlight"],
    },
    {
      id: "break",
      clockMin: 13 * 60 + 30,
      name: "Break",
      icon: "◐",
      blurb:
        "Relaxed 3000 K with the break area lifted and the desks stepped back. The floor is still usable; it has simply stopped being the subject.",
      fadeMs: 2600,
      targets: {
        "ws-general": { on: true, level: 48, cct: 3000 },
        "ws-linear": { on: true, level: 40, cct: 3000 },
        "ws-task": { on: true, level: 25, cct: 3000 },
        "ws-cove": { on: true, level: 65, cct: 2700 },
        "ws-meeting": { on: true, level: 30, cct: 3000 },
        // The one scene the break area leads. At 3000 K and nearly full, it is
        // the warmest and brightest corner of the floor.
        "ws-break": { on: true, level: 95, cct: 2700 },
        "ws-blinds": { sheer: 20, blackout: 0 },
        "ws-display": { on: true, source: "Signage", volume: 0 },
        "ws-ac": { on: true, setpointC: 24, mode: "cool", fan: 1 },
        "ws-fan": { on: true, speed: 3 },
      },
      highlight: ["pipeline-pendant"],
    },
    {
      id: "afternoon",
      clockMin: 15 * 60 + 10,
      name: "Afternoon",
      icon: "◔",
      blurb:
        "Crisp 5000 K back across the floor to carry the afternoon. Cooler and brighter than Collaboration on purpose — this is the scene that exists to work against the post-lunch dip.",
      fadeMs: 2400,
      targets: {
        "ws-general": { on: true, level: 88, cct: 5000 },
        "ws-linear": { on: true, level: 85, cct: 5000 },
        "ws-task": { on: true, level: 78, cct: 5000 },
        "ws-cove": { on: true, level: 62, cct: 4500 },
        "ws-meeting": { on: true, level: 82, cct: 5000 },
        "ws-break": { on: true, level: 72, cct: 3200 },
        // The sun is round the front by three, so the sheer earns its keep.
        "ws-blinds": { sheer: 60, blackout: 0 },
        "ws-display": { on: true, source: "Signage", volume: 0 },
        "ws-ac": { on: true, setpointC: 23, mode: "cool", fan: 3 },
        "ws-fan": { on: true, speed: 3 },
      },
      highlight: ["connekt-profile", "sensibo-airbend"],
    },
    {
      id: "end-of-day",
      clockMin: 18 * 60 + 40,
      name: "End of Day",
      icon: "☾",
      blurb:
        "Warm, calm 3500 K to wind down and transition into the evening, blinds open to the city, AC setting back. Still a working level — people are still here.",
      fadeMs: 3000,
      targets: {
        /**
         * A working level, not a lounge.
         *
         * The cabin next door learned this the expensive way: "wind down"
         * read as an instruction to turn the lights off, and produced a room
         * nobody could read a document in at eight in the evening. End of Day
         * is the hour the floor empties, not the hour it closes — whoever is
         * still at a desk has to be able to work.
         */
        "ws-general": { on: true, level: 66, cct: 3500 },
        "ws-linear": { on: true, level: 60, cct: 3500 },
        "ws-task": { on: true, level: 70, cct: 3500 },
        "ws-cove": { on: true, level: 70, cct: 3000 },
        "ws-meeting": { on: true, level: 58, cct: 3200 },
        "ws-break": { on: true, level: 68, cct: 2700 },
        // Open. At this hour the city outside is the best thing in the room
        // and closing the blinds throws it away.
        "ws-blinds": { sheer: 0, blackout: 0 },
        "ws-display": { on: true, source: "Signage", volume: 0 },
        "ws-ac": { on: true, setpointC: 25, mode: "cool", fan: 1 },
        "ws-fan": { on: true, speed: 2 },
      },
      highlight: ["connekt-profile", "uniser-curtain-track"],
    },
    {
      id: "all-off",
      clockMin: 20 * 60 + 30,
      name: "All Off",
      icon: "⏻",
      blurb:
        "Everything to standby over four seconds, blinds drawn, HVAC released. The scene the floor spends two thirds of its life in, and the one the energy case is built on.",
      fadeMs: 4000,
      targets: {
        "ws-general": { on: false, fadeMs: 3000 },
        "ws-linear": { on: false, fadeMs: 3600 },
        "ws-task": { on: false, fadeMs: 2200 },
        "ws-cove": { on: false, fadeMs: 4000 },
        "ws-meeting": { on: false, fadeMs: 2600 },
        "ws-break": { on: false, fadeMs: 4000 },
        "ws-blinds": { sheer: 100, blackout: 100 },
        "ws-display": { on: false },
        "ws-ac": { on: false },
        "ws-fan": { on: false },
      },
      highlight: ["smartspaces-wired"],
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Automation                                                        */
  /* ---------------------------------------------------------------- */

  rules: [
    {
      id: "ws-occupancy",
      kind: "occupancy",
      name: "Occupancy",
      explain:
        "An empty floor sets back rather than switching off — the general and linear layers hold a low level so the space still reads as lit from the lifts, and the task, meeting and break zones release entirely. The AC follows, which is where most of the saving is.",
      enabledByDefault: true,
      sensorId: "ws-occ",
      holdMin: 15,
      onOccupied: {
        "ws-task": { on: true, level: 70, fadeMs: 900 },
        "ws-meeting": { on: true, level: 55, fadeMs: 900 },
        "ws-break": { on: true, level: 55, fadeMs: 1200 },
        "ws-ac": { on: true, setpointC: 24 },
      },
      onVacant: {
        "ws-task": { on: false, fadeMs: 2400 },
        "ws-meeting": { on: false, fadeMs: 2400 },
        "ws-break": { on: false, fadeMs: 3000 },
        // The floor holds a low level rather than going dark — see `explain`.
        "ws-general": { on: true, level: 18, fadeMs: 3000 },
        "ws-linear": { on: true, level: 14, fadeMs: 3000 },
        // Setback, not off. Pulling 5 kW of cassettes down from a cold start
        // costs more than holding them two degrees high for twenty minutes.
        "ws-ac": { on: true, setpointC: 27 },
      },
    },
    {
      id: "ws-daylight",
      kind: "daylight",
      name: "Daylight Harvesting",
      explain:
        "General, linear and task give back the light the glazing is already supplying, regulated to 400 lux on the working plane. The cove and the break area are left out: neither is there to make lux, and trimming them would undo the look the scene just set.",
      enabledByDefault: true,
      deviceIds: ["ws-general", "ws-linear", "ws-task"],
      targetLux: 400,
      /**
       * A floor, where the other rooms trim to nothing.
       *
       * The engine switches a fixture fully off when the trim reaches the
       * target and `minLevel` is zero, and on a sunny morning this floor is
       * well past its target — so with the boardroom's settings every desk
       * layer went out and the room had no visible lighting at all in its own
       * hero shot. That is also not what gets commissioned: daylight-linked
       * dimming is set with a 20-30 per cent floor because occupants dislike
       * luminaires that extinguish under them, and because the switching
       * cycles are hard on drivers.
       */
      minLevel: 35,
    },
    {
      id: "ws-circadian",
      kind: "circadian",
      name: "Circadian Tuning",
      /**
       * The widest curve of any room in the project, and it should be.
       *
       * The residential rooms tune across about 1000 K because a house is
       * never trying to keep anybody alert. This floor runs 3000 to 5600,
       * which is the sheet's own range, and the shape matters as much as the
       * ends: it peaks twice, once mid-morning and again mid-afternoon, with
       * a dip over lunch. That is the post-lunch dip written into the ceiling,
       * and it is the single most defensible thing tunable white does in an
       * office.
       */
      explain:
        "Colour follows the working day on the desk layers — cool at the start, warm over lunch, cool again through the afternoon, warm by evening. The break area and the cove are excluded so they hold their warmth regardless.",
      enabledByDefault: true,
      deviceIds: ["ws-general", "ws-linear", "ws-task"],
      curve: [
        { min: 0, cct: 3000 },
        { min: 420, cct: 4200 },
        { min: 540, cct: 5600 },
        { min: 690, cct: 5200 },
        { min: 800, cct: 3500 },
        { min: 900, cct: 5000 },
        { min: 1020, cct: 4600 },
        { min: 1140, cct: 3500 },
        { min: 1320, cct: 3000 },
      ],
    },
  ],

  defaults: {
    "ws-occ": { value: 1 },
    "ws-lux": { value: 0 },
    "ws-temp": { value: 28 },
    "ws-ac": { currentC: 28, setpointC: 24 },
    "ws-blinds": { sheer: 0, blackout: 0 },
  },
  openingSceneId: "start-day",
  // Mid-morning, like the boardroom. A workplace is sold in working hours.
  openingClockMin: 9 * 60 + 50,

  // Mumbai.
  environment: {
    sunriseMin: 6 * 60 + 20,
    sunsetMin: 18 * 60 + 55,
    outdoorPeakLux: 95000,
    /**
     * Lower than the boardroom's 0.019, which looks wrong and is not.
     *
     * This is an average over the whole plate, and the plate is twelve metres
     * deep. The desks on the glass see several times this; the meeting room
     * and the break area at the back see almost none of it. A boardroom is one
     * shallow room where every seat is near the window, so its average is much
     * closer to its perimeter value than this floor's can be.
     *
     * It also has to agree with what the renderer actually puts on the floor,
     * and that is the constraint that set the final number. At 0.006 the
     * simulation believed daylight was supplying 500 lux across the whole
     * plate and trimmed the fixtures to their floor accordingly — while the
     * render was lighting the window side and leaving the back of the room
     * dark, because a window really does fall off like that. The fixtures were
     * dimming for light that never arrived. A figure the renderer can honour
     * is worth more than one that is defensible on its own.
     *
     * 0.001 is the figure that leaves the fixtures doing visible work through
     * the middle of the day. Most of this floor is six to twelve metres from
     * the glass and a daylight factor falls off roughly with the square of
     * that distance, so the average over the plate is a small fraction of what
     * the first row of desks sees. Harvesting still trims about a fifth out of
     * the working layers at noon, which is a real saving to point at, and the
     * room stays lit while it does it.
     */
    windowFactor: 0.001,
    // The number an office is actually specified to, and the highest in the
    // project. A boardroom is 420 because people read at a table; a whole
    // floor of screens is 400 across the working plane and has to hold it
    // twelve metres back from the window.
    designLux: 400,
    outdoorMinC: 26,
    outdoorMaxC: 34,
  },

  baseline: {
    lightingWatts: 3600,
    hvacWatts: 9800,
    operatingHours: { startMin: 8 * 60 + 30, endMin: 20 * 60 },
    hvacHours: { startMin: 8 * 60 + 30, endMin: 20 * 60 },
    note:
      "Baseline is 50 × 72 W halogen/fluorescent troffers (3600 W) from 8:30 AM to 8:00 PM, and four non-inverter cassettes at a fixed setpoint (9800 W) over the same hours. Correct to the client's installed load before quoting.",
  },

  tariffPerKwh: 11,
  currency: "₹",
};
