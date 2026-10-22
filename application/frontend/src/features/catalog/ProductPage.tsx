import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ProductArt } from "../../components/ProductArt";
import { Reveal } from "../../components/Reveal";
import { api } from "../../lib/api";
import { formatMoney } from "../../lib/money";
import type { Product, Variant } from "../../lib/types";
import { useAsync } from "../../lib/useAsync";
import { MAX_QTY } from "../cart/cart";
import { useCart } from "../cart/CartContext";
import { ProductCard } from "./ProductCard";

const VIEWS = [
  { view: 0 as const, label: "Studio view" },
  { view: 1 as const, label: "Close detail" },
  { view: 2 as const, label: "In a room" },
];

export function stockMessage(stock: number): { text: string; className: string } {
  if (stock <= 0) return { text: "Out of stock", className: "stock-out" };
  if (stock <= 5) return { text: `Only ${stock} left`, className: "stock-low" };
  return { text: "In stock", className: "stock-ok" };
}

function ProductDetail({ product, related }: { product: Product; related: Product[] }) {
  const cart = useCart();
  const firstAvailable = product.variants.find((v) => v.stock > 0) ?? product.variants[0];
  const [variantId, setVariantId] = useState<number | undefined>(firstAvailable?.id);
  const [quantity, setQuantity] = useState(1);
  const [view, setView] = useState<0 | 1 | 2>(0);
  const [notice, setNotice] = useState("");

  const variant: Variant | undefined = product.variants.find((v) => v.id === variantId);
  const stock = variant?.stock ?? 0;
  const maxQty = Math.max(1, Math.min(MAX_QTY, stock));
  const status = stockMessage(stock);
  const inCart = cart.items.find((i) => i.variantId === variant?.id)?.quantity ?? 0;

  const choose = (v: Variant) => {
    setVariantId(v.id);
    setQuantity(1);
    setNotice("");
  };

  const addToCart = () => {
    if (!variant || stock <= 0) return;
    const result = cart.add({
      variantId: variant.id,
      productSlug: product.slug,
      productName: product.name,
      variantLabel: variant.label,
      unitPriceCents: variant.priceCents,
      quantity,
      art: product.art,
      maxStock: variant.stock,
    });
    setNotice(
      result.capped
        ? `The most you can order is ${result.quantity}. Your cart has been set to that.`
        : `${product.name} (${variant.label}) was added to your cart.`,
    );
    cart.openDrawer();
  };

  return (
    <div className="container">
      <p className="breadcrumbs">
        <Link to="/">Home</Link> / <Link to="/shop">Shop</Link> / <Link to={`/shop/${product.categorySlug}`}>{product.categorySlug}</Link> / {product.name}
      </p>
      <div className="product-layout">
        <div>
          <div className="gallery-main">
            <ProductArt art={product.art} label={`${product.name}: ${VIEWS[view]?.label ?? "Product view"}`} view={view} />
          </div>
          <div className="gallery-thumbs" role="group" aria-label="Product images">
            {VIEWS.map((v) => (
              <button key={v.view} type="button" className="thumb" aria-pressed={view === v.view} aria-label={v.label} onClick={() => setView(v.view)}>
                <ProductArt art={product.art} label="" view={v.view} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="eyebrow">{product.categorySlug}</p>
          <h1 style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}>{product.name}</h1>
          <p className="price" style={{ fontSize: "1.5rem", margin: "0 0 16px" }}>
            {variant ? formatMoney(variant.priceCents) : "—"}
          </p>
          <p className="lede" style={{ fontSize: "1rem" }}>{product.description}</p>

          {product.variants.length > 1 && (
            <div className="field" role="radiogroup" aria-label="Choose an option">
              <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Option: {variant?.label}</span>
              <div className="options">
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    role="radio"
                    className="option"
                    aria-checked={v.id === variantId}
                    disabled={v.stock <= 0}
                    onClick={() => choose(v)}
                  >
                    {v.label}
                    {v.stock <= 0 ? " (sold out)" : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className={status.className} role="status">{status.text}{inCart > 0 && stock > 0 ? ` · ${inCart} in your cart` : ""}</p>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", margin: "16px 0" }}>
            <div className="qty" role="group" aria-label="Quantity">
              <button type="button" aria-label="Decrease quantity" disabled={quantity <= 1 || stock <= 0} onClick={() => setQuantity((q) => Math.max(1, q - 1))}>−</button>
              <output aria-live="polite">{quantity}</output>
              <button type="button" aria-label="Increase quantity" disabled={quantity >= maxQty || stock <= 0} onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}>+</button>
            </div>
            <button type="button" className="btn btn-primary" style={{ flex: 1, minWidth: 180 }} disabled={!variant || stock <= 0} onClick={addToCart}>
              {stock <= 0 ? "Sold out" : "Add to cart"}
            </button>
          </div>
          {notice && <p className="alert alert-ok" role="status">{notice}</p>}

          {product.highlights.length > 0 && (
            <ul style={{ paddingLeft: 20 }}>
              {product.highlights.map((h) => <li key={h}>{h}</li>)}
            </ul>
          )}

          <h2 style={{ fontSize: "1.2rem", marginTop: 28 }}>Details</h2>
          <table className="specs">
            <tbody>
              {Object.entries(product.specs).map(([name, value]) => (
                <tr key={name}><th scope="row">{name}</th><td>{value}</td></tr>
              ))}
              {variant && <tr><th scope="row">SKU</th><td>{variant.sku}</td></tr>}
            </tbody>
          </table>
          <p className="hint" style={{ marginTop: 16 }}>
            Demo product. It does not exist, and no order for it will be fulfilled.
          </p>
        </div>
      </div>

      {related.length > 0 && (
        <section className="section" aria-labelledby="related-title">
          <Reveal>
            <h2 id="related-title">You may also like</h2>
          </Reveal>
          <div className="grid grid-products">
            {related.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}
    </div>
  );
}

export function ProductPage() {
  const { slug = "" } = useParams();
  const result = useAsync((signal) => api.product(slug, signal), `product:${slug}`);

  if (result.loading && !result.data) {
    return (
      <div className="container section" aria-busy="true">
        <div className="product-layout">
          <div className="skeleton" style={{ aspectRatio: "5 / 6" }} />
          <div style={{ display: "grid", gap: 14 }}>
            <div className="skeleton" style={{ height: 40, width: "70%" }} />
            <div className="skeleton" style={{ height: 24, width: "30%" }} />
            <div className="skeleton" style={{ height: 120 }} />
          </div>
        </div>
      </div>
    );
  }
  if (result.error) {
    const notFound = result.error.status === 404;
    return (
      <div className="container section" style={{ textAlign: "center" }}>
        <h1>{notFound ? "We couldn't find that product" : "We couldn't load this product"}</h1>
        <p className="lede" style={{ marginInline: "auto" }}>{notFound ? "It may have been removed or the link may be wrong." : result.error.message}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          {!notFound && <button type="button" className="btn btn-dark" onClick={result.reload}>Try again</button>}
          <Link className="btn btn-ghost" to="/shop">Back to the shop</Link>
        </div>
      </div>
    );
  }
  if (!result.data) return null;
  return <ProductDetail key={result.data.product.id} product={result.data.product} related={result.data.related} />;
}
