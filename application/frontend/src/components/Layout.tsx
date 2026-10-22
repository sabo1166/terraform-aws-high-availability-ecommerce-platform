import { useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../features/account/AuthContext";
import { CartDrawer } from "../features/cart/CartDrawer";
import { useCart } from "../features/cart/CartContext";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { Logo } from "./Logo";

function AnnouncementBar() {
  return (
    <div className="announce" role="note">
      Oriel is a demo store: nothing is for sale and no payment is taken. Delivery policy shown is for demonstration.
    </div>
  );
}

function SearchBox() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = value.trim();
    navigate(q ? `/shop?q=${encodeURIComponent(q)}` : "/shop");
  };
  return (
    <form className="search" role="search" onSubmit={submit}>
      <label className="sr-only" htmlFor="site-search">
        Search products
      </label>
      <input id="site-search" type="search" placeholder="Search" value={value} onChange={(e) => setValue(e.target.value)} />
      <button type="submit" className="icon-btn" aria-label="Submit search">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>
    </form>
  );
}

export function Header() {
  const cart = useCart();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const categories = useAsync((signal) => api.categories(signal), "categories");
  const links = categories.data?.categories ?? [];

  return (
    <header className="header">
      <div className="container header-inner" style={{ position: "relative" }}>
        <button
          type="button"
          className="icon-btn menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="main-nav"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? "✕" : "☰"}
        </button>
        <Logo />
        <nav id="main-nav" className="nav" aria-label="Main" data-open={menuOpen} onClick={() => setMenuOpen(false)}>
          <NavLink to="/shop" end>
            Shop all
          </NavLink>
          {links.map((category) => (
            <NavLink key={category.slug} to={`/shop/${category.slug}`}>
              {category.name}
            </NavLink>
          ))}
        </nav>
        <div className="header-spacer" />
        <SearchBox />
        <Link to={user ? "/account" : "/account/login"} className="icon-btn" aria-label={user ? "Your account" : "Sign in"}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
          </svg>
        </Link>
        <button type="button" className="icon-btn" onClick={cart.openDrawer} aria-label={`Open cart, ${cart.count} items`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 8h14l-1.2 11H6.2L5 8Z" />
            <path d="M9 8V6a3 3 0 0 1 6 0v2" />
          </svg>
          {cart.count > 0 && <span className="badge" aria-hidden="true">{cart.count}</span>}
        </button>
      </div>
    </header>
  );
}

function Newsletter() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    // Demo only: there is no mailing list and nothing is stored or sent.
    if (/^\S+@\S+\.\S+$/.test(email)) setDone(true);
  };
  return done ? (
    <p role="status">Thanks. This is a demo, so nothing was stored and no email will be sent.</p>
  ) : (
    <form className="newsletter" onSubmit={submit} noValidate>
      <label className="sr-only" htmlFor="newsletter-email">
        Email address
      </label>
      <input id="newsletter-email" className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="btn btn-primary" type="submit">
        Subscribe
      </button>
    </form>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <Logo />
          <p style={{ marginTop: 12, maxWidth: "34ch" }}>Quiet objects for considered homes. A fictional brand built to demonstrate a complete online shop.</p>
          <p className="hint" style={{ color: "#a79d8d" }}>Join the (demo) newsletter</p>
          <Newsletter />
        </div>
        <div>
          <h4>Shop</h4>
          <ul>
            <li><Link to="/shop">All products</Link></li>
            <li><Link to="/shop/ceramics">Ceramics</Link></li>
            <li><Link to="/shop/lighting">Lighting</Link></li>
            <li><Link to="/shop/textiles">Textiles</Link></li>
          </ul>
        </div>
        <div>
          <h4>Help</h4>
          <ul>
            <li><Link to="/help#delivery">Delivery</Link></li>
            <li><Link to="/help#returns">Returns</Link></li>
            <li><Link to="/help#support">Support</Link></li>
            <li><Link to="/order/find">Find an order</Link></li>
          </ul>
        </div>
        <div>
          <h4>Account</h4>
          <ul>
            <li><Link to="/account/login">Sign in</Link></li>
            <li><Link to="/account/register">Create account</Link></li>
            <li><Link to="/cart">Your cart</Link></li>
          </ul>
        </div>
      </div>
      <div className="container footer-bottom">
        Demo store. Products, prices, and policies are fictional; no real orders are fulfilled and there are no real customers or reviews.
      </div>
    </footer>
  );
}

export function Layout() {
  const cart = useCart();
  const location = useLocation();
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <AnnouncementBar />
      <Header />
      <main id="main" tabIndex={-1} key={location.pathname}>
        <Outlet />
      </main>
      <Footer />
      <CartDrawer />
      <div className="sr-only" aria-live="polite" role="status">{cart.announcement}</div>
    </>
  );
}
