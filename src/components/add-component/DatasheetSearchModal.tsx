import React, { useState, useEffect } from "react";
import {
  Search,
  X,
  FileText,
  Download,
  ExternalLink,
  Cpu,
  CheckCircle2,
  Loader2,
  Link2,
  Sparkles,
  Package as PackageIcon,
  Layers
} from "lucide-react";
import { LcscComponentInfo, searchPartCatalog, normalizeLcscCode, fetchLcscComponent } from "../../lib/lcsc";
import { focusClasses } from "./types";

interface DatasheetSearchModalProps {
  isOpen: boolean;
  initialQuery: string;
  onClose: () => void;
  onSelectPart: (part: LcscComponentInfo, mode: "full" | "datasheet_only") => Promise<void>;
  onManualDatasheetUrl: (url: string) => Promise<void>;
}

export const DatasheetSearchModal: React.FC<DatasheetSearchModalProps> = ({
  isOpen,
  initialQuery,
  onClose,
  onSelectPart,
  onManualDatasheetUrl
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<LcscComponentInfo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [applyingPartId, setApplyingPartId] = useState<string | null>(null);

  // Manual fallback state
  const [manualPdfUrl, setManualPdfUrl] = useState("");
  const [isApplyingManualUrl, setIsApplyingManualUrl] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const cleanInit = (initialQuery || "").trim();
      setQuery(cleanInit);
      setErrorMessage(null);
      if (cleanInit.length >= 2) {
        performSearch(cleanInit);
      } else {
        setResults([]);
        setHasSearched(false);
      }
    }
  }, [isOpen, initialQuery]);

  const performSearch = async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    setIsSearching(true);
    setHasSearched(true);
    setErrorMessage(null);

    try {
      const effectiveQuery = trimmed.includes("lcsc.com") ? (normalizeLcscCode(trimmed) || trimmed) : trimmed;
      const data = await searchPartCatalog(effectiveQuery);
      if (data.results && data.results.length > 0) {
        setResults(data.results);
      } else {
        // Fallback: if input looks like a direct LCSC code (e.g. C2040), try direct LCSC detail endpoint
        const maybeCode = normalizeLcscCode(effectiveQuery);
        if (maybeCode && /^C\d+$/i.test(maybeCode)) {
          const single = await fetchLcscComponent(maybeCode).catch(() => null);
          setResults(single ? [single] : []);
        } else {
          setResults([]);
        }
      }
    } catch (err: any) {
      console.error("Part & Datasheet search error:", err);
      setErrorMessage(err.message || "Search request failed. Use the manual datasheet URL input below.");
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleApplyPart = async (part: LcscComponentInfo, mode: "full" | "datasheet_only") => {
    const key = `${part.lcscPartNumber || part.name}_${mode}`;
    setApplyingPartId(key);
    try {
      await onSelectPart(part, mode);
      onClose();
    } finally {
      setApplyingPartId(null);
    }
  };

  const handleApplyManualUrl = async () => {
    const trimmed = manualPdfUrl.trim();
    if (!trimmed) return;
    setIsApplyingManualUrl(true);
    try {
      await onManualDatasheetUrl(trimmed);
      setManualPdfUrl("");
      onClose();
    } finally {
      setIsApplyingManualUrl(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[88vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Live Part & Datasheet Lookup
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Search by MPN, component name, or LCSC code to auto-fill specs, footprint & PDF datasheet
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input Bar */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="flex gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    performSearch(query);
                  }
                }}
                placeholder="Enter part number or name (e.g. ATmega328P, NE555, ESP32-S3, LM358, C2040)..."
                className={`w-full pl-10 pr-4 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm ${focusClasses}`}
                autoFocus
              />
            </div>
            <button
              type="button"
              onClick={() => performSearch(query)}
              disabled={isSearching || !query.trim()}
              className="px-5 h-11 rounded-xl bg-primary text-white text-sm font-semibold hover:brightness-110 transition-all shadow-md shadow-primary/20 disabled:opacity-50 flex items-center gap-2 shrink-0 cursor-pointer"
            >
              {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span>Search Catalog</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>Quick examples:</span>
            {["ATmega328P", "NE555", "RP2040", "STM32F103C8T6", "LM358", "2N3904"].map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => {
                  setQuery(sample);
                  performSearch(sample);
                }}
                className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-primary/10 hover:text-primary font-mono text-[11px] transition-colors cursor-pointer"
              >
                {sample}
              </button>
            ))}
          </div>
        </div>

        {/* Results Area with Loading Skeletons */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {isSearching ? (
            <div className="space-y-3" aria-label="Loading component results">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 animate-pulse flex flex-col sm:flex-row gap-4"
                >
                  <div className="w-16 h-16 rounded-lg bg-slate-200 dark:bg-slate-700 shrink-0" />
                  <div className="flex-1 space-y-2.5">
                    <div className="flex items-center gap-3">
                      <div className="h-4 w-40 bg-slate-200 dark:bg-slate-700 rounded" />
                      <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
                    </div>
                    <div className="h-3 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
                    <div className="flex gap-2">
                      <div className="h-5 w-20 bg-slate-200 dark:bg-slate-700 rounded-full" />
                      <div className="h-5 w-28 bg-slate-200 dark:bg-slate-700 rounded-full" />
                      <div className="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded-full" />
                    </div>
                  </div>
                  <div className="w-36 flex flex-col justify-center gap-2">
                    <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                    <div className="h-7 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          ) : errorMessage ? (
            <div className="p-6 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 text-center space-y-2">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">{errorMessage}</p>
              <p className="text-xs text-slate-500">
                You can paste a direct Datasheet PDF URL in the manual fallback field below.
              </p>
            </div>
          ) : results.length > 0 ? (
            results.map((item, idx) => {
              const fullKey = `${item.lcscPartNumber || item.name}_full`;
              const pdfKey = `${item.lcscPartNumber || item.name}_datasheet_only`;
              const isApplyingFull = applyingPartId === fullKey;
              const isApplyingPdf = applyingPartId === pdfKey;

              return (
                <div
                  key={`${item.lcscPartNumber || item.name}_${idx}`}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 hover:border-primary/60 transition-all flex flex-col sm:flex-row gap-4 items-start sm:items-center"
                >
                  {/* Thumbnail */}
                  <div className="w-16 h-16 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center justify-center overflow-hidden shrink-0">
                    {item.thumbnail ? (
                      <img
                        src={`/api/proxy-download?url=${encodeURIComponent(item.thumbnail)}`}
                        alt={item.name}
                        className="w-full h-full object-contain p-1"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <Cpu className="w-7 h-7 text-slate-400" />
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white text-sm truncate">
                        {item.name}
                      </span>
                      {item.manufacturer && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {item.manufacturer}
                        </span>
                      )}
                      {item.lcscPartNumber && (
                        <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          {item.lcscPartNumber}
                        </span>
                      )}
                      {item.unitPrice !== null && (
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          ${item.unitPrice.toFixed(4)}
                        </span>
                      )}
                    </div>

                    {/* Category & Footprint Badges */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {item.category && (
                        <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                          <Layers className="w-3 h-3 text-primary" />
                          {item.category}
                          {item.subcategory ? ` › ${item.subcategory}` : ""}
                        </span>
                      )}
                      {item.package && item.package !== "Standard" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 text-primary font-mono text-[11px] font-semibold">
                          <PackageIcon className="w-3 h-3" />
                          {item.package}
                        </span>
                      )}
                      {item.datasheetUrl && (
                        <a
                          href={item.officialDatasheetUrl || item.datasheetUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 hover:underline font-medium"
                        >
                          <FileText className="w-3 h-3" />
                          <span>Preview PDF</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>

                    {/* Top Technical Parameters */}
                    {item.parameters && item.parameters.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {item.parameters.slice(0, 4).map((param, pIdx) => (
                          <span
                            key={pIdx}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                          >
                            <strong className="text-slate-700 dark:text-slate-300">{param.name}:</strong> {param.value}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex sm:flex-col gap-2 w-full sm:w-auto shrink-0">
                    <button
                      type="button"
                      disabled={Boolean(applyingPartId)}
                      onClick={() => handleApplyPart(item, "full")}
                      className="flex-1 sm:w-44 px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:brightness-110 transition-all shadow-sm shadow-primary/20 flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {isApplyingFull ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      <span>Auto-Fill Part & PDF</span>
                    </button>
                    {item.datasheetUrl && (
                      <button
                        type="button"
                        disabled={Boolean(applyingPartId)}
                        onClick={() => handleApplyPart(item, "datasheet_only")}
                        className="flex-1 sm:w-44 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-primary hover:text-primary text-xs font-semibold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                      >
                        {isApplyingPdf ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        <span>Attach PDF Only</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : hasSearched ? (
            <div className="py-10 text-center space-y-2">
              <FileText className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                No catalog matches found for "{query}"
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Try a broader part number (e.g. "LM358" instead of full reel code) or paste a direct Datasheet PDF URL in the manual fallback field below.
              </p>
            </div>
          ) : (
            <div className="py-10 text-center space-y-2 text-slate-400">
              <Search className="w-10 h-10 mx-auto opacity-30" />
              <p className="text-sm">Enter a component part number or name above to search live distributor catalogs.</p>
            </div>
          )}
        </div>

        {/* Manual Fallback Input Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 shrink-0">
              <Link2 className="w-4 h-4 text-primary" />
              <span>Manual Datasheet URL Fallback:</span>
            </div>
            <div className="flex flex-1 gap-2">
              <input
                type="url"
                value={manualPdfUrl}
                onChange={(e) => setManualPdfUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleApplyManualUrl();
                  }
                }}
                placeholder="https://example.com/datasheet.pdf (auto-downloads & links to record)"
                className={`flex-1 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs ${focusClasses}`}
              />
              <button
                type="button"
                onClick={handleApplyManualUrl}
                disabled={isApplyingManualUrl || !manualPdfUrl.trim()}
                className="px-3.5 h-9 rounded-lg bg-slate-800 dark:bg-slate-700 text-white text-xs font-semibold hover:bg-primary transition-colors disabled:opacity-50 flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                {isApplyingManualUrl ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>Attach URL</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
