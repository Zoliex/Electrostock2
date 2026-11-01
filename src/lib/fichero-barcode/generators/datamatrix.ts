/**
 * Data Matrix generator — wraps bwip-js (browser build).
 * bwip-js renders to a canvas at scale=4px/module, then we extract the matrix.
 * https://www.npmjs.com/package/bwip-js
 */

// bwip-js ships its own types via the main package
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — bwip-js types vary across versions; skipLibCheck handles this
import bwipjs from 'bwip-js';
import type { TwoDResult } from '../types';

const SCALE = 4; // px per module — large enough for reliable pixel sampling

export async function generateDataMatrix(value: string): Promise<TwoDResult> {
  if (!value) throw new Error('DATA_MATRIX: value must not be empty');
  if (typeof document === 'undefined') {
    throw new Error('DATA_MATRIX: requires a browser environment (canvas API)');
  }

  const canvas = document.createElement('canvas');

  // bwip-js v3 returns a Promise in the browser
  await bwipjs.toCanvas(canvas, {
    bcid:         'datamatrix',
    text:         value,
    scale:        SCALE,
    paddingwidth: 0,
    paddingheight: 0,
  });

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('DATA_MATRIX: failed to get canvas 2D context');

  const { width, height } = canvas;
  const imgData = ctx.getImageData(0, 0, width, height);

  const modulesX = Math.round(width  / SCALE);
  const modulesY = Math.round(height / SCALE);
  const matrix: boolean[][] = [];

  for (let r = 0; r < modulesY; r++) {
    matrix[r] = [];
    for (let c = 0; c < modulesX; c++) {
      // Sample the center pixel of each module
      const px  = Math.floor(c * SCALE + SCALE / 2);
      const py  = Math.floor(r * SCALE + SCALE / 2);
      const idx = (py * width + px) * 4;
      matrix[r][c] = imgData.data[idx] < 128; // dark = black module
    }
  }

  return { matrix, size: Math.max(modulesX, modulesY) };
}

export function validateDataMatrix(value: string): { valid: boolean; error?: string } {
  if (!value) return { valid: false, error: 'Data Matrix: value is required' };
  // Data Matrix supports up to 2335 bytes or 3116 ASCII numeric characters
  if (value.length > 3116) {
    return { valid: false, error: `Data Matrix: value too long (${value.length} chars, max ~3116)` };
  }
  return { valid: true };
}
