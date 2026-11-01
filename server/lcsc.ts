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
  description: string;
  datasheetUrl: string;
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
 * Fetches complete component metadata from LCSC and EasyEDA
 */
export async function getLcscComponentDetails(partCodeInput: string, includeSvg = false): Promise<LcscComponentInfo | null> {
  const code = normalizeLcscCode(partCodeInput);
  if (!code || !code.startsWith("C")) {
    throw new Error(`Invalid LCSC part code: "${partCodeInput}". Expected format like C2040 or 2040.`);
  }

  // 1. Fetch from LCSC official catalog API
  let lcscResult: any = null;
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

  // 2. Fetch from EasyEDA component database for footprints, symbols, and alternate data
  let easyedaResult: any = null;
  try {
    const easyedaRes = await axios.get(`https://easyeda.com/api/products/${encodeURIComponent(code)}/components`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*"
      },
      timeout: 8000
    });
    if (easyedaRes.data && easyedaRes.data.success && easyedaRes.data.result) {
      easyedaResult = easyedaRes.data.result;
    }
  } catch (err: any) {
    console.warn(`[LCSC Lib] easyeda.com lookup failed for ${code}: ${err.message}`);
  }

  // 3. Optional SVG schematic/footprint retrieval from EasyEDA
  let symbolSvg: string | undefined = undefined;
  if (includeSvg) {
    try {
      const svgRes = await axios.get(`https://easyeda.com/api/products/${encodeURIComponent(code)}/svgs`, {
        timeout: 6000
      });
      if (svgRes.data && svgRes.data.result && Array.isArray(svgRes.data.result) && svgRes.data.result[0]?.svg) {
        symbolSvg = svgRes.data.result[0].svg;
      }
    } catch {
      // SVG optional, ignore failure
    }
  }

  // If neither returned data, component not found
  if (!lcscResult && !easyedaResult) {
    return null;
  }

  // Extract attributes
  const cPara = easyedaResult?.dataStr?.head?.c_para || {};
  const name = lcscResult?.productModel || cPara.name || easyedaResult?.title || code;
  const manufacturer = lcscResult?.brandNameEn || cPara.Manufacturer || "";
  const manufacturerPartNumber = lcscResult?.productModel || cPara["Manufacturer Part"] || name;

  // Determine package / footprint
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

  // Category hierarchy
  const category = lcscResult?.parentCatalogName || (easyedaResult?.tags?.[0]) || "Electronic Components";
  const subcategory = lcscResult?.catalogName || (easyedaResult?.tags?.[1]) || "";

  // Datasheet URL
  const datasheetUrl = lcscResult?.pdfUrl || `https://datasheet.lcsc.com/datasheet/${code}.pdf`;

  // Pricing tiers
  const priceTiers: LcscPriceTier[] = (lcscResult?.productPriceList || []).map((item: any) => ({
    ladder: Number(item.ladder) || 1,
    usdPrice: Number(item.usdPrice ?? item.productPrice ?? 0),
    currencySymbol: item.currencySymbol || "$"
  }));

  const unitPrice = priceTiers.length > 0 ? priceTiers[0].usdPrice : null;

  // Images
  const images: string[] = Array.isArray(lcscResult?.productImages) && lcscResult.productImages.length > 0
    ? lcscResult.productImages
    : (easyedaResult?.thumb ? [`https://easyeda.com${easyedaResult.thumb}`] : []);

  const thumbnail = images[0] || (easyedaResult?.thumb ? `https://easyeda.com${easyedaResult.thumb}` : null);

  // Technical parameters
  const parameters: LcscTechnicalParam[] = (lcscResult?.paramVOList || []).map((p: any) => ({
    name: p.paramNameEn || p.paramName || "",
    value: p.paramValueEn || p.paramValue || ""
  })).filter((p: any) => p.name && p.value);

  // Build markdown technical description
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
    stock: Number(lcscResult?.stockNumber ?? 0),
    unitPrice,
    priceTiers,
    images,
    thumbnail,
    parameters,
    rohs,
    productUrl,
    easyedaUuid: easyedaResult?.uuid,
    symbolSvg
  };
}
