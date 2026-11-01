/**
 * fichero-barcode — public API
 *
 * Core:
 *   renderToCanvas(canvas, options)   → render barcode onto HTMLCanvasElement
 *   extractBitmap(canvas)             → extract 1-bit printer bitmap (12 bytes/row)
 *   renderToBitmap(options)           → convenience: render + extract in one call
 *   getLabelPixelDimensions(options)  → {widthPx, heightPx}
 *   estimateScannability(options, n)  → {ok, minModulePx, warning?}
 *
 * Generators & validation:
 *   validate(value, format)           → {valid, error?, normalized?}
 *   FORMAT_LABELS                     → human-readable format names
 *   FORMAT_EXAMPLES                   → example values per format
 *   is2DFormat(format)                → true for QR_CODE and DATA_MATRIX
 *
 * BLE:
 *   FicheroBLE                        → class: connect/disconnect/print/getInfo
 *   getPrinterInstance()              → shared singleton FicheroBLE
 *
 * React hooks:
 *   useFicheroPrinter()               → {status, info, connect, disconnect, print, …}
 *   useBarcodeLabel(options)          → {bitmap, renderError, isRendering, canvasRef, …}
 *
 * React components:
 *   BarcodeLabel                      → <BarcodeLabel options={…} scale={4} />
 *
 * Constants (useful for building custom UIs):
 *   PRINTHEAD_PX    = 96
 *   BYTES_PER_ROW   = 12
 *   DOTS_PER_MM     = 8
 *   DEFAULT_LABEL_WIDTH_MM  = 14
 *   DEFAULT_LABEL_HEIGHT_MM = 30
 */

// ─── Renderer ─────────────────────────────────────────────────────────────────
export {
  renderToCanvas,
  extractBitmap,
  renderToBitmap,
  getLabelPixelDimensions,
  estimateScannability,
} from './renderer';

// ─── Generators & validation ──────────────────────────────────────────────────
export {
  validate,
  FORMAT_LABELS,
  FORMAT_EXAMPLES,
  is2DFormat,
} from './generators/index';

// ─── BLE transport ────────────────────────────────────────────────────────────
export {
  FicheroBLE,
  getPrinterInstance,
  resetPrinterInstance,
} from './ble';

// ─── React hooks ──────────────────────────────────────────────────────────────
export { useFicheroPrinter } from './hooks/useFicheroPrinter';
export { useBarcodeLabel   } from './hooks/useBarcodeLabel';

// ─── React components ─────────────────────────────────────────────────────────
export { BarcodeLabel } from './components/BarcodeLabel';
export type { BarcodeLabelProps } from './components/BarcodeLabel';

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  BarcodeFormat,
  BarcodeOptions,
  BarcodeStyle,
  LabelDimensions,
  TwoDOptions,
  QROptions,
  QRErrorCorrection,
  TextPosition,
  Rotation,
  Density,
  PaperType,
  PrintOptions,
  RenderedBitmap,
  PrinterConnectionStatus,
  PrinterDeviceInfo,
  ValidationResult,
  Segment,
  OneDResult,
  TwoDResult,
  GeneratorResult,
} from './types';

// ─── Constants ────────────────────────────────────────────────────────────────
export {
  PRINTHEAD_PX,
  BYTES_PER_ROW,
  DOTS_PER_MM,
  DEFAULT_LABEL_WIDTH_MM,
  DEFAULT_LABEL_HEIGHT_MM,
} from './constants';

// ─── Hook return types ────────────────────────────────────────────────────────
export type { UseFicheroPrinterReturn } from './hooks/useFicheroPrinter';
export type { UseBarcodeLabelReturn   } from './hooks/useBarcodeLabel';
