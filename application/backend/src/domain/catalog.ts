import type { Product } from "./types.js";

export type SortKey = "relevance" | "price_asc" | "price_desc" | "newest";

export interface CatalogQuery {
  q?: string;
  category?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  inStock?: boolean;
  sort: SortKey;
  page: number;
  pageSize: number;
}

export interface CatalogPage {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function minPrice(product: Product): number {
  return product.variants.length ? Math.min(...product.variants.map((v) => v.priceCents)) : 0;
}

export function totalStock(product: Product): number {
  return product.variants.reduce((sum, v) => sum + v.stock, 0);
}

/** Relevance: name matches outrank highlights, which outrank description matches. 0 means no match. */
export function searchScore(product: Product, query: string): number {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 1;
  let score = 0;
  const name = product.name.toLowerCase();
  const highlights = product.highlights.join(" ").toLowerCase();
  const description = product.description.toLowerCase();
  const category = product.categorySlug.toLowerCase();
  for (const term of terms) {
    let termScore = 0;
    if (name.includes(term)) termScore += name.startsWith(term) ? 12 : 8;
    if (category.includes(term)) termScore += 4;
    if (highlights.includes(term)) termScore += 3;
    if (description.includes(term)) termScore += 1;
    // Every term must match somewhere, otherwise the product is not a result.
    if (termScore === 0) return 0;
    score += termScore;
  }
  return score;
}

/** Filters, sorts, and paginates an in-memory catalogue. Pure and deterministic (ties break on id). */
export function queryCatalog(products: Product[], query: CatalogQuery): CatalogPage {
  const q = query.q?.trim() ?? "";
  const scored = products
    .filter((p) => p.active)
    .filter((p) => !query.category || p.categorySlug === query.category)
    .filter((p) => query.minPriceCents === undefined || minPrice(p) >= query.minPriceCents)
    .filter((p) => query.maxPriceCents === undefined || minPrice(p) <= query.maxPriceCents)
    .filter((p) => !query.inStock || totalStock(p) > 0)
    .map((product) => ({ product, score: q ? searchScore(product, q) : 1 }))
    .filter((entry) => entry.score > 0);

  scored.sort((a, b) => {
    switch (query.sort) {
      case "price_asc":
        return minPrice(a.product) - minPrice(b.product) || a.product.id - b.product.id;
      case "price_desc":
        return minPrice(b.product) - minPrice(a.product) || a.product.id - b.product.id;
      case "newest":
        return b.product.createdAt.localeCompare(a.product.createdAt) || b.product.id - a.product.id;
      default:
        // relevance: search score first; without a query, featured products first.
        return (
          b.score - a.score ||
          Number(b.product.featured) - Number(a.product.featured) ||
          a.product.id - b.product.id
        );
    }
  });

  const total = scored.length;
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(Math.max(1, query.page), totalPages);
  const start = (page - 1) * query.pageSize;
  return {
    items: scored.slice(start, start + query.pageSize).map((entry) => entry.product),
    total,
    page,
    pageSize: query.pageSize,
    totalPages,
  };
}
