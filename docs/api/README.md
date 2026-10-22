# Oriel API reference (v1)

REST/JSON API served by `application/backend` (Fastify, TypeScript, Zod). Base path `/api/v1`; health endpoints live at the root. Status: implemented and tested with the in-memory store and `app.inject`; the MySQL store has not been run against a real database in this repository's local environment (see `application/backend/README.md`).

## Conventions

- JSON in and out. State-changing requests need `Content-Type: application/json` and, when the browser sends an `Origin` header, an origin listed in `CORS_ORIGINS`.
- **Money** is always integer cents (`priceCents`, `totalCents`), currency `USD`.
- **Errors** share one shape: `{"error": {"code", "message", "details"?, "requestId"}}`. `validation_error` (400) carries `details: [{path, message}]`. Other codes: `unauthenticated` 401, `forbidden` 403, `forbidden_origin` 403, `not_found` 404, `cart_changed`/`empty_cart`/`email_taken`/`invalid_transition`/`duplicate` 409, `rate_limited` 429, `internal_error` 500.
- Every response has an `x-request-id` header (a safe incoming `x-request-id` is reused).
- **Auth** is a signed session cookie (`oriel_session`: HttpOnly, SameSite=Lax, `Secure` when `COOKIE_SECURE=true`, 7 days). Roles are re-read from the database on every request.
- **Rate limits** (per client IP): 300 requests/minute overall; 10/minute for register, login, and order lookup; 20/minute for checkout.

## Health

| Method and path | Purpose |
| --- | --- |
| `GET /healthz` | Liveness. Never touches the database. Recommended ALB target group health check path. |
| `GET /` | Same as liveness; answers the ALB module's default health-check path `/`. |
| `GET /readyz` | Readiness. Pings the store (2 s timeout); `503 {"status":"unavailable"}` without internals on failure. |

## Catalogue (public)

| Method and path | Notes |
| --- | --- |
| `GET /api/v1/categories` | Categories with `productCount`. |
| `GET /api/v1/products` | Query: `q`, `category`, `minPriceCents`, `maxPriceCents`, `inStock=true`, `sort=relevance\|price_asc\|price_desc\|newest`, `page`, `pageSize` (1-48, default 12). Returns `items`, `total`, `page`, `pageSize`, `totalPages`, `facets` (category counts, price bounds). |
| `GET /api/v1/featured` | Up to 8 featured products. |
| `GET /api/v1/products/:slug` | `{product, related}`; 404 for unknown or inactive products. |

## Cart and checkout (public)

| Method and path | Notes |
| --- | --- |
| `POST /api/v1/cart/validate` | Body `{items:[{variantId, quantity}]}` (1-50 items). Returns server `pricing`: `lines`, `issues` (`unavailable`, `out_of_stock`, `insufficient_stock`, `quantity_capped`), `subtotalCents`, `shippingCents`, `totalCents`. Prices come only from the database. |
| `POST /api/v1/checkout` | Body: `items`, `email`, `customerName`, `address{line1,line2?,city,region,postalCode,country(2)}`, `paymentMethod:"demo"`. Locks the variant rows, re-prices, decrements stock, and creates the order in one transaction. `201 {order}`; `409 cart_changed` with the corrected `details.pricing` if anything differs. Unknown fields (for example a price) are ignored and never stored, and any paymentMethod other than demo is rejected; no card data is accepted. A signed-in customer's id is attached. |
| `GET /api/v1/orders/lookup?reference&email` | Guest lookup; both must match, otherwise 404. |

Delivery policy (demo): flat 600 cents, free at a subtotal of 7,500 cents or more. Maximum 10 per variant per order.

## Auth and account

| Method and path | Notes |
| --- | --- |
| `POST /api/v1/auth/register` | `{name, email, password (10-128 chars)}` creates a **customer** only; sets the session cookie. 409 `email_taken` if registered. |
| `POST /api/v1/auth/login` | `{email, password}`. Generic `invalid_credentials` message for unknown email or wrong password (constant-time-ish). |
| `POST /api/v1/auth/logout` | Clears the cookie. |
| `GET /api/v1/auth/me` | `{user}` or `{user:null}`. |
| `GET /api/v1/account/orders` | The signed-in customer's orders (401 otherwise). |

## Admin (role `admin`, enforced on the server for every call; 401 anonymous, 403 customers)

| Method and path | Notes |
| --- | --- |
| `GET /api/v1/admin/products` | All products including inactive. |
| `POST /api/v1/admin/products` | Creates a product with variants (`priceCents`, `stock` integers). 409 on duplicate slug/SKU. |
| `PATCH /api/v1/admin/products/:id` | Any of `name`, `description`, `featured`, `active`. |
| `PATCH /api/v1/admin/variants/:id/stock` | `{stock}`. |
| `GET /api/v1/admin/orders` | Latest 200 orders. |
| `PATCH /api/v1/admin/orders/:reference/status` | Allowed: `placed`â†’`packed`/`cancelled`, `packed`â†’`shipped`/`cancelled`. Cancelling returns stock. Others are 409. |

Admin accounts are never created through the API. They come from the seed command when `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are provided.
