/* Smoke test for a seeded environment (docs/ENVIRONMENTS.md): every role signs in with its demo account and the
 * screens it needs answer without an error. Not a journey on a fresh database: it runs against Staging or
 * PreProduction as seeded by `seed` / `reset-database`, and leaves the Finance role and the seeded money as it found them
 * (it adds one open request from the student).
 *
 *   TAFSEEL_BASE_URL=https://tafseel.runasp.net  TAFSEEL_SEED_PASSWORD=<the environment's seed password>
 *   node tests/browser/preproduction-smoke.mjs
 *
 * Set the password in your own shell (for example `$env:TAFSEEL_SEED_PASSWORD = Read-Host`); never on the command line.
 */
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const BASE = (process.env.TAFSEEL_BASE_URL ?? '').replace(/\/$/, '');
const PASSWORD = process.env.TAFSEEL_SEED_PASSWORD ?? '';
if (!BASE || !PASSWORD) { console.error('Set TAFSEEL_BASE_URL and TAFSEEL_SEED_PASSWORD.'); process.exit(2); }
const SHOTS = process.env.TAFSEEL_SMOKE_SHOTS ?? '';
const stamp = Date.now();
const results = [];
const browser = await chromium.launch();

async function actor(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US', ...options });
  const page = await context.newPage();
  page.failures = [];
  page.on('pageerror', error => page.failures.push(`script error: ${error}`));
  page.on('response', response => {
    if (response.url().includes('/api/') && response.status() >= 500) page.failures.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return { context, page, lang: String(options.locale ?? 'en').startsWith('ar') ? 'ar' : 'en' };
}

async function signIn(who, email) {
  const { page, lang } = who;
  await page.goto(`${BASE}/${lang}/auth`, { waitUntil: 'networkidle' });
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(PASSWORD);
  await page.locator('form button[type=submit]').first().click();
  await page.waitForURL(url => !/\/auth\/?$/.test(new URL(String(url)).pathname), { timeout: 30000 });
}

/** Opens a screen and requires: it stays there, no error state, the test-mode strip, no 5xx, no script error. */
async function screen(who, path, { contains } = {}) {
  const { page, lang } = who;
  await page.goto(`${BASE}/${lang}${path}`, { waitUntil: 'networkidle' });
  const at = new URL(page.url()).pathname.replace(/\/$/, '');
  assert.equal(at, `/${lang}${path}`.split('?')[0].replace(/\/$/, ''), `${path} is reachable`);
  assert.equal(await page.locator('.tf-alert[data-kind=error], .tf-state[data-state=error]').count(), 0, `${path} shows no error`);
  await page.locator('[data-testid=test-mode-banner]').waitFor({ timeout: 10000 });
  if (contains) await page.getByText(contains).first().waitFor({ timeout: 15000 });
  assert.deepEqual(page.failures, [], `${path}: ${page.failures.join('; ')}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${lang}${path.replace(/[/?=&]/g, '_')}.png`, fullPage: true });
}

async function step(name, run) {
  if (results.some(r => !r.ok)) { results.push({ name, ok: false, skipped: true }); console.log(`- ${name} (skipped)`); return; }
  try { await run(); results.push({ name, ok: true }); console.log(`✓ ${name}`); }
  catch (error) { results.push({ name, ok: false }); console.log(`✗ ${name}\n  ${String(error?.message ?? error).split('\n').slice(0, 6).join('\n  ')}`); }
}

async function setFinance(admin, email, assigned) {
  const { page } = admin;
  await page.goto(`${BASE}/en/admin/people`, { waitUntil: 'networkidle' });
  await page.locator('[data-testid=ops-search]').fill(email);
  await Promise.all([
    page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/admin/users' && r.request().method() === 'GET'),
    page.locator('.tf-dashboard-search-all button[type=submit]').click()
  ]);
  const card = page.locator('.tf-dashboard-card').filter({ has: page.locator('[data-testid=admin-roles]') }).first();
  await card.locator('[data-testid=admin-roles]').click();
  const box = card.locator('[data-testid=admin-roles-panel] label').filter({ hasText: /^\s*Finance\s*$/ }).locator('input');
  assert.equal(await box.isChecked(), !assigned);
  const saved = page.waitForResponse(r => /\/api\/v1\/admin\/users\/[^/]+\/roles$/.test(new URL(r.url()).pathname));
  await box.click();
  await page.locator('dialog.tf-system-dialog[open] button[value=confirm]').click();
  assert.ok((await saved).ok(), 'role change saved');
}

await step('Admin: home, People, help queue, give and take back the Finance role', async () => {
  const admin = await actor();
  await signIn(admin, 'admin@gmail.com');
  await screen(admin, '/admin/home');
  await screen(admin, '/admin/people');
  await screen(admin, '/admin/help');
  await setFinance(admin, 'quality@gmail.com', true);
  await setFinance(admin, 'quality@gmail.com', false);
  await admin.context.close();
});

await step('Finance: home, payments, payout details, withdrawals, reconciliation, audit', async () => {
  const finance = await actor();
  await signIn(finance, 'finance@gmail.com');
  for (const path of ['/finance/home', '/finance/payments', '/finance/payout-profiles', '/finance/withdrawals', '/finance/reconciliation', '/finance/audit'])
    await screen(finance, path);
  await finance.context.close();
});

await step('QualityReviewer: application queue', async () => {
  const reviewer = await actor();
  await signIn(reviewer, 'quality@gmail.com');
  await screen(reviewer, '/quality/applications');
  await reviewer.context.close();
});

await step('Teacher: home, services, qualifications, work, earnings, intro video', async () => {
  const teacher = await actor();
  await signIn(teacher, 'teacher@gmail.com');
  for (const path of ['/teacher/home', '/teacher/services', '/teacher/qualifications', '/teacher/work', '/teacher/earnings', '/teacher/publication'])
    await screen(teacher, path);
  await teacher.context.close();
});

await step('Student: browse, requests, messages, upload-first open request', async () => {
  const student = await actor();
  await signIn(student, 'student@gmail.com');
  await screen(student, '/teachers', { contains: 'Mathematics explained step by step' });
  await screen(student, '/student/requests');
  await screen(student, '/messages');
  const { page } = student;
  await page.goto(`${BASE}/en/`, { waitUntil: 'networkidle' });
  await page.locator('[data-testid=landing-upload]').click();
  await page.locator('[data-testid=upload-first-step]').waitFor({ timeout: 20000 });
  const uploaded = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/open-marketplace/drafts/current/attachments');
  await page.locator('#open-upload-file').setInputFiles({
    name: `smoke-${stamp}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n% smoke ${stamp}\n%%EOF\n`)
  });
  assert.equal((await uploaded).status(), 200, 'clean file accepted after scanning');
  await page.locator('[data-testid=upload-continue]').click();
  await page.locator('#open-subject').selectOption({ label: 'Mathematics' });
  await page.locator('#open-service').selectOption({ index: 1 });
  await page.locator('#open-title').fill(`Smoke request ${stamp}`);
  await page.locator('#open-requirements').fill('Smoke test: explain the attached page step by step.');
  await page.locator('#open-deadline').fill(new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 16));
  const published = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/open-marketplace/requests' && r.request().method() === 'POST');
  await page.locator('[data-testid=publish-open-request]').click();
  const response = await published;
  assert.equal(response.status(), 201, 'request published');
  assert.deepEqual((await response.json()).attachments.map(a => a.originalName), [`smoke-${stamp}.pdf`]);
  assert.deepEqual(page.failures, []);
  await student.context.close();
});

// The old build counted the test-mode strip's capabilities read (one per page) against the student's 10-per-minute
// payment budget, so after about ten pages checkout answered 429. Browse more than that, then spend from the budget.
await step('Student: 15 page loads do not use up the payment budget (no 429 at checkout)', async () => {
  const student = await actor();
  await signIn(student, 'student@gmail.com');
  const { page } = student;
  const capabilities = [];
  let bearer = null; // the app's own token, so the payment call below lands in this student's budget
  page.on('request', r => { bearer = r.headers()['authorization'] ?? bearer; });
  page.on('response', r => { if (new URL(r.url()).pathname === '/api/v1/payments/mock/capabilities') capabilities.push(r.status()); });
  const tour = ['/', '/teachers', '/student/requests', '/messages', '/help', '/account', '/teachers', '/', '/student/requests',
    '/messages', '/help', '/teachers', '/', '/student/requests', '/teachers'];
  for (const path of tour) await page.goto(`${BASE}/en${path}`, { waitUntil: 'networkidle' });
  assert.ok(capabilities.length >= 10, `the test-mode strip read capabilities on each page (${capabilities.length})`);
  assert.deepEqual([...new Set(capabilities)], [200], `capabilities statuses: ${capabilities.join(',')}`);
  assert.ok(bearer, 'the app called the API as the signed-in student');
  const response = await page.request.post(`${BASE}/api/v1/payments/order/${crypto.randomUUID()}/coupon-quote`, {
    headers: { Authorization: bearer, 'Content-Type': 'application/json' }, data: { couponCode: 'SMOKE' }
  });
  const status = response.status();
  assert.notEqual(status, 429, 'a payment-budget endpoint still answers after normal browsing');
  assert.deepEqual(page.failures, []);
  await student.context.close();
});

await step('Student, Arabic phone: landing and upload-first step fit the screen', async () => {
  const phone = await actor({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-SA' });
  await signIn(phone, 'student@gmail.com');
  const { page } = phone;
  await page.goto(`${BASE}/ar/`, { waitUntil: 'networkidle' });
  await page.locator('[data-testid=landing-upload]').click();
  await page.locator('[data-testid=upload-first-step]').waitFor({ timeout: 20000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `no horizontal overflow (${overflow}px)`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/ar-phone-upload-first.png`, fullPage: true });
  await phone.context.close();
});

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} smoke steps passed on ${BASE}`);
process.exit(failed.length ? 1 : 0);
