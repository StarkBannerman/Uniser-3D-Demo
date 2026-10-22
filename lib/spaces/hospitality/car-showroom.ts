/**
 * Commercial — Car Showroom.
 *
 * Built from the client's showroom sheet. That drawing calls out ten lighting
 * layers by name, and each one becomes a device here:
 *
 *   General Showroom Lighting -> cs-general   the downlight field
 *   Adjustable Spotlights     -> cs-spots     heads aimed at the cars
 *   Track Lighting            -> cs-spots     same circuit, same job
 *   High-CRI Product Lighting -> cs-product   the one the room is sold on
 *   Linear Lighting           -> cs-linear    the ceiling lines
 *   Tunable White             -> a property of general, not a circuit
 *   Accent Lighting           -> cs-accent    graphic walls and brand walls
 *   Floor Lighting            -> cs-floor     platform rings and pathways
 *   Architectural Lighting    -> cs-arch      cove and column strips
 *   RGB Feature Lighting      -> cs-rgb       the feature wall
 *
 * plus the turntable, HVAC, music and the display screens.
 *
 * **Why a showroom is the best room in the set to sell lighting with.** Every
 * other space in this project is sold on comfort or on energy. A dealership is
 * sold on one number: how much of a car's colour a customer can see before
 * they sign. That makes the High-CRI toggle the only control in nine rooms
 * whose value a client can judge in one press, with their own eyes, on a
 * surface they already care about — which is why it gets a circuit of its own
 * rather than being a property of the spotlights.
 *
 * **Tunable white is deliberately not a circuit**, for the same reason it is
 * not one in the boardroom: it is a capability the general layer has, and
 * making it a device would imply there are fixtures somewhere that are tunable
 * while the others are not.
 *
 * Wattages and lumen figures remain the placeholders flagged in
 * `lib/catalog/products.ts`.
 */

import type { Space } from "@/lib/sim/types";

/** 26 x 20 m of showroom floor. */
const AREA = 520;

export const carShowroom: Space = {
  id: "car-showroom",
  name: "Car Showroom",
  segment: "hospitality",
  category: "Automotive Retail",
  blurb:
    "A 520 m² car showroom in real-time 3D — nine separately controlled lighting layers over a hero turntable, a track-lit display floor, a customer lounge and a mezzanine, with the high-CRI comparison a dealership actually buys on.",
  renderer: "3d",
  model: "car-showroom",

  keypad: {
    layout: "grid",
    finish: "graphite",
    scenes: ["showroom-open", "vehicle-presentation", "new-car-launch", "closing"],
  },

  zones: [{ id: "cs-main", name: "Showroom", areaM2: AREA }],

  /* ---------------------------------------------------------------- */
  /* Devices                                                           */
  /* ---------------------------------------------------------------- */

  devices: [
    {
      id: "cs-general",
      kind: "light",
      name: "General",
      zoneId: "cs-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "Fifty-four recessed heads on a 2.6 m grid over the whole floor, tunable 2700 K to 6500 K. This is the layer that makes the room usable and the one that flatters nothing — a showroom lit by this alone sells no cars, which is the argument for every other circuit in the room.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 6500 },
      fixtures: 54,
      wattsEach: 16,
      lumensEach: 1700,
      baselineWattsEach: 80,
      /**
       * Intensities are low on purpose. `glowAlpha` already takes a circuit at
       * 72 per cent to about 0.84 opacity, and this room runs eight circuits
       * at once where the illustrated living room runs three — left at the
       * default of 1 they stacked into white discs and washed the plate out
       * completely. Each glow here contributes a fraction and the sum does the
       * work.
       *
       * A cone's `radius` is the disc at its *source*, not the beam. The plate
       * already draws the fittings, so anything bigger than a few pixels there
       * reads as a grey smudge on the ceiling rather than as a lamp.
       */
      glow: [],
    },
    {
      id: "cs-spots",
      kind: "light",
      name: "Spotlights",
      zoneId: "cs-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Thirty-two adjustable heads on magnetic track, aimed car by car. Contrast is what sells metal: a car lit three times brighter than the floor around it reads as the subject of the room, and the same car under flat light reads as stock.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5000 },
      fixtures: 32,
      wattsEach: 24,
      lumensEach: 2400,
      baselineWattsEach: 70,
      glow: [],
    },
    {
      id: "cs-product",
      kind: "light",
      name: "High-CRI Product",
      zoneId: "cs-main",
      productId: "magneto-track",
      subsystem: "lighting",
      /**
       * The one circuit in this project whose value is visible rather than
       * argued.
       *
       * Switch it off and the standard heads carry the display alone: a colour
       * rendering index around 80, which is a spectrum with a trough in it
       * where deep red belongs. Metallic paint loses its depth and a red car
       * goes brick. Dealerships lose deals to that gap.
       */
      pitch:
        "Dedicated 95+ CRI heads over the display positions. A standard 80 CRI source has a trough in its spectrum where deep red belongs, so metallic paint flattens and a red car reads brick — this is the circuit that closes the gap between the brochure and the showroom floor.",
      dimmable: true,
      tunable: { minK: 3000, maxK: 5000 },
      fixtures: 12,
      wattsEach: 28,
      lumensEach: 2200,
      glow: [],
    },
    {
      id: "cs-linear",
      kind: "light",
      name: "Linear",
      zoneId: "cs-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Sixty-eight metres of continuous run across the ceiling and down the slatted bay. On a ceiling this high the linear lines are the only thing giving the volume a direction — without them a showroom reads as a warehouse with cars parked in it.",
      dimmable: true,
      rgb: true,
      tunable: { minK: 2700, maxK: 5000 },
      fixtures: 68,
      wattsEach: 9,
      lumensEach: 950,
      glow: [],
    },
    {
      id: "cs-accent",
      kind: "light",
      name: "Accent",
      zoneId: "cs-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Grazing on the brand graphics and the feature walls. This is the layer that lights the story rather than the stock — and at night, with the general layer off, it is the only thing a passer-by sees through the glass.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 4000 },
      fixtures: 16,
      wattsEach: 12,
      lumensEach: 900,
      glow: [],
    },
    {
      id: "cs-floor",
      kind: "light",
      name: "Floor",
      zoneId: "cs-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "The ring under the hero platform and the lines that define the walking routes. Floor lighting is what tells a customer where the room wants them to go, and it does it without a single sign.",
      dimmable: true,
      rgb: true,
      tunable: { minK: 2200, maxK: 5000 },
      fixtures: 24,
      wattsEach: 8,
      lumensEach: 520,
      glow: [],
    },
    {
      id: "cs-arch",
      kind: "light",
      name: "Architectural",
      zoneId: "cs-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Cove along the coffer edge and vertical strips set into every column. Architectural lighting draws the building rather than the stock, and it is what keeps a six-metre room from going black above the cars.",
      dimmable: true,
      rgb: true,
      tunable: { minK: 2200, maxK: 4000 },
      fixtures: 22,
      wattsEach: 10,
      lumensEach: 700,
      glow: [],
    },
    {
      id: "cs-rgb",
      kind: "light",
      name: "RGB Feature",
      zoneId: "cs-main",
      productId: "flexi-delta-rgb",
      subsystem: "lighting",
      pitch:
        "Full-colour panels on the feature wall and a colour channel in the platform ring. A dealership runs a launch night four times a year, and this is the circuit that pays for all four without anybody hiring staging.",
      dimmable: true,
      rgb: true,
      tunable: { minK: 2200, maxK: 6000 },
      fixtures: 18,
      wattsEach: 14,
      lumensEach: 620,
      glow: [],
    },

    {
      /**
       * A turntable, modelled as a fan.
       *
       * It is not a fan, and `fan` is nevertheless the right kind: the engine
       * already gives that kind an on/off and a speed, the renderer already
       * turns geometry from the speed, and the per-frame step is already
       * capped against the aliasing that makes a rotating object appear to run
       * backwards — which a turntable would do at exactly the frame rates this
       * project runs at. A `turntable` kind would duplicate all of it to
       * change a label.
       */
      id: "cs-turntable",
      kind: "fan",
      name: "Turntable",
      zoneId: "cs-main",
      productId: "smartspaces-fan",
      subsystem: "climate",
      pitch:
        "The hero platform turns, on the same keypad as the lights. A car presented from every angle without a salesperson walking a customer round it is the oldest trick in the trade, and the one thing in the room that moves.",
      speeds: 3,
      ratedWatts: 340,
    },
    {
      /**
       * Which car the adjustable heads are aimed at, modelled as an AV source.
       *
       * The requirement document asks to "allow the user to select different
       * vehicles and demonstrate individual lighting focus". There is no
       * selector kind in this engine, and adding one would mean a new device
       * type, a new control and a new panel for what is, in every way that
       * matters, a source list: one of N, chosen by name, with an on/off. An
       * `av` device already renders exactly that, so the beams retarget from a
       * control a presenter already knows how to use.
       */
      id: "cs-focus",
      kind: "av",
      name: "Vehicle Focus",
      zoneId: "cs-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Choose a car and the adjustable heads swing onto it, with the rest of the floor stepping back. This is the control a sales manager actually uses — the stock moves every week and the lighting has to follow it without anybody on a ladder.",
      sources: ["Hero SUV", "Silver Coupé", "Red Sports", "Dark Saloon", "White Saloon"],
      hasScreen: false,
      ratedWatts: 0,
      glow: [],
    },
    {
      id: "cs-screens",
      kind: "av",
      name: "Display Screens",
      zoneId: "cs-main",
      productId: "smartspaces-av",
      subsystem: "av",
      pitch:
        "The backlit graphic walls and the desk mark, on the room's own deck. They carry the campaign, and they are the one element a manufacturer changes four times a year without touching the building.",
      sources: ["Brand Film", "Model Range", "Launch Reel"],
      hasScreen: false,
      ratedWatts: 420,
      glow: [],
    },
    {
      id: "cs-music",
      kind: "av",
      name: "Music",
      zoneId: "cs-main",
      productId: "smartspaces-audio",
      subsystem: "av",
      pitch:
        "Distributed ceiling speakers across the floor and the lounge. A showroom with no sound in it is a car park, and the volume is part of the scene rather than a knob somebody forgot behind the desk.",
      sources: ["Showroom Ambient", "Launch Set", "Lounge"],
      hasScreen: false,
      ratedWatts: 260,
      glow: [],
    },
    {
      id: "cs-ac",
      kind: "climate",
      name: "Air Conditioning",
      zoneId: "cs-main",
      productId: "sensibo-airbend",
      subsystem: "climate",
      pitch:
        "Six cassettes on one setpoint, set back when the floor is empty. A glazed showroom in Mumbai is a greenhouse with stock in it, and cooling is the largest line on its bill by a distance.",
      minC: 16,
      maxC: 30,
      ratedWatts: 11800,
    },

    {
      id: "cs-occ",
      kind: "sensor",
      name: "Floor Occupancy",
      zoneId: "cs-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Presence across the display floor. A showroom is staffed eleven hours and busy for three of them, and the spotlights do not need to be at full for the other eight.",
      metric: "occupancy",
      unit: "",
      min: 0,
      max: 1,
    },
    {
      id: "cs-lux",
      kind: "sensor",
      name: "Ambient Light",
      zoneId: "cs-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Measured light on the display floor, which is what daylight response regulates against. A glazed frontage means the cars by the window and the cars at the back are never the same room.",
      metric: "lux",
      unit: "lx",
      derived: true,
    },
    {
      id: "cs-temp",
      kind: "sensor",
      name: "Floor Temperature",
      zoneId: "cs-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Air temperature on the display floor, which is what the cassettes regulate to and what a customer sitting in a car complains about first.",
      metric: "temperature",
      unit: "°C",
      derived: true,
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Scenes — the eight in the requirement document                    */
  /* ---------------------------------------------------------------- */

  scenes: [
    {
      /**
       * Staged, because opening a showroom is a sequence rather than a state.
       *
       * The floor comes up before the stock does, and the heads come up after
       * the floor. Running it as one press is also the honest demonstration of
       * what a control system is *for* — nobody walks a dealership switching
       * circuits in order every morning.
       */
      /**
       * Paced for a salesperson, not for a film.
       *
       * The three beats were authored at 1.8–2.0 s apiece, which with the
       * opening fade put this scene at 8.9 s end to end. The client wants a
       * press to read as instant, and nothing in this sequence drives a
       * motor — it is all light — so there is no physical reason for it to
       * take any longer than it takes to see. The staging survives; it just
       * happens at conversation speed.
       */
      id: "showroom-open",
      clockMin: 8 * 60 + 30,
      name: "Showroom Open",
      icon: "☀",
      blurb:
        "Three stages: the floor comes up neutral, then the architectural layers, then the spotlights onto the stock with the graphics and the music behind them. The morning routine as one button.",
      fadeMs: 1400,
      targets: {
        "cs-general": { on: true, level: 72, cct: 4600, sat: 0 },
        "cs-spots": { on: false, sat: 0 },
        "cs-product": { on: false, sat: 0 },
        "cs-linear": { on: true, level: 45, cct: 4200, sat: 0 },
        "cs-accent": { on: false, sat: 0 },
        "cs-floor": { on: false, sat: 0 },
        "cs-arch": { on: true, level: 35, cct: 3400, sat: 0 },
        "cs-rgb": { on: false, sat: 0 },
        "cs-turntable": { on: false, speed: 0 },
        "cs-focus": { on: true, source: "Hero SUV" },
        "cs-screens": { on: false },
        "cs-music": { on: false },
        "cs-ac": { on: true, setpointC: 24, mode: "cool", fan: 2 },
      },
      steps: [
        {
          label: "Architectural layers up",
          holdMs: 740,
          targets: {
            "cs-arch": { on: true, level: 72, cct: 3400, fadeMs: 760, sat: 0 },
            "cs-linear": { on: true, level: 75, cct: 4400, fadeMs: 760, sat: 0 },
            "cs-floor": { on: true, level: 55, cct: 3400, fadeMs: 760, sat: 0 },
          },
        },
        {
          label: "Spotlights onto the stock",
          holdMs: 740,
          targets: {
            "cs-spots": { on: true, level: 82, cct: 4200, fadeMs: 760, sat: 0 },
            "cs-product": { on: true, level: 88, cct: 4400, fadeMs: 760, sat: 0 },
          },
        },
        {
          label: "Graphics and music",
          holdMs: 740,
          targets: {
            "cs-accent": { on: true, level: 74, cct: 3400, fadeMs: 760, sat: 0 },
            "cs-screens": { on: true, source: "Brand Film", volume: 0 },
            "cs-music": { on: true, source: "Showroom Ambient", volume: 22 },
          },
        },
      ],
      highlight: ["proplus-downlight", "magneto-track"],
    },
    {
      /**
       * The signature demonstration, staged exactly as the document writes it:
       *
       *   general dim -> selected vehicle spotlights increase -> accent
       *   focuses on the vehicle -> surrounding lighting reduces -> colour
       *   temperature adjusts for optimum presentation
       *
       * Five beats, and the order matters: dropping the room first is what
       * makes the beam that follows read as an arrival rather than as one more
       * light coming on.
       */
      id: "vehicle-presentation",
      name: "Vehicle Presentation",
      icon: "◎",
      blurb:
        "The document's own sequence: the room dims, the selected car's spotlights come up, the accent narrows onto it, the surroundings step back, and the colour temperature settles where paint reads true.",
      fadeMs: 1400,
      targets: {
        "cs-general": { on: true, level: 60, cct: 4200, sat: 0 },
        "cs-spots": { on: true, level: 60, cct: 4000, sat: 0 },
        "cs-product": { on: true, level: 55, cct: 4000, sat: 0 },
        "cs-linear": { on: true, level: 60, cct: 4000, sat: 0 },
        "cs-accent": { on: true, level: 50, cct: 3400, sat: 0 },
        "cs-floor": { on: true, level: 50, cct: 3200, sat: 0 },
        "cs-arch": { on: true, level: 60, cct: 3200, sat: 0 },
        "cs-rgb": { on: false, sat: 0 },
        "cs-turntable": { on: true, speed: 1 },
        "cs-screens": { on: true, source: "Model Range", volume: 0 },
        "cs-ac": { on: true, setpointC: 23, mode: "cool", fan: 2 },
      },
      steps: [
        {
          label: "General lighting dims",
          holdMs: 740,
          targets: { "cs-general": { on: true, level: 22, cct: 3800, fadeMs: 760, sat: 0 } },
        },
        {
          label: "Spotlights on the selected vehicle",
          holdMs: 740,
          targets: {
            "cs-spots": { on: true, level: 100, cct: 4000, fadeMs: 760, sat: 0 },
            "cs-product": { on: true, level: 100, cct: 4200, fadeMs: 760, sat: 0 },
          },
        },
        {
          label: "Accent focuses on the vehicle",
          holdMs: 740,
          targets: {
            "cs-accent": { on: true, level: 90, cct: 3200, fadeMs: 760, sat: 0 },
            "cs-floor": { on: true, level: 95, cct: 3000, fadeMs: 760, sat: 0 },
          },
        },
        {
          label: "Surrounding lighting reduces",
          holdMs: 740,
          targets: {
            "cs-linear": { on: true, level: 22, cct: 3200, fadeMs: 760, sat: 0 },
            "cs-arch": { on: true, level: 30, cct: 2800, fadeMs: 760, sat: 0 },
          },
        },
        {
          label: "Colour temperature for optimum presentation",
          holdMs: 740,
          targets: {
            // 4000 K is where metallic paint reads closest to daylight without
            // going clinical, which is the number a manufacturer's merchandising
            // standard usually writes down.
            "cs-spots": { on: true, level: 100, cct: 4000, fadeMs: 760, sat: 0 },
            "cs-product": { on: true, level: 100, cct: 4000, fadeMs: 760, sat: 0 },
          },
        },
      ],
      highlight: ["magneto-track"],
    },
    {
      /**
       * Staged, and the one the sheet is really selling.
       *
       * A launch has a beat in it: the room goes down, the platform comes up
       * alone, it starts turning, colour arrives, the car's own lights come on
       * last. Fired as one state it is a dark room with a bright circle in it.
       */
      id: "new-car-launch",
      name: "New Car Launch",
      icon: "✦",
      blurb:
        "Four stages after the room drops away: a single beam finds the hero platform, the turntable starts, colour washes the walls and rings, and the car's own lights come on with the music.",
      fadeMs: 1400,
      targets: {
        "cs-general": { on: true, level: 8, cct: 3000, sat: 0 },
        "cs-spots": { on: true, level: 25, cct: 3600, sat: 0 },
        "cs-product": { on: false, sat: 0 },
        "cs-linear": { on: true, level: 15, cct: 2700, sat: 0 },
        "cs-accent": { on: true, level: 20, cct: 2700, sat: 0 },
        "cs-floor": { on: true, level: 25, cct: 2700, sat: 0 },
        "cs-arch": { on: true, level: 30, cct: 2400, sat: 0 },
        "cs-rgb": { on: false, sat: 0 },
        "cs-turntable": { on: false, speed: 0 },
        "cs-focus": { on: true, source: "Hero SUV" },
        "cs-screens": { on: true, source: "Launch Reel", volume: 0 },
        "cs-ac": { on: true, setpointC: 22, mode: "cool", fan: 3 },
      },
      steps: [
        {
          label: "A beam finds the platform",
          holdMs: 740,
          targets: {
            "cs-product": { on: true, level: 100, cct: 4200, fadeMs: 760, sat: 0 },
            "cs-floor": { on: true, level: 100, cct: 3000, fadeMs: 760, sat: 0 },
          },
        },
        { label: "The turntable starts", holdMs: 740, targets: { "cs-turntable": { on: true, speed: 2 } } },
        {
          label: "Colour across the walls",
          holdMs: 740,
          targets: {
            "cs-rgb": { on: true, level: 95, hue: 268, sat: 90, fadeMs: 760 },
            "cs-floor": { on: true, level: 100, hue: 268, sat: 70, fadeMs: 760 },
          },
        },
        {
          label: "Headlights and sound",
          holdMs: 740,
          targets: {
            "cs-spots": { on: true, level: 70, cct: 4000, fadeMs: 760, sat: 0 },
            "cs-music": { on: true, source: "Launch Set", volume: 72 },
          },
        },
      ],
      highlight: ["flexi-delta-rgb", "smartspaces-audio", "magneto-track"],
    },
    {
      id: "premium",
      clockMin: 18 * 60 + 45,
      name: "Premium / Luxury",
      icon: "◐",
      blurb:
        "Warm 3400 K with the room pulled right down and the heads pushed right up, so the cars stand in light and the floor falls away. The contrast a car is actually sold in.",
      fadeMs: 2800,
      targets: {
        // Low on purpose. The point of the scene is the ratio, not the level.
        "cs-general": { on: true, level: 30, cct: 3400, sat: 0 },
        "cs-spots": { on: true, level: 95, cct: 3800, sat: 0 },
        "cs-product": { on: true, level: 100, cct: 4000, sat: 0 },
        "cs-linear": { on: true, level: 58, cct: 3000, sat: 0 },
        "cs-accent": { on: true, level: 88, cct: 3000, sat: 0 },
        "cs-floor": { on: true, level: 78, cct: 2700, sat: 0 },
        "cs-arch": { on: true, level: 88, cct: 2700, sat: 0 },
        "cs-rgb": { on: true, level: 28, hue: 214, sat: 52 },
        "cs-turntable": { on: true, speed: 1 },
        "cs-screens": { on: true, source: "Brand Film", volume: 0 },
        "cs-music": { on: true, source: "Lounge", volume: 30 },
        "cs-ac": { on: true, setpointC: 23, mode: "cool", fan: 2 },
      },
      highlight: ["magneto-track", "connekt-profile"],
    },
    {
      id: "consultation",
      clockMin: 15 * 60,
      name: "Customer Consultation",
      icon: "◍",
      blurb:
        "The lounge leads: comfortable warm-neutral light where people sit and sign, the display floor stepped back so the room is quiet enough to talk in.",
      fadeMs: 2400,
      targets: {
        /**
         * The one scene the display floor does *not* lead.
         *
         * Paperwork wants an even 500 lux and no glare; a car under a narrow
         * beam four metres away is glare. So the heads come down and the
         * general layer comes up — the opposite of every other scene here, and
         * the reason a consultation preset is worth having at all.
         */
        "cs-general": { on: true, level: 76, cct: 3800, sat: 0 },
        "cs-spots": { on: true, level: 45, cct: 3600, sat: 0 },
        "cs-product": { on: true, level: 50, cct: 3800, sat: 0 },
        "cs-linear": { on: true, level: 55, cct: 3600, sat: 0 },
        "cs-accent": { on: true, level: 55, cct: 3200, sat: 0 },
        "cs-floor": { on: true, level: 35, cct: 3000, sat: 0 },
        "cs-arch": { on: true, level: 60, cct: 3000, sat: 0 },
        "cs-rgb": { on: false, sat: 0 },
        "cs-turntable": { on: false, speed: 0 },
        "cs-screens": { on: true, source: "Model Range", volume: 0 },
        "cs-music": { on: true, source: "Lounge", volume: 18 },
        "cs-ac": { on: true, setpointC: 23, mode: "cool", fan: 2 },
      },
      highlight: ["proplus-downlight", "smartspaces-audio"],
    },
    {
      id: "delivery",
      name: "Delivery",
      icon: "✧",
      blurb:
        "The handover: the customer's own car on the turntable under full high-CRI light, warm colour on the rings, everything else quiet. The photograph they will actually keep.",
      fadeMs: 2000,
      targets: {
        "cs-general": { on: true, level: 24, cct: 3200, sat: 0 },
        "cs-spots": { on: true, level: 92, cct: 4000, sat: 0 },
        "cs-product": { on: true, level: 100, cct: 4200, sat: 0 },
        "cs-linear": { on: true, level: 35, cct: 3000, sat: 0 },
        "cs-accent": { on: true, level: 70, cct: 3000, sat: 0 },
        "cs-floor": { on: true, level: 100, cct: 2600, sat: 0 },
        "cs-arch": { on: true, level: 70, cct: 2600, sat: 0 },
        "cs-rgb": { on: true, level: 55, hue: 36, sat: 60 },
        "cs-turntable": { on: true, speed: 1 },
        "cs-focus": { on: true, source: "Hero SUV" },
        "cs-screens": { on: true, source: "Brand Film", volume: 0 },
        "cs-music": { on: true, source: "Lounge", volume: 34 },
        "cs-ac": { on: true, setpointC: 23, mode: "cool", fan: 2 },
      },
      highlight: ["magneto-track", "flexi-delta-rgb"],
    },
    {
      id: "event",
      name: "Event",
      icon: "✳",
      blurb:
        "Colour takes the room: RGB across the feature wall, the linear lines and the platform rings, whites pulled right back, music up.",
      fadeMs: 1200,
      targets: {
        "cs-general": { on: true, level: 14, cct: 3000, sat: 0 },
        "cs-spots": { on: true, level: 55, cct: 3600, sat: 0 },
        "cs-product": { on: true, level: 60, cct: 4000, sat: 0 },
        "cs-linear": { on: true, level: 90, cct: 3000, hue: 288, sat: 85 },
        "cs-accent": { on: true, level: 40, cct: 2700, sat: 0 },
        "cs-floor": { on: true, level: 100, hue: 212, sat: 92 },
        "cs-arch": { on: true, level: 85, cct: 3000, hue: 276, sat: 80 },
        "cs-rgb": { on: true, level: 100, hue: 302, sat: 95 },
        "cs-turntable": { on: true, speed: 2 },
        "cs-screens": { on: true, source: "Launch Reel", volume: 0 },
        "cs-music": { on: true, source: "Launch Set", volume: 80 },
        "cs-ac": { on: true, setpointC: 21, mode: "cool", fan: 4 },
      },
      highlight: ["flexi-delta-rgb", "smartspaces-audio"],
    },
    {
      id: "closing",
      clockMin: 23 * 60,
      name: "Closing",
      icon: "☾",
      blurb:
        "Everything off bar security light at ten per cent, with the accents left on the cars in the window and the rings low. What the street sees at midnight, and what the night bill is.",
      fadeMs: 3600,
      targets: {
        "cs-general": { on: true, level: 10, cct: 3000, sat: 0 },
        // The window cars stay lit. A dark showroom at midnight is a wasted
        // frontage, and this is the circuit that keeps it working unstaffed.
        "cs-spots": { on: true, level: 45, cct: 3400, sat: 0 },
        "cs-product": { on: false, sat: 0 },
        "cs-linear": { on: true, level: 20, cct: 2700, sat: 0 },
        "cs-accent": { on: true, level: 55, cct: 2700, sat: 0 },
        "cs-floor": { on: true, level: 25, cct: 2400, sat: 0 },
        "cs-arch": { on: true, level: 40, cct: 2400, sat: 0 },
        "cs-rgb": { on: false, sat: 0 },
        "cs-turntable": { on: false, speed: 0 },
        "cs-screens": { on: false },
        "cs-music": { on: false },
        "cs-ac": { on: true, setpointC: 27, mode: "cool", fan: 1 },
      },
      highlight: ["magneto-track", "smartspaces-wired"],
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Automation                                                        */
  /* ---------------------------------------------------------------- */

  rules: [
    {
      id: "cs-occupancy",
      kind: "occupancy",
      name: "Floor Occupancy",
      explain:
        "The display spotlights and the product heads fall back when the floor has been empty for a quarter of an hour, and come straight back up when somebody walks in. The architectural and accent layers are untouched — a showroom that dims while a customer is standing in it is a fault, not a saving.",
      enabledByDefault: true,
      sensorId: "cs-occ",
      holdMin: 15,
      onOccupied: {
        "cs-spots": { on: true, level: 85, fadeMs: 900 },
        "cs-product": { on: true, level: 92, fadeMs: 900 },
      },
      onVacant: {
        "cs-spots": { on: true, level: 35, fadeMs: 3000 },
        "cs-product": { on: true, level: 30, fadeMs: 3000 },
      },
    },
    {
      id: "cs-daylight",
      kind: "daylight",
      name: "Daylight Harvesting",
      explain:
        "The general layer gives back what the glazed frontage is already supplying, regulated to 500 lux on the display floor. Spotlights, product heads and every feature circuit are excluded — none of them is there to make lux, and trimming them would undo the contrast the scene just set.",
      enabledByDefault: true,
      deviceIds: ["cs-general"],
      targetLux: 500,
      /**
       * A floor of thirty, like the workspace and for the same reason.
       *
       * With `minLevel` at zero the engine switches a fixture off entirely
       * once daylight meets the target, and a glazed showroom at noon is well
       * past it — so the hero shot would have no ceiling lighting in it at
       * all. Daylight-linked dimming is commissioned with a floor because
       * occupants dislike luminaires extinguishing over them.
       */
      minLevel: 30,
    },
    {
      id: "cs-circadian",
      kind: "circadian",
      name: "Circadian Tuning",
      /**
       * The widest curve in the project, and it should be.
       *
       * A showroom wants crisp daylight white over the stock through the
       * middle of the day — that is what makes paint read true — and warm
       * light in the evening, when the room is being sold rather than shopped.
       * 6000 K at noon down to 2900 K at closing is the sheet's own range.
       */
      explain:
        "The general layer follows the trading day — crisp daylight white over the stock through the middle of it, warm by closing, when the room stops being a shop and starts being a showroom.",
      enabledByDefault: true,
      deviceIds: ["cs-general"],
      curve: [
        { min: 0, cct: 2900 },
        { min: 420, cct: 4200 },
        { min: 600, cct: 5600 },
        { min: 780, cct: 6000 },
        { min: 1020, cct: 4400 },
        { min: 1140, cct: 3400 },
        { min: 1320, cct: 2900 },
      ],
    },
  ],

  defaults: {
    "cs-occ": { value: 1 },
    "cs-lux": { value: 0 },
    "cs-temp": { value: 31 },
    "cs-ac": { currentC: 31, setpointC: 23 },
  },

  /**
   * Opens on Evening, where the office rooms open in working hours.
   *
   * A dealership is sold on the hour a customer actually comes in to decide,
   * which is after work — and Evening is the scene where the lighting is doing
   * the most visible work, with the room pulled down and the cars standing in
   * light. It is also the hour the sheet's own hero image is lit for.
   */
  /**
   * Open on the neutral morning scene, not on Premium.
   *
   * Premium is 2700–3400 K with the room pulled right down — it is the most
   * flattering scene in the file and the worst possible first frame, because
   * with nothing to compare it against a warm low-key room just reads as an
   * orange one. Showroom Open is also the scene the client's own reference
   * photograph shows, which is what anyone looking at this will compare it
   * to, and it stages itself over three beats as it comes up.
   */
  openingSceneId: "showroom-open",
  openingClockMin: 18 * 60 + 45,

  // Mumbai.
  environment: {
    sunriseMin: 6 * 60 + 20,
    sunsetMin: 18 * 60 + 55,
    outdoorPeakLux: 95000,
    /**
     * A glazed frontage on one side of a twenty-metre-deep plate.
     *
     * Higher than the office floor's 0.001 because a showroom's whole front
     * elevation is glass, and lower than a daylit office's 0.02 because the
     * display floor runs a long way back from it and the mezzanine shades the
     * rear quarter entirely.
     */
    windowFactor: 0.006,
    /**
     * 500 lux, which is a retail figure rather than an office one.
     *
     * An open-plan floor is designed to 400 because people read at desks. A
     * showroom is designed higher — the task here is judging the finish on a
     * car, and the merchandising standard most manufacturers write into a
     * franchise agreement sits between 500 and 750 on the display floor.
     */
    designLux: 500,
    outdoorMinC: 26,
    outdoorMaxC: 34,
  },

  baseline: {
    /**
     * Metal-halide, which is what this is actually replacing.
     *
     * A showroom of this vintage runs 150 W metal-halide downlights and 70 W
     * halide spots on contactors, with no dimming at all — the floor is either
     * on or off. The saving is not clever control to begin with; it is that
     * the room stops drawing 32 kW to do what 6 kW now does, and then control
     * takes another third off that.
     */
    lightingWatts: 32400,
    hvacWatts: 14200,
    operatingHours: { startMin: 6 * 60 + 30, endMin: 23 * 60 },
    hvacHours: { startMin: 8 * 60, endMin: 22 * 60 },
    note:
      "150 W metal-halide downlights and 70 W halide display spots on contactors with no dimming, plus packaged cooling for a fully glazed frontage — a 2010-vintage dealership.",
  },

  tariffPerKwh: 11.5,
  currency: "₹",
};
