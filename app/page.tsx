"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { ShopifyProduct } from "@/lib/shopify";
import { findMatchingSheet } from "@/lib/myntra-export";

// ─── Myntra Formats Modal ────────────────────────────────────────────────────

const MYNTRA_CATEGORIES = [
  "Kurta Sets",
  "Kurtas",
  "Tops / Tunics",
  "Coord Sets",
  "Ethnic Dresses",
  "Lehengas",
  "Dupattas",
  "Palazzos / Pants",
  "Sarees",
  "Other",
];

interface StoredFormat {
  name: string;
  category: string;
  uploadedAt: string;
  size: number;
  dataUrl: string;
}

interface StoredCombinedFormat {
  name: string;
  uploadedAt: string;
  size: number;
  sheets: string[]; // detected product-type sheet names
  dataUrl: string;
}

function MyntraFormatsModal({ onClose }: { onClose: () => void }) {
  const [formats, setFormats] = useState<StoredFormat[]>([]);
  const [combined, setCombined] = useState<StoredCombinedFormat | null>(null);
  const [parsing, setParsing] = useState(false);

  const singleFileRef = useRef<HTMLInputElement>(null);
  const combinedFileRef = useRef<HTMLInputElement>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem("myntra_formats");
      if (s) setFormats(JSON.parse(s));
      const c = localStorage.getItem("myntra_combined_format");
      if (c) setCombined(JSON.parse(c));
    } catch {}
  }, []);

  const saveFormats = (updated: StoredFormat[]) => {
    setFormats(updated);
    localStorage.setItem("myntra_formats", JSON.stringify(updated));
  };

  const handleUploadClick = (category: string) => {
    setUploadingFor(category);
    singleFileRef.current?.click();
  };

  const handleSingleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingFor) return;
    const reader = new FileReader();
    reader.onload = () => {
      const entry: StoredFormat = {
        name: file.name,
        category: uploadingFor,
        uploadedAt: new Date().toISOString(),
        size: file.size,
        dataUrl: reader.result as string,
      };
      saveFormats([...formats.filter((f) => f.category !== uploadingFor), entry]);
      setUploadingFor(null);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCombinedFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    try {
      // Send to server to detect sheet names
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/formats/parse", { method: "POST", body: fd });
      const { sheets, error } = await res.json();
      if (error) throw new Error(error);

      // Store file as base64
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      const entry: StoredCombinedFormat = {
        name: file.name,
        uploadedAt: new Date().toISOString(),
        size: file.size,
        sheets,
        dataUrl,
      };
      setCombined(entry);
      localStorage.setItem("myntra_combined_format", JSON.stringify(entry));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to parse file");
    } finally {
      setParsing(false);
      e.target.value = "";
    }
  };

  const handleDownload = (f: { dataUrl: string; name: string }) => {
    const a = document.createElement("a");
    a.href = f.dataUrl; a.download = f.name; a.click();
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
      " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Marketplace Format Templates</h2>
            <p className="text-xs text-gray-400 mt-0.5">Upload XLSX / CSV templates for each product type</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1">

          {/* ── Myntra section heading ── */}
          <div className="px-6 py-2 bg-gray-50 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Myntra</p>
          </div>

          {/* ── Combined Format section ── */}
          <div className="px-6 py-4 border-b border-gray-200 bg-amber-50">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">Combined Format</span>
                  <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-medium">Multi-sheet</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Single Excel with separate sheets per product type (e.g. Kurtas, Kurta Sets, Co-Ords…)
                </p>

                {combined ? (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-gray-600 font-medium truncate">{combined.name}</p>
                    <p className="text-xs text-gray-400">
                      Uploaded {fmt(combined.uploadedAt)} &nbsp;·&nbsp; {(combined.size / 1024).toFixed(0)} KB
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {combined.sheets.map((s) => (
                        <span key={s} className="text-xs bg-white border border-amber-300 text-amber-800 rounded px-2 py-0.5 font-medium">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">No combined format uploaded</p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0 pt-0.5">
                {combined && (
                  <>
                    <button onClick={() => handleDownload(combined)} className="text-xs text-blue-600 hover:underline font-medium">
                      Download
                    </button>
                    <button
                      onClick={() => { setCombined(null); localStorage.removeItem("myntra_combined_format"); }}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </>
                )}
                <button
                  onClick={() => combinedFileRef.current?.click()}
                  disabled={parsing}
                  className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 font-medium px-3 py-1.5 rounded-lg disabled:opacity-50"
                >
                  {parsing ? "Reading…" : combined ? "Replace" : "Upload"}
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Hidden file inputs */}
        <input ref={singleFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleSingleFileChange} />
        <input ref={combinedFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleCombinedFileChange} />
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Home() {
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [showFormats, setShowFormats] = useState(false);
  const [exportError, setExportError] = useState<{ missingTypes: { shopify: string; myntra: string }[] } | null>(null);

  // ── Staged (pending) filter state ──
  const [stagedType, setStagedType] = useState("");
  const [stagedCollections, setStagedCollections] = useState<string[]>([]);
  const [stagedTags, setStagedTags] = useState<string[]>([]);
  const [stagedSkuText, setStagedSkuText] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [collectionDropdownOpen, setCollectionDropdownOpen] = useState(false);

  // ── Applied (active) filter state ──
  const [appliedType, setAppliedType] = useState("");
  const [appliedCollections, setAppliedCollections] = useState<string[]>([]);
  const [appliedTags, setAppliedTags] = useState<string[]>([]);
  const [appliedSkus, setAppliedSkus] = useState<string[]>([]);

  const tagRef = useRef<HTMLDivElement>(null);
  const collectionRef = useRef<HTMLDivElement>(null);

  // Store-wide filter options
  const [allCollections, setAllCollections] = useState<string[]>([]);
  const [allStoreTags, setAllStoreTags] = useState<string[]>([]);
  const [allStoreTypes, setAllStoreTypes] = useState<string[]>([]);

  const loadProducts = useCallback(async (
    c: string | null,
    filters?: { collections: string[]; tags: string[]; skus: string[]; type: string },
  ) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (c) params.set("cursor", c);
      if (filters) {
        filters.collections.forEach((col) => params.append("collection", col));
        filters.tags.forEach((tag) => params.append("tag", tag));
        filters.skus.forEach((sku) => params.append("sku", sku));
        if (filters.type) params.set("type", filters.type);
      }
      const url = `/api/products${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url);
      if (res.status === 401) { window.location.href = "/api/auth"; return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setProducts(data.products);
      setNextCursor(data.nextCursor);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Active filter ref so pagination can re-use them
  const activeFiltersRef = useRef<{ collections: string[]; tags: string[]; skus: string[]; type: string } | undefined>(undefined);

  useEffect(() => { loadProducts(cursor, activeFiltersRef.current); }, [cursor, loadProducts]);

  useEffect(() => {
    fetch("/api/filters")
      .then((r) => r.json())
      .then((d) => {
        if (d.collections) setAllCollections(d.collections);
        if (d.tags) setAllStoreTags(d.tags);
        if (d.types) setAllStoreTypes(d.types);
      });
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tagRef.current && !tagRef.current.contains(e.target as Node)) setTagDropdownOpen(false);
      if (collectionRef.current && !collectionRef.current.contains(e.target as Node)) setCollectionDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const allTypes = allStoreTypes.length > 0
    ? allStoreTypes
    : Array.from(new Set(products.map((p) => p.product_type).filter(Boolean))).sort();

  const filteredTagSuggestions = allStoreTags
    .filter((t) => t.toLowerCase().includes(tagSearch.toLowerCase()) && !stagedTags.includes(t))
    .slice(0, 20);

  // ── Apply filters — triggers a fresh server-side fetch ──
  const applyFilters = () => {
    const skus = stagedSkuText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    const filterObj = { collections: [...stagedCollections], tags: [...stagedTags], skus, type: stagedType };

    setAppliedType(stagedType);
    setAppliedCollections([...stagedCollections]);
    setAppliedTags([...stagedTags]);
    setAppliedSkus(skus);
    setCollectionDropdownOpen(false);
    setTagDropdownOpen(false);

    // Reset pagination and fetch filtered results from server
    activeFiltersRef.current = filterObj;
    setCursor(null);
    setCursorHistory([null]);
    setPageIndex(0);
    loadProducts(null, filterObj);
  };

  const clearFilters = () => {
    setStagedType(""); setStagedCollections([]); setStagedTags([]); setTagSearch(""); setStagedSkuText("");
    setAppliedType(""); setAppliedCollections([]); setAppliedTags([]); setAppliedSkus([]);
    activeFiltersRef.current = undefined;
    setCursor(null); setCursorHistory([null]); setPageIndex(0);
    loadProducts(null, undefined);
  };

  const hasApplied = appliedType || appliedCollections.length > 0 || appliedTags.length > 0 || appliedSkus.length > 0;
  const hasPending =
    stagedType !== appliedType ||
    JSON.stringify([...stagedCollections].sort()) !== JSON.stringify([...appliedCollections].sort()) ||
    JSON.stringify([...stagedTags].sort()) !== JSON.stringify([...appliedTags].sort()) ||
    stagedSkuText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).join(",") !== appliedSkus.join(",");

  // Products are already filtered server-side; use as-is
  const filtered = products;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  };

  const exportCatalog = async () => {
    if (selected.size === 0) return;

    // ── Pre-export validation against combined template ──
    let templateDataUrl: string | undefined;
    try {
      const storedCombined = localStorage.getItem("myntra_combined_format");
      if (storedCombined) {
        const combined = JSON.parse(storedCombined) as { sheets: string[]; dataUrl: string };
        // Find unique product types of selected products
        const selectedProducts = products.filter((p) => selected.has(p.id));
        const uniqueTypes = Array.from(new Set(selectedProducts.map((p) => p.product_type).filter(Boolean)));
        const MYNTRA_LABELS: Record<string, string> = {
          "dresses": "Ethnic Dresses", "dress": "Ethnic Dresses",
          "co-ord set": "Co-Ords", "co-ord sets": "Co-Ords", "coord set": "Co-Ords",
          "kurta set": "Kurta Sets", "kurta sets": "Kurta Sets",
        };
        const missingTypes = uniqueTypes
          .filter((t) => !findMatchingSheet(t, combined.sheets))
          .map((t) => ({ shopify: t, myntra: MYNTRA_LABELS[t.toLowerCase()] || t }));
        if (missingTypes.length > 0) {
          setExportError({ missingTypes });
          return;
        }
        templateDataUrl = combined.dataUrl;
      }
    } catch {}

    setExporting(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: Array.from(selected),
          marketplace: "myntra",
          ...(templateDataUrl ? { templateDataUrl } : {}),
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Export failed"); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `myntra-${Date.now()}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      {showFormats && <MyntraFormatsModal onClose={() => setShowFormats(false)} />}

      {/* Export error — missing template sheets */}
      {exportError && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start gap-3">
              <div className="text-2xl">⚠️</div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-gray-900">Missing Myntra Format</h3>
                <p className="text-sm text-gray-500 mt-1">
                  The selected products include product type{exportError.missingTypes.length > 1 ? "s" : ""} that
                  {exportError.missingTypes.length > 1 ? " don't have" : " doesn't have"} a corresponding sheet in
                  your uploaded Myntra combined format:
                </p>
                <ul className="mt-2 space-y-1">
                  {exportError.missingTypes.map(({ shopify, myntra }) => (
                    <li key={shopify} className="text-sm bg-red-50 rounded px-3 py-1.5">
                      <span className="text-gray-500">Shopify: </span>
                      <span className="font-semibold text-gray-800">{shopify}</span>
                      <span className="text-gray-400 mx-2">→</span>
                      <span className="text-gray-500">Needs Myntra sheet: </span>
                      <span className="font-semibold text-red-600">{myntra}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-gray-400 mt-2">
                  Upload a combined format file that includes {exportError.missingTypes.length > 1 ? "these sheets" : `a "${exportError.missingTypes[0].myntra}" sheet`}.
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button
                onClick={() => setExportError(null)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => { setExportError(null); setShowFormats(true); }}
                className="px-4 py-2 text-sm bg-[#FF3F6C] text-white rounded-lg font-semibold hover:bg-[#e0355d]"
              >
                Open Marketplace Base Formats →
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Marketplace Cataloguer</h1>
            <p className="text-sm text-gray-500">Export Shopify products to marketplace templates</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFormats(true)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
            >
              Marketplace Base Formats
            </button>
            <button
              onClick={exportCatalog}
              disabled={selected.size === 0 || exporting}
              className="bg-[#FF3F6C] hover:bg-[#e0355d] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
            >
              {exporting ? "Exporting…" : `Export Myntra Format (${selected.size})`}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Filter bar */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">

          {/* Row 1: dropdowns + tag search */}
          <div className="flex gap-3 flex-wrap items-start">

            {/* Collection multi-select */}
            <div className="relative" ref={collectionRef}>
              <button
                onClick={() => setCollectionDropdownOpen((o) => !o)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white min-w-[160px] flex items-center justify-between gap-2 hover:border-gray-400"
              >
                <span className="text-gray-700">
                  {stagedCollections.length === 0 ? "All Collections" : `${stagedCollections.length} selected`}
                </span>
                <span className="text-gray-400">▾</span>
              </button>
              {collectionDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[180px] max-h-64 overflow-y-auto">
                  {allCollections.map((c) => (
                    <label key={c} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={stagedCollections.includes(c)}
                        onChange={() =>
                          setStagedCollections((prev) =>
                            prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                          )
                        }
                        className="accent-[#FF3F6C]"
                      />
                      {c}
                    </label>
                  ))}
                  {allCollections.length === 0 && (
                    <p className="px-4 py-2 text-sm text-gray-400">Loading…</p>
                  )}
                </div>
              )}
            </div>

            {/* Product type filter */}
            <select
              value={stagedType}
              onChange={(e) => setStagedType(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF3F6C] bg-white min-w-[140px]"
            >
              <option value="">All Types</option>
              {allTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            {/* Tag search */}
            <div className="relative flex-1 min-w-[200px]" ref={tagRef}>
              <input
                type="text"
                placeholder="Search tags…"
                value={tagSearch}
                onChange={(e) => { setTagSearch(e.target.value); setTagDropdownOpen(true); }}
                onFocus={() => setTagDropdownOpen(true)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF3F6C]"
              />
              {tagDropdownOpen && filteredTagSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                  {filteredTagSuggestions.map((tag) => (
                    <button
                      key={tag}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setStagedTags((prev) => [...prev, tag]);
                        setTagSearch("");
                        setTagDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-gray-700"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Row 2: staged chips (pending) */}
          {(stagedCollections.length > 0 || stagedTags.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {stagedCollections.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-3 py-0.5 text-xs font-medium">
                  {c}
                  <button onClick={() => setStagedCollections((prev) => prev.filter((x) => x !== c))} className="hover:text-blue-800">✕</button>
                </span>
              ))}
              {stagedTags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 bg-pink-50 text-[#FF3F6C] border border-pink-200 rounded-full px-3 py-0.5 text-xs font-medium">
                  {tag}
                  <button onClick={() => setStagedTags((prev) => prev.filter((t) => t !== tag))} className="hover:text-pink-800">✕</button>
                </span>
              ))}
            </div>
          )}

          {/* Row 3: SKU input */}
          <div className="flex gap-2 items-start">
            <textarea
              placeholder={"Paste SKUs here (one per line or comma-separated)…\nABC123\nDEF456"}
              value={stagedSkuText}
              onChange={(e) => setStagedSkuText(e.target.value)}
              rows={3}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#FF3F6C] resize-none placeholder-gray-300"
            />
          </div>

          {/* Row 4: Apply / Clear */}
          <div className="flex items-center gap-3">
            <button
              onClick={applyFilters}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                hasPending
                  ? "bg-[#FF3F6C] text-white hover:bg-[#e0355d]"
                  : "bg-gray-100 text-gray-500 cursor-default"
              }`}
            >
              Apply Filters
            </button>
            {hasApplied && (
              <button onClick={clearFilters} className="text-sm text-gray-400 hover:text-gray-600">
                ✕ Clear all
              </button>
            )}
            {selected.size > 0 && (
              <button onClick={() => setSelected(new Set())} className="text-sm text-gray-400 hover:text-gray-600 whitespace-nowrap ml-auto mr-3">
                Clear All
              </button>
            )}
            <button onClick={toggleAll} className={`text-sm text-[#FF3F6C] hover:underline font-medium whitespace-nowrap ${selected.size > 0 ? "" : "ml-auto"}`}>
              Select All
            </button>
          </div>

          {/* Applied filter summary chips */}
          {hasApplied && (
            <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
              <span className="text-xs text-gray-400 self-center">Active:</span>
              {appliedCollections.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-3 py-0.5 text-xs font-medium">{c}</span>
              ))}
              {appliedTags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 bg-pink-50 text-[#FF3F6C] border border-pink-200 rounded-full px-3 py-0.5 text-xs font-medium">{tag}</span>
              ))}
              {appliedType && (
                <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-600 border border-purple-200 rounded-full px-3 py-0.5 text-xs font-medium">{appliedType}</span>
              )}
              {appliedSkus.length > 0 && (
                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-3 py-0.5 text-xs font-medium">{appliedSkus.length} SKU{appliedSkus.length > 1 ? "s" : ""}</span>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
                <div className="bg-gray-200 aspect-square" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-3">{filtered.length} products on this page • {selected.size} selected</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filtered.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  selected={selected.has(product.id)}
                  onToggle={() => toggle(product.id)}
                />
              ))}
              {filtered.length === 0 && (
                <p className="col-span-full text-center text-gray-400 py-16">No products found on this page</p>
              )}
            </div>

            <div className="flex justify-center gap-3 mt-8">
              <button
                disabled={pageIndex === 0}
                onClick={() => {
                  const prev = cursorHistory[pageIndex - 1] ?? null;
                  setPageIndex((i) => i - 1);
                  setCursor(prev);
                  loadProducts(prev, activeFiltersRef.current);
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm disabled:opacity-40 hover:bg-gray-100"
              >
                ← Previous
              </button>
              <span className="px-4 py-2 text-sm text-gray-500">Page {pageIndex + 1}</span>
              <button
                disabled={!nextCursor}
                onClick={() => {
                  if (!nextCursor) return;
                  setCursorHistory((h) => [...h, nextCursor]);
                  setPageIndex((i) => i + 1);
                  setCursor(nextCursor);
                  loadProducts(nextCursor, activeFiltersRef.current);
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm disabled:opacity-40 hover:bg-gray-100"
              >
                Next →
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function SkuDisplay({ sku }: { sku: string }) {
  // Split e.g. "ZKP1189BM2048" into prefix "ZKP1189" (pink) and rest "BM2048" (grey)
  const match = sku.match(/^(ZKP\d+)(.*)$/i);
  if (!match) return <span className="text-gray-400">{sku}</span>;
  return (
    <span>
      <span className="text-[#FF3F6C] font-medium">{match[1].toUpperCase()}</span>
      <span className="text-gray-400">{match[2]}</span>
    </span>
  );
}

function ProductCard({ product, selected, onToggle }: { product: ShopifyProduct; selected: boolean; onToggle: () => void }) {
  const image = product.images[0]?.src;
  const sku = product.variants[0]?.sku || "";
  // Strip size suffix (e.g. "-XS") to show base SKU
  const baseSku = sku.replace(/-[^-]+$/, "");
  const variantCount = product.variants.length;
  const collections = product.tags.split(",").map((t) => t.trim()).filter((t) => /^zkp\d+$/i.test(t)).map((t) => t.toUpperCase());

  return (
    <div
      onClick={onToggle}
      className={`bg-white rounded-xl border-2 overflow-hidden cursor-pointer transition-all hover:shadow-md ${
        selected ? "border-[#FF3F6C] shadow-md" : "border-transparent hover:border-gray-300"
      }`}
    >
      <div className="relative aspect-square bg-gray-100">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={product.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-3xl">📦</div>
        )}
        {selected && (
          <div className="absolute top-2 right-2 bg-[#FF3F6C] text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">✓</div>
        )}
      </div>
      <div className="p-3">
        <p className="text-xs font-semibold text-gray-800 truncate leading-tight">{product.title}</p>
        {product.product_type && (
          <p className="text-xs text-gray-500 mt-0.5 truncate">{product.product_type}</p>
        )}
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs font-mono"><SkuDisplay sku={baseSku} /></span>
          <span className="text-xs text-gray-400">{variantCount} var</span>
        </div>
      </div>
    </div>
  );
}
