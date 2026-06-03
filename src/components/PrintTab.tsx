"use client";

import { AlignLeft, ChevronDown, ChevronUp, Columns, Copy, Image as ImageIcon, Printer, Share2, Store } from "lucide-react";
import { useState, useMemo } from "react";
import { useMarketList, useBrands, useProfile, useUpdateBrand } from "@/lib/use-db";
import { useToast } from "@/lib/toast-context";
import type { MarketListItemFull } from "@/lib/types";

interface Props { userId: string; }

export function PrintTab({ userId }: Props) {
  const { data: items = [], isLoading }  = useMarketList(userId);
  const { data: brands = [] }            = useBrands(userId);
  const { data: profile }                = useProfile(userId);
  const updateBrand                      = useUpdateBrand(userId);
  const { toast }                        = useToast();

  // ── Header controls ──────────────────────────────────────────────────────────
  const [headerOn, setHeaderOn]           = useState(false);
  const [showStoreName, setShowStoreName] = useState(false);
  const [showDate, setShowDate]           = useState(false);
  const [customStore, setCustomStore]     = useState("");

  // ── Brand filters ─────────────────────────────────────────────────────────────
  const [selectedBrandIds, setSelectedBrandIds] = useState<Set<string>>(new Set());

  // ── Sections open/close ───────────────────────────────────────────────────────
  const [openSection, setOpenSection] = useState<string | null>("preview");

  // ── Brands in current list ────────────────────────────────────────────────────
  const listBrands = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; print_enabled: boolean }>();
    for (const item of items) {
      const b = item.variant?.product?.brand;
      if (b && !seen.has(b.id)) seen.set(b.id, { id: b.id, name: b.name, print_enabled: b.print_enabled });
    }
    return Array.from(seen.values());
  }, [items]);

  // ── Filtered items ────────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    let result = items;
    if (selectedBrandIds.size > 0) {
      result = result.filter(i => {
        const bid = i.variant?.product?.brand?.id;
        return bid && selectedBrandIds.has(bid);
      });
    }
    // Exclude brands with print_enabled = false (from brand settings)
    return result;
  }, [items, selectedBrandIds]);

  const storeName = customStore.trim() || profile?.market_name || "My Store";

  // ── Build print lines ─────────────────────────────────────────────────────────
  function buildLines() {
    return filteredItems.map(item => {
      const p = item.variant?.product;
      const b = p?.brand;
      if (!b || !p) return "";
      const brand = brands.find(br => br.id === b.id);
      const showBrand = brand?.print_enabled ?? true;
      return showBrand
        ? `${b.name}  ${p.name}  ${item.variant.name}`
        : `${p.name}  ${item.variant.name}`;
    }).filter(Boolean);
  }

  const lines = buildLines();
  const col1 = lines.slice(0, Math.ceil(lines.length / 2));
  const col2 = lines.slice(Math.ceil(lines.length / 2));

  // ── Share ─────────────────────────────────────────────────────────────────────
  async function handleShare() {
    const text = buildShareText();
    if (navigator.share) {
      try {
        await navigator.share({ title: `Market List — ${storeName}`, text });
        toast("Shared ✓");
      } catch (e) {
        if ((e as Error).name !== "AbortError") fallbackCopy(text);
      }
    } else {
      fallbackCopy(text);
    }
  }

  async function handleShareAsImage() {
    const canvas = document.createElement("canvas");
    const dpr = 2;
    const W = 800;
    const lineH = 28;
    const padX = 40;
    const headerH = headerOn && (showStoreName || showDate) ? 80 : 0;
    const footerH = 40;
    const maxRows = Math.max(col1.length, col2.length);
    const H = 60 + headerH + maxRows * lineH + footerH;

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";

    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    let y = 36;

    // Header
    if (headerH > 0) {
      if (showStoreName) {
        ctx.font = "bold 22px Arial";
        ctx.fillStyle = "#111";
        ctx.fillText(storeName, padX, y);
        y += 28;
      }
      if (showDate) {
        ctx.font = "15px Arial";
        ctx.fillStyle = "#666";
        ctx.fillText(new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }), padX, y);
        y += 22;
      }
      ctx.strokeStyle = "#ddd";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padX, y + 4);
      ctx.lineTo(W - padX, y + 4);
      ctx.stroke();
      y += 18;
    }

    // Two columns
    const colW = (W - padX * 2) / 2;
    ctx.font = "14px Arial";
    for (let i = 0; i < maxRows; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#f9f9f9" : "#ffffff";
      ctx.fillRect(padX - 4, y - 18, W - padX * 2 + 8, lineH);
      ctx.fillStyle = "#111";
      if (col1[i]) ctx.fillText(col1[i], padX, y);
      if (col2[i]) ctx.fillText(col2[i], padX + colW, y);
      y += lineH;
    }

    // Footer
    ctx.font = "12px Arial";
    ctx.fillStyle = "#aaa";
    ctx.textAlign = "right";
    ctx.fillText(`${filteredItems.length} items · Generated by ReStock`, W - padX, y + 16);

    canvas.toBlob(async (blob) => {
      if (!blob) { toast("Failed to generate image", "error"); return; }
      const file = new File([blob], "market-list.png", { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `Market List — ${storeName}` });
          toast("Shared ✓");
        } catch (e) {
          if ((e as Error).name !== "AbortError") toast("Share cancelled", "info");
        }
      } else {
        // Fallback: download
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "market-list.png";
        a.click();
        URL.revokeObjectURL(url);
        toast("Image downloaded ✓");
      }
    }, "image/png");
  }

  async function handleCopy() {
    await fallbackCopy(buildShareText());
    toast("Copied ✓");
  }

  function handlePrint() {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(buildPrintHTML());
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  function buildShareText() {
    const parts: string[] = [];
    if (headerOn) {
      if (showStoreName) parts.push(storeName);
      if (showDate) parts.push(new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }));
      if (parts.length) parts.push("─────────────────");
    }
    // Two-column text
    const max = Math.max(col1.length, col2.length);
    for (let i = 0; i < max; i++) {
      const l = col1[i] ?? "";
      const r = col2[i] ?? "";
      parts.push(r ? `${l.padEnd(32)}${r}` : l);
    }
    return parts.join("\n");
  }

  function buildPrintHTML() {
    const rows = col1.map((l, i) =>
      `<tr><td>${l}</td><td>${col2[i] ?? ""}</td></tr>`
    ).join("");
    const header = headerOn ? `
      <div class="header">
        ${showStoreName ? `<div class="store">${storeName}</div>` : ""}
        ${showDate ? `<div class="date">${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</div>` : ""}
      </div>` : "";
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${storeName}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; padding: 14px; color: #111; }
  .header { margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #ddd; }
  .store { font-size: 15px; font-weight: bold; margin-bottom: 3px; }
  .date { font-size: 11px; color: #555; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2.5px 8px 2.5px 0; vertical-align: top; width: 50%; }
  @media print { @page { margin: 12mm; } }
</style></head><body>${header}<table>${rows}</table></body></html>`;
  }

  function Section({ id, label, icon, children }: { id: string; label: string; icon: React.ReactNode; children: React.ReactNode }) {
    const open = openSection === id;
    return (
      <div style={{ background: "var(--card)", borderRadius: 18, border: "1.5px solid var(--border)", overflow: "hidden", marginBottom: 10 }}>
        <button
          onClick={() => setOpenSection(open ? null : id)}
          style={{ width: "100%", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, background: "none", border: 0, textAlign: "left" }}
        >
          <span style={{ width: 32, height: 32, borderRadius: 10, background: "var(--bg)", display: "grid", placeItems: "center", color: "#0891b2", flexShrink: 0 }}>{icon}</span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 800, color: "var(--text)" }}>{label}</span>
          {open ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
        </button>
        {open && <div style={{ borderTop: "1px solid var(--border)", padding: "14px 16px" }}>{children}</div>}
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ padding: "calc(env(safe-area-inset-top,0px) + 10px) 16px 28px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 950, color: "var(--text)" }}>Print</h1>
        <span style={{ background: "var(--card)", borderRadius: 12, padding: "6px 14px", fontSize: 13, fontWeight: 800, color: "var(--text-muted)", border: "1.5px solid var(--border)" }}>
          {filteredItems.length} items
        </span>
      </div>

      {/* ── Preview first ── */}
      <Section id="preview" label="Live Preview" icon={<Columns size={16} />}>
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 14, borderRadius: 5, width: i % 2 === 0 ? "55%" : "40%" }} />)}
          </div>
        ) : filteredItems.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>No items to print. Add products to your list first.</p>
        ) : (
          <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid var(--border)", padding: "14px", fontFamily: "monospace", fontSize: 12, color: "#111", lineHeight: 1.7 }}>
            {/* Header preview */}
            {headerOn && (showStoreName || showDate) && (
              <div style={{ marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid #eee" }}>
                {showStoreName && <div style={{ fontWeight: 700, fontSize: 13 }}>{storeName}</div>}
                {showDate && <div style={{ color: "#666", fontSize: 11 }}>{new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</div>}
              </div>
            )}
            {/* Two column */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {col1.map((l, i) => <div key={i} style={{ fontSize: 11.5 }}>{l}</div>)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {col2.map((l, i) => <div key={i} style={{ fontSize: 11.5 }}>{l}</div>)}
              </div>
            </div>
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #eee", fontSize: 10, color: "#999", textAlign: "right" }}>
              {filteredItems.length} items · A4 two-column layout
            </div>
          </div>
        )}
      </Section>

      {/* ── Header options ── */}
      <Section id="header" label="Header Options" icon={<AlignLeft size={16} />}>
        <ToggleRow label="Show Header" value={headerOn} onChange={setHeaderOn} />
        {headerOn && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <ToggleRow label="Store / Market Name" value={showStoreName} onChange={setShowStoreName} />
            {showStoreName && (
              <input
                value={customStore}
                onChange={e => setCustomStore(e.target.value)}
                placeholder={profile?.market_name || "My Store"}
                style={{ height: 40, borderRadius: 11, border: "1.5px solid var(--border)", background: "var(--bg)", padding: "0 12px", fontSize: 13, fontWeight: 600, color: "var(--text)", outline: "none" }}
              />
            )}
            <ToggleRow label="Print Date" value={showDate} onChange={setShowDate} />
          </div>
        )}
      </Section>

      {/* ── Brand filter ── */}
      {listBrands.length > 0 && (
        <Section id="brands" label={`Brand Filter ${selectedBrandIds.size > 0 ? `(${selectedBrandIds.size} selected)` : "(All)"}`} icon={<Store size={16} />}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            <button
              onClick={() => setSelectedBrandIds(new Set())}
              style={{ height: 34, borderRadius: 99, padding: "0 16px", fontSize: 12.5, fontWeight: 800, background: selectedBrandIds.size === 0 ? "#071426" : "var(--bg)", color: selectedBrandIds.size === 0 ? "#fff" : "var(--text-muted)", border: "1.5px solid var(--border)" }}
            >
              All
            </button>
            {listBrands.map(b => (
              <button
                key={b.id}
                onClick={() => setSelectedBrandIds(s => { const n = new Set(s); n.has(b.id) ? n.delete(b.id) : n.add(b.id); return n; })}
                style={{ height: 34, borderRadius: 99, padding: "0 14px", fontSize: 12.5, fontWeight: 800, background: selectedBrandIds.has(b.id) ? "#0891b2" : "var(--bg)", color: selectedBrandIds.has(b.id) ? "#fff" : "var(--text-muted)", border: "1.5px solid var(--border)" }}
              >
                {b.name}
              </button>
            ))}
          </div>

          {/* Brand print toggle */}
          <p style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 }}>Brand Name in Print</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {brands.map(b => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: "var(--bg)", borderRadius: 12 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>{b.name}</span>
                <ToggleSwitch
                  value={b.print_enabled}
                  onChange={async v => {
                    await updateBrand.mutateAsync({ id: b.id, print_enabled: v });
                    toast(`${b.name}: ${v ? "Brand name shown in print" : "Brand name hidden"}`);
                  }}
                />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Action buttons ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
        <ActionBtn
          icon={<Share2 size={18} />}
          label="Share Text"
          sublabel="WhatsApp, etc."
          bg="#071426"
          color="#fff"
          onClick={handleShare}
        />
        <ActionBtn
          icon={<ImageIcon size={18} />}
          label="Share Image"
          sublabel="Canon, printer apps"
          bg="#0891b2"
          color="#fff"
          onClick={handleShareAsImage}
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <ActionBtn
          icon={<Copy size={18} />}
          label="Copy"
          sublabel="Clipboard"
          bg="var(--card)"
          color="var(--text)"
          border
          onClick={handleCopy}
        />
        <ActionBtn
          icon={<Printer size={18} />}
          label="Print"
          sublabel="Browser dialog"
          bg="var(--card)"
          color="var(--text)"
          border
          onClick={handlePrint}
        />
      </div>

      {/* Quick stats */}
      <div style={{ marginTop: 12, background: "var(--card)", borderRadius: 16, border: "1.5px solid var(--border)", padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <Stat label="Items" value={filteredItems.length} />
        <Stat label="Brands" value={new Set(filteredItems.map(i => i.variant?.product?.brand?.id)).size} />
        <Stat label="Pages" value={Math.max(1, Math.ceil(lines.length / 60))} />
      </div>
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{label}</span>
      <ToggleSwitch value={value} onChange={onChange} />
    </div>
  );
}

function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{ width: 46, height: 26, borderRadius: 99, background: value ? "#61bd45" : "var(--border)", border: "none", position: "relative", transition: "background 0.18s ease", flexShrink: 0 }}
    >
      <span style={{ position: "absolute", top: 3, left: value ? 22 : 3, width: 20, height: 20, borderRadius: 99, background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.18)", transition: "left 0.18s ease" }} />
    </button>
  );
}

function ActionBtn({ icon, label, sublabel, bg, color, border, onClick }: {
  icon: React.ReactNode; label: string; sublabel: string;
  bg: string; color: string; border?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{ height: 72, borderRadius: 16, background: bg, color, border: border ? "1.5px solid var(--border)" : 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, boxShadow: bg === "#071426" ? "0 4px 18px rgba(7,20,38,0.28)" : "none" }}
    >
      {icon}
      <span style={{ fontSize: 13, fontWeight: 850 }}>{label}</span>
      <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.6 }}>{sublabel}</span>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: "center" }}>
      <p style={{ fontSize: 22, fontWeight: 950, color: "var(--text)", lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 10, fontWeight: 750, color: "var(--text-muted)", marginTop: 3, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</p>
    </div>
  );
}

async function fallbackCopy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); document.body.removeChild(ta);
  }
}
