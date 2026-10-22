import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { makeProduct, mockApi, noUser, pricingFor, renderApp } from "../../test/utils";
import type { ProductPage as ProductPageData } from "../../lib/types";
import { ProductPage } from "./ProductPage";
import { ShopPage } from "./ShopPage";

const categories = {
  categories: [
    { id: 1, slug: "ceramics", name: "Ceramics", description: "Vases and bowls.", productCount: 2 },
    { id: 2, slug: "lighting", name: "Lighting", description: "Lamps.", productCount: 1 },
  ],
};

const page = (items: ProductPageData["items"], over: Partial<ProductPageData> = {}): ProductPageData => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 12,
  totalPages: 1,
  facets: { categories: [{ slug: "ceramics", count: 2 }, { slug: "lighting", count: 1 }], priceMinCents: 1800, priceMaxCents: 14800 },
  ...over,
});

const shopRoutes = (data: ProductPageData | (() => ProductPageData)) => ({
  "GET /api/v1/auth/me": noUser,
  "GET /api/v1/categories": () => ({ body: categories }),
  "GET /api/v1/products": () => ({ body: typeof data === "function" ? data() : data }),
  "POST /api/v1/cart/validate": () => ({ body: { pricing: pricingFor([]) } }),
});

function renderShop(route = "/shop") {
  return renderApp(
    <Routes>
      <Route path="/shop" element={<ShopPage />} />
      <Route path="/shop/:category" element={<ShopPage />} />
    </Routes>,
    { route },
  );
}

describe("ShopPage", () => {
  it("lists products with prices and category counts", async () => {
    mockApi(shopRoutes(page([makeProduct({ id: 1, name: "Arc Vase" }), makeProduct({ id: 2, name: "Pebble Bowl" })])));
    renderShop();
    expect(await screen.findByRole("link", { name: "Arc Vase" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pebble Bowl" })).toBeInTheDocument();
    expect(screen.getAllByText("$64.00").length).toBeGreaterThan(0);
    expect(await screen.findByText("2 products")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ceramics/ })).toBeInTheDocument();
  });

  it("sends the search, category, price, stock, and sort filters to the API", async () => {
    const { calls } = mockApi(shopRoutes(page([makeProduct({ id: 1 })])));
    renderShop("/shop/ceramics?q=vase&min=20&max=90&stock=1&sort=price_asc");
    await screen.findByRole("link", { name: "Product 1" });
    const request = calls.find((c) => c.key === "GET /api/v1/products")!;
    expect(Object.fromEntries(request.url.searchParams)).toMatchObject({
      q: "vase",
      category: "ceramics",
      minPriceCents: "2000",
      maxPriceCents: "9000",
      inStock: "true",
      sort: "price_asc",
    });
  });

  it("re-queries when the sort order or stock filter changes", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi(shopRoutes(page([makeProduct({ id: 1 })])));
    renderShop();
    await screen.findByRole("link", { name: "Product 1" });
    await user.selectOptions(screen.getByLabelText("Sort by"), "price_desc");
    await waitFor(() => expect(calls.some((c) => c.url.searchParams.get("sort") === "price_desc")).toBe(true));
    await user.click(screen.getByLabelText("In stock only"));
    await waitFor(() => expect(calls.some((c) => c.url.searchParams.get("inStock") === "true")).toBe(true));
  });

  it("validates the price range before searching", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi(shopRoutes(page([makeProduct({ id: 1 })])));
    renderShop();
    await screen.findByRole("link", { name: "Product 1" });
    const before = calls.length;
    await user.type(screen.getByLabelText("Minimum price"), "90");
    await user.type(screen.getByLabelText("Maximum price"), "20");
    await user.click(screen.getByRole("button", { name: "Apply price" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("can't be higher");
    expect(calls.length).toBe(before);
  });

  it("shows a helpful empty state and lets the shopper clear filters", async () => {
    const user = userEvent.setup();
    mockApi(shopRoutes(page([], { total: 0 })));
    renderShop("/shop?q=zebra");
    expect(await screen.findByRole("heading", { name: /Nothing matched â€œzebraâ€/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(screen.queryByText(/Nothing matched/)).not.toBeInTheDocument());
  });

  it("reports API failures honestly and retries", async () => {
    const user = userEvent.setup();
    let fail = true;
    mockApi({
      ...shopRoutes(page([makeProduct({ id: 1 })])),
      "GET /api/v1/products": () =>
        fail
          ? { status: 500, body: { error: { code: "internal_error", message: "Something went wrong on our side. Please try again." } } }
          : { body: page([makeProduct({ id: 1 })]) },
    });
    renderShop();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load the products");
    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Product 1" })).toBeInTheDocument();
  });

  it("paginates", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi(shopRoutes(() => page([makeProduct({ id: 1 })], { total: 25, totalPages: 3 })));
    renderShop();
    await screen.findByRole("link", { name: "Product 1" });
    await user.click(screen.getByRole("button", { name: "Page 2" }));
    await waitFor(() => expect(calls.some((c) => c.url.searchParams.get("page") === "2")).toBe(true));
  });
});

describe("ProductPage", () => {
  const two = makeProduct({
    id: 3,
    name: "Halo Lamp",
    variants: [
      { id: 31, productId: 3, sku: "H-1", label: "Sand", options: {}, priceCents: 14800, stock: 8 },
      { id: 32, productId: 3, sku: "H-2", label: "Charcoal", options: {}, priceCents: 15800, stock: 0 },
      { id: 33, productId: 3, sku: "H-3", label: "Moss", options: {}, priceCents: 16800, stock: 3 },
    ],
  });
  const routes = (product = two) => ({
    "GET /api/v1/auth/me": noUser,
    "GET /api/v1/categories": () => ({ body: categories }),
    "GET /api/v1/products/halo-lamp": () => ({ body: { product, related: [makeProduct({ id: 9, name: "Related Bowl" })] } }),
    "POST /api/v1/cart/validate": () => ({ body: { pricing: pricingFor([{ variantId: 31, unitPriceCents: 14800, quantity: 1 }]) } }),
  });
  const renderProduct = () =>
    renderApp(
      <Routes>
        <Route path="/products/:slug" element={<ProductPage />} />
      </Routes>,
      { route: "/products/halo-lamp" },
    );

  it("renders details, stock, related products, and disables sold-out options", async () => {
    mockApi({ ...routes(), "GET /api/v1/products/halo-lamp": () => ({ body: { product: { ...two, slug: "halo-lamp" }, related: [makeProduct({ id: 9, name: "Related Bowl" })] } }) });
    renderProduct();
    expect(await screen.findByRole("heading", { level: 1, name: "Halo Lamp" })).toBeInTheDocument();
    expect(screen.getByText("In stock")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Charcoal/ })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Related Bowl" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Details" })).toBeInTheDocument();
  });

  it("updates price and stock message when the option changes, and caps quantity at stock", async () => {
    const user = userEvent.setup();
    mockApi({ ...routes(), "GET /api/v1/products/halo-lamp": () => ({ body: { product: { ...two, slug: "halo-lamp" }, related: [] } }) });
    renderProduct();
    await screen.findByRole("heading", { level: 1, name: "Halo Lamp" });
    await user.click(screen.getByRole("radio", { name: "Moss" }));
    expect(screen.getByText("Only 3 left")).toBeInTheDocument();
    expect(screen.getAllByText("$168.00").length).toBeGreaterThan(0);
    const increase = screen.getByRole("button", { name: "Increase quantity" });
    await user.click(increase);
    await user.click(increase);
    expect(increase).toBeDisabled();
    expect(screen.getByRole("group", { name: "Quantity" })).toHaveTextContent("3");
  });

  it("adds the selected option to the cart, opens the drawer, and confirms", async () => {
    const user = userEvent.setup();
    mockApi({ ...routes(), "GET /api/v1/products/halo-lamp": () => ({ body: { product: { ...two, slug: "halo-lamp" }, related: [] } }) });
    renderProduct();
    await screen.findByRole("heading", { level: 1, name: "Halo Lamp" });
    await user.click(screen.getByRole("button", { name: "Add to cart" }));
    const dialog = await screen.findByRole("dialog", { name: /Your cart/ });
    expect(within(dialog).getByRole("link", { name: "Halo Lamp" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("oriel.cart.v1")!)[0]).toMatchObject({ variantId: 31, quantity: 1 });
    expect(screen.getAllByText(/Halo Lamp.*added to your cart/).length).toBeGreaterThan(0);
  });

  it("shows sold out and no add button when nothing is in stock", async () => {
    const soldOut = makeProduct({ id: 3, slug: "halo-lamp", name: "Halo Lamp", variants: [{ id: 31, productId: 3, sku: "H-1", label: "Sand", options: {}, priceCents: 14800, stock: 0 }] });
    mockApi({ ...routes(soldOut), "GET /api/v1/products/halo-lamp": () => ({ body: { product: soldOut, related: [] } }) });
    renderProduct();
    expect(await screen.findByText("Out of stock")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sold out" })).toBeDisabled();
  });

  it("shows a friendly not-found state", async () => {
    mockApi({
      "GET /api/v1/auth/me": noUser,
      "GET /api/v1/categories": () => ({ body: categories }),
      "GET /api/v1/products/halo-lamp": () => ({ status: 404, body: { error: { code: "not_found", message: "We couldn't find that product." } } }),
    });
    renderProduct();
    expect(await screen.findByRole("heading", { name: "We couldn't find that product" })).toBeInTheDocument();
  });
});
