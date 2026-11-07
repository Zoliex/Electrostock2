import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Sparkles,
  Coins,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Search,
  Check,
  TrendingUp,
  Tag,
  Package,
  Layers
} from "lucide-react";
import { directus, Component } from "../lib/directus";
import { updateItem } from "@directus/sdk";
import { toast } from "sonner";

export interface BatchAutoPricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialComponents?: Component[];
}

interface ComponentPriceItem {
  component: Component;
  status: "idle" | "pricing" | "done" | "error";
  price: number | null;
  suggestedPrice: number | null;
  sourceLabel?: string;
  source?: "supplier_url" | "serpapi_shopping" | "lcsc_part" | "lcsc_search" | "ai_estimate" | "fallback";
  confidence?: "high" | "medium" | "low";
  notes?: string;
  selected: boolean;
}

export function BatchAutoPricingModal({
  isOpen,
  onClose,
  onSuccess,
  initialComponents = []
}: BatchAutoPricingModalProps) {
  const [items, setItems] = useState<ComponentPriceItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [processedCount, setProcessedCount] = useState(0);

  // Initialize unpriced components when modal opens
  useEffect(() => {
    if (!isOpen) return;

    // Filter components that have no price or price <= 0
    const unpriced = initialComponents.filter(
      (c) => c.price === null || c.price === undefined || Number(c.price) <= 0 || isNaN(Number(c.price))
    );

    setItems(
      unpriced.map((c) => ({
        component: c,
        status: "idle",
        price: null,
        suggestedPrice: null,
        selected: true
      }))
    );
    setProcessedCount(0);
  }, [isOpen, initialComponents]);

  // Filtered view
  const filteredItems = useMemo(() => {
    if (!searchFilter.trim()) return items;
    const q = searchFilter.toLowerCase();
    return items.filter(
      (it) =>
        it.component.name.toLowerCase().includes(q) ||
        (it.component.packet_reference && it.component.packet_reference.toLowerCase().includes(q)) ||
        (it.component.barcode && it.component.barcode.toLowerCase().includes(q))
    );
  }, [items, searchFilter]);

  // Aggregate stats
  const stats = useMemo(() => {
    const totalUnpriced = items.length;
    const pricedItems = items.filter((it) => it.price !== null && it.price > 0 && it.selected);
    const estimatedCount = pricedItems.length;

    const totalAddedValue = pricedItems.reduce((sum, it) => {
      const qty = Number(it.component.quantity_available) || 0;
      const unit = it.price || 0;
      return sum + qty * unit;
    }, 0);

    return {
      totalUnpriced,
      estimatedCount,
      totalAddedValue
    };
  }, [items]);

  // Start automatic pricing process
  const startAutoPricing = async () => {
    if (items.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setProcessedCount(0);

    const updated = [...items];
    const totalToProcess = updated.filter((it) => it.selected && it.price === null).length;

    let currentProcessed = 0;

    for (let i = 0; i < updated.length; i++) {
      const it = updated[i];
      if (!it.selected || it.price !== null) continue;

      updated[i] = { ...it, status: "pricing" };
      setItems([...updated]);

      try {
        const categoryName =
          typeof it.component.type === "object" && it.component.type ? it.component.type.name : "";
        const packageName =
          typeof it.component.package === "object" && it.component.package
            ? it.component.package.name
            : "";

        const res = await fetch("/api/auto-price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            component: {
              id: it.component.id,
              name: it.component.name,
              packet_reference: it.component.packet_reference,
              barcode: it.component.barcode,
              category: categoryName,
              package: packageName,
              description: it.component.description,
              url: it.component.url
            }
          })
        });

        if (res.ok) {
          const data = await res.json();
          const foundPrice = data.price || 0.05;
          updated[i] = {
            ...updated[i],
            status: "done",
            price: foundPrice,
            suggestedPrice: foundPrice,
            source: data.source,
            sourceLabel: data.sourceLabel,
            confidence: data.confidence,
            notes: data.notes
          };
        } else {
          updated[i] = {
            ...updated[i],
            status: "error",
            price: 0.1,
            suggestedPrice: 0.1,
            source: "fallback",
            sourceLabel: "Forfait par défaut"
          };
        }
      } catch {
        updated[i] = {
          ...updated[i],
          status: "error",
          price: 0.1,
          suggestedPrice: 0.1,
          source: "fallback",
          sourceLabel: "Forfait par défaut"
        };
      }

      currentProcessed++;
      setProcessedCount(currentProcessed);
      setItems([...updated]);

      // Small pause to keep UI responsive and respect external API limits
      await new Promise((r) => setTimeout(r, 120));
    }

    setIsProcessing(false);
    toast.success(`Auto-pricing completed: ${currentProcessed} components evaluated!`);
  };

  // Save selected prices to Directus
  const savePricesToDirectus = async () => {
    const toSave = items.filter((it) => it.selected && it.price !== null && it.price > 0);
    if (toSave.length === 0) {
      toast.error("No components selected with a valid price.");
      return;
    }

    setIsSaving(true);
    const toastId = toast.loading(`Saving prices for ${toSave.length} component(s)...`);

    let savedCount = 0;
    try {
      for (const it of toSave) {
        await directus.request(
          updateItem("components", it.component.id, {
            price: it.price
          })
        );
        savedCount++;
      }

      toast.success(
        `Success! ${savedCount} component(s) updated (+${stats.totalAddedValue.toFixed(
          2
        )} € added value)`,
        { id: toastId }
      );
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Failed to save component prices:", err);
      toast.error(`Save error: ${err.message}`, { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                Auto-Price Inventory
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  {items.length} unpriced
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Automatically fetch supplier links, live market prices, and AI estimates to value your stock.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-100/60 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800">
          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Added Stock Value
              </p>
              <p className="text-lg font-black font-mono text-emerald-600 dark:text-emerald-400">
                +{stats.totalAddedValue.toFixed(2)} €
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Priced Components
              </p>
              <p className="text-lg font-black text-slate-900 dark:text-white">
                {stats.estimatedCount}{" "}
                <span className="text-xs font-normal text-slate-400">/ {stats.totalUnpriced}</span>
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <button
              onClick={startAutoPricing}
              disabled={isProcessing || items.length === 0}
              className="w-full h-full py-2 px-3 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-primary/20 cursor-pointer disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Auto-Pricing... ({processedCount})</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Start Auto-Pricing</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Search & Actions Bar */}
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filter by name or reference..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border-none text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                setItems((prev) =>
                  prev.map((it) => ({
                    ...it,
                    selected: prev.some((x) => !x.selected)
                  }))
                )
              }
              className="text-xs text-primary font-bold hover:underline cursor-pointer"
            >
              {items.every((it) => it.selected) ? "Deselect All" : "Select All"}
            </button>
          </div>
        </div>

        {/* Component List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredItems.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-semibold">
                {items.length === 0
                  ? "All your components already have a price set!"
                  : "No components match the filter."}
              </p>
            </div>
          ) : (
            filteredItems.map((it, idx) => {
              const qty = Number(it.component.quantity_available) || 0;
              const unitPrice = it.price || 0;
              const lineTotal = qty * unitPrice;

              return (
                <div
                  key={it.component.id}
                  className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    it.selected
                      ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-primary/40"
                      : "bg-slate-50 dark:bg-slate-950/50 border-slate-200/50 dark:border-slate-800/50 opacity-60"
                  }`}
                >
                  {/* Left: Checkbox + Name + Badges */}
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={it.selected}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setItems((prev) =>
                          prev.map((item) =>
                            item.component.id === it.component.id ? { ...item, selected: checked } : item
                          )
                        );
                      }}
                      className="mt-1 w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                          {it.component.name}
                        </span>
                        {it.component.packet_reference && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-semibold">
                            {it.component.packet_reference}
                          </span>
                        )}
                        <span className="text-[11px] font-semibold text-slate-400">
                          Stock: <strong className="text-slate-700 dark:text-slate-200">{qty}</strong> units
                        </span>
                      </div>

                      {/* Source details */}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {it.status === "pricing" ? (
                          <span className="text-[11px] text-primary flex items-center gap-1 font-semibold">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Looking up price (Supplier link, Market, LCSC, AI)...
                          </span>
                        ) : it.sourceLabel ? (
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                              it.source === "supplier_url"
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                : it.source === "serpapi_shopping"
                                ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20"
                                : it.source === "lcsc_part"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                : it.source === "lcsc_search"
                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                                : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                            }`}
                          >
                            <Tag className="w-2.5 h-2.5" />
                            {it.sourceLabel}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Awaiting pricing</span>
                        )}

                        {it.notes && (
                          <span className="text-[10px] text-slate-400 truncate max-w-xs">{it.notes}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Editable Unit Price + Total Value */}
                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                    <div className="flex flex-col items-end">
                      <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        Unit price (€)
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={it.price !== null ? it.price : ""}
                          placeholder="0.00"
                          onChange={(e) => {
                            const val = e.target.value === "" ? null : parseFloat(e.target.value);
                            setItems((prev) =>
                              prev.map((item) =>
                                item.component.id === it.component.id ? { ...item, price: val } : item
                              )
                            );
                          }}
                          className="w-24 sm:w-28 px-2 py-1 text-right font-mono text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-primary"
                        />
                        <span className="ml-1 text-xs font-bold text-slate-400">€</span>
                      </div>
                    </div>

                    <div className="w-24 sm:w-28 text-right">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Total value</p>
                      <p className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400">
                        {lineTotal > 0 ? `${lineTotal.toFixed(2)} €` : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <p className="text-xs text-slate-500">
            {stats.estimatedCount} component(s) ready to save • Added value:{" "}
            <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
              +{stats.totalAddedValue.toFixed(2)} €
            </strong>
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={savePricesToDirectus}
              disabled={isSaving || stats.estimatedCount === 0}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Apply Prices to Inventory</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
