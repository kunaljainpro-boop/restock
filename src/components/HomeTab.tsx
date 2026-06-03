"use client";

import { Check, ScanBarcode, Search, X, Plus, ChevronRight, ChevronLeft } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { parseSearch } from "@/lib/parse-search";
import { useToast } from "@/lib/toast-context";
import { similarity } from "@/lib/fuzzy";
import {
  useProfile, useBrands, useProducts, useVariants,
  useMarketList, useAddToList, useRemoveFromList,
  useBarcodes, lookupBarcode, smartCreateSync,
  useCreateBrand, useCreateProduct, useCreateVariant,
  useSaveBarcode,
} from "@/lib/use-db";
import { BarcodeScanner } from "./BarcodeScanner";
import type { Brand, MarketListItemFull, Product, Variant } from "@/lib/types";

interface Props {
  userId: string;
  onTabChange: (tab: string) => void;
}

interface SearchResult {
  brand: Brand;
  product: Product;
  variant: Variant;
  inList: boolean;
  listItemId: string | null;
}

interface AddPrefill {
  brand?: string;
  product?: string;
  variant?: string;
  image?: string;
  barcode?: string;
}

export function HomeTab({ userId, onTabChange }: Props) {
  const { data: profile } = useProfile(userId);
  const { data: brands = [] } = useBrands(userId);
  const { data: products = [] } = useProducts(userId);
  const { data: variants = [] } = useVariants(userId);
  const { data: listItems = [] } = useMarketList(userId);
  const { data: barcodes = [] } = useBarcodes(userId);
  const addToList = useAddToList(userId);
  const removeFromList = useRemoveFromList(userId);
  const qc = useQueryClient();
  const { toast } = useToast();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showScanner, setShowScanner] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addPrefill, setAddPrefill] = useState<AddPrefill | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [lastSync] = useState(new Date());

  const listVariantIds = new Set(listItems.map((i) => i.variant_id));

  // ── Build search results from cache ──────────────────────────────────────────
  const buildResults = useCallback((q: string): SearchResult[] => {
    if (!q.trim()) return [];
    const ql = q.toLowerCase();
    const hits: SearchResult[] = [];
    const seen = new Set<string>();

    for (const variant of variants) {
      const product = products.find((p) => p.id === variant.product_id);
      if (!product) continue;
      const brand = brands.find((b) => b.id === product.brand_id);
      if (!brand) continue;

      const matches =
        brand.name.toLowerCase().includes(ql) ||
        product.name.toLowerCase().includes(ql) ||
        variant.name.toLowerCase().includes(ql) ||
        `${brand.name} ${product.name} ${variant.name}`.toLowerCase().includes(ql);

      if (matches && !seen.has(variant.id)) {
        seen.add(variant.id);
        const listItem = listItems.find((i) => i.variant_id === variant.id && !i.completed_at);
        hits.push({ brand, product, variant, inList: listVariantIds.has(variant.id), listItemId: listItem?.id ?? null });
      }
    }
    return hits.slice(0, 30);
  }, [variants, products, brands, listItems, listVariantIds]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(() => setResults(buildResults(query)), 150);
    return () => clearTimeout(debounceRef.current);
  }, [query, buildResults]);

  // ── Toggle item in/out of list — INSTANT optimistic ───────────────────────
  async function toggleItem(result: SearchResult) {
    if (result.inList) {
      qc.setQueryData(["list", userId], (old: MarketListItemFull[]) =>
        old?.filter((i) => i.variant_id !== result.variant.id) ?? []
      );
      setResults((prev) => prev.map((r) => r.variant.id === result.variant.id ? { ...r, inList: false, listItemId: null } : r));
      removeFromList.mutate(result.variant.id, {
        onError: () => {
          qc.invalidateQueries({ queryKey: ["list", userId] });
          toast("Failed to remove", "error");
        },
      });
      toast("Removed from list");
    } else {
      const listItemId = crypto.randomUUID();
      const now = new Date().toISOString();
      const newItem: MarketListItemFull = {
        id: listItemId,
        user_id: userId,
        variant_id: result.variant.id,
        added_at: now,
        completed_at: null,
        variant: { ...result.variant, product: { ...result.product, brand: result.brand } },
      };
      qc.setQueryData(["list", userId], (old: MarketListItemFull[]) => [newItem, ...(old ?? [])]);
      setResults((prev) => prev.map((r) => r.variant.id === result.variant.id ? { ...r, inList: true, listItemId } : r));
      addToList.mutate({ variantId: result.variant.id, listItemId }, {
        onError: () => {
          qc.invalidateQueries({ queryKey: ["list", userId] });
          toast("Failed to add", "error");
        },
      });
      toast("Added to list ✓");
    }
  }

  // ── Smart create + add — INSTANT optimistic ───────────────────────────────
  async function handleSmartAdd() {
    if (!query.trim()) return;
    const parsed = parseSearch(query.trim(), brands);
    const now = new Date().toISOString();

    const existingBrand = brands.find((b) => similarity(b.name, parsed.brandName) >= 0.82);
    const finalBrandId = existingBrand?.id ?? crypto.randomUUID();

    const existingProduct = products.find((p) =>
      p.brand_id === finalBrandId && similarity(p.name, parsed.productName) >= 0.82
    );
    const finalProductId = existingProduct?.id ?? crypto.randomUUID();

    const existingVariant = variants.find((v) =>
      v.product_id === finalProductId && similarity(v.name, parsed.variantName) >= 0.82
    );
    const finalVariantId = existingVariant?.id ?? crypto.randomUUID();
    const listItemId = crypto.randomUUID();

    const newBrand: Brand = existingBrand ?? { id: finalBrandId, user_id: userId, name: parsed.brandName, logo_url: null, print_enabled: true, created_at: now };
    const newProduct: Product = existingProduct ?? { id: finalProductId, user_id: userId, brand_id: finalBrandId, name: parsed.productName, image_url: null, created_at: now };
    const newVariant: Variant = existingVariant ?? { id: finalVariantId, user_id: userId, product_id: finalProductId, name: parsed.variantName, created_at: now };

    if (!existingBrand) qc.setQueryData(["brands", userId], (old: Brand[]) => [...(old ?? []), newBrand]);
    if (!existingProduct) qc.setQueryData(["products", userId], (old: Product[]) => [...(old ?? []), newProduct]);
    if (!existingVariant) qc.setQueryData(["variants", userId], (old: Variant[]) => [...(old ?? []), newVariant]);

    const newListItem: MarketListItemFull = {
      id: listItemId, user_id: userId, variant_id: finalVariantId, added_at: now, completed_at: null,
      variant: { ...newVariant, product: { ...newProduct, brand: newBrand } },
    };
    qc.setQueryData(["list", userId], (old: MarketListItemFull[]) => [newListItem, ...(old ?? [])]);
    setQuery(""); setResults([]);
    toast(`✓ ${parsed.brandName} · ${parsed.productName} · ${parsed.variantName}`);

    smartCreateSync(userId, finalBrandId, parsed.brandName, finalProductId, parsed.productName, finalVariantId, parsed.variantName, existingBrand?.id ?? null, existingProduct?.id ?? null, existingVariant?.id ?? null)
      .then(() => {
        addToList.mutate({ variantId: finalVariantId, listItemId });
        qc.invalidateQueries({ queryKey: ["brands", userId] });
        qc.invalidateQueries({ queryKey: ["products", userId] });
        qc.invalidateQueries({ queryKey: ["variants", userId] });
        qc.invalidateQueries({ queryKey: ["list", userId] });
      }).catch(() => toast("Sync failed — check connection", "error"));
  }

  // ── Barcode handler ───────────────────────────────────────────────────────
  async function handleBarcode(barcode: string) {
    setShowScanner(false);
    // Check local DB first
    const local = barcodes.find((b) => b.barcode === barcode);
    if (local?.variant_id) {
      const variant = variants.find((v) => v.id === local.variant_id);
      const product = products.find((p) => p.id === variant?.product_id);
      const brand = brands.find((b) => b.id === product?.brand_id);
      if (variant && product && brand) {
        setResults([{ brand, product, variant, inList: listVariantIds.has(variant.id), listItemId: null }]);
        toast(`Found: ${brand.name} — ${product.name}`, "info");
        return;
      }
    }
    toast("Looking up barcode…", "info");
    const info = await lookupBarcode(barcode);
    // Open add modal — pre-filled if found, empty if not
    setAddPrefill({
      brand: info?.brand,
      product: info?.product,
      variant: info?.variant,
      image: info?.image,
      barcode,
    });
    setShowAddModal(true);
    if (!info) toast("Product not found — add manually", "info");
  }

  const syncText = (() => {
    const s = Math.floor((Date.now() - lastSync.getTime()) / 1000);
    if (s < 60) return "Just synced";
    return `Synced ${Math.floor(s / 60)}m ago`;
  })();

  const parsed = query.trim() ? parseSearch(query.trim(), brands) : null;
  const noResults = query.trim() && results.length === 0;

  return (
    <div className="fade-in" style={{ padding: "calc(env(safe-area-inset-top,0px) + 10px) 16px 28px" }}>

      {/* ── Hero Card ─────────────────────────────────────────────────────────── */}
      <div style={{ borderRadius: 28, padding: "22px 22px 0", background: "linear-gradient(140deg,#fff6f6 0%,#ffe5e6 50%,#eef7ff 100%)", border: "1px solid rgba(239,29,39,0.13)", boxShadow: "var(--shadow-lg)", position: "relative", overflow: "hidden" }}>
        <HeroFX />
        <div style={{ position: "relative", zIndex: 2, display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 10.5, fontWeight: 850, letterSpacing: 1.2, textTransform: "uppercase", color: "#b4232b" }}>Add Fast. Find Fast. Buy Fast.</p>
            <h1 style={{ marginTop: 8, fontSize: 30, lineHeight: 1.1, fontWeight: 950, color: "var(--text)" }}>
              {profile?.market_name || "Market List"}
            </h1>
            <p style={{ marginTop: 5, fontSize: 11.5, fontWeight: 650, color: "var(--text-muted)" }}>{syncText}</p>
          </div>
          <Image src="/restock.png" alt="ReStock" width={60} height={60} priority style={{ width: 60, height: 60, objectFit: "contain", borderRadius: 16, flexShrink: 0 }} />
        </div>
        <div style={{ position: "relative", zIndex: 2, display: "grid", gridTemplateColumns: "repeat(3,1fr)", borderTop: "1px solid rgba(239,29,39,0.11)", margin: "0 -22px" }}>
          <StatBtn label="List" value={listItems.length} color="#ef1d27" onClick={() => onTabChange("list")} />
          <StatBtn label="Brands" value={brands.length} color="#0891b2" onClick={() => onTabChange("brands")} />
          <StatBtn label="Products" value={variants.length} color="#61bd45" onClick={undefined} />
        </div>
      </div>

      {/* ── Master Search ─────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={17} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (results.length === 0 ? handleSmartAdd() : undefined)}
              placeholder="Sprite Rs 20, Maggi 70gm, Coca-cola Thumsup…"
              style={{ width: "100%", height: 52, borderRadius: 17, border: "1.5px solid var(--border)", background: "var(--card)", paddingLeft: 44, paddingRight: query ? 42 : 14, fontSize: 14.5, fontWeight: 600, color: "var(--text)", outline: "none", boxShadow: "0 2px 12px rgba(7,20,38,0.04)" }}
            />
            {query && (
              <button onClick={() => { setQuery(""); setResults([]); }} style={{ position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)", background: "none", border: 0, padding: 4, color: "var(--text-muted)" }}>
                <X size={16} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowScanner(true)}
            style={{ width: 80, height: 52, borderRadius: 17, border: "1.5px solid #0891b2", background: "#0891b2", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, flexShrink: 0, boxShadow: "0 4px 14px #0891b240", overflow: "hidden", position: "relative", padding: 0 }}
          >
            {/* barcode lines bg */}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "stretch", gap: 3, padding: "6px 8px", opacity: 0.18 }}>
              {[3,1,2,1,3,1,2,1,3,1,2,1,3,1,2].map((w, i) => (
                <div key={i} style={{ flex: w, background: "#fff", borderRadius: 1 }} />
              ))}
            </div>
            <ScanBarcode size={18} color="#fff" style={{ position: "relative", zIndex: 1 }} />
            <span style={{ fontSize: 8.5, fontWeight: 900, color: "#fff", letterSpacing: 1, textTransform: "uppercase", position: "relative", zIndex: 1 }}>Barcode</span>
          </button>
        </div>

        {/* ── Quick Add Product button ─────────────────────────────────────────── */}
        {!query && (
          <button
            className="fade-in"
            onClick={() => { setAddPrefill(null); setShowAddModal(true); }}
            style={{
              marginTop: 10, width: "100%", height: 46, borderRadius: 15,
              border: "1.5px dashed rgba(239,29,39,0.35)",
              background: "rgba(239,29,39,0.04)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              color: "#ef1d27", fontWeight: 800, fontSize: 14, cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <Plus size={18} strokeWidth={2.5} />
            Add Product
          </button>
        )}

        {/* Smart create preview */}
        {noResults && parsed && (
          <div className="fade-in" style={{ marginTop: 10, background: "var(--card)", borderRadius: 18, border: "1.5px solid var(--border)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 2px 12px rgba(7,20,38,0.04)" }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Will Create</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Chip label="Brand" value={parsed.brandName} color="#0891b2" />
                {!parsed.isSingle && <Chip label="Product" value={parsed.productName} color="#61bd45" />}
                <Chip label="Variant" value={parsed.variantName} color="#ef1d27" />
              </div>
            </div>
            <button
              onClick={handleSmartAdd}
              style={{ flexShrink: 0, height: 40, borderRadius: 13, background: "#ef1d27", color: "#fff", border: 0, padding: "0 18px", fontWeight: 850, fontSize: 14, boxShadow: "0 4px 14px #ef1d2740" }}
            >
              + Add
            </button>
          </div>
        )}

        {/* Search results */}
        {results.length > 0 && (
          <div className="fade-in" style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {results.map((r) => (
              <ResultCard key={r.variant.id} result={r} onToggle={() => toggleItem(r)} />
            ))}
          </div>
        )}
      </div>

      {showScanner && <BarcodeScanner onDetected={handleBarcode} onClose={() => setShowScanner(false)} />}

      {showAddModal && typeof document !== "undefined" && createPortal(
        <QuickAddModal
          userId={userId}
          brands={brands}
          products={products}
          variants={variants}
          prefill={addPrefill}
          onClose={() => { setShowAddModal(false); setAddPrefill(null); }}
          onSaved={(brand, product, variant, addedToList, barcode) => {
            toast(`✓ ${brand.name} · ${product.name} · ${variant.name}${addedToList ? " — added to list" : ""}`);
            setShowAddModal(false);
            setAddPrefill(null);
            // Save barcode mapping if came from scan
            if (barcode) {
              if (supabaseAvailable()) {
                saveBarcodeMapping(userId, barcode, variant.id);
              }
            }
          }}
          onAddToList={(variant, product, brand) => {
            const listItemId = crypto.randomUUID();
            const now = new Date().toISOString();
            const newItem: MarketListItemFull = {
              id: listItemId, user_id: userId, variant_id: variant.id, added_at: now, completed_at: null,
              variant: { ...variant, product: { ...product, brand } },
            };
            qc.setQueryData(["list", userId], (old: MarketListItemFull[]) => [newItem, ...(old ?? [])]);
            addToList.mutate({ variantId: variant.id, listItemId }, {
              onError: () => qc.invalidateQueries({ queryKey: ["list", userId] }),
            });
          }}
          qc={qc}
        />,
        document.body
      )}
    </div>
  );
}

// ── Helper to save barcode after modal save ───────────────────────────────────
function supabaseAvailable() { return true; }
async function saveBarcodeMapping(userId: string, barcode: string, variantId: string) {
  try {
    const { supabase } = await import("@/lib/supabase");
    if (!supabase) return;
    await supabase.from("barcodes").upsert({ user_id: userId, barcode, variant_id: variantId }, { onConflict: "user_id,barcode" });
  } catch { /* silent */ }
}

// ── Quick Add Product Modal ───────────────────────────────────────────────────
interface QuickAddModalProps {
  userId: string;
  brands: Brand[];
  products: Product[];
  variants: Variant[];
  prefill: AddPrefill | null;
  onClose: () => void;
  onSaved: (brand: Brand, product: Product, variant: Variant, addedToList: boolean, barcode?: string) => void;
  onAddToList: (variant: Variant, product: Product, brand: Brand) => void;
  qc: ReturnType<typeof useQueryClient>;
}

function QuickAddModal({ userId, brands, products, variants, prefill, onClose, onSaved, onAddToList, qc }: QuickAddModalProps) {
  const createBrand = useCreateBrand(userId);
  const createProduct = useCreateProduct(userId);
  const createVariant = useCreateVariant(userId);

  const [step, setStep] = useState<"brand" | "product" | "variant">("brand");
  const [brandSearch, setBrandSearch] = useState(prefill?.brand ?? "");
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [productName, setProductName] = useState(prefill?.product ?? "");
  const [variantName, setVariantName] = useState(prefill?.variant ?? "");
  const [addToListFlag, setAddToListFlag] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageUrl] = useState(prefill?.image ?? "");

  // Auto-select brand if prefill matches an existing one
  useEffect(() => {
    if (prefill?.brand) {
      const match = brands.find(b => b.name.toLowerCase() === prefill.brand!.toLowerCase());
      if (match) setSelectedBrand(match);
    }
  }, []);

  const filteredBrands = brandSearch.trim()
    ? brands.filter(b => b.name.toLowerCase().includes(brandSearch.toLowerCase()))
    : brands;

  const isNewBrand = brandSearch.trim() && !brands.find(b => b.name.toLowerCase() === brandSearch.trim().toLowerCase());

  function selectBrand(b: Brand) {
    setSelectedBrand(b);
    setBrandSearch(b.name);
    setStep("product");
  }

  function confirmBrand() {
    if (!brandSearch.trim()) return;
    const existing = brands.find(b => b.name.toLowerCase() === brandSearch.trim().toLowerCase());
    if (existing) {
      setSelectedBrand(existing);
    } else {
      // Will create new brand on save
      setSelectedBrand(null);
    }
    setStep("product");
  }

  async function handleSave() {
    if (!brandSearch.trim() || !productName.trim() || !variantName.trim()) return;
    setSaving(true);
    const now = new Date().toISOString();

    const existingBrand = brands.find(b => b.name.toLowerCase() === brandSearch.trim().toLowerCase());
    const brandId = existingBrand?.id ?? crypto.randomUUID();
    const finalBrand: Brand = existingBrand ?? { id: brandId, user_id: userId, name: brandSearch.trim(), logo_url: null, print_enabled: true, created_at: now };

    const existingProduct = products.find(p => p.brand_id === brandId && p.name.toLowerCase() === productName.trim().toLowerCase());
    const productId = existingProduct?.id ?? crypto.randomUUID();
    const finalProduct: Product = existingProduct ?? { id: productId, user_id: userId, brand_id: brandId, name: productName.trim(), image_url: imageUrl || null, created_at: now };

    const existingVariant = variants.find(v => v.product_id === productId && v.name.toLowerCase() === variantName.trim().toLowerCase());
    const variantId = existingVariant?.id ?? crypto.randomUUID();
    const finalVariant: Variant = existingVariant ?? { id: variantId, user_id: userId, product_id: productId, name: variantName.trim(), created_at: now };

    // Optimistic cache updates
    if (!existingBrand) qc.setQueryData(["brands", userId], (old: Brand[]) => [...(old ?? []), finalBrand].sort((a, b) => a.name.localeCompare(b.name)));
    if (!existingProduct) qc.setQueryData(["products", userId], (old: Product[]) => [...(old ?? []), finalProduct].sort((a, b) => a.name.localeCompare(b.name)));
    if (!existingVariant) qc.setQueryData(["variants", userId], (old: Variant[]) => [...(old ?? []), finalVariant]);

    if (addToListFlag) onAddToList(finalVariant, finalProduct, finalBrand);

    // DB writes
    try {
      if (!existingBrand) await createBrand.mutateAsync({ id: brandId, name: brandSearch.trim() });
      if (!existingProduct) await createProduct.mutateAsync({ id: productId, brandId, name: productName.trim() });
      if (!existingVariant) await createVariant.mutateAsync({ id: variantId, productId, name: variantName.trim() });
      // Save product image if available
      if (imageUrl && !existingProduct) {
        const { supabase } = await import("@/lib/supabase");
        if (supabase) await supabase.from("products").update({ image_url: imageUrl }).eq("id", productId).eq("user_id", userId);
      }
      onSaved(finalBrand, finalProduct, finalVariant, addToListFlag, prefill?.barcode);
    } catch {
      // Rollback
      qc.invalidateQueries({ queryKey: ["brands", userId] });
      qc.invalidateQueries({ queryKey: ["products", userId] });
      qc.invalidateQueries({ queryKey: ["variants", userId] });
    } finally {
      setSaving(false);
    }
  }

  const canGoNext = step === "brand" ? !!brandSearch.trim() : step === "product" ? !!productName.trim() : !!variantName.trim();

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }} />

      {/* Sheet */}
      <div className="fade-in" style={{ position: "relative", zIndex: 1, background: "var(--card)", borderRadius: "28px 28px 0 0", padding: "0 0 calc(env(safe-area-inset-bottom,0px) + 20px)", maxHeight: "92vh", overflowY: "auto" }}>
        {/* Handle + header */}
        <div style={{ padding: "14px 20px 0", textAlign: "center" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border)", margin: "0 auto 18px" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {step !== "brand" && (
                <button onClick={() => setStep(step === "variant" ? "product" : "brand")} style={{ background: "none", border: 0, padding: 4, color: "var(--text-muted)", display: "flex" }}>
                  <ChevronLeft size={20} />
                </button>
              )}
              <div>
                <p style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.8 }}>
                  {step === "brand" ? "Step 1 of 3" : step === "product" ? "Step 2 of 3" : "Step 3 of 3"}
                </p>
                <p style={{ fontSize: 20, fontWeight: 950, color: "var(--text)", lineHeight: 1.2 }}>
                  {step === "brand" ? "Select Brand" : step === "product" ? "Product Details" : "Variant & Save"}
                </p>
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: 0, padding: 6, color: "var(--text-muted)", display: "flex" }}>
              <X size={20} />
            </button>
          </div>

          {/* Step progress dots */}
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 14, marginBottom: 2 }}>
            {(["brand", "product", "variant"] as const).map((s) => (
              <div key={s} style={{ height: 4, borderRadius: 2, transition: "all 0.2s ease", background: s === step ? "#ef1d27" : step === "variant" && s === "brand" ? "#61bd45" : step === "product" && s === "brand" ? "#61bd45" : "var(--border)", width: s === step ? 24 : 14 }} />
            ))}
          </div>
        </div>

        <div style={{ padding: "20px 20px 0" }}>

          {/* ── STEP 1: Brand ────────────────────────────────────────────────── */}
          {step === "brand" && (
            <div className="fade-in">
              {prefill?.image && (
                <div style={{ marginBottom: 16, borderRadius: 16, overflow: "hidden", height: 140, position: "relative", background: "var(--bg)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={prefill.image} alt="Product" style={{ width: "100%", height: "100%", objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </div>
              )}
              <div style={{ position: "relative", marginBottom: 14 }}>
                <Search size={16} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
                <input
                  autoFocus
                  value={brandSearch}
                  onChange={(e) => { setBrandSearch(e.target.value); setSelectedBrand(null); }}
                  onKeyDown={(e) => e.key === "Enter" && canGoNext && confirmBrand()}
                  placeholder="Search or type new brand…"
                  style={{ width: "100%", height: 50, borderRadius: 14, border: "1.5px solid var(--border)", background: "var(--bg)", paddingLeft: 40, paddingRight: 14, fontSize: 15, fontWeight: 700, color: "var(--text)", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              {/* Existing brand chips */}
              {filteredBrands.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  {filteredBrands.slice(0, 20).map(b => (
                    <button
                      key={b.id}
                      onClick={() => selectBrand(b)}
                      style={{
                        height: 36, borderRadius: 11, padding: "0 14px", border: "1.5px solid",
                        borderColor: selectedBrand?.id === b.id || brandSearch.toLowerCase() === b.name.toLowerCase() ? "#ef1d27" : "var(--border)",
                        background: selectedBrand?.id === b.id || brandSearch.toLowerCase() === b.name.toLowerCase() ? "#ef1d2712" : "var(--bg)",
                        color: selectedBrand?.id === b.id || brandSearch.toLowerCase() === b.name.toLowerCase() ? "#ef1d27" : "var(--text)",
                        fontWeight: 750, fontSize: 13.5, display: "flex", alignItems: "center", gap: 6,
                        transition: "all 0.12s ease",
                      }}
                    >
                      {b.logo_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.logo_url} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      )}
                      {b.name}
                    </button>
                  ))}
                </div>
              )}

              {isNewBrand && (
                <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 12, background: "#61bd4512", border: "1px solid #61bd4530", display: "flex", alignItems: "center", gap: 8 }}>
                  <Plus size={15} color="#61bd45" />
                  <p style={{ fontSize: 13, fontWeight: 750, color: "#2a8c1a" }}>Create new brand: <strong>{brandSearch.trim()}</strong></p>
                </div>
              )}

              <button
                onClick={confirmBrand}
                disabled={!canGoNext}
                style={{ width: "100%", height: 52, borderRadius: 16, background: canGoNext ? "#ef1d27" : "var(--border)", color: canGoNext ? "#fff" : "var(--text-muted)", border: 0, fontWeight: 850, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.15s ease", boxShadow: canGoNext ? "0 4px 16px #ef1d2740" : "none", marginBottom: 16 }}
              >
                Next <ChevronRight size={18} />
              </button>
            </div>
          )}

          {/* ── STEP 2: Product ──────────────────────────────────────────────── */}
          {step === "product" && (
            <div className="fade-in">
              {/* Brand badge */}
              <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 750, color: "var(--text-muted)" }}>Brand:</span>
                <span style={{ padding: "4px 12px", borderRadius: 8, background: "#0891b214", border: "1px solid #0891b230", fontSize: 13, fontWeight: 800, color: "#0891b2" }}>{brandSearch.trim()}</span>
              </div>

              {/* Product image from barcode */}
              {imageUrl && (
                <div style={{ marginBottom: 14, borderRadius: 14, overflow: "hidden", height: 120, background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt="Product" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }} />
                </div>
              )}

              <label style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.7, display: "block", marginBottom: 8 }}>Product Name</label>
              <input
                autoFocus
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && canGoNext && setStep("variant")}
                placeholder="e.g. Sprite, Maggi Noodles, Lays…"
                style={{ width: "100%", height: 50, borderRadius: 14, border: "1.5px solid var(--border)", background: "var(--bg)", padding: "0 14px", fontSize: 15, fontWeight: 700, color: "var(--text)", outline: "none", boxSizing: "border-box", marginBottom: 16 }}
              />

              {/* Existing products under this brand */}
              {(() => {
                const brandId = brands.find(b => b.name.toLowerCase() === brandSearch.trim().toLowerCase())?.id;
                const brandProducts = brandId ? products.filter(p => p.brand_id === brandId && p.name.toLowerCase().includes(productName.toLowerCase())) : [];
                if (!brandProducts.length) return null;
                return (
                  <div style={{ marginBottom: 14 }}>
                    <p style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Existing products</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                      {brandProducts.slice(0, 10).map(p => (
                        <button key={p.id} onClick={() => { setProductName(p.name); setStep("variant"); }}
                          style={{ height: 34, borderRadius: 10, padding: "0 12px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                          {p.image_url && <img src={p.image_url} alt="" style={{ width: 16, height: 16, objectFit: "contain", borderRadius: 3 }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <button
                onClick={() => setStep("variant")}
                disabled={!canGoNext}
                style={{ width: "100%", height: 52, borderRadius: 16, background: canGoNext ? "#ef1d27" : "var(--border)", color: canGoNext ? "#fff" : "var(--text-muted)", border: 0, fontWeight: 850, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.15s ease", boxShadow: canGoNext ? "0 4px 16px #ef1d2740" : "none", marginBottom: 16 }}
              >
                Next <ChevronRight size={18} />
              </button>
            </div>
          )}

          {/* ── STEP 3: Variant + Save ───────────────────────────────────────── */}
          {step === "variant" && (
            <div className="fade-in">
              {/* Breadcrumb */}
              <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ padding: "4px 10px", borderRadius: 8, background: "#0891b214", fontSize: 12.5, fontWeight: 800, color: "#0891b2" }}>{brandSearch.trim()}</span>
                <ChevronRight size={12} color="var(--text-muted)" />
                <span style={{ padding: "4px 10px", borderRadius: 8, background: "#61bd4514", fontSize: 12.5, fontWeight: 800, color: "#2a8c1a" }}>{productName.trim()}</span>
              </div>

              <label style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.7, display: "block", marginBottom: 8 }}>Variant / Size / Price</label>
              <input
                autoFocus
                value={variantName}
                onChange={(e) => setVariantName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && canGoNext && handleSave()}
                placeholder="e.g. 500ml, 70gm, Rs 20, 2L…"
                style={{ width: "100%", height: 50, borderRadius: 14, border: "1.5px solid var(--border)", background: "var(--bg)", padding: "0 14px", fontSize: 15, fontWeight: 700, color: "var(--text)", outline: "none", boxSizing: "border-box", marginBottom: 16 }}
              />

              {/* Add to list toggle */}
              <button
                onClick={() => setAddToListFlag(f => !f)}
                style={{ width: "100%", height: 48, borderRadius: 14, border: `1.5px solid ${addToListFlag ? "#61bd45" : "var(--border)"}`, background: addToListFlag ? "#61bd4512" : "var(--bg)", display: "flex", alignItems: "center", gap: 10, padding: "0 16px", marginBottom: 16, transition: "all 0.15s ease" }}
              >
                <div style={{ width: 22, height: 22, borderRadius: 7, background: addToListFlag ? "#61bd45" : "var(--border)", display: "grid", placeItems: "center", transition: "all 0.15s ease", flexShrink: 0 }}>
                  {addToListFlag && <Check size={13} color="#fff" strokeWidth={3} />}
                </div>
                <span style={{ fontSize: 14, fontWeight: 750, color: addToListFlag ? "#2a8c1a" : "var(--text-muted)" }}>Also add to shopping list</span>
              </button>

              <button
                onClick={handleSave}
                disabled={!canGoNext || saving}
                style={{ width: "100%", height: 54, borderRadius: 16, background: canGoNext && !saving ? "#ef1d27" : "var(--border)", color: canGoNext && !saving ? "#fff" : "var(--text-muted)", border: 0, fontWeight: 850, fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: canGoNext ? "0 4px 20px #ef1d2750" : "none", marginBottom: 8, transition: "all 0.15s ease" }}
              >
                {saving ? "Saving…" : "Save Product"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultCard({ result, onToggle }: { result: SearchResult; onToggle: () => void }) {
  const imgUrl = result.product.image_url;
  return (
    <div style={{ background: "var(--card)", borderRadius: 17, border: "1.5px solid var(--border)", padding: "13px 14px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 2px 10px rgba(7,20,38,0.04)" }}>
      {imgUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imgUrl} alt={result.product.name} style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 10, background: "var(--bg)", flexShrink: 0 }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 10.5, fontWeight: 750, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.6 }}>{result.brand.name}</p>
        <p style={{ fontSize: 15, fontWeight: 850, color: "var(--text)", lineHeight: 1.2, marginTop: 1 }}>{result.product.name}</p>
        <p style={{ fontSize: 12.5, fontWeight: 700, color: "#0891b2", marginTop: 3 }}>{result.variant.name}</p>
      </div>
      <button
        onClick={onToggle}
        style={{
          flexShrink: 0, height: 38, minWidth: 90, borderRadius: 12,
          border: result.inList ? "1.5px solid #61bd45" : "1.5px solid #ef1d27",
          background: result.inList ? "#61bd4518" : "#ef1d2718",
          color: result.inList ? "#2a8c1a" : "#ef1d27",
          fontWeight: 850, fontSize: 13,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          transition: "all 0.15s ease",
        }}
      >
        {result.inList ? <><Check size={14} /> Added</> : "+ Add"}
      </button>
    </div>
  );
}

function Chip({ label, value, color }: { label: string; value: string; color: string }) {
  if (!value) return null;
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", background: `${color}14`, borderRadius: 9, padding: "3px 9px", border: `1px solid ${color}22` }}>
      <span style={{ fontSize: 8.5, fontWeight: 850, color, textTransform: "uppercase", letterSpacing: 0.7 }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text)", lineHeight: 1.2 }}>{value}</span>
    </span>
  );
}

function StatBtn({ label, value, color, onClick }: { label: string; value: number; color: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{ padding: "15px 0 18px", textAlign: "center", background: "none", border: 0, cursor: onClick ? "pointer" : "default" }}>
      <p style={{ fontSize: 22, lineHeight: 1, fontWeight: 950, color }}>{value}</p>
      <p style={{ marginTop: 4, fontSize: 9, fontWeight: 850, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.7 }}>{label}</p>
    </button>
  );
}

function HeroFX() {
  return (
    <>
      <span style={{ position: "absolute", top: "-24%", right: "-15%", width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle,rgba(239,29,39,0.16),transparent 70%)", filter: "blur(34px)", animation: "auroraA 7s ease-in-out infinite", pointerEvents: "none" }} />
      <span style={{ position: "absolute", bottom: "-22%", left: "-10%", width: 210, height: 210, borderRadius: "50%", background: "radial-gradient(circle,rgba(8,145,178,0.13),transparent 70%)", filter: "blur(30px)", animation: "auroraB 10s ease-in-out infinite 2s", pointerEvents: "none" }} />
    </>
  );
}
