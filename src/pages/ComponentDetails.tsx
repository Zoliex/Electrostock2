import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import Viewer from 'viewerjs';
import 'viewerjs/dist/viewer.css';
import {
  Edit2,
  PlusSquare,
  ChevronRight,
  ChevronLeft,
  Cpu,
  Package,
  MapPin,
  Tag,
  QrCode,
  FileText,
  ShoppingCart,
  History,
  Share2,
  Copy,
  Trash2,
  Loader2,
  Printer,
  Zap,
  X,
  Check,
  File,
  Image as ImageIcon,
  ExternalLink,
  Download,
  Paperclip,
  Maximize2
} from "lucide-react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { directus, Component, getFileUrl, ComponentType, Box, ComponentPackage } from "../lib/directus";
import { readItem, readItems, deleteItem, updateItem } from "@directus/sdk";
import MDEditor from '@uiw/react-md-editor';
import BarcodeGenerator from "react-barcode";
import { toast } from "sonner";
import { FicheroBatchMode } from "../components/FicheroBatchMode";

export function ComponentDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [component, setComponent] = useState<Component | null>(null);
  const [relatedComponents, setRelatedComponents] = useState<Component[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockAdjustment, setStockAdjustment] = useState<number>(0);
  const [isUpdating, setIsUpdating] = useState(false);
  const [criticalThreshold, setCriticalThreshold] = useState(10);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [lowResImageIds, setLowResImageIds] = useState<string[]>([]);
  const [printModalBarcode, setPrintModalBarcode] = useState<string | null>(null);
  const [printMode, setPrintMode] = useState<'pdf' | 'fichero'>('pdf');
  const viewerRef = useRef<HTMLDivElement>(null);
  const viewerInstance = useRef<Viewer | null>(null);

  const openViewer = (index: number) => {
    if (viewerInstance.current) {
      viewerInstance.current.view(index);
    }
  };

  useEffect(() => {
    setActiveImageIndex(0);
    setLowResImageIds([]);
  }, [id]);

  const getFileData = (
    f: any
  ): { id: string | null; title: string | null; width?: number | null; height?: number | null } => {
    if (!f) return { id: null, title: null };
    const fileObj = f.directus_files_id || f;
    if (typeof fileObj === 'object' && fileObj !== null) {
      return {
        id: fileObj.id || null,
        title: fileObj.title || fileObj.filename_download || null,
        width: fileObj.width ?? null,
        height: fileObj.height ?? null
      };
    }
    return { id: typeof fileObj === 'string' ? fileObj : null, title: null };
  };

  const allImages = component
    ? [
        {
          id:
            typeof component.main_image === 'object' && component.main_image
              ? (component.main_image as any).id
              : component.main_image,
          title: 'Main Image',
          width: null,
          height: null
        },
        ...((component as any).other_images?.map(getFileData) || []),
        ...((component as any).components_files?.map(getFileData) || [])
      ].filter((val, index, self) => {
        if (!val.id) return false;
        if (self.findIndex((v) => v.id === val.id) !== index) return false;
        // Filter out additional images that are low-resolution thumbnail previews (< 250px)
        if (index > 0) {
          if (lowResImageIds.includes(val.id)) return false;
          if (
            (val.width && Number(val.width) > 0 && Number(val.width) < 250) ||
            (val.height && Number(val.height) > 0 && Number(val.height) < 250)
          ) {
            return false;
          }
        }
        return true;
      })
    : [];

  useEffect(() => {
    if (activeImageIndex >= allImages.length && allImages.length > 0) {
      setActiveImageIndex(0);
    }
  }, [allImages.length, activeImageIndex]);

  const allFiles = component ? [
    ...((component as any).other_files || []),
    ...((component as any).components_files_1 || [])
  ].map(getFileData).filter((f) => f.id !== null) : [];

  useEffect(() => {
    if (viewerRef.current && allImages.length > 0) {
      if (viewerInstance.current) {
        viewerInstance.current.destroy();
      }
      viewerInstance.current = new Viewer(viewerRef.current, {
        url: 'src',
        toolbar: {
          zoomIn: 4,
          zoomOut: 4,
          oneToOne: 4,
          reset: 4,
          prev: 4,
          play: {
            show: 4,
            size: 'large',
          },
          next: 4,
          rotateLeft: 4,
          rotateRight: 4,
          flipHorizontal: 4,
          flipVertical: 4,
        },
      });
    }
    return () => {
      if (viewerInstance.current) {
        viewerInstance.current.destroy();
        viewerInstance.current = null;
      }
    };
  }, [allImages]);

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

  const fetchComponent = async () => {
    if (!id) return;
    try {
      const fetchedComponent = await directus.request(
        readItem('components', Number(id), {
          fields: [
            '*', 
            'type.*', 
            'package.*', 
            'location.*', 
            'other_images.directus_files_id.*', 
            'other_files.directus_files_id.*',
            'components_files.directus_files_id.*', 
            'components_files_1.directus_files_id.*'
          ] as any
        })
      );
      setComponent(fetchedComponent as unknown as Component);

      // Fetch related components
      if (fetchedComponent.type) {
        const relatedRes = await directus.request(
          readItems('components', {
            filter: {
              type: { _eq: (fetchedComponent.type as any).id },
              id: { _neq: Number(id) }
            },
            limit: 4,
            fields: ['id', 'name', 'main_image', 'quantity_available', 'type.*'] as any
          })
        );
        setRelatedComponents(relatedRes as unknown as Component[]);
      }
    } catch (error) {
      console.error("Error fetching component details:", error);
      toast.error("Failed to load component details");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchComponent();
  }, [id]);

  const handleDelete = async () => {
    if (!id) return;
    try {
      await directus.request(deleteItem('components', Number(id)));
      toast.success("Component deleted successfully");
      navigate("/inventory");
    } catch (error) {
      console.error("Error deleting component:", error);
      toast.error("Failed to delete component");
    }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied to clipboard");
  };

  const handleUpdateStock = async () => {
    if (!component || !id) return;
    
    // If adjustment is 0, do nothing
    if (stockAdjustment === 0) {
        setShowStockModal(false);
        return;
    }

    const currentQuantity = Number(component.quantity_available) || 0;
    const newQuantity = currentQuantity + stockAdjustment;
    
    if (newQuantity < 0) {
        toast.error("Cannot reduce stock below zero");
        return;
    }

    setIsUpdating(true);
    try {
      await directus.request(updateItem('components', Number(id), {
        quantity_available: newQuantity
      }));
      
      setComponent(prev => prev ? ({ ...prev, quantity_available: newQuantity }) : null);
      toast.success("Stock updated successfully");
      setShowStockModal(false);
      setStockAdjustment(0);
    } catch (error) {
      console.error("Error updating stock:", error);
      toast.error("Failed to update stock");
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin mb-4" />
        <p>Loading component details...</p>
      </div>
    );
  }

  if (!component) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-400">
        <Package className="w-12 h-12 mb-4 opacity-20" />
        <p>Component not found.</p>
        <Link to="/inventory" className="mt-4 text-primary hover:underline">Return to Inventory</Link>
      </div>
    );
  }

  const categoryName = (component.type as ComponentType)?.name || "Uncategorized";
  const subcategoryName = (component.type as ComponentType)?.subcategory || "";
  const locationName = (component.location as Box)?.name || "Unknown Location";
  const locationId = (component.location as Box)?.unique_id || "N/A";
  const packageName = (component.package as ComponentPackage)?.name || "Unknown Package";

  const handlePrint = () => {
    window.print();
  };

  return (
    <motion.main 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 relative"
    >
      <style>
        {`
          @media print {
            body * { visibility: hidden !important; }
            #modal-print-container, #modal-print-container * {
              visibility: visible !important;
            }
            #modal-print-container {
              position: fixed;
              left: 50%;
              top: 50%;
              transform: translate(-50%, -50%);
              width: 100vw;
              height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 0 !important;
              margin: 0 !important;
              background: white !important;
              border: none !important;
              box-shadow: none !important;
            }
            @page { size: A4; margin: 0; }
          }
        `}
      </style>
      {/* Breadcrumbs & Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-black tracking-tight">{component.name}</h1>
          <p className="text-slate-500 dark:text-slate-400">Technical specifications and inventory status.</p>
        </div>
        <div className="flex gap-3">
          <Link to={`/inventory/edit/${component.id}`} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            <Edit2 className="w-4 h-4" /> Edit
          </Link>
          <button 
            onClick={() => setShowStockModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-semibold text-sm hover:brightness-110 transition-all shadow-lg shadow-primary/20"
          >
            <PlusSquare className="w-4 h-4" /> Update Stock
          </button>
        </div>
      </div>

      <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-8">
        <Link to="/inventory" className="hover:text-primary transition-colors">
          Inventory
        </Link>
        <ChevronRight className="w-4 h-4" />
        <Link to={`/inventory?category=${(component.type as ComponentType)?.id || ''}`} className="hover:text-primary cursor-pointer transition-colors">
          {categoryName}{subcategoryName ? ` - ${subcategoryName}` : ''}
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-slate-900 dark:text-slate-100 font-medium">{component.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Product Image & Basic Info */}
        <div className="lg:col-span-2 space-y-8">
          {/* Hero Section */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800">
            <div ref={viewerRef} className="aspect-video w-full relative bg-slate-100 dark:bg-slate-800 rounded-t-3xl overflow-hidden group/carousel">
              {/* Hidden list of all images for ViewerJS to pick up */}
              <div className="hidden">
                {allImages.map((img, idx) => (
                  <img
                    key={img.id || idx}
                    src={getFileUrl(img.id!)}
                    alt={img.title || `${component.name} - ${idx}`}
                    onLoad={(e) => {
                      if (idx > 0 && img.id) {
                        const { naturalWidth, naturalHeight } = e.currentTarget;
                        if (
                          (naturalWidth > 0 && naturalWidth < 250) ||
                          (naturalHeight > 0 && naturalHeight < 250)
                        ) {
                          setLowResImageIds((prev) =>
                            prev.includes(img.id!) ? prev : [...prev, img.id!]
                          );
                        }
                      }
                    }}
                  />
                ))}
              </div>

              <AnimatePresence mode="wait">
                <motion.img
                  key={allImages[activeImageIndex]?.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.2}
                  onDragEnd={(_, info) => {
                    if (allImages.length <= 1) return;
                    const threshold = 50;
                    if (info.offset.x > threshold) {
                      setActiveImageIndex(prev => (prev - 1 + allImages.length) % allImages.length);
                    } else if (info.offset.x < -threshold) {
                      setActiveImageIndex(prev => (prev + 1) % allImages.length);
                    }
                  }}
                  alt={component.name}
                  className="absolute inset-0 w-full h-full object-contain cursor-grab active:cursor-grabbing"
                  src={allImages.length > 0 ? getFileUrl(allImages[activeImageIndex].id!) : "https://via.placeholder.com/800x400?text=No+Image"}
                  referrerPolicy="no-referrer"
                  onClick={() => openViewer(activeImageIndex)}
                />
              </AnimatePresence>

              <div className="absolute top-4 left-4 z-10">
                <div className="px-3 py-1.5 rounded-xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border border-white/20 shadow-lg">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {allImages[activeImageIndex]?.title || `Image ${activeImageIndex + 1}`}
                  </span>
                  <span className="text-[10px] ml-2 text-slate-400 font-mono">
                    {activeImageIndex + 1} / {allImages.length}
                  </span>
                </div>
              </div>

              <button 
                onClick={() => openViewer(activeImageIndex)}
                className="absolute top-4 right-4 size-10 rounded-xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-center text-slate-900 dark:text-white shadow-lg opacity-0 group-hover/carousel:opacity-100 transition-opacity z-10"
                title="Enlarge Image"
              >
                <Maximize2 className="w-5 h-5" />
              </button>
              
              {allImages.length > 1 && (
                <>
                  <button 
                    onClick={() => setActiveImageIndex(prev => (prev - 1 + allImages.length) % allImages.length)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 size-10 rounded-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-center text-slate-900 dark:text-white shadow-lg opacity-0 group-hover/carousel:opacity-100 transition-opacity"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button 
                    onClick={() => setActiveImageIndex(prev => (prev + 1) % allImages.length)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 size-10 rounded-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-center text-slate-900 dark:text-white shadow-lg opacity-0 group-hover/carousel:opacity-100 transition-opacity"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {allImages.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveImageIndex(idx)}
                        className={`size-2 rounded-full transition-all ${activeImageIndex === idx ? 'bg-primary w-4' : 'bg-white/50 hover:bg-white'}`}
                      />
                    ))}
                  </div>
                </>
              )}
              
              <div className="absolute bottom-4 right-4 flex gap-2 z-10">
                {component.quantity_available === 0 ? (
                  <span className="px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-full shadow-sm">
                    OUT OF STOCK
                  </span>
                ) : component.quantity_available <= criticalThreshold ? (
                  <span className="px-3 py-1 bg-orange-500 text-white text-xs font-bold rounded-full shadow-sm">
                    LOW STOCK
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-emerald-500 text-white text-xs font-bold rounded-full shadow-sm">
                    IN STOCK
                  </span>
                )}
                {component.keywords && (Array.isArray(component.keywords) ? component.keywords.length > 0 : typeof (component.keywords as any) === 'string' && (component.keywords as any).trim().length > 0) && (
                  <span className="px-3 py-1 bg-primary text-white text-xs font-bold rounded-full shadow-sm">
                    {Array.isArray(component.keywords) ? component.keywords[0] : String(component.keywords).split(',')[0].trim()}
                  </span>
                )}
              </div>
            </div>

            {/* Existing Images Thumbnail Strip Directly Underneath the Displayed Image */}
            {allImages.length > 0 && (
              <div className="px-6 py-4 bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 overflow-x-auto">
                {allImages.map((img, idx) => {
                  const isSelected = activeImageIndex === idx;
                  return (
                    <button
                      key={img.id || idx}
                      type="button"
                      onClick={() => setActiveImageIndex(idx)}
                      onDoubleClick={() => openViewer(idx)}
                      title={img.title || `Image ${idx + 1} (click to view, double-click to enlarge)`}
                      className={`group/thumb relative shrink-0 w-20 h-20 rounded-2xl overflow-hidden border-2 transition-all cursor-pointer bg-white dark:bg-slate-900 p-0 ${
                        isSelected
                          ? "border-primary ring-2 ring-primary/25 shadow-md scale-[1.02]"
                          : "border-slate-200 dark:border-slate-700 opacity-70 hover:opacity-100 hover:border-slate-400 dark:hover:border-slate-500"
                      }`}
                    >
                      <img
                        src={getFileUrl(img.id!)}
                        alt={img.title || `${component.name} - ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover block"
                      />
                      <span
                        className={`absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold shadow-sm ${
                          isSelected
                            ? "bg-primary text-white"
                            : "bg-slate-900/75 text-white"
                        }`}
                      >
                        {idx + 1}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="p-8">
              <h1 className="text-4xl font-black mb-6 tracking-tight text-slate-900 dark:text-white">
                {component.name}
              </h1>
              <div className="prose dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 text-base leading-relaxed space-y-4 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:overflow-hidden [&_th]:bg-slate-100 dark:[&_th]:bg-slate-800 [&_th]:text-slate-800 dark:[&_th]:text-slate-200 [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wider [&_td]:px-4 [&_td]:py-2.5 [&_td]:border-t [&_td]:border-slate-200 dark:[&_td]:border-slate-800 [&_tr]:bg-transparent!">
                <MDEditor.Markdown
                  source={(() => {
                    const raw = (component.description || "*No description provided.*").trim();
                    const lines = raw.split(/\r?\n/);
                    const cleaned: string[] = [];
                    let inTechSpecs = false;
                    let techSpecTableStarted = false;

                    for (let i = 0; i < lines.length; i++) {
                      const line = lines[i].trim();

                      // Skip duplicate top-level heading that repeats the component name
                      if (
                        i === 0 &&
                        /^#{1,3}\s+/.test(line) &&
                        line.replace(/^#{1,3}\s+/, "").trim().toLowerCase() ===
                          (component.name || "").trim().toLowerCase()
                      ) {
                        cleaned.push("### Component Overview");
                        continue;
                      }

                      if (/^###\s+Technical Specifications/i.test(line)) {
                        inTechSpecs = true;
                        techSpecTableStarted = false;
                        cleaned.push(lines[i]);
                        continue;
                      } else if (/^#{1,4}\s+/.test(line)) {
                        inTechSpecs = false;
                      }

                      // Convert "- **Param**: Value" under Technical Specifications into a Markdown table
                      if (inTechSpecs && /^-\s+\*\*([^*]+)\*\*\s*:\s*(.+)$/.test(line)) {
                        const match = line.match(/^-\s+\*\*([^*]+)\*\*\s*:\s*(.+)$/);
                        if (match) {
                          if (!techSpecTableStarted) {
                            cleaned.push("| Parameter | Specification |");
                            cleaned.push("| :--- | :--- |");
                            techSpecTableStarted = true;
                          }
                          cleaned.push(`| **${match[1].trim()}** | ${match[2].trim().replace(/、/g, ", ")} |`);
                          continue;
                        }
                      }

                      // Convert bare "**Key**: Value" lines into markdown list items so they don't collapse on one line
                      if (/^\*\*[^*]+\*\*\s*:/.test(line)) {
                        cleaned.push(`- ${line}`);
                      } else {
                        cleaned.push(lines[i]);
                      }
                    }

                    return cleaned.join("\n").trim() || "*No description provided.*";
                  })()}
                  style={{ backgroundColor: "transparent", color: "inherit" }}
                />
              </div>
            </div>
          </div>

          {/* Technical Specs */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-slate-200 dark:border-slate-800">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Cpu className="w-6 h-6 text-primary" />
              Technical Specifications
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Package</p>
                <p className="font-semibold">{packageName}</p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Category</p>
                <p className="font-semibold">{categoryName}</p>
              </div>
              {subcategoryName && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Subcategory</p>
                  <p className="font-semibold">{subcategoryName}</p>
                </div>
              )}
              {component.keywords && (Array.isArray(component.keywords) ? component.keywords : (typeof component.keywords === 'string' ? (component.keywords as string).split(',') : [])).map((keyword, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Tag {idx + 1}</p>
                  <p className="font-semibold">{typeof keyword === 'string' ? keyword.trim() : keyword}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Additional Assets Section */}
          {allFiles.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-slate-200 dark:border-slate-800">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Paperclip className="w-6 h-6 text-primary" />
                Additional Documents & Files
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {allFiles.map((file: any, idx: number) => {
                  if (!file.id) return null;
                  return (
                    <a 
                      key={idx} 
                      href={getFileUrl(file.id)} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 hover:border-primary transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="size-12 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors shadow-sm">
                          <File className="w-6 h-6" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate max-w-[200px]">
                            {file.title || `Document ${idx + 1}`}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                            PDF / DOC / ZIP
                          </span>
                        </div>
                      </div>
                      <div className="size-8 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center text-slate-300 group-hover:text-primary transition-colors border border-slate-100 dark:border-slate-700">
                        <Download className="w-4 h-4" />
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Inventory & Actions */}
        <div className="space-y-6">
          {/* Inventory Status Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold mb-4">Inventory Status</h3>
            <div className="bg-primary/5 dark:bg-primary/10 rounded-2xl p-4 mb-4 flex items-center justify-between border border-primary/20">
              <div>
                <p className="text-xs text-primary font-bold uppercase tracking-wider mb-1">Total Available</p>
                <p className="text-4xl font-black text-primary">
                  {component.quantity_available} <span className="text-sm font-medium">units</span>
                </p>
              </div>
              <div className="size-12 bg-primary text-white rounded-xl flex items-center justify-center">
                <Package className="w-6 h-6" />
              </div>
            </div>

            {/* Unit Price Paid & Total Stock Cost */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Unit Price Paid
                </p>
                <p className="text-base font-black font-mono text-slate-900 dark:text-white">
                  {component.price !== null && component.price !== undefined && !isNaN(Number(component.price))
                    ? `€${Number(component.price) < 1 && Number(component.price) > 0 ? Number(component.price).toFixed(4).replace(/0+$/, "").replace(/\.$/, ".00") : Number(component.price).toFixed(2)}`
                    : "N/A"}
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">
                  Stock Cost
                </p>
                <p className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400">
                  {component.price !== null && component.price !== undefined && !isNaN(Number(component.price))
                    ? `€${(Number(component.price) * (Number(component.quantity_available) || 0)).toFixed(2)}`
                    : "N/A"}
                </p>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-slate-400 shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">Warehouse Location</p>
                  <p className="text-sm font-semibold font-mono">{locationName} ({locationId})</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Tag className="w-5 h-5 text-slate-400 shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">Packet Reference (LCSC / MPN)</p>
                  <p className="text-sm font-semibold font-mono">{component.packet_reference || "N/A"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <QrCode className="w-5 h-5 text-slate-400 shrink-0" />
                <div className="w-full">
                  <p className="text-xs text-slate-500">Barcodes</p>
                  <div className="flex flex-col gap-4 mt-3 mb-3">
                    {component.barcode ? (
                      (typeof component.barcode === 'string' ? component.barcode : String(component.barcode)).split(';').filter(b => b.trim()).map((code, idx) => (
                        <div key={idx} className="group relative">
                          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center gap-3 transition-all hover:shadow-md hover:border-primary/50">
                            <div className="flex justify-between items-start w-full">
                              <div className="flex items-center gap-1.5">
                                <Zap className="w-3.5 h-3.5 text-orange-500" />
                                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">ElectroStock</span>
                              </div>
                              <span className="text-[8px] font-mono text-slate-400 dark:text-slate-500">v2.4.0</span>
                            </div>
                            
                            <div className="w-full flex flex-col items-center justify-center bg-white dark:bg-white rounded-lg p-3 border border-slate-100 dark:border-slate-200">
                              <BarcodeGenerator value={code} height={40} displayValue={false} background="transparent" width={1.5} margin={0} />
                              <div className="text-center text-[10px] font-mono mt-2 tracking-[0.2em] font-bold text-slate-900">{code}</div>
                            </div>

                            <button 
                              onClick={() => setPrintModalBarcode(code)} 
                              className="absolute top-2 right-2 p-2 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-primary hover:border-primary transition-all opacity-0 group-hover:opacity-100 shadow-sm"
                              title="Print Barcode"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm font-semibold font-mono text-slate-400">N/A</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
              {component.datasheet && (
                <a 
                  href={getFileUrl(typeof component.datasheet === 'object' && component.datasheet ? (component.datasheet as any).id : component.datasheet)} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full py-3 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                >
                  <FileText className="w-5 h-5" />
                  View Datasheet
                </a>
              )}
              {component.url && (
                <a 
                  href={component.url.startsWith('http') ? component.url : `https://${component.url}`}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <ShoppingCart className="w-5 h-5" />
                  Source Link
                </a>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              <Link to={`/inventory/edit/${component.id}`} className="flex flex-col items-center justify-center p-4 rounded-2xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <Edit2 className="w-5 h-5 text-slate-400 mb-2" />
                <span className="text-xs font-bold">Edit</span>
              </Link>
              <button 
                onClick={handleShare}
                className="flex flex-col items-center justify-center p-4 rounded-2xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Share2 className="w-5 h-5 text-slate-400 mb-2" />
                <span className="text-xs font-bold">Share</span>
              </button>
              <button 
                onClick={() => navigate(`/inventory/add?clone=${component.id}`)}
                className="flex flex-col items-center justify-center p-4 rounded-2xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Copy className="w-5 h-5 text-slate-400 mb-2" />
                <span className="text-xs font-bold">Clone</span>
              </button>
              <button 
                onClick={() => setShowDeleteModal(true)}
                className="flex flex-col items-center justify-center p-4 rounded-2xl border border-red-500/10 hover:bg-red-500/10 transition-colors group"
              >
                <Trash2 className="w-5 h-5 text-red-500/50 group-hover:text-red-500 mb-2 transition-colors" />
                <span className="text-xs font-bold text-red-500/50 group-hover:text-red-500 transition-colors">
                  Delete
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Related Components Section */}
      {relatedComponents.length > 0 && (
        <div className="mt-12">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" />
            Similar Components
          </h3>
          <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-4 hide-scrollbar">
            {relatedComponents.map((item) => (
              <Link
                key={item.id}
                to={`/inventory/${item.id}`}
                className="snap-start shrink-0 w-[240px] md:w-[280px] bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 hover:border-primary transition-all group shadow-sm hover:shadow-md"
              >
                <div className="aspect-square rounded-xl bg-slate-100 dark:bg-slate-800 mb-4 overflow-hidden relative">
                  <img
                    src={item.main_image ? getFileUrl(item.main_image) : "https://via.placeholder.com/400x400?text=No+Image"}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-2 right-2">
                    {item.quantity_available > 0 ? (
                      <span className="px-2 py-0.5 bg-emerald-500 text-white text-[10px] font-bold rounded-full shadow-sm">
                        {item.quantity_available} IN STOCK
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full shadow-sm">
                        OUT
                      </span>
                    )}
                  </div>
                </div>
                <h4 className="font-bold text-slate-900 dark:text-white text-sm truncate">{item.name}</h4>
                <p className="text-xs text-slate-500 mt-1 truncate">{(item.type as ComponentType)?.name || "Uncategorized"}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Delete Component?</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
              Are you sure you want to delete <strong>{component.name}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Update Modal */}
      {showStockModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Update Stock</h3>
                <button onClick={() => setShowStockModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                    <X className="w-5 h-5" />
                </button>
            </div>
            
            <div className="flex items-center justify-center gap-4 mb-6">
                <button 
                    onClick={() => setStockAdjustment(prev => prev - 1)}
                    className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-xl"
                >
                    -
                </button>
                <div className="flex flex-col items-center w-24">
                    <span className="text-3xl font-black text-slate-900 dark:text-white">
                        {(Number(component.quantity_available) || 0) + stockAdjustment}
                    </span>
                    <span className={`text-xs font-bold ${stockAdjustment > 0 ? 'text-emerald-500' : stockAdjustment < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                        {stockAdjustment > 0 ? `+${stockAdjustment}` : stockAdjustment}
                    </span>
                </div>
                <button 
                    onClick={() => setStockAdjustment(prev => prev + 1)}
                    className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-xl"
                >
                    +
                </button>
            </div>

            <div className="flex gap-2 mb-6">
                <button onClick={() => setStockAdjustment(prev => prev + 5)} className="flex-1 py-1 text-xs font-bold bg-slate-50 dark:bg-slate-800/50 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">+5</button>
                <button onClick={() => setStockAdjustment(prev => prev + 10)} className="flex-1 py-1 text-xs font-bold bg-slate-50 dark:bg-slate-800/50 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">+10</button>
                <button onClick={() => setStockAdjustment(prev => prev - 5)} className="flex-1 py-1 text-xs font-bold bg-slate-50 dark:bg-slate-800/50 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">-5</button>
            </div>

            <button
              onClick={handleUpdateStock}
              disabled={isUpdating}
              className="w-full py-3 rounded-xl text-sm font-bold bg-primary text-white hover:brightness-110 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
            >
              {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Confirm Update
            </button>
          </div>
        </div>
      )}

      {/* Unified Print Selection Modal */}
      {printModalBarcode && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4 no-print">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-[90vw] h-[90vh] max-w-6xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col overflow-hidden">
            <div className="flex flex-col md:flex-row gap-4 md:gap-0 justify-between items-center px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
                <div className="flex flex-wrap items-center gap-4 w-full md:w-auto overflow-x-auto">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white shrink-0">Imprimer Étiquette</h3>
                  <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg shrink-0">
                    <button onClick={() => setPrintMode('pdf')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${printMode === 'pdf' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>PDF (A4)</button>
                    <button onClick={() => setPrintMode('fichero')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${printMode === 'fichero' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>Thermique</button>
                  </div>
                </div>
                <button onClick={() => setPrintModalBarcode(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0 self-end md:self-auto ml-auto">
                    <X className="w-5 h-5" />
                </button>
            </div>
            
            <div className="flex-1 w-full h-[calc(100%-73px)] relative bg-slate-100 dark:bg-slate-900/50 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
               {printMode === 'fichero' ? (
                 <FicheroBatchMode barcodes={[printModalBarcode]} />
               ) : (
                 <div className="w-full h-full flex flex-col items-center justify-center p-8 overflow-y-auto relative">
                    <p className="text-slate-500 mb-8 max-w-sm text-center">
                      Le code-barres sera centré automatiquement sur la page A4 lors de l'impression physique.
                    </p>
                    <div id="modal-print-container" className="bg-white dark:bg-white p-12 border border-slate-300 flex flex-col items-center justify-center relative min-w-[300px] min-h-[150px] shadow-sm print:shadow-none print:border-none">
                      <div className="flex justify-between items-start mb-4 w-[250px]">
                        <div className="flex items-center gap-1.5">
                          <Zap className="w-4 h-4 text-orange-500" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">ElectroStock</span>
                        </div>
                        <span className="text-[9px] font-mono text-slate-500">v2.4.0</span>
                      </div>
                      <div className="flex flex-col items-center justify-center w-[250px]">
                        <BarcodeGenerator value={printModalBarcode} height={50} displayValue={false} background="transparent" width={1.8} margin={0} />
                        <div className="text-center text-xs font-mono mt-2 tracking-[0.2em] font-bold text-slate-900">{printModalBarcode}</div>
                      </div>
                    </div>
                    <div className="mt-8 no-print">
                      <button onClick={() => window.print()} className="bg-primary hover:bg-primary/90 text-white font-bold py-3 px-8 rounded-xl shadow-lg flex items-center gap-2 transition-all">
                        <Printer className="w-5 h-5" /> Lancer l'impression A4
                      </button>
                    </div>
                 </div>
               )}
            </div>
          </div>
        </div>
      )}
    </motion.main>
  );
}
