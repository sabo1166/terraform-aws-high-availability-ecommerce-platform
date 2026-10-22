import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "../../lib/api";
import { formatMoney } from "../../lib/money";
import type { Order } from "../../lib/types";
import { useAsync } from "../../lib/useAsync";
import { useAuth } from "../account/AuthContext";
import { recallOrder, rememberOrder } from "./orderMemory";

export function OrderSummary({ order }: { order: Order }) {
  return (
    <div className="panel">
      <p className="card-meta">Placed {new Date(order.createdAt).toLocaleString()} · <span className="status">{order.status}</span></p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Item</th><th>Qty</th><th style={{ textAlign: "right" }}>Total</th></tr>
          </thead>
          <tbody>
            {order.items.map((item, index) => (
              <tr key={index}>
                <td>{item.productName} <span className="card-meta">({item.variantLabel})</span></td>
                <td>{item.quantity}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(item.lineTotalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ maxWidth: 320, marginLeft: "auto", marginTop: 12 }}>
        <div className="summary-row"><span>Subtotal</span><span>{formatMoney(order.subtotalCents)}</span></div>
        <div className="summary-row"><span>Delivery</span><span>{order.shippingCents === 0 ? "Free" : formatMoney(order.shippingCents)}</span></div>
        <div className="summary-row summary-total"><span>Total</span><span>{formatMoney(order.totalCents)}</span></div>
      </div>
      <p className="hint">Demo order: payment was not taken.</p>
    </div>
  );
}

export function LookupForm({ initialReference = "" }: { initialReference?: string }) {
  const navigate = useNavigate();
  const [reference, setReference] = useState(initialReference);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { order } = await api.lookupOrder(reference.trim().toUpperCase(), email.trim());
      rememberOrder(order);
      navigate(`/order/${order.reference}`);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 404
          ? "We couldn't find an order with that reference and email."
          : e instanceof ApiError
            ? e.message
            : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel narrow" onSubmit={submit} noValidate>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="field">
        <label htmlFor="lk-ref">Order reference</label>
        <input id="lk-ref" className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="ORI-XXXXXXXX" required />
      </div>
      <div className="field">
        <label htmlFor="lk-email">Email used at checkout</label>
        <input id="lk-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <button className="btn btn-dark btn-block" disabled={busy || !reference || !email}>
        {busy ? "Looking…" : "Find order"}
      </button>
    </form>
  );
}

export function FindOrderPage() {
  return (
    <div className="container section">
      <h1 style={{ textAlign: "center" }}>Find an order</h1>
      <LookupForm />
    </div>
  );
}

export function ConfirmationPage() {
  const { reference = "" } = useParams();
  const { user, loading: authLoading } = useAuth();
  const remembered = recallOrder(reference);
  // A signed-in customer can open their own order without re-entering an email.
  const own = useAsync(
    () => (remembered || !user ? Promise.resolve(null) : api.accountOrders().then((r) => r.orders.find((o) => o.reference === reference) ?? null)),
    `own-order:${reference}:${user?.id ?? "none"}`,
  );
  if (!remembered && (authLoading || own.loading)) {
    return <div className="container section" aria-busy="true"><div className="skeleton" style={{ height: 200 }} /></div>;
  }
  const order = remembered ?? own.data;
  return (
    <div className="container section" style={{ maxWidth: 820 }}>
      {order ? (
        <>
          <p className="eyebrow">Demo order placed</p>
          <h1>Thank you, {order.customerName.split(" ")[0]}</h1>
          <p className="lede">
            Your order reference is <strong>{order.reference}</strong>. This is a demonstration: nothing will be shipped and no payment was taken.
          </p>
          <OrderSummary order={order} />
          <p style={{ marginTop: 20 }}>
            <Link className="btn btn-dark" to="/shop">Continue shopping</Link>
          </p>
        </>
      ) : (
        <>
          <h1>Order {reference}</h1>
          <p className="lede">To see this order, confirm the email address used at checkout.</p>
          <LookupForm initialReference={reference} />
        </>
      )}
    </div>
  );
}
