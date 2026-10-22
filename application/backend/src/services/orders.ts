import { randomInt } from "node:crypto";
import { z } from "zod";
import { mergeItems, priceCart, type CartIssue, type CartPricing, type RequestedItem } from "../domain/pricing.js";
import type { OrderRecord, OrderStatus } from "../domain/types.js";
import { StoreError, type Store } from "../store/store.js";

export const cartItemsSchema = z
  .array(
    z.object({
      variantId: z.number().int().positive(),
      quantity: z.number().int().min(1).max(100),
    }),
  )
  .min(1)
  .max(50);

const text = (max: number) => z.string().trim().min(1).max(max);

export const checkoutSchema = z.object({
  items: cartItemsSchema,
  email: z.string().trim().toLowerCase().email().max(254),
  customerName: text(120),
  address: z.object({
    line1: text(200),
    line2: z.string().trim().max(200).default(""),
    city: text(120),
    region: text(120),
    postalCode: z
      .string()
      .trim()
      .min(2)
      .max(16)
      .regex(/^[A-Za-z0-9][A-Za-z0-9 -]*$/, "Enter a valid postal code"),
    country: z
      .string()
      .trim()
      .length(2, "Use a two-letter country code")
      .transform((value) => value.toUpperCase()),
  }),
  /** Payment is a demo: no card data is accepted, collected, or stored. */
  paymentMethod: z.literal("demo"),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export class CheckoutError extends Error {
  constructor(
    public readonly code: "cart_changed" | "empty_cart",
    message: string,
    public readonly pricing?: CartPricing,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

/** Prices a cart from server-side data only; the browser supplies variant ids and quantities, nothing else. */
export async function validateCart(store: Store, items: RequestedItem[]): Promise<CartPricing> {
  const merged = mergeItems(items);
  const variants = await store.getVariantInfo(merged.map((i) => i.variantId));
  return priceCart(merged, variants);
}

// Crockford-style alphabet without ambiguous characters (no I, L, O, U, 0, 1).
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newOrderReference(): string {
  let suffix = "";
  for (let i = 0; i < 8; i += 1) suffix += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  return `ORI-${suffix}`;
}

/**
 * Creates an order atomically: variant rows are locked, the cart is re-priced from the locked rows,
 * stock is decremented, and the order is inserted. If anything differs from what the customer saw
 * (price, stock, availability) the order is refused with the corrected pricing instead of being adjusted.
 */
export async function placeOrder(store: Store, input: CheckoutInput, userId: number | null): Promise<OrderRecord> {
  const merged = mergeItems(input.items);
  return store.transaction(async (tx) => {
    const locked = await tx.lockVariants(merged.map((i) => i.variantId));
    const pricing = priceCart(merged, locked);
    if (pricing.lines.length === 0) {
      throw new CheckoutError("empty_cart", "None of the items in your cart can be ordered.", pricing);
    }
    if (pricing.issues.length > 0) {
      throw new CheckoutError("cart_changed", "Your cart changed. Please review it and try again.", pricing);
    }

    for (const line of pricing.lines) {
      await tx.adjustStock(line.variantId, -line.quantity);
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await tx.insertOrder({
          reference: newOrderReference(),
          userId,
          email: input.email,
          customerName: input.customerName,
          address: input.address,
          subtotalCents: pricing.subtotalCents,
          shippingCents: pricing.shippingCents,
          totalCents: pricing.totalCents,
          items: pricing.lines.map((line) => ({
            variantId: line.variantId,
            productName: line.productName,
            variantLabel: line.variantLabel,
            unitPriceCents: line.unitPriceCents,
            quantity: line.quantity,
            lineTotalCents: line.lineTotalCents,
          })),
        });
      } catch (error) {
        if (!(error instanceof StoreError && error.code === "duplicate")) throw error;
      }
    }
    throw new Error("Could not allocate a unique order reference");
  });
}

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  placed: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: [],
  cancelled: [],
};

export class StatusError extends Error {
  constructor(
    public readonly code: "not_found" | "invalid_transition",
    message: string,
  ) {
    super(message);
    this.name = "StatusError";
  }
}

/** Moves an order through its lifecycle; cancelling returns the reserved stock. */
export async function changeOrderStatus(store: Store, reference: string, next: OrderStatus): Promise<OrderRecord> {
  return store.transaction(async (tx) => {
    const order = await tx.findOrderByReference(reference);
    if (!order) throw new StatusError("not_found", "Order not found.");
    if (!TRANSITIONS[order.status].includes(next)) {
      throw new StatusError("invalid_transition", `An order that is ${order.status} cannot become ${next}.`);
    }
    if (next === "cancelled") {
      for (const item of order.items) {
        if (item.variantId !== null) await tx.adjustStock(item.variantId, item.quantity);
      }
    }
    await tx.setOrderStatus(reference, next);
    return { ...order, status: next };
  });
}

export type { CartIssue, CartPricing };
