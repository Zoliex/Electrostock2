import { Link } from "react-router-dom";
import {
  Download,
  Plus,
  Layers,
  Package,
  Warehouse,
  AlertTriangle,
  TrendingUp,
  ArrowUp,
  ClipboardList,
  Cpu,
  PieChart,
  BellRing,
  AlertCircle,
  Loader2,
  Coins,
  Sparkles,
  DollarSign
} from "lucide-react";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { directus, Component, ComponentType, Box } from "../lib/directus";
import { readItems } from "@directus/sdk";
import { BatchAutoPricingModal } from "../components/BatchAutoPricingModal";

export function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    totalSkus: 0,
    totalUnits: 0,
    totalBoxes: 0,
    criticalStock: 0,
    criticalThreshold: 10,
    totalStockValue: 0,
    pricedSkus: 0,
    unpricedSkus: 0,
    pricedPercentage: 0,
  });
  const [recentComponents, setRecentComponents] = useState<Component[]>([]);
  const [allItems, setAllItems] = useState<Component[]>([]);
  const [categoryStats, setCategoryStats] = useState<{ name: string; count: number; percentage: number; color: string }[]>([]);
  const [lowStockComponents, setLowStockComponents] = useState<Component[]>([]);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch settings for critical threshold
      let criticalThreshold = 10;
      try {
        const settingsRes = await fetch("/api/settings");
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          if (settingsData.criticalStockThreshold !== undefined) {
            criticalThreshold = settingsData.criticalStockThreshold;
          }
        }
      } catch (e) {
        console.error("Failed to fetch settings", e);
      }

      // Fetch all necessary data
      // We use Promise.all to fetch in parallel
      const [components, types, boxes] = await Promise.all([
        directus.request(readItems('components', {
          fields: ['*', 'type.*', 'package.*'] as any,
          limit: -1, // Fetch all for metrics
          sort: ['-id'], // Get newest first for recent activity
        })) as unknown as Promise<Component[]>,
        directus.request(readItems('components_types', {
          limit: -1,
        })),
        directus.request(readItems('boxes', {
          limit: -1,
          fields: ['id']
        })),
      ]);

      // Store all items for export
      setAllItems(components as Component[]);

      // Calculate Metrics
      const totalSkus = components.length;
      const totalUnits = components.reduce((sum, item) => sum + (item.quantity_available || 0), 0);
      const totalBoxes = boxes.length;
      
      const lowStock = components.filter(c => (c.quantity_available || 0) <= criticalThreshold);
      const criticalStock = lowStock.length;

      // Calculate Stock Valuation Metrics
      let totalStockValue = 0;
      let pricedSkus = 0;

      components.forEach((c) => {
        const unitPrice = Number(c.price);
        const qty = Number(c.quantity_available) || 0;
        if (c.price !== null && c.price !== undefined && !isNaN(unitPrice) && unitPrice > 0) {
          pricedSkus++;
          totalStockValue += unitPrice * qty;
        }
      });

      const unpricedSkus = totalSkus - pricedSkus;
      const pricedPercentage = totalSkus > 0 ? Math.round((pricedSkus / totalSkus) * 100) : 0;

      setMetrics({
        totalSkus,
        totalUnits,
        totalBoxes: parseInt(totalBoxes as any),
        criticalStock,
        criticalThreshold,
        totalStockValue,
        pricedSkus,
        unpricedSkus,
        pricedPercentage,
      });

        // Recent Activity (first 5 from the sorted list)
        setRecentComponents(components.slice(0, 5));

        // Low Stock Alerts (first 3 for the card)
        setLowStockComponents(lowStock.slice(0, 3));

        // Category Distribution
        const typeCounts: Record<string, number> = {};
        components.forEach(c => {
          const typeName = typeof c.type === 'object' && c.type !== null ? c.type.name : 'Unknown';
          typeCounts[typeName] = (typeCounts[typeName] || 0) + 1;
        });

        const colors = ['bg-primary', 'bg-purple-500', 'bg-pink-500', 'bg-emerald-500', 'bg-orange-500', 'bg-blue-500'];
        const stats = Object.entries(typeCounts)
          .map(([name, count], index) => ({
            name,
            count,
            percentage: Math.round((count / totalSkus) * 100),
            color: colors[index % colors.length]
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5); // Top 5 categories

        setCategoryStats(stats);

      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    useEffect(() => {
      fetchData();
    }, []);

  const handleExport = () => {
    if (allItems.length === 0) return;

    const headers = ['ID', 'Name', 'Category', 'Quantity', 'Unit Price (€)', 'Total Value (€)', 'Location', 'Description'];
    const csvContent = [
      headers.join(','),
      ...allItems.map(comp => {
        const categoryName = typeof comp.type === 'object' && comp.type ? comp.type.name : '';
        const locationName = typeof comp.location === 'object' && comp.location ? comp.location.name : '';
        const unitPrice = comp.price !== null && comp.price !== undefined ? Number(comp.price) : 0;
        const totalVal = unitPrice * (Number(comp.quantity_available) || 0);

        return [
          comp.id,
          `"${comp.name.replace(/"/g, '""')}"`,
          `"${categoryName.replace(/"/g, '""')}"`,
          comp.quantity_available,
          unitPrice > 0 ? unitPrice.toFixed(4) : "",
          totalVal > 0 ? totalVal.toFixed(2) : "",
          `"${locationName.replace(/"/g, '""')}"`,
          `"${(comp.description || '').replace(/"/g, '""')}"`
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `inventory_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full min-h-[500px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <motion.main 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex-1 max-w-7xl mx-auto w-full px-6 py-8"
    >
      {/* Dashboard Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-black tracking-tight">Inventory Overview</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Real-time tracking of component stock levels, valuation, and distribution.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsPricingModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
            title="Automatically estimate and set prices for unpriced components"
          >
            <Sparkles className="w-4 h-4" />
            <span>Auto-Price Stock</span>
            {metrics.unpricedSkus > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-black/20 font-bold">
                {metrics.unpricedSkus}
              </span>
            )}
          </button>

          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>

          <Link to="/inventory/add" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-semibold text-sm hover:brightness-110 transition-all shadow-lg shadow-primary/20">
            <Plus className="w-5 h-5" /> New Component
          </Link>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 mb-8">
        {/* Total Stock Valuation Card */}
        <div className="flex flex-col justify-between rounded-xl p-5 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent dark:from-emerald-950/40 dark:via-slate-900 border border-emerald-500/30 dark:border-emerald-500/20 shadow-sm relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400 mb-2">
              <p className="text-xs font-bold uppercase tracking-wider">Total Stock Value</p>
              <div className="size-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Coins className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <p className="text-2xl sm:text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400 truncate">
                {metrics.totalStockValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </p>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-emerald-500/20 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span className="truncate">
              {metrics.pricedSkus} / {metrics.totalSkus} priced ({metrics.pricedPercentage}%)
            </span>
            {metrics.unpricedSkus > 0 && (
              <button
                onClick={() => setIsPricingModalOpen(true)}
                className="text-primary hover:underline font-bold flex items-center gap-1 cursor-pointer shrink-0 ml-1"
                title="Price unpriced components"
              >
                <Sparkles className="w-3 h-3" />
                <span>+ {metrics.unpricedSkus}</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-xl p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <p className="text-xs font-semibold uppercase tracking-wider">Total SKUs</p>
            <Layers className="w-5 h-5 text-primary" />
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl sm:text-3xl font-bold">{metrics.totalSkus.toLocaleString()}</p>
          </div>
          <p className="text-xs text-slate-400">Unique components</p>
        </div>

        <div className="flex flex-col gap-2 rounded-xl p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <p className="text-xs font-semibold uppercase tracking-wider">Total Units</p>
            <Package className="w-5 h-5 text-primary" />
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl sm:text-3xl font-bold">{metrics.totalUnits.toLocaleString()}</p>
          </div>
          <p className="text-xs text-slate-400">Active stock</p>
        </div>

        <div className="flex flex-col gap-2 rounded-xl p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <p className="text-xs font-semibold uppercase tracking-wider">Total Boxes</p>
            <Warehouse className="w-5 h-5 text-primary" />
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl sm:text-3xl font-bold">{metrics.totalBoxes}</p>
          </div>
          <p className="text-xs text-slate-400">Storage containers</p>
        </div>

        <div className="flex flex-col gap-2 rounded-xl p-5 bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/50 shadow-sm">
          <div className="flex items-center justify-between text-orange-600 dark:text-orange-400">
            <p className="text-xs font-semibold uppercase tracking-wider font-bold">Critical Stock</p>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl sm:text-3xl font-bold text-orange-600 dark:text-orange-400">{metrics.criticalStock}</p>
          </div>
          <p className="text-xs text-orange-600/60 dark:text-orange-400/60">Items with &le; {metrics.criticalThreshold} units</p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Inventory Table */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-primary" />
              Recent Activity
            </h2>
            <Link to="/inventory" className="text-primary text-sm font-semibold hover:underline">View All</Link>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Component</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Level</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {recentComponents.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500">No recent activity found.</td>
                  </tr>
                ) : (
                  recentComponents.map((component) => (
                    <tr key={component.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded bg-primary/10 flex items-center justify-center text-primary">
                            <Cpu className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold line-clamp-1">{component.name}</p>
                            <p className="text-xs text-slate-400 font-mono">ID: {component.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 rounded-md bg-blue-500 text-white text-[11px] font-bold uppercase tracking-tight whitespace-nowrap">
                          {typeof component.type === 'object' && component.type ? component.type.name : 'Unknown'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium whitespace-nowrap">{component.quantity_available} units</td>
                      <td className="px-6 py-4">
                        {(component.quantity_available || 0) <= metrics.criticalThreshold ? (
                          <div className="flex items-center gap-1.5 text-orange-500 text-xs font-bold uppercase whitespace-nowrap">
                            <span className="size-1.5 rounded-full bg-orange-500 animate-pulse"></span> Low Stock
                          </div>
                        ) : (component.quantity_available || 0) === 0 ? (
                          <div className="flex items-center gap-1.5 text-red-500 text-xs font-bold uppercase whitespace-nowrap">
                            <span className="size-1.5 rounded-full bg-red-500"></span> Out of Stock
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-emerald-500 text-xs font-bold uppercase whitespace-nowrap">
                            <span className="size-1.5 rounded-full bg-emerald-500"></span> Healthy
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Side Distribution & Alerts */}
        <div className="flex flex-col gap-6">
          {/* Category Distribution Card */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <PieChart className="w-6 h-6 text-primary" />
              By Category
            </h3>
            <div className="flex flex-col gap-4">
              {categoryStats.length === 0 ? (
                <p className="text-slate-500 text-sm">No category data available.</p>
              ) : (
                categoryStats.map((stat) => (
                  <div key={stat.name} className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-sm font-medium">
                      <span>{stat.name}</span>
                      <span>{stat.percentage}%</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                      <div className={`${stat.color} h-2 rounded-full`} style={{ width: `${stat.percentage}%` }}></div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {/* <button className="w-full mt-6 py-2 text-sm font-semibold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              Detailed Analytics
            </button> */}
          </div>

          {/* Warehouse Alerts */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <BellRing className="w-6 h-6 text-primary" />
                Low Stock Alerts
              </h3>
              <Link to="/inventory?filter=low_stock" className="text-xs font-bold text-primary hover:underline">
                View All
              </Link>
            </div>
            <div className="space-y-4">
              {lowStockComponents.length === 0 ? (
                <p className="text-slate-500 text-sm">No low stock alerts.</p>
              ) : (
                lowStockComponents.map((component) => (
                  <div key={component.id} className="flex gap-4 items-start p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-100 dark:border-red-900/30">
                    <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-red-700 dark:text-red-400 leading-tight">{component.name}</p>
                      <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-1">
                        Only {component.quantity_available} units remaining.
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <BatchAutoPricingModal
        isOpen={isPricingModalOpen}
        onClose={() => setIsPricingModalOpen(false)}
        onSuccess={() => {
          fetchData();
        }}
        initialComponents={allItems}
      />
    </motion.main>
  );
}
