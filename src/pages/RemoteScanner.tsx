import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  RemoteScanOrderItem,
  ScanFeedbackPayload,
  buildWsUrl
} from "../lib/scannerSocket";
import { parseLcscBagScan } from "../lib/lcsc";
import { MobileBatchBagScanner } from "../components/add-component/MobileBatchBagScanner";

export function RemoteScanner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialSession = (searchParams.get("session") || "AUTO").trim().toUpperCase();

  const [sessionId, setSessionId] = useState<string>(initialSession);
  const [activeServerSessionId, setActiveServerSessionId] = useState<string>(initialSession);
  const [mode, setMode] = useState<"lcsc_batch" | "single_component">("lcsc_batch");
  const [items, setItems] = useState<RemoteScanOrderItem[]>([]);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [lastFeedback, setLastFeedback] = useState<ScanFeedbackPayload | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [pcCount, setPcCount] = useState<number>(0);
  const [scannedSingleBarcodes, setScannedSingleBarcodes] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  // Sync if URL ?session=... changes
  useEffect(() => {
    const param = (searchParams.get("session") || "AUTO").trim().toUpperCase();
    if (param && param !== sessionId) {
      setSessionId(param);
    }
  }, [searchParams, sessionId]);

  const connectWebSocket = useCallback(() => {
    try {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }

      const wsUrl = buildWsUrl(sessionId, "phone");
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data));
          switch (msg.type) {
            case "init_state":
            case "state_updated": {
              if (msg.sessionId) {
                setActiveServerSessionId(String(msg.sessionId));
              }
              if (Array.isArray(msg.items)) {
                setItems(msg.items);
              }
              if (msg.activeRowId !== undefined) {
                setActiveRowId(msg.activeRowId);
              }
              if (msg.mode) {
                setMode(msg.mode);
              }
              if (msg.lastFeedback !== undefined) {
                setLastFeedback(msg.lastFeedback);
              }
              if (typeof msg.pcCount === "number") {
                setPcCount(msg.pcCount);
              }
              break;
            }
            case "item_selected": {
              setActiveRowId(msg.activeRowId ?? null);
              break;
            }
            case "clear_item_barcode": {
              if (Array.isArray(msg.items)) {
                setItems(msg.items);
              }
              if (msg.activeRowId !== undefined) {
                setActiveRowId(msg.activeRowId);
              }
              break;
            }
            case "presence": {
              if (msg.sessionId) {
                setActiveServerSessionId(String(msg.sessionId));
              }
              if (typeof msg.pcCount === "number") {
                setPcCount(msg.pcCount);
              }
              break;
            }
          }
        } catch (err) {
          console.error("Failed to parse WS message on phone:", err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        reconnectTimerRef.current = window.setTimeout(() => {
          connectWebSocket();
        }, 2000);
      };

      ws.onerror = () => {
        setIsConnected(false);
      };
    } catch (e) {
      console.error("WebSocket connection error:", e);
    }
  }, [sessionId]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  const sendWsMessage = (payload: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  };

  const handleSelectRow = (rowId: string) => {
    setActiveRowId(rowId);
    sendWsMessage({
      type: "select_item",
      rowId
    });
  };

  const handleClearBarcode = (rowId: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === rowId ? { ...it, internalBarcode: "" } : it))
    );
    setActiveRowId(rowId);
    sendWsMessage({
      type: "clear_item_barcode",
      rowId
    });
  };

  const handleScanCode = (rawCode: string, targetRowId?: string | null) => {
    const trimmed = rawCode.trim();
    if (!trimmed) return;

    // If the user scans a PC session pairing QR code while already on RemoteScanner, switch session!
    const sessionUrlMatch =
      trimmed.match(/[?&]session=([A-Za-z0-9_-]+)/i) ||
      trimmed.match(/^SESSION:([A-Za-z0-9_-]+)$/i);
    if (trimmed.includes("/remote-scan") || sessionUrlMatch) {
      const newSession = sessionUrlMatch ? sessionUrlMatch[1].toUpperCase() : "AUTO";
      setSessionId(newSession);
      setSearchParams({ session: newSession });
      toast.success(`Connecté à la session PC : ${newSession}`);
      return;
    }

    const parsed = parseLcscBagScan(trimmed);
    if (!parsed.rawNormalized) return;

    // Always send the raw scan event to the PC via WebSocket
    sendWsMessage({
      type: "scan_code",
      rawCode: trimmed,
      targetRowId: targetRowId ?? activeRowId
    });

    if (mode === "single_component" || items.length === 0) {
      const code = parsed.internalBagBarcode || parsed.rawNormalized;
      setScannedSingleBarcodes((prev) => (prev.includes(code) ? prev : [code, ...prev]));
      toast.success(`Code envoyé au PC : ${code}`);
      return;
    }

    // Optimistic local update on the phone
    if (parsed.type === "lcsc_2d_qr" && parsed.lcscPartNumber) {
      const match = items.find(
        (it) => it.lcscPartNumber.toUpperCase() === parsed.lcscPartNumber!.toUpperCase()
      );
      if (match) {
        const assigned = parsed.internalBagBarcode || parsed.pickBatchNumber || "";
        const feedback: ScanFeedbackPayload = {
          id: `${Date.now()}`,
          rawCode: trimmed,
          assignedBarcode: assigned,
          lcscPartNumber: match.lcscPartNumber,
          componentName: match.name,
          mode: "2d_auto",
          timestamp: Date.now()
        };
        setLastFeedback(feedback);
        setItems((prev) =>
          prev.map((it) =>
            it.id === match.id ? { ...it, internalBarcode: assigned || it.internalBarcode } : it
          )
        );
        return;
      }
    }

    if (parsed.type === "lcsc_part_code" && parsed.lcscPartNumber) {
      const match = items.find(
        (it) => it.lcscPartNumber.toUpperCase() === parsed.lcscPartNumber!.toUpperCase()
      );
      if (match) {
        handleSelectRow(match.id);
        toast.info(`Sachet ${match.lcscPartNumber} sélectionné — scannez le code X...`);
        return;
      }
    }

    // 1D bag barcode
    const target =
      (targetRowId ? items.find((i) => i.id === targetRowId) : null) ||
      (activeRowId ? items.find((i) => i.id === activeRowId) : null) ||
      items.find((i) => !i.internalBarcode.trim());

    if (target) {
      const assigned = parsed.internalBagBarcode || parsed.rawNormalized;
      const feedback: ScanFeedbackPayload = {
        id: `${Date.now()}`,
        rawCode: trimmed,
        assignedBarcode: assigned,
        lcscPartNumber: target.lcscPartNumber,
        componentName: target.name,
        mode: "1d_active",
        timestamp: Date.now()
      };
      setLastFeedback(feedback);
      setItems((prev) => {
        const updated = prev.map((it) =>
          it.id === target.id ? { ...it, internalBarcode: assigned } : it
        );
        const currentIdx = updated.findIndex((it) => it.id === target.id);
        const nextUnassigned =
          updated.slice(currentIdx + 1).find((it) => !it.internalBarcode.trim()) ||
          updated.find((it) => !it.internalBarcode.trim());
        if (nextUnassigned) {
          setActiveRowId(nextUnassigned.id);
        }
        return updated;
      });
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col">
      <MobileBatchBagScanner
        items={items}
        activeRowId={activeRowId}
        lastFeedback={lastFeedback}
        onSelectRow={handleSelectRow}
        onScanCode={handleScanCode}
        onClearBarcode={handleClearBarcode}
        onClose={() => navigate("/inventory")}
        isRemoteMode={true}
        sessionId={activeServerSessionId}
        isConnected={isConnected}
        pcConnectedCount={pcCount}
        singleComponentMode={mode === "single_component" && items.length === 0}
        scannedSingleBarcodes={scannedSingleBarcodes}
      />
    </div>
  );
}
