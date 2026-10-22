import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { STORAGE_KEY, type CartItem } from "../cart/cart";
import { mockApi, noUser, pricingFor, renderApp } from "../../test/utils";
import type { Order } from "../../lib/types";
import { CheckoutPage } from "./CheckoutPage";
import { ConfirmationPage } from "./OrderPages";

const item: CartItem = {
  variantId: 31,
  productSlug: "halo-lamp",
  productName: "Halo Lamp",
  variantLabel: "Sand",
  unitPriceCents: 14800,
  quantity: 1,
  art: { shape: "lamp", palette: ["#e8d6bd", "#b38b5d", "#fff6e6"] },
  maxStock: 8,
};

const order: Order = {
  id: 1,
  reference: "ORI-ABCD2345",
  email: "alex@example.test",
  customerName: "Alex Buyer",
  address: { line1: "1 Main St", line2: "", city: "Town", region: "ST", postalCode: "12345", country: "US" },
  status: "placed",
  currency: "USD",
  subtotalCents: 14800,
  shippingCents: 0,
  totalCents: 14800,
  paymentMethod: "demo",
  createdAt: "2026-01-01T00:00:00.000Z",
  items: [{ variantId: 31, productName: "Halo Lamp", variantLabel: "Sand", unitPriceCents: 14800, quantity: 1, lineTotalCents: 14800 }],
};

const routes = (extra = {}) => ({
  "GET /api/v1/auth/me": noUser,
  "POST /api/v1/cart/validate": () => ({ body: { pricing: pricingFor([{ variantId: 31, unitPriceCents: 14800, quantity: 1, name: "Halo Lamp" }]) } }),
  ...extra,
});

const renderCheckout = () =>
  renderApp(
    <Routes>
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/order/:reference" element={<ConfirmationPage />} />
    </Routes>,
    { route: "/checkout" },
  );

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Email"), "alex@example.test");
  await user.type(screen.getByLabelText("Full name"), "Alex Buyer");
  await user.type(screen.getByLabelText("Address"), "1 Main St");
  await user.type(screen.getByLabelText("City"), "Town");
  await user.type(screen.getByLabelText("State / region"), "ST");
  await user.type(screen.getByLabelText("Postal code"), "12345");
}

describe("CheckoutPage", () => {
  it("labels the payment as a demo and never asks for card details", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([item]));
    mockApi(routes());
    renderCheckout();
    expect(await screen.findByText(/No payment is taken and no card details are collected/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/card number/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/cvv|cvc|security code/i)).not.toBeInTheDocument();
  });

  it("shows an empty state when the cart is empty", () => {
    mockApi(routes());
    renderCheckout();
    expect(screen.getByRole("heading", { name: "Your cart is empty" })).toBeInTheDocument();
  });

  it("validates fields, focuses the first error, and does not call the API", async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify([item]));
    const { calls } = mockApi(routes());
    renderCheckout();
    await screen.findByText(/Demo checkout/);
    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: /Place demo order/ }));
    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(screen.getByText("Enter your full name")).toBeInTheDocument();
    expect(calls.some((c) => c.key === "POST /api/v1/checkout")).toBe(false);
  });

  it("places the order with only ids and quantities, clears the cart, and shows the confirmation", async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify([item]));
    const { calls } = mockApi(routes({ "POST /api/v1/checkout": () => ({ status: 201, body: { order } }) }));
    renderCheckout();
    await screen.findByText(/Demo checkout/);
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /Place demo order/ }));
    expect(await screen.findByRole("heading", { name: "Thank you, Alex" })).toBeInTheDocument();
    expect(screen.getByText("ORI-ABCD2345")).toBeInTheDocument();
    const request = calls.find((c) => c.key === "POST /api/v1/checkout")!;
    expect(request.body).toMatchObject({ items: [{ variantId: 31, quantity: 1 }], paymentMethod: "demo", email: "alex@example.test" });
    // No price, total, or card data is ever sent from the browser.
    expect(JSON.stringify(request.body)).not.toMatch(/price|total|card/i);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("explains a changed cart (409) and offers to update it", async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify([item]));
    mockApi(
      routes({
        "POST /api/v1/checkout": () => ({
          status: 409,
          body: {
            error: {
              code: "cart_changed",
              message: "Your cart changed. Please review it and try again.",
              details: { pricing: { issues: [{ variantId: 31, code: "out_of_stock", message: "Halo Lamp (Sand) is out of stock." }] } },
            },
          },
        }),
      }),
    );
    renderCheckout();
    await screen.findByText(/Demo checkout/);
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /Place demo order/ }));
    expect(await screen.findByText("Halo Lamp (Sand) is out of stock.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update my cart" })).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("maps server validation errors onto fields", async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify([item]));
    mockApi(
      routes({
        "POST /api/v1/checkout": () => ({
          status: 400,
          body: { error: { code: "validation_error", message: "Some of the information provided is not valid.", details: [{ path: "address.postalCode", message: "Enter a valid postal code" }] } },
        }),
      }),
    );
    renderCheckout();
    await screen.findByText(/Demo checkout/);
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /Place demo order/ }));
    expect(await screen.findByText("Enter a valid postal code")).toBeInTheDocument();
    expect(screen.getByLabelText("Postal code")).toHaveAttribute("aria-invalid", "true");
  });

  it("reports a network failure without losing the cart", async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify([item]));
    const { fetchMock } = mockApi(routes({ "POST /api/v1/checkout": () => ({ body: {} }) }));
    renderCheckout();
    await screen.findByText(/Demo checkout/);
    await fillForm(user);
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).includes("/checkout")) throw new TypeError("Failed to fetch");
      return original(input, init);
    });
    await user.click(screen.getByRole("button", { name: /Place demo order/ }));
    expect(await screen.findByText(/couldn't reach the store/)).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: /Place demo order/ })).toBeEnabled());
  });
});
