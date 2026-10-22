import type { Order } from "../../lib/types";

const key = (reference: string) => `oriel.order.${reference}`;

/**
 * Remembers a just-placed order for this browser tab so the confirmation page survives a refresh.
 * sessionStorage is cleared when the tab closes; the server remains the source of truth.
 */
export function rememberOrder(order: Order): void {
  try {
    sessionStorage.setItem(key(order.reference), JSON.stringify(order));
  } catch {
    // Storage may be unavailable; the confirmation page falls back to the order lookup form.
  }
}

export function recallOrder(reference: string): Order | null {
  try {
    const raw = sessionStorage.getItem(key(reference));
    return raw ? (JSON.parse(raw) as Order) : null;
  } catch {
    return null;
  }
}
