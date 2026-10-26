import type { Space } from "@/lib/sim/types";

/**
 * The den: a media room that also has to be an office.
 *
 * The third residential space, and the first enclosed one. Every other
 * room in this project is sold partly on its window — the hotel room's
 * curtains, the cabin's skyline, the living room's balcony. This one has
 * no window in shot at all, and that is the point of it: a den is the
 * room you build when you want to decide what time of day it is.
 *
 * So the circuits are split by *use* rather than by position. Work wants
 * eighty per cent of a cool ceiling; Movie wants none of it and two
 * colour circuits instead. The projector is on the lighting plan because
 * in a room this dark it is the brightest source in it, and the one
 * thing a media room is actually judged on is whether the screen, the
 * curtains and the lights move in an order a person would recognise.
 */

/** 72 m² of den: a seating bank, a screen wall, shelving and a desk bay. */
const AREA = 72;

export const den: Space = {
  id: "den",
  name: "Den / Media Room",
  segment: "residential",
  category: "Residence",
  blurb:
    "A 72 m² media room and home office — path-traced offline and relit live. Six circuits including two colour runs, a motorised screen and projector, drapes, and the one-button movie sequence the room is specified for.",
  renderer: "plates",
  /**
   * No window in shot, so no scrubber.
   *
   * All five exterior layers decode to exactly 0.00000 in all three
   * sets. The clock still runs; only the control that implies it does
   * something goes. See `Space.enclosed`.
   */
  enclosed: true,
  plates: {
    dir: "/plates/den",
    profile: "den",
    /**
     * The drapes, and a declared rectangle that is not them.
     *
     * `hotspots.json` ships `curtain_rect` as `[0, 0, 0.7802, 1]` — the
     * left 78% of the frame. Measured, that rectangle holds 37.6% of
     * where closing the drapes actually changes the picture and 97% of
     * it is somewhere the drapes never reach, which is the generator
     * describing the room *beside* the curtain rather than the curtain.
     * The brief's own prose says so: "the curtains are mostly off-frame
     * on the right edge", and its own rule — draw inside the rect from
     * both sides — would wipe a pair of panels across the sofa.
     *
     * So the opening is measured here, as the bedroom's was: the band
     * where the two sets differ is u 0.76 to the right edge, full
     * height, and it holds 65% of the whole change with the rest being
     * bounce off the fabric into the room. That bounce is a crossfade by
     * construction, because it falls outside the quad.
     *
     * One panel, not two. The open set has the fabric stacked at the far
     * right and the closed set has it drawn left across the band, so the
     * reach is `[0, 1]`: nothing from the near edge, everything from the
     * far one.
     */
    curtain: {
      closedDir: "/plates/den_closed",
      deviceId: "dn-curtain",
      window: {
        quad: [
          [0.76, 1],
          [1, 1],
          [1, 0],
          [0.76, 0],
        ],
        pad: 0.01,
        travel: "split",
        split: [0, 1],
        softPx: 12,
      },
    },
    /**
     * The screen, which rolls — the boardroom's mechanism unchanged.
     *
     * `den_screen` is the room with the drapes closed *and* the screen
     * down, so inside the screen's rectangle every row above the drop
     * line comes from that set and the rest from the blended base.
     *
     * `dn_projection` is pinned because it is the one layer that exists
     * in that set alone — exactly 0.00000 in the other two — and because
     * the spill off a 3,500-lumen image belongs to the whole room rather
     * than to the rectangle. In a den with the lights at five per cent
     * that spill *is* the lighting.
     */
    overlay: {
      dir: "/plates/den_screen",
      deviceId: "dn-av",
      rect: "screen_rect",
      travel: "drop",
      pinLayers: ["dn_projection"],
    },
    hotspotAliases: {
      screen: { deviceId: "dn-av", label: "Projection screen" },
      projector: { deviceId: "dn-projection", label: "Projector" },
      speakers: { deviceId: "dn-av", label: "Tower speakers" },
      media: { deviceId: "dn-media", label: "Media playback" },
      curtains: { deviceId: "dn-curtain", label: "Motorised drapes" },
      hvac: { deviceId: "dn-ac", label: "Air conditioning" },
      /**
       * The desk, which is a use of the room rather than a fitting.
       *
       * Tapping it recalls Work, because what anybody wants from
       * pointing at the desk is the room set up to sit at it — and it
       * still selects the circuit that lights it, so the marker behaves
       * like every other marker as well.
       */
      workstation: {
        deviceId: "dn-accent",
        label: "Workstation · recall Work",
        sceneId: "work",
      },
      keypad: { deviceId: "dn-general", label: "Wall keypad · scene recall" },
    },
  },

  keypad: {
    layout: "grid",
    finish: "graphite",
    scenes: ["work", "relax", "gaming", "movie"],
  },

  zones: [{ id: "dn-main", name: "Den", areaM2: AREA }],

  avPanel: {
    deviceId: "dn-av",
    projectorId: "dn-projection",
    mediaId: "dn-media",
  },

  /* ---------------------------------------------------------------- */
  /* Devices                                                           */
  /* ---------------------------------------------------------------- */

  devices: [
    {
      id: "dn-general",
      kind: "light",
      name: "General",
      zoneId: "dn-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "Eight bulkhead downlights, 2700 K to 5000 K. The circuit that is at eighty for the desk and at zero for everything else this room is for — which is the whole reason a media room cannot be run off one switch.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5000 },
      fixtures: 8,
      wattsEach: 10,
      lumensEach: 700,
      baselineWattsEach: 40,
      glow: [],
    },
    {
      id: "dn-cove",
      kind: "light",
      name: "Cove",
      zoneId: "dn-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Sixteen metres in the tray ceiling, 2700 K to 5000 K. No source anybody sitting down can see, which is why it is the circuit left at five per cent during a film — enough to find a glass by and not enough to grey the screen.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5000 },
      fixtures: 16, // metres of run
      wattsEach: 5,
      lumensEach: 450,
      glow: [],
    },
    {
      id: "dn-accent",
      kind: "light",
      name: "Accent",
      zoneId: "dn-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Shelf lighting on the left wall, a spot on the poster, and the desk bay with its task light — fixed 3000 K. Thirty-five watts, and the only circuit in the room that is doing a job rather than setting a mood.",
      dimmable: true,
      fixtures: 7,
      wattsEach: 5,
      lumensEach: 260,
      glow: [],
    },
    {
      id: "dn-rgb",
      kind: "light",
      name: "Room RGB",
      zoneId: "dn-main",
      productId: "flexi-delta-rgb",
      subsystem: "lighting",
      pitch:
        "Eighteen metres of RGBW: the screen-niche edges, the tray strip and the curtain head. Eight presets, a hue slider and a white channel — and in Gaming it cycles the warm half of the wheel on its own, which is the one scene in a residence allowed to be a light show.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5000 },
      rgb: true,
      rgbw: true,
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
      fixtures: 18, // metres of run
      wattsEach: 8,
      lumensEach: 100,
      glow: [],
    },
    {
      id: "dn-bias",
      kind: "light",
      name: "Bias light",
      zoneId: "dn-main",
      productId: "flexi-delta-rgb",
      subsystem: "lighting",
      pitch:
        "The glow around the screen and under the console, on its own circuit because it is the one that stays on when everything else is out. Bias lighting is the single piece of lighting design with a clinical argument behind it: a bright picture against a black wall is what makes two hours of television tiring.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5000 },
      rgb: true,
      rgbw: true,
      swatches: [
        { label: "Warm white", hue: 35, sat: 0, cct: 2700 },
        { label: "Neutral white", hue: 35, sat: 0, cct: 4000 },
        { label: "Amber", hue: 35, sat: 70 },
        { label: "Magenta", hue: 320, sat: 85 },
        { label: "Violet", hue: 275, sat: 85 },
        { label: "Blue", hue: 215, sat: 85 },
        { label: "Teal", hue: 180, sat: 80 },
        { label: "Red", hue: 0, sat: 90 },
      ],
      fixtures: 6, // metres of run
      wattsEach: 6,
      lumensEach: 110,
      glow: [],
    },
    {
      id: "dn-projection",
      kind: "light",
      name: "Projection",
      zoneId: "dn-main",
      productId: "smartspaces-av",
      subsystem: "av",
      /**
       * The image, as a lighting circuit.
       *
       * It is on the plan because in a room finished this dark it is the
       * brightest source in it — the spill off the screen reaches the
       * ceiling and the seating, which is why its plate is pinned to the
       * screen set rather than clipped to the rectangle.
       */
      pitch:
        "A 3,500-lumen projector onto a 110-inch screen. Counted as a circuit because that is what it is: with the room at five per cent the picture is lighting the seating, and a scene that ignores it is a scene that has not looked at the room.",
      dimmable: false,
      fixtures: 1,
      wattsEach: 280,
      lumensEach: 3500,
      glow: [],
    },

    {
      id: "dn-curtain",
      kind: "shade",
      name: "Drapes",
      zoneId: "dn-main",
      productId: "uniser-curtain-track",
      subsystem: "shades",
      /** One position: the set is a pair, open and closed. */
      layers: ["blackout"],
      presets: [
        { label: "Open", blackout: 0, hint: "Stacked at the right-hand return" },
        { label: "Half", blackout: 50, hint: "Part way across" },
        { label: "Close", blackout: 100, hint: "Drawn across the return" },
      ],
      stoppable: true,
      /**
       * A quarter of the frame at full travel, stacked in a return at
       * the right edge. The room cannot show this one moving clearly
       * enough, so the card carries a travel bar — see `offFrame`.
       */
      offFrame: true,
      watts: 40,
      travelMs: 5000,
      window: { x: 0.76, y: 0, w: 0.24, h: 1 },
      draw: "both",
    },
    {
      id: "dn-av",
      kind: "av",
      name: "AV System",
      zoneId: "dn-main",
      productId: "smartspaces-av",
      subsystem: "av",
      /**
       * One device for the screen and the speakers, as in the boardroom:
       * `screen` is the motorised screen's position and drives the plate
       * overlay, and `on` and `volume` are the tower speakers. What is
       * *playing* is `dn-media`, because it is a separate box in the rack
       * and a separate column in the scene table.
       */
      pitch:
        "A six-second motorised screen in the ceiling slot and a pair of towers either side of it. The screen is the part people judge — one that jerks or stops short is the first thing anybody notices, and the last thing they forget.",
      sources: ["Projector"],
      hasScreen: true,
      screenTravelMs: 6000,
      ratedWatts: 180,
      glow: [],
    },
    {
      id: "dn-media",
      kind: "av",
      name: "Media",
      zoneId: "dn-main",
      productId: "smartspaces-av",
      subsystem: "av",
      pitch:
        "The streamer, the console and the laptop input, on one transport. The source is part of every scene here for the same reason the setpoint is: a room that comes up for a film and leaves the console on the screen has only done half of it.",
      sources: ["Netflix", "Apple TV", "YouTube", "Game console", "HDMI laptop", "Music"],
      /** What the card prints under "Now playing". */
      nowPlaying: {
        Netflix: "Episode 4 · Nightfall",
        "Apple TV": "Feature · Coastline",
        YouTube: "Live · the city at night",
        "Game console": "Player one · lobby",
        "HDMI laptop": "Laptop · Q3 review",
        Music: "Evening playlist",
      },
      ratedWatts: 45,
      glow: [],
    },
    {
      id: "dn-ac",
      kind: "climate",
      name: "Air Conditioning",
      zoneId: "dn-main",
      productId: "sensibo-airbend",
      subsystem: "climate",
      pitch:
        "A cassette over the seating bank. An enclosed room with a projector in it gains about four hundred watts of heat the moment the film starts, which is the argument for putting the AC on the same scene as the screen.",
      minC: 16,
      maxC: 30,
      modes: ["cool", "dry", "auto", "sleep"],
      ratedWatts: 1500,
    },

    {
      id: "dn-temp",
      kind: "sensor",
      name: "Room Temperature",
      zoneId: "dn-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Air temperature at the seating. The one number in an enclosed media room that actually moves during a film, and the reason the cassette is on the scene rather than on a wall stat.",
      metric: "temperature",
      unit: "°C",
      derived: true,
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Scenes — the client's six                                         */
  /* ---------------------------------------------------------------- */

  /**
   * No `daylight` on any of them, and no circadian rule.
   *
   * Both would be theatre here. There is no exterior plate to weight and
   * no window for a curve to follow, so the room's colour is whatever
   * the scene says it is — which in a den is the honest answer anyway:
   * Work is 4500 K because somebody is working, not because of the hour.
   */
  scenes: [
    {
      id: "work",
      clockMin: 10 * 60,
      name: "Work",
      icon: "❑",
      blurb:
        "The desk bay, used as an office. Eighty on the ceiling at 4500 K with the accents up and every colour circuit out — the one scene in this room that looks like a room rather than like a cinema.",
      fadeMs: 1800,
      targets: {
        "dn-general": { on: true, level: 80, cct: 4500, sat: 0 },
        "dn-cove": { on: true, level: 50, cct: 4500, sat: 0 },
        "dn-accent": { on: true, level: 70 },
        "dn-rgb": { on: false },
        "dn-bias": { on: false },
        "dn-curtain": { blackout: 0 },
        "dn-av": { on: false, screen: 0 },
        "dn-projection": { on: false },
        "dn-media": { on: false },
        "dn-ac": { on: true, setpointC: 24, mode: "cool", fan: 1 },
      },
      highlight: ["proplus-downlight", "magneto-track"],
    },
    {
      id: "relax",
      clockMin: 19 * 60,
      name: "Relax",
      icon: "◎",
      blurb:
        "Sitting in it rather than watching anything. The ceiling drops to a fifth, the cove carries the room at 2700 K, the drapes come halfway and the colour run sits on a low amber with music on.",
      fadeMs: 2600,
      targets: {
        "dn-general": { on: true, level: 20, cct: 2700, sat: 0 },
        "dn-cove": { on: true, level: 60, cct: 2700, sat: 0 },
        "dn-accent": { on: true, level: 50 },
        "dn-rgb": { on: true, level: 30, hue: 35, sat: 70 },
        "dn-bias": { on: false },
        "dn-curtain": { blackout: 50 },
        "dn-av": { on: true, volume: 20, screen: 0 },
        "dn-projection": { on: false },
        "dn-media": { on: true, source: "Music" },
        "dn-ac": { on: true, setpointC: 24, mode: "cool", fan: 1 },
      },
      highlight: ["connekt-profile", "flexi-delta-rgb"],
    },
    {
      id: "gaming",
      clockMin: 21 * 60,
      name: "Gaming",
      icon: "✦",
      blurb:
        "Screen down, console up, white light almost gone. The room RGB cycles slowly from magenta round to cyan on its own and the bias light sits violet behind the screen — the scene this room gets bought for by anybody under thirty.",
      fadeMs: 1600,
      targets: {
        "dn-general": { on: true, level: 10, cct: 3000, sat: 0 },
        "dn-cove": { on: true, level: 20, cct: 3000, sat: 0 },
        "dn-accent": { on: true, level: 30 },
        "dn-rgb": { on: true, level: 70, hue: 300, sat: 90 },
        "dn-bias": { on: true, level: 60, hue: 275, sat: 85 },
        "dn-curtain": { blackout: 100 },
        "dn-av": { on: true, volume: 60, screen: 100 },
        "dn-projection": { on: true, level: 100 },
        "dn-media": { on: true, source: "Game console" },
        "dn-ac": { on: true, setpointC: 23, mode: "cool", fan: 2 },
      },
      /**
       * Magenta round to cyan and back, once in fifteen seconds.
       *
       * The same restricted arc the restaurant and the living room use,
       * for the same reason: a full trip round the wheel passes through
       * green, and a room lit green reads as a fault rather than a mood.
       */
      drift: {
        deviceId: "dn-rgb",
        fromHue: 300,
        toHue: 190,
        periodMs: 15000,
      },
      highlight: ["flexi-delta-rgb", "smartspaces-av"],
    },
    {
      id: "movie",
      clockMin: 21 * 60 + 30,
      name: "Movie",
      icon: "▣",
      blurb:
        "One press and the room becomes a cinema: the white light goes, the bias lighting comes up blue, the drapes draw, the screen descends and the projector lands. Six stages, about eighteen seconds — eleven of which are two motors that cannot be hurried.",
      fadeMs: 1200,
      /**
       * Stage zero is Work, which is where the client's wording starts.
       *
       * A staged scene applies `targets` before its first step and the
       * runner skips a step that commands nothing new, so everything the
       * six beats move is set here to what they move *from*.
       */
      targets: {
        "dn-general": { on: true, level: 80, cct: 4500, sat: 0 },
        "dn-cove": { on: true, level: 50, cct: 4500, sat: 0 },
        "dn-accent": { on: true, level: 70 },
        "dn-rgb": { on: false },
        "dn-bias": { on: false },
        "dn-curtain": { blackout: 0 },
        "dn-av": { on: false, screen: 0 },
        "dn-projection": { on: false },
        "dn-media": { on: false, source: "Netflix" },
        "dn-ac": { on: true, setpointC: 24, mode: "cool", fan: 1 },
      },
      steps: [
        {
          label: "Main lights off",
          holdMs: 5260,
          targets: {
            "dn-general": { on: false, fadeMs: 2000 },
            "dn-cove": { on: true, level: 5, cct: 2700, sat: 0, fadeMs: 2000 },
            "dn-accent": { on: true, level: 10, fadeMs: 2000 },
          },
        },
        {
          label: "Bias lighting on",
          holdMs: 3950,
          targets: {
            "dn-rgb": { on: true, level: 20, hue: 225, sat: 90, fadeMs: 1500 },
            "dn-bias": { on: true, level: 40, hue: 215, sat: 85, fadeMs: 1500 },
          },
        },
        {
          // No `fadeMs`: travel belongs to the motor. Five seconds, and
          // the hold is sized to clear it before the next beat.
          label: "Closing curtains",
          holdMs: 13420,
          targets: { "dn-curtain": { blackout: 100 } },
        },
        {
          /** Six seconds of screen, likewise unpaced. */
          label: "Screen lowering",
          holdMs: 16050,
          targets: { "dn-av": { screen: 100 } },
        },
        {
          label: "Projector on",
          holdMs: 3950,
          targets: {
            "dn-projection": { on: true, level: 100, fadeMs: 1500 },
            "dn-media": { on: true, source: "Netflix" },
          },
        },
        {
          label: "Speakers on. Enjoy the movie",
          holdMs: 5260,
          targets: { "dn-av": { on: true, volume: 50 } },
        },
      ],
      highlight: ["uniser-curtain-track", "smartspaces-av", "flexi-delta-rgb"],
    },
    {
      id: "presentation",
      clockMin: 15 * 60,
      name: "Presentation",
      icon: "◈",
      blurb:
        "The same screen used for work. Forty on the ceiling at 4000 K so the room can be written in, a white bias light behind the screen and the laptop on the projector — a den doing the job a meeting room would.",
      fadeMs: 1800,
      targets: {
        "dn-general": { on: true, level: 40, cct: 4000, sat: 0 },
        "dn-cove": { on: true, level: 40, cct: 4000, sat: 0 },
        "dn-accent": { on: true, level: 30 },
        "dn-rgb": { on: false },
        "dn-bias": { on: true, level: 30, cct: 4000, hue: 35, sat: 0 },
        "dn-curtain": { blackout: 100 },
        "dn-av": { on: true, volume: 40, screen: 100 },
        "dn-projection": { on: true, level: 100 },
        "dn-media": { on: true, source: "HDMI laptop" },
        "dn-ac": { on: true, setpointC: 23, mode: "cool", fan: 2 },
      },
      highlight: ["smartspaces-av", "proplus-downlight"],
    },
    {
      id: "all-off",
      clockMin: 23 * 60 + 30,
      name: "All Off",
      icon: "⏻",
      blurb:
        "Leaving the room, in the order the hardware needs. The picture goes first, then the screen goes up — a projector throwing three and a half thousand lumens at a screen on its way into the ceiling paints the slide across the slot — and only then do the lights fade and the rack switch off.",
      fadeMs: 3000,
      /**
       * The picture, first and on its own.
       *
       * The drapes are deliberately absent: "unchanged" in the client's
       * table is an instruction, not an omission. Whether they were open
       * or across is a decision somebody made, and leaving is not the
       * moment to undo it.
       */
      targets: {
        "dn-projection": { on: false, fadeMs: 1200 },
      },
      steps: [
        {
          label: "Screen up",
          // Six seconds of motor, unpaced, with the hold sized to clear it.
          holdMs: 16050,
          targets: { "dn-av": { screen: 0 } },
        },
        {
          label: "Lights out",
          holdMs: 8420,
          targets: {
            "dn-general": { on: false, fadeMs: 3000 },
            "dn-cove": { on: false, fadeMs: 3000 },
            "dn-accent": { on: false, fadeMs: 3000 },
            "dn-rgb": { on: false, fadeMs: 3000 },
            "dn-bias": { on: false, fadeMs: 3000 },
          },
        },
        {
          label: "AV and air conditioning off",
          holdMs: 3950,
          targets: {
            "dn-av": { on: false },
            "dn-media": { on: false },
            "dn-ac": { on: false },
          },
        },
      ],
      highlight: ["smartspaces-av"],
    },
  ],

  rules: [],

  /** A dark room with the drapes open and the screen up. */
  defaults: {
    "dn-general": { on: false, level: 0, cct: 4000, sat: 0 },
    "dn-cove": { on: false, level: 0, cct: 4000, sat: 0 },
    "dn-accent": { on: false, level: 0 },
    "dn-rgb": { on: false, level: 0, cct: 2700, hue: 220, sat: 0 },
    "dn-bias": { on: false, level: 0, cct: 2700, hue: 215, sat: 0 },
    "dn-projection": { on: false, level: 0 },
    "dn-curtain": { blackout: 0 },
    "dn-av": { on: false, source: "Projector", volume: 40, screen: 0 },
    "dn-media": { on: false, source: "Netflix" },
    "dn-ac": { on: true, setpointC: 24, mode: "cool", fan: 1 },
  },

  openingSceneId: "work",
  openingClockMin: 20 * 60,

  /**
   * Required by the type and all but inert here.
   *
   * `windowFactor` is zero because the camera sees no glazing, which
   * makes the interior daylight term zero at every hour — the honest
   * figure for a room whose exterior plates are empty.
   */
  environment: {
    sunriseMin: 6 * 60 + 20,
    sunsetMin: 18 * 60 + 55,
    outdoorPeakLux: 95000,
    windowFactor: 0,
    designLux: 300,
    outdoorMinC: 26,
    outdoorMaxC: 34,
  },

  baseline: {
    lightingWatts: 480,
    hvacWatts: 1700,
    operatingHours: { startMin: 17 * 60, endMin: 24 * 60 },
    hvacHours: { startMin: 18 * 60, endMin: 24 * 60 },
    note:
      "Twelve 40 W downlights on one switch, no cove, no accents and a 1.5 t split left at twenty-two all evening — a flat fitted out around 2014.",
  },

  tariffPerKwh: 11.5,
  currency: "₹",
};
