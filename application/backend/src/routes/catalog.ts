import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { minPrice, queryCatalog } from "../domain/catalog.js";
import { HttpError, parse, type AppDeps } from "../http.js";

const boolParam = z.enum(["true", "false"]).transform((v) => v === "true");

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(80)
    .optional(),
  minPriceCents: z.coerce.number().int().min(0).optional(),
  maxPriceCents: z.coerce.number().int().min(0).optional(),
  inStock: boolParam.optional(),
  sort: z.enum(["relevance", "price_asc", "price_desc", "newest"]).default("relevance"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});

export async function catalogRoutes(app: FastifyInstance, { store }: AppDeps): Promise<void> {
  app.get("/api/v1/categories", async () => {
    const [categories, products] = await Promise.all([store.listCategories(), store.listProducts()]);
    return {
      categories: categories.map((category) => ({
        ...category,
        productCount: products.filter((p) => p.categoryId === category.id).length,
      })),
    };
  });

  app.get("/api/v1/products", async (request) => {
    const query = parse(listQuery, request.query);
    if (
      query.minPriceCents !== undefined &&
      query.maxPriceCents !== undefined &&
      query.minPriceCents > query.maxPriceCents
    ) {
      throw new HttpError(400, "validation_error", "The minimum price cannot be higher than the maximum price.");
    }
    const products = await store.listProducts();
    const page = queryCatalog(products, query);

    // Facets describe the options available for the current search, ignoring the category filter.
    const withoutCategory = queryCatalog(products, { ...query, category: undefined, page: 1, pageSize: 1000 });
    const counts = new Map<string, number>();
    for (const product of withoutCategory.items) {
      counts.set(product.categorySlug, (counts.get(product.categorySlug) ?? 0) + 1);
    }
    const prices = products.map(minPrice);
    return {
      ...page,
      facets: {
        categories: [...counts.entries()].map(([slug, count]) => ({ slug, count })),
        priceMinCents: prices.length ? Math.min(...prices) : 0,
        priceMaxCents: prices.length ? Math.max(...prices) : 0,
      },
    };
  });

  app.get("/api/v1/featured", async () => {
    const products = await store.listProducts();
    return { items: products.filter((p) => p.featured).slice(0, 8) };
  });

  app.get("/api/v1/products/:slug", async (request) => {
    const { slug } = parse(z.object({ slug: z.string().regex(/^[a-z0-9-]+$/).max(120) }), request.params);
    const product = await store.getProductBySlug(slug);
    if (!product) throw new HttpError(404, "not_found", "We couldn't find that product.");

    const all = await store.listProducts();
    const sameCategory = all.filter((p) => p.categoryId === product.categoryId && p.id !== product.id);
    const others = all.filter((p) => p.categoryId !== product.categoryId && p.featured && p.id !== product.id);
    return { product, related: [...sameCategory, ...others].slice(0, 4) };
  });
}
