// ─── Barcode formats ──────────────────────────────────────────────────────────

/** All supported barcode formats. */
export type BarcodeFormat =
  | 'CODE128'
  | 'CODE39'
  | 'EAN13'
  | 'EAN8'
  | 'UPCA'
  | 'ITF14'
  | 'QR_CODE'
  | 'DATA_MATRIX';

/** QR error correction level. */
export type QRErrorCorrection = 'L' | 'M' | 'Q' | 'H';

/** Text position relative to the barcode bars. */
export type TextPosition = 'top' | 'bottom' | 'none';

/**
 * Rotation applied to the barcode content (clockwise degrees).
 * - 0°  : bars vertical, reads left→right (portrait label)
 * - 90° : bars horizontal, reads top→bottom (landscape reading) — **default for 1D**
 * - 180°: bars vertical, upside-down
 * - 270°: bars horizontal, reads bottom→top
 */
export type Rotation = 0 | 90 | 180 | 270;

/**
 * Print density.
 * - 0 = light
 * - 1 = medium
 * - 2 = dark (default)
 * - 3 = ultra-dark
 */
export type Density = 0 | 1 | 2 | 3;

/** Paper/label stock type. */
export type PaperType = 'gap' | 'black' | 'continuous';

// ─── Label & style options ────────────────────────────────────────────────────

/** Physical dimensions of the label to print on. */
export interface LabelDimensions {
  /** Width in mm (default: 14). Informational only — printhead is always 96 px. */
  widthMm?: number;
  /** Height in mm (default: 30). Maps to pixel rows: mm × 8 = px at 203 DPI. */
  heightMm?: number;
}

/** Visual style of the rendered barcode. */
export interface BarcodeStyle {
  /**
   * Fraction of label length reserved as quiet zone on each end (0–0.15, default: 0.04).
   * Applied in the barcode reading direction.
   */
  quietZoneRatio?: number;
  /**
   * Fraction of the available cross-axis space used by the bars (0.1–1.0, default: 0.75).
   * The remainder is left as margin around the bars.
   */
  barHeightRatio?: number;
  /** Show human-readable text below/above the barcode. Default: true for 1D, false for 2D. */
  showText?: boolean;
  /** Where text appears relative to the barcode bars. Default: 'bottom'. */
  textPosition?: TextPosition;
  /** Font size in pixels for the human-readable text. Default: 7. */
  fontSize?: number;
  /** Swap black ↔ white (dark-on-light → light-on-dark). Default: false. */
  inverted?: boolean;
  /** Horizontal shift in pixels applied to the final image. Default: 0. */
  offsetX?: number;
  /** Vertical shift in pixels applied to the final image. Default: 0. */
  offsetY?: number;
}

/** QR Code–specific options. */
export interface QROptions {
  /** Error correction level (default: 'M'). */
  errorCorrection?: QRErrorCorrection;
}

/** Options for 2D barcodes. */
export interface TwoDOptions {
  qr?: QROptions;
}

// ─── Main options object ──────────────────────────────────────────────────────

/** Complete options for rendering a barcode label. */
export interface BarcodeOptions {
  /** The value to encode. Required. */
  value: string;
  /** Barcode symbology. Default: 'CODE128'. */
  format?: BarcodeFormat;
  /** Physical label dimensions. */
  label?: LabelDimensions;
  /** Visual style. */
  style?: BarcodeStyle;
  /**
   * Rotation of barcode content (clockwise degrees).
   * Default: 90 for 1D barcodes, 0 for 2D (QR, DataMatrix).
   */
  rotation?: Rotation;
  /** Format-specific options for 2D barcodes. */
  twod?: TwoDOptions;
}

// ─── Print job ────────────────────────────────────────────────────────────────

/** Options for the print job sent to the printer. */
export interface PrintOptions {
  /** Density: 0=light, 1=medium, 2=dark, 3=ultra-dark. Default: 2. */
  density?: Density;
  /** Number of copies. Default: 1. */
  copies?: number;
  /** Label stock type. Default: 'gap'. */
  paperType?: PaperType;
}

// ─── Internal generator types ─────────────────────────────────────────────────

/** One run of bars or spaces in a 1D barcode. */
export interface Segment {
  type: 'bar' | 'space';
  modules: number;
}

/** Result from a 1D barcode generator. */
export interface OneDResult {
  /** Alternating segments starting with a bar. */
  segments: Segment[];
  /** Sum of all segment module counts. */
  totalModules: number;
  /** The human-readable string to display under/above the barcode. */
  displayText: string;
}

/** Result from a 2D barcode generator. */
export interface TwoDResult {
  /** Row-major boolean matrix; true = dark module. */
  matrix: boolean[][];
  /** Number of modules per side (matrix is always square). */
  size: number;
}

/** Union of generator results. */
export type GeneratorResult =
  | { kind: '1d'; data: OneDResult }
  | { kind: '2d'; data: TwoDResult };

// ─── Printer bitmap ───────────────────────────────────────────────────────────

/**
 * 1-bit bitmap ready to be sent to the D11s printer.
 * Format: 12 bytes per row, MSB = leftmost pixel, 1 = black.
 */
export interface RenderedBitmap {
  bytes: Uint8Array;
  /** Number of rows (paper-feed direction). */
  rows: number;
  /** Always 96 (printhead width). */
  cols: 96;
}

// ─── Printer connection state ─────────────────────────────────────────────────

export type PrinterConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'printing'
  | 'error';

/** Basic device info returned by the printer. */
export interface PrinterDeviceInfo {
  model: string;
  firmware: string;
  serial: string;
  battery: number;   // 0–100
  statusFlags: string;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  error?: string;
  /** Auto-corrected or normalised value (e.g., with check digit appended). */
  normalized?: string;
}
