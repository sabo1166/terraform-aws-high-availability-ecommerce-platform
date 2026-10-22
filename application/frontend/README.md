# Oriel storefront

React 19 + TypeScript + Vite single-page app for the Oriel demo store. It talks to the backend API on the same origin (`/api/v1/...`).

## Brand and audience (design direction)

Oriel is a fictional home-goods brand ("oriel" is a bay window, hence the arched-window mark). The audience is design-conscious adults furnishing a home who value calm, natural materials over novelty. The look is editorial and warm: paper background (`#f7f3ec`), deep ink (`#1d1a17`), one clay accent (`#a8451f`), serif headlines (system "Iowan Old Style"/Palatino/Georgia stack) over a system sans body, generous whitespace, soft shadows. No external fonts or image files are loaded: product imagery is original procedural SVG artwork (`ProductArt`), and the hero uses a procedurally lit 3D scene. Copy never claims real customers, reviews, sales figures, or delivery guarantees; policies are labelled as demo.

## Commands

```powershell
npm ci
npm run dev        # http://localhost:5173, proxies /api and /healthz to http://localhost:3000
npm test           # Vitest + Testing Library (jsdom)
npm run build      # type check, then production bundle in dist/
npm run preview    # serves dist/ on :4173 with the same proxy
```

Run the backend first (`application/backend`, `npm run dev`) to have data. Optional `VITE_API_BASE_URL` points the browser at a different API origin (then the backend's `CORS_ORIGINS` must list this origin); leave it unset for same-origin deployments.

## Structure

`src/features/` holds `home`, `catalog` (shop, product page, filters), `cart` (state, drawer, page), `checkout` (form, confirmation, order lookup), `account`, `admin`. `src/components/` has the layout, logo, procedural product art, error boundary, and scroll-reveal helper. `src/lib/` has the typed API client, money helpers, and an abortable `useAsync` hook. `deploy/nginx.conf.template` is the web-server template for the AWS frontend instances.

## Behaviour worth knowing

- Cart state is persisted in `localStorage` (validated on load; corrupt data is discarded), and every change is re-priced by `POST /cart/validate`. The browser's prices are display snapshots only; checkout sends variant ids and quantities and the server decides prices and stock.
- Filters, search, sort, and pagination live in the URL, so pages are linkable and back/forward works.
- Checkout validates on the client (Zod) and again on the server; server field errors are mapped back onto the form. A 409 `cart_changed` shows what changed and offers "Update my cart". Payment is a demo and no card details are ever requested.
- Account and admin pages call protected endpoints; the UI hides admin features from non-admins, but the server enforces access.
- Accessibility: skip link, landmarks, labelled controls, visible focus, `aria-live` announcements for cart changes, focus-trapped cart dialog with Escape and focus return, `aria-invalid` and error text on fields, `prefers-reduced-motion` honoured (animations and 3D motion are turned off).
- Performance: route-level code is in one 173 kB gzip bundle; the 3D hero (three.js, ~268 kB gzip) loads lazily and only when WebGL works, with a static illustration otherwise and on error.

## What is and is not verified

- **Unit/component tests:** `tsc`, 53 Vitest tests (cart logic and persistence, money, URL filters, checkout validation, shop/product/cart/checkout flows with a mocked API, access guards, sign-out, WebGL fallback), and the production build.
- **Real browser (headless Google Chrome 155 on Windows, driven over the DevTools protocol):** `npm run e2e` runs 57 checks against the built storefront and the real backend (memory store): home and the WebGL hero, keyboard (skip link first, visible focus, cart dialog focus trap, Escape and focus return), shop discovery (category, sort, search, pagination, empty state, clear filters), product options and stock messages, cart drawer and persistence, checkout validation and order placement, confirmation after refresh, inventory decrease, mobile layout at 390 px (no horizontal scroll, menu, tap targets), reduced motion, customer registration, sign-out, wrong password, customer blocked from admin (UI and API), admin stock and order-status edits, blocked-API error and retry. All 57 passed on the last run; screenshots were reviewed by eye (desktop home, shop, product, cart drawer, checkout, admin; mobile home and menu).
- Defects found by the browser run and fixed: focus was moved to `<main>` on first load (the first Tab skipped the skip link and header); signing out landed on the login page; mobile header search collapsed to an empty sliver; icon buttons could shrink below tap size; hero headline wrapped with a stranded "for"; the 3D vase looked faceted; a deprecated shadow-map type logged a three.js warning.
- **Remaining console output:** `THREE.Clock: This module has been deprecated` is emitted by `@react-three/fiber` itself and is not fixed by this project. The e2e script reports it but does not count it. Test-induced 401/403 log lines are also not counted.
- **Not verified:** Firefox, Safari, real mobile devices, touch gestures, screen readers, colour-contrast measurement, performance on slow devices (headless Chrome used software WebGL), and the Report-Only CSP in the Nginx template (it was not applied; the e2e run uses `vite preview`).

### Running the browser checks

```powershell
# terminal 1 (backend with a seeded admin you choose; memory store)
cd application/backend; npm ci; npm run build
$env:CORS_ORIGINS="http://localhost:4173"; $env:SEED_ADMIN_EMAIL="admin@example.test"; $env:SEED_ADMIN_PASSWORD="<your own value>"; node dist/server.js
# terminal 2 (production build of the storefront)
cd application/frontend; npm ci; npm run build; npm run preview
# terminal 3
cd application/frontend; $env:ADMIN_EMAIL="admin@example.test"; $env:ADMIN_PASSWORD="<same value>"; npm run e2e
```

Set `CHROME_PATH` if Chrome is not at `C:\Program Files\Google\Chrome\Application\chrome.exe`. The script needs no npm packages (it uses Node's built-in `WebSocket` and `fetch`).
