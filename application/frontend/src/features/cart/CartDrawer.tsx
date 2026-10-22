import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { CartLines, CartTotals } from "./CartLines";
import { useCart } from "./CartContext";

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function CartDrawer() {
  const cart = useCart();
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!cart.drawerOpen) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        cart.closeDrawer();
      } else if (event.key === "Tab" && panel) {
        // Keep keyboard focus inside the open dialog.
        const nodes = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      returnFocusRef.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.drawerOpen]);

  return (
    <AnimatePresence>
      {cart.drawerOpen && (
        <>
          <motion.div
            className="overlay"
            onClick={cart.closeDrawer}
            initial={{ opacity: reduce ? 1 : 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: reduce ? 1 : 0 }}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
            initial={{ x: reduce ? 0 : "100%" }}
            animate={{ x: 0 }}
            exit={{ x: reduce ? 0 : "100%" }}
            transition={{ type: "tween", duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="drawer-head">
              <h2 id="drawer-title" style={{ margin: 0, fontSize: "1.4rem" }}>
                Your cart ({cart.count})
              </h2>
              <button type="button" className="icon-btn" onClick={cart.closeDrawer} aria-label="Close cart">
                ✕
              </button>
            </div>
            {cart.items.length === 0 ? (
              <div className="drawer-body">
                <div className="empty" style={{ marginTop: 20 }}>
                  <h3>Your cart is empty</h3>
                  <p className="hint">Add something you love and it will wait for you here.</p>
                  <Link className="btn btn-dark" to="/shop" onClick={cart.closeDrawer}>
                    Browse the shop
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <div className="drawer-body">
                  <CartLines onNavigate={cart.closeDrawer} />
                </div>
                <div className="drawer-foot">
                  <CartTotals />
                  <Link className="btn btn-primary btn-block" to="/checkout" onClick={cart.closeDrawer}>
                    Checkout
                  </Link>
                  <Link className="btn btn-ghost btn-block" to="/cart" onClick={cart.closeDrawer}>
                    View full cart
                  </Link>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
