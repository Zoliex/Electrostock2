import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  BarcodeLabel,
  useFicheroPrinter,
  useBarcodeLabel,
  validate,
  FORMAT_LABELS,
  is2DFormat,
  PRINTHEAD_PX,
  DOTS_PER_MM,
  renderToBitmap
} from '../lib/fichero-barcode';
import type { BarcodeFormat, BarcodeOptions, Density, PaperType, Rotation, TextPosition } from '../lib/fichero-barcode';
import { Loader2, Barcode as BarcodeIcon, Ruler, Palette, Eye, Printer as PrinterIcon, Bluetooth, Battery, Hash } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALL_FORMATS: BarcodeFormat[] = [
  'CODE128', 'CODE39', 'EAN13', 'EAN8', 'UPCA', 'ITF14', 'QR_CODE', 'DATA_MATRIX',
];

function statusLabel(s: string): string {
  return { disconnected: 'Disconnected', connecting: 'Connecting…', connected: 'Connected',
           printing: 'Printing…', error: 'Error' }[s] ?? s;
}

function useLocalStorageState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) return JSON.parse(stored);
    } catch { /* ignore */ }
    return defaultValue;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch { /* ignore */ }
  }, [key, state]);

  return [state, setState];
}

interface FicheroBatchModeProps {
  barcodes: string[];
  headerComponent?: React.ReactNode;
  generateControls?: React.ReactNode;
}

function FicheroSinglePreview({ value, baseOptions, scale, canvasStyle, containerWidth, containerHeight, labelColor }: any) {
  const options = useMemo(() => ({ ...baseOptions, value }), [baseOptions, value]);
  const { renderError, isRendering, canvasRef } = useBarcodeLabel(options);
  
  return (
    <div className="flex flex-col items-center">
      <div
        style={{
          background: labelColor,
          padding: 8,
          width: containerWidth + 16,
          height: containerHeight + 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          borderRadius: '8px',
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
        }}
      >
        {isRendering && <div className="absolute"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>}
        <canvas ref={canvasRef as React.RefObject<HTMLCanvasElement>} style={{ display: 'none' }} />
        <BarcodeLabel
          options={options}
          scale={scale}
          style={canvasStyle}
          onError={err => console.error('Preview error:', err)}
        />
      </div>
      <div className="mt-3 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-mono shadow-sm">
        {value}
      </div>
      {renderError && <div className="mt-2 text-red-500 text-xs">{renderError}</div>}
    </div>
  );
}

export function FicheroBatchMode({ barcodes, headerComponent, generateControls }: FicheroBatchModeProps) {
  // ── Barcode config state ──────────────────────────────────────────────────
  const [format,       setFormat      ] = useLocalStorageState<BarcodeFormat>('fichero_format', 'CODE128');
  const [labelH,       setLabelH      ] = useLocalStorageState('fichero_labelH', 30);
  const [labelColor,   setLabelColor  ] = useLocalStorageState('fichero_labelColor', '#ffffff');
  const [rotation,     setRotation    ] = useLocalStorageState<Rotation>('fichero_rotation', 90);
  const [barHeight,    setBarHeight   ] = useLocalStorageState('fichero_barHeight', 1.0);
  const [quietZone,    setQuietZone   ] = useLocalStorageState('fichero_quietZone', 0.04);
  const [showText,     setShowText    ] = useLocalStorageState('fichero_showText', true);
  const [textPos,      setTextPos     ] = useLocalStorageState<TextPosition>('fichero_textPos', 'bottom');
  const [fontSize,     setFontSize    ] = useLocalStorageState('fichero_fontSize', 14);
  const [inverted,     setInverted    ] = useLocalStorageState('fichero_inverted', false);
  const [errCorr,      setErrCorr     ] = useLocalStorageState<'L'|'M'|'Q'|'H'>('fichero_errCorr', 'M');
  const [offsetX,      setOffsetX     ] = useLocalStorageState('fichero_offsetX', -3);
  const [offsetY,      setOffsetY     ] = useLocalStorageState('fichero_offsetY', -8);
  const [previewRealRotation, setPreviewRealRotation] = useLocalStorageState('fichero_previewRealRotation', false);
  const [showOffsetPreview, setShowOffsetPreview] = useLocalStorageState('fichero_showOffsetPreview', false);

  // ── Print state ───────────────────────────────────────────────────────────
  const [density,   setDensity  ] = useLocalStorageState<Density>('fichero_density', 2);
  const [copies,    setCopies   ] = useLocalStorageState('fichero_copies', 1);
  const [paperType, setPaperType] = useLocalStorageState<PaperType>('fichero_paperType', 'gap');
  const [printLog,  setPrintLog ] = useState<{ts: string; msg: string; ok: boolean}[]>([]);
  const [printProgress, setPrintProgress] = useState(0);

  // ── Value handling ────────────────────────────────────────────────────────
  const previewValue = barcodes.length > 0 ? barcodes[0] : 'EMPTY';

  const validation = useMemo(() => {
    if (!previewValue || previewValue === 'EMPTY') return { valid: false, error: 'No code generated' };
    return validate(previewValue, format);
  }, [previewValue, format]);

  const value = validation.normalized ?? previewValue;

  // ── Build options object for preview ──────────────────────────────────────
  const options: BarcodeOptions = useMemo(() => ({
    value,
    format,
    label:  { heightMm: labelH },
    style:  {
      barHeightRatio: barHeight,
      quietZoneRatio: quietZone,
      showText:        is2DFormat(format) ? false : showText,
      textPosition:    textPos,
      fontSize,
      inverted,
      offsetX,
      offsetY,
    },
    rotation: is2DFormat(format) ? 0 : rotation,
    twod: { qr: { errorCorrection: errCorr } },
  }), [value, format, labelH, barHeight, quietZone, showText, textPos, fontSize, inverted, rotation, errCorr, offsetX, offsetY]);

  const previewOptions: BarcodeOptions = useMemo(() => {
    if (showOffsetPreview) return options;
    return {
      ...options,
      style: { ...options.style, offsetX: 0, offsetY: 0, }
    };
  }, [options, showOffsetPreview]);

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const { status, info, error: bleError, connect, disconnect, print } = useFicheroPrinter();
  const { bitmap, renderError, isRendering, canvasRef } = useBarcodeLabel(options);

  const scanInfo = useMemo(() => {
    if (!bitmap || !validation.valid) return null;
    const barcodeLength = (options.rotation === 90 || options.rotation === 270)
      ? bitmap.rows
      : PRINTHEAD_PX;
    const minPx = barcodeLength / 200; 
    return { ok: minPx >= 2, minPx };
  }, [bitmap, validation.valid, options.rotation]);

  const labelHeightPx = Math.round(labelH * DOTS_PER_MM);
  const isConnected   = status === 'connected' || status === 'printing';

  const handleFormatChange = useCallback((f: BarcodeFormat) => {
    setFormat(f);
    if (is2DFormat(f)) setRotation(0);
    else setRotation(90);
  }, []);

  // ── Batch Print All Barcodes ──────────────────────────────────────────────
  const handlePrintAll = useCallback(async () => {
    if (!isConnected || barcodes.length === 0) return;
    const ts = new Date().toLocaleTimeString();
    setPrintProgress(0);
    try {
      for (let i = 0; i < barcodes.length; i++) {
        const val = barcodes[i];
        const valRes = validate(val, format);
        const finalVal = valRes.normalized ?? val;
        
        const currentOptions: BarcodeOptions = { ...options, value: finalVal };
        const currentBitmap = await renderToBitmap(currentOptions);
        
        await print(currentBitmap, { density, copies, paperType });
        setPrintProgress(i + 1);
      }
      setPrintLog(l => [{ ts, msg: `${barcodes.length} labels sent`, ok: true }, ...l.slice(0, 9)]);
      setTimeout(() => setPrintProgress(0), 1000); // Reset after completing
    } catch (e) {
      setPrintLog(l => [{ ts, msg: `Error: ${e instanceof Error ? e.message : String(e)}`, ok: false }, ...l.slice(0, 9)]);
      setPrintProgress(0);
    }
  }, [options, barcodes, print, isConnected, density, copies, paperType, format]);

  // ── Computed display values (depend on autoScale) ──────────────────────────
  const isUpright = !previewRealRotation && !is2DFormat(format) && (rotation === 90 || rotation === 270);

  // ── Auto-fit scale based on container width ───────────────────────────────
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [autoScale, setAutoScale] = useState(2);

  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;
    const updateScale = () => {
      const availableWidth = container.clientWidth - 32; // minus padding
      
      // Rough estimate of available height on mobile vs desktop
      // On mobile (stacked), we want the preview to fit in a reasonable portion of the viewport
      const isMobile = window.innerWidth < 1024;
      const availableHeight = isMobile ? (window.innerHeight * 0.5) : (window.innerHeight - 250);

      // Compute natural dimensions at scale=1
      const naturalWidth = isUpright ? labelHeightPx : PRINTHEAD_PX;
      const naturalHeight = isUpright ? PRINTHEAD_PX : labelHeightPx;

      // Width-based scale (how many fit in a row)
      const perRow = Math.max(1, Math.floor(availableWidth / naturalWidth));
      const sWidth = availableWidth / (naturalWidth * perRow);
      
      // Height-based scale (to ensure one full label row fits vertically)
      const sHeight = availableHeight / naturalHeight;

      // Use the smaller of the two scales to ensure it fits both ways
      // We allow fluid floating point numbers for perfectly responsive fit
      let s = Math.min(sWidth, sHeight);
      
      // Clamp scale between 1 and 6
      setAutoScale(Math.min(Math.max(1, s), 6));
    };
    updateScale();
    const obs = new ResizeObserver(updateScale);
    obs.observe(container);
    window.addEventListener('resize', updateScale);
    return () => {
      obs.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [isUpright, labelHeightPx, barcodes.length]);

  const displayScale = autoScale;

  const rawWidth = PRINTHEAD_PX * displayScale;
  const rawHeight = labelHeightPx * displayScale;
  const containerWidth = isUpright ? rawHeight : rawWidth;
  const containerHeight = isUpright ? rawWidth : rawHeight;

  const canvasStyle: React.CSSProperties = {
    mixBlendMode: 'multiply',
    ...(isUpright ? {
      transform: rotation === 90 ? 'rotate(-90deg)' : 'rotate(90deg)',
      transformOrigin: 'center center',
    } : {})
  };

  const inputClass = "w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2.5 text-sm focus:ring-primary text-slate-900 dark:text-white";
  const labelClass = "text-sm font-semibold text-slate-700 dark:text-slate-300";

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <React.Fragment>
        {/* ─────────── LEFT : configuration ─────────── */}
        <aside className="w-full lg:w-80 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-background-dark p-6 overflow-visible lg:overflow-y-auto shrink-0 no-print">
          {headerComponent}
          
          <div className="space-y-6">
            {/* Generating Controls embedded here: Label count + Update button */}
            {generateControls}

            {/* Format */}
            <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <BarcodeIcon className="w-4 h-4 text-primary" /> Format
              </h3>
              <div className="space-y-2">
                <label htmlFor="format-select" className={labelClass}>Symbology</label>
                <select
                  id="format-select"
                  value={format}
                  onChange={e => handleFormatChange(e.target.value as BarcodeFormat)}
                  className={inputClass}
                >
                  {ALL_FORMATS.map(f => (
                    <option key={f} value={f}>{FORMAT_LABELS[f]}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Label dimensions */}
            <div className="space-y-4 pt-6 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Ruler className="w-4 h-4 text-primary" /> Label
              </h3>
              <div className="space-y-2">
                <label htmlFor="label-preset" className={labelClass}>Standard Format</label>
                <select
                  id="label-preset"
                  value={[30, 40, 50].includes(labelH) ? `14x${labelH}` : 'custom'}
                  onChange={e => {
                    const val = e.target.value;
                    if (val !== 'custom') setLabelH(Number(val.split('x')[1]));
                  }}
                  className={inputClass}
                >
                  <option value="14x30">14 × 30 mm</option>
                  <option value="14x40">14 × 40 mm</option>
                  <option value="14x50">14 × 50 mm</option>
                  <option value="custom">Custom…</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="label-height" className={`${labelClass} flex justify-between`}>
                  <span>Paper Height</span>
                  <span className="font-normal text-slate-500">{labelH} mm</span>
                </label>
                <input
                  id="label-height"
                  type="range"
                  min={10} max={80} step={1}
                  value={labelH}
                  onChange={e => setLabelH(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>

              <div className="space-y-2">
                <label className={labelClass}>Paper Color</label>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  {[
                    { name: 'White', hex: '#ffffff' },
                    { name: 'Yellow', hex: '#fef08a' },
                    { name: 'Pink', hex: '#fbcfe8' },
                    { name: 'Blue', hex: '#bfdbfe' },
                  ].map(c => (
                    <button
                      key={c.name}
                      title={c.name}
                      onClick={() => setLabelColor(c.hex)}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', background: c.hex,
                        border: labelColor === c.hex ? '2px solid var(--tw-colors-primary, #3b82f6)' : '1px solid #cbd5e1',
                        cursor: 'pointer', outline: 'none'
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Style */}
            <div className="space-y-4 pt-6 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Palette className="w-4 h-4 text-primary" /> Style
              </h3>
              
              {!is2DFormat(format) && (
                <>
                  <div className="space-y-2">
                    <label htmlFor="rotation" className={labelClass}>Rotation</label>
                    <select
                      id="rotation"
                      value={rotation}
                      onChange={e => setRotation(Number(e.target.value) as Rotation)}
                      className={inputClass}
                    >
                      <option value={0}>0° (vertical)</option>
                      <option value={90}>90° (horizontal)</option>
                      <option value={180}>180° (inverted)</option>
                      <option value={270}>270° (inverted)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="bar-height" className={`${labelClass} flex justify-between`}>
                      <span>Bar Height</span>
                      <span className="font-normal text-slate-500">{Math.round(barHeight * 100)}%</span>
                    </label>
                    <input
                      id="bar-height"
                      type="range"
                      min={0.2} max={1.0} step={0.05}
                      value={barHeight}
                      onChange={e => setBarHeight(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <label htmlFor="quiet-zone" className={`${labelClass} flex justify-between`}>
                  <span>Quiet Zone</span>
                  <span className="font-normal text-slate-500">{Math.round(quietZone * 100)}%</span>
                </label>
                <input
                  id="quiet-zone"
                  type="range"
                  min={0} max={0.15} step={0.01}
                  value={quietZone}
                  onChange={e => setQuietZone(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>

              <div className="flex gap-3">
                <div className="space-y-2 w-1/2">
                  <label htmlFor="offset-x" className={`${labelClass} flex justify-between`}>
                    X <span className="font-normal text-slate-500">{offsetX}px</span>
                  </label>
                  <input
                    id="offset-x"
                    type="number"
                    value={offsetX}
                    onChange={e => setOffsetX(Number(e.target.value))}
                    className={inputClass}
                    style={{ padding: '6px 10px' }}
                  />
                </div>
                <div className="space-y-2 w-1/2">
                  <label htmlFor="offset-y" className={`${labelClass} flex justify-between`}>
                    Y <span className="font-normal text-slate-500">{offsetY}px</span>
                  </label>
                  <input
                    id="offset-y"
                    type="number"
                    value={offsetY}
                    onChange={e => setOffsetY(Number(e.target.value))}
                    className={inputClass}
                    style={{ padding: '6px 10px' }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox" id="showOffsetPreview" checked={showOffsetPreview} onChange={e => setShowOffsetPreview(e.target.checked)}
                  className="w-4 h-4 text-primary bg-slate-50 border-slate-300 rounded focus:ring-primary dark:bg-slate-900 dark:border-slate-700 cursor-pointer"
                />
                <label htmlFor="showOffsetPreview" className={`${labelClass} cursor-pointer select-none font-medium`}>Offset Preview</label>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <input
                  type="checkbox" id="inverted" checked={inverted} onChange={e => setInverted(e.target.checked)}
                  className="w-4 h-4 text-primary bg-slate-50 border-slate-300 rounded focus:ring-primary dark:bg-slate-900 dark:border-slate-700 cursor-pointer"
                />
                <label htmlFor="inverted" className={`${labelClass} cursor-pointer select-none font-medium`}>Inverted Colors</label>
              </div>

              {!is2DFormat(format) && (
                <>
                  <div className="flex items-center gap-3 pt-1 border-t border-slate-100 dark:border-slate-800 mt-2">
                    <input
                      type="checkbox" id="showText" checked={showText} onChange={e => setShowText(e.target.checked)}
                      className="w-4 h-4 text-primary bg-slate-50 border-slate-300 rounded focus:ring-primary dark:bg-slate-900 dark:border-slate-700 cursor-pointer"
                    />
                    <label htmlFor="showText" className={`${labelClass} cursor-pointer select-none font-medium`}>Readable Text</label>
                  </div>
                  {showText && (
                    <div className="flex gap-3">
                      <div className="space-y-2 w-1/2">
                        <label htmlFor="text-pos" className={labelClass}>Position</label>
                        <select id="text-pos" value={textPos} onChange={e => setTextPos(e.target.value as TextPosition)} className={inputClass} style={{ padding: '6px 10px' }}>
                          <option value="top">Top</option>
                          <option value="bottom">Bottom</option>
                        </select>
                      </div>
                      <div className="space-y-2 w-1/2">
                        <label htmlFor="font-size" className={`${labelClass} flex justify-between`}>
                          <span>Size</span>
                          <span className="font-normal text-slate-500">{fontSize}</span>
                        </label>
                        <input
                          id="font-size"
                          type="range"
                          min={5} max={14} step={1}
                          value={fontSize}
                          onChange={e => setFontSize(Number(e.target.value))}
                          className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary mt-2"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              </div>

            </div>
        </aside>

        {/* ─────────── CENTER : preview ─────────── */}
        <section className="flex-1 bg-slate-100 dark:bg-slate-900/50 p-4 lg:p-8 overflow-auto flex flex-col items-center order-1 lg:order-2 min-h-[300px]">
          <div ref={previewContainerRef} className="w-full max-w-4xl flex flex-col items-center">
            
            <div className="flex items-center justify-between mb-8 w-full">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Eye className="w-5 h-5 text-primary" />
                Preview ({barcodes.length} label{barcodes.length > 1 ? 's' : ''})
              </h3>
              <span className="bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-mono shadow-sm">
                14 × {labelH} mm
              </span>
            </div>

            <div className="flex flex-wrap gap-6 justify-center">
              {barcodes.map((val, idx) => (
                <FicheroSinglePreview
                  key={`${val}-${idx}`}
                  value={val}
                  baseOptions={previewOptions}
                  scale={displayScale}
                  canvasStyle={canvasStyle}
                  containerWidth={containerWidth}
                  containerHeight={containerHeight}
                  labelColor={labelColor}
                />
              ))}
            </div>

            {renderError && (
              <div className="mt-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/30 px-4 py-3 rounded-lg text-sm max-w-sm text-center shadow-sm">
                ⚠ {renderError}
              </div>
            )}

            {scanInfo && !scanInfo.ok && (
              <div className="mt-4 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800/30 px-4 py-3 rounded-lg text-sm max-w-sm text-center shadow-sm">
                ⚠ Module too small ({scanInfo.minPx.toFixed(1)}px). Increase bar width.
              </div>
            )}
          </div>
        </section>

        {/* ─────────── RIGHT : printer ─────────── */}
        <aside className="w-full lg:w-80 border-t lg:border-t-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-background-dark p-6 overflow-visible lg:overflow-y-auto shrink-0 no-print flex flex-col order-3">
          
          <div className="mb-6 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <PrinterIcon className="w-4 h-4 text-primary" /> Printer
              </span>
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : status === 'error' ? 'bg-red-500' : 'bg-slate-400'}`} />
                <span className="text-xs font-medium normal-case text-slate-500 dark:text-slate-400">{statusLabel(status)}</span>
              </span>
            </h3>

            {bleError && (
              <div className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 p-3 rounded-lg mb-4 text-xs">
                {bleError}
              </div>
            )}

            {!isConnected ? (
              <button
                className="w-full bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold py-2.5 px-4 rounded-lg shadow-sm disabled:opacity-50 transition-all flex justify-center items-center gap-2"
                onClick={connect}
                disabled={status === 'connecting'}
              >
                {status === 'connecting' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bluetooth className="w-4 h-4" />}
                {status === 'connecting' ? 'Bluetooth...' : 'Connect'}
              </button>
            ) : (
              <div className="space-y-3">
                {info && (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg flex items-center justify-between shadow-sm">
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Battery</span>
                      <div className="flex items-center gap-1.5">
                         <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{info.battery ?? '?'}%</span>
                         <Battery className={`w-3.5 h-3.5 ${info.battery !== undefined && info.battery < 20 ? 'text-red-500' : 'text-slate-400 dark:text-slate-500'}`} />
                      </div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg flex items-center justify-between shadow-sm">
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Version</span>
                      <div className="flex items-center gap-1.5">
                         <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[50px]">{info.firmware ?? '?'}</span>
                         <Hash className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                      </div>
                    </div>
                  </div>
                )}
                <button
                  className="w-full bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-semibold py-2 px-4 rounded-lg transition-all"
                  onClick={disconnect}
                >
                  Disconnect Bluetooth
                </button>
              </div>
            )}
          </div>

          <div className="mb-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Settings</h3>

            <div className="space-y-2">
              <label htmlFor="density-sel" className={labelClass}>Density</label>
              <select
                id="density-sel"
                value={density}
                onChange={e => setDensity(Number(e.target.value) as Density)}
                className={inputClass}
              >
                <option value={0}>0 — Light</option>
                <option value={1}>1 — Normal</option>
                <option value={2}>2 — Thick ★</option>
                <option value={3}>3 — Ultra-thick</option>
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="copies-inp" className={labelClass}>Copies per code</label>
              <input
                id="copies-inp"
                type="number"
                min={1} max={20}
                value={copies}
                onChange={e => setCopies(Math.max(1, Number(e.target.value)))}
                className={inputClass}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="paper-type" className={labelClass}>Paper Type</label>
              <select
                id="paper-type"
                value={paperType}
                onChange={e => setPaperType(e.target.value as PaperType)}
                className={inputClass}
              >
                <option value="gap">Gap (separated) ★</option>
                <option value="continuous">Continuous</option>
              </select>
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-slate-200 dark:border-slate-800 relative">
            <button
              className="w-full relative overflow-hidden bg-primary hover:bg-primary/90 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-primary/25 disabled:opacity-50 disabled:shadow-none transition-all"
              onClick={handlePrintAll}
              disabled={!isConnected || barcodes.length === 0 || !validation.valid || status === 'printing'}
            >
              {status === 'printing' && printProgress > 0 && barcodes.length > 1 && (
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-white/20 transition-all duration-300" 
                  style={{ width: `${(printProgress / barcodes.length) * 100}%` }} 
                />
              )}
              <span className="relative z-10 flex items-center justify-center gap-2 w-full">
                {status === 'printing' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Printing {barcodes.length > 1 ? `(${printProgress}/${barcodes.length})` : 'in progress...'}
                  </>
                ) : (
                  <>
                    <PrinterIcon className="w-5 h-5" /> Print ({barcodes.length})
                  </>
                )}
              </span>
            </button>
            {!isConnected && (
              <p className="text-xs text-center text-slate-500 mt-3 font-medium">
                Connect the printer to start the task
              </p>
            )}
          </div>
          
        </aside>
    </React.Fragment>
  );
}
