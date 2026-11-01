/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import ScrollToTop from "./components/ScrollToTop";
import { Dashboard } from "./pages/Dashboard";
import { Inventory } from "./pages/Inventory";
import { ComponentDetails } from "./pages/ComponentDetails";
import { Categories } from "./pages/Categories";
import { AddComponent } from "./pages/AddComponent";
import { BatchBarcodes } from "./pages/BatchBarcodes";
import { Boxes } from "./pages/Boxes";
import { Settings } from "./pages/Settings";
import { useEffect, useState } from "react";
import { ServerCrash, RefreshCw } from "lucide-react";

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isBackendDown, setIsBackendDown] = useState(false);

  useEffect(() => {
    const handleBackendError = () => {
      setIsBackendDown(true);
    };
    
    window.addEventListener('directus-error', handleBackendError);
    return () => window.removeEventListener('directus-error', handleBackendError);
  }, []);

  useEffect(() => {
    const path = location.pathname;
    let pageName = "Dashboard";
    if (path === "/") pageName = "Dashboard";
    else if (path.startsWith("/inventory/add")) pageName = "Add Component";
    else if (path.startsWith("/inventory/edit")) pageName = "Edit Component";
    else if (path.startsWith("/inventory")) pageName = "Inventory";
    else if (path.startsWith("/categories")) pageName = "Categories";
    else if (path.startsWith("/boxes")) pageName = "Boxes";
    else if (path.startsWith("/barcodes")) pageName = "Batch Barcodes";
    else if (path.startsWith("/settings")) pageName = "Settings";
    
    document.title = `ElectroStock - ${pageName}`;
  }, [location]);

  useEffect(() => {
    let buffer = "";
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      const currentTime = Date.now();
      const char = e.key;

      // If time between keystrokes is too long, reset buffer (manual typing)
      // Barcode scanners usually send chars within 20-50ms
      if (currentTime - lastKeyTime > 100) {
        buffer = "";
      }

      lastKeyTime = currentTime;

      if (char === "Enter") {
        // If buffer has content and was typed fast (implied by not being reset)
        if (buffer.length > 2) {
          // Check if user is NOT focusing on an input
          const activeTag = document.activeElement?.tagName;
          const isAddOrEditPage = window.location.pathname.includes('/inventory/add') || window.location.pathname.includes('/inventory/edit');
          
          if (activeTag !== "INPUT" && activeTag !== "TEXTAREA" && !isAddOrEditPage) {
             navigate(`/inventory?q=${encodeURIComponent(buffer)}`);
          }
        }
        buffer = "";
      } else if (char.length === 1) {
        // Only append printable characters
        buffer += char;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  if (isBackendDown) {
    return (
      <div className="relative flex h-auto min-h-screen w-full flex-col items-center justify-center bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display p-6 text-center">
        <ServerCrash className="w-20 h-20 text-red-500 mb-6" />
        <h1 className="text-4xl font-black mb-4">Backend Inaccessible</h1>
        <p className="text-lg text-slate-500 dark:text-slate-400 max-w-md mb-8">
          L'application n'arrive pas à se connecter au serveur Directus. Veuillez vérifier que la base de données est bien en ligne.
        </p>
        <button 
          onClick={() => window.location.reload()} 
          className="flex items-center gap-2 px-8 py-4 bg-primary text-white font-bold rounded-xl hover:brightness-110 transition-all shadow-lg shadow-primary/20"
        >
          <RefreshCw className="w-5 h-5" /> Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex h-auto min-h-screen w-full flex-col overflow-x-hidden bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display transition-colors duration-300">
      <ScrollToTop />
      <Toaster position="top-right" richColors offset="80px" toastOptions={{ className: 'mt-16 sm:mt-0' }} />
      <Header />
      <main className="flex-1 pt-[72px]">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/inventory/add" element={<AddComponent />} />
          <Route path="/inventory/edit/:id" element={<AddComponent />} />
          <Route path="/inventory/:id" element={<ComponentDetails />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/boxes" element={<Boxes />} />
          <Route path="/barcodes" element={<BatchBarcodes />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}
