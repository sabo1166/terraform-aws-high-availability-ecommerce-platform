import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError, api } from "../../lib/api";
import { formatMoney } from "../../lib/money";
import { useAsync } from "../../lib/useAsync";
import { useAuth } from "./AuthContext";

function useRedirectTarget(): string {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return from && from.startsWith("/") && !from.startsWith("//") ? from : "/account";
}

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const target = useRedirectTarget();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={target} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate(target, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container section">
      <h1 style={{ textAlign: "center" }}>Sign in</h1>
      <form className="panel narrow" onSubmit={submit} noValidate>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <div className="field">
          <label htmlFor="login-email">Email</label>
          <input id="login-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input id="login-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn btn-dark btn-block" disabled={busy || !email || !password}>{busy ? "Signing inâ€¦" : "Sign in"}</button>
        <p className="hint" style={{ marginTop: 16 }}>New here? <Link to="/account/register">Create an account</Link></p>
      </form>
    </div>
  );
}

export function RegisterPage() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/account" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const local: Record<string, string> = {};
    if (!name.trim()) local.name = "Enter your name";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) local.email = "Enter a valid email address";
    if (password.length < 10) local.password = "Use at least 10 characters";
    setErrors(local);
    if (Object.keys(local).length > 0) return;
    setBusy(true);
    try {
      await register(name.trim(), email.trim(), password);
      navigate("/account", { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.code === "validation_error") setErrors(e.fieldErrors);
      else setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const field = (id: string, label: string, value: string, set: (v: string) => void, type: string, autoComplete: string, hint?: string) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" type={type} autoComplete={autoComplete} value={value} onChange={(e) => set(e.target.value)} aria-invalid={errors[id.replace("reg-", "")] ? true : undefined} aria-describedby={errors[id.replace("reg-", "")] ? `${id}-error` : undefined} />
      {hint && !errors[id.replace("reg-", "")] && <span className="hint">{hint}</span>}
      {errors[id.replace("reg-", "")] && <span id={`${id}-error`} className="field-error">{errors[id.replace("reg-", "")]}</span>}
    </div>
  );

  return (
    <div className="container section">
      <h1 style={{ textAlign: "center" }}>Create an account</h1>
      <form className="panel narrow" onSubmit={submit} noValidate>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {field("reg-name", "Full name", name, setName, "text", "name")}
        {field("reg-email", "Email", email, setEmail, "email", "email")}
        {field("reg-password", "Password", password, setPassword, "password", "new-password", "At least 10 characters.")}
        <button className="btn btn-dark btn-block" disabled={busy}>{busy ? "Creatingâ€¦" : "Create account"}</button>
        <p className="hint" style={{ marginTop: 16 }}>Already registered? <Link to="/account/login">Sign in</Link></p>
      </form>
    </div>
  );
}

export function AccountPage() {
  const { user, loading, logout } = useAuth();
  const orders = useAsync(() => (user ? api.accountOrders() : Promise.resolve({ orders: [] })), `account-orders:${user?.id ?? "none"}`);
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const signOut = async () => {
    setSignOutError(null);
    setSigningOut(true);
    try {
      await logout();
      navigate("/");
    } catch (e) {
      setSigningOut(false);
      setSignOutError(e instanceof ApiError ? e.message : "We couldn't sign you out. Please try again.");
    }
  };

  if (loading) return <div className="container section" aria-busy="true"><div className="skeleton" style={{ height: 160 }} /></div>;
  // While signing out the user becomes null; go home instead of bouncing through the login page.
  if (!user) return signingOut ? null : <Navigate to="/account/login" replace state={{ from: "/account" }} />;

  return (
    <div className="container section">
      <div className="section-head">
        <div>
          <p className="eyebrow">Your account</p>
          <h1 style={{ margin: 0 }}>Hello, {user.name.split(" ")[0]}</h1>
          <p className="hint">{user.email}</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {user.role === "admin" && <Link className="btn btn-ghost btn-sm" to="/admin">Admin</Link>}
          <button type="button" className="btn btn-dark btn-sm" onClick={signOut} disabled={signingOut}>Sign out</button>
        </div>
      </div>
      {signOutError && <div className="alert alert-error" role="alert">{signOutError}</div>}
      <h2 style={{ fontSize: "1.5rem" }}>Order history</h2>
      {orders.error ? (
        <div className="alert alert-error" role="alert">{orders.error.message} <button type="button" className="link-btn" onClick={orders.reload}>Try again</button></div>
      ) : orders.loading ? (
        <div className="skeleton" style={{ height: 120 }} aria-busy="true" />
      ) : orders.data && orders.data.orders.length > 0 ? (
        <div className="table-wrap panel">
          <table className="table">
            <thead><tr><th>Reference</th><th>Placed</th><th>Status</th><th>Items</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
            <tbody>
              {orders.data.orders.map((o) => (
                <tr key={o.reference}>
                  <td><Link to={`/order/${o.reference}`}>{o.reference}</Link></td>
                  <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                  <td><span className="status">{o.status}</span></td>
                  <td>{o.items.reduce((n, i) => n + i.quantity, 0)}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(o.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty"><p>You haven't placed any demo orders yet.</p><Link className="btn btn-dark" to="/shop">Start shopping</Link></div>
      )}
    </div>
  );
}

