"use client";

/**
 * Illustrated living room — the zero-asset renderer.
 *
 * Drawn as if fully and evenly lit. It carries no device state at all: dimming,
 * colour temperature, beams and bloom are entirely the light layer's job, and
 * darkness is a separate overlay. That separation is the point — this component
 * is a placeholder for a photograph, and when Uniser supplies a base image shot
 * with the fixtures off, it is replaced without a single control changing.
 *
 * Geometry is a straight-on elevation at 1600×900. Depth comes from a cornice,
 * a baseboard, a floor reflection and a rug drawn in perspective rather than
 * from a full one-point projection, which would fight the normalized glow
 * coordinates in the space config for very little gain.
 */

import { STAGE_H, STAGE_W } from "../geometry";

export function LivingRoom() {
  return (
    <svg
      viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
      className="absolute inset-0 h-full w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id="lr-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d9d3c8" />
          <stop offset="100%" stopColor="#bfb8ac" />
        </linearGradient>
        <linearGradient id="lr-ceiling" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e4dfd6" />
          <stop offset="100%" stopColor="#cec9bf" />
        </linearGradient>
        <linearGradient id="lr-coffer" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#aca69b" />
          <stop offset="100%" stopColor="#c4beb3" />
        </linearGradient>
        <linearGradient id="lr-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8d6c4b" />
          <stop offset="55%" stopColor="#79593b" />
          <stop offset="100%" stopColor="#5f472f" />
        </linearGradient>
        <linearGradient id="lr-rug" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#82908e" />
          <stop offset="100%" stopColor="#616d6b" />
        </linearGradient>
        <linearGradient id="lr-sofa" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a2abb5" />
          <stop offset="100%" stopColor="#7b848f" />
        </linearGradient>
        <linearGradient id="lr-sofa-seat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#98a1ac" />
          <stop offset="100%" stopColor="#6f7883" />
        </linearGradient>
        <linearGradient id="lr-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#54432f" />
          <stop offset="100%" stopColor="#3c2f21" />
        </linearGradient>
        <linearGradient id="lr-view" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c3d0dd" />
          <stop offset="62%" stopColor="#9db0c3" />
          <stop offset="100%" stopColor="#7c8fa3" />
        </linearGradient>
        {/* Soft pool of reflected light on the floor under bright objects. */}
        <linearGradient id="lr-reflect" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* ---------------- Shell ---------------- */}

      <rect x="0" y="0" width="1600" height="126" fill="url(#lr-ceiling)" />
      <rect x="0" y="120" width="1600" height="580" fill="url(#lr-wall)" />
      <rect x="0" y="700" width="1600" height="200" fill="url(#lr-floor)" />

      {/* Coffer the cove sits in. */}
      <rect x="200" y="28" width="1200" height="64" rx="3" fill="url(#lr-coffer)" />
      {/* Artificial sky panel, unlit. */}
      <rect x="620" y="34" width="360" height="52" rx="4" fill="#c9cdd4" />
      <rect
        x="620"
        y="34"
        width="360"
        height="52"
        rx="4"
        fill="none"
        stroke="#9aa0a9"
        strokeWidth="2"
      />
      {/* The cove fixture itself — a dark channel until it is switched on. */}
      <rect x="210" y="86" width="1180" height="7" rx="3" fill="#2d3037" />

      {/* Cornice and baseboard do most of the work of making this read as a
          room rather than a backdrop. */}
      <rect x="0" y="118" width="1600" height="9" fill="#cbc5ba" />
      <rect x="0" y="127" width="1600" height="4" fill="#a49d92" opacity="0.55" />
      <rect x="0" y="684" width="1600" height="16" fill="#b3aca1" />
      <rect x="0" y="700" width="1600" height="3" fill="#4a3826" opacity="0.6" />

      {/* Floor boards. */}
      {Array.from({ length: 11 }, (_, i) => (
        <rect
          key={`board-${i}`}
          x={i * 150 - 20}
          y="703"
          width="3"
          height="197"
          fill="#4b3824"
          opacity="0.35"
        />
      ))}

      {/* ---------------- Track and downlights ---------------- */}

      <rect x="180" y="98" width="800" height="10" rx="3" fill="#2a2d33" />
      {[240, 430, 700, 880].map((x) => (
        <g key={`head-${x}`}>
          <rect x={x - 9} y="106" width="18" height="14" rx="3" fill="#33373f" />
          <rect x={x - 13} y="118" width="26" height="9" rx="4" fill="#22252b" />
        </g>
      ))}
      {[300, 560, 820, 1080, 1340].map((x) => (
        <circle key={`dl-${x}`} cx={x} cy="122" r="11" fill="#20232a" />
      ))}

      {/* ---------------- Window ---------------- */}

      <rect x="1100" y="170" width="360" height="470" fill="url(#lr-view)" />
      {/* Distant skyline, kept low-contrast so it never competes with the room. */}
      <g fill="#8496a9" opacity="0.75">
        <rect x="1112" y="470" width="46" height="120" />
        <rect x="1166" y="430" width="34" height="160" />
        <rect x="1208" y="495" width="52" height="95" />
        <rect x="1300" y="450" width="40" height="140" />
        <rect x="1348" y="500" width="60" height="90" />
        <rect x="1416" y="465" width="34" height="125" />
      </g>
      <rect x="1100" y="588" width="360" height="52" fill="#7c8fa3" opacity="0.5" />
      {/* Frame and mullion. */}
      <rect
        x="1100"
        y="170"
        width="360"
        height="470"
        fill="none"
        stroke="#3b3f47"
        strokeWidth="9"
      />
      <rect x="1276" y="170" width="8" height="470" fill="#3b3f47" />
      <rect x="1092" y="640" width="376" height="14" rx="3" fill="#b3aca1" />

      {/* ---------------- Rug ---------------- */}

      <polygon
        points="560,655 1080,655 1132,792 508,792"
        fill="url(#lr-rug)"
      />
      <polygon
        points="596,668 1044,668 1086,778 554,778"
        fill="none"
        stroke="#4e5857"
        strokeWidth="3"
        opacity="0.6"
      />

      {/* ---------------- Media wall ---------------- */}

      <rect x="120" y="555" width="420" height="100" rx="6" fill="url(#lr-wood)" />
      <rect x="120" y="555" width="420" height="5" rx="2" fill="#6a5540" />
      <rect x="330" y="555" width="3" height="100" fill="#2b2118" opacity="0.7" />
      <rect x="150" y="655" width="14" height="26" fill="#2b2118" />
      <rect x="496" y="655" width="14" height="26" fill="#2b2118" />
      <rect x="120" y="681" width="420" height="10" fill="#000000" opacity="0.22" />

      {/* Television. */}
      <rect x="160" y="250" width="340" height="250" rx="8" fill="#191c21" />
      <rect x="170" y="259" width="320" height="232" rx="4" fill="#0f1115" />
      <rect
        x="160"
        y="250"
        width="340"
        height="250"
        rx="8"
        fill="none"
        stroke="#2c3037"
        strokeWidth="3"
      />

      {/* ---------------- Artwork (smart canvas) ---------------- */}

      <rect x="700" y="205" width="240" height="200" rx="3" fill="#2f2a24" />
      <rect x="712" y="217" width="216" height="176" fill="#8d8577" />
      <rect
        x="700"
        y="205"
        width="240"
        height="200"
        rx="3"
        fill="none"
        stroke="#231f1a"
        strokeWidth="4"
      />

      {/* ---------------- Sofa ---------------- */}

      <ellipse cx="795" cy="686" rx="215" ry="16" fill="#000000" opacity="0.25" />
      <rect x="600" y="495" width="390" height="108" rx="14" fill="url(#lr-sofa)" />
      <rect x="626" y="510" width="166" height="86" rx="10" fill="#8f98a3" opacity="0.7" />
      <rect x="800" y="510" width="166" height="86" rx="10" fill="#8f98a3" opacity="0.7" />
      <rect x="610" y="588" width="370" height="76" rx="12" fill="url(#lr-sofa-seat)" />
      <rect x="596" y="540" width="46" height="130" rx="12" fill="url(#lr-sofa)" />
      <rect x="948" y="540" width="46" height="130" rx="12" fill="url(#lr-sofa)" />
      <rect x="632" y="664" width="16" height="22" fill="#33281d" />
      <rect x="942" y="664" width="16" height="22" fill="#33281d" />

      {/* ---------------- Coffee table (in front of the sofa) ---------------- */}

      <ellipse cx="800" cy="704" rx="130" ry="12" fill="#000000" opacity="0.22" />
      <rect x="680" y="652" width="240" height="14" rx="5" fill="#5b4832" />
      <rect x="700" y="666" width="12" height="38" fill="#3f3122" />
      <rect x="888" y="666" width="12" height="38" fill="#3f3122" />

      {/* ---------------- Side table and pendant ---------------- */}

      <rect x="1005" y="570" width="86" height="10" rx="4" fill="#5b4832" />
      <rect x="1042" y="580" width="12" height="86" fill="#3f3122" />
      <rect x="1014" y="666" width="68" height="8" rx="3" fill="#3f3122" />

      <rect x="1044" y="127" width="4" height="175" fill="#2f333a" />
      <polygon points="1017,302 1077,302 1092,344 1002,344" fill="#33373f" />
      <ellipse cx="1047" cy="344" rx="45" ry="7" fill="#1d2027" />

      {/* ---------------- Plant ---------------- */}

      <path
        d="M1495 640 L1555 640 L1546 700 L1504 700 Z"
        fill="#5c4a38"
      />
      <g fill="#4f6b52">
        <ellipse cx="1500" cy="590" rx="17" ry="42" transform="rotate(-22 1500 590)" />
        <ellipse cx="1525" cy="566" rx="15" ry="48" />
        <ellipse cx="1550" cy="592" rx="17" ry="42" transform="rotate(22 1550 592)" />
        <ellipse cx="1512" cy="614" rx="14" ry="34" transform="rotate(-12 1512 614)" />
        <ellipse cx="1540" cy="616" rx="14" ry="34" transform="rotate(12 1540 616)" />
      </g>

      {/* Floor reflection under the media wall and window, which is what sells
          a polished floor at low light levels. */}
      <rect x="140" y="703" width="400" height="120" fill="url(#lr-reflect)" />
      <rect x="1110" y="703" width="340" height="150" fill="url(#lr-reflect)" />
    </svg>
  );
}
