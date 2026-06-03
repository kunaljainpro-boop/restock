"use client";

import { Edit2, Image as ImageIcon, Plus, ScanBarcode, Search, Trash2, X, Printer, Check, Save } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import {
  useBrands, useProducts, useVariants,
  useCreateBrand, useUpdateBrand, useDeleteBrand,
  useCreateProduct, useUpdateProduct, useDeleteProduct,
  useCreateVariant, useUpdateVariant, useDeleteVariant,
  useBarcodes, lookupBarcode,
  useMarketList, useAddToList, useRemoveFromList,
} from "@/lib/use-db";
import { useQueryClient } from "@tanstack/react-query";
import { BarcodeScanner } from "./BarcodeScanner";
import { useToast } from "@/lib/toast-context";
import { fuzzyFind } from "@/lib/fuzzy";
import type { Brand, MarketListItemFull, Product, Variant } from "@/lib/types";
import { ImgWithFallback } from "./ImgWithFallback";

interface Props { userId: string; }

export function BrandsTab({ userId }: Props) {
  const { data: brands = [], isLoading } = useBrands(userId);
  const { data: products = [] } = useProducts(userId);
  const { data: variants = [] } = useVariants(userId);
  const { data: listItems = [] } = useMarketList(userId);
  const { data: barcodes = [] } = useBarcodes(userId);
  const createBrand = useCreateBrand(userId);
  const { toast } = useToast();

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Brand | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [addingBrand, setAddingBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");

  const filtered = query.trim() ? fuzzyFind(brands, query, b => b.name, 0.35) : brands;

  async function handleBarcode(barcode: string) {
    setShowScanner(false);
    const local = barcodes.find(b => b.barcode === barcode);
    if (local?.variant_id) {
      const v = variants.find(x => x.id === local.variant_id);
      const p = products.find(x => x.id === v?.product_id);
      const br = brands.find(x => x.id === p?.brand_id);
      if (br) { setSelected(br); return; }
    }
    const info = await lookupBarcode(barcode);
    if (info?.brand) setQuery(info.brand);
    toast(info ? "Barcode found" : "Unknown barcode", info ? "info" : "error");
  }

  async function saveBrand() {
    if (!newBrandName.trim()) return;
    await createBrand.mutateAsync({ id: crypto.randomUUID(), name: newBrandName.trim() });
    toast(`"${newBrandName.trim()}" added ✓`);
    setNewBrandName("");
    setAddingBrand(false);
  }

  // Keep selected brand in sync with cache updates
  useEffect(() => {
    if (selected) {
      const updated = brands.find(b => b.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [brands]);

  return (
    <div style={{ minHeight: "100%", background: "#eef0f8" }}>
      <div className="fade-in" style={{ padding: "calc(env(safe-area-inset-top,0px) + 14px) 14px 28px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 950, color: "#1a1a3e", lineHeight: 1 }}>Brands</h1>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginTop: 2 }}>
              {brands.length} brand{brands.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={() => { setAddingBrand(true); setNewBrandName(""); }}
            style={{ width: 40, height: 40, borderRadius: 13, background: "#4f46e5", border: 0, display: "grid", placeItems: "center", color: "#fff", boxShadow: "0 4px 14px #4f46e540" }}
          >
            <Plus size={20} />
          </button>
        </div>

        {/* ── Add Brand inline ── */}
        {addingBrand && (
          <div className="fade-in" style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #c7d2fe", padding: "12px", marginBottom: 14, display: "flex", gap: 8 }}>
            <input
              autoFocus
              value={newBrandName}
              onChange={e => setNewBrandName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveBrand(); if (e.key === "Escape") setAddingBrand(false); }}
              placeholder="Brand name…"
              style={{ flex: 1, height: 40, borderRadius: 11, border: "1.5px solid #e5e7eb", background: "#f9fafb", padding: "0 12px", fontSize: 14, fontWeight: 600, color: "#1a1a3e", outline: "none" }}
            />
            <button onClick={saveBrand} style={{ height: 40, borderRadius: 11, background: "#4f46e5", color: "#fff", border: 0, padding: "0 16px", fontWeight: 800, fontSize: 13 }}>Save</button>
            <button onClick={() => setAddingBrand(false)} style={{ height: 40, width: 40, borderRadius: 11, background: "#f4f4f8", color: "#9ca3af", border: 0, fontWeight: 800, fontSize: 16 }}>✕</button>
          </div>
        )}

        {/* ── Search + Scanner ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", pointerEvents: "none" }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search brands, products…"
              style={{ width: "100%", height: 44, borderRadius: 14, border: "1.5px solid rgba(0,0,0,0.07)", background: "#fff", paddingLeft: 34, paddingRight: query ? 34 : 12, fontSize: 14, fontWeight: 600, color: "#1a1a3e", outline: "none", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}
            />
            {query && <button onClick={() => setQuery("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: 0, color: "#9ca3af" }}><X size={15} /></button>}
          </div>
          <button onClick={() => setShowScanner(true)} style={{ width: 44, height: 44, borderRadius: 14, border: "1.5px solid rgba(0,0,0,0.07)", background: "#fff", display: "grid", placeItems: "center", color: "#4f46e5", flexShrink: 0, boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
            <ScanBarcode size={20} />
          </button>
        </div>

        {/* ── Brands Grid ── */}
        {isLoading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
            {[...Array(10)].map((_, i) => <div key={i} className="skeleton" style={{ borderRadius: 16, aspectRatio: "1/1.15" }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 24px" }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: "#1a1a3e", marginBottom: 6 }}>{query ? "No results" : "No brands yet"}</p>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#9ca3af" }}>{query ? `No match for "${query}"` : "Tap + to add"}</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
            {filtered.map(brand => <BrandCard key={brand.id} brand={brand} onClick={() => setSelected(brand)} />)}
          </div>
        )}
      </div>

      {/* ── Brand Sheet ── */}
      {selected && (
        <BrandSheet
          userId={userId}
          brand={selected}
          products={products.filter(p => p.brand_id === selected.id)}
          allVariants={variants}
          listItems={listItems}
          onClose={() => setSelected(null)}
          toast={toast}
        />
      )}

      {showScanner && <BarcodeScanner onDetected={handleBarcode} onClose={() => setShowScanner(false)} />}
    </div>
  );
}

/* ─── Brand Card ─────────────────────────────────────────────────────────────── */
function BrandCard({ brand, onClick }: { brand: Brand; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ background: "#fff", borderRadius: 16, border: "1px solid rgba(0,0,0,0.07)", padding: "8px 5px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", minHeight: 90 }}
    >
      {/* Logo fills the full card width, no extra white padding */}
      <div style={{ width: "calc(100% - 4px)", aspectRatio: "1/1", borderRadius: 10, overflow: "hidden", display: "grid", placeItems: "center", maxWidth: 64 }}>
        <ImgWithFallback
          src={brand.logo_url}
          alt={brand.name}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          fallbackStyle={{ fontSize: 22 }}
        />
      </div>
      <span style={{ fontSize: 8.5, fontWeight: 900, color: "#1a1a3e", textTransform: "uppercase", letterSpacing: 0.3, textAlign: "center", lineHeight: 1.25, wordBreak: "break-word", maxWidth: "100%", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
        {brand.name}
      </span>
    </button>
  );
}

/* ─── Brand Sheet ────────────────────────────────────────────────────────────── */
function BrandSheet({ userId, brand, products, allVariants, listItems, onClose, toast }: {
  userId: string;
  brand: Brand;
  products: Product[];
  allVariants: Variant[];
  listItems: MarketListItemFull[];
  onClose: () => void;
  toast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const qc = useQueryClient();
  const updateBrand   = useUpdateBrand(userId);
  const deleteBrand   = useDeleteBrand(userId);
  const createProduct = useCreateProduct(userId);
  const updateProduct = useUpdateProduct(userId);
  const deleteProduct = useDeleteProduct(userId);
  const createVariant = useCreateVariant(userId);
  const updateVariant = useUpdateVariant(userId);
  const deleteVariant = useDeleteVariant(userId);
  const addToList     = useAddToList(userId);
  const removeFromList = useRemoveFromList(userId);

  // Header edit states
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal]         = useState(brand.name);
  const [editingLogo, setEditingLogo] = useState(false);
  const [logoVal, setLogoVal]         = useState(brand.logo_url ?? "");

  // Add product state
  const [addingProduct, setAddingProduct] = useState(false);
  const [newProdName, setNewProdName]     = useState("");

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync name/logo when brand prop changes
  useEffect(() => { setNameVal(brand.name); }, [brand.name]);
  useEffect(() => { setLogoVal(brand.logo_url ?? ""); }, [brand.logo_url]);

  const listVariantIds = new Set(listItems.map(i => i.variant_id));
  const variantCount = products.reduce((s, p) => s + allVariants.filter(v => v.product_id === p.id).length, 0);

  // ── Name save ──
  async function saveName() {
    if (!nameVal.trim() || nameVal === brand.name) { setEditingName(false); return; }
    await updateBrand.mutateAsync({ id: brand.id, name: nameVal.trim() });
    toast("Brand renamed ✓");
    setEditingName(false);
  }

  // ── Logo save ──
  async function saveLogo() {
    await updateBrand.mutateAsync({ id: brand.id, logo_url: logoVal.trim() || null });
    toast("Logo updated ✓");
    setEditingLogo(false);
  }

  // ── Print toggle (instant) ──
  async function togglePrint() {
    await updateBrand.mutateAsync({ id: brand.id, print_enabled: !brand.print_enabled });
    toast(brand.print_enabled ? "Removed from print" : "Added to print ✓");
  }

  // ── Add product ──
  async function addProduct() {
    if (!newProdName.trim()) return;
    await createProduct.mutateAsync({ id: crypto.randomUUID(), brandId: brand.id, name: newProdName.trim() });
    toast(`"${newProdName.trim()}" added ✓`);
    setNewProdName("");
    // Keep form open for fast batch adding
  }

  // ── Delete brand ──
  async function handleDelete() {
    await deleteBrand.mutateAsync(brand.id);
    onClose();
    toast("Brand deleted");
  }

  // ── Variant list toggle (instant) ──
  function toggleVariant(variant: Variant, product: Product) {
    const listItemId = crypto.randomUUID();
    if (listVariantIds.has(variant.id)) {
      qc.setQueryData(["list", userId], (old: MarketListItemFull[]) =>
        old?.filter(i => i.variant_id !== variant.id) ?? []
      );
      removeFromList.mutate(variant.id, { onError: () => qc.invalidateQueries({ queryKey: ["list", userId] }) });
      toast("Removed from list");
    } else {
      const now = new Date().toISOString();
      const item: MarketListItemFull = {
        id: listItemId, user_id: userId, variant_id: variant.id,
        added_at: now, completed_at: null,
        variant: { ...variant, product: { ...product, brand } },
      };
      qc.setQueryData(["list", userId], (old: MarketListItemFull[]) => [item, ...(old ?? [])]);
      addToList.mutate({ variantId: variant.id, listItemId }, { onError: () => qc.invalidateQueries({ queryKey: ["list", userId] }) });
      toast("Added to list ✓");
    }
  }

  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  function onTouchStart(e: React.TouchEvent) { dragStartY.current = e.touches[0].clientY; }
  function onTouchEnd(e: React.TouchEvent) { if (e.changedTouches[0].clientY - dragStartY.current > 80) onClose(); }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(7,20,38,0.5)", zIndex: 100, backdropFilter: "blur(3px)" }} />
      <div
        ref={sheetRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 480, margin: "0 auto", background: "var(--bg)", borderRadius: "26px 26px 0 0", zIndex: 101, display: "flex", flexDirection: "column", maxHeight: "94dvh", animation: "sheetUp 0.28s cubic-bezier(0.2,0.9,0.3,1) both" }}
      >
        {/* ── Top bar: handle + close ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "12px 16px 8px", flexShrink: 0, position: "relative" }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: "var(--border)" }} />
          <button onClick={onClose} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", width: 32, height: 32, borderRadius: 99, background: "#ef1d27", border: 0, display: "grid", placeItems: "center", color: "#fff", boxShadow: "0 3px 10px #ef1d2755" }}>
            <X size={16} strokeWidth={2.8} />
          </button>
        </div>

        {/* ── Brand header card ── */}
        <div style={{ margin: "0 14px 12px", background: "var(--card)", borderRadius: 22, border: "1.5px solid var(--border)", overflow: "hidden", flexShrink: 0, boxShadow: "0 4px 20px rgba(7,20,38,0.07)" }}>
          {/* Brand identity row */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 16px 12px" }}>
            <button
              onClick={() => { setEditingLogo(v => !v); setLogoVal(brand.logo_url ?? ""); }}
              style={{ width: 60, height: 60, borderRadius: 16, overflow: "hidden", display: "grid", placeItems: "center", background: "var(--bg)", flexShrink: 0, border: editingLogo ? "2px solid #4f46e5" : "1.5px solid var(--border)", position: "relative" }}
            >
              <ImgWithFallback src={brand.logo_url} alt={brand.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} fallbackStyle={{ fontSize: 24 }} />
              <span style={{ position: "absolute", bottom: 2, right: 2, width: 16, height: 16, borderRadius: 5, background: "rgba(79,70,229,0.9)", display: "grid", placeItems: "center" }}>
                <ImageIcon size={9} color="#fff" />
              </span>
            </button>

            <div style={{ flex: 1, minWidth: 0 }}>
              {editingName ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input autoFocus value={nameVal} onChange={e => setNameVal(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                    style={{ flex: 1, fontSize: 18, fontWeight: 900, color: "var(--text)", background: "var(--bg)", border: "1.5px solid #4f46e5", borderRadius: 10, padding: "5px 10px", outline: "none" }}
                  />
                  <button onClick={saveName} style={{ width: 36, height: 36, borderRadius: 10, background: "#4f46e5", color: "#fff", border: 0, display: "grid", placeItems: "center" }}><Check size={16} /></button>
                  <button onClick={() => { setEditingName(false); setNameVal(brand.name); }} style={{ width: 36, height: 36, borderRadius: 10, background: "var(--bg)", color: "var(--text-muted)", border: "1.5px solid var(--border)", display: "grid", placeItems: "center" }}><X size={16} /></button>
                </div>
              ) : (
                <button onClick={() => setEditingName(true)} style={{ background: "none", border: 0, padding: 0, textAlign: "left", display: "flex", alignItems: "center", gap: 6 }}>
                  <h2 style={{ fontSize: 22, fontWeight: 950, color: "var(--text)", lineHeight: 1 }}>{brand.name}</h2>
                  <Edit2 size={13} color="var(--text-muted)" />
                </button>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <p style={{ fontSize: 12, fontWeight: 650, color: "var(--text-muted)" }}>
                  {products.length} products · {variantCount} variants
                </p>
              </div>
            </div>

            {/* Delete — small, tucked in corner */}
            {confirmDelete ? (
              <div className="fade-in" style={{ display: "flex", gap: 6 }}>
                <button onClick={handleDelete} style={{ height: 34, borderRadius: 10, background: "#ef4444", color: "#fff", border: 0, padding: "0 14px", fontWeight: 800, fontSize: 12 }}>Delete</button>
                <button onClick={() => setConfirmDelete(false)} style={{ height: 34, width: 34, borderRadius: 10, background: "var(--bg)", color: "var(--text-muted)", border: "1.5px solid var(--border)", display: "grid", placeItems: "center" }}><X size={14} /></button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} style={{ width: 34, height: 34, borderRadius: 10, background: "#fff1f2", border: "1.5px solid #fecdd3", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <Trash2 size={15} color="#ef4444" />
              </button>
            )}
          </div>

          {/* Logo URL input */}
          {editingLogo && (
            <div className="fade-in" style={{ borderTop: "1px solid var(--border)", padding: "10px 14px", display: "flex", gap: 8 }}>
              <input autoFocus value={logoVal} onChange={e => setLogoVal(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveLogo(); if (e.key === "Escape") setEditingLogo(false); }}
                placeholder="Paste brand logo URL…"
                style={{ flex: 1, height: 38, borderRadius: 10, border: "1.5px solid #c7d2fe", background: "var(--bg)", padding: "0 10px", fontSize: 13, fontWeight: 600, color: "var(--text)", outline: "none" }}
              />
              <button onClick={saveLogo} style={{ height: 38, borderRadius: 10, background: "#4f46e5", color: "#fff", border: 0, padding: "0 14px", fontWeight: 800, fontSize: 13 }}>Save</button>
              <button onClick={() => setEditingLogo(false)} style={{ height: 38, width: 38, borderRadius: 10, background: "var(--bg)", color: "var(--text-muted)", border: "1.5px solid var(--border)" }}>✕</button>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 10, padding: "0 14px 14px" }}>
            <button
              onClick={() => { setAddingProduct(v => !v); setNewProdName(""); }}
              style={{ flex: 1, height: 42, borderRadius: 13, background: addingProduct ? "var(--bg)" : "#4f46e5", color: addingProduct ? "#4f46e5" : "#fff", border: addingProduct ? "1.5px solid #c7d2fe" : 0, fontWeight: 850, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, boxShadow: addingProduct ? "none" : "0 4px 14px #4f46e540" }}
            >
              <Plus size={16} /> {addingProduct ? "Adding…" : "Add Product"}
            </button>
            <button
              onClick={togglePrint}
              style={{ height: 42, borderRadius: 13, background: brand.print_enabled ? "#ecfdf5" : "var(--bg)", color: brand.print_enabled ? "#059669" : "var(--text-muted)", border: brand.print_enabled ? "1.5px solid #a7f3d0" : "1.5px solid var(--border)", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "0 16px" }}
            >
              <Printer size={15} /> {brand.print_enabled ? "In Print" : "No Print"}
            </button>
          </div>

          {/* Add product form */}
          {addingProduct && (
            <div className="fade-in" style={{ borderTop: "1px solid var(--border)", padding: "12px 14px 14px" }}>
              <p style={{ fontSize: 10.5, fontWeight: 850, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>New Product</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input autoFocus value={newProdName} onChange={e => setNewProdName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addProduct(); if (e.key === "Escape") setAddingProduct(false); }}
                  placeholder="Product name…"
                  style={{ flex: 1, height: 42, borderRadius: 12, border: "1.5px solid #c7d2fe", background: "var(--bg)", padding: "0 12px", fontSize: 14, fontWeight: 600, color: "var(--text)", outline: "none" }}
                />
                <button onClick={addProduct} style={{ height: 42, borderRadius: 12, background: "#4f46e5", color: "#fff", border: 0, padding: "0 18px", fontWeight: 850, fontSize: 14 }}>Add</button>
                <button onClick={() => setAddingProduct(false)} style={{ height: 42, width: 42, borderRadius: 12, background: "var(--bg)", color: "var(--text-muted)", border: "1.5px solid var(--border)", fontSize: 16 }}>✕</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Product List ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(env(safe-area-inset-bottom,0px) + 20px)" }}>
          {products.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 24px" }}>
              <p style={{ fontSize: 15, fontWeight: 750, color: "var(--text)" }}>No products yet</p>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Tap "Add Product" above</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {products.map(product => (
                <ProductCard
                  key={product.id}
                  brand={brand}
                  product={product}
                  variants={allVariants.filter(v => v.product_id === product.id)}
                  listVariantIds={listVariantIds}
                  onToggleVariant={v => toggleVariant(v, product)}
                  updateProduct={updateProduct}
                  deleteProduct={deleteProduct}
                  createVariant={createVariant}
                  updateVariant={updateVariant}
                  deleteVariant={deleteVariant}
                  toast={toast}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Product Card ───────────────────────────────────────────────────────────── */
function ProductCard({ brand, product, variants, listVariantIds, onToggleVariant, updateProduct, deleteProduct, createVariant, updateVariant, deleteVariant, toast }: {
  brand: Brand; product: Product; variants: Variant[];
  listVariantIds: Set<string>;
  onToggleVariant: (v: Variant) => void;
  updateProduct: ReturnType<typeof useUpdateProduct>;
  deleteProduct:  ReturnType<typeof useDeleteProduct>;
  createVariant:  ReturnType<typeof useCreateVariant>;
  updateVariant:  ReturnType<typeof useUpdateVariant>;
  deleteVariant:  ReturnType<typeof useDeleteVariant>;
  toast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [editName, setEditName]             = useState(false);
  const [nameVal, setNameVal]               = useState(product.name);
  const [editingLogo, setEditingLogo]       = useState(false);
  const [logoVal, setLogoVal]               = useState(product.image_url ?? "");
  const [newVar, setNewVar]                 = useState("");
  const [editingVarId, setEditingVarId]     = useState<string | null>(null);
  const [editingVarVal, setEditingVarVal]   = useState("");
  const [showDelete, setShowDelete]         = useState(false);
  // Variant delete — needs double tap to confirm
  const [confirmDeleteVarId, setConfirmDeleteVarId] = useState<string | null>(null);
  // Local pending variants — guarantee instant display before parent cache propagates
  const [pending, setPending]             = useState<Variant[]>([]);

  useEffect(() => { setNameVal(product.name); }, [product.name]);
  useEffect(() => { setLogoVal(product.image_url ?? ""); }, [product.image_url]);

  // Merge prop variants + pending (dedup by id)
  const propIds = new Set(variants.map(v => v.id));
  const displayVariants = [...variants, ...pending.filter(v => !propIds.has(v.id))];

  async function saveName() {
    if (!nameVal.trim() || nameVal === product.name) { setEditName(false); return; }
    await updateProduct.mutateAsync({ id: product.id, name: nameVal.trim() });
    toast("Renamed ✓"); setEditName(false);
  }

  async function saveImage() {
    await updateProduct.mutateAsync({ id: product.id, image_url: logoVal.trim() || null });
    toast("Image updated ✓"); setEditingLogo(false);
  }

  async function addVariant() {
    if (!newVar.trim()) return;
    const id = crypto.randomUUID();
    const name = newVar.trim();
    // Instant local display BEFORE anything async
    const tempVar: Variant = { id, user_id: "", product_id: product.id, name, created_at: new Date().toISOString() };
    setPending(p => [...p, tempVar]);
    setNewVar("");
    try {
      await createVariant.mutateAsync({ id, productId: product.id, name });
      // Parent cache now has it — remove from pending
      setPending(p => p.filter(v => v.id !== id));
      toast("Variant added ✓");
    } catch {
      setPending(p => p.filter(v => v.id !== id));
      toast("Failed to add variant", "error");
    }
  }

  async function saveVariant(id: string) {
    if (!editingVarVal.trim()) { setEditingVarId(null); return; }
    await updateVariant.mutateAsync({ id, name: editingVarVal.trim() });
    setEditingVarId(null); toast("Updated ✓");
  }

  async function removeVariant(id: string) {
    if (confirmDeleteVarId !== id) {
      // First tap — show confirm state, auto-reset after 3s
      setConfirmDeleteVarId(id);
      setTimeout(() => setConfirmDeleteVarId(null), 3000);
      return;
    }
    // Second tap — actually delete
    setConfirmDeleteVarId(null);
    await deleteVariant.mutateAsync(id);
    toast("Variant deleted");
  }

  return (
    <div style={{ background: "#fff", borderRadius: 18, border: "1px solid rgba(0,0,0,0.07)", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
      {/* Product header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px 8px" }}>
        {/* Product image (if available) or brand logo fallback */}
        <button
          onClick={() => { setEditingLogo(v => !v); setLogoVal(product.image_url ?? ""); }}
          style={{ width: 72, height: 72, borderRadius: 16, overflow: "hidden", display: "grid", placeItems: "center", background: "#f4f4f8", flexShrink: 0, border: editingLogo ? "2px solid #4f46e5" : "1px solid rgba(0,0,0,0.07)", position: "relative", marginLeft: -8 }}
        >
          {product.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image_url} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <ImgWithFallback src={brand.logo_url} alt={brand.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} fallbackStyle={{ fontSize: 16 }} />
          )}
          {/* edit overlay hint */}
          <span style={{ position: "absolute", bottom: 2, right: 2, width: 14, height: 14, borderRadius: 4, background: "rgba(79,70,229,0.85)", display: "grid", placeItems: "center" }}>
            <ImageIcon size={8} color="#fff" />
          </span>
        </button>

        {/* Product name */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editName ? (
            <div style={{ display: "flex", gap: 5 }}>
              <input
                autoFocus
                value={nameVal}
                onChange={e => setNameVal(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditName(false); }}
                style={{ flex: 1, fontSize: 12.5, fontWeight: 800, color: "#374151", textTransform: "uppercase", letterSpacing: 0.5, background: "#f4f4f8", border: "1.5px solid #4f46e5", borderRadius: 8, padding: "3px 8px", outline: "none" }}
              />
              <button onClick={saveName} style={{ width: 28, height: 28, borderRadius: 8, background: "#4f46e5", color: "#fff", border: 0, display: "grid", placeItems: "center" }}><Check size={13} /></button>
              <button onClick={() => { setEditName(false); setNameVal(product.name); }} style={{ width: 28, height: 28, borderRadius: 8, background: "#f4f4f8", color: "#9ca3af", border: 0, display: "grid", placeItems: "center" }}><X size={13} /></button>
            </div>
          ) : (
            <button onClick={() => setEditName(true)} style={{ background: "none", border: 0, padding: 0, display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: "#374151", textTransform: "uppercase", letterSpacing: 0.5 }}>{product.name}</span>
              <Edit2 size={11} color="#c4c9d4" />
            </button>
          )}
          <p style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginTop: 2 }}>{brand.name}</p>
        </div>

        {/* Delete */}
        <button onClick={() => setShowDelete(v => !v)} style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid rgba(0,0,0,0.1)", background: showDelete ? "#fef2f2" : "#f9fafb", display: "grid", placeItems: "center", color: showDelete ? "#ef4444" : "#9ca3af", flexShrink: 0 }}>
          <Trash2 size={13} />
        </button>
      </div>

      {/* Image URL input (inline) */}
      {editingLogo && (
        <div className="fade-in" style={{ padding: "0 12px 10px", display: "flex", gap: 6, alignItems: "center" }}>
          <ImageIcon size={14} color="#9ca3af" style={{ flexShrink: 0 }} />
          <input
            autoFocus
            value={logoVal}
            onChange={e => setLogoVal(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") saveImage(); if (e.key === "Escape") setEditingLogo(false); }}
            placeholder="Paste product image URL…"
            style={{ flex: 1, height: 34, borderRadius: 9, border: "1.5px solid #c7d2fe", background: "#eef2ff", padding: "0 9px", fontSize: 12.5, fontWeight: 600, color: "#1a1a3e", outline: "none" }}
          />
          <button onClick={saveImage} style={{ height: 34, borderRadius: 9, background: "#4f46e5", color: "#fff", border: 0, padding: "0 12px", fontWeight: 800, fontSize: 12 }}>Save</button>
          <button onClick={() => setEditingLogo(false)} style={{ height: 34, width: 34, borderRadius: 9, background: "#f4f4f8", color: "#9ca3af", border: 0 }}>✕</button>
        </div>
      )}

      {/* Delete product confirm */}
      {showDelete && (
        <div className="fade-in" style={{ padding: "0 12px 10px", display: "flex", gap: 6, alignItems: "center" }}>
          <p style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "#374151" }}>Delete this product?</p>
          <button onClick={async () => { await deleteProduct.mutateAsync(product.id); toast("Deleted"); }} style={{ height: 32, borderRadius: 9, background: "#ef4444", color: "#fff", border: 0, padding: "0 14px", fontWeight: 800, fontSize: 12 }}>Delete</button>
          <button onClick={() => setShowDelete(false)} style={{ height: 32, borderRadius: 9, background: "#f4f4f8", color: "#6b7280", border: 0, padding: "0 10px", fontWeight: 800, fontSize: 12 }}>No</button>
        </div>
      )}

      {/* ── Variants ── */}
      <div style={{ padding: "0 12px 12px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: displayVariants.length ? 8 : 0 }}>
          {displayVariants.map(v => {
            const inList = listVariantIds.has(v.id);
            if (editingVarId === v.id) {
              return (
                <div key={v.id} style={{ display: "flex", gap: 4 }}>
                  <input
                    autoFocus
                    value={editingVarVal}
                    onChange={e => setEditingVarVal(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveVariant(v.id); if (e.key === "Escape") setEditingVarId(null); }}
                    style={{ height: 30, borderRadius: 8, border: "1.5px solid #4f46e5", padding: "0 8px", fontSize: 12, fontWeight: 700, color: "#1a1a3e", outline: "none", width: 80, background: "#eef2ff" }}
                  />
                  <button onClick={() => saveVariant(v.id)} style={{ height: 30, borderRadius: 8, background: "#4f46e5", color: "#fff", border: 0, padding: "0 8px", fontWeight: 800, fontSize: 12 }}><Check size={12} /></button>
                  <button onClick={() => setEditingVarId(null)} style={{ height: 30, borderRadius: 8, background: "#f4f4f8", color: "#9ca3af", border: 0, padding: "0 8px", fontWeight: 800, fontSize: 12 }}>✕</button>
                </div>
              );
            }
            return (
              <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <button
                  onClick={() => onToggleVariant(v)}
                  style={{ height: 30, borderRadius: 8, padding: "0 11px", fontSize: 12, fontWeight: 800, background: inList ? "#059669" : "#4f46e5", color: "#fff", border: 0, display: "flex", alignItems: "center", gap: 4, transition: "background 0.15s" }}
                >
                  {inList && <Check size={11} />}{v.name}
                </button>
                <button
                  onClick={() => { setEditingVarId(v.id); setEditingVarVal(v.name); }}
                  style={{ width: 22, height: 22, borderRadius: 6, background: "none", border: 0, display: "grid", placeItems: "center", color: "#c4c9d4" }}
                >
                  <Edit2 size={11} />
                </button>
                <button
                  onClick={() => removeVariant(v.id)}
                  title={confirmDeleteVarId === v.id ? "Tap again to confirm delete" : "Delete variant"}
                  style={{
                    height: 22,
                    borderRadius: 6,
                    background: confirmDeleteVarId === v.id ? "#ef4444" : "none",
                    border: confirmDeleteVarId === v.id ? 0 : 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: confirmDeleteVarId === v.id ? "0 6px" : "0",
                    gap: 3,
                    color: confirmDeleteVarId === v.id ? "#fff" : "#fca5a5",
                    fontSize: 10,
                    fontWeight: 800,
                    transition: "all 0.15s ease",
                    whiteSpace: "nowrap",
                  }}
                >
                  {confirmDeleteVarId === v.id ? "Delete?" : <X size={11} />}
                </button>
              </div>
            );
          })}
        </div>

        {/* Add variant inline — always visible */}
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={newVar}
            onChange={e => setNewVar(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addVariant()}
            placeholder="+ Add variant…"
            style={{ flex: 1, height: 30, borderRadius: 8, border: "1.5px dashed #c7d2fe", background: "#f5f7ff", padding: "0 9px", fontSize: 12, fontWeight: 600, color: "#4f46e5", outline: "none" }}
          />
          {newVar.trim() && (
            <button onClick={addVariant} style={{ height: 30, borderRadius: 8, background: "#4f46e5", color: "#fff", border: 0, padding: "0 12px", fontWeight: 800, fontSize: 12 }}>Add</button>
          )}
        </div>
      </div>
    </div>
  );
}
