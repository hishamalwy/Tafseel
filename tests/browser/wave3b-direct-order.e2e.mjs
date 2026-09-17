/* Wave 3B end-to-end: the direct marketplace path, through the Angular client only.
 *
 *   STUDENT (Arabic, 390px phone) registers, confirms and signs in; browses to a published teacher;
 *   requests the recorded explanation; after the teacher accepts, pays from the order screen in the
 *   mock simulator; messages the teacher; asks for a revision; completes; reviews the teacher
 *   TEACHER (English, desktop) opens the request from the work list, accepts with terms, starts
 *   the paid order, answers in the order's conversation, delivers, redelivers after the revision
 *   VISITOR sees the new rating and review on the public profile
 *
 * The seed (TAFSEEL_E2E_SCENARIO=fulfilment) only publishes the teachers and creates an unrelated
 * student. The request, acceptance, order, payment, delivery, revision, completion and review all
 * happen here. The database is only read, to confirm what the server recorded.
 */
import assert from 'node:assert/strict';
import {
  BASE, SEED, api, attribute, confirmDialog, context, file, finish, noHorizontalOverflow, pathOf, payButton, payInSimulator, pdf,
  registerStudent, shot, signIn, spa, sql, start, step, visit, waitForCall
} from './wave3b-harness.mjs';

const stamp = Date.now();
const studentEmail = `wave3b-direct-${stamp}@example.test`;
const studentPassword = `Wave3b!Direct-${stamp}`;
const title = `Chain rule walk-through ${stamp}`;
const reviewComment = `Clear worked steps and a quick redelivery ${stamp}`;
const teacherA = SEED.teacherA;

await start();
let requestId = '';
let orderId = '';
let conversationId = '';

const student = await context({ viewport: { width: 390, height: 844 }, locale: 'ar-SA', isMobile: true, hasTouch: true });
const teacher = await context();

await step('student registers in Arabic on a phone, confirms the address and signs in', async () => {
  await registerStudent(student, `طالب الموجة ${stamp}`, studentEmail, studentPassword);
  assert.equal(await student.page.evaluate(() => document.documentElement.dir), 'rtl');
});

await step('J3 student browses to the published teacher; a live service reads as live, a recorded one by days', async () => {
  const { page } = student;
  await spa(student, '/teachers');
  await page.locator(`a[href*="${teacherA.Id}"]`).first().waitFor({ timeout: 20000 });
  await page.locator(`a[href*="${teacherA.Id}"]`).first().click();
  await page.waitForURL(url => pathOf(url) === `/ar/teachers/${teacherA.Id}`, { timeout: 15000 });
  const live = page.locator(`article[data-service-id="${teacherA.liveServiceId}"]`);
  const recorded = page.locator(`article[data-service-id="${teacherA.explanationServiceId}"]`);
  await recorded.waitFor({ timeout: 15000 });
  assert.equal(await live.getAttribute('data-live'), 'true', 'the live-session service is labelled live');
  assert.match(await live.locator('.tf-mkp-svc-kind').innerText(), /جلسة مباشرة/);
  assert.doesNotMatch(await live.locator('.tf-mkp-svc-facts').innerText(), /أيام/, 'a live service shows no delivery days');
  assert.match(await recorded.locator('.tf-mkp-svc-facts').innerText(), /2/, 'the recorded service delivers in 2 days');
  await noHorizontalOverflow(page, 'teacher profile');
  await shot(page, 'direct-01-profile-ar-phone');
  await recorded.locator('button[aria-pressed]').click();
  await page.locator('.tf-mkp-shelf-acts a.tf-mk-btn--primary').click();
  await page.waitForURL(url => pathOf(url) === '/ar/requests/new', { timeout: 15000 });
});

await step('J3-02 student sends the direct request and lands on its own screen', async () => {
  const { page } = student;
  const next = page.locator('.tf-req-nav button.tf-button:not(.tf-button-secondary)');
  await page.locator('#req-title').waitFor({ timeout: 15000 });
  await page.locator('#req-title').fill(title);
  await next.click();
  await page.locator('#req-goal').fill('Walk me through every chain-rule exercise in chapter three, with the reasoning for each step.');
  await next.click();
  const due = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  await page.locator('#req-delivery').fill(due);
  await next.click();
  await page.locator('.tf-check--start input[type=checkbox]').check();
  const created = waitForCall(page, 'POST', /^\/api\/v1\/learning-requests$/);
  await next.click();
  const response = await created;
  assert.equal(response.status(), 201, await response.text());
  requestId = (await response.json()).id;
  await page.locator('[data-testid=open-created-request]').click();
  await page.waitForURL(url => pathOf(url) === `/ar/requests/${requestId}`, { timeout: 15000 });
  await attribute(page, '[data-testid=request-status]', 'data-status', 0);
  await noHorizontalOverflow(page, 'request detail');
  assert.equal(sql(`SELECT COUNT(*) FROM Orders WHERE LearningRequestId = '${requestId}'`), '0', 'no order before acceptance');
  await shot(page, 'direct-02-request-ar-phone');
});

await step('J3-07 teacher opens the request from the work list and accepts with price, delivery and one revision', async () => {
  const { page } = teacher;
  await signIn(teacher, teacherA.Email);
  await spa(teacher, '/teacher/work?tab=requests');
  // The request's own card, not the "new request" notification that also carries its title.
  const card = page.locator('article.tf-dashboard-card, article.tf-work-card', { hasText: title }).filter({ has: page.locator('[data-testid=row-open]') });
  await card.waitFor({ timeout: 20000 });
  await card.locator('[data-testid=row-open]').click();
  await page.waitForURL(url => pathOf(url) === `/en/requests/${requestId}`, { timeout: 15000 });
  await page.locator('[data-testid=accept-request]').click();
  const dialog = page.locator('[data-testid=accept-dialog]');
  await dialog.locator('#accept-price').waitFor({ state: 'visible', timeout: 15000 });
  await dialog.locator('#accept-price').fill('150');
  await dialog.locator('#accept-revisions').selectOption('1');
  const accepted = waitForCall(page, 'POST', new RegExp(`^/api/v1/learning-requests/${requestId}/accept$`));
  await dialog.locator('button[type=submit]').click();
  const response = await accepted;
  assert.equal(response.status(), 200, await response.text());
  orderId = (await response.json()).id;
  await attribute(page, '[data-testid=request-status]', 'data-status', 2);
  await page.locator('[data-testid=open-order]').click();
  await page.waitForURL(url => pathOf(url) === `/en/orders/${orderId}`, { timeout: 15000 });
  await attribute(page, '[data-testid=order-status]', 'data-payment', 0);
  assert.equal(await page.locator('[data-testid=start-order]').count(), 0, 'the teacher cannot start an unpaid order');
  assert.equal(sql(`SELECT CONCAT(Status, ':', PaymentStatus, ':', Price, ':', RevisionAllowance) FROM Orders WHERE Id = '${orderId}'`), '0:0:150.00:1');
  await shot(page, 'direct-03-accepted-teacher');
});

await step('J5-01 student pays the accepted order from its screen in the mock simulator; it waits for the teacher', async () => {
  const { page } = student;
  await visit(page, `${BASE}/ar/requests/${requestId}`);
  await page.locator('[data-testid=open-order]').click();
  await page.waitForURL(url => pathOf(url) === `/ar/orders/${orderId}`, { timeout: 15000 });
  await noHorizontalOverflow(page, 'order awaiting payment');
  assert.equal(sql(`SELECT COUNT(*) FROM Payments WHERE OrderId = '${orderId}'`), '0', 'no payment before the student pays');
  await page.locator('[data-testid=pay-order]').click();
  await page.waitForURL(url => pathOf(url) === '/ar/checkout', { timeout: 15000 });
  await payButton(page).waitFor({ timeout: 15000 });
  await noHorizontalOverflow(page, 'checkout');
  await payInSimulator(page, new RegExp(`^/ar/orders/${orderId}$`), async () => {
    // Initiated, not yet confirmed: the payment is pending and the order is unchanged.
    assert.equal(sql(`SELECT Status FROM Payments WHERE OrderId = '${orderId}'`), '0', 'payment Pending while the simulator is open');
    assert.equal(sql(`SELECT CONCAT(Status, ':', PaymentStatus) FROM Orders WHERE Id = '${orderId}'`), '0:0');
    await noHorizontalOverflow(page, 'simulator');
  });
  assert.equal(sql(`SELECT CONCAT(Status, ':', Amount) FROM Payments WHERE OrderId = '${orderId}'`).split(':')[0], '1', 'payment Confirmed');
  await attribute(page, '[data-testid=order-status]', 'data-payment', 1);
  await attribute(page, '[data-testid=order-status]', 'data-status', 0);
  assert.equal(sql(`SELECT CONCAT(Status, ':', PaymentStatus) FROM Orders WHERE Id = '${orderId}'`), '0:1', 'paid, still awaiting the teacher');
  assert.equal(await page.locator('[data-testid=pay-order]').count(), 0, 'no second payment offered');
  await shot(page, 'direct-04-paid-ar-phone');
});

await step('J6 teacher starts the paid order', async () => {
  const { page } = teacher;
  await visit(page, `${BASE}/en/orders/${orderId}`);
  await page.locator('[data-testid=start-order]').click();
  const started = waitForCall(page, 'POST', new RegExp(`^/api/v1/orders/${orderId}/start$`));
  await confirmDialog(page);
  assert.equal((await started).status(), 204);
  await attribute(page, '[data-testid=order-status]', 'data-status', 1);
});

await step('J9-02 student messages the teacher from the order; the teacher opens the same conversation and replies', async () => {
  await student.page.locator('[data-testid=open-conversation]').click();
  await student.page.waitForURL(url => /^\/ar\/conversations\/[0-9a-f-]{36}$/.test(pathOf(url)), { timeout: 15000 });
  conversationId = pathOf(student.page.url()).split('/').pop();
  await student.page.locator('#message-body').fill('هل يمكن أن تبدأ بالتمرين الثالث؟');
  const sent = waitForCall(student.page, 'POST', new RegExp(`^/api/v1/conversations/${conversationId}/messages$`));
  await student.page.locator('[data-testid=send-message]').click();
  assert.ok((await sent).ok(), 'message sent');
  await noHorizontalOverflow(student.page, 'conversation');

  await teacher.page.locator('[data-testid=open-conversation]').click();
  await teacher.page.waitForURL(url => pathOf(url) === `/en/conversations/${conversationId}`, { timeout: 15000 });
  await teacher.page.locator('[data-testid=message]', { hasText: 'التمرين الثالث' }).waitFor({ timeout: 15000 });
  await teacher.page.locator('#message-body').fill('Yes, I will start with exercise three.');
  await teacher.page.locator('[data-testid=send-message]').click();
  await student.page.locator('[data-testid=message]', { hasText: 'exercise three' }).waitFor({ timeout: 20000 });
  assert.equal(sql(`SELECT COUNT(*) FROM Conversations WHERE ResourceId = '${orderId}'`), '1', 'one conversation for the order');
});

await step('J6-06 teacher delivers the work as a file with a note', async () => {
  const { page } = teacher;
  await visit(page, `${BASE}/en/orders/${orderId}`);
  await page.locator('[data-testid=open-deliver]').click();
  await page.locator('#deliver-files').setInputFiles(file('chain-rule.pdf', pdf('first delivery')));
  await page.locator('#deliver-message').fill('Exercises 1-6 worked in full.');
  const delivered = waitForCall(page, 'POST', new RegExp(`^/api/v1/orders/${orderId}/deliveries$`));
  await page.locator('[data-testid=submit-delivery]').click();
  const response = await delivered;
  assert.ok(response.ok(), `delivery ${response.status()} ${await response.text()}`);
  await attribute(page, '[data-testid=order-status]', 'data-status', 2);
  await page.locator('[data-testid=delivery]').first().waitFor({ timeout: 15000 });
  assert.equal(await page.locator('[data-testid=complete-order]').count(), 0, 'completion is the student’s decision');
});

await step('J6-04 student asks for a revision within the allowance; the teacher sees it and delivers again', async () => {
  const { page } = student;
  await visit(page, `${BASE}/ar/orders/${orderId}`);
  await attribute(page, '[data-testid=order-status]', 'data-status', 2);
  await page.locator('[data-testid=open-revision]').click();
  await page.locator('#revision-reason').fill('أضف شرحاً لخطوة الاشتقاق في التمرين الخامس.');
  const revised = waitForCall(page, 'POST', new RegExp(`^/api/v1/orders/${orderId}/revision$`));
  await page.locator('[data-testid=submit-revision]').click();
  assert.equal((await revised).status(), 204);
  await attribute(page, '[data-testid=order-status]', 'data-status', 3);
  assert.equal((await page.locator('[data-testid=revisions-used]').innerText()).replace(/\s/g, ''), '1/1');

  const t = teacher.page;
  await visit(t, `${BASE}/en/orders/${orderId}`);
  await t.locator('[data-testid=revision-requested]').waitFor({ timeout: 15000 });
  await t.locator('[data-testid=open-deliver]').click();
  await t.locator('#deliver-files').setInputFiles(file('chain-rule-revised.pdf', pdf('redelivery')));
  const redelivered = waitForCall(t, 'POST', new RegExp(`^/api/v1/orders/${orderId}/deliveries$`));
  await t.locator('[data-testid=submit-delivery]').click();
  assert.ok((await redelivered).ok(), 'redelivered');
  await attribute(t, '[data-testid=order-status]', 'data-status', 2);
  assert.equal(await t.locator('[data-testid=delivery]').count(), 2);
  await noHorizontalOverflow(t, 'teacher order with two deliveries');
});

await step('the allowance is spent: no further revision is offered, and the server refuses one', async () => {
  const { page } = student;
  await visit(page, `${BASE}/ar/orders/${orderId}`);
  await page.locator('[data-testid=complete-order]').waitFor({ timeout: 15000 });
  assert.equal(await page.locator('[data-testid=open-revision]').count(), 0);
  const version = (await api(studentEmail, 'GET', `/api/v1/orders/${orderId}`, undefined, {}, studentPassword)).body.version;
  const refused = await api(studentEmail, 'POST', `/api/v1/orders/${orderId}/revision`, { reason: 'One more' }, { 'If-Match': version }, studentPassword);
  assert.equal(refused.status, 400);
  assert.equal(refused.body.code, 'revision_limit_reached');
});

await step('J6 student completes; the teacher is told the earnings are pending clearance', async () => {
  const { page } = student;
  await page.locator('[data-testid=complete-order]').click();
  const completed = waitForCall(page, 'POST', new RegExp(`^/api/v1/orders/${orderId}/complete$`));
  await confirmDialog(page);
  assert.equal((await completed).status(), 204);
  await attribute(page, '[data-testid=order-status]', 'data-status', 4);
  assert.equal(sql(`SELECT Status FROM TeacherEarningMaturities WHERE OrderId = '${orderId}'`), '0', 'earnings scheduled as pending, not available');

  await visit(teacher.page, `${BASE}/en/orders/${orderId}`);
  const note = await teacher.page.locator('[data-testid=order-completed-note]').innerText();
  assert.match(note, /pending clearance/i);
  assert.doesNotMatch(note, /withdraw (now|today)|available to withdraw/i);
  const events = await teacher.page.locator('[data-testid=order-timeline] li').evaluateAll(items => items.map(i => i.getAttribute('data-event')));
  for (const event of ['awaiting_payment', 'payment_confirmed', 'work_started', 'revision_requested', 'completed'])
    assert.ok(events.includes(event), `timeline shows ${event}`);
  assert.equal(events.filter(e => e === 'delivery_uploaded').length, 2);
  await shot(teacher.page, 'direct-05-completed-teacher');
});

await step('J7-01 student reviews the teacher once; a second review is refused', async () => {
  const { page } = student;
  await page.locator('[data-testid=open-review]').click();
  const criteria = ['explanationClarity', 'subjectKnowledge', 'communication', 'onTimeDelivery', 'valueForMoney'];
  // Submitting unrated is refused on the page, before anything is sent.
  await page.locator('[data-testid=submit-review]').click();
  await page.locator('[data-testid=review-form] [role=alert]').waitFor({ timeout: 5000 });
  assert.ok(!page.sent.some(r => r.method() === 'POST' && /\/review$/.test(r.url())), 'nothing sent for an incomplete review');
  for (const [i, criterion] of criteria.entries()) await page.locator(`[data-testid=rate-${criterion}-${i === 2 ? 4 : 5}]`).click();
  await page.locator('#review-comment').fill(reviewComment);
  const reviewed = waitForCall(page, 'POST', new RegExp(`^/api/v1/orders/${orderId}/review$`));
  await page.locator('[data-testid=submit-review]').click();
  const response = await reviewed;
  assert.ok(response.ok(), `review ${response.status()} ${await response.text()}`);
  await page.locator('[data-testid=review-submitted]').waitFor({ timeout: 15000 });
  assert.equal(await page.locator('[data-testid=open-review]').count(), 0);
  await noHorizontalOverflow(page, 'completed order');
  await shot(page, 'direct-06-reviewed-ar-phone');

  const duplicate = await api(studentEmail, 'POST', `/api/v1/orders/${orderId}/review`, {
    explanationClarity: 1, subjectKnowledge: 1, communication: 1, onTimeDelivery: 1, valueForMoney: 1, comment: 'again', recommends: false
  }, {}, studentPassword);
  assert.equal(duplicate.status, 409);
  assert.equal(sql(`SELECT COUNT(*) FROM TeacherReviews WHERE OrderId = '${orderId}'`), '1');
});

await step('J7-01 a visitor sees the new rating and review on the public profile', async () => {
  const visitor = await context();
  const { page } = visitor;
  await visit(page, `${BASE}/en/teachers/${teacherA.Id}`);
  await page.locator('#profile-reviews').getByText(reviewComment).waitFor({ timeout: 20000 });
  assert.match(await page.locator('.tf-mkp-idrating').first().innerText(), /4\.8/);
  await shot(page, 'direct-07-public-review');
  assert.deepEqual(page.problems, []);
  await visitor.ctx.close();
});

await step('outsiders are refused the order, its conversation and its delivery files', async () => {
  const outsider = SEED.outsider.Email;
  assert.equal((await api(outsider, 'GET', `/api/v1/orders/${orderId}`)).status, 404);
  assert.equal((await api(outsider, 'GET', `/api/v1/conversations/${conversationId}/messages`)).status, 404);
  const deliveryId = sql(`SELECT TOP 1 Id FROM OrderDeliveries WHERE OrderId = '${orderId}'`);
  assert.equal((await api(outsider, 'GET', `/api/v1/orders/deliveries/${deliveryId}/content`)).status, 404);
  assert.equal((await api(SEED.teacherB.Email, 'GET', `/api/v1/orders/${orderId}`)).status, 404);
  assert.equal(sql(`SELECT COUNT(*) FROM Orders WHERE LearningRequestId = '${requestId}'`), '1', 'exactly one order');
  assert.equal(sql(`SELECT COUNT(*) FROM Payments WHERE OrderId = '${orderId}'`), '1', 'exactly one payment');
});

await step('no script errors on any page', async () => {
  assert.deepEqual([...student.page.problems, ...teacher.page.problems], []);
});

await finish('Wave 3B direct order');
