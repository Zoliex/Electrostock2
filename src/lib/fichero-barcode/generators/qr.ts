/**
 * QR Code generator — wraps qrcode-generator (pure JS, synchronous).
 * https://www.npmjs.com/package/qrcode-generator
 */

import qrcode from 'qrcode-generator';
import type { TwoDResult } from '../types';
import type { QROptions } from '../types';

type QRErrorLevel = 'L' | 'M' | 'Q' | 'H';

export function generateQR(value: string, opts: QROptions = {}): TwoDResult {
  if (!value) throw new Error('QR_CODE: value must not be empty');

  const level = (opts.errorCorrection ?? 'M') as QRErrorLevel;

  // typeNumber=0 → auto-select smallest version that fits
  const qr = qrcode(0, level);
  qr.addData(value);
  qr.make();

  const size = qr.getModuleCount();
  const matrix: boolean[][] = [];

  for (let r = 0; r < size; r++) {
    matrix[r] = [];
    for (let c = 0; c < size; c++) {
      matrix[r][c] = qr.isDark(r, c);
    }
  }

  return { matrix, size };
}

export function validateQR(value: string): { valid: boolean; error?: string } {
  if (!value) return { valid: false, error: 'QR Code: value is required' };
  // QR supports any UTF-8 content; the library will throw if capacity is exceeded
  try {
    const qr = qrcode(0, 'L');
    qr.addData(value);
    qr.make();
    return { valid: true };
  } catch {
    return { valid: false, error: 'QR Code: content is too long for any QR version (max ~7089 numeric / ~4296 ASCII)' };
  }
}
