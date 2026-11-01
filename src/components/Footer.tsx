import { Cpu, Globe, AtSign, Rss } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 text-primary mb-4">
              <Cpu className="w-6 h-6" />
              <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">ElectroStock</h2>
            </div>
            <p className="text-slate-500 dark:text-slate-400 max-w-sm">
              The professional standard for electronic component inventory management and tracking.
            </p>
          </div>
        </div>
        <div className="pt-8 border-t border-slate-200 dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">© 2025-{new Date().getFullYear()} ElectroStock Inventory Management. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
