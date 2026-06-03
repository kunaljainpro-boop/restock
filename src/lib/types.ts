export interface Profile {
  id: string;
  market_name: string;
  appearance: "light" | "dark" | "system";
  print_header_default: boolean;
  print_show_store_name: boolean;
  print_show_date: boolean;
  updated_at: string;
}

export interface Brand {
  id: string;
  user_id: string;
  name: string;
  logo_url: string | null;
  print_enabled: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  user_id: string;
  brand_id: string;
  name: string;
  image_url: string | null;
  created_at: string;
}

export interface Variant {
  id: string;
  user_id: string;
  product_id: string;
  name: string;
  created_at: string;
}

export interface BarcodeRecord {
  id: string;
  user_id: string;
  barcode: string;
  variant_id: string | null;
}

export interface MarketListItem {
  id: string;
  user_id: string;
  variant_id: string;
  added_at: string;
  completed_at: string | null;
}

export interface MarketListItemFull extends MarketListItem {
  variant: Variant & {
    product: Product & {
      brand: Brand;
    };
  };
}

export interface ParsedSearch {
  brandName: string;
  productName: string;
  variantName: string;
  isSingle: boolean; // brand == product (e.g. "Btex Rs 50")
}
