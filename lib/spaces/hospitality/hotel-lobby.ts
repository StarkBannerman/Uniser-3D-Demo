/**
 * Hospitality — Hotel Lobby, Reception and Lounge.
 *
 * Built from the client's hotel common-area sheet. That drawing calls out
 * seven lighting layers by name, and each one becomes a device here:
 *
 *   Cove Lighting            -> hl-cove     the coffer steps, indirect
 *   Architectural Lighting   -> hl-arch     wall grooves and column uplights
 *   Tunable White            -> hl-general  the downlight field
 *   Decorative Lighting      -> hl-decor    chandelier cluster and table lamps
 *   Accent Lighting          -> hl-accent   artwork, sculpture, reception wall
 *   Feature Lighting         -> hl-feature  the water wall, RGB for events
 *   Facade / Feature         -> hl-facade   exterior and landscape
 *
 * plus blinds, HVAC and music, which the sheet lists under Automation.
 *
 * **Why a lobby is the strongest commercial room in the set.** An office is
 * sold on energy and compliance; a hotel lobby is sold on the first ten seconds
 * a guest spends in the building, and it has to deliver them at six in the
 * morning, at noon, at dusk and at two in the morning from the same fittings.
 * Seven scenes over one room is not a demonstration of variety here — it is the
 * actual brief a hospitality client arrives with.
 *
 * **Why Evening is staged.** The sheet prints it as a five-frame storyboard
 * along the bottom of the page:
 *
 *   daytime neutral white -> warmer colour temperature ->
 *     feature lighting increases -> decorative lighting activates -> music
 *
 * so Evening is a staged scene and those are its stages, in that order. It runs
 * about eight seconds, which is the length of the thing the salesperson is
 * talking over.
 *
 * Wattages and lumen figures remain the placeholders flagged in
 * `lib/catalog/products.ts`.
 */

import type { Space } from "@/lib/sim/types";

/** 17 x 24 m of lobby floor, double height. */
const AREA = 408;

export const hotelLobby: Space = {
  id: "hotel-lobby",
  name: "Hotel Lobby",
  segment: "hospitality",
  category: "Hospitality",
  blurb:
    "A 408 m² double-height hotel lobby in real-time 3D — seven separately controlled lighting layers across reception, lounge, a cascading water wall and a glazed façade, with blinds, occupancy, scheduling and music, and the seven scenes a common area runs through in a day.",
  renderer: "3d",
  model: "hotel-lobby",

  keypad: {
    layout: "grid",
    finish: "brass",
    scenes: ["morning", "day", "evening", "night"],
  },

  zones: [{ id: "hl-main", name: "Lobby", areaM2: AREA }],

  /* ---------------------------------------------------------------- */
  /* Devices                                                           */
  /* ---------------------------------------------------------------- */

  devices: [
    {
      id: "hl-general",
      kind: "light",
      name: "General",
      zoneId: "hl-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "Forty-eight recessed heads over the circulation route and the lounge, tunable 2700 K to 5000 K. This is the only layer in the room that exists to make lux rather than to make an impression — which is exactly why Cleaning runs it alone at full cool white and every other scene keeps it under half.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5000 },
      fixtures: 48,
      wattsEach: 14,
      lumensEach: 1400,
      baselineWattsEach: 70,
      glow: [],
    },
    {
      id: "hl-cove",
      kind: "light",
      name: "Cove",
      zoneId: "hl-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "A hundred and ten metres of concealed run along every step of the coffer. In a seven-metre room this is the layer that makes the ceiling a feature instead of a lid — it is the light you cannot see the source of, and the one guests describe as 'warm' without being able to say why.",
      dimmable: true,
      /**
       * Up to 4200 K, where a cove would normally stop at 3000.
       *
       * A cove is a warmth device nine hours out of ten, which is why the
       * first pass capped it low. But this room has a daylit half to its day,
       * and a 2800 K ceiling over a 4600 K floor does not read as warm — it
       * reads as a colour cast, with the coffer going orange against a window
       * full of sky. Morning and Day need the cove to agree with the daylight.
       */
      tunable: { minK: 2200, maxK: 4600 },
      fixtures: 110, // metres of run
      wattsEach: 9,
      lumensEach: 950,
      glow: [],
    },
    {
      id: "hl-arch",
      kind: "light",
      name: "Architectural",
      zoneId: "hl-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Linear grooves down the panelled wall and uplight strips set into every column. Architectural lighting is lighting that draws the building rather than the room, and it is what keeps a lobby legible when the general layer is at fifteen per cent at two in the morning.",
      dimmable: true,
      tunable: { minK: 2400, maxK: 4500 },
      fixtures: 26,
      wattsEach: 11,
      lumensEach: 700,
      glow: [],
    },
    {
      id: "hl-decor",
      kind: "light",
      name: "Decorative",
      zoneId: "hl-main",
      productId: "pipeline-pendant",
      subsystem: "lighting",
      /**
       * Capped at 3000 K, where the general layer goes to 5000.
       *
       * A chandelier is a filament, and a filament at 4000 K is a shop. Giving
       * this group the daylight end of the range would only ever be reached by
       * mistake, and the one scene that genuinely wants cool white — Cleaning
       * — switches the decoratives off rather than cooling them.
       */
      dimmable: true,
      tunable: { minK: 1900, maxK: 3000 },
      fixtures: 63, // 54 chandelier globes + 9 table and floor lamps
      wattsEach: 6,
      lumensEach: 420,
      glow: [],
    },
    {
      id: "hl-accent",
      kind: "light",
      name: "Accent",
      zoneId: "hl-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Narrow beams on the artwork, the sculpture and the reception wall. Accent light is the layer a client can be shown the value of in one press: switch it off and the room is still perfectly well lit, and completely flat.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 4000 },
      fixtures: 14,
      wattsEach: 9,
      lumensEach: 800,
      glow: [],
    },
    {
      id: "hl-feature",
      kind: "light",
      name: "Feature",
      zoneId: "hl-main",
      productId: "flexi-delta-rgb",
      subsystem: "lighting",
      pitch:
        "The cascade behind the water wall, full RGB. It is the only element in the room that can change the character of the whole space from one channel — blue all week, and whatever colour the event in the ballroom is branded on a Saturday.",
      dimmable: true,
      rgb: true,
      tunable: { minK: 2200, maxK: 6000 },
      fixtures: 22,
      wattsEach: 12,
      lumensEach: 600,
      glow: [],
    },
    {
      id: "hl-facade",
      kind: "light",
      name: "Façade",
      zoneId: "hl-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Grazers up the entrance columns and landscape heads through the planting on the driveway. After dark this is what a guest actually arrives at, and it is the layer that stops the glazing reading as a black wall from inside.",
      dimmable: true,
      tunable: { minK: 2200, maxK: 4000 },
      fixtures: 18,
      wattsEach: 18,
      lumensEach: 1100,
      glow: [],
    },

    {
      id: "hl-blinds",
      kind: "shade",
      name: "Blinds",
      zoneId: "hl-main",
      productId: "uniser-curtain-track",
      subsystem: "shades",
      pitch:
        "Motorised solar filters across the full height of the façade with a blackout layer behind them. Twenty-four metres of west-facing glass is a beautiful arrival at seven in the evening and an unusable lounge at four in the afternoon; this is the difference.",
      layers: ["sheer", "blackout"],
      watts: 140,
      travelMs: 7200,
      window: { x: 0.62, y: 0.12, w: 0.36, h: 0.72 },
      draw: "both",
    },

    {
      id: "hl-ac",
      kind: "climate",
      name: "Air Conditioning",
      zoneId: "hl-main",
      productId: "sensibo-airbend",
      subsystem: "climate",
      pitch:
        "Eight concealed fan-coils on one setpoint, trimmed when the lounge is empty. A double-height lobby with a revolving door is the hardest space in a hotel to hold at temperature, and the largest single line on its energy bill.",
      minC: 16,
      maxC: 30,
      ratedWatts: 9400,
    },
    {
      id: "hl-music",
      kind: "av",
      name: "Music",
      zoneId: "hl-main",
      productId: "smartspaces-audio",
      subsystem: "av",
      pitch:
        "Distributed ceiling speakers across the lobby, on the same scenes as the light. Changing the playlist with the lighting is the whole of hospitality atmosphere control — and it is the one layer a guest notices stopping.",
      sources: ["Lobby Ambient", "Jazz Trio", "Event Set"],
      hasScreen: false,
      ratedWatts: 240,
      glow: [],
    },

    {
      id: "hl-occ",
      kind: "sensor",
      name: "Lounge Occupancy",
      zoneId: "hl-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Presence across the lounge cluster. A lobby is never empty but the seating very often is, and holding it at thirty per cent rather than full is a saving that runs twenty-four hours a day without a guest ever seeing it happen.",
      metric: "occupancy",
      unit: "",
      min: 0,
      max: 1,
    },
    {
      id: "hl-lux",
      kind: "sensor",
      name: "Ambient Light",
      zoneId: "hl-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Measured light at the reception desk, which is what daylight response regulates against. The desk is four metres from twenty-four metres of glazing, so at four in the afternoon it needs almost nothing from the ceiling.",
      metric: "lux",
      unit: "lx",
      derived: true,
    },
    {
      id: "hl-temp",
      kind: "sensor",
      name: "Lobby Temperature",
      zoneId: "hl-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Air temperature in the lounge, which is what the fan-coils regulate to and what a guest complains about first.",
      metric: "temperature",
      unit: "°C",
      derived: true,
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Scenes — the seven on the client's sheet                          */
  /* ---------------------------------------------------------------- */

  scenes: [
    {
      id: "morning",
      clockMin: 7 * 60,
      name: "Morning",
      icon: "☀",
      blurb:
        "Neutral-cool 4200 K with the blinds open to the daylight, chandeliers down to a glow. Bright and awake without being an office.",
      fadeMs: 2200,
      targets: {
        "hl-general": { on: true, level: 85, cct: 4200, sat: 0 },
        // Neutral, not amber: the ceiling has to agree with the sky in the
        // window rather than fight it.
        "hl-cove": { on: true, level: 48, cct: 4000, sat: 0 },
        "hl-arch": { on: true, level: 52, cct: 4000, sat: 0 },
        // Low rather than off. A dark chandelier over a bright lobby reads as
        // a fault; a chandelier at a fifth reads as morning.
        "hl-decor": { on: true, level: 20, cct: 2700, sat: 0 },
        "hl-accent": { on: true, level: 55, cct: 3800, sat: 0 },
        "hl-feature": { on: true, level: 45, cct: 5200, sat: 55, hue: 204 },
        "hl-facade": { on: false, sat: 0 },
        "hl-blinds": { sheer: 0, blackout: 0 },
        "hl-ac": { on: true, setpointC: 23, mode: "cool", fan: 2 },
        "hl-music": { on: true, source: "Lobby Ambient", volume: 18 },
      },
      highlight: ["proplus-downlight", "connekt-profile"],
    },
    {
      id: "day",
      clockMin: 12 * 60 + 30,
      name: "Day",
      icon: "◎",
      blurb:
        "Full neutral white with the daylight doing most of the work, decoratives minimal. The scene the room spends the most hours in and the one harvesting pays for.",
      fadeMs: 2400,
      targets: {
        /**
         * Seventy, not eighty-eight.
         *
         * Day is the scene where the façade is supposed to be doing the work
         * — that is the whole daylight-harvesting argument — and a ceiling
         * running at nearly full under it is the layer fighting the window
         * rather than filling in behind it.
         */
        "hl-general": { on: true, level: 70, cct: 4800, sat: 0 },
        // Lower than Morning, not higher. At noon the sun is doing the work
        // and a cove at 55 only lifts the ceiling — which had the lobby
        // brighter overhead than underfoot, the opposite of a daylit room.
        "hl-cove": { on: true, level: 38, cct: 4200, sat: 0 },
        "hl-arch": { on: true, level: 36, cct: 4200, sat: 0 },
        "hl-decor": { on: true, level: 12, cct: 2800, sat: 0 },
        "hl-accent": { on: true, level: 34, cct: 4000, sat: 0 },
        "hl-feature": { on: true, level: 40, cct: 5600, sat: 52, hue: 204 },
        "hl-facade": { on: false, sat: 0 },
        // Half-drawn. Midday sun on west glazing is glare on the seating, and
        // the filter is what makes the lounge usable rather than photogenic.
        // A third rather than half. The filter is there for glare on the
        // seating, and at 55 it was also taking the daylight out of the one
        // scene whose whole point is that the daylight is doing the work.
        "hl-blinds": { sheer: 32, blackout: 0 },
        "hl-ac": { on: true, setpointC: 22, mode: "cool", fan: 3 },
        "hl-music": { on: true, source: "Lobby Ambient", volume: 22 },
      },
      highlight: ["proplus-downlight", "uniser-curtain-track"],
    },
    {
      /**
       * Staged, to the storyboard printed along the bottom of the sheet.
       *
       * Stage zero is where the room already is at the end of the day —
       * daytime neutral white — so pressing Evening from Day visibly starts
       * from where you were standing rather than snapping. Then the four
       * frames the sheet draws, in its order, over about eight seconds.
       */
      id: "evening",
      clockMin: 18 * 60 + 40,
      name: "Evening",
      icon: "◐",
      blurb:
        "Five stages over eight seconds: daytime neutral white, then warmer colour temperature, then the water wall comes up, then the chandeliers, then the music. The sheet's own storyboard, run as one button.",
      fadeMs: 1600,
      targets: {
        "hl-general": { on: true, level: 70, cct: 4400, sat: 0 },
        "hl-cove": { on: true, level: 50, cct: 3400, sat: 0 },
        "hl-arch": { on: true, level: 45, cct: 3600, sat: 0 },
        "hl-decor": { on: true, level: 18, cct: 2800, sat: 0 },
        "hl-accent": { on: true, level: 50, cct: 3600, sat: 0 },
        "hl-feature": { on: true, level: 35, cct: 5200, sat: 50, hue: 204 },
        "hl-blinds": { sheer: 0, blackout: 0 },
        "hl-ac": { on: true, setpointC: 23, mode: "cool", fan: 2 },
      },
      steps: [
        {
          label: "Warmer colour temperature",
          holdMs: 2200,
          targets: {
            "hl-general": { on: true, level: 46, cct: 2800, fadeMs: 2000, sat: 0 },
            "hl-cove": { on: true, level: 78, cct: 2500, fadeMs: 2000, sat: 0 },
            "hl-arch": { on: true, level: 70, cct: 2700, fadeMs: 2000, sat: 0 },
            "hl-facade": { on: true, level: 80, cct: 2600, fadeMs: 2000, sat: 0 },
          },
        },
        {
          label: "Feature lighting increases",
          holdMs: 1900,
          targets: {
            // Warm-blue, as the sheet's Evening frame shows it: the cascade
            // stays cool against a room that has just gone warm, which is the
            // contrast that makes it the subject.
            "hl-feature": { on: true, level: 88, cct: 4200, hue: 202, sat: 58, fadeMs: 1700 },
            "hl-accent": { on: true, level: 82, cct: 3000, fadeMs: 1700, sat: 0 },
          },
        },
        {
          label: "Decorative lighting activates",
          holdMs: 2100,
          targets: {
            "hl-decor": { on: true, level: 92, cct: 2200, fadeMs: 1900, sat: 0 },
          },
        },
        {
          label: "Music starts",
          holdMs: 1400,
          targets: {
            "hl-music": { on: true, source: "Jazz Trio", volume: 38 },
          },
        },
      ],
      highlight: ["pipeline-pendant", "flexi-delta-rgb", "smartspaces-audio"],
    },
    {
      id: "night",
      clockMin: 23 * 60 + 30,
      name: "Night",
      icon: "☾",
      blurb:
        "Dimmed and warm, cove and accents low, chandeliers glowing. Reception stays properly lit — it is staffed all night and a guest arriving at one in the morning has to be able to see somebody.",
      fadeMs: 3200,
      targets: {
        "hl-general": { on: true, level: 18, cct: 2700, sat: 0 },
        "hl-cove": { on: true, level: 32, cct: 2300, sat: 0 },
        "hl-arch": { on: true, level: 38, cct: 2500, sat: 0 },
        "hl-decor": { on: true, level: 45, cct: 2000, sat: 0 },
        /**
         * The highest layer in the scene, and deliberately.
         *
         * Accent carries the reception wall, and the one thing a lobby cannot
         * do at two in the morning is leave the desk dark. Dimming everything
         * uniformly is what makes a night scene look like a power cut; dimming
         * everything *except* the one place a person stands is what makes it
         * look designed.
         */
        "hl-accent": { on: true, level: 62, cct: 2700, sat: 0 },
        // Thirty per cent and a deeper blue. At forty and half-saturated the
        // cascade was the brightest thing in a scene whose whole point is
        // that the room has gone quiet.
        "hl-feature": { on: true, level: 30, cct: 3600, hue: 216, sat: 80 },
        "hl-facade": { on: true, level: 55, cct: 2400, sat: 0 },
        "hl-blinds": { sheer: 0, blackout: 0 },
        "hl-ac": { on: true, setpointC: 25, mode: "cool", fan: 1 },
        "hl-music": { on: true, source: "Lobby Ambient", volume: 12 },
      },
      highlight: ["magneto-track", "connekt-profile"],
    },
    {
      id: "welcome",
      name: "Welcome",
      icon: "✦",
      blurb:
        "The arrival moment: everything warm and up, chandeliers at full, façade lit, music on. Pressed when a coach pulls in, and the one scene with no energy argument behind it at all.",
      fadeMs: 1400,
      targets: {
        "hl-general": { on: true, level: 62, cct: 3000, sat: 0 },
        "hl-cove": { on: true, level: 95, cct: 2600, sat: 0 },
        "hl-arch": { on: true, level: 85, cct: 2700, sat: 0 },
        "hl-decor": { on: true, level: 100, cct: 2200, sat: 0 },
        "hl-accent": { on: true, level: 90, cct: 3000, sat: 0 },
        "hl-feature": { on: true, level: 80, cct: 4000, hue: 200, sat: 45 },
        "hl-facade": { on: true, level: 95, cct: 2600, sat: 0 },
        "hl-blinds": { sheer: 0, blackout: 0 },
        "hl-ac": { on: true, setpointC: 22, mode: "cool", fan: 3 },
        "hl-music": { on: true, source: "Jazz Trio", volume: 42 },
      },
      highlight: ["pipeline-pendant", "smartspaces-audio"],
    },
    {
      id: "event",
      name: "Event",
      icon: "✳",
      blurb:
        "Colour takes the room: cove, columns and water wall in purple and blue, white layers pulled right back, music up. The Saturday night version of the same fittings.",
      fadeMs: 1200,
      targets: {
        // Low, not off. Somebody still has to find the lift.
        "hl-general": { on: true, level: 12, cct: 2700 },
        "hl-cove": { on: true, level: 85, cct: 3000, hue: 288, sat: 88 },
        "hl-arch": { on: true, level: 90, cct: 3000, hue: 272, sat: 82 },
        "hl-decor": { on: true, level: 48, cct: 2200 },
        "hl-accent": { on: true, level: 30, cct: 2700 },
        "hl-feature": { on: true, level: 100, cct: 4000, hue: 212, sat: 95 },
        "hl-facade": { on: true, level: 90, cct: 3000, hue: 280, sat: 70 },
        "hl-blinds": { sheer: 0, blackout: 0 },
        "hl-ac": { on: true, setpointC: 21, mode: "cool", fan: 4 },
        "hl-music": { on: true, source: "Event Set", volume: 72 },
      },
      highlight: ["flexi-delta-rgb", "smartspaces-audio"],
    },
    {
      id: "cleaning",
      clockMin: 4 * 60 + 30,
      name: "Cleaning",
      icon: "⚐",
      blurb:
        "Every general head at full cool white, decorative and feature off, music off. Nobody is meant to see this scene — which is exactly why it has to exist, because otherwise the night crew switch the chandeliers on to find the floor.",
      fadeMs: 900,
      targets: {
        "hl-general": { on: true, level: 100, cct: 5000, sat: 0 },
        /**
         * Neutral white and high, where it was warm and low.
         *
         * Cleaning is the one scene with no mood in it: the night crew need
         * to see the floor, and every shadow the room's designed lighting
         * casts is somewhere dirt hides. So the cove goes to the top of its
         * range in colour and well up in level — the point is to fill the
         * shadows the downlights leave, which is what makes the scene flat.
         */
        "hl-cove": { on: true, level: 78, cct: 4500, sat: 0 },
        "hl-arch": { on: true, level: 30, cct: 4500, sat: 0 },
        "hl-decor": { on: false, sat: 0 },
        "hl-accent": { on: false, sat: 0 },
        "hl-feature": { on: false, sat: 0 },
        "hl-facade": { on: false, sat: 0 },
        "hl-blinds": { sheer: 100, blackout: 0 },
        "hl-ac": { on: true, setpointC: 26, mode: "cool", fan: 1 },
        "hl-music": { on: false },
      },
      highlight: ["proplus-downlight"],
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Automation                                                        */
  /* ---------------------------------------------------------------- */

  rules: [
    {
      id: "hl-occupancy",
      kind: "occupancy",
      name: "Lounge Occupancy",
      explain:
        "The lounge cluster brightens when somebody sits in it and falls back to thirty per cent when it has been empty for ten minutes. The circulation route, reception and every feature layer are untouched — a lobby that dims while a guest is crossing it is a fault, not a saving.",
      enabledByDefault: true,
      sensorId: "hl-occ",
      holdMin: 10,
      onOccupied: {
        "hl-general": { on: true, level: 68, fadeMs: 1200, sat: 0 },
        "hl-decor": { on: true, level: 72, fadeMs: 1600, sat: 0 },
      },
      onVacant: {
        // Thirty per cent of where the scene had them, which is the number the
        // brief asks for and also what a hotel actually commissions: the room
        // must still read as open for business from the entrance.
        "hl-general": { on: true, level: 30, fadeMs: 3200, sat: 0 },
        "hl-decor": { on: true, level: 30, fadeMs: 4000, sat: 0 },
      },
    },
    {
      id: "hl-daylight",
      kind: "daylight",
      name: "Daylight Harvesting",
      explain:
        "The general layer gives back what twenty-four metres of façade is already supplying, regulated to 300 lux at the desk. Cove, decorative and feature are excluded — none of them is there to make lux, and trimming them would undo the look the scene just set.",
      enabledByDefault: true,
      deviceIds: ["hl-general"],
      targetLux: 300,
      /**
       * A floor of thirty, like the workspace and for the same reason.
       *
       * With `minLevel` at zero the engine switches a fixture fully off once
       * daylight meets the target, and at noon this room is well past it — so
       * the hero shot of a sunlit lobby had no ceiling lighting in it at all.
       * Daylight-linked dimming is commissioned with a floor because occupants
       * dislike luminaires extinguishing over them and because the switching
       * cycles are hard on drivers.
       */
      minLevel: 30,
    },
    {
      id: "hl-circadian",
      kind: "circadian",
      name: "Circadian Tuning",
      /**
       * Narrower than the office floor's curve, and warmer at both ends.
       *
       * An office tunes to keep people alert. A lobby tunes to match the hour
       * a guest thinks it is, and nobody wants to be greeted at 5600 K. The
       * curve peaks at 4600 around noon and is back under 3000 by nine in the
       * evening, which is roughly the daylight the façade is admitting anyway.
       */
      explain:
        "The general layer follows the hour — cool through the middle of the day, warm at either end — so the ceiling agrees with the daylight coming through the façade instead of fighting it. Decorative and cove are excluded; those hold their warmth around the clock.",
      enabledByDefault: true,
      deviceIds: ["hl-general"],
      curve: [
        { min: 0, cct: 2700 },
        { min: 330, cct: 3200 },
        { min: 480, cct: 4200 },
        { min: 750, cct: 4600 },
        { min: 1020, cct: 3800 },
        { min: 1140, cct: 2900 },
        { min: 1320, cct: 2700 },
      ],
    },

    /**
     * The scheduled day, as four rules rather than one.
     *
     * The sheet lists "Scheduled lighting" as an automation in its own right,
     * and in a hotel it genuinely is the primary one: a lobby runs to a
     * timetable that nobody presses a button for. Each of these fires as the
     * clock crosses it, so dragging the time slider walks the room through its
     * own day — which is the demonstration.
     *
     * They set the devices rather than calling the scene, because a schedule
     * that recalled a scene would also drag the clock to that scene's
     * `clockMin` and the slider would fight itself.
     */
    {
      id: "hl-sched-morning",
      kind: "schedule",
      name: "06:00 — Morning",
      explain:
        "The lobby comes up to neutral white as the breakfast service opens, blinds open, chandeliers to a glow.",
      enabledByDefault: true,
      at: 6 * 60,
      targets: {
        "hl-general": { on: true, level: 85, cct: 4200, fadeMs: 6000, sat: 0 },
        "hl-cove": { on: true, level: 62, cct: 4000, fadeMs: 6000, sat: 0 },
        "hl-arch": { on: true, level: 52, cct: 4000, fadeMs: 6000, sat: 0 },
        "hl-decor": { on: true, level: 20, cct: 2700, fadeMs: 6000, sat: 0 },
        "hl-accent": { on: true, level: 55, cct: 3800, fadeMs: 6000, sat: 0 },
        "hl-facade": { on: false, sat: 0, fadeMs: 6000 },
        "hl-blinds": { sheer: 0, blackout: 0 },
        "hl-music": { on: true, source: "Lobby Ambient", volume: 18 },
      },
    },
    {
      id: "hl-sched-day",
      kind: "schedule",
      name: "10:00 — Day",
      explain:
        "Full neutral white and the solar filter half drawn, once the sun is round onto the façade.",
      enabledByDefault: true,
      at: 10 * 60,
      targets: {
        "hl-general": { on: true, level: 70, cct: 4800, fadeMs: 6000, sat: 0 },
        "hl-cove": { on: true, level: 38, cct: 4200, fadeMs: 6000, sat: 0 },
        "hl-decor": { on: true, level: 12, cct: 2800, fadeMs: 6000, sat: 0 },
        "hl-blinds": { sheer: 55, blackout: 0 },
      },
    },
    {
      id: "hl-sched-evening",
      kind: "schedule",
      name: "18:00 — Evening",
      explain:
        "Colour temperature drops to 2800 K, the façade and the water wall come up, and the blinds open to the arrival.",
      enabledByDefault: true,
      at: 18 * 60,
      targets: {
        "hl-general": { on: true, level: 46, cct: 2800, fadeMs: 8000, sat: 0 },
        "hl-cove": { on: true, level: 78, cct: 2500, fadeMs: 8000, sat: 0 },
        "hl-arch": { on: true, level: 70, cct: 2700, fadeMs: 8000, sat: 0 },
        "hl-decor": { on: true, level: 92, cct: 2200, fadeMs: 8000, sat: 0 },
        "hl-accent": { on: true, level: 82, cct: 3000, fadeMs: 8000, sat: 0 },
        "hl-feature": { on: true, level: 88, cct: 4200, hue: 202, sat: 58, fadeMs: 8000 },
        "hl-facade": { on: true, level: 80, cct: 2600, fadeMs: 8000, sat: 0 },
        "hl-blinds": { sheer: 0, blackout: 0 },
        "hl-music": { on: true, source: "Jazz Trio", volume: 38 },
      },
    },
    {
      id: "hl-sched-night",
      kind: "schedule",
      name: "23:00 — Night",
      explain:
        "Everything down to the overnight level, with reception held bright on the accent layer.",
      enabledByDefault: true,
      at: 23 * 60,
      targets: {
        "hl-general": { on: true, level: 18, cct: 2700, fadeMs: 9000, sat: 0 },
        "hl-cove": { on: true, level: 32, cct: 2300, fadeMs: 9000, sat: 0 },
        "hl-arch": { on: true, level: 38, cct: 2500, fadeMs: 9000, sat: 0 },
        "hl-decor": { on: true, level: 45, cct: 2000, fadeMs: 9000, sat: 0 },
        "hl-accent": { on: true, level: 62, cct: 2700, fadeMs: 9000, sat: 0 },
        "hl-feature": { on: true, level: 30, cct: 3600, hue: 216, sat: 80, fadeMs: 9000 },
        "hl-facade": { on: true, level: 55, cct: 2400, fadeMs: 9000, sat: 0 },
        "hl-music": { on: true, source: "Lobby Ambient", volume: 12 },
      },
    },
  ],

  defaults: {
    "hl-occ": { value: 1 },
    "hl-lux": { value: 0 },
    "hl-temp": { value: 29 },
    "hl-ac": { currentC: 29, setpointC: 23 },
    "hl-blinds": { sheer: 0, blackout: 0 },
  },

  /**
   * Opens at dusk, where every other commercial room opens in working hours.
   *
   * The office rooms are sold on a working day and should open in one. A
   * hospitality client is buying the arrival, and the arrival they care about
   * is the one at half past seven in the evening with the façade lit and the
   * chandeliers on. It is also the hour the sheet's own hero image is shot at.
   */
  openingSceneId: "evening",
  openingClockMin: 19 * 60 + 20,

  // Mumbai.
  environment: {
    sunriseMin: 6 * 60 + 20,
    sunsetMin: 18 * 60 + 55,
    outdoorPeakLux: 95000,
    /**
     * Higher than the office floor's 0.001, and it should be.
     *
     * That room is twelve metres deep behind a strip of glazing; this one is
     * a double-height volume with twenty-four metres of floor-to-ceiling glass
     * down one whole side, so a far larger fraction of the plate sees sky. It
     * is still well under a daylit office's 0.02, because the lounge sits in
     * the middle of a 17 m span and the reception wall behind it sees none of
     * it at all.
     */
    windowFactor: 0.004,
    /**
     * 300 lux, which is a lobby and not an office.
     *
     * An open-plan floor is designed to 400 and a boardroom higher again,
     * because people read at both. Nobody works in a lobby: the design figure
     * for a hotel common area is 100-200 lux on the floor with accent on top,
     * and 300 here is the reception desk's number — the one place in the room
     * with a task on it.
     */
    designLux: 300,
    outdoorMinC: 26,
    outdoorMaxC: 34,
  },

  baseline: {
    /**
     * Halogen and metal-halide, which is what this is actually replacing.
     *
     * A lobby of this vintage runs 50 W halogen downlights on dimmers nobody
     * adjusts and metal-halide floodlights on the façade on a timeclock. The
     * saving here is not clever control to begin with — it is that the room
     * stops drawing 24 kW to do what 4 kW now does, and then control takes
     * another third off that.
     */
    lightingWatts: 23800,
    hvacWatts: 11200,
    /**
     * Round the clock, because a lobby genuinely is.
     *
     * This is the figure that makes hospitality a better energy argument than
     * an office: an office is dark for two thirds of its life whether or not
     * anybody automates it, so the saving is bounded. A lobby is lit for
     * 8,760 hours a year, and every watt taken out of it is taken out for all
     * of them.
     */
    operatingHours: { startMin: 0, endMin: 24 * 60 },
    hvacHours: { startMin: 0, endMin: 24 * 60 },
    note:
      "50 W halogen downlights throughout, metal-halide façade floods on a timeclock, and fan-coils with no setback — a 2010-vintage five-star lobby, running continuously.",
  },

  tariffPerKwh: 11.5,
  currency: "₹",
};
