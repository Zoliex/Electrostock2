import React from "react";

export const COLOR_MAP: Record<number, string> = {
  0: "#111827", // Black
  1: "#78350F", // Brown
  2: "#DC2626", // Red
  3: "#EA580C", // Orange
  4: "#FACC15", // Yellow
  5: "#16A34A", // Green
  6: "#2563EB", // Blue
  7: "#7C3AED", // Violet
  8: "#6B7280", // Gray
  9: "#F8FAFC", // White
};

export const MULTIPLIER_MAP: Record<number, string> = {
  0: "#111827", // Black (1)
  1: "#78350F", // Brown (10)
  2: "#DC2626", // Red (100)
  3: "#EA580C", // Orange (1k)
  4: "#FACC15", // Yellow (10k)
  5: "#16A34A", // Green (100k)
  6: "#2563EB", // Blue (1M)
  7: "#7C3AED", // Violet (10M)
  8: "#6B7280", // Gray (100M)
  9: "#F8FAFC", // White (1G)
  [-1]: "#D97706", // Gold (0.1)
  [-2]: "#94A3B8", // Silver (0.01)
};

export const TOLERANCE_MAP: Record<string, string> = {
  "1%": "#78350F",   // Brown
  "2%": "#DC2626",   // Red
  "3%": "#EA580C",   // Orange
  "4%": "#FACC15",   // Yellow
  "0.5%": "#16A34A", // Green
  "0.25%": "#2563EB",// Blue
  "0.1%": "#7C3AED", // Violet
  "0.05%": "#6B7280",// Gray
  "5%": "#D97706",   // Gold
  "10%": "#94A3B8",  // Silver
  "20%": "transparent", // None
};

export const TEMPCO_MAP: Record<string, string> = {
  "250ppm": "#111827", // Black
  "100ppm": "#78350F", // Brown
  "50ppm": "#DC2626",  // Red
  "15ppm": "#EA580C",  // Orange
  "25ppm": "#FACC15",  // Yellow
  "20ppm": "#16A34A",  // Green
  "10ppm": "#2563EB",  // Blue
  "5ppm": "#7C3AED",   // Violet
  "1ppm": "#6B7280",   // Gray
};

export const parseElectronicValue = (val: string) => {
  if (!val) return null;
  const clean = val.replace(/\s/g, "").replace(/Ω/g, "R").replace(/ohm/gi, "R");
  const match = clean.match(/^(\d+\.?\d*)([kMGµmnhR]?)(H|R)?$/i);
  if (!match) return null;

  let num = parseFloat(match[1]);
  const multiplier = match[2];

  switch (multiplier) {
    case "k":
    case "K":
      num *= 1000;
      break;
    case "M":
      num *= 1000000;
      break;
    case "G":
      num *= 1000000000;
      break;
    case "m":
      num /= 1000;
      break;
    case "µ":
    case "u":
    case "U":
      num /= 1000000;
      break;
    case "n":
    case "N":
      num /= 1000000000;
      break;
  }
  return num;
};

export const getResistorBands = (value: number, bandCount: number) => {
  if (value <= 0) return [];

  const sigDigits = bandCount === 4 ? 2 : 3;
  let exp = Math.floor(Math.log10(value));
  exp -= sigDigits - 1;

  if (exp < -2) exp = -2;
  if (exp > 9) exp = 9;

  let base = Math.round(value / Math.pow(10, exp));

  if (base >= Math.pow(10, sigDigits)) {
    base /= 10;
    exp += 1;
  }

  const baseStr = base.toString().padStart(sigDigits, "0");
  const digits = baseStr.split("").map(Number);

  return [...digits, exp];
};

export const getInductorBands = (value: number) => {
  if (value <= 0) return [];

  if (value < 1) {
    const val = Math.round(value * 100);
    const d1 = Math.floor(val / 10);
    const d2 = val % 10;
    return [-1, d1, d2];
  } else if (value < 10) {
    const d1 = Math.floor(value);
    const d2 = Math.round((value - d1) * 10);
    return [d1, -1, d2];
  } else {
    return getResistorBands(value, 4);
  }
};

const formatDisplayValue = (value: string, unit: string, fallbackNumber = "10") => {
  const trimmed = (value || "").trim();
  if (trimmed.toLowerCase() === "batch" || trimmed.toLowerCase() === "batch mode") {
    return `BATCH (${unit})`;
  }
  const cleanNum = trimmed || fallbackNumber;
  return `${cleanNum}${unit}`;
};

export const ResistorVisual = ({
  value,
  unit,
  tolerance,
  tempCo,
  bandCount,
  svgRef
}: {
  value: string;
  unit: string;
  tolerance: string;
  tempCo: string;
  bandCount: number;
  svgRef?: React.RefObject<SVGSVGElement | null>;
}) => {
  const effectiveVal = value && value.trim() && !value.toLowerCase().includes("batch") ? value.trim() : "10";
  const calcValue = `${effectiveVal}${unit}`;
  const displayLabel = formatDisplayValue(value, unit, "10");
  const numValue = parseElectronicValue(calcValue);
  const bands = numValue ? getResistorBands(numValue, bandCount) : [1, 0, 0];
  const font = "'Inter', system-ui, sans-serif";
  const toleranceColor = TOLERANCE_MAP[tolerance] || "#D97706";
  const tempCoColor = TEMPCO_MAP[tempCo] || "#78350F";

  return (
    <div className="flex items-center justify-center p-2.5 bg-slate-100/70 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 w-full">
      <svg
        ref={svgRef}
        viewBox="0 0 240 240"
        className="w-full h-auto max-w-[200px] aspect-square rounded-xl shadow-sm block"
      >
        <defs>
          <linearGradient id="resLead" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#94A3B8" />
            <stop offset="45%" stopColor="#E2E8F0" />
            <stop offset="100%" stopColor="#64748B" />
          </linearGradient>
          <linearGradient id="resBody" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#F5DEB3" />
            <stop offset="35%" stopColor="#E6C280" />
            <stop offset="80%" stopColor="#C89D54" />
            <stop offset="100%" stopColor="#A67B37" />
          </linearGradient>
          <linearGradient id="resHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.45" />
            <stop offset="30%" stopColor="#FFFFFF" stopOpacity="0.0" />
            <stop offset="85%" stopColor="#000000" stopOpacity="0.0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.25" />
          </linearGradient>
          <clipPath id="resBodyClip">
            <path d="M 32 86 C 32 78, 68 78, 74 88 L 166 88 C 172 78, 208 78, 208 86 L 208 134 C 208 142, 172 142, 166 132 L 74 132 C 68 142, 32 142, 32 134 Z" />
          </clipPath>
        </defs>

        {/* Card Background */}
        <rect width="240" height="240" rx="16" fill="#F8FAFC" />
        <rect x="6" y="6" width="228" height="228" rx="12" fill="none" stroke="#E2E8F0" strokeWidth="1.5" />

        {/* Header Label */}
        <text x="120" y="34" textAnchor="middle" fontFamily={font} fontSize="12" fontWeight="800" fill="#64748B" letterSpacing="3">
          RESISTOR ({bandCount}-BAND)
        </text>

        {/* Metallic Leads */}
        <rect x="8" y="105" width="224" height="10" rx="3" fill="url(#resLead)" />

        {/* Dog-bone Ceramic Body */}
        <path
          d="M 32 86 C 32 78, 68 78, 74 88 L 166 88 C 172 78, 208 78, 208 86 L 208 134 C 208 142, 172 142, 166 132 L 74 132 C 68 142, 32 142, 32 134 Z"
          fill="url(#resBody)"
        />

        {/* Color Bands Clipped to Body */}
        <g clipPath="url(#resBodyClip)">
          {bands.map((digit, i) => {
            const isMultiplier = i === (bandCount === 4 ? 2 : 3);
            const color = isMultiplier ? MULTIPLIER_MAP[digit] : COLOR_MAP[digit];
            const x = 54 + i * 22;
            return <rect key={i} x={x} y="75" width="11" height="70" fill={color || "#CBD5E1"} />;
          })}
          {/* Tolerance Band */}
          <rect x={bandCount === 6 ? 158 : 172} y="75" width="11" height="70" fill={toleranceColor} />
          {/* TempCo Band */}
          {bandCount === 6 && <rect x="182" y="75" width="11" height="70" fill={tempCoColor} />}
          {/* 3D Cylindrical Shading Overlay */}
          <rect x="30" y="75" width="180" height="70" fill="url(#resHighlight)" />
        </g>

        {/* Value & Tolerance Footer */}
        <text x="120" y="188" textAnchor="middle" fontFamily={font} fontSize="30" fontWeight="900" fill="#0F172A">
          {displayLabel}
        </text>
        <text x="120" y="212" textAnchor="middle" fontFamily={font} fontSize="13" fontWeight="700" fill="#64748B">
          ±{tolerance}{bandCount === 6 ? ` • ${tempCo}` : ""}
        </text>
      </svg>
    </div>
  );
};

export const InductorVisual = ({
  value,
  unit,
  tolerance,
  svgRef
}: {
  value: string;
  unit: string;
  tolerance: string;
  svgRef?: React.RefObject<SVGSVGElement | null>;
}) => {
  const effectiveVal = value && value.trim() && !value.toLowerCase().includes("batch") ? value.trim() : "10";
  const calcValue = `${effectiveVal}${unit}`;
  const displayLabel = formatDisplayValue(value, unit, "10");
  const numValue = parseElectronicValue(calcValue);
  const bands = numValue ? getInductorBands(numValue * 1000000) : [1, 0, 0];
  const font = "'Inter', system-ui, sans-serif";
  const toleranceColor = TOLERANCE_MAP[tolerance] || "#94A3B8";

  return (
    <div className="flex items-center justify-center p-2.5 bg-slate-100/70 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 w-full">
      <svg
        ref={svgRef}
        viewBox="0 0 240 240"
        className="w-full h-auto max-w-[200px] aspect-square rounded-xl shadow-sm block"
      >
        <defs>
          <linearGradient id="indLead" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#94A3B8" />
            <stop offset="50%" stopColor="#F1F5F9" />
            <stop offset="100%" stopColor="#64748B" />
          </linearGradient>
          <linearGradient id="indBody" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#6EE7B7" />
            <stop offset="45%" stopColor="#34D399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <clipPath id="indBodyClip">
            <rect x="34" y="84" width="172" height="52" rx="26" />
          </clipPath>
        </defs>

        <rect width="240" height="240" rx="16" fill="#F8FAFC" />
        <rect x="6" y="6" width="228" height="228" rx="12" fill="none" stroke="#E2E8F0" strokeWidth="1.5" />

        <text x="120" y="34" textAnchor="middle" fontFamily={font} fontSize="12" fontWeight="800" fill="#64748B" letterSpacing="3">
          AXIAL INDUCTOR
        </text>

        <rect x="8" y="105" width="224" height="10" rx="3" fill="url(#indLead)" />
        <rect x="34" y="84" width="172" height="52" rx="26" fill="url(#indBody)" />

        <g clipPath="url(#indBodyClip)">
          {bands.map((digit, i) => {
            const color =
              digit === -1
                ? "#D97706"
                : i === 2 && bands.length === 3
                ? MULTIPLIER_MAP[digit]
                : COLOR_MAP[digit];
            const x = 60 + i * 32;
            return <rect key={i} x={x} y="80" width="13" height="60" fill={color || "#CBD5E1"} />;
          })}
          <rect x="168" y="80" width="13" height="60" fill={toleranceColor} />
        </g>

        <text x="120" y="188" textAnchor="middle" fontFamily={font} fontSize="30" fontWeight="900" fill="#0F172A">
          {displayLabel}
        </text>
        <text x="120" y="212" textAnchor="middle" fontFamily={font} fontSize="13" fontWeight="700" fill="#64748B">
          ±{tolerance}
        </text>
      </svg>
    </div>
  );
};

export const TransistorVisual = ({
  value,
  svgRef
}: {
  value: string;
  svgRef?: React.RefObject<SVGSVGElement | null>;
}) => {
  const font = "'Inter', system-ui, sans-serif";
  const label = value && value.trim() ? value.trim() : "2N3904";

  return (
    <div className="flex items-center justify-center p-2.5 bg-slate-100/70 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 w-full">
      <svg
        ref={svgRef}
        viewBox="0 0 240 240"
        className="w-full h-auto max-w-[200px] aspect-square rounded-xl shadow-sm block"
      >
        <defs>
          <linearGradient id="transBody" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="100%" stopColor="#0F172A" />
          </linearGradient>
          <linearGradient id="transTop" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#64748B" />
            <stop offset="100%" stopColor="#334155" />
          </linearGradient>
          <linearGradient id="leadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#94A3B8" />
            <stop offset="50%" stopColor="#F8FAFC" />
            <stop offset="100%" stopColor="#64748B" />
          </linearGradient>
        </defs>

        <rect width="240" height="240" rx="16" fill="#F8FAFC" />
        <rect x="6" y="6" width="228" height="228" rx="12" fill="none" stroke="#E2E8F0" strokeWidth="1.5" />

        <text x="120" y="32" textAnchor="middle" fontFamily={font} fontSize="12" fontWeight="800" fill="#64748B" letterSpacing="3">
          TRANSISTOR
        </text>

        {/* 3 Metallic Leads */}
        <rect x="84" y="138" width="8" height="62" rx="3" fill="url(#leadGrad)" />
        <rect x="116" y="138" width="8" height="62" rx="3" fill="url(#leadGrad)" />
        <rect x="148" y="138" width="8" height="62" rx="3" fill="url(#leadGrad)" />

        {/* TO-92 D-Shaped Crown & Body */}
        <path d="M 64 82 C 64 44, 176 44, 176 82 Z" fill="url(#transTop)" />
        <rect x="64" y="82" width="112" height="62" rx="6" fill="url(#transBody)" />
        <line x1="68" y1="84" x2="172" y2="84" stroke="#94A3B8" strokeWidth="1" strokeOpacity="0.4" />

        {/* Laser Etched Part Marking */}
        <text x="120" y="118" textAnchor="middle" fontFamily={font} fontSize="19" fontWeight="800" fill="#E2E8F0" letterSpacing="1">
          {label.slice(0, 10)}
        </text>

        {/* Bottom Label */}
        <text x="120" y="220" textAnchor="middle" fontFamily={font} fontSize="16" fontWeight="800" fill="#0F172A">
          {label}
        </text>
      </svg>
    </div>
  );
};

export const CapacitorVisual = ({
  value,
  unit,
  type,
  svgRef
}: {
  value: string;
  unit: string;
  type: string;
  svgRef?: React.RefObject<SVGSVGElement | null>;
}) => {
  const font = "'Inter', system-ui, sans-serif";
  const displayLabel = formatDisplayValue(value, unit, "10");

  let capContent = null;
  if (type === "Electrolytic") {
    capContent = (
      <>
        <defs>
          <linearGradient id="elecBody" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1E293B" />
            <stop offset="30%" stopColor="#334155" />
            <stop offset="85%" stopColor="#0F172A" />
            <stop offset="100%" stopColor="#1E293B" />
          </linearGradient>
          <linearGradient id="elecTop" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#E2E8F0" />
            <stop offset="100%" stopColor="#64748B" />
          </linearGradient>
          <linearGradient id="elecStripe" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#F1F5F9" />
            <stop offset="100%" stopColor="#CBD5E1" />
          </linearGradient>
          <linearGradient id="leadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#94A3B8" />
            <stop offset="50%" stopColor="#F8FAFC" />
            <stop offset="100%" stopColor="#64748B" />
          </linearGradient>
        </defs>
        <text x="120" y="32" textAnchor="middle" fontFamily={font} fontSize="11" fontWeight="800" fill="#64748B" letterSpacing="2.5">
          ELECTROLYTIC CAP
        </text>
        <rect x="96" y="152" width="7" height="44" rx="3" fill="url(#leadGrad)" />
        <rect x="137" y="152" width="7" height="52" rx="3" fill="url(#leadGrad)" />
        <path d="M 68 62 L 68 152 A 52 12 0 0 0 172 152 L 172 62 Z" fill="url(#elecBody)" />
        <path d="M 68 62 L 68 152 A 52 12 0 0 0 90 156 L 90 66 A 52 12 0 0 1 68 62 Z" fill="url(#elecStripe)" />
        <rect x="75" y="82" width="8" height="3" rx="1" fill="#475569" />
        <rect x="75" y="106" width="8" height="3" rx="1" fill="#475569" />
        <rect x="75" y="130" width="8" height="3" rx="1" fill="#475569" />
        <ellipse cx="120" cy="62" rx="52" ry="12" fill="url(#elecTop)" />
        <text x="132" y="116" textAnchor="middle" fontFamily={font} fontSize="20" fontWeight="800" fill="#F8FAFC">
          {displayLabel}
        </text>
      </>
    );
  } else if (type === "Ceramic") {
    capContent = (
      <>
        <defs>
          <radialGradient id="cerBody" cx="38%" cy="38%" r="62%">
            <stop offset="0%" stopColor="#FBBF24" />
            <stop offset="70%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#B45309" />
          </radialGradient>
          <linearGradient id="leadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#94A3B8" />
            <stop offset="50%" stopColor="#F8FAFC" />
            <stop offset="100%" stopColor="#64748B" />
          </linearGradient>
        </defs>
        <text x="120" y="32" textAnchor="middle" fontFamily={font} fontSize="11" fontWeight="800" fill="#64748B" letterSpacing="2.5">
          CERAMIC CAPACITOR
        </text>
        <rect x="92" y="136" width="6" height="62" rx="3" fill="url(#leadGrad)" />
        <rect x="142" y="136" width="6" height="62" rx="3" fill="url(#leadGrad)" />
        <circle cx="120" cy="98" r="48" fill="url(#cerBody)" />
        <text x="120" y="105" textAnchor="middle" fontFamily={font} fontSize="20" fontWeight="800" fill="#451A03">
          {displayLabel}
        </text>
      </>
    );
  } else {
    capContent = (
      <>
        <defs>
          <radialGradient id="tanBody" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#FDE047" />
            <stop offset="70%" stopColor="#EAB308" />
            <stop offset="100%" stopColor="#CA8A04" />
          </radialGradient>
          <linearGradient id="leadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#94A3B8" />
            <stop offset="50%" stopColor="#F8FAFC" />
            <stop offset="100%" stopColor="#64748B" />
          </linearGradient>
        </defs>
        <text x="120" y="32" textAnchor="middle" fontFamily={font} fontSize="11" fontWeight="800" fill="#64748B" letterSpacing="2.5">
          TANTALUM CAPACITOR
        </text>
        <rect x="94" y="140" width="6" height="58" rx="3" fill="url(#leadGrad)" />
        <rect x="140" y="140" width="6" height="58" rx="3" fill="url(#leadGrad)" />
        <path d="M 120 48 C 170 48, 178 116, 154 144 C 144 154, 96 154, 86 144 C 62 116, 70 48, 120 48 Z" fill="url(#tanBody)" />
        <text x="120" y="114" textAnchor="middle" fontFamily={font} fontSize="20" fontWeight="800" fill="#713F12">
          {displayLabel}
        </text>
        <path d="M 144 68 L 144 82" stroke="#854D0E" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M 137 75 L 151 75" stroke="#854D0E" strokeWidth="2.5" strokeLinecap="round" />
      </>
    );
  }

  return (
    <div className="flex items-center justify-center p-2.5 bg-slate-100/70 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 w-full">
      <svg
        ref={svgRef}
        viewBox="0 0 240 240"
        className="w-full h-auto max-w-[200px] aspect-square rounded-xl shadow-sm block"
      >
        <rect width="240" height="240" rx="16" fill="#F8FAFC" />
        <rect x="6" y="6" width="228" height="228" rx="12" fill="none" stroke="#E2E8F0" strokeWidth="1.5" />
        {capContent}
        <text x="120" y="220" textAnchor="middle" fontFamily={font} fontSize="16" fontWeight="800" fill="#0F172A">
          {displayLabel}
        </text>
      </svg>
    </div>
  );
};

export const getResistorSvgString = (
  value: string,
  unit: string,
  tolerance: string,
  tempCo: string,
  bandsCount: number
) => {
  const effectiveVal = value && value.trim() ? value.trim() : "10";
  const fullValue = `${effectiveVal}${unit}`;
  const numValue = parseElectronicValue(fullValue);
  const bands = numValue ? getResistorBands(numValue, bandsCount) : [1, 0, 0];
  const font = "'Inter', system-ui, sans-serif";
  const toleranceColor = TOLERANCE_MAP[tolerance] || "#D97706";
  const tempCoColor = TEMPCO_MAP[tempCo] || "#78350F";

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
      <defs>
        <linearGradient id="resLead" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#94A3B8" />
          <stop offset="45%" stop-color="#E2E8F0" />
          <stop offset="100%" stop-color="#64748B" />
        </linearGradient>
        <linearGradient id="resBody" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#F5DEB3" />
          <stop offset="35%" stop-color="#E6C280" />
          <stop offset="80%" stop-color="#C89D54" />
          <stop offset="100%" stop-color="#A67B37" />
        </linearGradient>
        <linearGradient id="resHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.45" />
          <stop offset="30%" stop-color="#FFFFFF" stop-opacity="0.0" />
          <stop offset="85%" stop-color="#000000" stop-opacity="0.0" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0.25" />
        </linearGradient>
        <clipPath id="resBodyClip">
          <path d="M 32 86 C 32 78, 68 78, 74 88 L 166 88 C 172 78, 208 78, 208 86 L 208 134 C 208 142, 172 142, 166 132 L 74 132 C 68 142, 32 142, 32 134 Z" />
        </clipPath>
      </defs>
      <rect width="240" height="240" rx="16" fill="#F8FAFC" />
      <rect x="6" y="6" width="228" height="228" rx="12" fill="none" stroke="#E2E8F0" stroke-width="1.5" />
      <text x="120" y="34" text-anchor="middle" font-family="${font}" font-size="12" font-weight="800" fill="#64748B" style="letter-spacing: 0.2em">RESISTOR (${bandsCount}-BAND)</text>
      <rect x="8" y="105" width="224" height="10" rx="3" fill="url(#resLead)" />
      <path d="M 32 86 C 32 78, 68 78, 74 88 L 166 88 C 172 78, 208 78, 208 86 L 208 134 C 208 142, 172 142, 166 132 L 74 132 C 68 142, 32 142, 32 134 Z" fill="url(#resBody)" />
      <g clip-path="url(#resBodyClip)">
        ${bands
          .map((digit, i) => {
            const isMultiplier = i === (bandsCount === 4 ? 2 : 3);
            const color = isMultiplier ? MULTIPLIER_MAP[digit] : COLOR_MAP[digit];
            const x = 54 + i * 22;
            return `<rect x="${x}" y="75" width="11" height="70" fill="${color || "#CBD5E1"}" />`;
          })
          .join("")}
        <rect x="${bandsCount === 6 ? 158 : 172}" y="75" width="11" height="70" fill="${toleranceColor}" />
        ${bandsCount === 6 ? `<rect x="182" y="75" width="11" height="70" fill="${tempCoColor}" />` : ""}
        <rect x="30" y="75" width="180" height="70" fill="url(#resHighlight)" />
      </g>
      <text x="120" y="188" text-anchor="middle" font-family="${font}" font-size="30" font-weight="900" fill="#0F172A">${fullValue}</text>
      <text x="120" y="212" text-anchor="middle" font-family="${font}" font-size="13" font-weight="700" fill="#64748B">±${tolerance}${bandsCount === 6 ? ` • ${tempCo}` : ""}</text>
    </svg>
  `;
};

export const getInductorSvgString = (value: string, unit: string, tolerance: string) => {
  const effectiveVal = value && value.trim() ? value.trim() : "10";
  const fullValue = `${effectiveVal}${unit}`;
  const numValue = parseElectronicValue(fullValue);
  const bands = numValue ? getInductorBands(numValue * 1000000) : [1, 0, 0];
  const font = "'Inter', system-ui, sans-serif";
  const toleranceColor = TOLERANCE_MAP[tolerance] || "#94A3B8";

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
      <defs>
        <linearGradient id="indLead" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#94A3B8" />
          <stop offset="50%" stop-color="#F1F5F9" />
          <stop offset="100%" stop-color="#64748B" />
        </linearGradient>
        <linearGradient id="indBody" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#6EE7B7" />
          <stop offset="45%" stop-color="#34D399" />
          <stop offset="100%" stop-color="#059669" />
        </linearGradient>
        <clipPath id="indBodyClip">
          <rect x="34" y="84" width="172" height="52" rx="26" />
        </clipPath>
      </defs>
      <rect width="240" height="240" rx="16" fill="#F8FAFC" />
      <rect x="6" y="6" width="228" height="228" rx="12" fill="none" stroke="#E2E8F0" stroke-width="1.5" />
      <text x="120" y="34" text-anchor="middle" font-family="${font}" font-size="12" font-weight="800" fill="#64748B" style="letter-spacing: 0.2em">AXIAL INDUCTOR</text>
      <rect x="8" y="105" width="224" height="10" rx="3" fill="url(#indLead)" />
      <rect x="34" y="84" width="172" height="52" rx="26" fill="url(#indBody)" />
      <g clip-path="url(#indBodyClip)">
        ${bands
          .map((digit, i) => {
            const color =
              digit === -1
                ? "#D97706"
                : i === 2 && bands.length === 3
                ? MULTIPLIER_MAP[digit]
                : COLOR_MAP[digit];
            const x = 60 + i * 32;
            return `<rect x="${x}" y="80" width="13" height="60" fill="${color || "#CBD5E1"}" />`;
          })
          .join("")}
        <rect x="168" y="80" width="13" height="60" fill="${toleranceColor}" />
      </g>
      <text x="120" y="188" text-anchor="middle" font-family="${font}" font-size="30" font-weight="900" fill="#0F172A">${fullValue}</text>
      <text x="120" y="212" text-anchor="middle" font-family="${font}" font-size="13" font-weight="700" fill="#64748B">±${tolerance}</text>
    </svg>
  `;
};

export const getTransistorSvgString = (value: string) => {
  const font = "'Inter', system-ui, sans-serif";
  const label = value && value.trim() ? value.trim() : "2N3904";
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
      <defs>
        <linearGradient id="transBody" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#334155" />
          <stop offset="100%" stop-color="#0F172A" />
        </linearGradient>
        <linearGradient id="transTop" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#64748B" />
          <stop offset="100%" stop-color="#334155" />
        </linearGradient>
        <linearGradient id="leadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#94A3B8" />
          <stop offset="50%" stop-color="#F8FAFC" />
          <stop offset="100%" stop-color="#64748B" />
        </linearGradient>
      </defs>
      <rect width="240" height="240" rx="16" fill="#F8FAFC"/>
      <rect x="6" y="6" width="228" height="228" rx="12" fill="none" stroke="#E2E8F0" stroke-width="1.5" />
      <text x="120" y="32" text-anchor="middle" font-family="${font}" font-size="12" font-weight="800" fill="#64748B" style="letter-spacing: 0.25em">TRANSISTOR</text>
      <rect x="84" y="138" width="8" height="62" rx="3" fill="url(#leadGrad)" />
      <rect x="116" y="138" width="8" height="62" rx="3" fill="url(#leadGrad)" />
      <rect x="148" y="138" width="8" height="62" rx="3" fill="url(#leadGrad)" />
      <path d="M 64 82 C 64 44, 176 44, 176 82 Z" fill="url(#transTop)" />
      <rect x="64" y="82" width="112" height="62" rx="6" fill="url(#transBody)" />
      <text x="120" y="118" text-anchor="middle" font-family="${font}" font-size="19" font-weight="800" fill="#E2E8F0" letter-spacing="1">${label.slice(0, 10)}</text>
      <text x="120" y="220" text-anchor="middle" font-family="${font}" font-size="16" font-weight="800" fill="#0F172A">${label}</text>
    </svg>
  `;
};

export const getCapacitorSvgString = (value: string, unit: string, type: string) => {
  const font = "'Inter', system-ui, sans-serif";
  const effectiveVal = value && value.trim() ? value.trim() : "10";
  const displayLabel = `${effectiveVal}${unit}`;
  let capContent = "";

  if (type === "Electrolytic") {
    capContent = `
      <defs>
        <linearGradient id="elecBody" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#1E293B" />
          <stop offset="30%" stop-color="#334155" />
          <stop offset="85%" stop-color="#0F172A" />
          <stop offset="100%" stop-color="#1E293B" />
        </linearGradient>
        <linearGradient id="elecTop" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#E2E8F0" />
          <stop offset="100%" stop-color="#64748B" />
        </linearGradient>
        <linearGradient id="elecStripe" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#F1F5F9" />
          <stop offset="100%" stop-color="#CBD5E1" />
        </linearGradient>
        <linearGradient id="leadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#94A3B8" />
          <stop offset="50%" stop-color="#F8FAFC" />
          <stop offset="100%" stop-color="#64748B" />
        </linearGradient>
      </defs>
      <text x="120" y="32" text-anchor="middle" font-family="${font}" font-size="11" font-weight="800" fill="#64748B" style="letter-spacing: 0.2em">ELECTROLYTIC CAP</text>
      <rect x="96" y="152" width="7" height="44" rx="3" fill="url(#leadGrad)" />
      <rect x="137" y="152" width="7" height="52" rx="3" fill="url(#leadGrad)" />
      <path d="M 68 62 L 68 152 A 52 12 0 0 0 172 152 L 172 62 Z" fill="url(#elecBody)" />
      <path d="M 68 62 L 68 152 A 52 12 0 0 0 90 156 L 90 66 A 52 12 0 0 1 68 62 Z" fill="url(#elecStripe)" />
      <ellipse cx="120" cy="62" rx="52" ry="12" fill="url(#elecTop)" />
      <text x="132" y="116" text-anchor="middle" font-family="${font}" font-size="20" font-weight="800" fill="#F8FAFC">${displayLabel}</text>
    `;
  } else if (type === "Ceramic") {
    capContent = `
      <defs>
        <radialGradient id="cerBody" cx="38%" cy="38%" r="62%">
          <stop offset="0%" stop-color="#FBBF24" />
          <stop offset="70%" stop-color="#D97706" />
          <stop offset="100%" stop-color="#B45309" />
        </radialGradient>
        <linearGradient id="leadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#94A3B8" />
          <stop offset="50%" stop-color="#F8FAFC" />
          <stop offset="100%" stop-color="#64748B" />
        </linearGradient>
      </defs>
      <text x="120" y="32" text-anchor="middle" font-family="${font}" font-size="11" font-weight="800" fill="#64748B" style="letter-spacing: 0.2em">CERAMIC CAPACITOR</text>
      <rect x="92" y="136" width="6" height="62" rx="3" fill="url(#leadGrad)" />
      <rect x="142" y="136" width="6" height="62" rx="3" fill="url(#leadGrad)" />
      <circle cx="120" cy="98" r="48" fill="url(#cerBody)" />
      <text x="120" y="105" text-anchor="middle" font-family="${font}" font-size="20" font-weight="800" fill="#451A03">${displayLabel}</text>
    `;
  } else {
    capContent = `
      <defs>
        <radialGradient id="tanBody" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#FDE047" />
          <stop offset="70%" stop-color="#EAB308" />
          <stop offset="100%" stop-color="#CA8A04" />
        </radialGradient>
        <linearGradient id="leadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#94A3B8" />
          <stop offset="50%" stop-color="#F8FAFC" />
          <stop offset="100%" stop-color="#64748B" />
        </linearGradient>
      </defs>
      <text x="120" y="32" text-anchor="middle" font-family="${font}" font-size="11" font-weight="800" fill="#64748B" style="letter-spacing: 0.2em">TANTALUM CAPACITOR</text>
      <rect x="94" y="140" width="6" height="58" rx="3" fill="url(#leadGrad)" />
      <rect x="140" y="140" width="6" height="58" rx="3" fill="url(#leadGrad)" />
      <path d="M 120 48 C 170 48, 178 116, 154 144 C 144 154, 96 154, 86 144 C 62 116, 70 48, 120 48 Z" fill="url(#tanBody)" />
      <text x="120" y="114" text-anchor="middle" font-family="${font}" font-size="20" font-weight="800" fill="#713F12">${displayLabel}</text>
      <path d="M 144 68 L 144 82" stroke="#854D0E" stroke-width="2.5" stroke-linecap="round" />
      <path d="M 137 75 L 151 75" stroke="#854D0E" stroke-width="2.5" stroke-linecap="round" />
    `;
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
      <rect width="240" height="240" rx="16" fill="#F8FAFC"/>
      <rect x="6" y="6" width="228" height="228" rx="12" fill="none" stroke="#E2E8F0" stroke-width="1.5" />
      ${capContent}
      <text x="120" y="220" text-anchor="middle" font-family="${font}" font-size="16" font-weight="800" fill="#0F172A">${displayLabel}</text>
    </svg>
  `;
};

export const svgStringToBlob = (svgString: string): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const svg = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    img.onload = () => {
      canvas.width = 800;
      canvas.height = 800;
      if (ctx) {
        ctx.fillStyle = "#F8FAFC";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, 800, 800);
      }
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) resolve(blob);
        else reject(new Error("Blob creation failed"));
      }, "image/png");
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = url;
  });
};
