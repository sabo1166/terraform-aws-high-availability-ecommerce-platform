import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { ApiError, api } from "../../lib/api";
import type { CartPricing } from "../../lib/types";
import {
  addItem,
  applyPricing,
  cartCount,
  estimateSubtotalCents,
  loadCart,
  removeItem,
  saveCart,
  setQuantity,
  STORAGE_KEY,
  type CartItem,
} from "./cart";

type Action =
  | { type: "add"; item: CartItem }
  | { type: "setQuantity"; variantId: number; quantity: number }
  | { type: "remove"; variantId: number }
  | { type: "applyPricing"; pricing: CartPricing }
  | { type: "replace"; items: CartItem[] }
  | { type: "clear" };

function reducer(items: CartItem[], action: Action): CartItem[] {
  switch (action.type) {
    case "add":
      return addItem(items, action.item).items;
    case "setQuantity":
      return setQuantity(items, action.variantId, action.quantity);
    case "remove":
      return removeItem(items, action.variantId);
    case "applyPricing":
      return applyPricing(items, action.pricing);
    case "replace":
      return action.items;
    case "clear":
      return [];
  }
}

export interface CartContextValue {
  items: CartItem[];
  count: number;
  /** Authoritative server pricing for the current items, or null while loading / on failure. */
  pricing: CartPricing | null;
  pricingError: string | null;
  pricingLoading: boolean;
  estimatedSubtotalCents: number;
  drawerOpen: boolean;
  /** Text for a polite screen-reader announcement after the last change. */
  announcement: string;
  add: (item: CartItem) => { quantity: number; capped: boolean };
  setItemQuantity: (variantId: number, quantity: number) => void;
  remove: (variantId: number) => void;
  clear: () => void;
  fixCart: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, dispatch] = useReducer(reducer, undefined, loadCart);
  const [pricing, setPricing] = useState<CartPricing | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => saveCart(items), [items]);

  // Keep other tabs in sync with the persisted cart.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) dispatch({ type: "replace", items: loadCart() });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Ask the server for authoritative prices whenever the cart changes.
  const signature = items.map((item) => `${item.variantId}:${item.quantity}`).join(",");
  useEffect(() => {
    if (items.length === 0) {
      setPricing(null);
      setPricingError(null);
      setPricingLoading(false);
      return;
    }
    const controller = new AbortController();
    setPricingLoading(true);
    const timer = setTimeout(() => {
      api
        .validateCart(
          items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
          controller.signal,
        )
        .then(({ pricing: result }) => {
          setPricing(result);
          setPricingError(null);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setPricing(null);
          setPricingError(error instanceof ApiError ? error.message : "We couldn't confirm your prices.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setPricingLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const add = useCallback(
    (item: CartItem) => {
      const result = addItem(items, item);
      dispatch({ type: "add", item });
      setAnnouncement(
        result.capped
          ? `${item.productName}: the most you can add is ${result.quantity}.`
          : `${item.productName} added to your cart.`,
      );
      return { quantity: result.quantity, capped: result.capped };
    },
    [items],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count: cartCount(items),
      pricing,
      pricingError,
      pricingLoading,
      estimatedSubtotalCents: estimateSubtotalCents(items),
      drawerOpen,
      announcement,
      add,
      setItemQuantity: (variantId, quantity) => dispatch({ type: "setQuantity", variantId, quantity }),
      remove: (variantId) => {
        dispatch({ type: "remove", variantId });
        setAnnouncement("Item removed from your cart.");
      },
      clear: () => dispatch({ type: "clear" }),
      fixCart: () => pricing && dispatch({ type: "applyPricing", pricing }),
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
    }),
    [items, pricing, pricingError, pricingLoading, drawerOpen, announcement, add],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside <CartProvider>");
  return value;
}
