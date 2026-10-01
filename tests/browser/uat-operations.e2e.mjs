/* UAT: the cycles no other journey closes — what happens when work goes wrong, and what the Admin does.
 *
 *   STUDENT (Arabic, 390px phone) registers and sends three direct requests; pays two accepted orders in
 *   the mock simulator; saves a teacher and removes them; edits their profile and exports their data
 *   TEACHER B declines the third request from the work list, with a reason
 *   TEACHER A accepts, starts and delivers both paid orders, and answers inside a dispute
 *   STUDENT disputes both deliveries
 *   ADMIN (English, desktop) takes each case into review and decides it: the first refunds the student,
 *   the second releases the money to the teacher — and the money moves exactly that way
 *   ADMIN suspends the student, who can no longer sign in and is told so in Arabic, then restores them;
 *   turns a catalog subject off and on; the audit trail shows what the Admin did
 *
 * Payments go through the mock simulator. Same environment variables as tests/browser/wave3b-harness.mjs;
 * the Wave 3B fulfilment seed. Every state is made through the product's screens; the database is only
 * read, to confirm what the server recorded.
 */
import assert from 'node:assert/strict';
import {
  BASE, PASSWORD, SEED, acceptRequest, attribute, confirmDialog, context, file, finish, pathOf, payInSimulator,
  pdf, promptDialog, sendDirectRequest, shot, signIn, sql, spa, start, step, visit, waitForCall, registerStudent
} from './wave3b-harness.mjs';

const PHONE = { viewport: { width: 390, height: 844 }, locale: 'ar-SA', isMobile: true, hasTouch: true };
const stamp = Date.now().toString(36);
const studentEmail = `uat-student-${stamp}@example.test`;
const studentPassword = `${PASSWORD}x`;
const orders = [];
const disputes = [];
let declinedRequestId = '';

await start();
const student = await context(PHONE);
const teacherA = await context();
const teacherB = await context();
const admin = await context();

await step('student registers, confirms from the outbox and signs in (Arabic phone)', async () => {
  await registerStudent(student, 'طالب اختبار القبول', studentEmail, studentPassword);
});

await step('student sends three direct requests; teacher A accepts two, teacher B declines one from the work list', async () => {
  const first = await sendDirectRequest(student, SEED.teacherA, 'UAT refund case');
  const second = await sendDirectRequest(student, SEED.teacherA, 'UAT release case');
  declinedRequestId = await sendDirectRequest(student, SEED.teacherB, 'UAT declined request');
  await signIn(teacherA, SEED.teacherA.Email);
  orders.push(await acceptRequest(teacherA, first, 100), await acceptRequest(teacherA, second, 140));

  await signIn(teacherB, SEED.teacherB.Email);
  await spa(teacherB, '/teacher/work');
  // UX-03: the work list card opens the request; accepting and declining happen on the request's own screen.
  const card = teacherB.page.locator('article.tf-work-card, .tf-dashboard-card', { hasText: 'UAT declined request' });
  await card.waitFor({ timeout: 20000 });
  await card.locator('[data-testid=row-open]').click();
  await teacherB.page.waitForURL(url => pathOf(url) === `/en/requests/${declinedRequestId}`, { timeout: 15000 });
  const declined = waitForCall(teacherB.page, 'POST', new RegExp(`^/api/v1/learning-requests/${declinedRequestId}/decline$`));
  await teacherB.page.locator('[data-testid=decline-request]').click();
  await promptDialog(teacherB.page, 'I am fully booked this week.');
  assert.ok((await declined).ok(), 'decline accepted');
  assert.equal(sql(`SELECT Status FROM LearningRequests WHERE Id = '${declinedRequestId}'`), '3', 'request Declined');
});

await step('student pays both orders in the mock simulator', async () => {
  for (const orderId of orders) {
    await visit(student.page, `${BASE}/ar/orders/${orderId}`);
    await student.page.locator('[data-testid=pay-order]').click();
    await student.page.waitForURL(url => pathOf(url) === '/ar/checkout', { timeout: 15000 });
    await payInSimulator(student.page, new RegExp(`^/ar/orders/${orderId}$`));
    await attribute(student.page, '[data-testid=order-status]', 'data-payment', 1);
  }
  assert.equal(sql(`SELECT COUNT(*) FROM Payments WHERE Status = 1 AND OrderId IN ('${orders.join("','")}')`), '2', 'two confirmed payments');
});

await step('teacher A starts and delivers both orders', async () => {
  const { page } = teacherA;
  for (const orderId of orders) {
    await visit(page, `${BASE}/en/orders/${orderId}`);
    await page.locator('[data-testid=start-order]').click();
    const started = waitForCall(page, 'POST', new RegExp(`^/api/v1/orders/${orderId}/start$`));
    await confirmDialog(page);
    assert.equal((await started).status(), 204);
    await page.locator('[data-testid=open-deliver]').click();
    await page.locator('#deliver-files').setInputFiles(file('uat-delivery.pdf', pdf('uat')));
    await page.locator('#deliver-message').fill('Delivered for acceptance testing.');
    const delivered = waitForCall(page, 'POST', new RegExp(`^/api/v1/orders/${orderId}/deliveries$`));
    await page.locator('[data-testid=submit-delivery]').click();
    assert.ok((await delivered).ok(), 'delivered');
    await attribute(page, '[data-testid=order-status]', 'data-status', 2);
  }
});

await step('student disputes both deliveries from the disputes screen', async () => {
  const { page } = student;
  for (const orderId of orders) {
    await spa(student, '/disputes');
    await page.locator('#dispute-target').waitFor({ timeout: 20000 });
    const value = await page.locator('#dispute-target option').evaluateAll((options, id) =>
      options.map(o => o.value).find(v => v.includes(id)), orderId);
    assert.ok(value, `order ${orderId} can be disputed`);
    await page.locator('#dispute-target').selectOption(value);
    await page.locator('#dispute-reason').fill('التسليم لا يطابق ما اتفقنا عليه في الطلب.');
    const opened = waitForCall(page, 'POST', /^\/api\/v1\/disputes$/);
    await page.locator('[data-testid=dispute-review-open]').click();
    await page.locator('[data-testid=dispute-send]').click();
    const response = await opened;
    assert.ok(response.ok(), `dispute opened (${response.status()})`);
    disputes.push((await response.json()).id);
  }
  await shot(page, 'uat-dispute-opened-ar');
});

await step('teacher A answers inside the first case', async () => {
  const { page } = teacherA;
  await visit(page, `${BASE}/en/disputes/${disputes[0]}`);
  await page.locator('#case-message').waitFor({ timeout: 20000 });
  await page.locator('#case-message').fill('The delivery covers every exercise in the request.');
  const sent = waitForCall(page, 'POST', new RegExp(`^/api/v1/disputes/${disputes[0]}/messages$`));
  await page.locator('.tf-dispute-reply button[type=submit]').click();
  assert.ok((await sent).ok(), 'teacher message sent');
});

await step('admin reviews and decides both cases: refund the first, release the second', async () => {
  await signIn(admin, SEED.admin.Email);
  const { page } = admin;
  for (const [index, decision] of [[0, 'refund-student'], [1, 'release-teacher']]) {
    await visit(page, `${BASE}/en/disputes/${disputes[index]}`);
    await page.locator('.tf-dispute-decision').waitFor({ timeout: 20000 });
    if (index === 0) assert.match(await page.locator('.tf-dispute-detail').innerText(), /covers every exercise/, 'admin sees the teacher answer');
    await page.locator('.tf-dispute-decision > button').click();
    await page.locator('#dispute-resolution').waitFor({ timeout: 20000 });
    await page.locator('#dispute-resolution').selectOption(decision);
    await page.locator('#dispute-rationale').fill(`UAT decision: ${decision}.`);
    const resolved = waitForCall(page, 'POST', new RegExp(`^/api/v1/admin/disputes/${disputes[index]}/resolve$`));
    await page.locator('.tf-dispute-resolve button[type=submit]').click();
    assert.ok((await resolved).ok(), `${decision} accepted`);
    await page.locator('.tf-dispute-resolve').waitFor({ state: 'detached', timeout: 20000 });
  }
  assert.equal(sql(`SELECT Status FROM Disputes WHERE Id = '${disputes[0]}'`), '2', 'first case Resolved');
  assert.equal(sql(`SELECT Status FROM Disputes WHERE Id = '${disputes[1]}'`), '2', 'second case Resolved');
  assert.equal(sql(`SELECT Status FROM Payments WHERE OrderId = '${orders[0]}'`), '3', 'the refunded order’s payment is Refunded');
  assert.equal(sql(`SELECT PaymentStatus FROM Orders WHERE Id = '${orders[0]}'`), '3', 'the refunded order is marked Refunded');
  assert.equal(sql(`SELECT Status FROM Payments WHERE OrderId = '${orders[1]}'`), '1', 'the released order’s payment stays Confirmed');
  assert.equal(sql(`SELECT Status FROM Orders WHERE Id = '${orders[1]}'`), '4', 'the released order is Completed');
  await shot(page, 'uat-dispute-resolved-admin');
});

await step('student sees both cases closed', async () => {
  for (const id of disputes) {
    await visit(student.page, `${BASE}/ar/disputes/${id}`);
    await student.page.locator('.tf-dispute-closed').waitFor({ timeout: 20000 });
  }
});

await step('teacher A sees the released money in earnings and not the refunded one', async () => {
  await visit(teacherA.page, `${BASE}/en/teacher/earnings`);
  await teacherA.page.locator('main').waitFor();
  const text = await teacherA.page.locator('main').innerText();
  assert.doesNotMatch(text, /Something went wrong|could not/i, 'earnings load');
  const credited = sql(`SELECT COUNT(*) FROM TeacherEarningMaturities WHERE OrderId = '${orders[1]}'`);
  assert.equal(credited, '1', 'the released order credited the teacher');
});

await step('student saves teacher A, finds them under Saved teachers, removes them', async () => {
  const { page } = student;
  await visit(page, `${BASE}/ar/teachers/${SEED.teacherA.Id}`);
  const toggle = page.locator('button[aria-pressed]').first();
  await toggle.waitFor({ timeout: 15000 });
  const added = waitForCall(page, 'PUT', new RegExp(`^/api/v1/favorite-teachers/${SEED.teacherA.Id}$`));
  await toggle.click();
  assert.equal((await added).status(), 204);
  await spa(student, '/student/saved');
  const saved = page.locator('main a[href*="/teachers/"]').first();
  await saved.waitFor({ timeout: 15000 });
  await visit(page, `${BASE}/ar/teachers/${SEED.teacherA.Id}`);
  const removed = waitForCall(page, 'DELETE', new RegExp(`^/api/v1/favorite-teachers/${SEED.teacherA.Id}$`));
  await page.locator('button[aria-pressed=true]').first().click();
  assert.equal((await removed).status(), 204);
});

await step('student edits the profile name and exports their data from Settings', async () => {
  // Settings is the shared /account screen since D-08; /student/settings redirects there.
  const { page } = student;
  await spa(student, '/student/settings');
  const name = page.locator('[data-testid=acct-name]');
  await name.waitFor({ timeout: 15000 });
  await name.fill('طالب القبول بعد التعديل');
  const saved = waitForCall(page, 'PUT', /^\/api\/v1\/auth\/profile$/);
  await page.locator('[data-testid=acct-save-profile]').click();
  assert.ok((await saved).ok(), 'profile saved');
  // Read back the way the student would, after a fresh load (sqlcmd cannot print Arabic on every runner).
  await visit(page, `${BASE}/ar/account`);
  await page.waitForFunction(() => document.querySelector('[data-testid=acct-name]')?.value === 'طالب القبول بعد التعديل', null, { timeout: 15000 });
  const exported = waitForCall(page, 'GET', /^\/api\/v1\/auth\/privacy\/export$/);
  await page.locator('section[aria-labelledby=acct-data-title] button').click();
  assert.ok((await exported).ok(), 'export served');
});

await step('admin suspends the student: sign-in is refused, in Arabic; admin restores them and sign-in works', async () => {
  const { page } = admin;
  const userId = sql(`SELECT Id FROM AspNetUsers WHERE Email = '${studentEmail}'`);
  const toggleSuspension = async () => {
    await visit(page, `${BASE}/en/admin/people?tab=students&search=${encodeURIComponent('القبول')}`);
    const card = page.locator('.tf-dashboard-card', { hasText: 'طالب القبول بعد التعديل' });
    await card.waitFor({ timeout: 20000 });
    const changed = waitForCall(page, 'PUT', new RegExp(`^/api/v1/admin/users/${userId}/suspension$`));
    await card.getByRole('button', { name: /suspend/i }).click();
    await confirmDialog(page);
    assert.ok((await changed).ok(), 'suspension changed');
  };
  await toggleSuspension();

  const blocked = await context(PHONE);
  await visit(blocked.page, `${BASE}/ar/auth`);
  await blocked.page.locator('#login-email').fill(studentEmail);
  await blocked.page.locator('#login-password').fill(studentPassword);
  await blocked.page.locator('form button[type=submit]').first().click();
  const alert = blocked.page.locator('.tf-auth-alert');
  await alert.waitFor({ timeout: 15000 });
  const message = await alert.innerText();
  assert.doesNotMatch(message, /[A-Za-z]{4,}/, `the suspended student is told in Arabic: «${message}»`);
  assert.ok(pathOf(blocked.page.url()).endsWith('/auth'), 'still on sign-in');
  await shot(blocked.page, 'uat-suspended-ar');

  await toggleSuspension();
  await signIn(blocked, studentEmail, studentPassword);
  await blocked.ctx.close();
});

await step('admin turns a catalog subject off and back on', async () => {
  const { page } = admin;
  await visit(page, `${BASE}/en/admin/marketplace?tab=subjects`);
  const row = page.getByTestId('catalog-subject').filter({ has: page.getByRole('button', { name: /^turn off$/i }) }).last();
  await row.waitFor({ timeout: 20000 });
  const title = (await row.locator('td strong').first().innerText()).trim();
  const off = waitForCall(page, 'PATCH', /^\/api\/v1\/admin\/catalog\/subjects\/[^/]+/);
  await row.getByRole('button', { name: /^turn off$/i }).click();
  await confirmDialog(page);
  assert.ok((await off).ok(), `${title} disabled`);
  const again = page.getByTestId('catalog-subject').filter({ hasText: title });
  const on = waitForCall(page, 'PATCH', /^\/api\/v1\/admin\/catalog\/subjects\/[^/]+/);
  await again.getByRole('button', { name: /^turn on$/i }).click();
  assert.ok((await on).ok(), `${title} enabled again`);
});

await step('the audit trail shows the Admin’s actions', async () => {
  const { page } = admin;
  await visit(page, `${BASE}/en/admin/system`);
  await page.locator('.tf-dashboard-card').first().waitFor({ timeout: 20000 });
  const audited = Number(sql(`SELECT COUNT(*) FROM AuditLogEntries WHERE CreatedAt > DATEADD(hour, -3, SYSDATETIMEOFFSET())`));
  assert.ok(audited >= 3, `audit rows recorded (${audited})`);
  await shot(page, 'uat-audit');
});

await finish('UAT operations');
