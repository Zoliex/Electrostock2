// ─── Hardware constants ───────────────────────────────────────────────────────

/** Printhead width in pixels. Fixed at 96 on all D11s/AiYin devices. */
export const PRINTHEAD_PX = 96 as const;

/** Bytes per row: 96px / 8 = 12 bytes, MSB-first. */
export const BYTES_PER_ROW = 12 as const;

/** Dots per mm at 203 DPI. */
export const DOTS_PER_MM = 8 as const; // 203.2 / 25.4 ≈ 8

/** Default label width in mm (Fichero standard label). */
export const DEFAULT_LABEL_WIDTH_MM = 14 as const;

/** Default label height in mm (Fichero standard label). */
export const DEFAULT_LABEL_HEIGHT_MM = 30 as const;

// ─── BLE identifiers ──────────────────────────────────────────────────────────

/** Primary BLE GATT service UUID for the D11s UART transport. */
export const BLE_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';

/** Write characteristic UUID (host → printer). */
export const BLE_WRITE_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

/** Notify characteristic UUID (printer → host). */
export const BLE_NOTIFY_UUID = '00002af0-0000-1000-8000-00805f9b34fb';

/** BLE name prefixes used for device discovery. */
export const PRINTER_NAME_PREFIXES = ['FICHERO', 'D11s_'] as const;

/** Max bytes per BLE write (MTU-limited). */
export const CHUNK_SIZE_BLE = 200 as const;

// ─── Timing (milliseconds) ───────────────────────────────────────────────────

export const DELAY_AFTER_DENSITY_MS = 100;
export const DELAY_COMMAND_GAP_MS   = 50;
export const DELAY_CHUNK_GAP_MS     = 20;
export const DELAY_RASTER_SETTLE_MS = 500;
export const DELAY_AFTER_FEED_MS    = 300;
export const DELAY_NOTIFY_EXTRA_MS  = 50;
export const STOP_TIMEOUT_MS        = 60_000;

// ─── Paper type protocol values ───────────────────────────────────────────────

export const PAPER_TYPE_VALUES = {
  gap:        0x00,
  black:      0x01,
  continuous: 0x02,
} as const;
