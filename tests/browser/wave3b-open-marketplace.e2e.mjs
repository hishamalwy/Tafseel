/* Wave 3B end-to-end: the open-marketplace path, through the Angular client only.
 *
 *   STUDENT registers, chooses "open request" over a direct teacher and publishes one from the
 *   real catalog; compares the offers; selects one (a stale selection is refused and explained);
 *   releases and reselects; pays the reserved request in the mock simulator and lands on the order
 *   TEACHER A discovers the opportunity, sends an offer and changes it
 *   TEACHER B sends an offer, withdraws it and sends it again
 *
 * Proves: no order exists before payment, the reservation is visible, offer versions are enforced,
 * and payment creates exactly one order. The database is only read.
 */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  BASE, SEED, api, attribute, confirmDialog, context, finish, noHorizontalOverflow, pathOf, payInSimulator, registerStudent,
  shot, signIn, spa, sql, start, step, visit, waitForCall
} from './wave3b-harness.mjs';

const stamp = Date.now();
const studentEmail = `wave3b-open-${stamp}@example.test`;
const studentPassword = `Wave3b!Open-${stamp}`;
const title = `Integration by parts, chapter 7 ${stamp}`;

await start();
let requestId = '';
let offerA = '';
let offerB = '';
let orderId = '';

const student = await context();
const teacherA = await context();
const teacherB = await context();

async function sendOffer(actor, amount, hours, revisions, message) {
  const { page } = actor;
  await page.locator('#offer-amount').fill(String(amount));
  await page.locator('#offer-hours').evaluate((s, v) => { s.value = [...s.options].find(o => o.dataset.value === String(v)).value; s.dispatchEvent(new Event('change', { bubbles: true })); }, String(hours));
  await page.locator('#offer-revisions').evaluate((s, v) => { s.value = [...s.options].find(o => o.dataset.value === String(v)).value; s.dispatchEvent(new Event('change', { bubbles: true })); }, String(revisions));
  await page.locator('#offer-validity').evaluate((s, v) => { s.value = [...s.options].find(o => o.dataset.value === String(v)).value; s.dispatchEvent(new Event('change', { bubbles: true })); }, '72');
  await page.locator('#offer-message').fill(message);
  const saved = waitForCall(page, /POST|PUT/, /^\/api\/v1\/open-marketplace\/(opportunities\/[0-9a-f-]{36}\/offers|offers\/[0-9a-f-]{36})$/);
  await page.locator('[data-testid=save-offer]').click();
  const response = await saved;
  assert.ok(response.ok(), `offer saved ${response.status()}`);
  return response;
}

await step('J4-01 student opens the explanation form directly and publishes from the real catalog', async () => {
  const { page } = student;
  await registerStudent(student, `Wave3B Open Student ${stamp}`, studentEmail, studentPassword);
  await spa(student, '/requests/new/open');
  await page.locator('#open-title').waitFor({ timeout: 15000 });
  assert.equal(await page.locator('[data-testid=request-modes]').count(), 0);
  await page.waitForURL(url => pathOf(url) === '/en/requests/new/open', { timeout: 15000 });

  // Nothing is filled in for the student: publishing empty is refused on the page.
  await page.locator('[data-testid=publish-open-request]').click();
  await page.locator('[aria-invalid=true]').first().waitFor({ timeout: 5000 });
  assert.ok(!page.sent.some(r => r.method() === 'POST' && /open-marketplace\/requests$/.test(r.url())), 'nothing sent');

  await page.locator('#open-subject').selectOption(SEED.subjectId);
  await page.locator('#open-service').selectOption(SEED.recordedCatalogId);
  await page.locator('#open-title').fill(title);
  await page.locator('#open-requirements').fill('Explain each integration-by-parts exercise, choosing u and dv with the reasoning.');
  const deadline = new Date(Date.now() + 4 * 86_400_000);
  await page.locator('#open-deadline').fill(deadline.toISOString().slice(0, 16));
  await page.locator('#open-budget-min').fill('90');
  await page.locator('#open-budget-max').fill('200');
  const published = waitForCall(page, 'POST', /^\/api\/v1\/open-marketplace\/requests$/);
  await page.locator('[data-testid=publish-open-request]').click();
  const response = await published;
  assert.equal(response.status(), 201);
  const body = response.request().postDataJSON();
  assert.deepEqual(Object.keys(body).sort(), ['budgetMax', 'budgetMin', 'deadline', 'requirements', 'serviceCatalogItemId', 'subjectId', 'title']);
  requestId = (await response.json()).id;
  await page.waitForURL(url => pathOf(url) === `/en/requests/${requestId}`, { timeout: 15000 });
  await attribute(page, '[data-testid=request-status]', 'data-status', 5);
  // UX-67: right after publishing, the page says who can see it rather than "0 offers".
  assert.match(await page.locator('[data-testid=offer-count]').innerText(), /can see your request now/);
  await shot(page, 'open-01-published');
});

await step('J4-05 teacher A discovers the opportunity, sees no private student data, sends and changes an offer', async () => {
  const { page } = teacherA;
  await signIn(teacherA, SEED.teacherA.Email);
  await spa(teacherA, '/teacher/opportunities');
  const card = page.locator('article.tf-dashboard-card', { hasText: title }).filter({ has: page.locator('[data-testid=row-open]') });
  await card.waitFor({ timeout: 20000 });
  await card.locator('[data-testid=row-open]').click();
  await page.waitForURL(url => pathOf(url) === `/en/teacher/opportunities/${requestId}`, { timeout: 15000 });
  await page.locator('[data-testid=offer-form]').waitFor({ timeout: 15000 });
  const text = await page.locator('main').innerText();
  assert.ok(!text.includes(studentEmail) && !text.includes('Wave3B Open Student'), 'the student is not identified to teachers');

  const sent = await sendOffer(teacherA, 150, 48, 2, 'I will pick u and dv with you for every exercise.');
  offerA = (await sent.json()).id;
  await attribute(page, '[data-testid=my-offer]', 'data-status', 0);

  await page.locator('[data-testid=edit-offer]').click();
  const changed = await sendOffer(teacherA, 140, 36, 2, 'I will pick u and dv with you for every exercise, within 36 hours.');
  assert.equal(changed.request().method(), 'PUT');
  assert.ok((await changed.request().allHeaders())['if-match'], 'the change carries the version read');
  assert.equal(sql(`SELECT CONCAT(Amount, ':', DeliveryHours, ':', Status) FROM TeacherOffers WHERE Id = '${offerA}'`), '140.00:36:0');
  await shot(page, 'open-02-offer-teacher-a');
});

await step('J4-05 teacher B sends an offer, withdraws it and sends it again', async () => {
  const { page } = teacherB;
  await signIn(teacherB, SEED.teacherB.Email);
  await spa(teacherB, `/teacher/opportunities/${requestId}`);
  await page.locator('[data-testid=offer-form]').waitFor({ timeout: 15000 });
  offerB = (await (await sendOffer(teacherB, 120, 24, 1, 'Fast turnaround with one revision.')).json()).id;
  await attribute(page, '[data-testid=my-offer]', 'data-status', 0);
  const withdrawn = waitForCall(page, 'POST', new RegExp(`^/api/v1/open-marketplace/offers/${offerB}/withdraw$`));
  await page.locator('[data-testid=withdraw-offer]').click();
  await confirmDialog(page);
  assert.equal((await withdrawn).status(), 204);
  await attribute(page, '[data-testid=my-offer]', 'data-status', 3);
  await sendOffer(teacherB, 125, 24, 1, 'Fast turnaround with one revision, again.');
  await attribute(page, '[data-testid=my-offer]', 'data-status', 0);

  // Another teacher cannot touch teacher A's offer.
  const version = sql(`SELECT CONVERT(varchar(64), CAST(RowVersion AS varbinary(8)), 2) FROM TeacherOffers WHERE Id = '${offerA}'`);
  const hijack = await api(SEED.teacherB.Email, 'POST', `/api/v1/open-marketplace/offers/${offerA}/withdraw`, undefined,
    { 'If-Match': Buffer.from(version, 'hex').toString('base64') });
  assert.equal(hijack.status, 404);
});

await step('J4-06 student compares the offers as the teachers wrote them, without a ranking', async () => {
  const { page } = student;
  await visit(page, `${BASE}/en/requests/${requestId}`);
  assert.match(await page.locator('[data-testid=offer-count]').innerText(), /2/);
  await page.locator('[data-testid=compare-offers]').click();
  await page.waitForURL(url => pathOf(url) === `/en/requests/${requestId}/offers`, { timeout: 15000 });
  await page.locator('[data-testid=offer]').nth(1).waitFor({ timeout: 15000 });
  assert.equal(await page.locator('[data-testid=offer]').count(), 2);
  await page.getByRole('button', { name: 'Show comparison' }).click();
  await page.locator('#offer-comparison tbody tr').first().waitFor();
  assert.equal(await page.locator('#offer-comparison tbody tr').count(), 2);
  await noHorizontalOverflow(page, 'offer comparison');
  assert.doesNotMatch(await page.locator('[data-testid=offers]').innerText(), /best|recommended|top pick/i);
  await shot(page, 'open-03-compare');
  const panel=page.locator('.tf-offer-compare'),list=page.getByTestId('offers');
  const panelBox=await panel.boundingBox(),listBox=await list.boundingBox();
  assert.ok(listBox.y-panelBox.y-panelBox.height>=23,'comparison and offers have a distinct 24px boundary');
  assert.equal(await panel.getByRole('heading').count(),1,'the disclosure does not repeat the section title');
  if(process.env.TAFSEEL_SHOT_DIR)await panel.screenshot({path:join(process.env.TAFSEEL_SHOT_DIR,'buttons-comparison-light-en-desktop.png')});
  await page.getByTestId('comparison-toggle').click();await page.getByTestId('offer-comparison').waitFor({state:'detached'});
  await page.setViewportSize({width:390,height:844});
  await page.getByTestId('comparison-toggle').click();await page.locator('#offer-comparison tbody tr').first().waitFor();
  await noHorizontalOverflow(page,'English phone comparison');
  if(process.env.TAFSEEL_SHOT_DIR)await panel.screenshot({path:join(process.env.TAFSEEL_SHOT_DIR,'buttons-comparison-light-en-phone.png')});
  await visit(page,`${BASE}/ar/requests/${requestId}/offers`);
  await page.getByTestId('comparison-toggle').click();await page.locator('#offer-comparison tbody tr').first().waitFor();
  await noHorizontalOverflow(page,'Arabic phone comparison');
  if(process.env.TAFSEEL_SHOT_DIR)await panel.screenshot({path:join(process.env.TAFSEEL_SHOT_DIR,'buttons-comparison-light-ar-phone.png')});
  await page.locator('tf-theme-toggle button').first().click();
  if(process.env.TAFSEEL_SHOT_DIR)await panel.screenshot({path:join(process.env.TAFSEEL_SHOT_DIR,'buttons-comparison-dark-ar-phone.png')});
  await page.setViewportSize({width:1280,height:900});
  await visit(page,`${BASE}/en/requests/${requestId}/offers`);
  await page.getByTestId('comparison-toggle').click();await page.locator('#offer-comparison tbody tr').first().waitFor();
});

await step('J4-07 a selection made against a changed offer is refused, explained, and shown with the new terms', async () => {
  const { page } = student;
  // Teacher A changes the offer while the student is looking at the old terms.
  await visit(teacherA.page, `${BASE}/en/teacher/opportunities/${requestId}`);
  await teacherA.page.locator('[data-testid=edit-offer]').click();
  await sendOffer(teacherA, 135, 36, 2, 'Final terms: every exercise, within 36 hours.');

  const offer = page.locator(`[data-testid=offer][data-offer-id="${offerA}"]`);
  await offer.locator('[data-testid=select-offer]').click();
  const refused = waitForCall(page, 'POST', new RegExp(`/offers/${offerA}/select$`));
  await confirmDialog(page);
  assert.equal((await refused).status(), 409);
  await page.locator('[data-testid=offers-notice]').waitFor({ timeout: 15000 });
  await page.waitForFunction(id => document.querySelector(`[data-offer-id="${id}"]`)?.textContent?.includes('135'), offerA, { timeout: 15000 });
  assert.equal(sql(`SELECT Status FROM LearningRequests WHERE Id = '${requestId}'`), '5', 'still open after the refused selection');
  await shot(page, 'open-04-stale-selection');
});

await step('J4-07 student selects, releases and selects again; the reservation is shown and no order exists', async () => {
  const { page } = student;
  const offer = page.locator(`[data-testid=offer][data-offer-id="${offerA}"]`);
  await offer.locator('[data-testid=select-offer]').click();
  const selected = waitForCall(page, 'POST', new RegExp(`/offers/${offerA}/select$`));
  await confirmDialog(page);
  const response = await selected;
  assert.equal(response.status(), 204);
  const headers = await response.request().allHeaders();
  assert.ok(headers['if-match'] && headers['x-offer-version'], 'both versions sent');
  await page.locator('[data-testid=reservation-countdown]').waitFor({ timeout: 15000 });

  const released = waitForCall(page, 'POST', new RegExp(`/requests/${requestId}/cancel-selection$`));
  await page.locator('[data-testid=release-selection]').click();
  await confirmDialog(page);
  assert.equal((await released).status(), 204);
  await attribute(page, '[data-testid=request-status]', 'data-status', 5);

  await offer.locator('[data-testid=select-offer]').click();
  await confirmDialog(page);
  await attribute(page, '[data-testid=request-status]', 'data-status', 6);
  const countdown = await page.locator('[data-testid=reservation-countdown]').innerText();
  assert.match(countdown, /^(2:00:00|1:[0-5]\d:[0-5]\d)$/,`a two-hour hold counts down (${countdown})`);
  assert.equal(sql(`SELECT COUNT(*) FROM Orders WHERE LearningRequestId = '${requestId}'`), '0', 'no order before payment');
  assert.equal(sql(`SELECT Status FROM TeacherOffers WHERE Id = '${offerA}'`), '1', 'offer A Selected');

  // The selected teacher can no longer change or withdraw the held offer.
  await visit(teacherA.page, `${BASE}/en/teacher/opportunities/${requestId}`);
  await attribute(teacherA.page, '[data-testid=my-offer]', 'data-status', 1);
  assert.equal(await teacherA.page.locator('[data-testid=edit-offer], [data-testid=withdraw-offer], [data-testid=offer-form]').count(), 0);
  await shot(page, 'open-05-reserved');
});

await step('J4-08 student pays the reserved request; the payment creates exactly one order and lands on it', async () => {
  const { page } = student;
  await page.locator('[data-testid=pay-reserved]').click();
  await page.waitForURL(url => pathOf(url) === '/en/checkout', { timeout: 15000 });
  await page.locator('[data-testid=checkout-reservation]').waitFor({ timeout: 15000 });
  const fee = page.getByTestId('checkout-platform-fee');
  await fee.waitFor();
  assert.match(await fee.innerText(), /10[.,]8/, 'student fee is shown before payment starts');
  assert.match(await page.getByTestId('checkout-total').innerText(), /145[.,]8/,
    'final charge is shown before payment starts');
  assert.equal(sql(`SELECT COUNT(*) FROM Payments WHERE LearningRequestId = '${requestId}'`), '0');
  await shot(page, 'open-06-checkout');
  await payInSimulator(page, /^\/en\/orders\/[0-9a-f-]{36}$/, async () => {
    assert.equal(sql(`SELECT COUNT(*) FROM Orders WHERE LearningRequestId = '${requestId}'`), '0', 'still no order while payment is pending');
    assert.equal(sql(`SELECT Status FROM Payments WHERE LearningRequestId = '${requestId}'`), '0', 'payment Pending');
  });
  orderId = pathOf(page.url()).split('/').pop();
  assert.equal(sql(`SELECT COUNT(*) FROM Orders WHERE LearningRequestId = '${requestId}'`), '1', 'exactly one order');
  assert.equal(sql(`SELECT CONCAT(Id, ':', Status, ':', PaymentStatus, ':', Price) FROM Orders WHERE LearningRequestId = '${requestId}'`).toLowerCase(),
    `${orderId}:0:1:135.00`);
  assert.equal(sql(`SELECT Status FROM Payments WHERE LearningRequestId = '${requestId}'`), '1', 'payment Confirmed');
  assert.equal(sql(`SELECT Status FROM LearningRequests WHERE Id = '${requestId}'`), '7', 'request converted');
  assert.equal(sql(`SELECT Status FROM TeacherOffers WHERE Id = '${offerA}'`), '2', 'offer A Accepted');
  assert.equal(sql(`SELECT Status FROM TeacherOffers WHERE Id = '${offerB}'`), '4', 'offer B NotSelected');
  await attribute(page, '[data-testid=order-status]', 'data-payment', 1);
  await shot(page, 'open-07-order');
});

await step('the converted request is not payable again and the teacher can start the order', async () => {
  const { page } = student;
  await visit(page, `${BASE}/en/checkout?learningRequestId=${requestId}`);
  await page.locator('[data-testid=reservation-unavailable]').waitFor({ timeout: 15000 });
  const again = await api(studentEmail, 'POST', `/api/v1/payments/open-requests/${requestId}`, {}, { 'Idempotency-Key': `again-${stamp}` }, studentPassword);
  assert.ok(again.status >= 400, `a second payment is refused (${again.status})`);
  assert.equal(sql(`SELECT COUNT(*) FROM Orders WHERE LearningRequestId = '${requestId}'`), '1');

  await visit(teacherA.page, `${BASE}/en/orders/${orderId}`);
  await teacherA.page.locator('[data-testid=start-order]').waitFor({ timeout: 15000 });
  await noHorizontalOverflow(teacherA.page, 'teacher order');
  assert.equal((await api(SEED.outsider.Email, 'GET', `/api/v1/open-marketplace/requests/${requestId}/offers`)).status, 404);
});

await step('no script errors on any page', async () => {
  assert.deepEqual([...student.page.problems, ...teacherA.page.problems, ...teacherB.page.problems], []);
});

await finish('Wave 3B open marketplace');
