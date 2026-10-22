import { z } from "zod";
import type { CartPricing, ProductArt } from "../../lib/types";

/** Matches the API's per-line limit. The server enforces it again; this only keeps the UI honest. */
export const MAX_QTY = 10;
export const STORAGE_KEY = "oriel.cart.v1";

export interface CartItem {
  variantId: number;
  productSlug: string;
  productName: string;
  variantLabel: string;
  /** Display snapshot only. The server re-prices every cart, and checkout uses server prices. */
  unitPriceCents: number;
  quantity: number;
  art: ProductArt;
  /** Last known stock, if the storefront saw it. */
  maxStock?: number;
}

const itemSchema = z.object({
  variantId: z.number().int().positive(),
  productSlug: z.string().min(1),
  productName: z.string().min(1),
  variantLabel: z.string(),
  unitPriceCents: z.number().int().min(0),
  quantity: z.number().int().min(1).max(MAX_QTY),
  art: z.object({
    shape: z.enum(["vase", "lamp", "bowl", "mug", "candle", "throw", "tray", "pillow"]),
    palette: z.tuple([z.string(), z.string(), z.string()]),
  }),
  maxStock: z.number().int().min(0).optional(),
});

const limitFor = (item: Pick<CartItem, "maxStock">): number => Math.max(0, Math.min(MAX_QTY, item.maxStock ?? MAX_QTY));

export interface AddResult {
  items: CartItem[];
  /** Units actually in the cart for this variant after the add. */
  quantity: number;
  /** True when the requested quantity was reduced to the allowed maximum. */
  capped: boolean;
}

export function addItem(items: CartItem[], incoming: CartItem): AddResult {
  const limit = limitFor(incoming);
  const existing = items.find((item) => item.variantId === incoming.variantId);
  const wanted = (existing?.quantity ?? 0) + incoming.quantity;
  const quantity = Math.min(wanted, limit);
  if (quantity <= 0) return { items, quantity: existing?.quantity ?? 0, capped: true };
  const next: CartItem = { ...incoming, quantity };
  return {
    items: existing
      ? items.map((item) => (item.variantId === incoming.variantId ? next : item))
      : [...items, next],
    quantity,
    capped: wanted > limit,
  };
}

export function setQuantity(items: CartItem[], variantId: number, quantity: number): CartItem[] {
  if (!Number.isFinite(quantity) || quantity < 1) return items.filter((item) => item.variantId !== variantId);
  return items.map((item) =>
    item.variantId === variantId ? { ...item, quantity: Math.min(Math.floor(quantity), limitFor(item)) || item.quantity } : item,
  );
}

export function removeItem(items: CartItem[], variantId: number): CartItem[] {
  return items.filter((item) => item.variantId !== variantId);
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

/** Local estimate from the display snapshot. Shown only until the server's pricing arrives. */
export function estimateSubtotalCents(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
}

/** Applies the server's corrected pricing: updates prices and quantities, drops lines it cannot sell. */
export function applyPricing(items: CartItem[], pricing: CartPricing): CartItem[] {
  const byVariant = new Map(pricing.lines.map((line) => [line.variantId, line]));
  return items.flatMap((item) => {
    const line = byVariant.get(item.variantId);
    if (!line) return [];
    return [{ ...item, unitPriceCents: line.unitPriceCents, quantity: line.quantity }];
  });
}

export function parseStoredCart(raw: string | null): CartItem[] {
  if (!raw) return [];
  try {
    const parsed = z.array(itemSchema).safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function loadCart(): CartItem[] {
  try {
    return parseStoredCart(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveCart(items: CartItem[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage can be full or blocked (private mode); the cart still works for this session.
  }
}
