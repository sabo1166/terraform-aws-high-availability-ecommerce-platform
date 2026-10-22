import { Link } from "react-router-dom";
import { CartLines, CartTotals } from "./CartLines";
import { useCart } from "./CartContext";

export function CartPage() {
  const cart = useCart();
  return (
    <div className="container section">
      <h1>Your cart</h1>
      {cart.items.length === 0 ? (
        <div className="empty">
          <h2 style={{ fontSize: "1.5rem" }}>Your cart is empty</h2>
          <p className="hint">Nothing here yet. Have a look at what's new.</p>
          <Link className="btn btn-dark" to="/shop">Start shopping</Link>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="panel">
            <CartLines />
            <button type="button" className="link-btn" style={{ marginTop: 16 }} onClick={cart.clear}>
              Empty cart
            </button>
          </div>
          <aside className="panel" aria-label="Order summary">
            <h2 style={{ fontSize: "1.3rem" }}>Summary</h2>
            <CartTotals />
            <Link
              className="btn btn-primary btn-block"
              style={{ marginTop: 16 }}
              to="/checkout"
              aria-disabled={Boolean(cart.pricing?.issues.length)}
              onClick={(event) => {
                if (cart.pricing?.issues.length) event.preventDefault();
              }}
            >
              Checkout
            </Link>
            {cart.pricing?.issues.length ? <p className="hint">Update your cart above before checking out.</p> : null}
            <p className="hint">Demo store: no payment is taken.</p>
          </aside>
        </div>
      )}
    </div>
  );
}
