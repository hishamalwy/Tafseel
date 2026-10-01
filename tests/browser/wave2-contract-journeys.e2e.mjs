/* Wave 2 end-to-end: the journeys behind the fixed Angular -> API calls, in a real browser.
 *
 * Runs against a published build in Development on a throwaway TafseelE2E* database seeded by
 * scripts/dev/E2ESeed (a student and two published teachers with services). Every step goes
 * through the rendered client; the requests it sends are captured and checked against the API
 * contract.
 *
 *   J1-07  profile favourite toggle: PUT then DELETE /favorite-teachers/{teacherId}
 *   J3-02  teacher profile -> request wizard -> submit: POST /learning-requests with the five keys
 *   J3-07  teacher accepts in the dialog: four terms, If-Match, Idempotency-Key -> order awaiting payment
 *   UX-05  the retired inline marketplace (/requests) forwards to the canonical screens; its forms are gone
 *
 * J4-05 (send an offer), J4-02 and J4-07 (compare and choose an offer) were proven here on the Wave 2
 * inline marketplace at /requests. UX-05 retired that page; the same calls are proven on the canonical
 * screens by tests/browser/wave3b-open-marketplace.e2e.mjs (/teacher/opportunities/:id,
 * /requests/:id/offers: offer POST/PUT, If-Match + X-Offer-Version, stale selection 409, reservation, no order).
 *
 * Environment:
 *   TAFSEEL_BASE_URL       default http://localhost:5312
 *   TAFSEEL_E2E_SEED       path to the JSON E2ESeed printed (required)
 *   TAFSEEL_E2E_PASSWORD   the password E2ESeed used (required)
 *   TAFSEEL_E2E_SQL_SERVER default (localdb)\MSSQLLocalDB
 *   TAFSEEL_E2E_DATABASE   the throwaway database (required)
 *   TAFSEEL_SHOT_DIR       optional directory for screenshots
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { execSql } from './lib/sql.mjs';

const BASE = (process.env.TAFSEEL_BASE_URL ?? 'http://localhost:5312').replace(/\/$/, '');
const SEED = JSON.parse(readFileSync(required('TAFSEEL_E2E_SEED'), 'utf8'));
const PASSWORD = required('TAFSEEL_E2E_PASSWORD');
const DATABASE = required('TAFSEEL_E2E_DATABASE');
if (!/^TafseelE2E/i.test(DATABASE)) throw new Error('TAFSEEL_E2E_DATABASE must be a throwaway TafseelE2E* database');
const SHOTS = process.env.TAFSEEL_SHOT_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const results = [];
async function step(name, run) {
  try {
    await run();
    results.push({ name, ok: true });
    console.log(`✓ ${name}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.log(`✗ ${name}\n  ${String(error?.message ?? error).split('\n').join('\n  ')}`);
  }
}

const browser = await chromium.launch();
const requestTitle = `Explain limits ${Date.now()}`;
const openTitle = `Explain integrals ${Date.now()}`;
let openRequestId = '';

/** A signed-in context. Records API requests so each step can check what the client sent. */
async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
  const page = await ctx.newPage();
  page.sent = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/')) page.sent.push(request);
  });
  page.problems = [];
  page.on('pageerror', error => page.problems.push(String(error)));
  await page.goto(`${BASE}/en/auth`, { waitUntil: 'networkidle' });
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(PASSWORD);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL(url => !/\/auth\/?$/.test(new URL(String(url)).pathname), { timeout: 15000 });
  return { ctx, page };
}

const waitForCall = (page, method, pattern) => page.waitForResponse(r =>
  r.request().method() === method && pattern.test(new URL(r.url()).pathname), { timeout: 15000 });

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

const student = await signIn(SEED.student.Email);
const teacher = await signIn(SEED.teacherA.Email);

await step('J1-07 favourite toggle on the teacher profile uses PUT then DELETE', async () => {
  const { page } = student;
  await page.goto(`${BASE}/en/teachers/${SEED.teacherA.Id}`, { waitUntil: 'networkidle' });
  const toggle = page.locator('button[aria-pressed]').first();
  await toggle.waitFor({ state: 'visible', timeout: 15000 });
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false');

  const added = waitForCall(page, 'PUT', new RegExp(`^/api/v1/favorite-teachers/${SEED.teacherA.Id}$`));
  await toggle.click();
  assert.equal((await added).status(), 204);
  await page.waitForFunction(() => document.querySelector('button[aria-pressed]')?.getAttribute('aria-pressed') === 'true');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('button[aria-pressed]')?.getAttribute('aria-pressed') === 'true',
    null, { timeout: 15000 });
  const removed = waitForCall(page, 'DELETE', new RegExp(`^/api/v1/favorite-teachers/${SEED.teacherA.Id}$`));
  await page.locator('button[aria-pressed]').first().click();
  assert.equal((await removed).status(), 204);
  assert.ok(!page.sent.some(r => r.method() === 'POST' && new URL(r.url()).pathname === '/api/v1/favorite-teachers'));
});

await step('J3-02 teacher profile -> request wizard -> submit posts CreateLearningRequest', async () => {
  const { page } = student;
  await page.goto(`${BASE}/en/teachers/${SEED.teacherA.Id}`, { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: /request this service/i }).first().click();
  await page.waitForURL(url => /\/requests\/new\/?$/.test(new URL(String(url)).pathname), { timeout: 15000 });

  await page.locator('#req-title').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#req-title').fill(requestTitle);
  await page.getByRole('button', { name: /^next$/i }).click();
  await page.locator('#req-goal').fill('Understand limits well enough to solve the exam questions.');
  await page.getByRole('button', { name: /^next$/i }).click();

  const nextButton = page.getByRole('button', { name: /^next$/i });
  const yesterday = new Date(Date.now() - 86_400_000);
  await page.locator('#req-delivery').fill(dayInput(yesterday));
  assert.ok(await nextButton.isDisabled(), 'a past delivery day blocks Next');
  await page.locator('#req-delivery').fill(dayInput(new Date(Date.now() + 5 * 86_400_000)));
  await nextButton.click();

  await page.locator('.tf-check--start input[type=checkbox]').check();
  const created = waitForCall(page, 'POST', /^\/api\/v1\/learning-requests$/);
  await page.getByRole('button', { name: /send request/i }).click();
  const response = await created;
  const body = response.request().postDataJSON();

  assert.equal(response.status(), 201, await response.text());
  assert.deepEqual(Object.keys(body).sort(), ['budget', 'description', 'preferredDeliveryAt', 'teacherServiceId', 'title']);
  assert.equal(body.teacherServiceId, SEED.teacherA.serviceId);
  assert.equal(body.budget, null);
  assert.ok(new Date(body.preferredDeliveryAt) > new Date(), 'preferredDeliveryAt is in the future');
  await page.getByRole('heading', { name: /your request is on its way/i }).waitFor({ timeout: 15000 });
  await shot(page, 'request-sent');
});

await step('J3-07 teacher accepts in the dialog and an order awaiting payment exists', async () => {
  const { page } = teacher;
  await page.goto(`${BASE}/en/teacher/work?tab=requests`, { waitUntil: 'networkidle' });
  // UX-03 made the work list a list of cards that open each request, with acceptance on the request's own
  // screen; this journey predates it. The card is found and opened the way wave3b-direct-order does, and the
  // dialog below is the same dialog, held to the same assertions.
  const card = page.locator('article.tf-dashboard-card, article.tf-work-card', { hasText: requestTitle })
    .filter({ has: page.locator('[data-testid=row-open]') });
  await card.waitFor({ state: 'visible', timeout: 15000 });
  await card.locator('[data-testid=row-open]').click();
  await page.waitForURL(/\/en\/requests\/[0-9a-f-]{36}\/?$/, { timeout: 15000 });
  const acceptButton = page.locator('[data-testid=accept-request]');
  await acceptButton.click();

  const dialog = page.locator('[data-testid=accept-dialog]');
  await dialog.locator('#accept-price').waitFor({ state: 'visible', timeout: 15000 });
  assert.equal(await dialog.locator('#accept-price').inputValue(), '100');
  // UX-06 removed the editable currency field: the currency is the service's, named in the price label.
  await shot(page, 'accept-dialog');

  // Cancel first: nothing is sent.
  const before = page.sent.filter(r => /\/accept$/.test(r.url())).length;
  await dialog.getByRole('button', { name: /cancel/i }).click();
  await page.waitForFunction(() => !document.querySelector('[data-testid=accept-dialog]')?.hasAttribute('open'));
  assert.equal(page.sent.filter(r => /\/accept$/.test(r.url())).length, before, 'cancel sends nothing');

  await acceptButton.click();
  await dialog.locator('#accept-price').waitFor({ state: 'visible', timeout: 15000 });
  // Outside the catalog's price range (the seeded catalog allows 0.01 to 1,000,000).
  await dialog.locator('#accept-price').fill('0');
  await dialog.locator('button[type=submit]').click();
  await page.waitForFunction(() => document.querySelector('#accept-price')?.getAttribute('aria-invalid') === 'true', null, { timeout: 5000 });
  assert.equal(page.sent.filter(r => /\/accept$/.test(r.url())).length, before, 'invalid terms send nothing');

  await dialog.locator('#accept-price').fill('110');
  // DEC-UX-03: a price different from the listed one needs the teacher's reason, shown to the student.
  if (await dialog.locator('#accept-reason').isVisible()) await dialog.locator('#accept-reason').fill('The request needs extra exercises.');
  const accepted = waitForCall(page, 'POST', /^\/api\/v1\/learning-requests\/[^/]+\/accept$/);
  await dialog.locator('button[type=submit]').click();
  const response = await accepted;
  const request = response.request();
  assert.equal(response.status(), 200, await response.text());
  assert.deepEqual(Object.keys(request.postDataJSON()).filter(k => k !== 'priceChangeReason').sort(), ['agreedDeliveryAt', 'currency', 'finalPrice', 'revisionAllowance']);
  assert.equal(request.postDataJSON().currency, 'SAR', 'the service currency is sent');
  const headers = await request.allHeaders();
  assert.ok(headers['if-match'], 'If-Match sent');
  assert.match(headers['idempotency-key'] ?? '', /^[0-9a-f-]{36}$/);

  const order = sql(`SET NOCOUNT ON; SELECT CONCAT(o.Status, ':', o.PaymentStatus, ':', o.Price) FROM Orders o
    JOIN LearningRequests r ON r.Id = o.LearningRequestId WHERE r.Title = '${requestTitle}'`).trim();
  assert.equal(order, '0:0:110.00', 'order AwaitingPayment, payment Pending, at the accepted price');
  await shot(page, 'accepted');
});

await step('UX-05 /requests forwards each role to its canonical screen and no inline marketplace form remains', async () => {
  openRequestId = await publishOpenRequest();
  const inline = '.tf-market-offer-form, .tf-market-row, [data-testid=offer-reservation], [data-testid=offer-sent]';

  const t = teacher.page;
  await t.goto(`${BASE}/en/requests`, { waitUntil: 'networkidle' });
  await t.waitForURL(url => new URL(String(url)).pathname.replace(/\/$/, '') === '/en/teacher/opportunities', { timeout: 15000 });
  assert.equal(await t.locator(inline).count(), 0, 'no inline marketplace on the teacher side');
  await t.goto(`${BASE}/en/requests?requestId=${openRequestId}`, { waitUntil: 'networkidle' });
  await t.waitForURL(url => new URL(String(url)).pathname.replace(/\/$/, '') === `/en/teacher/opportunities/${openRequestId}`, { timeout: 15000 });
  await t.locator('[data-testid=offer-form]').waitFor({ timeout: 15000 });
  assert.equal(await t.locator(inline).count(), 0);

  const p = student.page;
  await p.goto(`${BASE}/en/requests`, { waitUntil: 'networkidle' });
  await p.waitForURL(url => new URL(String(url)).pathname.replace(/\/$/, '') === '/en/requests/new', { timeout: 15000 });
  await p.locator('[data-testid=request-modes]').waitFor({ timeout: 15000 });
  await p.goto(`${BASE}/en/requests?requestId=${openRequestId}`, { waitUntil: 'networkidle' });
  await p.waitForURL(url => new URL(String(url)).pathname.replace(/\/$/, '') === `/en/requests/${openRequestId}`, { timeout: 15000 });
  await p.locator('[data-testid=request-status]').waitFor({ timeout: 15000 });
  assert.equal(await p.locator(inline).count(), 0, 'no inline marketplace on the student side');
  assert.equal(sql(`SET NOCOUNT ON; SELECT COUNT(*) FROM TeacherOffers WHERE LearningRequestId = '${openRequestId}'`).trim(), '0', 'redirects send nothing');
  await shot(p, 'requests-forwarded');
});

await step('no page error on any journey', async () => {
  assert.deepEqual([...student.page.problems, ...teacher.page.problems], []);
});

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} Wave 2 journeys passed`);
if (failed.length) process.exit(1);

// ---- helpers -----------------------------------------------------------------------------
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

function dayInput(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The open-request form is Wave 3, so the request is published through the API. */
async function publishOpenRequest() {
  const login = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: SEED.student.Email, password: PASSWORD })
  });
  assert.equal(login.status, 200);
  const { accessToken } = await login.json();
  const published = await fetch(`${BASE}/api/v1/open-marketplace/requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      subjectId: SEED.subjectId, serviceCatalogItemId: SEED.catalogId, title: openTitle,
      requirements: 'Every exercise in chapter four, please.', deadline: new Date(Date.now() + 4 * 86_400_000).toISOString(),
      budgetMin: null, budgetMax: null
    })
  });
  const text = await published.text();
  assert.equal(published.status, 201, text);
  return JSON.parse(text).id;
}

function sql(query) {
  return execSql(DATABASE, query);
}
