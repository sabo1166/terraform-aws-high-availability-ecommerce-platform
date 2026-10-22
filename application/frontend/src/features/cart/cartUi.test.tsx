import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { mockApi, noUser, pricingFor, renderApp } from "../../test/utils";
import { CartPage } from "./CartPage";
import { STORAGE_KEY, type CartItem } from "./cart";
import { useCart } from "./CartContext";

const stored: CartItem = {
  variantId: 31,
  productSlug: "halo-lamp",
  productName: "Halo Lamp",
  variantLabel: "Sand",
  unitPriceCents: 14800,
  quantity: 2,
  art: { shape: "lamp", palette: ["#e8d6bd", "#b38b5d", "#fff6e6"] },
  maxStock: 8,
};

function OpenDrawerButton() {
  const cart = useCart();
  return <button onClick={cart.openDrawer}>Open cart</button>;
}

const base = (extra = {}) => ({
  "GET /api/v1/auth/me": noUser,
  "POST /api/v1/cart/validate": () => ({ body: { pricing: pricingFor([{ variantId: 31, unitPriceCents: 14800, quantity: 2, name: "Halo Lamp" }]) } }),
  ...extra,
});

describe("cart drawer and page", () => {
  it("restores a persisted cart and shows server-confirmed totals", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([stored]));
    mockApi(base());
    renderApp(
      <Routes>
        <Route path="/cart" element={<CartPage />} />
      </Routes>,
      { route: "/cart" },
    );
    expect(screen.getByRole("link", { name: "Halo Lamp" })).toBeInTheDocument();
    // 2 x $148.00 = $296.00, free delivery over $75.
    expect(await screen.findByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Subtotal")).toBeInTheDocument();
    expect(screen.getAllByText("$296.00").length).toBeGreaterThanOrEqual(2);
  });

  it("changes quantity, removes items, and reaches the empty state", async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify([stored]));
    mockApi(base());
    renderApp(
      <Routes>
        <Route path="/cart" element={<CartPage />} />
      </Routes>,
      { route: "/cart" },
    );
    await user.click(screen.getByRole("button", { name: "Increase quantity of Halo Lamp" }));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)[0].quantity).toBe(3);
    await user.click(screen.getByRole("button", { name: "Decrease quantity of Halo Lamp" }));
    await user.click(screen.getByRole("button", { name: /Remove/ }));
    expect(await screen.findByRole("heading", { name: "Your cart is empty" })).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("explains unavailable or limited items and fixes the cart on request", async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify([stored]));
    mockApi(
      base({
        "POST /api/v1/cart/validate": () => ({
          body: {
            pricing: {
              ...pricingFor([{ variantId: 31, unitPriceCents: 14800, quantity: 1, name: "Halo Lamp" }]),
              issues: [{ variantId: 31, code: "insufficient_stock", message: "Only 1 of Halo Lamp (Sand) left.", available: 1 }],
            },
          },
        }),
      }),
    );
    renderApp(
      <Routes>
        <Route path="/cart" element={<CartPage />} />
      </Routes>,
      { route: "/cart" },
    );
    expect(await screen.findByText("Only 1 of Halo Lamp (Sand) left.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Update my cart" }));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)[0].quantity).toBe(1);
  });

  it("falls back to an estimate when pricing cannot be confirmed", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([stored]));
    mockApi(base({ "POST /api/v1/cart/validate": () => ({ status: 500, body: { error: { code: "internal_error", message: "Something went wrong on our side." } } }) }));
    renderApp(
      <Routes>
        <Route path="/cart" element={<CartPage />} />
      </Routes>,
      { route: "/cart" },
    );
    expect(await screen.findByText(/Prices shown are estimates/)).toBeInTheDocument();
    expect(screen.getByText("Estimated subtotal")).toBeInTheDocument();
  });

  it("opens as an accessible dialog, closes with Escape, and returns focus", async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify([stored]));
    mockApi(base());
    renderApp(<OpenDrawerButton />);
    const opener = screen.getByRole("button", { name: "Open cart" });
    await user.click(opener);
    const dialog = await screen.findByRole("dialog", { name: /Your cart \(2\)/ });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("link", { name: "Checkout" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it("shows the empty drawer for a new visitor", async () => {
    const user = userEvent.setup();
    mockApi(base());
    renderApp(<OpenDrawerButton />);
    await user.click(screen.getByRole("button", { name: "Open cart" }));
    expect(await screen.findByText("Your cart is empty")).toBeInTheDocument();
  });
});
