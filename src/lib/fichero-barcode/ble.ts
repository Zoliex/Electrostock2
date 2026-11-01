/**
 * Web Bluetooth BLE transport for the Fichero D11s printer.
 *
 * Implements the AiYin D11s print sequence (reverse-engineered from APK):
 *   1. Set density        10 FF 10 00 nn
 *   2. Set paper type     10 FF 84 nn
 *   3. Wake up            00 × 12
 *   4. Enable             10 FF FE 01
 *   5. Raster data        1D 76 30 00 0C 00 yL yH [data…]  (chunked at 200B)
 *   6. Form feed          1D 0C
 *   7. Stop & wait        10 FF FE 45  → wait for 0xAA or "OK"
 */

import type {
  PrintOptions,
  PrinterDeviceInfo,
  RenderedBitmap,
} from './types';
import {
  BLE_SERVICE_UUID,
  BLE_WRITE_UUID,
  BLE_NOTIFY_UUID,
  PRINTER_NAME_PREFIXES,
  CHUNK_SIZE_BLE,
  BYTES_PER_ROW,
  DELAY_AFTER_DENSITY_MS,
  DELAY_COMMAND_GAP_MS,
  DELAY_CHUNK_GAP_MS,
  DELAY_RASTER_SETTLE_MS,
  DELAY_AFTER_FEED_MS,
  DELAY_NOTIFY_EXTRA_MS,
  STOP_TIMEOUT_MS,
  PAPER_TYPE_VALUES,
} from './constants';

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

// ─── FicheroBLE class ─────────────────────────────────────────────────────────

/**
 * Manages a Web Bluetooth connection to the Fichero D11s printer.
 *
 * @example
 * const ble = new FicheroBLE();
 * await ble.connect();
 * const bitmap = await renderToBitmap({ value: 'Hello', format: 'CODE128' });
 * await ble.print(bitmap);
 * await ble.disconnect();
 */
export class FicheroBLE {
  private device:     BluetoothDevice | null = null;
  private writeChar:  BluetoothRemoteGATTCharacteristic | null = null;
  private notifyChar: BluetoothRemoteGATTCharacteristic | null = null;

  // Notification accumulation
  private notifyBuf: Uint8Array = new Uint8Array(0);
  private notifyCallback: (() => void) | null = null;

  // ─── Connection ─────────────────────────────────────────────────────────────

  /**
   * Opens the Web Bluetooth device picker (filtered to FICHERO/D11s devices)
   * and connects to the printer.
   */
  async connect(): Promise<void> {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth is not available in this browser. Use Chrome, Edge, or Opera.');
    }

    this.device = await navigator.bluetooth.requestDevice({
      filters: PRINTER_NAME_PREFIXES.map(prefix => ({ namePrefix: prefix })),
      optionalServices: [BLE_SERVICE_UUID],
    });

    const server  = await this.device.gatt!.connect();
    const service = await server.getPrimaryService(BLE_SERVICE_UUID);

    this.writeChar  = await service.getCharacteristic(BLE_WRITE_UUID);
    this.notifyChar = await service.getCharacteristic(BLE_NOTIFY_UUID);

    await this.notifyChar.startNotifications();
    this.notifyChar.addEventListener(
      'characteristicvaluechanged',
      this.onNotify.bind(this) as EventListener,
    );

    // Handle unexpected disconnection
    this.device.addEventListener('gattserverdisconnected', () => {
      this.writeChar  = null;
      this.notifyChar = null;
    });
  }

  /** Disconnect from the printer. */
  async disconnect(): Promise<void> {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.device     = null;
    this.writeChar  = null;
    this.notifyChar = null;
    this.notifyBuf  = new Uint8Array(0);
  }

  /** True if currently connected to the printer. */
  get connected(): boolean {
    return this.device?.gatt?.connected ?? false;
  }

  // ─── Notification handler ────────────────────────────────────────────────────

  private onNotify(event: Event): void {
    const char = (event.target as unknown as BluetoothRemoteGATTCharacteristic);
    const value = char.value;
    if (!value) return;
    const chunk = new Uint8Array(value.buffer);
    this.notifyBuf = concat(this.notifyBuf, chunk);
    this.notifyCallback?.();
  }

  // ─── Low-level send ──────────────────────────────────────────────────────────

  private async send(data: Uint8Array): Promise<void> {
    if (!this.writeChar) throw new Error('Printer not connected');
    await this.writeChar.writeValueWithoutResponse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);

  }

  /**
   * Send data and wait for the first notification response.
   * Accumulates for DELAY_NOTIFY_EXTRA_MS after the first notification byte.
   */
  private sendAndWait(data: Uint8Array, timeout = 2000): Promise<Uint8Array> {
    this.notifyBuf = new Uint8Array(0);

    return new Promise<Uint8Array>((resolve, reject) => {
      let extraTimer: ReturnType<typeof setTimeout> | null = null;

      const mainTimer = setTimeout(() => {
        this.notifyCallback = null;
        reject(new Error(`Printer timeout: no response within ${timeout}ms`));
      }, timeout);

      this.notifyCallback = () => {
        // Got first byte(s) — wait a bit more for trailing data
        if (extraTimer) clearTimeout(extraTimer);
        extraTimer = setTimeout(() => {
          clearTimeout(mainTimer);
          this.notifyCallback = null;
          resolve(this.notifyBuf);
        }, DELAY_NOTIFY_EXTRA_MS);
      };

      this.send(data).catch(err => {
        clearTimeout(mainTimer);
        if (extraTimer) clearTimeout(extraTimer);
        this.notifyCallback = null;
        reject(err);
      });
    });
  }

  /** Send large data in BLE-MTU-sized chunks with inter-chunk pacing. */
  private async sendChunked(data: Uint8Array): Promise<void> {
    for (let i = 0; i < data.length; i += CHUNK_SIZE_BLE) {
      await this.send(data.slice(i, i + CHUNK_SIZE_BLE));
      if (i + CHUNK_SIZE_BLE < data.length) {
        await sleep(DELAY_CHUNK_GAP_MS);
      }
    }
  }

  // ─── Printer commands ────────────────────────────────────────────────────────

  /** Query printer status byte (bitmask). */
  async getStatusRaw(): Promise<number> {
    const r = await this.sendAndWait(new Uint8Array([0x10, 0xFF, 0x40]));
    return r.length > 0 ? r[r.length - 1] : 0xFF;
  }

  /** Get battery level 0–100. Returns -1 on failure. */
  async getBattery(): Promise<number> {
    const r = await this.sendAndWait(new Uint8Array([0x10, 0xFF, 0x50, 0xF1]));
    return r.length >= 2 ? r[r.length - 1] : -1;
  }

  /** Get all device info as a structured object. */
  async getInfo(): Promise<PrinterDeviceInfo> {
    const raw = await this.sendAndWait(new Uint8Array([0x10, 0xFF, 0x70]), 3000);
    const text   = new TextDecoder().decode(raw).trim();
    const parts  = text.split('|');
    const status = await this.getStatusRaw();
    const battery = await this.getBattery();

    const statusFlags: string[] = [];
    if (status & 0x01) statusFlags.push('printing');
    if (status & 0x02) statusFlags.push('cover open');
    if (status & 0x04) statusFlags.push('out of paper');
    if (status & 0x08) statusFlags.push('low battery');
    if (status & 0x10) statusFlags.push('overheated');
    if (status & 0x20) statusFlags.push('charging');

    return {
      model:       parts[0]  ?? '?',
      firmware:    parts[3]  ?? '?',
      serial:      parts[4]  ?? '?',
      battery:     battery,
      statusFlags: statusFlags.join(', ') || 'ready',
    };
  }

  /** Set print density (0=light, 1=medium, 2=dark, 3=ultra-dark). */
  async setDensity(density: number): Promise<boolean> {
    const r = await this.sendAndWait(new Uint8Array([0x10, 0xFF, 0x10, 0x00, density & 0xFF]));
    return new TextDecoder().decode(r).trim() === 'OK';
  }

  /** Set auto-shutdown time (1–480 minutes). */
  async setShutdownTime(minutes: number): Promise<boolean> {
    const hi = (minutes >> 8) & 0xFF;
    const lo = minutes & 0xFF;
    const r  = await this.sendAndWait(new Uint8Array([0x10, 0xFF, 0x12, hi, lo]));
    return new TextDecoder().decode(r).trim() === 'OK';
  }

  // ─── Print ───────────────────────────────────────────────────────────────────

  /**
   * Print a rendered bitmap.
   * Repeats the full AiYin print sequence for each copy.
   */
  async print(bitmap: RenderedBitmap, options: PrintOptions = {}): Promise<void> {
    if (!this.connected) throw new Error('Printer not connected');

    const density   = options.density   ?? 2;
    const copies    = options.copies    ?? 1;
    const paperType = options.paperType ?? 'gap';
    const paperVal  = PAPER_TYPE_VALUES[paperType];

    const { bytes, rows } = bitmap;

    // Validate bitmap dimensions
    if (bytes.length !== rows * BYTES_PER_ROW) {
      throw new Error(
        `Bitmap size mismatch: expected ${rows * BYTES_PER_ROW} bytes for ${rows} rows, got ${bytes.length}`
      );
    }

    // (1) Set density — apply once before all copies
    await this.sendAndWait(new Uint8Array([0x10, 0xFF, 0x10, 0x00, density]));
    await sleep(DELAY_AFTER_DENSITY_MS);

    const yL = rows & 0xFF;
    const yH = (rows >> 8) & 0xFF;

    for (let copy = 0; copy < copies; copy++) {
      // (2) Set paper type
      await this.sendAndWait(new Uint8Array([0x10, 0xFF, 0x84, paperVal]));
      await sleep(DELAY_COMMAND_GAP_MS);

      // (3) Wake up (12 null bytes)
      await this.send(new Uint8Array(12));
      await sleep(DELAY_COMMAND_GAP_MS);

      // (4) Enable (AiYin-specific)
      await this.send(new Uint8Array([0x10, 0xFF, 0xFE, 0x01]));
      await sleep(DELAY_COMMAND_GAP_MS);

      // (5) Raster header + data: GS v 0 mode xL xH yL yH [data]
      const header  = new Uint8Array([0x1D, 0x76, 0x30, 0x00, BYTES_PER_ROW, 0x00, yL, yH]);
      const payload = concat(header, bytes);
      await this.sendChunked(payload);
      await sleep(DELAY_RASTER_SETTLE_MS);

      // (6) Form feed
      await this.send(new Uint8Array([0x1D, 0x0C]));
      await sleep(DELAY_AFTER_FEED_MS);

      // (7) Stop print & wait for 0xAA or "OK"
      const stopResp = await this.sendAndWait(
        new Uint8Array([0x10, 0xFF, 0xFE, 0x45]),
        STOP_TIMEOUT_MS,
      );
      const responseOk =
        stopResp[0] === 0xAA ||
        new TextDecoder().decode(stopResp).trim().startsWith('OK');

      if (!responseOk) {
        console.warn(`[FicheroBLE] Stop command: unexpected response [${[...stopResp].map(b => b.toString(16)).join(' ')}]`);
      }
    }
  }
}

// ─── Singleton helpers ────────────────────────────────────────────────────────

/** Shared singleton instance for apps that only need one connection. */
let _instance: FicheroBLE | null = null;

export function getPrinterInstance(): FicheroBLE {
  if (!_instance) _instance = new FicheroBLE();
  return _instance;
}

export function resetPrinterInstance(): void {
  _instance = null;
}
