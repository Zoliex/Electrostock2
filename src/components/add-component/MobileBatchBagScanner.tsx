import React, { useEffect, useRef, useState } from "react";
import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
  CameraDevice
} from "html5-qrcode";
import {
  Camera,
  RefreshCw,
  X,
  CheckCircle2,
  CircleDashed,
  Search,
  Barcode,
  Trash2,
  Zap,
  ZapOff,
  Smartphone,
  Wifi,
  WifiOff,
  Pause,
  Play,
  Package,
  Upload,
  QrCode
} from "lucide-react";
import { toast } from "sonner";
import {
  RemoteScanOrderItem,
  ScanFeedbackPayload,
  playScanFeedbackSound,
  decodeBarcodeFromImageFile
} from "../../lib/scannerSocket";
import { parseLcscBagScan } from "../../lib/lcsc";

const PREFERRED_CAMERA_STORAGE_KEY = "electrostock_preferred_camera_id";
const QR_ONLY_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.DATA_MATRIX
];

interface MobileBatchBagScannerProps {
  items: RemoteScanOrderItem[];
  activeRowId: string | null;
  lastFeedback: ScanFeedbackPayload | null;
  onSelectRow: (rowId: string) => void;
  onScanCode: (rawCode: string, targetRowId?: string | null) => void;
  onClearBarcode: (rowId: string) => void;
  onClose?: () => void;
  isRemoteMode?: boolean;
  sessionId?: string;
  isConnected?: boolean;
  pcConnectedCount?: number;
  singleComponentMode?: boolean;
  scannedSingleBarcodes?: string[];
}

export const MobileBatchBagScanner: React.FC<MobileBatchBagScannerProps> = ({
  items,
  activeRowId,
  lastFeedback,
  onSelectRow,
  onScanCode,
  onClearBarcode,
  onClose,
  isRemoteMode = false,
  sessionId,
  isConnected = true,
  pcConnectedCount = 1,
  singleComponentMode = false,
  scannedSingleBarcodes = []
}) => {
  const readerElementId = useRef(
    `batch-bag-reader-${Math.random().toString(36).slice(2, 8)}`
  ).current;
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);

  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [camerasReady, setCamerasReady] = useState<boolean>(false);
  const [selectedCameraId, setSelectedCameraId] = useState<string>(() => {
    try {
      return localStorage.getItem(PREFERRED_CAMERA_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [isCameraPaused, setIsCameraPaused] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(true);
  const [cameraError, setCameraError] = useState<string>("");
  const [torchOn, setTorchOn] = useState(false);
  const [isDecodingPhoto, setIsDecodingPhoto] = useState(false);

  // Filter & Search state for the component list
  const [filterTab, setFilterTab] = useState<"unscanned" | "scanned" | "all">("unscanned");
  const [searchQuery, setSearchQuery] = useState("");
  const [manualBarcodeInput, setManualBarcodeInput] = useState("");

  // Anti-debounce ref so holding a bag in front of the camera doesn't trigger 10 times per second
  const lastScannedRef = useRef<{ code: string; time: number }>({ code: "", time: 0 });
  const onScanCodeRef = useRef(onScanCode);
  const activeRowIdRef = useRef(activeRowId);

  useEffect(() => {
    onScanCodeRef.current = onScanCode;
  }, [onScanCode]);

  useEffect(() => {
    activeRowIdRef.current = activeRowId;
  }, [activeRowId]);

  // Step 1: Enumerate device cameras on mount before starting stream (fixes mobile camera race condition)
  useEffect(() => {
    let mounted = true;

    if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        "Le flux caméra continu est bloqué sur une connexion HTTP locale non sécurisée. Utilisez le bouton Appareil Photo Natif ci-dessous ou ouvrez l'application via HTTPS / Tailscale."
      );
      setIsStartingCamera(false);
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
        console.warn("Camera enumeration warning:", err);
        if (mounted) {
          setCamerasReady(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Step 2: Start / Restart camera cleanly after enumeration (STRICTLY 2D QR / DataMatrix ONLY!)
  useEffect(() => {
    if (!camerasReady) return;
    let isCancelled = false;

    const safeStop = async () => {
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
          // Ignore
        }
        try {
          inst.clear();
        } catch {
          // Ignore
        }
        html5QrCodeRef.current = null;
      }
    };

    const startCamera = async () => {
      if (isCameraPaused) {
        await safeStop();
        if (!isCancelled) setIsStartingCamera(false);
        return;
      }

      setIsStartingCamera(true);
      setCameraError("");
      setTorchOn(false);

      await safeStop();
      if (isCancelled) return;

      try {
        // Initialize Html5Qrcode strictly with 2D QR_CODE and DATA_MATRIX formats only!
        // 1D barcodes (Code128/Code39) printed on the same LCSC bag label are completely ignored.
        const instance = new Html5Qrcode(readerElementId, {
          formatsToSupport: QR_ONLY_FORMATS,
          verbose: false
        });
        html5QrCodeRef.current = instance;

        const cameraConfig = selectedCameraId
          ? selectedCameraId
          : { facingMode: "environment" };

        const p = instance.start(
          cameraConfig,
          {
            fps: 15
          },
          (decodedText) => {
            const cleaned = decodedText.trim();
            if (!cleaned) return;

            // Extra safety check: in batch mode, reject plain 1D bag barcodes (X130138209)
            // and only accept 2D QR payloads (which contain both pc:C... and pdi:...) or session links
            const isSessionQr =
              cleaned.includes("/remote-scan") || /[?&]session=/i.test(cleaned);
            const parsed = parseLcscBagScan(cleaned);
            if (!isSessionQr && parsed.type !== "lcsc_2d_qr") {
              return;
            }

            const now = Date.now();
            if (
              lastScannedRef.current.code === cleaned &&
              now - lastScannedRef.current.time < 1800
            ) {
              return;
            }
            lastScannedRef.current = { code: cleaned, time: now };

            playScanFeedbackSound("success");
            onScanCodeRef.current(cleaned, activeRowIdRef.current);
          },
          () => {
            // Frame without QR code
          }
        );
        startPromiseRef.current = p.then(() => {}).catch(() => {});
        await p;
      } catch (err: any) {
        if (!isCancelled) {
          console.error("Failed to start batch camera:", err);
          setCameraError(
            err?.message ||
              "Impossible d'accéder au flux vidéo en direct. Utilisez le bouton Appareil Photo Natif ci-dessous."
          );
        }
      } finally {
        if (!isCancelled) {
          setIsStartingCamera(false);
        }
      }
    };

    startCamera();

    return () => {
      isCancelled = true;
      safeStop();
    };
  }, [camerasReady, selectedCameraId, isCameraPaused, readerElementId]);

  const handleCameraSelect = (camId: string) => {
    setSelectedCameraId(camId);
    try {
      localStorage.setItem(PREFERRED_CAMERA_STORAGE_KEY, camId);
    } catch {
      // Ignore storage error
    }
  };

  const handleCycleCamera = () => {
    if (cameras.length <= 1) return;
    const currentIdx = cameras.findIndex((c) => c.id === selectedCameraId);
    const nextCam = cameras[(currentIdx + 1) % cameras.length];
    if (nextCam) handleCameraSelect(nextCam.id);
  };

  const toggleTorch = async () => {
    try {
      const inst = html5QrCodeRef.current as any;
      if (!inst || !inst.isScanning) return;
      const nextTorch = !torchOn;
      await inst.applyVideoConstraints({
        advanced: [{ torch: nextTorch }]
      });
      setTorchOn(nextTorch);
    } catch {
      // Torch not supported on this lens/device
    }
  };

  const handleNativeCameraFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setIsDecodingPhoto(true);
    try {
      const decoded = await decodeBarcodeFromImageFile(
        file,
        Html5Qrcode,
        true,
        QR_ONLY_FORMATS
      );
      if (decoded) {
        const isSessionQr =
          decoded.includes("/remote-scan") || /[?&]session=/i.test(decoded);
        const parsed = parseLcscBagScan(decoded);
        if (!isSessionQr && parsed.type !== "lcsc_2d_qr") {
          playScanFeedbackSound("warning");
          toast.error(
            "Seuls les QR Codes 2D des sachets LCSC (contenant C... et X...) sont acceptés en mode batch."
          );
          return;
        }
        playScanFeedbackSound("success");
        onScanCodeRef.current(decoded, activeRowIdRef.current);
      } else {
        playScanFeedbackSound("warning");
        toast.error(
          "QR Code 2D non reconnu sur la photo. Cadrez bien le QR code carré du sachet LCSC."
        );
      }
    } finally {
      setIsDecodingPhoto(false);
    }
  };

  const unscannedItems = items.filter((it) => !it.internalBarcode.trim());
  const scannedItems = items.filter((it) => Boolean(it.internalBarcode.trim()));

  const displayedItems = items.filter((it) => {
    if (filterTab === "unscanned" && it.internalBarcode.trim()) return false;
    if (filterTab === "scanned" && !it.internalBarcode.trim()) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return (
        it.lcscPartNumber.toLowerCase().includes(q) ||
        it.name.toLowerCase().includes(q) ||
        it.manufacturer.toLowerCase().includes(q) ||
        it.internalBarcode.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const activeItem =
    items.find((it) => it.id === activeRowId) || unscannedItems[0] || null;

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 text-white select-none overflow-hidden">
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleNativeCameraFile}
        className="hidden"
      />

      {/* Top Bar: Session Status + Camera Selector */}
      <div className="px-3.5 py-2.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-xl bg-primary/20 text-primary shrink-0">
            {isRemoteMode ? <Smartphone className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xs sm:text-sm font-extrabold tracking-tight truncate">
                {isRemoteMode ? "Scanner Mobile Lié au PC" : "Scan Batch Caméra (Sachets LCSC)"}
              </h2>
              {isRemoteMode && sessionId && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                    isConnected
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : "bg-red-500/15 text-red-400 border-red-500/30"
                  }`}
                >
                  {isConnected ? (
                    <>
                      <Wifi className="w-3 h-3" />
                      <span>
                        {sessionId} {pcConnectedCount > 0 ? "• PC connecté" : "• Attente PC"}
                      </span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3 h-3" />
                      <span>Déconnecté</span>
                    </>
                  )}
                </span>
              )}
            </div>
            {!singleComponentMode && (
              <p className="text-[11px] text-slate-400 truncate">
                <strong className="text-emerald-400">{scannedItems.length}</strong> associé(s) •{" "}
                <strong className="text-amber-400">{unscannedItems.length}</strong> restant(s) à scanner
              </p>
            )}
          </div>
        </div>

        {/* Camera Selection Controls */}
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={() => nativeCameraInputRef.current?.click()}
            disabled={isDecodingPhoto}
            className="h-8 px-2.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 shadow-sm cursor-pointer"
            title="Prendre une photo du sachet avec l'appareil photo natif du téléphone"
          >
            <Upload className="w-3.5 h-3.5 shrink-0" />
            <span>{isDecodingPhoto ? "Lecture..." : "Photo Native"}</span>
          </button>

          {cameras.length > 0 && (
            <select
              value={selectedCameraId}
              onChange={(e) => handleCameraSelect(e.target.value)}
              className="max-w-[140px] sm:max-w-[200px] h-8 px-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-semibold outline-none focus:border-primary cursor-pointer"
              title="Sélectionner l'objectif caméra"
            >
              {cameras.map((cam, idx) => (
                <option key={cam.id} value={cam.id} className="bg-slate-900 text-white">
                  {cam.label || `Caméra ${idx + 1}`}
                </option>
              ))}
            </select>
          )}

          {cameras.length > 1 && (
            <button
              type="button"
              onClick={handleCycleCamera}
              className="h-8 w-8 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer"
              title="Basculer de caméra"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isStartingCamera ? "animate-spin" : ""}`} />
            </button>
          )}

          <button
            type="button"
            onClick={toggleTorch}
            className={`h-8 w-8 flex items-center justify-center rounded-xl border transition-colors cursor-pointer ${
              torchOn
                ? "bg-amber-500 text-slate-950 border-amber-400"
                : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
            }`}
            title="Activer/Désactiver le flash (si supporté)"
          >
            {torchOn ? <Zap className="w-3.5 h-3.5" /> : <ZapOff className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => setIsCameraPaused((p) => !p)}
            className="h-8 w-8 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer"
            title={isCameraPaused ? "Relancer la caméra" : "Mettre la caméra en pause"}
          >
            {isCameraPaused ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5" />}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-2.5 flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-red-500/20 hover:text-red-300 border border-slate-700 text-xs font-bold cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span className="hidden sm:inline">Fermer</span>
            </button>
          )}
        </div>
      </div>

      {/* Camera Viewport Area */}
      <div className="relative w-full h-[32vh] min-h-[195px] max-h-[280px] bg-black overflow-hidden shrink-0 border-b border-slate-800">
        <style>{`
          #${readerElementId} { width: 100% !important; height: 100% !important; border: none !important; }
          #${readerElementId} video {
            object-fit: cover !important;
            width: 100% !important;
            height: 100% !important;
          }
          @keyframes batchLaser {
            0%, 100% { transform: translateY(-50px); opacity: 0.3; }
            50% { transform: translateY(50px); opacity: 1; }
          }
        `}</style>
        <div id={readerElementId} className="w-full h-full" />

        {cameraError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-950/95 text-center z-20 gap-2.5">
            <p className="text-xs text-slate-300 max-w-md">{cameraError}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => nativeCameraInputRef.current?.click()}
                disabled={isDecodingPhoto}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-xs sm:text-sm font-extrabold flex items-center gap-2 shadow-lg cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>
                  {isDecodingPhoto
                    ? "Décodage en cours..."
                    : "Scanner avec l'Appareil Photo Natif"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCamerasReady(true);
                  setIsCameraPaused(true);
                  setTimeout(() => setIsCameraPaused(false), 150);
                }}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-bold cursor-pointer"
              >
                Réessayer flux direct
              </button>
            </div>
          </div>
        ) : isCameraPaused ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/85 z-20 gap-2">
            <p className="text-xs text-slate-400">Caméra en pause</p>
            <button
              type="button"
              onClick={() => setIsCameraPaused(false)}
              className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Reprendre le scan</span>
            </button>
          </div>
        ) : (
          /* Square QR 2D Target Frame Overlay */
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
            <div className="w-44 h-44 sm:w-48 sm:h-48 relative rounded-2xl border border-white/25 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
              <div className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-primary rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-primary rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-primary rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-primary rounded-br-xl" />
              <div className="absolute top-1/2 left-3 right-3 h-0.5 bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.8)] animate-[batchLaser_1.8s_ease-in-out_infinite]" />
            </div>
          </div>
        )}

        {/* QR 2D Auto-Pairing Banner at bottom of camera */}
        {!singleComponentMode && (
          <div className="absolute bottom-2 inset-x-3 z-20 flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80 shadow-lg">
            {unscannedItems.length > 0 ? (
              <div className="min-w-0 flex-1 flex items-center gap-2">
                <QrCode className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-bold text-white block truncate">
                    Scan QR Code 2D uniquement (codes-barres 1D ignorés)
                  </span>
                  <span className="text-[10px] text-emerald-400 block truncate">
                    Association auto : Réf sachet (X...) ↔ Réf LCSC (C...)
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Tous les composants ont un code sachet X... associé !</span>
              </p>
            )}
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/20 text-primary font-bold shrink-0">
              QR 2D ONLY
            </span>
          </div>
        )}

        {/* Last Scan Feedback Toast Banner at top of camera */}
        {lastFeedback && Date.now() - lastFeedback.timestamp < 8000 && (
          <div className="absolute top-2 inset-x-3 z-20 px-3 py-2 rounded-xl bg-emerald-600/95 text-white shadow-lg flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <div className="text-xs truncate">
                <span className="font-extrabold font-mono">{lastFeedback.assignedBarcode}</span>{" "}
                associé à{" "}
                <span className="font-bold underline">{lastFeedback.lcscPartNumber}</span> (
                {lastFeedback.componentName})
              </div>
            </div>
            <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded bg-black/25 shrink-0">
              {lastFeedback.mode === "2d_auto" ? "QR 2D Auto" : "Scan 1D"}
            </span>
          </div>
        )}
      </div>

      {/* Manual / Hardware Scanner Input Bar */}
      <div className="px-3.5 py-2 bg-slate-900 border-b border-slate-800 flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
          <Barcode className="w-4 h-4 text-amber-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={manualBarcodeInput}
            onChange={(e) => setManualBarcodeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && manualBarcodeInput.trim()) {
                e.preventDefault();
                playScanFeedbackSound("success");
                onScanCode(manualBarcodeInput.trim(), activeRowId);
                setManualBarcodeInput("");
              }
            }}
            placeholder="Saisie / douchette (ex: X130138209 ou C11368)..."
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder:text-slate-400 focus:border-amber-400 outline-none font-mono"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            if (!manualBarcodeInput.trim()) return;
            playScanFeedbackSound("success");
            onScanCode(manualBarcodeInput.trim(), activeRowId);
            setManualBarcodeInput("");
          }}
          disabled={!manualBarcodeInput.trim()}
          className="h-9 px-3.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-extrabold disabled:opacity-40 cursor-pointer shrink-0"
        >
          Valider
        </button>
      </div>

      {/* Component Cards Area (Unscanned / Associated) */}
      {singleComponentMode ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Codes-barres scannés dans cette session ({scannedSingleBarcodes.length})
          </h3>
          {scannedSingleBarcodes.length === 0 ? (
            <div className="p-8 rounded-2xl border border-dashed border-slate-800 text-center text-xs text-slate-400">
              Scannez un sachet avec la caméra ci-dessus : le code-barres sera immédiatement envoyé sur votre PC.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {scannedSingleBarcodes.map((code, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-xs font-bold flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {code}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Filter Tabs & Quick Search */}
          <div className="px-3.5 py-2.5 bg-slate-900/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setFilterTab("unscanned")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  filterTab === "unscanned"
                    ? "bg-amber-500 text-slate-950 shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <CircleDashed className="w-3.5 h-3.5" />
                <span>À scanner ({unscannedItems.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("scanned")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  filterTab === "scanned"
                    ? "bg-emerald-500 text-slate-950 shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Associés ({scannedItems.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("all")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filterTab === "all"
                    ? "bg-primary text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Tous ({items.length})
              </button>
            </div>

            <div className="relative flex-1 min-w-[140px] max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrer réf C... ou nom..."
                className="w-full h-8 pl-8 pr-7 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder:text-slate-400 focus:border-primary outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Responsive Card Grid of Components */}
          <div className="flex-1 overflow-y-auto p-3">
            {items.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 space-y-2">
                <Package className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="font-semibold text-slate-300">
                  Aucun composant dans la session d'import pour le moment.
                </p>
                <p>
                  Ouvrez l'import de commande LCSC sur votre PC pour voir apparaître ici toutes les cartes de composants à scanner.
                </p>
              </div>
            ) : displayedItems.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">
                {filterTab === "unscanned"
                  ? "Aucun composant restant à scanner. Tous les sachets sont associés."
                  : "Aucun composant ne correspond à ce filtre."}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {displayedItems.map((item) => {
                  const isSelected = activeItem?.id === item.id;
                  const hasBarcode = Boolean(item.internalBarcode.trim());

                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        playScanFeedbackSound("select");
                        onSelectRow(item.id);
                      }}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-all cursor-pointer ${
                        isSelected
                          ? "bg-primary/15 border-primary ring-1 ring-primary/40"
                          : hasBarcode
                          ? "bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/50"
                          : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {item.thumbnailUrl ? (
                          <img
                            src={item.thumbnailUrl}
                            alt={item.name}
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            decoding="async"
                            className="w-11 h-11 rounded-xl object-contain bg-white p-0.5 border border-slate-700 shrink-0"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 shrink-0">
                            <Package className="w-5 h-5" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded-md bg-primary/20 text-primary border border-primary/30">
                              {item.lcscPartNumber || "SANS-C"}
                            </span>
                            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                              x{item.quantity}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-white truncate mt-1">
                            {item.name}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {item.csvPackage ? `${item.csvPackage} • ` : ""}
                            {item.manufacturer}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {hasBarcode ? (
                          <div className="flex items-center gap-1">
                            <span className="px-2.5 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono text-xs font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {item.internalBarcode}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onClearBarcode(item.id);
                              }}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
                              title="Dissocier ce code-barres"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span
                            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border ${
                              isSelected
                                ? "bg-amber-500 text-slate-950 border-amber-400"
                                : "bg-slate-800 text-slate-400 border-slate-700"
                            }`}
                          >
                            {isSelected ? "Actif" : "Sélectionner"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
