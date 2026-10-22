import { describe, expect, it } from "vitest";
import { centsToDollarInput, formatMoney, parseDollarsToCents } from "./money";
import { ApiError, productQueryString } from "./api";
import { paramsFromState, queryFromParams, stateFromQuery } from "../features/catalog/filters";
import { emptyCheckoutValues, fieldFromServerPath, validateCheckout } from "../features/checkout/checkoutSchema";

describe("money", () => {
  it("formats cents without float drift", () => {
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(6400)).toBe("$64.00");
    expect(formatMoney(1999 * 3 + 1)).toBe("$59.98");
  });

  it("parses dollar input into integer cents and rejects junk", () => {
    expect(parseDollarsToCents("12.5")).toBe(1250);
    expect(parseDollarsToCents("0.07")).toBe(7);
    expect(parseDollarsToCents(" 24 ")).toBe(2400);
    for (const bad of ["", "abc", "-5", "1.234", "1,000", "1e3"]) expect(parseDollarsToCents(bad), bad).toBeNull();
    expect(centsToDollarInput(2400)).toBe("24");
    expect(centsToDollarInput(2450)).toBe("24.50");
  });
});

describe("shop filters in the URL", () => {
  it("parses valid parameters and ignores invalid ones", () => {
    const query = queryFromParams(new URLSearchParams("q=lamp&min=20&max=abc&stock=1&sort=price_desc&page=3&category=BAD%20slug"));
    expect(query).toMatchObject({ q: "lamp", minPriceCents: 2000, inStock: true, sort: "price_desc", page: 3 });
    expect(query.maxPriceCents).toBeUndefined();
    expect(query.category).toBeUndefined();
    expect(queryFromParams(new URLSearchParams("sort=hax&page=-2")).sort).toBeUndefined();
  });

  it("prefers the category in the path", () => {
    expect(queryFromParams(new URLSearchParams("category=lighting"), "ceramics").category).toBe("ceramics");
  });

  it("round-trips state and drops defaults", () => {
    const state = stateFromQuery(queryFromParams(new URLSearchParams("q=vase&min=10&max=50&stock=1&sort=newest&page=2")));
    expect(paramsFromState(state).toString()).toBe("q=vase&min=10&max=50&stock=1&sort=newest&page=2");
    expect(paramsFromState({ sort: "relevance", page: 1 }).toString()).toBe("");
  });

  it("builds the API query string from a filter query", () => {
    expect(productQueryString({ q: "a b", category: "ceramics", minPriceCents: 500, inStock: true, sort: "price_asc", page: 2, pageSize: 12 })).toBe(
      "?q=a+b&category=ceramics&minPriceCents=500&inStock=true&sort=price_asc&page=2&pageSize=12",
    );
    expect(productQueryString({})).toBe("");
  });
});

describe("checkout validation", () => {
  const valid = { ...emptyCheckoutValues, email: "a@b.co", customerName: "Alex", line1: "1 Main St", city: "Town", region: "ST", postalCode: "12345" };

  it("accepts a complete form", () => {
    expect(validateCheckout(valid)).toEqual({});
  });

  it("reports each invalid field with a helpful message", () => {
    const errors = validateCheckout({ ...emptyCheckoutValues, email: "nope", postalCode: "!!" });
    expect(errors.email).toBe("Enter a valid email address");
    expect(errors.customerName).toBeTruthy();
    expect(errors.line1).toBeTruthy();
    expect(errors.postalCode).toBe("Enter a valid postal code");
    expect(errors.line2).toBeUndefined();
  });

  it("maps server field paths to form fields", () => {
    expect(fieldFromServerPath("address.postalCode")).toBe("postalCode");
    expect(fieldFromServerPath("email")).toBe("email");
    expect(fieldFromServerPath("items")).toBeUndefined();
  });
});

describe("ApiError", () => {
  it("exposes field errors only for validation errors", () => {
    const error = new ApiError(400, "validation_error", "Bad", [{ path: "email", message: "Enter a valid email" }]);
    expect(error.fieldErrors).toEqual({ email: "Enter a valid email" });
    expect(new ApiError(500, "internal_error", "Oops").fieldErrors).toEqual({});
  });
});
