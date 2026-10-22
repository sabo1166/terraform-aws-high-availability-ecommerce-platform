import type { Variant } from "./types.js";

/** Maximum units of one variant per order. */
export const MAX_LINE_QUANTITY = 10;
/** Demo delivery policy (not a real business commitment): free over this subtotal. */
export const FREE_SHIPPING_THRESHOLD_CENTS = 7500;
export const FLAT_SHIPPING_CENTS = 600;

export interface RequestedItem {
  variantId: number;
  quantity: number;
}

export interface PricedVariantInfo {
  id: number;
  productId: number;
  productName: string;
  productSlug: string;
  active: boolean;
  label: string;
  priceCents: number;
  stock: number;
}

export type CartIssueCode = "unavailable" | "out_of_stock" | "insufficient_stock" | "quantity_capped";

export interface CartIssue {
  variantId: number;
  code: CartIssueCode;
  message: string;
  available?: number;
}

export interface PricedLine {
  variantId: number;
  productName: string;
  productSlug: string;
  variantLabel: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface CartPricing {
  lines: PricedLine[];
  issues: CartIssue[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  currency: "USD";
}

export function shippingFor(subtotalCents: number): number {
  if (subtotalCents <= 0) return 0;
  return subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : FLAT_SHIPPING_CENTS;
}

/** Merge duplicate variants, summing quantities (so a split request cannot bypass limits). */
export function mergeItems(items: RequestedItem[]): RequestedItem[] {
  const merged = new Map<number, number>();
  for (const item of items) {
    merged.set(item.variantId, (merged.get(item.variantId) ?? 0) + item.quantity);
  }
  return [...merged.entries()].map(([variantId, quantity]) => ({ variantId, quantity }));
}

/**
 * Prices a cart purely from server-side data. Lines that cannot be fulfilled are dropped and reported
 * as issues; quantities are capped to the per-line maximum. Totals use integer cents only.
 */
export function priceCart(items: RequestedItem[], variants: Map<number, PricedVariantInfo>): CartPricing {
  const lines: PricedLine[] = [];
  const issues: CartIssue[] = [];

  for (const request of mergeItems(items)) {
    const variant = variants.get(request.variantId);
    if (!variant || !variant.active) {
      issues.push({ variantId: request.variantId, code: "unavailable", message: "This item is no longer available." });
      continue;
    }
    if (variant.stock <= 0) {
      issues.push({
        variantId: request.variantId,
        code: "out_of_stock",
        message: `${variant.productName} (${variant.label}) is out of stock.`,
        available: 0,
      });
      continue;
    }

    let quantity = request.quantity;
    if (quantity > MAX_LINE_QUANTITY) {
      quantity = MAX_LINE_QUANTITY;
      issues.push({
        variantId: request.variantId,
        code: "quantity_capped",
        message: `You can order at most ${MAX_LINE_QUANTITY} of one item.`,
        available: MAX_LINE_QUANTITY,
      });
    }
    if (quantity > variant.stock) {
      issues.push({
        variantId: request.variantId,
        code: "insufficient_stock",
        message: `Only ${variant.stock} of ${variant.productName} (${variant.label}) left.`,
        available: variant.stock,
      });
      quantity = variant.stock;
    }

    lines.push({
      variantId: variant.id,
      productName: variant.productName,
      productSlug: variant.productSlug,
      variantLabel: variant.label,
      unitPriceCents: variant.priceCents,
      quantity,
      lineTotalCents: variant.priceCents * quantity,
    });
  }

  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const shippingCents = shippingFor(subtotalCents);
  return { lines, issues, subtotalCents, shippingCents, totalCents: subtotalCents + shippingCents, currency: "USD" };
}

export function toPricedInfo(
  variant: Variant,
  product: { name: string; slug: string; active: boolean },
): PricedVariantInfo {
  return {
    id: variant.id,
    productId: variant.productId,
    productName: product.name,
    productSlug: product.slug,
    active: product.active,
    label: variant.label,
    priceCents: variant.priceCents,
    stock: variant.stock,
  };
}
