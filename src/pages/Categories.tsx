import { Plus, Cpu, Activity, CircuitBoard, Sun, Zap, Layers, ArrowRight, MoreVertical, PlusCircle, Loader2, Package, Edit2, Trash2, X, Save, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { directus, Component, ComponentType, getFileUrl } from "../lib/directus";
import { readItems, createItem, updateItem, deleteItem } from "@directus/sdk";
import { toast } from "sonner";

export function Categories() {
  const [categories, setCategories] = useState<{
    id: number;
    title: string;
    subcategory: string;
    count: number;
    image: string | null;
  }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ComponentType | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    subcategory: ""
  });

  const [deletingCategory, setDeletingCategory] = useState<{ id: number, title: string } | null>(null);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [fetchedComponents, fetchedTypes] = await Promise.all([
        directus.request(readItems('components', {
          fields: ['type', 'main_image'],
          limit: -1
        })),
        directus.request(readItems('components_types', {
          limit: -1,
          sort: ['name']
        }))
      ]);

      const components = fetchedComponents as Component[];
      const types = fetchedTypes as ComponentType[];

      const stats = types.map(type => {
        const typeComponents = components.filter(c => 
          (typeof c.type === 'object' && c.type !== null && c.type.id === type.id) ||
          (typeof c.type === 'number' && c.type === type.id)
        );
        
        // Find first component with an image
        const firstImageComp = typeComponents.find(c => c.main_image);
        
        return {
          id: type.id,
          title: type.name,
          subcategory: type.subcategory || "",
          count: typeComponents.length,
          image: firstImageComp ? getFileUrl(firstImageComp.main_image) : null
        };
      });

      setCategories(stats);
    } catch (error) {
      console.error("Error fetching categories:", error);
      toast.error("Failed to load categories");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenModal = (category?: { id: number, title: string, subcategory: string }) => {
    if (category) {
      setEditingCategory({ id: category.id, name: category.title, subcategory: category.subcategory });
      setFormData({
        name: category.title,
        subcategory: category.subcategory || ""
      });
    } else {
      setEditingCategory(null);
      setFormData({
        name: "",
        subcategory: ""
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCategory(null);
    setFormData({ name: "", subcategory: "" });
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast.error("Category name is required");
      return;
    }

    try {
      setIsSaving(true);
      
      if (editingCategory) {
        await directus.request(updateItem('components_types', editingCategory.id, formData));
        toast.success("Category updated successfully");
      } else {
        await directus.request(createItem('components_types', formData));
        toast.success("Category created successfully");
      }
      
      await fetchData();
      handleCloseModal();
    } catch (error) {
      console.error("Error saving category:", error);
      toast.error("Failed to save category");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = (category: { id: number, title: string }) => {
    setDeletingCategory(category);
  };

  const handleDelete = async () => {
    if (!deletingCategory) return;

    try {
      await directus.request(deleteItem('components_types', deletingCategory.id));
      toast.success("Category deleted successfully");
      await fetchData();
      setDeletingCategory(null);
    } catch (error) {
      console.error("Error deleting category:", error);
      toast.error("Failed to delete category");
    }
  };

  const [searchQuery, setSearchQuery] = useState("");

  const filteredCategories = categories.filter(cat => 
    cat.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cat.subcategory.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <motion.main 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8"
    >
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Component Categories</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage and organize your electronics inventory by type.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
        >
          <Plus className="w-5 h-5" />
          New Category
        </button>
      </div>

      {/* Search Bar */}
      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search categories..."
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
        />
      </div>

      {/* Categories Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredCategories.map((cat) => (
            <div key={cat.id} className="group relative flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 hover:border-primary/50 dark:hover:border-primary/50 transition-all shadow-sm">
              <div className="aspect-square w-full rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden mb-4 relative">
                <div className="absolute inset-0 flex items-center justify-center text-primary/40 group-hover:scale-110 transition-transform duration-300 z-10">
                  <Layers className="w-16 h-16" />
                </div>
                {cat.image && (
                  <img alt={cat.title} className="w-full h-full object-cover mix-blend-overlay opacity-40 relative z-0" src={cat.image} />
                )}
                
                {/* Actions Overlay */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                  <button 
                    onClick={(e) => { e.preventDefault(); handleOpenModal(cat); }}
                    className="p-2 bg-white/90 dark:bg-slate-900/90 hover:bg-white dark:hover:bg-slate-800 rounded-lg text-slate-500 hover:text-primary transition-colors shadow-sm"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={(e) => { e.preventDefault(); confirmDelete(cat); }}
                    className="p-2 bg-white/90 dark:bg-slate-900/90 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-slate-500 hover:text-red-500 transition-colors shadow-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex flex-col flex-1">
                <div className="mb-1">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">{cat.title}</h3>
                  {cat.subcategory && (
                    <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500">
                      {cat.subcategory}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{cat.count} items in stock</p>
                <div className="mt-auto pt-6 flex items-center justify-between">
                  <Link to={`/inventory?category=${cat.id}`} className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">
                    View Components
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          ))}

          {/* Add New Category Empty State/Card */}
          <button 
            onClick={() => handleOpenModal()}
            className="flex flex-col items-center justify-center bg-slate-100/50 dark:bg-slate-800/20 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-5 hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-colors cursor-pointer min-h-[340px] w-full text-left"
          >
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
              <PlusCircle className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Create New</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center mt-2 px-4">Add a new category to expand your component library.</p>
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingCategory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Delete Category?</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
              Are you sure you want to delete <strong>{deletingCategory.title}</strong>? Components associated with it might lose their categorization.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeletingCategory(null)}
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
              <h2 className="text-xl font-bold">{editingCategory ? "Edit Category" : "New Category"}</h2>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Category Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  placeholder="e.g. Resistors"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Subcategory
                </label>
                <input
                  value={formData.subcategory}
                  onChange={(e) => setFormData(prev => ({ ...prev, subcategory: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  placeholder="e.g. Through-hole, SMD, etc."
                />
                <p className="text-xs text-slate-500 mt-1">Used to group categories in filters.</p>
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
                {editingCategory ? "Update Category" : "Create Category"}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.main>
  );
}
