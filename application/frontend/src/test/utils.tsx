import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { AuthProvider } from "../features/account/AuthContext";
import { CartProvider } from "../features/cart/CartContext";
import { CartDrawer } from "../features/cart/CartDrawer";
import type { CartPricing, Product, User } from "../lib/types";

export function makeProduct(over: Partial<Product> & { id: number }): Product {
  return {
    slug: `product-${over.id}`,
    name: `Product ${over.id}`,
    description: "A fine object.",
    categoryId: 1,
    categorySlug: "ceramics",
    highlights: ["Well made"],
    specs: { Material: "Stoneware" },
    art: { shape: "vase", palette: ["#c9a47a", "#8a5a3a", "#f4ece1"] },
    featured: true,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    variants: [{ id: over.id * 10, productId: over.id, sku: `SKU-${over.id}`, label: "Sand", options: {}, priceCents: 6400, stock: 8 }],
    ...over,
  };
}

type Handler = (url: URL, init: RequestInit | undefined) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>;

/** Replaces fetch with a router keyed by "METHOD /path". Unmatched requests fail loudly. */
export function mockApi(routes: Record<string, Handler>) {
  const calls: { key: string; url: URL; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = (init?.method ?? "GET").toUpperCase();
    const key = `${method} ${url.pathname}`;
    calls.push({ key, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const handler = routes[key];
    if (!handler) throw new Error(`Unmocked request: ${key}`);
    const { status = 200, body } = await handler(url, init);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

export const noUser: Handler = () => ({ body: { user: null } });
export const signedIn = (user: User): Handler => () => ({ body: { user } });

export function pricingFor(lines: { variantId: number; unitPriceCents: number; quantity: number; name?: string }[]): CartPricing {
  const priced = lines.map((l) => ({
    variantId: l.variantId,
    productName: l.name ?? "Product",
    productSlug: "product",
    variantLabel: "Sand",
    unitPriceCents: l.unitPriceCents,
    quantity: l.quantity,
    lineTotalCents: l.unitPriceCents * l.quantity,
  }));
  const subtotalCents = priced.reduce((s, l) => s + l.lineTotalCents, 0);
  const shippingCents = subtotalCents === 0 || subtotalCents >= 7500 ? 0 : 600;
  return { lines: priced, issues: [], subtotalCents, shippingCents, totalCents: subtotalCents + shippingCents, currency: "USD" };
}

export function renderApp(ui: ReactElement, { route = "/" }: { route?: string } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <CartProvider>
          {ui}
          <CartDrawer />
        </CartProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}
