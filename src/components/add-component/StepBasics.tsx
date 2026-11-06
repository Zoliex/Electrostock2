import React from "react";
import {
  Settings,
  Zap,
  Activity,
  Cpu,
  Battery,
  Layers,
  RefreshCw,
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  Edit,
  X,
  Search,
  AlertCircle,
  FileSpreadsheet
} from "lucide-react";
import { toast } from "sonner";
import { ComponentPackage, ComponentType } from "../../lib/directus";
import {
  ComponentFormData,
  ProceduralState,
  StepValidationErrors,
  focusClasses,
  generateRandomBarcode
} from "./types";
import {
  TOLERANCE_MAP,
  TEMPCO_MAP,
  ResistorVisual,
  InductorVisual,
  TransistorVisual,
  CapacitorVisual
} from "./ProceduralVisuals";

interface StepBasicsProps {
  formData: ComponentFormData;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  categories: ComponentType[];
  packages: ComponentPackage[];
  isLoadingOptions: boolean;
  openCategoryModal: (category?: ComponentType) => void;
  openPackageModal: (pkg?: ComponentPackage) => void;
  tags: string[];
  tagInput: string;
  setTagInput: (val: string) => void;
  handleTagKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  removeTag: (tag: string) => void;
  procedural: ProceduralState;
  setProcedural: React.Dispatch<React.SetStateAction<ProceduralState>>;
  isAiFilling: boolean;
  enableAiSuggestions: boolean;
  onOpenDatasheetSearch: () => void;
  onOpenOrderImport: () => void;
  onAiFill: () => void;
  errors: StepValidationErrors;
  onAdvanceStep: () => void;
}

export const StepBasics: React.FC<StepBasicsProps> = ({
  formData,
  onInputChange,
  categories,
  packages,
  isLoadingOptions,
  openCategoryModal,
  openPackageModal,
  tags,
  tagInput,
  setTagInput,
  handleTagKeyDown,
  removeTag,
  procedural,
  setProcedural,
  isAiFilling,
  enableAiSuggestions,
  onOpenDatasheetSearch,
  onOpenOrderImport,
  onAiFill,
  errors,
  onAdvanceStep
}) => {
  const {
    isResistor,
    isInductor,
    isTransistor,
    isCapacitor,
    capacitorType,
    bandCount,
    resistorValue,
    inductanceValue,
    transistorValue,
    capacitorValue,
    tolerance,
    tempCo,
    resistorUnit,
    inductorUnit,
    capacitorUnit,
    isBatchMode,
    batchItems
  } = procedural;

  const isProcedural = isResistor || isInductor || isTransistor || isCapacitor;

  const updateProcedural = (patch: Partial<ProceduralState>) => {
    setProcedural((prev) => ({ ...prev, ...patch }));
  };

  return (
    <section className="bg-white dark:bg-slate-900/60 p-5 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-4">
        <div className="flex items-center gap-2.5 text-primary">
          <div className="p-2 rounded-xl bg-primary/10">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Step 1: Identification & Basics
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Component name, category, package, and search tags
            </p>
          </div>
        </div>

        {/* Smart Lookup & AI Actions */}
        <div className="w-full sm:w-auto grid grid-cols-1 xs:grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenOrderImport}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-600 hover:text-white transition-all font-semibold text-xs border border-amber-500/20 cursor-pointer"
            title="Importer un fichier CSV de commande LCSC complète"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
            <span>Importer une commande LCSC</span>
          </button>

          <button
            type="button"
            onClick={onOpenDatasheetSearch}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white transition-all font-semibold text-xs border border-emerald-500/20 cursor-pointer"
            title="Search by part number, MPN, or LCSC code (e.g. C2040, ATmega328P)"
          >
            <Search className="w-3.5 h-3.5 shrink-0" />
            <span>Lookup Part & Datasheet</span>
          </button>

          {enableAiSuggestions && (
            <button
              type="button"
              onClick={onAiFill}
              disabled={isAiFilling || !formData.name.trim()}
              className="xs:col-span-2 flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all disabled:opacity-50 font-semibold text-xs border border-primary/20 cursor-pointer"
              title="Research & Classify with Gemini AI"
            >
              {isAiFilling ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>Fill with AI</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Component Generators / Batch Entry */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/80">
          <button
            type="button"
            onClick={() =>
              updateProcedural({
                isResistor: !isResistor,
                isInductor: false,
                isTransistor: false,
                isCapacitor: false
              })
            }
            className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border transition-all cursor-pointer ${
              isResistor
                ? "bg-primary text-white border-primary shadow-md"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-primary/40"
            }`}
          >
            <Zap className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider truncate">Resistor</span>
          </button>

          <button
            type="button"
            onClick={() =>
              updateProcedural({
                isInductor: !isInductor,
                isResistor: false,
                isTransistor: false,
                isCapacitor: false
              })
            }
            className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border transition-all cursor-pointer ${
              isInductor
                ? "bg-primary text-white border-primary shadow-md"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-primary/40"
            }`}
          >
            <Activity className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider truncate">Inductor</span>
          </button>

          <button
            type="button"
            onClick={() =>
              updateProcedural({
                isTransistor: !isTransistor,
                isResistor: false,
                isInductor: false,
                isCapacitor: false
              })
            }
            className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border transition-all cursor-pointer ${
              isTransistor
                ? "bg-primary text-white border-primary shadow-md"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-primary/40"
            }`}
          >
            <Cpu className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider truncate">Transistor</span>
          </button>

          <button
            type="button"
            onClick={() =>
              updateProcedural({
                isCapacitor: !isCapacitor,
                isResistor: false,
                isInductor: false,
                isTransistor: false
              })
            }
            className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border transition-all cursor-pointer ${
              isCapacitor
                ? "bg-primary text-white border-primary shadow-md"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-primary/40"
            }`}
          >
            <Battery className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider truncate">Capacitor</span>
          </button>

          <button
            type="button"
            onClick={() => updateProcedural({ isBatchMode: !isBatchMode })}
            className={`col-span-2 sm:col-span-1 flex items-center justify-center gap-2 p-2.5 rounded-xl border transition-all cursor-pointer ${
              isBatchMode
                ? "bg-orange-500 text-white border-orange-500 shadow-md"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-orange-500/40"
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider truncate">Batch Entry</span>
          </button>
        </div>
      </div>

      {/* Dynamic Procedural / Batch Controls */}
      {(isProcedural || isBatchMode) && (
        <div className="p-4 sm:p-5 bg-primary/5 rounded-2xl border border-primary/20 space-y-5 animate-in fade-in duration-200">
          {isProcedural && (
            <div className="flex flex-col md:flex-row gap-6 items-center">
              <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
                {isResistor && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Band Count</label>
                      <select
                        value={bandCount}
                        onChange={(e) => updateProcedural({ bandCount: Number(e.target.value) })}
                        className={`form-select w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-10 px-3 text-sm ${focusClasses}`}
                      >
                        <option value={4}>4 Bands</option>
                        <option value={5}>5 Bands</option>
                        <option value={6}>6 Bands</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Tolerance</label>
                      <select
                        value={tolerance}
                        onChange={(e) => updateProcedural({ tolerance: e.target.value })}
                        className={`form-select w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-10 px-3 text-sm ${focusClasses}`}
                      >
                        {Object.keys(TOLERANCE_MAP).map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    {bandCount === 6 && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">TempCo</label>
                        <select
                          value={tempCo}
                          onChange={(e) => updateProcedural({ tempCo: e.target.value })}
                          className={`form-select w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-10 px-3 text-sm ${focusClasses}`}
                        >
                          {Object.keys(TEMPCO_MAP).map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {!isBatchMode && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Resistance Value</label>
                        <div className="flex gap-2">
                          <input
                            value={resistorValue}
                            onChange={(e) => updateProcedural({ resistorValue: e.target.value })}
                            placeholder="e.g. 4.7, 100, 10"
                            className={`form-input flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-10 px-3 text-sm ${focusClasses}`}
                          />
                          <select
                            value={resistorUnit}
                            onChange={(e) => updateProcedural({ resistorUnit: e.target.value })}
                            className={`form-select w-20 shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-10 px-2 text-sm ${focusClasses}`}
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
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Tolerance</label>
                      <select
                        value={tolerance}
                        onChange={(e) => updateProcedural({ tolerance: e.target.value })}
                        className={`form-select w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-10 px-3 text-sm ${focusClasses}`}
                      >
                        {Object.keys(TOLERANCE_MAP).map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    {!isBatchMode && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Inductance Value</label>
                        <div className="flex gap-2">
                          <input
                            value={inductanceValue}
                            onChange={(e) => updateProcedural({ inductanceValue: e.target.value })}
                            placeholder="e.g. 10, 100, 1"
                            className={`form-input flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-10 px-3 text-sm ${focusClasses}`}
                          />
                          <select
                            value={inductorUnit}
                            onChange={(e) => updateProcedural({ inductorUnit: e.target.value })}
                            className={`form-select w-20 shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-10 px-2 text-sm ${focusClasses}`}
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
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Transistor Marking / Model</label>
                    <input
                      type="text"
                      value={transistorValue}
                      onChange={(e) => updateProcedural({ transistorValue: e.target.value })}
                      placeholder="e.g. 2N2222, BC547"
                      className={`form-input w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-10 px-3 text-sm ${focusClasses}`}
                    />
                  </div>
                )}

                {isCapacitor && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Capacitor Type</label>
                      <select
                        value={capacitorType}
                        onChange={(e) => updateProcedural({ capacitorType: e.target.value as any })}
                        className={`form-select w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-10 px-3 text-sm ${focusClasses}`}
                      >
                        <option value="Electrolytic">Electrolytic</option>
                        <option value="Tantalum">Tantalum</option>
                        <option value="Ceramic">Ceramic</option>
                      </select>
                    </div>
                    {!isBatchMode && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Capacitance Value</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={capacitorValue}
                            onChange={(e) => updateProcedural({ capacitorValue: e.target.value })}
                            placeholder="e.g. 10, 100"
                            className={`form-input flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-10 px-3 text-sm ${focusClasses}`}
                          />
                          <select
                            value={capacitorUnit}
                            onChange={(e) => updateProcedural({ capacitorUnit: e.target.value })}
                            className={`form-select w-20 shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-10 px-2 text-sm ${focusClasses}`}
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
              </div>

              {/* Responsive Live Procedural Visual Preview */}
              <div className="w-44 sm:w-48 shrink-0">
                {isResistor && (
                  <ResistorVisual
                    value={isBatchMode ? "Batch" : resistorValue}
                    unit={resistorUnit}
                    tolerance={tolerance}
                    tempCo={tempCo}
                    bandCount={bandCount}
                  />
                )}
                {isInductor && (
                  <InductorVisual
                    value={isBatchMode ? "Batch" : inductanceValue}
                    unit={inductorUnit}
                    tolerance={tolerance}
                  />
                )}
                {isTransistor && (
                  <TransistorVisual value={isBatchMode ? "Batch" : transistorValue} />
                )}
                {isCapacitor && (
                  <CapacitorVisual
                    value={isBatchMode ? "Batch" : capacitorValue}
                    unit={capacitorUnit}
                    type={capacitorType}
                  />
                )}
              </div>
            </div>
          )}

          {/* Batch Mode Items Table */}
          {isBatchMode && (
            <div className={`space-y-3 ${isProcedural ? "pt-3 border-t border-primary/15" : ""}`}>
              <div className="flex flex-wrap justify-between items-center gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Batch Items ({batchItems.length})
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const newItems = batchItems.map((item) => ({
                        ...item,
                        barcode: item.barcode || generateRandomBarcode()
                      }));
                      updateProcedural({ batchItems: newItems });
                      toast.success("Generated barcodes for all batch items");
                    }}
                    className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-primary transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" /> Generate All Barcodes
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateProcedural({
                        batchItems: [
                          ...batchItems,
                          {
                            value: "",
                            quantity: 1,
                            unit: isResistor ? resistorUnit : isInductor ? inductorUnit : isCapacitor ? capacitorUnit : ""
                          }
                        ]
                      })
                    }
                    className="flex items-center gap-1 text-xs font-bold text-primary hover:underline cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Item
                  </button>
                </div>
              </div>

              {errors.batchItems && (
                <p className="text-xs text-red-500 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.batchItems}
                </p>
              )}

              <div className="space-y-2.5">
                {batchItems.map((item, index) => (
                  <div key={index} className="flex flex-wrap sm:flex-nowrap gap-2.5 items-end">
                    <div className="flex-1 min-w-[140px] flex flex-col gap-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400">Value</label>
                      <div className="flex gap-1">
                        <input
                          value={item.value}
                          onChange={(e) => {
                            const newItems = [...batchItems];
                            newItems[index].value = e.target.value;
                            updateProcedural({ batchItems: newItems });
                          }}
                          placeholder="e.g. 10k, 4.7uF"
                          className={`form-input flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-9 px-3 text-sm ${focusClasses}`}
                        />
                        {isProcedural && !isTransistor && (
                          <select
                            value={item.unit || (isResistor ? resistorUnit : isInductor ? inductorUnit : isCapacitor ? capacitorUnit : "")}
                            onChange={(e) => {
                              const newItems = [...batchItems];
                              newItems[index].unit = e.target.value;
                              updateProcedural({ batchItems: newItems });
                            }}
                            className={`form-select w-20 shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-9 px-1 text-xs ${focusClasses}`}
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
                    <div className="w-20 flex flex-col gap-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400">Qty</label>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => {
                          const newItems = [...batchItems];
                          newItems[index].quantity = parseInt(e.target.value) || 0;
                          updateProcedural({ batchItems: newItems });
                        }}
                        className={`form-input w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-9 px-2.5 text-sm ${focusClasses}`}
                      />
                    </div>
                    <div className="w-36 flex flex-col gap-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400">Barcode</label>
                      <div className="relative">
                        <input
                          value={item.barcode || ""}
                          onChange={(e) => {
                            const newItems = [...batchItems];
                            newItems[index].barcode = e.target.value;
                            updateProcedural({ batchItems: newItems });
                          }}
                          placeholder="Optional SKU"
                          className={`form-input w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-9 pl-2.5 pr-7 text-xs font-mono ${focusClasses}`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newItems = [...batchItems];
                            newItems[index].barcode = generateRandomBarcode();
                            updateProcedural({ batchItems: newItems });
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
                      onClick={() => updateProcedural({ batchItems: batchItems.filter((_, i) => i !== index) })}
                      disabled={batchItems.length === 1}
                      className="h-9 w-9 flex items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/30 text-red-500 hover:bg-red-100 disabled:opacity-30 transition-colors cursor-pointer"
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

      {/* Primary Inputs Grid */}
      <div className="space-y-5">
        {/* Component Name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="component-name-input" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Name <span className="text-red-500">*</span>
          </label>
          <div className="relative flex items-center">
            <input
              id="component-name-input"
              name="name"
              value={formData.name}
              onChange={onInputChange}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAdvanceStep();
                }
              }}
              className={`form-input w-full rounded-xl border ${
                errors.name ? "border-red-500 ring-2 ring-red-500/10" : "border-slate-200 dark:border-slate-700"
              } bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-12 px-4 text-base ${focusClasses}`}
              placeholder="e.g. ATmega328P Microcontroller"
            />
          </div>
          {errors.name && (
            <p className="text-xs text-red-500 flex items-center gap-1 font-medium mt-0.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {errors.name}
            </p>
          )}
        </div>

        {/* Category & Package */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="component-category-select" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Category <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <select
                id="component-category-select"
                name="category"
                value={formData.category}
                onChange={onInputChange}
                disabled={isLoadingOptions}
                className={`form-select flex-1 min-w-0 rounded-xl border ${
                  errors.category ? "border-red-500 ring-2 ring-red-500/10" : "border-slate-200 dark:border-slate-700"
                } bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-11 px-3.5 text-sm ${focusClasses}`}
              >
                <option value="" disabled>
                  {isLoadingOptions ? "Loading..." : "Select a category..."}
                </option>
                {!isLoadingOptions &&
                  categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                      {cat.subcategory ? ` - ${cat.subcategory}` : ""}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={() => openCategoryModal()}
                className="flex items-center justify-center w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-primary hover:text-white hover:border-primary transition-colors shrink-0 cursor-pointer"
                title="Create New Category"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const selected = categories.find((c) => c.id === Number(formData.category));
                  if (selected) openCategoryModal(selected);
                }}
                disabled={!formData.category}
                className="flex items-center justify-center w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-primary hover:text-white hover:border-primary transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                title="Edit Selected Category"
              >
                <Edit className="w-4 h-4" />
              </button>
            </div>
            {errors.category && (
              <p className="text-xs text-red-500 flex items-center gap-1 font-medium mt-0.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {errors.category}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="component-package-select" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Package
            </label>
            <div className="flex gap-2">
              <select
                id="component-package-select"
                name="pkg"
                value={formData.pkg}
                onChange={onInputChange}
                disabled={isLoadingOptions}
                className={`form-select flex-1 min-w-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-11 px-3.5 text-sm ${focusClasses}`}
              >
                <option value="">{isLoadingOptions ? "Loading..." : "Select a package..."}</option>
                {!isLoadingOptions &&
                  packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={() => openPackageModal()}
                className="flex items-center justify-center w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-primary hover:text-white hover:border-primary transition-colors shrink-0 cursor-pointer"
                title="Create New Package"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const selected = packages.find((p) => p.id === Number(formData.pkg));
                  if (selected) openPackageModal(selected);
                }}
                disabled={!formData.pkg}
                className="flex items-center justify-center w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-primary hover:text-white hover:border-primary transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                title="Edit Selected Package"
              >
                <Edit className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Keywords / Tags */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="component-tags-input" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Keywords / Tags <span className="text-red-500">*</span>
          </label>
          <div
            className={`flex flex-wrap gap-2 p-2.5 border ${
              errors.tags ? "border-red-500 ring-2 ring-red-500/10" : "border-slate-200 dark:border-slate-700"
            } rounded-xl bg-white dark:bg-slate-800 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/20 transition-all min-h-[46px] items-center`}
          >
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 bg-primary/10 text-primary px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="hover:bg-primary/20 rounded-full p-0.5 transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <input
              id="component-tags-input"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              className="border-none bg-transparent focus:ring-0 text-sm flex-1 min-w-[160px] p-1 outline-none text-slate-900 dark:text-white"
              placeholder="Type and press Enter..."
            />
          </div>
          {errors.tags && (
            <p className="text-xs text-red-500 flex items-center gap-1 font-medium mt-0.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {errors.tags}
            </p>
          )}
        </div>
      </div>
    </section>
  );
};
