"use client";

import { Check, ChevronDown, Plus, X } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fuzzyFind, similarity } from "@/lib/fuzzy";
import {
  useBrands, useProducts, useVariants,
  useAddToList, smartCreateSync,
} from "@/lib/use-db";
import { useToast } from "@/lib/toast-context";
import type { Brand, Product, Variant } from "@/lib/types";

interface Props {
  userId: string;
  prefill?: { brand?: string; product?: string; variant?: string; barcode?: string };
  onClose: () => void;
  onSaved?: (variantId: string) => void;
}

export function AddProductModal({ userId, prefill, onClose, onSaved }: Props) {
  const { data: brands = [] } = useBrands(userId);
  const { data: products = [] } = useProducts(userId);
  const { data: variants = [] } = useVariants(userId);
  const addToList = useAddToList(userId);
  const qc = useQueryClient();
  const { toast } = useToast();

  const [brandQuery, setBrandQuery]       = useState(prefill?.brand ?? "");
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(
    () => brands.find(b => similarity(b.name, prefill?.brand ?? "") >= 0.9) ?? null
  );
  const [showBrandDrop, setShowBrandDrop] = useState(false);
  const [productName, setProductName]     = useState(prefill?.product ?? "");
  const [variantName, setVariantName]     = useState(prefill?.variant ?? "");
  const [saving, setSaving]               = useState(false);
  const brandRef = useRef<HTMLInputElement>(null);

  // Filtered brand list
  const filteredBrands = brandQuery.trim()
    ? fuzzyFind(brands, brandQuery, b => b.name, 0.3)
    : brands;

  const isNewBrand = brandQuery.trim() &&
    !brands.some(b => similarity(b.name, brandQuery.trim()) >= 0.88);

  const displayBrand = selectedBrand?.name ?? brandQuery;
  const canSave = displayBrand.trim() && productName.trim() && variantName.trim();

  function selectBrand(b: Brand) {
    setSelectedBrand(b);
    setBrandQuery(b.name);
    setShowBrandDrop(false);
  }

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);

    const finalBrand = selectedBrand ?? null;
    const bName  = finalBrand?.name ?? brandQuery.trim();
    const pName  = productName.trim();
    const vName  = variantName.trim();
    const now    = new Date().toISOString();

    // Generate IDs
    const brandId   = finalBrand?.id ?? crypto.randomUUID();
    const productId = (() => {
      if (finalBrand) {
        return products.find(p => p.brand_id === finalBrand.id && similarity(p.name, pName) >= 0.85)?.id
          ?? crypto.randomUUID();
      }
      return crypto.randomUUID();
    })();
    const variantId = (() => {
      return variants.find(v => v.product_id === productId && similarity(v.name, vName) >= 0.85)?.id
        ?? crypto.randomUUID();
    })();
    const listItemId = crypto.randomUUID();

    const newBrand: Brand   = finalBrand ?? { id: brandId,   user_id: userId, name: bName, logo_url: null, print_enabled: true, created_at: now };
    const existProduct      = products.find(p => p.id === productId);
    const newProduct: Product = existProduct ?? { id: productId, user_id: userId, brand_id: brandId, name: pName, image_url: null, created_at: now };
    const existVariant      = variants.find(v => v.id === variantId);
    const newVariant: Variant = existVariant ?? { id: variantId, user_id: userId, product_id: productId, name: vName, created_at: now };

    // Optimistic cache update
    if (!finalBrand) {
      qc.setQueryData(["brands", userId], (old: Brand[]) => [...(old ?? []), newBrand].sort((a,b) => a.name.localeCompare(b.name)));
    }
    if (!existProduct) {
      qc.setQueryData(["products", userId], (old: Product[]) => [...(old ?? []), newProduct]);
    }
    if (!existVariant) {
      qc.setQueryData(["variants", userId], (old: Variant[]) => [...(old ?? []), newVariant]);
    }

    // Add to list optimistically
    qc.setQueryData(["list", userId], (old: unknown[]) => [{
      id: listItemId, user_id: userId, variant_id: variantId,
      added_at: now, completed_at: null,
      variant: { ...newVariant, product: { ...newProduct, brand: newBrand } },
    }, ...(old ?? [])]);

    toast(`✓ ${bName} · ${pName} · ${vName}`);
    onSaved?.(variantId);
    onClose();

    // Background DB sync
    try {
      await smartCreateSync(
        userId,
        brandId, bName,
        productId, pName,
        variantId, vName,
        finalBrand?.id ?? null,
        existProduct?.id ?? null,
        existVariant?.id ?? null,
      );
      await addToList.mutateAsync({ variantId, listItemId });

      // Save barcode mapping if provided
      if (prefill?.barcode && supabase) {
        const { supabase } = await import("@/lib/supabase");
        await supabase?.from("barcodes").upsert(
          { user_id: userId, barcode: prefill.barcode, variant_id: variantId },
          { onConflict: "user_id,barcode" }
        );
        toast("Barcode saved ✓", "info");
      }

      qc.invalidateQueries({ queryKey: ["brands", userId] });
      qc.invalidateQueries({ queryKey: ["products", userId] });
      qc.invalidateQueries({ queryKey: ["variants", userId] });
      qc.invalidateQueries({ queryKey: ["list", userId] });
    } catch {
      toast("Saved locally, sync failed", "error");
    }
    setSaving(false);
  }

  // Dismiss dropdown on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (brandRef.current && !brandRef.current.closest(".brand-dropdown-root")?.contains(e.target as Node)) {
        setShowBrandDrop(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(7,20,38,0.45)", zIndex: 200, backdropFilter: "blur(3px)" }} />

      {/* Modal sheet */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 480, margin: "0 auto", background: "var(--nav-bg)", borderRadius: "24px 24px 0 0", zIndex: 201, padding: "0 0 calc(env(safe-area-inset-bottom,0px) + 24px)", animation: "sheetUp 0.25s cubic-bezier(0.2,0.9,0.3,1) both" }}>

        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: "var(--border)" }} />
        </div>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px 16px" }}>
          <h2 style={{ fontSize: 19, fontWeight: 950, color: "var(--text)" }}>Add Product</h2>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 11, background: "var(--bg)", border: "1.5px solid var(--border)", display: "grid", placeItems: "center", color: "var(--text-muted)" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Brand field */}
          <div>
            <label style={labelStyle}>Brand</label>
            <div className="brand-dropdown-root" style={{ position: "relative" }}>
              <div
                style={{ ...fieldStyle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                onClick={() => { setShowBrandDrop(v => !v); setTimeout(() => brandRef.current?.focus(), 50); }}
              >
                <input
                  ref={brandRef}
                  value={brandQuery}
                  onChange={e => { setBrandQuery(e.target.value); setSelectedBrand(null); setShowBrandDrop(true); }}
                  onFocus={() => setShowBrandDrop(true)}
                  placeholder="Select or type brand name…"
                  style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 14, fontWeight: 600, color: "var(--text)" }}
                />
                {selectedBrand && <Check size={15} color="#61bd45" />}
                <ChevronDown size={15} color="var(--text-muted)" style={{ flexShrink: 0, transform: showBrandDrop ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
              </div>

              {showBrandDrop && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--card)", borderRadius: 14, border: "1.5px solid var(--border)", zIndex: 10, maxHeight: 200, overflowY: "auto", boxShadow: "0 8px 32px rgba(7,20,38,0.12)" }}>
                  {isNewBrand && (
                    <button
                      onClick={() => { setSelectedBrand(null); setShowBrandDrop(false); }}
                      style={{ width: "100%", padding: "11px 14px", display: "flex", alignItems: "center", gap: 9, background: "none", border: 0, borderBottom: "1px solid var(--border)", textAlign: "left" }}
                    >
                      <span style={{ width: 28, height: 28, borderRadius: 8, background: "#4f46e520", display: "grid", placeItems: "center" }}><Plus size={14} color="#4f46e5" /></span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#4f46e5" }}>Create "{brandQuery.trim()}"</span>
                    </button>
                  )}
                  {filteredBrands.length === 0 && !isNewBrand ? (
                    <div style={{ padding: "14px", fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>No brands found</div>
                  ) : (
                    filteredBrands.map(b => (
                      <button
                        key={b.id}
                        onClick={() => selectBrand(b)}
                        style={{ width: "100%", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, background: selectedBrand?.id === b.id ? "var(--bg)" : "none", border: 0, textAlign: "left" }}
                      >
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--bg)", display: "grid", placeItems: "center", overflow: "hidden", flexShrink: 0 }}>
                          {b.logo_url
                            ? <img src={b.logo_url} alt={b.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            : <span style={{ fontSize: 12, fontWeight: 900, color: "#4f46e5" }}>{b.name.charAt(0)}</span>
                          }
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{b.name}</span>
                        {selectedBrand?.id === b.id && <Check size={14} color="#61bd45" style={{ marginLeft: "auto" }} />}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Product field */}
          <div>
            <label style={labelStyle}>Product Name</label>
            <input
              value={productName}
              onChange={e => setProductName(e.target.value)}
              placeholder="e.g. Thumsup, Marie Gold, Fevicol…"
              style={fieldStyle}
            />
          </div>

          {/* Variant field */}
          <div>
            <label style={labelStyle}>Variant</label>
            <input
              value={variantName}
              onChange={e => setVariantName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSave()}
              placeholder="e.g. Rs 20, 70gm, 500ml…"
              style={fieldStyle}
            />
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            style={{ height: 52, borderRadius: 16, background: canSave ? "#ef1d27" : "var(--border)", color: canSave ? "#fff" : "var(--text-dim)", border: 0, fontSize: 15, fontWeight: 900, marginTop: 4, boxShadow: canSave ? "0 4px 18px #ef1d2740" : "none", transition: "all 0.15s ease" }}
          >
            {saving ? "Saving…" : "Add to List"}
          </button>
        </div>
      </div>
    </>
  );
}

// need to import supabase for barcode save
import { supabase } from "@/lib/supabase";

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, color: "var(--text-muted)",
  textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6, display: "block",
};

const fieldStyle: React.CSSProperties = {
  width: "100%", height: 48, borderRadius: 14,
  border: "1.5px solid var(--border)", background: "var(--card)",
  padding: "0 14px", fontSize: 14, fontWeight: 600,
  color: "var(--text)", outline: "none",
};
