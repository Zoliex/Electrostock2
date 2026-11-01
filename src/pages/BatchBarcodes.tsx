import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "motion/react";
import { Download, ChevronDown, Zap, Printer, Loader2, RefreshCw } from "lucide-react";
import BarcodeGenerator from "react-barcode";
import jsPDF from "jspdf";
import { toPng, toJpeg } from "html-to-image";
import { directus } from "../lib/directus";
import { readItems } from "@directus/sdk";
import { toast } from "sonner";
import { FicheroBatchMode } from "../components/FicheroBatchMode";

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: any) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  render() { 
    if (this.state.hasError) return <div style={{padding:20, color:'red', background:'black'}}><pre>CRASH: {this.state.error?.message}</pre><pre>{this.state.error?.stack}</pre></div>; 
    return this.props.children; 
  }
}

export function BatchBarcodes() {
  const [printMode, setPrintMode] = useState<'pdf' | 'fichero'>('pdf');
  const [ficheroCount, setFicheroCount] = useState(1);
  const [labelsPerPage, setLabelsPerPage] = useState(24);
  const [pages, setPages] = useState(1);
  const [showCutLines, setShowCutLines] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [barcodes, setBarcodes] = useState<string[]>([]);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

  const generateRandomBarcode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const generateAndCheckBarcodes = useCallback(async () => {
    setIsCheckingDuplicates(true);
    const totalLabels = printMode === 'pdf' ? (labelsPerPage * pages) : ficheroCount;
    let currentBarcodes = Array.from({ length: totalLabels }, () => generateRandomBarcode());
    let hasDuplicates = true;
    let attempts = 0;
    const maxAttempts = 5;

    while (hasDuplicates && attempts < maxAttempts) {
      attempts++;
      try {
        // 1. Fix internal duplicates first
        const seen = new Set<string>();
        let hasInternalDuplicates = false;
        
        // Check for internal duplicates
        const uniqueSet = new Set(currentBarcodes);
        if (uniqueSet.size !== currentBarcodes.length) {
            hasInternalDuplicates = true;
            currentBarcodes = currentBarcodes.map(code => {
                let newCode = code;
                while (seen.has(newCode)) {
                    newCode = generateRandomBarcode();
                }
                seen.add(newCode);
                return newCode;
            });
        }

        // 2. Check against DB
        // Since barcodes can now be multiple (separated by ;), we need to fetch all existing barcodes
        // and check if any of our generated ones exist within them.
        const existingItems = await directus.request(readItems('components', {
          filter: {
            barcode: {
              _nnull: true
            }
          },
          fields: ['barcode'],
          limit: -1
        }));

        const allDbBarcodes = new Set<string>();
        existingItems.forEach((item: any) => {
            if (item.barcode) {
                const codes = item.barcode.split(';').map((b: string) => b.trim());
                codes.forEach((c: string) => allDbBarcodes.add(c));
            }
        });

        const existingBarcodes = new Set<string>();
        currentBarcodes.forEach(code => {
            if (allDbBarcodes.has(code)) {
                existingBarcodes.add(code);
            }
        });

        if (existingBarcodes.size === 0 && !hasInternalDuplicates) {
          hasDuplicates = false;
        } else {
          hasDuplicates = true;
          // Regenerate only DB duplicates
          if (existingBarcodes.size > 0) {
            currentBarcodes = currentBarcodes.map(code => 
                existingBarcodes.has(code) ? generateRandomBarcode() : code
            );
          }
        }
      } catch (error) {
        console.error("Error checking duplicates:", error);
        toast.error("Failed to check barcode duplicates");
        break; // Stop trying on error
      }
    }

    if (attempts >= maxAttempts) {
      toast.warning("Could not guarantee unique barcodes after multiple attempts.");
    }

    setBarcodes(currentBarcodes);
    setIsCheckingDuplicates(false);
  }, [labelsPerPage, pages, printMode, ficheroCount]);

  useEffect(() => {
    generateAndCheckBarcodes();
  }, [generateAndCheckBarcodes]);

  const gridConfig = useMemo(() => {
    if (labelsPerPage === 40) return { cols: 4, rows: 10, barcodeWidth: 1, barcodeHeight: 25, fontSize: '10px' };
    if (labelsPerPage === 30) return { cols: 3, rows: 10, barcodeWidth: 1.3, barcodeHeight: 35, fontSize: '11px' };
    return { cols: 3, rows: 8, barcodeWidth: 1.4, barcodeHeight: 45, fontSize: '12px' }; // 24
  }, [labelsPerPage]);

  const chunkedBarcodes = useMemo(() => {
    const chunks = [];
    for (let i = 0; i < barcodes.length; i += labelsPerPage) {
      chunks.push(barcodes.slice(i, i + labelsPerPage));
    }
    return chunks;
  }, [barcodes, labelsPerPage]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      
      const pagesElements = document.querySelectorAll('.print-page');
      
      for (let i = 0; i < pagesElements.length; i++) {
        const element = pagesElements[i] as HTMLElement;
        const imgData = await toJpeg(element, {
          quality: 0.8,
          pixelRatio: 2, // Reduced for smaller file size
          backgroundColor: '#ffffff'
        });

        const imgProps = pdf.getImageProperties(imgData);
        const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

        if (i > 0) {
          pdf.addPage();
        }
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, imgHeight);
      }

      pdf.save('electrostock-barcodes.pdf');
    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <motion.main 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden h-[calc(100vh-73px)] print-main bg-slate-100 dark:bg-slate-900/50"
    >
      <style>
        {`
          @media print {
            body, html { height: auto !important; overflow: visible !important; background: white !important; }
            header, aside, .no-print { display: none !important; }
            .print-main, section, #root, .flex-1 { display: block !important; height: auto !important; overflow: visible !important; padding: 0 !important; margin: 0 !important; background: white !important; }
            #print-area { width: 100%; background: white !important; }
            .print-page { page-break-after: always; box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; min-height: auto !important; }
            .print-page:last-child { page-break-after: auto; }
          }
        `}
      </style>

      {printMode === 'pdf' ? (
        <React.Fragment>
          {/* Left Configuration Panel */}
          <aside className="w-full lg:w-80 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-background-dark p-6 overflow-visible lg:overflow-y-auto shrink-0 no-print">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Batch Labels</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Configure your barcode sheet</p>
            </div>
            
            <div className="space-y-4 mb-6">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Print Method</h3>
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                <button onClick={() => setPrintMode('pdf')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all bg-white dark:bg-slate-700 shadow-sm text-primary`}>PDF (A4)</button>
                <button onClick={() => setPrintMode('fichero')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white`}>Thermal</button>
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Labels Per Page</label>
                <select value={labelsPerPage} onChange={(e) => setLabelsPerPage(Number(e.target.value))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2.5 text-sm focus:ring-primary">
                  <option value={24}>24 (3 x 8)</option>
                  <option value={30}>30 (3 x 10)</option>
                  <option value={40}>40 (4 x 10)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Number of Pages</label>
                <input className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm focus:ring-primary" min="1" type="number" value={pages} onChange={(e) => setPages(Math.max(1, Number(e.target.value)))} />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <input type="checkbox" id="cut-lines" checked={showCutLines} onChange={(e) => setShowCutLines(e.target.checked)} className="w-4 h-4 text-primary bg-slate-50 border-slate-300 rounded focus:ring-primary dark:bg-slate-900 dark:border-slate-700 cursor-pointer" />
                <label htmlFor="cut-lines" className="text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">Show Cut Lines (Dashed)</label>
              </div>

              <div className="pt-4 space-y-3">
                <button onClick={generateAndCheckBarcodes} disabled={isCheckingDuplicates} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white font-bold py-3 px-4 flex items-center justify-center gap-2 transition-all rounded-xl disabled:opacity-70">
                  {isCheckingDuplicates ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                  {isCheckingDuplicates ? "Checking..." : "Regenerate Labels"}
                </button>
                <button onClick={handlePrint} className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold py-3 px-4 flex items-center justify-center gap-2 transition-all rounded-xl">
                  <Printer className="w-5 h-5" /> Print Labels
                </button>
                <button onClick={handleDownloadPdf} disabled={isGeneratingPdf} className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 px-4 flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-all rounded-xl disabled:opacity-70 disabled:cursor-not-allowed">
                  {isGeneratingPdf ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                  {isGeneratingPdf ? "Generating PDF..." : "Download PDF"}
                </button>
              </div>
            </div>
          </aside>

          {/* Main Preview Area */}
          <section className="flex-1 p-4 lg:p-8 overflow-auto">
            <div className="w-full min-w-max mx-auto flex flex-col items-center">
              <div className="flex items-center justify-between mb-6 no-print w-full max-w-4xl">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" /> Print Preview (A4 Sheet)
                </h3>
              </div>
              <div id="print-area" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', alignItems: 'center' }}>
                {chunkedBarcodes.map((pageBarcodes, pageIndex) => (
                  <div key={pageIndex} className="print-page" style={{ width: '794px', height: '1123px', backgroundColor: '#ffffff', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', boxSizing: 'border-box', padding: '38px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridConfig.cols}, 1fr)`, gridTemplateRows: `repeat(${gridConfig.rows}, 1fr)`, gap: showCutLines ? '0px' : '15px', height: '100%', width: '100%' }}>
                      {pageBarcodes.map((barcode, idx) => (
                        <div key={idx} style={{ border: showCutLines ? '0.5px dashed #94a3b8' : '1px solid #cbd5e1', padding: '10px', borderRadius: showCutLines ? '0px' : '8px', display: 'flex', flexDirection: 'column', justifyContent: 'center', backgroundColor: '#ffffff', overflow: 'hidden', boxSizing: 'border-box', margin: showCutLines ? '-0.25px' : '0px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Zap size={12} color="#f97316" /><span style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8' }}>ElectroStock</span></div>
                            <span style={{ fontSize: '8px', fontFamily: 'monospace', color: '#64748b' }}>v2.4.0</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                            <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' }}>
                              <BarcodeGenerator value={barcode} height={gridConfig.barcodeHeight} displayValue={false} background="transparent" width={gridConfig.barcodeWidth} margin={0} />
                            </div>
                            <div style={{ textAlign: 'center', fontSize: gridConfig.fontSize, fontFamily: 'monospace', marginTop: '8px', letterSpacing: '0.1em', fontWeight: 'bold', color: '#0f172a' }}>{barcode}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </React.Fragment>
      ) : (
        <ErrorBoundary>
          <FicheroBatchMode 
            barcodes={barcodes} 
            headerComponent={
              <React.Fragment>
                <div className="mb-8">
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Batch Labels</h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Configure your thermal labels</p>
                </div>
                <div className="space-y-4 mb-6">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Print Method</h3>
                  <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                    <button onClick={() => setPrintMode('pdf')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white`}>PDF (A4)</button>
                    <button onClick={() => setPrintMode('fichero')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all bg-white dark:bg-slate-700 shadow-sm text-primary`}>Thermal</button>
                  </div>
                </div>
              </React.Fragment>
            }
            generateControls={
              <React.Fragment>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Number of labels to generate</label>
                  <input className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm focus:ring-primary text-slate-900 dark:text-white" min="1" type="number" value={ficheroCount} onChange={(e) => setFicheroCount(Math.max(1, Number(e.target.value)))} />
                  <p className="text-xs text-slate-500 mt-1">For exact duplicates, adjust the copies in the printer menu instead.</p>
                </div>
                <button onClick={generateAndCheckBarcodes} disabled={isCheckingDuplicates} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white font-bold py-3 px-4 flex items-center justify-center gap-2 transition-all rounded-xl mt-3 disabled:opacity-70">
                  {isCheckingDuplicates ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                  {isCheckingDuplicates ? "Checking..." : "Generate New Identifiers"}
                </button>
              </React.Fragment>
            }
          />
        </ErrorBoundary>
      )}
    </motion.main>
  );
}
