/**
 * CODE39 barcode encoder.
 *
 * Supported characters: A–Z, 0–9, space, - . $ / + %
 * Each symbol = 5 bars + 4 spaces where N=narrow (1 module), W=wide (3 modules).
 * Inter-character gap = 1 module (narrow space).
 */

import type { OneDResult, Segment } from '../types';

// ─── Character set ────────────────────────────────────────────────────────────

/**
 * CODE39 patterns encoded as 9-bit bitmask:
 * bits 8..0 → b1 s1 b2 s2 b3 s3 b4 s4 b5 (alternating bar/space, 5 bars 4 spaces)
 * bit = 0 → narrow (1 module), bit = 1 → wide (3 modules)
 */
const CHARS: Record<string, number> = {
  '0': 0b000110100, '1': 0b100100001, '2': 0b001100001, '3': 0b101100000,
  '4': 0b000110001, '5': 0b100110000, '6': 0b001110000, '7': 0b000100101,
  '8': 0b100100100, '9': 0b001100100, 'A': 0b100001001, 'B': 0b001001001,
  'C': 0b101001000, 'D': 0b000011001, 'E': 0b100011000, 'F': 0b001011000,
  'G': 0b000001101, 'H': 0b100001100, 'I': 0b001001100, 'J': 0b000011100,
  'K': 0b100000011, 'L': 0b001000011, 'M': 0b101000010, 'N': 0b000010011,
  'O': 0b100010010, 'P': 0b001010010, 'Q': 0b000000111, 'R': 0b100000110,
  'S': 0b001000110, 'T': 0b000010110, 'U': 0b110000001, 'V': 0b011000001,
  'W': 0b111000000, 'X': 0b010010001, 'Y': 0b110010000, 'Z': 0b011010000,
  '-': 0b010000101, '.': 0b110000100, ' ': 0b011000100, '$': 0b010101000,
  '/': 0b010100010, '+': 0b010001010, '%': 0b000101010,
  '*': 0b010010100, // Start/Stop character
};

const NARROW = 1;
const WIDE   = 3;
const GAP    = 1; // inter-character gap (narrow space)

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Expand a 9-bit pattern into 9 segments (5 bars, 4 spaces). */
function patternToSegments(bits: number): Segment[] {
  const segs: Segment[] = [];
  for (let k = 8; k >= 0; k--) {
    const isWide = (bits >> k) & 1;
    segs.push({
      type: k % 2 === 0 ? 'bar' : 'space', // bit 8 = bar, 7 = space, …
      modules: isWide ? WIDE : NARROW,
    });
  }
  return segs;
}

// ─── Encoder ─────────────────────────────────────────────────────────────────

/**
 * Encode a string as CODE39.
 * Automatically converts lowercase to uppercase.
 * Throws if unsupported characters are found.
 */
export function generateCode39(value: string): OneDResult {
  if (!value) throw new Error('CODE39: value must not be empty');

  const upper = value.toUpperCase();
  const segments: Segment[] = [];

  // Start: '*'
  segments.push(...patternToSegments(CHARS['*']));

  for (let i = 0; i < upper.length; i++) {
    const ch = upper[i];
    const bits = CHARS[ch];
    if (bits === undefined) {
      throw new Error(`CODE39: unsupported character '${ch}' at position ${i}`);
    }
    // Inter-character gap
    segments.push({ type: 'space', modules: GAP });
    segments.push(...patternToSegments(bits));
  }

  // Stop: '*'
  segments.push({ type: 'space', modules: GAP });
  segments.push(...patternToSegments(CHARS['*']));

  const totalModules = segments.reduce((s, seg) => s + seg.modules, 0);
  return { segments, totalModules, displayText: upper };
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateCode39(value: string): { valid: boolean; error?: string } {
  if (!value) return { valid: false, error: 'Value is required' };
  const upper = value.toUpperCase();
  for (const ch of upper) {
    if (CHARS[ch] === undefined || ch === '*') {
      return {
        valid: false,
        error: `Character '${ch}' is not in the CODE39 character set (A–Z, 0–9, space, -.$/%+*).`,
      };
    }
  }
  return { valid: true };
}
