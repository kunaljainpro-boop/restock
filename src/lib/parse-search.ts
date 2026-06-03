import type { Brand, ParsedSearch } from "./types";
import { similarity } from "./fuzzy";

// Matches BOTH "Rs 20" AND "20 Rs" AND "20rs" AND "₹20" AND "20₹"
// Also matches weights/volumes in any common order
const VARIANT_RE = [
  // Price: Rs/₹ before number  →  "Rs 20", "Rs20", "₹20"
  /\b(rs\.?\s*\d+(?:\.\d+)?)\b/i,
  /\b(₹\s*\d+(?:\.\d+)?)\b/,
  // Price: number before Rs/₹  →  "20 Rs", "20rs", "20₹"
  /\b(\d+(?:\.\d+)?\s*rs\.?)\b/i,
  /\b(\d+(?:\.\d+)?\s*₹)\b/,
  // Weight/Volume: "40gm", "500ml", "1kg", "1litre" etc.
  /\b(\d+(?:\.\d+)?\s*(?:gms?|kgs?|ml|cl|ltrs?|liters?|litres?|lts?))\b/i,
  // Size multiplier: "2x30", "6x100ml"
  /\b(\d+\s*x\s*\d+(?:\s*(?:gm?|kg|ml|ltr?))?)\b/i,
  // Size words
  /\b((?:small|medium|large|xl|xxl|xxxl))\b/i,
  // Pack sizes
  /\b(pack\s*of\s*\d+|\d+\s*packs?|\d+\s*pcs?)\b/i,
  // Plain grams: "40g" (short form, checked last to avoid false positives)
  /\b(\d+(?:\.\d+)?\s*g)\b/i,
];

export function parseSearch(query: string, brands: Brand[]): ParsedSearch {
  let text = query.trim();
  let variantName = "";

  // Extract first matching variant token
  for (const re of VARIANT_RE) {
    const m = text.match(re);
    if (m) {
      variantName = m[0].trim();
      text = text.replace(m[0], "").replace(/\s+/g, " ").trim();
      break;
    }
  }

  if (!text) {
    const raw = query.trim();
    return { brandName: raw, productName: raw, variantName: variantName || raw, isSingle: true };
  }

  const words = text.split(/\s+/);

  // Try to match a known brand as prefix (longest brand name first)
  const sorted = [...brands].sort((a, b) => b.name.split(/\s+/).length - a.name.split(/\s+/).length);
  for (const brand of sorted) {
    const bWords = brand.name.split(/\s+/).length;
    if (words.length >= bWords) {
      const candidate = words.slice(0, bWords).join(" ");
      if (similarity(candidate, brand.name) >= 0.75) {
        const productPart = words.slice(bWords).join(" ").trim();
        const isSingle = !productPart || productPart.toLowerCase() === brand.name.toLowerCase();
        return {
          brandName: brand.name,
          productName: productPart || brand.name,
          variantName: variantName || text,
          isSingle,
        };
      }
    }
  }

  // No known brand match
  // 1 word  →  brand = product = that word  (e.g. "Sprite")
  // 2+ words →  brand = word[0], product = rest  (e.g. "Coca-cola Thumsup")
  if (words.length === 1) {
    return { brandName: text, productName: text, variantName: variantName || text, isSingle: true };
  }

  return {
    brandName: words[0],
    productName: words.slice(1).join(" "),
    variantName: variantName || text,
    isSingle: false,
  };
}
