"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type { Brand, BarcodeRecord, MarketListItemFull, Product, Profile, Variant } from "./types";

const K = {
  profile:  (u: string) => ["profile",  u],
  brands:   (u: string) => ["brands",   u],
  products: (u: string) => ["products", u],
  variants: (u: string) => ["variants", u],
  list:     (u: string) => ["list",     u],
  barcodes: (u: string) => ["barcodes", u],
};

const now = () => new Date().toISOString();
const sortByName = <T extends { name: string }>(arr: T[]) => [...arr].sort((a, b) => a.name.localeCompare(b.name));

// ── Profile ───────────────────────────────────────────────────────────────────
export function useProfile(userId: string) {
  return useQuery({
    queryKey: K.profile(userId),
    queryFn: async () => {
      if (!supabase) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
      if (!data) {
        const { data: c } = await supabase.from("profiles")
          .insert({ id: userId, market_name: "My Store", appearance: "light" })
          .select().single();
        return c as Profile | null;
      }
      return data as Profile;
    },
    enabled: !!userId && !!supabase,
  });
}

export function useUpdateProfile(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Partial<Profile>) => {
      if (!supabase) throw new Error("no supabase");
      const { data, error } = await supabase.from("profiles")
        .upsert({ id: userId, ...updates, updated_at: now() })
        .select().single();
      if (error) throw error;
      return data as Profile;
    },
    onMutate: (updates) => {
      qc.setQueryData(K.profile(userId), (old: Profile | null) => old ? { ...old, ...updates } : old);
    },
  });
}

// ── Brands ────────────────────────────────────────────────────────────────────
export function useBrands(userId: string) {
  return useQuery({
    queryKey: K.brands(userId),
    queryFn: async () => {
      if (!supabase) return [] as Brand[];
      const { data } = await supabase.from("brands").select("*").eq("user_id", userId).order("name");
      return (data ?? []) as Brand[];
    },
    enabled: !!userId && !!supabase,
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateBrand(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      if (!supabase) throw new Error("no supabase");
      const { error } = await supabase.from("brands")
        .insert({ id, user_id: userId, name, print_enabled: true });
      if (error && error.code !== "23505") throw error;
    },
    onMutate: ({ id, name }) => {
      const brand: Brand = { id, user_id: userId, name, logo_url: null, print_enabled: true, created_at: now() };
      qc.setQueryData(K.brands(userId), (old: Brand[]) => sortByName([...(old ?? []), brand]));
      return { brand };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(K.brands(userId), (old: Brand[]) => old?.filter(b => b.id !== ctx.brand.id));
    },
  });
}

export function useUpdateBrand(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...u }: Partial<Brand> & { id: string }) => {
      if (!supabase) throw new Error("no supabase");
      const { error } = await supabase.from("brands").update(u).eq("id", id).eq("user_id", userId);
      if (error) throw error;
    },
    onMutate: ({ id, ...u }) => {
      const prev = qc.getQueryData(K.brands(userId));
      qc.setQueryData(K.brands(userId), (old: Brand[]) =>
        old?.map(b => b.id === id ? { ...b, ...u } : b) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx) qc.setQueryData(K.brands(userId), ctx.prev); },
  });
}

export function useDeleteBrand(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!supabase) throw new Error("no supabase");
      const { error } = await supabase.from("brands").delete().eq("id", id).eq("user_id", userId);
      if (error) throw error;
    },
    onMutate: (id) => {
      const prevBrands = qc.getQueryData(K.brands(userId));
      const prevProducts = qc.getQueryData(K.products(userId));
      const prevVariants = qc.getQueryData(K.variants(userId));
      const deletedProductIds = (qc.getQueryData(K.products(userId)) as Product[] ?? [])
        .filter(p => p.brand_id === id).map(p => p.id);
      qc.setQueryData(K.brands(userId),   (old: Brand[])   => old?.filter(b => b.id !== id) ?? []);
      qc.setQueryData(K.products(userId), (old: Product[]) => old?.filter(p => p.brand_id !== id) ?? []);
      qc.setQueryData(K.variants(userId), (old: Variant[]) => old?.filter(v => !deletedProductIds.includes(v.product_id)) ?? []);
      return { prevBrands, prevProducts, prevVariants };
    },
    onError: (_e, _v, ctx) => {
      if (!ctx) return;
      qc.setQueryData(K.brands(userId),   ctx.prevBrands);
      qc.setQueryData(K.products(userId), ctx.prevProducts);
      qc.setQueryData(K.variants(userId), ctx.prevVariants);
    },
  });
}

// ── Products ──────────────────────────────────────────────────────────────────
export function useProducts(userId: string) {
  return useQuery({
    queryKey: K.products(userId),
    queryFn: async () => {
      if (!supabase) return [] as Product[];
      const { data } = await supabase.from("products").select("*").eq("user_id", userId).order("name");
      return (data ?? []) as Product[];
    },
    enabled: !!userId && !!supabase,
    staleTime: Infinity,
  });
}

export function useCreateProduct(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, brandId, name }: { id: string; brandId: string; name: string }) => {
      if (!supabase) throw new Error("no supabase");
      const { error } = await supabase.from("products")
        .insert({ id, user_id: userId, brand_id: brandId, name });
      if (error && error.code !== "23505") throw error;
    },
    onMutate: ({ id, brandId, name }) => {
      const product: Product = { id, user_id: userId, brand_id: brandId, name, image_url: null, created_at: now() };
      qc.setQueryData(K.products(userId), (old: Product[]) => sortByName([...(old ?? []), product]));
      return { product };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(K.products(userId), (old: Product[]) => old?.filter(p => p.id !== ctx.product.id));
    },
  });
}

export function useUpdateProduct(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...u }: Partial<Product> & { id: string }) => {
      if (!supabase) throw new Error("no supabase");
      const { error } = await supabase.from("products").update(u).eq("id", id).eq("user_id", userId);
      if (error) throw error;
    },
    onMutate: ({ id, ...u }) => {
      const prev = qc.getQueryData(K.products(userId));
      qc.setQueryData(K.products(userId), (old: Product[]) =>
        old?.map(p => p.id === id ? { ...p, ...u } : p) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx) qc.setQueryData(K.products(userId), ctx.prev); },
  });
}

export function useDeleteProduct(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!supabase) throw new Error("no supabase");
      const { error } = await supabase.from("products").delete().eq("id", id).eq("user_id", userId);
      if (error) throw error;
    },
    onMutate: (id) => {
      const prevProducts = qc.getQueryData(K.products(userId));
      const prevVariants = qc.getQueryData(K.variants(userId));
      qc.setQueryData(K.products(userId), (old: Product[]) => old?.filter(p => p.id !== id) ?? []);
      qc.setQueryData(K.variants(userId), (old: Variant[]) => old?.filter(v => v.product_id !== id) ?? []);
      return { prevProducts, prevVariants };
    },
    onError: (_e, _v, ctx) => {
      if (!ctx) return;
      qc.setQueryData(K.products(userId), ctx.prevProducts);
      qc.setQueryData(K.variants(userId), ctx.prevVariants);
    },
  });
}

// ── Variants ──────────────────────────────────────────────────────────────────
export function useVariants(userId: string) {
  return useQuery({
    queryKey: K.variants(userId),
    queryFn: async () => {
      if (!supabase) return [] as Variant[];
      const { data } = await supabase.from("variants").select("*").eq("user_id", userId).order("name");
      return (data ?? []) as Variant[];
    },
    enabled: !!userId && !!supabase,
    staleTime: Infinity,
  });
}

export function useCreateVariant(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, productId, name }: { id: string; productId: string; name: string }) => {
      if (!supabase) throw new Error("no supabase");
      const { error } = await supabase.from("variants")
        .insert({ id, user_id: userId, product_id: productId, name });
      if (error && error.code !== "23505") throw error;
    },
    onMutate: ({ id, productId, name }) => {
      const variant: Variant = { id, user_id: userId, product_id: productId, name, created_at: now() };
      qc.setQueryData(K.variants(userId), (old: Variant[]) => [...(old ?? []), variant]);
      return { variant };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(K.variants(userId), (old: Variant[]) => old?.filter(v => v.id !== ctx.variant.id));
    },
  });
}

export function useUpdateVariant(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...u }: Partial<Variant> & { id: string }) => {
      if (!supabase) throw new Error("no supabase");
      const { error } = await supabase.from("variants").update(u).eq("id", id).eq("user_id", userId);
      if (error) throw error;
    },
    onMutate: ({ id, ...u }) => {
      const prev = qc.getQueryData(K.variants(userId));
      qc.setQueryData(K.variants(userId), (old: Variant[]) =>
        old?.map(v => v.id === id ? { ...v, ...u } : v) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx) qc.setQueryData(K.variants(userId), ctx.prev); },
  });
}

export function useDeleteVariant(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!supabase) throw new Error("no supabase");
      const { error } = await supabase.from("variants").delete().eq("id", id).eq("user_id", userId);
      if (error) throw error;
    },
    onMutate: (id) => {
      const prev = qc.getQueryData(K.variants(userId));
      qc.setQueryData(K.variants(userId), (old: Variant[]) => old?.filter(v => v.id !== id) ?? []);
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx) qc.setQueryData(K.variants(userId), ctx.prev); },
  });
}

// ── Market List ───────────────────────────────────────────────────────────────
export function useMarketList(userId: string) {
  return useQuery({
    queryKey: K.list(userId),
    queryFn: async () => {
      if (!supabase) return [] as MarketListItemFull[];
      const { data } = await supabase
        .from("market_list")
        .select(`*, variant:variants(*, product:products(*, brand:brands(*)))`)
        .eq("user_id", userId)
        .is("completed_at", null)
        .order("added_at", { ascending: false });
      return (data ?? []) as MarketListItemFull[];
    },
    enabled: !!userId && !!supabase,
    staleTime: 0,
  });
}

export function useAddToList(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ variantId, listItemId }: { variantId: string; listItemId: string }) => {
      if (!supabase) throw new Error("no supabase");
      const { error } = await supabase.from("market_list")
        .insert({ id: listItemId, user_id: userId, variant_id: variantId });
      if (error && error.code !== "23505") throw error;
    },
  });
}

export function useRemoveFromList(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (variantId: string) => {
      if (!supabase) throw new Error("no supabase");
      await supabase.from("market_list").delete()
        .eq("user_id", userId).eq("variant_id", variantId).is("completed_at", null);
    },
  });
}

export function useCompleteListItem(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      if (!supabase) throw new Error("no supabase");
      const { error } = await supabase.from("market_list")
        .update({ completed_at: now() }).eq("id", itemId).eq("user_id", userId);
      if (error) throw error;
    },
    onMutate: async (itemId) => {
      await qc.cancelQueries({ queryKey: K.list(userId) });
      const prev = qc.getQueryData(K.list(userId));
      qc.setQueryData(K.list(userId), (old: MarketListItemFull[]) =>
        old?.filter(i => i.id !== itemId) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx) qc.setQueryData(K.list(userId), ctx.prev); },
    // NO onSettled — prevents flicker
  });
}

export function useClearCompleted(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error("no supabase");
      await supabase.from("market_list").delete().eq("user_id", userId).not("completed_at", "is", null);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: K.list(userId) }),
  });
}

// ── Barcodes ──────────────────────────────────────────────────────────────────
export function useBarcodes(userId: string) {
  return useQuery({
    queryKey: K.barcodes(userId),
    queryFn: async () => {
      if (!supabase) return [] as BarcodeRecord[];
      const { data } = await supabase.from("barcodes").select("*").eq("user_id", userId);
      return (data ?? []) as BarcodeRecord[];
    },
    enabled: !!userId && !!supabase,
  });
}

export function useSaveBarcode(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ barcode, variantId }: { barcode: string; variantId: string }) => {
      if (!supabase) throw new Error("no supabase");
      const { error } = await supabase.from("barcodes")
        .upsert({ user_id: userId, barcode, variant_id: variantId }, { onConflict: "user_id,barcode" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: K.barcodes(userId) }),
  });
}

// ── Smart create (client UUIDs + optimistic) ──────────────────────────────────
export async function smartCreateSync(
  userId: string,
  brandId: string, brandName: string,
  productId: string, productName: string,
  variantId: string, variantName: string,
  existingBrandId: string | null,
  existingProductId: string | null,
  existingVariantId: string | null,
): Promise<void> {
  if (!supabase) throw new Error("no supabase");
  if (!existingBrandId) {
    await supabase.from("brands").insert({ id: brandId, user_id: userId, name: brandName, print_enabled: true });
  }
  if (!existingProductId) {
    await supabase.from("products").insert({ id: productId, user_id: userId, brand_id: existingBrandId ?? brandId, name: productName });
  }
  if (!existingVariantId) {
    await supabase.from("variants").insert({ id: variantId, user_id: userId, product_id: existingProductId ?? productId, name: variantName });
  }
}

// ── External barcode lookup — ALL providers in PARALLEL ──────────────────────
export async function lookupBarcode(barcode: string): Promise<{
  brand?: string; product?: string; variant?: string; image?: string;
} | null> {

  function clean(s?: string) { return s?.trim().replace(/^\s*,\s*/, "").replace(/\s+/g, " ") || undefined; }
  const T = 5000; // 5s timeout per provider

  type Result = { brand?: string; product?: string; variant?: string; image?: string } | null;

  async function tryOpenFoodFacts(host: string): Promise<Result> {
    const r = await fetch(`https://${host}/api/v2/product/${barcode}?fields=product_name,brands,quantity,image_front_url,image_url`, { signal: AbortSignal.timeout(T) });
    if (!r.ok) return null;
    const j = await r.json();
    if (j.status !== 1 || !j.product?.product_name) return null;
    const p = j.product;
    return { brand: clean(p.brands?.split(",")[0]), product: clean(p.product_name), variant: clean(p.quantity), image: p.image_front_url || p.image_url || undefined };
  }

  async function tryBarcodeMonster(): Promise<Result> {
    const r = await fetch(`https://barcode.monster/api/${barcode}`, { signal: AbortSignal.timeout(T) });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j.description) return null;
    return { brand: clean(j.brand) || clean(j.manufacturer), product: clean(j.description), variant: undefined, image: undefined };
  }

  async function tryUpcItemDb(): Promise<Result> {
    const r = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`, { signal: AbortSignal.timeout(T) });
    if (!r.ok) return null;
    const j = await r.json();
    const item = j.items?.[0];
    if (!item?.title) return null;
    return { brand: clean(item.brand), product: clean(item.title), variant: clean(item.size), image: item.images?.[0] || undefined };
  }

  async function tryOpenBeautyFacts(): Promise<Result> {
    const r = await fetch(`https://world.openbeautyfacts.org/api/v2/product/${barcode}?fields=product_name,brands,quantity,image_front_url`, { signal: AbortSignal.timeout(T) });
    if (!r.ok) return null;
    const j = await r.json();
    if (j.status !== 1 || !j.product?.product_name) return null;
    const p = j.product;
    return { brand: clean(p.brands?.split(",")[0]), product: clean(p.product_name), variant: clean(p.quantity), image: p.image_front_url || undefined };
  }

  async function tryOpenPetFoodFacts(): Promise<Result> {
    const r = await fetch(`https://world.openpetfoodfacts.org/api/v2/product/${barcode}?fields=product_name,brands,quantity,image_front_url`, { signal: AbortSignal.timeout(T) });
    if (!r.ok) return null;
    const j = await r.json();
    if (j.status !== 1 || !j.product?.product_name) return null;
    const p = j.product;
    return { brand: clean(p.brands?.split(",")[0]), product: clean(p.product_name), variant: clean(p.quantity), image: p.image_front_url || undefined };
  }

  async function tryDatakick(): Promise<Result> {
    const r = await fetch(`https://www.datakick.org/api/items/${barcode}`, { signal: AbortSignal.timeout(T) });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j.name) return null;
    return { brand: clean(j.brand_name), product: clean(j.name), variant: clean(j.size), image: j.images?.[0]?.url || undefined };
  }

  async function tryOKFN(): Promise<Result> {
    const r = await fetch(`https://product.okfn.org/api/v0/product/${barcode}.json`, { signal: AbortSignal.timeout(T) });
    if (!r.ok) return null;
    const j = await r.json();
    const p = j.product;
    if (!p?.name) return null;
    return { brand: clean(p.brand), product: clean(p.name), variant: undefined, image: p.imageUrl || undefined };
  }

  async function tryEanSearch(): Promise<Result> {
    const r = await fetch(`https://www.ean-search.org/perl/ean-search.pl?q=${barcode}&lang=1&format=json`, { signal: AbortSignal.timeout(T) });
    if (!r.ok) return null;
    const j = await r.json();
    const item = Array.isArray(j) ? j[0] : j;
    if (!item?.name) return null;
    return { brand: undefined, product: clean(item.name), variant: undefined, image: undefined };
  }

  // Run ALL providers in parallel — return first valid result
  const promises: Promise<Result>[] = [
    tryOpenFoodFacts("in.openfoodfacts.org"),
    tryOpenFoodFacts("world.openfoodfacts.org"),
    tryOpenFoodFacts("fr.openfoodfacts.org"),
    tryUpcItemDb(),
    tryBarcodeMonster(),
    tryOpenBeautyFacts(),
    tryOpenPetFoodFacts(),
    tryDatakick(),
    tryOKFN(),
    tryEanSearch(),
  ];

  // Race: first non-null result wins
  return new Promise((resolve) => {
    let settled = 0;
    let resolved = false;
    promises.forEach(p =>
      p.then(r => {
        if (!resolved && r?.product) { resolved = true; resolve(r); }
      }).catch(() => {}).finally(() => {
        settled++;
        if (settled === promises.length && !resolved) resolve(null);
      })
    );
  });
}
