import type { Space } from "@/lib/sim/types";

/**
 * The boardroom: twenty seats, a screen and a wall of glass.
 *
 * The third office space, and the one sold on a single sentence — one
 * button and the room is ready to present. Everything here exists to make
 * that sentence true: the blinds, the screen, the projector, the speakers
 * and six lighting circuits all have to move in an order that a person
 * would recognise, and the Presentation scene is that order with captions
 * on it.
 *
 * Four circuits are tunable and share one room colour; the feature and
 * accent layers are fixed warm so the timber wall looks the same at every
 * setting. The seventh "circuit" is the projected image itself, which is a
 * light source in this room whether or not anybody calls it one.
 */

/** 96 m² of boardroom: a twenty-seat table, a screen wall and a credenza. */
const AREA = 96;

export const boardroom: Space = {
  id: "boardroom",
  name: "Boardroom",
  segment: "commercial",
  category: "Office",
  blurb:
    "A 96 m² twenty-seat boardroom — screen wall, timber slat wall and a glazed elevation — path-traced offline and relit live. Six lighting circuits, motorised blinds, a motorised screen and a projector, with the one-button presentation sequence a room like this is specified for.",
  renderer: "plates",
  plates: {
    dir: "/plates/boardroom",
    profile: "boardroom",
    /**
     * The blinds, as a plain two-state crossfade.
     *
     * No window quad here, unlike the office. These are roller blinds on
     * a single elevation seen almost edge-on, and the open and closed
     * sets differ across the whole of it rather than at a travelling
     * line — `sky` drops from 0.056 to 0.022, which is a change you can
     * see without needing an edge to follow.
     */
    curtain: { closedDir: "/plates/boardroom_closed", deviceId: "bd-blinds" },
    /**
     * The screen, which rolls rather than fades.
     *
     * `boardroom_screen` is the room with the blinds closed *and* the
     * screen down. Inside the screen's rectangle the stage takes every
     * row above the drop line from that set and the rest from the
     * blended base, so the fabric unrolls out of its ceiling slot and the
     * stone panel behind it comes back as it retracts.
     *
     * `bd_projection` is pinned because it is the one layer that only
     * exists in that set — it measures exactly 0.00000 in the other two —
     * and because its spill belongs to the whole room rather than to the
     * rectangle. See `Space.plates.overlay`.
     */
    overlay: {
      dir: "/plates/boardroom_screen",
      deviceId: "bd-av",
      rect: "screen_rect",
      travel: "drop",
      pinLayers: ["bd_projection"],
    },
    hotspotAliases: {
      screen: { deviceId: "bd-av", label: "Projection screen" },
      projector: { deviceId: "bd-projection", label: "Projector" },
      vc: { deviceId: "bd-camera", label: "Video conferencing" },
      speakers: { deviceId: "bd-av", label: "Tower speakers" },
      blinds: { deviceId: "bd-blinds", label: "Motorised blinds" },
      keypad: { deviceId: "bd-accent", label: "Table keypad · scene recall" },
    },
  },

  keypad: {
    layout: "grid",
    finish: "graphite",
    scenes: ["meeting", "presentation", "video-conference", "end-meeting"],
  },

  zones: [{ id: "bd-main", name: "Boardroom", areaM2: AREA }],

  avPanel: {
    deviceId: "bd-av",
    projectorId: "bd-projection",
    cameraId: "bd-camera",
    cameraLight: { deviceId: "bd-vc", level: 90 },
  },

  /* ---------------------------------------------------------------- */
  /* Devices                                                           */
  /* ---------------------------------------------------------------- */

  devices: [
    {
      id: "bd-general",
      kind: "light",
      name: "General",
      zoneId: "bd-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "Eighteen perimeter downlights, 2700 K to 6500 K. The circuit that comes down hardest for a presentation and the one that has to come straight back up when the lights go on for questions — which is the whole reason it is not on the same gang as the table.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 6500 },
      fixtures: 18,
      wattsEach: 11,
      lumensEach: 1000,
      baselineWattsEach: 45,
      glow: [],
    },
    {
      id: "bd-table",
      kind: "light",
      name: "Table",
      zoneId: "bd-main",
      productId: "pipeline-pendant",
      subsystem: "lighting",
      pitch:
        "A five-metre linear pendant down the length of the table, 2700 K to 6500 K. It stays on through the presentation — people take notes in the dark, and a boardroom that cannot be written in during a slide is a boardroom nobody uses twice.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 6500 },
      fixtures: 1,
      wattsEach: 90,
      lumensEach: 9000,
      baselineWattsEach: 180,
      glow: [],
    },
    {
      id: "bd-feature",
      kind: "light",
      name: "Feature",
      zoneId: "bd-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Thirty-two metres grazing the timber slat wall, the floor glow beneath it and the cove over the stone panel at the front. Fixed 3000 K: the room's colour moves between three and a half and four and a half thousand through the day, and the wall it is read against must not move with it.",
      dimmable: true,
      fixtures: 32, // metres of run
      wattsEach: 5,
      lumensEach: 420,
      glow: [],
    },
    {
      id: "bd-front",
      kind: "light",
      name: "Presentation",
      zoneId: "bd-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "Six downlights washing the screen wall, 2700 K to 6500 K. The one circuit that must go almost out for a slide and almost full for a whiteboard, which is why it is separated from the other seventeen heads in the ceiling.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 6500 },
      fixtures: 6,
      wattsEach: 11,
      lumensEach: 1000,
      glow: [],
    },
    {
      id: "bd-vc",
      kind: "light",
      name: "Video Conference",
      zoneId: "bd-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Four soft panels aimed at the seats rather than at the table, 3500 K to 5000 K. Off in every scene but one: lighting a face for a camera is a different job from lighting a room, and doing it all day would make the boardroom look like a studio.",
      dimmable: true,
      tunable: { minK: 3500, maxK: 5000 },
      fixtures: 4,
      wattsEach: 24,
      lumensEach: 2400,
      glow: [],
    },
    {
      id: "bd-accent",
      kind: "light",
      name: "Accent",
      zoneId: "bd-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "The uplight into the planting and the glow under the credenza. Fixed 2700 K, and at full for lunch — the layer that decides whether the room reads as hospitality or as a meeting that has run long.",
      dimmable: true,
      fixtures: 5,
      wattsEach: 6,
      lumensEach: 220,
      glow: [],
    },
    {
      id: "bd-projection",
      kind: "light",
      name: "Projection",
      zoneId: "bd-main",
      productId: "smartspaces-av",
      subsystem: "av",
      pitch:
        "The image on the screen, and the light it throws back into the room. A projector at this size is a 3 500 lumen fixture pointed at a white wall, and treating it as part of the lighting design rather than as a box on the ceiling is the difference between a readable slide and a washed-out one.",
      dimmable: false,
      fixtures: 1,
      wattsEach: 320,
      lumensEach: 3500,
      glow: [],
    },

    {
      id: "bd-blinds",
      kind: "shade",
      name: "Blinds",
      zoneId: "bd-main",
      productId: "uniser-curtain-track",
      subsystem: "shades",
      pitch:
        "Roller blinds across the glazed elevation, one motor a bay. Half is the working position and fully down is the presentation one — a projected image loses more to daylight than to any lamp in the room.",
      layers: ["blackout"],
      presets: [
        { label: "Open", blackout: 0, hint: "Raised, the full elevation" },
        { label: "Half", blackout: 50, hint: "Daylight without the glare" },
        { label: "Close", blackout: 100, hint: "Fully down, for a slide" },
      ],
      watts: 140,
      travelMs: 4000,
      window: { x: 0.0, y: 0.3, w: 0.3, h: 0.3 },
      draw: "both",
    },
    {
      id: "bd-av",
      kind: "av",
      name: "AV System",
      zoneId: "bd-main",
      productId: "smartspaces-av",
      subsystem: "av",
      /**
       * One device for the screen and the speakers, which is what the
       * rack actually is.
       *
       * `screen` is the motorised screen's position and drives the plate
       * overlay; `on`, `volume` and `source` are the speakers and the
       * projector's input. The conference camera is a second device
       * because it has its own state and its own scene column.
       */
      pitch:
        "A six-second motorised screen, tower speakers either side of it and the switcher behind the credenza. The screen is the part people judge: a boardroom screen that jerks or stops short is the first thing a visiting board notices.",
      sources: ["Laptop HDMI", "Wireless", "VC"],
      hasScreen: true,
      screenRect: { x: 0.4099, y: 0.438, w: 0.1802, h: 0.1567 },
      screenTravelMs: 6000,
      ratedWatts: 420,
      glow: [],
    },
    {
      id: "bd-camera",
      kind: "av",
      name: "Conference Camera",
      zoneId: "bd-main",
      productId: "smartspaces-av",
      subsystem: "av",
      /**
       * The camera and its microphone, as an `av` device.
       *
       * `on` is the camera and `volume` is the microphone level, with
       * zero meaning muted. The engine has no camera kind and inventing
       * one for two booleans would be worse than saying plainly what
       * these two fields mean here.
       */
      pitch:
        "A bar camera over the screen and ceiling microphones down the table. Switching it on brings the face-lighting panels up with it, because a board member lit from the ceiling alone looks like a hostage video.",
      sources: ["Zoom", "Teams", "Meet"],
      hasScreen: false,
      ratedWatts: 60,
      glow: [],
    },
    {
      id: "bd-ac",
      kind: "climate",
      name: "Air Conditioning",
      zoneId: "bd-main",
      productId: "sensibo-airbend",
      subsystem: "climate",
      pitch:
        "Four cassettes on one setpoint. Twenty people and a projector put about three kilowatts of heat into a sealed room, which is why a boardroom is the one space in an office that is always too warm by the second hour.",
      minC: 16,
      maxC: 30,
      ratedWatts: 7200,
    },

    {
      id: "bd-occ",
      kind: "sensor",
      name: "Occupancy",
      zoneId: "bd-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Presence at the table. A boardroom is booked far more than it is used, and an empty one lit and cooled for an hour that never happened is the most expensive empty room in the building.",
      metric: "occupancy",
      unit: "",
      min: 0,
      max: 1,
    },
    {
      id: "bd-lux",
      kind: "sensor",
      name: "Ambient Light",
      zoneId: "bd-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Measured light at the table. It is also the number that decides whether a slide is readable — drop the blinds and it falls, which is exactly why the presentation sequence closes them first.",
      metric: "lux",
      unit: "lx",
      derived: true,
    },
    {
      id: "bd-temp",
      kind: "sensor",
      name: "Room Temperature",
      zoneId: "bd-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Air temperature at seated height, which is what the cassettes regulate to and what twenty people and a projector work against.",
      metric: "temperature",
      unit: "°C",
      derived: true,
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Scenes — the client's six                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Every scene names an hour and only the last one pins the sky.
   *
   * Like the office floor, this set was rendered with a single view
   * plate, so the glass follows the clock with a floor after dark. End
   * Meeting is the one scene set at night, and it tints that plate blue
   * rather than crossfading to a night render that does not exist.
   *
   * Every scene also names the screen and the projector. A scene that
   * said nothing about them would leave a slide on the wall through
   * lunch, and the one ordering rule in this room is that the image goes
   * before the screen moves.
   */
  scenes: [
    {
      id: "meeting",
      clockMin: 13 * 60,
      name: "Meeting",
      icon: "◈",
      blurb:
        "Twenty people and no screen. Even light across the table with the blinds at a third, the front wall still lit because somebody will stand at it, and nothing switched on that nobody has asked for.",
      fadeMs: 1800,
      targets: {
        "bd-general": { on: true, level: 70, cct: 4000, sat: 0 },
        "bd-table": { on: true, level: 80, cct: 4000, sat: 0 },
        "bd-feature": { on: true, level: 60 },
        "bd-front": { on: true, level: 70, cct: 4000, sat: 0 },
        "bd-vc": { on: false },
        "bd-accent": { on: true, level: 60 },
        "bd-projection": { on: false },
        "bd-blinds": { blackout: 30 },
        "bd-av": { on: false, screen: 0, source: "Laptop HDMI", volume: 35 },
        "bd-camera": { on: false, volume: 60 },
        "bd-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
      },
      highlight: ["pipeline-pendant", "proplus-downlight"],
    },
    {
      id: "presentation",
      clockMin: 13 * 60,
      name: "Presentation",
      icon: "▶",
      blurb:
        "One button and the room is ready to present: the blinds close, the front wall drops away, the table light stays on for notes, the screen comes down and the projector and speakers follow. Six stages, about fifteen seconds.",
      fadeMs: 1200,
      /**
       * Stage zero is the Meeting room, which is where the client's
       * wording begins.
       *
       * A staged scene applies `targets` before its first step and the
       * runner skips a step that commands nothing new, so everything the
       * six beats talk about is set here to what they start *from* —
       * blinds at a third, screen up, every piece of AV off.
       */
      targets: {
        "bd-general": { on: true, level: 70, cct: 4000, sat: 0 },
        "bd-table": { on: true, level: 80, cct: 4000, sat: 0 },
        "bd-feature": { on: true, level: 60 },
        "bd-front": { on: true, level: 70, cct: 4000, sat: 0 },
        "bd-vc": { on: false },
        "bd-accent": { on: true, level: 60 },
        "bd-projection": { on: false },
        "bd-blinds": { blackout: 30 },
        "bd-av": { on: false, screen: 0, source: "Laptop HDMI", volume: 40 },
        "bd-camera": { on: false, volume: 60 },
        "bd-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
      },
      steps: [
        {
          label: "Blinds closing",
          holdMs: 3420,
          targets: {
            // No `fadeMs`: travel belongs to the motor, and seven tenths
            // of a four-second elevation is the brief's four seconds.
            "bd-blinds": { blackout: 100 },
          },
        },
        {
          label: "Front lights dimmed",
          holdMs: 4210,
          targets: {
            "bd-front": { on: true, level: 10, cct: 4000, sat: 0, fadeMs: 1500 },
            "bd-general": { on: true, level: 30, cct: 4000, sat: 0, fadeMs: 1500 },
            "bd-feature": { on: true, level: 40, fadeMs: 1500 },
            "bd-accent": { on: true, level: 40, fadeMs: 1500 },
          },
        },
        {
          label: "Table lighting stays on for notes",
          holdMs: 4210,
          targets: {
            // The one circuit that does *not* go down for a slide. It
            // moves from eighty to seventy so the beat has something to
            // show and the hotspot has something to pulse.
            "bd-table": { on: true, level: 70, cct: 4000, sat: 0, fadeMs: 1000 },
          },
        },
        {
          label: "Screen lowering",
          /**
           * Long, because the next beat may not fire until this one has
           * landed: a projector is not allowed to show an image on a
           * screen that is still travelling. Six seconds of motor, and
           * the hold is sized to clear it.
           */
          holdMs: 16320,
          targets: {
            "bd-av": { screen: 100 },
          },
        },
        {
          label: "Projector on",
          holdMs: 4210,
          targets: {
            "bd-projection": { on: true, level: 100, fadeMs: 1500 },
            "bd-av": { source: "Laptop HDMI" },
          },
        },
        {
          label: "AV system on",
          holdMs: 3950,
          targets: {
            "bd-av": { on: true, volume: 40 },
          },
        },
      ],
      highlight: ["smartspaces-av", "uniser-curtain-track"],
    },
    {
      id: "video-conference",
      clockMin: 13 * 60,
      name: "Video Conference",
      icon: "✦",
      blurb:
        "The call. The face panels come to ninety and the room goes to 4500 K, the blinds drop to seven tenths to keep the window out of the shot, and the camera and speakers are live — the only scene where the room is lit for the people looking at it rather than for the people in it.",
      fadeMs: 1600,
      targets: {
        "bd-general": { on: true, level: 50, cct: 4500, sat: 0 },
        "bd-table": { on: true, level: 70, cct: 4500, sat: 0 },
        "bd-feature": { on: true, level: 50 },
        "bd-front": { on: true, level: 40, cct: 4500, sat: 0 },
        "bd-vc": { on: true, level: 90, cct: 4500, sat: 0 },
        "bd-accent": { on: true, level: 40 },
        "bd-projection": { on: false },
        "bd-blinds": { blackout: 70 },
        "bd-av": { on: true, screen: 0, source: "VC", volume: 45 },
        "bd-camera": { on: true, volume: 60 },
        "bd-ac": { on: true, setpointC: 22, mode: "cool", fan: 3 },
      },
      highlight: ["connekt-profile", "smartspaces-av"],
    },
    {
      id: "discussion",
      clockMin: 13 * 60,
      name: "Discussion",
      icon: "◎",
      blurb:
        "No screen, no call, everyone talking. The table pendant to ninety at 3500 K and the slat wall up with it — warmer and more enclosed than Meeting, which is what a room full of people arguing should feel like.",
      fadeMs: 1800,
      targets: {
        "bd-general": { on: true, level: 60, cct: 3500, sat: 0 },
        "bd-table": { on: true, level: 90, cct: 3500, sat: 0 },
        "bd-feature": { on: true, level: 70 },
        "bd-front": { on: true, level: 50, cct: 3500, sat: 0 },
        "bd-vc": { on: false },
        "bd-accent": { on: true, level: 70 },
        "bd-projection": { on: false },
        "bd-blinds": { blackout: 20 },
        "bd-av": { on: false, screen: 0, source: "Laptop HDMI", volume: 35 },
        "bd-camera": { on: false, volume: 60 },
        "bd-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
      },
      highlight: ["pipeline-pendant", "connekt-profile"],
    },
    {
      id: "lunch",
      clockMin: 13 * 60,
      name: "Lunch",
      icon: "✸",
      blurb:
        "The board is being fed. Blinds open, the feature wall and the credenza to full at 3000 K, the working light down and quiet music on — the only scene in this room that is not about a decision.",
      fadeMs: 2200,
      targets: {
        "bd-general": { on: true, level: 50, cct: 3000, sat: 0 },
        "bd-table": { on: true, level: 60, cct: 3000, sat: 0 },
        "bd-feature": { on: true, level: 90 },
        "bd-front": { on: true, level: 30, cct: 3000, sat: 0 },
        "bd-vc": { on: false },
        "bd-accent": { on: true, level: 100 },
        "bd-projection": { on: false },
        "bd-blinds": { blackout: 0 },
        "bd-av": { on: true, screen: 0, source: "Wireless", volume: 18 },
        "bd-camera": { on: false, volume: 60 },
        "bd-ac": { on: true, setpointC: 23, mode: "cool", fan: 2 },
      },
      highlight: ["connekt-profile", "magneto-track"],
    },
    {
      id: "end-meeting",
      clockMin: 20 * 60,
      name: "End Meeting",
      icon: "⏻",
      blurb:
        "Everyone has gone. The screen goes back up, the lights fade over five seconds, every piece of AV switches off and the blinds open for the cleaners — one press on the way out instead of a lap of the room.",
      fadeMs: 5000,
      daylightTint: "#5b6f9e",
      /**
       * Stage zero kills the image, and only then does the screen move.
       *
       * The one ordering rule in this room: a projector throwing 3 500
       * lumens at a screen that is rolling up paints the image onto the
       * ceiling slot on its way past. Putting it in `targets` rather
       * than in the step means it is already gone before the beat that
       * raises the screen runs.
       */
      targets: {
        "bd-projection": { on: false },
      },
      steps: [
        {
          label: "Meeting ended. AV off",
          holdMs: 3950,
          targets: {
            "bd-general": { on: true, level: 20, cct: 3000, sat: 0 },
            "bd-table": { on: false },
            "bd-feature": { on: true, level: 40 },
            "bd-front": { on: false },
            "bd-vc": { on: false },
            "bd-accent": { on: true, level: 50 },
            "bd-blinds": { blackout: 0 },
            "bd-av": { on: false, screen: 0, volume: 0 },
            "bd-camera": { on: false },
            "bd-ac": { on: false },
          },
        },
      ],
      highlight: ["smartspaces-av"],
    },
  ],
  rules: [
    {
      id: "bd-occupancy",
      kind: "occupancy",
      name: "Room Presence",
      explain:
        "The room stands down when the table empties and comes back when it fills. A boardroom is booked far more than it is used, and the hour that was blocked out and never happened is the most expensive empty room in the building — this is the rule that stops paying for it.",
      enabledByDefault: true,
      sensorId: "bd-occ",
      holdMin: 15,
      onOccupied: {
        "bd-general": { on: true, level: 70, fadeMs: 1200, sat: 0 },
        "bd-table": { on: true, level: 80, fadeMs: 1200, sat: 0 },
        "bd-front": { on: true, level: 60, fadeMs: 1400, sat: 0 },
      },
      onVacant: {
        "bd-general": { on: true, level: 15, fadeMs: 2600, sat: 0 },
        "bd-table": { on: false, fadeMs: 2600 },
        "bd-front": { on: false, fadeMs: 2600 },
      },
    },
    {
      id: "bd-circadian",
      kind: "circadian",
      name: "Circadian Tuning",
      explain:
        "The four tunable circuits follow the hour when no scene has claimed them. The feature and accent layers hold their colour around the clock, which is what lets the timber wall look the same at nine in the morning and eight at night.",
      enabledByDefault: true,
      deviceIds: ["bd-general", "bd-table", "bd-front"],
      curve: [
        { min: 0, cct: 3000 },
        { min: 420, cct: 3500 },
        { min: 660, cct: 4500 },
        { min: 960, cct: 4200 },
        { min: 1080, cct: 3500 },
        { min: 1260, cct: 3000 },
        { min: 1380, cct: 3000 },
      ],
    },
  ],

  /**
   * A dark room with the blinds up and the screen stowed.
   *
   * The screen starts up because the opening scene is Meeting and it
   * wants it up — a six-second motor is not something a scene can hurry,
   * so starting it down would mean the room spent its first six seconds
   * retracting a screen underneath a still that already shows it stowed.
   */
  defaults: {
    "bd-general": { on: false, level: 0, cct: 4000, sat: 0 },
    "bd-table": { on: false, level: 0, cct: 4000, sat: 0 },
    "bd-feature": { on: false, level: 0 },
    "bd-front": { on: false, level: 0, cct: 4000, sat: 0 },
    "bd-vc": { on: false, level: 0, cct: 4500, sat: 0 },
    "bd-accent": { on: false, level: 0 },
    "bd-projection": { on: false, level: 0 },
    "bd-blinds": { blackout: 0 },
    "bd-av": { on: false, screen: 0, source: "Laptop HDMI", volume: 35 },
    "bd-camera": { on: false, source: "Zoom", volume: 60 },
    "bd-ac": { on: true, setpointC: 23, mode: "cool", fan: 2 },
  },

  openingSceneId: "meeting",
  openingClockMin: 13 * 60,

  environment: {
    sunriseMin: 6 * 60 + 20,
    sunsetMin: 18 * 60 + 55,
    outdoorPeakLux: 95000,
    /**
     * One glazed elevation on a 96 m² room, seen almost edge-on.
     *
     * Below the office floor's two-sided curtain wall and above the
     * guest room's single pane. The blinds multiply it by their own
     * transmission, which is what makes the presentation sequence's
     * first beat worth watching.
     */
    windowFactor: 0.0034,
    designLux: 400,
    outdoorMinC: 26,
    outdoorMaxC: 34,
  },

  baseline: {
    lightingWatts: 1450,
    hvacWatts: 8600,
    operatingHours: { startMin: 8 * 60, endMin: 20 * 60 },
    hvacHours: { startMin: 8 * 60, endMin: 20 * 60 },
    note:
      "45 W recessed troffers on two switched banks, an uncontrolled pendant, no feature or presentation circuits and cassettes running the whole working day whether the room is booked or not — a boardroom fitted out around 2013.",
  },

  tariffPerKwh: 11.5,
  currency: "₹",
};
