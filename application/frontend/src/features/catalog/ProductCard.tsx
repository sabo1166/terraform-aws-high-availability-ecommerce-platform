import { Link } from "react-router-dom";
import { ProductArt } from "../../components/ProductArt";
import { formatMoney } from "../../lib/money";
import type { Product } from "../../lib/types";
import { useCart } from "../cart/CartContext";

export function priceRange(product: Product): { min: number; max: number } {
  const prices = product.variants.map((v) => v.priceCents);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function totalStock(product: Product): number {
  return product.variants.reduce((sum, v) => sum + v.stock, 0);
}

export function ProductCard({ product }: { product: Product }) {
  const cart = useCart();
  const { min, max } = priceRange(product);
  const stock = totalStock(product);
  const single = product.variants.length === 1 ? product.variants[0] : undefined;
  const soldOut = stock <= 0;

  const quickAdd = () => {
    if (!single) return;
    cart.add({
      variantId: single.id,
      productSlug: product.slug,
      productName: product.name,
      variantLabel: single.label,
      unitPriceCents: single.priceCents,
      quantity: 1,
      art: product.art,
      maxStock: single.stock,
    });
    cart.openDrawer();
  };

  return (
    <article className="card">
      {soldOut ? <span className="tag tag-sold">Sold out</span> : stock <= 5 ? <span className="tag">Low stock</span> : null}
      <div className="card-media">
        <ProductArt art={product.art} label={`${product.name}, product illustration`} />
      </div>
      <div className="card-body">
        <Link className="card-title" to={`/products/${product.slug}`}>
          {product.name}
        </Link>
        <span className="card-meta">
          {product.variants.length > 1 ? `${product.variants.length} options` : (single?.label ?? "")}
        </span>
        <span className="price">{min === max ? formatMoney(min) : `From ${formatMoney(min)}`}</span>
        <div className="card-actions">
          {single && !soldOut ? (
            <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={quickAdd}>
              Add to cart
            </button>
          ) : (
            <Link className="btn btn-ghost btn-sm btn-block" to={`/products/${product.slug}`}>
              {soldOut ? "View details" : "Choose options"}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="card" aria-hidden="true">
      <div className="skeleton" style={{ aspectRatio: "5 / 6" }} />
      <div className="card-body">
        <div className="skeleton" style={{ height: 18, width: "70%" }} />
        <div className="skeleton" style={{ height: 14, width: "40%" }} />
      </div>
    </div>
  );
}
