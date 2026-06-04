"use client";

import { useEffect, useState, useCallback } from "react";
import type { ShopifyProduct } from "@/lib/shopify";

export default function Home() {
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const loadProducts = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/products?page=${p}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setProducts(data.products);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts(page);
  }, [page, loadProducts]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filtered = products.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.vendor.toLowerCase().includes(search.toLowerCase()) ||
      p.product_type.toLowerCase().includes(search.toLowerCase())
  );

  const toggleAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  };

  const exportCatalog = async () => {
    if (selected.size === 0) return;
    setExporting(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: Array.from(selected), marketplace: "myntra" }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `myntra-catalog-${Date.now()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Marketplace Cataloguer</h1>
            <p className="text-sm text-gray-500">Export Shopify products to marketplace templates</p>
          </div>
          <button
            onClick={exportCatalog}
            disabled={selected.size === 0 || exporting}
            className="bg-[#FF3F6C] hover:bg-[#e0355d] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {exporting ? "Exporting…" : `Export to Myntra (${selected.size})`}
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-3 mb-4 items-center">
          <input
            type="text"
            placeholder="Search by name, brand, or type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF3F6C]"
          />
          <button
            onClick={toggleAll}
            className="text-sm text-[#FF3F6C] hover:underline font-medium whitespace-nowrap"
          >
            {selected.size === filtered.length && filtered.length > 0 ? "Deselect All" : "Select All"}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">
            {error}
            {error.toLowerCase().includes("env") && (
              <span>
                {" "}— Add <code className="bg-red-100 px-1 rounded">SHOPIFY_STORE_DOMAIN</code> and{" "}
                <code className="bg-red-100 px-1 rounded">SHOPIFY_ADMIN_TOKEN</code> to your{" "}
                <code className="bg-red-100 px-1 rounded">.env.local</code>
              </span>
            )}
          </div>
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
            <p className="text-xs text-gray-400 mb-3">
              {filtered.length} products • {selected.size} selected
            </p>
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
                <p className="col-span-full text-center text-gray-400 py-16">No products found</p>
              )}
            </div>

            <div className="flex justify-center gap-3 mt-8">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm disabled:opacity-40 hover:bg-gray-100"
              >
                ← Previous
              </button>
              <span className="px-4 py-2 text-sm text-gray-500">Page {page}</span>
              <button
                disabled={products.length < 50}
                onClick={() => setPage((p) => p + 1)}
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

function ProductCard({
  product,
  selected,
  onToggle,
}: {
  product: ShopifyProduct;
  selected: boolean;
  onToggle: () => void;
}) {
  const image = product.images[0]?.src;
  const price = product.variants[0]?.price;
  const variantCount = product.variants.length;

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
          <div className="absolute top-2 right-2 bg-[#FF3F6C] text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
            ✓
          </div>
        )}
        {product.status !== "active" && (
          <div className="absolute top-2 left-2 bg-yellow-400 text-yellow-900 text-xs font-semibold px-2 py-0.5 rounded">
            {product.status}
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-xs font-semibold text-gray-800 truncate leading-tight">{product.title}</p>
        <p className="text-xs text-gray-400 mt-0.5 truncate">{product.vendor}</p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs font-bold text-gray-700">₹{price}</span>
          <span className="text-xs text-gray-400">{variantCount} var</span>
        </div>
      </div>
    </div>
  );
}
