/**
 * Barcode renderer.
 *
 * Renders a barcode onto an HTMLCanvasElement (96px × label_height_px),
 * exactly matching the bitmap the D11s printer expects (12 bytes/row, MSB-first).
 *
 * Strategy for 1D barcodes:
 *   1. Draw in "natural" orientation (bars vertical, reading L→R) on a temporary
 *      canvas whose dimensions depend on the requested rotation.
 *   2. Rotate-and-blit onto the final 96×H canvas.
 *
 * Strategy for 2D barcodes:
 *   Scale the module matrix to fit within the available square area, centred.
 */

import type {
  BarcodeOptions,
  BarcodeStyle,
  OneDResult,
  RenderedBitmap,
  Rotation,
  TwoDResult,
} from './types';
import {
  PRINTHEAD_PX,
  BYTES_PER_ROW,
  DEFAULT_LABEL_HEIGHT_MM,
  DOTS_PER_MM,
} from './constants';
import { dispatch, is2DFormat } from './generators/index';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Render a barcode onto `canvas`.
 * After this call, canvas.width = 96 and canvas.height = label_height_px.
 * The canvas content exactly represents what the D11s will print.
 */
export async function renderToCanvas(
  canvas: HTMLCanvasElement,
  options: BarcodeOptions,
): Promise<void> {
  const {
    value,
    format  = 'CODE128',
    label   = {},
    style   = {},
    rotation,
    twod    = {},
  } = options;

  if (!value) {
    // Clear to white if no value
    const labelH = Math.round((label.heightMm ?? DEFAULT_LABEL_HEIGHT_MM) * DOTS_PER_MM);
    canvas.width  = PRINTHEAD_PX;
    canvas.height = labelH;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const inv = style.inverted ?? false;
  const labelHeightPx = Math.round((label.heightMm ?? DEFAULT_LABEL_HEIGHT_MM) * DOTS_PER_MM);

  // Final canvas is always PRINTHEAD_PX × labelHeightPx
  canvas.width  = PRINTHEAD_PX;
  canvas.height = labelHeightPx;

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = inv ? '#000000' : '#ffffff';
  ctx.fillRect(0, 0, PRINTHEAD_PX, labelHeightPx);

  // Generate barcode data
  const result = await dispatch(value, format, { value, format, label, style, rotation, twod });

  const offsetX = style.offsetX ?? 0;
  const offsetY = style.offsetY ?? 0;

  ctx.save();
  if (offsetX !== 0 || offsetY !== 0) {
    ctx.translate(offsetX, offsetY);
  }

  if (result.kind === '1d') {
    const effectiveRotation: Rotation = rotation ?? 90;
    render1D(ctx, result.data, PRINTHEAD_PX, labelHeightPx, effectiveRotation, style);
  } else {
    render2D(ctx, result.data, PRINTHEAD_PX, labelHeightPx, style);
  }
  
  ctx.restore();
}

/**
 * Extract the printer-ready 1-bit bitmap from a canvas.
 * Returns 12 bytes/row (96px ÷ 8), MSB = leftmost pixel, 1 = black.
 */
export function extractBitmap(canvas: HTMLCanvasElement): RenderedBitmap {
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, width, height);
  const bytes = new Uint8Array(height * BYTES_PER_ROW);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i     = (y * width + x) * 4;
      const r     = imageData.data[i];
      const g     = imageData.data[i + 1];
      const b     = imageData.data[i + 2];
      const gray  = (r * 299 + g * 587 + b * 114) / 1000;
      if (gray < 128) {
        // dark pixel → set bit (MSB = leftmost)
        bytes[y * BYTES_PER_ROW + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  return { bytes, rows: height, cols: PRINTHEAD_PX };
}

/**
 * Convenience: render barcode options to a printer-ready bitmap.
 * Creates a temporary offscreen canvas internally.
 */
export async function renderToBitmap(options: BarcodeOptions): Promise<RenderedBitmap> {
  const canvas = document.createElement('canvas');
  await renderToCanvas(canvas, options);
  return extractBitmap(canvas);
}

// ─── 1D renderer ─────────────────────────────────────────────────────────────

function render1D(
  ctx: CanvasRenderingContext2D,
  data: OneDResult,
  W: number,   // final canvas width  (= PRINTHEAD_PX = 96)
  H: number,   // final canvas height (= label_height_px)
  rotation: Rotation,
  style: BarcodeStyle,
): void {
  const inv            = style.inverted      ?? false;
  const quietZoneRatio = style.quietZoneRatio ?? 0.04;
  const barHeightRatio = style.barHeightRatio ?? 1.0;
  const showText       = style.showText       ?? true;
  const textPosition   = style.textPosition   ?? 'bottom';
  const fontSize       = style.fontSize       ?? 14;

  // The "natural" canvas has the barcode reading left→right (bars vertical).
  // After blitting with the correct rotation transform, it becomes the final orientation.
  const isRotated = rotation === 90 || rotation === 270;
  const natW = isRotated ? H : W;
  const natH = isRotated ? W : H;

  // Create temporary canvas for natural-direction rendering
  const nat    = document.createElement('canvas');
  nat.width    = natW;
  nat.height   = natH;
  const natCtx = nat.getContext('2d')!;

  // Background
  natCtx.fillStyle = inv ? '#000000' : '#ffffff';
  natCtx.fillRect(0, 0, natW, natH);

  // Layout
  const qX     = Math.max(3, Math.round(quietZoneRatio * natW));  // left/right quiet zone
  const textH  = showText && textPosition !== 'none' ? fontSize + 4 : 0;
  const availH = natH - 8; // 4px margin top and bottom
  const barsH  = Math.max(1, Math.round((availH - textH) * barHeightRatio));

  let barsY: number;
  let textY: number;

  if (textPosition === 'bottom') {
    barsY = 4;
    textY = 4 + barsH + 2;
  } else if (textPosition === 'top') {
    textY = 4;
    barsY = 4 + textH + 2;
  } else {
    barsY = Math.round((natH - barsH) / 2);
    textY = 0;
  }

  const barsAreaW  = natW - 2 * qX;
  const barColor   = inv ? '#ffffff' : '#000000';
  const { segments, totalModules, displayText } = data;

  if (totalModules === 0) return;

  // Draw bars
  let accModules = 0;
  for (const seg of segments) {
    if (seg.type === 'bar') {
      const xStart = qX + Math.round((accModules / totalModules) * barsAreaW);
      const xEnd   = qX + Math.round(((accModules + seg.modules) / totalModules) * barsAreaW);
      if (xEnd > xStart) {
        natCtx.fillStyle = barColor;
        natCtx.fillRect(xStart, barsY, xEnd - xStart, barsH);
      }
    }
    accModules += seg.modules;
  }

  // Draw human-readable text
  if (showText && textPosition !== 'none' && displayText) {
    natCtx.fillStyle = barColor;
    natCtx.font      = `bold ${fontSize}px Verdana, Arial, sans-serif`;
    natCtx.textAlign = 'center';
    natCtx.textBaseline = 'top';
    const clipped = displayText.length > 40
      ? displayText.slice(0, 38) + '…'
      : displayText;
    natCtx.fillText(clipped, natW / 2, textY, barsAreaW);
  }

  // Blit with rotation onto final ctx
  ctx.save();
  applyRotation(ctx, rotation, W, H);
  ctx.drawImage(nat, 0, 0);
  ctx.restore();
}

// ─── 2D renderer ─────────────────────────────────────────────────────────────

function render2D(
  ctx: CanvasRenderingContext2D,
  data: TwoDResult,
  W: number,
  H: number,
  style: BarcodeStyle,
): void {
  const inv            = style.inverted       ?? false;
  const quietZoneRatio = style.quietZoneRatio  ?? 0.04;

  const { matrix, size } = data;
  if (size === 0) return;

  const qX = Math.max(2, Math.round(quietZoneRatio * W));
  const qY = Math.max(2, Math.round(quietZoneRatio * H));

  const availW = W - 2 * qX;
  const availH = H - 2 * qY;
  const maxSide    = Math.min(availW, availH);
  const moduleSize = Math.max(1, Math.floor(maxSide / size));
  const scaledSize = moduleSize * size;

  const startX = Math.round((W - scaledSize) / 2);
  const startY = Math.round((H - scaledSize) / 2);

  const barColor = inv ? '#ffffff' : '#000000';

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        ctx.fillStyle = barColor;
        ctx.fillRect(
          startX + c * moduleSize,
          startY + r * moduleSize,
          moduleSize,
          moduleSize,
        );
      }
    }
  }
}

// ─── Canvas rotation helpers ──────────────────────────────────────────────────

/**
 * Apply a rotation transform to ctx such that drawing an image at (0,0)
 * of the "natural" canvas size will appear correctly rotated onto the final
 * W×H canvas.
 */
function applyRotation(
  ctx: CanvasRenderingContext2D,
  rotation: Rotation,
  W: number,
  H: number,
): void {
  switch (rotation) {
    case 0:
      break; // no transform needed
    case 90:
      ctx.translate(W, 0);
      ctx.rotate(Math.PI / 2);
      break;
    case 180:
      ctx.translate(W, H);
      ctx.rotate(Math.PI);
      break;
    case 270:
      ctx.translate(0, H);
      ctx.rotate(-Math.PI / 2);
      break;
  }
}

// ─── Label info ───────────────────────────────────────────────────────────────

/** Return the label dimensions in pixels given the options. */
export function getLabelPixelDimensions(options: BarcodeOptions): {
  widthPx: number;
  heightPx: number;
} {
  const heightMm = options.label?.heightMm ?? DEFAULT_LABEL_HEIGHT_MM;
  return {
    widthPx: PRINTHEAD_PX,
    heightPx: Math.round(heightMm * DOTS_PER_MM),
  };
}

/** Estimate whether the barcode will be reliably scannable at the current label size. */
export function estimateScannability(
  options: BarcodeOptions,
  totalModules: number,
): { ok: boolean; minModulePx: number; warning?: string } {
  const { heightPx } = getLabelPixelDimensions(options);
  const rot = options.rotation ?? (is2DFormat(options.format ?? 'CODE128') ? 0 : 90);
  const barcodeLength = rot === 90 || rot === 270 ? heightPx : PRINTHEAD_PX;
  const quietZoneRatio = options.style?.quietZoneRatio ?? 0.04;
  const printableLength = barcodeLength * (1 - 2 * quietZoneRatio);
  const minModulePx = printableLength / totalModules;

  if (minModulePx < 1) {
    return {
      ok: false,
      minModulePx,
      warning: `Module too small (${minModulePx.toFixed(2)}px). Increase label height or use fewer characters.`,
    };
  }
  if (minModulePx < 2) {
    return {
      ok: true,
      minModulePx,
      warning: `Module width ${minModulePx.toFixed(2)}px is at the lower scanning limit. A longer label or shorter content is recommended.`,
    };
  }
  return { ok: true, minModulePx };
}
