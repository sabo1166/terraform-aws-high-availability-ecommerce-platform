# Application architecture

Applies to `application/frontend` and `application/backend`. Infrastructure is described in the Terraform modules; deployment status in `docs/runbooks/application-deployment.md`.

```
Browser -> CloudFront (HTTPS, WAF) -> public ALB :80 -> frontend Nginx :80
        static files (SPA) and /healthz served locally
        /api/*  -> internal ALB :80 -> backend Node.js (Fastify) :3000 -> RDS MySQL :3306
```

## Responsibilities

- **Frontend (React SPA, served by Nginx):** catalogue browsing, cart, checkout UI, account and admin screens. It holds no secrets and makes every call to a relative `/api/v1/...` path, so one origin serves site and API (cookies stay first-party; no CORS in production).
- **Backend (Fastify API):** the only component that touches the database. It decides prices, stock, and permissions.
- **Database (RDS MySQL):** catalogue, users, orders. Reached only from the backend security group.

## Key decisions

| Decision | Reason |
| --- | --- |
| Prices and stock are server-side; cart is client-held ids and quantities | The browser is untrusted. Checkout locks rows, re-prices, and refuses on any mismatch. |
| Money is integer cents everywhere | No floating-point rounding errors. |
| `Store` interface with memory and MySQL implementations | Same business logic and the same contract tests for both; local development works without a database. |
| Session cookie (HttpOnly, SameSite=Lax) with a database role lookup | JavaScript cannot read it; revoking admin takes effect immediately. |
| Liveness (`/healthz`) separate from readiness (`/readyz`) | A database outage must not cause the load balancer to replace healthy API instances. |
| Procedural SVG artwork and a procedural 3D scene | No licensed or external image assets; nothing to download or host. |
| In-memory catalogue filtering | Simple and correct for a demo-sized catalogue; revisit when it grows. |
| Demo payments only | No card data is requested, sent, or stored. |

## Data model

`categories` 1-n `products` 1-n `variants` (sku, label, options, `price_cents`, `stock`); `users` (`customer` or `admin`); `orders` 1-n `order_items` (name, label, unit price snapshots; nullable `variant_id` so products can be removed later). Order status flow: `placed` → `packed` → `shipped`, or `cancelled` from `placed`/`packed` (stock returns).

## Scaling and reliability notes

- Backend instances are stateless (JWT cookie, MySQL for data), so the Auto Scaling Group can add or replace them freely. Rate limits are per instance (in memory), so the effective limit grows with instance count.
- The MySQL pool is limited to 10 connections per instance; size RDS `max_connections` for the maximum number of backend instances.
- No caching layer: CloudFront caching is disabled in Terraform and the API sends no cache headers. Product pages hit the database on every request.
- Known gaps: no email delivery, password reset, payment provider, search index, image uploads, or background jobs.
