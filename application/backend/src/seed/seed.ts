import type { Store } from "../store/store.js";
import { hashPassword } from "../services/passwords.js";
import { seedCategories, seedProducts, toCents } from "./data.js";

export interface SeedOptions {
  adminEmail?: string | undefined;
  adminPassword?: string | undefined;
}

export interface SeedResult {
  categories: number;
  products: number;
  adminCreated: boolean;
}

/**
 * Idempotent: categories, products, and the admin are only created when missing, so running it twice
 * does not duplicate data or reset stock. There are no default credentials; an admin is created only
 * when both an email and a password are supplied.
 */
export async function seedStore(store: Store, options: SeedOptions = {}): Promise<SeedResult> {
  const existing = new Map((await store.listCategories()).map((c) => [c.slug, c]));
  let categories = 0;
  for (const category of seedCategories) {
    if (!existing.has(category.slug)) {
      existing.set(category.slug, await store.createCategory({ ...category }));
      categories += 1;
    }
  }

  const present = new Set((await store.listProducts({ includeInactive: true })).map((p) => p.slug));
  let products = 0;
  for (const product of seedProducts) {
    if (present.has(product.slug)) continue;
    const category = existing.get(product.category);
    if (!category) throw new Error(`Unknown seed category ${product.category}`);
    await store.createProduct({
      slug: product.slug,
      name: product.name,
      description: product.description,
      categoryId: category.id,
      highlights: product.highlights,
      specs: product.specs,
      art: product.art,
      featured: product.featured ?? false,
      active: true,
      variants: product.variants.map((variant, index) => ({
        sku: `${product.slug.toUpperCase()}-${index + 1}`,
        label: variant.label,
        options: variant.options,
        priceCents: toCents(variant.price),
        stock: variant.stock,
      })),
    });
    products += 1;
  }

  let adminCreated = false;
  if (options.adminEmail && options.adminPassword) {
    if (options.adminPassword.length < 10) throw new Error("SEED_ADMIN_PASSWORD must be at least 10 characters");
    if (!(await store.findUserByEmail(options.adminEmail))) {
      await store.createUser({
        email: options.adminEmail,
        name: "Store Admin",
        passwordHash: await hashPassword(options.adminPassword),
        role: "admin",
      });
      adminCreated = true;
    }
  }
  return { categories, products, adminCreated };
}
