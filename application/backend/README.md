# Oriel backend

Fastify + TypeScript + Zod REST API for the Oriel demo store, with an in-memory store (local development, tests) and a MySQL store (AWS RDS). API reference: `docs/api/README.md`.

## Layout

| Path | Role |
| --- | --- |
| `src/server.ts` | Process entry: config, store, graceful shutdown. |
| `src/app.ts` | Fastify setup: Helmet, CORS, cookies, JWT, rate limiting, origin check, request ids, error shape. |
| `src/routes/` | HTTP routes (`health`, `catalog`, `shop`, `auth`, `admin`). |
| `src/services/` | Business rules (`orders`: cart validation, checkout, status changes; `passwords`). |
| `src/domain/` | Pure logic: types, integer-cent pricing, catalogue search/filter/sort. |
| `src/store/` | `Store` interface with `MemoryStore` and `MysqlStore`. |
| `src/db/` | SQL migrations (`migrations/*.sql`), migration runner and CLI. |
| `src/seed/` | Demo catalogue and an idempotent seeder. |
| `tests/` | Vitest suites. |
| `deploy/oriel-backend.service` | systemd unit template (not applied by any automation). |

## Commands

```powershell
npm ci
npm run dev          # tsx watch, reads .env if present
npm run typecheck
npm test             # unit and API tests (MemoryStore); MySQL contract tests run only when MYSQL_TEST_* is set
npm run build        # compiles to dist/ and copies the SQL migrations
npm start            # node dist/server.js
npm run migrate      # applies pending SQL migrations (STORE=mysql)
npm run seed         # seeds categories, products, and an optional admin (STORE=mysql)
```

Quick local start without a database: copy `.env.example` to `.env`, keep `STORE=memory`, and run `npm run dev`. The demo catalogue is seeded in memory at startup; it resets on restart. To also get an admin account locally, set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` to values you choose (there are no default credentials).

## Configuration

Validated with Zod at startup (`src/config.ts`); errors name the variable but never echo its value. See `.env.example` for placeholders. Production requires `STORE=mysql`, `JWT_SECRET` (32+ characters), `COOKIE_SECURE=true`, `CORS_ORIGINS`, and `DB_SSL_CA_PATH`; `DB_SSL_DISABLED` is rejected.

## Data model

`categories` â†’ `products` â†’ `variants` (price and stock live on the variant); `users` (role `customer` or `admin`); `orders` â†’ `order_items` (snapshots of name, label, and unit price at purchase). Money is `INT` cents. Stock has a `CHECK (stock >= 0)` constraint. See `src/db/migrations/001_init.sql`. Migrations are applied in filename order and recorded in `schema_migrations`, guarded by a MySQL advisory lock. MySQL DDL auto-commits, so a failed migration can be partial: keep migrations small and fix forward.

## Security notes

- Prices, stock, and roles are decided on the server. The browser sends variant ids and quantities only.
- Checkout runs in a transaction with `SELECT ... FOR UPDATE` on the variant rows (in id order), re-prices from those rows, and refuses (409) instead of silently adjusting.
- Passwords: scrypt with a per-password salt; login runs a hash comparison even for unknown emails.
- Session: signed JWT in an HttpOnly, SameSite=Lax cookie; the role is re-read from the database per request. State-changing requests with a foreign `Origin` are rejected.
- All SQL uses parameter placeholders; no string-built values.
- Logs redact cookies and authorization headers; every request has an id.
- Payment is a demo: no card data is accepted or stored.

## What is and is not verified

- Verified locally: typecheck, build, all `MemoryStore` and API tests (including authorization, validation, concurrent last-unit checkout, rate limiting), and an end-to-end HTTP smoke test of the built server.
- **Not verified here:** `MysqlStore`, the migration runner, and the SQL schema have never run against a real MySQL server (no MySQL or running Docker on the development machine). The same contract tests are written to run against MySQL in CI (`application.yml`, MySQL 8.0 service container) but that workflow has not executed yet. Treat the MySQL path as untested until it has.
- Catalogue search/filter/sort loads all active products and filters in memory. That is fine for a demo-sized catalogue; move it into SQL before the catalogue grows.
- Not implemented: password reset, email verification, real payments, order emails, account deletion.
