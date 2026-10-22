import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ORDER_STATUSES } from "../domain/types.js";
import { HttpError, parse, publicOrder, requireAdmin, type AppDeps } from "../http.js";
import { StatusError, changeOrderStatus } from "../services/orders.js";
import { StoreError } from "../store/store.js";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const variantSchema = z.object({
  sku: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(120),
  options: z.record(z.string().max(60), z.string().max(60)).default({}),
  priceCents: z.number().int().min(0).max(10_000_000),
  stock: z.number().int().min(0).max(100_000),
});

const newProductSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(120),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  categoryId: z.number().int().positive(),
  highlights: z.array(z.string().trim().min(1).max(120)).max(8).default([]),
  specs: z.record(z.string().max(60), z.string().max(160)).default({}),
  art: z.object({
    shape: z.enum(["vase", "lamp", "bowl", "mug", "candle", "throw", "tray", "pillow"]),
    palette: z.tuple([hex, hex, hex]),
  }),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
  variants: z.array(variantSchema).min(1).max(20),
});

const patchProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(4000),
    featured: z.boolean(),
    active: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

const idParam = z.object({ id: z.coerce.number().int().positive() });

/** Every route here re-checks the admin role from the database on the server. */
export async function adminRoutes(app: FastifyInstance, { store }: AppDeps): Promise<void> {
  app.get("/api/v1/admin/products", async (request) => {
    await requireAdmin(request, store);
    return { products: await store.listProducts({ includeInactive: true }) };
  });

  app.post("/api/v1/admin/products", async (request, reply) => {
    await requireAdmin(request, store);
    const input = parse(newProductSchema, request.body);
    try {
      return reply.code(201).send({ product: await store.createProduct(input) });
    } catch (error) {
      if (error instanceof StoreError) {
        throw new HttpError(error.code === "duplicate" ? 409 : 400, error.code, error.message);
      }
      throw error;
    }
  });

  app.patch("/api/v1/admin/products/:id", async (request) => {
    await requireAdmin(request, store);
    const { id } = parse(idParam, request.params);
    const patch = parse(patchProductSchema, request.body);
    const product = await store.updateProduct(id, patch);
    if (!product) throw new HttpError(404, "not_found", "Product not found.");
    return { product };
  });

  app.patch("/api/v1/admin/variants/:id/stock", async (request) => {
    await requireAdmin(request, store);
    const { id } = parse(idParam, request.params);
    const { stock } = parse(z.object({ stock: z.number().int().min(0).max(100_000) }), request.body);
    const variant = await store.setVariantStock(id, stock);
    if (!variant) throw new HttpError(404, "not_found", "Variant not found.");
    return { variant };
  });

  app.get("/api/v1/admin/orders", async (request) => {
    await requireAdmin(request, store);
    const orders = await store.listOrders(200);
    return { orders: orders.map(publicOrder) };
  });

  app.patch("/api/v1/admin/orders/:reference/status", async (request) => {
    await requireAdmin(request, store);
    const { reference } = parse(z.object({ reference: z.string().regex(/^ORI-[A-Z0-9]{8}$/) }), request.params);
    const { status } = parse(z.object({ status: z.enum(ORDER_STATUSES as [string, ...string[]]) }), request.body);
    try {
      const order = await changeOrderStatus(store, reference, status as (typeof ORDER_STATUSES)[number]);
      return { order: publicOrder(order) };
    } catch (error) {
      if (error instanceof StatusError) {
        throw new HttpError(error.code === "not_found" ? 404 : 409, error.code, error.message);
      }
      throw error;
    }
  });
}
