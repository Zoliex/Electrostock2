/**
 * LCSC Component Data Library for ElectroStock
 * 
 * Provides functions and types to query and retrieve complete component
 * details from LCSC and EasyEDA (datasheet, footprint/package, name, price tiers,
 * real-time stock, high-res photos, and technical parameters).
 */

export interface LcscPriceTier {
  ladder: number;
  usdPrice: number;
  currencySymbol?: string;
}

export interface LcscTechnicalParam {
  name: string;
  value: string;
}

export interface LcscComponentInfo {
  /** LCSC Part Number e.g. "C2040" */
  lcscPartNumber: string;
  /** Primary component designation/model e.g. "RP2040" */
  name: string;
  /** Component Manufacturer / Brand e.g. "Raspberry Pi" */
  manufacturer: string;
  /** Manufacturer Part Number (MPN) */
  manufacturerPartNumber: string;
  /** Package / Footprint / Encapsulation e.g. "LQFN-56_L7.0-W7.0-P0.4-EP" */
  package: string;
  /** Main product category */
  category: string;
  /** Secondary category / subcategory */
  subcategory: string;
  /** Short technical summary line */
  summary?: string;
  /** Formatted markdown technical summary */
  description: string;
  /** Direct link to official PDF datasheet */
  datasheetUrl: string;
  /** Official manufacturer/LCSC datasheet URL */
  officialDatasheetUrl?: string;
  /** Current stock available at LCSC warehouse */
  stock: number;
  /** Starting single-unit price in USD */
  unitPrice: number | null;
  /** Tiered quantity pricing table */
  priceTiers: LcscPriceTier[];
  /** High resolution product photographs */
  images: string[];
  /** Primary thumbnail image */
  thumbnail: string | null;
  /** Detailed technical specifications */
  parameters: LcscTechnicalParam[];
  /** RoHS compliance */
  rohs: boolean | string;
  /** Official product catalog URL on LCSC.com */
  productUrl: string;
  /** EasyEDA UUID for CAD footprints & schematics */
  easyedaUuid?: string;
  /** Optional schematic / footprint SVG */
  symbolSvg?: string;
  /** Source label e.g. "LCSC / JLCPCB" */
  source?: string;
}

export interface LcscFetchOptions {
  /** Include schematic/footprint SVG from EasyEDA (defaults to false) */
  includeSvg?: boolean;
  /** Custom API base URL if needed */
  apiBaseUrl?: string;
}

/**
 * Searches the live component & datasheet catalog by part number, MPN, keyword, or LCSC code.
 */
export async function searchPartCatalog(query: string): Promise<{
  results: LcscComponentInfo[];
  source: string;
}> {
  const clean = (query || "").trim();
  if (!clean) return { results: [], source: "none" };

  const res = await fetch(`/api/part-search?q=${encodeURIComponent(clean)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Part search failed (${res.status})`);
  }
  return res.json();
}

/**
 * Normalizes input text or URL into a standard LCSC part number (e.g. "C2040")
 * 
 * Examples:
 * - "C2040" -> "C2040"
 * - "2040" -> "C2040"
 * - "https://www.lcsc.com/product-detail/Microcontrollers_Raspberry-Pi-RP2040_C2040.html" -> "C2040"
 * - "c 25349" -> "C25349"
 */
export function normalizeLcscCode(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();

  // Match C-number in URLs (e.g. ..._C2040.html or /C2040.pdf)
  const matchUrl = trimmed.match(/_?(C\d+)(?:\.html|\.pdf|\/|$)/i);
  if (matchUrl) return matchUrl[1].toUpperCase();

  const clean = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.startsWith("C") && /^\d+$/.test(clean.substring(1))) {
    return clean;
  }
  if (/^\d+$/.test(clean)) {
    return "C" + clean;
  }
  return clean;
}

/**
 * Retrieves comprehensive component data from LCSC.
 * 
 * @param partNumber LCSC part code (e.g. "C2040") or full product URL
 * @param options Optional configuration parameters
 * @returns Complete component data object or null if not found
 */
export async function fetchLcscComponent(
  partNumber: string,
  options: LcscFetchOptions = {}
): Promise<LcscComponentInfo | null> {
  const code = normalizeLcscCode(partNumber);
  if (!code) {
    throw new Error(`Invalid LCSC code or URL: "${partNumber}"`);
  }

  const baseUrl = options.apiBaseUrl ?? "";
  const svgParam = options.includeSvg ? "?includeSvg=true" : "";
  const endpoint = `${baseUrl}/api/lcsc/${encodeURIComponent(code)}${svgParam}`;

  try {
    const res = await fetch(endpoint);
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch LCSC component (${res.status})`);
    }

    const data: LcscComponentInfo = await res.json();
    return data;
  } catch (error: any) {
    // If running in an environment without the local backend route, fallback to direct fetch
    if (typeof window !== "undefined" && error.message?.includes("fetch")) {
      console.warn("[LCSC] Local proxy failed, attempting direct lookup fallback...");
    }
    throw error;
  }
}

/**
 * Formats a clean markdown technical report for a component from LCSC data
 */
export function formatLcscMarkdown(info: LcscComponentInfo): string {
  const sections: string[] = [];

  if (info.summary) {
    sections.push(`> ${info.summary}`);
    sections.push("");
  }

  sections.push("### Component Overview");
  if (info.manufacturer) {
    sections.push(
      `- **Manufacturer**: ${info.manufacturer}${
        info.manufacturerPartNumber ? ` (\`${info.manufacturerPartNumber}\`)` : ""
      }`
    );
  }
  if (info.lcscPartNumber) {
    sections.push(
      `- **LCSC Part #**: [${info.lcscPartNumber}](${
        info.productUrl || `https://www.lcsc.com/product-detail/${info.lcscPartNumber}.html`
      })`
    );
  }
  if (info.category || info.subcategory) {
    sections.push(
      `- **Category**: ${[info.category, info.subcategory].filter(Boolean).join(" › ")}`
    );
  }
  if (info.package) {
    sections.push(`- **Package / Footprint**: \`${info.package}\``);
  }
  if (info.unitPrice !== null) {
    sections.push(`- **Unit Price**: $${info.unitPrice.toFixed(4)} USD`);
  }
  sections.push(`- **LCSC Stock**: ${info.stock.toLocaleString()} units`);
  if (info.rohs) {
    sections.push(`- **RoHS Compliant**: Yes`);
  }

  const cleanPdfUrl = info.officialDatasheetUrl || info.datasheetUrl;
  if (cleanPdfUrl) {
    sections.push("");
    sections.push(`**[Download Official Datasheet (PDF)](${cleanPdfUrl})**`);
  }

  if (info.parameters && info.parameters.length > 0) {
    sections.push("");
    sections.push("### Technical Specifications");
    sections.push("| Parameter | Specification |");
    sections.push("| :--- | :--- |");
    for (const p of info.parameters) {
      sections.push(`| **${p.name}** | ${p.value.replace(/、/g, ", ")} |`);
    }
  }

  if (info.priceTiers && info.priceTiers.length > 0) {
    sections.push("");
    sections.push("### Price Tiers (USD)");
    sections.push("| Quantity | Unit Price |");
    sections.push("| :--- | :--- |");
    for (const tier of info.priceTiers) {
      sections.push(`| ${tier.ladder}+ | $${tier.usdPrice.toFixed(4)} |`);
    }
  }

  return sections.join("\n");
}

/**
 * Converts LCSC component metadata into an ElectroStock-compatible draft payload
 */
export function toElectroStockDraft(
  info: LcscComponentInfo,
  options?: {
    location?: string;
    quantity?: number;
    barcode?: string;
  }
) {
  return {
    name: info.name,
    description: formatLcscMarkdown(info),
    packet_reference: info.manufacturerPartNumber || info.lcscPartNumber,
    barcode: options?.barcode || "",
    quantity_available: options?.quantity ?? 0,
    location: options?.location || "",
    url: info.productUrl,
    datasheet_url: info.datasheetUrl,
    suggested_category: info.category,
    suggested_subcategory: info.subcategory,
    suggested_package: info.package,
    keywords: [
      info.lcscPartNumber.toLowerCase(),
      info.name.toLowerCase(),
      info.manufacturer.toLowerCase(),
      info.package.toLowerCase(),
      "lcsc"
    ].filter(Boolean),
    preview_image: info.thumbnail || info.images[0] || null
  };
}

/**
 * Downloads a remote URL into a browser File object using the local proxy to bypass CORS
 */
export async function downloadAssetAsFile(
  url: string,
  fileName: string,
  fallbackMime = "application/octet-stream"
): Promise<File | null> {
  if (!url) return null;
  try {
    const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const blob = await res.blob();
    const mime = blob.type && blob.type !== "application/octet-stream" ? blob.type : fallbackMime;
    return new File([blob], fileName, { type: mime });
  } catch (err) {
    console.warn(`[LCSC] Failed to download asset from ${url}:`, err);
    return null;
  }
}

/**
 * Helper to extract a normalized filename key from a URL so high-res and low-res versions
 * of the same photo angle (e.g. ".../858519-C5252902/C5252902-正面.jpg?...") share the same key.
 */
function getImageAngleKey(url: string): string {
  try {
    const cleanPath = decodeURIComponent(url.split("?")[0]);
    const fileMatch = cleanPath.match(/([A-Za-z0-9_\u4e00-\u9fa5-]+\.(?:jpg|jpeg|png|webp))$/i);
    if (fileMatch) return fileMatch[1].toLowerCase();
    return cleanPath.toLowerCase();
  } catch {
    return url.split("?")[0].toLowerCase();
  }
}

/**
 * Checks image pixel dimensions in the browser to filter out tiny thumbnail previews
 */
async function getImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (typeof window === "undefined" || !file.type.startsWith("image/")) return null;
  try {
    if ("createImageBitmap" in window) {
      const bitmap = await createImageBitmap(file);
      const dims = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dims;
    }
  } catch {
    // Fallback below
  }
  return null;
}

/**
 * Automatically downloads and converts all LCSC assets into browser File objects:
 * 1. Main Image (front high-res product photo)
 * 2. Official Datasheet (PDF)
 * 3. Additional Images (only high-res distinct photos; low-res previews are filtered out)
 * 4. Additional Documents (EasyEDA CAD symbol SVG and technical specs markdown)
 */
export async function fetchLcscAssetsAsFiles(info: LcscComponentInfo): Promise<{
  mainImage: File | null;
  datasheet: File | null;
  additionalImages: File[];
  additionalFiles: File[];
}> {
  const code = info.lcscPartNumber || "component";
  const cleanName = (info.name || code).replace(/[^a-zA-Z0-9_-]/g, "_");

  // Deduplicate candidate image URLs by angle/filename key, preferring info.images[0] (high-res)
  const seenKeys = new Set<string>();
  const distinctImageUrls: string[] = [];
  for (const rawUrl of [...(info.images || []), info.thumbnail].filter(Boolean) as string[]) {
    const key = getImageAngleKey(rawUrl);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      distinctImageUrls.push(rawUrl);
    }
  }

  // 1. Download Main Image (always prefer the primary high-res URL)
  let mainImage: File | null = null;
  let mainDims: { width: number; height: number } | null = null;
  const mainImageUrl = distinctImageUrls[0];
  if (mainImageUrl) {
    mainImage = await downloadAssetAsFile(mainImageUrl, `${cleanName}_${code}_main.jpg`, "image/jpeg");
    if (mainImage) {
      mainDims = await getImageDimensions(mainImage);
    }
  }

  // 2. Download Datasheet PDF
  let datasheet: File | null = null;
  if (info.datasheetUrl) {
    datasheet = await downloadAssetAsFile(info.datasheetUrl, `${cleanName}_${code}_datasheet.pdf`, "application/pdf");
  }

  // 3. Download Additional Images (up to 4 extra distinct high-res photos, filtering out tiny previews)
  const additionalImages: File[] = [];
  const extraUrls = distinctImageUrls.slice(1, 5);
  for (let i = 0; i < extraUrls.length; i++) {
    const extraFile = await downloadAssetAsFile(extraUrls[i], `${cleanName}_${code}_photo_${i + 2}.jpg`, "image/jpeg");
    if (!extraFile) continue;

    const dims = await getImageDimensions(extraFile);
    // Filter out low-resolution thumbnail previews (e.g. LCSC 96x96 / 150x150 minImage)
    if (dims && (dims.width < 250 || dims.height < 250)) {
      console.info(`[LCSC] Skipping low-resolution preview image (${dims.width}x${dims.height})`);
      continue;
    }
    // Also skip if it's a much smaller re-encoded copy of the main image
    if (
      mainDims &&
      dims &&
      mainImage &&
      dims.width < mainDims.width * 0.5 &&
      extraFile.size < mainImage.size * 0.35
    ) {
      console.info(`[LCSC] Skipping lower-resolution duplicate image (${dims.width}x${dims.height})`);
      continue;
    }

    additionalImages.push(extraFile);
  }

  // 4. Generate Additional Documents (Schematic SVG + Technical Specs Markdown)
  const additionalFiles: File[] = [];

  // Schematic / Footprint SVG if available from EasyEDA
  if (info.symbolSvg) {
    const svgBlob = new Blob([info.symbolSvg], { type: "image/svg+xml" });
    additionalFiles.push(new File([svgBlob], `${cleanName}_${code}_footprint.svg`, { type: "image/svg+xml" }));
  }

  // Full technical specification documentation in Markdown
  const specsText = formatLcscMarkdown(info);
  const specsBlob = new Blob([specsText], { type: "text/markdown;charset=utf-8" });
  additionalFiles.push(new File([specsBlob], `${cleanName}_${code}_specifications.md`, { type: "text/markdown" }));

  return {
    mainImage,
    datasheet,
    additionalImages,
    additionalFiles
  };
}

export interface ParsedLcscBagScan {
  rawNormalized: string;
  type: "lcsc_2d_qr" | "lcsc_1d_bag_id" | "lcsc_part_code" | "generic";
  lcscPartNumber?: string;
  internalBagBarcode?: string;
  mpn?: string;
  quantity?: number;
  orderNumber?: string;
  pickBatchNumber?: string;
}

/**
 * Translates French AZERTY unshifted top-row characters to digits when a USB barcode scanner
 * sends US QWERTY keycodes without Shift (e.g. "X&é\"'(-è_ç" -> "X130138209").
 */
export function normalizeAzertyBarcodeInput(input: string): string {
  const trimmed = (input || "").trim();
  const azertyMap: Record<string, string> = {
    "&": "1",
    "é": "2",
    '"': "3",
    "'": "4",
    "(": "5",
    "-": "6",
    "è": "7",
    "_": "8",
    "ç": "9",
    "à": "0"
  };

  // If it starts with X or C followed by AZERTY top-row symbols, normalize to digits
  if (/^[XCxc][&é"'(\-è_çà0-9]+$/.test(trimmed)) {
    return (
      trimmed[0].toUpperCase() +
      trimmed
        .slice(1)
        .split("")
        .map((ch) => azertyMap[ch] ?? ch)
        .join("")
    );
  }
  return trimmed;
}

/**
 * Decodes an LCSC physical bag barcode scan (supports both 2D QR/DataMatrix payloads and 1D "X..." bag barcodes).
 *
 * Background on LCSC Bag Barcodes:
 * - Every LCSC bag has a 1D barcode at the bottom (e.g. `X130138209`) and a 2D QR code at the top-right.
 * - The 2D QR code contains `{pbn:PICK...,on:WM...,pc:C11368,pm:...,qty:10,pdi:130138209,...}`.
 * - Notice that `pdi` in the 2D QR code (`130138209`) is the exact 9-digit internal Product Delivery ID
 *   printed as `X130138209` on the 1D barcode (`"X" + pdi`), while `pc` is `C11368`!
 * - Because `pdi` (`X130138209`) is a sequential per-bag picking serial assigned by LCSC's warehouse when packing
 *   an order, the 1D barcode alone cannot be mathematically converted to `C11368` without either scanning the 2D QR
 *   or pairing it in the Order Import table.
 */
export function parseLcscBagScan(rawInput: string): ParsedLcscBagScan {
  const normalized = normalizeAzertyBarcodeInput(rawInput);

  // 1. Check if it's an LCSC 2D QR / DataMatrix string: {pbn:...,on:...,pc:C11368,pm:...,qty:...,pdi:130138209,...}
  if ((normalized.includes("pc:") && normalized.includes("pbn:")) || /pc\s*:\s*C\d+/i.test(normalized)) {
    const clean = normalized.replace(/^[{\s]+|[}\s]+$/g, "");
    const map: Record<string, string> = {};
    for (const part of clean.split(",")) {
      const idx = part.indexOf(":");
      if (idx !== -1) {
        const k = part.slice(0, idx).trim().toLowerCase();
        const v = part.slice(idx + 1).trim();
        map[k] = v;
      }
    }

    const pc = map["pc"] ? normalizeLcscCode(map["pc"]) : undefined;
    const pdi = map["pdi"]?.replace(/\D/g, "");
    const pbn = map["pbn"] || undefined;
    const internalBagBarcode = pdi ? `X${pdi}` : pbn;
    const qty = map["qty"] && !isNaN(Number(map["qty"])) ? Number(map["qty"]) : undefined;

    return {
      rawNormalized: normalized,
      type: "lcsc_2d_qr",
      lcscPartNumber: pc,
      internalBagBarcode,
      mpn: map["pm"] || undefined,
      quantity: qty,
      orderNumber: map["on"] || undefined,
      pickBatchNumber: pbn
    };
  }

  // 2. Check if it's an LCSC 1D internal bag barcode (e.g. "X130138209")
  if (/^X\d{6,14}$/i.test(normalized)) {
    return {
      rawNormalized: normalized.toUpperCase(),
      type: "lcsc_1d_bag_id",
      internalBagBarcode: normalized.toUpperCase()
    };
  }

  // 3. Check if it's an LCSC Part Number (e.g. "C11368")
  if (/^C\d{2,10}$/i.test(normalized)) {
    return {
      rawNormalized: normalized.toUpperCase(),
      type: "lcsc_part_code",
      lcscPartNumber: normalized.toUpperCase()
    };
  }

  return {
    rawNormalized: normalized,
    type: "generic",
    internalBagBarcode: normalized
  };
}

export interface LcscCsvColumnMapping {
  lcscPartNumber: number;
  mpn: number;
  manufacturer: number;
  pkg: number;
  description: number;
  quantity: number;
  unitPrice: number;
  extPrice: number;
}

/**
 * RFC-4180 compliant CSV parser that handles quoted strings containing commas or newlines.
 */
export function parseCsvText(csvText: string): { headers: string[]; rows: string[][] } {
  const cleaned = (csvText || "").replace(/^\uFEFF/, "").trim();
  if (!cleaned) return { headers: [], rows: [] };

  const allRows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        currentRow.push(currentCell.trim());
        currentCell = "";
      } else if (ch === "\r" && next === "\n") {
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c !== "")) {
          allRows.push(currentRow);
        }
        currentRow = [];
        currentCell = "";
        i++;
      } else if (ch === "\n" || ch === "\r") {
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c !== "")) {
          allRows.push(currentRow);
        }
        currentRow = [];
        currentCell = "";
      } else {
        currentCell += ch;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c !== "")) {
      allRows.push(currentRow);
    }
  }

  if (allRows.length === 0) return { headers: [], rows: [] };

  // Find the actual header row (in case there are metadata lines above the header in some LCSC exports)
  let headerRowIdx = 0;
  for (let r = 0; r < Math.min(allRows.length, 10); r++) {
    const rowLower = allRows[r].map((c) => c.toLowerCase()).join(" | ");
    if (
      rowLower.includes("lcsc") ||
      rowLower.includes("part number") ||
      rowLower.includes("manufacture") ||
      rowLower.includes("quantity")
    ) {
      headerRowIdx = r;
      break;
    }
  }

  const headers = allRows[headerRowIdx];
  const dataRows = allRows.slice(headerRowIdx + 1).filter((row) => {
    // Filter out footer/summary rows that don't have a part number or MPN
    const nonEmptyCount = row.filter((c) => c.trim() !== "").length;
    return nonEmptyCount >= 2;
  });

  return { headers, rows: dataRows };
}

/**
 * Automatically detects LCSC Order CSV column indices from header names and sample row values.
 */
export function detectLcscCsvColumns(headers: string[], sampleRows: string[][]): LcscCsvColumnMapping {
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  const findHeaderIndex = (patterns: RegExp[], fallback = -1): number => {
    for (const pat of patterns) {
      const idx = lowerHeaders.findIndex((h) => pat.test(h));
      if (idx !== -1) return idx;
    }
    return fallback;
  };

  let lcscPartNumber = findHeaderIndex([
    /lcsc\s*part/i,
    /^part\s*number$/i,
    /lcsc\s*code/i,
    /supplier\s*part/i
  ]);

  // If header name didn't match, inspect sample rows for "C12345" pattern
  if (lcscPartNumber === -1 && sampleRows.length > 0) {
    for (let col = 0; col < headers.length; col++) {
      const matchesC = sampleRows
        .slice(0, 5)
        .filter((r) => /^C\d{3,10}$/i.test((r[col] || "").trim())).length;
      if (matchesC >= Math.min(2, sampleRows.length)) {
        lcscPartNumber = col;
        break;
      }
    }
  }

  const mpn = findHeaderIndex([
    /manufacture[r]?\s*part/i,
    /^mpn$/i,
    /part\s*model/i,
    /^model$/i,
    /^name$/i,
    /comment/i
  ], lcscPartNumber === 0 ? 1 : 0);

  const manufacturer = findHeaderIndex([/^manufacturer$/i, /^brand$/i, /mfr/i]);
  const pkg = findHeaderIndex([/^package$/i, /footprint/i, /encapsulation/i]);
  const description = findHeaderIndex([/^description$/i, /^desc$/i, /detail/i]);
  const quantity = findHeaderIndex([/^quantity$/i, /^qty$/i, /order\s*qty/i, /amount/i]);
  const unitPrice = findHeaderIndex([/unit\s*price/i, /^price/i, /cost/i]);
  const extPrice = findHeaderIndex([/ext\.?\s*price/i, /total\s*price/i, /subtotal/i]);

  return {
    lcscPartNumber,
    mpn,
    manufacturer,
    pkg,
    description,
    quantity,
    unitPrice,
    extPrice
  };
}


