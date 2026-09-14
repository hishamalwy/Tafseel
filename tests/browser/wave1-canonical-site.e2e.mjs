/* Wave 1 end-to-end: the Angular client is the site.
 *
 * Runs against a published build (dotnet Tafseel.Api.dll) in Development, so account emails
 * land in the dev outbox, on a throwaway database. Every journey goes through the rendered
 * client in a real browser:
 *
 *   J1-01  /  negotiates /ar/ or /en/ and the landing page paints real content in both locales
 *   J2-02  the confirmation link from the outbox confirms the address in /auth
 *   J2-04  forgot password -> outbox reset link -> new password -> log in with it
 *   J9-04  notification actions: internal links only, locale kept, keyboard and phone width,
 *          marked read without holding up navigation, stored /app links still land
 *   J9-05  deep links the server hands out resolve to a screen, never a blank shell
 *
 * The notifications are inserted as rows because no single-actor API produces them; the
 * links are exactly the strings the server writes (AppRoutes), and AppRoutesTests checks that
 * the server writes them. Everything else is real API and UI.
 *
 * Environment:
 *   TAFSEEL_BASE_URL        default http://localhost:5311
 *   TAFSEEL_DEV_OUTBOX      the host's App_Data/dev-outbox directory (required)
 *   TAFSEEL_E2E_SQL_SERVER  default (localdb)\MSSQLLocalDB
 *   TAFSEEL_E2E_DATABASE    the throwaway database the host uses (required)
 *   TAFSEEL_SHOT_DIR        optional directory for screenshots
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";

const BASE = (process.env.TAFSEEL_BASE_URL ?? "http://localhost:5311").replace(/\/$/, "");
const OUTBOX = required("TAFSEEL_DEV_OUTBOX");
const SQL_SERVER = process.env.TAFSEEL_E2E_SQL_SERVER ?? "(localdb)\\MSSQLLocalDB";
const DATABASE = required("TAFSEEL_E2E_DATABASE");
const SHOTS = process.env.TAFSEEL_SHOT_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
if (!/^TafseelE2E/i.test(DATABASE)) throw new Error("TAFSEEL_E2E_DATABASE must be a throwaway TafseelE2E* database");

const AUTH_LIMITED = /^\/api\/v1\/auth\/(register|login|refresh|confirm-email|forgot-password|reset-password|password)$/;
const authCalls = [];
const results = [];
async function step(name, run) {
  const started = Date.now();
  try {
    await run();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`✓ ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error?.stack ?? error) });
    console.log(`✗ ${name}\n  ${String(error?.message ?? error).split("\n").join("\n  ")}`);
  }
}

await waitForHost();
const browser = await chromium.launch();
const email = `wave1-${Date.now()}@example.test`;
const firstPassword = "Wave1!Password-One";
const newPassword = "Wave1!Password-Two";

/** A fresh context that records console errors and CSP violations. */
async function context(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
  await ctx.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", e =>
      window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  ctx.on("request", request => {
    if (request.method() === "POST" && AUTH_LIMITED.test(new URL(request.url()).pathname)) authCalls.push(Date.now());
  });
  const page = await ctx.newPage();
  page.consoleErrors = [];
  // Resource failures are judged from responses below; the anonymous session probe
  // (POST /auth/refresh without a cookie) answers 401 by design.
  page.on("console", message => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) page.consoleErrors.push(message.text());
  });
  page.on("pageerror", error => page.consoleErrors.push(String(error)));
  page.on("response", response => {
    const url = new URL(response.url());
    if (response.status() >= 400 && !(url.pathname === "/api/v1/auth/refresh" && response.status() === 401))
      page.consoleErrors.push(`${response.status()} ${url.pathname}`);
  });
  return { ctx, page };
}

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false });
}

async function noCspViolations(page) {
  const violations = await page.evaluate(() => window.__cspViolations ?? []);
  assert.deepEqual(violations, [], `CSP violations on ${page.url()}`);
}

// ---- J1-01: the root and both locales ---------------------------------------------------
for (const [acceptLanguage, locale] of [["en-US", "en"], ["ar-SA", "ar"]]) {
  await step(`J1-01 / negotiates /${locale}/ and the landing page has visible content`, async () => {
    const { ctx, page } = await context({ locale: acceptLanguage });
    const response = await visit(page, `${BASE}/?utm_source=e2e`);
    assert.equal(response.status(), 200);
    assert.equal(pathOf(page.url()), `/${locale}`);
    assert.equal(new URL(page.url()).searchParams.get("utm_source"), "e2e", "query string preserved");
    const heading = page.locator("h1").first();
    await heading.waitFor({ state: "visible", timeout: 15000 });
    assert.ok((await heading.innerText()).trim().length > 0, "landing h1 has text");
    const text = await page.evaluate(() => document.body.innerText.trim());
    assert.ok(text.length > 400, `landing paints real content (got ${text.length} characters)`);
    assert.equal(await page.evaluate(() => document.querySelector("base")?.getAttribute("href")), `/${locale}/`);
    await noCspViolations(page);
    assert.deepEqual(page.consoleErrors, [], "no script errors or failed requests");
    await shot(page, `landing-${locale}`);
    await ctx.close();
  });
}

await step("unknown address renders the not-found page, not an empty shell", async () => {
  const { ctx, page } = await context({ locale: "en-US" });
  await visit(page, `${BASE}/en/no/such/page`);
  await page.locator("[data-testid=not-found] h1").waitFor({ state: "visible", timeout: 15000 });
  assert.match(await page.locator("[data-testid=not-found] code").innerText(), /\/no\/such\/page/);
  await shot(page, "not-found-en");
  await ctx.close();
});

// ---- J2-02 / J2-04: email links ----------------------------------------------------------
let userId = "";
await step("J2-02 confirmation link from the dev outbox confirms the address in /auth", async () => {
  const { ctx, page } = await context({ locale: "en-US" });
  await authBudget(1); authCalls.push(Date.now());
  const registered = await page.request.post(`${BASE}/api/v1/auth/register`, {
    data: { email, password: firstPassword, fullName: "Wave One Student", role: "Student", lang: "en", policyVersion: "2026-08-12" }
  });
  assert.ok(registered.ok(), `register ${registered.status()} ${await registered.text()}`);
  const link = await outboxLink(email, "mode=confirm");
  const url = new URL(link);
  assert.equal(url.origin, BASE, "confirmation link points at this host");
  assert.equal(url.pathname, "/auth");
  await visit(page, link);
  assert.match(pathOf(page.url()), /^\/(ar|en)\/auth$/);
  await page.locator(".tf-toast").waitFor({ state: "visible", timeout: 15000 });
  assert.equal(await page.locator(".tf-auth-alert[role=alert]").count(), 0, "no invalid-link alert");
  await shot(page, "confirm-email");
  userId = sql(`SET NOCOUNT ON; SELECT Id FROM AspNetUsers WHERE Email = '${email}' AND EmailConfirmed = 1`).trim();
  assert.match(userId, /^[0-9a-f-]{36}$/i, "user exists and is confirmed");
  await ctx.close();
});

await step("J2-04 forgot password -> outbox reset link -> new password -> log in", async () => {
  const { ctx, page } = await context({ locale: "en-US" });
  const since = Date.now();
  await visit(page, `${BASE}/en/auth`);
  await page.locator("#login-email").fill(email);
  await authBudget(1);
  await page.getByRole("button", { name: /forgot password/i }).click();
  const link = await outboxLink(email, "mode=reset", since);
  assert.equal(new URL(link).pathname, "/auth");

  await visit(page, link);
  await page.locator("#reset-password").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#reset-password").fill(newPassword);
  await page.locator("#reset-confirm").fill(newPassword);
  const resetResponse = page.waitForResponse(r => r.url().endsWith("/api/v1/auth/reset-password"));
  await authBudget(1);
  await page.locator("form button[type=submit]").click();
  const reset = await resetResponse;
  assert.equal(reset.status(), 204, `reset-password answered ${reset.status()}`);
  assert.deepEqual(Object.keys(reset.request().postDataJSON()).sort(), ["email", "password", "token"]);

  await page.locator("#login-password").waitFor({ state: "visible", timeout: 15000 });
  assert.equal(await page.locator("#login-email").inputValue(), email);
  await page.locator("#login-password").fill(newPassword);
  await authBudget(1);
  await page.locator("form button[type=submit]").click();
  await page.waitForURL(url => !pathOf(url).endsWith("/auth"), { timeout: 15000 });
  await shot(page, "after-reset-login");
  await ctx.close();

  await authBudget(1); authCalls.push(Date.now());
  const oldLogin = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: firstPassword })
  });
  assert.equal(oldLogin.status, 401, "the old password no longer works");
});

// ---- J9-04 / J9-05: notification actions and deep links ----------------------------------
const conversationId = randomUUID(), orderId = randomUUID();
const signedIn = async (options, lang = "en") => {
  const { ctx, page } = await context({ locale: "en-US", ...options });
  await visit(page, `${BASE}/${lang}/auth`);
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(newPassword);
  await authBudget(1);
  await page.locator("form button[type=submit]").click();
  await page.waitForURL(url => !pathOf(url).endsWith("/auth"), { timeout: 15000 });
  return { ctx, page };
};

await step("J9-04 notification actions: internal only, keyboard, locale kept, marked read without blocking", async () => {
  assert.ok(userId, "needs the confirmed user from J2-02");
  insertNotification("Conversation", "New message", `/conversations/${conversationId}`);
  insertNotification("Order", "Order update", `/orders/${orderId}`);
  insertNotification("Legacy", "Stored before the move", "/app/Tafseel-Student-Dashboard.dc.html?section=payments");
  insertNotification("Hostile", "Should offer no link", "https://evil.example/phish");

  const { ctx, page } = await signedIn();
  await visit(page, `${BASE}/en/student/notifications`);
  const actions = page.locator("[data-testid=notification-action]");
  await actions.first().waitFor({ state: "visible", timeout: 15000 });
  assert.equal(await actions.count(), 3, "three followable links; the external one offers none");
  assert.equal(await page.locator("article.is-unread").count(), 4, "every unread notification is marked, link or not");
  assert.ok((await page.locator("article", { hasText: "New message" }).innerText()).includes("Wave 1 E2E fixture"), "the body is shown");
  for (const href of await actions.evaluateAll(links => links.map(a => a.getAttribute("href"))))
    assert.ok(href && !/^[a-z]+:|^\/\//i.test(href), `action href stays on this site: ${href}`);
  await shot(page, "notifications-en");

  const conversationCard = page.locator("article", { hasText: "New message" });
  await conversationCard.locator("[data-testid=notification-action]").focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(url => pathOf(url) === "/en/student/messages", { timeout: 15000 });
  assert.equal(new URL(page.url()).searchParams.get("conversationId"), conversationId);
  await expectEventually(() => sql(`SET NOCOUNT ON; SELECT COUNT(*) FROM Notifications WHERE UserId = '${userId}' AND Type = 'Conversation' AND ReadAt IS NOT NULL`).trim() === "1",
    "the opened notification is marked read");
  assert.equal(sql(`SET NOCOUNT ON; SELECT COUNT(*) FROM Notifications WHERE UserId = '${userId}' AND Type = 'Order' AND ReadAt IS NOT NULL`).trim(), "0",
    "opening one notification does not mark the others read");

  await visit(page, `${BASE}/en/student/notifications`);
  await page.locator("article", { hasText: "Stored before the move" }).locator("[data-testid=notification-action]").click();
  await page.waitForURL(url => pathOf(url) === "/en/student/payments", { timeout: 15000 });

  await visit(page, `${BASE}/en/student/notifications`);
  await page.locator("article", { hasText: "Order update" }).locator("[data-testid=notification-action]").click();
  await page.waitForURL(url => pathOf(url) === `/en/orders/${orderId}`, { timeout: 15000 });
  await page.locator("[role=alert] h1").waitFor({ state: "visible", timeout: 15000 });
  await shot(page, "order-unavailable-en");
  await ctx.close();
});

await step("J9-04 notification action works at phone width in Arabic", async () => {
  const { ctx, page } = await signedIn({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "ar-SA" }, "ar");
  await visit(page, `${BASE}/ar/student/notifications`);
  const action = page.locator("article", { hasText: "Order update" }).locator("[data-testid=notification-action]");
  await action.waitFor({ state: "visible", timeout: 15000 });
  const box = await action.boundingBox();
  assert.ok(box && box.width <= 390 && box.height >= 44, "the action fits the screen and is a 44px target");
  await action.tap();
  await page.waitForURL(url => pathOf(url) === `/ar/orders/${orderId}`, { timeout: 15000 });
  await page.locator("[role=alert] h1").waitFor({ state: "visible", timeout: 15000 });
  assert.equal(await page.evaluate(() => document.documentElement.dir), "rtl");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), "no horizontal scroll at phone width");
  await shot(page, "order-unavailable-ar-phone");
  await ctx.close();
});

await step("J9-05 server deep links land on a screen for the reader's role", async () => {
  const { ctx, page } = await signedIn();
  const id = randomUUID();
  const cases = [
    [`/en/live-sessions/${id}`, "/en/student/sessions", { sessionId: id }],
    [`/en/conversations/${id}`, "/en/student/messages", { conversationId: id }],
    [`/en/requests/${id}`, "/en/student/requests", { tab: "requests", requestId: id }],
    [`/en/requests/${id}/offers`, "/en/requests", { requestId: id }],
    [`/en/disputes/${id}`, "/en/disputes", { selectedId: id }],
    ["/ar/messages", "/ar/student/messages", {}],
    [`/en/app/Tafseel-Chat.dc.html`, "/en/student/messages", {}],
  ];
  for (const [from, path, query] of cases) {
    await visit(page, `${BASE}${from}`);
    await page.waitForURL(url => pathOf(url) === path, { timeout: 15000 });
    const params = new URL(page.url()).searchParams;
    for (const [key, value] of Object.entries(query)) assert.equal(params.get(key), value, `${from}: ${key}`);
    const text = await page.evaluate(() => document.body.innerText.trim());
    assert.ok(text.length > 40, `${from} renders a screen, not a blank shell`);
    await noCspViolations(page);
  }
  await ctx.close();
});

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} Wave 1 journeys passed`);
if (failed.length) process.exit(1);

// ---- helpers -----------------------------------------------------------------------------
/**
 * The host limits /auth/login, /register, /refresh, /forgot-password, /reset-password and
 * /confirm-email to 10 requests a minute per IP outside Testing, and the client calls /refresh
 * on every full page load. The run keeps under that budget instead of reading a 429 as a failure.
 */
async function authBudget(needed) {
  for (;;) {
    const now = Date.now();
    while (authCalls.length && now - authCalls[0] > 61000) authCalls.shift();
    if (authCalls.length + needed <= 8) return;
    await new Promise(r => setTimeout(r, 61000 - (now - authCalls[0]) + 250));
  }
}

async function visit(page, url, options = { waitUntil: "networkidle" }) {
  await authBudget(2);
  return page.goto(url, options);
}

async function waitForHost() {
  for (let attempt = 0; attempt < 240; attempt++) {
    try { if ((await fetch(`${BASE}/health/live`)).ok) return; } catch { /* not listening yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`${BASE} did not become ready`);
}

/** The path without the trailing slash the client's URL serializer adds. */
function pathOf(url) {
  const path = new URL(String(url)).pathname;
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

function sql(query) {
  return execFileSync(sqlcmd(), ["-S", SQL_SERVER, "-d", DATABASE, "-E", "-b", "-h", "-1", "-W", "-Q", query], { encoding: "utf8" });
}

function sqlcmd() {
  const candidates = ["C:/Program Files/Microsoft SQL Server/Client SDK/ODBC/170/Tools/Binn/sqlcmd.exe",
    "C:/Program Files/Microsoft SQL Server/Client SDK/ODBC/180/Tools/Binn/sqlcmd.exe"];
  return candidates.find(existsSync) ?? "sqlcmd";
}

function insertNotification(type, title, link) {
  sql(`INSERT INTO Notifications (Id, UserId, Type, Title, Body, Link, DeduplicationKey, CreatedAt, InAppVisible, ReadAt)
       VALUES (NEWID(), '${userId}', '${type}', '${title}', 'Wave 1 E2E fixture', '${link.replace(/'/g, "''")}',
               'wave1-e2e:${type}:${randomUUID()}', SYSDATETIMEOFFSET(), 1, NULL)`);
}

/** The newest link in the dev outbox for this address that contains `marker`. */
async function outboxLink(address, marker, since = 0) {
  const safe = address.replace(/[^A-Za-z0-9@._-]/g, "_");
  for (let attempt = 0; attempt < 40; attempt++) {
    const files = existsSync(OUTBOX)
      ? readdirSync(OUTBOX).filter(f => f.endsWith(`-${safe}.html`)).map(f => join(OUTBOX, f))
          .filter(f => statSync(f).mtimeMs >= since - 1000).sort()
      : [];
    for (const file of files.reverse()) {
      const href = [...readFileSync(file, "utf8").matchAll(/href="([^"]+)"/g)]
        .map(m => m[1].replace(/&amp;/g, "&")).find(h => h.includes(marker));
      if (href) return href;
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`No ${marker} email for ${address} in ${OUTBOX}`);
}

async function expectEventually(check, message) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (check()) return;
    await new Promise(r => setTimeout(r, 250));
  }
  assert.fail(message);
}
