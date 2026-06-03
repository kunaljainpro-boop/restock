"use client";

import { Download, RefreshCw, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useProfile, useUpdateProfile, useBrands, useProducts, useVariants, useBarcodes, useClearCompleted } from "@/lib/use-db";
import { useToast } from "@/lib/toast-context";
import { useQueryClient } from "@tanstack/react-query";

interface Props { session: Session; canInstall?: boolean; onInstall?: () => void; }

export function SettingsTab({ session, canInstall, onInstall }: Props) {
  const userId = session.user.id;
  const { data: profile } = useProfile(userId);
  const updateProfile = useUpdateProfile(userId);
  const { data: brands = [] } = useBrands(userId);
  const { data: products = [] } = useProducts(userId);
  const { data: variants = [] } = useVariants(userId);
  const { data: barcodes = [] } = useBarcodes(userId);
  const clearCompleted = useClearCompleted(userId);
  const { toast } = useToast();
  const qc = useQueryClient();

  const [marketName, setMarketName] = useState(profile?.market_name ?? "");
  const [saving, setSaving] = useState(false);

  async function saveProfile() {
    if (!marketName.trim()) return;
    setSaving(true);
    try {
      await updateProfile.mutateAsync({ market_name: marketName.trim() });
      toast("Profile updated ✓");
    } catch {
      toast("Failed to save", "error");
    }
    setSaving(false);
  }

  async function setAppearance(value: "light" | "dark" | "system") {
    const resolved = value === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
      : value;
    document.documentElement.dataset.theme = resolved;
    await updateProfile.mutateAsync({ appearance: value });
    toast("Theme updated");
  }

  async function handleSignOut() {
    if (!confirm("Sign out?")) return;
    await supabase?.auth.signOut();
  }

  async function handleClearCompleted() {
    if (!confirm("Clear all completed items?")) return;
    await clearCompleted.mutateAsync();
    toast("Completed items cleared");
  }

  async function exportCSV() {
    // Format: type, id, parent_id, name, extra, image_url
    const rows: string[][] = [["type", "id", "parent_id", "name", "extra", "image_url"]];
    brands.forEach((b) => rows.push(["brand", b.id, "", b.name, b.print_enabled ? "print_on" : "print_off", b.logo_url ?? ""]));
    products.forEach((p) => rows.push(["product", p.id, p.brand_id, p.name, "", p.image_url ?? ""]));
    variants.forEach((v) => rows.push(["variant", v.id, v.product_id, v.name, "", ""]));
    barcodes.forEach((bc) => rows.push(["barcode", bc.id, bc.variant_id ?? "", bc.barcode, "", ""]));
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadFile("restock-backup.csv", csv, "text/csv");
    toast("Export ready ✓");
  }

  async function importCSV(file: File) {
    if (!supabase) return;
    toast("Importing…", "info");
    const text = await file.text();
    const lines = text.trim().split("\n").slice(1);

    // Collect into buckets → 4 batch upserts instead of 321 sequential calls
    const bBrands:   object[] = [];
    const bProducts: object[] = [];
    const bVariants: object[] = [];
    const bBarcodes: object[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      const cols      = parseCSVLine(line);
      const [type, id, parentId, name] = cols;
      const extra     = cols[4] ?? "";
      const imageUrl  = cols[5] ?? "";

      if (type === "brand") {
        bBrands.push({
          id, user_id: userId, name,
          print_enabled: extra !== "print_off",
          ...(imageUrl ? { logo_url: imageUrl } : {}),
        });
      } else if (type === "product") {
        // imageUrl is col5; extra was old format image url fallback
        const img = imageUrl || (extra.startsWith("http") ? extra : "");
        bProducts.push({
          id, user_id: userId, brand_id: parentId, name,
          ...(img ? { image_url: img } : {}),
        });
      } else if (type === "variant") {
        bVariants.push({ id, user_id: userId, product_id: parentId, name });
      } else if (type === "barcode") {
        bBarcodes.push({ id, user_id: userId, barcode: name, variant_id: parentId || null });
      }
    }

    let imported = 0;
    try {
      // Split array into chunks of `size`
      function chunks(arr: object[], size = 200) {
        const out: object[][] = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
      }

      for (const c of chunks(bBrands))   { await supabase.from("brands").upsert(c,   { onConflict: "id" }); imported += c.length; }
      for (const c of chunks(bProducts)) { await supabase.from("products").upsert(c, { onConflict: "id" }); imported += c.length; }
      for (const c of chunks(bVariants)) { await supabase.from("variants").upsert(c, { onConflict: "id" }); imported += c.length; }
      for (const c of chunks(bBarcodes)) { await supabase.from("barcodes").upsert(c, { onConflict: "user_id,barcode" }); imported += c.length; }

      // Force immediate refetch of all data (bypasses staleTime)
      await Promise.all([
        qc.refetchQueries({ queryKey: ["brands",   userId] }),
        qc.refetchQueries({ queryKey: ["products", userId] }),
        qc.refetchQueries({ queryKey: ["variants", userId] }),
        qc.refetchQueries({ queryKey: ["list",     userId] }),
        qc.refetchQueries({ queryKey: ["profile",  userId] }),
      ]);
      toast(`✓ Imported — ${bBrands.length} brands · ${bProducts.length} products · ${bVariants.length} variants`);
    } catch (e) {
      toast("Import failed — check console", "error");
      console.error(e);
    }
  }

  async function exportBarcodes() {
    const rows = [["barcode", "variant_id"], ...barcodes.map((b) => [b.barcode, b.variant_id ?? ""])];
    const csv = rows.map((r) => r.join(",")).join("\n");
    downloadFile("restock-barcodes.csv", csv, "text/csv");
    toast("Barcode export ready ✓");
  }

  async function importBarcodes(file: File) {
    if (!supabase) return;
    const text = await file.text();
    const lines = text.trim().split("\n").slice(1);
    let count = 0;
    for (const line of lines) {
      const [barcode, variantId] = line.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
      if (!barcode) continue;
      try {
        await supabase.from("barcodes").upsert({ user_id: userId, barcode, variant_id: variantId || null }, { onConflict: "user_id,barcode" });
        count++;
      } catch { /* skip */ }
    }
    qc.invalidateQueries({ queryKey: ["barcodes", userId] });
    toast(`Imported ${count} barcodes ✓`);
  }

  async function rebuildSearch() {
    qc.invalidateQueries();
    toast("Search index refreshed ✓");
  }

  const appearance = profile?.appearance ?? "light";

  return (
    <div className="fade-in" style={{ padding: "calc(env(safe-area-inset-top,0px) + 10px) 16px 48px" }}>
      <h1 style={{ fontSize: 30, fontWeight: 950, color: "var(--text)", marginBottom: 20 }}>Settings</h1>

      {/* Profile */}
      <Section title="Profile">
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          {session.user.user_metadata?.avatar_url ? (
            <img src={session.user.user_metadata.avatar_url} alt="avatar" style={{ width: 56, height: 56, borderRadius: 99, objectFit: "cover", border: "2px solid var(--border)" }} />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: 99, background: "#ef1d2720", display: "grid", placeItems: "center", fontSize: 22, fontWeight: 900, color: "#ef1d27" }}>
              {session.user.email?.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>{session.user.user_metadata?.full_name || "User"}</p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>{session.user.email}</p>
          </div>
        </div>
        <label style={{ fontSize: 12, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.7 }}>Market / Store Name</label>
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <input
            value={marketName || profile?.market_name || ""}
            onChange={(e) => setMarketName(e.target.value)}
            placeholder="My Store"
            style={inputStyle}
          />
          <button
            onClick={saveProfile}
            disabled={saving}
            style={{ height: 44, borderRadius: 13, background: "#61bd45", color: "#fff", border: 0, padding: "0 18px", fontWeight: 800, fontSize: 14, flexShrink: 0 }}
          >
            {saving ? "…" : "Save"}
          </button>
        </div>
        <button onClick={handleSignOut} style={{ marginTop: 14, width: "100%", height: 44, borderRadius: 13, background: "#ef1d2712", border: "1.5px solid #ef1d2730", color: "#ef1d27", fontWeight: 800, fontSize: 14 }}>
          Sign Out
        </button>
      </Section>

      {/* Appearance */}
      <Section title="Appearance">
        <div style={{ display: "flex", gap: 8 }}>
          {(["light", "dark", "system"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setAppearance(mode)}
              style={{ flex: 1, height: 44, borderRadius: 13, border: appearance === mode ? "2px solid #071426" : "1.5px solid var(--border)", background: appearance === mode ? "#071426" : "var(--bg)", color: appearance === mode ? "#fff" : "var(--text-muted)", fontWeight: 800, fontSize: 13, textTransform: "capitalize" }}
            >
              {mode === "light" ? "☀️" : mode === "dark" ? "🌙" : "⚙️"} {mode}
            </button>
          ))}
        </div>
      </Section>

      {/* Barcode Center */}
      <Section title="Barcode Center">
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", marginBottom: 12 }}>
          {barcodes.length} barcode{barcodes.length !== 1 ? "s" : ""} saved in your database
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <ActionButton icon={<Download size={16} />} label="Export" onClick={exportBarcodes} color="#0891b2" />
          <FileButton icon={<Upload size={16} />} label="Import" onFile={importBarcodes} color="#6366f1" accept=".csv" />
        </div>
      </Section>

      {/* Print Defaults */}
      <Section title="Print Defaults">
        <ToggleRow label="Header by default" value={profile?.print_header_default ?? false} onChange={(v) => updateProfile.mutateAsync({ print_header_default: v })} />
        <div style={{ height: 8 }} />
        <ToggleRow label="Show store name by default" value={profile?.print_show_store_name ?? false} onChange={(v) => updateProfile.mutateAsync({ print_show_store_name: v })} />
        <div style={{ height: 8 }} />
        <ToggleRow label="Show date by default" value={profile?.print_show_date ?? false} onChange={(v) => updateProfile.mutateAsync({ print_show_date: v })} />
        <div style={{ height: 10 }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--bg)", borderRadius: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Two-column A4 layout</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#61bd45", background: "#61bd4520", borderRadius: 8, padding: "3px 10px" }}>Always On</span>
        </div>
      </Section>

      {/* Data Backup */}
      <Section title="Data Backup & Restore">
        <div style={{ display: "flex", gap: 8 }}>
          <ActionButton icon={<Download size={16} />} label="Export CSV" onClick={exportCSV} color="#0891b2" />
          <FileButton icon={<Upload size={16} />} label="Import CSV" onFile={importCSV} color="#6366f1" accept=".csv" />
        </div>
      </Section>

      {/* Advanced */}
      <Section title="Advanced">
        <div style={{ display: "flex", gap: 8 }}>
          <ActionButton icon={<Trash2 size={16} />} label="Clear Completed" onClick={handleClearCompleted} color="#ef1d27" />
          <ActionButton icon={<RefreshCw size={16} />} label="Rebuild Index" onClick={rebuildSearch} color="#6366f1" />
        </div>
      </Section>

      {/* Install PWA */}
      {canInstall && (
        <button
          onClick={onInstall}
          style={{ width: "100%", height: 52, borderRadius: 16, background: "linear-gradient(90deg,#ef1d27,#c1121f)", color: "#fff", border: 0, fontSize: 15, fontWeight: 900, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 4px 20px #ef1d2740" }}
        >
          📲 Install ReStock App
        </button>
      )}

      {/* About */}
      <Section title="About ReStock">
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", lineHeight: 1.6 }}>
          Helping grocery and retail shop owners quickly create, manage, complete, and share market purchase lists with maximum speed and simplicity.
        </p>
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {["Smart Search", "Barcode Scanner", "Brand Management", "Market Lists", "Fast Print & Share", "CSV Backup"].map((f) => (
            <span key={f} style={{ background: "#0891b218", color: "#0891b2", borderRadius: 8, padding: "3px 10px", fontSize: 11, fontWeight: 800 }}>{f}</span>
          ))}
        </div>
      </Section>

      {/* Footer */}
      <div style={{ textAlign: "center", marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)" }}>Made with ❤️ by Kunal Jain</p>
        <Image src="/restockname.png" alt="ReStock" width={160} height={48} style={{ marginTop: 12, height: 40, width: "auto", objectFit: "contain", opacity: 0.7 }} />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--card)", borderRadius: 20, border: "1.5px solid var(--border)", padding: "16px", marginBottom: 12 }}>
      <p style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>{title}</p>
      {children}
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{label}</span>
      <button onClick={() => onChange(!value)} style={{ width: 46, height: 26, borderRadius: 99, background: value ? "#61bd45" : "var(--border)", border: "none", position: "relative", transition: "background 0.18s ease" }}>
        <span style={{ position: "absolute", top: 3, left: value ? 22 : 3, width: 20, height: 20, borderRadius: 99, background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.18)", transition: "left 0.18s ease" }} />
      </button>
    </div>
  );
}

function ActionButton({ icon, label, onClick, color }: { icon: React.ReactNode; label: string; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick} style={{ flex: 1, height: 44, borderRadius: 13, background: `${color}14`, border: `1.5px solid ${color}30`, color, fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
      {icon} {label}
    </button>
  );
}

function FileButton({ icon, label, onFile, color, accept }: { icon: React.ReactNode; label: string; onFile: (f: File) => void; color: string; accept?: string }) {
  return (
    <label style={{ flex: 1 }}>
      <input type="file" accept={accept} style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      <span style={{ height: 44, borderRadius: 13, background: `${color}14`, border: `1.5px solid ${color}30`, color, fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer" }}>
        {icon} {label}
      </span>
    </label>
  );
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && !inQuotes) { inQuotes = true; continue; }
    if (c === '"' && inQuotes && line[i + 1] === '"') { field += '"'; i++; continue; }
    if (c === '"' && inQuotes) { inQuotes = false; continue; }
    if (c === "," && !inQuotes) { result.push(field); field = ""; continue; }
    field += c;
  }
  result.push(field);
  return result;
}

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const inputStyle: React.CSSProperties = {
  flex: 1, height: 44, borderRadius: 13, border: "1.5px solid var(--border)",
  background: "var(--bg)", padding: "0 14px", fontSize: 14, fontWeight: 600,
  color: "var(--text)", outline: "none",
};
