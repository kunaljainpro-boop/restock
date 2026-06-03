"use client";

import { CheckCircle2 } from "lucide-react";
import { useState, useMemo } from "react";

function ImgSafe({ src, alt, style, fallback }: { src: string; alt: string; style: React.CSSProperties; fallback: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span style={{ fontSize: 22, fontWeight: 900, color: "var(--text-dim)" }}>{fallback}</span>;
  return <img src={src} alt={alt} style={style} onError={() => setFailed(true)} referrerPolicy="no-referrer" />;
}
import { useMarketList, useCompleteListItem } from "@/lib/use-db";
import { useToast } from "@/lib/toast-context";
import type { MarketListItemFull } from "@/lib/types";

interface Props { userId: string; }

export function ListTab({ userId }: Props) {
  const { data: items = [], isLoading } = useMarketList(userId);
  const completeItem = useCompleteListItem(userId);
  const { toast } = useToast();
  const [activeFilter, setActiveFilter] = useState("all");
  const [completing, setCompleting] = useState<Set<string>>(new Set());

  // Derive unique brands from list
  const listBrands = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items) {
      const b = item.variant?.product?.brand;
      if (b && !seen.has(b.id)) seen.set(b.id, b.name);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [items]);

  // Filter + group
  const filtered = useMemo(() => {
    return activeFilter === "all"
      ? items
      : items.filter((i) => i.variant?.product?.brand?.id === activeFilter);
  }, [items, activeFilter]);

  // Group by product
  type Group = { product: { id: string; name: string; image_url: string | null; brand: { name: string } }; items: MarketListItemFull[] };
  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const item of filtered) {
      const product = item.variant?.product;
      if (!product) continue;
      if (!map.has(product.id)) {
        map.set(product.id, {
          product: { id: product.id, name: product.name, image_url: product.image_url, brand: product.brand },
          items: [],
        });
      }
      map.get(product.id)!.items.push(item);
    }
    return Array.from(map.values());
  }, [filtered]);

  async function handleComplete(item: MarketListItemFull) {
    if (completing.has(item.id)) return;
    setCompleting((s) => new Set(s).add(item.id));
    await completeItem.mutateAsync(item.id);
    toast("✓ Item purchased");
    setCompleting((s) => { const ns = new Set(s); ns.delete(item.id); return ns; });
  }

  return (
    <div className="fade-in" style={{ padding: "calc(env(safe-area-inset-top,0px) + 10px) 0 28px" }}>
      {/* Header */}
      <div style={{ padding: "0 16px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 30, fontWeight: 950, color: "var(--text)" }}>Market List</h1>
        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text-muted)", background: "var(--card)", borderRadius: 10, padding: "4px 10px", border: "1.5px solid var(--border)" }}>
          {filtered.length} items
        </span>
      </div>

      {/* Brand Filters */}
      {listBrands.length > 0 && (
        <div style={{ paddingLeft: 16, marginBottom: 14, display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none" }}>
          <FilterChip label="All" active={activeFilter === "all"} onClick={() => setActiveFilter("all")} />
          {listBrands.map((b) => (
            <FilterChip key={b.id} label={b.name} active={activeFilter === b.id} onClick={() => setActiveFilter(b.id)} />
          ))}
          <div style={{ width: 16, flexShrink: 0 }} />
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {[...Array(4)].map((_, i) => <SkeletonGroup key={i} />)}
        </div>
      ) : groups.length === 0 ? (
        <EmptyList />
      ) : (
        <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {groups.map((g, gi) => (
            <ProductGroup key={g.product.id} group={g} index={gi} completing={completing} onComplete={handleComplete} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductGroup({ group, index, completing, onComplete }: {
  group: { product: { id: string; name: string; image_url: string | null; brand: { name: string } }; items: MarketListItemFull[] };
  index: number;
  completing: Set<string>;
  onComplete: (item: MarketListItemFull) => void;
}) {
  return (
    <div style={{ background: "var(--card)", borderRadius: 20, border: "1.5px solid var(--border)", overflow: "hidden" }}>
      {/* Product header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
        {/* Serial number */}
        <div style={{ width: 24, height: 24, borderRadius: 99, background: "#ef1d27", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{index + 1}</span>
        </div>
        <div style={{ width: 48, height: 48, borderRadius: 13, overflow: "hidden", flexShrink: 0, background: "var(--bg)", display: "grid", placeItems: "center" }}>
          {group.product.image_url ? (
            <ImgSafe src={group.product.image_url} alt={group.product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} fallback={group.product.name.charAt(0)} />
          ) : (
            <span style={{ fontSize: 22, fontWeight: 900, color: "var(--text-dim)" }}>
              {group.product.name.charAt(0)}
            </span>
          )}
        </div>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.6 }}>{group.product.brand.name}</p>
          <p style={{ fontSize: 16, fontWeight: 850, color: "var(--text)", lineHeight: 1.2 }}>{group.product.name}</p>
        </div>
      </div>
      {/* Variants */}
      {group.items.map((item, idx) => (
        <VariantRow key={item.id} item={item} completing={completing.has(item.id)} onComplete={() => onComplete(item)} isLast={idx === group.items.length - 1} />
      ))}
    </div>
  );
}

function VariantRow({ item, completing, onComplete, isLast }: {
  item: MarketListItemFull; completing: boolean; onComplete: () => void; isLast: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 14px",
        borderBottom: isLast ? "none" : "1px solid var(--border)",
        opacity: completing ? 0.4 : 1,
        transition: "opacity 0.2s ease",
      }}
    >
      <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
        {item.variant?.name}
      </span>
      <button
        onClick={onComplete}
        disabled={completing}
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          border: "2px solid " + (completing ? "#61bd45" : "var(--border)"),
          background: completing ? "#61bd4520" : "var(--bg)",
          display: "grid",
          placeItems: "center",
          color: completing ? "#61bd45" : "var(--text-dim)",
          transition: "all 0.18s ease",
        }}
      >
        <CheckCircle2 size={22} />
      </button>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0,
        height: 34,
        borderRadius: 99,
        padding: "0 16px",
        fontSize: 13,
        fontWeight: 800,
        border: active ? "1.5px solid #0891b2" : "1.5px solid var(--border)",
        background: active ? "#0891b2" : "var(--card)",
        color: active ? "#fff" : "var(--text-muted)",
        transition: "all 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}

function EmptyList() {
  return (
    <div style={{ textAlign: "center", padding: "60px 24px" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🛒</div>
      <p style={{ fontSize: 18, fontWeight: 900, color: "var(--text)" }}>List is empty</p>
      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", marginTop: 6 }}>
        Add products from Home or Brands tab
      </p>
    </div>
  );
}

function SkeletonGroup() {
  return (
    <div style={{ background: "var(--card)", borderRadius: 20, border: "1.5px solid var(--border)", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 12 }}>
        <div className="skeleton" style={{ width: 48, height: 48, borderRadius: 13 }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, justifyContent: "center" }}>
          <div className="skeleton" style={{ height: 10, width: "35%" }} />
          <div className="skeleton" style={{ height: 14, width: "55%" }} />
        </div>
      </div>
      <div className="skeleton" style={{ height: 40, borderRadius: 10 }} />
    </div>
  );
}
