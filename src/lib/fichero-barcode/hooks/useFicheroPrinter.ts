/**
 * useFicheroPrinter — React hook for managing printer connection and printing.
 *
 * @example
 * const { status, info, connect, disconnect, print, error } = useFicheroPrinter();
 * // Connect:
 * await connect();
 * // Print:
 * const bitmap = await renderToBitmap({ value: '12345', format: 'CODE128' });
 * await print(bitmap, { density: 2, copies: 1 });
 */

import { useState, useCallback, useRef } from 'react';
import { FicheroBLE } from '../ble';
import type {
  PrinterConnectionStatus,
  PrinterDeviceInfo,
  PrintOptions,
  RenderedBitmap,
} from '../types';

export interface UseFicheroPrinterReturn {
  /** Current connection/operation status. */
  status: PrinterConnectionStatus;
  /** Printer device info (available after connecting). */
  info: PrinterDeviceInfo | null;
  /** Last error message, if any. */
  error: string | null;
  /** Open the browser Bluetooth picker and connect. */
  connect: () => Promise<void>;
  /** Disconnect from the printer. */
  disconnect: () => Promise<void>;
  /**
   * Send a rendered bitmap to the printer.
   * Throws if not connected or printing fails.
   */
  print: (bitmap: RenderedBitmap, options?: PrintOptions) => Promise<void>;
  /** Set auto-shutdown time in minutes (1–480). */
  setShutdownTime: (minutes: number) => Promise<boolean>;
}

export function useFicheroPrinter(): UseFicheroPrinterReturn {
  const [status, setStatus] = useState<PrinterConnectionStatus>('disconnected');
  const [info,   setInfo  ] = useState<PrinterDeviceInfo | null>(null);
  const [error,  setError ] = useState<string | null>(null);

  const bleRef = useRef<FicheroBLE | null>(null);

  // ─── connect ───────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    try {
      setStatus('connecting');
      setError(null);

      const ble = new FicheroBLE();
      await ble.connect();

      bleRef.current = ble;

      // Fetch device info
      try {
        const deviceInfo = await ble.getInfo();
        setInfo(deviceInfo);
      } catch {
        // Info fetch is best-effort; don't fail the connection
        setInfo(null);
      }

      setStatus('connected');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStatus('error');
      bleRef.current = null;
    }
  }, []);

  // ─── disconnect ────────────────────────────────────────────────────────────

  const disconnect = useCallback(async () => {
    await bleRef.current?.disconnect();
    bleRef.current = null;
    setStatus('disconnected');
    setInfo(null);
    setError(null);
  }, []);

  // ─── print ─────────────────────────────────────────────────────────────────

  const print = useCallback(async (bitmap: RenderedBitmap, options?: PrintOptions) => {
    const ble = bleRef.current;
    if (!ble || !ble.connected) {
      throw new Error('Printer is not connected. Call connect() first.');
    }

    try {
      setStatus('printing');
      setError(null);
      await ble.print(bitmap, options);
      setStatus('connected');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStatus('error');
      throw e; // re-throw so the caller can handle it
    }
  }, []);

  // ─── setShutdownTime ───────────────────────────────────────────────────────

  const setShutdownTime = useCallback(async (minutes: number): Promise<boolean> => {
    const ble = bleRef.current;
    if (!ble || !ble.connected) {
      throw new Error('Printer is not connected.');
    }
    return ble.setShutdownTime(minutes);
  }, []);

  return { status, info, error, connect, disconnect, print, setShutdownTime };
}
