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
import type { PricedVariantInfo } from "../domain/pricing.js";

export class StoreError extends Error {
  constructor(
    public readonly code: "duplicate" | "not_found" | "insufficient_stock" | "invalid",
    message: string,
  ) {
    super(message);
    this.name = "StoreError";
  }
}

/** Operations available inside a transaction. Variant rows are locked until the transaction ends. */
export interface Tx {
  lockVariants(ids: number[]): Promise<Map<number, PricedVariantInfo>>;
  /** Adds delta (may be negative) to stock; throws StoreError("insufficient_stock") if it would go below zero. */
  adjustStock(variantId: number, delta: number): Promise<void>;
  insertOrder(order: NewOrder): Promise<OrderRecord>;
  findOrderByReference(reference: string): Promise<OrderRecord | null>;
  setOrderStatus(reference: string, status: OrderStatus): Promise<void>;
}

/**
 * Persistence boundary. MemoryStore (tests, local demo) and MysqlStore (AWS/RDS) both implement it,
 * and share one contract test suite.
 */
export interface Store {
  readonly kind: "memory" | "mysql";
  /** Cheap dependency check used by the readiness endpoint. */
  ping(): Promise<void>;
  close(): Promise<void>;

  listCategories(): Promise<Category[]>;
  createCategory(input: Omit<Category, "id">): Promise<Category>;

  listProducts(options?: { includeInactive?: boolean }): Promise<Product[]>;
  getProductBySlug(slug: string, options?: { includeInactive?: boolean }): Promise<Product | null>;
  createProduct(input: NewProduct): Promise<Product>;
  updateProduct(
    id: number,
    patch: Partial<Pick<Product, "name" | "description" | "featured" | "active">>,
  ): Promise<Product | null>;
  setVariantStock(variantId: number, stock: number): Promise<Variant | null>;
  /** Non-locking read used for cart validation. */
  getVariantInfo(ids: number[]): Promise<Map<number, PricedVariantInfo>>;

  createUser(input: { email: string; name: string; passwordHash: string; role: Role }): Promise<User>;
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: number): Promise<User | null>;

  listOrdersForUser(userId: number): Promise<OrderRecord[]>;
  findOrder(reference: string): Promise<OrderRecord | null>;
  listOrders(limit: number): Promise<OrderRecord[]>;

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}
