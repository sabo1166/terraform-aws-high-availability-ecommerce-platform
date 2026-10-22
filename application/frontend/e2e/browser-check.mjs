// Real-browser smoke test for the Oriel storefront (desktop and mobile viewports, keyboard, cart, checkout,
// accounts, admin, failure handling). It needs the built frontend (npm run preview, port 4173) and the backend
// (port 3000, STORE=memory) running; see application/frontend/README.md for the exact commands.
// Env: BASE (default http://localhost:4173), OUT (screenshot folder), ADMIN_EMAIL, ADMIN_PASSWORD, CHROME_PATH.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { launch } from "./cdp.mjs";

const BASE = process.env.BASE ?? "http://localhost:4173";
const OUT = process.env.OUT ?? join(process.env.TEMP ?? "/tmp", "oriel-browser-check");
mkdirSync(OUT, { recursive: true });
const ADMIN = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? "  -> " + detail : ""}`);
};
const step = async (name, fn) => {
  try {
    await fn();
  } catch (error) {
    check(name, false, String(error.message ?? error).split("\n")[0]);
  }
};

const b = await launch();
const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
const byText = (tag, text) => `[...document.querySelectorAll(${JSON.stringify(tag)})].find(e => e.textContent.trim().startsWith(${JSON.stringify(text)}))`;
const byLabel = (label) => `(() => { const l=[...document.querySelectorAll('label')].find(x=>x.textContent.trim()===${JSON.stringify(label)}); return l && document.getElementById(l.htmlFor); })()`;
const fill = async (label, value) => {
  await b.click(byLabel(label));
  await b.evaluate(`${byLabel(label)}.select()`);
  await b.type(value);
};
// Known third-party deprecation emitted by @react-three/fiber itself (THREE.Clock); reported but not counted.
const KNOWN_THIRD_PARTY = [
  /THREE\.Clock: This module has been deprecated/,
  // Browser log lines for requests the test makes on purpose (customer hitting an admin route, wrong password).
  /status of 403.*\/api\/v1\/admin\/orders/,
  /status of 401.*\/api\/v1\/auth\/login/,
];
const errorsSince = (start) => b.consoleErrors.slice(start).filter((m) => !KNOWN_THIRD_PARTY.some((re) => re.test(m)));

try {
  // ---------------------------------------------------------------- desktop home
  await b.viewport(1280, 900);
  await b.goto(`${BASE}/`);
  await b.waitFor(`document.querySelectorAll('.card').length >= 4`, { label: "featured products render" });
  check("home: title", (await b.evaluate("document.title")).startsWith("Oriel"));
  check("home: h1", (await b.evaluate(`document.querySelector('h1').textContent`)) === "Quiet objects for considered homes");
  check("home: demo announcement visible", await b.evaluate(`document.body.innerText.includes('Oriel is a demo store')`));
  await b.waitFor(`document.querySelector('.hero-stage canvas') || document.querySelector('.hero-stage svg')`, { label: "hero stage" });
  const heroKind = await b.evaluate(`document.querySelector('.hero-stage canvas') ? 'webgl-canvas' : 'svg-fallback'`);
  check(`home: hero renders (${heroKind})`, true);
  await b.sleep(1500);
  await b.screenshot(join(OUT, "01-home-desktop.png"));
  check("home: no horizontal overflow (desktop)", await b.evaluate(`document.documentElement.scrollWidth <= window.innerWidth`));

  // ---------------------------------------------------------------- keyboard
  await b.evaluate(`document.activeElement && document.activeElement.blur(); window.scrollTo(0,0)`);
  await b.key("Tab");
  check("keyboard: first Tab stop is the skip link", (await b.evaluate(`document.activeElement.textContent.trim()`)) === "Skip to content");
  const outline = await b.evaluate(`getComputedStyle(document.activeElement).outlineStyle + ' ' + getComputedStyle(document.activeElement).outlineWidth`);
  check("keyboard: visible focus indicator on focused element", outline.startsWith("solid") && !outline.endsWith(" 0px"), outline);
  const tabbed = [];
  for (let i = 0; i < 8; i += 1) {
    await b.key("Tab");
    tabbed.push(await b.evaluate(`(document.activeElement.getAttribute('aria-label') || document.activeElement.textContent || document.activeElement.tagName).trim().slice(0,30)`));
  }
  check("keyboard: logo, nav, search, account, cart reachable by Tab", tabbed.some((t) => /Oriel home/.test(t)) && tabbed.some((t) => /Shop all/.test(t)), tabbed.join(" | "));

  // ---------------------------------------------------------------- shop discovery
  let mark = b.consoleErrors.length;
  await b.click(byText("nav a", "Shop all"));
  await b.waitFor(`document.querySelectorAll('.card').length >= 12 && location.pathname === '/shop'`, { label: "shop grid" });
  check("shop: first page shows 12 of 24", (await b.evaluate(`document.querySelectorAll('.card').length`)) === 12);
  check("shop: pagination present", await b.evaluate(`!!document.querySelector('nav[aria-label=Pagination]')`));
  await b.screenshot(join(OUT, "02-shop-desktop.png"));
  await b.click(`document.querySelector('nav[aria-label=Pagination] button[aria-label="Page 2"]')`);
  await b.waitFor(`location.search.includes('page=2')`, { label: "page 2 url" });
  check("shop: page 2 loads", await b.waitFor(`document.querySelectorAll('.card').length === 12`));

  await b.goto(`${BASE}/shop`);
  await b.waitFor(`document.querySelectorAll('.card').length >= 12`);
  await b.click(`[...document.querySelectorAll('.filters a')].find(a => a.textContent.startsWith('Lighting'))`);
  await b.waitFor(`location.pathname === '/shop/lighting' && document.querySelectorAll('.card').length === 4`, { label: "lighting filter" });
  check("shop: category filter shows 4 lighting products", true);
  await b.evaluate(`(() => { const s = document.getElementById('sort'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s,'price_asc'); s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await b.waitFor(`location.search.includes('sort=price_asc')`);
  await b.sleep(400);
  const prices = await b.evaluate(`[...document.querySelectorAll('.card .price')].map(e => Number(e.textContent.replace(/[^0-9.]/g,'')))`);
  check("shop: sort by price ascending", prices.length === 4 && prices.every((p, i) => i === 0 || prices[i - 1] <= p), prices.join(","));

  await b.goto(`${BASE}/shop?q=zebra`);
  await b.waitFor(`document.body.innerText.includes('Nothing matched')`, { label: "empty state" });
  check("shop: useful empty state for a search with no results", await b.evaluate(`!!document.querySelector('.empty button')`));
  await b.click(byText(".empty button", "Clear filters"));
  await b.waitFor(`location.pathname === '/shop' && document.querySelectorAll('.card').length >= 12`, { label: "cleared" });
  check("shop: clear filters returns to the full catalogue", true);

  await b.goto(`${BASE}/shop`);
  await b.waitFor(`document.querySelectorAll('.card').length >= 12`);
  await b.click(q("#site-search"));
  await b.type("candle");
  await b.key("Enter");
  await b.waitFor(`location.search.includes('q=candle') && document.querySelectorAll('.card').length > 0`, { label: "search results" });
  const searchNames = await b.evaluate(`[...document.querySelectorAll('.card-title')].map(e=>e.textContent)`);
  check("search: 'candle' returns candles", searchNames.length >= 4 && searchNames.every((n) => /candle/i.test(n)), searchNames.join(","));
  check("shop: no console errors during discovery", errorsSince(mark).length === 0, errorsSince(mark).join(" ; "));

  // ---------------------------------------------------------------- product + cart
  mark = b.consoleErrors.length;
  await b.goto(`${BASE}/shop/lighting`);
  await b.waitFor(`document.querySelectorAll('.card').length === 4`);
  await b.click(byText(".card-title", "Halo Table Lamp"));
  await b.waitFor(`location.pathname === '/products/halo-table-lamp' && document.querySelector('h1')?.textContent === 'Halo Table Lamp'`, { label: "product page" });
  check("product: details, options and specs render", await b.evaluate(`document.querySelectorAll('[role=radio]').length === 2 && !!document.querySelector('.specs')`));
  await b.screenshot(join(OUT, "03-product-desktop.png"));
  await b.click(byText("[role=radio]", "Charcoal"));
  check("product: low-stock variant message", await b.evaluate(`document.body.innerText.includes('Only 3 left')`));
  await b.click(`document.querySelector('button[aria-label="Increase quantity"]')`);
  await b.click(`document.querySelector('button[aria-label="Increase quantity"]')`);
  await b.click(byText("button", "Add to cart"));
  await b.waitFor(`document.querySelector('[role=dialog]')`, { label: "cart drawer" });
  check("cart: drawer opens with the item and updated badge", await b.evaluate(`document.querySelector('[role=dialog]').innerText.includes('Halo Table Lamp') && document.querySelector('.badge')?.textContent === '3'`));
  await b.sleep(400);
  const drawerTotal = await b.evaluate(`document.querySelector('.drawer-foot').innerText`);
  check("cart: server-confirmed totals ($148 x 3 = $444.00, free delivery)", /\$444\.00/.test(drawerTotal) && /Free/.test(drawerTotal), drawerTotal.replace(/\n/g, " | "));
  await b.screenshot(join(OUT, "04-cart-drawer-desktop.png"));

  // focus trap and escape
  const focusInside = [];
  for (let i = 0; i < 12; i += 1) {
    await b.key("Tab");
    focusInside.push(await b.evaluate(`!!document.activeElement.closest('[role=dialog]')`));
  }
  check("cart drawer: Tab focus stays inside the dialog", focusInside.every(Boolean));
  await b.key("Escape");
  await b.waitFor(`!document.querySelector('[role=dialog]')`, { label: "drawer closed" });
  check("cart drawer: Escape closes it and focus returns to a page control", await b.evaluate(`document.activeElement && document.activeElement !== document.body`));

  // persistence
  await b.goto(`${BASE}/cart`);
  await b.waitFor(`document.querySelector('.line')`);
  check("cart: persisted across a full page load", await b.evaluate(`document.querySelector('.line').innerText.includes('Halo Table Lamp') && document.querySelector('.qty output').textContent === '3'`));
  await b.click(`document.querySelector('button[aria-label="Decrease quantity of Halo Table Lamp"]')`);
  await b.sleep(600);
  check("cart: decreasing quantity recalculates server totals", await b.evaluate(`document.querySelector('.cart-layout aside').innerText.includes('$296.00')`));
  check("cart: no console errors", errorsSince(mark).length === 0, errorsSince(mark).join(" ; "));

  // ---------------------------------------------------------------- checkout
  mark = b.consoleErrors.length;
  await b.click(byText("aside a", "Checkout"));
  await b.waitFor(`location.pathname === '/checkout'`);
  check("checkout: labelled as demo, no card fields", await b.evaluate(`document.body.innerText.includes('No payment is taken') && !document.querySelector('input[autocomplete^="cc-"]') && !/card number/i.test(document.body.innerText)`));
  await b.click(byText("button[type=submit]", "Place demo order"));
  await b.waitFor(`document.querySelectorAll('.field-error').length >= 5`, { label: "validation errors" });
  check("checkout: empty submit shows field errors and focuses the first", await b.evaluate(`document.activeElement.id === 'co-email' && document.getElementById('co-email').getAttribute('aria-invalid') === 'true'`));
  await fill("Email", "browser.test@example.com");
  await fill("Full name", "Browser Tester");
  await fill("Address", "1 Test Street");
  await fill("City", "Testville");
  await fill("State / region", "TS");
  await fill("Postal code", "12345");
  await b.screenshot(join(OUT, "05-checkout-desktop.png"));
  await b.click(byText("button[type=submit]", "Place demo order"));
  await b.waitFor(`location.pathname.startsWith('/order/ORI-')`, { label: "order confirmation" });
  const reference = await b.evaluate(`location.pathname.split('/').pop()`);
  check("checkout: order placed, confirmation shows reference and demo notice", await b.evaluate(`document.body.innerText.includes(${JSON.stringify(reference)}) && document.body.innerText.includes('no payment was taken')`), reference);
  check("checkout: cart emptied after the order", (await b.evaluate(`localStorage.getItem('oriel.cart.v1')`)) === null);
  await b.goto(`${BASE}/order/${reference}`);
  await b.waitFor(`document.querySelector('h1')`);
  check("confirmation: survives a refresh in the same tab", await b.evaluate(`document.body.innerText.includes('Thank you')`));
  await b.screenshot(join(OUT, "06-confirmation-desktop.png"));
  check("checkout: no console errors", errorsSince(mark).length === 0, errorsSince(mark).join(" ; "));

  // ---------------------------------------------------------------- stock really decreased
  const stockAfter = await b.evaluate(`fetch('/api/v1/products/halo-table-lamp').then(r=>r.json()).then(j=>j.product.variants.map(v=>v.label+':'+v.stock).join(','))`);
  check("inventory: Charcoal stock decreased by the ordered 2 (3 -> 1)", /Charcoal:1/.test(stockAfter), stockAfter);

  // ---------------------------------------------------------------- mobile layout
  mark = b.consoleErrors.length;
  await b.viewport(390, 844, true);
  for (const [name, path, ready] of [
    ["home", "/", `document.querySelectorAll('.card').length >= 4`],
    ["shop", "/shop", `document.querySelectorAll('.card').length >= 12`],
    ["product", "/products/arc-vase", `document.querySelector('h1')?.textContent === 'Arc Vase'`],
    ["cart", "/cart", `document.querySelector('.empty')`],
    ["checkout", "/checkout", `document.querySelector('.empty')`],
  ]) {
    await b.goto(`${BASE}${path}`);
    await b.waitFor(ready, { label: `${name} mobile ready` });
    await b.sleep(800);
    const overflow = await b.evaluate(`({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })`);
    check(`mobile: ${name} has no horizontal scroll`, overflow.sw <= overflow.iw, JSON.stringify(overflow));
    if (name === "home" || name === "shop" || name === "product") await b.screenshot(join(OUT, `07-${name}-mobile.png`));
  }
  await b.goto(`${BASE}/`);
  await b.waitFor(`document.querySelectorAll('.card').length >= 4`);
  check("mobile: nav hidden until the menu button is used", await b.evaluate(`getComputedStyle(document.getElementById('main-nav')).display === 'none'`));
  await b.click(q(".menu-toggle"));
  check("mobile: menu opens", await b.evaluate(`getComputedStyle(document.getElementById('main-nav')).display !== 'none' && document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'true'`));
  await b.screenshot(join(OUT, "08-mobile-menu.png"));
  check("mobile: tap targets are at least 40px", await b.evaluate(`[...document.querySelectorAll('.header .icon-btn')].every(e => e.getBoundingClientRect().width >= 40 && e.getBoundingClientRect().height >= 40)`));
  check("mobile: no console errors", errorsSince(mark).length === 0, errorsSince(mark).join(" ; "));

  // ---------------------------------------------------------------- reduced motion
  await b.viewport(1280, 900);
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await b.goto(`${BASE}/`);
  await b.waitFor(`document.querySelectorAll('.card').length >= 4`);
  const dur = await b.evaluate(`getComputedStyle(document.querySelector('.btn')).transitionDuration`);
  check("reduced motion: CSS transitions are effectively disabled", dur === "1e-05s" || dur === "0.00001s" || dur === "0s", dur);
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });

  // ---------------------------------------------------------------- customer account flow
  mark = b.consoleErrors.length;
  await b.goto(`${BASE}/account/register`);
  await b.waitFor(`document.getElementById('reg-name')`);
  await fill("Full name", "Casey Customer");
  await fill("Email", "casey@example.com");
  await fill("Password", "a-long-browser-password");
  await b.click(byText("button", "Create account"));
  await b.waitFor(`location.pathname === '/account' && document.body.innerText.includes('Hello, Casey')`, { label: "account page" });
  check("account: register signs in and shows the account", true);
  check("account: customer does not see the Admin link", await b.evaluate(`!document.body.innerText.includes('Admin')`) || (await b.evaluate(`![...document.querySelectorAll('a')].some(a => a.textContent.trim()==='Admin')`)));
  await b.goto(`${BASE}/admin`);
  await b.waitFor(`document.querySelector('h1')`);
  check("admin: customer sees 'No access'", await b.evaluate(`document.querySelector('h1').textContent === 'No access'`));
  const adminApiForCustomer = await b.evaluate(`fetch('/api/v1/admin/orders').then(r=>r.status)`);
  check("admin: API refuses the customer session (403)", adminApiForCustomer === 403, String(adminApiForCustomer));
  await b.goto(`${BASE}/account`);
  await b.waitFor(`document.body.innerText.includes('Hello, Casey')`);
  await b.click(byText("button", "Sign out"));
  await b.waitFor(`location.pathname === '/'`);
  check("account: sign out returns to the home page", await b.evaluate(`fetch('/api/v1/auth/me').then(r=>r.json()).then(j=>j.user===null)`));

  // wrong password message
  await b.goto(`${BASE}/account/login`);
  await b.waitFor(`document.getElementById('login-email')`);
  await fill("Email", "casey@example.com");
  await fill("Password", "definitely-the-wrong-password");
  await b.click(byText("button", "Sign in"));
  await b.waitFor(`document.querySelector('.alert-error')`);
  check("login: wrong password shows a generic error", await b.evaluate(`document.querySelector('.alert-error').textContent === 'Invalid email or password.'`));

  // ---------------------------------------------------------------- admin flow
  if (ADMIN.email && ADMIN.password) {
    await b.goto(`${BASE}/account/login`);
    await b.waitFor(`document.getElementById('login-email')`);
    await fill("Email", ADMIN.email);
    await fill("Password", ADMIN.password);
    await b.click(byText("button", "Sign in"));
    await b.waitFor(`location.pathname === '/account'`, { label: "admin signed in" });
    await b.goto(`${BASE}/admin`);
    await b.waitFor(`document.querySelector('h1')?.textContent === 'Store admin'`, { label: "admin page" });
    await b.waitFor(`document.querySelectorAll('.table tbody tr').length > 20`);
    check("admin: product and stock table renders for the admin", true);
    await b.screenshot(join(OUT, "09-admin-desktop.png"));
    // change stock of the first variant via the UI
    await b.click(q("input[id^=stock-]"));
    await b.evaluate(`document.querySelector('input[id^=stock-]').select()`);
    await b.type("42");
    await b.click(byText("button", "Save"));
    await b.sleep(700);
    const stock = await b.evaluate(`fetch('/api/v1/products/arc-vase').then(r=>r.json()).then(j=>j.product.variants[0].stock)`);
    check("admin: stock edit through the UI is saved (arc-vase Sand = 42)", stock === 42, String(stock));
    // orders tab
    await b.click(byText("button[role=tab]", "Orders"));
    await b.waitFor(`document.querySelectorAll('.table tbody tr').length >= 1`, { label: "orders list" });
    check("admin: orders tab lists the placed order", await b.evaluate(`document.body.innerText.includes(${JSON.stringify(reference)})`));
    await b.evaluate(`(() => { const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => o.value==='packed')); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s,'packed'); s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await b.sleep(700);
    const status = await b.evaluate(`fetch('/api/v1/admin/orders').then(r=>r.json()).then(j=>j.orders.find(o=>o.reference===${JSON.stringify(reference)}).status)`);
    check("admin: order status change through the UI is saved (placed -> packed)", status === "packed", status);
  } else {
    check("admin flow skipped (no admin credentials supplied)", false, "set ADMIN_EMAIL/ADMIN_PASSWORD");
  }
  check("account/admin: no console errors", errorsSince(mark).length === 0, errorsSince(mark).join(" ; "));

  // ---------------------------------------------------------------- failure handling in the browser
  mark = b.consoleErrors.length;
  await b.send("Network.setBlockedURLs", { urls: ["*/api/v1/products?*"] });
  await b.goto(`${BASE}/shop`);
  await b.waitFor(`document.querySelector('.alert-error')`, { label: "error alert" });
  check("failure: blocked API shows an understandable error with retry", await b.evaluate(`document.querySelector('.alert-error').innerText.includes("couldn't") && !!document.querySelector('.alert-error button')`));
  await b.send("Network.setBlockedURLs", { urls: [] });
  await b.click(`document.querySelector('.alert-error button')`);
  await b.waitFor(`document.querySelectorAll('.card').length >= 12`, { label: "recovered after retry" });
  check("failure: Try again recovers once the API is reachable", true);

  // ---------------------------------------------------------------- aggregate network health
  check("network: no failed requests during the whole run (excluding deliberately blocked)", b.failedRequests.filter((f) => !f.includes("ERR_BLOCKED_BY_CLIENT") && !f.includes("/api/v1/products?pageSize=12")).length === 0, b.failedRequests.join(" ; "));
  const unexpected404 = b.badResponses.filter((r) => !/\/api\/v1\/(auth\/login|admin)|\/api\/v1\/products\/unknown/.test(r));
  console.log("HTTP >= 400 responses seen:", JSON.stringify(b.badResponses));
} catch (error) {
  check("script completed", false, String(error.stack ?? error).split("\n").slice(0, 3).join(" | "));
} finally {
  console.log("\nCONSOLE/EXCEPTION MESSAGES (all):", JSON.stringify(b.consoleErrors, null, 1));
  const failed = results.filter((r) => !r.ok);
  console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} checks passed`);
  await b.close();
  process.exit(failed.length ? 1 : 0);
}



