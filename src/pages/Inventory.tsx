import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Download, Plus, Loader2, Package, Filter, ArrowUpDown, Search, X, AlertTriangle, ChevronLeft, ChevronRight, Layers, Camera, ChevronDown, Minus, Trash2 } from "lucide-react";
import { directus, Component, getFileUrl, ComponentType, Box, ComponentPackage } from "../lib/directus";
import { readItems, aggregate, updateItem, deleteItem } from "@directus/sdk";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { cn } from "../lib/utils";
import { toast } from "sonner";

export function Inventory() {
  const [components, setComponents] = useState<Component[]>([]);
  const [types, setTypes] = useState<ComponentType[]>([]);
  const [locations, setLocations] = useState<Box[]>([]);
  const [packages, setPackages] = useState<ComponentPackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const searchQuery = searchParams.get("q") || "";
  const filterParam = searchParams.get("filter");
  const categoryParam = searchParams.get("category");
  const locationParam = searchParams.get("location");
  const packageParam = searchParams.get("package");
  const [selectedCategories, setSelectedCategories] = useState<number[]>(
    categoryParam ? categoryParam.split(',').map(Number).filter(n => !isNaN(n)) : []
  );
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  
  const [selectedLocations, setSelectedLocations] = useState<string[]>(
    locationParam ? locationParam.split(',') : []
  );
  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);
  const locationDropdownRef = useRef<HTMLDivElement>(null);
  
  const [selectedPackages, setSelectedPackages] = useState<number[]>(
    packageParam ? packageParam.split(',').map(Number).filter(n => !isNaN(n)) : []
  );
  const [isPackageDropdownOpen, setIsPackageDropdownOpen] = useState(false);
  const packageDropdownRef = useRef<HTMLDivElement>(null);
  const [sortBy, setSortBy] = useState<'name' | 'quantity' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [criticalThreshold, setCriticalThreshold] = useState(10);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          if (data.criticalStockThreshold !== undefined) {
            setCriticalThreshold(data.criticalStockThreshold);
          }
        }
      } catch (e) {
        console.error("Failed to fetch settings", e);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    if (categoryParam) {
      setSelectedCategories(categoryParam.split(',').map(Number).filter(n => !isNaN(n)));
    } else {
      setSelectedCategories([]);
    }
    if (locationParam) {
      setSelectedLocations(locationParam.split(','));
    } else {
      setSelectedLocations([]);
    }
    if (packageParam) {
      setSelectedPackages(packageParam.split(',').map(Number).filter(n => !isNaN(n)));
    } else {
      setSelectedPackages([]);
    }
  }, [categoryParam, locationParam, packageParam]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(event.target as Node)) {
        setIsLocationDropdownOpen(false);
      }
      if (packageDropdownRef.current && !packageDropdownRef.current.contains(event.target as Node)) {
        setIsPackageDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setCurrentPage(1); // Reset to first page on filter change
  }, [searchQuery, selectedCategories, selectedLocations, selectedPackages, filterParam, sortBy, sortOrder]);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [fetchedTypes, fetchedLocations, fetchedPackages] = await Promise.all([
          directus.request(readItems('components_types', { limit: -1, sort: ['name'] })),
          directus.request(readItems('boxes', { limit: -1, sort: ['name'] })),
          directus.request(readItems('components_packages', { limit: -1, sort: ['name'] }))
        ]);
        
        setTypes(fetchedTypes as ComponentType[]);
        setLocations(fetchedLocations as Box[]);
        setPackages(fetchedPackages as ComponentPackage[]);
      } catch (error) {
        console.error("Error fetching options:", error);
      }
    };

    fetchOptions();
  }, []);

  useEffect(() => {
    const fetchComponents = async () => {
      setIsLoading(true);
      try {
        const filter: any = { _and: [] };

        if (searchQuery) {
          filter._and.push({
            _or: [
              { name: { _icontains: searchQuery } },
              { description: { _icontains: searchQuery } },
              { barcode: { _icontains: searchQuery } },
              { packet_reference: { _icontains: searchQuery } }
            ]
          });
        }

        if (selectedCategories.length > 0) {
          filter._and.push({ type: { _in: selectedCategories } });
        }

        if (selectedLocations.length > 0) {
          filter._and.push({ location: { _in: selectedLocations } });
        }

        if (selectedPackages.length > 0) {
          filter._and.push({ package: { _in: selectedPackages } });
        }

        if (filterParam === 'low_stock') {
          filter._and.push({ quantity_available: { _lte: criticalThreshold } });
        }

        const queryParams: any = {
          fields: ['*', 'type.*', 'package.*', 'location.*'] as any,
          sort: sortBy === 'name' ? (sortOrder === 'asc' ? 'name' : '-name') :
                sortBy === 'quantity' ? (sortOrder === 'asc' ? 'quantity_available' : '-quantity_available') :
                (sortOrder === 'asc' ? 'date_created' : '-date_created'),
          filter: filter._and.length > 0 ? filter : undefined,
          limit: itemsPerPage,
          page: currentPage
        };

        const [response, countResponse] = await Promise.all([
          directus.request(readItems('components', queryParams)),
          directus.request(aggregate('components', {
            query: { filter: filter._and.length > 0 ? filter : undefined },
            aggregate: { count: '*' }
          }))
        ]) as any;
        
        const data = Array.isArray(response) ? response : (response.data || []);
        const totalCount = Number(countResponse[0]?.count || 0);
        
        setComponents(data as unknown as Component[]);
        setTotalItems(totalCount);

        // Auto-redirect if single result matches barcode (only on first page search)
        if (searchQuery && data.length === 1 && currentPage === 1) {
            const item = data[0] as unknown as Component;
            if (item.barcode) {
                const barcodes = item.barcode.split(';').map(b => b.trim().toLowerCase());
                if (barcodes.includes(searchQuery.toLowerCase())) {
                     navigate(`/inventory/${item.id}`);
                }
            }
        }
      } catch (error) {
        console.error("Error fetching components:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchComponents();
  }, [searchQuery, selectedCategories, selectedLocations, selectedPackages, filterParam, sortBy, sortOrder, currentPage, navigate, criticalThreshold]);

  const getStatus = (quantity: number) => {
    if (quantity === 0) return { label: "Out of Stock", color: "bg-red-500 text-white", stockColor: "text-red-500 font-bold" };
    if (quantity <= criticalThreshold) return { label: "Low Stock", color: "bg-orange-500 text-white", stockColor: "text-orange-500 font-bold" };
    return { label: "Healthy", color: "bg-emerald-500 text-white", stockColor: "text-slate-500" };
  };

  const totalPages = Math.ceil(totalItems / itemsPerPage);

  const handleExport = () => {
    if (components.length === 0) return;

    const headers = ['ID', 'Name', 'Category', 'Quantity', 'Location', 'Description'];
    const csvContent = [
      headers.join(','),
      ...components.map(comp => {
        const categoryName = typeof comp.type === 'object' && comp.type ? comp.type.name : '';
        const locationName = typeof comp.location === 'object' && comp.location ? comp.location.name : '';
        
        return [
          comp.id,
          `"${comp.name.replace(/"/g, '""')}"`,
          `"${categoryName.replace(/"/g, '""')}"`,
          comp.quantity_available,
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

  const clearFilters = () => {
    setSelectedCategories([]);
    setSelectedLocations([]);
    setSelectedPackages([]);
    setSearchParams({});
  };

  const toggleCategory = (id: number) => {
    setSelectedCategories(prev => {
      const next = prev.includes(id) 
        ? prev.filter(i => i !== id) 
        : [...prev, id];
      
      // Update URL params
      setSearchParams(params => {
        if (next.length > 0) {
          params.set("category", next.join(','));
        } else {
          params.delete("category");
        }
        return params;
      });
      
      return next;
    });
  };

  const toggleLocation = (id: string) => {
    setSelectedLocations(prev => {
      const next = prev.includes(id) 
        ? prev.filter(i => i !== id) 
        : [...prev, id];
      
      // Update URL params
      setSearchParams(params => {
        if (next.length > 0) {
          params.set("location", next.join(','));
        } else {
          params.delete("location");
        }
        return params;
      });
      
      return next;
    });
  };

  const togglePackage = (id: number) => {
    setSelectedPackages(prev => {
      const next = prev.includes(id) 
        ? prev.filter(i => i !== id) 
        : [...prev, id];
      
      // Update URL params
      setSearchParams(params => {
        if (next.length > 0) {
          params.set("package", next.join(','));
        } else {
          params.delete("package");
        }
        return params;
      });
      
      return next;
    });
  };

  // Group categories by name
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  // Group categories by name
  const groupedCategories = types.reduce((acc, type) => {
    if (!acc[type.name]) {
      acc[type.name] = [];
    }
    acc[type.name].push(type);
    return acc;
  }, {} as Record<string, ComponentType[]>);

  const handleQuickStockUpdate = async (e: React.MouseEvent, id: number, currentQty: number, adjustment: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    const newQty = currentQty + adjustment;
    if (newQty < 0) {
      toast.error("Stock cannot be negative");
      return;
    }

    try {
      await directus.request(updateItem('components', id, {
        quantity_available: newQty
      }));
      setComponents(prev => prev.map(c => c.id === id ? { ...c, quantity_available: newQty } : c));
      toast.success(`Stock updated to ${newQty}`);
    } catch (error) {
      console.error("Error updating stock:", error);
      toast.error("Failed to update stock");
    }
  };

  const toggleItemSelection = (id: number) => {
    setSelectedItems(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = () => {
    setShowBulkDeleteModal(true);
  };

  const confirmBulkDelete = async () => {
    setIsBulkUpdating(true);
    try {
      for (const id of selectedItems) {
        await directus.request(deleteItem('components', id));
      }
      setComponents(prev => prev.filter(c => !selectedItems.includes(c.id)));
      setSelectedItems([]);
      toast.success("Bulk delete successful");
      setShowBulkDeleteModal(false);
    } catch (error) {
      console.error("Error in bulk delete:", error);
      toast.error("Some items could not be deleted");
    } finally {
      setIsBulkUpdating(false);
    }
  };

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
          <h1 className="text-3xl font-black tracking-tight">Component Inventory</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Manage your electronic stock and visual identification.
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <Download className="w-5 h-5" /> Export
          </button>
          <Link to="/inventory/add" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-semibold text-sm hover:brightness-110 transition-all shadow-lg shadow-primary/20">
            <Plus className="w-5 h-5" /> New Component
          </Link>
        </div>
      </div>

      {/* Filters & Controls */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-8 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4 justify-between">
          {/* Search & Filter Toggle */}
          <div className="flex gap-2 flex-1">
            <div className="relative flex-1 flex items-center">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                value={searchQuery}
                onChange={(e) => setSearchParams(prev => {
                  if (e.target.value) prev.set("q", e.target.value);
                  else prev.delete("q");
                  return prev;
                })}
                placeholder="Search components..."
                className="w-full pl-9 pr-10 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              />
              <button 
                onClick={() => setShowScanner(true)}
                className="absolute right-2 p-1.5 text-slate-400 hover:text-primary transition-colors sm:hidden"
                title="Scan with Camera"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2 rounded-lg border text-sm font-semibold flex items-center gap-2 transition-colors ${showFilters ? 'bg-primary/10 border-primary text-primary' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <Filter className="w-4 h-4" /> Filters
            </button>
          </div>

          {/* Pagination & Sort Controls */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1 mr-4 bg-slate-50 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30 transition-colors"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[10px] font-bold px-2 text-slate-500">
                Page {currentPage} of {totalPages || 1}
              </span>
              <button
                disabled={currentPage === totalPages || totalPages === 0}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30 transition-colors"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 mr-2">
              <Layers className="w-4 h-4 text-slate-400" />
              <select 
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[10px] font-bold outline-none focus:border-primary"
                title="Items per page"
              >
                <option value={10}>10 / page</option>
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase mr-2 hidden sm:inline-block">
              {totalItems} items found
            </span>
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium outline-none focus:border-primary"
            >
              <option value="date">Date Added</option>
              <option value="name">Name</option>
              <option value="quantity">Quantity</option>
            </select>
            <button 
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <ArrowUpDown className={`w-4 h-4 transition-transform ${sortOrder === 'asc' ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-4 animate-in slide-in-from-top-2 duration-200">
            <div className="relative" ref={categoryDropdownRef}>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Category</label>
              <button
                onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none focus:border-primary flex items-center justify-between min-h-[38px]"
              >
                <span className="truncate">
                  {selectedCategories.length === 0 
                    ? "All Categories" 
                    : selectedCategories.length === 1 
                      ? (() => {
                          const type = types.find(t => t.id === selectedCategories[0]);
                          return type ? `${type.name} - ${type.subcategory || type.name}` : "1 selected";
                        })()
                      : `${selectedCategories.length} selected`}
                </span>
                <ChevronDown className={cn("w-4 h-4 transition-transform", isCategoryDropdownOpen && "rotate-180")} />
              </button>
              
              {isCategoryDropdownOpen && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl max-h-60 overflow-y-auto p-1 animate-in fade-in slide-in-from-top-1">
                  <button
                    onClick={() => {
                      setSelectedCategories([]);
                      setSearchParams(p => { p.delete("category"); return p; });
                      setIsCategoryDropdownOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-md text-sm transition-colors mb-1",
                      selectedCategories.length === 0 ? "bg-primary/10 text-primary font-bold" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                    )}
                  >
                    All Categories
                  </button>
                  {Object.entries(groupedCategories).map(([name, subTypes]) => (
                    <div key={name} className="mb-2">
                      <div className="px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-md mb-1">
                        {name}
                      </div>
                      {subTypes.map(t => (
                        <button
                          key={t.id}
                          onClick={() => toggleCategory(t.id)}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between",
                            selectedCategories.includes(t.id) ? "bg-primary/10 text-primary font-bold" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                          )}
                        >
                          <span>{name} - {t.subcategory || t.name}</span>
                          {selectedCategories.includes(t.id) && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="relative" ref={locationDropdownRef}>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Location</label>
              <button
                onClick={() => setIsLocationDropdownOpen(!isLocationDropdownOpen)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none focus:border-primary flex items-center justify-between min-h-[38px]"
              >
                <span className="truncate">
                  {selectedLocations.length === 0 
                    ? "All Locations" 
                    : selectedLocations.length === 1 
                      ? locations.find(l => l.id === selectedLocations[0])?.name || "1 selected"
                      : `${selectedLocations.length} selected`}
                </span>
                <ChevronDown className={cn("w-4 h-4 transition-transform", isLocationDropdownOpen && "rotate-180")} />
              </button>
              
              {isLocationDropdownOpen && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl max-h-60 overflow-y-auto p-1 animate-in fade-in slide-in-from-top-1">
                  <button
                    onClick={() => {
                      setSelectedLocations([]);
                      setSearchParams(p => { p.delete("location"); return p; });
                      setIsLocationDropdownOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-md text-sm transition-colors mb-1",
                      selectedLocations.length === 0 ? "bg-primary/10 text-primary font-bold" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                    )}
                  >
                    All Locations
                  </button>
                  {locations.map(l => (
                    <button
                      key={l.id}
                      onClick={() => toggleLocation(l.id)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between",
                        selectedLocations.includes(l.id) ? "bg-primary/10 text-primary font-bold" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                      )}
                    >
                      <span>{l.name}</span>
                      {selectedLocations.includes(l.id) && <div className="w-2 h-2 rounded-full bg-primary" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative" ref={packageDropdownRef}>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Package</label>
              <button
                onClick={() => setIsPackageDropdownOpen(!isPackageDropdownOpen)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none focus:border-primary flex items-center justify-between min-h-[38px]"
              >
                <span className="truncate">
                  {selectedPackages.length === 0 
                    ? "All Packages" 
                    : selectedPackages.length === 1 
                      ? packages.find(p => p.id === selectedPackages[0])?.name || "1 selected"
                      : `${selectedPackages.length} selected`}
                </span>
                <ChevronDown className={cn("w-4 h-4 transition-transform", isPackageDropdownOpen && "rotate-180")} />
              </button>
              
              {isPackageDropdownOpen && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl max-h-60 overflow-y-auto p-1 animate-in fade-in slide-in-from-top-1">
                  <button
                    onClick={() => {
                      setSelectedPackages([]);
                      setSearchParams(p => { p.delete("package"); return p; });
                      setIsPackageDropdownOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-md text-sm transition-colors mb-1",
                      selectedPackages.length === 0 ? "bg-primary/10 text-primary font-bold" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                    )}
                  >
                    All Packages
                  </button>
                  {packages.map(p => (
                    <button
                      key={p.id}
                      onClick={() => togglePackage(p.id)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between",
                        selectedPackages.includes(p.id) ? "bg-primary/10 text-primary font-bold" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                      )}
                    >
                      <span>{p.name}</span>
                      {selectedPackages.includes(p.id) && <div className="w-2 h-2 rounded-full bg-primary" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="md:col-span-3 flex justify-end">
              <button 
                onClick={clearFilters}
                className="text-xs font-bold text-red-500 hover:text-red-600 flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear Filters
              </button>
            </div>
          </div>
        )}

        {/* Low Stock Filter Banner */}
        {filterParam === 'low_stock' && (
          <div className="mt-4 flex items-center justify-between bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3 text-sm text-orange-800 dark:text-orange-200 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              <span className="font-semibold">Filtering by Low Stock (≤ {criticalThreshold} units)</span>
            </div>
            <button 
              onClick={() => {
                const newParams = new URLSearchParams(searchParams);
                newParams.delete("filter");
                setSearchParams(newParams);
              }}
              className="text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-200 font-bold text-xs uppercase tracking-wider flex items-center gap-1 transition-colors"
            >
              Clear Filter <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6" id="inventory-grid">
        {isLoading ? (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin mb-4" />
            <p>Loading inventory...</p>
          </div>
        ) : components.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-400">
            <Package className="w-12 h-12 mb-4 opacity-20" />
            <p>{searchQuery ? `No components found matching "${searchQuery}"` : "No components found. Add your first one!"}</p>
            {(selectedCategories.length > 0 || selectedLocations.length > 0 || selectedPackages.length > 0) && (
              <button onClick={clearFilters} className="mt-4 text-primary text-sm font-bold hover:underline">
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          components.map((comp) => {
            const status = getStatus(comp.quantity_available);
            const categoryName = (comp.type as ComponentType)?.name || "Uncategorized";
            const subcategoryName = (comp.type as ComponentType)?.subcategory || "";
            
            return (
              <div key={comp.id} className="relative group">
                <div className="absolute top-3 left-3 z-20">
                  <input 
                    type="checkbox"
                    checked={selectedItems.includes(comp.id)}
                    onChange={() => toggleItemSelection(comp.id)}
                    className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity checked:opacity-100"
                  />
                </div>
                <Link
                  to={`/inventory/${comp.id}`}
                  className={cn(
                    "bg-white dark:bg-slate-900 rounded-xl overflow-hidden border transition-all shadow-sm block relative",
                    selectedItems.includes(comp.id) ? "border-primary ring-2 ring-primary/20" : "border-slate-200 dark:border-slate-800 hover:border-primary/50"
                  )}
                >
                  <div className="aspect-square w-full bg-slate-100 dark:bg-slate-800 relative">
                    <div
                      className="absolute inset-0 bg-cover bg-center group-hover:scale-105 transition-transform duration-500"
                      style={{ backgroundImage: `url('${getFileUrl(comp.main_image)}')` }}
                    ></div>
                    <div className="absolute top-3 right-3 z-10">
                      <span
                        className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${status.color}`}
                      >
                        {status.label}
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <p className={`text-[10px] font-bold uppercase tracking-tighter mb-1 text-primary truncate`}>
                      {categoryName}{subcategoryName ? ` - ${subcategoryName}` : ''}
                    </p>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate" title={comp.name}>{comp.name}</h3>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${status.stockColor}`}>{comp.quantity_available}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => handleQuickStockUpdate(e, comp.id, comp.quantity_available, -1)}
                            className="p-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <button 
                            onClick={(e) => handleQuickStockUpdate(e, comp.id, comp.quantity_available, 1)}
                            className="p-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-slate-400 hover:text-emerald-500 transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">#{comp.id}</span>
                    </div>
                  </div>
                </Link>
              </div>
            );
          })
        )}

        {/* Add Card - Only show when not searching */}
        {!searchQuery && (
          <Link to="/inventory/add" className="group border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl flex flex-col items-center justify-center p-8 hover:border-primary hover:bg-primary/5 transition-all cursor-pointer shadow-sm min-h-[280px]">
            <div className="size-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4 group-hover:bg-primary/20 group-hover:text-primary transition-colors">
              <Plus className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-500 group-hover:text-primary">Add Component</p>
          </Link>
        )}
      </div>

      {/* Pagination */}
      <div className="mt-12 flex flex-wrap items-center justify-center gap-2">
        <button
          disabled={currentPage === 1}
          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
          className="px-3 sm:px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-sm font-bold disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 sm:gap-2"
        >
          <ChevronLeft className="w-4 h-4" /> <span className="hidden sm:inline">Previous</span>
        </button>
        <div className="flex flex-wrap items-center justify-center gap-1">
          {totalPages > 0 ? Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum = currentPage;
            if (currentPage <= 3) pageNum = i + 1;
            else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
            else pageNum = currentPage - 2 + i;
            
            if (pageNum < 1 || pageNum > totalPages) return null;

            return (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                className={`size-10 rounded-lg flex items-center justify-center text-sm font-bold transition-all ${currentPage === pageNum ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'}`}
              >
                {pageNum}
              </button>
            );
          }) : (
            <button
              disabled
              className="size-10 rounded-lg flex items-center justify-center text-sm font-bold bg-primary text-white shadow-lg shadow-primary/20"
            >
              1
            </button>
          )}
        </div>
        <button
          disabled={currentPage === totalPages || totalPages === 0}
          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
          className="px-3 sm:px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-sm font-bold disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 sm:gap-2"
        >
          <span className="hidden sm:inline">Next</span> <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Bulk Delete Confirmation Modal */}
      <AnimatePresence>
        {showBulkDeleteModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isBulkUpdating && setShowBulkDeleteModal(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              <div className="p-6">
                <div className="size-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                  <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Confirm Bulk Deletion</h3>
                <p className="text-slate-500 dark:text-slate-400 mb-6">
                  Are you sure you want to delete <span className="font-bold text-red-500">{selectedItems.length}</span> components? This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    disabled={isBulkUpdating}
                    onClick={() => setShowBulkDeleteModal(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={isBulkUpdating}
                    onClick={confirmBulkDelete}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isBulkUpdating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Deleting...
                      </>
                    ) : (
                      "Delete Items"
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Barcode Scanner Modal */}
      {showScanner && (
        <BarcodeScanner 
          onScan={(decodedText) => {
            setSearchParams(prev => {
              prev.set("q", decodedText);
              return prev;
            });
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
      {/* Bulk Actions Bar */}
      {selectedItems.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-8 duration-300 border border-slate-800">
          <div className="flex items-center gap-3 pr-6 border-r border-slate-700">
            <div className="size-8 bg-primary rounded-lg flex items-center justify-center font-bold">
              {selectedItems.length}
            </div>
            <span className="text-sm font-bold">Items Selected</span>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSelectedItems([])}
              className="text-sm font-bold text-slate-400 hover:text-white transition-colors"
            >
              Deselect All
            </button>
            <button 
              onClick={handleBulkDelete}
              disabled={isBulkUpdating}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white font-bold text-sm transition-all disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        </div>
      )}
    </motion.main>
  );
}
