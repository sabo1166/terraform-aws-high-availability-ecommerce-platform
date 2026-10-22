export interface ProductArt {
  shape: "vase" | "lamp" | "bowl" | "mug" | "candle" | "throw" | "tray" | "pillow";
  palette: [string, string, string];
}

export interface Variant {
  id: number;
  productId: number;
  sku: string;
  label: string;
  options: Record<string, string>;
  priceCents: number;
  stock: number;
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

export interface Category {
  id: number;
  slug: string;
  name: string;
  description: string;
  productCount?: number;
}

export type SortKey = "relevance" | "price_asc" | "price_desc" | "newest";

export interface ProductPage {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets: {
    categories: { slug: string; count: number }[];
    priceMinCents: number;
    priceMaxCents: number;
  };
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

export type OrderStatus = "placed" | "packed" | "shipped" | "cancelled";

export interface Order {
  id: number;
  reference: string;
  email: string;
  customerName: string;
  address: Address;
  status: OrderStatus;
  currency: "USD";
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  paymentMethod: "demo";
  createdAt: string;
  items: OrderItem[];
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: "customer" | "admin";
}
