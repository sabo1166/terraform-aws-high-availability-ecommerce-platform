import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Layout } from "../../components/Layout";
import { AdminPage } from "../admin/AdminPage";
import { AccountPage } from "../account/AccountPages";
import { makeProduct, mockApi, noUser, pricingFor, renderApp } from "../../test/utils";
import { HomePage } from "./HomePage";

const categories = { categories: [{ id: 1, slug: "ceramics", name: "Ceramics", description: "Vases and bowls.", productCount: 6 }] };
const baseRoutes = (extra = {}) => ({
  "GET /api/v1/auth/me": noUser,
  "GET /api/v1/categories": () => ({ body: categories }),
  "GET /api/v1/featured": () => ({ body: { items: [makeProduct({ id: 1, name: "Arc Vase" })] } }),
  "POST /api/v1/cart/validate": () => ({ body: { pricing: pricingFor([]) } }),
  ...extra,
});

const renderHome = (route = "/") =>
  renderApp(
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="shop" element={<p>Shop page</p>} />
        <Route path="shop/:category" element={<p>Category page</p>} />
        <Route path="account" element={<AccountPage />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>
    </Routes>,
    { route },
  );

describe("Home page and layout", () => {
  it("renders the brand, announcement, hero, featured products, and categories", async () => {
    mockApi(baseRoutes());
    renderHome();
    expect(screen.getByText(/Oriel is a demo store/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Quiet objects for considered homes" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Arc Vase" })).toBeInTheDocument();
    expect((await screen.findAllByRole("link", { name: /Ceramics/ })).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("link", { name: "Shop the collection" })).toHaveAttribute("href", "/shop");
  });

  it("falls back to a static illustration when WebGL is unavailable", async () => {
    mockApi(baseRoutes());
    // jsdom has no WebGL, so getContext returns null and the static stage is used.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    renderHome();
    expect(await screen.findByRole("img", { name: "Ceramic vase illustration" })).toBeInTheDocument();
  });

  it("has a skip link, a labelled search, and a cart button with an item count", async () => {
    mockApi(baseRoutes());
    renderHome();
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
    expect(screen.getByRole("search")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open cart, 0 items" })).toBeInTheDocument();
  });

  it("searches from the header", async () => {
    const user = userEvent.setup();
    mockApi(baseRoutes());
    renderHome();
    await user.type(screen.getByRole("searchbox", { name: "Search products" }), "lamp{Enter}");
    expect(await screen.findByText("Shop page")).toBeInTheDocument();
  });

  it("reports a failed featured request with a retry", async () => {
    mockApi(baseRoutes({ "GET /api/v1/featured": () => ({ status: 500, body: { error: { code: "internal_error", message: "Something went wrong on our side." } } }) }));
    renderHome();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("subscribes to the demo newsletter without sending anything", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi(baseRoutes());
    renderHome();
    await user.type(screen.getByLabelText("Email address"), "me@example.test");
    await user.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(await screen.findByText(/this is a demo/i)).toBeInTheDocument();
    expect(calls.some((c) => c.key.includes("newsletter"))).toBe(false);
  });
});

describe("Access control in the UI", () => {
  it("signing out returns to the home page, not the login page", async () => {
    const user = userEvent.setup();
    let signedIn = true;
    mockApi(
      baseRoutes({
        "GET /api/v1/auth/me": () => ({ body: { user: signedIn ? { id: 1, email: "c@example.test", name: "Casey Customer", role: "customer" } : null } }),
        "GET /api/v1/account/orders": () => ({ body: { orders: [] } }),
        "POST /api/v1/auth/logout": () => {
          signedIn = false;
          return { body: { ok: true } };
        },
      }),
    );
    renderHome("/account");
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Quiet objects for considered homes" })).toBeInTheDocument();
  });

  it("keeps the user signed in and says so when sign-out fails", async () => {
    const user = userEvent.setup();
    mockApi(
      baseRoutes({
        "GET /api/v1/auth/me": () => ({ body: { user: { id: 1, email: "c@example.test", name: "Casey Customer", role: "customer" } } }),
        "GET /api/v1/account/orders": () => ({ body: { orders: [] } }),
        "POST /api/v1/auth/logout": () => ({ status: 500, body: { error: { code: "internal_error", message: "Something went wrong on our side." } } }),
      }),
    );
    renderHome("/account");
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  });

  it("sends anonymous visitors from /account to sign in", async () => {
    mockApi(baseRoutes());
    renderApp(
      <Routes>
        <Route path="/account" element={<AccountPage />} />
        <Route path="/account/login" element={<p>Login page</p>} />
      </Routes>,
      { route: "/account" },
    );
    expect(await screen.findByText("Login page")).toBeInTheDocument();
  });

  it("shows customers a no-access message on /admin (the server enforces this too)", async () => {
    mockApi(baseRoutes({ "GET /api/v1/auth/me": () => ({ body: { user: { id: 1, email: "c@example.test", name: "Casey", role: "customer" } } }) }));
    renderApp(
      <Routes>
        <Route path="/admin" element={<AdminPage />} />
      </Routes>,
      { route: "/admin" },
    );
    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
  });
});

