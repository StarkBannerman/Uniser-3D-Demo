import type { Space } from "@/lib/sim/types";

/**
 * A luxury car showroom, built to the client's sheet.
 *
 * The client calls this the most important environment in the set, and the
 * reason is narrower than "it looks good": in a showroom the lighting is
 * part of the product. A metallic flank only shows its shape under a source
 * with a hard enough edge to draw a highlight down it, and a paint finish
 * only shows its colour under something with the spectrum to render it. Get
 * either wrong and the car in the room looks worse than the car in the
 * brochure, which is the one outcome a showroom cannot afford.
 *
 * That is why the sheet separates "general showroom lighting" from
 * "high-CRI product lighting" from "adjustable spotlights", and why those
 * are three circuits here rather than one. The first is so people can walk
 * around; the second is so the paint is honest; the third is so a particular
 * car can be made the subject.
 *
 * Ten lighting types on the sheet become fifteen circuits, because the
 * adjustable spotlights are split per vehicle — see `selection`.
 */

/** 900 m² of showroom floor, double height over the turntable. */
const AREA = 900;

/** Every tunable circuit opens here, which is the sheet's figure. */
const DEFAULT_CCT = 4000;

export const showroom: Space = {
  id: "showroom",
  name: "Car Showroom",
  segment: "hospitality",
  category: "Commercial",
  blurb:
    "A 900 m² luxury car showroom, path-traced offline and relit live — ten lighting types across the display floor, a turntable, a brand wall and a mezzanine, with the adjustable spotlights split per vehicle so any of the six cars can be made the subject of the room.",
  renderer: "plates",
  plates: { dir: "/plates/showroom", profile: "showroom" },

  keypad: {
    layout: "grid",
    finish: "graphite",
    scenes: ["open", "presentation", "launch", "closing"],
  },

  zones: [{ id: "sr-main", name: "Showroom Floor", areaM2: AREA }],

  /* ---------------------------------------------------------------- */
  /* The client's six vehicles                                         */
  /* ---------------------------------------------------------------- */

  /**
   * The sheet's "additional feature", made into a first-class idea.
   *
   * "Allow the user to select different vehicles and demonstrate individual
   * lighting focus." So each car has its own four-spot circuit, the scenes
   * aim at `@selected` and `@others` rather than at a car by name, and
   * Vehicle Presentation works on whichever one the presenter last touched.
   *
   * The turntable car is the exception worth knowing about. Its own four
   * spots barely register in the plates; what actually lights that car is
   * the ring of high-CRI product spots above it, so `sr-spot` is attached to
   * it as a companion and follows it in and out of selection.
   */
  selection: {
    label: "Vehicles",
    defaultDeviceId: "sr-zone-3",
    options: [
      { deviceId: "sr-zone-1", name: "Silver coupe" },
      { deviceId: "sr-zone-2", name: "Graphite saloon" },
      { deviceId: "sr-zone-3", name: "Green SUV", alsoDeviceIds: ["sr-spot"] },
      { deviceId: "sr-zone-4", name: "Red coupe" },
      { deviceId: "sr-zone-5", name: "White saloon" },
      { deviceId: "sr-zone-6", name: "Graphite saloon, side-on" },
    ],
  },

  /* ---------------------------------------------------------------- */
  /* Devices — the sheet's ten types                                   */
  /* ---------------------------------------------------------------- */

  devices: [
    {
      id: "sr-general",
      kind: "light",
      name: "General Showroom",
      zoneId: "sr-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "Sixty-four recessed heads across the floor, tunable 3000 K to 5000 K. The layer that lets people walk around and read a price card, and the first one every other scene takes away — a showroom lit evenly everywhere has no subject, which is why Open is the only scene that runs it high.",
      dimmable: true,
      tunable: { minK: 3000, maxK: 5000 },
      fixtures: 64,
      wattsEach: 20,
      lumensEach: 2400,
      baselineWattsEach: 70,
      glow: [],
    },
    {
      id: "sr-spot",
      kind: "light",
      name: "Product Spots",
      zoneId: "sr-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Twelve high-CRI heads ringing the turntable, tunable 3000 K to 5000 K. The only circuit in the room specified on colour rendering rather than output: a 95-plus source is the difference between a metallic grey that reads as silver and one that reads as primer, and nobody buys primer.",
      dimmable: true,
      tunable: { minK: 3000, maxK: 5000 },
      fixtures: 12,
      wattsEach: 20,
      lumensEach: 2200,
      glow: [],
    },

    /* The adjustable spotlights, one circuit per car. */
    {
      id: "sr-zone-1",
      kind: "light",
      name: "Silver coupe spotlights",
      zoneId: "sr-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Four adjustable heads aimed at the hero car inside the door. The first thing anyone sees, and the one position in the room where the lighting has to do its work before the customer has decided whether to come further in.",
      dimmable: true,
      tunable: { minK: 3000, maxK: 5000 },
      fixtures: 4,
      wattsEach: 16,
      lumensEach: 1800,
      glow: [],
    },
    {
      id: "sr-zone-2",
      kind: "light",
      name: "Graphite saloon spotlights",
      zoneId: "sr-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Four heads on the car behind the hero. A dark paint finish needs more light than a pale one to show the same shape, which is the argument for aiming per vehicle rather than lighting the floor and hoping.",
      dimmable: true,
      tunable: { minK: 3000, maxK: 5000 },
      fixtures: 4,
      wattsEach: 16,
      lumensEach: 1800,
      glow: [],
    },
    {
      id: "sr-zone-3",
      kind: "light",
      name: "Green SUV spotlights",
      zoneId: "sr-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Four heads on the turntable car, backed by the product ring above it. The turntable is where the launch car goes, so this is the position the room is designed around.",
      dimmable: true,
      tunable: { minK: 3000, maxK: 5000 },
      fixtures: 4,
      wattsEach: 16,
      lumensEach: 1800,
      glow: [],
    },
    {
      id: "sr-zone-4",
      kind: "light",
      name: "Red coupe spotlights",
      zoneId: "sr-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Four heads on the car right of the platform. Saturated paint is the hardest thing in the room to light honestly — too cool and it goes pink, too warm and it goes brown — which is why this circuit is tunable and not fixed.",
      dimmable: true,
      tunable: { minK: 3000, maxK: 5000 },
      fixtures: 4,
      wattsEach: 16,
      lumensEach: 1800,
      glow: [],
    },
    {
      id: "sr-zone-5",
      kind: "light",
      name: "White saloon spotlights",
      zoneId: "sr-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Four heads under the mezzanine. A low soffit is the one place in a showroom where a car can be in shadow without anyone noticing it has happened, so these exist to stop the back of the room reading as storage.",
      dimmable: true,
      tunable: { minK: 3000, maxK: 5000 },
      fixtures: 4,
      wattsEach: 16,
      lumensEach: 1800,
      glow: [],
    },
    {
      id: "sr-zone-6",
      kind: "light",
      name: "Side-on saloon spotlights",
      zoneId: "sr-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Four heads on the furthest car, parked side-on to the door. The only vehicle shown in profile, which is the view that sells a silhouette, and it needs grazing light down the flank rather than the three-quarter wash the others get.",
      dimmable: true,
      tunable: { minK: 3000, maxK: 5000 },
      fixtures: 4,
      wattsEach: 16,
      lumensEach: 1800,
      glow: [],
    },

    {
      id: "sr-track",
      kind: "light",
      name: "Track",
      zoneId: "sr-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Twenty-eight heads on two rails, lighting the brand walls and the walkways between the stands. Everything a customer reads rather than looks at, which is why it comes down in every scene that wants them looking at a car instead.",
      dimmable: true,
      tunable: { minK: 3000, maxK: 5000 },
      fixtures: 28,
      wattsEach: 14,
      lumensEach: 1500,
      glow: [],
    },
    {
      id: "sr-linear",
      kind: "light",
      name: "Linear",
      zoneId: "sr-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Eighty-six metres of run in the slat ceiling. It reads as architecture rather than as lighting, and its real job is to give the ceiling a direction — a showroom with a flat lit lid feels like a warehouse with cars in it.",
      dimmable: true,
      fixtures: 86, // metres of run
      wattsEach: 8,
      lumensEach: 900,
      glow: [],
    },
    {
      id: "sr-accent",
      kind: "light",
      name: "Accent",
      zoneId: "sr-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Back-lit posters, the wall reveals and the Experience panel. The circuit that carries the brand when the cars are dark, which is the whole of what the window shows after closing.",
      dimmable: true,
      fixtures: 18,
      wattsEach: 7,
      lumensEach: 800,
      glow: [],
    },
    {
      id: "sr-floor",
      kind: "light",
      name: "Floor",
      zoneId: "sr-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "The turntable ring and the gallery shelf, lighting upward off a polished floor. Uplight under a car is what separates it from the ground it is standing on, and it is the cheapest drama in the building.",
      dimmable: true,
      fixtures: 34, // metres of run
      wattsEach: 4,
      lumensEach: 450,
      glow: [],
    },
    {
      id: "sr-arch",
      kind: "light",
      name: "Architectural",
      zoneId: "sr-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "The raft edge, the turntable ring edge, the pillar slots, the mezzanine edge and the reception desk. A hundred and twenty metres of line that nobody is meant to notice and everybody would miss — switch it off and the room loses its edges before it loses any light.",
      dimmable: true,
      fixtures: 120, // metres of run
      wattsEach: 5,
      lumensEach: 600,
      glow: [],
    },
    {
      id: "sr-tunable",
      kind: "light",
      name: "Tunable White",
      zoneId: "sr-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Twenty-four washers on the pillars and the side walls, 2700 K to 6500 K across the full range. The layer that decides whether the room feels like a laboratory or a lounge, without changing a single level.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 6500 },
      fixtures: 24,
      wattsEach: 15,
      lumensEach: 1600,
      glow: [],
    },
    {
      id: "sr-rgb",
      kind: "light",
      name: "RGB Feature",
      zoneId: "sr-main",
      productId: "flexi-delta-rgb",
      subsystem: "lighting",
      pitch:
        "Colour behind the feature-wall fins and up out of the planters, off for ordinary trading. This is the circuit a launch is bought for: the same floor can be brand blue on Thursday evening and back to neutral white by Friday morning with nothing rebuilt.",
      dimmable: true,
      tunable: { minK: 2200, maxK: 6500 },
      rgb: true,
      fixtures: 30,
      wattsEach: 9,
      lumensEach: 500,
      glow: [],
    },

    {
      id: "sr-ac",
      kind: "climate",
      name: "Air Conditioning",
      zoneId: "sr-main",
      productId: "sensibo-airbend",
      subsystem: "climate",
      pitch:
        "Eight concealed fan-coils on one setpoint. A double-height glazed box with a polished floor swings hard between an empty Tuesday and a launch night with two hundred people in it, and a timeclock cannot tell those apart.",
      minC: 16,
      maxC: 30,
      ratedWatts: 11400,
    },
    {
      id: "sr-music",
      kind: "av",
      name: "Music",
      zoneId: "sr-main",
      productId: "smartspaces-audio",
      subsystem: "av",
      pitch:
        "Distributed ceiling speakers, carried on the same scenes as the light. A showroom is quiet enough that the music is the first thing a customer notices and the last thing anyone remembers to change.",
      sources: ["Showroom", "Ambient", "Launch Set", "Lounge"],
      hasScreen: false,
      ratedWatts: 420,
      glow: [],
    },

    {
      id: "sr-occ",
      kind: "sensor",
      name: "Floor Occupancy",
      zoneId: "sr-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Presence across the display floor. A showroom is empty for most of its opening hours and lit as though it is not, which is where the running cost of a building like this actually goes.",
      metric: "occupancy",
      unit: "",
      min: 0,
      max: 1,
    },
    {
      id: "sr-lux",
      kind: "sensor",
      name: "Ambient Light",
      zoneId: "sr-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Measured light at the hero stand, which is what the daylight response regulates against.",
      metric: "lux",
      unit: "lx",
      derived: true,
    },
    {
      id: "sr-temp",
      kind: "sensor",
      name: "Floor Temperature",
      zoneId: "sr-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Air temperature on the display floor, which is what the fan-coils regulate to.",
      metric: "temperature",
      unit: "°C",
      derived: true,
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Scenes — the client's eight                                       */
  /* ---------------------------------------------------------------- */

  scenes: [
    {
      id: "open",
      clockMin: 9 * 60,
      name: "Showroom Open",
      icon: "☀",
      blurb:
        "Trading hours. Bright, even and cool enough to read paint honestly — the only scene in the room with no subject, because at nine in the morning you do not yet know which car the person walking in came to see.",
      fadeMs: 1800,
      targets: {
        "sr-general": { on: true, level: 85, cct: 4500, sat: 0 },
        "sr-spot": { on: true, level: 70, cct: 4500, sat: 0 },
        "@selected": { on: true, level: 70, cct: 4500, sat: 0 },
        "@others": { on: true, level: 70, cct: 4500, sat: 0 },
        "sr-track": { on: true, level: 70, cct: 4500, sat: 0 },
        "sr-linear": { on: true, level: 60 },
        "sr-tunable": { on: true, level: 70, cct: 4500, sat: 0 },
        "sr-accent": { on: true, level: 60 },
        "sr-floor": { on: true, level: 40 },
        "sr-arch": { on: true, level: 60 },
        "sr-rgb": { on: false },
        "sr-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
        "sr-music": { on: true, source: "Showroom", volume: 20 },
      },
      highlight: ["proplus-downlight", "magneto-track"],
    },
    {
      id: "presentation",
      clockMin: 11 * 60,
      name: "Vehicle Presentation",
      icon: "◎",
      blurb:
        "The sheet's own demonstration, run as one button: general lighting dims, the selected car's spotlights come up, accent light focuses on it, everything around it steps back, and the colour temperature moves to 5000 K for the paint. Five stages, about four seconds, on whichever vehicle is selected.",
      fadeMs: 800,
      /**
       * Stage zero sets only what the narration does not.
       *
       * This is the trap in a staged scene and it is silent: `targets` is
       * applied before the first step, so anything named here that a step
       * also names has already arrived by the time that step runs. The
       * sequence runner skips a step that commands nothing new, so writing
       * the demonstration's end state here made all five steps no-ops — the
       * room cut straight to the answer and not one caption appeared.
       *
       * So the five circuits the beats talk about are deliberately absent,
       * and what is left is the housekeeping: the architectural line settles
       * to 40, the colour goes off, and the plant carries on.
       */
      targets: {
        "sr-arch": { on: true, level: 40 },
        "sr-rgb": { on: false },
        "sr-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
        "sr-music": { on: true, source: "Showroom", volume: 20 },
      },
      /**
       * The five beats, in the sheet's order and its words.
       *
       * Authored at 1800 ms a beat, which `PACE` plays at about 0.44 and
       * lands near the four seconds the brief asks for. The last beat is the
       * one that matters most and is easiest to miss: moving the selected
       * car's spots to 5000 K while everything else stays at 4500 K is what
       * makes the paint on that one vehicle look different from the paint on
       * the five around it.
       */
      steps: [
        {
          label: "Dimming general lighting",
          holdMs: 1800,
          targets: {
            "sr-general": { on: true, level: 20, fadeMs: 800, sat: 0 },
            "sr-linear": { on: true, level: 25, fadeMs: 800 },
          },
        },
        {
          label: "Focusing on {selection}",
          holdMs: 1800,
          targets: {
            "@selected": { on: true, level: 100, fadeMs: 800, sat: 0 },
          },
        },
        {
          label: "Accent lighting follows the vehicle",
          holdMs: 1800,
          targets: {
            "sr-floor": { on: true, level: 70, fadeMs: 800 },
            "sr-accent": { on: true, level: 30, fadeMs: 800 },
            "sr-track": { on: true, level: 30, fadeMs: 800, sat: 0 },
          },
        },
        {
          label: "Surrounding lighting reduces",
          holdMs: 1800,
          targets: {
            "@others": { on: true, level: 25, fadeMs: 800, sat: 0 },
            "sr-tunable": { on: true, level: 30, fadeMs: 800, sat: 0 },
          },
        },
        {
          label: "Colour temperature set for the paint",
          holdMs: 1600,
          targets: {
            "@selected": { on: true, level: 100, cct: 5000, fadeMs: 1000, sat: 0 },
          },
        },
      ],
      highlight: ["magneto-track", "connekt-profile"],
    },
    {
      id: "launch",
      clockMin: 19 * 60,
      name: "New Car Launch",
      icon: "✦",
      blurb:
        "Evening, with the turntable car as the only subject in the building. Ambient almost out, the product ring at full, accent and floor lighting high, and the feature wall running brand colour that drifts from blue to magenta across the evening.",
      fadeMs: 2200,
      targets: {
        "sr-general": { on: true, level: 25, cct: 4500, sat: 0 },
        "sr-spot": { on: true, level: 100, cct: 4500, sat: 0 },
        "@selected": { on: true, level: 40, cct: 4500, sat: 0 },
        "@others": { on: true, level: 40, cct: 4500, sat: 0 },
        // The launch car is the turntable car whatever is selected, so this
        // is named outright and wins over the group token above.
        "sr-zone-3": { on: true, level: 100, cct: 4500, sat: 0 },
        "sr-track": { on: true, level: 60, cct: 4500, sat: 0 },
        "sr-linear": { on: true, level: 40 },
        "sr-tunable": { on: true, level: 30, cct: 4500, sat: 0 },
        "sr-accent": { on: true, level: 90 },
        "sr-floor": { on: true, level: 90 },
        "sr-arch": { on: true, level: 60 },
        "sr-rgb": { on: true, level: 100, cct: 4000, hue: 220, sat: 100 },
        "sr-ac": { on: true, setpointC: 21, mode: "cool", fan: 3 },
        "sr-music": { on: true, source: "Launch Set", volume: 42 },
      },
      drift: { deviceId: "sr-rgb", fromHue: 220, toHue: 320, periodMs: 30000 },
      highlight: ["flexi-delta-rgb", "magneto-track"],
    },
    {
      id: "premium",
      clockMin: 15 * 60,
      name: "Premium / Luxury",
      icon: "◈",
      blurb:
        "The room sold as a lounge rather than a shop. Warm, low and architectural, with the edges doing most of the work and a trace of amber on the feature wall — this is the setting for the customer who is not going to be hurried.",
      fadeMs: 2400,
      targets: {
        "sr-general": { on: true, level: 30, cct: 3000, sat: 0 },
        "sr-spot": { on: true, level: 70, cct: 3000, sat: 0 },
        "@selected": { on: true, level: 60, cct: 3000, sat: 0 },
        "@others": { on: true, level: 60, cct: 3000, sat: 0 },
        "sr-track": { on: true, level: 40, cct: 3000, sat: 0 },
        "sr-linear": { on: true, level: 30 },
        "sr-tunable": { on: true, level: 50, cct: 3000, sat: 0 },
        "sr-accent": { on: true, level: 70 },
        "sr-floor": { on: true, level: 50 },
        "sr-arch": { on: true, level: 80 },
        "sr-rgb": { on: true, level: 15, cct: 2600, hue: 35, sat: 55 },
        "sr-ac": { on: true, setpointC: 22, mode: "cool", fan: 1 },
        "sr-music": { on: true, source: "Lounge", volume: 24 },
      },
      highlight: ["connekt-profile", "flexi-delta-rgb"],
    },
    {
      id: "consultation",
      clockMin: 14 * 60,
      name: "Customer Consultation",
      icon: "☕",
      blurb:
        "Someone is sitting down with a specification sheet. The lounge and the desk come up warm and the cars stay visible behind them, because a customer talking about a car should still be able to see it over the salesperson's shoulder.",
      fadeMs: 2000,
      targets: {
        "sr-general": { on: true, level: 55, cct: 3500, sat: 0 },
        "sr-spot": { on: true, level: 40, cct: 3500, sat: 0 },
        "@selected": { on: true, level: 40, cct: 3500, sat: 0 },
        "@others": { on: true, level: 40, cct: 3500, sat: 0 },
        "sr-track": { on: true, level: 40, cct: 3500, sat: 0 },
        "sr-linear": { on: true, level: 40 },
        "sr-tunable": { on: true, level: 70, cct: 3500, sat: 0 },
        "sr-accent": { on: true, level: 50 },
        "sr-floor": { on: true, level: 30 },
        "sr-arch": { on: true, level: 60 },
        "sr-rgb": { on: false },
        "sr-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
        "sr-music": { on: true, source: "Ambient", volume: 18 },
      },
      highlight: ["connekt-profile", "proplus-downlight"],
    },
    {
      id: "delivery",
      clockMin: 12 * 60,
      name: "Delivery",
      icon: "🔑",
      blurb:
        "A handover. The selected car is the brightest thing in the building and everything else steps back a little, with a soft brand wash behind it — this is the scene that ends up in the customer's photographs.",
      fadeMs: 2000,
      targets: {
        "sr-general": { on: true, level: 50, cct: 4000, sat: 0 },
        "sr-spot": { on: true, level: 60, cct: 4000, sat: 0 },
        "@selected": { on: true, level: 100, cct: 4000, sat: 0 },
        "@others": { on: true, level: 35, cct: 4000, sat: 0 },
        "sr-track": { on: true, level: 40, cct: 4000, sat: 0 },
        "sr-linear": { on: true, level: 40 },
        "sr-tunable": { on: true, level: 50, cct: 4000, sat: 0 },
        "sr-accent": { on: true, level: 60 },
        "sr-floor": { on: true, level: 60 },
        "sr-arch": { on: true, level: 60 },
        "sr-rgb": { on: true, level: 30, cct: 4000, hue: 215, sat: 45 },
        "sr-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
        "sr-music": { on: true, source: "Ambient", volume: 26 },
      },
      highlight: ["magneto-track", "flexi-delta-rgb"],
    },
    {
      id: "event",
      clockMin: 20 * 60,
      name: "Event",
      icon: "✸",
      blurb:
        "A booked floor with people standing and circulating rather than looking at one car. Accent and floor lighting high, the ceiling doing visible work, and the feature wall cycling slowly through the brand range.",
      fadeMs: 1800,
      targets: {
        "sr-general": { on: true, level: 35, cct: 4000, sat: 0 },
        "sr-spot": { on: true, level: 70, cct: 4000, sat: 0 },
        "@selected": { on: true, level: 70, cct: 4000, sat: 0 },
        "@others": { on: true, level: 70, cct: 4000, sat: 0 },
        "sr-track": { on: true, level: 70, cct: 4000, sat: 0 },
        "sr-linear": { on: true, level: 70 },
        "sr-tunable": { on: true, level: 40, cct: 4000, sat: 0 },
        "sr-accent": { on: true, level: 90 },
        "sr-floor": { on: true, level: 80 },
        "sr-arch": { on: true, level: 70 },
        "sr-rgb": { on: true, level: 100, cct: 4000, hue: 200, sat: 100 },
        "sr-ac": { on: true, setpointC: 21, mode: "cool", fan: 4 },
        "sr-music": { on: true, source: "Launch Set", volume: 52 },
      },
      drift: { deviceId: "sr-rgb", fromHue: 200, toHue: 340, periodMs: 40000 },
      highlight: ["flexi-delta-rgb", "smartspaces-audio"],
    },
    {
      id: "closing",
      clockMin: 23 * 60,
      name: "Closing",
      icon: "☾",
      blurb:
        "Shut, but still selling. General lighting off entirely and only the window display left running — a showroom's quietest hours are also the ones with the most people walking past it.",
      fadeMs: 2600,
      targets: {
        "sr-general": { on: false },
        "sr-spot": { on: true, level: 30, cct: 4000, sat: 0 },
        "@selected": { on: true, level: 20, cct: 4000, sat: 0 },
        "@others": { on: true, level: 20, cct: 4000, sat: 0 },
        "sr-track": { on: false },
        "sr-linear": { on: false },
        "sr-tunable": { on: false },
        "sr-accent": { on: true, level: 50 },
        "sr-floor": { on: true, level: 30 },
        "sr-arch": { on: true, level: 30 },
        "sr-rgb": { on: false },
        "sr-ac": { on: true, setpointC: 26, mode: "cool", fan: 1 },
        "sr-music": { on: false },
      },
      highlight: ["connekt-profile"],
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Automation                                                        */
  /* ---------------------------------------------------------------- */

  rules: [
    {
      id: "sr-occupancy",
      kind: "occupancy",
      name: "Empty Floor",
      explain:
        "The floor falls back when nobody has been on it for twenty minutes and comes straight back when they are. The product spots and the accent layers are untouched: a customer walking in to a showroom that is visibly waking up has already been told something about the business.",
      enabledByDefault: true,
      sensorId: "sr-occ",
      holdMin: 20,
      onOccupied: {
        "sr-general": { on: true, level: 85, fadeMs: 1400, sat: 0 },
        "sr-track": { on: true, level: 70, fadeMs: 1600, sat: 0 },
      },
      onVacant: {
        "sr-general": { on: true, level: 30, fadeMs: 3200, sat: 0 },
        "sr-track": { on: true, level: 25, fadeMs: 3400, sat: 0 },
      },
    },
    {
      id: "sr-circadian",
      kind: "circadian",
      name: "Circadian Tuning",
      explain:
        "The general and track layers follow the hour, cool through trading and warmer into the evening. The product spots and the vehicle spotlights are excluded on purpose: their colour temperature is a decision about paint, not about the time of day, and a car that changes colour between morning and afternoon is a complaint waiting to happen.",
      enabledByDefault: true,
      deviceIds: ["sr-general", "sr-track"],
      curve: [
        { min: 0, cct: 3500 },
        { min: 480, cct: 4500 },
        { min: 720, cct: 4800 },
        { min: 1020, cct: 4200 },
        { min: 1200, cct: 3600 },
        { min: 1380, cct: 3400 },
      ],
    },
  ],

  /* ---------------------------------------------------------------- */

  defaults: {
    "sr-general": { on: true, level: 85, cct: DEFAULT_CCT, sat: 0 },
    "sr-spot": { on: true, level: 70, cct: DEFAULT_CCT, sat: 0 },
    "sr-zone-1": { on: true, level: 70, cct: DEFAULT_CCT, sat: 0 },
    "sr-zone-2": { on: true, level: 70, cct: DEFAULT_CCT, sat: 0 },
    "sr-zone-3": { on: true, level: 70, cct: DEFAULT_CCT, sat: 0 },
    "sr-zone-4": { on: true, level: 70, cct: DEFAULT_CCT, sat: 0 },
    "sr-zone-5": { on: true, level: 70, cct: DEFAULT_CCT, sat: 0 },
    "sr-zone-6": { on: true, level: 70, cct: DEFAULT_CCT, sat: 0 },
    "sr-track": { on: true, level: 70, cct: DEFAULT_CCT, sat: 0 },
    "sr-linear": { on: true, level: 60 },
    "sr-accent": { on: true, level: 60 },
    "sr-floor": { on: true, level: 40 },
    "sr-arch": { on: true, level: 60 },
    "sr-tunable": { on: true, level: 70, cct: DEFAULT_CCT, sat: 0 },
    "sr-rgb": { on: false, level: 0, cct: DEFAULT_CCT, hue: 220, sat: 100 },
    "sr-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
    "sr-music": { on: true, source: "Showroom", volume: 20 },
  },

  openingSceneId: "open",
  openingClockMin: 9 * 60 + 30,

  environment: {
    sunriseMin: 6 * 60 + 20,
    sunsetMin: 18 * 60 + 55,
    outdoorPeakLux: 95000,
    /**
     * Low, and the plates are the reason.
     *
     * The showroom's render has no glazing layer at all — the camera faces
     * into the room and the frontage is behind it — so no amount of daylight
     * can reach the picture. Leaving the façade factor where a real glazed
     * showroom would put it would have the lux sensor and the energy figures
     * describing a daylit room that the stage cannot show, which is worse
     * than having no daylight response at all.
     */
    windowFactor: 0.0004,
    designLux: 500,
    outdoorMinC: 26,
    outdoorMaxC: 34,
  },

  baseline: {
    /**
     * Metal halide, which is what a showroom of this vintage runs.
     *
     * Showrooms held on to discharge longer than almost any other commercial
     * space, because early LED could not render a metallic paint finish and
     * a car that looks wrong under the lights does not sell. The saving here
     * starts as a wattage swap and only then becomes a control argument.
     */
    lightingWatts: 24800,
    hvacWatts: 13800,
    operatingHours: { startMin: 8 * 60, endMin: 20 * 60 },
    hvacHours: { startMin: 7 * 60 + 30, endMin: 20 * 60 + 30 },
    note:
      "70 W metal-halide downlights and track throughout, display spots on the same uncontrolled circuit as the general lighting, and fan-coils with no setback outside trading — a showroom fitted out around 2013.",
  },

  tariffPerKwh: 11.5,
  currency: "₹",
};
