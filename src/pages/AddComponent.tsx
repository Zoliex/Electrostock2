import { useState, useRef, useEffect } from "react";
import {
  Settings,
  Paperclip,
  Package,
  Hash,
  MapPin,
  Barcode,
  Image as ImageIcon,
  FileText,
  X,
  AlertTriangle,
  UploadCloud,
  FilePlus,
  Plus,
  Edit,
  Loader2,
  Zap,
  Activity,
  Sparkles,
  Search,
  Globe,
  ArrowLeft,
  Save,
  ChevronDown,
  Camera,
  Layers,
  Type,
  Trash2,
  Cpu,
  Battery,
  RefreshCw,
  Download,
  ExternalLink
} from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import BarcodeGenerator from "react-barcode";
import MDEditor from '@uiw/react-md-editor';
import { toast } from "sonner";
import { directus, Box, ComponentPackage, ComponentType, getFileUrl, Component } from "../lib/directus";
import { readItems, uploadFiles, createItem, readItem, updateItem } from "@directus/sdk";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { fetchLcscComponent, normalizeLcscCode, formatLcscMarkdown, LcscComponentInfo, fetchLcscAssetsAsFiles } from "../lib/lcsc";

const COLOR_MAP: Record<number, string> = {
  0: "#000000", // Black
  1: "#8B4513", // Brown
  2: "#FF0000", // Red
  3: "#FF8C00", // Orange
  4: "#FFFF00", // Yellow
  5: "#008000", // Green
  6: "#0000FF", // Blue
  7: "#800080", // Violet
  8: "#808080", // Gray
  9: "#FFFFFF", // White
};

const MULTIPLIER_MAP: Record<number, string> = {
  0: "#000000", // Black (1)
  1: "#8B4513", // Brown (10)
  2: "#FF0000", // Red (100)
  3: "#FF8C00", // Orange (1k)
  4: "#FFFF00", // Yellow (10k)
  5: "#008000", // Green (100k)
  6: "#0000FF", // Blue (1M)
  7: "#800080", // Violet (10M)
  8: "#808080", // Gray (100M)
  9: "#FFFFFF", // White (1G)
  [-1]: "#FFD700", // Gold (0.1)
  [-2]: "#C0C0C0", // Silver (0.01)
};

const TOLERANCE_MAP: Record<string, string> = {
  "1%": "#8B4513",   // Brown
  "2%": "#FF0000",   // Red
  "3%": "#FF8C00",   // Orange
  "4%": "#FFFF00",   // Yellow
  "0.5%": "#008000", // Green
  "0.25%": "#0000FF",// Blue
  "0.1%": "#800080", // Violet
  "0.05%": "#808080",// Gray
  "5%": "#FFD700",   // Gold
  "10%": "#C0C0C0",  // Silver
  "20%": "transparent", // None
};

const TEMPCO_MAP: Record<string, string> = {
  "250ppm": "#000000", // Black
  "100ppm": "#8B4513", // Brown
  "50ppm": "#FF0000",  // Red
  "15ppm": "#FF8C00",  // Orange
  "25ppm": "#FFFF00",  // Yellow
  "20ppm": "#008000",  // Green
  "10ppm": "#0000FF",  // Blue
  "5ppm": "#800080",   // Violet
  "1ppm": "#808080",   // Gray
};

const parseElectronicValue = (val: string) => {
  if (!val) return null;
  const clean = val.replace(/\s/g, '').replace(/Ω/g, 'R').replace(/ohm/gi, 'R');
  const match = clean.match(/^(\d+\.?\d*)([kMGµmnhR]?)(H|R)?$/i);
  if (!match) return null;

  let num = parseFloat(match[1]);
  const multiplier = match[2];

  switch (multiplier) {
    case 'k':
    case 'K': num *= 1000; break;
    case 'M': num *= 1000000; break;
    case 'G': num *= 1000000000; break;
    case 'm': num /= 1000; break;
    case 'µ':
    case 'u':
    case 'U': num /= 1000000; break;
    case 'n':
    case 'N': num /= 1000000000; break;
  }
  return num;
};

const getResistorBands = (value: number, bandCount: number) => {
  if (value <= 0) return [];

  let digits: number[] = [];
  let multiplier = 0;

  const sigDigits = bandCount === 4 ? 2 : 3;

  let exp = Math.floor(Math.log10(value));
  exp -= (sigDigits - 1);

  // Handle gold/silver multipliers
  if (exp < -2) exp = -2;
  if (exp > 9) exp = 9;

  let base = Math.round(value / Math.pow(10, exp));

  if (base >= Math.pow(10, sigDigits)) {
    base /= 10;
    exp += 1;
  }

  const baseStr = base.toString().padStart(sigDigits, '0');
  digits = baseStr.split('').map(Number);
  multiplier = exp;

  return [...digits, multiplier];
};

const getInductorBands = (value: number) => {
  if (value <= 0) return [];

  // value is in µH
  if (value < 1) {
    const val = Math.round(value * 100);
    const d1 = Math.floor(val / 10);
    const d2 = val % 10;
    return [-1, d1, d2]; // Gold at pos 1 (Decimal)
  } else if (value < 10) {
    const d1 = Math.floor(value);
    const d2 = Math.round((value - d1) * 10);
    return [d1, -1, d2]; // Gold at pos 2 (Decimal)
  } else {
    return getResistorBands(value, 4);
  }
};

const ResistorVisual = ({ value, unit, tolerance, tempCo, bandCount, svgRef }: { value: string, unit: string, tolerance: string, tempCo: string, bandCount: number, svgRef: React.RefObject<SVGSVGElement | null> }) => {
  const fullValue = `${value}${unit}`;
  const numValue = parseElectronicValue(fullValue);
  const bands = numValue ? getResistorBands(numValue, bandCount) : [];
  const font = "'Inter', system-ui, sans-serif";
  const toleranceColor = TOLERANCE_MAP[tolerance] || "#FFD700";
  const tempCoColor = TEMPCO_MAP[tempCo] || "#8B4513";

  return (
    <div className="flex flex-col items-center gap-4 p-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-inner aspect-square justify-center">
      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Resistor</span>
      <svg ref={svgRef} width="240" height="240" viewBox="0 0 240 240" className="drop-shadow-md">
        <defs>
          <linearGradient id="resistorGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#E6CCB2" />
            <stop offset="50%" stopColor="#D2B48C" />
            <stop offset="100%" stopColor="#B89B72" />
          </linearGradient>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
            <feOffset dx="0" dy="2" result="offsetblur" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.3" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="white" />
        {/* Leads */}
        <line x1="0" y1="120" x2="240" y2="120" stroke="#A0A0A0" strokeWidth="12" />
        {/* Body */}
        <rect x="20" y="95" width="200" height="50" rx="15" fill="url(#resistorGradient)" filter="url(#shadow)" />
        {/* Bands */}
        {bands.map((digit, i) => {
          const isMultiplier = i === (bandCount === 4 ? 2 : 3);
          const color = isMultiplier ? MULTIPLIER_MAP[digit] : COLOR_MAP[digit];
          const x = 40 + (i * 25);
          return <rect key={i} x={x} y="95" width="10" height="50" fill={color || "#E0E0E0"} />;
        })}
        {/* Tolerance Band */}
        <rect x="170" y="95" width="10" height="50" fill={toleranceColor} />
        {/* TempCo Band */}
        {bandCount === 6 && (
          <rect x="190" y="95" width="10" height="50" fill={tempCoColor} />
        )}
        <text x="120" y="60" textAnchor="middle" fontFamily={font} fontSize="20" fontWeight="900" fill="#94a3b8" style={{ letterSpacing: '0.2em' }}>RESISTOR</text>
        <text x="120" y="200" textAnchor="middle" fontFamily={font} fontSize="44" fontWeight="900" fill="#0f172a">{fullValue || "0Ω"}</text>
        <text x="120" y="225" textAnchor="middle" fontFamily={font} fontSize="14" fontWeight="700" fill="#64748b">±{tolerance} {bandCount === 6 ? `(${tempCo})` : ''}</text>
      </svg>
      <span className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{fullValue} ±{tolerance} {bandCount === 6 ? `(${tempCo})` : ''}</span>
    </div>
  );
};

const InductorVisual = ({ value, unit, tolerance, svgRef }: { value: string, unit: string, tolerance: string, svgRef: React.RefObject<SVGSVGElement | null> }) => {
  const fullValue = `${value}${unit}`;
  const numValue = parseElectronicValue(fullValue);
  // Inductors use µH as base unit for color codes
  const bands = numValue ? getInductorBands(numValue * 1000000) : [];
  const font = "'Inter', system-ui, sans-serif";
  const toleranceColor = TOLERANCE_MAP[tolerance] || "#C0C0C0";

  return (
    <div className="flex flex-col items-center gap-4 p-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-inner aspect-square justify-center">
      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Inductor</span>
      <svg ref={svgRef} width="240" height="240" viewBox="0 0 240 240" className="drop-shadow-md">
        <defs>
          <linearGradient id="inductorGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#B0F2B0" />
            <stop offset="50%" stopColor="#90EE90" />
            <stop offset="100%" stopColor="#70D070" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="white" />
        {/* Leads */}
        <line x1="0" y1="120" x2="240" y2="120" stroke="#A0A0A0" strokeWidth="12" />
        {/* Body - Usually light green for inductors */}
        <rect x="20" y="95" width="200" height="50" rx="25" fill="url(#inductorGradient)" />
        {/* Bands */}
        {bands.map((digit, i) => {
          // If it's a decimal point rule, digit might be -1 (Gold)
          const color = digit === -1 ? "#FFD700" : (i === 2 && bands.length === 3 ? MULTIPLIER_MAP[digit] : COLOR_MAP[digit]);
          const x = 40 + (i * 40);
          return <rect key={i} x={x} y="95" width="15" height="50" fill={color || "#E0E0E0"} />;
        })}
        {/* Tolerance Band */}
        <rect x="175" y="95" width="15" height="50" fill={toleranceColor} />
        <text x="120" y="60" textAnchor="middle" fontFamily={font} fontSize="20" fontWeight="900" fill="#94a3b8" style={{ letterSpacing: '0.2em' }}>INDUCTOR</text>
        <text x="120" y="200" textAnchor="middle" fontFamily={font} fontSize="44" fontWeight="900" fill="#0f172a">{fullValue || "0µH"}</text>
        <text x="120" y="225" textAnchor="middle" fontFamily={font} fontSize="14" fontWeight="700" fill="#64748b">±{tolerance}</text>
      </svg>
      <span className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{fullValue} ±{tolerance}</span>
    </div>
  );
};

const TransistorVisual = ({ value, svgRef }: { value: string, svgRef: React.RefObject<SVGSVGElement | null> }) => {
  const font = "'Inter', system-ui, sans-serif";
  return (
    <div className="flex flex-col items-center gap-4 p-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-inner aspect-square justify-center">
      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Transistor</span>
      <svg ref={svgRef} width="240" height="240" viewBox="0 0 240 240" className="drop-shadow-md">
        <defs>
          <linearGradient id="transBody" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
          <linearGradient id="transTop" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#475569" />
            <stop offset="100%" stopColor="#334155" />
          </linearGradient>
          <linearGradient id="leadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="50%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="white" />
        <text x="120" y="30" textAnchor="middle" fontFamily={font} fontSize="14" fontWeight="900" fill="#94a3b8" style={{ letterSpacing: '0.3em' }}>TRANSISTOR</text>

        {/* Leads */}
        <rect x="86" y="140" width="8" height="80" rx="4" fill="url(#leadGrad)" />
        <rect x="116" y="140" width="8" height="80" rx="4" fill="url(#leadGrad)" />
        <rect x="146" y="140" width="8" height="80" rx="4" fill="url(#leadGrad)" />

        {/* Back curve */}
        <path d="M 60 90 C 60 40, 180 40, 180 90 Z" fill="url(#transTop)" />

        {/* Front face */}
        <rect x="60" y="90" width="120" height="70" rx="8" fill="url(#transBody)" />

        {/* Text */}
        <text x="120" y="130" textAnchor="middle" fontFamily={font} fontSize="22" fontWeight="700" fill="#cbd5e1" letterSpacing="1">{value || "2N3904"}</text>
      </svg>
      <span className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{value || "Transistor"}</span>
    </div>
  );
};

const CapacitorVisual = ({ value, unit, type, svgRef }: { value: string, unit: string, type: string, svgRef: React.RefObject<SVGSVGElement | null> }) => {
  const font = "'Inter', system-ui, sans-serif";

  let capContent = null;
  if (type === 'Electrolytic') {
    capContent = (
      <>
        <defs>
          <linearGradient id="elecBody" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0f172a" />
            <stop offset="20%" stopColor="#1e293b" />
            <stop offset="80%" stopColor="#020617" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
          <linearGradient id="elecTop" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#cbd5e1" />
            <stop offset="100%" stopColor="#64748b" />
          </linearGradient>
          <linearGradient id="elecStripe" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>
          <linearGradient id="leadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="50%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="white" />
        <text x="120" y="30" textAnchor="middle" fontFamily={font} fontSize="14" fontWeight="900" fill="#94a3b8" style={{ letterSpacing: '0.3em' }}>ELECTROLYTIC</text>

        <rect x="96" y="170" width="8" height="50" rx="4" fill="url(#leadGrad)" />
        <rect x="136" y="170" width="8" height="50" rx="4" fill="url(#leadGrad)" />
        <path d="M 60 70 L 60 170 A 60 15 0 0 0 180 170 L 180 70 Z" fill="url(#elecBody)" />
        <path d="M 60 70 L 60 170 A 60 15 0 0 0 85 174 L 85 74 A 60 15 0 0 1 60 70 Z" fill="url(#elecStripe)" />
        <ellipse cx="120" cy="70" rx="60" ry="15" fill="url(#elecTop)" />
        <text x="135" y="130" textAnchor="middle" fontFamily={font} fontSize="24" fontWeight="700" fill="#f8fafc">{value}{unit}</text>
      </>
    );
  } else if (type === 'Ceramic') {
    capContent = (
      <>
        <defs>
          <radialGradient id="cerBody" cx="40%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#d97706" />
          </radialGradient>
          <linearGradient id="leadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="50%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
        </defs>
        <rect x="86" y="140" width="8" height="80" rx="4" fill="url(#leadGrad)" />
        <rect x="146" y="140" width="8" height="80" rx="4" fill="url(#leadGrad)" />
        <path d="M 80 130 Q 90 160 94 140 Q 120 150 146 140 Q 150 160 160 130 Z" fill="url(#cerBody)" />
        <circle cx="120" cy="100" r="60" fill="url(#cerBody)" />
        <text x="120" y="108" textAnchor="middle" fontFamily={font} fontSize="22" fontWeight="700" fill="#78350f">{value}{unit}</text>
      </>
    );
  } else {
    capContent = (
      <>
        <defs>
          <radialGradient id="tanBody" cx="30%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#fde047" />
            <stop offset="70%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#ca8a04" />
          </radialGradient>
          <linearGradient id="leadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="50%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
        </defs>
        <rect x="86" y="140" width="8" height="80" rx="4" fill="url(#leadGrad)" />
        <rect x="146" y="140" width="8" height="80" rx="4" fill="url(#leadGrad)" />
        <path d="M 120 40 C 180 40, 190 120, 160 150 C 150 160, 90 160, 80 150 C 50 120, 60 40, 120 40 Z" fill="url(#tanBody)" />
        <text x="120" y="115" textAnchor="middle" fontFamily={font} fontSize="22" fontWeight="700" fill="#713f12">{value}{unit}</text>
        <path d="M 150 60 L 150 80" stroke="#a16207" strokeWidth="3" strokeLinecap="round" />
        <path d="M 140 70 L 160 70" stroke="#a16207" strokeWidth="3" strokeLinecap="round" />
      </>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 p-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-inner aspect-square justify-center">
      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Capacitor</span>
      <svg ref={svgRef} width="240" height="240" viewBox="0 0 240 240" className="drop-shadow-md">
        <rect width="100%" height="100%" fill="white" />
        <text x="120" y="30" textAnchor="middle" fontFamily={font} fontSize="14" fontWeight="900" fill="#94a3b8" style={{ letterSpacing: '0.3em' }}>CAPACITOR</text>
        {capContent}
      </svg>
      <span className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{value}{unit}</span>
    </div>
  );
};

export function AddComponent() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const cloneId = searchParams.get("clone");
  const isEditMode = !!id;
  const isCloneMode = !!cloneId;

  const [barcodes, setBarcodes] = useState<string[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [aiProposal, setAiProposal] = useState<{ category?: string, subcategory?: string, package?: string } | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [isAiFilling, setIsAiFilling] = useState(false);
  const [settings, setSettings] = useState({ enableAiSuggestions: true });
  const [isSearchingImages, setIsSearchingImages] = useState(false);

  // Resistor / Inductor / Transistor / Capacitor Virtual Fields
  const [isResistor, setIsResistor] = useState(false);
  const [isInductor, setIsInductor] = useState(false);
  const [isTransistor, setIsTransistor] = useState(false);
  const [isCapacitor, setIsCapacitor] = useState(false);
  const [capacitorType, setCapacitorType] = useState<'Electrolytic' | 'Tantalum' | 'Ceramic'>('Ceramic');
  const [bandCount, setBandCount] = useState(4);
  const [resistorValue, setResistorValue] = useState("");
  const [inductanceValue, setInductanceValue] = useState("");
  const [transistorValue, setTransistorValue] = useState("");
  const [capacitorValue, setCapacitorValue] = useState("");
  const [tolerance, setTolerance] = useState("5%");
  const [tempCo, setTempCo] = useState("100ppm");
  const [resistorUnit, setResistorUnit] = useState("Ω");
  const [inductorUnit, setInductorUnit] = useState("µH");
  const [transistorUnit, setTransistorUnit] = useState("");
  const [capacitorUnit, setCapacitorUnit] = useState("µF");
  const [isBatchMode, setIsBatchMode] = useState(false);
  const generateRandomBarcode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const [batchItems, setBatchItems] = useState<{ value: string; quantity: number; unit: string; barcode?: string }[]>([{ value: "", quantity: 1, unit: "" }]);
  const resistorSvgRef = useRef<SVGSVGElement>(null);
  const inductorSvgRef = useRef<SVGSVGElement>(null);
  const transistorSvgRef = useRef<SVGSVGElement>(null);
  const capacitorSvgRef = useRef<SVGSVGElement>(null);

  const svgToBlob = (svgElement: SVGSVGElement): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      try {
        const svgData = new XMLSerializer().serializeToString(svgElement);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const img = new Image();
        img.onload = () => {
          canvas.width = 800;
          canvas.height = 800;
          if (ctx) {
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            // Scale 240x240 SVG to 800x800
            ctx.drawImage(img, 0, 0, 800, 800);
          }
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Failed to create blob"));
          }, "image/png");
        };
        img.onerror = () => reject(new Error("Failed to load SVG into image"));
        img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
      } catch (e) {
        reject(e);
      }
    });
  };

  const [searchResults, setSearchResults] = useState<{ url: string; title: string }[]>([]);
  const [showImageSearchModal, setShowImageSearchModal] = useState<{ type: 'main' | 'additional' | 'datasheet', query: string } | null>(null);

  // Global Barcode Listener for this page
  useEffect(() => {
    let buffer = "";
    let lastKeyTime = Date.now();

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const currentTime = Date.now();
      const char = e.key;

      if (currentTime - lastKeyTime > 100) {
        buffer = "";
      }
      lastKeyTime = currentTime;

      if (char === "Enter") {
        if (buffer.length > 2) {
          const activeTag = document.activeElement?.tagName;
          // Only add to list if NOT already typing in an input (the input handles itself)
          if (activeTag !== "INPUT" && activeTag !== "TEXTAREA") {
            const newBarcode = buffer.trim();
            if (newBarcode && !barcodes.includes(newBarcode)) {
              setBarcodes(prev => [...prev, newBarcode]);
              toast.success(`Barcode added: ${newBarcode}`);
            }
          }
        }
        buffer = "";
      } else if (char.length === 1) {
        buffer += char;
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [barcodes]);

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (barcodeInput.trim()) {
        const newBarcode = barcodeInput.trim();
        if (!barcodes.includes(newBarcode)) {
          setBarcodes([...barcodes, newBarcode]);
        }
        setBarcodeInput("");
      }
    }
  };

  const removeBarcode = (codeToRemove: string) => {
    setBarcodes(barcodes.filter(b => b !== codeToRemove));
  };

  // Options State
  const [categories, setCategories] = useState<ComponentType[]>([]);
  const [packages, setPackages] = useState<ComponentPackage[]>([]);
  const [locations, setLocations] = useState<Box[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    subcategory: "",
    pkg: "",
    description: "",
    quantity: 0,
    storageLocation: "",
    packetReference: "",
    referenceUrl: "",
  });

  // Existing Files State (for Edit Mode)
  const [existingMainImage, setExistingMainImage] = useState<string | null>(null);
  const [existingDatasheet, setExistingDatasheet] = useState<string | null>(null);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [fetchedCategories, fetchedPackages, fetchedLocations] = await Promise.all([
          directus.request(readItems('components_types')),
          directus.request(readItems('components_packages')),
          directus.request(readItems('boxes'))
        ]);

        setCategories(fetchedCategories);
        setPackages(fetchedPackages);
        setLocations(fetchedLocations);

        if (!isEditMode && !isCloneMode) {
          // Set default values only in add mode
          setFormData(prev => ({
            ...prev,
            category: fetchedCategories.length > 0 ? fetchedCategories[0].id.toString() : "",
            pkg: fetchedPackages.length > 0 ? fetchedPackages[0].id.toString() : "",
            storageLocation: fetchedLocations.length > 0 ? fetchedLocations[0].id.toString() : "",
          }));
        }
      } catch (error) {
        console.error("Error fetching options from Directus:", error);
      } finally {
        setIsLoadingOptions(false);
      }
    };

    fetchOptions();
  }, [isEditMode, isCloneMode]);

  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.enableAiSuggestions === 'boolean') {
          setSettings(data);
        }
      })
      .catch(err => console.error("Failed to load settings", err));
  }, []);

  useEffect(() => {
    const fetchId = id || cloneId;
    if (!fetchId) return;

    const fetchComponent = async () => {
      try {
        const component = await directus.request(readItem('components', Number(fetchId), {
          fields: ['*', 'type.*', 'package.*', 'location.*'] as any
        })) as unknown as Component;

        setFormData({
          name: isCloneMode ? `${component.name} (Copy)` : component.name,
          category: typeof component.type === 'object' ? component.type?.id?.toString() || "" : String(component.type || ""),
          subcategory: typeof component.type === 'object' ? component.type?.subcategory || "" : "",
          pkg: typeof component.package === 'object' ? component.package?.id?.toString() || "" : String(component.package || ""),
          description: component.description || "",
          quantity: isCloneMode ? 0 : (component.quantity_available || 0),
          storageLocation: typeof component.location === 'object' ? component.location?.id?.toString() || "" : String(component.location || ""),
          packetReference: component.packet_reference || "",
          referenceUrl: component.url || "",
        });

        setTags(component.keywords || []);
        // Don't copy barcode for clones
        if (!isCloneMode && component.barcode) {
          setBarcodes(component.barcode.split(';').filter(b => b.trim() !== ""));
        } else {
          setBarcodes([]);
        }

        // For clones, we can reuse existing images if we want, OR we can force re-upload.
        // Reusing existing images is better UX.
        setExistingMainImage(component.main_image as string);
        setExistingDatasheet(component.datasheet as string);

      } catch (error) {
        console.error("Error fetching component:", error);
        toast.error("Failed to load component details");
        navigate("/inventory");
      }
    };

    fetchComponent();
  }, [id, cloneId, navigate, isCloneMode]);

  // Tags State
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  // File Upload States
  const [mainImage, setMainImage] = useState<File | null>(null);
  const [datasheet, setDatasheet] = useState<File | null>(null);
  const [additionalImages, setAdditionalImages] = useState<File[]>([]);
  const [additionalFiles, setAdditionalFiles] = useState<File[]>([]);

  // File Input Refs
  const mainImageRef = useRef<HTMLInputElement>(null);
  const datasheetRef = useRef<HTMLInputElement>(null);
  const additionalImagesRef = useRef<HTMLInputElement>(null);
  const additionalFilesRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const newTag = tagInput.trim().toUpperCase();
      if (newTag && !tags.includes(newTag)) {
        setTags([...tags, newTag]);
      }
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleSingleFile = (e: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<File | null>>) => {
    if (e.target.files && e.target.files.length > 0) {
      setter(e.target.files[0]);
    }
  };

  const handleMultipleFiles = (e: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<File[]>>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setter(prev => [...prev, ...newFiles]);
    }
    // Reset input so the same file can be selected again if removed
    e.target.value = '';
  };

  const removeMultipleFile = (index: number, setter: React.Dispatch<React.SetStateAction<File[]>>) => {
    setter(prev => prev.filter((_, i) => i !== index));
  };

  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

  // Modal States
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [showLcscModal, setShowLcscModal] = useState(false);
  const [lcscSearchCode, setLcscSearchCode] = useState("");
  const [isLcscLoading, setIsLcscLoading] = useState(false);
  const [lastLcscData, setLastLcscData] = useState<LcscComponentInfo | null>(null);
  const [editingCategory, setEditingCategory] = useState<ComponentType | null>(null);
  const [editingPackage, setEditingPackage] = useState<ComponentPackage | null>(null);

  // Modal Form States
  const [modalName, setModalName] = useState("");
  const [modalSubcategory, setModalSubcategory] = useState("");
  const [isModalSaving, setIsModalSaving] = useState(false);

  const openCategoryModal = (category?: ComponentType) => {
    if (category) {
      setEditingCategory(category);
      setModalName(category.name);
      setModalSubcategory(category.subcategory || "");
    } else {
      setEditingCategory(null);
      setModalName("");
      setModalSubcategory("");
    }
    setShowCategoryModal(true);
  };

  const openPackageModal = (pkg?: ComponentPackage) => {
    if (pkg) {
      setEditingPackage(pkg);
      setModalName(pkg.name);
    } else {
      setEditingPackage(null);
      setModalName("");
    }
    setShowPackageModal(true);
  };

  const handleSaveCategory = async () => {
    if (!modalName.trim()) return;

    // Check for duplicates
    if (!editingCategory) {
      const exists = categories.some(c => c.name.toLowerCase() === modalName.trim().toLowerCase());
      if (exists) {
        toast.error("A category with this name already exists");
        return;
      }
    }

    setIsModalSaving(true);
    try {
      if (editingCategory) {
        await directus.request(updateItem('components_types', editingCategory.id, {
          name: modalName,
          subcategory: modalSubcategory
        }));
        setCategories(prev => prev.map(c => c.id === editingCategory.id ? { ...c, name: modalName, subcategory: modalSubcategory } : c));
        toast.success("Category updated");
      } else {
        const newCat = await directus.request(createItem('components_types', {
          name: modalName,
          subcategory: modalSubcategory
        }));
        setCategories(prev => [...prev, newCat as ComponentType]);
        setFormData(prev => ({ ...prev, category: String(newCat.id) }));
        toast.success("Category created");
      }
      setShowCategoryModal(false);
    } catch (e) {
      console.error(e);
      toast.error("Failed to save category");
    } finally {
      setIsModalSaving(false);
    }
  };

  const handleSavePackage = async () => {
    if (!modalName.trim()) return;
    setIsModalSaving(true);
    try {
      if (editingPackage) {
        await directus.request(updateItem('components_packages', editingPackage.id, {
          name: modalName
        }));
        setPackages(prev => prev.map(p => p.id === editingPackage.id ? { ...p, name: modalName } : p));
        toast.success("Package updated");
      } else {
        const newPkg = await directus.request(createItem('components_packages', {
          name: modalName
        }));
        setPackages(prev => [...prev, newPkg as ComponentPackage]);
        setFormData(prev => ({ ...prev, pkg: String(newPkg.id) }));
        toast.success("Package created");
      }
      setShowPackageModal(false);
    } catch (e) {
      console.error(e);
      toast.error("Failed to save package");
    } finally {
      setIsModalSaving(false);
    }
  };

  const handleAiFill = async () => {
    if (!settings.enableAiSuggestions) return;
    if (!formData.name.trim()) {
      toast.error("Please enter a component name first");
      return;
    }

    setIsAiFilling(true);
    const toastId = toast.loading("AI is researching the component...");

    try {
      // 1. Search for component details using SerpApi
      const searchResponse = await fetch(`/api/search-images?q=${encodeURIComponent(formData.name)}`);
      if (!searchResponse.ok) throw new Error("Failed to search component");
      const searchResults = await searchResponse.json();

      const context = searchResults.slice(0, 5).map((r: any) => r.title).join("\n");

      // 2. Use our backend to fill fields
      const categoriesInfo = categories.map(c => `${c.name} (Subcategories: ${c.subcategory || 'none'})`).join("; ");
      const packagesInfo = packages.map(p => p.name).join(", ");

      const aiResponse = await fetch("/api/ai-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          context,
          categoriesInfo,
          packagesInfo
        })
      });

      if (!aiResponse.ok) throw new Error("Failed to get AI research");
      const data = await aiResponse.json();

      // Try to match category and package from existing options
      const matchedCategory = categories.find(c =>
        c.name.toLowerCase().includes(data.category.toLowerCase()) ||
        data.category.toLowerCase().includes(c.name.toLowerCase())
      );

      const matchedPackage = packages.find(p =>
        p.name.toLowerCase().includes(data.package.toLowerCase()) ||
        data.package.toLowerCase().includes(p.name.toLowerCase())
      );

      let proposedCategory: string | undefined;
      let proposedSubcategory: string | undefined;
      let proposedPackage: string | undefined;

      if (!matchedCategory && data.category) {
        proposedCategory = data.category;
      }

      if (data.subcategory) {
        if (matchedCategory && matchedCategory.subcategory) {
          const existingSubcategories = matchedCategory.subcategory.split(',').map(s => s.trim());
          const matchedSubcat = existingSubcategories.find(s =>
            s.toLowerCase() === data.subcategory.toLowerCase() ||
            s.toLowerCase().includes(data.subcategory.toLowerCase()) ||
            data.subcategory.toLowerCase().includes(s.toLowerCase())
          );

          if (matchedSubcat) {
            data.subcategory = matchedSubcat;
          } else {
            proposedSubcategory = data.subcategory;
          }
        } else {
          proposedSubcategory = data.subcategory;
        }
      }

      if (!matchedPackage && data.package) {
        proposedPackage = data.package;
      }

      setFormData(prev => ({
        ...prev,
        description: data.description || prev.description,
        category: matchedCategory ? matchedCategory.id.toString() : prev.category,
        subcategory: !proposedSubcategory ? data.subcategory : prev.subcategory,
        pkg: matchedPackage ? matchedPackage.id.toString() : prev.pkg,
        packetReference: data.packet_reference || prev.packetReference
      }));

      if (data.keywords && Array.isArray(data.keywords)) {
        setTags(prev => Array.from(new Set([...prev, ...data.keywords])));
      }

      if (proposedCategory || proposedSubcategory || proposedPackage) {
        setAiProposal({ category: proposedCategory, subcategory: proposedSubcategory, package: proposedPackage });
        toast.success("AI has filled the fields, but suggested some new categories/packages.", { id: toastId, duration: 5000 });
      } else {
        toast.success(
          <div className="flex flex-col gap-2">
            <p>AI has filled the fields!</p>
            <button
              onClick={() => setShowImageSearchModal({ type: 'main', query: formData.name })}
              className="text-[10px] font-bold uppercase tracking-wider bg-primary text-white px-2 py-1 rounded hover:bg-primary/90 transition-colors w-fit"
            >
              Search for images now
            </button>
          </div>,
          { id: toastId, duration: 5000 }
        );
      }
    } catch (error) {
      console.error("AI Fill Error:", error);
      toast.error("AI failed to research the component", { id: toastId });
    } finally {
      setIsAiFilling(false);
    }
  };

  const handleLcscImport = async (codeToFetch?: string) => {
    const rawInput = (codeToFetch || lcscSearchCode || formData.name).trim();
    const code = normalizeLcscCode(rawInput);
    if (!code) {
      toast.error("Please enter a valid LCSC part code (e.g. C2040)");
      return;
    }

    setIsLcscLoading(true);
    const toastId = toast.loading(`Fetching full details for ${code} from LCSC...`);

    try {
      const data = await fetchLcscComponent(code);
      if (!data) {
        toast.error(`Component ${code} was not found on LCSC.`, { id: toastId });
        return;
      }

      setLastLcscData(data);

      // Match category
      const matchedCategory = categories.find(c =>
        c.name.toLowerCase().includes(data.category.toLowerCase()) ||
        data.category.toLowerCase().includes(c.name.toLowerCase()) ||
        (data.subcategory && c.subcategory && c.subcategory.toLowerCase().includes(data.subcategory.toLowerCase()))
      );

      // Match package
      const matchedPackage = packages.find(p =>
        p.name.toLowerCase().includes(data.package.toLowerCase()) ||
        data.package.toLowerCase().includes(p.name.toLowerCase())
      );

      setFormData(prev => ({
        ...prev,
        name: data.name || prev.name,
        description: formatLcscMarkdown(data),
        category: matchedCategory ? matchedCategory.id.toString() : prev.category,
        pkg: matchedPackage ? matchedPackage.id.toString() : prev.pkg,
        packetReference: data.manufacturerPartNumber || data.lcscPartNumber,
        referenceUrl: data.productUrl || prev.referenceUrl,
      }));

      // Add barcode if not already present
      if (data.lcscPartNumber) {
        setBarcodes(prev => prev.includes(data.lcscPartNumber) ? prev : [...prev, data.lcscPartNumber]);
      }

      // Add keywords
      const newKeywords = [
        data.lcscPartNumber.toLowerCase(),
        data.name.toLowerCase(),
        data.manufacturer.toLowerCase(),
        "lcsc"
      ];
      setTags(prev => Array.from(new Set([...prev, ...newKeywords])));

      // Automatically download and fill all 4 Assets & Documentation parts:
      // 1. Main Image
      // 2. Datasheet (PDF)
      // 3. Additional Images
      // 4. Additional Files (specs & pinout, footprint)
      try {
        toast.loading(`Downloading photos, datasheet and documentation...`, { id: toastId });
        const assets = await fetchLcscAssetsAsFiles(data);
        if (assets.mainImage) {
          setMainImage(assets.mainImage);
        }
        if (assets.datasheet) {
          setDatasheet(assets.datasheet);
        }
        if (assets.additionalImages.length > 0) {
          setAdditionalImages(assets.additionalImages);
        }
        if (assets.additionalFiles.length > 0) {
          setAdditionalFiles(assets.additionalFiles);
        }
      } catch (assetErr) {
        console.warn("Asset auto-download warning:", assetErr);
      }

      setShowLcscModal(false);
      toast.success(
        <div className="flex flex-col gap-1">
          <p className="font-bold">LCSC Import Successful!</p>
          <p className="text-xs text-slate-500">{data.name} ({data.manufacturer})</p>
          <p className="text-xs text-emerald-600">Stock: {data.stock.toLocaleString()} | Footprint: {data.package}</p>
          <p className="text-[11px] text-primary">All assets (images, datasheet, specs) auto-filled!</p>
        </div>,
        { id: toastId, duration: 4000 }
      );
    } catch (err: any) {
      console.error("LCSC Import failed:", err);
      toast.error(err.message || "Failed to import component from LCSC", { id: toastId });
    } finally {
      setIsLcscLoading(false);
    }
  };

  const handleAutoFillAssets = async () => {
    const rawCode = normalizeLcscCode(formData.name) || 
                    normalizeLcscCode(formData.packetReference) || 
                    (barcodes.length > 0 ? normalizeLcscCode(barcodes[0]) : "");

    if (rawCode) {
      setIsLcscLoading(true);
      const toastId = toast.loading(`Auto-filling all assets for ${rawCode}...`);
      try {
        const data = await fetchLcscComponent(rawCode, { includeSvg: true });
        if (data) {
          const assets = await fetchLcscAssetsAsFiles(data);
          let filledCount = 0;
          if (assets.mainImage) { setMainImage(assets.mainImage); filledCount++; }
          if (assets.datasheet) { setDatasheet(assets.datasheet); filledCount++; }
          if (assets.additionalImages.length > 0) { setAdditionalImages(assets.additionalImages); filledCount += assets.additionalImages.length; }
          if (assets.additionalFiles.length > 0) { setAdditionalFiles(assets.additionalFiles); filledCount += assets.additionalFiles.length; }
          toast.success(`Successfully auto-filled ${filledCount} asset file(s) for ${data.name}!`, { id: toastId });
          return;
        }
      } catch (e: any) {
        console.warn("LCSC asset fill failed, trying web image fallback...", e);
      } finally {
        setIsLcscLoading(false);
      }
    }

    // Fallback: search web images and datasheet if no LCSC code found
    if (formData.name.trim()) {
      const toastId = toast.loading(`Auto-searching web images for "${formData.name}"...`);
      try {
        const res = await fetch(`/api/search-images?q=${encodeURIComponent(formData.name)}`);
        if (res.ok) {
          const results = await res.json();
          if (results && results.length > 0) {
            const imgRes = await fetch(`/api/proxy-download?url=${encodeURIComponent(results[0].url)}`);
            if (imgRes.ok) {
              const blob = await imgRes.blob();
              setMainImage(new File([blob], `${formData.name.replace(/\s+/g, '_')}_main.jpg`, { type: blob.type }));
              toast.success("Main image auto-filled from web!", { id: toastId });
              return;
            }
          }
        }
        toast.info("No automatic assets found. Enter an LCSC part number (e.g. C2040) for complete automatic documentation.", { id: toastId });
      } catch (e: any) {
        toast.error("Failed to auto-fill assets", { id: toastId });
      }
    } else {
      toast.error("Please enter a component name or LCSC code first.");
    }
  };

  const handleSearchImages = async (query: string) => {
    if (!query.trim()) return;

    setIsSearchingImages(true);
    setSearchResults([]);
    try {
      const response = await fetch(`/api/search-images?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch images");
      }

      const results = await response.json();
      if (results && results.length > 0) {
        setSearchResults(results);
      } else {
        toast.info("No images found for this search");
      }
    } catch (error: any) {
      console.error("Image Search Error:", error);
      toast.error(error.message || "Failed to search for images");
    } finally {
      setIsSearchingImages(false);
    }
  };

  const selectWebImage = async (url: string) => {
    if (!showImageSearchModal) return;

    const toastId = toast.loading("Downloading image...");
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], "web-image.jpg", { type: blob.type });

      if (showImageSearchModal.type === 'main') {
        setMainImage(file);
      } else if (showImageSearchModal.type === 'datasheet') {
        setDatasheet(file);
      } else {
        setAdditionalImages(prev => [...prev, file]);
      }

      setShowImageSearchModal(null);
      toast.success("Image added!", { id: toastId });
    } catch (error) {
      console.error("Image Download Error:", error);
      toast.error("Failed to download image. It might be protected.", { id: toastId });
    }
  };

  const getResistorSvgString = (value: string, unit: string, tolerance: string, tempCo: string, bandsCount: number) => {
    const fullValue = `${value}${unit}`;
    const numValue = parseElectronicValue(fullValue);
    const bands = numValue ? getResistorBands(numValue, bandsCount) : [];
    const font = "'Inter', system-ui, sans-serif";
    const toleranceColor = TOLERANCE_MAP[tolerance] || "#FFD700";
    const tempCoColor = TEMPCO_MAP[tempCo] || "#8B4513";

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
        <defs>
          <linearGradient id="resistorGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#E6CCB2" />
            <stop offset="50%" stop-color="#D2B48C" />
            <stop offset="100%" stop-color="#B89B72" />
          </linearGradient>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
            <feOffset dx="0" dy="2" result="offsetblur" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.3" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="white" />
        <!-- Leads -->
        <line x1="0" y1="120" x2="240" y2="120" stroke="#A0A0A0" stroke-width="12" />
        <!-- Body -->
        <rect x="20" y="95" width="200" height="50" rx="15" fill="url(#resistorGradient)" filter="url(#shadow)" />
        <!-- Bands -->
        ${bands.map((digit, i) => {
      const isMultiplier = i === (bandsCount === 4 ? 2 : 3);
      const color = isMultiplier ? MULTIPLIER_MAP[digit] : COLOR_MAP[digit];
      const x = 40 + (i * 25);
      return `<rect x="${x}" y="95" width="10" height="50" fill="${color || "#E0E0E0"}" />`;
    }).join('')}
        <!-- Tolerance Band -->
        <rect x="170" y="95" width="10" height="50" fill="${toleranceColor}" />
        <!-- TempCo Band -->
        ${bandsCount === 6 ? `
          <rect x="190" y="95" width="10" height="50" fill="${tempCoColor}" />
        ` : ''}
        <text x="120" y="60" text-anchor="middle" font-family="${font}" font-size="20" font-weight="900" fill="#94a3b8" style="letter-spacing: 0.2em">RESISTOR</text>
        <text x="120" y="200" text-anchor="middle" font-family="${font}" font-size="44" font-weight="900" fill="#0f172a">${fullValue || "0Ω"}</text>
        <text x="120" y="225" text-anchor="middle" font-family="${font}" font-size="14" font-weight="700" fill="#64748b">±${tolerance} ${bandsCount === 6 ? `(${tempCo})` : ''}</text>
      </svg>
    `;
  };

  const getInductorSvgString = (value: string, unit: string, tolerance: string) => {
    const fullValue = `${value}${unit}`;
    const numValue = parseElectronicValue(fullValue);
    // Inductors use µH as base unit for color codes
    const bands = numValue ? getInductorBands(numValue * 1000000) : [];
    const font = "'Inter', system-ui, sans-serif";
    const toleranceColor = TOLERANCE_MAP[tolerance] || "#C0C0C0";

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
        <defs>
          <linearGradient id="inductorGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#B0F2B0" />
            <stop offset="50%" stop-color="#90EE90" />
            <stop offset="100%" stop-color="#70D070" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="white" />
        <!-- Leads -->
        <line x1="0" y1="120" x2="240" y2="120" stroke="#A0A0A0" stroke-width="12" />
        <!-- Body -->
        <rect x="20" y="95" width="200" height="50" rx="25" fill="url(#inductorGradient)" />
        <!-- Bands -->
        ${bands.map((digit, i) => {
      const color = digit === -1 ? "#FFD700" : (i === 2 && bands.length === 3 ? MULTIPLIER_MAP[digit] : COLOR_MAP[digit]);
      const x = 40 + (i * 40);
      return `<rect x="${x}" y="95" width="15" height="50" fill="${color || "#E0E0E0"}" />`;
    }).join('')}
        <!-- Tolerance Band -->
        <rect x="175" y="95" width="15" height="50" fill="${toleranceColor}" />
        <text x="120" y="60" text-anchor="middle" font-family="${font}" font-size="20" font-weight="900" fill="#94a3b8" style="letter-spacing: 0.2em">INDUCTOR</text>
        <text x="120" y="200" text-anchor="middle" font-family="${font}" font-size="44" font-weight="900" fill="#0f172a">${fullValue || "0µH"}</text>
        <text x="120" y="225" text-anchor="middle" font-family="${font}" font-size="14" font-weight="700" fill="#64748b">±${tolerance}</text>
      </svg>
    `;
  };

  const getTransistorSvgString = (value: string) => {
    const font = "'Inter', system-ui, sans-serif";
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
        <defs>
          <linearGradient id="transBody" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#334155" />
            <stop offset="100%" stop-color="#0f172a" />
          </linearGradient>
          <linearGradient id="transTop" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#475569" />
            <stop offset="100%" stop-color="#334155" />
          </linearGradient>
          <linearGradient id="leadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#94a3b8" />
            <stop offset="50%" stop-color="#f8fafc" />
            <stop offset="100%" stop-color="#94a3b8" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="white"/>
        <text x="120" y="30" text-anchor="middle" font-family="${font}" font-size="14" font-weight="900" fill="#94a3b8" style="letter-spacing: 0.3em">TRANSISTOR</text>
        
        <!-- Leads -->
        <rect x="86" y="140" width="8" height="80" rx="4" fill="url(#leadGrad)" />
        <rect x="116" y="140" width="8" height="80" rx="4" fill="url(#leadGrad)" />
        <rect x="146" y="140" width="8" height="80" rx="4" fill="url(#leadGrad)" />
        
        <!-- Back curve -->
        <path d="M 60 90 C 60 40, 180 40, 180 90 Z" fill="url(#transTop)" />
        
        <!-- Front face -->
        <rect x="60" y="90" width="120" height="70" rx="8" fill="url(#transBody)" />
        
        <!-- Text -->
        <text x="120" y="130" text-anchor="middle" font-family="${font}" font-size="22" font-weight="700" fill="#cbd5e1" letter-spacing="1">${value || "2N3904"}</text>
      </svg>
    `;
  };

  const getCapacitorSvgString = (value: string, unit: string, type: string) => {
    const font = "'Inter', system-ui, sans-serif";
    let capContent = '';

    if (type === 'Electrolytic') {
      capContent = `
        <defs>
          <linearGradient id="elecBody" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#0f172a" />
            <stop offset="20%" stop-color="#1e293b" />
            <stop offset="80%" stop-color="#020617" />
            <stop offset="100%" stop-color="#0f172a" />
          </linearGradient>
          <linearGradient id="elecTop" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#cbd5e1" />
            <stop offset="100%" stop-color="#64748b" />
          </linearGradient>
          <linearGradient id="elecStripe" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#f8fafc" />
            <stop offset="100%" stop-color="#cbd5e1" />
          </linearGradient>
          <linearGradient id="leadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#94a3b8" />
            <stop offset="50%" stop-color="#f8fafc" />
            <stop offset="100%" stop-color="#94a3b8" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="white"/>
        <text x="120" y="30" text-anchor="middle" font-family="${font}" font-size="14" font-weight="900" fill="#94a3b8" style="letter-spacing: 0.3em">ELECTROLYTIC</text>

        <rect x="96" y="170" width="8" height="50" rx="4" fill="url(#leadGrad)" />
        <rect x="136" y="170" width="8" height="50" rx="4" fill="url(#leadGrad)" />
        <path d="M 60 70 L 60 170 A 60 15 0 0 0 180 170 L 180 70 Z" fill="url(#elecBody)" />
        <path d="M 60 70 L 60 170 A 60 15 0 0 0 85 174 L 85 74 A 60 15 0 0 1 60 70 Z" fill="url(#elecStripe)" />
        <ellipse cx="120" cy="70" rx="60" ry="15" fill="url(#elecTop)" />
        <text x="135" y="130" text-anchor="middle" font-family="${font}" font-size="24" font-weight="700" fill="#f8fafc">${value}${unit}</text>
      `;
    } else if (type === 'Ceramic') {
      capContent = `
        <defs>
          <radialGradient id="cerBody" cx="40%" cy="40%" r="60%">
            <stop offset="0%" stop-color="#fbbf24" />
            <stop offset="100%" stop-color="#d97706" />
          </radialGradient>
          <linearGradient id="leadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#94a3b8" />
            <stop offset="50%" stop-color="#f8fafc" />
            <stop offset="100%" stop-color="#94a3b8" />
          </linearGradient>
        </defs>
        <rect x="86" y="140" width="8" height="80" rx="4" fill="url(#leadGrad)" />
        <rect x="146" y="140" width="8" height="80" rx="4" fill="url(#leadGrad)" />
        <path d="M 80 130 Q 90 160 94 140 Q 120 150 146 140 Q 150 160 160 130 Z" fill="url(#cerBody)" />
        <circle cx="120" cy="100" r="60" fill="url(#cerBody)" />
        <text x="120" y="108" text-anchor="middle" font-family="${font}" font-size="22" font-weight="700" fill="#78350f">${value}${unit}</text>
      `;
    } else {
      capContent = `
        <defs>
          <radialGradient id="tanBody" cx="30%" cy="30%" r="70%">
            <stop offset="0%" stop-color="#fde047" />
            <stop offset="70%" stop-color="#eab308" />
            <stop offset="100%" stop-color="#ca8a04" />
          </radialGradient>
          <linearGradient id="leadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#94a3b8" />
            <stop offset="50%" stop-color="#f8fafc" />
            <stop offset="100%" stop-color="#94a3b8" />
          </linearGradient>
        </defs>
        <rect x="86" y="140" width="8" height="80" rx="4" fill="url(#leadGrad)" />
        <rect x="146" y="140" width="8" height="80" rx="4" fill="url(#leadGrad)" />
        <path d="M 120 40 C 180 40, 190 120, 160 150 C 150 160, 90 160, 80 150 C 50 120, 60 40, 120 40 Z" fill="url(#tanBody)" />
        <text x="120" y="115" text-anchor="middle" font-family="${font}" font-size="22" font-weight="700" fill="#713f12">${value}${unit}</text>
        <path d="M 150 60 L 150 80" stroke="#a16207" stroke-width="3" stroke-linecap="round" />
        <path d="M 140 70 L 160 70" stroke="#a16207" stroke-width="3" stroke-linecap="round" />
      `;
    }

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
        <rect width="100%" height="100%" fill="white"/>
        <text x="120" y="30" text-anchor="middle" font-family="${font}" font-size="14" font-weight="900" fill="#94a3b8" style="letter-spacing: 0.3em">CAPACITOR</text>
        ${capContent}
      </svg>
    `;
  };

  const svgStringToBlob = (svgString: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const svg = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svg);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      img.onload = () => {
        canvas.width = 800;
        canvas.height = 800;
        if (ctx) {
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          // Scale 240x240 SVG to 800x800
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

  const isProcedural = isResistor || isInductor || isTransistor || isCapacitor;

  const handleSave = async () => {
    // Validation
    if (!formData.name || !formData.category || !formData.description || tags.length === 0 || !formData.storageLocation) {
      toast.error("Please fill in all required fields (Name, Category, Description, Keywords, Storage Location).");
      return;
    }

    if (!isProcedural && !mainImage && !existingMainImage) {
      toast.error("Please upload a main image.");
      return;
    }

    setIsSaving(true);
    const toastId = toast.loading(isEditMode ? "Updating component..." : "Saving component...");
    try {
      const itemsToSave = isBatchMode
        ? batchItems.filter(i => i.value.trim())
        : [{
          value: isResistor ? resistorValue : (isInductor ? inductanceValue : (isTransistor ? transistorValue : (isCapacitor ? capacitorValue : ""))),
          quantity: Number(formData.quantity),
          unit: isResistor ? resistorUnit : (isInductor ? inductorUnit : (isTransistor ? "" : (isCapacitor ? capacitorUnit : ""))),
          type: isCapacitor ? capacitorType : undefined
        }];

      if (itemsToSave.length === 0) {
        throw new Error("No items to save. Please add at least one value.");
      }

      const total = itemsToSave.length;
      let current = 0;
      setUploadProgress({ current: 0, total });

      let uploadedMainImageId = existingMainImage;
      let uploadedDatasheetId = existingDatasheet;

      // Upload files once if not procedural
      if (!isProcedural) {
        if (mainImage) {
          const mainImageFormData = new FormData();
          mainImageFormData.append('file', mainImage);
          const mainImageRes = await directus.request(uploadFiles(mainImageFormData));
          uploadedMainImageId = (mainImageRes as any).id;
        }
        if (datasheet) {
          const datasheetFormData = new FormData();
          datasheetFormData.append('file', datasheet);
          const datasheetRes = await directus.request(uploadFiles(datasheetFormData));
          uploadedDatasheetId = (datasheetRes as any).id;
        }
      }

      // Upload additional files once
      const uploadedAdditionalImageIds: string[] = [];
      const uploadedAdditionalFileIds: string[] = [];

      if (additionalImages.length > 0) {
        for (const file of additionalImages) {
          const fileData = new FormData();
          fileData.append('file', file);
          const fileRes = await directus.request(uploadFiles(fileData));
          uploadedAdditionalImageIds.push((fileRes as any).id);
        }
      }

      if (additionalFiles.length > 0) {
        for (const file of additionalFiles) {
          const fileData = new FormData();
          fileData.append('file', file);
          const fileRes = await directus.request(uploadFiles(fileData));
          uploadedAdditionalFileIds.push((fileRes as any).id);
        }
      }

      for (const item of itemsToSave) {
        current++;
        setUploadProgress({ current, total });
        let mainImageId = uploadedMainImageId;
        let datasheetId = uploadedDatasheetId;

        // 1. Generate and Upload Procedural Image if needed (this must be per item as values differ)
        if (isProcedural) {
          const itemUnit = (item as any).unit || (isResistor ? resistorUnit : (isInductor ? inductorUnit : ""));
          const svgString = isResistor
            ? getResistorSvgString(item.value, itemUnit, tolerance, tempCo, bandCount)
            : (isInductor
              ? getInductorSvgString(item.value, itemUnit, tolerance)
              : (isTransistor
                ? getTransistorSvgString(item.value)
                : getCapacitorSvgString(item.value, itemUnit, (item as any).type || capacitorType)));

          const blob = await svgStringToBlob(svgString);
          const file = new File([blob], `${item.value.replace(/[^a-z0-9]/gi, '_')}.png`, { type: "image/png" });

          const imageFormData = new FormData();
          imageFormData.append('file', file);
          const imageRes = await directus.request(uploadFiles(imageFormData));
          mainImageId = (imageRes as any).id;
          // Duplicate as datasheet
          datasheetId = mainImageId;
        }

        // 3. Create or Update Component
        const componentData: any = {
          name: isBatchMode ? `${formData.name} (${item.value}${item.unit ? ' ' + item.unit : ''})` : formData.name,
          description: formData.description,
          quantity_available: item.quantity,
          location: formData.storageLocation && formData.storageLocation !== "0" ? formData.storageLocation : null,
          url: formData.referenceUrl || null,
          keywords: [...tags, ...(isResistor ? ['resistor', item.value] : (isInductor ? ['inductor', item.value] : (isTransistor ? ['transistor', item.value] : (isCapacitor ? ['capacitor', item.value] : []))))],
          packet_reference: formData.packetReference || null,
          package: formData.pkg && formData.pkg !== "0" ? Number(formData.pkg) : null,
          type: formData.category && formData.category !== "0" ? Number(formData.category) : null,
          barcode: isBatchMode ? ((item as any).barcode || null) : (barcodes.length > 0 ? barcodes.join(';') : null),
        };

        if (mainImageId) {
          componentData.main_image = mainImageId;
        }
        if (datasheetId) {
          componentData.datasheet = datasheetId;
        }

        let componentId: string | number | null = id ? Number(id) : null;

        if (isEditMode && id && !isBatchMode) {
          await directus.request(updateItem('components', Number(id), componentData));
        } else {
          const newComponentRes = await directus.request(createItem('components', componentData));
          componentId = (newComponentRes as any).id;
        }

        // 4. Create Relations for Additional Images
        if (uploadedAdditionalImageIds.length > 0 && componentId) {
          for (const fileId of uploadedAdditionalImageIds) {
            await directus.request(createItem('components_files', {
              components_id: Number(componentId),
              directus_files_id: fileId
            }));
          }
        }

        // 5. Create Relations for Additional Files
        if (uploadedAdditionalFileIds.length > 0 && componentId) {
          for (const fileId of uploadedAdditionalFileIds) {
            await directus.request(createItem('components_files_1', {
              components_id: Number(componentId),
              directus_files_id: fileId
            }));
          }
        }
      }

      toast.success(isEditMode && !isBatchMode ? "Component updated successfully!" : `Successfully saved ${itemsToSave.length} component(s)!`, { id: toastId });
      navigate("/inventory");
    } catch (error: any) {
      console.error("Error saving component:", error);
      toast.error(error.message || "Failed to save component.", { id: toastId });
    } finally {
      setIsSaving(false);
      setUploadProgress(null);
    }
  };

  const focusClasses = "focus:border-primary focus:ring-4 focus:ring-primary/20 outline-none transition-all";

  return (
    <>
      <main className="flex flex-1 justify-center py-8 px-6 lg:px-40">
        <div className="layout-content-container flex flex-col max-w-[1000px] flex-1">
          {/* Page Header */}
          <div className="flex flex-wrap justify-between items-end gap-4 mb-8">
            <div className="flex flex-col gap-1">
              <h1 className="text-slate-900 dark:text-white text-3xl font-extrabold tracking-tight">{isEditMode ? "Edit Component" : "Add Component"}</h1>
              <p className="text-slate-500 dark:text-slate-400 text-base">
                {isEditMode ? "Update the technical and logistical specifications." : "Enter the technical and logistical specifications for the new component."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {uploadProgress && (
                <div className="hidden sm:flex flex-col items-end gap-1 mr-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Progress {uploadProgress.current} / {uploadProgress.total}
                  </div>
                  <div className="w-32 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              <button
                onClick={() => setShowCancelModal(true)}
                className="flex min-w-[100px] cursor-pointer items-center justify-center rounded-xl h-10 px-5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex min-w-[140px] cursor-pointer items-center justify-center rounded-xl h-10 px-5 bg-primary text-white text-sm font-semibold shadow-lg shadow-primary/20 hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (isEditMode ? "Updating..." : "Saving...") : (isEditMode ? "Update Component" : "Save Component")}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Primary Info */}
            <div className="lg:col-span-2 space-y-8">
              {/* Technical Details Section */}
              <section className="bg-white dark:bg-slate-900/50 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-2 mb-6 text-primary">
                  <Settings className="w-5 h-5" />
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Technical Information</h2>
                </div>
                <div className="space-y-6">
                  {/* Virtual Fields for Resistors/Inductors */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => { setIsResistor(!isResistor); setIsInductor(false); setIsTransistor(false); setIsCapacitor(false); }}
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${isResistor ? 'bg-primary text-white border-primary shadow-md' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'}`}
                    >
                      <Zap className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">Resistor</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsInductor(!isInductor); setIsResistor(false); setIsTransistor(false); setIsCapacitor(false); }}
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${isInductor ? 'bg-primary text-white border-primary shadow-md' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'}`}
                    >
                      <Activity className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">Inductor</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsTransistor(!isTransistor); setIsResistor(false); setIsInductor(false); setIsCapacitor(false); }}
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${isTransistor ? 'bg-primary text-white border-primary shadow-md' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'}`}
                    >
                      <Cpu className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">Transistor</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsCapacitor(!isCapacitor); setIsResistor(false); setIsInductor(false); setIsTransistor(false); }}
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${isCapacitor ? 'bg-primary text-white border-primary shadow-md' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'}`}
                    >
                      <Battery className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">Capacitor</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsBatchMode(!isBatchMode)}
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${isBatchMode ? 'bg-orange-500 text-white border-orange-500 shadow-md' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'}`}
                    >
                      <Layers className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">Batch Entry</span>
                    </button>
                  </div>

                  {/* Dynamic Inputs */}
                  {(isResistor || isInductor || isTransistor || isCapacitor) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-primary/5 rounded-2xl border border-primary/20 animate-in fade-in duration-300">
                      {isResistor && (
                        <>
                          <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Band Count</label>
                            <select
                              value={bandCount}
                              onChange={(e) => setBandCount(Number(e.target.value))}
                              className={`form-select w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-11 px-4 text-sm ${focusClasses}`}
                            >
                              <option value={4}>4 Bands</option>
                              <option value={5}>5 Bands</option>
                              <option value={6}>6 Bands</option>
                            </select>
                          </div>
                          <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Tolerance</label>
                            <select
                              value={tolerance}
                              onChange={(e) => setTolerance(e.target.value)}
                              className={`form-select w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-11 px-4 text-sm ${focusClasses}`}
                            >
                              {Object.keys(TOLERANCE_MAP).map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </div>
                          {bandCount === 6 && (
                            <div className="flex flex-col gap-2">
                              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">TempCo</label>
                              <select
                                value={tempCo}
                                onChange={(e) => setTempCo(e.target.value)}
                                className={`form-select w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-11 px-4 text-sm ${focusClasses}`}
                              >
                                {Object.keys(TEMPCO_MAP).map(t => (
                                  <option key={t} value={t}>{t}</option>
                                ))}
                              </select>
                            </div>
                          )}
                          {!isBatchMode && (
                            <div className="flex flex-col gap-2">
                              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Resistance Value</label>
                              <div className="flex gap-2">
                                <input
                                  value={resistorValue}
                                  onChange={(e) => setResistorValue(e.target.value)}
                                  placeholder="e.g. 4.7, 100, 1"
                                  className={`form-input flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-11 px-4 text-sm ${focusClasses}`}
                                />
                                <select
                                  value={resistorUnit}
                                  onChange={(e) => setResistorUnit(e.target.value)}
                                  className={`form-select w-24 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-11 px-2 text-sm ${focusClasses}`}
                                >
                                  <option value="Ω">Ω</option>
                                  <option value="kΩ">kΩ</option>
                                  <option value="MΩ">MΩ</option>
                                </select>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      {isInductor && (
                        <>
                          <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Tolerance</label>
                            <select
                              value={tolerance}
                              onChange={(e) => setTolerance(e.target.value)}
                              className={`form-select w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-11 px-4 text-sm ${focusClasses}`}
                            >
                              {Object.keys(TOLERANCE_MAP).map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </div>
                          {!isBatchMode && (
                            <div className="flex flex-col gap-2">
                              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Inductance Value</label>
                              <div className="flex gap-2">
                                <input
                                  value={inductanceValue}
                                  onChange={(e) => setInductanceValue(e.target.value)}
                                  placeholder="e.g. 10, 100, 1"
                                  className={`form-input flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-11 px-4 text-sm ${focusClasses}`}
                                />
                                <select
                                  value={inductorUnit}
                                  onChange={(e) => setInductorUnit(e.target.value)}
                                  className={`form-select w-24 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-11 px-2 text-sm ${focusClasses}`}
                                >
                                  <option value="nH">nH</option>
                                  <option value="µH">µH</option>
                                  <option value="mH">mH</option>
                                  <option value="H">H</option>
                                </select>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      {isTransistor && (
                        <div className="flex flex-col gap-2">
                          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Transistor Model</label>
                          <input
                            type="text"
                            value={transistorValue}
                            onChange={(e) => setTransistorValue(e.target.value)}
                            placeholder="e.g. 2N2222"
                            className={`form-input w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-11 px-4 text-sm ${focusClasses}`}
                          />
                        </div>
                      )}
                      {isCapacitor && (
                        <>
                          <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Capacitor Type</label>
                            <select
                              value={capacitorType}
                              onChange={(e) => setCapacitorType(e.target.value as any)}
                              className={`form-select w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-11 px-4 text-sm ${focusClasses}`}
                            >
                              <option value="Electrolytic">Electrolytic</option>
                              <option value="Tantalum">Tantalum</option>
                              <option value="Ceramic">Ceramic</option>
                            </select>
                          </div>
                          {!isBatchMode && (
                            <div className="flex flex-col gap-2">
                              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Capacitance Value</label>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={capacitorValue}
                                  onChange={(e) => setCapacitorValue(e.target.value)}
                                  placeholder="e.g. 10"
                                  className={`form-input w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-11 px-4 text-sm ${focusClasses}`}
                                />
                                <select
                                  value={capacitorUnit}
                                  onChange={(e) => setCapacitorUnit(e.target.value)}
                                  className={`form-select w-24 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-11 px-2 text-sm ${focusClasses}`}
                                >
                                  <option value="µF">µF</option>
                                  <option value="nF">nF</option>
                                  <option value="pF">pF</option>
                                </select>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      {isBatchMode && (
                        <div className="md:col-span-2 space-y-4">
                          <div className="flex justify-between items-center">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Batch Items</label>
                            <div className="flex gap-3">
                              <button
                                type="button"
                                onClick={() => {
                                  const newItems = batchItems.map(item => ({
                                    ...item,
                                    barcode: item.barcode || generateRandomBarcode()
                                  }));
                                  setBatchItems(newItems);
                                  toast.success("Generated barcodes for all items");
                                }}
                                className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-primary transition-colors"
                              >
                                <RefreshCw className="w-3 h-3" /> Generate All Barcodes
                              </button>
                              <button
                                type="button"
                                onClick={() => setBatchItems([...batchItems, { value: "", quantity: 1, unit: isResistor ? resistorUnit : (isInductor ? inductorUnit : (isTransistor ? "" : (isCapacitor ? capacitorUnit : ""))) }])}
                                className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                              >
                                <Plus className="w-3 h-3" /> Add Item
                              </button>
                            </div>
                          </div>
                          <div className="space-y-3">
                            {batchItems.map((item, index) => (
                              <div key={index} className="flex gap-3 items-end animate-in fade-in slide-in-from-left-2 duration-200">
                                <div className="flex-1 flex flex-col gap-1.5">
                                  <label className="text-[10px] uppercase font-bold text-slate-400">Value</label>
                                  <div className="flex gap-1">
                                    <input
                                      value={item.value}
                                      onChange={(e) => {
                                        const newItems = [...batchItems];
                                        newItems[index].value = e.target.value;
                                        setBatchItems(newItems);
                                      }}
                                      placeholder="e.g. 10"
                                      className={`form-input flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-10 px-3 text-sm ${focusClasses}`}
                                    />
                                    {isProcedural && !isTransistor && (
                                      <select
                                        value={item.unit || (isResistor ? resistorUnit : (isInductor ? inductorUnit : (isCapacitor ? capacitorUnit : "")))}
                                        onChange={(e) => {
                                          const newItems = [...batchItems];
                                          newItems[index].unit = e.target.value;
                                          setBatchItems(newItems);
                                        }}
                                        className={`form-select w-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-10 px-1 text-xs ${focusClasses}`}
                                      >
                                        {isResistor ? (
                                          <>
                                            <option value="Ω">Ω</option>
                                            <option value="kΩ">kΩ</option>
                                            <option value="MΩ">MΩ</option>
                                          </>
                                        ) : isInductor ? (
                                          <>
                                            <option value="nH">nH</option>
                                            <option value="µH">µH</option>
                                            <option value="mH">mH</option>
                                            <option value="H">H</option>
                                          </>
                                        ) : isCapacitor ? (
                                          <>
                                            <option value="pF">pF</option>
                                            <option value="nF">nF</option>
                                            <option value="µF">µF</option>
                                          </>
                                        ) : null}
                                      </select>
                                    )}
                                  </div>
                                </div>
                                <div className="w-20 flex flex-col gap-1.5">
                                  <label className="text-[10px] uppercase font-bold text-slate-400">Qty</label>
                                  <input
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => {
                                      const newItems = [...batchItems];
                                      newItems[index].quantity = parseInt(e.target.value) || 0;
                                      setBatchItems(newItems);
                                    }}
                                    className={`form-input w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-10 px-3 text-sm ${focusClasses}`}
                                  />
                                </div>
                                <div className="w-32 flex flex-col gap-1.5">
                                  <label className="text-[10px] uppercase font-bold text-slate-400">Barcode</label>
                                  <div className="relative">
                                    <input
                                      value={item.barcode || ""}
                                      onChange={(e) => {
                                        const newItems = [...batchItems];
                                        newItems[index].barcode = e.target.value;
                                        setBatchItems(newItems);
                                      }}
                                      placeholder="SKU..."
                                      className={`form-input w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-10 pl-3 pr-8 text-xs font-mono ${focusClasses}`}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newItems = [...batchItems];
                                        newItems[index].barcode = generateRandomBarcode();
                                        setBatchItems(newItems);
                                      }}
                                      className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-primary transition-colors"
                                      title="Generate Barcode"
                                    >
                                      <RefreshCw className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setBatchItems(batchItems.filter((_, i) => i !== index))}
                                  disabled={batchItems.length === 1}
                                  className="h-10 w-10 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 disabled:opacity-30 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Name <span className="text-red-500">*</span></label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setLcscSearchCode(normalizeLcscCode(formData.name) || "");
                            setShowLcscModal(true);
                          }}
                          disabled={isLcscLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white transition-all group font-medium"
                          title="Import from LCSC Distributor"
                        >
                          {isLcscLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 group-hover:translate-y-0.5 transition-transform" />}
                          <span className="text-[11px] font-bold uppercase tracking-wider">LCSC Import</span>
                        </button>
                        {settings.enableAiSuggestions && (
                          <button
                            type="button"
                            onClick={handleAiFill}
                            disabled={isAiFilling || !formData.name.trim()}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all disabled:opacity-50 disabled:hover:bg-primary/10 disabled:hover:text-primary group font-medium"
                          >
                            {isAiFilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 group-hover:animate-pulse" />}
                            <span className="text-[11px] font-bold uppercase tracking-wider">Fill with AI</span>
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      className={`form-input w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-12 px-4 text-base ${focusClasses}`}
                      placeholder="e.g. ATmega328P Microcontroller"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Category <span className="text-red-500">*</span></label>
                      <div className="flex gap-2">
                        <select
                          name="category"
                          value={formData.category}
                          onChange={handleInputChange}
                          disabled={isLoadingOptions}
                          className={`form-select w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-12 px-4 text-base ${focusClasses}`}
                        >
                          {isLoadingOptions ? (
                            <option>Loading...</option>
                          ) : (
                            categories.map(cat => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name}{cat.subcategory ? ` - ${cat.subcategory}` : ''}
                              </option>
                            ))
                          )}
                        </select>
                        <button
                          onClick={() => openCategoryModal()}
                          className="flex items-center justify-center w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-primary hover:text-white hover:border-primary transition-colors shrink-0"
                          title="Create New Category"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => {
                            const selected = categories.find(c => c.id === Number(formData.category));
                            if (selected) openCategoryModal(selected);
                          }}
                          disabled={!formData.category}
                          className="flex items-center justify-center w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-primary hover:text-white hover:border-primary transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Edit Selected Category"
                        >
                          <Edit className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Package</label>
                      <div className="flex gap-2">
                        <select
                          name="pkg"
                          value={formData.pkg}
                          onChange={handleInputChange}
                          disabled={isLoadingOptions}
                          className={`form-select w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-12 px-4 text-base ${focusClasses}`}
                        >
                          {isLoadingOptions ? (
                            <option>Loading...</option>
                          ) : (
                            packages.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))
                          )}
                        </select>
                        <button
                          onClick={() => openPackageModal()}
                          className="flex items-center justify-center w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-primary hover:text-white hover:border-primary transition-colors shrink-0"
                          title="Create New Package"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => {
                            const selected = packages.find(p => p.id === Number(formData.pkg));
                            if (selected) openPackageModal(selected);
                          }}
                          disabled={!formData.pkg}
                          className="flex items-center justify-center w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-primary hover:text-white hover:border-primary transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Edit Selected Package"
                        >
                          <Edit className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Description <span className="text-red-500">*</span></label>
                      <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                        <button
                          onClick={() => setPreviewMode(false)}
                          className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${!previewMode ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                          Write
                        </button>
                        <button
                          onClick={() => setPreviewMode(true)}
                          className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${previewMode ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                          Preview
                        </button>
                      </div>
                    </div>
                    <div className={`border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/20 transition-all bg-white dark:bg-slate-900 min-h-[250px]`}>
                      {!previewMode ? (
                        <textarea
                          name="description"
                          value={formData.description}
                          onChange={handleInputChange}
                          className="w-full h-full min-h-[250px] p-4 bg-transparent border-none focus:ring-0 text-slate-900 dark:text-white resize-y outline-none"
                          placeholder="Enter component specifications, features, and technical notes... (Markdown supported)"
                        />
                      ) : (
                        <div className="p-4 prose dark:prose-invert max-w-none min-h-[250px]" data-color-mode="light">
                          {formData.description ? (
                            <MDEditor.Markdown source={formData.description} style={{ backgroundColor: 'transparent', color: 'inherit' }} />
                          ) : (
                            <p className="text-slate-400 italic">Nothing to preview...</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Keywords / Tags <span className="text-red-500">*</span></label>
                    <div className="flex flex-wrap gap-2 p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/20 transition-all">
                      {tags.map((tag) => (
                        <span key={tag} className="inline-flex items-center gap-1 bg-primary/10 text-primary px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider">
                          {tag}
                          <button onClick={() => removeTag(tag)} className="hover:bg-primary/20 rounded-full p-0.5 transition-colors">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      <input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={handleTagKeyDown}
                        className="border-none bg-transparent focus:ring-0 text-sm flex-1 min-w-[120px] p-1 outline-none"
                        placeholder="Type and press Enter..."
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Media & Files */}
              <section className="bg-white dark:bg-slate-900/50 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2 text-primary">
                    <Paperclip className="w-5 h-5" />
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Assets & Documentation</h2>
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoFillAssets}
                    disabled={isLcscLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white transition-all text-xs font-bold border border-emerald-500/20 shadow-sm"
                    title="Automatically fill image, datasheet, photos, and documentation"
                  >
                    {isLcscLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>Auto-Fill All Assets</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {/* Main Image */}
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Main Image <span className="text-red-500">*</span></label>
                      <button
                        onClick={() => setShowImageSearchModal({ type: 'main', query: formData.name })}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-primary hover:text-white transition-all border border-slate-200 dark:border-slate-700 hover:border-primary"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Search Web</span>
                      </button>
                    </div>
                    {isResistor ? (
                      <ResistorVisual
                        value={isBatchMode ? "Batch Mode" : resistorValue}
                        unit={resistorUnit}
                        tolerance={tolerance}
                        tempCo={tempCo}
                        bandCount={bandCount}
                        svgRef={resistorSvgRef}
                      />
                    ) : isInductor ? (
                      <InductorVisual
                        value={isBatchMode ? "Batch Mode" : inductanceValue}
                        unit={inductorUnit}
                        tolerance={tolerance}
                        svgRef={inductorSvgRef}
                      />
                    ) : isTransistor ? (
                      <TransistorVisual
                        value={isBatchMode ? "Batch Mode" : transistorValue}
                        svgRef={transistorSvgRef}
                      />
                    ) : isCapacitor ? (
                      <CapacitorVisual
                        value={isBatchMode ? "Batch Mode" : capacitorValue}
                        unit={capacitorUnit}
                        type={capacitorType}
                        svgRef={capacitorSvgRef}
                      />
                    ) : (
                      <div
                        onClick={() => mainImageRef.current?.click()}
                        className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-6 hover:border-primary hover:bg-primary/5 transition-all group cursor-pointer min-h-[140px]"
                      >
                        {mainImage ? (
                          <div className="flex flex-col items-center text-primary w-full">
                            <img
                              src={URL.createObjectURL(mainImage)}
                              alt="Main preview"
                              className="w-full h-32 object-contain rounded-lg mb-2"
                            />
                            <p className="text-sm font-bold text-center truncate w-full px-4">{mainImage.name}</p>
                            <p className="text-xs opacity-70 mt-1">Click to replace</p>
                          </div>
                        ) : existingMainImage ? (
                          <div className="flex flex-col items-center text-primary w-full">
                            <img
                              src={getFileUrl(existingMainImage)}
                              alt="Existing Main"
                              className="w-full h-32 object-contain rounded-lg mb-2"
                            />
                            <p className="text-sm font-bold text-center truncate w-full px-4">Current Image</p>
                            <p className="text-xs opacity-70 mt-1">Click to replace</p>
                          </div>
                        ) : (
                          <>
                            <ImageIcon className="w-8 h-8 text-slate-400 group-hover:text-primary transition-colors" />
                            <div className="text-center">
                              <p className="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-primary transition-colors">Upload Main Image</p>
                              <p className="text-xs text-slate-500 mt-1">PNG, JPG up to 5MB</p>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    <input type="file" hidden ref={mainImageRef} accept="image/*" onChange={(e) => handleSingleFile(e, setMainImage)} />
                  </div>

                  {/* Main Datasheet */}
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Datasheet (PDF/Image) <span className="text-red-500">*</span></label>
                      <button
                        onClick={() => setShowImageSearchModal({ type: 'datasheet', query: `${formData.name} datasheet` })}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-primary hover:text-white transition-all border border-slate-200 dark:border-slate-700 hover:border-primary"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Search Web</span>
                      </button>
                    </div>
                    <div
                      onClick={() => datasheetRef.current?.click()}
                      className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-6 hover:border-primary hover:bg-primary/5 transition-all group cursor-pointer min-h-[140px]"
                    >
                      {datasheet ? (
                        <div className="flex flex-col items-center text-primary w-full">
                          {datasheet.type.startsWith('image/') ? (
                            <img
                              src={URL.createObjectURL(datasheet)}
                              alt="Datasheet preview"
                              className="w-full h-32 object-contain rounded-lg mb-2"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center w-full h-32 bg-red-50 dark:bg-red-900/10 rounded-lg mb-2 border border-red-100 dark:border-red-900/30">
                              <FileText className="w-10 h-10 text-red-500 mb-2" />
                              <span className="text-xs font-bold text-red-600 dark:text-red-400">PDF Document</span>
                              <span className="text-[10px] text-red-500/70">{(datasheet.size / 1024 / 1024).toFixed(2)} MB</span>
                            </div>
                          )}
                          <p className="text-sm font-bold text-center truncate w-full px-4">{datasheet.name}</p>
                          <p className="text-xs opacity-70 mt-1">Click to replace</p>
                        </div>
                      ) : existingDatasheet ? (
                        <div className="flex flex-col items-center text-primary w-full">
                          <div className="flex flex-col items-center justify-center w-full h-32 bg-slate-100 dark:bg-slate-800 rounded-lg mb-2 border border-slate-200 dark:border-slate-700">
                            <FileText className="w-10 h-10 text-slate-500 mb-2" />
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Current Datasheet</span>
                          </div>
                          <p className="text-xs opacity-70 mt-1">Click to replace</p>
                        </div>
                      ) : (
                        <>
                          <FileText className="w-8 h-8 text-slate-400 group-hover:text-primary transition-colors" />
                          <div className="text-center">
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-primary transition-colors">Upload Datasheet</p>
                            <p className="text-xs text-slate-500 mt-1">PDF or Image</p>
                          </div>
                        </>
                      )}
                    </div>
                    <input type="file" hidden ref={datasheetRef} accept=".pdf,image/*" onChange={(e) => handleSingleFile(e, setDatasheet)} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Additional Images */}
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Additional Images</label>
                    <div
                      onClick={() => additionalImagesRef.current?.click()}
                      className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 hover:border-primary hover:bg-primary/5 transition-all group cursor-pointer"
                    >
                      <UploadCloud className="w-6 h-6 text-slate-400 group-hover:text-primary transition-colors" />
                      <div className="text-center">
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-primary transition-colors">Add More Images</p>
                        <p className="text-xs text-slate-500">Select multiple files</p>
                      </div>
                    </div>
                    <input type="file" hidden multiple ref={additionalImagesRef} accept="image/*" onChange={(e) => handleMultipleFiles(e, setAdditionalImages)} />

                    {additionalImages.length > 0 && (
                      <div className="flex flex-col gap-2 mt-2 max-h-40 overflow-y-auto pr-1">
                        {additionalImages.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <img
                                src={URL.createObjectURL(file)}
                                alt={`Preview ${idx}`}
                                className="w-8 h-8 object-cover rounded shrink-0 border border-slate-200 dark:border-slate-700"
                              />
                              <span className="text-xs truncate">{file.name}</span>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); removeMultipleFile(idx, setAdditionalImages); }} className="text-slate-400 hover:text-red-500 p-1 transition-colors">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Additional Files */}
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Additional Files</label>
                    <div
                      onClick={() => additionalFilesRef.current?.click()}
                      className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 hover:border-primary hover:bg-primary/5 transition-all group cursor-pointer"
                    >
                      <FilePlus className="w-6 h-6 text-slate-400 group-hover:text-primary transition-colors" />
                      <div className="text-center">
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-primary transition-colors">Add More Documents</p>
                        <p className="text-xs text-slate-500">CAD, ZIP, TXT, etc.</p>
                      </div>
                    </div>
                    <input type="file" hidden multiple ref={additionalFilesRef} onChange={(e) => handleMultipleFiles(e, setAdditionalFiles)} />

                    {additionalFiles.length > 0 && (
                      <div className="flex flex-col gap-2 mt-2 max-h-40 overflow-y-auto pr-1">
                        {additionalFiles.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                              <span className="text-xs truncate">{file.name}</span>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); removeMultipleFile(idx, setAdditionalFiles); }} className="text-slate-400 hover:text-red-500 p-1 transition-colors">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Reference URL</label>
                  <div className={`mt-2 flex rounded-lg shadow-sm focus-within:ring-4 focus-within:ring-primary/20 focus-within:border-primary transition-all border border-slate-200 dark:border-slate-700`}>
                    <input
                      name="referenceUrl"
                      value={formData.referenceUrl}
                      onChange={handleInputChange}
                      className="form-input flex-1 block w-full rounded-lg border-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-0 text-sm h-11 px-4 outline-none"
                      placeholder="https://www.mouser.com/product/..."
                      type="text"
                    />
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column: Logistical Info */}
            <div className="space-y-8">
              <section className="bg-white dark:bg-slate-900/50 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm sticky top-24">
                <div className="flex items-center gap-2 mb-6 text-primary">
                  <Package className="w-5 h-5" />
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Logistics</h2>
                </div>
                <div className="space-y-5">
                  {!isBatchMode && (
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Quantity Available</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                          <Hash className="w-5 h-5" />
                        </span>
                        <input
                          name="quantity"
                          value={formData.quantity}
                          onChange={handleInputChange}
                          className={`form-input w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-12 pl-10 pr-4 text-base ${focusClasses}`}
                          placeholder="0"
                          type="number"
                          min="0"
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Storage Location <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                        <MapPin className="w-5 h-5" />
                      </span>
                      <select
                        name="storageLocation"
                        value={formData.storageLocation}
                        onChange={handleInputChange}
                        disabled={isLoadingOptions}
                        className={`form-select w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-12 pl-10 pr-4 text-base appearance-none ${focusClasses}`}
                      >
                        <option value="" disabled>{isLoadingOptions ? "Loading..." : "Select a location..."}</option>
                        {!isLoadingOptions && locations.map(loc => (
                          <option key={loc.id} value={loc.id}>{loc.name} ({loc.unique_id})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Packet Reference</label>
                    <input
                      name="packetReference"
                      value={formData.packetReference}
                      onChange={handleInputChange}
                      className={`form-input w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-12 px-4 text-base ${focusClasses}`}
                      placeholder="Internal Ref Code"
                      type="text"
                    />
                  </div>
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Barcodes / SKUs</label>
                    <div className="mt-2 flex flex-col gap-4">
                      <div className="flex flex-wrap gap-2 p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/20 transition-all">
                        {barcodes.map((code) => (
                          <span key={code} className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-2 py-1 rounded-md text-xs font-mono font-bold tracking-wider border border-slate-200 dark:border-slate-600">
                            {code}
                            <button onClick={() => removeBarcode(code)} className="hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500 rounded-full p-0.5 transition-colors">
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                        <div className="relative flex-1 min-w-[150px] flex items-center">
                          <span className="absolute inset-y-0 left-0 pl-1 flex items-center text-slate-400">
                            <Barcode className="w-4 h-4" />
                          </span>
                          <input
                            className="w-full bg-transparent border-none focus:ring-0 text-sm h-8 pl-7 pr-16 outline-none font-mono"
                            placeholder="Scan or enter barcode..."
                            type="text"
                            value={barcodeInput}
                            onChange={(e) => setBarcodeInput(e.target.value)}
                            onKeyDown={handleBarcodeKeyDown}
                          />
                          <div className="absolute right-1 flex items-center gap-1">
                            <button
                              onClick={() => {
                                const newCode = generateRandomBarcode();
                                if (!barcodes.includes(newCode)) {
                                  setBarcodes([...barcodes, newCode]);
                                  toast.success(`Generated barcode: ${newCode}`);
                                }
                              }}
                              className="p-1 text-slate-400 hover:text-primary transition-colors"
                              title="Generate Random Barcode"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setShowScanner(true)}
                              className="p-1 text-slate-400 hover:text-primary transition-colors sm:hidden"
                              title="Scan with Camera"
                            >
                              <Camera className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-6 flex flex-col items-center justify-center gap-4 border border-slate-200 dark:border-slate-800 min-h-[160px] overflow-hidden">
                        {barcodes.length > 0 ? (
                          <div className="flex flex-col gap-4 w-full">
                            {barcodes.map((code) => (
                              <div key={code} className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center gap-3 transition-all hover:shadow-md group relative">
                                <div className="flex justify-between items-start w-full">
                                  <div className="flex items-center gap-1.5">
                                    <Zap className="w-3.5 h-3.5 text-orange-500" />
                                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">ElectroStock</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[8px] font-mono text-slate-400 dark:text-slate-500">v2.4.0</span>
                                    <button
                                      onClick={() => removeBarcode(code)}
                                      className="text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                      title="Remove Barcode"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>

                                <div className="w-full flex flex-col items-center justify-center bg-white dark:bg-white rounded-lg p-3 border border-slate-100 dark:border-slate-200">
                                  <BarcodeGenerator value={code} height={40} displayValue={false} background="transparent" width={1.5} margin={0} />
                                  <div className="text-center text-[10px] font-mono mt-2 tracking-[0.2em] font-bold text-slate-900">{code}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <>
                            <div className="h-16 w-full bg-white dark:bg-slate-700 flex items-center justify-center rounded border border-slate-200 dark:border-slate-600 opacity-50">
                              <Barcode className="w-8 h-8 text-slate-300" />
                            </div>
                            <p className="text-[10px] text-slate-400 font-mono uppercase tracking-widest">
                              No barcodes added
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>

          {/* Footer Sticky for mobile or end of form */}
          <div className="mt-12 flex justify-end gap-4 pb-12 border-t border-slate-200 dark:border-slate-800 pt-8 lg:hidden">
            <button
              onClick={() => setShowCancelModal(true)}
              className="flex-1 cursor-pointer items-center justify-center rounded-xl h-12 px-5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-base font-semibold flex"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-[2] cursor-pointer items-center justify-center rounded-xl h-12 px-5 bg-primary text-white text-base font-semibold shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? "Saving..." : "Save Component"}
            </button>
          </div>
        </div>
      </main>

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4 text-amber-500">
              <div className="p-2 bg-amber-500/10 rounded-full">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Discard changes?</h3>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
              You have unsaved changes. Are you sure you want to discard them and leave this page?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Keep Editing
              </button>
              <button
                onClick={() => navigate("/inventory")}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Proposal Modal */}
      {aiProposal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4 text-primary">
              <div className="p-2 bg-primary/10 rounded-full">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">AI Suggestions</h3>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
              The AI suggested new options that don't exist in your database yet. Would you like to create them?
            </p>

            <div className="space-y-4 mb-6">
              {aiProposal.category && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">New Category</p>
                  <p className="text-slate-900 dark:text-white font-medium">{aiProposal.category}</p>
                </div>
              )}
              {aiProposal.subcategory && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">New Subcategory</p>
                  <p className="text-slate-900 dark:text-white font-medium">{aiProposal.subcategory}</p>
                </div>
              )}
              {aiProposal.package && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">New Package</p>
                  <p className="text-slate-900 dark:text-white font-medium">{aiProposal.package}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setAiProposal(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Ignore
              </button>
              <button
                onClick={async () => {
                  try {
                    let newCatId = formData.category;
                    let newPkgId = formData.pkg;
                    let newSubcat = formData.subcategory;

                    if (aiProposal.category) {
                      const catRes = await directus.request(createItem('components_types', {
                        name: aiProposal.category,
                        subcategory: aiProposal.subcategory || null
                      }));
                      newCatId = catRes.id.toString();
                      setCategories(prev => [...prev, catRes as ComponentType]);
                    } else if (aiProposal.subcategory && newCatId) {
                      const existingCat = categories.find(c => c.id.toString() === newCatId);
                      if (existingCat) {
                        const updatedSubcategories = existingCat.subcategory
                          ? `${existingCat.subcategory}, ${aiProposal.subcategory}`
                          : aiProposal.subcategory;

                        const catRes = await directus.request(updateItem('components_types', existingCat.id, {
                          subcategory: updatedSubcategories
                        }));
                        setCategories(prev => prev.map(c => c.id === existingCat.id ? { ...c, subcategory: updatedSubcategories } : c));
                      }
                    }
                    if (aiProposal.subcategory) {
                      newSubcat = aiProposal.subcategory;
                    }
                    if (aiProposal.package) {
                      const pkgRes = await directus.request(createItem('components_packages', { name: aiProposal.package }));
                      newPkgId = pkgRes.id.toString();
                      setPackages(prev => [...prev, pkgRes as ComponentPackage]);
                    }

                    setFormData(prev => ({
                      ...prev,
                      category: newCatId,
                      subcategory: newSubcat,
                      pkg: newPkgId
                    }));

                    toast.success("Created new options successfully");
                    setAiProposal(null);
                  } catch (error) {
                    console.error("Failed to create AI proposals", error);
                    toast.error("Failed to create new options");
                  }
                }}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
              >
                Create & Apply
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              {editingCategory ? "Edit Category" : "New Category"}
            </h3>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Name <span className="text-red-500">*</span></label>
                <input
                  value={modalName}
                  onChange={(e) => setModalName(e.target.value)}
                  className={`form-input w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-10 px-3 text-sm ${focusClasses}`}
                  placeholder="e.g. Microcontrollers"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Subcategory</label>
                <textarea
                  value={modalSubcategory}
                  onChange={(e) => setModalSubcategory(e.target.value)}
                  className={`form-input w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white p-3 text-sm min-h-[80px] resize-none ${focusClasses}`}
                  placeholder="e.g. SMD, Through-hole..."
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowCategoryModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCategory}
                disabled={isModalSaving || !modalName.trim()}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:brightness-110 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isModalSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingCategory ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LCSC Import Modal */}
      {showLcscModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Import from LCSC</h3>
                  <p className="text-xs text-slate-500">Datasheet, footprint, pricing & specs</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLcscModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  LCSC Part Number or URL <span className="text-red-500">*</span>
                </label>
                <input
                  value={lcscSearchCode}
                  onChange={(e) => setLcscSearchCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleLcscImport(lcscSearchCode);
                    }
                  }}
                  className={`form-input w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-11 px-3 text-sm ${focusClasses}`}
                  placeholder="e.g. C2040, C25349, or paste LCSC link"
                  autoFocus
                />
                <p className="text-xs text-slate-400">
                  Try examples: <button type="button" onClick={() => setLcscSearchCode("C2040")} className="text-primary hover:underline">C2040 (RP2040)</button>, <button type="button" onClick={() => setLcscSearchCode("C1525")} className="text-primary hover:underline">C1525 (Capacitor 0402)</button>, <button type="button" onClick={() => setLcscSearchCode("C25349")} className="text-primary hover:underline">C25349 (Resistor 1206)</button>
                </p>
              </div>

              {lastLcscData && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs flex flex-col gap-1">
                  <span className="font-bold text-slate-800 dark:text-slate-200">{lastLcscData.name} ({lastLcscData.manufacturer})</span>
                  <span className="text-slate-500">Package: {lastLcscData.package} • Stock: {lastLcscData.stock.toLocaleString()}</span>
                  {lastLcscData.unitPrice && <span className="text-emerald-600 font-semibold">${lastLcscData.unitPrice.toFixed(4)} USD</span>}
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                type="button"
                onClick={() => setShowLcscModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleLcscImport(lcscSearchCode)}
                disabled={isLcscLoading || !lcscSearchCode.trim()}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLcscLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Fetch & Auto-fill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Package Modal */}
      {showPackageModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              {editingPackage ? "Edit Package" : "New Package"}
            </h3>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Name <span className="text-red-500">*</span></label>
                <input
                  value={modalName}
                  onChange={(e) => setModalName(e.target.value)}
                  className={`form-input w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-10 px-3 text-sm ${focusClasses}`}
                  placeholder="e.g. DIP-28"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowPackageModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePackage}
                disabled={isModalSaving || !modalName.trim()}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:brightness-110 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isModalSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingPackage ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Search Modal */}
      {showImageSearchModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-2xl w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                Search Web Images
              </h3>
              <button onClick={() => setShowImageSearchModal(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex gap-2 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  defaultValue={showImageSearchModal.query}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSearchImages(e.currentTarget.value);
                  }}
                  placeholder="Search for images..."
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
              <button
                onClick={() => {
                  const input = document.querySelector('input[placeholder="Search for images..."]') as HTMLInputElement;
                  handleSearchImages(input.value);
                }}
                disabled={isSearchingImages}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:brightness-110 transition-all disabled:opacity-50"
              >
                {isSearchingImages ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2">
              {isSearchingImages ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin mb-4" />
                  <p>Searching the web...</p>
                </div>
              ) : searchResults.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {searchResults.map((result, idx) => (
                    <div
                      key={idx}
                      onClick={() => selectWebImage(result.url)}
                      className="group relative aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 cursor-pointer hover:border-primary transition-all"
                    >
                      <img
                        src={result.url}
                        alt={result.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white text-[10px] font-bold uppercase tracking-widest bg-primary px-2 py-1 rounded">Select</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
                  <p>Enter a search term to find images</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      {showScanner && (
        <BarcodeScanner
          onScan={(decodedText) => {
            if (!barcodes.includes(decodedText)) {
              setBarcodes(prev => [...prev, decodedText]);
              toast.success(`Scanned: ${decodedText}`);
            }
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </>
  );
}
