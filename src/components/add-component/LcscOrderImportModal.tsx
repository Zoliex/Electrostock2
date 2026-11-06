import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  Sparkles,
  Loader2,
  CheckCircle2,
  Barcode,
  FileText,
  Image as ImageIcon,
  Save,
  Trash2,
  Search,
  ArrowRight,
  Check,
  MapPin,
  HelpCircle,
  ExternalLink,
  FolderOpen,
  Camera,
  Smartphone,
  Wifi,
  QrCode,
  CircleDashed,
  Copy
} from "lucide-react";
import { toast } from "sonner";
import { createItem, uploadFiles } from "@directus/sdk";
import {
  directus,
  Box,
  ComponentPackage,
  ComponentType
} from "../../lib/directus";
import {
  LcscComponentInfo,
  LcscCsvColumnMapping,
  parseCsvText,
  detectLcscCsvColumns,
  normalizeLcscCode,
  fetchLcscComponent,
  fetchLcscAssetsAsFiles,
  formatLcscMarkdown,
  parseLcscBagScan
} from "../../lib/lcsc";
import {
  buildCategoriesPromptInfo,
  matchCategoryAndSubcategory,
  matchPackageOption,
  mergeKeywords,
  cleanPackageName,
  focusClasses
} from "./types";
import {
  RemoteScanOrderItem,
  ScanFeedbackPayload,
  NetworkAddressInfo,
  generateSessionId,
  generateQrDataUrl,
  playScanFeedbackSound,
  buildWsUrl
} from "../../lib/scannerSocket";
import { MobileBatchBagScanner } from "./MobileBatchBagScanner";

export const ORDER_IMPORT_STORAGE_KEY = "electrostock_lcsc_order_import_v1";
const SCANNER_SESSION_KEY = "electrostock_scanner_session_id";

export interface OrderImportItem {
  id: string;
  selected: boolean;
  lcscPartNumber: string; // -> packet_reference (e.g. C11368)
  name: string; // -> MPN / Name (e.g. TAJA474K035RNJ)
  manufacturer: string;
  csvPackage: string;
  csvDescription: string;
  quantity: number;
  unitPrice: number | null; // -> price
  internalBarcode: string; // -> barcode (e.g. X130138209)
  categoryId: string;
  proposedCategory?: string;
  proposedSubcategory?: string;
  packageId: string;
  proposedPackage?: string;
  locationId: string;
  description: string;
  keywords: string[];
  url: string;
  datasheetUrl: string;
  thumbnailUrl: string | null;
  imageUrls: string[];
  lookupStatus: "pending" | "loading" | "done" | "error";
  importStatus: "ready" | "importing" | "imported" | "error";
  errorMessage?: string;
}

interface SavedOrderSession {
  fileName: string;
  savedAt: string;
  defaultLocationId: string;
  useAi: boolean;
  items: OrderImportItem[];
}

interface OrderImportCardProps {
  row: OrderImportItem;
  isPairingActive: boolean;
  isImportingBatch: boolean;
  categories: ComponentType[];
  packages: ComponentPackage[];
  locations: Box[];
  onSelectRow: (id: string) => void;
  onUpdateRow: (id: string, patch: Partial<OrderImportItem>) => void;
  onBarcodeEnter: (rowId: string, rawValue: string) => void;
  onImportSingle: (row: OrderImportItem) => void;
}

const OrderImportCard = React.memo<OrderImportCardProps>(
  ({
    row,
    isPairingActive,
    isImportingBatch,
    categories,
    packages,
    locations,
    onSelectRow,
    onUpdateRow,
    onBarcodeEnter,
    onImportSingle
  }) => {
    const isImported = row.importStatus === "imported";
    const lineTotal = (Number(row.unitPrice) || 0) * (Number(row.quantity) || 0);

    return (
      <div
        onClick={() => onSelectRow(row.id)}
        className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3.5 cursor-pointer ${
          isImported
            ? "bg-emerald-500/5 border-emerald-500/30 opacity-75"
            : isPairingActive
            ? "bg-primary/5 dark:bg-primary/10 border-primary ring-2 ring-primary/20 shadow-md"
            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm"
        }`}
      >
        {/* Card Header: Checkbox, Thumbnail, LCSC C-Code, Name, Import Button */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <input
              type="checkbox"
              checked={row.selected}
              disabled={isImported}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onUpdateRow(row.id, { selected: e.target.checked })}
              className="mt-1.5 w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary shrink-0"
            />

            <div className="w-14 h-14 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0 flex items-center justify-center">
              {row.lookupStatus === "loading" ? (
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              ) : row.thumbnailUrl ? (
                <img
                  src={row.thumbnailUrl}
                  alt={row.name}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-contain p-0.5"
                />
              ) : (
                <ImageIcon className="w-5 h-5 text-slate-300" />
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="px-2.5 py-0.5 rounded-md bg-primary/10 text-primary font-mono font-extrabold text-xs">
                  {row.lcscPartNumber || "N/A"}
                </span>
                {row.url && (
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-slate-400 hover:text-primary"
                    title="Voir sur LCSC"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {row.imageUrls.length > 0 && (
                  <span
                    className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold flex items-center gap-1"
                    title={`${row.imageUrls.length} photo(s) haute résolution`}
                  >
                    <ImageIcon className="w-3 h-3" />
                    {row.imageUrls.length}
                  </span>
                )}
                {row.datasheetUrl && (
                  <a
                    href={row.datasheetUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="px-2 py-0.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold flex items-center gap-1 hover:underline"
                    title="Ouvrir le Datasheet PDF officiel"
                  >
                    <FileText className="w-3 h-3" />
                    PDF
                  </a>
                )}
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {row.manufacturer || "LCSC"}
                </span>
              </div>

              <input
                type="text"
                value={row.name}
                disabled={isImported}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onUpdateRow(row.id, { name: e.target.value })}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 font-bold text-slate-900 dark:text-white text-sm"
              />
            </div>
          </div>

          <div onClick={(e) => e.stopPropagation()} className="shrink-0">
            {row.importStatus === "imported" ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                <CheckCircle2 className="w-4 h-4" />
                Importé
              </span>
            ) : row.importStatus === "importing" ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-primary/10 text-primary font-bold text-xs">
                <Loader2 className="w-4 h-4 animate-spin" />
                Import...
              </span>
            ) : (
              <button
                type="button"
                disabled={isImportingBatch}
                onClick={() => onImportSingle(row)}
                className="px-3.5 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white font-bold text-xs sm:text-sm transition-all cursor-pointer"
              >
                Importer
              </button>
            )}
          </div>
        </div>

        {/* Barcode Sachet (X...) + Quantity & Price */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center"
        >
          <div className="sm:col-span-6 relative flex items-center">
            <Barcode
              className={`w-4 h-4 absolute left-3 ${
                row.internalBarcode ? "text-emerald-500" : "text-slate-400"
              }`}
            />
            <input
              type="text"
              value={row.internalBarcode}
              disabled={isImported}
              onFocus={() => onSelectRow(row.id)}
              onChange={(e) => onUpdateRow(row.id, { internalBarcode: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onBarcodeEnter(row.id, row.internalBarcode);
                }
              }}
              placeholder="Code sachet X130138209..."
              className={`w-full pl-9 pr-3 py-2 rounded-xl border font-mono text-sm font-bold outline-none transition-all ${
                row.internalBarcode
                  ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : isPairingActive
                  ? "border-amber-500 ring-2 ring-amber-500/20 bg-white dark:bg-slate-900"
                  : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80"
              }`}
            />
          </div>

          <div className="sm:col-span-3 flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 shrink-0">Qté:</span>
            <input
              type="number"
              min="1"
              value={row.quantity}
              disabled={isImported}
              onChange={(e) =>
                onUpdateRow(row.id, { quantity: Number(e.target.value) || 0 })
              }
              className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 font-mono font-bold text-sm"
            />
          </div>

          <div className="sm:col-span-3 flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 shrink-0">Prix:</span>
            <input
              type="number"
              step="any"
              min="0"
              value={row.unitPrice ?? ""}
              disabled={isImported}
              onChange={(e) =>
                onUpdateRow(row.id, {
                  unitPrice: e.target.value === "" ? null : Number(e.target.value)
                })
              }
              placeholder="0.00"
              title={lineTotal > 0 ? `Total ligne: €${lineTotal.toFixed(2)}` : undefined}
              className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 font-mono text-sm"
            />
          </div>
        </div>

        {/* Category, Package & Storage Box Selectors */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/80"
        >
          <select
            value={row.categoryId}
            disabled={isImported}
            onChange={(e) =>
              onUpdateRow(row.id, {
                categoryId: e.target.value,
                proposedCategory: undefined,
                proposedSubcategory: undefined
              })
            }
            className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs font-semibold truncate"
          >
            {row.proposedCategory && (
              <option value={row.categoryId}>
                [Nouveau] {row.proposedCategory}
                {row.proposedSubcategory ? ` - ${row.proposedSubcategory}` : ""}
              </option>
            )}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.subcategory ? ` - ${c.subcategory}` : ""}
              </option>
            ))}
          </select>

          <select
            value={row.packageId}
            disabled={isImported}
            onChange={(e) =>
              onUpdateRow(row.id, {
                packageId: e.target.value,
                proposedPackage: undefined
              })
            }
            className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs font-mono font-semibold truncate"
          >
            {row.proposedPackage && (
              <option value={row.packageId}>
                [Nouveau] {row.proposedPackage}
              </option>
            )}
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            value={row.locationId}
            disabled={isImported}
            onChange={(e) => onUpdateRow(row.id, { locationId: e.target.value })}
            className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs font-semibold truncate"
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.unique_id})
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }
);

interface LcscOrderImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: ComponentType[];
  setCategories: React.Dispatch<React.SetStateAction<ComponentType[]>>;
  packages: ComponentPackage[];
  setPackages: React.Dispatch<React.SetStateAction<ComponentPackage[]>>;
  locations: Box[];
  defaultLocationId: string;
  enableAiSuggestions: boolean;
  onImportComplete?: (importedCount: number) => void;
}

export const LcscOrderImportModal: React.FC<LcscOrderImportModalProps> = ({
  isOpen,
  onClose,
  categories,
  setCategories,
  packages,
  setPackages,
  locations,
  defaultLocationId,
  enableAiSuggestions,
  onImportComplete
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bagScannerInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "mapping" | "recap">("upload");
  const [fileName, setFileName] = useState<string>("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<LcscCsvColumnMapping>({
    lcscPartNumber: -1,
    mpn: -1,
    manufacturer: -1,
    pkg: -1,
    description: -1,
    quantity: -1,
    unitPrice: -1,
    extPrice: -1
  });

  const [useAi, setUseAi] = useState<boolean>(false);
  const [globalLocationId, setGlobalLocationId] = useState<string>(defaultLocationId || "");
  const [items, setItems] = useState<OrderImportItem[]>([]);

  const [isLookingUp, setIsLookingUp] = useState<boolean>(false);
  const [lookupProgress, setLookupProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0
  });

  const [isImportingBatch, setIsImportingBatch] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0
  });

  // Bag Barcode Pairing & Filter State
  const [activePairingRowId, setActivePairingRowId] = useState<string | null>(null);
  const [bagFilterQuery, setBagFilterQuery] = useState<string>("");
  const [scanStatusFilter, setScanStatusFilter] = useState<"all" | "unscanned" | "scanned">("all");
  const [bagBarcodeInput, setBagBarcodeInput] = useState<string>("");
  const [showBarcodeHelp, setShowBarcodeHelp] = useState<boolean>(false);

  // Batch Camera Modal (directly on device) & WebSocket Remote Phone Bridge
  const [showBatchCameraModal, setShowBatchCameraModal] = useState<boolean>(false);
  const [showRemotePhonePanel, setShowRemotePhonePanel] = useState<boolean>(false);
  const [lastScanFeedback, setLastScanFeedback] = useState<ScanFeedbackPayload | null>(null);

  const [scannerSessionId] = useState<string>(() => {
    try {
      const existing = localStorage.getItem(SCANNER_SESSION_KEY);
      if (existing && existing.length >= 4) return existing;
      const created = generateSessionId();
      localStorage.setItem(SCANNER_SESSION_KEY, created);
      return created;
    } catch {
      return generateSessionId();
    }
  });
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [connectedPhonesCount, setConnectedPhonesCount] = useState<number>(0);
  const [networkAddresses, setNetworkAddresses] = useState<NetworkAddressInfo[]>([]);
  const [serverHttpPort, setServerHttpPort] = useState<number>(3000);
  const [serverHttpsPort, setServerHttpsPort] = useState<number>(3001);
  const [selectedHostOrigin, setSelectedHostOrigin] = useState<string>(() => window.location.origin);
  const wsRef = useRef<WebSocket | null>(null);

  // Saved session in localStorage
  const [savedSessionMeta, setSavedSessionMeta] = useState<{
    fileName: string;
    savedAt: string;
    count: number;
    scannedCount: number;
  } | null>(null);

  useEffect(() => {
    if (defaultLocationId && !globalLocationId) {
      setGlobalLocationId(defaultLocationId);
    }
  }, [defaultLocationId, globalLocationId]);

  // Check for saved session in localStorage when modal opens
  useEffect(() => {
    if (!isOpen) return;
    try {
      const raw = localStorage.getItem(ORDER_IMPORT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedOrderSession;
        if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
          // Strip legacy heavy lcscInfo if present in older saved sessions
          setSavedSessionMeta({
            fileName: parsed.fileName || "Commande LCSC",
            savedAt: parsed.savedAt,
            count: parsed.items.length,
            scannedCount: parsed.items.filter((i) => i.internalBarcode.trim() !== "").length
          });
        } else {
          setSavedSessionMeta(null);
        }
      } else {
        setSavedSessionMeta(null);
      }
    } catch {
      setSavedSessionMeta(null);
    }
  }, [isOpen]);

  // Debounced auto-save to localStorage (only when NOT in the middle of batch lookup!)
  useEffect(() => {
    if (step !== "recap" || items.length === 0 || isLookingUp) return;

    const timer = window.setTimeout(() => {
      try {
        const payload: SavedOrderSession = {
          fileName: fileName || "Commande LCSC",
          savedAt: new Date().toISOString(),
          defaultLocationId: globalLocationId,
          useAi,
          items
        };
        localStorage.setItem(ORDER_IMPORT_STORAGE_KEY, JSON.stringify(payload));
      } catch (e) {
        console.warn("Failed to persist LCSC order import list in localStorage:", e);
      }
    }, 650);

    return () => clearTimeout(timer);
  }, [items, step, fileName, globalLocationId, useAi, isLookingUp]);

  const handleResumeSavedSession = () => {
    try {
      const raw = localStorage.getItem(ORDER_IMPORT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SavedOrderSession;
      if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
        const cleanedItems: OrderImportItem[] = parsed.items.map((it: any) => {
          const { lcscInfo, ...rest } = it;
          return {
            ...rest,
            thumbnailUrl: rest.thumbnailUrl || lcscInfo?.thumbnail || rest.imageUrls?.[0] || null
          };
        });
        setFileName(parsed.fileName || "Commande LCSC");
        setGlobalLocationId(parsed.defaultLocationId || defaultLocationId || "");
        setUseAi(Boolean(parsed.useAi));
        setItems(cleanedItems);
        setStep("recap");
        const firstUnscanned = cleanedItems.find(
          (i) => !i.internalBarcode.trim() && i.importStatus !== "imported"
        );
        if (firstUnscanned) {
          setActivePairingRowId(firstUnscanned.id);
        }
        toast.success(`Liste d'import "${parsed.fileName}" restaurée (${cleanedItems.length} composants)`);
      }
    } catch {
      toast.error("Impossible de charger la liste sauvegardée");
    }
  };

  const handleClearSavedSession = () => {
    localStorage.removeItem(ORDER_IMPORT_STORAGE_KEY);
    setSavedSessionMeta(null);
    toast.success("Liste d'import sauvegardée supprimée");
  };

  const handleSaveForLaterManual = () => {
    try {
      const payload: SavedOrderSession = {
        fileName: fileName || "Commande LCSC",
        savedAt: new Date().toISOString(),
        defaultLocationId: globalLocationId,
        useAi,
        items
      };
      localStorage.setItem(ORDER_IMPORT_STORAGE_KEY, JSON.stringify(payload));
      toast.success("Liste d'import sauvegardée dans le navigateur pour plus tard !");
    } catch {
      toast.error("Erreur lors de la sauvegarde dans le navigateur");
    }
  };

  const handleFileChange = async (file: File) => {
    try {
      const text = await file.text();
      const { headers, rows } = parseCsvText(text);
      if (headers.length === 0 || rows.length === 0) {
        toast.error("Le fichier CSV semble vide ou invalide.");
        return;
      }
      const detected = detectLcscCsvColumns(headers, rows);
      setFileName(file.name);
      setCsvHeaders(headers);
      setCsvRows(rows);
      setMapping(detected);
      setStep("mapping");
      toast.success(`${rows.length} lignes détectées dans ${file.name}`);
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la lecture du fichier CSV");
    }
  };

  const parsePriceNumber = (raw: string): number | null => {
    if (!raw) return null;
    const cleaned = raw.replace(/[^0-9.,-]/g, "").replace(",", ".");
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  };

  const handleStartBatchLookup = async () => {
    if (mapping.lcscPartNumber === -1 && mapping.mpn === -1) {
      toast.error("Veuillez sélectionner au moins la colonne LCSC Part Number ou MPN.");
      return;
    }

    const locId = globalLocationId || (locations[0] ? String(locations[0].id) : "");

    // Build initial items from CSV rows
    const initialItems: OrderImportItem[] = csvRows
      .map((row, idx) => {
        const rawLcsc = mapping.lcscPartNumber >= 0 ? row[mapping.lcscPartNumber] || "" : "";
        const lcscCode = normalizeLcscCode(rawLcsc);
        const rawMpn = mapping.mpn >= 0 ? row[mapping.mpn] || "" : "";
        const rawMfr = mapping.manufacturer >= 0 ? row[mapping.manufacturer] || "" : "";
        const rawPkg = mapping.pkg >= 0 ? row[mapping.pkg] || "" : "";
        const rawDesc = mapping.description >= 0 ? row[mapping.description] || "" : "";
        const rawQty = mapping.quantity >= 0 ? row[mapping.quantity] || "1" : "1";
        const rawPrice = mapping.unitPrice >= 0 ? row[mapping.unitPrice] || "" : "";

        const qty = Math.max(1, parseInt(rawQty.replace(/\D/g, ""), 10) || 1);
        const unitPrice = parsePriceNumber(rawPrice);
        const name = (rawMpn || lcscCode || `Component ${idx + 1}`).trim();

        const pkgMatch = matchPackageOption(packages, rawPkg);

        return {
          id: `row-${idx}-${lcscCode || name}`,
          selected: true,
          lcscPartNumber: lcscCode || rawLcsc.trim(),
          name,
          manufacturer: rawMfr.trim(),
          csvPackage: rawPkg.trim(),
          csvDescription: rawDesc.trim(),
          quantity: qty,
          unitPrice,
          internalBarcode: "",
          categoryId: categories[0] ? String(categories[0].id) : "",
          packageId: pkgMatch.matched
            ? String(pkgMatch.matched.id)
            : packages[0]
            ? String(packages[0].id)
            : "",
          proposedPackage: pkgMatch.proposedPackage,
          locationId: locId,
          description: rawDesc.trim(),
          keywords: [lcscCode, name, rawMfr.trim(), cleanPackageName(rawPkg), "LCSC"].filter(Boolean),
          url: lcscCode ? `https://www.lcsc.com/product-detail/${lcscCode}.html` : "",
          datasheetUrl: "",
          thumbnailUrl: null,
          imageUrls: [],
          lookupStatus: "loading" as const,
          importStatus: "ready" as const
        };
      })
      .filter((it) => it.lcscPartNumber || it.name);

    setItems(initialItems);
    if (initialItems.length > 0) {
      setActivePairingRowId(initialItems[0].id);
    }
    setStep("recap");
    setIsLookingUp(true);
    setLookupProgress({ current: 0, total: initialItems.length });

    let completed = 0;
    const currentCategories = [...categories];
    const currentPackages = [...packages];

    // Buffer resolved items and flush to React state at most once every 450ms to prevent UI freeze
    const resolvedMap = new Map<string, Partial<OrderImportItem>>();
    let lastFlushTime = Date.now();

    const flushResolvedToState = (force = false) => {
      const now = Date.now();
      if (!force && now - lastFlushTime < 450) return;
      if (resolvedMap.size === 0) return;
      lastFlushTime = now;

      const snapshot = new Map(resolvedMap);
      resolvedMap.clear();

      setLookupProgress({ current: completed, total: initialItems.length });
      setItems((prev) =>
        prev.map((r) => {
          const patch = snapshot.get(r.id);
          return patch ? { ...r, ...patch } : r;
        })
      );
    };

    const processRow = async (item: OrderImportItem) => {
      let lcscData: LcscComponentInfo | null = null;
      try {
        if (item.lcscPartNumber && /^C\d+$/i.test(item.lcscPartNumber)) {
          lcscData = await fetchLcscComponent(item.lcscPartNumber);
        }
      } catch (err) {
        console.warn(`[Order Import] LCSC lookup failed for ${item.lcscPartNumber}:`, err);
      }

      let resolvedDescription = lcscData ? formatLcscMarkdown(lcscData) : item.csvDescription;
      let resolvedKeywords = mergeKeywords(
        item.keywords,
        lcscData
          ? [
              lcscData.lcscPartNumber,
              lcscData.name,
              lcscData.manufacturer,
              cleanPackageName(lcscData.package),
              lcscData.subcategory
            ]
          : []
      );

      let catMatch = matchCategoryAndSubcategory(
        currentCategories,
        lcscData?.category,
        lcscData?.subcategory
      );
      let pkgMatch = matchPackageOption(
        currentPackages,
        lcscData?.package || item.csvPackage
      );

      if (useAi) {
        try {
          const contextLines = [
            `LCSC Part: ${item.lcscPartNumber}`,
            `MPN: ${lcscData?.name || item.name}`,
            `Manufacturer: ${lcscData?.manufacturer || item.manufacturer}`,
            `Package: ${lcscData?.package || item.csvPackage}`,
            `CSV Description: ${item.csvDescription}`,
            lcscData?.category
              ? `Distributor Category: ${lcscData.category} / ${lcscData.subcategory}`
              : "",
            lcscData?.parameters?.length
              ? `Specs: ${lcscData.parameters.map((p) => `${p.name}=${p.value}`).join(", ")}`
              : ""
          ]
            .filter(Boolean)
            .join("\n");

          const aiRes = await fetch("/api/ai-research", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: lcscData?.name || item.name,
              context: contextLines,
              categoriesInfo: buildCategoriesPromptInfo(currentCategories),
              packagesInfo: currentPackages.map((p) => p.name).join(", "),
              onlyClassification: Boolean(lcscData)
            })
          });

          if (aiRes.ok) {
            const aiData = await aiRes.json();
            if (aiData.category || aiData.subcategory) {
              catMatch = matchCategoryAndSubcategory(
                currentCategories,
                aiData.category,
                aiData.subcategory
              );
            }
            if (aiData.package) {
              pkgMatch = matchPackageOption(currentPackages, aiData.package);
            }
            if (Array.isArray(aiData.keywords)) {
              resolvedKeywords = mergeKeywords(resolvedKeywords, aiData.keywords);
            }
            if (!lcscData && aiData.description) {
              resolvedDescription = aiData.description;
            }
          }
        } catch (aiErr) {
          console.warn(`[Order Import] AI enrichment skipped for ${item.name}:`, aiErr);
        }
      }

      completed++;
      resolvedMap.set(item.id, {
        name: lcscData?.name || item.name,
        manufacturer: lcscData?.manufacturer || item.manufacturer,
        unitPrice: item.unitPrice ?? lcscData?.unitPrice ?? null,
        categoryId: catMatch.matched ? String(catMatch.matched.id) : item.categoryId,
        proposedCategory: catMatch.proposedCategory,
        proposedSubcategory: catMatch.proposedSubcategory,
        packageId: pkgMatch.matched ? String(pkgMatch.matched.id) : item.packageId,
        proposedPackage: pkgMatch.proposedPackage,
        description: resolvedDescription || item.description,
        keywords: resolvedKeywords,
        url: lcscData?.productUrl || item.url,
        datasheetUrl: lcscData?.officialDatasheetUrl || lcscData?.datasheetUrl || "",
        // Use lightweight preview thumbnail first to avoid decoding 48 2000x2000px images in RAM!
        thumbnailUrl: lcscData?.thumbnail || lcscData?.images?.[0] || null,
        imageUrls: lcscData?.images ? lcscData.images.slice(0, 5) : [],
        lookupStatus: "done"
      });

      flushResolvedToState(false);
    };

    const queue = [...initialItems];
    const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (next) await processRow(next);
      }
    });

    await Promise.all(workers);
    flushResolvedToState(true);
    setLookupProgress({ current: initialItems.length, total: initialItems.length });
    setIsLookingUp(false);
    toast.success(`Recherche LCSC terminée pour ${initialItems.length} composants !`);
  };

  // Filtered items when user types a C-code/MPN or filters by scanned/unscanned status
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (scanStatusFilter === "unscanned" && it.internalBarcode.trim() !== "") return false;
      if (scanStatusFilter === "scanned" && it.internalBarcode.trim() === "") return false;
      if (!bagFilterQuery.trim()) return true;
      const q = bagFilterQuery.trim().toLowerCase();
      return (
        it.lcscPartNumber.toLowerCase().includes(q) ||
        it.name.toLowerCase().includes(q) ||
        it.csvDescription.toLowerCase().includes(q) ||
        it.internalBarcode.toLowerCase().includes(q)
      );
    });
  }, [items, scanStatusFilter, bagFilterQuery]);

  const handleUpdateRow = useCallback((id: string, patch: Partial<OrderImportItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const handleSelectRow = useCallback((id: string) => {
    setActivePairingRowId(id);
  }, []);

  const handleBarcodeEnterOnCard = useCallback(
    (rowId: string, rawValue: string) => {
      const parsed = parseLcscBagScan(rawValue);
      const normalizedCode = parsed.internalBagBarcode || parsed.rawNormalized;
      setItems((prev) =>
        prev.map((it) => (it.id === rowId ? { ...it, internalBarcode: normalizedCode } : it))
      );
      const idx = filteredItems.findIndex((f) => f.id === rowId);
      const nextRow = filteredItems[idx + 1];
      if (nextRow) {
        setActivePairingRowId(nextRow.id);
      }
      const row = items.find((i) => i.id === rowId);
      toast.success(
        `Code sachet ${normalizedCode} enregistré pour ${row?.lcscPartNumber || ""}`
      );
    },
    [filteredItems, items]
  );

  // Handle scanning in the global Smart Bag Pairing Bar, Batch Camera, or WebSocket Phone
  const handleSmartBagScan = useCallback(
    (rawScan: string, explicitTargetRowId?: string | null) => {
      const parsed = parseLcscBagScan(rawScan);
      if (!parsed.rawNormalized) return;

      // Case 1: Scanned a 2D QR code containing BOTH pc (C11368) and pdi (X130138209)
      if (parsed.type === "lcsc_2d_qr" && parsed.lcscPartNumber) {
        const targetRow = items.find(
          (it) => it.lcscPartNumber.toUpperCase() === parsed.lcscPartNumber!.toUpperCase()
        );
        if (targetRow) {
          const barcodeToSet = parsed.internalBagBarcode || parsed.pickBatchNumber || "";
          const feedback: ScanFeedbackPayload = {
            id: `${Date.now()}`,
            rawCode: rawScan,
            assignedBarcode: barcodeToSet,
            lcscPartNumber: targetRow.lcscPartNumber,
            componentName: targetRow.name,
            mode: "2d_auto",
            timestamp: Date.now()
          };
          setLastScanFeedback(feedback);
          setItems((prev) => {
            const updated = prev.map((it) =>
              it.id === targetRow.id
                ? {
                    ...it,
                    internalBarcode: barcodeToSet || it.internalBarcode,
                    quantity: parsed.quantity || it.quantity
                  }
                : it
            );
            const nextUnassigned = updated.find(
              (it) => !it.internalBarcode.trim() && it.importStatus !== "imported"
            );
            setActivePairingRowId(nextUnassigned ? nextUnassigned.id : targetRow.id);
            return updated;
          });
          setBagBarcodeInput("");
          toast.success(
            `QR 2D décodé : ${parsed.lcscPartNumber} associé au code sachet ${barcodeToSet} !`
          );
          return;
        }
      }

      // Case 2: Scanned or typed an LCSC C-code (e.g. "C11368") -> select that row for the next 1D X... scan
      if (parsed.type === "lcsc_part_code" && parsed.lcscPartNumber) {
        const targetRow = items.find(
          (it) => it.lcscPartNumber.toUpperCase() === parsed.lcscPartNumber!.toUpperCase()
        );
        if (targetRow) {
          setActivePairingRowId(targetRow.id);
          setBagBarcodeInput("");
          toast.info(
            `Sachet ${targetRow.lcscPartNumber} (${targetRow.name}) sélectionné — scannez maintenant le code-barres X...`
          );
          bagScannerInputRef.current?.focus();
          return;
        } else {
          toast.error(`Aucun composant ${parsed.lcscPartNumber} trouvé dans cette commande.`);
          return;
        }
      }

      // Case 3: Scanned a 1D internal bag barcode (e.g. "X130138209") -> assign to active or first unassigned row
      const barcodeToAssign = parsed.internalBagBarcode || parsed.rawNormalized;
      const targetRow =
        (explicitTargetRowId ? items.find((it) => it.id === explicitTargetRowId) : null) ||
        (activePairingRowId ? items.find((it) => it.id === activePairingRowId) : null) ||
        filteredItems.find((it) => !it.internalBarcode.trim() && it.importStatus !== "imported") ||
        items.find((it) => !it.internalBarcode.trim() && it.importStatus !== "imported");

      if (!targetRow) {
        toast.error("Veuillez sélectionner un composant dans la liste pour lui associer ce code-barres.");
        return;
      }

      const feedback: ScanFeedbackPayload = {
        id: `${Date.now()}`,
        rawCode: rawScan,
        assignedBarcode: barcodeToAssign,
        lcscPartNumber: targetRow.lcscPartNumber,
        componentName: targetRow.name,
        mode: "1d_active",
        timestamp: Date.now()
      };
      setLastScanFeedback(feedback);

      setItems((prev) => {
        const updated = prev.map((it) =>
          it.id === targetRow.id ? { ...it, internalBarcode: barcodeToAssign } : it
        );
        const currentIndex = updated.findIndex((it) => it.id === targetRow.id);
        const nextUnassigned =
          updated
            .slice(currentIndex + 1)
            .find((it) => !it.internalBarcode.trim() && it.importStatus !== "imported") ||
          updated.find((it) => !it.internalBarcode.trim() && it.importStatus !== "imported");
        if (nextUnassigned) {
          setActivePairingRowId(nextUnassigned.id);
        }
        return updated;
      });

      setBagBarcodeInput("");
      toast.success(
        `Code sachet ${barcodeToAssign} associé à ${targetRow.lcscPartNumber} (${targetRow.name})`
      );
    },
    [items, activePairingRowId, filteredItems]
  );

  const handleSmartBagScanRef = useRef(handleSmartBagScan);
  useEffect(() => {
    handleSmartBagScanRef.current = handleSmartBagScan;
  }, [handleSmartBagScan]);

  // Keep latest state in a ref so when a phone sends request_sync we can push immediately
  const latestSyncDataRef = useRef<{
    items: OrderImportItem[];
    activePairingRowId: string | null;
    lastScanFeedback: ScanFeedbackPayload | null;
  }>({
    items,
    activePairingRowId,
    lastScanFeedback
  });

  useEffect(() => {
    latestSyncDataRef.current = { items, activePairingRowId, lastScanFeedback };
  }, [items, activePairingRowId, lastScanFeedback]);

  const sendImmediateSyncToWs = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const { items: currItems, activePairingRowId: currActive, lastScanFeedback: currFb } =
      latestSyncDataRef.current;
    const remoteItems: RemoteScanOrderItem[] = currItems.map((it) => ({
      id: it.id,
      lcscPartNumber: it.lcscPartNumber,
      name: it.name,
      manufacturer: it.manufacturer,
      csvPackage: it.csvPackage,
      quantity: it.quantity,
      internalBarcode: it.internalBarcode,
      thumbnailUrl: it.thumbnailUrl,
      importStatus: it.importStatus
    }));
    ws.send(
      JSON.stringify({
        type: "sync_state",
        mode: "lcsc_batch",
        items: remoteItems,
        activeRowId: currActive,
        lastFeedback: currFb
      })
    );
  }, []);

  // Fetch LAN / Tailscale IP addresses so QR code generated on localhost works on phone
  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/network-info")
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.addresses)) {
          setNetworkAddresses(data.addresses);
          const httpP = Number(data.port) || 3000;
          const httpsP = Number(data.httpsPort) || httpP + 1;
          setServerHttpPort(httpP);
          setServerHttpsPort(httpsP);

          const isLocalhost =
            window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
          if (isLocalhost && data.addresses.length > 0) {
            // Default to HTTPS on port 3001 so the mobile browser immediately unlocks camera stream!
            setSelectedHostOrigin(`https://${data.addresses[0].ip}:${httpsP}`);
          } else {
            setSelectedHostOrigin(window.location.origin);
          }
        }
      })
      .catch(() => {});
  }, [isOpen]);

  // Connect PC to WebSocket Scanner Room when modal is open
  useEffect(() => {
    if (!isOpen) return;
    let reconnectTimer: number | null = null;
    let closedIntentionally = false;

    const connect = () => {
      try {
        const ws = new WebSocket(buildWsUrl(scannerSessionId, "pc"));
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
          sendImmediateSyncToWs();
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(String(event.data));
            switch (msg.type) {
              case "presence":
              case "init_state": {
                if (typeof msg.phoneCount === "number") {
                  setConnectedPhonesCount(msg.phoneCount);
                }
                break;
              }
              case "request_sync": {
                if (typeof msg.phoneCount === "number") {
                  setConnectedPhonesCount(msg.phoneCount);
                }
                sendImmediateSyncToWs();
                break;
              }
              case "item_selected": {
                if (msg.activeRowId !== undefined) {
                  setActivePairingRowId(msg.activeRowId);
                }
                break;
              }
              case "remote_scan": {
                if (msg.rawCode) {
                  playScanFeedbackSound("success");
                  handleSmartBagScanRef.current(msg.rawCode, msg.targetRowId);
                }
                break;
              }
              case "clear_item_barcode": {
                if (msg.rowId) {
                  setItems((prev) =>
                    prev.map((it) => (it.id === msg.rowId ? { ...it, internalBarcode: "" } : it))
                  );
                  setActivePairingRowId(msg.rowId);
                }
                break;
              }
            }
          } catch (err) {
            console.error("WS PC message error:", err);
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          if (!closedIntentionally) {
            reconnectTimer = window.setTimeout(connect, 2000);
          }
        };
      } catch (e) {
        console.error("Failed to open WS on PC:", e);
      }
    };

    connect();

    return () => {
      closedIntentionally = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isOpen, scannerSessionId, sendImmediateSyncToWs]);

  // Debounced broadcast of current items & activePairingRowId to connected phone
  useEffect(() => {
    if (!wsConnected || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    // Avoid broadcasting intermediate lookup progress ticks while batch lookup is running
    if (isLookingUp && items.some((it) => it.lookupStatus === "done")) return;

    const timer = window.setTimeout(() => {
      sendImmediateSyncToWs();
    }, 180);

    return () => clearTimeout(timer);
  }, [items, activePairingRowId, lastScanFeedback, wsConnected, isLookingUp, sendImmediateSyncToWs]);

  // Import a single row or a batch of rows into Directus
  const importItemsToDirectus = useCallback(
    async (rowsToImport: OrderImportItem[]) => {
      if (rowsToImport.length === 0) {
        toast.error("Aucun composant sélectionné à importer.");
        return;
      }

      setIsImportingBatch(true);
      setImportProgress({ current: 0, total: rowsToImport.length });
      const toastId = toast.loading(
        `Importation de ${rowsToImport.length} composant(s) dans l'inventaire...`
      );

      let importedCount = 0;
      let localCategories = [...categories];
      let localPackages = [...packages];

      for (let i = 0; i < rowsToImport.length; i++) {
        const row = rowsToImport[i];
        setImportProgress({ current: i + 1, total: rowsToImport.length });
        setItems((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, importStatus: "importing" } : r))
        );

        try {
          // 1. Ensure Category exists
          let finalCategoryId = row.categoryId ? Number(row.categoryId) : null;
          if (row.proposedCategory) {
            const existingCat = matchCategoryAndSubcategory(
              localCategories,
              row.proposedCategory,
              row.proposedSubcategory
            );
            if (existingCat.matched) {
              finalCategoryId = existingCat.matched.id;
            } else {
              try {
                const createdCat = (await directus.request(
                  createItem("components_types", {
                    name: row.proposedCategory,
                    subcategory: row.proposedSubcategory || ""
                  })
                )) as ComponentType;
                localCategories = [...localCategories, createdCat];
                setCategories(localCategories);
                finalCategoryId = createdCat.id;
              } catch {
                // Fallback to selected categoryId
              }
            }
          }

          // 2. Ensure Package exists
          let finalPackageId = row.packageId ? Number(row.packageId) : null;
          if (row.proposedPackage) {
            const existingPkg = matchPackageOption(localPackages, row.proposedPackage);
            if (existingPkg.matched) {
              finalPackageId = existingPkg.matched.id;
            } else {
              try {
                const createdPkg = (await directus.request(
                  createItem("components_packages", {
                    name: row.proposedPackage
                  })
                )) as ComponentPackage;
                localPackages = [...localPackages, createdPkg];
                setPackages(localPackages);
                finalPackageId = createdPkg.id;
              } catch {
                // Fallback to selected packageId
              }
            }
          }

          // 3. Download & Upload LCSC Assets (Main Image, PDF Datasheet, Extra Photos)
          let uploadedMainImageId: string | null = null;
          let uploadedDatasheetId: string | null = null;
          const uploadedExtraImageIds: string[] = [];

          if (row.imageUrls.length > 0 || row.thumbnailUrl || row.datasheetUrl) {
            const assetInput: LcscComponentInfo = {
              lcscPartNumber: row.lcscPartNumber,
              name: row.name,
              manufacturer: row.manufacturer,
              manufacturerPartNumber: row.name,
              package: row.csvPackage,
              category: "",
              subcategory: "",
              summary: "",
              description: row.description,
              datasheetUrl: row.datasheetUrl,
              officialDatasheetUrl: row.datasheetUrl,
              stock: row.quantity,
              unitPrice: row.unitPrice,
              priceTiers: [],
              images: row.imageUrls,
              thumbnail: row.thumbnailUrl,
              parameters: [],
              rohs: true,
              productUrl: row.url
            };

            const assets = await fetchLcscAssetsAsFiles(assetInput);
            if (assets.mainImage) {
              const fd = new FormData();
              fd.append("file", assets.mainImage);
              const res = await directus.request(uploadFiles(fd));
              uploadedMainImageId = (res as any).id;
            }
            if (assets.datasheet) {
              const fd = new FormData();
              fd.append("file", assets.datasheet);
              const res = await directus.request(uploadFiles(fd));
              uploadedDatasheetId = (res as any).id;
            }
            for (const extraImg of assets.additionalImages) {
              const fd = new FormData();
              fd.append("file", extraImg);
              const res = await directus.request(uploadFiles(fd));
              if ((res as any)?.id) {
                uploadedExtraImageIds.push((res as any).id);
              }
            }
          }

          // 4. Create Component in Directus
          const componentPayload: any = {
            name: row.name,
            description:
              row.description || row.csvDescription || `${row.name} (${row.lcscPartNumber})`,
            quantity_available: Number(row.quantity) || 0,
            price:
              row.unitPrice !== null && !isNaN(Number(row.unitPrice))
                ? Number(row.unitPrice)
                : null,
            location: row.locationId || globalLocationId || null,
            url: row.url || row.datasheetUrl || null,
            keywords: row.keywords,
            packet_reference: row.lcscPartNumber || row.name,
            package: finalPackageId,
            type: finalCategoryId,
            barcode: row.internalBarcode.trim() || null
          };

          if (uploadedMainImageId) {
            componentPayload.main_image = uploadedMainImageId;
          }
          if (uploadedDatasheetId) {
            componentPayload.datasheet = uploadedDatasheetId;
          }

          const createdRes = await directus.request(createItem("components", componentPayload));
          const newComponentId = (createdRes as any)?.id;

          if (newComponentId && uploadedExtraImageIds.length > 0) {
            for (const fileId of uploadedExtraImageIds) {
              await directus.request(
                createItem("components_files", {
                  components_id: Number(newComponentId),
                  directus_files_id: fileId
                })
              );
            }
          }

          importedCount++;
          setItems((prev) =>
            prev.map((r) =>
              r.id === row.id ? { ...r, importStatus: "imported", selected: false } : r
            )
          );
        } catch (err: any) {
          console.error(`[Order Import] Failed to import ${row.name}:`, err);
          setItems((prev) =>
            prev.map((r) =>
              r.id === row.id
                ? {
                    ...r,
                    importStatus: "error",
                    errorMessage: err.message || "Erreur d'import"
                  }
                : r
            )
          );
        }
      }

      setIsImportingBatch(false);
      if (importedCount > 0) {
        toast.success(`${importedCount} composant(s) importé(s) avec succès !`, { id: toastId });
        onImportComplete?.(importedCount);
      } else {
        toast.error("Aucun composant n'a pu être importé.", { id: toastId });
      }
    },
    [categories, packages, globalLocationId, setCategories, setPackages, onImportComplete]
  );

  const handleImportSingleRow = useCallback(
    (row: OrderImportItem) => {
      importItemsToDirectus([row]);
    },
    [importItemsToDirectus]
  );

  const activePairingRow = items.find((i) => i.id === activePairingRowId);
  const selectedReadyItems = items.filter((i) => i.selected && i.importStatus !== "imported");
  const scannedReadyItems = items.filter(
    (i) => i.internalBarcode.trim() !== "" && i.importStatus !== "imported"
  );
  const totalOrderCost = items.reduce(
    (acc, it) => acc + (Number(it.unitPrice) || 0) * (Number(it.quantity) || 0),
    0
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 w-screen h-screen bg-white dark:bg-slate-950 flex flex-col overflow-hidden animate-in fade-in duration-150">
      {/* Full-Screen Header */}
      <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/90 dark:bg-slate-900/80 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base sm:text-xl font-extrabold text-slate-900 dark:text-white truncate">
                Importation de commande LCSC (CSV)
              </h3>
              {fileName && (
                <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-primary/10 text-primary border border-primary/20 truncate max-w-[220px] sm:max-w-xs">
                  {fileName}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 hidden sm:block">
              Détection des colonnes, récupération des fiches LCSC et association des codes-barres sachets (X...)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {step === "recap" && (
            <button
              type="button"
              onClick={handleSaveForLaterManual}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white text-xs sm:text-sm font-bold border border-emerald-500/25 transition-all cursor-pointer"
              title="Sauvegarder cette liste dans le navigateur pour continuer plus tard"
            >
              <Save className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Sauvegarder pour plus tard</span>
              <span className="sm:hidden">Sauvegarder</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-xl bg-slate-200/70 dark:bg-slate-800 hover:bg-slate-300/70 dark:hover:bg-slate-700 text-xs sm:text-sm font-bold transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span className="hidden xs:inline">Fermer</span>
          </button>
        </div>
      </div>

      {/* Main Content Area (single natural vertical scroll, no nested scrollbars or horizontal tables) */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-6">
        {/* STEP 1: UPLOAD CSV OR RESUME SAVED SESSION */}
        {step === "upload" && (
          <div className="max-w-4xl mx-auto w-full space-y-6 py-4 sm:py-8">
            {savedSessionMeta && (
              <div className="p-5 sm:p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <FolderOpen className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      Liste d'import sauvegardée dans le navigateur
                    </span>
                    <h4 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                      {savedSessionMeta.fileName}
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                      {savedSessionMeta.count} composants • {savedSessionMeta.scannedCount} sachet(s) X... associé(s) • Sauvegardé le{" "}
                      {new Date(savedSessionMeta.savedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={handleResumeSavedSession}
                    className="px-5 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:brightness-110 transition-all flex items-center gap-2 shadow-md cursor-pointer"
                  >
                    <FolderOpen className="w-4 h-4" />
                    <span>Reprendre la liste</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSavedSession}
                    className="p-3 rounded-xl bg-white dark:bg-slate-800 text-slate-500 hover:text-red-500 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                    title="Supprimer la sauvegarde"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileChange(e.dataTransfer.files[0]);
                }
              }}
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-primary bg-slate-50/70 dark:bg-slate-900/50 hover:bg-primary/5 rounded-2xl p-8 sm:p-16 text-center transition-all cursor-pointer group"
            >
              <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-5 group-hover:scale-105 transition-transform">
                <UploadCloud className="w-8 h-8" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 dark:text-white">
                Sélectionnez ou glissez votre fichier CSV de commande LCSC
              </h4>
              <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-2 max-w-xl mx-auto">
                Compatible avec les exports de commandes LCSC (ex: <code className="font-mono text-sm">LCSC__WM2610220039_....csv</code>) et les fichiers BOM CSV.
              </p>
              <span className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Choisir un fichier .CSV</span>
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* STEP 2: CSV PREVIEW & COLUMN MAPPING (CARDS) */}
        {step === "mapping" && (
          <div className="max-w-7xl mx-auto w-full space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Column Mapping Selectors */}
              <div className="lg:col-span-2 bg-slate-50 dark:bg-slate-900/60 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-base font-bold text-slate-900 dark:text-white">
                      1. Détection automatique des colonnes CSV
                    </h4>
                    <p className="text-sm text-slate-500">
                      Vérifiez ou ajustez les colonnes associées à chaque champ
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep("upload")}
                    className="text-sm font-semibold text-primary hover:underline cursor-pointer"
                  >
                    Changer de fichier CSV
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    {
                      key: "lcscPartNumber" as const,
                      label: "LCSC Part Number (Packet Ref) *",
                      desc: "ex: C2988369"
                    },
                    {
                      key: "mpn" as const,
                      label: "Nom / Manufacture Part # *",
                      desc: "ex: GT-USB-7010ASV"
                    },
                    {
                      key: "unitPrice" as const,
                      label: "Prix Unitaire (Unit Price)",
                      desc: "ex: 0.0777"
                    },
                    {
                      key: "quantity" as const,
                      label: "Quantité commandée",
                      desc: "ex: 5"
                    },
                    {
                      key: "pkg" as const,
                      label: "Package / Empreinte",
                      desc: "ex: 0805, SOT23-3L"
                    },
                    {
                      key: "description" as const,
                      label: "Description CSV",
                      desc: "Description brute"
                    },
                    {
                      key: "manufacturer" as const,
                      label: "Fabricant (Manufacturer)",
                      desc: "ex: Samsung, TI"
                    }
                  ].map((field) => (
                    <div key={field.key} className="flex flex-col gap-1.5">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        {field.label}
                      </label>
                      <select
                        value={mapping[field.key]}
                        onChange={(e) =>
                          setMapping((prev) => ({
                            ...prev,
                            [field.key]: Number(e.target.value)
                          }))
                        }
                        className={`h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-900 dark:text-white ${focusClasses}`}
                      >
                        <option value={-1}>-- Ignorer / Non présent --</option>
                        {csvHeaders.map((h, i) => (
                          <option key={i} value={i}>
                            Col {i + 1}: {h || `(Colonne ${i + 1})`}
                          </option>
                        ))}
                      </select>
                      <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {mapping[field.key] >= 0 && csvRows[0]
                          ? `Aperçu: "${csvRows[0][mapping[field.key]] || ""}"`
                          : field.desc}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Options: AI Generation & Default Storage Box */}
              <div className="bg-slate-50 dark:bg-slate-900/60 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-5">
                <div className="space-y-4">
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">
                    2. Options d'importation
                  </h4>

                  {/* Default Storage Location */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-primary" />
                      Emplacement de stockage par défaut
                    </label>
                    <select
                      value={globalLocationId}
                      onChange={(e) => setGlobalLocationId(e.target.value)}
                      className={`h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-900 dark:text-white ${focusClasses}`}
                    >
                      <option value="">-- Sélectionner une boîte --</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name} ({loc.unique_id})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* AI Toggle */}
                  {enableAiSuggestions && (
                    <label className="flex items-start gap-3 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer hover:border-primary transition-colors">
                      <input
                        type="checkbox"
                        checked={useAi}
                        onChange={(e) => setUseAi(e.target.checked)}
                        className="mt-1 w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      <div className="text-sm">
                        <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-primary shrink-0" />
                          Activer l'IA (Catégories, Boîtiers & Mots-clés)
                        </span>
                        <p className="text-xs text-slate-500 mt-1">
                          Utilise Gemini pour classer automatiquement chaque composant et enrichir les mots-clés.
                        </p>
                      </div>
                    </label>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleStartBatchLookup}
                  className="w-full py-3.5 px-4 rounded-xl bg-primary text-white text-sm sm:text-base font-bold shadow-lg shadow-primary/20 hover:brightness-110 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Search className="w-4 h-4 shrink-0" />
                  <span>Rechercher les {csvRows.length} composants sur LCSC</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              </div>
            </div>

            {/* CSV Preview as Responsive Cards */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-500">
                  Aperçu en cartes des lignes CSV détectées ({csvRows.length} composants)
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {csvRows.slice(0, 24).map((row, rIdx) => {
                  const lcscVal =
                    mapping.lcscPartNumber >= 0 ? row[mapping.lcscPartNumber] || "" : "";
                  const mpnVal = mapping.mpn >= 0 ? row[mapping.mpn] || "" : "";
                  const qtyVal = mapping.quantity >= 0 ? row[mapping.quantity] || "" : "";
                  const priceVal = mapping.unitPrice >= 0 ? row[mapping.unitPrice] || "" : "";
                  const pkgVal = mapping.pkg >= 0 ? row[mapping.pkg] || "" : "";
                  const mfrVal = mapping.manufacturer >= 0 ? row[mapping.manufacturer] || "" : "";
                  const descVal = mapping.description >= 0 ? row[mapping.description] || "" : "";

                  return (
                    <div
                      key={rIdx}
                      className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-2.5"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2.5 py-0.5 rounded-md bg-primary/10 text-primary font-mono font-extrabold text-xs">
                            {lcscVal || `Ligne #${rIdx + 1}`}
                          </span>
                          {qtyVal && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-xs font-bold">
                              Qté: {qtyVal}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white break-words">
                          {mpnVal || "Nom non défini"}
                        </p>
                        {descVal && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                            {descVal}
                          </p>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono truncate max-w-[140px]">
                          {pkgVal || mfrVal || "—"}
                        </span>
                        {priceVal && (
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {priceVal}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {csvRows.length > 24 && (
                <p className="text-xs text-center text-slate-500">
                  + {csvRows.length - 24} autres composants prêts à être recherchés sur LCSC
                </p>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: RECAP CARDS & BAG BARCODE PAIRING */}
        {step === "recap" && (
          <div className="space-y-4">
            {/* Lookup Progress Bar */}
            {isLookingUp && (
              <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 space-y-2">
                <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-primary">
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>Récupération des fiches techniques, photos et datasheets LCSC...</span>
                  </span>
                  <span className="font-mono">
                    {lookupProgress.current} / {lookupProgress.total}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{
                      width: `${
                        lookupProgress.total > 0
                          ? (lookupProgress.current / lookupProgress.total) * 100
                          : 0
                      }%`
                    }}
                  />
                </div>
              </div>
            )}

            {/* Smart Bag Barcode Pairing Station (X130138209 <-> C11368) */}
            <div className="p-4 rounded-2xl bg-slate-900 text-white border border-slate-800 shadow-md space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-xl bg-primary text-white shrink-0">
                    <Barcode className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm sm:text-base font-bold">
                        Association des sachets LCSC
                      </h4>
                      <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Packet Ref = C... • Barcode = X...
                      </span>
                      {connectedPhonesCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-0.5 rounded-md bg-emerald-500 text-slate-950 font-extrabold">
                          <Wifi className="w-3.5 h-3.5" />
                          <span>{connectedPhonesCount} téléphone(s) connecté(s)</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons: Batch Camera, Remote Phone WebSocket, Help */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBatchCameraModal(true)}
                    className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:brightness-110 shadow-sm transition-all cursor-pointer"
                    title="Ouvrir la caméra en mode Batch avec sélection de l'objectif et liste des composants restants"
                  >
                    <Camera className="w-4 h-4 shrink-0" />
                    <span>Caméra Batch (cet appareil)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowRemotePhonePanel((v) => !v)}
                    className={`text-xs sm:text-sm font-bold flex items-center gap-1.5 px-3.5 py-2 rounded-xl border transition-all cursor-pointer ${
                      showRemotePhonePanel || connectedPhonesCount > 0
                        ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm"
                        : "bg-slate-800 hover:bg-slate-700 text-emerald-300 border-emerald-500/40"
                    }`}
                    title="Utiliser la caméra de votre téléphone pour scanner en direct vers ce PC via WebSocket"
                  >
                    <Smartphone className="w-4 h-4 shrink-0" />
                    <span>
                      {connectedPhonesCount > 0
                        ? `Téléphone lié (${connectedPhonesCount})`
                        : "Scanner avec Téléphone (WebSocket)"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowBarcodeHelp((v) => !v)}
                    className="text-xs sm:text-sm text-slate-300 hover:text-white flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 cursor-pointer"
                  >
                    <HelpCircle className="w-4 h-4 text-primary shrink-0" />
                    <span className="hidden sm:inline">Aide codes sachets</span>
                  </button>
                </div>
              </div>

              {/* WebSocket PC <-> Phone Pairing Panel */}
              {showRemotePhonePanel && (
                <div className="p-4 rounded-xl bg-slate-950/95 border border-emerald-500/40 flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in duration-150">
                  <div className="space-y-2.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5">
                        <QrCode className="w-4 h-4" />
                        <span>Pont WebSocket Temps Réel PC - Téléphone</span>
                      </span>
                      <span className="font-mono text-xs sm:text-sm text-slate-400">
                        Session : <strong className="text-white">{scannerSessionId}</strong>
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                      Scannez ce QR Code avec le <strong>bouton Scan de l'application sur votre téléphone</strong> (ou l'appareil photo du téléphone) pour ouvrir la <strong>Station Caméra Batch Mobile</strong>. La liste des composants restants à scanner s'affichera directement sur le téléphone et chaque scan mettra à jour votre PC en temps réel.
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <label className="text-xs font-bold text-slate-400 uppercase">
                        Adresse réseau du PC :
                      </label>
                      <select
                        value={selectedHostOrigin}
                        onChange={(e) => setSelectedHostOrigin(e.target.value)}
                        className="h-9 px-3 rounded-xl bg-slate-800 border border-slate-700 text-xs sm:text-sm font-mono text-white outline-none focus:border-emerald-400"
                      >
                        <option value={window.location.origin}>
                          {window.location.origin} (URL actuelle)
                        </option>
                        {networkAddresses.map((addr) => {
                          const httpsOrigin = `https://${addr.ip}:${serverHttpsPort}`;
                          const httpOrigin = `http://${addr.ip}:${serverHttpPort}`;
                          return (
                            <React.Fragment key={addr.ip}>
                              <option value={httpsOrigin}>
                                {httpsOrigin} (Caméra flux direct • HTTPS recommandé • {addr.name})
                              </option>
                              <option value={httpOrigin}>
                                {httpOrigin} (HTTP standard • {addr.name})
                              </option>
                            </React.Fragment>
                          );
                        })}
                      </select>

                      <button
                        type="button"
                        onClick={() => {
                          const remoteUrl = `${selectedHostOrigin}/remote-scan?session=${scannerSessionId}`;
                          navigator.clipboard?.writeText(remoteUrl);
                          toast.success("Lien du scanner mobile copié dans le presse-papiers !");
                        }}
                        className="h-9 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs sm:text-sm font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copier le lien</span>
                      </button>
                    </div>

                    <div className="text-xs font-mono text-emerald-400 break-all">
                      {`${selectedHostOrigin}/remote-scan?session=${scannerSessionId}`}
                    </div>
                  </div>

                  <div className="p-2.5 bg-white rounded-xl shadow-lg shrink-0 flex flex-col items-center gap-1">
                    <img
                      src={generateQrDataUrl(
                        `${selectedHostOrigin}/remote-scan?session=${scannerSessionId}`
                      )}
                      alt="QR Code Scanner Mobile WebSocket"
                      className="w-32 h-32 object-contain"
                    />
                    <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">
                      Scanner depuis le mobile
                    </span>
                  </div>
                </div>
              )}

              {showBarcodeHelp && (
                <div className="p-3.5 rounded-xl bg-slate-800/90 border border-slate-700 text-xs sm:text-sm text-slate-300 space-y-1.5">
                  <p className="font-bold text-white">
                    Fonctionnement des étiquettes de sachets LCSC (ex: <code className="text-primary">C11368</code> et <code className="text-amber-300">X130138209</code>) :
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>
                      <strong>Code 1D (<code className="text-amber-300">X130138209</code>) :</strong> Identifiant séquentiel de colisage (<code className="text-emerald-300">pdi</code>) propre à votre sachet physique.
                    </li>
                    <li>
                      <strong>QR Code 2D du sachet :</strong> Contient à la fois <code className="text-primary">pc:C11368</code> et <code className="text-amber-300">pdi:130138209</code>. Un seul scan 2D associe automatiquement la référence LCSC et le code sachet <code className="text-amber-300">X...</code>.
                    </li>
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
                {/* Quick Filter by C-code */}
                <div className="md:col-span-4 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={bagFilterQuery}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBagFilterQuery(val);
                      const match = items.find(
                        (it) =>
                          it.lcscPartNumber.toLowerCase().includes(val.trim().toLowerCase()) ||
                          it.name.toLowerCase().includes(val.trim().toLowerCase())
                      );
                      if (match) setActivePairingRowId(match.id);
                    }}
                    placeholder="1. Filtrer réf. C... ou nom..."
                    className="w-full h-10 pl-10 pr-8 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white placeholder:text-slate-400 focus:border-primary outline-none font-mono"
                  />
                  {bagFilterQuery && (
                    <button
                      type="button"
                      onClick={() => setBagFilterQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Active Component Indicator */}
                <div className="md:col-span-4 px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-between gap-2 min-h-[40px]">
                  {activePairingRow ? (
                    <div className="truncate text-sm">
                      <span className="text-slate-400 mr-1.5">Sachet actif :</span>
                      <span className="font-bold text-primary font-mono">
                        {activePairingRow.lcscPartNumber}
                      </span>{" "}
                      <span className="font-semibold text-white truncate">
                        — {activePairingRow.name} (x{activePairingRow.quantity})
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-slate-400">
                      Sélectionnez une carte ci-dessous
                    </span>
                  )}
                </div>

                {/* Scanner Input for X... or 2D QR */}
                <div className="md:col-span-4 relative flex items-center gap-2">
                  <div className="relative flex-1">
                    <Barcode className="w-4 h-4 text-amber-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      ref={bagScannerInputRef}
                      type="text"
                      value={bagBarcodeInput}
                      onChange={(e) => setBagBarcodeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSmartBagScan(bagBarcodeInput);
                        }
                      }}
                      placeholder="2. Scanner X130138209 + Entrée..."
                      className="w-full h-10 pl-10 pr-3 rounded-xl bg-amber-500/10 border border-amber-500/40 text-sm text-amber-200 placeholder:text-amber-300/60 focus:border-amber-400 outline-none font-mono font-bold"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSmartBagScan(bagBarcodeInput)}
                    disabled={!bagBarcodeInput.trim()}
                    className="h-10 px-4 rounded-xl bg-amber-500 text-slate-950 text-sm font-extrabold hover:brightness-110 disabled:opacity-40 transition-all cursor-pointer shrink-0"
                  >
                    Associer
                  </button>
                </div>
              </div>
            </div>

            {/* Recap Toolbar with Select All & Filter Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                {/* Select All Checkbox Pill */}
                <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-bold text-slate-700 dark:text-slate-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={
                      selectedReadyItems.length > 0 &&
                      selectedReadyItems.length ===
                        items.filter((i) => i.importStatus !== "imported").length
                    }
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setItems((prev) =>
                        prev.map((it) =>
                          it.importStatus === "imported" ? it : { ...it, selected: checked }
                        )
                      );
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <span>Tout sélectionner ({selectedReadyItems.length})</span>
                </label>

                <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setScanStatusFilter("all")}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      scanStatusFilter === "all"
                        ? "bg-primary text-white shadow-sm"
                        : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    Tous ({items.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setScanStatusFilter("unscanned")}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      scanStatusFilter === "unscanned"
                        ? "bg-amber-500 text-slate-950 shadow-sm"
                        : "text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                    }`}
                  >
                    <CircleDashed className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Non scannés ({items.filter((i) => !i.internalBarcode.trim()).length})
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScanStatusFilter("scanned")}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      scanStatusFilter === "scanned"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Associés ({items.filter((i) => i.internalBarcode.trim() !== "").length})
                    </span>
                  </button>
                </div>

                <span className="px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-mono font-bold border border-emerald-500/20">
                  Total commande : €{totalOrderCost.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep("mapping")}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs sm:text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Modifier colonnes CSV
                </button>
              </div>
            </div>

            {/* MEMOIZED RESPONSIVE COMPONENT CARDS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 pb-4">
              {filteredItems.map((row) => (
                <OrderImportCard
                  key={row.id}
                  row={row}
                  isPairingActive={activePairingRowId === row.id}
                  isImportingBatch={isImportingBatch}
                  categories={categories}
                  packages={packages}
                  locations={locations}
                  onSelectRow={handleSelectRow}
                  onUpdateRow={handleUpdateRow}
                  onBarcodeEnter={handleBarcodeEnterOnCard}
                  onImportSingle={handleImportSingleRow}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Full-Screen Footer */}
      <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="text-xs sm:text-sm text-slate-500 hidden md:block">
          {step === "recap" && (
            <span>
              Sauvegarde automatique active dans le navigateur — vous pouvez fermer et reprendre à tout moment.
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 w-full md:w-auto">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs sm:text-sm font-bold hover:bg-slate-300/70 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            Fermer
          </button>

          {step === "recap" && scannedReadyItems.length > 0 && (
            <button
              type="button"
              disabled={isImportingBatch}
              onClick={() => importItemsToDirectus(scannedReadyItems)}
              className="px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 text-xs sm:text-sm font-extrabold hover:brightness-110 transition-all flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
            >
              <Barcode className="w-4 h-4 shrink-0" />
              <span>Importer les sachets scannés ({scannedReadyItems.length})</span>
            </button>
          )}

          {step === "recap" && (
            <button
              type="button"
              disabled={isImportingBatch || selectedReadyItems.length === 0}
              onClick={() => importItemsToDirectus(selectedReadyItems)}
              className="px-5 py-2.5 rounded-xl bg-primary text-white text-xs sm:text-sm font-extrabold shadow-lg shadow-primary/20 hover:brightness-110 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isImportingBatch ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>
                    Importation ({importProgress.current}/{importProgress.total})...
                  </span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 shrink-0" />
                  <span>Importer la sélection ({selectedReadyItems.length} composants)</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Full-Screen Batch Camera Scanner Modal */}
      {showBatchCameraModal && (
        <div className="fixed inset-0 z-[10000] bg-slate-950 flex flex-col animate-in fade-in duration-150">
          <MobileBatchBagScanner
            items={items.map((it) => ({
              id: it.id,
              lcscPartNumber: it.lcscPartNumber,
              name: it.name,
              manufacturer: it.manufacturer,
              csvPackage: it.csvPackage,
              quantity: it.quantity,
              internalBarcode: it.internalBarcode,
              thumbnailUrl: it.thumbnailUrl,
              importStatus: it.importStatus
            }))}
            activeRowId={activePairingRowId}
            lastFeedback={lastScanFeedback}
            onSelectRow={(rowId) => setActivePairingRowId(rowId)}
            onScanCode={(rawCode, targetRowId) => handleSmartBagScan(rawCode, targetRowId)}
            onClearBarcode={(rowId) => {
              setItems((prev) =>
                prev.map((it) => (it.id === rowId ? { ...it, internalBarcode: "" } : it))
              );
              setActivePairingRowId(rowId);
            }}
            onClose={() => setShowBatchCameraModal(false)}
            isRemoteMode={false}
          />
        </div>
      )}
    </div>
  );
};
