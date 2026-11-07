import axios from "axios";

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
  lcscPartNumber: string;
  name: string;
  manufacturer: string;
  manufacturerPartNumber: string;
  package: string;
  category: string;
  subcategory: string;
  summary?: string;
  description: string;
  datasheetUrl: string;
  officialDatasheetUrl?: string;
  stock: number;
  unitPrice: number | null;
  priceTiers: LcscPriceTier[];
  images: string[];
  thumbnail: string | null;
  parameters: LcscTechnicalParam[];
  rohs: boolean | string;
  productUrl: string;
  easyedaUuid?: string;
  symbolSvg?: string;
  source?: string;
}

/**
 * Normalizes input into a clean LCSC part number (e.g. "C2040")
 */
export function normalizeLcscCode(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  // Check if it's a URL
  const matchUrl = trimmed.match(/_?(C\d+)(?:\.html|\.pdf|\/|$)/i);
  if (matchUrl) return matchUrl[1].toUpperCase();

  // Strip non-alphanumeric except keep leading C
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
 * Maps a JLCPCB / LCSC SMT component item into LcscComponentInfo
 */
function mapJlcItemToComponentInfo(item: any): LcscComponentInfo {
  const code = item.componentCode || "";
  const name = item.componentModelEn || item.componentName || code;
  const manufacturer = item.componentBrandEn || "";
  const manufacturerPartNumber = item.componentModelEn || name;
  const resolvedPackage = item.componentSpecificationEn || "Standard";
  const category = item.secondSortName || "Electronic Components";
  const subcategory = item.firstSortName || item.componentTypeEn || "";
  const summary = (item.describe || "").trim();

  // Prefer the direct signed PDF download URL (item.pdfUrl)
  const datasheetUrl =
    item.pdfUrl ||
    item.dataManualFileAccessIdUrl ||
    item.dataManualOfficialLink ||
    item.dataManualUrl ||
    (code ? `https://datasheet.lcsc.com/datasheet/${code}.pdf` : "");

  const officialDatasheetUrl = item.pdfUrl || item.dataManualOfficialLink || item.dataManualUrl || datasheetUrl;

  const rawPrices = Array.isArray(item.componentPrices) && item.componentPrices.length > 0
    ? item.componentPrices
    : (Array.isArray(item.buyComponentPrices) ? item.buyComponentPrices : []);

  const priceTiers: LcscPriceTier[] = rawPrices
    .map((p: any) => ({
      ladder: Number(p.startNumber || p.ladder || 1),
      usdPrice: Number(p.productPrice ?? p.usdPrice ?? 0),
      currencySymbol: "$"
    }))
    .filter((p: LcscPriceTier) => p.usdPrice > 0)
    .sort((a: LcscPriceTier, b: LcscPriceTier) => a.ladder - b.ladder);

  const unitPrice = priceTiers.length > 0
    ? priceTiers[0].usdPrice
    : (item.initialPrice ? Number(item.initialPrice) : null);

  const rawHighResImages: string[] = [
    item.productBigImageAccessIdUrl || item.minImageAccessIdUrl,
    ...(Array.isArray(item.imageList)
      ? item.imageList.map(
          (img: any) =>
            img?.productBigImageAccessIdUrl ||
            img?.productBigImage ||
            img?.productImageAccessIdUrl ||
            img?.productImage
        )
      : [])
  ].filter((u): u is string => Boolean(u && typeof u === "string" && u.startsWith("http")));

  // Deduplicate by URL and by underlying filename (e.g. avoid keeping both a big and min version of the same angle)
  const seenImageKeys = new Set<string>();
  const uniqueImages: string[] = [];
  for (const url of rawHighResImages) {
    const cleanPath = decodeURIComponent(url.split("?")[0]);
    const fileMatch = cleanPath.match(/([A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp))$/i);
    const key = fileMatch ? fileMatch[1].toLowerCase() : cleanPath;
    if (!seenImageKeys.has(key)) {
      seenImageKeys.add(key);
      uniqueImages.push(url);
    }
  }
  const firstSmallThumb =
    item.minImageAccessIdUrl ||
    (Array.isArray(item.imageList) && item.imageList[0]
      ? item.imageList[0].productImageAccessIdUrl || item.imageList[0].productImage
      : null);
  const thumbnail = firstSmallThumb || uniqueImages[0] || null;

  const parameters: LcscTechnicalParam[] = Array.isArray(item.attributes)
    ? item.attributes
        .map((a: any) => ({
          name: a.attribute_name_en || "",
          value: a.attribute_value_name || ""
        }))
        .filter((p: LcscTechnicalParam) => p.name && p.value)
    : [];

  const productUrl = item.lcscGoodsUrl || (code ? `https://www.lcsc.com/product-detail/${encodeURIComponent(code)}.html` : "");

  const descriptionLines: string[] = [];
  if (summary) {
    descriptionLines.push(`> ${summary}`);
    descriptionLines.push("");
  }

  descriptionLines.push("### Component Overview");
  if (manufacturer) {
    descriptionLines.push(`- **Manufacturer**: ${manufacturer}`);
  }
  if (manufacturerPartNumber) {
    descriptionLines.push(`- **Manufacturer Part # (MPN)**: \`${manufacturerPartNumber}\``);
  }
  if (code) {
    descriptionLines.push(`- **LCSC Part #**: [${code}](${productUrl})`);
  }
  if (category || subcategory) {
    descriptionLines.push(`- **Category**: ${[category, subcategory].filter(Boolean).join(" › ")}`);
  }
  descriptionLines.push(`- **Package / Footprint**: \`${resolvedPackage}\``);
  if (unitPrice !== null) {
    descriptionLines.push(`- **Unit Price**: $${unitPrice.toFixed(4)} USD`);
  }
  descriptionLines.push(`- **LCSC Stock**: ${Number(item.stockCount ?? 0).toLocaleString()} units`);
  if (item.rohsFlag === 1) {
    descriptionLines.push(`- **RoHS Compliant**: Yes`);
  }

  if (officialDatasheetUrl) {
    descriptionLines.push("");
    descriptionLines.push(`📄 **[Download Official Datasheet (PDF)](${officialDatasheetUrl})**`);
  }

  if (parameters.length > 0) {
    descriptionLines.push("");
    descriptionLines.push("### Technical Specifications");
    descriptionLines.push("| Parameter | Value |");
    descriptionLines.push("| :--- | :--- |");
    for (const param of parameters) {
      descriptionLines.push(`| **${param.name}** | ${param.value.replace(/、/g, ", ")} |`);
    }
  }

  if (priceTiers.length > 0) {
    descriptionLines.push("");
    descriptionLines.push("### Price Tiers (USD)");
    descriptionLines.push("| Quantity | Unit Price |");
    descriptionLines.push("| :--- | :--- |");
    for (const tier of priceTiers) {
      descriptionLines.push(`| ${tier.ladder}+ | $${tier.usdPrice.toFixed(4)} |`);
    }
  }

  return {
    lcscPartNumber: code,
    name,
    manufacturer,
    manufacturerPartNumber,
    package: resolvedPackage,
    category,
    subcategory,
    summary,
    description: descriptionLines.join("\n"),
    datasheetUrl,
    officialDatasheetUrl,
    stock: Number(item.stockCount ?? 0),
    unitPrice,
    priceTiers,
    images: uniqueImages,
    thumbnail,
    parameters,
    rohs: item.rohsFlag === 1,
    productUrl,
    source: "LCSC / JLCPCB"
  };
}

/**
 * Searches the component catalog by part number, MPN, keyword, or LCSC code.
 */
export async function searchCatalogComponents(query: string, limit = 12): Promise<LcscComponentInfo[]> {
  const cleanQuery = (query || "").trim();
  if (!cleanQuery) return [];

  try {
    const jlcRes = await axios.post(
      "https://jlcpcb.com/api/overseas-pcb-order/v1/shoppingCart/smtGood/selectSmtComponentList",
      {
        currentPage: 1,
        pageSize: 80,
        keyword: cleanQuery
      },
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        timeout: 8000
      }
    );

    const rawList: any[] = jlcRes.data?.data?.componentPageInfo?.list || [];
    if (rawList.length === 0) return [];

    const normalizedCode = normalizeLcscCode(cleanQuery);
    const upperQuery = cleanQuery.toUpperCase();

    // Score & sort results so official catalog parts with datasheets, images, and stock appear first
    const scored = rawList.map((item) => {
      let score = 0;
      const code = String(item.componentCode || "").toUpperCase();
      const mpn = String(item.componentModelEn || "").toUpperCase();

      if (code === normalizedCode || code === upperQuery) score += 1000;
      if (mpn === upperQuery) score += 500;
      else if (mpn.startsWith(upperQuery)) score += 250;
      else if (mpn.includes(upperQuery)) score += 100;

      // Deprioritize custom C99 assembly-only entries without metadata
      if (!code.startsWith("C99")) score += 300;
      if (item.dataManualFileAccessIdUrl || item.dataManualUrl) score += 150;
      if (item.productBigImageAccessIdUrl || item.minImageAccessIdUrl) score += 100;
      if (Number(item.stockCount) > 0) score += Math.min(100, Math.log10(Number(item.stockCount) + 1) * 20);

      return { item, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(({ item }) => mapJlcItemToComponentInfo(item));
  } catch (err: any) {
    console.warn(`[Part Search] Catalog search failed for "${cleanQuery}": ${err.message}`);
    return [];
  }
}

/**
 * Fetches complete component metadata from LCSC / JLCPCB and EasyEDA
 */
export async function getLcscComponentDetails(partCodeInput: string, includeSvg = false): Promise<LcscComponentInfo | null> {
  const code = normalizeLcscCode(partCodeInput);
  if (!code || !code.startsWith("C")) {
    throw new Error(`Invalid LCSC part code: "${partCodeInput}". Expected format like C2040 or 2040.`);
  }

  // 1. Primary lookup via JLCPCB / LCSC SMT Catalog API (returns signed OSS URLs for PDFs & images)
  let jlcMapped: LcscComponentInfo | null = null;
  try {
    const jlcRes = await axios.post(
      "https://jlcpcb.com/api/overseas-pcb-order/v1/shoppingCart/smtGood/selectSmtComponentList",
      {
        currentPage: 1,
        pageSize: 15,
        keyword: code
      },
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        timeout: 8000
      }
    );
    const list: any[] = jlcRes.data?.data?.componentPageInfo?.list || [];
    const exact = list.find((item) => String(item.componentCode || "").toUpperCase() === code) || list[0];
    if (exact && String(exact.componentCode || "").toUpperCase() === code) {
      jlcMapped = mapJlcItemToComponentInfo(exact);
    }
  } catch (err: any) {
    console.warn(`[LCSC Lib] JLCPCB catalog lookup failed for ${code}: ${err.message}`);
  }

  // 2. Fallback / supplemental lookup from LCSC official catalog API
  let lcscResult: any = null;
  if (!jlcMapped) {
    try {
      const lcscRes = await axios.get(`https://wmsc.lcsc.com/ftps/wm/product/detail?productCode=${encodeURIComponent(code)}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*"
        },
        timeout: 8000
      });
      if (lcscRes.data && lcscRes.data.code === 200 && lcscRes.data.result) {
        lcscResult = lcscRes.data.result;
      }
    } catch (err: any) {
      console.warn(`[LCSC Lib] wmsc.lcsc.com lookup failed for ${code}: ${err.message}`);
    }
  }

  // 3. Optional EasyEDA component database for footprints, symbols, and alternate data
  let easyedaResult: any = null;
  if (!jlcMapped || includeSvg) {
    try {
      const easyedaRes = await axios.get(`https://easyeda.com/api/products/${encodeURIComponent(code)}/components`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*"
        },
        timeout: 6000
      });
      if (easyedaRes.data && easyedaRes.data.success && easyedaRes.data.result) {
        easyedaResult = easyedaRes.data.result;
      }
    } catch {
      // EasyEDA optional when jlcMapped is present
    }
  }

  // 4. Optional SVG schematic/footprint retrieval from EasyEDA
  let symbolSvg: string | undefined = undefined;
  if (includeSvg) {
    try {
      const svgRes = await axios.get(`https://easyeda.com/api/products/${encodeURIComponent(code)}/svgs`, {
        timeout: 5000
      });
      if (svgRes.data && svgRes.data.result && Array.isArray(svgRes.data.result) && svgRes.data.result[0]?.svg) {
        symbolSvg = svgRes.data.result[0].svg;
      }
    } catch {
      // SVG optional, ignore failure
    }
  }

  if (jlcMapped) {
    return {
      ...jlcMapped,
      easyedaUuid: easyedaResult?.uuid,
      symbolSvg
    };
  }

  // If neither returned data, component not found
  if (!lcscResult && !easyedaResult) {
    return null;
  }

  // Extract attributes from legacy LCSC / EasyEDA
  const cPara = easyedaResult?.dataStr?.head?.c_para || {};
  const name = lcscResult?.productModel || cPara.name || easyedaResult?.title || code;
  const manufacturer = lcscResult?.brandNameEn || cPara.Manufacturer || "";
  const manufacturerPartNumber = lcscResult?.productModel || cPara["Manufacturer Part"] || name;

  const packageDetailTitle = easyedaResult?.packageDetail?.title;
  const cParaPackage = cPara.package;
  const lcscEncapsulation = lcscResult?.encapsulationEn || lcscResult?.encapsulation;
  const paramPackage = lcscResult?.paramVOList?.find((p: any) => 
    p.paramNameEn && (
      p.paramNameEn.toLowerCase().includes("package") || 
      p.paramNameEn.toLowerCase().includes("case") || 
      p.paramNameEn.toLowerCase().includes("encapsulation")
    )
  )?.paramValueEn;

  const resolvedPackage = packageDetailTitle || cParaPackage || lcscEncapsulation || paramPackage || "Standard";

  const category = lcscResult?.parentCatalogName || (easyedaResult?.tags?.[0]) || "Electronic Components";
  const subcategory = lcscResult?.catalogName || (easyedaResult?.tags?.[1]) || "";
  const datasheetUrl = lcscResult?.pdfUrl || `https://datasheet.lcsc.com/datasheet/${code}.pdf`;

  const priceTiers: LcscPriceTier[] = (lcscResult?.productPriceList || []).map((item: any) => ({
    ladder: Number(item.ladder) || 1,
    usdPrice: Number(item.usdPrice ?? item.productPrice ?? 0),
    currencySymbol: item.currencySymbol || "$"
  }));

  const unitPrice = priceTiers.length > 0 ? priceTiers[0].usdPrice : null;

  const images: string[] = Array.isArray(lcscResult?.productImages) && lcscResult.productImages.length > 0
    ? lcscResult.productImages
    : (easyedaResult?.thumb ? [`https://easyeda.com${easyedaResult.thumb}`] : []);

  const thumbnail = images[0] || (easyedaResult?.thumb ? `https://easyeda.com${easyedaResult.thumb}` : null);

  const parameters: LcscTechnicalParam[] = (lcscResult?.paramVOList || []).map((p: any) => ({
    name: p.paramNameEn || p.paramName || "",
    value: p.paramValueEn || p.paramValue || ""
  })).filter((p: any) => p.name && p.value);

  const descriptionLines: string[] = [];
  if (lcscResult?.productIntroEn || lcscResult?.productKeyAttributes) {
    descriptionLines.push(lcscResult.productIntroEn || lcscResult.productKeyAttributes);
    descriptionLines.push("");
  }

  descriptionLines.push(`**Manufacturer**: ${manufacturer}`);
  descriptionLines.push(`**MPN**: ${manufacturerPartNumber}`);
  descriptionLines.push(`**Footprint / Package**: ${resolvedPackage}`);
  if (unitPrice !== null) {
    descriptionLines.push(`**Unit Price (LCSC)**: $${unitPrice.toFixed(4)} USD`);
  }
  descriptionLines.push(`**Current LCSC Stock**: ${(lcscResult?.stockNumber ?? 0).toLocaleString()} units`);

  if (parameters.length > 0) {
    descriptionLines.push("");
    descriptionLines.push("### Technical Specifications");
    for (const param of parameters) {
      descriptionLines.push(`- **${param.name}**: ${param.value}`);
    }
  }

  const description = descriptionLines.join("\n");
  const rohs = lcscResult?.isRohs === 1 || lcscResult?.isRohs === true ? true : (lcscResult?.isRohs ?? true);
  const productUrl = `https://www.lcsc.com/product-detail/${encodeURIComponent(code)}.html`;

  return {
    lcscPartNumber: code,
    name,
    manufacturer,
    manufacturerPartNumber,
    package: resolvedPackage,
    category,
    subcategory,
    description,
    datasheetUrl,
    officialDatasheetUrl: datasheetUrl,
    stock: Number(lcscResult?.stockNumber ?? 0),
    unitPrice,
    priceTiers,
    images,
    thumbnail,
    parameters,
    rohs,
    productUrl,
    easyedaUuid: easyedaResult?.uuid,
    symbolSvg,
    source: "LCSC"
  };
}
