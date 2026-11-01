import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const scannerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>('');
  const [hasCameras, setHasCameras] = useState<boolean>(true);

  useEffect(() => {
    let html5QrCode: Html5Qrcode;

    const startScanner = async () => {
      try {
        html5QrCode = new Html5Qrcode("reader");
        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            // By omitting qrbox, we let it scan the whole frame and we draw our own overlay
          },
          (decodedText) => {
            onScan(decodedText);
          },
          (errorMessage) => {
            // Ignore scan errors
          }
        );
      } catch (err: any) {
        console.error("Error starting scanner:", err);
        setError(err?.message || "Failed to start camera. Please check permissions.");
      }
    };

    startScanner();

    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(console.error);
      }
    };
  }, [onScan]);

  const scannerUI = (
    <div className="fixed inset-0 z-[99999] bg-black overflow-hidden flex flex-col m-0 p-0 top-0 left-0 right-0 bottom-0">
      {/* Header UI */}
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-center z-[10001] bg-gradient-to-b from-black/80 to-transparent pb-8">
        <h3 className="text-lg font-bold text-white flex items-center gap-2 drop-shadow-md">
          <Camera className="w-5 h-5" /> Scan Barcode
        </h3>
        <button 
          onClick={onClose} 
          className="p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-full transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {error ? (
        <div className="flex-1 flex items-center justify-center p-4 z-[10001]">
          <div className="p-4 bg-red-900/90 text-white rounded-xl text-sm text-center max-w-sm backdrop-blur-md">
            {error}
          </div>
        </div>
      ) : (
        <>
          {/* Custom Dark Overlay with Cutout */}
          <div className="absolute inset-0 z-[10000] pointer-events-none flex items-center justify-center overflow-hidden">
            <div 
              className="w-64 h-64 sm:w-80 sm:h-80 relative rounded-2xl"
              style={{ boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.7)' }}
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
          
          <div className="absolute bottom-10 left-0 w-full text-center z-[10001] pointer-events-none">
            <p className="text-white/80 text-sm font-medium bg-black/50 inline-block px-4 py-2 rounded-full backdrop-blur-md">
              Point your camera at a barcode or QR code
            </p>
          </div>

          {/* Scanner Video Container */}
          <style>{`
            #reader { width: 100vw !important; height: 100vh !important; border: none !important; }
            #reader video { 
              object-fit: cover !important; 
              width: 100vw !important; 
              height: 100vh !important; 
              position: absolute;
              top: 0;
              left: 0;
              z-index: 1;
            }
            #reader__dashboard_section_csr span { color: transparent !important; }
            @keyframes scan {
              0%, 100% { transform: translateY(-100px); opacity: 0; }
              10%, 90% { opacity: 1; }
              50% { transform: translateY(100px); }
            }
          `}</style>
          <div id="reader" ref={scannerRef} className="absolute inset-0 z-0"></div>
        </>
      )}
    </div>
  );

  return createPortal(scannerUI, document.body);
}
