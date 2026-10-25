import type { Space } from "@/lib/sim/types";

/**
 * The family living room, and the second residential space on the plates
 * path.
 *
 * The bedroom is sold on one button at the end of the day. A living room
 * is the opposite: it is one space that has to be four rooms between six
 * in the evening and midnight — somewhere to arrive, somewhere to sit,
 * somewhere to have eight people over, and a cinema. Nothing is added or
 * removed between those; only the light changes. So the circuits here are
 * split by what each one is *for* rather than by where it is, and the six
 * scenes are the four rooms plus the two states a living room is actually
 * left in.
 *
 * The one colour circuit is deliberately the only one, for the reason the
 * cabin gives: colour behind the shelves and under the TV wall is a mood,
 * and colour in the cove is a nightclub.
 */

/** 38 m² of living and dining, behind one glazed wall onto the balcony. */
const AREA = 38;

export const living: Space = {
  id: "living",
  name: "Living Room",
  segment: "residential",
  category: "Residence",
  blurb:
    "A 38 m² living and dining room behind a full-height glazed wall — path-traced offline and relit live. Six circuits including one RGB run, drapes that draw in from both sides, a ceiling fan, and the TV wall going to movie mode on one press.",
  renderer: "plates",
  plates: {
    dir: "/plates/living",
    profile: "living",
    /**
     * The drapes, which draw rather than dissolve.
     *
     * Unlike the bedroom this set ships its opening — `curtain_rect` in
     * `hotspots.json`, `[0.6526, 0, 1, 1]`, the full height of the right
     * of the frame. Measured against it, 98% of the pixels the two view
     * plates light fall inside that rectangle, so it is read rather than
     * re-derived: a quad from the rect's four corners, in the order the
     * homography wants.
     *
     * The panels meet in the middle because these ones do, and the edge
     * is feathered twelve pixels because a drape edge is cloth.
     */
    curtain: {
      closedDir: "/plates/living_closed",
      deviceId: "lv-curtain",
      window: {
        quad: [
          [0.6526, 1],
          [1, 1],
          [1, 0],
          [0.6526, 0],
        ],
        pad: 0.015,
        travel: "split",
        split: [0.5, 0.5],
        softPx: 12,
      },
    },
    /** The fan, composited inside its own rectangle. See the bedroom. */
    overlay: {
      dir: "/plates/living_fan",
      deviceId: "lv-fan",
      rect: "fan_rect",
    },
    /**
     * The three things no plate was rendered for: the television's own
     * picture, the spill it throws onto the floor and the coffee table,
     * and the air out of the cassette.
     *
     * `screen` rather than the bedroom's `tv` because this set projected
     * a `tv_rect` and that one did not. A rectangle is the difference
     * between a glow near the television and a picture inside it.
     */
    cues: ["screen", "airflow"],
    hotspotAliases: {
      curtains: { deviceId: "lv-curtain", label: "Motorised drapes" },
      hvac: { deviceId: "lv-ac", label: "Air conditioning" },
      fan: { deviceId: "lv-fan", label: "Ceiling fan" },
      tv: { deviceId: "lv-tv", label: "Television" },
      music: { deviceId: "lv-music", label: "Speakers" },
      speakers: { deviceId: "lv-music", label: "Speakers" },
      keypad: { deviceId: "lv-general", label: "Wall keypad · scene recall" },
    },
  },

  keypad: {
    layout: "grid",
    finish: "graphite",
    scenes: ["welcome", "relax", "entertain", "movie"],
  },

  zones: [{ id: "lv-main", name: "Living Room", areaM2: AREA }],

  /* ---------------------------------------------------------------- */
  /* Devices                                                           */
  /* ---------------------------------------------------------------- */

  devices: [
    {
      id: "lv-general",
      kind: "light",
      name: "General",
      zoneId: "lv-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "Nine ceiling downlights over the seating and the dining table, 2700 K to 5000 K. The circuit a room needs when somebody is looking for a dropped earring and the one it should almost never be lit by otherwise — which is the entire argument for having the other five.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5000 },
      fixtures: 9,
      wattsEach: 9,
      lumensEach: 800,
      baselineWattsEach: 40,
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
        "Twenty-two metres of indirect run in the tray ceiling and over the curtain head, 2700 K to 5000 K. No visible source anywhere in the room, which is why it is the circuit that carries every evening scene and the one that goes up when guests arrive.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5000 },
      fixtures: 22, // metres of run
      wattsEach: 5,
      lumensEach: 450,
      glow: [],
    },
    {
      id: "lv-deco",
      kind: "light",
      name: "Decorative",
      zoneId: "lv-main",
      productId: "pipeline-pendant",
      subsystem: "lighting",
      pitch:
        "The dining pendants and the table lamp, fixed 2700 K. The only fittings in the room a guest will actually look at, and the ones that have to stay lit when everything else comes down — a dining table under a dark pendant reads as a room that has been switched off rather than dimmed.",
      dimmable: true,
      fixtures: 5,
      wattsEach: 6,
      lumensEach: 280,
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
        "Narrow spots on the artwork, the planting and the open shelving, fixed 3000 K. Thirty watts of the two hundred in this room, and the thirty that decide whether it photographs.",
      dimmable: true,
      fixtures: 6,
      wattsEach: 5,
      lumensEach: 280,
      glow: [],
    },
    {
      id: "lv-tvwall",
      kind: "light",
      name: "TV Wall",
      zoneId: "lv-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "The reveals either side of the screen and the backlight behind it, fixed 3000 K. Bias lighting is the one piece of lighting design with a measurable medical argument behind it: a bright picture against a black wall is what makes an evening of television tiring.",
      dimmable: true,
      fixtures: 4,
      wattsEach: 4,
      lumensEach: 275,
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
        "Twelve metres of RGBW under the TV wall and behind the shelves — the only circuit in the room that does colour, and deliberately the only one. Eight presets and a hue slider, and in Party it cycles slowly through the warm half of the wheel on its own.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5000 },
      rgb: true,
      /**
       * The eight the brief asks for, left to right.
       *
       * Warm white is the first because it is the one somebody lands on
       * after playing with the others, and it is a colour temperature
       * rather than a hue — which is why a swatch carries `cct` and
       * `sat` as well as `hue` and the slider alone could not express it.
       */
      swatches: [
        { label: "Warm white", hue: 35, sat: 0, cct: 2700 },
        { label: "Amber", hue: 35, sat: 70 },
        { label: "Magenta", hue: 320, sat: 85 },
        { label: "Violet", hue: 275, sat: 85 },
        { label: "Blue", hue: 220, sat: 85 },
        { label: "Teal", hue: 180, sat: 80 },
        { label: "Green", hue: 130, sat: 80 },
        { label: "Red", hue: 0, sat: 90 },
      ],
      fixtures: 12, // metres of run
      wattsEach: 8,
      lumensEach: 100,
      glow: [],
    },

    {
      id: "lv-curtain",
      kind: "shade",
      name: "Drapes",
      zoneId: "lv-main",
      productId: "uniser-curtain-track",
      subsystem: "shades",
      /** One position: the set is a pair, open and closed. See the bedroom. */
      layers: ["blackout"],
      presets: [
        { label: "Open", blackout: 0, hint: "Stacked at both ends" },
        { label: "Close", blackout: 100, hint: "Drawn across the glazing" },
      ],
      /** Open, Close and Stop, which is the plate on the wall. */
      stoppable: true,
      watts: 40,
      /** Five seconds end to end, eased — which is what a drape track does. */
      travelMs: 5000,
      window: { x: 0.65, y: 0, w: 0.35, h: 1 },
      draw: "both",
    },
    {
      id: "lv-fan",
      kind: "fan",
      name: "Ceiling Fan",
      zoneId: "lv-main",
      productId: "smartspaces-fan",
      subsystem: "climate",
      pitch:
        "A BLDC fan over the seating. Three speeds, about twenty-six watts at the top, and the reason the air conditioning in a Mumbai living room can sit at twenty-four instead of twenty-two.",
      speeds: 3,
      ratedWatts: 26,
    },
    {
      id: "lv-ac",
      kind: "climate",
      name: "Air Conditioning",
      zoneId: "lv-main",
      productId: "sensibo-airbend",
      subsystem: "climate",
      pitch:
        "A concealed cassette over the dining end. Every scene names a setpoint, because a living room that is twenty-two degrees for a party and twenty-four for a film is the difference between the lighting being a demonstration and the room being controlled.",
      minC: 16,
      maxC: 30,
      modes: ["cool", "dry", "auto", "sleep"],
      ratedWatts: 1800,
    },
    {
      id: "lv-tv",
      kind: "av",
      name: "Television",
      zoneId: "lv-main",
      productId: "smartspaces-av",
      subsystem: "av",
      pitch:
        "The screen on the TV wall. Movie mode is the one button on this card worth pressing in front of a client: the drapes draw, the room comes down to the bias light and the picture arrives, in that order and without anyone touching a second control.",
      sources: ["Netflix", "YouTube", "HDMI"],
      hasScreen: false,
      /** The AV card's scene button — see the Movie sequence below. */
      sceneButton: { sceneId: "movie", label: "Movie mode" },
      ratedWatts: 140,
      glow: [],
    },
    {
      id: "lv-music",
      kind: "av",
      name: "Speakers",
      zoneId: "lv-main",
      productId: "smartspaces-audio",
      subsystem: "av",
      pitch:
        "In-ceiling pair over the seating. On in four of the six scenes and off in the one with a film running, which is the only setting of a multi-room system anybody ever argues about.",
      sources: ["Living Ambient", "Dinner", "Party"],
      ratedWatts: 60,
      glow: [],
    },

    {
      id: "lv-lux",
      kind: "sensor",
      name: "Ambient Light",
      zoneId: "lv-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Measured light at the seating. Draw the drapes across a full-height glazed wall and it collapses, which is both why the room needs them and why the lighting has to come up to meet them.",
      metric: "lux",
      unit: "lx",
      derived: true,
    },
    {
      id: "lv-temp",
      kind: "sensor",
      name: "Room Temperature",
      zoneId: "lv-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Air temperature at the seating. With the fan running the same comfort sits about two degrees higher, which on a 1.8 kW cassette is most of the summer bill.",
      metric: "temperature",
      unit: "°C",
      derived: true,
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Scenes — the client's six                                         */
  /* ---------------------------------------------------------------- */

  scenes: [
    {
      id: "welcome",
      clockMin: 19 * 60,
      name: "Welcome",
      icon: "◈",
      blurb:
        "Walking in. Everything on and nothing at full — seventy on the ceiling and the cove, the pendants and the accents behind them, drapes open on the balcony and something quiet on the speakers. The state a living room should be in when the front door opens.",
      fadeMs: 2200,
      daylight: { day_sky: 25, day_morning: 0, day_midday: 0, day_evening: 50, sky: 70 },
      targets: {
        "lv-general": { on: true, level: 70, cct: 3500, sat: 0 },
        "lv-cove": { on: true, level: 70, cct: 3500, sat: 0 },
        "lv-deco": { on: true, level: 60 },
        "lv-accent": { on: true, level: 60 },
        "lv-tvwall": { on: true, level: 40 },
        "lv-rgb": { on: false },
        "lv-curtain": { blackout: 0 },
        "lv-tv": { on: false },
        "lv-music": { on: true, source: "Living Ambient", volume: 25 },
        "lv-ac": { on: true, setpointC: 24, mode: "cool", fan: 1 },
        "lv-fan": { on: true, speed: 1 },
      },
      highlight: ["proplus-downlight", "connekt-profile"],
    },
    {
      id: "relax",
      clockMin: 19 * 60 + 45,
      name: "Relax",
      icon: "◐",
      blurb:
        "Two people and a book. The ceiling drops to a quarter, the cove carries the room at 2700 K, the drapes come halfway across and the colour run goes to a low amber — warm enough to sit in for three hours without anyone reaching for a switch.",
      fadeMs: 2600,
      daylight: { day_sky: 15, day_morning: 0, day_midday: 0, day_evening: 35, sky: 85 },
      targets: {
        "lv-general": { on: true, level: 25, cct: 2700, sat: 0 },
        "lv-cove": { on: true, level: 60, cct: 2700, sat: 0 },
        "lv-deco": { on: true, level: 50 },
        "lv-accent": { on: true, level: 40 },
        "lv-tvwall": { on: true, level: 30 },
        "lv-rgb": { on: true, level: 30, hue: 35, sat: 70 },
        "lv-curtain": { blackout: 40 },
        "lv-tv": { on: false },
        "lv-music": { on: true, source: "Living Ambient", volume: 20 },
        "lv-ac": { on: true, setpointC: 24, mode: "cool", fan: 1 },
        "lv-fan": { on: true, speed: 1 },
      },
      highlight: ["connekt-profile", "flexi-delta-rgb"],
    },
    {
      id: "entertain",
      clockMin: 21 * 60,
      name: "Entertain",
      icon: "✦",
      blurb:
        "Eight people in. The cove at eighty, the pendants and the accents up with it and the colour run on warm white behind the shelves — the brightest scene in the room, and still nothing in it is at full.",
      fadeMs: 2000,
      daylight: { day_sky: 0, day_morning: 0, day_midday: 0, day_evening: 0, sky: 100 },
      targets: {
        "lv-general": { on: true, level: 60, cct: 3000, sat: 0 },
        "lv-cove": { on: true, level: 80, cct: 3000, sat: 0 },
        "lv-deco": { on: true, level: 80 },
        "lv-accent": { on: true, level: 70 },
        "lv-tvwall": { on: true, level: 50 },
        "lv-rgb": { on: true, level: 50, cct: 2700, hue: 35, sat: 0 },
        "lv-curtain": { blackout: 0 },
        "lv-tv": { on: false },
        "lv-music": { on: true, source: "Dinner", volume: 40 },
        "lv-ac": { on: true, setpointC: 23, mode: "cool", fan: 2 },
        "lv-fan": { on: true, speed: 2 },
      },
      highlight: ["connekt-profile", "pipeline-pendant", "magneto-track"],
    },
    {
      id: "party",
      clockMin: 22 * 60 + 30,
      name: "Party",
      icon: "✸",
      blurb:
        "The white light comes down and the colour comes up. The RGB run cycles slowly from magenta round to violet on its own, the drapes go across so the colour has something to sit against, and the fan goes to full — the one scene in a residence that is allowed to be theatrical.",
      fadeMs: 1800,
      daylight: { day_sky: 0, day_morning: 0, day_midday: 0, day_evening: 0, sky: 100 },
      targets: {
        "lv-general": { on: true, level: 20, cct: 3000, sat: 0 },
        "lv-cove": { on: true, level: 40, cct: 3000, sat: 0 },
        "lv-deco": { on: true, level: 60 },
        "lv-accent": { on: true, level: 50 },
        "lv-tvwall": { on: true, level: 40 },
        "lv-rgb": { on: true, level: 80, hue: 320, sat: 90 },
        "lv-curtain": { blackout: 100 },
        "lv-tv": { on: false },
        "lv-music": { on: true, source: "Party", volume: 70 },
        "lv-ac": { on: true, setpointC: 22, mode: "cool", fan: 3 },
        "lv-fan": { on: true, speed: 3 },
      },
      /**
       * Magenta round to violet and back, once in twenty seconds.
       *
       * The same arc the restaurant's Party uses and for the same reason:
       * a full trip round the wheel passes through green, and a living
       * room lit green is a fault report rather than a scene.
       */
      drift: {
        deviceId: "lv-rgb",
        fromHue: 320,
        toHue: 275,
        periodMs: 20000,
      },
      highlight: ["flexi-delta-rgb", "smartspaces-audio"],
    },
    {
      id: "movie",
      clockMin: 21 * 60 + 30,
      name: "Movie",
      icon: "▣",
      blurb:
        "One press and the room becomes a cinema: the drapes draw across, the white light goes out, the bias light behind the screen comes down to fifteen and the picture arrives. Five stages, about twelve seconds — and the music stops, because that is the part people forget to do by hand.",
      fadeMs: 1200,
      daylight: { day_sky: 0, day_morning: 0, day_midday: 0, day_evening: 0, sky: 100 },
      /**
       * Stage zero is Welcome, which is where the brief's sequence begins.
       *
       * A staged scene applies `targets` before its first step and the
       * runner skips a step that commands nothing new, so everything the
       * five beats move is set here to what they move *from*.
       */
      targets: {
        "lv-general": { on: true, level: 70, cct: 3500, sat: 0 },
        "lv-cove": { on: true, level: 70, cct: 3500, sat: 0 },
        "lv-deco": { on: true, level: 60 },
        "lv-accent": { on: true, level: 60 },
        "lv-tvwall": { on: true, level: 40 },
        "lv-rgb": { on: false },
        "lv-curtain": { blackout: 0 },
        "lv-tv": { on: false, source: "Netflix" },
        "lv-music": { on: true, source: "Living Ambient", volume: 25 },
        "lv-ac": { on: true, setpointC: 24, mode: "cool", fan: 1 },
        "lv-fan": { on: true, speed: 1 },
      },
      steps: [
        {
          label: "Closing curtains",
          // No `fadeMs`: travel belongs to the motor. Five seconds, and
          // the hold is sized to clear it before the next beat.
          holdMs: 13950,
          targets: { "lv-curtain": { blackout: 100 } },
        },
        {
          label: "Dimming the lights",
          holdMs: 5260,
          targets: {
            "lv-general": { on: false, fadeMs: 2000 },
            "lv-deco": { on: false, fadeMs: 2000 },
            "lv-accent": { on: true, level: 10, fadeMs: 2000 },
            "lv-cove": { on: true, level: 10, cct: 2700, sat: 0, fadeMs: 2000 },
          },
        },
        {
          label: "TV backlight on",
          holdMs: 2630,
          targets: {
            "lv-tvwall": { on: true, level: 15, fadeMs: 1000 },
            "lv-rgb": { on: true, level: 15, hue: 220, sat: 85, fadeMs: 1000 },
          },
        },
        {
          label: "TV on",
          holdMs: 2630,
          targets: { "lv-tv": { on: true, source: "Netflix", volume: 35 } },
        },
        {
          label: "Movie mode ready",
          holdMs: 5260,
          targets: {
            "lv-music": { on: false },
            "lv-ac": { on: true, setpointC: 24, mode: "cool", fan: 1 },
            "lv-fan": { on: true, speed: 1 },
          },
        },
      ],
      highlight: ["uniser-curtain-track", "smartspaces-av", "flexi-delta-rgb"],
    },
    {
      id: "all-off",
      clockMin: 23 * 60 + 30,
      name: "All Off",
      icon: "⏻",
      blurb:
        "Leaving the room. Every circuit fades out over three seconds and then the television, the speakers, the air conditioning and the fan go with them — in that order, because a room that drops to black and keeps humming has only done half the job.",
      fadeMs: 3000,
      /**
       * The lights only, and the drapes deliberately absent.
       *
       * "Curtains: unchanged" in the client's table is a real instruction
       * rather than an omission: whether they were open or across is a
       * decision somebody made about the room, and leaving is not the
       * moment to undo it.
       */
      targets: {
        "lv-general": { on: false, fadeMs: 3000 },
        "lv-cove": { on: false, fadeMs: 3000 },
        "lv-deco": { on: false, fadeMs: 3000 },
        "lv-accent": { on: false, fadeMs: 3000 },
        "lv-tvwall": { on: false, fadeMs: 3000 },
        "lv-rgb": { on: false, fadeMs: 3000 },
      },
      steps: [
        {
          label: "AV, air conditioning and fan off",
          holdMs: 8420,
          targets: {
            "lv-tv": { on: false },
            "lv-music": { on: false },
            "lv-ac": { on: false },
            "lv-fan": { on: false },
          },
        },
      ],
      highlight: ["proplus-downlight"],
    },
  ],

  rules: [
    {
      id: "lv-circadian",
      kind: "circadian",
      name: "Circadian Tuning",
      explain:
        "The ceiling and the cove share one colour temperature and follow the hour when no scene has claimed them — 5000 K at seven in the morning, 2700 K by ten at night. The pendants, the accents and the TV wall hold their colour, which is what lets the room warm through the evening without anything appearing to change.",
      enabledByDefault: true,
      deviceIds: ["lv-general", "lv-cove"],
      curve: [
        { min: 0, cct: 2700 },
        { min: 360, cct: 4000 },
        { min: 420, cct: 5000 },
        { min: 720, cct: 5000 },
        { min: 1020, cct: 3500 },
        { min: 1200, cct: 2700 },
        { min: 1380, cct: 2700 },
      ],
    },
  ],

  /** A dark room with the drapes open, and what Reset returns to. */
  defaults: {
    "lv-general": { on: false, level: 0, cct: 3000, sat: 0 },
    "lv-cove": { on: false, level: 0, cct: 3000, sat: 0 },
    "lv-deco": { on: false, level: 0 },
    "lv-accent": { on: false, level: 0 },
    "lv-tvwall": { on: false, level: 0 },
    "lv-rgb": { on: false, level: 0, cct: 2700, hue: 35, sat: 0 },
    "lv-curtain": { blackout: 0 },
    "lv-fan": { on: false, speed: 2 },
    "lv-ac": { on: true, setpointC: 24, mode: "cool", fan: 1 },
    "lv-tv": { on: false, source: "Netflix", volume: 35 },
    "lv-music": { on: false, source: "Living Ambient", volume: 25 },
  },

  openingSceneId: "welcome",
  openingClockMin: 19 * 60,

  environment: {
    sunriseMin: 6 * 60 + 20,
    sunsetMin: 18 * 60 + 55,
    outdoorPeakLux: 95000,
    /** One full-height glazed wall onto a balcony, on a 38 m² room. */
    windowFactor: 0.0062,
    designLux: 200,
    outdoorMinC: 26,
    outdoorMaxC: 34,
  },

  baseline: {
    lightingWatts: 520,
    hvacWatts: 2000,
    operatingHours: { startMin: 18 * 60, endMin: 24 * 60 },
    hvacHours: { startMin: 19 * 60, endMin: 24 * 60 },
    note:
      "Thirteen 40 W downlights on two switches, a pair of uncontrolled pendants, no cove, no accents and a 2 t split left at twenty-two all evening — a flat fitted out around 2014.",
  },

  tariffPerKwh: 11.5,
  currency: "₹",
};
