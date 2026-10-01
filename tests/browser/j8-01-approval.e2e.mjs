/* J8-01: fresh-database Arabic phone request → teacher acceptance → student payment.
 * The seed provides only people/services; the request and payment are created here through UI.
 */
import assert from 'node:assert/strict';
import {
  BASE, SEED, api, attribute, context, finish, pathOf, payInSimulator,
  registerStudent, signIn, start, step, visit, waitForCall, pickSlot
} from './wave3b-harness.mjs';

const stamp = Date.now();
const email = `j8-01-${stamp}@example.test`;
const password = `J8!Approval-${stamp}`;
await start();
const student = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-SA' });
const teacher = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-SA' });
let sessionId = '';

await step('student sends an Arabic time request and the teacher receives its file', async () => {
  await registerStudent(student, `طالب جلسة ${stamp}`, email, password);
  await signIn(teacher, SEED.teacherA.Email);
  const page = student.page;
  await visit(page, `${BASE}/ar/sessions/book?teacherId=${SEED.teacherA.Id}&teacherServiceId=${SEED.teacherA.liveServiceId}`);
  await pickSlot(page, 0);
  // Choosing a time before describing the lesson must reveal what is missing.
  await page.locator('button.tf-book-confirm').click();
  await page.waitForFunction(() => document.getElementById('book-session-title')?.getAttribute('aria-invalid') === 'true');
  assert.equal(await page.locator('#book-session-title').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('#book-session-title').evaluate(el => el === document.activeElement), true);
  await page.locator('#book-session-title').fill(`شرح التفاضل ${stamp}`);
  await page.locator('button.tf-book-confirm').click();
  await page.waitForFunction(() => document.getElementById('book-topic')?.getAttribute('aria-invalid') === 'true');
  assert.equal(await page.locator('#book-topic').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('#book-topic').evaluate(el => el === document.activeElement), true);
  await page.locator('#book-topic').fill('أحتاج شرح المثال في الملف.');
  await page.locator('tf-file-picker input[type=file]').setInputFiles({
    name: 'exercise.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nexercise')
  });
  const created = waitForCall(page, 'POST', /^\/api\/v1\/live-sessions$/);
  const uploaded = waitForCall(page, 'POST', /^\/api\/v1\/live-sessions\/[0-9a-f-]+\/attachments$/);
  await page.locator('button.tf-book-confirm').click();
  const response = await created;
  assert.equal(response.status(), 201);
  sessionId = (await response.json()).id;
  assert.equal((await uploaded).status(), 201);
  await page.waitForURL(url => pathOf(url) === `/ar/live-sessions/${sessionId}`);
  await attribute(page, '[data-testid=session-status]', 'data-status', 9);
  assert.equal(await page.locator('[data-testid=pay-session]').count(), 0);
  assert.equal(await page.locator('html').getAttribute('lang'), 'ar');
  await visit(teacher.page, `${BASE}/ar/live-sessions/${sessionId}`);
  await attribute(teacher.page, '[data-testid=session-status]', 'data-status', 9);
  await teacher.page.getByText('exercise.pdf').waitFor();
});

await step('wrong actor and outsider cannot accept', async () => {
  const sessions = await api(email, 'GET', '/api/v1/live-sessions/mine?pageSize=50', undefined, {}, password);
  assert.equal(sessions.status, 200);
  const version = sessions.body.items.find(item => item.id === sessionId).version;
  const studentResponse = await api(email, 'POST', `/api/v1/live-sessions/${sessionId}/request/respond`,
    { accept: true }, { 'If-Match': version }, password);
  assert.equal(studentResponse.status, 403);
  const outsider = await api(SEED.teacherB.Email, 'POST', `/api/v1/live-sessions/${sessionId}/request/respond`,
    { accept: true }, { 'If-Match': version });
  assert.equal(outsider.status, 404);
});

await step('teacher accepts, then Arabic checkout becomes available and payment confirms', async () => {
  const accepted = waitForCall(teacher.page, 'POST', new RegExp(`^/api/v1/live-sessions/${sessionId}/request/respond$`));
  await teacher.page.locator('[data-testid=accept-session-request]').click();
  assert.equal((await accepted).status(), 204);
  await attribute(teacher.page, '[data-testid=session-status]', 'data-status', 0);
  await visit(student.page, `${BASE}/ar/live-sessions/${sessionId}`);
  await student.page.locator('[data-testid=pay-session]').click();
  await student.page.waitForURL(url => pathOf(url) === '/ar/checkout');
  assert.equal(await student.page.locator('html').getAttribute('lang'), 'ar');
  await payInSimulator(student.page, new RegExp(`^/ar/live-sessions/${sessionId}$`));
  await attribute(student.page, '[data-testid=session-status]', 'data-status', 1);
});

await finish('J8-01 teacher approval');
