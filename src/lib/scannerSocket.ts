import qrcode from "qrcode-generator";

export interface RemoteScanOrderItem {
  id: string;
  lcscPartNumber: string;
  name: string;
  manufacturer: string;
  csvPackage: string;
  quantity: number;
  internalBarcode: string;
  thumbnailUrl: string | null;
  importStatus: "ready" | "importing" | "imported" | "error";
}

export interface ScanFeedbackPayload {
  id: string;
  rawCode: string;
  assignedBarcode: string;
  lcscPartNumber: string;
  componentName: string;
  mode: "2d_auto" | "1d_active" | "select_part" | "single";
  timestamp: number;
}

export interface NetworkAddressInfo {
  ip: string;
  name: string;
  isTailscale: boolean;
}

export function generateSessionId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

export function generateQrDataUrl(text: string): string {
  try {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createDataURL(6, 2);
  } catch (e) {
    console.error("Failed to generate QR data URL:", e);
    return "";
  }
}

/**
 * Plays a short confirmation beep using Web Audio API and triggers mobile haptic feedback.
 */
export function playScanFeedbackSound(type: "success" | "select" | "warning" = "success") {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(type === "success" ? [70] : [40, 40, 40]);
    }
  } catch {
    // Ignore vibration errors
  }

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === "success") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(1046.5, now); // C6
      osc.frequency.setValueAtTime(1318.5, now + 0.06); // E6
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.start(now);
      osc.stop(now + 0.16);
    } else if (type === "select") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now); // A5
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(320, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    }

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 300);
  } catch {
    // Ignore audio context errors
  }
}

export function buildWsUrl(sessionId: string, role: "pc" | "phone"): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${protocol}//${host}/ws-scanner?session=${encodeURIComponent(
    sessionId.trim().toUpperCase()
  )}&role=${role}`;
}

/**
 * Downscales a high-res mobile camera photo to a manageable size (e.g. max 1400px)
 * so 1D/2D barcode decoders work fast and reliably without exhausting mobile RAM.
 */
async function resizeImageFile(file: File, maxDim = 1400): Promise<{ blob: Blob; canvas: HTMLCanvasElement } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve({ blob, canvas });
          else resolve(null);
        },
        "image/jpeg",
        0.92
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Decodes a 1D barcode (Code128/Code39/EAN) or 2D QR/DataMatrix from an image File
 * captured via <input type="file" accept="image/*" capture="environment">.
 */
export async function decodeBarcodeFromImageFile(
  file: File,
  Html5QrcodeClass: any,
  qrOnly = false,
  supportedFormats?: any[]
): Promise<string | null> {
  const resized = await resizeImageFile(file, 1500);

  // 1. Try native BarcodeDetector API first if supported by mobile browser
  const BarcodeDetectorAPI = (window as any).BarcodeDetector;
  if (BarcodeDetectorAPI) {
    try {
      const detector = new BarcodeDetectorAPI({
        formats: qrOnly
          ? ["qr_code", "data_matrix"]
          : [
              "qr_code",
              "data_matrix",
              "code_128",
              "code_39",
              "code_93",
              "ean_13",
              "ean_8",
              "itf",
              "pdf417"
            ]
      });
      if (resized?.canvas) {
        const results = await detector.detect(resized.canvas);
        if (results && results.length > 0) {
          // If multiple codes are visible on the label, prefer the one containing pc: / pbn:
          const lcscQr = results.find((r: any) => /pc\s*:/i.test(String(r.rawValue || "")));
          const chosen = lcscQr || results[0];
          if (chosen?.rawValue) {
            return String(chosen.rawValue).trim();
          }
        }
      }
    } catch {
      // Fallback to Html5Qrcode
    }
  }

  // 2. Try Html5Qrcode.scanFile on resized image, then original file
  const tempId = `temp-file-scanner-${Math.random().toString(36).slice(2, 8)}`;
  const tempDiv = document.createElement("div");
  tempDiv.id = tempId;
  tempDiv.style.display = "none";
  document.body.appendChild(tempDiv);

  try {
    const config =
      supportedFormats && supportedFormats.length > 0
        ? { formatsToSupport: supportedFormats, verbose: false }
        : undefined;
    const scanner = new Html5QrcodeClass(tempId, config);
    if (resized?.blob) {
      const resizedFile = new File([resized.blob], "scan.jpg", { type: "image/jpeg" });
      try {
        const decoded = await scanner.scanFile(resizedFile, false);
        if (decoded && String(decoded).trim()) {
          scanner.clear();
          return String(decoded).trim();
        }
      } catch {
        // Try original file next
      }
    }

    const decodedOrig = await scanner.scanFile(file, false);
    scanner.clear();
    if (decodedOrig && String(decodedOrig).trim()) {
      return String(decodedOrig).trim();
    }
  } catch {
    // Could not decode
  } finally {
    tempDiv.remove();
  }

  return null;
}

