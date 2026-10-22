import { describe, expect, it } from "vitest";
import { queryCatalog, searchScore, type CatalogQuery } from "../src/domain/catalog.js";
import type { Product } from "../src/domain/types.js";

let nextId = 1;
const product = (over: Partial<Product> & { price: number; stock?: number }): Product => {
  const id = nextId++;
  const { price, stock = 5, ...rest } = over;
  return {
    id,
    slug: `p-${id}`,
    name: `Product ${id}`,
    description: "A product.",
    categoryId: 1,
    categorySlug: "ceramics",
    highlights: [],
    specs: {},
    art: { shape: "vase", palette: ["#000000", "#111111", "#222222"] },
    featured: false,
    active: true,
    createdAt: new Date(2026, 0, id).toISOString(),
    variants: [{ id, productId: id, sku: `S${id}`, label: "Std", options: {}, priceCents: price, stock }],
    ...rest,
  };
};

const base: CatalogQuery = { sort: "relevance", page: 1, pageSize: 10 };

describe("queryCatalog", () => {
  const items = [
    product({ name: "Sand Vase", price: 6400, description: "A ceramic vase.", featured: true }),
    product({ name: "Linen Throw", price: 9800, categorySlug: "textiles", highlights: ["Washed linen"] }),
    product({ name: "Moss Bowl", price: 3200, stock: 0 }),
    product({ name: "Hidden Lamp", price: 1000, active: false }),
  ];

  it("never returns inactive products", () => {
    expect(queryCatalog(items, base).items.map((p) => p.name)).not.toContain("Hidden Lamp");
  });

  it("filters by category, price range, and availability", () => {
    expect(queryCatalog(items, { ...base, category: "textiles" }).items.map((p) => p.name)).toEqual(["Linen Throw"]);
    expect(queryCatalog(items, { ...base, minPriceCents: 5000, maxPriceCents: 7000 }).items.map((p) => p.name)).toEqual([
      "Sand Vase",
    ]);
    expect(queryCatalog(items, { ...base, inStock: true }).items.map((p) => p.name)).not.toContain("Moss Bowl");
  });

  it("sorts by price in both directions", () => {
    expect(queryCatalog(items, { ...base, sort: "price_asc" }).items.map((p) => p.name)).toEqual([
      "Moss Bowl",
      "Sand Vase",
      "Linen Throw",
    ]);
    expect(queryCatalog(items, { ...base, sort: "price_desc" }).items.map((p) => p.name)).toEqual([
      "Linen Throw",
      "Sand Vase",
      "Moss Bowl",
    ]);
  });

  it("puts featured products first by default and newest first on request", () => {
    expect(queryCatalog(items, base).items[0]?.name).toBe("Sand Vase");
    expect(queryCatalog(items, { ...base, sort: "newest" }).items[0]?.name).toBe("Moss Bowl");
  });

  it("ranks name matches above description matches and requires every term to match", () => {
    expect(searchScore(items[0] as Product, "vase")).toBeGreaterThan(searchScore(items[0] as Product, "ceramic"));
    expect(queryCatalog(items, { ...base, q: "vase" }).items.map((p) => p.name)).toEqual(["Sand Vase"]);
    expect(queryCatalog(items, { ...base, q: "linen" }).items.map((p) => p.name)).toEqual(["Linen Throw"]);
    expect(queryCatalog(items, { ...base, q: "vase zebra" }).total).toBe(0);
  });

  it("returns an empty page for a query with no matches", () => {
    const result = queryCatalog(items, { ...base, q: "nonexistent" });
    expect(result).toMatchObject({ total: 0, items: [], page: 1, totalPages: 1 });
  });

  it("paginates and clamps out-of-range pages", () => {
    const many = Array.from({ length: 25 }, (_, i) => product({ name: `Item ${i}`, price: 1000 + i }));
    const page2 = queryCatalog(many, { ...base, sort: "price_asc", pageSize: 10, page: 2 });
    expect(page2.items).toHaveLength(10);
    expect(page2.items[0]?.name).toBe("Item 10");
    expect(page2.totalPages).toBe(3);
    expect(queryCatalog(many, { ...base, pageSize: 10, page: 99 }).page).toBe(3);
  });
});
