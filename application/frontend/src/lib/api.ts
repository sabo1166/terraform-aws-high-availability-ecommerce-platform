import type {
  CartPricing,
  Category,
  Order,
  OrderStatus,
  Product,
  ProductArt,
  ProductPage,
  SortKey,
  User,
} from "./types";

/** Empty by default: the browser calls the API on the same origin (Vite proxy in dev, web server proxy in AWS). */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Field-level messages from a 400 validation_error, keyed by dotted path. */
  get fieldErrors(): Record<string, string> {
    if (this.code !== "validation_error" || !Array.isArray(this.details)) return {};
    const result: Record<string, string> = {};
    for (const item of this.details as { path: string; message: string }[]) {
      if (item.path && !result[item.path]) result[item.path] = item.message;
    }
    return result;
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: init.method ?? "GET",
      credentials: "include",
      headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal ?? null,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "network", "We couldn't reach the store. Check your connection and try again.");
  }

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; details?: unknown; requestId?: string } } | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "unknown",
      error?.message ?? "Something went wrong. Please try again.",
      error?.details,
      error?.requestId,
    );
  }
  return payload as T;
}

export interface ProductQuery {
  q?: string;
  category?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  inStock?: boolean;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export function productQueryString(query: ProductQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.category) params.set("category", query.category);
  if (query.minPriceCents !== undefined) params.set("minPriceCents", String(query.minPriceCents));
  if (query.maxPriceCents !== undefined) params.set("maxPriceCents", String(query.maxPriceCents));
  if (query.inStock) params.set("inStock", "true");
  if (query.sort && query.sort !== "relevance") params.set("sort", query.sort);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const text = params.toString();
  return text ? `?${text}` : "";
}

export interface CheckoutPayload {
  items: { variantId: number; quantity: number }[];
  email: string;
  customerName: string;
  address: { line1: string; line2: string; city: string; region: string; postalCode: string; country: string };
  paymentMethod: "demo";
}

export interface NewProductPayload {
  slug: string;
  name: string;
  description: string;
  categoryId: number;
  art: ProductArt;
  featured: boolean;
  active: boolean;
  variants: { sku: string; label: string; options: Record<string, string>; priceCents: number; stock: number }[];
}

export const api = {
  categories: (signal?: AbortSignal) => request<{ categories: Category[] }>("/api/v1/categories", { ...(signal && { signal }) }),
  featured: (signal?: AbortSignal) => request<{ items: Product[] }>("/api/v1/featured", { ...(signal && { signal }) }),
  products: (query: ProductQuery, signal?: AbortSignal) =>
    request<ProductPage>(`/api/v1/products${productQueryString(query)}`, { ...(signal && { signal }) }),
  product: (slug: string, signal?: AbortSignal) =>
    request<{ product: Product; related: Product[] }>(`/api/v1/products/${encodeURIComponent(slug)}`, { ...(signal && { signal }) }),
  validateCart: (items: { variantId: number; quantity: number }[], signal?: AbortSignal) =>
    request<{ pricing: CartPricing }>("/api/v1/cart/validate", { method: "POST", body: { items }, ...(signal && { signal }) }),
  checkout: (payload: CheckoutPayload) => request<{ order: Order }>("/api/v1/checkout", { method: "POST", body: payload }),
  lookupOrder: (reference: string, email: string) =>
    request<{ order: Order }>(
      `/api/v1/orders/lookup?reference=${encodeURIComponent(reference)}&email=${encodeURIComponent(email)}`,
    ),
  me: () => request<{ user: User | null }>("/api/v1/auth/me"),
  login: (email: string, password: string) => request<{ user: User }>("/api/v1/auth/login", { method: "POST", body: { email, password } }),
  register: (name: string, email: string, password: string) =>
    request<{ user: User }>("/api/v1/auth/register", { method: "POST", body: { name, email, password } }),
  logout: () => request<{ ok: true }>("/api/v1/auth/logout", { method: "POST", body: {} }),
  accountOrders: () => request<{ orders: Order[] }>("/api/v1/account/orders"),
  admin: {
    products: () => request<{ products: Product[] }>("/api/v1/admin/products"),
    createProduct: (payload: NewProductPayload) =>
      request<{ product: Product }>("/api/v1/admin/products", { method: "POST", body: payload }),
    updateProduct: (id: number, patch: Partial<Pick<Product, "name" | "description" | "featured" | "active">>) =>
      request<{ product: Product }>(`/api/v1/admin/products/${id}`, { method: "PATCH", body: patch }),
    setStock: (variantId: number, stock: number) =>
      request<{ variant: { id: number; stock: number } }>(`/api/v1/admin/variants/${variantId}/stock`, { method: "PATCH", body: { stock } }),
    orders: () => request<{ orders: Order[] }>("/api/v1/admin/orders"),
    setOrderStatus: (reference: string, status: OrderStatus) =>
      request<{ order: Order }>(`/api/v1/admin/orders/${reference}/status`, { method: "PATCH", body: { status } }),
  },
};
