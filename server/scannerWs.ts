import http from "http";
import os from "os";
import * as wsPkg from "ws";
import type { WebSocket as WebSocketType } from "ws";
import express from "express";

// Backward & bundle compatibility: support ws v7 (ws.Server) and ws v8+ (ws.WebSocketServer),
// as well as CommonJS and ESM interop.
const wsAny = wsPkg as any;
const WebSocketServer = (
  wsAny.WebSocketServer ||
  wsAny.Server ||
  wsAny.default?.WebSocketServer ||
  wsAny.default?.Server
);
const WebSocket = (
  wsAny.WebSocket ||
  wsAny.default?.WebSocket ||
  wsAny.default ||
  wsAny
) as unknown as {
  OPEN: number;
  CONNECTING: number;
  CLOSING: number;
  CLOSED: number;
};
type WebSocket = WebSocketType;

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

interface SessionRoom {
  sessionId: string;
  mode: "lcsc_batch" | "single_component";
  items: RemoteScanOrderItem[];
  activeRowId: string | null;
  lastFeedback: ScanFeedbackPayload | null;
  clients: Set<{ ws: WebSocket; role: "pc" | "phone" }>;
  updatedAt: number;
}

const rooms = new Map<string, SessionRoom>();

function getOrCreateRoom(sessionId: string): SessionRoom {
  const cleanId = sessionId.trim().toUpperCase();
  let room = rooms.get(cleanId);
  if (!room) {
    room = {
      sessionId: cleanId,
      mode: "lcsc_batch",
      items: [],
      activeRowId: null,
      lastFeedback: null,
      clients: new Set(),
      updatedAt: Date.now()
    };
    rooms.set(cleanId, room);
  }
  room.updatedAt = Date.now();
  return room;
}

function getPresenceCounts(room: SessionRoom) {
  let pcCount = 0;
  let phoneCount = 0;
  for (const client of room.clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      if (client.role === "pc") pcCount++;
      else phoneCount++;
    }
  }
  return { pcCount, phoneCount };
}

function findBestActiveRoom(): SessionRoom | null {
  let bestRoom: SessionRoom | null = null;
  let bestScore = -1;

  for (const room of rooms.values()) {
    const { pcCount } = getPresenceCounts(room);
    if (pcCount === 0 && room.items.length === 0) continue;
    const score =
      (pcCount > 0 ? 100000 : 0) +
      (room.items.length > 0 ? 50000 : 0) +
      Math.floor((room.updatedAt % 10000000) / 1000);
    if (score > bestScore) {
      bestScore = score;
      bestRoom = room;
    }
  }
  return bestRoom;
}

function broadcastToRoom(room: SessionRoom, payload: any, excludeWs?: WebSocket) {
  const message = JSON.stringify(payload);
  for (const client of room.clients) {
    if (client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(message);
      } catch (err) {
        console.warn("[WS-Scanner] Failed to send message to client:", err);
      }
    }
  }
}

function broadcastPresence(room: SessionRoom) {
  const counts = getPresenceCounts(room);
  broadcastToRoom(room, {
    type: "presence",
    sessionId: room.sessionId,
    pcCount: counts.pcCount,
    phoneCount: counts.phoneCount
  });
}

/**
 * Returns local IPv4 addresses (LAN / Tailscale) so the PC can generate a QR code
 * that the phone can reach on the same network.
 */
export function getLocalNetworkAddresses(): { ip: string; name: string; isTailscale: boolean }[] {
  const interfaces = os.networkInterfaces();
  const results: { ip: string; name: string; isTailscale: boolean; score: number }[] = [];

  for (const [name, netList] of Object.entries(interfaces)) {
    if (!netList) continue;
    const lowerName = name.toLowerCase();
    const isVirtual =
      lowerName.includes("vethernet") ||
      lowerName.includes("wsl") ||
      lowerName.includes("virtualbox") ||
      lowerName.includes("vmware") ||
      lowerName.includes("hyper-v") ||
      lowerName.includes("docker") ||
      lowerName.includes("vbox") ||
      lowerName.includes("loopback");

    for (const net of netList) {
      if (net.family === "IPv4" && !net.internal) {
        const isTailscale =
          lowerName.includes("tailscale") || net.address.startsWith("100.");
        const isVirtualBoxDefault = net.address === "192.168.56.1";

        let score = 0;
        if (!isVirtual && !isVirtualBoxDefault) score += 50;
        if (lowerName.includes("wi-fi") || lowerName.includes("wifi") || lowerName.includes("wlan")) {
          score += 30;
        } else if (lowerName.includes("ethernet") || lowerName.includes("eth")) {
          score += 20;
        }
        if (net.address.startsWith("192.168.") && !isVirtualBoxDefault) {
          score += 25;
        } else if (net.address.startsWith("10.")) {
          score += 15;
        } else if (isTailscale) {
          score += 10;
        }

        results.push({
          ip: net.address,
          name,
          isTailscale,
          score
        });
      }
    }
  }

  results.sort((a, b) => b.score - a.score);

  return results.map(({ ip, name, isTailscale }) => ({ ip, name, isTailscale }));
}

export function setupScannerWebSocket(app: express.Application, server: http.Server, port: number) {
  // REST endpoint for network addresses (used to build QR code URL when PC is on localhost)
  app.get("/api/network-info", (_req, res) => {
    res.json({
      port,
      hostname: os.hostname(),
      addresses: getLocalNetworkAddresses()
    });
  });

  // REST endpoint to discover the active PC session automatically from a phone
  app.get("/api/scanner-active-session", (_req, res) => {
    const active = findBestActiveRoom();
    const list = Array.from(rooms.values())
      .map((r) => {
        const c = getPresenceCounts(r);
        return {
          sessionId: r.sessionId,
          mode: r.mode,
          itemCount: r.items.length,
          pcCount: c.pcCount,
          phoneCount: c.phoneCount,
          updatedAt: r.updatedAt
        };
      })
      .filter((r) => r.pcCount > 0 || r.itemCount > 0);

    res.json({
      activeSessionId: active?.sessionId || null,
      sessions: list
    });
  });

  // Optional REST snapshot endpoint for initial state fetch
  app.get("/api/scanner-session/:sessionId", (req, res) => {
    const room = getOrCreateRoom(req.params.sessionId);
    const counts = getPresenceCounts(room);
    res.json({
      sessionId: room.sessionId,
      mode: room.mode,
      items: room.items,
      activeRowId: room.activeRowId,
      lastFeedback: room.lastFeedback,
      pcCount: counts.pcCount,
      phoneCount: counts.phoneCount
    });
  });

  const wss = new WebSocketServer({ noServer: true });
  wss.on("error", (err) => {
    console.error("[WS-Scanner] WSS error:", err);
  });

  server.on("upgrade", (req, socket, head) => {
    try {
      const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
      if (url.pathname === "/ws-scanner") {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit("connection", ws, req, url);
        });
      }
      // Note: Do not destroy socket for non-matching paths so Vite HMR upgrade requests continue normally
    } catch (err) {
      console.error("[WS-Scanner] Upgrade error:", err);
    }
  });

  wss.on("connection", (ws: WebSocket, _req: http.IncomingMessage, url: URL) => {
    const rawSession = (url.searchParams.get("session") || "DEFAULT").trim().toUpperCase();
    const roleParam = url.searchParams.get("role");
    const role: "pc" | "phone" = roleParam === "phone" ? "phone" : "pc";

    let room = getOrCreateRoom(rawSession);

    // If a phone connects with DEFAULT/AUTO or to an empty room with no PC,
    // automatically attach it to the active PC session room if one exists!
    if (role === "phone") {
      const currentCounts = getPresenceCounts(room);
      if (
        rawSession === "DEFAULT" ||
        rawSession === "AUTO" ||
        (currentCounts.pcCount === 0 && room.items.length === 0)
      ) {
        const bestActive = findBestActiveRoom();
        if (bestActive) {
          room = bestActive;
        }
      }
    }

    const clientEntry = { ws, role };
    room.clients.add(clientEntry);

    // Attach error listener immediately to prevent uncaught exceptions on socket abort/drop
    ws.on("error", (err) => {
      console.warn(`[WS-Scanner] Socket error (${role}, session ${room.sessionId}):`, err.message);
    });

    console.log(
      `[WS-Scanner] Client (${role}) connected to session ${room.sessionId} (total: ${room.clients.size})`
    );

    // Send current room state immediately to the newly connected client
    const counts = getPresenceCounts(room);
    try {
      ws.send(
        JSON.stringify({
          type: "init_state",
          sessionId: room.sessionId,
          mode: room.mode,
          items: room.items,
          activeRowId: room.activeRowId,
          lastFeedback: room.lastFeedback,
          pcCount: counts.pcCount,
          phoneCount: counts.phoneCount
        })
      );
    } catch (err) {
      console.warn("[WS-Scanner] Failed to send init_state:", err);
    }

    broadcastPresence(room);

    // If a phone just joined, ask any connected PC in this room to push its latest state
    if (role === "phone") {
      broadcastToRoom(
        room,
        {
          type: "request_sync",
          sessionId: room.sessionId,
          phoneCount: counts.phoneCount
        },
        ws
      );
    }

    ws.on("message", (rawData) => {
      try {
        const msg = JSON.parse(String(rawData));
        room.updatedAt = Date.now();

        switch (msg.type) {
          case "sync_state": {
            // Sent by PC (or Phone) when items list or activeRowId changes
            if (Array.isArray(msg.items)) {
              room.items = msg.items;
            }
            if (msg.activeRowId !== undefined) {
              room.activeRowId = msg.activeRowId;
            }
            if (msg.mode) {
              room.mode = msg.mode;
            }
            if (msg.lastFeedback !== undefined) {
              room.lastFeedback = msg.lastFeedback;
            }
            broadcastToRoom(
              room,
              {
                type: "state_updated",
                sessionId: room.sessionId,
                mode: room.mode,
                items: room.items,
                activeRowId: room.activeRowId,
                lastFeedback: room.lastFeedback
              },
              ws
            );
            break;
          }

          case "select_item": {
            room.activeRowId = msg.rowId ?? null;
            broadcastToRoom(room, {
              type: "item_selected",
              sessionId: room.sessionId,
              activeRowId: room.activeRowId
            });
            break;
          }

          case "scan_code": {
            // Sent by Phone when a barcode or QR code is scanned
            const rawCode = String(msg.rawCode || "").trim();
            if (!rawCode) break;

            // Forward raw scan event to PC so PC can run full pairing logic
            // Also if no PC is currently handling it or for instant phone responsiveness,
            // PC will immediately emit sync_state back.
            broadcastToRoom(room, {
              type: "remote_scan",
              sessionId: room.sessionId,
              rawCode,
              targetRowId: msg.targetRowId ?? room.activeRowId,
              timestamp: Date.now()
            });
            break;
          }

          case "clear_item_barcode": {
            // Sent by Phone or PC to clear an assigned barcode on a specific item
            const rowId = msg.rowId;
            if (rowId) {
              room.items = room.items.map((it) =>
                it.id === rowId ? { ...it, internalBarcode: "" } : it
              );
              room.activeRowId = rowId;
              broadcastToRoom(room, {
                type: "clear_item_barcode",
                sessionId: room.sessionId,
                rowId,
                items: room.items,
                activeRowId: room.activeRowId
              });
            }
            break;
          }

          case "ping": {
            try {
              ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
            } catch (err) {
              console.warn("[WS-Scanner] Error sending pong:", err);
            }
            break;
          }
        }
      } catch (err) {
        console.error("[WS-Scanner] Error handling message:", err);
      }
    });

    ws.on("close", () => {
      room.clients.delete(clientEntry);
      broadcastPresence(room);
      console.log(
        `[WS-Scanner] Client (${role}) disconnected from session ${room.sessionId} (remaining: ${room.clients.size})`
      );
    });
  });

  // Periodic cleanup of stale rooms (> 12 hours old with 0 clients)
  setInterval(() => {
    const now = Date.now();
    for (const [id, room] of rooms.entries()) {
      if (room.clients.size === 0 && now - room.updatedAt > 12 * 60 * 60 * 1000) {
        rooms.delete(id);
      }
    }
  }, 30 * 60 * 1000);
}
