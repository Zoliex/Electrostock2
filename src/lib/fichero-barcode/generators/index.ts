/**
 * Central dispatcher: routes a barcode value+format to the correct generator.
 * Also exposes per-format validation helpers.
 */

import type { BarcodeFormat, BarcodeOptions, GeneratorResult, ValidationResult } from '../types';

import { generateCode128, validateCode128 } from './code128';
import { generateCode39,  validateCode39  } from './code39';
import { generateEAN,     validateEAN     } from './ean';
import { generateITF14,   validateITF14   } from './itf';
import { generateQR,      validateQR      } from './qr';
import { generateDataMatrix, validateDataMatrix } from './datamatrix';

// ─── Dispatch ─────────────────────────────────────────────────────────────────

/**
 * Generate barcode data for the given value and format.
 * Async because DataMatrix uses bwip-js which is Promise-based.
 */
export async function dispatch(
  value: string,
  format: BarcodeFormat,
  options: BarcodeOptions,
): Promise<GeneratorResult> {
  switch (format) {
    case 'CODE128':
      return { kind: '1d', data: generateCode128(value) };

    case 'CODE39':
      return { kind: '1d', data: generateCode39(value) };

    case 'EAN13':
      return { kind: '1d', data: generateEAN(value, 'EAN13') };

    case 'EAN8':
      return { kind: '1d', data: generateEAN(value, 'EAN8') };

    case 'UPCA':
      return { kind: '1d', data: generateEAN(value, 'UPCA') };

    case 'ITF14':
      return { kind: '1d', data: generateITF14(value) };

    case 'QR_CODE':
      return { kind: '2d', data: generateQR(value, options.twod?.qr) };

    case 'DATA_MATRIX':
      return { kind: '2d', data: await generateDataMatrix(value) };

    default:
      throw new Error(`Unsupported barcode format: ${String(format)}`);
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Validate (and optionally normalise) a value for a given barcode format. */
export function validate(value: string, format: BarcodeFormat): ValidationResult {
  switch (format) {
    case 'CODE128':
      return validateCode128(value);

    case 'CODE39':
      return validateCode39(value);

    case 'EAN13':
      return validateEAN(value, 'EAN13');

    case 'EAN8':
      return validateEAN(value, 'EAN8');

    case 'UPCA':
      return validateEAN(value, 'UPCA');

    case 'ITF14':
      return validateITF14(value);

    case 'QR_CODE':
      return validateQR(value);

    case 'DATA_MATRIX':
      return validateDataMatrix(value);

    default:
      return { valid: false, error: `Unknown format: ${String(format)}` };
  }
}

/** Human-readable label for each format. */
export const FORMAT_LABELS: Record<BarcodeFormat, string> = {
  CODE128:     'CODE 128',
  CODE39:      'CODE 39',
  EAN13:       'EAN-13',
  EAN8:        'EAN-8',
  UPCA:        'UPC-A',
  ITF14:       'ITF-14',
  QR_CODE:     'QR Code',
  DATA_MATRIX: 'Data Matrix',
};

/** Example/placeholder value for each format. */
export const FORMAT_EXAMPLES: Record<BarcodeFormat, string> = {
  CODE128:     'Hello-World',
  CODE39:      'HELLO WORLD',
  EAN13:       '978030640615',
  EAN8:        '9638527',
  UPCA:        '03600029145',
  ITF14:       '1234567890128',
  QR_CODE:     'https://example.com',
  DATA_MATRIX: 'fichero-d11s',
};

/** Whether the format is a 2D symbology. */
export function is2DFormat(format: BarcodeFormat): boolean {
  return format === 'QR_CODE' || format === 'DATA_MATRIX';
}
