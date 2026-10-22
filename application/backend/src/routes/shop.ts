import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError, currentUser, parse, publicOrder, requireUser, type AppDeps } from "../http.js";
import {
  CheckoutError,
  cartItemsSchema,
  checkoutSchema,
  placeOrder,
  validateCart,
} from "../services/orders.js";

export async function shopRoutes(app: FastifyInstance, { store }: AppDeps): Promise<void> {
  /** Re-prices a cart from server data so the browser never decides a price or a stock level. */
  app.post("/api/v1/cart/validate", async (request) => {
    const { items } = parse(z.object({ items: cartItemsSchema }), request.body);
    return { pricing: await validateCart(store, items) };
  });

  app.post(
    "/api/v1/checkout",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const input = parse(checkoutSchema, request.body);
      const user = await currentUser(request, store);
      try {
        const order = await placeOrder(store, input, user?.id ?? null);
        request.log.info({ orderReference: order.reference, totalCents: order.totalCents }, "order placed");
        return reply.code(201).send({ order: publicOrder(order) });
      } catch (error) {
        if (error instanceof CheckoutError) {
          throw new HttpError(409, error.code, error.message, { pricing: error.pricing });
        }
        throw error;
      }
    },
  );

  /** Guests can look up an order only with both its reference and the email used at checkout. */
  app.get(
    "/api/v1/orders/lookup",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request) => {
      const { reference, email } = parse(
        z.object({
          reference: z.string().trim().toUpperCase().regex(/^ORI-[A-Z0-9]{8}$/),
          email: z.string().trim().toLowerCase().email(),
        }),
        request.query,
      );
      const order = await store.findOrder(reference);
      if (!order || order.email !== email) throw new HttpError(404, "not_found", "We couldn't find that order.");
      return { order: publicOrder(order) };
    },
  );

  app.get("/api/v1/account/orders", async (request) => {
    const user = await requireUser(request, store);
    const orders = await store.listOrdersForUser(user.id);
    return { orders: orders.map(publicOrder) };
  });
}
