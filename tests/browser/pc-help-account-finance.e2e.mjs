/* PRODUCT-P1: help reports, account self-service and the Finance role's boundaries, on a fresh database.
 *
 *   1. A student reports harassment from Help (Arabic, phone width) and gets a reference number.
 *   2. An Admin finds it in Help and reports, takes it, answers, and resolves it with an outcome.
 *   3. The student reads the answer and the outcome in Arabic; the Admin's name is never shown to them.
 *   4. The student renames themselves, signs out another device, and changes the password: they land on the
 *      sign-in page, told why, and the new password works.
 *   5. A Finance user lands on the Finance workspace, is sent away from Admin screens, and the API refuses
 *      Admin-only work while money work is allowed.
 */
import assert from 'node:assert/strict';
import {
  BASE, SEED, api, confirmDialog, context, finish, noHorizontalOverflow, pathOf, registerStudent, shot, signIn, spa,
  start, step, visit, waitForCall
} from './wave3b-harness.mjs';

const stamp = Date.now();
const email = `pc-help-${stamp}@example.test`;
const password = `Help!Report-${stamp}`;
const newPassword = `Changed!Pass-${stamp}`;
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-SA' };

await start();
const student = await context(phone);
const admin = await context();
let caseId = '';
let reference = '';

await step('1. a student reports harassment from Help and receives a reference', async () => {
  await registerStudent(student, `طالب بلاغ ${stamp}`, email, password);
  const { page } = student;
  await spa(student, '/help?category=harassment&about=conversation:e2e');
  await page.locator('[data-testid=help-form]').waitFor({ timeout: 15000 });
  assert.equal(await page.locator('[data-testid=help-category-harassment] input').isChecked(), true, 'the category the link carried');
  await page.locator('[data-testid=help-description]').fill('A teacher keeps messaging me after I declined their offer.');
  const created = waitForCall(page, 'POST', /^\/api\/v1\/support\/cases$/);
  await page.locator('[data-testid=help-submit]').click();
  const response = await created;
  assert.ok(response.ok(), 'report created');
  const body = await response.json();
  caseId = body.id;
  reference = body.reference;
  assert.match(reference, /^TFS-H-/);
  await page.locator('[data-testid=help-received]').waitFor({ timeout: 15000 });
  assert.match(await page.locator('[data-testid=help-case-reference]').innerText(), new RegExp(reference));
  await noHorizontalOverflow(page, 'help case at 390px');
  await shot(page, 'pc-help-received-ar-phone');
});

await step('2. an Admin takes the report, answers it and resolves it with an outcome', async () => {
  await signIn(admin, SEED.admin.Email);
  const { page } = admin;
  await spa(admin, '/admin/help');
  await page.locator('[data-testid=help-queue-row]', { hasText: reference }).waitFor({ timeout: 15000 });
  await page.locator('[data-testid=help-queue-open]', { hasText: reference }).click();
  await page.waitForURL(url => pathOf(url) === `/en/admin/help/${caseId}`, { timeout: 15000 });
  await page.locator('[data-testid=admin-help-email]').waitFor();
  const taken = waitForCall(page, 'POST', new RegExp(`^/api/v1/admin/support/cases/${caseId}/take$`));
  await page.locator('[data-testid=admin-help-take]').click();
  assert.ok((await taken).ok(), 'taken');
  await page.locator('[data-testid=admin-help-reply]').fill('Thank you. We have spoken to the teacher.');
  const replied = waitForCall(page, 'POST', new RegExp(`^/api/v1/support/cases/${caseId}/messages$`));
  await page.locator('[data-testid=admin-help-send]').click();
  assert.ok((await replied).ok(), 'answered');
  await page.locator('[data-testid=admin-help-outcome]').fill('The teacher was warned and can no longer message you.');
  const resolved = waitForCall(page, 'POST', new RegExp(`^/api/v1/admin/support/cases/${caseId}/resolve$`));
  await page.locator('[data-testid=admin-help-resolve]').click();
  await confirmDialog(page);
  assert.ok((await resolved).ok(), 'resolved');
  await shot(page, 'pc-help-admin-resolved');
});

await step('3. the student reads the answer and the outcome in Arabic, without the Admin’s name', async () => {
  const { page } = student;
  // The student comes back later: a fresh load of the case, as from the notification.
  await visit(page, `${BASE}/ar/help/cases/${caseId}`);
  await page.locator('[data-testid=help-case-outcome]').waitFor({ timeout: 15000 });
  const text = await page.locator('[data-testid=help-case]').innerText();
  assert.match(text, /The teacher was warned/);
  assert.doesNotMatch(text, /E2E Admin|Administrator/i, 'staff are "Tafseel", never a name');
  assert.equal(await page.locator('[data-testid=help-message][data-staff=true]').count(), 1);
  await shot(page, 'pc-help-outcome-ar-phone');
});

await step('4. account self-service: rename, sign out another device, change the password', async () => {
  const other = await context();
  await signIn(other, email, password);
  const { page } = student;
  await spa(student, '/account');
  await page.locator('[data-testid=acct-profile]').waitFor({ timeout: 15000 });
  await page.locator('[data-testid=acct-name]').fill(`طالب معدّل ${stamp}`);
  const renamed = waitForCall(page, 'PUT', /^\/api\/v1\/auth\/profile$/);
  await page.locator('[data-testid=acct-save-profile]').click();
  assert.ok((await renamed).ok(), 'renamed');
  assert.match(await page.locator('[data-testid=acct-notify-always]').innerText(), /تصلك دائمًا/);

  await page.locator('[data-testid=acct-device][data-current=false]').first().waitFor({ timeout: 15000 });
  const signedOut = waitForCall(page, 'POST', /^\/api\/v1\/auth\/sessions\/sign-out-others$/);
  await page.locator('[data-testid=acct-sign-out-others]').click();
  await confirmDialog(page);
  assert.ok((await signedOut).ok(), 'other devices signed out');
  const refresh = await other.page.evaluate(async () => (await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })).status);
  assert.notEqual(refresh, 200, 'the other device can no longer refresh its sign-in');
  await other.ctx.close();
  await noHorizontalOverflow(page, 'account settings at 390px');
  await shot(page, 'pc-account-ar-phone');

  await page.locator('[data-testid=acct-current-password]').fill(password);
  await page.locator('[data-testid=acct-new-password]').fill(newPassword);
  const changed = waitForCall(page, 'PUT', /^\/api\/v1\/auth\/password$/);
  await page.locator('[data-testid=acct-change-password]').click();
  await confirmDialog(page);
  assert.equal((await changed).status(), 204);
  await page.waitForURL(url => pathOf(url) === '/ar/auth', { timeout: 15000 });
  await page.locator('.tf-auth-success, [role=status]').first().waitFor({ timeout: 10000 });
  await signIn(student, email, newPassword);
});

await step('5. Finance works money and is kept out of Admin', async () => {
  const finance = await context();
  await signIn(finance, SEED.finance.Email);
  assert.equal(pathOf(finance.page.url()), '/en/finance/home');
  await visit(finance.page, `${BASE}/en/admin/people`);
  await finance.page.waitForURL(url => pathOf(url) === '/en/finance/home', { timeout: 15000 });
  const users = await api(SEED.finance.Email, 'GET', '/api/v1/admin/users?page=1&pageSize=5');
  assert.equal(users.status, 403, 'people management is Admin work');
  const payments = await api(SEED.finance.Email, 'GET', '/api/v1/finance/payments?page=1&pageSize=5');
  assert.equal(payments.status, 200, 'payment lookup is Finance work');
  await spa(finance, '/account');
  await finance.page.locator('[data-testid=acct-password]').waitFor({ timeout: 15000 });
  await finance.ctx.close();
});

for (const actor of [student, admin]) assert.deepEqual(actor.page.problems, [], 'no script errors');
await student.ctx.close();
await admin.ctx.close();
await finish('help, account and Finance boundaries');
