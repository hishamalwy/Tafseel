/* UX-05 end-to-end: one path per marketplace goal, and the old /requests links still arrive.
 *
 *   1. A student who opens /requests lands on the request-mode choice (/requests/new).
 *   2. A teacher who opens /requests lands on Open requests (/teacher/opportunities); the public
 *      header offers the teacher Open requests and the student Post a request.
 *   3. A stored /requests?requestId= link opens that request's own screen for each role; a value
 *      that is not a request id is ignored.
 *   4. The Wave 2 inline marketplace forms are reachable from none of these.
 *   5. The server's payment reminder (OfferReservationReminder) links to the request it is about,
 *      reads in Arabic, and opens the reserved request's payment.
 *
 * The student runs in Arabic at 390px; the teacher in English on desktop. Runs on the Wave 3B
 * fulfilment seed against a host started with OpenMarketplace__OfferReservationMinutes=20, so the
 * reminder falls due within the reservation worker's next one-minute scan instead of 90 minutes later.
 * Same environment variables as tests/browser/wave3b-harness.mjs. The database is only read.
 */
import assert from 'node:assert/strict';
import {
  BASE, SEED, api, confirmDialog, context, finish, noHorizontalOverflow, pathOf, registerStudent,
  shot, signIn, sql, start, step, visit, waitForCall
} from './wave3b-harness.mjs';

const stamp = Date.now();
const studentEmail = `ux05-student-${stamp}@example.test`;
const studentPassword = `Ux05!Paths-${stamp}`;
const title = `شرح التكامل بالتجزئة ${stamp}`;
const INLINE = '.tf-market-offer-form, .tf-market-row, [data-testid=offer-reservation], [data-testid=offer-sent]';

await start();
const student = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-SA' });
const teacher = await context();
let requestId = '';
let offerId = '';

async function noInlineMarketplace(page, where) {
  assert.equal(await page.locator(INLINE).count(), 0, `${where}: no Wave 2 inline marketplace control`);
}

await step('1. a student who opens /requests lands on the request-mode choice', async () => {
  const { page } = student;
  await registerStudent(student, `طالب UX-05 ${stamp}`, studentEmail, studentPassword);
  await visit(page, `${BASE}/ar/requests`);
  await page.waitForURL(url => pathOf(url) === '/ar/requests/new', { timeout: 15000 });
  await page.locator('[data-testid=request-modes]').waitFor({ timeout: 15000 });
  await noInlineMarketplace(page, 'student /requests');
  await noHorizontalOverflow(page, 'request-mode choice');

  // Every link to the demand path on the public pages is the canonical one.
  await visit(page, `${BASE}/ar/`);
  assert.equal(await page.locator('a[href="/ar/requests"], a[href="/ar/requests/"]').count(), 0, 'no public link to the retired page');
  assert.ok(await page.locator('a[href^="/ar/requests/new"]').count() > 0, 'the landing page links to the request-mode choice');
  await shot(page, 'ux05-01-student-choice');
});

await step('2. a teacher who opens /requests lands on Open requests, and the header says so', async () => {
  const { page } = teacher;
  // The request the rest of the journey is about: published by the student, offered on by teacher A.
  const published = await api(studentEmail, 'POST', '/api/v1/open-marketplace/requests', {
    subjectId: SEED.subjectId, serviceCatalogItemId: SEED.recordedCatalogId, title,
    requirements: 'اشرح كل تمرين في الفصل السابع خطوة بخطوة.',
    deadline: new Date(Date.now() + 3 * 86_400_000).toISOString(), budgetMin: null, budgetMax: null
  }, {}, studentPassword);
  assert.equal(published.status, 201, JSON.stringify(published.body));
  requestId = published.body.id;
  const offered = await api(SEED.teacherA.Email, 'POST', `/api/v1/open-marketplace/opportunities/${requestId}/offers`,
    { amount: 150, deliveryHours: 48, includedRevisions: 2, validityHours: 72, message: 'I will explain every exercise.' });
  assert.equal(offered.status, 201, JSON.stringify(offered.body));
  offerId = offered.body.id;

  await signIn(teacher, SEED.teacherA.Email);
  await visit(page, `${BASE}/en/requests`);
  await page.waitForURL(url => pathOf(url) === '/en/teacher/opportunities', { timeout: 15000 });
  await page.locator('article.tf-dashboard-card', { hasText: title }).waitFor({ timeout: 20000 });
  await noInlineMarketplace(page, 'teacher /requests');

  await visit(page, `${BASE}/en/about`);
  const demand = page.locator('[data-testid=header-demand-link]');
  assert.match(await demand.getAttribute('href') ?? '', /^\/en\/teacher\/opportunities\/?$/);
  assert.equal((await demand.innerText()).trim(), 'Open requests');
  await shot(page, 'ux05-02-teacher-open-requests');
});

await step('3. a stored ?requestId link opens the request on each role\'s own screen', async () => {
  await visit(teacher.page, `${BASE}/en/requests?requestId=${requestId}`);
  await teacher.page.waitForURL(url => pathOf(url) === `/en/teacher/opportunities/${requestId}`, { timeout: 15000 });
  await teacher.page.locator('[data-testid=my-offer]').waitFor({ timeout: 15000 });
  await noInlineMarketplace(teacher.page, 'teacher opportunity');

  await visit(student.page, `${BASE}/ar/requests?requestId=${requestId}`);
  await student.page.waitForURL(url => pathOf(url) === `/ar/requests/${requestId}`, { timeout: 15000 });
  await student.page.locator('[data-testid=request-status]').waitFor({ timeout: 15000 });
  await noInlineMarketplace(student.page, 'student request');

  // Not a request id: ignored, never followed.
  await visit(teacher.page, `${BASE}/en/requests?requestId=..%2Fadmin`);
  await teacher.page.waitForURL(url => pathOf(url) === '/en/teacher/opportunities', { timeout: 15000 });
  assert.equal(sql(`SELECT COUNT(*) FROM TeacherOffers WHERE LearningRequestId = '${requestId}'`), '1', 'following links changed nothing');
  await shot(student.page, 'ux05-03-student-request');
});

await step('4. the server still refuses the wrong role and the wrong participant', async () => {
  // Routing only forwards; the API decides who may see what.
  assert.equal((await api(SEED.teacherB.Email, 'GET', `/api/v1/open-marketplace/requests/${requestId}/offers`)).status, 403,
    'a teacher cannot read a student\'s offer list');
  assert.equal((await api(SEED.outsider.Email, 'GET', `/api/v1/open-marketplace/requests/${requestId}/offers`)).status, 404,
    'another student cannot read it');
});

await step('5. the payment reminder links to the reserved request, reads in Arabic, and opens its payment', async () => {
  const { page } = student;
  await visit(page, `${BASE}/ar/requests/${requestId}/offers`);
  const offer = page.locator(`[data-testid=offer][data-offer-id="${offerId}"]`);
  await offer.locator('[data-testid=select-offer]').click();
  const selected = waitForCall(page, 'POST', new RegExp(`/offers/${offerId}/select$`));
  await confirmDialog(page);
  assert.equal((await selected).status(), 204);

  // The host holds a selection for 20 minutes, so the next one-minute scan sends the reminder.
  const deadline = Date.now() + 150_000;
  let link = '';
  while (Date.now() < deadline) {
    link = sql(`SELECT TOP 1 n.Link FROM Notifications n JOIN AspNetUsers u ON u.Id = n.UserId
      WHERE u.Email = '${studentEmail}' AND n.Type = 'OfferReservationReminder'`);
    if (link) break;
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  assert.equal(link, `/requests/${requestId}`, 'the reminder names the request, not the retired list');

  await visit(page, `${BASE}/ar/student/notifications`);
  const action = page.locator(`[data-testid=notification-action][href="/ar/requests/${requestId}/"], [data-testid=notification-action][href="/ar/requests/${requestId}"]`);
  await action.waitFor({ state: 'visible', timeout: 15000 });
  const card = page.locator('article', { has: action });
  assert.match(await card.innerText(), /أكمل الدفع قبل انتهاء حجز العرض/);
  assert.equal(await page.getByText('Complete payment to keep your Offer').count(), 0, 'no English server title in Arabic');
  await shot(page, 'ux05-05-reminder');

  await action.tap();
  await page.waitForURL(url => pathOf(url) === `/ar/requests/${requestId}`, { timeout: 15000 });
  const pay = page.locator('[data-testid=pay-reserved]');
  await pay.waitFor({ timeout: 15000 });
  await noInlineMarketplace(page, 'request from the reminder');
  await pay.click();
  await page.waitForURL(url => pathOf(url) === '/ar/checkout', { timeout: 15000 });
  assert.equal(new URL(page.url()).searchParams.get('learningRequestId'), requestId);
  await page.locator('[data-testid=checkout-reservation]').waitFor({ timeout: 15000 });
  await noHorizontalOverflow(page, 'checkout from the reminder');
  await shot(page, 'ux05-05-checkout');
});

await step('no script errors on any page', async () => {
  assert.deepEqual([...student.page.problems, ...teacher.page.problems], []);
});

await finish('UX-05 canonical paths');
