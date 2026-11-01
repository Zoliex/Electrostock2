/**
 * useBarcodeLabel — React hook that manages barcode rendering state.
 *
 * Handles:
 * - Debounced re-rendering when options change
 * - Async rendering pipeline (including DataMatrix async generation)
 * - Bitmap extraction for printing
 * - Validation feedback
 *
 * @example
 * const { bitmap, renderError, isRendering, validationResult } = useBarcodeLabel({
 *   value: '12345678',
 *   format: 'CODE128',
 * });
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { renderToCanvas, extractBitmap } from '../renderer';
import { validate } from '../generators/index';
import type { BarcodeOptions, RenderedBitmap, ValidationResult } from '../types';

export interface UseBarcodeLabelReturn {
  /** 1-bit printer-ready bitmap. null while rendering or on error. */
  bitmap: RenderedBitmap | null;
  /** Rendering error message (generator failures, etc.). */
  renderError: string | null;
  /** True while async rendering is in progress. */
  isRendering: boolean;
  /** Validation result for the current value+format. */
  validationResult: ValidationResult;
  /** Ref to attach to a canvas element for live preview. */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function useBarcodeLabel(options: BarcodeOptions): UseBarcodeLabelReturn {
  const [bitmap,      setBitmap     ] = useState<RenderedBitmap | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Stable key to detect option changes without deep-equal
  const optionsKey = useMemo(() => JSON.stringify(options), [options]);

  // Validation (synchronous, instant feedback)
  const validationResult = useMemo<ValidationResult>(() => {
    if (!options.value) return { valid: false, error: 'Value is required' };
    return validate(options.value, options.format ?? 'CODE128');
  }, [options.value, options.format]);

  // Async rendering effect
  useEffect(() => {
    let cancelled = false;

    if (!options.value) {
      setBitmap(null);
      setRenderError(null);
      // Clear canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    setIsRendering(true);
    setRenderError(null);

    // Use an offscreen canvas for bitmap extraction, and the ref canvas for display
    const offscreen = document.createElement('canvas');

    renderToCanvas(offscreen, options)
      .then(() => {
        if (cancelled) return;

        // Extract printer bitmap from offscreen canvas
        const bm = extractBitmap(offscreen);
        setBitmap(bm);

        // Mirror to display canvas if attached
        const displayCanvas = canvasRef.current;
        if (displayCanvas) {
          displayCanvas.width  = offscreen.width;
          displayCanvas.height = offscreen.height;
          const displayCtx = displayCanvas.getContext('2d')!;
          displayCtx.drawImage(offscreen, 0, 0);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setRenderError(msg);
        setBitmap(null);
      })
      .finally(() => {
        if (!cancelled) setIsRendering(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey]);

  return { bitmap, renderError, isRendering, validationResult, canvasRef };
}
