import { ComponentPackage, ComponentType } from "../../lib/directus";

export interface ComponentFormData {
  name: string;
  category: string;
  subcategory: string;
  pkg: string;
  description: string;
  quantity: number;
  price?: string;
  storageLocation: string;
  packetReference: string;
  referenceUrl: string;
}

export interface BatchItem {
  value: string;
  quantity: number;
  unit: string;
  barcode?: string;
}

export interface ProceduralState {
  isResistor: boolean;
  isInductor: boolean;
  isTransistor: boolean;
  isCapacitor: boolean;
  capacitorType: 'Electrolytic' | 'Tantalum' | 'Ceramic';
  bandCount: number;
  resistorValue: string;
  inductanceValue: string;
  transistorValue: string;
  capacitorValue: string;
  tolerance: string;
  tempCo: string;
  resistorUnit: string;
  inductorUnit: string;
  transistorUnit: string;
  capacitorUnit: string;
  isBatchMode: boolean;
  batchItems: BatchItem[];
}

export type StepValidationErrors = Record<string, string>;

export const focusClasses = "focus:border-primary focus:ring-4 focus:ring-primary/20 outline-none transition-all";

export const generateRandomBarcode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export const normalizeTerm = (s?: string) => (s || "").trim().toLowerCase();
export const singularizeTerm = (s: string) => s.replace(/ies$/i, "y").replace(/s$/i, "");

export const isSameTerm = (a?: string, b?: string) => {
  const na = normalizeTerm(a);
  const nb = normalizeTerm(b);
  if (!na || !nb) return false;
  return na === nb || singularizeTerm(na) === singularizeTerm(nb);
};

export const cleanPackageName = (raw?: string) => {
  if (!raw) return "";
  // Strip EasyEDA verbose footprint dimensions like _L7.0-W7.0-P0.4-EP
  return raw.trim().replace(/_L\d+.*$/i, "").trim();
};

export const normalizePkgForMatch = (s?: string) => {
  return cleanPackageName(s)
    .toLowerCase()
    .replace(/^(smd|smt)[\s_-]*/i, "")
    .replace(/^[rc](\d{4})$/i, "$1")
    .replace(/[\s_]+/g, "-");
};

export const mergeKeywords = (existing: string[], incoming: string[]) => {
  const result = [...existing];
  const seen = new Set(existing.map(t => t.trim().toUpperCase()));
  for (const raw of incoming) {
    const tag = (raw || "").trim().toUpperCase();
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      result.push(tag);
    }
  }
  return result;
};

export const buildCategoriesPromptInfo = (cats: ComponentType[]) => {
  if (cats.length === 0) return "none";
  const grouped = new Map<string, Set<string>>();
  for (const c of cats) {
    const catName = c.name.trim();
    if (!grouped.has(catName)) grouped.set(catName, new Set());
    if (c.subcategory && c.subcategory.trim()) {
      c.subcategory.split(",").forEach(sub => {
        const trimmed = sub.trim();
        if (trimmed) grouped.get(catName)!.add(trimmed);
      });
    }
  }
  return Array.from(grouped.entries())
    .map(([name, subs]) => `${name} (Subcategories: ${subs.size > 0 ? Array.from(subs).join(", ") : "none"})`)
    .join("; ");
};

export const matchCategoryAndSubcategory = (
  cats: ComponentType[],
  rawCat?: string,
  rawSubcat?: string
): {
  matched?: ComponentType;
  proposedCategory?: string;
  proposedSubcategory?: string;
  isExistingCategoryName?: boolean;
  existingEmptyCategoryId?: number;
} => {
  const cleanCat = (rawCat || "").trim();
  const cleanSub = (rawSubcat || "").trim();

  if (!cleanCat && !cleanSub) {
    return {};
  }

  // 1. Exact (category, subcategory) match (or comma-separated subcategory list match)
  if (cleanCat && cleanSub) {
    const exactRow = cats.find(c => {
      if (!isSameTerm(c.name, cleanCat)) return false;
      if (isSameTerm(c.subcategory, cleanSub)) return true;
      if (c.subcategory) {
        const parts = c.subcategory.split(",").map(s => s.trim()).filter(Boolean);
        if (parts.length > 1 && parts.some(p => isSameTerm(p, cleanSub))) return true;
      }
      return false;
    });
    if (exactRow) {
      return { matched: exactRow };
    }

    // Check if user has a top-level category matching cleanSub with empty subcategory
    const swappedRow = cats.find(
      c => isSameTerm(c.name, cleanSub) && (!c.subcategory || !c.subcategory.trim() || isSameTerm(c.subcategory, cleanCat))
    );
    if (swappedRow) {
      return { matched: swappedRow };
    }

    // 2. Category name exists, but subcategory does not exist yet
    const sameNameRows = cats.filter(c => isSameTerm(c.name, cleanCat));
    if (sameNameRows.length > 0) {
      const canonicalCatName = sameNameRows[0].name;
      const emptySubcatRow = sameNameRows.find(c => !c.subcategory || !c.subcategory.trim());
      return {
        matched: undefined,
        proposedCategory: canonicalCatName,
        proposedSubcategory: cleanSub,
        isExistingCategoryName: true,
        existingEmptyCategoryId: emptySubcatRow?.id
      };
    }

    // 3. Brand new category & subcategory
    return {
      matched: undefined,
      proposedCategory: cleanCat,
      proposedSubcategory: cleanSub,
      isExistingCategoryName: false
    };
  }

  // Only category provided (no subcategory)
  if (cleanCat) {
    const emptyRow = cats.find(c => isSameTerm(c.name, cleanCat) && (!c.subcategory || !c.subcategory.trim()));
    if (emptyRow) return { matched: emptyRow };
    const anyRow = cats.find(c => isSameTerm(c.name, cleanCat));
    if (anyRow) return { matched: anyRow };
    return {
      matched: undefined,
      proposedCategory: cleanCat,
      proposedSubcategory: "",
      isExistingCategoryName: false
    };
  }

  return {};
};

export const matchPackageOption = (
  pkgs: ComponentPackage[],
  rawPkg?: string
): {
  matched?: ComponentPackage;
  proposedPackage?: string;
} => {
  const cleaned = cleanPackageName(rawPkg);
  if (!cleaned || ["none", "n/a", "unknown", "standard", "null"].includes(cleaned.toLowerCase())) {
    return {};
  }

  const targetNorm = normalizePkgForMatch(cleaned);
  const exact = pkgs.find(
    p => p.name.trim().toLowerCase() === cleaned.toLowerCase() || normalizePkgForMatch(p.name) === targetNorm
  );
  if (exact) {
    return { matched: exact };
  }

  return { proposedPackage: cleaned };
};
