import express from "express";
import http from "http";
import https from "https";
import selfsigned from "selfsigned";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { createProxyMiddleware } from "http-proxy-middleware";
import { createMockDirectusRouter } from "./server/mockDirectus.ts";
import { getLcscComponentDetails, searchCatalogComponents } from "./server/lcsc.ts";
import { setupScannerWebSocket, getLocalNetworkAddresses } from "./server/scannerWs.ts";
import { estimateComponentPrice } from "./server/autoPrice.ts";

dotenv.config();

// Prevent server process termination on unexpected network/socket errors
process.on("uncaughtException", (err) => {
  console.error("[Process] Uncaught exception:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[Process] Unhandled rejection:", reason);
});

const SETTINGS_FILE = path.join(process.cwd(), 'settings.json');

const defaultSettings = {
  directusUrl: process.env.VITE_DIRECTUS_URL || "https://directus.example.com",
  criticalStockThreshold: 10,
  enableAiSuggestions: true
};

function getSettings() {
  dotenv.config({ override: true });
  const currentDefaults = {
    ...defaultSettings,
    directusUrl: process.env.VITE_DIRECTUS_URL || defaultSettings.directusUrl,
  };
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      return { ...currentDefaults, ...JSON.parse(data) };
    }
  } catch (e) {
    console.error("[Settings] Error loading settings:", e);
  }
  return currentDefaults;
}

async function getOrCreateSslCert() {
  const CERT_FILE = path.join(process.cwd(), '.ssl_cert.json');
  try {
    if (fs.existsSync(CERT_FILE)) {
      const data = JSON.parse(fs.readFileSync(CERT_FILE, 'utf-8'));
      if (data.cert && data.private) {
        return data;
      }
    }
  } catch (e) {
    console.warn("[SSL] Could not read existing cert file, regenerating:", e);
  }

  try {
    const netAddrs = getLocalNetworkAddresses();
    const altNames = [
      { type: 2, value: 'localhost' },
      { type: 7, ip: '127.0.0.1' },
      ...netAddrs.map((a) => ({ type: 7, ip: a.ip }))
    ];
    const pems = await selfsigned.generate(
      [{ name: 'commonName', value: 'ElectroStock Local' }],
      { days: 365, extensions: [{ name: 'subjectAltName', altNames }] }
    );
    try {
      fs.writeFileSync(CERT_FILE, JSON.stringify({ cert: pems.cert, private: pems.private }), 'utf-8');
    } catch {
      // Ignore write errors if filesystem is read-only
    }
    return pems;
  } catch (err) {
    console.error("[SSL] Failed to generate self-signed cert:", err);
    return null;
  }
}

async function startServer() {
  const app = express();

  // Set trust proxy to true to support reverse proxies like Tailscale HTTPS/Funnel
  app.set('trust proxy', true);

  const PORT = process.env.PORT || 3000;
  const HTTPS_PORT = process.env.HTTPS_PORT || (Number(PORT) + 1);

  // Allow all devices on the local network (LAN / Tailscale) to access the server
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    console.log(`[Request] ${req.method} ${req.url}`);
    next();
  });

  const mockRouter = createMockDirectusRouter();
  let cachedProxyTarget = "";
  let cachedProxyMiddleware: any = null;

  // Directus routing: use proxy if configured with a real external server, else use built-in mock
  app.use('/directus', (req, res, next) => {
    const current = getSettings();
    const targetUrl = current.directusUrl ? current.directusUrl.trim() : "";
    const isCustomUrl =
      targetUrl !== "" && !targetUrl.includes("directus.example.com");

    if (isCustomUrl) {
      if (cachedProxyTarget !== targetUrl || !cachedProxyMiddleware) {
        cachedProxyTarget = targetUrl;
        cachedProxyMiddleware = createProxyMiddleware({
          target: targetUrl,
          changeOrigin: true,
          pathRewrite: {
            '^/directus': '',
          },
          on: {
            proxyReq: (proxyReq, r) => {
              console.log(`[Proxy] ${r.method} ${r.url} -> ${proxyReq.path}`);
            },
            proxyRes: (proxyRes, r) => {
              // Strip Directus CSP headers to allow PDFs and assets to display seamlessly in browsers
              delete proxyRes.headers['content-security-policy'];
              delete proxyRes.headers['content-security-policy-report-only'];
              console.log(`[Proxy Response] ${proxyRes.statusCode} ${r.url}`);
            },
            error: (err, r) => {
              console.error(`[Proxy Error] ${r.method} ${r.url}`, err);
            }
          }
        });
      }
      return cachedProxyMiddleware(req, res, next);
    }

    // Default to self-contained mock Directus
    return mockRouter(req, res, next);
  });

  // Apply JSON body parsing ONLY to /api routes so it doesn't interfere with proxies or file uploads
  app.use("/api", express.json());

  // Settings API
  app.get("/api/settings", (req, res) => {
    console.log("[API] GET /api/settings");
    res.json(getSettings());
  });

  app.post("/api/settings", (req, res) => {
    console.log("[API] POST /api/settings", req.body);
    try {
      const currentSettings = getSettings();
      const newSettings = { ...currentSettings, ...req.body };
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(newSettings, null, 2));
      res.json({ success: true, settings: newSettings });
    } catch (error) {
      console.error("[API] Error saving settings:", error);
      res.status(500).json({ error: "Failed to save settings" });
    }
  });

  app.post("/api/restart", (req, res) => {
    console.log("[API] POST /api/restart");
    dotenv.config({ override: true });
    getSettings();
    res.json({ success: true, message: "Configuration reloaded." });
  });

  // SerpApi Image Search Proxy Route
  app.get("/api/search-images", async (req, res) => {
    dotenv.config({ override: true });
    const { q } = req.query;
    console.log(`[API] GET /api/search-images?q=${q}`);

    if (!q) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }

    if (!process.env.SERPAPI_API_KEY) {
      console.warn("[API] SerpApi key not configured, returning empty list");
      return res.json([]);
    }

    try {
      const response = await axios.get("https://serpapi.com/search.json", {
        params: {
          engine: "google_images",
          q: q,
          api_key: process.env.SERPAPI_API_KEY
        }
      });

      if (!response.data.error && response.data.images_results) {
        const matches = response.data.images_results.map((result: any) => ({
          url: result.original,
          title: result.title
        }));
        return res.json(matches);
      }
      return res.json([]);
    } catch (error: any) {
      console.error("[API] SerpApi failed", error.message);
      res.status(500).json({ error: "Failed to fetch images." });
    }
  });

  // Live Component & Datasheet Part Lookup API (Octopart/Distributor/LCSC/SerpApi)
  app.get("/api/part-search", async (req, res) => {
    dotenv.config({ override: true });
    const query = String(req.query.q || "").trim();
    console.log(`[API] GET /api/part-search?q=${query}`);

    if (!query) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }

    try {
      const results = await searchCatalogComponents(query, 12);
      if (results.length > 0) {
        return res.json({ results, source: "distributor_catalog" });
      }

      // Fallback: if SerpApi is configured, search Google for PDF datasheets & specs
      if (process.env.SERPAPI_API_KEY) {
        try {
          const serpRes = await axios.get("https://serpapi.com/search.json", {
            params: {
              engine: "google",
              q: `${query} datasheet filetype:pdf`,
              api_key: process.env.SERPAPI_API_KEY,
              num: 6
            },
            timeout: 8000
          });
          const organic: any[] = serpRes.data?.organic_results || [];
          const fallbackResults = organic
            .filter((r) => r.link)
            .map((r, i) => ({
              lcscPartNumber: "",
              name: query.toUpperCase(),
              manufacturer: r.displayed_link ? r.displayed_link.split("/")[0].replace(/^www\./, "") : "Web Datasheet",
              manufacturerPartNumber: query.toUpperCase(),
              package: "Standard",
              category: "Electronic Components",
              subcategory: "",
              description: `${r.title || query}\n\n${r.snippet || ""}\n\n**Datasheet Source**: ${r.link}`,
              datasheetUrl: r.link,
              officialDatasheetUrl: r.link,
              stock: 0,
              unitPrice: null,
              priceTiers: [],
              images: [],
              thumbnail: null,
              parameters: [],
              rohs: true,
              productUrl: r.link,
              source: `Web PDF (${i + 1})`
            }));
          return res.json({ results: fallbackResults, source: "web_pdf" });
        } catch (serpErr: any) {
          console.warn("[API] SerpApi PDF fallback failed:", serpErr.message);
        }
      }

      return res.json({ results: [], source: "none" });
    } catch (error: any) {
      console.error(`[API] Part search error for "${query}":`, error.message);
      res.status(500).json({ error: error.message || "Failed to search components." });
    }
  });

  // LCSC Component Lookup API
  app.get("/api/lcsc/:partCode", async (req, res) => {
    const { partCode } = req.params;
    const includeSvg = req.query.includeSvg === "true";
    console.log(`[API] GET /api/lcsc/${partCode}`);

    try {
      const component = await getLcscComponentDetails(partCode, includeSvg);
      if (!component) {
        return res.status(404).json({ error: `Component "${partCode}" not found on LCSC or EasyEDA.` });
      }
      res.json(component);
    } catch (error: any) {
      console.error(`[API] LCSC lookup error for ${partCode}:`, error.message);
      res.status(400).json({ error: error.message || "Failed to fetch component from LCSC." });
    }
  });

  // Proxy download route for assets (images, PDFs) to bypass CORS and download reliably
  app.get("/api/proxy-download", async (req, res) => {
    const rawUrl = req.query.url;
    if (!rawUrl || typeof rawUrl !== "string") {
      return res.status(400).json({ error: "Query parameter 'url' is required" });
    }

    try {
      let response = await axios.get(rawUrl, {
        responseType: "arraybuffer",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "*/*"
        },
        timeout: 15000,
        maxRedirects: 5
      });

      let contentType = String(response.headers["content-type"] || "application/octet-stream");
      let buffer = Buffer.from(response.data);

      // If remote returned an HTML page wrapper (e.g. LCSC Next.js datasheet viewer)
      if (contentType.includes("text/html") || buffer.slice(0, 100).toString().includes("<!DOCTYPE html")) {
        const htmlStr = buffer.toString("utf8");
        const matchPdf =
          htmlStr.match(/"previewPdfUrl"\s*:\s*"(https:[^"]+)"/) ||
          htmlStr.match(/<iframe[^>]*src=["'](https:[^"']+\.pdf[^"']*)["']/i);

        if (matchPdf && matchPdf[1]) {
          const directPdfUrl = matchPdf[1].replace(/\\u0026/g, "&");
          console.log(`[Proxy Download] Extracted direct PDF URL from HTML wrapper: ${directPdfUrl}`);
          const pdfResponse = await axios.get(directPdfUrl, {
            responseType: "arraybuffer",
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept": "*/*"
            },
            timeout: 15000,
            maxRedirects: 5
          });
          contentType = String(pdfResponse.headers["content-type"] || "application/pdf");
          buffer = Buffer.from(pdfResponse.data);
        }
      }

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(buffer);
    } catch (error: any) {
      console.error(`[Proxy Download Error] URL: ${rawUrl}`, error.message);
      res.status(500).json({ error: "Failed to download asset from remote server" });
    }
  });

  // AI Research Route using Gemini API
  app.post("/api/ai-research", async (req, res) => {
    dotenv.config({ override: true });
    const { name, context, categoriesInfo, packagesInfo, apiKey, onlyClassification } = req.body;
    console.log(`[API] POST /api/ai-research for component: ${name} (onlyClassification=${!!onlyClassification})`);

    if (!name) {
      return res.status(400).json({ error: "Component name is required" });
    }

    const keyToUse = apiKey || process.env.GEMINI_API_KEY;
    if (!keyToUse) {
      console.error("[API] Gemini API key not configured");
      return res.status(500).json({ error: "Gemini API key not configured" });
    }

    try {
      const ai = new GoogleGenAI({ apiKey: keyToUse });
      const modelName = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

      const response = await ai.models.generateContent({
        model: modelName,
        contents: `Research and classify the electronic component named "${name}".
        Context / Distributor Specifications:
        ${context || 'None provided'}
       
        INSTRUCTIONS FOR CATEGORIES, SUBCATEGORIES, AND PACKAGES:
        1. Available categories and their existing subcategories in the inventory database:
           ${categoriesInfo || 'none'}
        2. Available packages in the inventory database:
           ${packagesInfo || 'none'}
        3. Category & Subcategory rules:
           - If an existing category and subcategory accurately fit this component, return their EXACT names from the available list.
           - If an existing category fits (e.g., "Passives"), but none of its existing subcategories fit this specific component, return the EXACT existing category name and suggest a concise, standard subcategory name (e.g., "Inductors").
           - If NO existing category accurately fits this component, suggest a concise, standard category name and subcategory name. Do NOT force a component into an unrelated category.
        4. Package rules:
           - If an existing package from the available list matches this component (including standard equivalents, e.g. "0805" matches "SMD 0805", "SOT23-3" matches "SOT-23"), return the EXACT package name from the available list.
           - If no existing package matches, suggest a clean, standard electronic package name (e.g. "QFN-56", "SOIC-8", "SMD 0402", "SOT-23-5") without verbose CAD dimensions like "_L7.0-W7.0-P0.4-EP".
        5. Keywords rules:
           - Provide 5 to 8 concise, relevant technical search keywords (e.g. component type, interface, core family, voltage/value, manufacturer, function).
       
        ${onlyClassification ? 'Provide a brief summary in description.' : `Provide a detailed technical description for an inventory system in Markdown format.
        IMPORTANT FORMATTING RULES:
        - Use proper markdown formatting with double newlines (\\n\\n) between paragraphs.
        - Use bullet points for lists.
        - DO NOT output the description as a single long line.
        Include:
        - Component description
        - Pinout information
        - Key characteristics/specifications`}
       
        Return the data in JSON format matching the schema.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              description: { type: "STRING", description: "Technical description in Markdown format." },
              category: { type: "STRING", description: "Exact matching category from the available list, or a concise new category name" },
              subcategory: { type: "STRING", description: "Exact matching subcategory for the category, or a concise new subcategory name" },
              package: { type: "STRING", description: "Exact matching package from the available list, or a clean standard package name" },
              keywords: { type: "ARRAY", items: { type: "STRING" }, description: "Relevant technical keywords" },
              packet_reference: { type: "STRING", description: "A likely manufacturer part number or reference" }
            },
            required: ["description", "category", "subcategory", "package", "keywords"]
          }
        }
      });

      const rawText = (response.text || "{}").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const data = JSON.parse(rawText);

      if (data.description) {
        data.description = data.description.replace(/\\n/g, '\n');
      }

      res.json(data);
    } catch (error: any) {
      console.error("[API] AI Research failed", error);
      let friendlyMessage = error.message || "Failed to research component.";
      try {
        const parsedErr = JSON.parse(friendlyMessage);
        if (parsedErr?.error?.message) {
          friendlyMessage = parsedErr.error.message;
        }
      } catch {
        // Not a JSON string error
      }
      res.status(500).json({ error: friendlyMessage });
    }
  });

  // Single Component Automatic Price Estimation
  app.post("/api/auto-price", async (req, res) => {
    dotenv.config({ override: true });
    const { component, apiKey } = req.body;

    if (!component || !component.name) {
      return res.status(400).json({ error: "Component object with 'name' is required" });
    }

    try {
      const estimate = await estimateComponentPrice(component, apiKey);
      res.json(estimate);
    } catch (err: any) {
      console.error("[API] Auto-price error:", err.message);
      res.status(500).json({ error: err.message || "Failed to estimate price" });
    }
  });

  // Batch Component Automatic Price Estimation
  app.post("/api/batch-auto-price", async (req, res) => {
    dotenv.config({ override: true });
    const { components, apiKey } = req.body;

    if (!Array.isArray(components) || components.length === 0) {
      return res.status(400).json({ error: "Array of components is required" });
    }

    console.log(`[API] POST /api/batch-auto-price for ${components.length} components`);

    try {
      // Process in concurrency-controlled chunks (3 items at a time to respect rate limits)
      const results: any[] = [];
      const CHUNK_SIZE = 3;

      for (let i = 0; i < components.length; i += CHUNK_SIZE) {
        const chunk = components.slice(i, i + CHUNK_SIZE);
        const chunkPromises = chunk.map(async (comp) => {
          try {
            const estimate = await estimateComponentPrice(comp, apiKey);
            return {
              id: comp.id,
              name: comp.name,
              success: true,
              estimate
            };
          } catch (itemErr: any) {
            return {
              id: comp.id,
              name: comp.name,
              success: false,
              error: itemErr.message
            };
          }
        });

        const chunkResults = await Promise.all(chunkPromises);
        results.push(...chunkResults);

        // Small delay between chunks to avoid hitting AI/LCSC rate limits
        if (i + CHUNK_SIZE < components.length) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }

      res.json({ results });
    } catch (err: any) {
      console.error("[API] Batch auto-price error:", err.message);
      res.status(500).json({ error: err.message || "Batch price estimation failed" });
    }
  });

  const httpServer = http.createServer(app);
  let httpsServer: https.Server | null = null;

  try {
    const sslData = await getOrCreateSslCert();
    if (sslData) {
      httpsServer = https.createServer({ key: sslData.private, cert: sslData.cert }, app);
    }
  } catch (err) {
    console.warn("[SSL] HTTPS server could not be created:", err);
  }

  const activeServers = httpsServer ? [httpServer, httpsServer] : [httpServer];
  setupScannerWebSocket(app, activeServers, Number(PORT), Number(HTTPS_PORT));

  const isProduction =
    process.env.NODE_ENV === "production" ||
    (typeof __filename !== "undefined" && __filename.includes("dist"));

  // Vite middleware for development (only when not running production build)
  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: "0.0.0.0",
        cors: true,
        allowedHosts: true,
        hmr: process.env.DISABLE_HMR === "true" ? false : { server: httpServer },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(Number(PORT), "0.0.0.0", () => {
    const netAddrs = getLocalNetworkAddresses();
    console.log(`\n========================================================`);
    console.log(`HTTP Server running on 0.0.0.0:${PORT} (accessible on all network interfaces)`);
    console.log(`  -> Local:   http://localhost:${PORT}`);
    for (const addr of netAddrs) {
      console.log(`  -> Network: http://${addr.ip}:${PORT} (${addr.name}${addr.isTailscale ? " - Tailscale" : ""})`);
    }
    console.log(`========================================================\n`);
  });

  if (httpsServer) {
    httpsServer.listen(Number(HTTPS_PORT), "0.0.0.0", () => {
      const netAddrs = getLocalNetworkAddresses();
      console.log(`\n========================================================`);
      console.log(`HTTPS Server running on 0.0.0.0:${HTTPS_PORT} (Camera mobile déverrouillée)`);
      console.log(`  -> Local:   https://localhost:${HTTPS_PORT}`);
      for (const addr of netAddrs) {
        console.log(`  -> Scanner Mobile: https://${addr.ip}:${HTTPS_PORT}/remote-scan (Flux direct sécurisé)`);
      }
      console.log(`========================================================\n`);
    });
  }
}

startServer();