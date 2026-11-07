import { getLcscComponentDetails, normalizeLcscCode, searchCatalogComponents } from "./lcsc.ts";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

export interface PriceEstimateInput {
  id?: number | string;
  name: string;
  url?: string | null;
  packet_reference?: string | null;
  barcode?: string | null;
  category?: string | null;
  subcategory?: string | null;
  package?: string | null;
  description?: string | null;
}

export interface PriceEstimateResult {
  price: number;
  currency: string;
  source: "supplier_url" | "serpapi_shopping" | "lcsc_part" | "lcsc_search" | "ai_estimate" | "fallback";
  sourceLabel: string;
  confidence: "high" | "medium" | "low";
  notes?: string;
  matchedPartNumber?: string;
}

// Approximate currency conversion rates to EUR
const USD_TO_EUR_RATE = 0.92;
const GBP_TO_EUR_RATE = 1.18;

/**
 * Extracts candidate URLs from direct url field, description, and packet reference.
 */
function extractCandidateUrls(input: PriceEstimateInput): string[] {
  const urls: string[] = [];
  const addIfValid = (candidate?: string | null) => {
    if (!candidate) return;
    const trimmed = candidate.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      if (!urls.includes(trimmed)) urls.push(trimmed);
    }
  };

  addIfValid(input.url);

  // Extract URLs from description and packet_reference
  const text = `${input.description || ""} ${input.packet_reference || ""}`;
  const found = text.match(/https?:\/\/[^\s"'<>\)]+/gi);
  if (found) {
    for (const u of found) {
      if (!urls.includes(u)) urls.push(u);
    }
  }

  return urls;
}

/**
 * Detects known store information from a URL.
 */
function detectStoreFromUrl(url: string): { storeName: string; isMakerModuleStore: boolean } {
  const lower = url.toLowerCase();
  if (lower.includes("aliexpress.")) {
    return { storeName: "AliExpress", isMakerModuleStore: true };
  }
  if (lower.includes("amazon.")) {
    return { storeName: "Amazon", isMakerModuleStore: true };
  }
  if (lower.includes("kubii.")) {
    return { storeName: "Kubii", isMakerModuleStore: true };
  }
  if (lower.includes("gotronic.")) {
    return { storeName: "GoTronic", isMakerModuleStore: true };
  }
  if (lower.includes("adafruit.")) {
    return { storeName: "Adafruit", isMakerModuleStore: true };
  }
  if (lower.includes("sparkfun.")) {
    return { storeName: "SparkFun", isMakerModuleStore: true };
  }
  if (lower.includes("mouser.")) {
    return { storeName: "Mouser", isMakerModuleStore: false };
  }
  if (lower.includes("digikey.")) {
    return { storeName: "DigiKey", isMakerModuleStore: false };
  }
  if (lower.includes("lcsc.com")) {
    return { storeName: "LCSC", isMakerModuleStore: false };
  }
  if (lower.includes("ebay.")) {
    return { storeName: "eBay", isMakerModuleStore: true };
  }

  try {
    const domain = new URL(url).hostname.replace(/^www\./, "");
    return { storeName: domain, isMakerModuleStore: true };
  } catch {
    return { storeName: "Fournisseur", isMakerModuleStore: true };
  }
}

/**
 * Determines whether a component is likely a retail module / breakout / board rather than a bare IC.
 */
function isModuleOrBoard(input: PriceEstimateInput, candidateUrls: string[]): boolean {
  // If the supplier link is from AliExpress, Amazon, Kubii, Adafruit, etc. -> very likely a module
  for (const u of candidateUrls) {
    const store = detectStoreFromUrl(u);
    if (store.isMakerModuleStore) return true;
  }

  const textToScan = `${input.name} ${input.category || ""} ${input.subcategory || ""} ${input.package || ""} ${input.description || ""}`.toLowerCase();

  const moduleKeywords = [
    "module", "board", "shield", "breakout", "carte", "kit", "esp32", "esp8266",
    "arduino", "raspberry", "pico", "sensor", "capteur", "display", "ecran",
    "screen", "oled", "tft", "lcd", "relais", "relay", "step-down", "step-up",
    "buck", "boost", "ch340", "cp2102", "bme280", "bmp280", "mpu6050", "rfid",
    "nfc", "camera", "cam", "l298n", "a4988", "drv8825", "driver moteur",
    "servo", "alimentation", "power supply", "charger", "chargeur", "tp4056"
  ];

  return moduleKeywords.some((kw) => textToScan.includes(kw));
}

/**
 * Normalizes scraped price to EUR.
 */
function normalizeToEur(rawPrice: number, rawCurrency?: string): number {
  const curr = (rawCurrency || "EUR").toUpperCase().trim();
  if (curr === "USD" || curr === "$") {
    return parseFloat((rawPrice * USD_TO_EUR_RATE).toFixed(4));
  }
  if (curr === "GBP" || curr === "£") {
    return parseFloat((rawPrice * GBP_TO_EUR_RATE).toFixed(4));
  }
  return parseFloat(rawPrice.toFixed(4));
}

/**
 * Scrapes direct product price from a supplier URL (JSON-LD, OpenGraph, microdata).
 */
async function scrapeDirectSupplierPrice(
  url: string
): Promise<{ price: number; currency: string; storeName: string } | null> {
  const store = detectStoreFromUrl(url);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000); // 6s timeout

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: "https://www.google.com/"
      },
      redirect: "follow"
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[AutoPrice] Direct scrape ${url} returned HTTP ${res.status}`);
      return null;
    }

    const html = await res.text();

    // 1. JSON-LD structured data (@type: "Product" -> offers)
    const jsonLdMatches = html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    );
    for (const match of jsonLdMatches) {
      try {
        const data = JSON.parse(match[1]);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          const offers =
            item.offers || (item["@graph"] ? item["@graph"].find((g: any) => g.offers)?.offers : null);
          if (offers) {
            const offer = Array.isArray(offers) ? offers[0] : offers;
            const p = offer.price || offer.lowPrice || offer.highPrice;
            if (p) {
              const num = parseFloat(String(p).replace(",", "."));
              if (!isNaN(num) && num > 0) {
                const eurPrice = normalizeToEur(num, offer.priceCurrency);
                return { price: eurPrice, currency: "EUR", storeName: store.storeName };
              }
            }
          }
        }
      } catch {}
    }

    // 2. OpenGraph & Microdata tags
    const metaRegexes = [
      /<meta[^>]*property=["'](?:product|og):price:amount["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]*content=["']([^"']+)["'][^>]*property=["'](?:product|og):price:amount["']/i,
      /<meta[^>]*itemprop=["']price["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]*content=["']([^"']+)["'][^>]*itemprop=["']price["']/i
    ];

    for (const regex of metaRegexes) {
      const match = html.match(regex);
      if (match && match[1]) {
        const num = parseFloat(match[1].replace(",", "."));
        if (!isNaN(num) && num > 0) {
          return { price: normalizeToEur(num, "EUR"), currency: "EUR", storeName: store.storeName };
        }
      }
    }

    // 3. AliExpress runParams
    if (url.includes("aliexpress.")) {
      const runParamsMatch = html.match(/runParams\s*=\s*({[\s\S]*?});/);
      if (runParamsMatch) {
        try {
          const runParams = JSON.parse(runParamsMatch[1]);
          const priceVal =
            runParams?.data?.priceComponent?.discountPrice?.minActivityAmount?.value ||
            runParams?.data?.priceComponent?.formatedAmount ||
            runParams?.data?.priceComponent?.origPrice?.minAmount?.value;
          if (priceVal) {
            const num = parseFloat(String(priceVal).replace(/[^\d.,]/g, "").replace(",", "."));
            if (!isNaN(num) && num > 0) {
              return { price: normalizeToEur(num, "EUR"), currency: "EUR", storeName: "AliExpress" };
            }
          }
        } catch {}
      }
    }

    return null;
  } catch (err: any) {
    console.warn(`[AutoPrice] Direct scrape failed for ${url}:`, err.message);
    return null;
  }
}

/**
 * Searches SerpApi Google Shopping for live market prices (Amazon, AliExpress, Kubii, GoTronic, etc.).
 */
async function searchSerpApiMarketPrice(
  query: string,
  preferredStore?: string
): Promise<{ price: number; currency: string; store: string; title: string } | null> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) return null;

  try {
    const searchQuery = preferredStore ? `${query} ${preferredStore}` : query;
    const shoppingUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(
      searchQuery
    )}&engine=google_shopping&gl=fr&hl=fr&api_key=${apiKey}`;

    const res = await fetch(shoppingUrl);
    if (!res.ok) return null;

    const data = await res.json();
    const results = data.shopping_results;

    if (Array.isArray(results) && results.length > 0) {
      const queryWords = query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2 && !["module", "pour", "avec", "carte"].includes(w));

      let candidate: any = null;
      if (preferredStore) {
        candidate = results.find(
          (r: any) =>
            r.source && r.source.toLowerCase().includes(preferredStore.toLowerCase())
        );
      }

      if (!candidate && queryWords.length > 0) {
        // Find result matching most keywords
        candidate = results.find((r: any) => {
          const t = (r.title || "").toLowerCase();
          return queryWords.every((w) => t.includes(w));
        }) || results.find((r: any) => {
          const t = (r.title || "").toLowerCase();
          const matches = queryWords.filter((w) => t.includes(w));
          return matches.length >= Math.min(2, queryWords.length);
        });
      }

      const selected = candidate || results[0];
      const titleLower = (selected.title || "").toLowerCase();
      const matchCount = queryWords.filter((w) => titleLower.includes(w)).length;

      // If query has specific words but none match in title, don't use this mismatch
      if (queryWords.length > 1 && matchCount === 0) {
        return null;
      }

      if (selected && selected.price) {
        // Raw price like "8,70 €" or "$4.50" or "4.50"
        const cleanPrice = String(selected.price).replace(/[^\d.,]/g, "").replace(",", ".");
        const num = parseFloat(cleanPrice);
        if (!isNaN(num) && num > 0) {
          const isDollar = String(selected.price).includes("$");
          const eur = isDollar ? normalizeToEur(num, "USD") : num;
          return {
            price: parseFloat(eur.toFixed(2)),
            currency: "EUR",
            store: selected.source || "Google Shopping",
            title: selected.title || query
          };
        }
      }
    }

    // Try Google Organic Rich Snippet if Shopping had nothing
    const organicUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(
      searchQuery + " prix"
    )}&engine=google&gl=fr&hl=fr&api_key=${apiKey}`;
    const organicRes = await fetch(organicUrl);
    if (organicRes.ok) {
      const organicData = await organicRes.json();
      const first = organicData.organic_results?.[0];
      const richSnippet = first?.rich_snippet?.bottom;
      if (richSnippet?.detected_extensions?.price) {
        const rawP = richSnippet.detected_extensions.price;
        // In SerpApi detected_extensions, price can be in cents (e.g. 900 for 9,00 €)
        const num = rawP > 100 && !Number.isInteger(rawP) ? rawP : rawP > 500 && String(richSnippet.extensions?.[0] || "").includes(",") ? rawP / 100 : rawP;
        if (num > 0) {
          return {
            price: parseFloat(num.toFixed(2)),
            currency: "EUR",
            store: preferredStore || first.source || "Google Search",
            title: first.title || query
          };
        }
      }
    }

    return null;
  } catch (err: any) {
    console.warn(`[AutoPrice] SerpApi lookup failed for "${query}":`, err.message);
    return null;
  }
}

/**
 * Extracts a candidate LCSC part code (e.g. C2040, C123456) from strings.
 */
function extractLcscCode(str?: string | null): string | null {
  if (!str) return null;
  const match = str.match(/(?:^|[\s:_/\-?&=])(C\d{3,8})(?:[\s:_/\-?&=.]|$)/i);
  if (match) {
    return match[1].toUpperCase();
  }
  return null;
}

/**
 * Clean component name for catalog or market search.
 */
function cleanSearchName(name: string): string {
  return name
    .replace(/\b(smd|tht|dip|soic|qfp|qfn|tssop|bga|reel|tape|tray|tube|pcs|lot)\b/gi, "")
    .replace(/[()[\]{},;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Estimates component or module unit price using:
 * 1. Supplier URL direct scraping (AliExpress, Amazon, Kubii, etc.)
 * 2. SerpApi Live Market / Google Shopping search
 * 3. LCSC Part Code (for standard components)
 * 4. LCSC / JLCPCB Catalog search (for bare ICs and discrete components)
 * 5. Gemini AI specialized module & component pricing (gemini-3.8-flash)
 * 6. Intelligent Category Heuristics
 */
export async function estimateComponentPrice(
  input: PriceEstimateInput,
  apiKey?: string
): Promise<PriceEstimateResult> {
  const cleanName = (input.name || "").trim();
  const candidateUrls = extractCandidateUrls(input);
  const isModule = isModuleOrBoard(input, candidateUrls);

  // -------------------------------------------------------------
  // 1. Direct Web Scraping if a supplier URL is provided
  // -------------------------------------------------------------
  for (const url of candidateUrls) {
    const scraped = await scrapeDirectSupplierPrice(url);
    if (scraped && scraped.price > 0) {
      return {
        price: scraped.price,
        currency: "EUR",
        source: "supplier_url",
        sourceLabel: `Direct Link: ${scraped.storeName} (${scraped.price.toFixed(2)} €)`,
        confidence: "high",
        notes: `Price scraped directly from ${scraped.storeName} product page`
      };
    }
  }

  // -------------------------------------------------------------
  // 2. SerpApi Google Shopping / Market Search (for modules / retail products)
  // -------------------------------------------------------------
  if (isModule && cleanName) {
    const primaryUrl = candidateUrls[0];
    const preferredStore = primaryUrl ? detectStoreFromUrl(primaryUrl).storeName : undefined;
    const serpResult = await searchSerpApiMarketPrice(cleanName, preferredStore);

    if (serpResult && serpResult.price > 0) {
      return {
        price: serpResult.price,
        currency: "EUR",
        source: "serpapi_shopping",
        sourceLabel: `Online Market: ${serpResult.store} (${serpResult.price.toFixed(2)} €)`,
        confidence: "high",
        notes: `Found online: ${serpResult.title}`
      };
    }
  }

  // -------------------------------------------------------------
  // 3. LCSC Part Code (C...) - only if NOT explicitly a retail module
  // -------------------------------------------------------------
  const candidateCode =
    extractLcscCode(input.packet_reference) ||
    extractLcscCode(input.barcode) ||
    extractLcscCode(input.name);

  if (candidateCode && !isModule) {
    try {
      const details = await getLcscComponentDetails(candidateCode);
      if (details && details.unitPrice !== null && details.unitPrice > 0) {
        const eurPrice = parseFloat((details.unitPrice * USD_TO_EUR_RATE).toFixed(4));
        return {
          price: Math.max(eurPrice, 0.005),
          currency: "EUR",
          source: "lcsc_part",
          sourceLabel: `Official LCSC (${details.lcscPartNumber})`,
          confidence: "high",
          matchedPartNumber: details.lcscPartNumber,
          notes: `${details.manufacturerPartNumber || details.name} ($${details.unitPrice} USD)`
        };
      }
    } catch (err: any) {
      console.warn(`[AutoPrice] Direct LCSC lookup failed for code ${candidateCode}:`, err.message);
    }
  }

  // -------------------------------------------------------------
  // 4. LCSC Catalog Search - for discrete components & ICs
  // -------------------------------------------------------------
  if (cleanName && !isModule) {
    try {
      const searchQuery = cleanSearchName(cleanName);
      const results = await searchCatalogComponents(searchQuery, 4);
      if (results && results.length > 0) {
        const withPrice = results.find((r) => r.unitPrice !== null && r.unitPrice > 0);
        if (withPrice && withPrice.unitPrice) {
          const eurPrice = parseFloat((withPrice.unitPrice * USD_TO_EUR_RATE).toFixed(4));
          return {
            price: Math.max(eurPrice, 0.005),
            currency: "EUR",
            source: "lcsc_search",
            sourceLabel: `LCSC Catalog (${withPrice.lcscPartNumber})`,
            confidence: "high",
            matchedPartNumber: withPrice.lcscPartNumber,
            notes: `${withPrice.manufacturerPartNumber || withPrice.name}`
          };
        }
      }
    } catch (err: any) {
      console.warn(`[AutoPrice] LCSC catalog search failed for "${cleanName}":`, err.message);
    }
  }

  // -------------------------------------------------------------
  // 5. Gemini AI Estimation (Retail Module & Discrete Pricing)
  // -------------------------------------------------------------
  const keyToUse = apiKey || process.env.GEMINI_API_KEY;
  if (keyToUse && cleanName) {
    try {
      const ai = new GoogleGenAI({ apiKey: keyToUse });
      const modelName = process.env.GEMINI_MODEL || "gemini-3.8-flash";

      const primaryUrl = candidateUrls[0];
      const storeInfo = primaryUrl ? detectStoreFromUrl(primaryUrl).storeName : null;

      const prompt = `Tu es un expert en approvisionnement et tarification de composants et modules électroniques pour makers, labos et industriels (AliExpress, Amazon, Kubii, GoTronic, Adafruit, LCSC).
Estime le prix d'achat moyen unitaire réaliste en Euros (€) pour une commande typique (quantité 1 à 10 pièces) pour le produit suivant :

- Nom du produit : "${cleanName}"
- Catégorie : "${input.category || input.subcategory || 'Électronique générale'}"
- Boîtier / Package : "${input.package || 'Standard'}"
- Lien fournisseur / Source : "${primaryUrl || 'Non spécifié'}"
${storeInfo ? `- Provenance connue : Boutique ${storeInfo}` : ""}
- Description : "${(input.description || '').slice(0, 300)}"
- Type détecté : ${isModule ? "MODULE / CARTE / ACCESSOIRE PRÊT À L'EMPLOI" : "Composant électronique standard"}

RÈGLES CRUCIALES DE TARIFICATION :
1. MODULES ET CARTES (AliExpress / Amazon / Kubii / Adafruit) :
   - S'il s'agit d'un module prêt à l'emploi (ex: ESP32-CAM, Raspberry Pi Pico, module relais, écran OLED 0.96", capteur BME280/BMP280 sur PCB, shield Arduino, convertisseur step-down LM2596...) :
     -> ESTIME LE PRIX DU MODULE COMPLET AU DÉTAIL (typiquement entre 1.50 € et 25.00 € selon la complexité).
     -> NE CONFONDS JAMAIS avec le prix d'une puce nue ou en rouleau d'usine de 5 000 pièces !
   - Prends en compte la plateforme d'achat : AliExpress est souvent 30% à 50% moins cher qu'Amazon ou Kubii pour le même module.
2. COMPOSANTS DISCRETS (LCSC / Distributeurs) :
   - Résistances / condensateurs céramiques de base : 0.01 € à 0.05 €
   - Diodes, petits transistors (BJT, MOSFET de base) : 0.05 € à 0.35 €
   - Régulateurs linéaires (7805, AMS1117), AOPs de base : 0.15 € à 0.60 €
   - Puces et microcontrôleurs unitaires nus : 1.50 € à 6.00 €

Réponds STRICTEMENT par un objet JSON valide (aucun markdown supplémentaire, pas de balises triples backticks) avec ce format exact :
{
  "price": number, // Nombre décimal positif en Euros (ex: 4.50 pour un module ESP32, 0.05 pour une diode)
  "confidence": "high" | "medium" | "low",
  "explanation": "Brève explication (1 phrase) en anglais (ex: Average market price observed on AliExpress for ESP32-CAM module)"
}`;

      let res;
      try {
        res = await ai.models.generateContent({
          model: modelName,
          contents: prompt
        });
      } catch (err: any) {
        // Fallback to gemini-3.5-flash-lite if model not found
        console.warn(`[AutoPrice] Model ${modelName} failed, falling back to gemini-3.5-flash-lite:`, err.message);
        res = await ai.models.generateContent({
          model: "gemini-3.5-flash-lite",
          contents: prompt
        });
      }

      const text = (res.text || "").trim();
      const cleanedJson = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanedJson);

      if (parsed && typeof parsed.price === "number" && parsed.price > 0) {
        return {
          price: parseFloat(parsed.price.toFixed(2)),
          currency: "EUR",
          source: "ai_estimate",
          sourceLabel: storeInfo ? `AI Estimate (${storeInfo})` : "AI Gemini Estimate",
          confidence: parsed.confidence || "medium",
          notes: parsed.explanation || (isModule ? "Maker module market estimate" : "Electronic component market estimate")
        };
      }
    } catch (err: any) {
      console.warn(`[AutoPrice] AI estimation failed for "${cleanName}":`, err.message);
    }
  }

  // -------------------------------------------------------------
  // 6. Intelligent Category Heuristic Fallback
  // -------------------------------------------------------------
  const catLower = `${input.category || ""} ${input.subcategory || ""}`.toLowerCase();
  let defaultPrice = 0.5;
  let fallbackNote = "Category default";

  if (isModule) {
    if (catLower.includes("microcontroller") || catLower.includes("développement") || cleanName.toLowerCase().includes("pico") || cleanName.toLowerCase().includes("esp32")) {
      defaultPrice = 6.0;
      fallbackNote = "Development board / MCU module default";
    } else if (catLower.includes("capteur") || catLower.includes("sensor")) {
      defaultPrice = 3.5;
      fallbackNote = "Sensor breakout module default";
    } else if (catLower.includes("relais") || catLower.includes("relay")) {
      defaultPrice = 2.5;
      fallbackNote = "Relay module default";
    } else if (catLower.includes("ecran") || catLower.includes("screen") || catLower.includes("display") || catLower.includes("oled")) {
      defaultPrice = 4.0;
      fallbackNote = "Display / screen module default";
    } else {
      defaultPrice = 4.5;
      fallbackNote = "Generic maker module default";
    }
  } else if (catLower.includes("resistor") || catLower.includes("résistance") || catLower.includes("condensateur") || catLower.includes("capacitor")) {
    defaultPrice = 0.03;
    fallbackNote = "Passive component default";
  } else if (catLower.includes("diode") || catLower.includes("led") || catLower.includes("transistor")) {
    defaultPrice = 0.15;
    fallbackNote = "Discrete semiconductor default";
  } else if (catLower.includes("microcontroller") || catLower.includes("cpu") || catLower.includes("ic")) {
    defaultPrice = 2.5;
    fallbackNote = "Bare IC default";
  }

  return {
    price: defaultPrice,
    currency: "EUR",
    source: "fallback",
    sourceLabel: isModule ? "Maker Module Default" : "Category Default",
    confidence: "low",
    notes: fallbackNote
  };
}
