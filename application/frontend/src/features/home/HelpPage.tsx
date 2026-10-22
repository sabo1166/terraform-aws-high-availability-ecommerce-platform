import { Link } from "react-router-dom";

/** Help content is illustrative: Oriel is a demo and makes no real delivery, returns, or support promises. */
export function HelpPage() {
  return (
    <div className="container section" style={{ maxWidth: 820 }}>
      <h1>Help</h1>
      <div className="alert alert-info">
        Oriel is a demonstration store. The information below shows where real policies would appear; none of it is a commitment.
      </div>
      <h2 id="delivery">Delivery</h2>
      <p>In this demo, delivery costs a flat $6.00 and is free when an order's subtotal reaches $75.00. Orders are recorded but never shipped.</p>
      <h2 id="returns">Returns</h2>
      <p>A real store would describe its return window, condition requirements, and refund timing here. This demo has no returns process.</p>
      <h2 id="support">Support</h2>
      <p>There is no support team behind this demo. To look up a demo order you placed, use <Link to="/order/find">Find an order</Link>.</p>
      <h2>Payment</h2>
      <p>Checkout is a demo. No payment is taken and card details are never requested, collected, or stored.</p>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="container section" style={{ textAlign: "center" }}>
      <p className="eyebrow">404</p>
      <h1>We couldn't find that page</h1>
      <p className="lede" style={{ marginInline: "auto" }}>The link may be old, or the page may have moved.</p>
      <Link className="btn btn-dark" to="/shop">Continue shopping</Link>
    </div>
  );
}
