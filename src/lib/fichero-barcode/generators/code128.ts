/**
 * CODE128 barcode encoder — subset auto-selection (B and C).
 *
 * Verified patterns from ISO/IEC 15417:2007.
 * Each entry: [bar, space, bar, space, bar, space] widths in modules (sum = 11).
 * Exception: index 106 (Stop) has 7 elements (sum = 13).
 */

import type { OneDResult, Segment } from '../types';

// ─── Pattern table ────────────────────────────────────────────────────────────

const P: ReadonlyArray<ReadonlyArray<number>> = [
  [2,1,2,2,2,2], // 0
  [2,2,2,1,2,2], // 1
  [2,2,2,2,2,1], // 2
  [1,2,1,2,2,3], // 3
  [1,2,1,3,2,2], // 4
  [1,3,1,2,2,2], // 5
  [1,2,2,2,1,3], // 6
  [1,2,2,3,1,2], // 7
  [1,3,2,2,1,2], // 8
  [2,2,1,2,1,3], // 9
  [2,2,1,3,1,2], // 10
  [2,3,1,2,1,2], // 11
  [1,1,2,2,3,2], // 12
  [1,2,2,1,3,2], // 13
  [1,2,2,2,3,1], // 14
  [1,1,3,2,2,2], // 15
  [1,2,3,1,2,2], // 16
  [1,2,3,2,2,1], // 17
  [2,2,3,2,1,1], // 18
  [2,2,1,1,3,2], // 19
  [2,2,1,2,3,1], // 20
  [2,1,3,2,1,2], // 21
  [2,2,3,1,1,2], // 22
  [3,1,2,1,3,1], // 23
  [3,1,1,2,2,2], // 24
  [3,2,1,1,2,2], // 25
  [3,2,1,2,2,1], // 26
  [3,1,2,2,1,2], // 27
  [3,2,2,1,1,2], // 28
  [3,2,2,2,1,1], // 29
  [2,1,2,1,2,3], // 30
  [2,1,2,3,2,1], // 31
  [2,3,2,1,2,1], // 32
  [1,1,1,3,2,3], // 33
  [1,3,1,1,2,3], // 34
  [1,3,1,3,2,1], // 35
  [1,1,2,3,1,3], // 36
  [1,3,2,1,1,3], // 37
  [1,3,2,3,1,1], // 38
  [2,1,1,3,1,3], // 39
  [2,3,1,1,1,3], // 40
  [2,3,1,3,1,1], // 41
  [1,1,2,1,3,3], // 42
  [1,1,2,3,3,1], // 43
  [1,3,2,1,3,1], // 44
  [1,1,3,1,2,3], // 45
  [1,1,3,3,2,1], // 46
  [1,3,3,1,2,1], // 47
  [3,1,3,1,2,1], // 48
  [2,1,1,3,3,1], // 49
  [2,3,1,1,3,1], // 50
  [2,1,3,1,1,3], // 51
  [2,1,3,3,1,1], // 52
  [2,1,3,1,3,1], // 53
  [3,1,1,1,2,3], // 54
  [3,1,1,3,2,1], // 55
  [3,3,1,1,2,1], // 56
  [3,1,2,1,1,3], // 57
  [3,1,2,3,1,1], // 58
  [3,3,2,1,1,1], // 59
  [3,1,4,1,1,1], // 60
  [2,2,1,4,1,1], // 61
  [4,3,1,1,1,1], // 62
  [1,1,1,2,2,4], // 63
  [1,1,1,4,2,2], // 64
  [1,2,1,1,2,4], // 65
  [1,2,1,4,2,1], // 66
  [1,4,1,1,2,2], // 67
  [1,4,1,2,2,1], // 68
  [1,1,2,2,1,4], // 69
  [1,1,2,4,1,2], // 70
  [1,2,2,1,1,4], // 71
  [1,2,2,4,1,1], // 72
  [1,4,2,1,1,2], // 73
  [1,4,2,2,1,1], // 74
  [2,4,1,2,1,1], // 75
  [2,2,1,1,1,4], // 76
  [4,1,3,1,1,1], // 77
  [2,4,1,1,1,2], // 78
  [1,3,4,1,1,1], // 79
  [1,1,1,2,4,2], // 80
  [1,2,1,1,4,2], // 81
  [1,2,1,2,4,1], // 82
  [1,1,4,2,1,2], // 83
  [1,2,4,1,1,2], // 84
  [1,2,4,2,1,1], // 85
  [4,1,1,2,1,2], // 86
  [4,2,1,1,1,2], // 87
  [4,2,1,2,1,1], // 88
  [2,1,2,1,4,1], // 89
  [2,1,4,1,2,1], // 90
  [4,1,2,1,2,1], // 91
  [1,1,1,1,4,3], // 92
  [1,1,1,3,4,1], // 93
  [1,3,1,1,4,1], // 94
  [1,1,4,1,1,3], // 95
  [1,1,4,3,1,1], // 96
  [4,1,1,1,1,3], // 97
  [4,1,1,3,1,1], // 98
  [1,1,3,1,4,1], // 99
  [1,1,4,1,3,1], // 100  CODE_B (in A) / FNC4 (in B) / CODE_B (in C)
  [3,1,1,1,4,1], // 101  FNC4 (in A) / CODE_A (in B) / CODE_A (in C)
  [4,1,1,1,3,1], // 102  FNC1
  [2,1,1,4,1,2], // 103  START_A
  [2,1,1,2,1,4], // 104  START_B
  [2,1,1,2,3,2], // 105  START_C
  [2,3,3,1,1,1,2], // 106  STOP (7 elements, sum=13)
];

const START_B  = 104;
const START_C  = 105;
const CODE_C   = 99;  // Switch to subset C (while in B)
const CODE_B   = 100; // Switch to subset B (while in C)
const STOP     = 106;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

/** Count consecutive digit characters from position i. */
function countDigits(value: string, i: number): number {
  let n = 0;
  while (i + n < value.length && isDigit(value[i + n])) n++;
  return n;
}

/** Convert a collected symbol array to Segments (patterns concatenated). */
function symbolsToSegments(symbols: number[]): Segment[] {
  const segs: Segment[] = [];
  for (const sym of symbols) {
    const pat = P[sym];
    for (let k = 0; k < pat.length; k++) {
      segs.push({ type: k % 2 === 0 ? 'bar' : 'space', modules: pat[k] });
    }
  }
  return segs;
}

// ─── Encoder ─────────────────────────────────────────────────────────────────

/**
 * Encode a string as CODE128 using subset auto-selection (B and C).
 * Subset A is not used — subset B covers ASCII 32–127.
 * Throws if the value contains characters outside ASCII 32–127.
 */
export function generateCode128(value: string): OneDResult {
  if (!value) throw new Error('CODE128: value must not be empty');

  const symbols: number[] = [];
  let subset: 'B' | 'C' = 'B';
  symbols.push(START_B);

  let i = 0;
  while (i < value.length) {
    const digitRun = countDigits(value, i);

    if (subset === 'B') {
      // Switch to C when we have ≥4 digits ahead (or ≥2 at end of string)
      const useC = digitRun >= 4
        ? Math.floor(digitRun / 2) * 2
        : digitRun >= 2 && i + digitRun === value.length
          ? 2
          : 0;

      if (useC > 0) {
        symbols.push(CODE_C);
        subset = 'C';
        // Encode pairs
        for (let j = 0; j < useC; j += 2) {
          symbols.push(parseInt(value.slice(i + j, i + j + 2), 10));
        }
        i += useC;
        // Switch back to B if there's more (non-digit) content
        if (i < value.length) {
          symbols.push(CODE_B);
          subset = 'B';
        }
      } else {
        const code = value.charCodeAt(i);
        if (code < 32 || code > 127) {
          throw new Error(
            `CODE128: unsupported character '${value[i]}' (U+${code.toString(16).toUpperCase()}) at position ${i}. Only ASCII 32–127 is supported in subset B.`
          );
        }
        symbols.push(code - 32); // CODE128B value
        i++;
      }
    } else {
      // In subset C: encode pairs of digits
      if (digitRun >= 2) {
        symbols.push(parseInt(value.slice(i, i + 2), 10));
        i += 2;
      } else {
        // Can't stay in C — switch back to B
        symbols.push(CODE_B);
        subset = 'B';
        // Don't advance i — re-process in B
      }
    }
  }

  // Checksum: (startValue + Σ position_i × symbol_i) mod 103
  // Start symbol has position 0 (multiplier = 1); data symbols start at position 1.
  let check = symbols[0]; // START_B = 104, position-weight = 1
  for (let j = 1; j < symbols.length; j++) {
    check += j * symbols[j];
  }
  symbols.push(check % 103);
  symbols.push(STOP);

  const segments = symbolsToSegments(symbols);
  const totalModules = segments.reduce((s, seg) => s + seg.modules, 0);

  return { segments, totalModules, displayText: value };
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateCode128(value: string): { valid: boolean; error?: string } {
  if (!value) return { valid: false, error: 'Value is required' };
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 32 || code > 127) {
      return {
        valid: false,
        error: `Character '${value[i]}' (U+${code.toString(16).toUpperCase()}) is not supported. Only ASCII 32–127.`,
      };
    }
  }
  return { valid: true };
}
