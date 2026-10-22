import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { formatMoney, parseDollarsToCents } from "../../lib/money";
import type { Category, SortKey } from "../../lib/types";
import { useAsync } from "../../lib/useAsync";
import { SORT_OPTIONS, paramsFromState, queryFromParams, stateFromQuery } from "./filters";
import { ProductCard, ProductCardSkeleton } from "./ProductCard";

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      {pages.map((n) => (
        <button
          key={n}
          type="button"
          className={`btn btn-sm ${n === page ? "btn-dark" : "btn-ghost"}`}
          aria-current={n === page ? "page" : undefined}
          aria-label={`Page ${n}`}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </nav>
  );
}

export function ShopPage() {
  const { category: categoryParam } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const query = queryFromParams(params, categoryParam);
  const state = stateFromQuery(query);
  const key = JSON.stringify(query);

  const products = useAsync((signal) => api.products(query, signal), `products:${key}`);
  const categories = useAsync((signal) => api.categories(signal), "categories");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [min, setMin] = useState(state.min ?? "");
  const [max, setMax] = useState(state.max ?? "");
  const [priceError, setPriceError] = useState("");

  // Keep the price inputs in step with the URL (back/forward, "clear filters").
  useEffect(() => {
    setMin(state.min ?? "");
    setMax(state.max ?? "");
    setPriceError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.min, state.max]);

  const category: Category | undefined = categories.data?.categories.find((c) => c.slug === query.category);
  const title = query.q ? `Results for â€œ${query.q}â€` : (category?.name ?? "All products");

  const update = (patch: Partial<typeof state>) => {
    setParams(paramsFromState({ ...state, page: 1, ...patch }), { replace: false });
  };
  const goToPage = (page: number) => {
    setParams(paramsFromState({ ...state, page }));
    window.scrollTo({ top: 0 });
  };

  const applyPrice = (event: FormEvent) => {
    event.preventDefault();
    const lo = min ? parseDollarsToCents(min) : null;
    const hi = max ? parseDollarsToCents(max) : null;
    if ((min && lo === null) || (max && hi === null)) {
      setPriceError("Enter prices as numbers, like 25 or 24.50.");
      return;
    }
    if (lo !== null && hi !== null && lo > hi) {
      setPriceError("The minimum price can't be higher than the maximum.");
      return;
    }
    setPriceError("");
    update({ min, max });
  };

  const clearAll = () => navigate("/shop");
  const facets = products.data?.facets;
  const categoryLinkSearch = (slug: string) => {
    const next = paramsFromState({ ...state, page: 1 }).toString();
    return { pathname: `/shop/${slug}`, search: next ? `?${next}` : "" };
  };
  const filtersActive = Boolean(query.q || query.minPriceCents !== undefined || query.maxPriceCents !== undefined || query.inStock || query.category);

  return (
    <div className="container">
      <div className="page-head">
        <p className="breadcrumbs">
          <Link to="/">Home</Link> / <Link to="/shop">Shop</Link>
          {category && <> / {category.name}</>}
        </p>
        <h1 style={{ marginBottom: 8 }}>{title}</h1>
        {category && !query.q && <p className="lede">{category.description}</p>}
      </div>

      <div className="shop-layout">
        <aside aria-label="Filters">
          <button
            type="button"
            className="btn btn-ghost btn-sm filter-toggle"
            aria-expanded={filtersOpen}
            aria-controls="filters"
            onClick={() => setFiltersOpen((open) => !open)}
            style={{ marginBottom: 12 }}
          >
            {filtersOpen ? "Hide filters" : "Show filters"}
          </button>
          <div id="filters" className="filters" data-collapsed={!filtersOpen}>
            <fieldset>
              <legend>Category</legend>
              <div style={{ display: "grid", gap: 6 }}>
                <Link to={{ pathname: "/shop", search: paramsFromState({ ...state, page: 1 }).toString() }} aria-current={!query.category ? "true" : undefined} style={{ fontWeight: !query.category ? 700 : 400 }}>
                  All products
                </Link>
                {(categories.data?.categories ?? []).map((c) => {
                  const count = facets?.categories.find((f) => f.slug === c.slug)?.count;
                  return (
                    <Link key={c.slug} to={categoryLinkSearch(c.slug)} aria-current={query.category === c.slug ? "true" : undefined} style={{ fontWeight: query.category === c.slug ? 700 : 400 }}>
                      {c.name}
                      {count !== undefined && <span className="card-meta"> ({count})</span>}
                    </Link>
                  );
                })}
              </div>
            </fieldset>

            <form onSubmit={applyPrice} noValidate>
              <fieldset>
                <legend>Price (USD)</legend>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor="price-min" className="sr-only">Minimum price</label>
                    <input id="price-min" className="input" inputMode="decimal" placeholder={facets ? String(Math.floor(facets.priceMinCents / 100)) : "Min"} value={min} onChange={(e) => setMin(e.target.value)} aria-invalid={Boolean(priceError)} aria-describedby={priceError ? "price-error" : undefined} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor="price-max" className="sr-only">Maximum price</label>
                    <input id="price-max" className="input" inputMode="decimal" placeholder={facets ? String(Math.ceil(facets.priceMaxCents / 100)) : "Max"} value={max} onChange={(e) => setMax(e.target.value)} aria-invalid={Boolean(priceError)} aria-describedby={priceError ? "price-error" : undefined} />
                  </div>
                </div>
                {priceError && <p id="price-error" className="field-error" role="alert">{priceError}</p>}
                <button type="submit" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}>Apply price</button>
              </fieldset>
            </form>

            <label className="check">
              <input type="checkbox" checked={Boolean(state.stock)} onChange={(e) => update({ stock: e.target.checked })} />
              In stock only
            </label>

            {filtersActive && (
              <button type="button" className="link-btn" onClick={clearAll} style={{ textAlign: "left" }}>
                Clear all filters
              </button>
            )}
          </div>
        </aside>

        <section aria-label="Products">
          <div className="toolbar">
            <p className="card-meta" role="status" aria-live="polite" style={{ margin: 0 }}>
              {products.loading ? "Loading productsâ€¦" : products.data ? `${products.data.total} ${products.data.total === 1 ? "product" : "products"}` : ""}
            </p>
            <div>
              <label htmlFor="sort" className="card-meta" style={{ marginRight: 8 }}>Sort by</label>
              <select id="sort" className="select" style={{ width: "auto" }} value={state.sort ?? "relevance"} onChange={(e) => update({ sort: e.target.value as SortKey })}>
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {products.error ? (
            <div className="alert alert-error" role="alert">
              <strong>We couldn't load the products.</strong> {products.error.message}{" "}
              <button type="button" className="link-btn" onClick={products.reload}>Try again</button>
            </div>
          ) : products.loading && !products.data ? (
            <div className="grid grid-products" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => <ProductCardSkeleton key={i} />)}
            </div>
          ) : products.data && products.data.items.length === 0 ? (
            <div className="empty">
              <h2 style={{ fontSize: "1.5rem" }}>{query.q ? `Nothing matched â€œ${query.q}â€` : "No products match these filters"}</h2>
              <p className="hint">Try a different search, widen the price range, or remove a filter.</p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-dark" onClick={clearAll}>Clear filters</button>
                <Link className="btn btn-ghost" to="/shop">Browse everything</Link>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-products">
                {products.data?.items.map((product) => <ProductCard key={product.id} product={product} />)}
              </div>
              {products.data && <Pagination page={products.data.page} totalPages={products.data.totalPages} onChange={goToPage} />}
            </>
          )}
          {facets && !products.error && products.data && products.data.total > 0 && (
            <p className="hint" style={{ marginTop: 24 }}>
              Prices in the shop range from {formatMoney(facets.priceMinCents)} to {formatMoney(facets.priceMaxCents)}.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
