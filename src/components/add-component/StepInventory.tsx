import React, { useState, useEffect } from "react";
import {
  Package,
  Hash,
  MapPin,
  Barcode,
  RefreshCw,
  Camera,
  X,
  Zap,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Edit3,
  AlertCircle,
  Smartphone,
  Wifi
} from "lucide-react";
import BarcodeGenerator from "react-barcode";
import { toast } from "sonner";
import { Box, ComponentPackage, ComponentType } from "../../lib/directus";
import {
  ComponentFormData,
  ProceduralState,
  StepValidationErrors,
  focusClasses,
  generateRandomBarcode
} from "./types";
import {
  NetworkAddressInfo,
  generateSessionId,
  generateQrDataUrl,
  playScanFeedbackSound,
  buildWsUrl
} from "../../lib/scannerSocket";
import { parseLcscBagScan } from "../../lib/lcsc";

interface StepInventoryProps {
  formData: ComponentFormData;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  onAdjustQuantity: (delta: number) => void;
  locations: Box[];
  categories: ComponentType[];
  packages: ComponentPackage[];
  isLoadingOptions: boolean;
  barcodes: string[];
  setBarcodes: React.Dispatch<React.SetStateAction<string[]>>;
  barcodeInput: string;
  setBarcodeInput: (val: string) => void;
  handleBarcodeKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  removeBarcode: (code: string) => void;
  onOpenScanner: () => void;
  procedural: ProceduralState;
  tags: string[];
  mainImage: File | null;
  existingMainImage: string | null;
  datasheet: File | null;
  existingDatasheet: string | null;
  linkedDatasheetUrl: string;
  additionalImagesCount: number;
  additionalFilesCount: number;
  onJumpToStep: (step: number) => void;
  errors: StepValidationErrors;
}

export const StepInventory: React.FC<StepInventoryProps> = ({
  formData,
  onInputChange,
  onAdjustQuantity,
  locations,
  categories,
  packages,
  isLoadingOptions,
  barcodes,
  setBarcodes,
  barcodeInput,
  setBarcodeInput,
  handleBarcodeKeyDown,
  removeBarcode,
  onOpenScanner,
  procedural,
  tags,
  mainImage,
  existingMainImage,
  datasheet,
  existingDatasheet,
  linkedDatasheetUrl,
  additionalImagesCount,
  additionalFilesCount,
  onJumpToStep,
  errors
}) => {
  const { isResistor, isInductor, isTransistor, isCapacitor, isBatchMode, batchItems } = procedural;
  const isProcedural = isResistor || isInductor || isTransistor || isCapacitor;

  const [showRemotePhone, setShowRemotePhone] = useState(false);
  const [phoneCount, setPhoneCount] = useState(0);
  const [networkAddresses, setNetworkAddresses] = useState<NetworkAddressInfo[]>([]);
  const [selectedHostOrigin, setSelectedHostOrigin] = useState<string>(() => window.location.origin);
  const [sessionId] = useState<string>(() => {
    try {
      const existing = localStorage.getItem("electrostock_scanner_session_id");
      if (existing && existing.length >= 4) return existing;
      const created = generateSessionId();
      localStorage.setItem("electrostock_scanner_session_id", created);
      return created;
    } catch {
      return generateSessionId();
    }
  });

  useEffect(() => {
    if (!showRemotePhone) return;
    fetch("/api/network-info")
      .then((r) => r.json())
      .then((data) => {
        if (data && Array.isArray(data.addresses)) {
          setNetworkAddresses(data.addresses);
          const isLocalhost =
            window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
          if (isLocalhost && data.addresses.length > 0) {
            const portPart = window.location.port ? `:${window.location.port}` : `:${data.port || 3000}`;
            setSelectedHostOrigin(`${window.location.protocol}//${data.addresses[0].ip}${portPart}`);
          }
        }
      })
      .catch(() => {});

    const ws = new WebSocket(buildWsUrl(sessionId, "pc"));
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "sync_state",
          mode: "single_component",
          items: [],
          activeRowId: null
        })
      );
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.type === "presence" || msg.type === "init_state") {
          if (typeof msg.phoneCount === "number") setPhoneCount(msg.phoneCount);
        } else if (msg.type === "remote_scan" && msg.rawCode) {
          playScanFeedbackSound("success");
          const parsed = parseLcscBagScan(msg.rawCode);
          const code = parsed.internalBagBarcode || parsed.rawNormalized;
          if (code) {
            setBarcodes((prev) => (prev.includes(code) ? prev : [...prev, code]));
            toast.success(`Code reçu du téléphone : ${code}`);
          }
        }
      } catch {
        // Ignore
      }
    };
    return () => {
      ws.close();
    };
  }, [showRemotePhone, sessionId, setBarcodes]);

  const selectedCategory = categories.find((c) => String(c.id) === String(formData.category));
  const selectedPackage = packages.find((p) => String(p.id) === String(formData.pkg));
  const selectedLocation = locations.find((l) => String(l.id) === String(formData.storageLocation));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
      {/* Left 2 Columns: Storage Location, Quantity & Barcodes */}
      <div className="lg:col-span-2 space-y-6">
        <section className="bg-white dark:bg-slate-900/60 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex items-center gap-2.5 text-primary border-b border-slate-100 dark:border-slate-800/80 pb-4">
            <div className="p-2 rounded-xl bg-primary/10">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Step 3: Inventory & Storage Location
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Set stock quantity, storage box location, internal packet reference, and scan bag barcodes
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Storage Location */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="component-location-select" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Storage Location <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                  <MapPin className="w-4 h-4" />
                </span>
                <select
                  id="component-location-select"
                  name="storageLocation"
                  value={formData.storageLocation}
                  onChange={onInputChange}
                  disabled={isLoadingOptions}
                  className={`form-select w-full rounded-xl border ${
                    errors.storageLocation
                      ? "border-red-500 ring-2 ring-red-500/10"
                      : "border-slate-200 dark:border-slate-700"
                  } bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-11 pl-10 pr-4 text-sm appearance-none ${focusClasses}`}
                >
                  <option value="" disabled>
                    {isLoadingOptions ? "Loading..." : "Select a storage box..."}
                  </option>
                  {!isLoadingOptions &&
                    locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} ({loc.unique_id})
                      </option>
                    ))}
                </select>
              </div>
              {errors.storageLocation && (
                <p className="text-xs text-red-500 flex items-center gap-1 font-medium mt-0.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {errors.storageLocation}
                </p>
              )}
            </div>

            {/* Packet Reference */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="component-packet-ref" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Packet Reference (LCSC C-Code / MPN)
              </label>
              <input
                id="component-packet-ref"
                name="packetReference"
                value={formData.packetReference}
                onChange={onInputChange}
                className={`form-input w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-11 px-4 text-sm font-mono ${focusClasses}`}
                placeholder="e.g. C11368 or MPN"
                type="text"
              />
            </div>

            {/* Quantity Available & Unit Price Paid */}
            {!isBatchMode ? (
              <>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor="component-quantity-input" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Quantity Available
                    </label>
                    <div className="flex items-center gap-1">
                      {[1, 5, 10, 50, 100].map((inc) => (
                        <button
                          key={inc}
                          type="button"
                          onClick={() => onAdjustQuantity(inc)}
                          className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-primary/15 hover:text-primary text-slate-600 dark:text-slate-300 text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          +{inc}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                      <Hash className="w-4 h-4" />
                    </span>
                    <input
                      id="component-quantity-input"
                      name="quantity"
                      value={formData.quantity}
                      onChange={onInputChange}
                      className={`form-input w-full rounded-xl border ${
                        errors.quantity ? "border-red-500 ring-2 ring-red-500/10" : "border-slate-200 dark:border-slate-700"
                      } bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-11 pl-10 pr-4 text-base font-semibold ${focusClasses}`}
                      placeholder="0"
                      type="number"
                      min="0"
                    />
                  </div>
                  {errors.quantity && (
                    <p className="text-xs text-red-500 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {errors.quantity}
                    </p>
                  )}
                </div>

                {/* Unit Price Paid (Optional) */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="component-price-input" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Unit Price Paid <span className="text-xs font-normal text-slate-400">(optional)</span>
                    </label>
                    {formData.price && !isNaN(Number(formData.price)) && Number(formData.price) > 0 && (
                      <span className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                        Stock Cost: €{(Number(formData.price) * (Number(formData.quantity) || 0)).toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 font-bold text-sm pointer-events-none">
                      €
                    </span>
                    <input
                      id="component-price-input"
                      name="price"
                      value={formData.price ?? ""}
                      onChange={onInputChange}
                      className={`form-input w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-11 pl-9 pr-4 text-base font-mono font-semibold ${focusClasses}`}
                      placeholder="0.0000"
                      type="number"
                      step="any"
                      min="0"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="sm:col-span-2 p-3.5 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-between">
                <div className="text-xs text-orange-700 dark:text-orange-300">
                  <strong>Batch Entry Mode Active:</strong> {batchItems.filter((i) => i.value.trim()).length} component variant(s) will be created with individual quantities.
                </div>
                <button
                  type="button"
                  onClick={() => onJumpToStep(1)}
                  className="text-xs font-bold text-orange-600 dark:text-orange-400 hover:underline cursor-pointer shrink-0 ml-2"
                >
                  Edit Batch
                </button>
              </div>
            )}
          </div>

          {/* Barcodes / SKUs */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block">
                Internal Bag Barcode / SKU (e.g. X130138209)
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenScanner}
                  className="px-2.5 py-1 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Caméra</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowRemotePhone((v) => !v)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                    showRemotePhone
                      ? "bg-emerald-500 text-slate-950 border-emerald-400"
                      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500 hover:text-white"
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>
                    {phoneCount > 0
                      ? `Téléphone lié (${phoneCount})`
                      : "Scanner via Téléphone (WebSocket)"}
                  </span>
                </button>
              </div>
            </div>

            {showRemotePhone && (
              <div className="p-4 rounded-2xl bg-slate-900 text-white border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                      <Wifi className="w-3 h-3" />
                      Session WebSocket : {sessionId}
                    </span>
                    {phoneCount > 0 && (
                      <span className="text-[11px] font-bold text-emerald-400">
                        • {phoneCount} téléphone connecté
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300">
                    Scannez ce QR Code avec votre téléphone pour utiliser sa caméra comme douchette sans fil vers ce PC.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={selectedHostOrigin}
                      onChange={(e) => setSelectedHostOrigin(e.target.value)}
                      className="h-8 px-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-mono text-white"
                    >
                      <option value={window.location.origin}>{window.location.origin}</option>
                      {networkAddresses.map((addr) => {
                        const portPart = window.location.port ? `:${window.location.port}` : ":3000";
                        const url = `${window.location.protocol}//${addr.ip}${portPart}`;
                        return (
                          <option key={addr.ip} value={url}>
                            {url} ({addr.name})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
                <div className="p-2 bg-white rounded-xl shrink-0">
                  <img
                    src={generateQrDataUrl(`${selectedHostOrigin}/remote-scan?session=${sessionId}`)}
                    alt="QR Code Remote Scanner"
                    className="w-24 h-24 object-contain"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/20 transition-all">
              {barcodes.map((code) => (
                <span
                  key={code}
                  className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-2.5 py-1 rounded-lg text-xs font-mono font-bold tracking-wider border border-slate-200 dark:border-slate-600"
                >
                  {code}
                  <button
                    type="button"
                    onClick={() => removeBarcode(code)}
                    className="hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500 rounded-full p-0.5 transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <div className="relative flex-1 min-w-[180px] flex items-center">
                <span className="absolute inset-y-0 left-0 pl-1.5 flex items-center text-slate-400">
                  <Barcode className="w-4 h-4" />
                </span>
                <input
                  className="w-full bg-transparent border-none focus:ring-0 text-sm h-8 pl-7 pr-20 outline-none font-mono text-slate-900 dark:text-white"
                  placeholder="Scan bag barcode or type SKU + Enter..."
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={handleBarcodeKeyDown}
                />
                <div className="absolute right-1 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const newCode = generateRandomBarcode();
                      if (!barcodes.includes(newCode)) {
                        setBarcodes([...barcodes, newCode]);
                        toast.success(`Generated barcode: ${newCode}`);
                      }
                    }}
                    className="p-1.5 text-slate-400 hover:text-primary transition-colors cursor-pointer"
                    title="Generate Random Barcode"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onOpenScanner}
                    className="p-1.5 text-slate-400 hover:text-primary transition-colors cursor-pointer"
                    title="Scan with Camera"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-5 flex flex-col items-center justify-center gap-4 border border-slate-200 dark:border-slate-800 min-h-[140px] overflow-hidden">
              {barcodes.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                  {barcodes.map((code) => (
                    <div
                      key={code}
                      className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center gap-2 transition-all hover:shadow-md group relative"
                    >
                      <div className="flex justify-between items-start w-full">
                        <div className="flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-orange-500" />
                          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                            ElectroStock
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeBarcode(code)}
                          className="text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                          title="Remove Barcode"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="w-full flex flex-col items-center justify-center bg-white rounded-lg p-2.5 border border-slate-100">
                        <BarcodeGenerator
                          value={code}
                          height={36}
                          displayValue={false}
                          background="transparent"
                          width={1.4}
                          margin={0}
                        />
                        <div className="text-center text-[10px] font-mono mt-1.5 tracking-[0.2em] font-bold text-slate-900">
                          {code}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-2 text-center">
                  <Barcode className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                  <p className="text-xs text-slate-400 font-medium">
                    No bag barcodes scanned yet (optional)
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Right Column: Scannable Component Summary Card */}
      <div className="space-y-6">
        <aside className="bg-white dark:bg-slate-900/60 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5 sticky top-24">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Component Summary
            </h3>
            <span className="text-[11px] font-semibold text-slate-400">Ready to Save</span>
          </div>

          {/* Step 1 Summary */}
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between text-slate-400 font-bold uppercase tracking-wider text-[10px]">
              <span>1. Identification</span>
              <button
                type="button"
                onClick={() => onJumpToStep(1)}
                className="text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <Edit3 className="w-3 h-3" /> Edit
              </button>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-1.5">
              <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                {formData.name || "Unnamed Component"}
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Category:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200 text-right">
                  {selectedCategory
                    ? `${selectedCategory.name}${selectedCategory.subcategory ? ` - ${selectedCategory.subcategory}` : ""}`
                    : "Not selected"}
                </span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Package:</span>
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                  {selectedPackage ? selectedPackage.name : "None"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {tags.slice(0, 6).map((t) => (
                  <span
                    key={t}
                    className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold text-[10px]"
                  >
                    {t}
                  </span>
                ))}
                {tags.length > 6 && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[10px]">
                    +{tags.length - 6}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Step 2 Summary */}
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between text-slate-400 font-bold uppercase tracking-wider text-[10px]">
              <span>2. Specs & Assets</span>
              <button
                type="button"
                onClick={() => onJumpToStep(2)}
                className="text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <Edit3 className="w-3 h-3" /> Edit
              </button>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5" /> Main Image:
                </span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {isProcedural
                    ? "Auto SVG"
                    : mainImage
                    ? mainImage.name.slice(0, 18)
                    : existingMainImage
                    ? "Existing Image"
                    : "Missing"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Datasheet:
                </span>
                <span
                  className={`font-semibold ${
                    datasheet || existingDatasheet || linkedDatasheetUrl || isProcedural
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-slate-400"
                  }`}
                >
                  {datasheet
                    ? "PDF Attached"
                    : existingDatasheet
                    ? "Existing PDF"
                    : linkedDatasheetUrl
                    ? "URL Linked"
                    : isProcedural
                    ? "Auto SVG"
                    : "Optional / None"}
                </span>
              </div>
              {(additionalImagesCount > 0 || additionalFilesCount > 0) && (
                <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                  +{additionalImagesCount} extra photo(s), +{additionalFilesCount} doc(s)
                </div>
              )}
            </div>
          </div>

          {/* Step 3 Summary */}
          <div className="space-y-2 text-xs">
            <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] block">
              3. Storage Target
            </span>
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Location:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {selectedLocation ? `${selectedLocation.name} (${selectedLocation.unique_id})` : "Select a box"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Stock Qty:</span>
                <span className="font-bold text-primary">
                  {isBatchMode
                    ? `${batchItems.filter((i) => i.value.trim()).length} batch items`
                    : `${formData.quantity} unit(s)`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Scanned SKUs:</span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                  {barcodes.length}
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
