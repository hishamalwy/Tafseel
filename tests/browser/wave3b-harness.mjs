/* Shared plumbing for the Wave 3B browser journeys (direct order, open marketplace, messaging,
 * live session). Each journey runs against a published build in Development on a throwaway
 * TafseelE2E* database seeded by scripts/dev/E2ESeed with TAFSEEL_E2E_SCENARIO=fulfilment.
 *
 * Environment:
 *   TAFSEEL_BASE_URL        default http://localhost:5313
 *   TAFSEEL_E2E_SEED        the seeder's JSON output (required)
 *   TAFSEEL_E2E_PASSWORD    the seeded accounts' password (required)
 *   TAFSEEL_DEV_OUTBOX      the host's App_Data/dev-outbox directory (required for registration)
 *   TAFSEEL_E2E_DATABASE    the throwaway database, read (never written) to check server state
 *   TAFSEEL_E2E_SQL_SERVER  default (localdb)\MSSQLLocalDB
 *   TAFSEEL_SHOT_DIR        optional directory for screenshots
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

export const BASE = (process.env.TAFSEEL_BASE_URL ?? 'http://localhost:5313').replace(/\/$/, '');
export const SEED = JSON.parse(readFileSync(required('TAFSEEL_E2E_SEED'), 'utf8'));
export const PASSWORD = required('TAFSEEL_E2E_PASSWORD');
const OUTBOX = process.env.TAFSEEL_DEV_OUTBOX ?? '';
const SQL_SERVER = process.env.TAFSEEL_E2E_SQL_SERVER ?? '(localdb)\\MSSQLLocalDB';
const DATABASE = process.env.TAFSEEL_E2E_DATABASE ?? '';
const SHOTS = process.env.TAFSEEL_SHOT_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

// Development limits: sign-in/registration 10 per minute per address, refresh 60 per minute.
const AUTH = /^\/api\/v1\/auth\/(register|login|confirm-email|forgot-password|reset-password|password)$/;
const REFRESH = /^\/api\/v1\/auth\/refresh$/;
// The limits are per address, so journeys run one after another share the count: it is kept in a file.
const BUDGET_FILE = join(tmpdir(), 'tafseel-e2e-auth-budget.json');
const recent = list => (list ?? []).filter(t => Date.now() - t < 61000);
const saved = (() => { try { return JSON.parse(readFileSync(BUDGET_FILE, 'utf8')); } catch { return {}; } })();
const authCalls = recent(saved.auth);
const refreshCalls = recent(saved.refresh);
function note(list) {
  list.push(Date.now());
  try { writeFileSync(BUDGET_FILE, JSON.stringify({ auth: recent(authCalls), refresh: recent(refreshCalls) })); } catch { /* best effort */ }
}

export const results = [];
let currentPage = null;
let browser = null;

export async function start() {
  await waitForHost();
  browser = await chromium.launch();
  return browser;
}

/** One journey: once a step fails, the steps after it would only fail for the same reason. */
export async function step(name, run) {
  if (results.some(r => !r.ok)) { results.push({ name, ok: false, skipped: true }); console.log(`- ${name} (skipped)`); return; }
  const started = Date.now();
  try {
    await run();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`✓ ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error?.stack ?? error) });
    console.log(`✗ ${name}\n  ${String(error?.stack ?? error).split('\n').slice(0, 10).join('\n  ')}`);
    if (SHOTS && currentPage) await currentPage.screenshot({ path: join(SHOTS, `FAILED-${results.length}.png`), fullPage: true }).catch(() => {});
  }
}

export async function finish(label) {
  await browser?.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} ${label} steps passed`);
  if (failed.length) process.exit(1);
}

/** A browser context that records the API calls its pages send and any script error. */
export async function context(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US', timezoneId: 'UTC', ...options });
  ctx.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && AUTH.test(path)) note(authCalls);
    if (request.method() === 'POST' && REFRESH.test(path)) note(refreshCalls);
  });
  const page = await ctx.newPage();
  page.sent = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/v1/')) page.sent.push(request); });
  page.problems = [];
  page.on('pageerror', error => page.problems.push(String(error)));
  currentPage = page;
  return { ctx, page, locale: String(options.locale ?? 'en-US').startsWith('ar') ? 'ar' : 'en' };
}

export async function signIn(actor, email, password = PASSWORD) {
  const { page, locale } = actor;
  await visit(page, `${BASE}/${locale}/auth`);
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await budget(1);
  await page.locator('form button[type=submit]').first().click();
  await page.waitForURL(url => !/\/auth(\/.*)?$/.test(pathOf(url)), { timeout: 20000 });
  actor.email = email;
  actor.password = password;
  return actor;
}

/** A new student, through /auth: register, confirm from the dev outbox, sign in. */
export async function registerStudent(actor, fullName, email, password) {
  const { page, locale } = actor;
  await visit(page, `${BASE}/${locale}/auth`);
  await page.locator('[role=tab]').nth(1).click();
  await page.locator('#reg-fullname').fill(fullName);
  await page.locator('#reg-email').fill(email);
  await page.locator('#reg-password').fill(password);
  await page.locator('#reg-confirm').fill(password);
  await page.locator('.tf-check--start input[type=checkbox]').check();
  await budget(1);
  const registered = waitForCall(page, 'POST', /^\/api\/v1\/auth\/register$/);
  await page.locator('form button[type=submit].tf-auth-submit:visible').click();
  assert.ok((await registered).ok(), 'registration accepted');
  await page.waitForURL(url => pathOf(url).endsWith('/auth/confirm-email'), { timeout: 15000 });
  await visit(page, await outboxLink(email, 'mode=confirm'));
  await page.locator('.tf-toast').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await budget(1);
  await page.locator('form button[type=submit]').first().click();
  await page.waitForURL(url => !/\/auth(\/.*)?$/.test(pathOf(url)), { timeout: 20000 });
  actor.email = email;
  actor.password = password;
  return actor;
}

/** Navigates inside the running client, so the session is not re-read from a full page load. */
export async function spa(actor, path) {
  const { page, locale } = actor;
  currentPage = page;
  const target = `/${locale}${path}`;
  const current = new URL(page.url());
  if (`${pathOf(current)}${current.search}` === target) {
    await visit(page, `${BASE}${target}`);
    return;
  }
  await page.evaluate(to => {
    window.history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  }, target);
  await page.waitForURL(url => `${pathOf(url)}${new URL(String(url)).search}` === target, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

export async function visit(page, url) {
  currentPage = page;
  await budget(0, 2);
  return page.goto(url, { waitUntil: 'networkidle' });
}

/** A bearer token for direct API checks that prove refusals; one sign-in per account. */
const tokens = new Map();
export async function tokenFor(email, password = PASSWORD) {
  if (tokens.has(email)) return tokens.get(email);
  await budget(1);
  note(authCalls);
  const response = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password })
  });
  assert.equal(response.status, 200, `sign-in for ${email}`);
  const token = (await response.json()).accessToken;
  tokens.set(email, token);
  return token;
}

export async function api(email, method, path, body, headers = {}, password = PASSWORD) {
  const send = async () => fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${await tokenFor(email, password)}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let response = await send();
  // Access tokens are short-lived; a long journey signs in again rather than failing on expiry.
  if (response.status === 401) { tokens.delete(email); response = await send(); }
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: response.status, body: parsed };
}

export function waitForCall(page, method, pattern, timeout = 20000) {
  return page.waitForResponse(r =>
    (method instanceof RegExp ? method.test(r.request().method()) : r.request().method() === method)
    && pattern.test(new URL(r.url()).pathname), { timeout });
}

/** Confirms the in-app dialog the page opened. */
export async function confirmDialog(page) {
  const button = page.locator('dialog.tf-system-dialog[open] button[value=confirm]');
  await button.waitFor({ state: 'visible', timeout: 10000 });
  await button.click();
}

export async function promptDialog(page, text) {
  const input = page.locator('dialog.tf-system-dialog[open] input#tf-system-dialog-input');
  await input.waitFor({ state: 'visible', timeout: 10000 });
  await input.fill(text);
  await page.locator('dialog.tf-system-dialog[open] button[value=confirm]').click();
}

export async function attribute(page, selector, name, expected, timeout = 20000) {
  await page.waitForFunction(({ selector, name, expected }) =>
    document.querySelector(selector)?.getAttribute(name) === String(expected), { selector, name, expected }, { timeout });
}

/**
 * Starts the payment from checkout, lets the caller look at the pending state while the simulator
 * is open, then confirms in the official mock simulator and waits for the return address.
 */
export async function payInSimulator(page, returnPath, whileOnSimulator = async () => {}) {
  const initiated = waitForCall(page, 'POST', /^\/api\/v1\/payments\/(orders|live-sessions|open-requests)\/[0-9a-f-]{36}$/);
  await payButton(page).click();
  const response = await initiated;
  assert.ok(response.ok(), `payment initiated ${response.status()}`);
  await page.waitForURL(url => pathOf(url).endsWith('/checkout/simulator'), { timeout: 20000 });
  await page.locator('button.tf-pay-cta').waitFor({ timeout: 15000 });
  await whileOnSimulator();
  const completed = waitForCall(page, 'POST', /^\/api\/v1\/payments\/mock\/simulator\/complete$/);
  await page.locator('button.tf-pay-cta').click();
  assert.ok((await completed).ok(), 'simulator completed the payment');
  await page.locator('button.tf-pay-primary-link').click();
  await page.waitForURL(url => returnPath.test(pathOf(url)), { timeout: 20000 });
  await page.waitForLoadState('networkidle');
}

/** Waits, in real time, until the given moment; the domain's clock is the server's, not ours. */
export async function waitUntil(moment, what) {
  const target = moment instanceof Date ? moment.getTime() : moment;
  while (Date.now() < target) {
    const left = Math.ceil((target - Date.now()) / 1000);
    console.log(`  … ${what} in ${Math.floor(left / 60)}m${String(left % 60).padStart(2, '0')}s`);
    await new Promise(r => setTimeout(r, Math.min(60000, target - Date.now())));
  }
}

/** A direct request through the request wizard, for journeys that need an order as their setting. */
export async function sendDirectRequest(student, teacher, title) {
  const { page } = student;
  await spa(student, `/requests/new?teacherId=${teacher.Id}&teacherServiceId=${teacher.explanationServiceId}`);
  const next = page.locator('.tf-req-nav button.tf-button:not(.tf-button-secondary)');
  await page.locator('#req-title').waitFor({ timeout: 15000 });
  await page.locator('#req-title').fill(title);
  await next.click();
  await page.locator('#req-goal').fill('Explain the worked examples in the attached chapter, step by step.');
  await next.click();
  await page.locator('#req-delivery').fill(new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10));
  await next.click();
  await page.locator('.tf-check--start input[type=checkbox]').check();
  const created = waitForCall(page, 'POST', /^\/api\/v1\/learning-requests$/);
  await next.click();
  const response = await created;
  assert.equal(response.status(), 201);
  return (await response.json()).id;
}

/** The teacher accepts on the request's own screen; returns the order the acceptance created. */
export async function acceptRequest(teacher, requestId, price) {
  const { page } = teacher;
  await spa(teacher, `/requests/${requestId}`);
  await page.locator('[data-testid=accept-request]').click();
  const dialog = page.locator('[data-testid=accept-dialog]');
  await dialog.locator('#accept-price').waitFor({ state: 'visible', timeout: 15000 });
  await dialog.locator('#accept-price').fill(String(price));
  const accepted = waitForCall(page, 'POST', new RegExp(`^/api/v1/learning-requests/${requestId}/accept$`));
  await dialog.locator('button[type=submit]').click();
  const response = await accepted;
  assert.equal(response.status(), 200);
  return (await response.json()).id;
}

/** The receipt's button on desktop; the sticky bar's on a phone, where the receipt one is hidden. */
export const payButton = page => page.locator('[data-testid=pay-securely]:visible, .tf-pay-mobile-cta button:visible').first();

export async function noHorizontalOverflow(page, what) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `${what}: no horizontal scroll (overflow ${overflow}px)`);
  // A card can clip what spills out of it without the page scrolling: check the cards' contents too.
  const spilled = await page.evaluate(() => [...document.querySelectorAll('.tf-profile-editor-card')].flatMap(card => {
    const box = card.getBoundingClientRect();
    return [...card.querySelectorAll('li, button, a, dl')]
      .filter(el => { const r = el.getBoundingClientRect(); return r.width && (r.left < box.left - 1 || r.right > box.right + 1); })
      .map(el => `${el.tagName.toLowerCase()}: ${el.textContent.trim().slice(0, 40)}`);
  }));
  assert.deepEqual(spilled, [], `${what}: content stays inside its card`);
}

export async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

/** Reads server state from the throwaway database; journeys never write to it. */
export function sql(query) {
  if (!/^TafseelE2E/i.test(DATABASE)) throw new Error('Set TAFSEEL_E2E_DATABASE to the throwaway TafseelE2E* database');
  if (/\b(insert|update|delete|merge|drop|alter|truncate|exec)\b/i.test(query)) throw new Error('Journeys only read the database');
  const candidates = ['C:/Program Files/Microsoft SQL Server/Client SDK/ODBC/170/Tools/Binn/sqlcmd.exe',
    'C:/Program Files/Microsoft SQL Server/Client SDK/ODBC/180/Tools/Binn/sqlcmd.exe'];
  const sqlcmd = candidates.find(existsSync) ?? 'sqlcmd';
  return execFileSync(sqlcmd, ['-S', SQL_SERVER, '-d', DATABASE, '-E', '-b', '-h', '-1', '-W', '-Q', `SET NOCOUNT ON; ${query}`], { encoding: 'utf8' }).trim();
}

export function file(name, bytes) {
  const path = join(tmpdir(), `wave3b-${Date.now()}-${name}`);
  writeFileSync(path, bytes);
  return path;
}

export const pdf = (text = 'Wave 3B') => Buffer.from(`%PDF-1.4\n1 0 obj<<>>endobj\n% ${text}\ntrailer<<>>\n%%EOF\n`);

export function pathOf(url) {
  const path = new URL(String(url)).pathname;
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

export function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

export async function budget(auth, refresh = 0) {
  for (;;) {
    const now = Date.now();
    while (authCalls.length && now - authCalls[0] > 61000) authCalls.shift();
    while (refreshCalls.length && now - refreshCalls[0] > 61000) refreshCalls.shift();
    if (authCalls.length + auth <= 8 && refreshCalls.length + refresh <= 50) return;
    const oldest = authCalls.length + auth > 8 ? authCalls[0] : refreshCalls[0];
    await new Promise(r => setTimeout(r, 61000 - (now - oldest) + 250));
  }
}

async function waitForHost() {
  for (let attempt = 0; attempt < 240; attempt++) {
    try { if ((await fetch(`${BASE}/health/live`)).ok) return; } catch { /* not listening yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`${BASE} did not become ready`);
}

async function outboxLink(address, marker) {
  if (!OUTBOX) throw new Error('Set TAFSEEL_DEV_OUTBOX');
  const safe = address.replace(/[^A-Za-z0-9@._-]/g, '_');
  for (let attempt = 0; attempt < 60; attempt++) {
    const files = existsSync(OUTBOX)
      ? readdirSync(OUTBOX).filter(f => f.endsWith(`-${safe}.html`)).map(f => join(OUTBOX, f)).sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs)
      : [];
    for (const f of files.reverse()) {
      const href = [...readFileSync(f, 'utf8').matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&')).find(h => h.includes(marker));
      if (href) return href;
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`No ${marker} email for ${address} in ${OUTBOX}`);
}
