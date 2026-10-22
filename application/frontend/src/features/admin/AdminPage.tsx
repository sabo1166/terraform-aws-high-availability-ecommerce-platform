import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { ApiError, api } from "../../lib/api";
import { formatMoney, parseDollarsToCents } from "../../lib/money";
import type { Order, OrderStatus, Product, ProductArt } from "../../lib/types";
import { useAsync } from "../../lib/useAsync";
import { useAuth } from "../account/AuthContext";

const STATUSES: OrderStatus[] = ["placed", "packed", "shipped", "cancelled"];
const NEXT: Record<OrderStatus, OrderStatus[]> = { placed: ["packed", "cancelled"], packed: ["shipped", "cancelled"], shipped: [], cancelled: [] };
const SHAPES: ProductArt["shape"][] = ["vase", "lamp", "bowl", "mug", "candle", "throw", "tray", "pillow"];

const message = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

function StockEditor({ variantId, stock, onSaved }: { variantId: number; stock: number; onSaved: () => void }) {
  const [value, setValue] = useState(String(stock));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) return setError("Enter a whole number, 0 or more.");
    setBusy(true);
    setError("");
    try {
      await api.admin.setStock(variantId, n);
      onSaved();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <label className="sr-only" htmlFor={`stock-${variantId}`}>Stock</label>
      <input id={`stock-${variantId}`} className="input" style={{ width: 80, minHeight: 36, padding: "4px 8px" }} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy || value === String(stock)} onClick={save}>Save</button>
      {error && <span className="field-error" role="alert">{error}</span>}
    </span>
  );
}

function ProductsTab() {
  const products = useAsync(() => api.admin.products(), "admin-products");
  const [error, setError] = useState("");
  const toggle = async (product: Product) => {
    setError("");
    try {
      await api.admin.updateProduct(product.id, { active: !product.active });
      products.reload();
    } catch (e) {
      setError(message(e));
    }
  };
  if (products.error) return <div className="alert alert-error" role="alert">{products.error.message}</div>;
  if (products.loading && !products.data) return <div className="skeleton" style={{ height: 200 }} aria-busy="true" />;
  return (
    <div className="panel table-wrap">
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <table className="table">
        <thead><tr><th>Product</th><th>Variant</th><th>Price</th><th>Stock</th><th>Status</th></tr></thead>
        <tbody>
          {products.data?.products.flatMap((product) =>
            product.variants.map((variant, index) => (
              <tr key={variant.id}>
                <td>{index === 0 ? <Link to={`/products/${product.slug}`}>{product.name}</Link> : ""}</td>
                <td>{variant.label} <span className="card-meta">{variant.sku}</span></td>
                <td>{formatMoney(variant.priceCents)}</td>
                <td><StockEditor variantId={variant.id} stock={variant.stock} onSaved={products.reload} /></td>
                <td>
                  {index === 0 && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggle(product)} aria-pressed={product.active}>
                      {product.active ? "Active: hide" : "Hidden: show"}
                    </button>
                  )}
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}

function OrdersTab() {
  const orders = useAsync(() => api.admin.orders(), "admin-orders");
  const [error, setError] = useState("");
  const change = async (order: Order, status: OrderStatus) => {
    setError("");
    try {
      await api.admin.setOrderStatus(order.reference, status);
      orders.reload();
    } catch (e) {
      setError(message(e));
    }
  };
  if (orders.error) return <div className="alert alert-error" role="alert">{orders.error.message}</div>;
  if (orders.loading && !orders.data) return <div className="skeleton" style={{ height: 200 }} aria-busy="true" />;
  if (!orders.data?.orders.length) return <div className="empty"><p>No orders yet.</p></div>;
  return (
    <div className="panel table-wrap">
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <table className="table">
        <thead><tr><th>Reference</th><th>Customer</th><th>Placed</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>
          {orders.data.orders.map((order) => (
            <tr key={order.reference}>
              <td>{order.reference}</td>
              <td>{order.customerName}<br /><span className="card-meta">{order.email}</span></td>
              <td>{new Date(order.createdAt).toLocaleString()}</td>
              <td>{formatMoney(order.totalCents)}</td>
              <td>
                <label className="sr-only" htmlFor={`status-${order.reference}`}>Status for {order.reference}</label>
                <select id={`status-${order.reference}`} className="select" style={{ width: "auto", minHeight: 36 }} value={order.status} onChange={(e) => change(order, e.target.value as OrderStatus)} disabled={NEXT[order.status].length === 0}>
                  {STATUSES.filter((s) => s === order.status || NEXT[order.status].includes(s)).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NewProductTab() {
  const categories = useAsync((signal) => api.categories(signal), "admin-categories");
  const [form, setForm] = useState({ name: "", slug: "", description: "", categoryId: "", sku: "", label: "Standard", price: "", stock: "0", shape: "bowl" as ProductArt["shape"], c1: "#c9a47a", c2: "#8a5a3a", c3: "#f4ece1" });
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setDone("");
    const price = parseDollarsToCents(form.price);
    const stock = Number(form.stock);
    if (price === null) return setError("Enter a price like 24 or 24.50.");
    if (!Number.isInteger(stock) || stock < 0) return setError("Stock must be a whole number, 0 or more.");
    if (!form.categoryId) return setError("Choose a category.");
    setBusy(true);
    try {
      const { product } = await api.admin.createProduct({
        slug: form.slug.trim(),
        name: form.name.trim(),
        description: form.description.trim(),
        categoryId: Number(form.categoryId),
        art: { shape: form.shape, palette: [form.c1, form.c2, form.c3] },
        featured: false,
        active: true,
        variants: [{ sku: form.sku.trim(), label: form.label.trim() || "Standard", options: {}, priceCents: price, stock }],
      });
      setDone(`Created “${product.name}”.`);
    } catch (e) {
      setError(e instanceof ApiError && e.code === "validation_error" ? `Check: ${Object.keys(e.fieldErrors).join(", ")}` : message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel" onSubmit={submit} noValidate style={{ maxWidth: 720 }}>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {done && <div className="alert alert-ok" role="status">{done}</div>}
      <div className="form-grid">
        <div className="field"><label htmlFor="np-name">Name</label><input id="np-name" className="input" value={form.name} onChange={set("name")} /></div>
        <div className="field"><label htmlFor="np-slug">Slug</label><input id="np-slug" className="input" value={form.slug} onChange={set("slug")} placeholder="lowercase-with-dashes" /></div>
        <div className="field full"><label htmlFor="np-desc">Description</label><textarea id="np-desc" className="textarea" rows={3} value={form.description} onChange={set("description")} /></div>
        <div className="field"><label htmlFor="np-cat">Category</label>
          <select id="np-cat" className="select" value={form.categoryId} onChange={set("categoryId")}>
            <option value="">Choose…</option>
            {categories.data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="np-shape">Illustration</label>
          <select id="np-shape" className="select" value={form.shape} onChange={set("shape")}>{SHAPES.map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        <div className="field"><label htmlFor="np-sku">SKU</label><input id="np-sku" className="input" value={form.sku} onChange={set("sku")} /></div>
        <div className="field"><label htmlFor="np-label">Variant label</label><input id="np-label" className="input" value={form.label} onChange={set("label")} /></div>
        <div className="field"><label htmlFor="np-price">Price (USD)</label><input id="np-price" className="input" inputMode="decimal" value={form.price} onChange={set("price")} /></div>
        <div className="field"><label htmlFor="np-stock">Stock</label><input id="np-stock" className="input" inputMode="numeric" value={form.stock} onChange={set("stock")} /></div>
      </div>
      <button className="btn btn-dark" disabled={busy}>{busy ? "Creating…" : "Create product"}</button>
    </form>
  );
}

export function AdminPage() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<"products" | "orders" | "new">("products");
  if (loading) return <div className="container section" aria-busy="true"><div className="skeleton" style={{ height: 160 }} /></div>;
  if (!user) return <Navigate to="/account/login" replace state={{ from: "/admin" }} />;
  // This is a convenience only. Every admin API call is authorised again on the server.
  if (user.role !== "admin") {
    return (
      <div className="container section">
        <h1>No access</h1>
        <p className="lede">Your account doesn't have permission to manage the store.</p>
        <Link className="btn btn-dark" to="/account">Back to your account</Link>
      </div>
    );
  }
  return (
    <div className="container section">
      <h1>Store admin</h1>
      <div className="tabs" role="tablist" aria-label="Admin sections">
        {([["products", "Products and stock"], ["orders", "Orders"], ["new", "New product"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "products" && <ProductsTab />}
        {tab === "orders" && <OrdersTab />}
        {tab === "new" && <NewProductTab />}
      </div>
    </div>
  );
}
