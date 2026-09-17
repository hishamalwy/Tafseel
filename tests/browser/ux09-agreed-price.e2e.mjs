/* UX-09 end-to-end: the price a student was quoted, and the price they are asked for.
 *
 *   The teacher's offering says 100 when the student sends a direct request. The teacher then edits the
 *   offering to 120 and accepts the request at 150. The student must see both numbers — 100 when they
 *   asked, 150 after the review — on the request, at checkout and on the order, with the fee and the total
 *   built from 150 and never from 100.
 *
 *   A second request is sent against the edited offering and accepted at the same 120: nothing changed, so
 *   there is no comparison to make and the screens say the price once.
 *
 * The student reads in Arabic on a 390px phone throughout, which is where the two-line comparison is most
 * at risk of spilling out of its card.
 */
import assert from 'node:assert/strict';
import {
  BASE, SEED, acceptRequest, api, attribute, context, finish, noHorizontalOverflow, pathOf, payButton,
  payInSimulator, registerStudent, sendDirectRequest, shot, signIn, spa, sql, start, step, visit
} from './wave3b-harness.mjs';

const stamp = Date.now();
const studentEmail = `ux09-student-${stamp}@example.test`;
const studentPassword = `Ux09!Price-${stamp}`;
// The second request needs its own student: the wizard keeps a draft per student, and resuming one would
// send the second request against a service the first had chosen.
const secondEmail = `ux09-second-${stamp}@example.test`;
const secondPassword = `Ux09!Same-${stamp}`;
const changedTitle = `Chain rule at a changed price ${stamp}`;
const unchangedTitle = `Chain rule at the quoted price ${stamp}`;
const teacherA = SEED.teacherA;

/** Wording the disclosure must never use: it is history, not an accusation. */
const FORBIDDEN_AR = ['زيادة السعر', 'السعر المدرج', 'رفع السعر', 'ارتفع السعر'];
const FORBIDDEN_EN = ['listed price', 'price increase', 'price was raised'];

const panelText = async page => {
  const panel = page.locator('[data-testid=price-panel]').first();
  await panel.waitFor({ timeout: 15000 });
  return (await panel.innerText()).replace(/\s+/g, ' ');
};

/** Every number the panel must carry, and none of the wording it must not. */
async function assertPanel(page, where, { amounts, comparison }) {
  const text = await panelText(page);
  for (const amount of amounts) assert.ok(text.includes(amount), `${where}: shows ${amount} — got "${text}"`);
  const rows = page.locator('[data-testid=price-panel]').first();
  assert.equal(await rows.getAttribute('data-comparison'), String(comparison), `${where}: comparison ${comparison}`);
  assert.equal(await rows.locator('[data-testid=price-row-listed]').count(), comparison ? 1 : 0, `${where}: quoted row`);
  const page_text = (await page.locator('main, body').first().innerText()).toLowerCase();
  for (const word of FORBIDDEN_AR) assert.ok(!page_text.includes(word), `${where}: never says «${word}»`);
  for (const word of FORBIDDEN_EN) assert.ok(!page_text.includes(word), `${where}: never says "${word}"`);
  return text;
}

await start();

const student = await context({ viewport: { width: 390, height: 844 }, locale: 'ar-SA', isMobile: true, hasTouch: true });
const teacher = await context();

let changedRequestId = '';
let changedOrderId = '';
let unchangedRequestId = '';
let unchangedOrderId = '';

await step('01 the teacher is offering the recorded explanation at 100', async () => {
  const price = sql(`SELECT Price FROM TeacherServices WHERE Id = '${teacherA.explanationServiceId}'`);
  assert.equal(price, '100.00', 'the seeded offering starts at 100');
});

await step('02 student registers on an Arabic phone and sends a direct request at that price', async () => {
  const { page } = student;
  await registerStudent(student, `طالب السعر ${stamp}`, studentEmail, studentPassword);
  changedRequestId = await sendDirectRequest(student, teacherA, changedTitle);
  assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
  assert.equal(
    sql(`SELECT CONCAT(ListedPriceAtRequest, ':', ListedCurrencyAtRequest) FROM LearningRequests WHERE Id = '${changedRequestId}'`),
    '100.00:SAR', 'the server recorded the price the student was looking at');
});

await step('03 the teacher edits the offering to 120; the request keeps the price it was sent at', async () => {
  const { page } = teacher;
  await signIn(teacher, teacherA.Email);
  await spa(teacher, '/teacher/services');
  const row = page.locator(`[data-testid=offering][data-offering-id="${teacherA.explanationServiceId}"]`);
  await row.waitFor({ timeout: 20000 });
  await row.locator('button', { hasText: 'Edit' }).click();
  const form = page.locator('[data-testid=offering-form]');
  await form.locator('#offer-price').waitFor({ state: 'visible', timeout: 15000 });
  await form.locator('#offer-price').fill('120');
  await form.locator('button[type=submit]').click();
  await page.waitForFunction(id => !document.querySelector(`[data-offering-id="${id}"] + [data-testid=offering-form]`),
                             teacherA.explanationServiceId, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);

  assert.equal(sql(`SELECT Price FROM TeacherServices WHERE Id = '${teacherA.explanationServiceId}'`), '120.00', 'the offering moved');
  assert.equal(sql(`SELECT ListedPriceAtRequest FROM LearningRequests WHERE Id = '${changedRequestId}'`), '100.00',
               'the edit did not reach the request that was already sent');
});

await step('04 the teacher accepts at 150; the money is built from 150', async () => {
  changedOrderId = await acceptRequest(teacher, changedRequestId, 150);
  assert.equal(
    sql(`SELECT CONCAT(Price, ':', StudentFeeAmount, ':', StudentTotal) FROM Orders WHERE Id = '${changedOrderId}'`),
    '150.00:12.00:162.00', 'fee and total come from the agreed price, at 8%');
});

await step('05 the student reads both prices on the request, in Arabic on a phone', async () => {
  const { page } = student;
  await visit(page, `${BASE}/ar/requests/${changedRequestId}`);
  const text = await assertPanel(page, 'request', { amounts: ['100', '150', '12', '162'], comparison: true });
  assert.match(text, /السعر عند إرسال الطلب/, 'names the price when the request was sent');
  assert.match(text, /السعر بعد مراجعة المعلم لطلبك/, 'names the price after the review');
  assert.match(text, /الإجمالي المطلوب/, 'names what is owed');
  await noHorizontalOverflow(page, 'request with the price comparison');
  await shot(page, 'ux09-01-request-comparison-ar-phone');
});

await step('06 checkout says the same thing, in the same words', async () => {
  const { page } = student;
  await page.locator('[data-testid=open-order]').click();
  await page.waitForURL(url => pathOf(url) === `/ar/orders/${changedOrderId}`, { timeout: 15000 });
  await assertPanel(page, 'order before payment', { amounts: ['100', '150', '162'], comparison: true });
  await page.locator('[data-testid=pay-order]').click();
  await page.waitForURL(url => pathOf(url) === '/ar/checkout', { timeout: 15000 });
  await payButton(page).waitFor({ timeout: 15000 });
  const text = await assertPanel(page, 'checkout', { amounts: ['100', '150', '12', '162'], comparison: true });
  assert.match(text, /السعر عند إرسال الطلب/, 'checkout uses the request’s wording');
  await noHorizontalOverflow(page, 'checkout with the price comparison');
  await shot(page, 'ux09-02-checkout-comparison-ar-phone');
});

await step('07 after paying, the order still shows what was quoted and calls the total paid', async () => {
  const { page } = student;
  await payInSimulator(page, new RegExp(`^/ar/orders/${changedOrderId}$`));
  await attribute(page, '[data-testid=order-status]', 'data-payment', 1);
  const text = await assertPanel(page, 'order after payment', { amounts: ['100', '150', '162'], comparison: true });
  assert.match(text, /الإجمالي(?!\s*المطلوب)/, 'the total is no longer something owed');
  assert.equal(sql(`SELECT Amount FROM Payments WHERE OrderId = '${changedOrderId}'`), '162.00', 'the student paid the agreed total');
  await noHorizontalOverflow(page, 'paid order');
  await shot(page, 'ux09-03-order-paid-ar-phone');
});

await step('08 a request sent and accepted at the same price makes no comparison', async () => {
  const second = await context({ viewport: { width: 390, height: 844 }, locale: 'ar-SA', isMobile: true, hasTouch: true });
  await registerStudent(second, `طالبة السعر ${stamp}`, secondEmail, secondPassword);
  unchangedRequestId = await sendDirectRequest(second, teacherA, unchangedTitle);
  assert.equal(sql(`SELECT ListedPriceAtRequest FROM LearningRequests WHERE Id = '${unchangedRequestId}'`), '120.00',
               'captured at the offering as it now stands');
  unchangedOrderId = await acceptRequest(teacher, unchangedRequestId, 120);

  const { page } = second;
  await visit(page, `${BASE}/ar/requests/${unchangedRequestId}`);
  const text = await assertPanel(page, 'unchanged request', { amounts: ['120', '129'], comparison: false });
  assert.doesNotMatch(text, /السعر عند إرسال الطلب/, 'nothing to compare, so nothing is compared');
  await noHorizontalOverflow(page, 'unchanged request');
  await shot(page, 'ux09-04-no-comparison-ar-phone');
});

await step('09 the teacher sees the agreed price and none of the student’s fee', async () => {
  const { page } = teacher;
  await visit(page, `${BASE}/en/orders/${changedOrderId}`);
  await page.locator('[data-testid=order-status]').waitFor({ timeout: 15000 });
  assert.equal(await page.locator('[data-testid=order-price]').count(), 0, 'the price disclosure is the student’s');
  const body = await page.locator('body').innerText();
  assert.ok(body.includes('150'), 'the teacher sees the price they accepted');
  assert.ok(!/Total to pay/i.test(body), 'the student’s total is not the teacher’s business');
});

await step('10 the API tells the same story it renders', async () => {
  const request = await api(studentEmail, 'GET', `/api/v1/learning-requests/${changedRequestId}`, undefined, {}, studentPassword);
  assert.equal(request.status, 200);
  assert.equal(Number(request.body.listedPriceAtRequest), 100);
  assert.equal(request.body.listedCurrencyAtRequest, 'SAR');

  const order = await api(studentEmail, 'GET', `/api/v1/orders/${changedOrderId}`, undefined, {}, studentPassword);
  assert.equal(order.status, 200);
  assert.equal(Number(order.body.listedPriceAtRequest), 100);
  assert.equal(Number(order.body.price), 150);
  assert.equal(Number(order.body.studentTotal), 162);

  // A stranger is told nothing, as before.
  const outsider = await api(SEED.teacherB.Email, 'GET', `/api/v1/orders/${changedOrderId}`);
  assert.equal(outsider.status, 404, 'an order is only readable by its own parties');
});

await finish('UX-09 agreed price disclosure');
