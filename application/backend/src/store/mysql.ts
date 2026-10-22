import mysql from "mysql2/promise";
import type { Pool, PoolConnection, PoolOptions, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type {
  Category,
  NewOrder,
  NewProduct,
  OrderItem,
  OrderRecord,
  OrderStatus,
  Product,
  ProductArt,
  Role,
  User,
  Variant,
} from "../domain/types.js";
import type { PricedVariantInfo } from "../domain/pricing.js";
import { StoreError, type Store, type Tx } from "./store.js";

type Row = RowDataPacket;

const toIso = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value).replace(" ", "T") + "Z").toISOString();
};

/** mysql2 parses JSON columns; tolerate a string for drivers/servers that do not. */
const json = <T>(value: unknown): T => (typeof value === "string" ? (JSON.parse(value) as T) : (value as T));

const isDuplicate = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "ER_DUP_ENTRY";

const ph = (ids: number[]): string => ids.map(() => "?").join(", ");

function toVariant(row: Row): Variant {
  return {
    id: row.id,
    productId: row.product_id,
    sku: row.sku,
    label: row.label,
    options: json<Record<string, string>>(row.options),
    priceCents: row.price_cents,
    stock: row.stock,
  };
}

function toUser(row: Row): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as Role,
    passwordHash: row.password_hash,
    createdAt: toIso(row.created_at),
  };
}

function toItem(row: Row): OrderItem {
  return {
    variantId: row.variant_id,
    productName: row.product_name,
    variantLabel: row.variant_label,
    unitPriceCents: row.unit_price_cents,
    quantity: row.quantity,
    lineTotalCents: row.line_total_cents,
  };
}

function toOrder(row: Row, items: OrderItem[]): OrderRecord {
  return {
    id: row.id,
    reference: row.reference,
    userId: row.user_id,
    email: row.email,
    customerName: row.customer_name,
    address: {
      line1: row.address_line1,
      line2: row.address_line2,
      city: row.city,
      region: row.region,
      postalCode: row.postal_code,
      country: row.country,
    },
    status: row.status as OrderStatus,
    currency: "USD",
    subtotalCents: row.subtotal_cents,
    shippingCents: row.shipping_cents,
    totalCents: row.total_cents,
    paymentMethod: "demo",
    createdAt: toIso(row.created_at),
    items,
  };
}

type Queryable = Pick<Pool | PoolConnection, "query">;

async function loadItems(db: Queryable, orderIds: number[]): Promise<Map<number, OrderItem[]>> {
  const byOrder = new Map<number, OrderItem[]>();
  if (orderIds.length === 0) return byOrder;
  const [rows] = await db.query<Row[]>(
    `SELECT * FROM order_items WHERE order_id IN (${ph(orderIds)}) ORDER BY id`,
    orderIds,
  );
  for (const row of rows) {
    const list = byOrder.get(row.order_id) ?? [];
    list.push(toItem(row));
    byOrder.set(row.order_id, list);
  }
  return byOrder;
}

async function hydrateOrders(db: Queryable, rows: Row[]): Promise<OrderRecord[]> {
  const items = await loadItems(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((row) => toOrder(row, items.get(row.id) ?? []));
}

async function lockVariantRows(db: Queryable, ids: number[], lock: boolean): Promise<Map<number, PricedVariantInfo>> {
  const result = new Map<number, PricedVariantInfo>();
  if (ids.length === 0) return result;
  // ORDER BY id gives every transaction the same lock order, which avoids deadlocks.
  const [rows] = await db.query<Row[]>(
    `SELECT v.id, v.product_id, v.label, v.price_cents, v.stock, p.name, p.slug, p.active
       FROM variants v JOIN products p ON p.id = v.product_id
      WHERE v.id IN (${ph(ids)}) ORDER BY v.id${lock ? " FOR UPDATE OF v" : ""}`,
    ids,
  );
  for (const row of rows) {
    result.set(row.id, {
      id: row.id,
      productId: row.product_id,
      productName: row.name,
      productSlug: row.slug,
      active: Boolean(row.active),
      label: row.label,
      priceCents: row.price_cents,
      stock: row.stock,
    });
  }
  return result;
}

export interface MysqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  /** PEM bundle validating the server certificate; undefined disables TLS (local development only). */
  sslCa?: string | undefined;
  connectionLimit?: number;
}

export class MysqlStore implements Store {
  readonly kind = "mysql" as const;
  private readonly pool: Pool;

  constructor(config: MysqlConfig) {
    const options: PoolOptions = {
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: config.connectionLimit ?? 10,
      charset: "utf8mb4",
      dateStrings: true,
      timezone: "Z",
      ...(config.sslCa ? { ssl: { ca: config.sslCa, rejectUnauthorized: true } } : {}),
    };
    this.pool = mysql.createPool(options);
    // Timestamps are written and read in UTC.
    this.pool.on("connection", (connection) => {
      connection.query("SET time_zone = '+00:00'");
    });
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async listCategories(): Promise<Category[]> {
    const [rows] = await this.pool.query<Row[]>("SELECT id, slug, name, description FROM categories ORDER BY id");
    return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, description: r.description }));
  }

  async createCategory(input: Omit<Category, "id">): Promise<Category> {
    try {
      const [result] = await this.pool.query<ResultSetHeader>(
        "INSERT INTO categories (slug, name, description) VALUES (?, ?, ?)",
        [input.slug, input.name, input.description],
      );
      return { id: result.insertId, ...input };
    } catch (error) {
      if (isDuplicate(error)) throw new StoreError("duplicate", "Category slug already exists.");
      throw error;
    }
  }

  private async hydrateProducts(rows: Row[]): Promise<Product[]> {
    const ids = rows.map((r) => r.id as number);
    const variantsByProduct = new Map<number, Variant[]>();
    if (ids.length > 0) {
      const [variantRows] = await this.pool.query<Row[]>(
        `SELECT * FROM variants WHERE product_id IN (${ph(ids)}) ORDER BY id`,
        ids,
      );
      for (const row of variantRows) {
        const list = variantsByProduct.get(row.product_id) ?? [];
        list.push(toVariant(row));
        variantsByProduct.set(row.product_id, list);
      }
    }
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      categoryId: row.category_id,
      categorySlug: row.category_slug,
      highlights: json<string[]>(row.highlights),
      specs: json<Record<string, string>>(row.specs),
      art: json<ProductArt>(row.art),
      featured: Boolean(row.featured),
      active: Boolean(row.active),
      createdAt: toIso(row.created_at),
      variants: variantsByProduct.get(row.id) ?? [],
    }));
  }

  private static readonly PRODUCT_SELECT =
    "SELECT p.*, c.slug AS category_slug FROM products p JOIN categories c ON c.id = p.category_id";

  async listProducts(options: { includeInactive?: boolean } = {}): Promise<Product[]> {
    const where = options.includeInactive ? "" : " WHERE p.active = 1";
    const [rows] = await this.pool.query<Row[]>(`${MysqlStore.PRODUCT_SELECT}${where} ORDER BY p.id`);
    return this.hydrateProducts(rows);
  }

  async getProductBySlug(slug: string, options: { includeInactive?: boolean } = {}): Promise<Product | null> {
    const active = options.includeInactive ? "" : " AND p.active = 1";
    const [rows] = await this.pool.query<Row[]>(`${MysqlStore.PRODUCT_SELECT} WHERE p.slug = ?${active}`, [slug]);
    return (await this.hydrateProducts(rows))[0] ?? null;
  }

  private async getProductById(id: number): Promise<Product | null> {
    const [rows] = await this.pool.query<Row[]>(`${MysqlStore.PRODUCT_SELECT} WHERE p.id = ?`, [id]);
    return (await this.hydrateProducts(rows))[0] ?? null;
  }

  async createProduct(input: NewProduct): Promise<Product> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [categories] = await connection.query<Row[]>("SELECT id FROM categories WHERE id = ?", [input.categoryId]);
      if (categories.length === 0) throw new StoreError("invalid", "Unknown category.");
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO products (slug, name, description, category_id, highlights, specs, art, featured, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.slug,
          input.name,
          input.description,
          input.categoryId,
          JSON.stringify(input.highlights),
          JSON.stringify(input.specs),
          JSON.stringify(input.art),
          input.featured ? 1 : 0,
          input.active ? 1 : 0,
        ],
      );
      for (const variant of input.variants) {
        await connection.query(
          "INSERT INTO variants (product_id, sku, label, options, price_cents, stock) VALUES (?, ?, ?, ?, ?, ?)",
          [result.insertId, variant.sku, variant.label, JSON.stringify(variant.options), variant.priceCents, variant.stock],
        );
      }
      await connection.commit();
      const created = await this.getProductById(result.insertId);
      if (!created) throw new StoreError("not_found", "Product disappeared after creation.");
      return created;
    } catch (error) {
      await connection.rollback();
      if (isDuplicate(error)) throw new StoreError("duplicate", "Product slug or SKU already exists.");
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateProduct(
    id: number,
    patch: Partial<Pick<Product, "name" | "description" | "featured" | "active">>,
  ): Promise<Product | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (patch.name !== undefined) (sets.push("name = ?"), values.push(patch.name));
    if (patch.description !== undefined) (sets.push("description = ?"), values.push(patch.description));
    if (patch.featured !== undefined) (sets.push("featured = ?"), values.push(patch.featured ? 1 : 0));
    if (patch.active !== undefined) (sets.push("active = ?"), values.push(patch.active ? 1 : 0));
    if (sets.length > 0) {
      await this.pool.query(`UPDATE products SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);
    }
    return this.getProductById(id);
  }

  async setVariantStock(variantId: number, stock: number): Promise<Variant | null> {
    await this.pool.query("UPDATE variants SET stock = ? WHERE id = ?", [stock, variantId]);
    const [rows] = await this.pool.query<Row[]>("SELECT * FROM variants WHERE id = ?", [variantId]);
    return rows[0] ? toVariant(rows[0]) : null;
  }

  async getVariantInfo(ids: number[]): Promise<Map<number, PricedVariantInfo>> {
    return lockVariantRows(this.pool, ids, false);
  }

  async createUser(input: { email: string; name: string; passwordHash: string; role: Role }): Promise<User> {
    try {
      const email = input.email.toLowerCase();
      const [result] = await this.pool.query<ResultSetHeader>(
        "INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)",
        [email, input.name, input.passwordHash, input.role],
      );
      const user = await this.findUserById(result.insertId);
      if (!user) throw new StoreError("not_found", "User disappeared after creation.");
      return user;
    } catch (error) {
      if (isDuplicate(error)) throw new StoreError("duplicate", "An account with this email already exists.");
      throw error;
    }
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const [rows] = await this.pool.query<Row[]>("SELECT * FROM users WHERE email = ?", [email.toLowerCase()]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findUserById(id: number): Promise<User | null> {
    const [rows] = await this.pool.query<Row[]>("SELECT * FROM users WHERE id = ?", [id]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async listOrdersForUser(userId: number): Promise<OrderRecord[]> {
    const [rows] = await this.pool.query<Row[]>("SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC", [userId]);
    return hydrateOrders(this.pool, rows);
  }

  async findOrder(reference: string): Promise<OrderRecord | null> {
    const [rows] = await this.pool.query<Row[]>("SELECT * FROM orders WHERE reference = ?", [reference]);
    return (await hydrateOrders(this.pool, rows))[0] ?? null;
  }

  async listOrders(limit: number): Promise<OrderRecord[]> {
    const [rows] = await this.pool.query<Row[]>("SELECT * FROM orders ORDER BY id DESC LIMIT ?", [limit]);
    return hydrateOrders(this.pool, rows);
  }

  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();
    const tx: Tx = {
      lockVariants: (ids) => lockVariantRows(connection, [...ids].sort((a, b) => a - b), true),
      adjustStock: async (variantId, delta) => {
        if (delta < 0) {
          const [result] = await connection.query<ResultSetHeader>(
            "UPDATE variants SET stock = stock - ? WHERE id = ? AND stock >= ?",
            [-delta, variantId, -delta],
          );
          if (result.affectedRows === 0) throw new StoreError("insufficient_stock", "Not enough stock.");
        } else {
          await connection.query("UPDATE variants SET stock = stock + ? WHERE id = ?", [delta, variantId]);
        }
      },
      insertOrder: async (order: NewOrder) => {
        try {
          const [result] = await connection.query<ResultSetHeader>(
            `INSERT INTO orders (reference, user_id, email, customer_name, address_line1, address_line2, city, region,
               postal_code, country, subtotal_cents, shipping_cents, total_cents)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              order.reference,
              order.userId,
              order.email,
              order.customerName,
              order.address.line1,
              order.address.line2,
              order.address.city,
              order.address.region,
              order.address.postalCode,
              order.address.country,
              order.subtotalCents,
              order.shippingCents,
              order.totalCents,
            ],
          );
          for (const item of order.items) {
            await connection.query(
              `INSERT INTO order_items (order_id, variant_id, product_name, variant_label, unit_price_cents, quantity, line_total_cents)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [result.insertId, item.variantId, item.productName, item.variantLabel, item.unitPriceCents, item.quantity, item.lineTotalCents],
            );
          }
          const [rows] = await connection.query<Row[]>("SELECT * FROM orders WHERE id = ?", [result.insertId]);
          const [record] = await hydrateOrders(connection, rows);
          if (!record) throw new StoreError("not_found", "Order disappeared after creation.");
          return record;
        } catch (error) {
          if (isDuplicate(error)) throw new StoreError("duplicate", "Order reference already exists.");
          throw error;
        }
      },
      findOrderByReference: async (reference) => {
        const [rows] = await connection.query<Row[]>("SELECT * FROM orders WHERE reference = ? FOR UPDATE", [reference]);
        return (await hydrateOrders(connection, rows))[0] ?? null;
      },
      setOrderStatus: async (reference, status) => {
        await connection.query("UPDATE orders SET status = ? WHERE reference = ?", [status, reference]);
      },
    };

    try {
      await connection.beginTransaction();
      const result = await fn(tx);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
