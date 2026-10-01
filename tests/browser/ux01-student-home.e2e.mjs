/* UX-01 end-to-end: the student's home answers what to do next, not what rows exist.
 *
 *   1. A brand-new student opens Home in Arabic at 390px: a welcome, and the two ways to start —
 *      no entity grid, no search box, no Refresh, no numeric status, no id.
 *   2. Both start cards open the canonical flows (/teachers, /requests/new).
 *   3. A sent request is work in progress, not something demanding the student.
 *   4. The teacher accepts: paying becomes the first thing on the home, as the one filled button,
 *      and it opens that order's own checkout.
 *   5. After paying, the same item reads as in progress and asks for nothing.
 *   6. A booked live session appears as the next session, with its own screen one tap away.
 *   7. Arabic at 390px throughout: no horizontal scroll, no English product words, 44px targets.
 *
 * Same environment variables as tests/browser/wave3b-harness.mjs; the Wave 3B fulfilment seed.
 * Every state on the home is created through the product's own flows; the database is only read.
 */
import assert from 'node:assert/strict';
import {
  BASE, SEED, acceptRequest, attribute, context, finish, noHorizontalOverflow, pathOf, payInSimulator,
  registerStudent, sendDirectRequest, shot, signIn, spa, sql, start, step, visit, waitForCall, waitUntil, pickSlot
} from './wave3b-harness.mjs';

const stamp = Date.now();
const studentEmail = `ux01-student-${stamp}@example.test`;
const studentPassword = `Ux01!Home-${stamp}`;
const directTitle = `شرح قاعدة السلسلة ${stamp}`;
const sessionTitle = `جلسة المعدلات المرتبطة ${stamp}`;
const PRICE = 180;
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

await start();
// The student is the case that matters: Arabic, on a phone.
const student = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-SA' });
const teacher = await context();
let orderId = '';
let sessionId = '';

const home = {
  welcome: () => student.page.locator('[data-testid=home-welcome]'),
  greeting: () => student.page.locator('[data-testid=home-greeting]'),
  actions: () => student.page.locator('[data-testid=home-action-card]'),
  current: () => student.page.locator('[data-testid=home-current-card]'),
  upcoming: () => student.page.locator('[data-testid=home-upcoming]'),
  nothing: () => student.page.locator('[data-testid=home-nothing-needed]')
};

/** Loads the home and waits for it to have decided what to show. */
async function openHome() {
  await visit(student.page, `${BASE}/ar/student/overview`);
  await student.page.locator('[data-testid=home-start]').waitFor({ timeout: 20000 });
  return student.page;
}

/** The address a card opens; the client writes the trailing slash, which is not part of the route. */
const href = async locator => (await locator.getAttribute('href') ?? '').replace(/\/(?=\?|$)/, '');

/** Everything the home says, as one string. */
const homeText = async page => (await page.locator('.tf-home').innerText()).replace(/\s+/g, ' ').trim();

/** The 390×844 fold: what the student sees without scrolling. */
async function aboveTheFold(locator, what) {
  const box = await locator.boundingBox();
  assert.ok(box, `${what} is on the screen`);
  assert.ok(box.y + box.height <= 844, `${what} is above the fold (ends at ${Math.round(box.y + box.height)}px)`);
}

await step('1. a brand-new student is welcomed and told how to start, not shown an empty database', async () => {
  await registerStudent(student, `طالبة UX-01 ${stamp}`, studentEmail, studentPassword);
  const page = await openHome();

  assert.match(await home.welcome().innerText(), /أهلًا طالبة، كيف نساعدك اليوم؟/);
  assert.equal(await home.actions().count(), 0, 'nothing is waiting, so nothing pretends to be');
  assert.equal(await home.current().count(), 0);
  assert.equal(await home.upcoming().count(), 0);
  assert.equal(await home.nothing().count(), 0, 'a new student is not told their empty list is calm');

  // The entity explorer is gone: no grid, no search box, no Refresh button, no numeric status.
  assert.equal(await page.locator('.tf-dashboard-grid, .tf-dashboard-search, .tf-dashboard-card').count(), 0);
  assert.equal(await page.locator('.tf-home button').count(), 0, 'nothing on the home acts on an item');
  const text = await homeText(page);
  assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-/i, `no id on the home (${text})`);
  assert.doesNotMatch(text, /\bnull\b|\bundefined\b|\bNaN\b/);
  assert.doesNotMatch(text, /[A-Za-z]{3,}/, `the Arabic home carries no English product words (${text})`);

  const cards = page.locator('[data-testid=home-find-teacher], [data-testid=home-post-request]');
  assert.equal(await cards.count(), 2, 'both ways to start are offered');
  for (const card of await cards.all()) {
    const box = await card.boundingBox();
    assert.ok(box && box.height >= 44, `a start card is a 44px target (${box?.height}px)`);
  }
  // AC9: the welcome and both ways to start are visible without scrolling.
  await aboveTheFold(home.welcome(), 'the welcome');
  await aboveTheFold(page.locator('[data-testid=home-post-request]'), 'the second start card');
  await noHorizontalOverflow(page, 'student home, new student');
  await shot(page, 'ux01-home-new-student-ar');
});

await step('2. the two start cards open the canonical flows', async () => {
  const { page } = student;
  await page.locator('[data-testid=home-find-teacher]').click();
  await page.waitForURL(url => pathOf(url) === '/ar/teachers', { timeout: 20000 });

  await openHome();
  await page.locator('[data-testid=home-post-request]').click();
  await page.waitForURL(url => pathOf(url) === '/ar/requests/new', { timeout: 20000 });
});

await step('3. a request the teacher has not answered is in progress, not an action', async () => {
  await signIn(teacher, SEED.teacherA.Email);
  // Step 2 left the client on the request-mode choice; a full load starts the wizard from the beginning.
  await openHome();
  const requestId = await sendDirectRequest(student, SEED.teacherA, directTitle);
  const page = await openHome();

  assert.match(await home.greeting().innerText(), /أهلًا طالبة/);
  assert.equal(await home.actions().count(), 0, 'the student is waiting for the teacher, not the other way round');
  assert.match(await home.nothing().innerText(), /لا يوجد ما يحتاج انتباهك الآن\./);
  const current = home.current().first();
  await current.waitFor({ timeout: 20000 });
  assert.match(await current.innerText(), new RegExp(escape(directTitle)));
  assert.match(await current.innerText(), /بانتظار المعلم/, 'it says its state in product words');
  assert.equal(await href(current.locator('a')), `/ar/requests/${requestId}`,
    'the card opens the request itself, not a dashboard section');
  await noHorizontalOverflow(page, 'student home, work in progress');

  orderId = await acceptRequest(teacher, requestId, PRICE);
});

await step('4. once the teacher accepts, paying is the first thing on the home', async () => {
  const page = await openHome();
  const first = home.actions().first();
  await first.waitFor({ timeout: 20000 });

  assert.equal(await home.actions().count(), 1, 'one thing is waiting, and it is named once');
  assert.match(await first.innerText(), /المعلم قبل طلبك — أكمل الدفع/);
  // What the card names is what the student pays — the total with the platform fee, not the agreed price.
  const studentTotal = Number(sql(`SELECT StudentTotal FROM Orders WHERE Id = '${orderId}'`));
  assert.ok(studentTotal > PRICE, `the total carries the fee (${studentTotal} > ${PRICE})`);
  const shown = studentTotal.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(studentTotal) ? 0 : 2 });
  const amount = first.locator('[data-testid=home-card-amount]');
  const money = (await amount.innerText()).replace(/\s+/g, ' ').trim();
  assert.match(money, new RegExp(`المبلغ[^\\d]*${escape(shown)}$`), `the amount is named (${JSON.stringify(money)})`);
  assert.ok(!money.includes('SAR'), `the currency is not Latin letters (${JSON.stringify(money)})`);
  assert.equal(await amount.locator('.tf-price-currency--mark').count(), 1, 'SAR is drawn as the riyal mark');
  const cta = first.locator('[data-testid=home-card-cta]');
  assert.equal(await cta.innerText(), 'ادفع الآن');
  assert.equal(await cta.getAttribute('class'), 'tf-button', 'the first action is the one filled button');
  assert.equal(await href(cta), `/ar/checkout?orderId=${orderId}`);
  // The request it came from is not repeated underneath as a second copy of the same work.
  assert.equal(await home.current().count(), 0);
  // AC9: the greeting and everything that needs the student are read without scrolling.
  await aboveTheFold(home.greeting(), 'the greeting');
  await aboveTheFold(home.actions().last(), 'the last action card');
  await noHorizontalOverflow(page, 'student home, payment waiting');
  await shot(page, 'ux01-home-action-required-ar');

  await cta.click();
  await page.waitForURL(url => pathOf(url) === '/ar/checkout', { timeout: 20000 });
  await payInSimulator(page, new RegExp(`^/(ar|en)/orders/${orderId}$`));
  await attribute(page, '[data-testid=order-status]', 'data-payment', 1);
});

await step('5. after paying, the same work asks for nothing and reads as in progress', async () => {
  const page = await openHome();
  const current = home.current().first();
  await current.waitFor({ timeout: 20000 });

  assert.equal(await home.actions().count(), 0, 'the student has done their part');
  assert.match(await current.innerText(), /تم الدفع|قيد التنفيذ/);
  assert.equal(await href(current.locator('a')), `/ar/orders/${orderId}`);
  assert.equal(sql(`SELECT PaymentStatus FROM Orders WHERE Id = '${orderId}'`), '1', 'the order really was paid');
  await shot(page, 'ux01-home-in-progress-ar');
});

await step('6. a booked session becomes the next session, one tap from its own screen', async () => {
  const { page } = student;
  // Payments are limited to 10 a minute per student: the booking's payment waits for the window.
  await waitUntil(Date.now() + 61_000, 'the payment limit window resets');
  await spa(student, `/sessions/book?teacherId=${SEED.teacherA.Id}&teacherServiceId=${SEED.teacherA.liveServiceId}`);
  await page.locator('#book-session-title').fill(sessionTitle);
  await page.locator('#book-topic').fill('مسائل المعدلات المرتبطة: السلّم والخزان المخروطي.');
  // A later slot, so the session is genuinely upcoming rather than one the student can already join.
  await pickSlot(page, 6);
  const created = waitForCall(page, 'POST', /^\/api\/v1\/live-sessions$/);
  await page.locator('button.tf-book-confirm').click();
  const booked = await created;
  assert.equal(booked.status(), 201, 'booked');
  sessionId = (await booked.json()).id;
  await page.waitForURL(url => pathOf(url) === `/ar/live-sessions/${sessionId}`, { timeout: 20000 });
  await attribute(page, '[data-testid=session-status]', 'data-status', 9);
  await visit(teacher.page, `${BASE}/en/live-sessions/${sessionId}`);
  await teacher.page.locator('[data-testid=accept-session-request]').click();
  await attribute(teacher.page, '[data-testid=session-status]', 'data-status', 0);
  await visit(page, `${BASE}/ar/live-sessions/${sessionId}`);
  await page.locator('[data-testid=pay-session]').click();
  await page.waitForURL(url => pathOf(url) === '/ar/checkout', { timeout: 20000 });
  await payInSimulator(page, new RegExp(`^/(ar|en)/live-sessions/${sessionId}$`));
  await attribute(page, '[data-testid=session-status]', 'data-status', 1);

  await openHome();
  const upcoming = home.upcoming();
  await upcoming.waitFor({ timeout: 20000 });
  const text = await upcoming.innerText();
  assert.match(text, /جلستك القادمة/);
  assert.match(text, new RegExp(escape(sessionTitle)));
  assert.match(text, /مؤكدة/, 'the session says its state in product words');
  assert.match(text, /تبدأ/, 'and when it starts, in words the student reads');
  assert.equal(await href(upcoming.locator('[data-testid=home-session-open]')), `/ar/live-sessions/${sessionId}`);
  assert.equal(await home.actions().count(), 0, 'a paid, confirmed session is not an outstanding task');
});

await step('7. the whole home stays Arabic, inside the phone, and free of machine words', async () => {
  const page = await openHome();
  const text = await homeText(page);
  assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-/i, `no id on the home (${text})`);
  assert.doesNotMatch(text, /\bnull\b|\bundefined\b|\bNaN\b|\[object/);
  assert.doesNotMatch(text, /[A-Za-z]{3,}/, `no English product word on the Arabic home (${text})`);
  assert.doesNotMatch(text, /العملة|آخر تحديث|الحالة:/, `no entity-explorer label (${text})`);
  assert.equal(await page.locator('.tf-home .tf-badge').filter({ hasText: /^\s*-?\d+\s*$/ }).count(), 0,
    'no status is a number');

  for (const link of await page.locator('.tf-home a').all()) {
    const box = await link.boundingBox();
    assert.ok(box && box.height >= 44, `every tap target is 44px (${(await link.innerText()).slice(0, 24)}: ${box?.height}px)`);
  }
  await noHorizontalOverflow(page, 'student home, full');
  await shot(page, 'ux01-home-full-ar');
  await page.setViewportSize({ width: 1600, height: 900 });
  await noHorizontalOverflow(page, 'student home, desktop');
  const paidCard = home.current().first();
  const badgeBox = await paidCard.locator('.tf-badge').boundingBox();
  const details = paidCard.locator('[data-testid=home-card-open]');
  const detailsBox = await details.boundingBox();
  assert.ok(badgeBox && detailsBox && Math.abs(badgeBox.x - detailsBox.x) >= 24,
    'the payment status and details button occupy separate parts of the card');
  assert.notEqual(await details.evaluate(node => getComputedStyle(node).borderStyle), 'none',
    'details reads as a button');
  await shot(page, 'ux01-home-full-ar-desktop');

  // Home is the student's own: it is not reachable by a teacher, and not a dashboard section.
  await visit(teacher.page, `${BASE}/en/student/overview`);
  await teacher.page.waitForURL(url => !pathOf(url).startsWith('/en/student'), { timeout: 20000 });
});

await step('no script errors on any page', async () => {
  for (const actor of [student, teacher])
    assert.deepEqual(actor.page.problems, [], 'no page errors');
});

await finish('UX-01 student home');
