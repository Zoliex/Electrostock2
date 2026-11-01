import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Save, Server, AlertTriangle, Loader2, Settings as SettingsIcon, Database, Bot } from "lucide-react";
import { toast } from "sonner";

export function Settings() {
  const [settings, setSettings] = useState({
    directusUrl: "",
    criticalStockThreshold: 10,
    enableAiSuggestions: true
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem("electrostock-theme") || "modern");

  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.json())
      .then(data => {
        setSettings(data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error(err);
        toast.error("Failed to load settings");
        setIsLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Settings saved successfully. Restarting app...");
      
      // Call restart endpoint
      await fetch("/api/restart", { method: "POST" });
    } catch (error) {
      console.error(error);
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <motion.main 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex-1 max-w-4xl mx-auto w-full p-4 lg:p-8"
    >
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
          <SettingsIcon className="w-8 h-8 text-primary" />
          Settings
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2">Configure application preferences and integrations.</p>
      </div>

      <div className="space-y-6">
        {/* Appearance Settings */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-indigo-500" />
              Appearance
            </h2>
            <p className="text-sm text-slate-500 mt-1">Customize the look and feel of the application.</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-2 max-w-sm">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Theme</label>
              <select
                value={theme}
                onChange={(e) => {
                  const newTheme = e.target.value;
                  setTheme(newTheme);
                  localStorage.setItem("electrostock-theme", newTheme);
                  document.documentElement.setAttribute("data-theme", newTheme);
                }}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none appearance-none"
              >
                <option value="modern">Modern (Default)</option>
                <option value="retro">Retro</option>
                <option value="neon">Neon</option>
              </select>
            </div>
          </div>
        </section>

        {/* Database Settings */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-500" />
              Database Connection
            </h2>
            <p className="text-sm text-slate-500 mt-1">Configure your Directus backend connection.</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Directus URL</label>
              <input 
                type="url"
                value={settings.directusUrl}
                onChange={e => setSettings({...settings, directusUrl: e.target.value})}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                placeholder="https://your-directus-instance.com"
              />
              <p className="text-xs text-amber-600 dark:text-amber-500 flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3 h-3" />
                Changing this requires a page reload to take effect.
              </p>
            </div>
          </div>
        </section>

        {/* Inventory Settings */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Server className="w-5 h-5 text-emerald-500" />
              Inventory Preferences
            </h2>
            <p className="text-sm text-slate-500 mt-1">Set thresholds and display preferences.</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Critical Stock Threshold</label>
                <input 
                  type="number"
                  min="0"
                  value={settings.criticalStockThreshold}
                  onChange={e => setSettings({...settings, criticalStockThreshold: Number(e.target.value)})}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
                <p className="text-xs text-slate-500 mt-1">Items below this quantity will be flagged as low stock.</p>
              </div>
            </div>
          </div>
        </section>

        {/* AI Settings */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-500" />
              AI Assistant
            </h2>
            <p className="text-sm text-slate-500 mt-1">Configure AI features and suggestions.</p>
          </div>
          <div className="p-6 space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox"
                checked={settings.enableAiSuggestions}
                onChange={e => setSettings({...settings, enableAiSuggestions: e.target.checked})}
                className="w-5 h-5 text-primary bg-slate-50 border-slate-300 rounded focus:ring-primary dark:bg-slate-900 dark:border-slate-700"
              />
              <div>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 block">Enable AI Suggestions</span>
                <span className="text-xs text-slate-500">Allow AI to suggest categories and packages when adding components.</span>
              </div>
            </label>
          </div>
        </section>

        <div className="flex justify-end pt-4">
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {isSaving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </motion.main>
  );
}
