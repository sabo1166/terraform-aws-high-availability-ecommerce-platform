import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Product } from "../src/domain/types.js";
import type { MemoryStore } from "../src/store/memory.js";
import { ADMIN, ORIGIN, makeApp, register, signIn, validCheckout } from "./helpers.js";

let app: FastifyInstance;
let store: MemoryStore;

beforeEach(async () => {
  ({ app, store } = await makeApp());
});

afterAll(async () => {
  await app?.close();
});

const json = (response: { body: string }) => JSON.parse(response.body);

async function firstVariant(options: { minStock?: number } = {}) {
  const products = await store.listProducts();
  for (const product of products) {
    const variant = product.variants.find((v) => v.stock >= (options.minStock ?? 1));
    if (variant) return { product, variant };
  }
  throw new Error("No suitable variant in seed data");
}

describe("health", () => {
  it("liveness does not depend on the store", async () => {
    store.ping = async () => {
      throw new Error("database down");
    };
    const response = await app.inject({ url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(json(response)).toEqual({ status: "ok" });
  });

  it("answers the ALB default health-check path / without touching the store", async () => {
    store.ping = async () => {
      throw new Error("database down");
    };
    const response = await app.inject({ url: "/" });
    expect(response.statusCode).toBe(200);
    expect(json(response)).toEqual({ service: "oriel-api", status: "ok" });
  });

  it("readiness reports ready, then 503 without leaking details when the store fails", async () => {
    expect((await app.inject({ url: "/readyz" })).statusCode).toBe(200);
    store.ping = async () => {
      throw new Error("secret connection string failure");
    };
    const failing = await app.inject({ url: "/readyz" });
    expect(failing.statusCode).toBe(503);
    expect(failing.body).not.toContain("secret");
  });

  it("adds a request id and uses a consistent error shape", async () => {
    const response = await app.inject({ url: "/api/v1/nope", headers: { "x-request-id": "trace-123" } });
    expect(response.statusCode).toBe(404);
    expect(response.headers["x-request-id"]).toBe("trace-123");
    expect(json(response).error).toMatchObject({ code: "not_found", requestId: "trace-123" });
  });

  it("replaces an unsafe request id", async () => {
    const response = await app.inject({ url: "/healthz", headers: { "x-request-id": "bad id\nwith newline" } });
    expect(response.headers["x-request-id"]).not.toContain("bad");
  });

  it("sets security headers", async () => {
    const response = await app.inject({ url: "/healthz" });
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });
});

describe("catalogue", () => {
  it("lists seeded categories with product counts", async () => {
    const { categories } = json(await app.inject({ url: "/api/v1/categories" }));
    expect(categories.length).toBeGreaterThanOrEqual(5);
    expect(categories[0]).toHaveProperty("productCount");
  });

  it("filters, sorts, and paginates products", async () => {
    const response = await app.inject({
      url: "/api/v1/products?category=ceramics&sort=price_desc&pageSize=3&inStock=true",
    });
    expect(response.statusCode).toBe(200);
    const body = json(response);
    expect(body.items.length).toBeLessThanOrEqual(3);
    expect(body.items.every((p: Product) => p.categorySlug === "ceramics")).toBe(true);
    const prices = body.items.map((p: Product) => Math.min(...p.variants.map((v) => v.priceCents)));
    expect([...prices].sort((a, b) => b - a)).toEqual(prices);
    expect(body.facets.priceMaxCents).toBeGreaterThan(body.facets.priceMinCents);
  });

  it("searches by name and returns an empty result with a 200 for no match", async () => {
    const hit = json(await app.inject({ url: "/api/v1/products?q=lamp" }));
    expect(hit.total).toBeGreaterThan(0);
    const miss = json(await app.inject({ url: "/api/v1/products?q=zzzznothing" }));
    expect(miss).toMatchObject({ total: 0, items: [] });
  });

  it("rejects invalid query parameters with field details", async () => {
    const response = await app.inject({ url: "/api/v1/products?pageSize=1000&sort=bogus" });
    expect(response.statusCode).toBe(400);
    expect(json(response).error.code).toBe("validation_error");
    const range = await app.inject({ url: "/api/v1/products?minPriceCents=900&maxPriceCents=100" });
    expect(range.statusCode).toBe(400);
  });

  it("returns product detail with related products and 404 for unknown or inactive items", async () => {
    const detail = json(await app.inject({ url: "/api/v1/products/arc-vase" }));
    expect(detail.product.slug).toBe("arc-vase");
    expect(detail.related.length).toBeGreaterThan(0);
    expect(detail.related.every((p: Product) => p.id !== detail.product.id)).toBe(true);
    expect((await app.inject({ url: "/api/v1/products/unknown-thing" })).statusCode).toBe(404);
    const product = await store.getProductBySlug("arc-vase");
    await store.updateProduct(product!.id, { active: false });
    expect((await app.inject({ url: "/api/v1/products/arc-vase" })).statusCode).toBe(404);
  });
});

describe("cart validation and checkout", () => {
  it("prices a cart on the server", async () => {
    const { variant } = await firstVariant();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/cart/validate",
      payload: { items: [{ variantId: variant.id, quantity: 2 }] },
      headers: ORIGIN,
    });
    const { pricing } = json(response);
    expect(pricing.subtotalCents).toBe(variant.priceCents * 2);
    expect(pricing.totalCents).toBe(pricing.subtotalCents + pricing.shippingCents);
  });

  it("flags out-of-stock and unknown items", async () => {
    const products = await store.listProducts();
    const soldOut = products.flatMap((p) => p.variants).find((v) => v.stock === 0)!;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/cart/validate",
      payload: { items: [{ variantId: soldOut.id, quantity: 1 }, { variantId: 999999, quantity: 1 }] },
      headers: ORIGIN,
    });
    const codes = json(response).pricing.issues.map((i: { code: string }) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["out_of_stock", "unavailable"]));
  });

  it("rejects malformed carts", async () => {
    for (const payload of [{ items: [] }, { items: [{ variantId: 1, quantity: 0 }] }, { items: [{ variantId: "x", quantity: 1 }] }, {}]) {
      const response = await app.inject({ method: "POST", url: "/api/v1/cart/validate", payload, headers: ORIGIN });
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
    }
  });

  it("creates an order, uses server prices, and decrements stock", async () => {
    const { variant } = await firstVariant({ minStock: 3 });
    const before = variant.stock;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/checkout",
      headers: ORIGIN,
      // A tampered price in the payload must be ignored.
      payload: { ...validCheckout([{ variantId: variant.id, quantity: 2 }]), items: [{ variantId: variant.id, quantity: 2, priceCents: 1 }] },
    });
    expect(response.statusCode).toBe(201);
    const { order } = json(response);
    expect(order.reference).toMatch(/^ORI-[A-Z0-9]{8}$/);
    expect(order.items[0].unitPriceCents).toBe(variant.priceCents);
    expect(order.subtotalCents).toBe(variant.priceCents * 2);
    expect(order.paymentMethod).toBe("demo");
    expect(order.address.country).toBe("US");
    expect(order).not.toHaveProperty("userId");
    const after = (await store.getVariantInfo([variant.id])).get(variant.id)!;
    expect(after.stock).toBe(before - 2);
  });

  it("refuses to oversell and leaves stock untouched", async () => {
    const products = await store.listProducts();
    const low = products.flatMap((p) => p.variants).find((v) => v.stock > 0 && v.stock < 5)!;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/checkout",
      headers: ORIGIN,
      payload: validCheckout([{ variantId: low.id, quantity: low.stock + 1 }]),
    });
    expect(response.statusCode).toBe(409);
    expect(json(response).error.code).toBe("cart_changed");
    expect(json(response).error.details.pricing.issues[0].code).toBe("insufficient_stock");
    expect((await store.getVariantInfo([low.id])).get(low.id)!.stock).toBe(low.stock);
  });

  it("validates customer and address fields", async () => {
    const { variant } = await firstVariant();
    const bad = validCheckout([{ variantId: variant.id, quantity: 1 }]);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/checkout",
      headers: ORIGIN,
      payload: { ...bad, email: "not-an-email", address: { ...bad.address, postalCode: "!!", country: "USA" } },
    });
    expect(response.statusCode).toBe(400);
    const paths = json(response).error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["email", "address.postalCode", "address.country"]));
  });

  it("never accepts card data: only the demo payment method is valid", async () => {
    const { variant } = await firstVariant();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/checkout",
      headers: ORIGIN,
      payload: { ...validCheckout([{ variantId: variant.id, quantity: 1 }]), paymentMethod: "card", cardNumber: "4242424242424242" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("sells the last unit to exactly one of two concurrent buyers", async () => {
    const products = await store.listProducts();
    const target = products.flatMap((p) => p.variants).find((v) => v.stock > 0)!;
    await store.setVariantStock(target.id, 1);
    const attempt = () =>
      app.inject({
        method: "POST",
        url: "/api/v1/checkout",
        headers: ORIGIN,
        payload: validCheckout([{ variantId: target.id, quantity: 1 }]),
      });
    const results = await Promise.all([attempt(), attempt(), attempt()]);
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1);
    expect(results.filter((r) => r.statusCode === 409)).toHaveLength(2);
    expect((await store.getVariantInfo([target.id])).get(target.id)!.stock).toBe(0);
  });

  it("looks up a guest order only with the matching email", async () => {
    const { variant } = await firstVariant();
    const created = json(
      await app.inject({
        method: "POST",
        url: "/api/v1/checkout",
        headers: ORIGIN,
        payload: validCheckout([{ variantId: variant.id, quantity: 1 }]),
      }),
    ).order;
    const ok = await app.inject({ url: `/api/v1/orders/lookup?reference=${created.reference}&email=buyer@example.test` });
    expect(ok.statusCode).toBe(200);
    const wrong = await app.inject({ url: `/api/v1/orders/lookup?reference=${created.reference}&email=other@example.test` });
    expect(wrong.statusCode).toBe(404);
  });
});

describe("authentication", () => {
  it("registers, reads the session, and logs out", async () => {
    const { response, cookie } = await register(app, "New.Customer@Example.test");
    expect(response.statusCode).toBe(201);
    expect(json(response).user).toMatchObject({ email: "new.customer@example.test", role: "customer" });
    expect(JSON.stringify(json(response))).not.toContain("passwordHash");
    expect(String(response.headers["set-cookie"])).toMatch(/HttpOnly/i);
    expect(String(response.headers["set-cookie"])).toMatch(/SameSite=Lax/i);

    const me = json(await app.inject({ url: "/api/v1/auth/me", headers: { cookie } }));
    expect(me.user.email).toBe("new.customer@example.test");
    expect(json(await app.inject({ url: "/api/v1/auth/me" })).user).toBeNull();

    const out = await app.inject({ method: "POST", url: "/api/v1/auth/logout", headers: { ...ORIGIN, cookie } });
    expect(out.statusCode).toBe(200);
    expect(String(out.headers["set-cookie"])).toMatch(/oriel_session=;/);
  });

  it("rejects duplicate emails, weak passwords, and wrong credentials with a generic message", async () => {
    await register(app, "dup@example.test");
    expect((await register(app, "dup@example.test")).response.statusCode).toBe(409);
    expect((await register(app, "weak@example.test", "short")).response.statusCode).toBe(400);

    const wrongPassword = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: ORIGIN,
      payload: { email: "dup@example.test", password: "definitely-wrong-password" },
    });
    const unknownEmail = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: ORIGIN,
      payload: { email: "nobody@example.test", password: "definitely-wrong-password" },
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(json(wrongPassword).error.message).toBe(json(unknownEmail).error.message);
  });

  it("stores only a salted hash, never the password", async () => {
    await register(app, "hash@example.test", "a-very-long-password-1");
    const user = await store.findUserByEmail("hash@example.test");
    expect(user?.passwordHash).toMatch(/^scrypt\$/);
    expect(user?.passwordHash).not.toContain("a-very-long-password-1");
  });

  it("rate limits repeated login attempts", async () => {
    const attempt = () =>
      app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        headers: ORIGIN,
        payload: { email: "nobody@example.test", password: "definitely-wrong-password" },
      });
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) statuses.push((await attempt()).statusCode);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it("rejects state-changing requests from an unknown origin", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin: "https://evil.example" },
      payload: { email: "a@example.test", password: "whatever-password" },
    });
    expect(response.statusCode).toBe(403);
    expect(json(response).error.code).toBe("forbidden_origin");
  });
});

describe("orders and admin authorization", () => {
  it("attaches orders to the signed-in customer and lists them in their account only", async () => {
    const { cookie } = await register(app, "shopper@example.test");
    const { cookie: otherCookie } = await register(app, "other@example.test");
    const { variant } = await firstVariant();
    await app.inject({
      method: "POST",
      url: "/api/v1/checkout",
      headers: { ...ORIGIN, cookie },
      payload: validCheckout([{ variantId: variant.id, quantity: 1 }]),
    });
    const mine = json(await app.inject({ url: "/api/v1/account/orders", headers: { cookie } }));
    expect(mine.orders).toHaveLength(1);
    const theirs = json(await app.inject({ url: "/api/v1/account/orders", headers: { cookie: otherCookie } }));
    expect(theirs.orders).toHaveLength(0);
    expect((await app.inject({ url: "/api/v1/account/orders" })).statusCode).toBe(401);
  });

  const adminRequests: { method: "GET" | "POST" | "PATCH"; url: string; payload?: Record<string, unknown> }[] = [
    { method: "GET", url: "/api/v1/admin/products" },
    { method: "POST", url: "/api/v1/admin/products", payload: {} },
    { method: "PATCH", url: "/api/v1/admin/products/1", payload: { active: false } },
    { method: "PATCH", url: "/api/v1/admin/variants/1/stock", payload: { stock: 1 } },
    { method: "GET", url: "/api/v1/admin/orders" },
    { method: "PATCH", url: "/api/v1/admin/orders/ORI-AAAAAAAA/status", payload: { status: "packed" } },
  ];

  it("blocks anonymous users (401) and customers (403) from every admin route", async () => {
    const { cookie } = await register(app, "customer@example.test");
    for (const request of adminRequests) {
      const anonymous = await app.inject({ ...request, headers: ORIGIN });
      expect(anonymous.statusCode, `anonymous ${request.method} ${request.url}`).toBe(401);
      const customer = await app.inject({ ...request, headers: { ...ORIGIN, cookie } });
      expect(customer.statusCode, `customer ${request.method} ${request.url}`).toBe(403);
    }
  });

  it("does not trust a forged role: registration cannot create an admin", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      headers: ORIGIN,
      payload: { email: "sneaky@example.test", name: "Sneaky", password: "a-long-password-123", role: "admin" },
    });
    expect(json(response).user.role).toBe("customer");
  });

  it("lets an admin manage products, stock, and order status", async () => {
    const cookie = await signIn(app, ADMIN.email, ADMIN.password);
    const headers = { ...ORIGIN, cookie };
    const categories = (await store.listCategories())[0]!;

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/products",
      headers,
      payload: {
        slug: "test-product",
        name: "Test Product",
        description: "Created by a test.",
        categoryId: categories.id,
        art: { shape: "bowl", palette: ["#111111", "#222222", "#333333"] },
        variants: [{ sku: "TEST-1", label: "Std", priceCents: 1500, stock: 3 }],
      },
    });
    expect(created.statusCode).toBe(201);
    const product = json(created).product as Product;
    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/admin/products",
      headers,
      payload: {
        slug: "test-product",
        name: "Again",
        description: "Duplicate slug.",
        categoryId: categories.id,
        art: { shape: "bowl", palette: ["#111111", "#222222", "#333333"] },
        variants: [{ sku: "TEST-2", label: "Std", priceCents: 1500, stock: 3 }],
      },
    });
    expect(duplicate.statusCode).toBe(409);

    const stock = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/variants/${product.variants[0]!.id}/stock`,
      headers,
      payload: { stock: 9 },
    });
    expect(json(stock).variant.stock).toBe(9);

    // Place an order, then walk it through its lifecycle; cancelling restocks.
    const order = json(
      await app.inject({
        method: "POST",
        url: "/api/v1/checkout",
        headers: ORIGIN,
        payload: validCheckout([{ variantId: product.variants[0]!.id, quantity: 4 }]),
      }),
    ).order;
    expect((await store.getVariantInfo([product.variants[0]!.id])).get(product.variants[0]!.id)!.stock).toBe(5);

    const url = `/api/v1/admin/orders/${order.reference}/status`;
    expect((await app.inject({ method: "PATCH", url, headers, payload: { status: "shipped" } })).statusCode).toBe(409);
    expect((await app.inject({ method: "PATCH", url, headers, payload: { status: "cancelled" } })).statusCode).toBe(200);
    expect((await store.getVariantInfo([product.variants[0]!.id])).get(product.variants[0]!.id)!.stock).toBe(9);
    expect((await app.inject({ method: "PATCH", url, headers, payload: { status: "packed" } })).statusCode).toBe(409);

    const listed = json(await app.inject({ url: "/api/v1/admin/orders", headers }));
    expect(listed.orders[0].reference).toBe(order.reference);
  });
});
