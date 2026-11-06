import React, { useState, useEffect } from "react";
import {
  Settings,
  FileText,
  Package,
  X,
  AlertTriangle,
  Loader2,
  Sparkles,
  Search,
  Globe,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Download,
  Image as ImageIcon,
  RotateCcw,
  PlusCircle,
  ExternalLink,
  FileSpreadsheet
} from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  directus,
  Box,
  ComponentPackage,
  ComponentType,
  Component
} from "../lib/directus";
import { readItems, uploadFiles, createItem, readItem, updateItem } from "@directus/sdk";
import { BarcodeScanner } from "../components/BarcodeScanner";
import {
  fetchLcscComponent,
  normalizeLcscCode,
  formatLcscMarkdown,
  LcscComponentInfo,
  fetchLcscAssetsAsFiles,
  downloadAssetAsFile,
  parseLcscBagScan
} from "../lib/lcsc";
import {
  ComponentFormData,
  ProceduralState,
  StepValidationErrors,
  focusClasses,
  mergeKeywords,
  buildCategoriesPromptInfo,
  matchCategoryAndSubcategory,
  matchPackageOption
} from "../components/add-component/types";
import {
  getResistorSvgString,
  getInductorSvgString,
  getTransistorSvgString,
  getCapacitorSvgString,
  svgStringToBlob
} from "../components/add-component/ProceduralVisuals";
import { StepBasics } from "../components/add-component/StepBasics";
import { StepSpecs } from "../components/add-component/StepSpecs";
import { StepInventory } from "../components/add-component/StepInventory";
import { DatasheetSearchModal } from "../components/add-component/DatasheetSearchModal";
import { LcscOrderImportModal } from "../components/add-component/LcscOrderImportModal";

const DRAFT_STORAGE_KEY = "electrostock_add_component_draft_v1";

const DEFAULT_PROCEDURAL_STATE: ProceduralState = {
  isResistor: false,
  isInductor: false,
  isTransistor: false,
  isCapacitor: false,
  capacitorType: "Ceramic",
  bandCount: 4,
  resistorValue: "",
  inductanceValue: "",
  transistorValue: "",
  capacitorValue: "",
  tolerance: "5%",
  tempCo: "100ppm",
  resistorUnit: "Ω",
  inductorUnit: "µH",
  transistorUnit: "",
  capacitorUnit: "µF",
  isBatchMode: false,
  batchItems: [{ value: "", quantity: 1, unit: "" }]
};

const STEPS = [
  {
    id: 1,
    title: "Identification & Basics",
    shortTitle: "Basics",
    subtitle: "Name, category, package & keywords",
    icon: Settings
  },
  {
    id: 2,
    title: "Specs & Datasheet",
    shortTitle: "Specs & PDF",
    subtitle: "Technical markdown, image & datasheet",
    icon: FileText
  },
  {
    id: 3,
    title: "Inventory & Storage",
    shortTitle: "Inventory",
    subtitle: "Location, quantity & bag barcodes",
    icon: Package
  }
];

export function AddComponent() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const cloneId = searchParams.get("clone");
  const isEditMode = !!id;
  const isCloneMode = !!cloneId;

  // Stepper State
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [stepErrors, setStepErrors] = useState<StepValidationErrors>({});
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);

  // Success Confirmation State
  const [savedSuccessState, setSavedSuccessState] = useState<{
    componentId?: number | string | null;
    name: string;
    count: number;
    categoryLabel: string;
    packageLabel: string;
    locationLabel: string;
    barcodesCount: number;
    hasDatasheet: boolean;
  } | null>(null);

  // Barcodes & Scanner
  const [barcodes, setBarcodes] = useState<string[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  // AI & Lookup Modals
  const [aiProposal, setAiProposal] = useState<{
    category?: string;
    subcategory?: string;
    package?: string;
    isExistingCategoryName?: boolean;
    existingEmptyCategoryId?: number;
    createCategory?: boolean;
    createPackage?: boolean;
  } | null>(null);
  const [isCreatingProposal, setIsCreatingProposal] = useState(false);
  const [lcscAiPromptData, setLcscAiPromptData] = useState<LcscComponentInfo | null>(null);
  const [showDatasheetSearchModal, setShowDatasheetSearchModal] = useState(false);
  const [showLcscOrderImportModal, setShowLcscOrderImportModal] = useState(false);

  // Editor & AI status
  const [previewMode, setPreviewMode] = useState(false);
  const [isAiFilling, setIsAiFilling] = useState(false);
  const [settings, setSettings] = useState({ enableAiSuggestions: true });
  const [isSearchingImages, setIsSearchingImages] = useState(false);

  // Procedural / Batch State
  const [procedural, setProcedural] = useState<ProceduralState>(DEFAULT_PROCEDURAL_STATE);

  // Web Image Search Modal
  const [searchResults, setSearchResults] = useState<{ url: string; title: string }[]>([]);
  const [showImageSearchModal, setShowImageSearchModal] = useState<{
    type: "main" | "additional" | "datasheet";
    query: string;
  } | null>(null);

  // Options State
  const [categories, setCategories] = useState<ComponentType[]>([]);
  const [packages, setPackages] = useState<ComponentPackage[]>([]);
  const [locations, setLocations] = useState<Box[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);

  // Form Data State
  const [formData, setFormData] = useState<ComponentFormData>({
    name: "",
    category: "",
    subcategory: "",
    pkg: "",
    description: "",
    quantity: 0,
    price: "",
    storageLocation: "",
    packetReference: "",
    referenceUrl: ""
  });

  // Tags State
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  // File Upload States
  const [mainImage, setMainImage] = useState<File | null>(null);
  const [datasheet, setDatasheet] = useState<File | null>(null);
  const [linkedDatasheetUrl, setLinkedDatasheetUrl] = useState<string>("");
  const [additionalImages, setAdditionalImages] = useState<File[]>([]);
  const [additionalFiles, setAdditionalFiles] = useState<File[]>([]);

  // Existing Files State (for Edit / Clone Mode)
  const [existingMainImage, setExistingMainImage] = useState<string | null>(null);
  const [existingDatasheet, setExistingDatasheet] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

  // Category / Package / LCSC Modals
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [showLcscModal, setShowLcscModal] = useState(false);
  const [lcscSearchCode, setLcscSearchCode] = useState("");
  const [isLcscLoading, setIsLcscLoading] = useState(false);
  const [lastLcscData, setLastLcscData] = useState<LcscComponentInfo | null>(null);
  const [editingCategory, setEditingCategory] = useState<ComponentType | null>(null);
  const [editingPackage, setEditingPackage] = useState<ComponentPackage | null>(null);

  // Modal Form States
  const [modalName, setModalName] = useState("");
  const [modalSubcategory, setModalSubcategory] = useState("");
  const [isModalSaving, setIsModalSaving] = useState(false);

  // 1. Restore uncommitted draft from sessionStorage in Add Mode
  useEffect(() => {
    if (isEditMode || isCloneMode) {
      setHasRestoredDraft(true);
      return;
    }
    try {
      const rawDraft = sessionStorage.getItem(DRAFT_STORAGE_KEY);
      if (rawDraft) {
        const parsed = JSON.parse(rawDraft);
        if (parsed.formData) setFormData((prev) => ({ ...prev, ...parsed.formData }));
        if (Array.isArray(parsed.tags)) setTags(parsed.tags);
        if (Array.isArray(parsed.barcodes)) setBarcodes(parsed.barcodes);
        if (parsed.procedural) setProcedural((prev) => ({ ...prev, ...parsed.procedural }));
        if (typeof parsed.currentStep === "number" && parsed.currentStep >= 1 && parsed.currentStep <= 3) {
          setCurrentStep(parsed.currentStep);
        }
        if (parsed.linkedDatasheetUrl) setLinkedDatasheetUrl(parsed.linkedDatasheetUrl);
        if (parsed.lastLcscData) setLastLcscData(parsed.lastLcscData);
      }
    } catch (e) {
      console.warn("Failed to restore component draft from sessionStorage:", e);
    } finally {
      setHasRestoredDraft(true);
    }
  }, [isEditMode, isCloneMode]);

  // 2. Persist uncommitted draft to sessionStorage in Add Mode
  useEffect(() => {
    if (isEditMode || isCloneMode || !hasRestoredDraft || savedSuccessState) return;
    try {
      const payload = {
        formData,
        tags,
        barcodes,
        procedural,
        currentStep,
        linkedDatasheetUrl,
        lastLcscData
      };
      sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn("Failed to save component draft to sessionStorage:", e);
    }
  }, [
    formData,
    tags,
    barcodes,
    procedural,
    currentStep,
    linkedDatasheetUrl,
    lastLcscData,
    isEditMode,
    isCloneMode,
    hasRestoredDraft,
    savedSuccessState
  ]);

  // Global Hardware Barcode Scanner Listener
  useEffect(() => {
    let buffer = "";
    let lastKeyTime = Date.now();

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (showLcscOrderImportModal) return;
      const currentTime = Date.now();
      const char = e.key;

      if (currentTime - lastKeyTime > 100) {
        buffer = "";
      }
      lastKeyTime = currentTime;

      if (char === "Enter") {
        if (buffer.length > 2) {
          const activeTag = document.activeElement?.tagName;
          if (activeTag !== "INPUT" && activeTag !== "TEXTAREA") {
            const parsed = parseLcscBagScan(buffer);
            const newBarcode = parsed.internalBagBarcode || parsed.rawNormalized;
            if (newBarcode && !barcodes.includes(newBarcode)) {
              setBarcodes((prev) => [...prev, newBarcode]);
              toast.success(`Barcode added: ${newBarcode}`);
            }
            if (parsed.lcscPartNumber) {
              setFormData((prev) => ({
                ...prev,
                packetReference: prev.packetReference || parsed.lcscPartNumber || ""
              }));
            }
          }
        }
        buffer = "";
      } else if (char.length === 1) {
        buffer += char;
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [barcodes, showLcscOrderImportModal]);

  // Fetch Directus Options (Categories, Packages, Boxes)
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [fetchedCategories, fetchedPackages, fetchedLocations] = await Promise.all([
          directus.request(readItems("components_types")),
          directus.request(readItems("components_packages")),
          directus.request(readItems("boxes"))
        ]);

        setCategories(fetchedCategories);
        setPackages(fetchedPackages);
        setLocations(fetchedLocations);

        if (!isEditMode && !isCloneMode) {
          setFormData((prev) => ({
            ...prev,
            category: prev.category || (fetchedCategories.length > 0 ? fetchedCategories[0].id.toString() : ""),
            pkg: prev.pkg || (fetchedPackages.length > 0 ? fetchedPackages[0].id.toString() : ""),
            storageLocation:
              prev.storageLocation || (fetchedLocations.length > 0 ? fetchedLocations[0].id.toString() : "")
          }));
        }
      } catch (error) {
        console.error("Error fetching options from Directus:", error);
      } finally {
        setIsLoadingOptions(false);
      }
    };

    fetchOptions();
  }, [isEditMode, isCloneMode]);

  // Load App Settings
  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.enableAiSuggestions === "boolean") {
          setSettings(data);
        }
      })
      .catch((err) => console.error("Failed to load settings", err));
  }, []);

  // Load Existing Component in Edit or Clone Mode
  useEffect(() => {
    const fetchId = id || cloneId;
    if (!fetchId) return;

    const fetchComponent = async () => {
      try {
        const component = (await directus.request(
          readItem("components", Number(fetchId), {
            fields: ["*", "type.*", "package.*", "location.*"] as any
          })
        )) as unknown as Component;

        setFormData({
          name: isCloneMode ? `${component.name} (Copy)` : component.name,
          category:
            typeof component.type === "object"
              ? component.type?.id?.toString() || ""
              : String(component.type || ""),
          subcategory: typeof component.type === "object" ? component.type?.subcategory || "" : "",
          pkg:
            typeof component.package === "object"
              ? component.package?.id?.toString() || ""
              : String(component.package || ""),
          description: component.description || "",
          quantity: isCloneMode ? 0 : component.quantity_available || 0,
          price:
            component.price !== null && component.price !== undefined
              ? String(component.price)
              : "",
          storageLocation:
            typeof component.location === "object"
              ? component.location?.id?.toString() || ""
              : String(component.location || ""),
          packetReference: component.packet_reference || "",
          referenceUrl: component.url || ""
        });

        setTags(component.keywords || []);
        if (!isCloneMode && component.barcode) {
          setBarcodes(component.barcode.split(";").filter((b) => b.trim() !== ""));
        } else {
          setBarcodes([]);
        }

        setExistingMainImage(component.main_image as string);
        setExistingDatasheet(component.datasheet as string);
      } catch (error) {
        console.error("Error fetching component:", error);
        toast.error("Failed to load component details");
        navigate("/inventory");
      }
    };

    fetchComponent();
  }, [id, cloneId, navigate, isCloneMode]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "quantity" ? Number(value) : value
    }));
    if (stepErrors[name]) {
      setStepErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const addSingleTag = (raw: string) => {
    const newTag = raw.trim().toUpperCase();
    if (newTag && !tags.includes(newTag)) {
      setTags((prev) => [...prev, newTag]);
      if (stepErrors.tags) {
        setStepErrors((prev) => {
          const next = { ...prev };
          delete next.tags;
          return next;
        });
      }
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (tagInput.trim()) {
        addSingleTag(tagInput);
        setTagInput("");
      }
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (barcodeInput.trim()) {
        const parsed = parseLcscBagScan(barcodeInput);
        const newBarcode = parsed.internalBagBarcode || parsed.rawNormalized;
        if (newBarcode && !barcodes.includes(newBarcode)) {
          setBarcodes([...barcodes, newBarcode]);
        }
        if (parsed.lcscPartNumber) {
          setFormData((prev) => ({
            ...prev,
            packetReference: prev.packetReference || parsed.lcscPartNumber || ""
          }));
        }
        setBarcodeInput("");
      }
    }
  };

  const removeBarcode = (codeToRemove: string) => {
    setBarcodes(barcodes.filter((b) => b !== codeToRemove));
  };

  const isProcedural =
    procedural.isResistor ||
    procedural.isInductor ||
    procedural.isTransistor ||
    procedural.isCapacitor;

  // Clear mainImage validation error once an image or procedural generator is selected
  useEffect(() => {
    if ((mainImage || existingMainImage || isProcedural) && stepErrors.mainImage) {
      setStepErrors((prev) => {
        const next = { ...prev };
        delete next.mainImage;
        return next;
      });
    }
  }, [mainImage, existingMainImage, isProcedural, stepErrors.mainImage]);

  // Step Validation Logic
  const validateStep = (stepToCheck: number): boolean => {
    const errors: StepValidationErrors = {};

    // Auto-commit any text left in tagInput before checking Step 1
    let effectiveTags = tags;
    if (stepToCheck === 1 && tagInput.trim()) {
      const autoTag = tagInput.trim().toUpperCase();
      if (!tags.includes(autoTag)) {
        effectiveTags = [...tags, autoTag];
        setTags(effectiveTags);
      }
      setTagInput("");
    }

    if (stepToCheck === 1) {
      if (!formData.name.trim()) {
        errors.name = "Component name or part number is required.";
      }
      if (!formData.category) {
        errors.category = "Please select or create a category.";
      }
      if (effectiveTags.length === 0) {
        errors.tags = "Please add at least one keyword/tag (type and press Enter).";
      }
      if (procedural.isBatchMode) {
        const validBatch = procedural.batchItems.filter((i) => i.value.trim());
        if (validBatch.length === 0) {
          errors.batchItems = "Please enter a value for at least one batch item.";
        }
      }
    } else if (stepToCheck === 2) {
      if (!formData.description.trim()) {
        errors.description = "Component description and specifications are required.";
      }
      if (!isProcedural && !mainImage && !existingMainImage) {
        errors.mainImage = "Please upload a main image, search the web, or select a component preset in Step 1.";
      }
    } else if (stepToCheck === 3) {
      if (!formData.storageLocation) {
        errors.storageLocation = "Please select a storage location.";
      }
      if (!procedural.isBatchMode && Number(formData.quantity) < 0) {
        errors.quantity = "Quantity cannot be negative.";
      }
    }

    setStepErrors(errors);

    if (Object.keys(errors).length > 0) {
      const firstError = Object.values(errors)[0];
      toast.error(firstError);
      return false;
    }
    return true;
  };

  const handleNextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(3, prev + 1));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handlePrevStep = () => {
    setStepErrors({});
    setCurrentStep((prev) => Math.max(1, prev - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleStepClick = (targetStep: number) => {
    if (targetStep === currentStep) return;
    if (targetStep < currentStep) {
      setStepErrors({});
      setCurrentStep(targetStep);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    // Validate intermediate steps before jumping forward
    for (let s = currentStep; s < targetStep; s++) {
      if (!validateStep(s)) {
        setCurrentStep(s);
        return;
      }
    }
    setCurrentStep(targetStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleClearDraft = () => {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    setFormData({
      name: "",
      category: categories.length > 0 ? categories[0].id.toString() : "",
      subcategory: "",
      pkg: packages.length > 0 ? packages[0].id.toString() : "",
      description: "",
      quantity: 0,
      price: "",
      storageLocation: locations.length > 0 ? locations[0].id.toString() : "",
      packetReference: "",
      referenceUrl: ""
    });
    setTags([]);
    setTagInput("");
    setBarcodes([]);
    setBarcodeInput("");
    setMainImage(null);
    setDatasheet(null);
    setLinkedDatasheetUrl("");
    setAdditionalImages([]);
    setAdditionalFiles([]);
    setProcedural(DEFAULT_PROCEDURAL_STATE);
    setLastLcscData(null);
    setStepErrors({});
    setCurrentStep(1);
    setSavedSuccessState(null);
    toast.success("Form reset to a clean state");
  };

  // Category & Package Modals
  const openCategoryModal = (category?: ComponentType) => {
    if (category) {
      setEditingCategory(category);
      setModalName(category.name);
      setModalSubcategory(category.subcategory || "");
    } else {
      setEditingCategory(null);
      setModalName("");
      setModalSubcategory("");
    }
    setShowCategoryModal(true);
  };

  const openPackageModal = (pkg?: ComponentPackage) => {
    if (pkg) {
      setEditingPackage(pkg);
      setModalName(pkg.name);
    } else {
      setEditingPackage(null);
      setModalName("");
    }
    setShowPackageModal(true);
  };

  const handleSaveCategory = async () => {
    const trimmedName = modalName.trim();
    const trimmedSub = modalSubcategory.trim();
    if (!trimmedName) return;

    const duplicate = categories.some((c) => {
      if (editingCategory && c.id === editingCategory.id) return false;
      return (
        c.name.trim().toLowerCase() === trimmedName.toLowerCase() &&
        (c.subcategory || "").trim().toLowerCase() === trimmedSub.toLowerCase()
      );
    });
    if (duplicate) {
      toast.error(
        trimmedSub
          ? `Category "${trimmedName} - ${trimmedSub}" already exists`
          : `Category "${trimmedName}" already exists`
      );
      return;
    }

    setIsModalSaving(true);
    try {
      if (editingCategory) {
        await directus.request(
          updateItem("components_types", editingCategory.id, {
            name: trimmedName,
            subcategory: trimmedSub
          })
        );
        setCategories((prev) =>
          prev.map((c) =>
            c.id === editingCategory.id ? { ...c, name: trimmedName, subcategory: trimmedSub } : c
          )
        );
        toast.success("Category updated");
      } else {
        const newCat = (await directus.request(
          createItem("components_types", {
            name: trimmedName,
            subcategory: trimmedSub
          })
        )) as ComponentType;
        setCategories((prev) => [...prev, newCat]);
        setFormData((prev) => ({ ...prev, category: String(newCat.id), subcategory: trimmedSub }));
        toast.success("Category created");
      }
      setShowCategoryModal(false);
    } catch (e) {
      console.error(e);
      toast.error("Failed to save category");
    } finally {
      setIsModalSaving(false);
    }
  };

  const handleSavePackage = async () => {
    const trimmedName = modalName.trim();
    if (!trimmedName) return;

    const duplicate = packages.some((p) => {
      if (editingPackage && p.id === editingPackage.id) return false;
      return p.name.trim().toLowerCase() === trimmedName.toLowerCase();
    });
    if (duplicate) {
      toast.error(`Package "${trimmedName}" already exists`);
      return;
    }

    setIsModalSaving(true);
    try {
      if (editingPackage) {
        await directus.request(
          updateItem("components_packages", editingPackage.id, {
            name: trimmedName
          })
        );
        setPackages((prev) =>
          prev.map((p) => (p.id === editingPackage.id ? { ...p, name: trimmedName } : p))
        );
        toast.success("Package updated");
      } else {
        const newPkg = (await directus.request(
          createItem("components_packages", {
            name: trimmedName
          })
        )) as ComponentPackage;
        setPackages((prev) => [...prev, newPkg]);
        setFormData((prev) => ({ ...prev, pkg: String(newPkg.id) }));
        toast.success("Package created");
      }
      setShowPackageModal(false);
    } catch (e) {
      console.error(e);
      toast.error("Failed to save package");
    } finally {
      setIsModalSaving(false);
    }
  };

  // AI Research & Classification
  const runAiResearchAndApply = async (options?: {
    componentName?: string;
    lcscData?: LcscComponentInfo;
    onlyClassification?: boolean;
  }) => {
    const targetName = (options?.componentName || options?.lcscData?.name || formData.name).trim();
    if (!targetName) {
      toast.error("Please enter a component name first");
      return;
    }

    setIsAiFilling(true);
    const toastId = toast.loading(
      options?.onlyClassification
        ? `AI is determining keywords, package, and category for ${targetName}...`
        : "AI is researching the component..."
    );

    try {
      const contextParts: string[] = [];
      const lcscInfo = options?.lcscData || lastLcscData;

      if (lcscInfo) {
        contextParts.push(
          `LCSC Part: ${lcscInfo.lcscPartNumber}`,
          `Name: ${lcscInfo.name}`,
          `Manufacturer: ${lcscInfo.manufacturer}`,
          `MPN: ${lcscInfo.manufacturerPartNumber}`,
          `Distributor Category: ${lcscInfo.category} / ${lcscInfo.subcategory}`,
          `Distributor Package/Footprint: ${lcscInfo.package}`,
          `Parameters: ${lcscInfo.parameters.map((p) => `${p.name}=${p.value}`).join(", ")}`
        );
      } else {
        try {
          const searchResponse = await fetch(`/api/search-images?q=${encodeURIComponent(targetName)}`);
          if (searchResponse.ok) {
            const imgResults = await searchResponse.json();
            if (Array.isArray(imgResults) && imgResults.length > 0) {
              contextParts.push(
                imgResults
                  .slice(0, 5)
                  .map((r: any) => r.title)
                  .join("\n")
              );
            }
          }
        } catch (searchErr) {
          console.warn("Optional search context failed, continuing with AI research:", searchErr);
        }
      }

      const categoriesInfo = buildCategoriesPromptInfo(categories);
      const packagesInfo = packages.map((p) => p.name).join(", ");

      const aiResponse = await fetch("/api/ai-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: targetName,
          context: contextParts.join("\n"),
          categoriesInfo,
          packagesInfo,
          onlyClassification: Boolean(options?.onlyClassification)
        })
      });

      if (!aiResponse.ok) {
        const errJson = await aiResponse.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to get AI research");
      }
      const data = await aiResponse.json();

      const catMatch = matchCategoryAndSubcategory(categories, data.category, data.subcategory);
      const pkgMatch = matchPackageOption(packages, data.package);

      setFormData((prev) => ({
        ...prev,
        description:
          !options?.onlyClassification && data.description
            ? data.description
            : prev.description || data.description || "",
        category: catMatch.matched ? String(catMatch.matched.id) : prev.category,
        subcategory: catMatch.matched ? catMatch.matched.subcategory || "" : prev.subcategory,
        pkg: pkgMatch.matched ? String(pkgMatch.matched.id) : prev.pkg,
        packetReference: prev.packetReference || data.packet_reference || ""
      }));

      if (data.keywords && Array.isArray(data.keywords)) {
        setTags((prev) => mergeKeywords(prev, data.keywords));
      }

      const hasCategoryProposal = Boolean(catMatch.proposedCategory || catMatch.proposedSubcategory);
      const hasPackageProposal = Boolean(pkgMatch.proposedPackage);

      if (hasCategoryProposal || hasPackageProposal) {
        setAiProposal({
          category: catMatch.proposedCategory,
          subcategory: catMatch.proposedSubcategory,
          package: pkgMatch.proposedPackage,
          isExistingCategoryName: catMatch.isExistingCategoryName,
          existingEmptyCategoryId: catMatch.existingEmptyCategoryId,
          createCategory: hasCategoryProposal,
          createPackage: hasPackageProposal
        });
        toast.success(
          "AI determined the classification and suggested new category/package options!",
          { id: toastId, duration: 5000 }
        );
      } else {
        toast.success(
          <div className="flex flex-col gap-2">
            <p>
              {options?.onlyClassification
                ? "AI has set keywords, category, and package!"
                : "AI has filled the fields!"}
            </p>
            {!options?.onlyClassification && (
              <button
                type="button"
                onClick={() => setShowImageSearchModal({ type: "main", query: targetName })}
                className="text-[10px] font-bold uppercase tracking-wider bg-primary text-white px-2 py-1 rounded hover:bg-primary/90 transition-colors w-fit"
              >
                Search for images now
              </button>
            )}
          </div>,
          { id: toastId, duration: 5000 }
        );
      }
    } catch (error: any) {
      console.error("AI Fill Error:", error);
      toast.error(error.message || "AI failed to research the component", { id: toastId });
    } finally {
      setIsAiFilling(false);
    }
  };

  const handleAiFill = async () => {
    if (!settings.enableAiSuggestions) return;
    await runAiResearchAndApply();
  };

  // Shared logic to apply a selected catalog part (from either Live Part Search or LCSC Import)
  const applyCatalogPartToForm = async (
    data: LcscComponentInfo,
    mode: "full" | "datasheet_only" = "full"
  ) => {
    setLastLcscData(data);

    const resolvedPdfUrl = data.officialDatasheetUrl || data.datasheetUrl || "";
    if (resolvedPdfUrl) {
      setLinkedDatasheetUrl(resolvedPdfUrl);
    }

    if (mode === "datasheet_only") {
      const toastId = toast.loading(`Downloading datasheet PDF for ${data.name}...`);
      try {
        const cleanName = (data.name || "component").replace(/[^a-zA-Z0-9_-]/g, "_");
        const pdfFile = await downloadAssetAsFile(
          data.datasheetUrl || resolvedPdfUrl,
          `${cleanName}_datasheet.pdf`,
          "application/pdf"
        );
        if (pdfFile) {
          setDatasheet(pdfFile);
          setFormData((prev) => ({
            ...prev,
            referenceUrl: prev.referenceUrl || resolvedPdfUrl || data.productUrl
          }));
          toast.success(`Attached datasheet PDF for ${data.name}!`, { id: toastId });
        } else {
          setFormData((prev) => ({
            ...prev,
            referenceUrl: resolvedPdfUrl || data.productUrl || prev.referenceUrl
          }));
          toast.info(`Linked datasheet URL for ${data.name} to Reference URL.`, { id: toastId });
        }
      } catch {
        toast.error("Failed to download PDF directly; linked URL saved.", { id: toastId });
      }
      return;
    }

    // Full Part & Datasheet Auto-Fill
    const catMatch = matchCategoryAndSubcategory(categories, data.category, data.subcategory);
    const pkgMatch = matchPackageOption(packages, data.package);

    setFormData((prev) => ({
      ...prev,
      name: data.name || prev.name,
      description: formatLcscMarkdown(data),
      category: catMatch.matched ? String(catMatch.matched.id) : prev.category,
      subcategory: catMatch.matched ? catMatch.matched.subcategory || "" : prev.subcategory,
      pkg: pkgMatch.matched ? String(pkgMatch.matched.id) : prev.pkg,
      price:
        prev.price ||
        (data.unitPrice !== null && data.unitPrice !== undefined ? String(data.unitPrice) : ""),
      packetReference: data.lcscPartNumber || data.manufacturerPartNumber || prev.packetReference,
      referenceUrl: data.productUrl || resolvedPdfUrl || prev.referenceUrl
    }));

    // NOTE: Never automatically fill Barcodes / SKUs on catalog/LCSC import.
    // Physical bags have their own internal SKU/barcode scanned by the user.

    const baseKeywords = [
      data.lcscPartNumber,
      data.name,
      data.manufacturer,
      data.package && data.package !== "Standard" ? data.package : "",
      data.lcscPartNumber ? "LCSC" : ""
    ].filter(Boolean);
    setTags((prev) => mergeKeywords(prev, baseKeywords));

    // Clear any Step 1/2 errors that were just satisfied
    setStepErrors({});

    const assetToastId = toast.loading(
      `Downloading datasheet PDF & product photos for ${data.name}...`
    );
    try {
      const assets = await fetchLcscAssetsAsFiles(data);
      if (assets.mainImage) setMainImage(assets.mainImage);
      if (assets.datasheet) setDatasheet(assets.datasheet);
      if (assets.additionalImages.length > 0) setAdditionalImages(assets.additionalImages);
      if (assets.additionalFiles.length > 0) setAdditionalFiles(assets.additionalFiles);

      toast.success(
        <div className="flex flex-col gap-1">
          <p className="font-bold">Part & Datasheet Auto-Filled!</p>
          <p className="text-xs text-slate-500">
            {data.name} {data.manufacturer ? `(${data.manufacturer})` : ""}
          </p>
          <p className="text-[11px] text-primary">
            Specs, photos, and PDF datasheet attached. Barcodes left blank for bag scanning.
          </p>
        </div>,
        { id: assetToastId, duration: 4000 }
      );
    } catch (assetErr) {
      console.warn("Asset auto-download warning:", assetErr);
      toast.success(`Metadata populated for ${data.name}!`, { id: assetToastId });
    }

    // Prompt user whether to use AI to determine keywords, package, and category
    setLcscAiPromptData(data);
  };

  // Manual Datasheet URL Fallback Handler
  const handleManualDatasheetUrl = async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setLinkedDatasheetUrl(trimmed);
    setFormData((prev) => ({
      ...prev,
      referenceUrl: prev.referenceUrl || trimmed
    }));

    const toastId = toast.loading("Downloading & attaching datasheet from URL...");
    try {
      const cleanName = (formData.name || "component").replace(/[^a-zA-Z0-9_-]/g, "_");
      const file = await downloadAssetAsFile(trimmed, `${cleanName}_datasheet.pdf`, "application/pdf");
      if (file && file.size > 100) {
        setDatasheet(file);
        toast.success("Datasheet PDF downloaded and attached to component!", { id: toastId });
      } else {
        toast.success("Datasheet URL linked to component record!", { id: toastId });
      }
    } catch {
      toast.success("Datasheet URL linked to component record!", { id: toastId });
    }
  };

  const handleLcscImport = async (codeToFetch?: string) => {
    const rawInput = (codeToFetch || lcscSearchCode || formData.name).trim();
    const code = normalizeLcscCode(rawInput);
    if (!code) {
      toast.error("Please enter a valid LCSC part code (e.g. C2040)");
      return;
    }

    setIsLcscLoading(true);
    const toastId = toast.loading(`Fetching full details for ${code} from LCSC...`);

    try {
      const data = await fetchLcscComponent(code);
      if (!data) {
        toast.error(`Component ${code} was not found on LCSC.`, { id: toastId });
        return;
      }
      toast.dismiss(toastId);
      setShowLcscModal(false);
      await applyCatalogPartToForm(data, "full");
    } catch (err: any) {
      console.error("LCSC Import failed:", err);
      toast.error(err.message || "Failed to import component from LCSC", { id: toastId });
    } finally {
      setIsLcscLoading(false);
    }
  };

  const handleAutoFillAssets = async () => {
    const rawCode =
      normalizeLcscCode(formData.name) ||
      normalizeLcscCode(formData.packetReference) ||
      normalizeLcscCode(formData.referenceUrl) ||
      (lastLcscData?.lcscPartNumber ? normalizeLcscCode(lastLcscData.lcscPartNumber) : "") ||
      (barcodes.length > 0 ? normalizeLcscCode(barcodes[0]) : "");

    if (rawCode && rawCode.startsWith("C") && /^C\d+$/.test(rawCode)) {
      setIsLcscLoading(true);
      const toastId = toast.loading(`Auto-filling all assets for ${rawCode}...`);
      try {
        const data = await fetchLcscComponent(rawCode, { includeSvg: true });
        if (data) {
          const assets = await fetchLcscAssetsAsFiles(data);
          let filledCount = 0;
          if (assets.mainImage) {
            setMainImage(assets.mainImage);
            filledCount++;
          }
          if (assets.datasheet) {
            setDatasheet(assets.datasheet);
            filledCount++;
          }
          if (assets.additionalImages.length > 0) {
            setAdditionalImages(assets.additionalImages);
            filledCount += assets.additionalImages.length;
          }
          if (assets.additionalFiles.length > 0) {
            setAdditionalFiles(assets.additionalFiles);
            filledCount += assets.additionalFiles.length;
          }
          toast.success(`Successfully auto-filled ${filledCount} asset file(s) for ${data.name}!`, {
            id: toastId
          });
          return;
        }
      } catch (e: any) {
        console.warn("LCSC asset fill failed, trying web image fallback...", e);
      } finally {
        setIsLcscLoading(false);
      }
    }

    if (formData.name.trim()) {
      const toastId = toast.loading(`Auto-searching web images for "${formData.name}"...`);
      try {
        const res = await fetch(`/api/search-images?q=${encodeURIComponent(formData.name)}`);
        if (res.ok) {
          const results = await res.json();
          if (results && results.length > 0) {
            const imgRes = await fetch(`/api/proxy-download?url=${encodeURIComponent(results[0].url)}`);
            if (imgRes.ok) {
              const blob = await imgRes.blob();
              setMainImage(
                new File([blob], `${formData.name.replace(/\s+/g, "_")}_main.jpg`, {
                  type: blob.type
                })
              );
              toast.success("Main image auto-filled from web!", { id: toastId });
              return;
            }
          }
        }
        toast.info(
          "No automatic web image found. Try 'Lookup Datasheet & Part' to search distributor catalogs.",
          { id: toastId }
        );
      } catch {
        toast.error("Failed to auto-fill assets", { id: toastId });
      }
    } else {
      toast.error("Please enter a component name or LCSC code first.");
    }
  };

  const handleSearchImages = async (query: string) => {
    if (!query.trim()) return;

    setIsSearchingImages(true);
    setSearchResults([]);
    try {
      const response = await fetch(`/api/search-images?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch images");
      }

      const results = await response.json();
      if (results && results.length > 0) {
        setSearchResults(results);
      } else {
        toast.info("No images found for this search");
      }
    } catch (error: any) {
      console.error("Image Search Error:", error);
      toast.error(error.message || "Failed to search for images");
    } finally {
      setIsSearchingImages(false);
    }
  };

  const selectWebImage = async (url: string) => {
    if (!showImageSearchModal) return;

    const toastId = toast.loading("Downloading image...");
    try {
      let response = await fetch(`/api/proxy-download?url=${encodeURIComponent(url)}`);
      if (!response.ok) {
        response = await fetch(url);
      }
      if (!response.ok) throw new Error("Failed to download image");
      const blob = await response.blob();
      const file = new File([blob], "web-image.jpg", { type: blob.type || "image/jpeg" });

      if (showImageSearchModal.type === "main") {
        setMainImage(file);
      } else if (showImageSearchModal.type === "datasheet") {
        setDatasheet(file);
      } else {
        setAdditionalImages((prev) => [...prev, file]);
      }

      setShowImageSearchModal(null);
      toast.success("Image added!", { id: toastId });
    } catch (error) {
      console.error("Image Download Error:", error);
      toast.error("Failed to download image. It might be protected.", { id: toastId });
    }
  };

  // Final Form Submission (Preserves Exact Directus Schema & Relations)
  const handleSave = async () => {
    // Validate all 3 steps before submitting
    if (!validateStep(1)) {
      setCurrentStep(1);
      return;
    }
    if (!validateStep(2)) {
      setCurrentStep(2);
      return;
    }
    if (!validateStep(3)) {
      setCurrentStep(3);
      return;
    }

    const {
      isResistor,
      isInductor,
      isTransistor,
      isCapacitor,
      capacitorType,
      bandCount,
      resistorValue,
      inductanceValue,
      transistorValue,
      capacitorValue,
      tolerance,
      tempCo,
      resistorUnit,
      inductorUnit,
      capacitorUnit,
      isBatchMode,
      batchItems
    } = procedural;

    setIsSaving(true);
    const toastId = toast.loading(isEditMode ? "Updating component..." : "Saving component...");
    try {
      const itemsToSave = isBatchMode
        ? batchItems.filter((i) => i.value.trim())
        : [
            {
              value: isResistor
                ? resistorValue
                : isInductor
                ? inductanceValue
                : isTransistor
                ? transistorValue
                : isCapacitor
                ? capacitorValue
                : "",
              quantity: Number(formData.quantity),
              unit: isResistor
                ? resistorUnit
                : isInductor
                ? inductorUnit
                : isTransistor
                ? ""
                : isCapacitor
                ? capacitorUnit
                : "",
              type: isCapacitor ? capacitorType : undefined
            }
          ];

      if (itemsToSave.length === 0) {
        throw new Error("No items to save. Please add at least one value.");
      }

      const total = itemsToSave.length;
      let current = 0;
      setUploadProgress({ current: 0, total });

      let uploadedMainImageId = existingMainImage;
      let uploadedDatasheetId = existingDatasheet;

      // Upload files once if not procedural
      if (!isProcedural) {
        if (mainImage) {
          const mainImageFormData = new FormData();
          mainImageFormData.append("file", mainImage);
          const mainImageRes = await directus.request(uploadFiles(mainImageFormData));
          uploadedMainImageId = (mainImageRes as any).id;
        }
        if (datasheet) {
          const datasheetFormData = new FormData();
          datasheetFormData.append("file", datasheet);
          const datasheetRes = await directus.request(uploadFiles(datasheetFormData));
          uploadedDatasheetId = (datasheetRes as any).id;
        }
      }

      // Upload additional files once
      const uploadedAdditionalImageIds: string[] = [];
      const uploadedAdditionalFileIds: string[] = [];

      if (additionalImages.length > 0) {
        for (const file of additionalImages) {
          const fileData = new FormData();
          fileData.append("file", file);
          const fileRes = await directus.request(uploadFiles(fileData));
          uploadedAdditionalImageIds.push((fileRes as any).id);
        }
      }

      if (additionalFiles.length > 0) {
        for (const file of additionalFiles) {
          const fileData = new FormData();
          fileData.append("file", file);
          const fileRes = await directus.request(uploadFiles(fileData));
          uploadedAdditionalFileIds.push((fileRes as any).id);
        }
      }

      let lastCreatedComponentId: string | number | null = id ? Number(id) : null;

      for (const item of itemsToSave) {
        current++;
        setUploadProgress({ current, total });
        let mainImageId = uploadedMainImageId;
        let datasheetId = uploadedDatasheetId;

        if (isProcedural) {
          const itemUnit =
            (item as any).unit || (isResistor ? resistorUnit : isInductor ? inductorUnit : "");
          const svgString = isResistor
            ? getResistorSvgString(item.value, itemUnit, tolerance, tempCo, bandCount)
            : isInductor
            ? getInductorSvgString(item.value, itemUnit, tolerance)
            : isTransistor
            ? getTransistorSvgString(item.value)
            : getCapacitorSvgString(item.value, itemUnit, (item as any).type || capacitorType);

          const blob = await svgStringToBlob(svgString);
          const file = new File([blob], `${item.value.replace(/[^a-z0-9]/gi, "_")}.png`, {
            type: "image/png"
          });

          const imageFormData = new FormData();
          imageFormData.append("file", file);
          const imageRes = await directus.request(uploadFiles(imageFormData));
          mainImageId = (imageRes as any).id;
          datasheetId = mainImageId;
        }

        const parsedPrice =
          formData.price && formData.price.trim() !== ""
            ? parseFloat(formData.price.replace(",", "."))
            : null;

        const componentData: any = {
          name: isBatchMode
            ? `${formData.name} (${item.value}${item.unit ? " " + item.unit : ""})`
            : formData.name,
          description: formData.description,
          quantity_available: item.quantity,
          price: parsedPrice !== null && !isNaN(parsedPrice) ? parsedPrice : null,
          location:
            formData.storageLocation && formData.storageLocation !== "0"
              ? formData.storageLocation
              : null,
          url: formData.referenceUrl || linkedDatasheetUrl || null,
          keywords: [
            ...tags,
            ...(isResistor
              ? ["resistor", item.value]
              : isInductor
              ? ["inductor", item.value]
              : isTransistor
              ? ["transistor", item.value]
              : isCapacitor
              ? ["capacitor", item.value]
              : [])
          ],
          packet_reference: formData.packetReference || null,
          package: formData.pkg && formData.pkg !== "0" ? Number(formData.pkg) : null,
          type: formData.category && formData.category !== "0" ? Number(formData.category) : null,
          barcode: isBatchMode
            ? (item as any).barcode || null
            : barcodes.length > 0
            ? barcodes.join(";")
            : null
        };

        if (mainImageId) {
          componentData.main_image = mainImageId;
        }
        if (datasheetId) {
          componentData.datasheet = datasheetId;
        }

        let componentId: string | number | null = id ? Number(id) : null;

        if (isEditMode && id && !isBatchMode) {
          await directus.request(updateItem("components", Number(id), componentData));
        } else {
          const newComponentRes = await directus.request(createItem("components", componentData));
          componentId = (newComponentRes as any).id;
        }
        lastCreatedComponentId = componentId;

        if (uploadedAdditionalImageIds.length > 0 && componentId) {
          for (const fileId of uploadedAdditionalImageIds) {
            await directus.request(
              createItem("components_files", {
                components_id: Number(componentId),
                directus_files_id: fileId
              })
            );
          }
        }

        if (uploadedAdditionalFileIds.length > 0 && componentId) {
          for (const fileId of uploadedAdditionalFileIds) {
            await directus.request(
              createItem("components_files_1", {
                components_id: Number(componentId),
                directus_files_id: fileId
              })
            );
          }
        }
      }

      // Clear saved draft on success
      sessionStorage.removeItem(DRAFT_STORAGE_KEY);

      const selectedCat = categories.find((c) => String(c.id) === String(formData.category));
      const selectedPkg = packages.find((p) => String(p.id) === String(formData.pkg));
      const selectedLoc = locations.find((l) => String(l.id) === String(formData.storageLocation));

      toast.success(
        isEditMode && !isBatchMode
          ? "Component updated successfully!"
          : `Successfully saved ${itemsToSave.length} component(s)!`,
        { id: toastId }
      );

      setSavedSuccessState({
        componentId: lastCreatedComponentId,
        name: formData.name,
        count: itemsToSave.length,
        categoryLabel: selectedCat
          ? `${selectedCat.name}${selectedCat.subcategory ? ` - ${selectedCat.subcategory}` : ""}`
          : "Uncategorized",
        packageLabel: selectedPkg ? selectedPkg.name : "Standard",
        locationLabel: selectedLoc ? `${selectedLoc.name} (${selectedLoc.unique_id})` : "Assigned",
        barcodesCount: barcodes.length,
        hasDatasheet: Boolean(datasheet || existingDatasheet || linkedDatasheetUrl || isProcedural)
      });
    } catch (error: any) {
      console.error("Error saving component:", error);
      toast.error(error.message || "Failed to save component.", { id: toastId });
    } finally {
      setIsSaving(false);
      setUploadProgress(null);
    }
  };

  return (
    <>
      <main className="flex flex-1 justify-center py-6 sm:py-8 px-4 sm:px-6 lg:px-24 pb-28">
        <div className="layout-content-container flex flex-col max-w-[1020px] flex-1 space-y-6">
          {/* Page Header */}
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2.5">
                <h1 className="text-slate-900 dark:text-white text-2xl sm:text-3xl font-extrabold tracking-tight">
                  {isEditMode ? "Edit Component" : isCloneMode ? "Clone Component" : "Add Component"}
                </h1>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-base">
                {isEditMode
                  ? "Update the technical and logistical specifications."
                  : "Complete the 3-step wizard to register a component in your inventory."}
              </p>
            </div>

            {!savedSuccessState && (
              <div className="flex items-center gap-2 shrink-0">
                {!isEditMode && !isCloneMode && (
                  <button
                    type="button"
                    onClick={handleClearDraft}
                    className="flex items-center gap-1.5 h-9 sm:h-10 px-3 sm:px-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    title="Reset all fields"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowCancelModal(true)}
                  className="flex items-center justify-center rounded-xl h-9 sm:h-10 px-3.5 sm:px-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Explicit Optimistic Success Confirmation State */}
          {savedSuccessState ? (
            <section className="bg-white dark:bg-slate-900 border border-emerald-500/30 rounded-2xl p-8 sm:p-10 shadow-xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-300 my-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
                  {isEditMode ? "Component Updated Successfully!" : "Component Added to Inventory!"}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {savedSuccessState.count > 1
                    ? `${savedSuccessState.count} batch variants of "${savedSuccessState.name}" have been registered.`
                    : `"${savedSuccessState.name}" is now stored and indexed in your inventory.`}
                </p>
              </div>

              <div className="max-w-lg mx-auto grid grid-cols-2 sm:grid-cols-4 gap-3 text-left p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs">
                <div>
                  <span className="text-slate-400 block font-semibold uppercase text-[10px]">Category</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 truncate block">
                    {savedSuccessState.categoryLabel}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold uppercase text-[10px]">Package</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate block">
                    {savedSuccessState.packageLabel}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold uppercase text-[10px]">Location</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 truncate block">
                    {savedSuccessState.locationLabel}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold uppercase text-[10px]">Datasheet</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 block">
                    {savedSuccessState.hasDatasheet ? "Attached" : "None"}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClearDraft}
                  className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20 hover:brightness-110 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Add Another Component</span>
                </button>
                {savedSuccessState.componentId && savedSuccessState.count === 1 && (
                  <button
                    type="button"
                    onClick={() => navigate(`/inventory/${savedSuccessState.componentId}`)}
                    className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>View Component Details</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => navigate("/inventory")}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Go to Inventory
                </button>
              </div>
            </section>
          ) : (
            <>
              {/* Stepper Progress Bar */}
              <nav
                aria-label="Component Entry Progress"
                className="bg-white dark:bg-slate-900/60 p-3 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm"
              >
                <div className="grid grid-cols-3 gap-2 sm:gap-4 relative">
                  {STEPS.map((step) => {
                    const Icon = step.icon;
                    const isActive = currentStep === step.id;
                    const isCompleted = currentStep > step.id;

                    return (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => handleStepClick(step.id)}
                        className={`group flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-3 p-2 sm:p-3 rounded-xl border text-center sm:text-left transition-all cursor-pointer ${
                          isActive
                            ? "border-primary bg-primary/5 dark:bg-primary/10 shadow-sm"
                            : isCompleted
                            ? "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/60"
                            : "border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:border-slate-300 dark:hover:border-slate-700"
                        }`}
                      >
                        <div
                          className={`w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center font-bold text-xs sm:text-sm shrink-0 transition-colors ${
                            isActive
                              ? "bg-primary text-white shadow-md shadow-primary/25"
                              : isCompleted
                              ? "bg-emerald-500 text-white"
                              : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          {isCompleted ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                        </div>
                        <div className="min-w-0 flex-1 w-full">
                          <span
                            className={`block text-[9px] sm:text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${
                              isActive
                                ? "text-primary"
                                : isCompleted
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-slate-400"
                            }`}
                          >
                            Step {step.id}
                          </span>
                          <p
                            className={`text-[11px] sm:text-sm font-bold truncate ${
                              isActive
                                ? "text-slate-900 dark:text-white"
                                : "text-slate-700 dark:text-slate-300"
                            }`}
                          >
                            <span className="hidden sm:inline">{step.title}</span>
                            <span className="sm:hidden">{step.shortTitle}</span>
                          </p>
                          <p className="hidden md:block text-[11px] text-slate-400 truncate">
                            {step.subtitle}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Progress Indicator Line */}
                <div className="mt-3 w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 rounded-full"
                    style={{ width: `${(currentStep / STEPS.length) * 100}%` }}
                  />
                </div>
              </nav>

              {/* Step 1: Identification & Basics */}
              {currentStep === 1 && (
                <StepBasics
                  formData={formData}
                  onInputChange={handleInputChange}
                  categories={categories}
                  packages={packages}
                  isLoadingOptions={isLoadingOptions}
                  openCategoryModal={openCategoryModal}
                  openPackageModal={openPackageModal}
                  tags={tags}
                  tagInput={tagInput}
                  setTagInput={setTagInput}
                  handleTagKeyDown={handleTagKeyDown}
                  removeTag={removeTag}
                  procedural={procedural}
                  setProcedural={setProcedural}
                  isAiFilling={isAiFilling}
                  enableAiSuggestions={settings.enableAiSuggestions}
                  onOpenDatasheetSearch={() => setShowDatasheetSearchModal(true)}
                  onOpenOrderImport={() => setShowLcscOrderImportModal(true)}
                  onAiFill={handleAiFill}
                  errors={stepErrors}
                  onAdvanceStep={handleNextStep}
                />
              )}

              {/* Step 2: Specs & Datasheet */}
              {currentStep === 2 && (
                <StepSpecs
                  formData={formData}
                  onInputChange={handleInputChange}
                  setDescription={(val) => {
                    setFormData((prev) => ({ ...prev, description: val }));
                    if (stepErrors.description) {
                      setStepErrors((prev) => {
                        const next = { ...prev };
                        delete next.description;
                        return next;
                      });
                    }
                  }}
                  previewMode={previewMode}
                  setPreviewMode={setPreviewMode}
                  procedural={procedural}
                  mainImage={mainImage}
                  setMainImage={setMainImage}
                  existingMainImage={existingMainImage}
                  datasheet={datasheet}
                  setDatasheet={setDatasheet}
                  existingDatasheet={existingDatasheet}
                  linkedDatasheetUrl={linkedDatasheetUrl}
                  onAttachDatasheetUrl={handleManualDatasheetUrl}
                  additionalImages={additionalImages}
                  setAdditionalImages={setAdditionalImages}
                  additionalFiles={additionalFiles}
                  setAdditionalFiles={setAdditionalFiles}
                  isLcscLoading={isLcscLoading}
                  isAiFilling={isAiFilling}
                  enableAiSuggestions={settings.enableAiSuggestions}
                  onAutoFillAssets={handleAutoFillAssets}
                  onOpenDatasheetSearch={() => setShowDatasheetSearchModal(true)}
                  onOpenImageSearch={(type, query) => setShowImageSearchModal({ type, query })}
                  onAiFill={handleAiFill}
                  errors={stepErrors}
                />
              )}

              {/* Step 3: Inventory & Storage Location */}
              {currentStep === 3 && (
                <StepInventory
                  formData={formData}
                  onInputChange={handleInputChange}
                  onAdjustQuantity={(delta) =>
                    setFormData((prev) => ({
                      ...prev,
                      quantity: Math.max(0, Number(prev.quantity || 0) + delta)
                    }))
                  }
                  locations={locations}
                  categories={categories}
                  packages={packages}
                  isLoadingOptions={isLoadingOptions}
                  barcodes={barcodes}
                  setBarcodes={setBarcodes}
                  barcodeInput={barcodeInput}
                  setBarcodeInput={setBarcodeInput}
                  handleBarcodeKeyDown={handleBarcodeKeyDown}
                  removeBarcode={removeBarcode}
                  onOpenScanner={() => setShowScanner(true)}
                  procedural={procedural}
                  tags={tags}
                  mainImage={mainImage}
                  existingMainImage={existingMainImage}
                  datasheet={datasheet}
                  existingDatasheet={existingDatasheet}
                  linkedDatasheetUrl={linkedDatasheetUrl}
                  additionalImagesCount={additionalImages.length}
                  additionalFilesCount={additionalFiles.length}
                  onJumpToStep={(step) => setCurrentStep(step)}
                  errors={stepErrors}
                />
              )}
            </>
          )}
        </div>
      </main>

      {/* Sticky Bottom Wizard Navigation Bar */}
      {!savedSuccessState && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3.5 shadow-lg">
          <div className="max-w-[1020px] mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={handlePrevStep}
                  className="flex items-center gap-2 h-11 px-5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
              ) : (
                <span className="text-xs font-medium text-slate-400 hidden sm:inline">
                  Step 1 of 3 — Identification & Basics
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {uploadProgress && (
                <div className="hidden sm:flex flex-col items-end gap-1 mr-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Uploading {uploadProgress.current} / {uploadProgress.total}
                  </div>
                  <div className="w-28 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {currentStep < 3 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="flex items-center gap-2 h-11 px-6 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20 hover:brightness-110 transition-all cursor-pointer"
                >
                  <span>Next: {STEPS[currentStep].shortTitle}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 h-11 px-6 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/25 hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{isEditMode ? "Updating..." : "Saving..."}</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>{isEditMode ? "Update Component" : "Save Component"}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Live Datasheet & Part Lookup Modal */}
      <DatasheetSearchModal
        isOpen={showDatasheetSearchModal}
        initialQuery={formData.name}
        onClose={() => setShowDatasheetSearchModal(false)}
        onSelectPart={applyCatalogPartToForm}
        onManualDatasheetUrl={handleManualDatasheetUrl}
      />

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4 text-amber-500">
              <div className="p-2 bg-amber-500/10 rounded-full">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Discard changes?</h3>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
              Are you sure you want to leave this page? You can keep your draft or discard it completely.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem(DRAFT_STORAGE_KEY);
                  navigate("/inventory");
                }}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20 cursor-pointer"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LCSC AI Classification Prompt Modal */}
      {lcscAiPromptData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4 text-primary">
              <div className="p-2 bg-primary/10 rounded-full">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Classify with AI?</h3>
                <p className="text-xs text-slate-500">Determine Keywords, Package & Category</p>
              </div>
            </div>
            <p className="text-slate-600 dark:text-slate-300 text-sm mb-4">
              Would you like to use AI to determine the best <strong>Keywords</strong>,{" "}
              <strong>Package</strong>, and <strong>Category</strong> for{" "}
              <strong>{lcscAiPromptData.name}</strong>
              {lcscAiPromptData.lcscPartNumber ? ` (${lcscAiPromptData.lcscPartNumber})` : ""}?
            </p>
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs space-y-1.5 mb-6">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500 font-semibold">Catalog Category:</span>
                <span className="text-slate-900 dark:text-white font-medium text-right">
                  {lcscAiPromptData.category}
                  {lcscAiPromptData.subcategory ? ` - ${lcscAiPromptData.subcategory}` : ""}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500 font-semibold">Catalog Footprint:</span>
                <span className="text-slate-900 dark:text-white font-mono text-right">
                  {lcscAiPromptData.package}
                </span>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setLcscAiPromptData(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                No, Skip AI
              </button>
              <button
                type="button"
                onClick={async () => {
                  const dataToClassify = lcscAiPromptData;
                  setLcscAiPromptData(null);
                  await runAiResearchAndApply({
                    componentName: dataToClassify.name,
                    lcscData: dataToClassify,
                    onlyClassification: true
                  });
                }}
                disabled={isAiFilling}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                Yes, Use AI
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Proposal Modal */}
      {aiProposal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4 text-primary">
              <div className="p-2 bg-primary/10 rounded-full">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">AI Suggestions</h3>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
              The AI suggested new options that don't exist in your database yet. You can review or edit them before creating:
            </p>

            <div className="space-y-4 mb-6">
              {(aiProposal.category !== undefined || aiProposal.subcategory !== undefined) && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary uppercase tracking-wider">
                      {aiProposal.isExistingCategoryName
                        ? "New Subcategory in Existing Category"
                        : "New Category & Subcategory"}
                    </span>
                    <input
                      type="checkbox"
                      checked={aiProposal.createCategory !== false}
                      onChange={(e) =>
                        setAiProposal((prev) =>
                          prev ? { ...prev, createCategory: e.target.checked } : null
                        )
                      }
                      className="w-4 h-4 text-primary rounded border-slate-300 focus:ring-primary cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
                      Category Name
                    </label>
                    <input
                      type="text"
                      value={aiProposal.category || ""}
                      onChange={(e) =>
                        setAiProposal((prev) => (prev ? { ...prev, category: e.target.value } : null))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-medium outline-none focus:border-primary"
                      placeholder="e.g. Passives"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
                      Subcategory
                    </label>
                    <input
                      type="text"
                      value={aiProposal.subcategory || ""}
                      onChange={(e) =>
                        setAiProposal((prev) =>
                          prev ? { ...prev, subcategory: e.target.value } : null
                        )
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-medium outline-none focus:border-primary"
                      placeholder="e.g. Capacitors"
                    />
                  </div>
                </div>
              )}
              {aiProposal.package !== undefined && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-primary uppercase tracking-wider">
                      New Package
                    </label>
                    <input
                      type="checkbox"
                      checked={aiProposal.createPackage !== false}
                      onChange={(e) =>
                        setAiProposal((prev) =>
                          prev ? { ...prev, createPackage: e.target.checked } : null
                        )
                      }
                      className="w-4 h-4 text-primary rounded border-slate-300 focus:ring-primary cursor-pointer"
                    />
                  </div>
                  <input
                    type="text"
                    value={aiProposal.package || ""}
                    onChange={(e) =>
                      setAiProposal((prev) => (prev ? { ...prev, package: e.target.value } : null))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-medium outline-none focus:border-primary"
                    placeholder="e.g. QFN-56"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setAiProposal(null)}
                disabled={isCreatingProposal}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Ignore
              </button>
              <button
                type="button"
                disabled={isCreatingProposal}
                onClick={async () => {
                  setIsCreatingProposal(true);
                  try {
                    let newCatId = formData.category;
                    let newPkgId = formData.pkg;
                    let newSubcat = formData.subcategory;

                    if (
                      aiProposal.createCategory !== false &&
                      (aiProposal.category?.trim() || aiProposal.subcategory?.trim())
                    ) {
                      const fallbackCat =
                        categories.find((c) => String(c.id) === String(formData.category))?.name ||
                        "General";
                      const targetCatName = (aiProposal.category || fallbackCat).trim();
                      const targetSubName = (aiProposal.subcategory || "").trim();

                      const existingPair = categories.find(
                        (c) =>
                          c.name.trim().toLowerCase() === targetCatName.toLowerCase() &&
                          (c.subcategory || "").trim().toLowerCase() === targetSubName.toLowerCase()
                      );

                      if (existingPair) {
                        newCatId = String(existingPair.id);
                        newSubcat = existingPair.subcategory || "";
                      } else if (
                        aiProposal.existingEmptyCategoryId &&
                        targetSubName &&
                        categories.some(
                          (c) =>
                            c.id === aiProposal.existingEmptyCategoryId &&
                            c.name.trim().toLowerCase() === targetCatName.toLowerCase() &&
                            (!c.subcategory || !c.subcategory.trim())
                        )
                      ) {
                        await directus.request(
                          updateItem("components_types", aiProposal.existingEmptyCategoryId, {
                            name: targetCatName,
                            subcategory: targetSubName
                          })
                        );
                        setCategories((prev) =>
                          prev.map((c) =>
                            c.id === aiProposal.existingEmptyCategoryId
                              ? { ...c, name: targetCatName, subcategory: targetSubName }
                              : c
                          )
                        );
                        newCatId = String(aiProposal.existingEmptyCategoryId);
                        newSubcat = targetSubName;
                      } else {
                        const catRes = (await directus.request(
                          createItem("components_types", {
                            name: targetCatName,
                            subcategory: targetSubName
                          })
                        )) as ComponentType;
                        newCatId = String(catRes.id);
                        newSubcat = targetSubName;
                        setCategories((prev) => [...prev, catRes]);
                      }
                    }

                    if (aiProposal.createPackage !== false && aiProposal.package?.trim()) {
                      const targetPkgName = aiProposal.package.trim();
                      const existingPkg = packages.find(
                        (p) => p.name.trim().toLowerCase() === targetPkgName.toLowerCase()
                      );
                      if (existingPkg) {
                        newPkgId = String(existingPkg.id);
                      } else {
                        const pkgRes = (await directus.request(
                          createItem("components_packages", { name: targetPkgName })
                        )) as ComponentPackage;
                        newPkgId = String(pkgRes.id);
                        setPackages((prev) => [...prev, pkgRes]);
                      }
                    }

                    setFormData((prev) => ({
                      ...prev,
                      category: newCatId,
                      subcategory: newSubcat,
                      pkg: newPkgId
                    }));

                    toast.success("Created and applied AI suggestions!");
                    setAiProposal(null);
                  } catch (error) {
                    console.error("Failed to create AI proposals", error);
                    toast.error("Failed to create new options");
                  } finally {
                    setIsCreatingProposal(false);
                  }
                }}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isCreatingProposal && <Loader2 className="w-4 h-4 animate-spin" />}
                Create & Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              {editingCategory ? "Edit Category" : "New Category"}
            </h3>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={modalName}
                  onChange={(e) => setModalName(e.target.value)}
                  className={`form-input w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-10 px-3 text-sm ${focusClasses}`}
                  placeholder="e.g. Microcontrollers"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Subcategory
                </label>
                <textarea
                  value={modalSubcategory}
                  onChange={(e) => setModalSubcategory(e.target.value)}
                  className={`form-input w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white p-3 text-sm min-h-[80px] resize-none ${focusClasses}`}
                  placeholder="e.g. SMD, Through-hole..."
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCategory}
                disabled={isModalSaving || !modalName.trim()}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:brightness-110 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
              >
                {isModalSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingCategory ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LCSC Import Modal */}
      {showLcscModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Import from LCSC</h3>
                  <p className="text-xs text-slate-500">Datasheet, footprint, pricing & specs</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLcscModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  LCSC Part Number or URL <span className="text-red-500">*</span>
                </label>
                <input
                  value={lcscSearchCode}
                  onChange={(e) => setLcscSearchCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleLcscImport(lcscSearchCode);
                    }
                  }}
                  className={`form-input w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-11 px-3 text-sm ${focusClasses}`}
                  placeholder="e.g. C2040, C25349, or paste LCSC link"
                  autoFocus
                />
                <p className="text-xs text-slate-400">
                  Try examples:{" "}
                  <button
                    type="button"
                    onClick={() => setLcscSearchCode("C2040")}
                    className="text-primary hover:underline"
                  >
                    C2040 (RP2040)
                  </button>
                  ,{" "}
                  <button
                    type="button"
                    onClick={() => setLcscSearchCode("C1525")}
                    className="text-primary hover:underline"
                  >
                    C1525 (Capacitor 0402)
                  </button>
                  ,{" "}
                  <button
                    type="button"
                    onClick={() => setLcscSearchCode("C25349")}
                    className="text-primary hover:underline"
                  >
                    C25349 (Resistor 1206)
                  </button>
                </p>
              </div>

              {lastLcscData && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs flex flex-col gap-1">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {lastLcscData.name} ({lastLcscData.manufacturer})
                  </span>
                  <span className="text-slate-500">
                    Package: {lastLcscData.package} • Stock: {lastLcscData.stock.toLocaleString()}
                  </span>
                  {lastLcscData.unitPrice && (
                    <span className="text-emerald-600 font-semibold">
                      ${lastLcscData.unitPrice.toFixed(4)} USD
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                type="button"
                onClick={() => setShowLcscModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleLcscImport(lcscSearchCode)}
                disabled={isLcscLoading || !lcscSearchCode.trim()}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
              >
                {isLcscLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Fetch & Auto-fill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Package Modal */}
      {showPackageModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              {editingPackage ? "Edit Package" : "New Package"}
            </h3>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={modalName}
                  onChange={(e) => setModalName(e.target.value)}
                  className={`form-input w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-10 px-3 text-sm ${focusClasses}`}
                  placeholder="e.g. DIP-28"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                type="button"
                onClick={() => setShowPackageModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePackage}
                disabled={isModalSaving || !modalName.trim()}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:brightness-110 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
              >
                {isModalSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingPackage ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Web Image Search Modal */}
      {showImageSearchModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-2xl w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                Search Web Images
              </h3>
              <button
                type="button"
                onClick={() => setShowImageSearchModal(null)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex gap-2 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  defaultValue={showImageSearchModal.query}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearchImages(e.currentTarget.value);
                  }}
                  placeholder="Search for images..."
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const input = document.querySelector(
                    'input[placeholder="Search for images..."]'
                  ) as HTMLInputElement;
                  if (input) handleSearchImages(input.value);
                }}
                disabled={isSearchingImages}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:brightness-110 transition-all disabled:opacity-50"
              >
                {isSearchingImages ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2">
              {isSearchingImages ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <div
                      key={n}
                      className="aspect-square rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse"
                    />
                  ))}
                </div>
              ) : searchResults.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {searchResults.map((result, idx) => (
                    <div
                      key={idx}
                      onClick={() => selectWebImage(result.url)}
                      className="group relative aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 cursor-pointer hover:border-primary transition-all"
                    >
                      <img
                        src={result.url}
                        alt={result.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white text-[10px] font-bold uppercase tracking-widest bg-primary px-2 py-1 rounded">
                          Select
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
                  <p>Enter a search term to find images</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Camera Barcode Scanner Modal */}
      {showScanner && (
        <BarcodeScanner
          onScan={(decodedText) => {
            const parsed = parseLcscBagScan(decodedText);
            const newBarcode = parsed.internalBagBarcode || parsed.rawNormalized;
            if (newBarcode && !barcodes.includes(newBarcode)) {
              setBarcodes((prev) => [...prev, newBarcode]);
              toast.success(`Scanned: ${newBarcode}`);
            }
            if (parsed.lcscPartNumber) {
              setFormData((prev) => ({
                ...prev,
                packetReference: prev.packetReference || parsed.lcscPartNumber || ""
              }));
            }
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* LCSC Order CSV Batch Import Modal */}
      <LcscOrderImportModal
        isOpen={showLcscOrderImportModal}
        onClose={() => setShowLcscOrderImportModal(false)}
        categories={categories}
        setCategories={setCategories}
        packages={packages}
        setPackages={setPackages}
        locations={locations}
        defaultLocationId={
          formData.storageLocation || (locations.length > 0 ? String(locations[0].id) : "")
        }
        enableAiSuggestions={settings.enableAiSuggestions}
      />
    </>
  );
}
