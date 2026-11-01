/**
 * EAN-13, EAN-8, and UPC-A barcode encoders.
 *
 * All encodings from ISO/IEC 15420:2009.
 * No external dependencies.
 */

import type { OneDResult, Segment } from '../types';

// ─── Digit encoding tables ────────────────────────────────────────────────────

/** L-encoding (left-hand, uneven/odd parity). 7 bits per digit (0=space, 1=bar). */
const L: ReadonlyArray<string> = [
  '0001101', '0011001', '0010011', '0111101',
  '0100011', '0110001', '0101111', '0111011',
  '0110111', '0001011',
];

/** G-encoding (left-hand, even parity — complement + reverse of L). */
const G: ReadonlyArray<string> = [
  '0100111', '0110011', '0011011', '0100001',
  '0011101', '0111001', '0000101', '0010001',
  '0001001', '0010111',
];

/** R-encoding (right-hand — complement of L). */
const R: ReadonlyArray<string> = [
  '1110010', '1100110', '1101100', '1000010',
  '1011100', '1001110', '1010000', '1000100',
  '1001000', '1110100',
];

/**
 * Parity pattern for the left 6 digits of EAN-13,
 * indexed by the first/leading digit (0–9).
 * 'L' = L-encoding, 'G' = G-encoding.
 */
const EAN13_PARITY: ReadonlyArray<string> = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL',
  'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG',
  'LGLGGL', 'LGGLGL',
];

type EANVariant = 'EAN13' | 'EAN8' | 'UPCA';

// ─── Check digit calculation ──────────────────────────────────────────────────

/**
 * Compute the EAN/UPC check digit (Modulo 10 with alternating weights 1 & 3).
 * Weights are applied left-to-right:
 *   - odd positions  (1,3,5,...) → weight 1  (or 3 for UPC-A/ITF14)
 *   - even positions (2,4,6,...) → weight 3  (or 1 for UPC-A/ITF14)
 *
 * For EAN-13 (12 data digits):  s1×1 + s2×3 + s3×1 + ... + s12×3
 * For EAN-8  (7 data digits):   s1×3 + s2×1 + s3×3 + ... + s7×3
 * For UPC-A  (11 data digits):  s1×3 + s2×1 + s3×3 + ... + s11×3
 */
function eanCheckDigit(digits: number[], variant: EANVariant): number {
  let sum = 0;
  if (variant === 'EAN13') {
    // Positions 1,3,5,… → ×1; positions 2,4,6,… → ×3
    for (let i = 0; i < digits.length; i++) {
      sum += digits[i] * (i % 2 === 0 ? 1 : 3);
    }
  } else {
    // EAN8 / UPC-A: positions 1,3,5,… → ×3; positions 2,4,6,… → ×1
    for (let i = 0; i < digits.length; i++) {
      sum += digits[i] * (i % 2 === 0 ? 3 : 1);
    }
  }
  return (10 - (sum % 10)) % 10;
}

// ─── Bit string → segments ────────────────────────────────────────────────────

/** Convert a bit string ('0'=space, '1'=bar) to a list of Segments via run-length encoding. */
function bitsToSegments(bits: string): Segment[] {
  const segs: Segment[] = [];
  let i = 0;
  while (i < bits.length) {
    const curr = bits[i];
    let j = i + 1;
    while (j < bits.length && bits[j] === curr) j++;
    segs.push({ type: curr === '1' ? 'bar' : 'space', modules: j - i });
    i = j;
  }
  return segs;
}

// ─── EAN-13 ───────────────────────────────────────────────────────────────────

function buildEAN13Bits(digits: number[]): string {
  // digits[0] = leading/system digit; digits[1..6] = left group; digits[7..12] = right group
  const parity = EAN13_PARITY[digits[0]];
  let bits = '101'; // left guard

  for (let i = 1; i <= 6; i++) {
    const enc = parity[i - 1] === 'L' ? L : G;
    bits += enc[digits[i]];
  }

  bits += '01010'; // center guard

  for (let i = 7; i <= 12; i++) {
    bits += R[digits[i]];
  }

  bits += '101'; // right guard
  return bits;
}

// ─── EAN-8 ────────────────────────────────────────────────────────────────────

function buildEAN8Bits(digits: number[]): string {
  let bits = '101'; // left guard

  for (let i = 0; i < 4; i++) bits += L[digits[i]];

  bits += '01010'; // center guard

  for (let i = 4; i < 8; i++) bits += R[digits[i]];

  bits += '101'; // right guard
  return bits;
}

// ─── UPC-A ────────────────────────────────────────────────────────────────────

/**
 * UPC-A is structurally identical to EAN-13 with leading digit 0,
 * but the first digit is encoded as a bar outside the left guard (human-readable only).
 * In bar pattern terms: UPC-A = EAN-13 with first digit always L-encoded.
 */
function buildUPCABits(digits: number[]): string {
  // UPC-A has the same bit layout as EAN-13 with leading digit = '0'
  // We simply prepend 0 and call EAN-13 builder (parity row 0 = LLLLLL)
  // digits here is 12-long (0..11)
  const full13 = [0, ...digits]; // leading 0 makes it EAN-13 with LLLLLL parity
  return buildEAN13Bits(full13);
}

// ─── Main encoder ─────────────────────────────────────────────────────────────

/**
 * Generate an EAN-13, EAN-8, or UPC-A barcode.
 *
 * Accepts:
 *   EAN-13: 12 digits (check appended) or 13 digits (check validated)
 *   EAN-8:  7 digits (check appended) or 8 digits (check validated)
 *   UPC-A:  11 digits (check appended) or 12 digits (check validated)
 */
export function generateEAN(value: string, variant: EANVariant): OneDResult {
  const expectedFull   = variant === 'EAN13' ? 13 : variant === 'EAN8' ? 8 : 12;
  const expectedNoCheck = expectedFull - 1;

  if (!/^\d+$/.test(value)) {
    throw new Error(`${variant}: only digits are allowed, got "${value}"`);
  }

  let digits: number[];

  if (value.length === expectedFull) {
    digits = value.split('').map(Number);
    const expected = eanCheckDigit(digits.slice(0, expectedNoCheck), variant);
    if (digits[expectedNoCheck] !== expected) {
      throw new Error(
        `${variant}: invalid check digit. Got ${digits[expectedNoCheck]}, expected ${expected}.`
      );
    }
  } else if (value.length === expectedNoCheck) {
    const d = value.split('').map(Number);
    const check = eanCheckDigit(d, variant);
    digits = [...d, check];
  } else {
    throw new Error(
      `${variant}: expected ${expectedNoCheck} or ${expectedFull} digits, got ${value.length}.`
    );
  }

  let bits: string;
  if (variant === 'EAN13') {
    bits = buildEAN13Bits(digits);
  } else if (variant === 'EAN8') {
    bits = buildEAN8Bits(digits);
  } else {
    bits = buildUPCABits(digits);
  }

  const segments = bitsToSegments(bits);
  const totalModules = segments.reduce((s, seg) => s + seg.modules, 0);
  return { segments, totalModules, displayText: digits.join('') };
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateEAN(
  value: string,
  variant: EANVariant,
): { valid: boolean; error?: string; normalized?: string } {
  const expectedFull   = variant === 'EAN13' ? 13 : variant === 'EAN8' ? 8 : 12;
  const expectedNoCheck = expectedFull - 1;

  if (!/^\d+$/.test(value)) {
    return { valid: false, error: `${variant}: only digits allowed` };
  }
  if (value.length !== expectedFull && value.length !== expectedNoCheck) {
    return {
      valid: false,
      error: `${variant}: expected ${expectedNoCheck} or ${expectedFull} digits, got ${value.length}`,
    };
  }
  if (value.length === expectedNoCheck) {
    const d = value.split('').map(Number);
    const check = eanCheckDigit(d, variant);
    return { valid: true, normalized: value + check };
  }
  // Full length — validate check digit
  const d = value.split('').map(Number);
  const expected = eanCheckDigit(d.slice(0, expectedNoCheck), variant);
  if (d[expectedNoCheck] !== expected) {
    return {
      valid: false,
      error: `${variant}: check digit is ${d[expectedNoCheck]}, should be ${expected}`,
    };
  }
  return { valid: true };
}
