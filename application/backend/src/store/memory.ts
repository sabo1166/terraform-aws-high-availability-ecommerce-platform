import type {
  Category,
  NewOrder,
  NewProduct,
  OrderRecord,
  OrderStatus,
  Product,
  Role,
  User,
  Variant,
} from "../domain/types.js";
import { toPricedInfo, type PricedVariantInfo } from "../domain/pricing.js";
import { StoreError, type Store, type Tx } from "./store.js";

interface State {
  categories: Category[];
  products: Product[];
  users: User[];
  orders: OrderRecord[];
  nextIds: { category: number; product: number; variant: number; user: number; order: number };
}

const clone = <T>(value: T): T => structuredClone(value);

/** In-memory Store: used by tests and by `STORE=memory` for local development without a database. */
export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private state: State = {
    categories: [],
    products: [],
    users: [],
    orders: [],
    nextIds: { category: 1, product: 1, variant: 1, user: 1, order: 1 },
  };
  /** Serialises transactions, standing in for row locks. */
  private queue: Promise<unknown> = Promise.resolve();

  async ping(): Promise<void> {}
  async close(): Promise<void> {}

  async listCategories(): Promise<Category[]> {
    return clone(this.state.categories);
  }

  async createCategory(input: Omit<Category, "id">): Promise<Category> {
    if (this.state.categories.some((c) => c.slug === input.slug)) {
      throw new StoreError("duplicate", "Category slug already exists.");
    }
    const category = { id: this.state.nextIds.category++, ...input };
    this.state.categories.push(category);
    return clone(category);
  }

  async listProducts(options: { includeInactive?: boolean } = {}): Promise<Product[]> {
    return clone(this.state.products.filter((p) => options.includeInactive || p.active));
  }

  async getProductBySlug(slug: string, options: { includeInactive?: boolean } = {}): Promise<Product | null> {
    const product = this.state.products.find((p) => p.slug === slug && (options.includeInactive || p.active));
    return product ? clone(product) : null;
  }

  async createProduct(input: NewProduct): Promise<Product> {
    const category = this.state.categories.find((c) => c.id === input.categoryId);
    if (!category) throw new StoreError("invalid", "Unknown category.");
    if (this.state.products.some((p) => p.slug === input.slug)) {
      throw new StoreError("duplicate", "Product slug already exists.");
    }
    const allSkus = new Set(this.state.products.flatMap((p) => p.variants.map((v) => v.sku)));
    for (const variant of input.variants) {
      if (allSkus.has(variant.sku)) throw new StoreError("duplicate", `SKU ${variant.sku} already exists.`);
      allSkus.add(variant.sku);
    }
    const id = this.state.nextIds.product++;
    const product: Product = {
      id,
      slug: input.slug,
      name: input.name,
      description: input.description,
      categoryId: input.categoryId,
      categorySlug: category.slug,
      highlights: input.highlights,
      specs: input.specs,
      art: input.art,
      featured: input.featured,
      active: input.active,
      createdAt: new Date().toISOString(),
      variants: input.variants.map((v) => ({ id: this.state.nextIds.variant++, productId: id, ...v })),
    };
    this.state.products.push(product);
    return clone(product);
  }

  async updateProduct(
    id: number,
    patch: Partial<Pick<Product, "name" | "description" | "featured" | "active">>,
  ): Promise<Product | null> {
    const product = this.state.products.find((p) => p.id === id);
    if (!product) return null;
    Object.assign(product, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
    return clone(product);
  }

  async setVariantStock(variantId: number, stock: number): Promise<Variant | null> {
    for (const product of this.state.products) {
      const variant = product.variants.find((v) => v.id === variantId);
      if (variant) {
        variant.stock = stock;
        return clone(variant);
      }
    }
    return null;
  }

  async getVariantInfo(ids: number[]): Promise<Map<number, PricedVariantInfo>> {
    return this.collectVariantInfo(ids);
  }

  private collectVariantInfo(ids: number[]): Map<number, PricedVariantInfo> {
    const wanted = new Set(ids);
    const result = new Map<number, PricedVariantInfo>();
    for (const product of this.state.products) {
      for (const variant of product.variants) {
        if (wanted.has(variant.id)) result.set(variant.id, toPricedInfo(variant, product));
      }
    }
    return result;
  }

  async createUser(input: { email: string; name: string; passwordHash: string; role: Role }): Promise<User> {
    const email = input.email.toLowerCase();
    if (this.state.users.some((u) => u.email === email)) {
      throw new StoreError("duplicate", "An account with this email already exists.");
    }
    const user: User = { id: this.state.nextIds.user++, ...input, email, createdAt: new Date().toISOString() };
    this.state.users.push(user);
    return clone(user);
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const user = this.state.users.find((u) => u.email === email.toLowerCase());
    return user ? clone(user) : null;
  }

  async findUserById(id: number): Promise<User | null> {
    const user = this.state.users.find((u) => u.id === id);
    return user ? clone(user) : null;
  }

  async listOrdersForUser(userId: number): Promise<OrderRecord[]> {
    return clone(this.state.orders.filter((o) => o.userId === userId)).reverse();
  }

  async findOrder(reference: string): Promise<OrderRecord | null> {
    const order = this.state.orders.find((o) => o.reference === reference);
    return order ? clone(order) : null;
  }

  async listOrders(limit: number): Promise<OrderRecord[]> {
    return clone(this.state.orders).reverse().slice(0, limit);
  }

  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      // Snapshot for rollback if the callback throws.
      const snapshot = clone(this.state);
      const tx: Tx = {
        lockVariants: async (ids) => this.collectVariantInfo(ids),
        adjustStock: async (variantId, delta) => {
          for (const product of this.state.products) {
            const variant = product.variants.find((v) => v.id === variantId);
            if (variant) {
              if (variant.stock + delta < 0) throw new StoreError("insufficient_stock", "Not enough stock.");
              variant.stock += delta;
              return;
            }
          }
          throw new StoreError("not_found", "Unknown variant.");
        },
        insertOrder: async (order: NewOrder) => {
          if (this.state.orders.some((o) => o.reference === order.reference)) {
            throw new StoreError("duplicate", "Order reference already exists.");
          }
          const record: OrderRecord = {
            id: this.state.nextIds.order++,
            ...order,
            status: "placed",
            currency: "USD",
            paymentMethod: "demo",
            createdAt: new Date().toISOString(),
          };
          this.state.orders.push(record);
          return clone(record);
        },
        findOrderByReference: async (reference) => {
          const order = this.state.orders.find((o) => o.reference === reference);
          return order ? clone(order) : null;
        },
        setOrderStatus: async (reference: string, status: OrderStatus) => {
          const order = this.state.orders.find((o) => o.reference === reference);
          if (!order) throw new StoreError("not_found", "Unknown order.");
          order.status = status;
        },
      };
      try {
        return await fn(tx);
      } catch (error) {
        this.state = snapshot;
        throw error;
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
