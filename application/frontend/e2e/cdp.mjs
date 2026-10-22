// Minimal Chrome DevTools Protocol driver using only Node built-ins (fetch + WebSocket) and an installed Chrome.
// No npm dependencies. Set CHROME_PATH if Chrome is not at the default Windows location.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

export async function launch({ port = 9333 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), "oriel-chrome-"));
  const proc = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let targets;
  for (let i = 0; i < 50; i += 1) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      if (targets.some((t) => t.type === "page")) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  const page = targets?.find((t) => t.type === "page");
  if (!page) throw new Error("Chrome did not start");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(`${msg.error.message}`)) : resolve(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const consoleErrors = [];
  const failedRequests = [];
  const badResponses = [];
  const requests = new Map();
  listeners.push((msg) => {
    const { method, params } = msg;
    if (method === "Runtime.consoleAPICalled" && (params.type === "error" || params.type === "warning")) {
      consoleErrors.push(`${params.type}: ${params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
    } else if (method === "Runtime.exceptionThrown") {
      consoleErrors.push(`exception: ${params.exceptionDetails.exception?.description ?? params.exceptionDetails.text}`);
    } else if (method === "Log.entryAdded" && (params.entry.level === "error" || params.entry.level === "warning")) {
      consoleErrors.push(`log-${params.entry.level}: ${params.entry.text} ${params.entry.url ?? ""}`);
    } else if (method === "Network.requestWillBeSent") {
      requests.set(params.requestId, params.request.url);
    } else if (method === "Network.loadingFailed" && !params.canceled) {
      failedRequests.push(`${requests.get(params.requestId) ?? params.requestId}: ${params.errorText}`);
    } else if (method === "Network.responseReceived" && params.response.status >= 400) {
      badResponses.push(`${params.response.status} ${params.response.url}`);
    }
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Log.enable");

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = async (expression, { timeout = 8000, label = expression } = {}) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const v = await evaluate("!!(" + expression + ")");
        if (v) return v;
      } catch {
        /* page navigating */
      }
      await sleep(100);
    }
    throw new Error(`Timed out waiting for: ${label}`);
  };
  const goto = async (url) => {
    await send("Page.navigate", { url });
    await sleep(300);
    await waitFor("document.readyState === 'complete'", { label: `load ${url}` });
  };
  const viewport = (width, height, mobile = false) =>
    send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  const screenshot = async (file) => {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(file, Buffer.from(data, "base64"));
  };
  // Real mouse click at the centre of the element matched by a JS expression returning an Element.
  const click = async (elementExpr) => {
    const rect = await evaluate(`(() => { const el = ${elementExpr}; if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2); return { x: r.x + r.width/2, y: r.y + r.height/2, hit: top === el || el.contains(top) || (top && top.contains && top.contains(el) && top.tagName==='A'), topTag: top ? top.tagName + '.' + top.className : null }; })()`);
    if (!rect) throw new Error(`No element for click: ${elementExpr}`);
    if (!rect.hit) throw new Error(`Click target obscured by ${rect.topTag}: ${elementExpr}`);
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", { type, x: rect.x, y: rect.y, button: "left", clickCount: 1, buttons: type === "mousePressed" ? 1 : 0 });
    }
    await sleep(120);
  };
  const type = async (text) => {
    await send("Input.insertText", { text });
    await sleep(50);
  };
  const key = async (name, { shift = false } = {}) => {
    const codes = { Tab: 9, Escape: 27, Enter: 13, ArrowDown: 40 };
    const base = { key: name, code: name, windowsVirtualKeyCode: codes[name], modifiers: shift ? 8 : 0 };
    // Enter must produce a character event to submit forms, like a real key press.
    const text = name === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {};
    await send("Input.dispatchKeyEvent", { type: name === "Enter" ? "keyDown" : "rawKeyDown", ...base, ...text });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await sleep(80);
  };
  const close = async () => {
    try {
      await send("Browser.close");
    } catch {
      /* closing */
    }
    ws.close();
    proc.kill();
  };

  return { send, evaluate, waitFor, goto, viewport, screenshot, click, type, key, sleep, close, consoleErrors, failedRequests, badResponses };
}


