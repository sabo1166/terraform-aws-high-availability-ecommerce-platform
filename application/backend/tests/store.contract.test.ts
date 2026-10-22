import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/db/migrate.js";
import { newOrderReference, placeOrder, changeOrderStatus, CheckoutError } from "../src/services/orders.js";
import { seedStore } from "../src/seed/seed.js";
import { MemoryStore } from "../src/store/memory.js";
import { MysqlStore, type MysqlConfig } from "../src/store/mysql.js";
import { StoreError, type Store } from "../src/store/store.js";
import mysql from "mysql2/promise";

/**
 * The same behaviour contract runs against every Store implementation. MemoryStore always runs.
 * MysqlStore runs only when MYSQL_TEST_* variables point to a throwaway database whose name ends
 * in "_test" (all its tables are dropped). CI provides one with a MySQL service container.
 */
const mysqlTest: MysqlConfig | null = process.env.MYSQL_TEST_HOST
  ? {
      host: process.env.MYSQL_TEST_HOST,
      port: Number(process.env.MYSQL_TEST_PORT ?? 3306),
      user: process.env.MYSQL_TEST_USER ?? "root",
      password: process.env.MYSQL_TEST_PASSWORD ?? "",
      database: process.env.MYSQL_TEST_DATABASE ?? "",
    }
  : null;

if (mysqlTest && !mysqlTest.database.endsWith("_test")) {
  throw new Error("MYSQL_TEST_DATABASE must end in _test; its tables are dropped before the tests");
}

async function resetMysql(config: MysqlConfig): Promise<void> {
  const connection = await mysql.createConnection({ ...config, multipleStatements: true });
  try {
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    const [tables] = await connection.query<mysql.RowDataPacket[]>("SHOW TABLES");
    for (const row of tables) {
      await connection.query(`DROP TABLE IF EXISTS \`${Object.values(row)[0] as string}\``);
    }
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    await connection.end();
  }
  await runMigrations(config);
}

const implementations: { name: string; enabled: boolean; create: () => Promise<Store> }[] = [
  { name: "MemoryStore", enabled: true, create: async () => new MemoryStore() },
  {
    name: "MysqlStore",
    enabled: mysqlTest !== null,
    create: async () => {
      await resetMysql(mysqlTest!);
      return new MysqlStore(mysqlTest!);
    },
  },
];

for (const impl of implementations) {
  describe.skipIf(!impl.enabled)(`Store contract: ${impl.name}`, () => {
    let store: Store;

    beforeAll(async () => {
      store = await impl.create();
      await seedStore(store, {});
    });

    afterAll(async () => {
      await store?.close();
    });

    const checkout = (variantId: number, quantity: number) => ({
      items: [{ variantId, quantity }],
      email: "buyer@example.test",
      customerName: "Buyer",
      address: { line1: "1 Street", line2: "", city: "City", region: "RG", postalCode: "12345", country: "US" },
      paymentMethod: "demo" as const,
    });

    async function stockyVariant(minStock: number) {
      const products = await store.listProducts();
      const variant = products.flatMap((p) => p.variants).find((v) => v.stock >= minStock);
      if (!variant) throw new Error("no variant with enough stock");
      return variant;
    }

    it("pings", async () => {
      await expect(store.ping()).resolves.toBeUndefined();
    });

    it("seeds idempotently", async () => {
      const before = (await store.listProducts({ includeInactive: true })).length;
      const result = await seedStore(store, {});
      expect(result).toMatchObject({ categories: 0, products: 0 });
      expect((await store.listProducts({ includeInactive: true })).length).toBe(before);
    });

    it("returns products with variants, art, and JSON fields intact", async () => {
      const product = await store.getProductBySlug("arc-vase");
      expect(product?.categorySlug).toBe("ceramics");
      expect(product?.art.shape).toBe("vase");
      expect(product?.highlights.length).toBeGreaterThan(0);
      expect(product?.specs).toHaveProperty("Material");
      expect(product?.variants[0]?.priceCents).toBe(6400);
      expect(product?.variants[0]?.options).toHaveProperty("Finish");
    });

    it("hides inactive products unless asked", async () => {
      const product = (await store.getProductBySlug("pebble-bowl"))!;
      await store.updateProduct(product.id, { active: false });
      expect(await store.getProductBySlug("pebble-bowl")).toBeNull();
      expect(await store.getProductBySlug("pebble-bowl", { includeInactive: true })).not.toBeNull();
      await store.updateProduct(product.id, { active: true });
    });

    it("rejects duplicate slugs, SKUs, and emails with a duplicate error", async () => {
      const category = (await store.listCategories())[0]!;
      const base = {
        slug: "contract-product",
        name: "Contract",
        description: "d",
        categoryId: category.id,
        highlights: [],
        specs: {},
        art: { shape: "bowl" as const, palette: ["#000000", "#111111", "#222222"] as [string, string, string] },
        featured: false,
        active: true,
        variants: [{ sku: "CONTRACT-1", label: "Std", options: {}, priceCents: 100, stock: 1 }],
      };
      await store.createProduct(base);
      await expect(store.createProduct(base)).rejects.toMatchObject({ code: "duplicate" });
      await expect(
        store.createProduct({ ...base, slug: "contract-other" }),
      ).rejects.toBeInstanceOf(StoreError);

      await store.createUser({ email: "Dup@Example.test", name: "A", passwordHash: "x", role: "customer" });
      await expect(
        store.createUser({ email: "dup@example.test", name: "B", passwordHash: "y", role: "customer" }),
      ).rejects.toMatchObject({ code: "duplicate" });
      expect((await store.findUserByEmail("DUP@example.test"))?.name).toBe("A");
    });

    it("places an order atomically and decrements stock", async () => {
      const variant = await stockyVariant(3);
      const order = await placeOrder(store, checkout(variant.id, 2), null);
      expect(order.reference).toMatch(/^ORI-/);
      expect(order.totalCents).toBe(order.subtotalCents + order.shippingCents);
      expect(order.items[0]).toMatchObject({ quantity: 2, unitPriceCents: variant.priceCents });
      expect((await store.getVariantInfo([variant.id])).get(variant.id)?.stock).toBe(variant.stock - 2);
      expect((await store.findOrder(order.reference))?.items).toHaveLength(1);
    });

    it("rolls back everything when a later step fails", async () => {
      const variant = await stockyVariant(2);
      const before = (await store.getVariantInfo([variant.id])).get(variant.id)!.stock;
      await expect(
        store.transaction(async (tx) => {
          await tx.adjustStock(variant.id, -1);
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect((await store.getVariantInfo([variant.id])).get(variant.id)?.stock).toBe(before);
    });

    it("refuses to take stock below zero", async () => {
      const variant = await stockyVariant(1);
      await expect(
        store.transaction((tx) => tx.adjustStock(variant.id, -(variant.stock + 1000))),
      ).rejects.toMatchObject({ code: "insufficient_stock" });
    });

    it("sells the last unit to exactly one concurrent buyer", async () => {
      const variant = await stockyVariant(1);
      await store.setVariantStock(variant.id, 1);
      const results = await Promise.allSettled([
        placeOrder(store, checkout(variant.id, 1), null),
        placeOrder(store, checkout(variant.id, 1), null),
        placeOrder(store, checkout(variant.id, 1), null),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const r of results) {
        if (r.status === "rejected") expect(r.reason).toBeInstanceOf(CheckoutError);
      }
      expect((await store.getVariantInfo([variant.id])).get(variant.id)?.stock).toBe(0);
    });

    it("restocks on cancellation and enforces status transitions", async () => {
      const variant = await stockyVariant(2);
      await store.setVariantStock(variant.id, 5);
      const order = await placeOrder(store, checkout(variant.id, 2), null);
      expect((await store.getVariantInfo([variant.id])).get(variant.id)?.stock).toBe(3);
      await changeOrderStatus(store, order.reference, "cancelled");
      expect((await store.getVariantInfo([variant.id])).get(variant.id)?.stock).toBe(5);
      await expect(changeOrderStatus(store, order.reference, "packed")).rejects.toMatchObject({ code: "invalid_transition" });
      expect((await store.findOrder(order.reference))?.status).toBe("cancelled");
    });

    it("lists orders per user", async () => {
      const user = await store.createUser({ email: "orders@example.test", name: "O", passwordHash: "x", role: "customer" });
      const variant = await stockyVariant(1);
      await placeOrder(store, checkout(variant.id, 1), user.id);
      const orders = await store.listOrdersForUser(user.id);
      expect(orders).toHaveLength(1);
      expect(orders[0]?.userId).toBe(user.id);
      expect((await store.listOrders(10)).length).toBeGreaterThan(0);
    });

    it("generates unambiguous order references", () => {
      for (let i = 0; i < 200; i += 1) expect(newOrderReference()).toMatch(/^ORI-[2-9A-HJKMNP-TV-Z]{8}$/);
    });
  });
}
