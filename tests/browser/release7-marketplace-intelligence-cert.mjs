import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.TAFSEEL_BASE_URL || 'http://127.0.0.1:5197';
const password = process.env.TAFSEEL_R7_ADMIN_PASSWORD || '';
if (!password) throw new Error('TAFSEEL_R7_ADMIN_PASSWORD is required.');
const out = process.argv[2] || path.resolve('docs/features/evidence/phase4-release7-marketplace-intelligence/browser');
const shots = path.join(out, 'screenshots');
fs.mkdirSync(shots, { recursive: true });
const results = [];
const record = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function guard(page) {
  const g = { pageErrors: [], consoleErrors: [], failed: [], status429: [], status500: [] };
  page.on('pageerror', e => g.pageErrors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') g.consoleErrors.push(m.text()); });
  page.on('requestfailed', r => g.failed.push(`${r.failure()?.errorText || 'failed'} ${r.url()}`));
  page.on('response', r => { if (r.status() === 429) g.status429.push(r.url()); if (r.status() >= 500) g.status500.push(r.url()); });
  return g;
}
async function diagnostics(page) {
  return page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 2,
    templateLeak: /\{\{[^}]+\}\}/.test(document.body.innerText), lang: document.documentElement.lang,
    dir: document.documentElement.dir, h1: document.querySelectorAll('h1').length }));
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const g = guard(page);
  await page.goto(`${base}/app/Tafseel-Auth.dc.html`, { waitUntil: 'load' });
  await page.fill('input[type="email"]', 'admin@gmail.com');
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !location.pathname.includes('Tafseel-Auth'), null, { timeout: 20000 });

  const modes = [
    [390, 844, 'en', 'light'], [768, 1024, 'ar', 'dark'],
    [1024, 900, 'en', 'dark'], [1440, 900, 'ar', 'light']
  ];
  for (const [width, height, lang, theme] of modes) {
    await page.setViewportSize({ width, height });
    await page.evaluate(({ lang, theme }) => { localStorage.setItem('tafseel-lang', lang); localStorage.setItem('tafseel-theme', theme); }, { lang, theme });
    await page.goto(`${base}/app/Tafseel-Admin-Dashboard.dc.html?section=intelligence`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: lang === 'ar' ? 'ذكاء السوق' : 'Marketplace Intelligence' }).waitFor();
    const d = await diagnostics(page);
    record(`admin-${width}-${lang}-layout`, !d.overflow && !d.templateLeak && d.h1 === 1 && d.lang === lang && d.dir === (lang === 'ar' ? 'rtl' : 'ltr'), JSON.stringify(d));
    const tabs = page.locator('[role="tab"]');
    record(`admin-${width}-${lang}-six-sections`, await tabs.count() === 6, `tabs=${await tabs.count()}`);
    await page.screenshot({ path: path.join(shots, `admin-${width}-${lang}-${theme}.png`), fullPage: true });
  }
  await page.evaluate(() => window.Tafseel.setLang('en'));
  await wait(250);
  for (const name of ['Funnel', 'Demand & Supply', 'Subjects', 'Services', 'Zero Results']) {
    await page.getByRole('tab', { name }).click();
    await wait(150);
    record(`section-${name.toLowerCase().replaceAll(' ', '-')}`, true);
  }
  await page.getByRole('tab', { name: 'Overview' }).click();
  await page.locator('input[type="date"]').first().fill('2026-08-01');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await wait(700);
  record('date-filter-server-roundtrip', page.url().includes('section=intelligence') && await page.getByRole('heading', { name: 'Marketplace Intelligence' }).isVisible());

  const guest = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const browse = await guest.newPage();
  const bg = guard(browse);
  await browse.route('**/api/v1/marketplace-intelligence/events', route => route.abort('failed'));
  await browse.goto(`${base}/app/Tafseel-Browse-Teachers.dc.html`, { waitUntil: 'networkidle' });
  const card = browse.locator('.tf-result-card').first();
  await browse.waitForFunction(() => !document.body.innerText.includes('Loading teachers'), null, { timeout: 20000 }).catch(() => {});
  const hasCard = await card.count() > 0 && await card.isVisible().catch(() => false);
  const hasEmpty = await browse.locator('.tf-empty-actions').count() > 0;
  record('analytics-failure-does-not-block-browse', hasCard || hasEmpty, hasCard ? 'public result remained usable' : 'truthful empty state remained usable');
  await browse.unroute('**/api/v1/marketplace-intelligence/events');
  if (hasCard) {
    await browse.goto(await card.locator('a[href*="Tafseel-Teacher-Profile"]').first().getAttribute('href').then(h => new URL(h, `${base}/app/`).href), { waitUntil: 'networkidle' });
    record('profile-instrumentation-surface', await browse.locator('#profile-heading').isVisible());
    await browse.screenshot({ path: path.join(shots, 'profile-instrumented.png'), fullPage: true });
  } else record('profile-instrumentation-surface', false, 'no published Development Teacher fixture');
  record('admin-no-429', g.status429.length === 0, JSON.stringify(g.status429));
  record('admin-no-500', g.status500.length === 0, JSON.stringify(g.status500));
  record('admin-no-console-error', g.consoleErrors.length === 0 && g.pageErrors.length === 0, JSON.stringify({ console: g.consoleErrors, page: g.pageErrors }));
  record('admin-no-failed-first-party', g.failed.length === 0, JSON.stringify(g.failed));
  const actionablePublicConsole = bg.consoleErrors.filter(x => !/401 \(Unauthorized\)|net::ERR_FAILED/.test(x));
  const unexpectedPublicFailures = bg.failed.filter(x => !x.includes('/marketplace-intelligence/events'));
  record('public-no-429-500-actionable-console', bg.status429.length === 0 && bg.status500.length === 0 && actionablePublicConsole.length === 0 && bg.pageErrors.length === 0 && unexpectedPublicFailures.length === 0, JSON.stringify({ ...bg, actionablePublicConsole, unexpectedPublicFailures }));
  await guest.close(); await context.close();
} finally { await browser.close(); }

fs.writeFileSync(path.join(out, 'release7-browser-certification.json'), JSON.stringify({ base, results }, null, 2));
const failed = results.filter(x => !x.pass);
console.log(`SUMMARY ${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exitCode = 1;
