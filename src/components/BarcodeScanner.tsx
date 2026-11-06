import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Html5Qrcode, CameraDevice } from "html5-qrcode";
import { X, Camera, RefreshCw, Smartphone, Upload } from "lucide-react";
import { toast } from "sonner";
import { decodeBarcodeFromImageFile, playScanFeedbackSound } from "../lib/scannerSocket";

const PREFERRED_CAMERA_STORAGE_KEY = "electrostock_preferred_camera_id";

interface BarcodeScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const readerElementId = useRef(`reader-${Math.random().toString(36).slice(2, 8)}`).current;
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const nativeFileInputRef = useRef<HTMLInputElement>(null);

  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const [error, setError] = useState<string>("");
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [camerasReady, setCamerasReady] = useState<boolean>(false);
  const [selectedCameraId, setSelectedCameraId] = useState<string>(() => {
    try {
      return localStorage.getItem(PREFERRED_CAMERA_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [isStarting, setIsStarting] = useState<boolean>(true);
  const [isDecodingPhoto, setIsDecodingPhoto] = useState<boolean>(false);

  // Step 1: Enumerate cameras first before starting stream (avoids double-start race condition on mobile)
  useEffect(() => {
    let mounted = true;

    if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError(
        "Le flux vidéo en direct nécessite HTTPS ou le bouton Appareil Photo Natif ci-dessous."
      );
      setIsStarting(false);
      setCamerasReady(false);
      return;
    }

    Html5Qrcode.getCameras()
      .then((devices) => {
        if (!mounted) return;
        if (devices && devices.length > 0) {
          setCameras(devices);
          const saved = localStorage.getItem(PREFERRED_CAMERA_STORAGE_KEY);
          if (saved && devices.some((d) => d.id === saved)) {
            setSelectedCameraId(saved);
          } else {
            const backCam =
              devices.find((d) => /back|rear|environment|arrière|0/i.test(d.label)) ||
              devices[devices.length - 1];
            setSelectedCameraId(backCam.id);
          }
        }
        setCamerasReady(true);
      })
      .catch((err) => {
        console.warn("Could not enumerate cameras, falling back to facingMode environment:", err);
        if (mounted) {
          setCamerasReady(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Step 2: Start / restart scanner only after camera enumeration finished
  useEffect(() => {
    if (!camerasReady) return;
    let isCancelled = false;

    const safeStopCurrent = async () => {
      if (startPromiseRef.current) {
        await startPromiseRef.current.catch(() => {});
      }
      const inst = html5QrCodeRef.current;
      if (inst) {
        try {
          if (inst.isScanning) {
            await inst.stop();
          }
        } catch {
          // Ignore stop error
        }
        try {
          inst.clear();
        } catch {
          // Ignore clear error
        }
        html5QrCodeRef.current = null;
      }
    };

    const startScanner = async () => {
      setIsStarting(true);
      setError("");

      await safeStopCurrent();
      if (isCancelled) return;

      try {
        const instance = new Html5Qrcode(readerElementId);
        html5QrCodeRef.current = instance;

        const cameraConfig = selectedCameraId
          ? selectedCameraId
          : { facingMode: "environment" };

        const p = instance.start(
          cameraConfig,
          {
            fps: 12
          },
          (decodedText) => {
            const cleaned = decodedText.trim();
            if (!cleaned) return;
            playScanFeedbackSound("success");
            onScanRef.current(cleaned);
          },
          () => {
            // Ignore frame scan misses
          }
        );
        startPromiseRef.current = p.then(() => {}).catch(() => {});
        await p;
      } catch (err: any) {
        if (!isCancelled) {
          console.error("Error starting scanner:", err);
          setError(
            err?.message ||
              "Impossible de démarrer la caméra en direct. Utilisez le bouton Appareil Photo Natif ci-dessous."
          );
        }
      } finally {
        if (!isCancelled) {
          setIsStarting(false);
        }
      }
    };

    startScanner();

    return () => {
      isCancelled = true;
      safeStopCurrent();
    };
  }, [camerasReady, selectedCameraId, readerElementId]);

  const handleCameraChange = (newId: string) => {
    setSelectedCameraId(newId);
    try {
      localStorage.setItem(PREFERRED_CAMERA_STORAGE_KEY, newId);
    } catch {
      // Ignore storage error
    }
  };

  const handleCycleCamera = () => {
    if (cameras.length <= 1) return;
    const idx = cameras.findIndex((c) => c.id === selectedCameraId);
    const nextCam = cameras[(idx + 1) % cameras.length];
    if (nextCam) handleCameraChange(nextCam.id);
  };

  const handleNativeCameraFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setIsDecodingPhoto(true);
    try {
      const decoded = await decodeBarcodeFromImageFile(file, Html5Qrcode);
      if (decoded) {
        playScanFeedbackSound("success");
        onScanRef.current(decoded);
      } else {
        playScanFeedbackSound("warning");
        toast.error("Aucun code-barres ou QR code détecté sur la photo. Rapprochez-vous de l'étiquette.");
      }
    } finally {
      setIsDecodingPhoto(false);
    }
  };

  const scannerUI = (
    <div className="fixed inset-0 z-[99999] bg-black overflow-hidden flex flex-col m-0 p-0 top-0 left-0 right-0 bottom-0">
      <input
        ref={nativeFileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleNativeCameraFile}
        className="hidden"
      />

      {/* Header UI with Camera Selection */}
      <div className="absolute top-0 left-0 w-full p-4 flex flex-wrap justify-between items-center gap-3 z-[10001] bg-gradient-to-b from-black/90 via-black/60 to-transparent pb-8">
        <div className="flex items-center gap-2">
          <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 drop-shadow-md">
            <Camera className="w-5 h-5 text-primary" />
            <span>Scanner un code</span>
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {cameras.length > 0 && (
            <div className="flex items-center gap-1.5">
              <select
                value={selectedCameraId}
                onChange={(e) => handleCameraChange(e.target.value)}
                className="max-w-[180px] sm:max-w-[260px] h-9 px-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold border border-white/20 backdrop-blur-md outline-none cursor-pointer"
              >
                {cameras.map((cam, idx) => (
                  <option key={cam.id} value={cam.id} className="bg-slate-900 text-white">
                    {cam.label || `Caméra ${idx + 1}`}
                  </option>
                ))}
              </select>
              {cameras.length > 1 && (
                <button
                  type="button"
                  onClick={handleCycleCamera}
                  className="p-2 bg-white/15 hover:bg-white/25 backdrop-blur-md text-white rounded-xl border border-white/20 transition-colors cursor-pointer"
                  title="Changer de caméra"
                >
                  <RefreshCw className={`w-4 h-4 ${isStarting ? "animate-spin" : ""}`} />
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-2 bg-white/15 hover:bg-white/25 backdrop-blur-md text-white rounded-full transition-colors cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 z-[10001] gap-4 text-center">
          <div className="p-5 bg-slate-900/95 border border-slate-700 text-white rounded-2xl text-sm max-w-md space-y-4 shadow-2xl">
            <p className="text-red-300 font-medium">{error}</p>
            <button
              type="button"
              onClick={() => nativeFileInputRef.current?.click()}
              disabled={isDecodingPhoto}
              className="w-full py-3.5 px-4 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer"
            >
              <Camera className="w-5 h-5" />
              <span>
                {isDecodingPhoto ? "Analyse de la photo..." : "Prendre en photo le code (Appareil Natif)"}
              </span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Custom Dark Overlay with Cutout */}
          <div className="absolute inset-0 z-[10000] pointer-events-none flex items-center justify-center overflow-hidden">
            <div
              className="w-64 h-64 sm:w-80 sm:h-80 relative rounded-2xl"
              style={{ boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.7)" }}
            >
              {/* Corner brackets */}
              <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-white rounded-tl-2xl"></div>
              <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-white rounded-tr-2xl"></div>
              <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-white rounded-bl-2xl"></div>
              <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-white rounded-br-2xl"></div>

              {/* Scanning laser animation */}
              <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.8)] rounded-full animate-[scan_2s_ease-in-out_infinite]"></div>
            </div>
          </div>

          {/* Scanner Video Container */}
          <style>{`
            #${readerElementId} { width: 100vw !important; height: 100vh !important; border: none !important; }
            #${readerElementId} video { 
              object-fit: cover !important; 
              width: 100vw !important; 
              height: 100vh !important; 
              position: absolute;
              top: 0;
              left: 0;
              z-index: 1;
            }
            #${readerElementId}__dashboard_section_csr span { color: transparent !important; }
            @keyframes scan {
              0%, 100% { transform: translateY(-100px); opacity: 0; }
              10%, 90% { opacity: 1; }
              50% { transform: translateY(100px); }
            }
          `}</style>
          <div id={readerElementId} className="absolute inset-0 z-0"></div>
        </>
      )}

      {/* Bottom Action Bar: Direct access to PC Batch Scanner + Native Camera Fallback */}
      <div className="absolute bottom-6 inset-x-4 flex flex-col items-center gap-2.5 z-[10001]">
        <p className="text-white/85 text-xs sm:text-sm font-medium bg-black/60 px-4 py-1.5 rounded-full backdrop-blur-md text-center">
          Scannez un sachet (1D / QR 2D) ou le QR Code d'import PC
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2 w-full max-w-md">
          <button
            type="button"
            onClick={() => onScanRef.current("/remote-scan?session=AUTO")}
            className="flex-1 min-w-[200px] py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer"
          >
            <Smartphone className="w-4 h-4 shrink-0" />
            <span>Mode Scanner Batch Lié au PC (LCSC)</span>
          </button>

          <button
            type="button"
            onClick={() => nativeFileInputRef.current?.click()}
            disabled={isDecodingPhoto}
            className="py-3 px-3.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-white border border-slate-600 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 backdrop-blur-md cursor-pointer"
            title="Prendre une photo du code-barres avec l'appareil photo natif"
          >
            <Upload className="w-4 h-4 shrink-0" />
            <span>{isDecodingPhoto ? "Analyse..." : "Photo Native"}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(scannerUI, document.body);
}
