/**
 * ITF-14 (Interleaved 2 of 5) barcode encoder.
 *
 * ITF-14 always encodes exactly 14 digits in pairs (2 digits per symbol).
 * Each digit position within a symbol alternates: first digit = bars, second = spaces.
 * No external dependencies.
 */

import type { OneDResult, Segment } from '../types';

// ─── ITF digit patterns ───────────────────────────────────────────────────────

/**
 * Each digit maps to 5 element widths: N=narrow(1 module), W=wide(3 modules).
 * Encoded as a 5-element array: 0 = narrow, 1 = wide.
 */
const ITF_DIGIT: ReadonlyArray<ReadonlyArray<0 | 1>> = [
  [0,0,1,1,0], // 0
  [1,0,0,0,1], // 1
  [0,1,0,0,1], // 2
  [1,1,0,0,0], // 3
  [0,0,1,0,1], // 4
  [1,0,1,0,0], // 5
  [0,1,1,0,0], // 6
  [0,0,0,1,1], // 7
  [1,0,0,1,0], // 8
  [0,1,0,1,0], // 9
];

const NARROW = 1;
const WIDE   = 3;

// ─── Check digit ──────────────────────────────────────────────────────────────

/** ITF-14 uses the same Modulo-10 algorithm as UPC/EAN. */
function itf14CheckDigit(digits: number[]): number {
  // 13 data digits, weights start at 3 for position 0
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    sum += digits[i] * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

// ─── Encoder ─────────────────────────────────────────────────────────────────

/**
 * Encode a string as ITF-14.
 *
 * Accepts:
 *   13 digits → check digit auto-appended
 *   14 digits → check digit validated
 */
export function generateITF14(value: string): OneDResult {
  if (!/^\d+$/.test(value)) {
    throw new Error(`ITF-14: only digits are allowed, got "${value}"`);
  }

  let digits: number[];

  if (value.length === 13) {
    const d = value.split('').map(Number);
    const check = itf14CheckDigit(d);
    digits = [...d, check];
  } else if (value.length === 14) {
    digits = value.split('').map(Number);
    const expected = itf14CheckDigit(digits.slice(0, 13));
    if (digits[13] !== expected) {
      throw new Error(
        `ITF-14: invalid check digit. Got ${digits[13]}, expected ${expected}.`
      );
    }
  } else {
    throw new Error(`ITF-14: expected 13 or 14 digits, got ${value.length}.`);
  }

  const segments: Segment[] = [];

  // Start: NNW (bar, space, bar) = narrow(1) narrow(1) wide(3) → 5 modules
  // Standard start: 4 thin elements (bar space bar space)
  segments.push({ type: 'bar',   modules: NARROW });
  segments.push({ type: 'space', modules: NARROW });
  segments.push({ type: 'bar',   modules: NARROW });
  segments.push({ type: 'space', modules: NARROW });

  // Interleave pairs: first digit → bars, second digit → spaces
  for (let i = 0; i < 14; i += 2) {
    const barsPattern  = ITF_DIGIT[digits[i]];
    const spacePattern = ITF_DIGIT[digits[i + 1]];
    for (let k = 0; k < 5; k++) {
      segments.push({ type: 'bar',   modules: barsPattern[k]  ? WIDE : NARROW });
      segments.push({ type: 'space', modules: spacePattern[k] ? WIDE : NARROW });
    }
  }

  // Stop: WWN (wide bar, narrow space, wide bar) = wide(3) narrow(1) wide(3)
  segments.push({ type: 'bar',   modules: WIDE   });
  segments.push({ type: 'space', modules: NARROW });
  segments.push({ type: 'bar',   modules: WIDE   });

  const totalModules = segments.reduce((s, seg) => s + seg.modules, 0);
  return { segments, totalModules, displayText: digits.join('') };
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateITF14(
  value: string,
): { valid: boolean; error?: string; normalized?: string } {
  if (!/^\d+$/.test(value)) {
    return { valid: false, error: 'ITF-14: only digits allowed' };
  }
  if (value.length === 13) {
    const d = value.split('').map(Number);
    const check = itf14CheckDigit(d);
    return { valid: true, normalized: value + check };
  }
  if (value.length === 14) {
    const d = value.split('').map(Number);
    const expected = itf14CheckDigit(d.slice(0, 13));
    if (d[13] !== expected) {
      return {
        valid: false,
        error: `ITF-14: check digit is ${d[13]}, should be ${expected}`,
      };
    }
    return { valid: true };
  }
  return { valid: false, error: `ITF-14: expected 13 or 14 digits, got ${value.length}` };
}
