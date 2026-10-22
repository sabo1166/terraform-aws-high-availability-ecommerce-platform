import { Link } from "react-router-dom";
import { ProductArt } from "../../components/ProductArt";
import { formatMoney } from "../../lib/money";
import { MAX_QTY } from "./cart";
import { useCart } from "./CartContext";

/** Shared by the drawer and the cart page: line items, quantity controls, and server-confirmed issues. */
export function CartLines({ onNavigate }: { onNavigate?: () => void }) {
  const cart = useCart();
  const serverLines = new Map((cart.pricing?.lines ?? []).map((l) => [l.variantId, l]));
  const issues = cart.pricing?.issues ?? [];

  return (
    <div>
      {issues.length > 0 && (
        <div className="alert alert-warn" role="alert">
          <strong>Your cart needs attention</strong>
          <ul>
            {issues.map((issue, index) => (
              <li key={`${issue.variantId}-${index}`}>{issue.message}</li>
            ))}
          </ul>
          <button type="button" className="btn btn-dark btn-sm" onClick={cart.fixCart}>
            Update my cart
          </button>
        </div>
      )}
      {cart.pricingError && (
        <div className="alert alert-info" role="status">
          {cart.pricingError} Prices shown are estimates.
        </div>
      )}
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {cart.items.map((item) => {
          const unit = serverLines.get(item.variantId)?.unitPriceCents ?? item.unitPriceCents;
          return (
            <li className="line" key={item.variantId}>
              <div className="line-thumb">
                <ProductArt art={item.art} label="" />
              </div>
              <div>
                <Link className="line-title" to={`/products/${item.productSlug}`} onClick={onNavigate}>
                  {item.productName}
                </Link>
                <div className="card-meta">{item.variantLabel}</div>
                <div className="qty" role="group" aria-label={`Quantity for ${item.productName}`} style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    aria-label={`Decrease quantity of ${item.productName}`}
                    onClick={() => cart.setItemQuantity(item.variantId, item.quantity - 1)}
                  >
                    −
                  </button>
                  <output aria-live="polite">{item.quantity}</output>
                  <button
                    type="button"
                    aria-label={`Increase quantity of ${item.productName}`}
                    disabled={item.quantity >= Math.min(MAX_QTY, item.maxStock ?? MAX_QTY)}
                    onClick={() => cart.setItemQuantity(item.variantId, item.quantity + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="price">{formatMoney(unit * item.quantity)}</div>
                <button type="button" className="link-btn" onClick={() => cart.remove(item.variantId)}>
                  Remove<span className="sr-only"> {item.productName}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CartTotals() {
  const cart = useCart();
  if (cart.pricing) {
    const { subtotalCents, shippingCents, totalCents } = cart.pricing;
    return (
      <div>
        <div className="summary-row">
          <span>Subtotal</span>
          <span>{formatMoney(subtotalCents)}</span>
        </div>
        <div className="summary-row">
          <span>Delivery</span>
          <span>{shippingCents === 0 ? "Free" : formatMoney(shippingCents)}</span>
        </div>
        <div className="summary-row summary-total">
          <span>Total</span>
          <span>{formatMoney(totalCents)}</span>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="summary-row">
        <span>Estimated subtotal</span>
        <span>{formatMoney(cart.estimatedSubtotalCents)}</span>
      </div>
      <p className="hint" role="status">
        {cart.pricingLoading ? "Confirming prices…" : "Delivery and final prices are confirmed at checkout."}
      </p>
    </div>
  );
}
