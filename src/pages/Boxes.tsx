import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Loader2, 
  Warehouse,
  X,
  Save
} from "lucide-react";
import { toast } from "sonner";
import { directus, Box } from "../lib/directus";
import { readItems, createItem, updateItem, deleteItem } from "@directus/sdk";

export function Boxes() {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingBox, setEditingBox] = useState<Box | null>(null);
  const [deletingBox, setDeletingBox] = useState<Box | null>(null);
  
  // Form State
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    unique_id: ""
  });

  const fetchBoxes = async () => {
    try {
      setIsLoading(true);
      const data = await directus.request(readItems('boxes', {
        sort: ['name'],
        limit: -1
      }));
      setBoxes(data as Box[]);
    } catch (error) {
      console.error("Error fetching boxes:", error);
      toast.error("Failed to load boxes");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBoxes();
  }, []);

  const handleOpenModal = (box?: Box) => {
    if (box) {
      setEditingBox(box);
      setFormData({
        name: box.name,
        description: box.description || "",
        unique_id: box.unique_id || ""
      });
    } else {
      setEditingBox(null);
      setFormData({
        name: "",
        description: "",
        unique_id: ""
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingBox(null);
    setFormData({ name: "", description: "", unique_id: "" });
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast.error("Name is required");
      return;
    }

    try {
      setIsSaving(true);
      
      if (editingBox) {
        await directus.request(updateItem('boxes', editingBox.id, formData));
        toast.success("Box updated successfully");
      } else {
        await directus.request(createItem('boxes', formData));
        toast.success("Box created successfully");
      }
      
      await fetchBoxes();
      handleCloseModal();
    } catch (error) {
      console.error("Error saving box:", error);
      toast.error("Failed to save box");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = (box: Box) => {
    setDeletingBox(box);
  };

  const handleDelete = async () => {
    if (!deletingBox) return;

    try {
      await directus.request(deleteItem('boxes', deletingBox.id));
      toast.success("Box deleted successfully");
      await fetchBoxes();
      setDeletingBox(null);
    } catch (error) {
      console.error("Error deleting box:", error);
      toast.error("Failed to delete box");
    }
  };

  const filteredBoxes = boxes.filter(box => 
    box.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (box.description && box.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (box.unique_id && box.unique_id.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <motion.main 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex-1 max-w-7xl mx-auto w-full px-6 py-8"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-black tracking-tight">Storage Boxes</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Manage your physical storage locations and containers.
          </p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-semibold text-sm hover:brightness-110 transition-all shadow-lg shadow-primary/20"
        >
          <Plus className="w-5 h-5" /> New Box
        </button>
      </div>

      {/* Search */}
      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search boxes..."
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredBoxes.length === 0 ? (
          <div className="col-span-full text-center py-12 text-slate-500">
            No boxes found.
          </div>
        ) : (
          filteredBoxes.map(box => (
            <div key={box.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:border-primary/50 transition-colors group">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                    <Warehouse className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">{box.name}</h3>
                    <p className="text-xs font-mono text-slate-400">{box.unique_id || "No ID"}</p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleOpenModal(box)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 hover:text-primary transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => confirmDelete(box)}
                    className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-slate-500 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {box.description && (
                <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
                  {box.description}
                </p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deletingBox && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Delete Box?</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
              Are you sure you want to delete <strong>{deletingBox.name}</strong>?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeletingBox(null)}
                className="px-4 py-2 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-xl font-bold">{editingBox ? "Edit Box" : "New Box"}</h2>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Box Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  placeholder="e.g. Storage Bin A1"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Unique ID
                </label>
                <input
                  value={formData.unique_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, unique_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-mono"
                  placeholder="e.g. BOX-001"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none min-h-[100px]"
                  placeholder="Optional description..."
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-bold text-sm hover:brightness-110 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingBox ? "Update Box" : "Create Box"}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.main>
  );
}
