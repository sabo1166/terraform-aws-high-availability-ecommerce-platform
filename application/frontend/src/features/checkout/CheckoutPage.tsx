import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api } from "../../lib/api";
import { formatMoney } from "../../lib/money";
import type { CartIssue } from "../../lib/types";
import { useAuth } from "../account/AuthContext";
import { useCart } from "../cart/CartContext";
import { CartTotals } from "../cart/CartLines";
import {
  COUNTRIES,
  emptyCheckoutValues,
  fieldFromServerPath,
  validateCheckout,
  type CheckoutValues,
  type FieldName,
} from "./checkoutSchema";
import { rememberOrder } from "./orderMemory";

function Field({
  name,
  label,
  values,
  errors,
  onChange,
  type = "text",
  autoComplete,
  full,
  hint,
}: {
  name: FieldName;
  label: string;
  values: CheckoutValues;
  errors: Partial<Record<FieldName, string>>;
  onChange: (name: FieldName, value: string) => void;
  type?: string;
  autoComplete?: string;
  full?: boolean;
  hint?: string;
}) {
  const error = errors[name];
  const id = `co-${name}`;
  return (
    <div className={`field${full ? " full" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        type={type}
        className="input"
        value={values[name]}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(name, e.target.value)}
      />
      {hint && !error && <span id={`${id}-hint`} className="hint">{hint}</span>}
      {error && <span id={`${id}-error`} className="field-error">{error}</span>}
    </div>
  );
}

export function CheckoutPage() {
  const cart = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState<CheckoutValues>({ ...emptyCheckoutValues, email: user?.email ?? "", customerName: user?.name ?? "" });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [serverIssues, setServerIssues] = useState<CartIssue[]>([]);
  const errorRef = useRef<HTMLDivElement>(null);

  // Prefill from the account once it has loaded, without overwriting what the customer typed.
  useEffect(() => {
    if (!user) return;
    setValues((v) => ({ ...v, email: v.email || user.email, customerName: v.customerName || user.name }));
  }, [user]);

  const change = (name: FieldName, value: string) => {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setServerIssues([]);
    const found = validateCheckout(values);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      const first = (Object.keys(found) as FieldName[])[0];
      document.getElementById(`co-${first}`)?.focus();
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const { order } = await api.checkout({
        items: cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        email: values.email.trim(),
        customerName: values.customerName.trim(),
        address: {
          line1: values.line1.trim(),
          line2: values.line2.trim(),
          city: values.city.trim(),
          region: values.region.trim(),
          postalCode: values.postalCode.trim(),
          country: values.country,
        },
        paymentMethod: "demo",
      });
      rememberOrder(order);
      cart.clear();
      navigate(`/order/${order.reference}`, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.code === "cart_changed") {
        const pricing = (error.details as { pricing?: { issues?: CartIssue[] } } | undefined)?.pricing;
        setServerIssues(pricing?.issues ?? []);
        setFormError("Your cart changed while you were checking out. Review the changes below and update your cart.");
      } else if (error instanceof ApiError && error.code === "validation_error") {
        const mapped: Partial<Record<FieldName, string>> = {};
        for (const [path, message] of Object.entries(error.fieldErrors)) {
          const field = fieldFromServerPath(path);
          if (field) mapped[field] = message;
        }
        setErrors(mapped);
        setFormError("Please check the highlighted fields.");
      } else if (error instanceof ApiError) {
        setFormError(error.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      setTimeout(() => errorRef.current?.focus(), 0);
    } finally {
      setSubmitting(false);
    }
  };

  if (cart.items.length === 0) {
    return (
      <div className="container section">
        <h1>Checkout</h1>
        <div className="empty">
          <h2 style={{ fontSize: "1.5rem" }}>Your cart is empty</h2>
          <p className="hint">Add something to your cart before checking out.</p>
          <Link className="btn btn-dark" to="/shop">Browse the shop</Link>
        </div>
      </div>
    );
  }

  const blocked = Boolean(cart.pricing?.issues.length);

  return (
    <div className="container section">
      <h1>Checkout</h1>
      <div className="alert alert-info" role="note">
        <strong>Demo checkout.</strong> No payment is taken and no card details are collected or stored. The order is recorded in the demo database only.
      </div>
      <div className="checkout-layout">
        <form onSubmit={submit} noValidate aria-describedby={formError ? "form-error" : undefined}>
          {formError && (
            <div id="form-error" className="alert alert-error" role="alert" tabIndex={-1} ref={errorRef}>
              {formError}
              {serverIssues.length > 0 && (
                <ul>{serverIssues.map((i, n) => <li key={n}>{i.message}</li>)}</ul>
              )}
              {serverIssues.length > 0 && (
                <button type="button" className="btn btn-dark btn-sm" onClick={() => { cart.fixCart(); setServerIssues([]); setFormError(null); }}>
                  Update my cart
                </button>
              )}
            </div>
          )}
          {blocked && !serverIssues.length && (
            <div className="alert alert-warn" role="alert">
              Some items in your cart are unavailable or have limited stock.{" "}
              <button type="button" className="link-btn" onClick={cart.fixCart}>Update my cart</button>
            </div>
          )}

          <section className="panel" style={{ marginBottom: 20 }} aria-labelledby="contact-h">
            <h2 id="contact-h" style={{ fontSize: "1.25rem" }}>Contact</h2>
            <Field name="email" label="Email" type="email" autoComplete="email" values={values} errors={errors} onChange={change} hint="Used to find your demo order." />
            <Field name="customerName" label="Full name" autoComplete="name" values={values} errors={errors} onChange={change} />
          </section>

          <section className="panel" style={{ marginBottom: 20 }} aria-labelledby="delivery-h">
            <h2 id="delivery-h" style={{ fontSize: "1.25rem" }}>Delivery address</h2>
            <div className="form-grid">
              <Field name="line1" label="Address" autoComplete="address-line1" full values={values} errors={errors} onChange={change} />
              <Field name="line2" label="Apartment, suite, etc. (optional)" autoComplete="address-line2" full values={values} errors={errors} onChange={change} />
              <Field name="city" label="City" autoComplete="address-level2" values={values} errors={errors} onChange={change} />
              <Field name="region" label="State / region" autoComplete="address-level1" values={values} errors={errors} onChange={change} />
              <Field name="postalCode" label="Postal code" autoComplete="postal-code" values={values} errors={errors} onChange={change} />
              <div className="field">
                <label htmlFor="co-country">Country</label>
                <select id="co-country" className="select" value={values.country} onChange={(e) => change("country", e.target.value)} autoComplete="country">
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section className="panel" style={{ marginBottom: 20 }} aria-labelledby="pay-h">
            <h2 id="pay-h" style={{ fontSize: "1.25rem" }}>Payment</h2>
            <p style={{ margin: 0 }}>
              <strong>Demo payment.</strong> There is nothing to enter here: this store never asks for card details.
            </p>
          </section>

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting || blocked}>
            {submitting ? "Placing your order…" : `Place demo order${cart.pricing ? ` · ${formatMoney(cart.pricing.totalCents)}` : ""}`}
          </button>
        </form>

        <aside className="panel" aria-label="Order summary">
          <h2 style={{ fontSize: "1.25rem" }}>Order summary</h2>
          <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0 }}>
            {cart.items.map((item) => (
              <li key={item.variantId} className="summary-row" style={{ padding: "6px 0" }}>
                <span>{item.productName} <span className="card-meta">({item.variantLabel}) × {item.quantity}</span></span>
                <span>{formatMoney(item.unitPriceCents * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <CartTotals />
          <p className="hint">Final prices are confirmed by the server when you place the order.</p>
        </aside>
      </div>
    </div>
  );
}
