import type { ProductQuery } from "../../lib/api";
import { centsToDollarInput, parseDollarsToCents } from "../../lib/money";
import type { SortKey } from "../../lib/types";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "relevance", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

export const PAGE_SIZE = 12;

const SORTS = new Set<string>(SORT_OPTIONS.map((o) => o.value));

/** URL search params are the single source of truth for the shop's filters. Invalid values are ignored. */
export function queryFromParams(params: URLSearchParams, categoryFromPath?: string): ProductQuery {
  const query: ProductQuery = { pageSize: PAGE_SIZE };
  const q = params.get("q")?.trim();
  if (q) query.q = q.slice(0, 100);
  const category = categoryFromPath ?? params.get("category") ?? undefined;
  if (category && /^[a-z0-9-]+$/.test(category)) query.category = category;
  const min = parseDollarsToCents(params.get("min") ?? "");
  const max = parseDollarsToCents(params.get("max") ?? "");
  if (min !== null) query.minPriceCents = min;
  if (max !== null) query.maxPriceCents = max;
  if (params.get("stock") === "1") query.inStock = true;
  const sort = params.get("sort");
  if (sort && SORTS.has(sort)) query.sort = sort as SortKey;
  const page = Number(params.get("page"));
  if (Number.isInteger(page) && page > 1) query.page = page;
  return query;
}

export interface FilterState {
  q?: string;
  min?: string;
  max?: string;
  stock?: boolean;
  sort?: SortKey;
  page?: number;
}

/** Builds the URL search string for a filter change. Changing a filter resets to page 1. */
export function paramsFromState(state: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.min && parseDollarsToCents(state.min) !== null) params.set("min", state.min);
  if (state.max && parseDollarsToCents(state.max) !== null) params.set("max", state.max);
  if (state.stock) params.set("stock", "1");
  if (state.sort && state.sort !== "relevance") params.set("sort", state.sort);
  if (state.page && state.page > 1) params.set("page", String(state.page));
  return params;
}

export function stateFromQuery(query: ProductQuery): FilterState {
  return {
    ...(query.q && { q: query.q }),
    ...(query.minPriceCents !== undefined && { min: centsToDollarInput(query.minPriceCents) }),
    ...(query.maxPriceCents !== undefined && { max: centsToDollarInput(query.maxPriceCents) }),
    ...(query.inStock && { stock: true }),
    ...(query.sort && { sort: query.sort }),
    ...(query.page && { page: query.page }),
  };
}
