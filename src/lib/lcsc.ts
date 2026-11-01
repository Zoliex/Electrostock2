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
  /** Formatted markdown technical summary */
  description: string;
  /** Direct link to official PDF datasheet */
  datasheetUrl: string;
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
}

export interface LcscFetchOptions {
  /** Include schematic/footprint SVG from EasyEDA (defaults to false) */
  includeSvg?: boolean;
  /** Custom API base URL if needed */
  apiBaseUrl?: string;
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

  sections.push(`## ${info.name}`);
  sections.push(`**Manufacturer**: ${info.manufacturer} (${info.manufacturerPartNumber})`);
  sections.push(`**LCSC Part**: [${info.lcscPartNumber}](${info.productUrl})`);
  sections.push(`**Package / Footprint**: \`${info.package}\``);

  if (info.unitPrice !== null) {
    sections.push(`**Unit Price**: $${info.unitPrice.toFixed(4)} USD`);
  }
  sections.push(`**In-Stock at LCSC**: ${info.stock.toLocaleString()} units`);

  if (info.datasheetUrl) {
    sections.push(`\n📄 [Download Official Datasheet (PDF)](${info.datasheetUrl})`);
  }

  if (info.priceTiers.length > 0) {
    sections.push("\n### Price Tiers (USD)");
    sections.push("| Quantity | Unit Price |");
    sections.push("| :--- | :--- |");
    for (const tier of info.priceTiers) {
      sections.push(`| ${tier.ladder}+ | $${tier.usdPrice.toFixed(4)} |`);
    }
  }

  if (info.parameters.length > 0) {
    sections.push("\n### Technical Specifications");
    for (const p of info.parameters) {
      sections.push(`- **${p.name}**: ${p.value}`);
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
    barcode: options?.barcode || info.lcscPartNumber,
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
 * Automatically downloads and converts all LCSC assets into browser File objects:
 * 1. Main Image (front product photo)
 * 2. Official Datasheet (PDF)
 * 3. Additional Images (back, detail, and side photos)
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

  // 1. Download Main Image
  let mainImage: File | null = null;
  const mainImageUrl = info.thumbnail || info.images[0];
  if (mainImageUrl) {
    mainImage = await downloadAssetAsFile(mainImageUrl, `${cleanName}_${code}_main.jpg`, "image/jpeg");
  }

  // 2. Download Datasheet PDF
  let datasheet: File | null = null;
  if (info.datasheetUrl) {
    datasheet = await downloadAssetAsFile(info.datasheetUrl, `${cleanName}_${code}_datasheet.pdf`, "application/pdf");
  }

  // 3. Download Additional Images (up to 4 extra photos)
  const additionalImages: File[] = [];
  const extraUrls = info.images.slice(1, 5);
  for (let i = 0; i < extraUrls.length; i++) {
    const extraFile = await downloadAssetAsFile(extraUrls[i], `${cleanName}_${code}_photo_${i + 2}.jpg`, "image/jpeg");
    if (extraFile) {
      additionalImages.push(extraFile);
    }
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

