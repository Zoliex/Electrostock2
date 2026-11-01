import { Search, Cpu, Menu, X, ChevronDown, Camera } from "lucide-react";
import { Link, useLocation, useSearchParams, useNavigate } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import { cn } from "../lib/utils";
import { BarcodeScanner } from "./BarcodeScanner";

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get("q") || "";
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMoreDropdownOpen, setIsMoreDropdownOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const mainNavLinks = [
    { name: "Dashboard", path: "/" },
    { name: "Inventory", path: "/inventory" },
  ];

  const moreNavLinks = [
    { name: "Categories", path: "/categories" },
    { name: "Boxes", path: "/boxes" },
    { name: "Barcodes", path: "/barcodes" },
    { name: "Settings", path: "/settings" },
  ];

  const allNavLinks = [...mainNavLinks, ...moreNavLinks];

  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsMoreDropdownOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsMoreDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // If we are not on the inventory page, redirect there when searching
    if (location.pathname !== "/inventory" && value) {
      navigate(`/inventory?q=${encodeURIComponent(value)}`);
    } else {
      setSearchParams(prev => {
        if (value) {
          prev.set("q", value);
        } else {
          prev.delete("q");
        }
        return prev;
      });
    }
  };

  const handleScan = (decodedText: string) => {
    setIsScannerOpen(false);
    navigate(`/inventory?q=${encodeURIComponent(decodedText)}`);
  };

  const isMoreActive = moreNavLinks.some(link => location.pathname === link.path);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between whitespace-nowrap border-b border-slate-200 dark:border-slate-800 px-4 md:px-6 py-4 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md">
      <div className="flex items-center gap-4 md:gap-8">
        <button 
          className="md:hidden p-2 -ml-2 text-slate-600 dark:text-slate-400 hover:text-primary transition-colors"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
        <div className="flex items-center gap-2 md:gap-3 text-primary">
          <Cpu className="w-7 h-7 md:w-8 md:h-8 font-bold" />
          <h2 className="text-slate-900 dark:text-slate-100 text-lg md:text-xl font-bold leading-tight tracking-tight">
            ElectroStock
          </h2>
        </div>
        
        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          {mainNavLinks.map((link) => (
            <Link
              key={link.name}
              to={link.path}
              className={cn(
                "text-sm font-medium transition-colors",
                location.pathname === link.path
                  ? "text-primary font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:text-primary dark:hover:text-primary"
              )}
            >
              {link.name}
            </Link>
          ))}
          
          {/* More Dropdown for medium screens */}
          <div className="relative hidden md:block lg:hidden" ref={dropdownRef}>
            <button
              onClick={() => setIsMoreDropdownOpen(!isMoreDropdownOpen)}
              className={cn(
                "flex items-center gap-1 text-sm font-medium transition-colors",
                isMoreActive ? "text-primary font-semibold" : "text-slate-600 dark:text-slate-400 hover:text-primary"
              )}
            >
              More <ChevronDown className="w-4 h-4" />
            </button>
            {isMoreDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg py-2 animate-in fade-in slide-in-from-top-2">
                {moreNavLinks.map((link) => (
                  <Link
                    key={link.name}
                    to={link.path}
                    className={cn(
                      "block px-4 py-2 text-sm transition-colors",
                      location.pathname === link.path
                        ? "text-primary bg-primary/5 font-medium"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    )}
                  >
                    {link.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Expanded links for large screens */}
          <div className="hidden lg:flex items-center gap-6">
            {moreNavLinks.map((link) => (
              <Link
                key={link.name}
                to={link.path}
                className={cn(
                  "text-sm font-medium transition-colors",
                  location.pathname === link.path
                    ? "text-primary font-semibold"
                    : "text-slate-600 dark:text-slate-400 hover:text-primary dark:hover:text-primary"
                )}
              >
                {link.name}
              </Link>
            ))}
          </div>
        </nav>
      </div>
      
      <div className="flex flex-1 justify-end gap-2 md:gap-4 items-center">
        {/* Barcode scanner button for mobile */}
        <button
          onClick={() => setIsScannerOpen(true)}
          className="md:hidden flex items-center justify-center p-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-primary transition-colors border border-slate-200 dark:border-slate-800"
          title="Scan Barcode"
        >
          <Camera className="w-5 h-5" />
        </button>

        <label className="flex flex-col w-full max-w-40 sm:max-w-64 relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <Search className="text-slate-400 w-4 h-4 md:w-5 md:h-5" />
          </div>
          <input
            className="form-input w-full rounded-lg border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 focus:border-primary focus:ring-1 focus:ring-primary pl-9 md:pl-10 pr-4 py-1.5 md:py-2 text-sm placeholder:text-slate-500"
            placeholder="Search..."
            value={searchQuery}
            onChange={handleSearch}
          />
        </label>
      </div>

      {/* Mobile Navigation Menu */}
      {isMobileMenuOpen && (
        <div className="absolute top-full left-0 right-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-lg md:hidden animate-in slide-in-from-top-2">
          <nav className="flex flex-col p-4 gap-2">
            {allNavLinks.map((link) => (
              <Link
                key={link.name}
                to={link.path}
                className={cn(
                  "px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                  location.pathname === link.path
                    ? "text-primary bg-primary/10"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                )}
              >
                {link.name}
              </Link>
            ))}
          </nav>
        </div>
      )}

      {isScannerOpen && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setIsScannerOpen(false)}
        />
      )}
    </header>
  );
}
