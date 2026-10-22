import { describe, expect, it } from "vitest";
import {
  FLAT_SHIPPING_CENTS,
  FREE_SHIPPING_THRESHOLD_CENTS,
  MAX_LINE_QUANTITY,
  mergeItems,
  priceCart,
  shippingFor,
  type PricedVariantInfo,
} from "../src/domain/pricing.js";

const variant = (id: number, priceCents: number, stock: number, active = true): PricedVariantInfo => ({
  id,
  productId: id,
  productName: `Product ${id}`,
  productSlug: `product-${id}`,
  active,
  label: "Std",
  priceCents,
  stock,
});

const catalog = (...variants: PricedVariantInfo[]) => new Map(variants.map((v) => [v.id, v]));

describe("priceCart", () => {
  it("computes line, subtotal, shipping and total in integer cents", () => {
    const pricing = priceCart(
      [
        { variantId: 1, quantity: 3 },
        { variantId: 2, quantity: 1 },
      ],
      catalog(variant(1, 1999, 10), variant(2, 1, 10)),
    );
    expect(pricing.subtotalCents).toBe(3 * 1999 + 1);
    expect(pricing.shippingCents).toBe(FLAT_SHIPPING_CENTS);
    expect(pricing.totalCents).toBe(3 * 1999 + 1 + FLAT_SHIPPING_CENTS);
    expect(Number.isInteger(pricing.totalCents)).toBe(true);
    expect(pricing.issues).toEqual([]);
  });

  it("avoids floating-point drift for many small amounts", () => {
    const pricing = priceCart([{ variantId: 1, quantity: MAX_LINE_QUANTITY }], catalog(variant(1, 10, 100)));
    expect(pricing.subtotalCents).toBe(100);
  });

  it("gives free shipping at the threshold and none for an empty cart", () => {
    expect(shippingFor(0)).toBe(0);
    expect(shippingFor(FREE_SHIPPING_THRESHOLD_CENTS - 1)).toBe(FLAT_SHIPPING_CENTS);
    expect(shippingFor(FREE_SHIPPING_THRESHOLD_CENTS)).toBe(0);
  });

  it("merges duplicate variants so splitting a request cannot bypass limits", () => {
    expect(
      mergeItems([
        { variantId: 1, quantity: 6 },
        { variantId: 1, quantity: 6 },
      ]),
    ).toEqual([{ variantId: 1, quantity: 12 }]);
    const pricing = priceCart(
      [
        { variantId: 1, quantity: 6 },
        { variantId: 1, quantity: 6 },
      ],
      catalog(variant(1, 100, 50)),
    );
    expect(pricing.lines[0]?.quantity).toBe(MAX_LINE_QUANTITY);
    expect(pricing.issues.map((i) => i.code)).toContain("quantity_capped");
  });

  it("reports unknown, inactive and out-of-stock items instead of pricing them", () => {
    const pricing = priceCart(
      [
        { variantId: 1, quantity: 1 },
        { variantId: 2, quantity: 1 },
        { variantId: 3, quantity: 1 },
      ],
      catalog(variant(2, 500, 5, false), variant(3, 500, 0)),
    );
    expect(pricing.lines).toEqual([]);
    expect(pricing.issues.map((i) => i.code).sort()).toEqual(["out_of_stock", "unavailable", "unavailable"]);
    expect(pricing.totalCents).toBe(0);
  });

  it("reduces quantity to the available stock and says so", () => {
    const pricing = priceCart([{ variantId: 1, quantity: 5 }], catalog(variant(1, 1000, 2)));
    expect(pricing.lines[0]?.quantity).toBe(2);
    expect(pricing.issues).toEqual([
      expect.objectContaining({ code: "insufficient_stock", available: 2 }),
    ]);
  });

  it("ignores any price the caller might supply", () => {
    const tampered = [{ variantId: 1, quantity: 1, priceCents: 1 }] as unknown as { variantId: number; quantity: number }[];
    const pricing = priceCart(tampered, catalog(variant(1, 5000, 3)));
    expect(pricing.lines[0]?.unitPriceCents).toBe(5000);
  });
});
