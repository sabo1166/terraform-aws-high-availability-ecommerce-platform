export type Role = "customer" | "admin";
export type OrderStatus = "placed" | "packed" | "shipped" | "cancelled";
export const ORDER_STATUSES: readonly OrderStatus[] = ["placed", "packed", "shipped", "cancelled"];

export interface Category {
  id: number;
  slug: string;
  name: string;
  description: string;
}

export interface Variant {
  id: number;
  productId: number;
  sku: string;
  label: string;
  options: Record<string, string>;
  /** Price in minor units (cents). Never a float. */
  priceCents: number;
  stock: number;
}

/** Procedural artwork description; the storefront renders it as SVG (no external image assets). */
export interface ProductArt {
  shape: "vase" | "lamp" | "bowl" | "mug" | "candle" | "throw" | "tray" | "pillow";
  palette: [string, string, string];
}

export interface Product {
  id: number;
  slug: string;
  name: string;
  description: string;
  categoryId: number;
  categorySlug: string;
  highlights: string[];
  specs: Record<string, string>;
  art: ProductArt;
  featured: boolean;
  active: boolean;
  createdAt: string;
  variants: Variant[];
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  createdAt: string;
}

export interface Address {
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export interface OrderItem {
  variantId: number | null;
  productName: string;
  variantLabel: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface OrderRecord {
  id: number;
  reference: string;
  userId: number | null;
  email: string;
  customerName: string;
  address: Address;
  status: OrderStatus;
  currency: "USD";
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  /** Always "demo": no real payment is taken. */
  paymentMethod: "demo";
  createdAt: string;
  items: OrderItem[];
}

export interface NewVariant {
  sku: string;
  label: string;
  options: Record<string, string>;
  priceCents: number;
  stock: number;
}

export interface NewProduct {
  slug: string;
  name: string;
  description: string;
  categoryId: number;
  highlights: string[];
  specs: Record<string, string>;
  art: ProductArt;
  featured: boolean;
  active: boolean;
  variants: NewVariant[];
}

export interface NewOrder {
  reference: string;
  userId: number | null;
  email: string;
  customerName: string;
  address: Address;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  items: OrderItem[];
}
