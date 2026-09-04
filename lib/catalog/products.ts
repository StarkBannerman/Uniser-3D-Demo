/**
 * The Uniser product catalog.
 *
 * ⚠️  EVERY ENTRY HERE IS CURRENTLY `verified: false`.
 *
 * Product *names* and *families* are taken from unisersmartspaces.com and are
 * real. The numeric specs — wattages, lumen output, beam angles, CRI, IP
 * ratings — are plausible placeholders inferred from comparable fixtures, NOT
 * from Uniser datasheets.
 *
 * The `verified` flag is not decoration. The product panel renders an unmissable
 * warning badge on anything still false, so a salesperson cannot accidentally
 * quote an invented lumen figure to a client. As real datasheets come in,
 * correct the specs and flip the flag — do not flip the flag to tidy up the UI.
 *
 * The energy model reads `wattsEach` and `lumensEach` from the *space* config,
 * not from here, so those two numbers need correcting in both places.
 */

import type { Product } from "@/lib/sim/types";

export const products: Record<string, Product> = {
  /* ---------------- Lighting ---------------- */

  "connekt-profile": {
    id: "connekt-profile",
    name: "Connekt Strip & Profile",
    family: "Connekt Series",
    subsystem: "lighting",
    summary:
      "Linear LED strip in an aluminium profile, run continuously through coves and coffers for indirect light with no visible source.",
    specs: {
      "Output": "900 lm/m",
      "Load": "9 W/m",
      "Colour": "Tunable white 2200K–6500K",
      "CRI": "Ra > 90",
      "Dimming": "0–100% via SmartSpaces Wired",
      "Profile": "Recessed, surface or suspended aluminium",
    },
    verified: false,
  },

  "magneto-track": {
    id: "magneto-track",
    name: "Magneto Series Track Spot",
    family: "Magneto Series",
    subsystem: "lighting",
    summary:
      "Magnetic low-voltage track. Heads reposition by hand with no tools, so the lighting layout can follow art and furniture after handover.",
    specs: {
      "Output": "900 lm",
      "Load": "12 W",
      "Colour": "Tunable white 2700K–4000K",
      "Beam": "24° / 36° / 60° interchangeable",
      "CRI": "Ra > 95",
      "Track": "48 V magnetic, recessed or surface",
    },
    verified: false,
  },

  "proplus-downlight": {
    id: "proplus-downlight",
    name: "Pro Plus Series Downlight",
    family: "Pro Plus Series",
    subsystem: "lighting",
    summary:
      "Recessed downlight for general illumination — the ambient layer the other fixtures are accents against.",
    specs: {
      "Output": "800 lm",
      "Load": "9 W",
      "Colour": "Tunable white 2700K–5700K",
      "Beam": "60°",
      "CRI": "Ra > 90",
      "Cut-out": "75 mm",
    },
    verified: false,
  },

  "pipeline-pendant": {
    id: "pipeline-pendant",
    name: "Pipeline Series Pendant",
    family: "Pipeline Series",
    subsystem: "lighting",
    summary:
      "Suspended decorative pendant on an adjustable drop, for side tables and dining positions.",
    specs: {
      "Output": "1100 lm",
      "Load": "15 W",
      "Colour": "Tunable white 2200K–4000K",
      "CRI": "Ra > 90",
      "Drop": "Adjustable to 1500 mm",
    },
    verified: false,
  },

  "flexi-delta-rgb": {
    id: "flexi-delta-rgb",
    name: "Flexi Delta RGBW Strip",
    family: "Flexi Delta Series",
    subsystem: "lighting",
    summary:
      "Flexible RGBW strip for concealed accent work — behind media walls, under furniture, along skirtings.",
    specs: {
      "Output": "700 lm/m",
      "Load": "12 W/m",
      "Colour": "RGB + tunable white",
      "Bend radius": "20 mm",
      "IP rating": "IP20 (IP65 variant available)",
    },
    verified: false,
  },

  /* ---------------- Specialty ---------------- */

  "artificial-skylight": {
    id: "artificial-skylight",
    name: "Artificial Sky Light",
    family: "SmartSpaces Specialty",
    subsystem: "specialty",
    summary:
      "A ceiling panel that reproduces sky luminance and colour, giving windowless rooms a convincing daylight source that tracks the hour.",
    specs: {
      "Panel": "1200 × 600 mm modular",
      "Output": "8000 lm",
      "Load": "95 W",
      "Colour": "Dynamic 2000K–6500K sky simulation",
      "Mounting": "Recessed into ceiling grid or coffer",
    },
    verified: false,
  },

  "canvia-art": {
    id: "canvia-art",
    name: "Canvia Smart Art",
    family: "Canvia",
    subsystem: "specialty",
    summary:
      "A digital canvas that renders artwork with a matte, non-emissive finish, and changes with the scene.",
    specs: {
      "Display": "27 in anti-glare matte",
      "Load": "35 W active, 0.5 W standby",
      "Colour matching": "Adapts to ambient CCT",
      "Control": "Scene-linked via SmartSpaces",
    },
    verified: false,
  },

  "dew-scent": {
    id: "dew-scent",
    name: "Dew Scent Solution",
    family: "Dew",
    subsystem: "specialty",
    summary:
      "Cold-air scent diffusion tied into scenes, so arrival and evening settings carry a signature fragrance.",
    specs: {
      "Coverage": "Up to 150 m³",
      "Load": "8 W",
      "Control": "Scene-linked, intensity adjustable",
    },
    verified: false,
  },

  /* ---------------- Shades ---------------- */

  "uniser-curtain-track": {
    id: "uniser-curtain-track",
    name: "Motorized Curtain Track",
    family: "SmartSpaces Shading",
    subsystem: "shades",
    summary:
      "Dual-track motorized curtains carrying a sheer and a blackout layer independently, so daylight can be softened or shut out entirely.",
    specs: {
      "Tracks": "Dual — sheer + blackout",
      "Motor": "Quiet DC, 38 dB(A)",
      "Load": "45 W while travelling, 0.4 W idle",
      "Travel": "Full close in ~9 s",
      "Control": "Position feedback, 0–100%",
    },
    verified: false,
  },

  /* ---------------- Climate & air ---------------- */

  "sensibo-airbend": {
    id: "sensibo-airbend",
    name: "Sensibo AirBend",
    family: "Sensibo",
    subsystem: "climate",
    summary:
      "Retrofits existing split and cassette AC units into the automation system — no HVAC replacement, which is what makes climate control viable on a refurbishment.",
    specs: {
      "Compatibility": "Existing IR-controlled split / cassette units",
      "Sensing": "Temperature and humidity on board",
      "Load": "2 W",
      "Control": "Setpoint, mode, fan, scheduling, geofence",
    },
    verified: false,
  },

  "ubreathe-airlab": {
    id: "ubreathe-airlab",
    name: "uBreathe Air Lab",
    family: "uBreathe",
    subsystem: "air",
    summary:
      "Plant-based air purification with live particulate readout — the visible answer to Mumbai's ambient PM2.5.",
    specs: {
      "Coverage": "Up to 500 sq ft",
      "Load": "45 W",
      "Filtration": "Phytoremediation + HEPA stage",
      "Sensing": "PM2.5, VOC",
    },
    verified: false,
  },

  /* ---------------- Entertainment & access ---------------- */

  "smartspaces-av": {
    id: "smartspaces-av",
    name: "Smart Entertainment Package",
    family: "SmartSpaces AV",
    subsystem: "av",
    summary:
      "Sources, multi-room audio and a motorized projector screen, all switched from the same scene that sets the lights.",
    specs: {
      "Sources": "HDMI matrix, streaming, multi-room audio",
      "Screen": "Motorized tab-tensioned, ~6 s drop",
      "Load": "180 W active, 2 W standby",
      "Control": "Scene-linked with lighting and shading",
    },
    verified: false,
  },

  "smart-lock-doorbell": {
    id: "smart-lock-doorbell",
    name: "Smart Lock & Video Doorbell",
    family: "SmartSpaces Access",
    subsystem: "access",
    summary:
      "Keyless entry with a video doorbell that can trigger a whole arrival scene rather than just unlocking a door.",
    specs: {
      "Access": "PIN, fingerprint, app, physical key override",
      "Doorbell": "1080p with two-way audio",
      "Power": "Battery, ~8 months",
      "Control": "Scene trigger on unlock or ring",
    },
    verified: false,
  },

  /* ---------------- Control backbone ---------------- */

  "smartspaces-wired": {
    id: "smartspaces-wired",
    name: "SmartSpaces Wired",
    family: "SmartSpaces",
    subsystem: "lighting",
    summary:
      "The hardwired control backbone for new build and full refurbishment: dimming modules in the panel, keypads and touch panels on the wall. Nothing depends on wireless once it is in.",
    specs: {
      "Topology": "Hardwired bus to central dimming panel",
      "Channels": "Trailing-edge dimming, 0–10 V and DALI",
      "Interfaces": "Wall keypads, touch panels, app, voice",
      "Scenes": "Unlimited, with per-channel fade times",
    },
    verified: false,
  },

  "smartobuddy-zigbee": {
    id: "smartobuddy-zigbee",
    name: "Smartobuddy Zigbee Wireless",
    family: "Smartobuddy",
    subsystem: "lighting",
    summary:
      "Zigbee retrofit that goes into existing switch boxes. This is the answer to an occupied building where rewiring is not on the table.",
    specs: {
      "Protocol": "Zigbee 3.0 mesh",
      "Install": "Retrofit into existing switch boxes",
      "Rewiring": "None",
      "Interfaces": "App, retrofit keypad, voice",
    },
    verified: false,
  },

  "smartspaces-multisensor": {
    id: "smartspaces-multisensor",
    name: "SmartSpaces Multi-Sensor",
    family: "SmartSpaces",
    subsystem: "sensors",
    summary:
      "Occupancy, ambient light and temperature in one ceiling fitting. This is the part that turns remote control into automation.",
    specs: {
      "Occupancy": "PIR + microwave, 8 m radius",
      "Light": "0–2000 lux ambient measurement",
      "Also senses": "Temperature, humidity",
      "Load": "0.5 W",
    },
    verified: false,
  },

  /* ---------------- Energy ---------------- */

  myminigrid: {
    id: "myminigrid",
    name: "MyMiniGrid Power",
    family: "MyMiniGrid",
    subsystem: "energy",
    summary:
      "Rooftop solar with optional battery, metered into the same dashboard as the loads — so consumption and generation are read side by side.",
    specs: {
      "Array": "3 kWp indicative residential",
      "Battery": "5 kWh optional",
      "Inverter": "Hybrid, grid-tied with backup",
      "Monitoring": "Live generation, consumption and export",
    },
    verified: false,
  },

  "sunsac-water": {
    id: "sunsac-water",
    name: "SunSac Water Heating",
    family: "SunSac",
    subsystem: "energy",
    summary:
      "Solar thermal water heating — typically the single largest electrical load in a residence after air conditioning.",
    specs: {
      "Capacity": "200 l indicative",
      "Backup": "Electric element on timer",
      "Monitoring": "Tank temperature, backup runtime",
    },
    verified: false,
  },
};

export function getProduct(id: string): Product | undefined {
  return products[id];
}

/** Every product still carrying placeholder specs. */
export function unverifiedProductIds(): string[] {
  return Object.values(products)
    .filter((p) => !p.verified)
    .map((p) => p.id);
}
