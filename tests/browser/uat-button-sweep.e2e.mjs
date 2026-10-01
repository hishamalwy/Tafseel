/* UAT: every screen of every role, and every button and link on it, in a real browser.
 *
 * The functional journeys prove the business cycles one path at a time. This one asks the question a
 * person clicking around would: does anything on any screen break, lead nowhere, or do nothing?
 *
 * For the visitor, a student with real work, a published teacher with real work, the Quality reviewer
 * and the Admin, in English on desktop and in Arabic on a 390px phone, each screen is loaded and then:
 *
 *   - every internal link is followed and must land on a screen, never the 404 page;
 *   - every button that does not commit a business action (those are the journeys' job, with real
 *     data) is clicked; it must not throw, must not make the server answer 5xx, and must visibly do
 *     something — change the page, open something, navigate, or call the API;
 *   - the page must not show `undefined`, `null`, `NaN`, `[object Object]` or a raw `snake_key`.
 *
 * Every finding is collected rather than stopping at the first, and printed as one report per role.
 * Same environment variables as tests/browser/wave3b-harness.mjs; the Wave 3B fulfilment seed.
 */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, SEED, acceptRequest, context, finish, pathOf, sendDirectRequest, signIn, start, step, visit } from './wave3b-harness.mjs';

/** Buttons that commit something; the journeys exercise them with the data they need. */
const COMMITS = /sign ?out|log ?out|تسجيل الخروج|خروج|delete|حذف|remove|إزالة|withdraw|سحب|deactivat|close account|إغلاق الحساب|suspend|إيقاف|reject|رفض|decline|اعتذار|archive|أرشف|revoke|إلغاء|cancel|approve|اعتماد|قبول|accept|publish|نشر|unpublish|pay|ادفع|دفع|send|إرسال|أرسل|submit|deliver|تسليم|complete|إكمال|أكمل|confirm|تأكيد|أكّد|start|ابدأ|بدء|resolve|refund|استرداد|dispute|نزاع|report|إبلاغ|save|حفظ|احفظ|apply|تقديم|قدّم|upload|رفع|ارفع|book|احجز|حجز|join|انضم|request changes|disable|تعطيل|enable|تفعيل|mark all|reset|verify|توثيق/i;

const roles = [
  { name: 'visitor', email: null, routes: ['/', '/about', '/teachers', 'TEACHER', '/policies/terms', '/policies/privacy', '/auth', '/requests/new'] },
  { name: 'student', email: 'STUDENT', routes: ['/student/overview', '/student/requests', '/student/saved', '/account',
    '/requests/new', '/requests/new/open', '/messages', '/teachers', 'TEACHER', 'ORDER', '/disputes'] },
  { name: 'teacher', email: SEED.teacherA.Email, routes: ['/teacher/home', '/teacher/work', '/teacher/opportunities', '/teacher/messages',
    '/teacher/profile', '/teacher/services', '/teacher/availability', '/teacher/publication', '/teacher/qualifications',
    '/teacher/earnings', '/account', '/teach/apply', 'ORDER'] },
  { name: 'reviewer', email: SEED.reviewer.Email, routes: ['/quality/applications', '/quality/review', '/account', '/help'] },
  { name: 'admin', email: SEED.admin.Email, routes: ['/admin/home', '/admin/people', '/admin/marketplace', '/admin/operations',
    '/admin/help', '/finance/home', '/admin/system', '/account', '/disputes', 'ORDER'] },
  // PRODUCT-P1: the Finance role's own workspace, and nothing of Admin's.
  { name: 'finance', email: SEED.finance.Email, routes: ['/finance/home', '/finance/payments', '/finance/withdrawals',
    '/finance/payout-profiles', '/finance/reconciliation', '/finance/audit', '/account', '/help'] }
];

const findings = [];
const report = (role, where, kind, detail) => {
  findings.push({ role, where, kind, detail });
  console.log(`  ! [${role}] ${where} — ${kind}: ${detail}`);
};
let orderId = '';
const clicked = { buttons: 0, links: 0, screens: 0 };

function resolve(route) {
  if (route === 'TEACHER') return `/teachers/${SEED.teacherA.Id}`;
  if (route === 'ORDER') return orderId ? `/orders/${orderId}` : null;
  return route;
}

/** Watches one page for trouble: script errors, 5xx answers, and what each click caused. */
function instrument(page, role) {
  page.serverErrors = [];
  page.apiCalls = 0;
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (!path.startsWith('/api/')) return;
    page.apiCalls++;
    if (response.status() >= 500) page.serverErrors.push(`${response.request().method()} ${path} → ${response.status()}`);
  });
  page.on('console', message => {
    if (message.type() === 'error' && !/Failed to load resource|401|403|404|409|422|400/.test(message.text()))
      page.problems.push(`console: ${message.text().slice(0, 200)}`);
  });
  return page;
}

async function pageText(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main') ?? document.body;
    return main.innerText;
  });
}

async function checkText(page, role, where) {
  const text = await pageText(page);
  for (const bad of ['undefined', 'NaN', '[object Object]'])
    if (text.includes(bad)) report(role, where, 'broken text', `shows «${bad}»`);
  if (/(^|\s)null(\s|$)/.test(text)) report(role, where, 'broken text', 'shows «null»');
  const keys = text.match(/\b[a-z]{2,}(?:_[a-z0-9]+){2,}\b/g)?.filter(k => !k.includes('@') && !/^[a-z]+_[a-z]+_[a-z]+\.(png|pdf|mp4)$/.test(k));
  if (keys?.length) report(role, where, 'raw key', [...new Set(keys)].slice(0, 5).join(', '));
}

async function landed(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  return (await page.locator('[data-testid=not-found]').count()) === 0;
}

/** Every internal link on the screen must reach a screen. */
async function followLinks(actor, role, where, route, seen) {
  const { page, locale } = actor;
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('a[href]')]
    .filter(a => a.offsetParent !== null || a.getClientRects().length)
    .map(a => a.getAttribute('href'))
    .filter(h => h && !h.startsWith('http') && !h.startsWith('mailto:') && !h.startsWith('tel:') && !h.startsWith('#')));
  for (const href of [...new Set(hrefs)]) {
    const absolute = new URL(href, page.url());
    const key = `${absolute.pathname}${absolute.search}`;
    if (seen.has(key) || /\/auth\/(confirm-email|reset)|\/api\/|sign-?out/.test(key)) continue;
    seen.add(key);
    clicked.links++;
    const response = await page.goto(absolute.href, { waitUntil: 'networkidle' }).catch(e => ({ status: () => 0, error: e }));
    if (!response || response.status() >= 400) report(role, where, 'dead link', `${href} → HTTP ${response?.status?.()}`);
    else if (!(await landed(page))) report(role, where, 'dead link', `${href} → 404 screen`);
  }
  await visit(page, `${BASE}/${locale}${route}`);
}

/** Clicks every non-committing button; each must do something and break nothing. */
async function clickButtons(actor, role, where, route) {
  const { page, locale } = actor;
  if (route === '/') {
    // The timed campaign dialog is modal. Dismiss it as a visitor would before auditing the page behind it.
    await page.waitForTimeout(800);
    const close = page.locator('.tf-promo-wizard-close');
    if (await close.count()) {
      await close.click();
      await close.waitFor({ state: 'hidden' });
    }
  }
  const count = await page.locator('main button:visible, header button:visible').count();
  for (let i = 0; i < count; i++) {
    // Each click gets the same starting screen: menus and filters can cover or reorder later buttons.
    await visit(page, `${BASE}/${locale}${route}`);
    const buttons = page.locator('main button:visible, header button:visible');
    if (i >= await buttons.count()) break;
    const button = buttons.nth(i);
    const label = ((await button.getAttribute('aria-label')) || (await button.innerText().catch(() => '')) || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const type = await button.getAttribute('type');
    if (await button.isDisabled()) continue;
    if (!label) { report(role, where, 'unnamed button', `button #${i} has no accessible name`); continue; }
    if (COMMITS.test(label) || type === 'submit') continue;
    // Already the current tab, filter, step or choice: pressing it again rightly changes nothing. The language
    // switch is left alone so every screen after it is still read in the language this pass is about.
    const current = await button.evaluate(b => b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-selected') === 'true'
      || ['page', 'step', 'true'].includes(b.getAttribute('aria-current') ?? '') || b.classList.contains('active')
      || b.classList.contains('is-active') || !!b.closest('tf-lang-toggle, .tf-lang-toggle') || b.classList.contains('tf-lang-toggle'));
    if (current) continue;
    const before = { url: page.url(), calls: page.apiCalls, problems: page.problems.length, errors: page.serverErrors.length };
    // The whole document, not only <body>: the theme and language live on <html>. Form values are compared
    // too, because a control filled through a property binding changes no attribute an observer could see.
    await page.evaluate(() => {
      window.__mutations = 0;
      window.__values = [...document.querySelectorAll('input, select, textarea')].map(e => e.value).join('\u0000');
      window.__observer?.disconnect();
      window.__observer = new MutationObserver(list => { window.__mutations += list.length; });
      window.__observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    });
    // A window the page opened by itself (the landing's campaign) stands in front of the page, as it
    // would for a person, who closes it first; a button inside it is pressed where it is.
    if (await button.evaluate(b => [...document.querySelectorAll('[aria-modal=true]')].some(m => m.getClientRects().length && !m.contains(b)))) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
    clicked.buttons++;
    try { await button.click({ timeout: 5000 }); }
    catch {
      // Name what lies over the button, so the finding says why a person could not press it either.
      const cover = await button.evaluate(b => {
        const r = b.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const name = e => e ? `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${[...e.classList].map(c => '.' + c).join('')}` : 'nothing';
        return top === b || b.contains(top) ? 'nothing (off-screen or moving)' : `${name(top)} in ${name(top?.parentElement)}`;
      }).catch(() => 'unknown');
      report(role, where, 'unclickable button', `«${label}» is covered by ${cover}`);
      continue;
    }
    await page.waitForTimeout(600);
    await page.waitForLoadState('networkidle').catch(() => {});
    const mutations = await page.evaluate(() => (window.__mutations ?? 0)
      + ([...document.querySelectorAll('input, select, textarea')].map(e => e.value).join('\u0000') === window.__values ? 0 : 1)).catch(() => 1);
    const moved = page.url() !== before.url;
    if (page.problems.length > before.problems) report(role, where, 'script error', `«${label}»: ${page.problems.slice(before.problems).join(' | ').slice(0, 300)}`);
    if (page.serverErrors.length > before.errors) report(role, where, 'server error', `«${label}»: ${page.serverErrors.slice(before.errors).join(', ')}`);
    if (!moved && mutations === 0 && page.apiCalls === before.calls) report(role, where, 'button does nothing', `«${label}»`);
    if (moved) {
      if (!(await landed(page))) report(role, where, 'dead button', `«${label}» → 404 screen`);
      await visit(page, `${BASE}/${locale}${route}`);
    } else {
      await page.keyboard.press('Escape').catch(() => {});
      if (await page.locator('dialog[open]').count()) await page.locator('dialog[open] button[value=cancel], dialog[open] button.tf-dialog-close').first().click().catch(() => {});
      // The phone navigation drawer does not close on Escape; a person taps outside it. The sweep sends that tap
      // to the drawer's own close overlay, or the overlay would cover every button clicked after it.
      const overlay = page.locator('[data-drawer-overlay=open], .tf-dashboard-backdrop');
      if (await overlay.count()) await overlay.first().dispatchEvent('click').catch(() => {});
    }
  }
}

async function sweep(role, email, routes, options) {
  const actor = await context(options);
  instrument(actor.page, role.name);
  if (email) await signIn(actor, email);
  const seen = new Set();
  for (const raw of routes) {
    const route = resolve(raw);
    if (!route) continue;
    const where = `${actor.locale} ${route}`;
    actor.page.problems.length = 0;
    const response = await visit(actor.page, `${BASE}/${actor.locale}${route}`);
    clicked.screens++;
    if (!response || response.status() >= 400) { report(role.name, where, 'screen fails', `HTTP ${response?.status()}`); continue; }
    if (!(await landed(actor.page))) { report(role.name, where, 'screen missing', '404 screen'); continue; }
    if (pathOf(actor.page.url()).endsWith('/auth') && role.email) report(role.name, where, 'bounced to sign-in', route);
    if (actor.page.problems.length) report(role.name, where, 'script error on load', actor.page.problems.join(' | ').slice(0, 300));
    if (actor.page.serverErrors.length) report(role.name, where, 'server error on load', actor.page.serverErrors.join(', '));
    actor.page.serverErrors.length = 0;
    await checkText(actor.page, role.name, where);
    await clickButtons(actor, role.name, where, route);
    await followLinks(actor, role.name, where, route, seen);
  }
  await actor.ctx.close();
}

await start();

let studentEmail = '';
await step('setting: a student with a request the teacher has accepted', async () => {
  const student = await context();
  studentEmail = SEED.outsider.Email;
  await signIn(student, studentEmail);
  const requestId = await sendDirectRequest(student, SEED.teacherA, 'UAT sweep request');
  const teacher = await context();
  await signIn(teacher, SEED.teacherA.Email);
  orderId = await acceptRequest(teacher, requestId, 120);
  assert.match(String(orderId), /^[0-9a-f-]{36}$/, 'an order exists to open');
  await student.ctx.close();
  await teacher.ctx.close();
});

for (const role of roles) {
  const email = role.email === 'STUDENT' ? studentEmail : role.email;
  await step(`${role.name}: every screen, link and button (English, desktop)`, () => sweep(role, email, role.routes, {}));
  await step(`${role.name}: every screen, link and button (Arabic, 390px phone)`, () =>
    sweep(role, email, role.routes, { viewport: { width: 390, height: 844 }, locale: 'ar-SA', isMobile: true, hasTouch: true }));
}

await step('report', async () => {
  const lines = [`# UAT sweep: ${clicked.screens} screens, ${clicked.buttons} buttons clicked, ${clicked.links} links followed`, '',
    '| Role | Where | Finding | Detail |', '|---|---|---|---|',
    ...findings.map(f => `| ${f.role} | ${f.where} | ${f.kind} | ${f.detail.replace(/\|/g, '\\|')} |`)];
  const out = process.env.TAFSEEL_SHOT_DIR ? join(process.env.TAFSEEL_SHOT_DIR, 'uat-sweep.md') : null;
  if (out) writeFileSync(out, `${lines.join('\n')}\n`);
  console.log(`\n${lines.join('\n')}\n`);
  assert.deepEqual(findings, [], `${findings.length} findings`);
});

await finish('UAT sweep');
