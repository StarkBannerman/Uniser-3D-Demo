import type { Space } from "@/lib/sim/types";

/**
 * A hotel restaurant, built to the client's sheet.
 *
 * The sheet names eight lighting layers and eight scenes, and the eight layers
 * are the reason this room is worth demonstrating at all: a dining room is the
 * one commercial space where the lighting *is* the product. An office is
 * judged on whether you can read; a restaurant is judged on whether the room
 * made the evening feel like an occasion, and that judgement is made in the
 * first ten seconds, before anybody has tasted anything.
 *
 * Two of the eight look like duplicates and are not. "General Ambient" is the
 * lux layer — recessed heads over the floor, there so people can see their
 * plates and staff can work. "Tunable White" is the track, and its job is
 * colour rather than quantity: it is the layer that takes the room from a
 * 4500 K lunch to a 2300 K dinner service. Running them as one circuit is the
 * usual value-engineering cut, and it is why value-engineered restaurants only
 * ever have one atmosphere.
 *
 * Filed under commercial at the client's request. It is a hospitality room by
 * any ordinary reading — it sits inside a hotel and the sheet is headed
 * hospitality — so if the picker ought to group it with the lobby instead, the
 * only change needed is `segment`.
 */

/** 15 x 22 m of dining floor, a single tall volume down one glazed side. */
const AREA = 330;

export const restaurant: Space = {
  id: "restaurant",
  name: "Hotel Restaurant",
  segment: "commercial",
  category: "Commercial",
  blurb:
    "A 330 m² hotel restaurant, path-traced offline and relit live — eight separately controlled lighting layers across the dining floor, a bar and wine wall, a pendant cluster and a glazed façade, with music, climate, occupancy and daylight response, and the eight scenes a restaurant runs through from breakfast to the last table.",
  renderer: "plates",
  plates: { dir: "/plates" },

  keypad: {
    layout: "grid",
    finish: "brass",
    scenes: ["lunch", "dinner", "fine-dining", "party"],
  },

  zones: [{ id: "rs-main", name: "Dining Room", areaM2: AREA }],

  /* ---------------------------------------------------------------- */
  /* Devices — the eight layers on the sheet, plus what drives them    */
  /* ---------------------------------------------------------------- */

  devices: [
    {
      id: "rs-general",
      kind: "light",
      name: "General Ambient",
      zoneId: "rs-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "Forty-two recessed heads on the dining floor, tunable 2700 K to 5000 K. The only layer in the room whose job is lux rather than atmosphere, which is exactly why every scene after lunch keeps it under forty per cent — and why Cleaning runs it alone at full cool white, because nobody mops by candlelight.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5000 },
      fixtures: 42,
      wattsEach: 12,
      lumensEach: 1200,
      baselineWattsEach: 50,
      glow: [],
    },
    {
      id: "rs-tunable",
      kind: "light",
      name: "Tunable White",
      zoneId: "rs-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Thirty-four track heads on six runs, 2200 K to 5000 K across the full range. This is the layer that makes one room serve breakfast and then serve dinner: same fixtures, same positions, and a colour temperature shift that does more to change the hour than any amount of dimming.",
      dimmable: true,
      tunable: { minK: 2200, maxK: 5000 },
      fixtures: 34,
      wattsEach: 11,
      lumensEach: 900,
      baselineWattsEach: 50,
      glow: [],
    },
    {
      id: "rs-cove",
      kind: "light",
      name: "Cove",
      zoneId: "rs-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Seventy-four metres of concealed run in the dropped ceiling. The light whose source a guest never finds, and the reason a flat soffit reads as a designed ceiling rather than a lid — it is doing most of the work in every photograph of this room.",
      dimmable: true,
      /**
       * Up to 4000 K, which is higher than a cove usually goes.
       *
       * A cove is a warmth device almost always, and 3000 K would be the
       * normal cap. But this room serves breakfast against a wall of glass,
       * and a 2600 K ceiling over a daylit floor does not read as warm — it
       * reads as a colour cast. Day and Lunch need the cove to agree with the
       * window rather than argue with it.
       */
      tunable: { minK: 2200, maxK: 4000 },
      fixtures: 74, // metres of run
      wattsEach: 9,
      lumensEach: 950,
      glow: [],
    },
    {
      id: "rs-pendant",
      kind: "light",
      name: "Decorative Pendants",
      zoneId: "rs-main",
      productId: "pipeline-pendant",
      subsystem: "lighting",
      pitch:
        "Eighteen smoked-glass globes on staggered drops over the centre of the floor. Statement lighting is not an illumination layer and should never be asked to be one — these are dim, they are warm, and they are the thing a guest photographs.",
      dimmable: true,
      /**
       * Capped at 2900 K, deliberately narrow.
       *
       * A decorative filament above 3000 K stops looking like a filament and
       * starts looking like a lamp somebody fitted wrongly. The range here is
       * the range a warm globe is believable across, and nothing wider is a
       * feature anyone would want.
       */
      tunable: { minK: 1900, maxK: 2900 },
      fixtures: 18,
      wattsEach: 6,
      lumensEach: 280,
      glow: [],
    },
    {
      id: "rs-arch",
      kind: "light",
      name: "Architectural",
      zoneId: "rs-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Grazing runs up the stone columns and along the timber fins of the ceiling raft. Light aimed at a material rather than at a surface — it is what makes stone read as stone across a dining room instead of as a grey rectangle.",
      dimmable: true,
      tunable: { minK: 2400, maxK: 4000 },
      fixtures: 22,
      wattsEach: 8,
      lumensEach: 620,
      glow: [],
    },
    {
      id: "rs-feature",
      kind: "light",
      name: "Feature",
      zoneId: "rs-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "The bar back, the wine wall and the art panel by the entrance. A restaurant's feature lighting is a revenue layer, not a decorative one: a lit wine wall sells wine, and a dark one is storage.",
      dimmable: true,
      tunable: { minK: 2400, maxK: 4000 },
      fixtures: 16,
      wattsEach: 9,
      lumensEach: 700,
      glow: [],
    },
    {
      id: "rs-table",
      kind: "light",
      name: "Table / Accent",
      zoneId: "rs-main",
      productId: "pipeline-pendant",
      subsystem: "lighting",
      pitch:
        "A cordless shaded lamp on every table, plus tight narrow-beam heads centred on each top. The pool of light on a tablecloth is the single most recognisable thing in fine dining, and it is the layer guests mean when they say a room felt intimate.",
      dimmable: true,
      tunable: { minK: 1900, maxK: 2700 },
      fixtures: 26,
      wattsEach: 4,
      lumensEach: 180,
      glow: [],
    },
    {
      id: "rs-rgb",
      kind: "light",
      name: "RGB",
      zoneId: "rs-main",
      productId: "flexi-delta-rgb",
      subsystem: "lighting",
      pitch:
        "Colour-changing runs behind the planters and up the window piers, off for every normal service. This is the layer that lets a dining room be sold twice — the same floor at eight o'clock on a Tuesday and at eleven on a Saturday, with nothing rebuilt in between.",
      dimmable: true,
      tunable: { minK: 2200, maxK: 6500 },
      rgb: true,
      fixtures: 20,
      wattsEach: 10,
      lumensEach: 420,
      glow: [],
    },

    {
      id: "rs-ac",
      kind: "climate",
      name: "Air Conditioning",
      zoneId: "rs-main",
      productId: "sensibo-airbend",
      subsystem: "climate",
      pitch:
        "Six concealed fan-coils on one setpoint, set back when the floor is empty between services. A dining room's load swings with covers rather than with the hour, which is why a timeclock gets this wrong twice a day.",
      minC: 16,
      maxC: 30,
      ratedWatts: 7600,
    },
    {
      id: "rs-music",
      kind: "av",
      name: "Music",
      zoneId: "rs-main",
      productId: "smartspaces-audio",
      subsystem: "av",
      pitch:
        "Distributed ceiling speakers across the floor, carried on the same scenes as the light. Lighting and music are one atmosphere control or they are two things fighting each other, and a guest notices the music stopping before they notice anything else.",
      sources: ["Brunch", "Bossa", "Jazz Trio", "Club Set"],
      hasScreen: false,
      ratedWatts: 320,
      glow: [],
    },

    {
      id: "rs-occ",
      kind: "sensor",
      name: "Floor Occupancy",
      zoneId: "rs-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Presence across the dining floor. A restaurant is dark for more hours than it is open, and the hours between services are when a room quietly spends money it does not need to.",
      metric: "occupancy",
      unit: "",
      min: 0,
      max: 1,
    },
    {
      id: "rs-lux",
      kind: "sensor",
      name: "Ambient Light",
      zoneId: "rs-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Measured light on a window table, which is what daylight response regulates against. The tables by the glass need almost nothing from the ceiling at lunch and all of it after dark.",
      metric: "lux",
      unit: "lx",
      derived: true,
    },
    {
      id: "rs-temp",
      kind: "sensor",
      name: "Dining Temperature",
      zoneId: "rs-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Air temperature on the floor, which is what the fan-coils regulate to and the first thing a full room complains about.",
      metric: "temperature",
      unit: "°C",
      derived: true,
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Scenes — the eight on the client's sheet                          */
  /* ---------------------------------------------------------------- */

  /**
   * What these levels actually render as.
   *
   * Mean display luminance of the plates composite at each scene's own
   * clock, measured by `scripts/measure-plates.py`. Levels are tuned against
   * these ratios rather than against each other, because the circuits are
   * wildly unequal in what they put into the picture and a number that looks
   * balanced in this table is not necessarily balanced on screen.
   *
   *     Party           0.075   0.37x Dinner
   *     Fine Dining     0.084   0.42x
   *     Dinner          0.200   1.00x
   *     Evening         0.251   1.26x
   *     Cleaning        0.256   1.28x
   *     Lunch           0.257   1.28x
   *     Day             0.261   1.31x
   *     Private Event   0.279   1.40x
   *
   * Re-measure after any plate re-render: the gains in `plates/gains.ts` are
   * derived from the plates, and these ratios move with them.
   */
  scenes: [
    {
      id: "day",
      clockMin: 9 * 60,
      name: "Day",
      icon: "☀",
      blurb:
        "Breakfast and the room between services. Cool, bright and even, with the façade doing most of it — the decorative layers are off because a filament globe in daylight is a switched-on bulb and nothing more.",
      fadeMs: 2200,
      targets: {
        /**
         * Carried by the track rather than the downlights, on purpose.
         *
         * `rs-daylight` regulates the general layer and nothing else, and at
         * nine in the morning the façade is supplying enough that it trims
         * it to its 12% floor whatever this says. So a Day scene written
         * around the general layer renders at a fifth of what it asks for —
         * measured, the interior drops from 0.225 to 0.123 — which is the
         * dark brown room. The track is outside the rule, so it is what
         * actually lights breakfast, and the cove stays up because a 10%
         * cove is most of the difference between even and gloomy.
         */
        "rs-general": { on: true, level: 60, cct: 4500, sat: 0 },
        "rs-tunable": { on: true, level: 95, cct: 4500, sat: 0 },
        "rs-cove": { on: true, level: 50, cct: 4000, sat: 0 },
        "rs-pendant": { on: false },
        "rs-arch": { on: true, level: 25, cct: 4000, sat: 0 },
        "rs-feature": { on: true, level: 30, cct: 4000, sat: 0 },
        "rs-table": { on: false },
        "rs-rgb": { on: false },
        "rs-ac": { on: true, setpointC: 23, mode: "cool", fan: 2 },
        "rs-music": { on: true, source: "Brunch", volume: 22 },
      },
      highlight: ["proplus-downlight", "magneto-track"],
    },
    {
      id: "lunch",
      clockMin: 13 * 60,
      name: "Lunch",
      icon: "◑",
      blurb:
        "Full service in daylight. Brighter on the tables than Day and a little warmer overall, so the room reads as hospitality rather than as a canteen, while the window still carries the floor.",
      fadeMs: 2000,
      targets: {
        "rs-general": { on: true, level: 62, cct: 4200, sat: 0 },
        "rs-tunable": { on: true, level: 64, cct: 4000, sat: 0 },
        "rs-cove": { on: true, level: 52, cct: 3400, sat: 0 },
        "rs-pendant": { on: true, level: 30, cct: 2700, sat: 0 },
        "rs-arch": { on: true, level: 42, cct: 3400, sat: 0 },
        "rs-feature": { on: true, level: 62, cct: 3400, sat: 0 },
        "rs-table": { on: true, level: 35, cct: 2600, sat: 0 },
        "rs-rgb": { on: false },
        "rs-ac": { on: true, setpointC: 22, mode: "cool", fan: 3 },
        "rs-music": { on: true, source: "Bossa", volume: 28 },
      },
      highlight: ["magneto-track", "pipeline-pendant"],
    },
    {
      id: "evening",
      clockMin: 18 * 60 + 45,
      name: "Evening",
      icon: "◐",
      blurb:
        "The turn. Daylight has gone, the ceiling comes down and the decorative layers come up — this is the scene that makes the glazing read as a view instead of a dark wall.",
      fadeMs: 2400,
      targets: {
        "rs-general": { on: true, level: 52, cct: 3000, sat: 0 },
        "rs-tunable": { on: true, level: 64, cct: 2700, sat: 0 },
        "rs-cove": { on: true, level: 86, cct: 2600, sat: 0 },
        "rs-pendant": { on: true, level: 70, cct: 2300, sat: 0 },
        "rs-arch": { on: true, level: 66, cct: 2800, sat: 0 },
        "rs-feature": { on: true, level: 88, cct: 2900, sat: 0 },
        "rs-table": { on: true, level: 66, cct: 2200, sat: 0 },
        "rs-rgb": { on: false },
        "rs-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
        "rs-music": { on: true, source: "Bossa", volume: 30 },
      },
      highlight: ["connekt-profile", "pipeline-pendant"],
    },
    {
      id: "dinner",
      clockMin: 20 * 60 + 15,
      name: "Dinner",
      icon: "🍴",
      blurb:
        "The requirement doc's own demonstration, run as one button: general lighting reduces, warm white increases, table lighting becomes prominent, decorative lighting activates, ambient music starts. Five stages, under three seconds.",
      fadeMs: 1200,
      targets: {
        "rs-general": { on: true, level: 44, cct: 3400, sat: 0 },
        "rs-tunable": { on: true, level: 58, cct: 3200, sat: 0 },
        "rs-cove": { on: true, level: 60, cct: 2800, sat: 0 },
        "rs-pendant": { on: true, level: 40, cct: 2500, sat: 0 },
        "rs-arch": { on: true, level: 55, cct: 2900, sat: 0 },
        "rs-feature": { on: true, level: 70, cct: 3000, sat: 0 },
        "rs-table": { on: true, level: 45, cct: 2300, sat: 0 },
        "rs-rgb": { on: false },
        "rs-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
      },
      /**
       * The five beats, in the doc's order and its words.
       *
       * Worth being literal about, because the second beat is the one that is
       * easy to get backwards. "Warm white increases" means the track layer
       * goes UP as it goes warm - an earlier pass here had it coming down
       * with the general layer, which reads as the room simply dimming. The
       * point of the demonstration is that light is being *moved*, out of the
       * ceiling and onto the tables, not taken away.
       *
       * Timings are the authored ones; `PACE` plays fades at 0.35 and holds
       * at 0.38, so these five land in about 2.85 s against the client's
       * three.
       */
      steps: [
        {
          label: "General lighting reduces",
          holdMs: 1300,
          targets: {
            "rs-general": { on: true, level: 18, cct: 2900, fadeMs: 1300, sat: 0 },
          },
        },
        {
          label: "Warm white increases",
          holdMs: 1300,
          targets: {
            "rs-tunable": { on: true, level: 74, cct: 2300, fadeMs: 1300, sat: 0 },
            "rs-cove": { on: true, level: 80, cct: 2400, fadeMs: 1300, sat: 0 },
          },
        },
        {
          label: "Table lighting becomes prominent",
          holdMs: 1300,
          targets: {
            "rs-table": { on: true, level: 96, cct: 2000, fadeMs: 1300, sat: 0 },
          },
        },
        {
          label: "Decorative lighting activates",
          holdMs: 1300,
          targets: {
            "rs-pendant": { on: true, level: 90, cct: 2100, fadeMs: 1300, sat: 0 },
            "rs-arch": { on: true, level: 68, cct: 2600, fadeMs: 1300, sat: 0 },
          },
        },
        {
          label: "Ambient music starts",
          holdMs: 1200,
          targets: {
            "rs-music": { on: true, source: "Jazz Trio", volume: 34 },
          },
        },
      ],
      highlight: ["pipeline-pendant", "connekt-profile", "smartspaces-audio"],
    },
    {
      id: "fine-dining",
      clockMin: 21 * 60,
      name: "Fine Dining",
      icon: "✦",
      blurb:
        "The darkest the room goes while still serving. Ambient almost out, everything carried by the table pools and the pendants — the contrast ratio is the point, and it is what separates a restaurant from a dining hall.",
      fadeMs: 2600,
      targets: {
        /**
         * Ten per cent, and it stays on.
         *
         * The temptation in a fine-dining preset is to switch the ambient
         * layer off entirely, and it is wrong: with nothing on the floor the
         * room loses its edges and staff cannot read a table number. Ten per
         * cent is below conscious notice and is the difference between
         * intimate and unusable.
         *
         * The cove comes down with it, to fifteen. This is the one scene in
         * the room whose argument is contrast, and a lit ceiling ring is the
         * single thing most able to flatten it — the light has to come from
         * the tables and the pendants or the scene is just a dimmer Dinner.
         */
        "rs-general": { on: true, level: 10, cct: 2700, sat: 0 },
        "rs-tunable": { on: true, level: 26, cct: 2200, sat: 0 },
        "rs-cove": { on: true, level: 15, cct: 2200, sat: 0 },
        "rs-pendant": { on: true, level: 95, cct: 2000, sat: 0 },
        "rs-arch": { on: true, level: 50, cct: 2500, sat: 0 },
        "rs-feature": { on: true, level: 64, cct: 2700, sat: 0 },
        "rs-table": { on: true, level: 100, cct: 1950, sat: 0 },
        "rs-rgb": { on: false },
        "rs-ac": { on: true, setpointC: 22, mode: "cool", fan: 1 },
        "rs-music": { on: true, source: "Jazz Trio", volume: 26 },
      },
      highlight: ["pipeline-pendant", "magneto-track"],
    },
    {
      id: "private-event",
      clockMin: 20 * 60,
      name: "Private Event",
      icon: "◈",
      blurb:
        "A booked floor. Brighter and more even than dinner service because the room is now a venue rather than a restaurant — people stand, circulate and look at each other rather than at a plate.",
      fadeMs: 2000,
      targets: {
        "rs-general": { on: true, level: 72, cct: 3000, sat: 0 },
        "rs-tunable": { on: true, level: 76, cct: 2800, sat: 0 },
        "rs-cove": { on: true, level: 88, cct: 2700, sat: 0 },
        "rs-pendant": { on: true, level: 70, cct: 2300, sat: 0 },
        "rs-arch": { on: true, level: 70, cct: 2900, sat: 0 },
        "rs-feature": { on: true, level: 88, cct: 3000, sat: 0 },
        "rs-table": { on: true, level: 70, cct: 2200, sat: 0 },
        /**
         * Off, where it used to carry a low amber wash.
         *
         * The wash was the right instinct for a dressed room and the wrong
         * circuit to do it with. `rs-rgb` is mounted low behind the planters
         * and up the window piers, so in the plates it throws colour onto
         * the ceiling, and at 38 saturation that read as a pink cast over a
         * scene whose whole point is that it looks like an expensive private
         * dinner. Party is now the only scene in the room with any colour in
         * it, and the dressing comes from the cove and the pendants instead.
         */
        "rs-rgb": { on: false },
        "rs-ac": { on: true, setpointC: 21, mode: "cool", fan: 3 },
        "rs-music": { on: true, source: "Jazz Trio", volume: 38 },
      },
      highlight: ["flexi-delta-rgb", "connekt-profile"],
    },
    {
      id: "party",
      clockMin: 23 * 60,
      name: "Party / Celebration",
      icon: "✸",
      blurb:
        "Colour takes the room. Ambient down to a floor-safety level, the white layers pulled back, and the RGB runs at full saturation — the one scene where the architecture stops being the subject.",
      fadeMs: 1200,
      targets: {
        /**
         * The colour is carried by the architecture, not by a strip of tape.
         *
         * The earlier version ran the colour circuit alone against a dimmed
         * white room, and because that circuit is mounted low it put a bright
         * line along the sill and left everything above it grey. A party is
         * not a line; it is the ceiling.
         *
         * So the cove and the architectural profiles come up rather than
         * down — they are RGBW fixtures and `weights.ts` puts them on the
         * colour bus's hue while it is running — and the white layers go to
         * almost nothing, because colour on top of white is a pastel and the
         * point here is saturation. What is left in white is the five per
         * cent of ambient that keeps the floor safe, the table lamps at a
         * third so every cover still has its own pool, and enough pendant to
         * keep the cluster readable as glass rather than as silhouette.
         */
        "rs-general": { on: true, level: 5, cct: 2700, sat: 0 },
        "rs-tunable": { on: false },
        "rs-cove": { on: true, level: 80, cct: 2200, sat: 0 },
        "rs-pendant": { on: true, level: 25, cct: 2000, sat: 0 },
        "rs-arch": { on: true, level: 60, cct: 2500, sat: 0 },
        "rs-feature": { on: true, level: 30, cct: 2700, sat: 0 },
        "rs-table": { on: true, level: 35, cct: 2000, sat: 0 },
        "rs-rgb": { on: true, level: 100, cct: 4000, hue: 320, sat: 100 },
        "rs-ac": { on: true, setpointC: 20, mode: "cool", fan: 4 },
        "rs-music": { on: true, source: "Club Set", volume: 56 },
      },
      /**
       * Magenta to violet and back, twice a minute.
       *
       * Slow enough that nobody watches it happen and fast enough that the
       * room is never the same colour twice in a sitting, which is the
       * difference between a party and a photograph of one. Forty-five
       * degrees is a deliberately short arc: a full hue rotation sweeps
       * through green on its way round and a dining room lit green is a
       * fault report, not a scene.
       */
      drift: {
        deviceId: "rs-rgb",
        fromHue: 320,
        toHue: 275,
        periodMs: 20000,
      },
      highlight: ["flexi-delta-rgb", "smartspaces-audio"],
    },
    {
      id: "cleaning",
      clockMin: 1 * 60,
      name: "Cleaning",
      icon: "✚",
      blurb:
        "Everything decorative off, full cool white on the floor. Nobody is being sold anything at one in the morning, and the staff turning the room around need to see what they are doing.",
      fadeMs: 900,
      targets: {
        "rs-general": { on: true, level: 100, cct: 5000, sat: 0 },
        "rs-tunable": { on: true, level: 100, cct: 5000, sat: 0 },
        "rs-cove": { on: false },
        "rs-pendant": { on: false },
        "rs-arch": { on: false },
        "rs-feature": { on: false },
        "rs-table": { on: false },
        "rs-rgb": { on: false },
        "rs-ac": { on: true, setpointC: 25, mode: "cool", fan: 1 },
        "rs-music": { on: false },
      },
      highlight: ["proplus-downlight"],
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Automation                                                        */
  /* ---------------------------------------------------------------- */

  rules: [
    {
      id: "rs-occupancy",
      kind: "occupancy",
      name: "Between Services",
      explain:
        "The floor falls back when nobody has been on it for fifteen minutes and comes straight back when they are. Feature and decorative layers are untouched: a wine wall going dark while the bar is still serving is a fault, not a saving.",
      enabledByDefault: true,
      sensorId: "rs-occ",
      holdMin: 15,
      onOccupied: {
        "rs-general": { on: true, level: 62, fadeMs: 1200, sat: 0 },
        "rs-tunable": { on: true, level: 64, fadeMs: 1400, sat: 0 },
      },
      onVacant: {
        "rs-general": { on: true, level: 25, fadeMs: 3000, sat: 0 },
        "rs-tunable": { on: true, level: 25, fadeMs: 3400, sat: 0 },
      },
    },
    {
      id: "rs-daylight",
      kind: "daylight",
      name: "Daylight Harvesting",
      explain:
        "The ambient layer gives back what the façade is already supplying, regulated to 200 lux on a window table. Cove, pendants, feature and table lighting are excluded — none of them is there to make lux, and trimming them would undo the scene.",
      enabledByDefault: true,
      deviceIds: ["rs-general"],
      targetLux: 200,
      minLevel: 12,
    },
    {
      id: "rs-circadian",
      kind: "circadian",
      name: "Circadian Tuning",
      explain:
        "The ambient and track layers follow the hour, cool through the middle of the day and warm at either end, so the ceiling agrees with the window instead of fighting it. The decorative layers hold their warmth around the clock, because a filament has no business tracking the sun.",
      enabledByDefault: true,
      deviceIds: ["rs-general", "rs-tunable"],
      curve: [
        { min: 0, cct: 2700 },
        { min: 360, cct: 3400 },
        { min: 540, cct: 4600 },
        { min: 780, cct: 4800 },
        { min: 1020, cct: 3600 },
        { min: 1140, cct: 2800 },
        { min: 1320, cct: 2500 },
      ],
    },
  ],

  /* ---------------------------------------------------------------- */

  defaults: {
    "rs-general": { on: true, level: 44, cct: 3400, sat: 0 },
    "rs-tunable": { on: true, level: 58, cct: 3200, sat: 0 },
    "rs-cove": { on: true, level: 60, cct: 2800, sat: 0 },
    "rs-pendant": { on: true, level: 40, cct: 2500, sat: 0 },
    "rs-arch": { on: true, level: 55, cct: 2900, sat: 0 },
    "rs-feature": { on: true, level: 70, cct: 3000, sat: 0 },
    "rs-table": { on: true, level: 45, cct: 2300, sat: 0 },
    "rs-rgb": { on: false, level: 0, cct: 2600, hue: 312, sat: 90 },
    "rs-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
    "rs-music": { on: true, source: "Jazz Trio", volume: 32 },
  },

  openingSceneId: "dinner",
  openingClockMin: 20 * 60 + 15,

  environment: {
    sunriseMin: 6 * 60 + 20,
    sunsetMin: 18 * 60 + 55,
    outdoorPeakLux: 95000,
    /**
     * Just under the lobby's, and for a plainer reason than it looks.
     *
     * Both rooms have one fully glazed side. This one is shallower front to
     * back, which would push the figure up, but it is also single height
     * where the lobby is double, which pulls it down harder — a tall window
     * puts daylight much further into a plan than a wide one does.
     */
    windowFactor: 0.0035,
    /**
     * 200 lux, which is a dining room and not an office.
     *
     * The design figure for restaurant dining is 100-200 lux on the table
     * with accent on top of it, against 400 for an open-plan floor. 200 is
     * the lunch number; dinner service runs at a third of it and is supposed
     * to.
     */
    designLux: 200,
    outdoorMinC: 26,
    outdoorMaxC: 34,
  },

  baseline: {
    /**
     * Halogen throughout, which is what a restaurant of this vintage runs.
     *
     * Dining rooms held on to halogen longer than any other commercial space
     * because early LED rendered food badly, and a chef who has seen a steak
     * look grey under 80 CRI does not ask twice. The saving here starts as a
     * straight wattage swap and only then becomes a control argument.
     */
    lightingWatts: 16400,
    hvacWatts: 9200,
    operatingHours: { startMin: 7 * 60, endMin: 25 * 60 + 30 },
    hvacHours: { startMin: 6 * 60 + 30, endMin: 26 * 60 },
    note:
      "50 W halogen downlights and track throughout, decorative pendants on the same uncontrolled circuit, and fan-coils with no setback between services — a dining room fitted out around 2012.",
  },

  tariffPerKwh: 11.5,
  currency: "₹",
};
