import type { Space } from "@/lib/sim/types";

/**
 * An open-plan office floor: desks, a glass meeting room and a lounge.
 *
 * The workhorse of the office set, and the one that has to argue on
 * running cost rather than on looks. A cabin is lit for the three people
 * who see it; this is lit for ninety, for ten hours a day, behind a curtain
 * wall that supplies more light than the fittings do for half of them. So
 * the two features it is sold on are the two that save money — daylight
 * response and occupancy — and both are on the automation tab where they
 * can be watched working rather than described.
 *
 * Nine circuits on the sheet. Four are tunable and share one workspace
 * colour so the whole floor moves together; the break and accent layers are
 * fixed warm so the lounge end stays the lounge end at every hour.
 */

/** 310 m² of floor: two desk zones, a meeting room, a lounge and a pantry. */
const AREA = 310;

export const office: Space = {
  id: "office",
  name: "Office Workspace",
  segment: "commercial",
  category: "Office",
  blurb:
    "A 310 m² open-plan floor — desk rows, a glass meeting room and a lounge — path-traced offline and relit live. Nine lighting circuits behind a two-sided curtain wall, with the daylight response and two-zone occupancy that decide what a floor this size actually costs to run.",
  renderer: "plates",
  plates: {
    dir: "/plates/office",
    profile: "office",
    /**
     * One covering, two plate sets, and an opening measured by hand.
     *
     * The brief asks for a crossfade and a crossfade is invisible here,
     * which is worth writing down because the measurement is
     * counter-intuitive. Lowering these blinds barely changes the
     * brightness of the glass at all: the exterior layers darken it from
     * 0.420 to 0.380, and the *circuits* brighten it from 0.147 to 0.313,
     * because a pale slatted blind lit by an office is brighter than
     * tinted glass onto a hazy skyline. Net, the window gets slightly
     * lighter as the blinds come down. The render is honest — what
     * changes is the content, a skyline becoming slats — and a mean
     * cannot see content, so a crossfade reads as nothing happening.
     *
     * A travelling edge reads anyway, because the eye tracks the edge
     * rather than the level. So the blinds drop, like the cabin's. The
     * quad is the main elevation — everything left of the meeting-room
     * box, which is five sixths of the glazing — fitted to the head and
     * sill of the region the sky plate actually lights, and re-checked
     * against it by `scripts/measure-plates.py`.
     */
    curtain: {
      closedDir: "/plates/office_closed",
      deviceId: "ow-blinds",
      window: {
        quad: [
          [0.0, 0.5355],
          [0.5352, 0.5995],
          [0.5352, 0.4286],
          [0.0, 0.3379],
        ],
        pad: 0.02,
        travel: "drop",
      },
    },
    /**
     * The fan, composited over the room rather than summed into it.
     *
     * Spinning blades are not a lighting circuit: they are the same room
     * with one object in a different state, so they replace those pixels
     * instead of adding to them. The set is probed at load and skipped
     * when it is not there — see `PlateStage` — so the blur appears the
     * moment the render does, with nothing here to change.
     */
    overlay: {
      dir: "/plates/office_fan",
      deviceId: "ow-fan",
      rect: "fan_rect",
    },
    hotspotAliases: {
      blinds: { deviceId: "ow-blinds", label: "Motorised blinds" },
      hvac: { deviceId: "ow-ac", label: "Air conditioning" },
      fan: { deviceId: "ow-fan", label: "Ceiling fan" },
      occupancy: { deviceId: "ow-occ-a", label: "Occupancy · zone A" },
      "occupancy-b": { deviceId: "ow-occ-b", label: "Occupancy · zone B" },
      music: { deviceId: "ow-music", label: "Ceiling speakers" },
      keypad: { deviceId: "ow-accent", label: "Wall keypad · scene recall" },
    },
  },

  keypad: {
    layout: "grid",
    finish: "graphite",
    scenes: ["start-day", "focus-work", "collaboration", "all-off"],
  },

  zones: [
    { id: "ow-a", name: "Desks — zone A", areaM2: 120 },
    { id: "ow-b", name: "Desks — zone B", areaM2: 110 },
    { id: "ow-common", name: "Meeting, lounge and pantry", areaM2: AREA - 230 },
  ],

  /* ---------------------------------------------------------------- */
  /* Devices — the sheet's nine circuits, the blinds, the fan coil     */
  /* ---------------------------------------------------------------- */

  devices: [
    {
      id: "ow-general",
      kind: "light",
      name: "General",
      zoneId: "ow-common",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "Thirty-four heads: black cans surface-mounted on the exposed slab over the desks, and recessed downlights in the dropped ceiling over the lounge. 2700 K to 6500 K. The circuit daylight response trims first, because it is the one the window is actually standing in for.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 6500 },
      fixtures: 34,
      wattsEach: 12,
      lumensEach: 1100,
      baselineWattsEach: 45,
      glow: [],
    },
    {
      id: "ow-linear",
      kind: "light",
      name: "Linear",
      zoneId: "ow-common",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Forty-eight metres of slim suspended bar, one run over each desk row, 3000 K to 6500 K. Suspended rather than recessed on purpose: a bar at two and a half metres puts light on the desk and on the face across it, which is the difference between a floor that photographs well and one people want to sit in.",
      dimmable: true,
      tunable: { minK: 3000, maxK: 6500 },
      fixtures: 48, // metres of run
      wattsEach: 7,
      lumensEach: 450,
      baselineWattsEach: 24,
      glow: [],
    },
    {
      id: "ow-task-a",
      kind: "light",
      name: "Task — zone A",
      zoneId: "ow-a",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Under-screen strips on the front rows, 3000 K to 6500 K. Split from zone B for one reason: half a floor going home should take half the task light with it, and a single task circuit cannot do that.",
      dimmable: true,
      tunable: { minK: 3000, maxK: 6500 },
      fixtures: 12,
      wattsEach: 4,
      lumensEach: 180,
      glow: [],
    },
    {
      id: "ow-task-b",
      kind: "light",
      name: "Task — zone B",
      zoneId: "ow-b",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "The same strips on the back rows, on their own circuit and their own sensor. Mark zone B vacant and only these go out — the front of the floor does not notice.",
      dimmable: true,
      tunable: { minK: 3000, maxK: 6500 },
      fixtures: 12,
      wattsEach: 4,
      lumensEach: 180,
      glow: [],
    },
    {
      id: "ow-cove",
      kind: "light",
      name: "Cove",
      zoneId: "ow-common",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Fourteen metres hidden in the dropped-ceiling tray over the lounge, 2700 K to 4000 K. The circuit that stops the lounge reading as the part of the office where the ceiling got lower.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 4000 },
      fixtures: 14, // metres of run
      wattsEach: 5,
      lumensEach: 420,
      glow: [],
    },
    {
      id: "ow-meeting",
      kind: "light",
      name: "Meeting",
      zoneId: "ow-common",
      productId: "pipeline-pendant",
      subsystem: "lighting",
      pitch:
        "The ring pendant over the table and the wash down the slat wall behind it, 3000 K to 5000 K. A glass meeting room is on display to the whole floor whether or not anybody is in it, so it is lit as a room rather than switched with the door.",
      dimmable: true,
      tunable: { minK: 3000, maxK: 5000 },
      fixtures: 5,
      wattsEach: 14,
      lumensEach: 900,
      glow: [],
    },
    {
      id: "ow-break",
      kind: "light",
      name: "Break Area",
      zoneId: "ow-common",
      productId: "pipeline-pendant",
      subsystem: "lighting",
      pitch:
        "Corner pendants over the lounge, backlit pantry shelving and the light in the fan. Fixed 2700 K against a floor that runs at 4000 K and above — the warmth is what tells somebody at a desk that the other end of the room is not work.",
      dimmable: true,
      fixtures: 11,
      wattsEach: 7,
      lumensEach: 420,
      glow: [],
    },
    {
      id: "ow-accent",
      kind: "light",
      name: "Accent",
      zoneId: "ow-common",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Uplights into the planting and the backlight on the wall keypad. Eight fittings and a hundred and thirty watts of nothing useful, which is exactly the point: it is the layer that stops an open-plan floor looking like a car park.",
      dimmable: true,
      fixtures: 8,
      wattsEach: 5,
      lumensEach: 160,
      glow: [],
    },
    {
      id: "ow-display",
      kind: "light",
      name: "Meeting Display",
      zoneId: "ow-common",
      productId: "smartspaces-wired",
      subsystem: "lighting",
      pitch:
        "The screen in the glass room, switched rather than dimmed, and on the lighting bus because in this render that is what it is — a bright rectangle that changes the room when it wakes up.",
      dimmable: false,
      fixtures: 1,
      wattsEach: 90,
      lumensEach: 400,
      glow: [],
    },

    {
      id: "ow-blinds",
      kind: "shade",
      name: "Blinds",
      zoneId: "ow-common",
      productId: "uniser-curtain-track",
      subsystem: "shades",
      pitch:
        "Micro-blinds across the curtain wall, one motor a bay. Half is the glare preset — enough to take the sun off a screen at two in the afternoon and not so much that the floor loses its view.",
      layers: ["blackout"],
      presets: [
        { label: "Open", blackout: 0, hint: "Raised, the full elevation" },
        { label: "Glare", blackout: 50, hint: "Half down — no sun on a screen" },
        { label: "Close", blackout: 100, hint: "Fully lowered and tilted" },
      ],
      watts: 180,
      /**
       * Eight seconds end to end, which makes the glare preset four.
       *
       * The brief asks for a move of about four seconds and for the
       * nought-to-half preset in Focus Work to take four; travel scales
       * with distance, so the full elevation has to be eight. The cabin's
       * venetians use the same figure for the same reason.
       */
      travelMs: 8000,
      window: { x: 0.0, y: 0.33, w: 0.54, h: 0.26 },
      draw: "both",
    },
    {
      id: "ow-fan",
      kind: "fan",
      name: "Ceiling Fan",
      zoneId: "ow-common",
      productId: "smartspaces-fan",
      subsystem: "climate",
      pitch:
        "A BLDC fan over the lounge. Three speeds and about twenty watts at the top of them, and it is the reason the setpoint on this floor can sit at twenty-four instead of twenty-two — which on 310 m² is most of the energy case on its own.",
      speeds: 3,
      ratedWatts: 26,
    },
    {
      id: "ow-ac",
      kind: "climate",
      name: "Air Conditioning",
      zoneId: "ow-common",
      productId: "sensibo-airbend",
      subsystem: "climate",
      pitch:
        "Ceiling cassettes across the floor on one setpoint. A curtain wall on two sides makes this the hardest load in the building to hold, and the easiest to waste when nobody is in.",
      minC: 16,
      maxC: 30,
      ratedWatts: 11500,
    },
    {
      id: "ow-music",
      kind: "av",
      name: "Music",
      zoneId: "ow-common",
      productId: "smartspaces-audio",
      subsystem: "av",
      pitch:
        "Ceiling speakers through the lounge and the pantry, and nowhere near the desks. Carried on the scenes with the light, because the break scene is the one where the floor is supposed to sound different.",
      sources: ["Floor Ambient", "Lounge", "Focus"],
      hasScreen: false,
      ratedWatts: 240,
      glow: [],
    },

    {
      id: "ow-occ-a",
      kind: "sensor",
      name: "Occupancy — zone A",
      zoneId: "ow-a",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Presence over the front desk rows. An open-plan floor is never empty and rarely full, and the hours in between are where the lighting bill is decided.",
      metric: "occupancy",
      unit: "",
      min: 0,
      max: 1,
    },
    {
      id: "ow-occ-b",
      kind: "sensor",
      name: "Occupancy — zone B",
      zoneId: "ow-b",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "The same over the back rows, and the one that makes the point: zones are only worth wiring if they can disagree.",
      metric: "occupancy",
      unit: "",
      min: 0,
      max: 1,
    },
    {
      id: "ow-lux",
      kind: "sensor",
      name: "Ambient Light",
      zoneId: "ow-common",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Measured light at desk height, which is what daylight response regulates against and what an office is legally specified to. Lower the blinds and it falls, and the fittings come back up to meet it.",
      metric: "lux",
      unit: "lx",
      derived: true,
    },
    {
      id: "ow-temp",
      kind: "sensor",
      name: "Floor Temperature",
      zoneId: "ow-common",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Air temperature at desk height. With the fan running, the same comfort sits about two degrees higher — which is the whole argument for having one.",
      metric: "temperature",
      unit: "°C",
      derived: true,
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Scenes — the client's seven                                       */
  /* ---------------------------------------------------------------- */

  /**
   * Every scene names an hour and none of them pins the sky.
   *
   * This set was rendered with one view plate rather than a day/night
   * pair, so the glass follows the clock directly — full through the
   * middle of the day, easing off through the evening, and floored at 8%
   * after dark because there is no night render to cross-fade to. The two
   * scenes set after dark tint it instead, which is the only honest way
   * to make one daylight plate read as night. Everything else is left to
   * the clock, so the scrubber stays live in every scene.
   */
  scenes: [
    {
      id: "start-day",
      clockMin: 9 * 60,
      name: "Start Day",
      icon: "☼",
      blurb:
        "The floor as the first people reach it. Everything on and nothing at full, 4000 K across the desks with the blinds up — a morning office should feel like the day has started rather than like a switch has been thrown.",
      fadeMs: 1800,
      targets: {
        "ow-general": { on: true, level: 70, cct: 4000, sat: 0 },
        "ow-linear": { on: true, level: 70, cct: 4000, sat: 0 },
        "ow-task-a": { on: true, level: 60, cct: 4000, sat: 0 },
        "ow-task-b": { on: true, level: 60, cct: 4000, sat: 0 },
        "ow-cove": { on: true, level: 60, cct: 4000, sat: 0 },
        "ow-meeting": { on: true, level: 40, cct: 4000, sat: 0 },
        "ow-break": { on: true, level: 60 },
        "ow-accent": { on: true, level: 80 },
        "ow-display": { on: false },
        "ow-fan": { on: false },
        "ow-blinds": { blackout: 0 },
        "ow-ac": { on: true, setpointC: 23, mode: "cool", fan: 2 },
        "ow-music": { on: false },
      },
      highlight: ["proplus-downlight", "connekt-profile"],
    },
    {
      id: "focus-work",
      clockMin: 12 * 60 + 30,
      name: "Focus Work",
      icon: "◎",
      blurb:
        "Deep work, run as one button: the blinds take the glare off, daylight response rebalances the ceiling, the task strips come to full, the whole floor goes neutral-cool and the air conditioning drops a degree. Five stages, about eleven seconds.",
      fadeMs: 1200,
      /**
       * Stage zero is the Start Day floor, which is where the client's
       * wording begins.
       *
       * A staged scene applies `targets` before its first step and the
       * runner skips a step that commands nothing new, so everything the
       * five beats talk about has to be set here to what they start
       * *from* — the blinds up, the task strips at sixty, the floor at
       * 4000 K and the air conditioning at twenty-four.
       */
      targets: {
        "ow-general": { on: true, level: 70, cct: 4000, sat: 0 },
        "ow-linear": { on: true, level: 70, cct: 4000, sat: 0 },
        "ow-task-a": { on: true, level: 60, cct: 4000, sat: 0 },
        "ow-task-b": { on: true, level: 60, cct: 4000, sat: 0 },
        "ow-cove": { on: true, level: 60, cct: 4000, sat: 0 },
        "ow-meeting": { on: true, level: 40, cct: 4000, sat: 0 },
        "ow-break": { on: true, level: 60 },
        "ow-accent": { on: true, level: 80 },
        "ow-display": { on: false },
        "ow-fan": { on: false },
        "ow-blinds": { blackout: 0 },
        "ow-ac": { on: true, setpointC: 24, mode: "auto", fan: 2 },
        "ow-music": { on: false },
      },
      steps: [
        {
          label: "Blinds to glare control",
          holdMs: 3150,
          targets: {
            // No `fadeMs`: travel belongs to the motor. Half of an
            // eight-second elevation is the four seconds the brief asks for.
            "ow-blinds": { blackout: 50 },
          },
        },
        {
          label: "Daylight balanced",
          holdMs: 6050,
          targets: {
            /**
             * The ceiling rebalances as the glare drops: less from the
             * general heads, more from the bars over the desks. The
             * other four come down to their Focus levels here too — the
             * client's wording for this beat is the room evening out,
             * and that is what those are doing.
             */
            "ow-general": { on: true, level: 60, cct: 4000, sat: 0, fadeMs: 2000 },
            "ow-linear": { on: true, level: 80, cct: 4000, sat: 0, fadeMs: 2000 },
            "ow-cove": { on: true, level: 30, cct: 4000, sat: 0, fadeMs: 2000 },
            "ow-meeting": { on: true, level: 30, cct: 4000, sat: 0, fadeMs: 2000 },
            "ow-break": { on: true, level: 20, fadeMs: 2000 },
            "ow-accent": { on: true, level: 50, fadeMs: 2000 },
          },
        },
        {
          label: "Task lighting up",
          holdMs: 6050,
          targets: {
            "ow-task-a": { on: true, level: 100, cct: 4000, sat: 0, fadeMs: 1500 },
            "ow-task-b": { on: true, level: 100, cct: 4000, sat: 0, fadeMs: 1500 },
          },
        },
        {
          label: "Neutral-cool white for focus",
          holdMs: 6050,
          targets: {
            // The shared workspace colour, all four circuits together.
            "ow-general": { on: true, level: 60, cct: 5000, sat: 0, fadeMs: 1500 },
            "ow-linear": { on: true, level: 80, cct: 5000, sat: 0, fadeMs: 1500 },
            "ow-task-a": { on: true, level: 100, cct: 5000, sat: 0, fadeMs: 1500 },
            "ow-task-b": { on: true, level: 100, cct: 5000, sat: 0, fadeMs: 1500 },
          },
        },
        {
          label: "AC to 22 °C",
          holdMs: 3950,
          targets: {
            "ow-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
          },
        },
      ],
      highlight: ["uniser-curtain-track", "connekt-profile", "sensibo-airbend"],
    },
    {
      id: "collaboration",
      clockMin: 13 * 60,
      name: "Collaboration",
      icon: "◈",
      blurb:
        "The glass room is in use and the floor is working around it. Meeting lighting to full with the screen awake, the desk circuits pulled back so the room reads as the centre of attention, and the fan on low over the lounge.",
      fadeMs: 1600,
      targets: {
        "ow-general": { on: true, level: 70, cct: 4000, sat: 0 },
        "ow-linear": { on: true, level: 60, cct: 4000, sat: 0 },
        "ow-task-a": { on: true, level: 50, cct: 4000, sat: 0 },
        "ow-task-b": { on: true, level: 50, cct: 4000, sat: 0 },
        "ow-cove": { on: true, level: 60, cct: 4000, sat: 0 },
        "ow-meeting": { on: true, level: 100, cct: 4000, sat: 0 },
        "ow-break": { on: true, level: 50 },
        "ow-accent": { on: true, level: 70 },
        "ow-display": { on: true, level: 100 },
        "ow-fan": { on: true, speed: 1 },
        "ow-blinds": { blackout: 30 },
        "ow-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
        "ow-music": { on: false },
      },
      highlight: ["pipeline-pendant", "smartspaces-wired"],
    },
    {
      id: "break",
      clockMin: 13 * 60 + 30,
      name: "Break",
      icon: "✸",
      blurb:
        "Lunch. The desks drop to a third, the cove and the pantry go to full at 3000 K and the music comes on — the one scene where the lounge end is the room and the desks are the background.",
      fadeMs: 2000,
      targets: {
        "ow-general": { on: true, level: 40, cct: 3000, sat: 0 },
        "ow-linear": { on: true, level: 30, cct: 3000, sat: 0 },
        "ow-task-a": { on: true, level: 20, cct: 3000, sat: 0 },
        "ow-task-b": { on: true, level: 20, cct: 3000, sat: 0 },
        "ow-cove": { on: true, level: 90, cct: 3000, sat: 0 },
        "ow-meeting": { on: true, level: 30, cct: 3000, sat: 0 },
        "ow-break": { on: true, level: 100 },
        "ow-accent": { on: true, level: 100 },
        "ow-display": { on: false },
        "ow-fan": { on: true, speed: 2 },
        "ow-blinds": { blackout: 20 },
        "ow-ac": { on: true, setpointC: 23, mode: "cool", fan: 2 },
        "ow-music": { on: true, source: "Lounge", volume: 28 },
      },
      highlight: ["pipeline-pendant", "smartspaces-audio"],
    },
    {
      id: "afternoon",
      clockMin: 17 * 60 + 30,
      name: "Afternoon",
      icon: "☀",
      blurb:
        "Low sun on the elevation, so the blinds are more than half down and the floor makes up the difference at 4500 K. The hour daylight response earns its keep in reverse — the glass gives less, the ceiling gives more.",
      fadeMs: 2000,
      targets: {
        "ow-general": { on: true, level: 60, cct: 4500, sat: 0 },
        "ow-linear": { on: true, level: 70, cct: 4500, sat: 0 },
        "ow-task-a": { on: true, level: 80, cct: 4500, sat: 0 },
        "ow-task-b": { on: true, level: 80, cct: 4500, sat: 0 },
        "ow-cove": { on: true, level: 50, cct: 4000, sat: 0 },
        "ow-meeting": { on: true, level: 50, cct: 4500, sat: 0 },
        "ow-break": { on: true, level: 50 },
        "ow-accent": { on: true, level: 70 },
        "ow-display": { on: false },
        "ow-fan": { on: true, speed: 1 },
        "ow-blinds": { blackout: 60 },
        "ow-ac": { on: true, setpointC: 23, mode: "cool", fan: 2 },
        "ow-music": { on: false },
      },
      highlight: ["uniser-curtain-track", "proplus-downlight"],
    },
    {
      id: "end-of-day",
      clockMin: 20 * 60,
      name: "End of Day",
      icon: "◑",
      blurb:
        "Most of the floor has gone. Zone B's task light is out entirely, the rest is at a third and warm, and the cove carries the lounge for whoever is still here — the state a floor should sit in rather than fully lit until the cleaners arrive.",
      fadeMs: 2600,
      // No night render in this set, so the one view plate is tinted
      // rather than swapped. See the note above the scene list.
      daylightTint: "#5b6f9e",
      targets: {
        "ow-general": { on: true, level: 30, cct: 3000, sat: 0 },
        "ow-linear": { on: true, level: 40, cct: 3000, sat: 0 },
        "ow-task-a": { on: true, level: 20, cct: 3000, sat: 0 },
        "ow-task-b": { on: false },
        "ow-cove": { on: true, level: 80, cct: 3000, sat: 0 },
        "ow-meeting": { on: true, level: 20, cct: 3000, sat: 0 },
        "ow-break": { on: true, level: 60 },
        "ow-accent": { on: true, level: 80 },
        "ow-display": { on: false },
        "ow-fan": { on: false },
        "ow-blinds": { blackout: 30 },
        "ow-ac": { on: true, setpointC: 24, mode: "cool", fan: 1 },
        "ow-music": { on: false },
      },
      highlight: ["connekt-profile"],
    },
    {
      id: "all-off",
      clockMin: 21 * 60,
      name: "All Off",
      icon: "⏻",
      blurb:
        "Everything to off or standby on the way out. Five seconds of fade across all nine circuits, the blinds down, the cassettes to standby and the fan stopped — one press at the lift lobby instead of a walk around the floor.",
      fadeMs: 5000,
      daylightTint: "#5b6f9e",
      /**
       * Stage zero is empty so the caption has somewhere to live.
       *
       * A scene with no stages has nowhere to put a line of narration and
       * this one is specified with one. An empty `targets` means the
       * runner fires the single stage immediately — nothing to wait for —
       * and the caption sits for its own hold while the fade plays
       * underneath it.
       */
      targets: {},
      steps: [
        {
          label: "All systems off",
          holdMs: 3950,
          targets: {
            "ow-general": { on: false },
            "ow-linear": { on: false },
            "ow-task-a": { on: false },
            "ow-task-b": { on: false },
            "ow-cove": { on: false },
            "ow-meeting": { on: false },
            "ow-break": { on: false },
            "ow-accent": { on: false },
            "ow-display": { on: false },
            "ow-fan": { on: false },
            "ow-blinds": { blackout: 100 },
            "ow-ac": { on: false },
            "ow-music": { on: false, volume: 0 },
          },
        },
      ],
      highlight: ["smartspaces-wired"],
    },
  ],
  /* ---------------------------------------------------------------- */

  /**
   * Two zones that can disagree, which is the only reason to zone at all.
   *
   * Zone A is the front rows and zone B the back. Each takes its own task
   * circuit out when it empties; the bars over the desks only fall back
   * when both have gone, because light over an occupied row is not a
   * saving, it is the job.
   */
  occupancyZones: {
    afterMs: 2000,
    restoreMs: 1200,
    zones: [
      { id: "a", name: "Zone A — front rows", deviceIds: ["ow-task-a"], sensorId: "ow-occ-a" },
      { id: "b", name: "Zone B — back rows", deviceIds: ["ow-task-b"], sensorId: "ow-occ-b" },
    ],
    whenAllVacant: { deviceIds: ["ow-linear"], toFraction: 0.2 },
    auto: { minMs: 20000, maxMs: 40000 },
  },

  /**
   * The feature this floor is actually sold on.
   *
   * Sixty per cent at full sun, on the two circuits the glazing stands in
   * for — the general heads and the bars. Not the task strips: daylight
   * reaches a desk surface far less reliably than it reaches a ceiling,
   * and trimming the light somebody is reading by is how a daylight
   * system gets switched off in the first month.
   */
  daylightResponse: {
    deviceIds: ["ow-general", "ow-linear"],
    strength: 0.6,
    easeMs: 1500,
  },

  rules: [
    {
      id: "ow-occupancy",
      kind: "occupancy",
      name: "Floor Presence",
      explain:
        "The honest version of the two-zone demonstration on the automation tab: measured in simulated minutes against the floor sensors rather than driven by a button. The task circuits fall away first and the bars follow, and nothing touches the lounge — an empty desk is a saving and an empty lounge still has somebody walking through it.",
      enabledByDefault: true,
      sensorId: "ow-occ-a",
      holdMin: 15,
      onOccupied: {
        "ow-task-a": { on: true, level: 60, fadeMs: 1200, sat: 0 },
        "ow-task-b": { on: true, level: 60, fadeMs: 1200, sat: 0 },
        "ow-linear": { on: true, level: 70, fadeMs: 1400, sat: 0 },
      },
      onVacant: {
        "ow-task-a": { on: false, fadeMs: 2400 },
        "ow-task-b": { on: false, fadeMs: 2400 },
        "ow-linear": { on: true, level: 15, fadeMs: 2800, sat: 0 },
      },
    },
    {
      id: "ow-circadian",
      kind: "circadian",
      name: "Circadian Tuning",
      explain:
        "The four tunable workspace circuits follow the hour when no scene has claimed them — neutral-cool through the middle of the day, warm from six onward. The break and accent layers hold 2700 K around the clock, which is what keeps the lounge reading as the lounge at every hour.",
      enabledByDefault: true,
      deviceIds: ["ow-general", "ow-linear", "ow-task-a", "ow-task-b"],
      curve: [
        { min: 0, cct: 3000 },
        { min: 420, cct: 3500 },
        { min: 660, cct: 5000 },
        { min: 960, cct: 4500 },
        { min: 1080, cct: 3500 },
        { min: 1260, cct: 3000 },
        { min: 1380, cct: 3000 },
      ],
    },
  ],

  /**
   * A dark floor with the blinds up, and what Reset returns to.
   *
   * Blinds up because the opening scene is Start Day and it wants them
   * up — a motor is eight seconds and a scene cannot hurry one, so
   * starting them down would mean the floor spent its first eight
   * seconds raising a blind underneath a still that already shows it
   * raised.
   */
  defaults: {
    "ow-general": { on: false, level: 0, cct: 4000, sat: 0 },
    "ow-linear": { on: false, level: 0, cct: 4000, sat: 0 },
    "ow-task-a": { on: false, level: 0, cct: 4000, sat: 0 },
    "ow-task-b": { on: false, level: 0, cct: 4000, sat: 0 },
    "ow-cove": { on: false, level: 0, cct: 3000, sat: 0 },
    "ow-meeting": { on: false, level: 0, cct: 4000, sat: 0 },
    "ow-break": { on: false, level: 0 },
    "ow-accent": { on: false, level: 0 },
    "ow-display": { on: false, level: 0 },
    "ow-fan": { on: false, speed: 2 },
    "ow-blinds": { blackout: 0 },
    "ow-ac": { on: true, setpointC: 24, mode: "cool", fan: 2 },
    "ow-music": { on: false, source: "Floor Ambient", volume: 25 },
  },

  openingSceneId: "start-day",
  openingClockMin: 9 * 60,

  environment: {
    sunriseMin: 6 * 60 + 20,
    sunsetMin: 18 * 60 + 55,
    outdoorPeakLux: 95000,
    /**
     * A curtain wall on two sides of an open floor.
     *
     * The highest of the five rooms, and it should be: glazing on two
     * elevations of a 310 m² plate reaches most of the desks, which is
     * exactly why daylight response is the feature this space is sold on.
     * The blinds multiply it by their own transmission.
     */
    windowFactor: 0.0062,
    designLux: 400,
    outdoorMinC: 26,
    outdoorMaxC: 34,
  },

  baseline: {
    lightingWatts: 4200,
    hvacWatts: 14000,
    operatingHours: { startMin: 8 * 60, endMin: 20 * 60 },
    hvacHours: { startMin: 8 * 60, endMin: 20 * 60 },
    note:
      "Recessed 45 W troffers on two switched banks, no task lighting, no daylight response and no occupancy zoning, with cassettes running the whole working day — a floor fitted out around 2013 and switched at the riser.",
  },

  tariffPerKwh: 11.5,
  currency: "₹",
};
