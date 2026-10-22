import { describe, expect, it } from "vitest";
import {
  MAX_QTY,
  STORAGE_KEY,
  addItem,
  applyPricing,
  cartCount,
  estimateSubtotalCents,
  loadCart,
  parseStoredCart,
  removeItem,
  saveCart,
  setQuantity,
  type CartItem,
} from "./cart";

const item = (variantId: number, over: Partial<CartItem> = {}): CartItem => ({
  variantId,
  productSlug: `p-${variantId}`,
  productName: `Product ${variantId}`,
  variantLabel: "Std",
  unitPriceCents: 1000,
  quantity: 1,
  art: { shape: "bowl", palette: ["#000000", "#111111", "#222222"] },
  ...over,
});

describe("cart operations", () => {
  it("adds new items and merges the same variant", () => {
    let items = addItem([], item(1)).items;
    items = addItem(items, item(1, { quantity: 2 })).items;
    items = addItem(items, item(2)).items;
    expect(items.map((i) => [i.variantId, i.quantity])).toEqual([[1, 3], [2, 1]]);
    expect(cartCount(items)).toBe(4);
  });

  it("caps at the per-line maximum and at known stock", () => {
    const result = addItem([item(1, { quantity: 9 })], item(1, { quantity: 5 }));
    expect(result.quantity).toBe(MAX_QTY);
    expect(result.capped).toBe(true);
    const limited = addItem([], item(2, { quantity: 4, maxStock: 3 }));
    expect(limited.quantity).toBe(3);
    expect(limited.capped).toBe(true);
  });

  it("refuses to add an out-of-stock item", () => {
    const result = addItem([], item(1, { maxStock: 0 }));
    expect(result.items).toEqual([]);
    expect(result.capped).toBe(true);
  });

  it("updates quantity, removing the line at zero or invalid values", () => {
    const items = [item(1, { quantity: 2 }), item(2)];
    expect(setQuantity(items, 1, 5)[0]?.quantity).toBe(5);
    expect(setQuantity(items, 1, 0).map((i) => i.variantId)).toEqual([2]);
    expect(setQuantity(items, 1, Number.NaN).map((i) => i.variantId)).toEqual([2]);
    expect(setQuantity(items, 1, 99)[0]?.quantity).toBe(MAX_QTY);
    expect(removeItem(items, 2).map((i) => i.variantId)).toEqual([1]);
  });

  it("estimates the subtotal in integer cents", () => {
    expect(estimateSubtotalCents([item(1, { unitPriceCents: 1999, quantity: 3 }), item(2, { unitPriceCents: 1 })])).toBe(5998);
  });

  it("applies corrected server pricing and drops lines the server cannot sell", () => {
    const items = [item(1, { quantity: 5, unitPriceCents: 1000 }), item(2)];
    const next = applyPricing(items, {
      lines: [{ variantId: 1, productName: "P", productSlug: "p", variantLabel: "Std", unitPriceCents: 1200, quantity: 2, lineTotalCents: 2400 }],
      issues: [],
      subtotalCents: 2400,
      shippingCents: 600,
      totalCents: 3000,
      currency: "USD",
    });
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ variantId: 1, quantity: 2, unitPriceCents: 1200 });
  });
});

describe("cart persistence", () => {
  it("round-trips through localStorage", () => {
    const items = [item(1, { quantity: 2 })];
    saveCart(items);
    expect(loadCart()).toEqual(items);
    saveCart([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("ignores corrupt or tampered storage instead of crashing", () => {
    expect(parseStoredCart("not json")).toEqual([]);
    expect(parseStoredCart(JSON.stringify([{ variantId: -1 }]))).toEqual([]);
    expect(parseStoredCart(JSON.stringify([{ ...item(1), quantity: 500 }]))).toEqual([]);
    expect(parseStoredCart(null)).toEqual([]);
  });
});
