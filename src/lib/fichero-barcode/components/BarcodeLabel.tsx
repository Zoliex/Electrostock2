/**
 * BarcodeLabel — React component that renders a barcode preview.
 *
 * Displays the barcode at a scaled size with pixelated rendering
 * (each printer dot is clearly visible as a square pixel).
 *
 * @example
 * <BarcodeLabel
 *   options={{ value: '12345678', format: 'CODE128' }}
 *   scale={4}
 *   onRendered={(canvas) => console.log('rendered', canvas.width, canvas.height)}
 * />
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { renderToCanvas } from '../renderer';
import type { BarcodeOptions } from '../types';
import { PRINTHEAD_PX, DEFAULT_LABEL_HEIGHT_MM, DOTS_PER_MM } from '../constants';

export interface BarcodeLabelProps {
  /** Barcode rendering options. */
  options: BarcodeOptions;
  /**
   * CSS display scale factor (default: 4).
   * The internal canvas is always 96×label_height_px;
   * this scales it up visually with `image-rendering: pixelated`.
   */
  scale?: number;
  /** Additional CSS class on the canvas element. */
  className?: string;
  /** Additional inline style on the canvas element. */
  style?: React.CSSProperties;
  /** Called after each successful render with the canvas element. */
  onRendered?: (canvas: HTMLCanvasElement) => void;
  /** Called if rendering throws (e.g. invalid value for the chosen format). */
  onError?: (error: Error) => void;
}

export const BarcodeLabel: React.FC<BarcodeLabelProps> = ({
  options,
  scale = 4,
  className,
  style: cssStyle,
  onRendered,
  onError,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Stable key to avoid deep comparison on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const optionsKey = JSON.stringify(options);

  const doRender = useCallback(async (canvas: HTMLCanvasElement, opts: BarcodeOptions) => {
    try {
      await renderToCanvas(canvas, opts);
      onRendered?.(canvas);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      onError?.(err);
    }
  }, [onRendered, onError]);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    doRender(canvas, options).then(() => {
      if (cancelled) {
        // Revert to blank if a newer render superseded this one
      }
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey, doRender]);

  const labelHeightPx = Math.round(
    (options.label?.heightMm ?? DEFAULT_LABEL_HEIGHT_MM) * DOTS_PER_MM
  );

  return (
    <canvas
      ref={canvasRef}
      width={PRINTHEAD_PX}
      height={labelHeightPx}
      className={className}
      style={{
        width:           `${PRINTHEAD_PX * scale}px`,
        height:          `${labelHeightPx * scale}px`,
        imageRendering:  'pixelated',
        display:         'block',
        ...cssStyle,
      }}
    />
  );
};
