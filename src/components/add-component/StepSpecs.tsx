import React, { useRef, useState } from "react";
import {
  Paperclip,
  Image as ImageIcon,
  FileText,
  UploadCloud,
  FilePlus,
  Globe,
  Sparkles,
  Loader2,
  X,
  Search,
  Link2,
  CheckCircle2,
  ExternalLink,
  AlertCircle
} from "lucide-react";
import MDEditor from "@uiw/react-md-editor";
import { getFileUrl } from "../../lib/directus";
import {
  ComponentFormData,
  ProceduralState,
  StepValidationErrors,
  focusClasses
} from "./types";
import {
  ResistorVisual,
  InductorVisual,
  TransistorVisual,
  CapacitorVisual
} from "./ProceduralVisuals";

interface StepSpecsProps {
  formData: ComponentFormData;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  setDescription: (val: string) => void;
  previewMode: boolean;
  setPreviewMode: (val: boolean) => void;
  procedural: ProceduralState;
  mainImage: File | null;
  setMainImage: React.Dispatch<React.SetStateAction<File | null>>;
  existingMainImage: string | null;
  datasheet: File | null;
  setDatasheet: React.Dispatch<React.SetStateAction<File | null>>;
  existingDatasheet: string | null;
  linkedDatasheetUrl: string;
  onAttachDatasheetUrl: (url: string) => Promise<void>;
  additionalImages: File[];
  setAdditionalImages: React.Dispatch<React.SetStateAction<File[]>>;
  additionalFiles: File[];
  setAdditionalFiles: React.Dispatch<React.SetStateAction<File[]>>;
  isLcscLoading: boolean;
  isAiFilling: boolean;
  enableAiSuggestions: boolean;
  onAutoFillAssets: () => void;
  onOpenDatasheetSearch: () => void;
  onOpenImageSearch: (type: "main" | "additional" | "datasheet", query: string) => void;
  onAiFill: () => void;
  errors: StepValidationErrors;
}

export const StepSpecs: React.FC<StepSpecsProps> = ({
  formData,
  onInputChange,
  setDescription,
  previewMode,
  setPreviewMode,
  procedural,
  mainImage,
  setMainImage,
  existingMainImage,
  datasheet,
  setDatasheet,
  existingDatasheet,
  linkedDatasheetUrl,
  onAttachDatasheetUrl,
  additionalImages,
  setAdditionalImages,
  additionalFiles,
  setAdditionalFiles,
  isLcscLoading,
  isAiFilling,
  enableAiSuggestions,
  onAutoFillAssets,
  onOpenDatasheetSearch,
  onOpenImageSearch,
  onAiFill,
  errors
}) => {
  const mainImageRef = useRef<HTMLInputElement>(null);
  const datasheetRef = useRef<HTMLInputElement>(null);
  const additionalImagesRef = useRef<HTMLInputElement>(null);
  const additionalFilesRef = useRef<HTMLInputElement>(null);

  const [manualDatasheetInput, setManualDatasheetInput] = useState(linkedDatasheetUrl || "");
  const [isAttachingUrl, setIsAttachingUrl] = useState(false);

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
    isBatchMode
  } = procedural;

  const handleSingleFile = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<File | null>>
  ) => {
    if (e.target.files && e.target.files.length > 0) {
      setter(e.target.files[0]);
    }
  };

  const handleMultipleFiles = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<File[]>>
  ) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setter((prev) => [...prev, ...newFiles]);
    }
    e.target.value = "";
  };

  const removeMultipleFile = (
    index: number,
    setter: React.Dispatch<React.SetStateAction<File[]>>
  ) => {
    setter((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAttachUrlClick = async () => {
    const trimmed = manualDatasheetInput.trim();
    if (!trimmed) return;
    setIsAttachingUrl(true);
    try {
      await onAttachDatasheetUrl(trimmed);
    } finally {
      setIsAttachingUrl(false);
    }
  };

  const insertSpecTemplate = () => {
    const template = `## ${formData.name || "Component Overview"}\n\n### Key Features\n- Operating Voltage: \n- Package / Footprint: \n- Temperature Range: \n\n### Pinout & Application Notes\n- `;
    setDescription(formData.description ? `${formData.description}\n\n${template}` : template);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Technical Specifications & Markdown Description */}
      <section className="bg-white dark:bg-slate-900/60 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-4">
          <div className="flex items-center gap-2.5 text-primary">
            <div className="p-2 rounded-xl bg-primary/10">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Step 2: Specifications & Datasheet
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Document technical specs, attach the component datasheet PDF, and upload product photos
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={insertSpecTemplate}
              className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              + Spec Template
            </button>
            {enableAiSuggestions && (
              <button
                type="button"
                onClick={onAiFill}
                disabled={isAiFilling || !formData.name.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all disabled:opacity-50 text-xs font-bold cursor-pointer"
              >
                {isAiFilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>Generate Specs with AI</span>
              </button>
            )}
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setPreviewMode(false)}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                  !previewMode
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                Write
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode(true)}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                  previewMode
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                Preview
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="component-description-textarea" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Description & Technical Specifications <span className="text-red-500">*</span>
          </label>
          <div
            className={`border ${
              errors.description ? "border-red-500 ring-2 ring-red-500/10" : "border-slate-200 dark:border-slate-700"
            } rounded-xl overflow-hidden focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/20 transition-all bg-white dark:bg-slate-900 min-h-[210px]`}
          >
            {!previewMode ? (
              <textarea
                id="component-description-textarea"
                name="description"
                value={formData.description}
                onChange={onInputChange}
                className="w-full h-full min-h-[210px] p-4 bg-transparent border-none focus:ring-0 text-slate-900 dark:text-white text-sm resize-y outline-none font-mono"
                placeholder="Enter component specifications, electrical ratings, pinout, and technical notes... (Markdown supported)"
              />
            ) : (
              <div className="p-4 prose dark:prose-invert max-w-none min-h-[210px] text-sm [&_table]:w-full [&_table]:border-collapse [&_th]:bg-slate-100 dark:[&_th]:bg-slate-800 [&_th]:text-slate-800 dark:[&_th]:text-slate-200 [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2 [&_td]:border-t [&_td]:border-slate-200 dark:[&_td]:border-slate-800 [&_tr]:bg-transparent!">
                {formData.description ? (
                  <MDEditor.Markdown
                    source={formData.description}
                    style={{ backgroundColor: "transparent", color: "inherit" }}
                  />
                ) : (
                  <p className="text-slate-400 italic">Nothing to preview...</p>
                )}
              </div>
            )}
          </div>
          {errors.description && (
            <p className="text-xs text-red-500 flex items-center gap-1 font-medium mt-0.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {errors.description}
            </p>
          )}
        </div>
      </section>

      {/* Assets & Documentation */}
      <section className="bg-white dark:bg-slate-900/60 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-primary">
            <Paperclip className="w-5 h-5" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Assets & Documentation</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenDatasheetSearch}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white transition-all text-xs font-bold border border-blue-500/20 cursor-pointer"
              title="Search distributor catalog for datasheet PDF and part specs"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Lookup Datasheet & Part</span>
            </button>
            <button
              type="button"
              onClick={onAutoFillAssets}
              disabled={isLcscLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white transition-all text-xs font-bold border border-emerald-500/20 shadow-sm cursor-pointer"
              title="Automatically fill image, datasheet, photos, and documentation"
            >
              {isLcscLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>Auto-Fill All Assets</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Main Image */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Main Image <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => onOpenImageSearch("main", formData.name)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-primary hover:text-white transition-all border border-slate-200 dark:border-slate-700 hover:border-primary cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Search Web</span>
              </button>
            </div>

            {isResistor ? (
              <ResistorVisual
                value={isBatchMode ? "Batch Mode" : resistorValue}
                unit={resistorUnit}
                tolerance={tolerance}
                tempCo={tempCo}
                bandCount={bandCount}
              />
            ) : isInductor ? (
              <InductorVisual
                value={isBatchMode ? "Batch Mode" : inductanceValue}
                unit={inductorUnit}
                tolerance={tolerance}
              />
            ) : isTransistor ? (
              <TransistorVisual value={isBatchMode ? "Batch Mode" : transistorValue} />
            ) : isCapacitor ? (
              <CapacitorVisual
                value={isBatchMode ? "Batch Mode" : capacitorValue}
                unit={capacitorUnit}
                type={capacitorType}
              />
            ) : (
              <div
                onClick={() => mainImageRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed ${
                  errors.mainImage
                    ? "border-red-500 bg-red-50/20 dark:bg-red-950/10"
                    : "border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"
                } p-6 hover:border-primary hover:bg-primary/5 transition-all group cursor-pointer min-h-[160px]`}
              >
                {mainImage ? (
                  <div className="flex flex-col items-center text-primary w-full">
                    <img
                      src={URL.createObjectURL(mainImage)}
                      alt="Main preview"
                      className="w-full h-32 object-contain rounded-lg mb-2"
                    />
                    <p className="text-sm font-bold text-center truncate w-full px-4">{mainImage.name}</p>
                    <p className="text-xs opacity-70 mt-1">Click to replace</p>
                  </div>
                ) : existingMainImage ? (
                  <div className="flex flex-col items-center text-primary w-full">
                    <img
                      src={getFileUrl(existingMainImage)}
                      alt="Existing Main"
                      className="w-full h-32 object-contain rounded-lg mb-2"
                    />
                    <p className="text-sm font-bold text-center truncate w-full px-4">Current Image</p>
                    <p className="text-xs opacity-70 mt-1">Click to replace</p>
                  </div>
                ) : (
                  <>
                    <ImageIcon className="w-8 h-8 text-slate-400 group-hover:text-primary transition-colors" />
                    <div className="text-center">
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-primary transition-colors">
                        Upload Main Image
                      </p>
                      <p className="text-xs text-slate-500 mt-1">PNG, JPG up to 5MB</p>
                    </div>
                  </>
                )}
              </div>
            )}
            <input
              type="file"
              hidden
              ref={mainImageRef}
              accept="image/*"
              onChange={(e) => handleSingleFile(e, setMainImage)}
            />
            {errors.mainImage && (
              <p className="text-xs text-red-500 flex items-center gap-1 font-medium">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {errors.mainImage}
              </p>
            )}
          </div>

          {/* Datasheet (PDF/Image) + Live Lookup & Manual URL Fallback */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Datasheet (PDF/Image)
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onOpenDatasheetSearch}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                >
                  <Search className="w-3 h-3" />
                  <span>Lookup PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenImageSearch("datasheet", `${formData.name} datasheet`)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-primary hover:text-white transition-all border border-slate-200 dark:border-slate-700 hover:border-primary text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                >
                  <Globe className="w-3 h-3" />
                  <span>Search Web</span>
                </button>
              </div>
            </div>

            <div
              onClick={() => datasheetRef.current?.click()}
              className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-6 hover:border-primary hover:bg-primary/5 transition-all group cursor-pointer min-h-[160px]"
            >
              {datasheet ? (
                <div className="flex flex-col items-center text-primary w-full">
                  {datasheet.type.startsWith("image/") ? (
                    <img
                      src={URL.createObjectURL(datasheet)}
                      alt="Datasheet preview"
                      className="w-full h-32 object-contain rounded-lg mb-2"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center w-full h-32 bg-red-50 dark:bg-red-900/10 rounded-lg mb-2 border border-red-100 dark:border-red-900/30">
                      <FileText className="w-10 h-10 text-red-500 mb-2" />
                      <span className="text-xs font-bold text-red-600 dark:text-red-400">PDF Datasheet Attached</span>
                      <span className="text-[10px] text-red-500/70">
                        {(datasheet.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                  )}
                  <p className="text-sm font-bold text-center truncate w-full px-4">{datasheet.name}</p>
                  <p className="text-xs opacity-70 mt-1">Click to replace</p>
                </div>
              ) : existingDatasheet ? (
                <div className="flex flex-col items-center text-primary w-full">
                  <div className="flex flex-col items-center justify-center w-full h-32 bg-slate-100 dark:bg-slate-800 rounded-lg mb-2 border border-slate-200 dark:border-slate-700">
                    <FileText className="w-10 h-10 text-slate-500 mb-2" />
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Current Datasheet</span>
                  </div>
                  <p className="text-xs opacity-70 mt-1">Click to replace</p>
                </div>
              ) : (
                <>
                  <FileText className="w-8 h-8 text-slate-400 group-hover:text-primary transition-colors" />
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-primary transition-colors">
                      Upload Datasheet
                    </p>
                    <p className="text-xs text-slate-500 mt-1">PDF or Image (or use Lookup PDF above)</p>
                  </div>
                </>
              )}
            </div>
            <input
              type="file"
              hidden
              ref={datasheetRef}
              accept=".pdf,image/*"
              onChange={(e) => handleSingleFile(e, setDatasheet)}
            />

            {/* Direct Datasheet PDF URL Fallback Input */}
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span className="flex items-center gap-1 font-medium">
                  <Link2 className="w-3 h-3 text-primary" />
                  Direct Datasheet PDF URL (Fallback):
                </span>
                {linkedDatasheetUrl && (
                  <a
                    href={linkedDatasheetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline font-semibold"
                  >
                    <span>Open Linked PDF</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
              <div className="flex gap-1.5">
                <input
                  type="url"
                  value={manualDatasheetInput}
                  onChange={(e) => setManualDatasheetInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAttachUrlClick();
                    }
                  }}
                  placeholder="Paste datasheet PDF URL (https://.../datasheet.pdf)"
                  className={`flex-1 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs ${focusClasses}`}
                />
                <button
                  type="button"
                  onClick={handleAttachUrlClick}
                  disabled={isAttachingUrl || !manualDatasheetInput.trim()}
                  className="px-3 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-primary hover:text-white text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-50 flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  {isAttachingUrl ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>Attach</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Images & Additional Files */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* Additional Images */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Additional Images</label>
            <div
              onClick={() => additionalImagesRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 hover:border-primary hover:bg-primary/5 transition-all group cursor-pointer"
            >
              <UploadCloud className="w-6 h-6 text-slate-400 group-hover:text-primary transition-colors" />
              <div className="text-center">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-primary transition-colors">
                  Add More Images
                </p>
                <p className="text-xs text-slate-500">Select multiple files</p>
              </div>
            </div>
            <input
              type="file"
              hidden
              multiple
              ref={additionalImagesRef}
              accept="image/*"
              onChange={(e) => handleMultipleFiles(e, setAdditionalImages)}
            />

            {additionalImages.length > 0 && (
              <div className="flex flex-col gap-2 mt-1 max-h-36 overflow-y-auto pr-1">
                {additionalImages.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={`Preview ${idx}`}
                        className="w-8 h-8 object-cover rounded shrink-0 border border-slate-200 dark:border-slate-700"
                      />
                      <span className="text-xs truncate">{file.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeMultipleFile(idx, setAdditionalImages);
                      }}
                      className="text-slate-400 hover:text-red-500 p-1 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Additional Files */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Additional Files</label>
            <div
              onClick={() => additionalFilesRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 hover:border-primary hover:bg-primary/5 transition-all group cursor-pointer"
            >
              <FilePlus className="w-6 h-6 text-slate-400 group-hover:text-primary transition-colors" />
              <div className="text-center">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-primary transition-colors">
                  Add More Documents
                </p>
                <p className="text-xs text-slate-500">CAD, Footprint SVG, ZIP, TXT, etc.</p>
              </div>
            </div>
            <input
              type="file"
              hidden
              multiple
              ref={additionalFilesRef}
              onChange={(e) => handleMultipleFiles(e, setAdditionalFiles)}
            />

            {additionalFiles.length > 0 && (
              <div className="flex flex-col gap-2 mt-1 max-h-36 overflow-y-auto pr-1">
                {additionalFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="text-xs truncate">{file.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeMultipleFile(idx, setAdditionalFiles);
                      }}
                      className="text-slate-400 hover:text-red-500 p-1 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Reference URL */}
        <div className="pt-2">
          <label htmlFor="component-reference-url" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Reference / Product URL
          </label>
          <div className="mt-1.5 flex rounded-xl shadow-sm focus-within:ring-4 focus-within:ring-primary/20 focus-within:border-primary transition-all border border-slate-200 dark:border-slate-700 overflow-hidden">
            <input
              id="component-reference-url"
              name="referenceUrl"
              value={formData.referenceUrl}
              onChange={onInputChange}
              className="form-input flex-1 block w-full border-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-0 text-sm h-11 px-4 outline-none"
              placeholder="https://www.lcsc.com/product-detail/... or https://www.mouser.com/..."
              type="text"
            />
          </div>
        </div>
      </section>
    </div>
  );
};
