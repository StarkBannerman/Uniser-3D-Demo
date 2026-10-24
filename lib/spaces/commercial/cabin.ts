import type { Space } from "@/lib/sim/types";

/**
 * A chief executive's cabin, fitted out like a hotel suite.
 *
 * The office brief's premium room, and the one that makes the argument the
 * other two office spaces cannot: this is a workplace that is also a stage.
 * A CXO cabin holds one-to-ones, board calls, supplier meetings and the
 * occasional glass of something at seven in the evening, and it is judged
 * by visitors who will never see the rest of the floor. So it is lit like
 * hospitality rather than like an office — nine circuits where a workspace
 * has two, a marble feature wall, a shelf run that can go any colour, and
 * a pendant over the desk that doubles as the meeting light.
 *
 * Three circuits are tunable and share one colour in every scene; five are
 * fixed warm white; one is full colour. That split is the specification
 * and it is the right one: the working light has to move from 4500 K at
 * eleven to 2700 K at seven, and everything decorative has to hold still
 * underneath it or the room reads as a different room every hour.
 */

/** 42 m² of cabin: desk, meeting end, lounge and a credenza wall. */
const AREA = 42;

export const cabin: Space = {
  id: "cabin",
  name: "CXO Cabin",
  segment: "commercial",
  category: "Office",
  blurb:
    "A 42 m² executive cabin — desk, meeting end and lounge — path-traced offline and relit live. Nine lighting circuits across a tray cove, a marble feature wall, colour-changing shelves and a pendant over the desk, behind motorised blinds onto a Shanghai skyline.",
  renderer: "plates",
  plates: {
    dir: "/plates/cabin",
    profile: "cabin",
    /**
     * One covering, so two plate sets and no window quad.
     *
     * The hotel room's curtains travel along a track and are masked to the
     * glass; these are venetian blinds that lower and tilt, which is the
     * whole aperture closing at once rather than an edge crossing it. The
     * same two-state blend with no mask is exactly right for that, and it
     * is why `hotspots.json` carries no curtain quad here.
     */
    curtain: { closedDir: "/plates/cabin_closed", deviceId: "cx-blinds" },
    hotspotAliases: {
      blinds: { deviceId: "cx-blinds", label: "Motorised blinds" },
      hvac: { deviceId: "cx-ac", label: "Air conditioning" },
      fan: { deviceId: "cx-ac", label: "Fan coil · linear diffuser" },
      music: { deviceId: "cx-music", label: "Ceiling speakers" },
      // The wall keypad's backlight is on the decorative circuit, with the
      // lounge table lamp. Pointing the marker at the circuit that lights
      // it is the same thing every other marker in every other room does.
      keypad: { deviceId: "cx-deco", label: "Wall keypad · scene recall" },
    },
  },

  keypad: {
    layout: "grid",
    finish: "graphite",
    scenes: ["welcome", "focus", "meeting", "leave"],
  },

  zones: [{ id: "cx-main", name: "Cabin", areaM2: AREA }],

  /* ---------------------------------------------------------------- */
  /* Devices — the sheet's nine circuits, the blinds, the fan coil     */
  /* ---------------------------------------------------------------- */

  devices: [
    {
      id: "cx-cove",
      kind: "light",
      name: "Cove",
      zoneId: "cx-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Twenty-two metres in the tray ceiling, 2700 K to 5000 K. The circuit that decides whether the room reads as an office with a nice ceiling or as a suite — it is the only light in here a visitor cannot find the source of.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5000 },
      fixtures: 22, // metres of run
      wattsEach: 5,
      lumensEach: 420,
      glow: [],
    },
    {
      id: "cx-general",
      kind: "light",
      name: "General",
      zoneId: "cx-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "Ten downlights in the tray, 2700 K to 5000 K. The working light, and the circuit the whole room is calibrated against — everything else here is measured as a fraction of what these are doing.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5000 },
      fixtures: 10,
      wattsEach: 11,
      lumensEach: 1000,
      baselineWattsEach: 50,
      glow: [],
    },
    {
      id: "cx-task",
      kind: "light",
      name: "Task",
      zoneId: "cx-main",
      productId: "pipeline-pendant",
      subsystem: "lighting",
      pitch:
        "A 1.6 m linear pendant over the desk, 3000 K to 5000 K. It is the task light and the meeting light at once: drop it to forty per cent for a conversation and take it to ninety when the desk becomes a table, which is what the Meeting sequence does in front of you.",
      dimmable: true,
      tunable: { minK: 3000, maxK: 5000 },
      fixtures: 1,
      wattsEach: 32,
      lumensEach: 3400,
      baselineWattsEach: 80,
      glow: [],
    },
    {
      id: "cx-accent",
      kind: "light",
      name: "Accent",
      zoneId: "cx-main",
      productId: "magneto-track",
      subsystem: "lighting",
      pitch:
        "Seven narrow beams on the artwork, the shelves and the globe. Fixed warm white, because the one thing an accent circuit must never do is change colour under the object it is there to sell.",
      dimmable: true,
      fixtures: 7,
      wattsEach: 7,
      lumensEach: 620,
      glow: [],
    },
    {
      id: "cx-feature",
      kind: "light",
      name: "Feature Wall",
      zoneId: "cx-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "The wash and the reveals on the Vision / Strategy marble. This is the wall that appears behind the executive on every video call, and it is lit on its own circuit for exactly that reason.",
      dimmable: true,
      fixtures: 9,
      wattsEach: 6,
      lumensEach: 520,
      glow: [],
    },
    {
      id: "cx-shelf",
      kind: "light",
      name: "Shelf Colour",
      zoneId: "cx-main",
      productId: "flexi-delta-rgb",
      subsystem: "lighting",
      pitch:
        "Fourteen metres of RGBW in the credenza shelves — the only circuit in the cabin that does colour, and deliberately the only one. Colour in a cove turns a boardroom into a bar; colour behind glass and objects on a shelf is a brand cue, and it is the one a company actually wants on its wall.",
      dimmable: true,
      tunable: { minK: 2700, maxK: 5000 },
      rgb: true,
      fixtures: 14, // metres of run
      wattsEach: 8,
      lumensEach: 280,
      glow: [],
    },
    {
      id: "cx-plinth",
      kind: "light",
      name: "Plinth",
      zoneId: "cx-main",
      productId: "connekt-profile",
      subsystem: "lighting",
      pitch:
        "Nine metres under the credenza and the desk, so both appear to float. Four watts a metre to do the single most photographed thing in the room, which is a fair trade.",
      dimmable: true,
      fixtures: 9, // metres of run
      wattsEach: 4,
      lumensEach: 200,
      glow: [],
    },
    {
      id: "cx-deco",
      kind: "light",
      name: "Decorative",
      zoneId: "cx-main",
      productId: "pipeline-pendant",
      subsystem: "lighting",
      pitch:
        "The lounge table lamp and the backlight on the wall keypad. The lamp is what makes the sofa end read as somewhere to sit rather than as spare floor, and it is at full in every scene that is not about work.",
      dimmable: true,
      fixtures: 2,
      wattsEach: 6,
      lumensEach: 320,
      glow: [],
    },
    {
      id: "cx-lounge",
      kind: "light",
      name: "Lounge",
      zoneId: "cx-main",
      productId: "proplus-downlight",
      subsystem: "lighting",
      pitch:
        "Two downlights over the sofa, switched away from the desk. A cabin has two rooms in it and the lighting has to know which one is in use — Reading takes these to full and the desk circuits to almost nothing.",
      dimmable: true,
      fixtures: 2,
      wattsEach: 9,
      lumensEach: 820,
      baselineWattsEach: 50,
      glow: [],
    },

    {
      id: "cx-blinds",
      kind: "shade",
      name: "Blinds",
      zoneId: "cx-main",
      productId: "uniser-curtain-track",
      subsystem: "shades",
      /**
       * One layer, because the window has one covering.
       *
       * The hotel room declares `sheer` and `blackout` for its two tracks;
       * this is a single venetian blind and a single position, so only
       * `blackout` is real. Half of it is the meeting preset — lowered and
       * tilted enough to kill the glare on a screen without blacking out a
       * skyline anybody would want in the background of a call.
       */
      layers: ["blackout"],
      presets: [
        { label: "Open", blackout: 0, hint: "Raised, skyline in full" },
        { label: "Meeting", blackout: 50, hint: "Lowered and tilted — no glare on a screen" },
        { label: "Close", blackout: 100, hint: "Fully down" },
      ],
      watts: 60,
      /**
       * Eight seconds end to end, which makes the meeting preset four.
       *
       * The brief asks for a move of about four seconds and for the
       * nought-to-half preset to take four, and travel scales with
       * distance, so the full drop has to be eight. It is also what a
       * three-metre venetian actually does, and the same figure the
       * engine's other blinds use.
       */
      travelMs: 8000,
      window: { x: 0.02, y: 0.12, w: 0.3, h: 0.66 },
      draw: "both",
    },
    {
      id: "cx-ac",
      kind: "climate",
      name: "Air Conditioning",
      zoneId: "cx-main",
      productId: "sensibo-airbend",
      subsystem: "climate",
      pitch:
        "A concealed fan coil on the linear diffuser by the window, on the cabin's own setpoint. A corner office behind full-height glass is the hardest room on a floor to hold at a temperature, and the only one whose occupant can have it changed by asking.",
      minC: 16,
      maxC: 30,
      ratedWatts: 2200,
    },
    {
      id: "cx-music",
      kind: "av",
      name: "Music",
      zoneId: "cx-main",
      productId: "smartspaces-audio",
      subsystem: "av",
      pitch:
        "Two ceiling speakers, carried on the scenes with the light. It is on for Welcome and for the evening and off for everything that is work — and the Meeting sequence turning it off is the beat that tells a client the system understands what a meeting is.",
      sources: ["Cabin Ambient", "Lounge Jazz", "Focus"],
      hasScreen: false,
      ratedWatts: 120,
      glow: [],
    },

    {
      id: "cx-occ",
      kind: "sensor",
      name: "Cabin Occupancy",
      zoneId: "cx-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Presence in the cabin. An executive office is empty more than it is occupied and lit for the whole working day anyway, which is the easiest saving in a commercial fit-out and the one nobody bothers with.",
      metric: "occupancy",
      unit: "",
      min: 0,
      max: 1,
    },
    {
      id: "cx-lux",
      kind: "sensor",
      name: "Ambient Light",
      zoneId: "cx-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Measured light at the desk, which is what daylight response regulates against and what an office is legally specified to. Lower the blinds and it reads what the fixtures are doing and nothing else.",
      metric: "lux",
      unit: "lx",
      derived: true,
    },
    {
      id: "cx-temp",
      kind: "sensor",
      name: "Cabin Temperature",
      zoneId: "cx-main",
      productId: "smartspaces-multisensor",
      subsystem: "sensors",
      pitch:
        "Air temperature at desk height, which is what the fan coil regulates to and the number the occupant will mention first.",
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
   * The lobby's scenes carry an explicit `daylight` map because its
   * Evening is *about* the light going and has to be a dusk whatever the
   * scrubber says. Here the hour the client specified and the hour the
   * clock would give are the same thing — Welcome is morning, Focus and
   * Meeting are the middle of the day, Evening is after dark — so setting
   * `clockMin` alone gets the right window and leaves the scrubber live.
   * Press Relax and drag the day across and the skyline answers.
   */
  scenes: [
    {
      id: "welcome",
      clockMin: 9 * 60,
      name: "Welcome",
      icon: "◈",
      blurb:
        "A warm and impressive first impression. Everything decorative at or near full with the working light held back — the accent spots, the marble wall and the shelves are what a visitor sees, and the downlights are only there so the desk is usable.",
      fadeMs: 1800,
      targets: {
        "cx-cove": { on: true, level: 90, cct: 3000, sat: 0 },
        "cx-general": { on: true, level: 60, cct: 3000, sat: 0 },
        "cx-task": { on: true, level: 40, cct: 3000, sat: 0 },
        "cx-accent": { on: true, level: 100 },
        "cx-feature": { on: true, level: 100 },
        "cx-shelf": { on: true, level: 80, cct: 2700, sat: 0 },
        "cx-plinth": { on: true, level: 60 },
        "cx-deco": { on: true, level: 80 },
        "cx-lounge": { on: true, level: 50 },
        "cx-blinds": { blackout: 0 },
        "cx-ac": { on: true, setpointC: 23, mode: "cool", fan: 2 },
        "cx-music": { on: true, source: "Cabin Ambient", volume: 25 },
      },
      highlight: ["magneto-track", "flexi-delta-rgb"],
    },
    {
      id: "focus",
      clockMin: 12 * 60,
      name: "Focus",
      icon: "☀",
      blurb:
        "Bright and balanced for deep work. The pendant and the downlights carry the room at 4500 K, the blinds come down far enough to take the glare off a screen, the table lamp goes out and the music stops.",
      fadeMs: 1600,
      targets: {
        "cx-cove": { on: true, level: 40, cct: 4500, sat: 0 },
        "cx-general": { on: true, level: 90, cct: 4500, sat: 0 },
        "cx-task": { on: true, level: 100, cct: 4500, sat: 0 },
        "cx-accent": { on: true, level: 40 },
        "cx-feature": { on: true, level: 40 },
        "cx-shelf": { on: true, level: 40, cct: 4000, sat: 0 },
        "cx-plinth": { on: true, level: 20 },
        "cx-deco": { on: false },
        "cx-lounge": { on: true, level: 20 },
        "cx-blinds": { blackout: 40 },
        "cx-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
        "cx-music": { on: false },
      },
      highlight: ["proplus-downlight", "pipeline-pendant"],
    },
    {
      id: "meeting",
      clockMin: 14 * 60,
      name: "Meeting",
      icon: "◎",
      blurb:
        "Optimised for a discussion, run as one button: welcome lighting, blinds to the meeting preset, the ambience settles back, the table light comes up, the air conditioning takes over and the music stops. Six stages, about ten seconds.",
      fadeMs: 1200,
      /**
       * Stage zero is the room before anybody walks in.
       *
       * A staged scene applies `targets` before its first step and the
       * runner skips a step that commands nothing new, so everything the
       * six beats talk about has to be set here to what they start
       * *from*. Lights out, blinds up, air conditioning off — and the
       * music playing, because the last beat is it stopping and a beat
       * that turns off something already off is a beat nobody sees.
       */
      targets: {
        "cx-cove": { on: false },
        "cx-general": { on: false },
        "cx-task": { on: false },
        "cx-accent": { on: false },
        "cx-feature": { on: false },
        "cx-shelf": { on: false },
        "cx-plinth": { on: false },
        "cx-deco": { on: false },
        "cx-lounge": { on: false },
        "cx-blinds": { blackout: 0 },
        "cx-ac": { on: false },
        "cx-music": { on: true, source: "Cabin Ambient", volume: 25 },
      },
      steps: [
        {
          label: "Welcome lighting on",
          holdMs: 2600,
          targets: {
            "cx-cove": { on: true, level: 90, cct: 3000, sat: 0, fadeMs: 1200 },
            "cx-general": { on: true, level: 60, cct: 3000, sat: 0, fadeMs: 1200 },
            "cx-task": { on: true, level: 40, cct: 3000, sat: 0, fadeMs: 1200 },
            "cx-accent": { on: true, level: 100, fadeMs: 1200 },
            "cx-feature": { on: true, level: 100, fadeMs: 1200 },
            "cx-shelf": { on: true, level: 80, cct: 2700, sat: 0, fadeMs: 1200 },
            "cx-plinth": { on: true, level: 60, fadeMs: 1200 },
            "cx-deco": { on: true, level: 80, fadeMs: 1200 },
            "cx-lounge": { on: true, level: 50, fadeMs: 1200 },
          },
        },
        {
          label: "Blinds to meeting preset",
          holdMs: 4200,
          targets: {
            // No `fadeMs`: travel is the motor's and a scene cannot
            // shorten it. Half of an eight-second drop is four seconds.
            "cx-blinds": { blackout: 50 },
          },
        },
        {
          label: "Ambient lighting adjusts",
          holdMs: 4750,
          targets: {
            "cx-cove": { on: true, level: 70, cct: 4000, sat: 0, fadeMs: 2000 },
            "cx-deco": { on: true, level: 30, fadeMs: 2000 },
            "cx-lounge": { on: true, level: 30, fadeMs: 2000 },
            "cx-shelf": { on: true, level: 60, cct: 2700, hue: 0, sat: 0, fadeMs: 2000 },
            /**
             * The accent, the feature wall and the plinth settle here too.
             *
             * The client's wording for this beat names four circuits and
             * the colour temperature, and the Meeting scene it is supposed
             * to arrive at has these three lower than Welcome left them.
             * "The end state equals the Meeting scene" is the binding
             * requirement, and this is the beat they belong to — coming
             * off the welcome is exactly what ambient settling means.
             */
            "cx-accent": { on: true, level: 70, fadeMs: 2000 },
            "cx-feature": { on: true, level: 80, fadeMs: 2000 },
            "cx-plinth": { on: true, level: 40, fadeMs: 2000 },
          },
        },
        {
          label: "Meeting lighting up",
          holdMs: 4750,
          targets: {
            "cx-task": { on: true, level: 90, cct: 4000, sat: 0, fadeMs: 1200 },
            "cx-general": { on: true, level: 75, cct: 4000, sat: 0, fadeMs: 1200 },
          },
        },
        {
          label: "AC to 22 °C",
          holdMs: 4750,
          targets: {
            "cx-ac": { on: true, setpointC: 22, mode: "cool", fan: 2 },
          },
        },
        {
          label: "Music off",
          holdMs: 3950,
          targets: {
            // The volume ramps down and the panel goes quiet with it. The
            // pad in the automation tab follows `volume`, so this is the
            // fade you actually hear rather than a cut.
            "cx-music": { on: false, volume: 0, fadeMs: 1500 },
          },
        },
      ],
      highlight: ["uniser-curtain-track", "pipeline-pendant", "smartspaces-audio"],
    },
    {
      id: "relax",
      clockMin: 18 * 60 + 30,
      name: "Relax",
      icon: "☾",
      blurb:
        "Soft and comfortable, at the end of a day. The downlights drop to fifteen per cent and the table lamp goes to full, the shelves run amber and the blinds come down a fifth — the desk stops being the subject of the room.",
      fadeMs: 2400,
      targets: {
        "cx-cove": { on: true, level: 60, cct: 2700, sat: 0 },
        "cx-general": { on: true, level: 15, cct: 2700, sat: 0 },
        "cx-task": { on: false },
        "cx-accent": { on: true, level: 60 },
        "cx-feature": { on: true, level: 50 },
        "cx-shelf": { on: true, level: 70, cct: 2700, hue: 29, sat: 58 },
        "cx-plinth": { on: true, level: 50 },
        "cx-deco": { on: true, level: 100 },
        "cx-lounge": { on: true, level: 60 },
        "cx-blinds": { blackout: 20 },
        "cx-ac": { on: true, setpointC: 24, mode: "cool", fan: 1 },
        "cx-music": { on: true, source: "Lounge Jazz", volume: 30 },
      },
      highlight: ["flexi-delta-rgb", "pipeline-pendant"],
    },
    {
      id: "reading",
      clockMin: 15 * 60,
      name: "Reading",
      icon: "❑",
      blurb:
        "Focused and comfortable, at the sofa rather than the desk. The two lounge downlights and the table lamp go to full and everything over the desk comes down — the one scene that moves the centre of the room.",
      fadeMs: 1600,
      targets: {
        "cx-cove": { on: true, level: 40, cct: 3500, sat: 0 },
        "cx-general": { on: true, level: 30, cct: 3500, sat: 0 },
        "cx-task": { on: false },
        "cx-accent": { on: true, level: 30 },
        "cx-feature": { on: true, level: 20 },
        "cx-shelf": { on: true, level: 40, cct: 2700, sat: 0 },
        "cx-plinth": { on: false },
        "cx-deco": { on: true, level: 100 },
        "cx-lounge": { on: true, level: 100 },
        "cx-blinds": { blackout: 0 },
        "cx-ac": { on: true, setpointC: 23, mode: "cool", fan: 1 },
        "cx-music": { on: false },
      },
      highlight: ["proplus-downlight"],
    },
    {
      id: "evening",
      clockMin: 20 * 60 + 30,
      name: "Evening",
      icon: "◑",
      blurb:
        "Warm and calming, with the skyline doing half the work. The cove and the marble wall lead, the shelves run deep blue against the city outside, and the working light is down to the level you would leave on for somebody finishing a call.",
      fadeMs: 2600,
      targets: {
        "cx-cove": { on: true, level: 80, cct: 2700, sat: 0 },
        "cx-general": { on: true, level: 30, cct: 2700, sat: 0 },
        "cx-task": { on: true, level: 20, cct: 3000, sat: 0 },
        "cx-accent": { on: true, level: 80 },
        "cx-feature": { on: true, level: 90 },
        "cx-shelf": { on: true, level: 70, cct: 2700, hue: 230, sat: 76 },
        "cx-plinth": { on: true, level: 70 },
        "cx-deco": { on: true, level: 80 },
        "cx-lounge": { on: true, level: 40 },
        "cx-blinds": { blackout: 0 },
        "cx-ac": { on: true, setpointC: 23, mode: "cool", fan: 1 },
        "cx-music": { on: true, source: "Lounge Jazz", volume: 20 },
      },
      highlight: ["flexi-delta-rgb", "connekt-profile"],
    },
    {
      id: "leave",
      clockMin: 21 * 60,
      name: "Leave",
      icon: "⏻",
      blurb:
        "Everything to off or standby on the way out. Five seconds of fade across all nine circuits, the blinds down, the fan coil to standby and the music stopped — one press at the door instead of nine switches and a thermostat.",
      fadeMs: 5000,
      /**
       * Stage zero is empty so the caption gets to exist.
       *
       * A scene with no stages has nowhere to put a line of narration, and
       * this one is specified with one. Leaving `targets` empty means the
       * runner fires the single stage immediately — there is nothing to
       * wait for — and the caption then sits for its own hold while the
       * five-second fade plays out underneath it.
       */
      targets: {},
      steps: [
        {
          label: "All systems to standby",
          holdMs: 3950,
          targets: {
            "cx-cove": { on: false },
            "cx-general": { on: false },
            "cx-task": { on: false },
            "cx-accent": { on: false },
            "cx-feature": { on: false },
            "cx-shelf": { on: false },
            "cx-plinth": { on: false },
            "cx-deco": { on: false },
            "cx-lounge": { on: false },
            "cx-blinds": { blackout: 100 },
            "cx-ac": { on: false },
            "cx-music": { on: false, volume: 0 },
          },
        },
      ],
      highlight: ["smartspaces-wired"],
    },
  ],
  rules: [
    {
      id: "cx-occupancy",
      kind: "occupancy",
      name: "Cabin Occupancy",
      explain:
        "The cabin falls back when it is empty and comes up when the door opens. An executive office is sold as occupied and is actually empty most of the working day, which makes this the easiest saving in a commercial fit-out and the one almost nobody takes.",
      enabledByDefault: true,
      sensorId: "cx-occ",
      holdMin: 12,
      onOccupied: {
        "cx-general": { on: true, level: 70, fadeMs: 1200, sat: 0 },
        "cx-task": { on: true, level: 70, fadeMs: 1200, sat: 0 },
        "cx-lounge": { on: true, level: 40, fadeMs: 1400 },
      },
      onVacant: {
        "cx-general": { on: false, fadeMs: 2600 },
        "cx-task": { on: false, fadeMs: 2600 },
        "cx-lounge": { on: false, fadeMs: 2800 },
      },
    },
    {
      id: "cx-daylight",
      kind: "daylight",
      name: "Daylight Harvesting",
      explain:
        "The downlights give back what the glazing is already supplying, regulated at the desk. The blinds change the answer by themselves: lower them for a screen and the measured daylight falls, so the trim releases without anybody asking it to.",
      enabledByDefault: true,
      /**
       * The downlights only, and deliberately not the pendant.
       *
       * Daylight replaces ambient light, not task light. The downlights
       * are in the tray across the whole ceiling and the window genuinely
       * stands in for them; the pendant is a metre over a desk in the
       * middle of the room doing a job the sun is not doing. Trimming it
       * also broke the Meeting sequence, which asks for the pendant at
       * ninety and was getting seventy-two.
       */
      deviceIds: ["cx-general"],
      /**
       * 900 lux against a desk designed to 400, with a floor at 75.
       *
       * Regulating to the design level would take the working light to
       * its floor every time the blinds are up in daylight — correct for
       * somebody sitting in the window and wrong for Focus, which is the
       * scene this room is sold on. Measured, the glazing supplies about
       * 190 lux at two in the afternoon with the blinds at the meeting
       * preset, so this trims Focus from ninety to seventy-five and
       * leaves Meeting's seventy-five alone.
       */
      targetLux: 900,
      minLevel: 75,
    },
    {
      id: "cx-circadian",
      kind: "circadian",
      name: "Circadian Tuning",
      explain:
        "The three tunable circuits follow the hour when no scene has claimed them — 4500 K through the middle of the day, 2700 K from the evening on. The five fixed-warm circuits and the shelves hold their colour, which is what lets the room change temperature without changing character.",
      enabledByDefault: true,
      deviceIds: ["cx-cove", "cx-general", "cx-task"],
      curve: [
        { min: 0, cct: 2700 },
        { min: 420, cct: 3200 },
        { min: 660, cct: 4500 },
        { min: 900, cct: 4500 },
        { min: 1080, cct: 3400 },
        { min: 1230, cct: 2700 },
        { min: 1380, cct: 2700 },
      ],
    },
  ],
  /**
   * The cabin before anybody arrives, and what Reset returns to.
   *
   * Blinds up, because the opening scene is Welcome and it wants them up
   * — a motor is eight seconds and a scene cannot hurry one, so starting
   * them down would mean the room spent its first eight seconds raising a
   * blind underneath a still image that already shows it raised.
   */
  defaults: {
    "cx-cove": { on: false, level: 0, cct: 3000, sat: 0 },
    "cx-general": { on: false, level: 0, cct: 3000, sat: 0 },
    "cx-task": { on: false, level: 0, cct: 3500, sat: 0 },
    "cx-accent": { on: false, level: 0 },
    "cx-feature": { on: false, level: 0 },
    "cx-shelf": { on: false, level: 0, cct: 2700, hue: 0, sat: 0 },
    "cx-plinth": { on: false, level: 0 },
    "cx-deco": { on: false, level: 0 },
    "cx-lounge": { on: false, level: 0 },
    "cx-blinds": { blackout: 0 },
    "cx-ac": { on: true, setpointC: 24, mode: "cool", fan: 1 },
    "cx-music": { on: false, source: "Cabin Ambient", volume: 25 },
  },

  openingSceneId: "welcome",
  openingClockMin: 9 * 60,

  environment: {
    sunriseMin: 6 * 60 + 20,
    sunsetMin: 18 * 60 + 55,
    outdoorPeakLux: 95000,
    /**
     * A corner cabin behind one full-height glazed wall.
     *
     * Above the hotel room's, which has a single pane in a deep
     * rectangular room, and below the lobby's double-height entrance
     * wall. The blinds multiply this by their own transmission, so the
     * figure is for them fully raised.
     */
    windowFactor: 0.0038,
    designLux: 400,
    outdoorMinC: 26,
    outdoorMaxC: 34,
  },

  baseline: {
    lightingWatts: 920,
    hvacWatts: 2600,
    operatingHours: { startMin: 8 * 60, endMin: 20 * 60 },
    hvacHours: { startMin: 8 * 60, endMin: 20 * 60 },
    note:
      "50 W halogen downlights on two switched circuits, an uncontrolled desk pendant, no cove or feature lighting at all and a fan coil running the whole working day — an executive floor fitted out around 2012.",
  },

  tariffPerKwh: 11.5,
  currency: "₹",
};
