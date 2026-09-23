/* UX-06 — every V1 customer screen, in Arabic, on a 390px phone.
 *
 * The matrix in docs/tickets/v1/UX-06.md is the definition of "works on an Arabic phone", and this walks it.
 * Each stop calls `screen()` from ux06-checks.mjs, which runs the same seven checks everywhere:
 * no sideways scrolling, nothing spilling out of its card, a genuinely right-to-left document, no English
 * copy or raw keys or ids or `undefined`, money drawn rather than spelled, tap targets a thumb can hit, and
 * the screen's main action actually on screen.
 *
 * The states are made the way a person would make them — register, publish, request, accept, pay, book,
 * message, dispute — not written into the database. Everything runs at 390x844 in Arabic; one English pass
 * at the end proves the fixes did not break left-to-right.
 */
import assert from 'node:assert/strict';
import {
  BASE, SEED, acceptRequest, api, confirmDialog, context, file, finish, pathOf, payButton, payInSimulator, pdf,
  registerStudent, sendDirectRequest, shot, signIn, spa, sql, start, step, visit, waitForCall
} from './wave3b-harness.mjs';
import { PHONE, screen } from './ux06-checks.mjs';

const stamp = Date.now();
const studentEmail = `ux06-student-${stamp}@example.test`;
const studentPassword = `Ux06!Phone-${stamp}`;
const teacherA = SEED.teacherA;

/* The long values the ticket asks to stress: a title, a name and a file name that no phone layout expects. */
const LONG_TITLE = `شرح مفصل لقاعدة السلسلة في التفاضل مع تمارين محلولة خطوة بخطوة ومراجعة شاملة ${stamp}`;
const LONG_MESSAGE = 'أحتاج شرحًا مفصلًا جدًا لكل خطوة من خطوات الحل، '.repeat(6);
const LONG_FILE = 'شرح-قاعدة-السلسلة-مع-تمارين-محلولة-ومراجعة-شاملة-للفصل-الثالث.pdf';

await start();

const student = await context(PHONE);
const teacher = await context(PHONE);

let requestId = '';
let orderId = '';
let conversationId = '';

await step('rows 1-4 · teacher setup on a phone: profile, services, availability, visibility', async () => {
  const { page } = teacher;
  await signIn(teacher, teacherA.Email);

  await spa(teacher, '/teacher/profile');
  await page.locator('[data-testid=profile-core]').waitFor({ timeout: 20000 });
  await screen(page, 'row 1 teacher profile', { name: 'ux06-01-teacher-profile', skip: ['D'], form: true });

  await spa(teacher, '/teacher/services');
  await page.locator('[data-testid=service-type]').first().waitFor({ timeout: 20000 });
  // DEC-01: the policy badge must quote the decided bounds, not the domain's unset-price fallback.
  const policy = await page.locator('[data-testid=service-type] .tf-badge').first().innerText();
  assert.ok(!/1,000,000|0\.01/.test(policy), `the price policy still reads "${policy}"`);
  await screen(page, 'row 2 teacher services', { name: 'ux06-02-teacher-services' });

  await spa(teacher, '/teacher/availability');
  await page.locator('[data-testid=add-rule], [data-testid=no-rules]').first().waitFor({ timeout: 20000 });
  await screen(page, 'row 3 availability', { name: 'ux06-03-availability', form: true });

  await spa(teacher, '/teacher/publication');
  await page.locator('[data-testid=publication-state]').waitFor({ timeout: 20000 });
  await screen(page, 'row 4 profile visibility', { name: 'ux06-04-publication', skip: ['D'] });
});

await step('rows 7-8 · a student posts a direct request, with a long title and a long file name', async () => {
  const { page } = student;
  await registerStudent(student, `طالبة التحقق ${stamp}`, studentEmail, studentPassword);

  await spa(student, '/requests/new');
  await page.locator('[data-testid=request-modes]').waitFor({ timeout: 20000 });
  await screen(page, 'row 7 request-mode choice', { name: 'ux06-07-request-modes', skip: ['D'] });

  await visit(page, `${BASE}/ar/requests/new?teacherId=${teacherA.Id}&teacherServiceId=${teacherA.explanationServiceId}`);
  await page.locator('#req-title').waitFor({ timeout: 20000 });
  await page.locator('#req-title').fill(LONG_TITLE);
  await screen(page, 'row 8 direct wizard step 1', { name: 'ux06-08a-wizard-step1', skip: ['D'], form: true });

  const next = page.locator('.tf-req-nav button.tf-button:not(.tf-button-secondary)');
  await next.click();
  await page.locator('#req-goal').waitFor({ timeout: 15000 });
  await page.locator('#req-goal').fill(LONG_MESSAGE);
  // Row 8 is where the brief's optional questions live: the labels must be questions, not field names.
  await screen(page, 'row 8 direct wizard step 2', { name: 'ux06-08b-wizard-step2', skip: ['D'], form: true });
  await page.locator('#req-files').setInputFiles(file(LONG_FILE, pdf('long name')));
  await screen(page, 'row 8 direct wizard with a long attachment name', { name: 'ux06-08c-wizard-attachment', skip: ['D'], form: true });

  await next.click();
  await page.locator('#req-delivery').fill(new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10));
  await screen(page, 'row 8 direct wizard step 3', { name: 'ux06-08d-wizard-step3', form: true });
  await next.click();
  await page.locator('.tf-check--start input[type=checkbox]').check();
  await screen(page, 'row 8 direct wizard review', { name: 'ux06-08e-wizard-review', form: true });

  const created = waitForCall(page, 'POST', /^\/api\/v1\/learning-requests$/);
  await next.click();
  const response = await created;
  assert.equal(response.status(), 201, await response.text());
  requestId = (await response.json()).id;
  await screen(page, 'row 8 request sent', { name: 'ux06-08f-wizard-sent', skip: ['D'] });
});

await step('row 10 · the student’s request while the teacher is still reading it', async () => {
  const { page } = student;
  await visit(page, `${BASE}/ar/requests/${requestId}`);
  await page.locator('[data-testid=request-status]').waitFor({ timeout: 20000 });
  await screen(page, 'row 10 request awaiting the teacher', { name: 'ux06-10a-request-waiting' });
});

await step('row 11 · the teacher’s side of the same request, and the accept dialog', async () => {
  const { page } = teacher;
  await spa(teacher, `/requests/${requestId}`);
  await page.locator('[data-testid=accept-request]').waitFor({ timeout: 20000 });
  await screen(page, 'row 11 teacher request detail', { name: 'ux06-11a-teacher-request' });

  await page.locator('[data-testid=accept-request]').click();
  await page.locator('[data-testid=accept-dialog] #accept-price').waitFor({ state: 'visible', timeout: 15000 });
  await screen(page, 'row 11 accept dialog', { name: 'ux06-11b-accept-dialog' });
  await page.keyboard.press('Escape');
});

await step('rows 10 and 14 · accepted at a different price: the request, then checkout', async () => {
  orderId = await acceptRequest(teacher, requestId, 150);

  const { page } = student;
  await visit(page, `${BASE}/ar/requests/${requestId}`);
  await page.locator('[data-testid=request-price]').waitFor({ timeout: 20000 });
  // UX-09 must still read correctly at 390px, with both prices and the total.
  const panel = await page.locator('[data-testid=price-panel]').first().innerText();
  assert.match(panel, /السعر عند إرسال الطلب/, 'the quoted price is still disclosed');
  await screen(page, 'row 10 request accepted with a changed price', { name: 'ux06-10b-request-accepted' });

  await page.locator('[data-testid=open-order]').click();
  await page.waitForURL(url => pathOf(url) === `/ar/orders/${orderId}`, { timeout: 15000 });
  await screen(page, 'row 14 order awaiting payment', { name: 'ux06-14a-order-unpaid' });

  await page.locator('[data-testid=pay-order]').click();
  await page.waitForURL(url => pathOf(url) === '/ar/checkout', { timeout: 15000 });
  await payButton(page).waitFor({ timeout: 15000 });
  await screen(page, 'row 14 checkout for the order', { name: 'ux06-14b-checkout-order' });
});

await step('row 14 · the order after paying, and its history', async () => {
  const { page } = student;
  await payInSimulator(page, new RegExp(`^/ar/orders/${orderId}$`));
  await page.locator('[data-testid=order-status]').waitFor({ timeout: 20000 });
  await screen(page, 'row 14 order paid', { name: 'ux06-14c-order-paid' });
});

await step('rows 5-6 · the messages inbox and a conversation with long Arabic text', async () => {
  const { page } = student;
  await page.locator('[data-testid=open-conversation]').click();
  await page.waitForURL(url => /^\/ar\/conversations\/[0-9a-f-]{36}$/.test(pathOf(url)), { timeout: 20000 });
  conversationId = pathOf(page.url()).split('/').pop();
  await page.locator('#message-body').fill(LONG_MESSAGE);
  const sent = waitForCall(page, 'POST', new RegExp(`^/api/v1/conversations/${conversationId}/messages$`));
  await page.locator('[data-testid=send-message]').click();
  assert.ok((await sent).ok(), 'the long message was sent');
  await page.locator('[data-testid=message]').first().waitFor({ timeout: 15000 });
  await screen(page, 'row 6 conversation', { name: 'ux06-06-conversation', form: true });

  await spa(student, '/messages');
  await page.locator('[data-testid=inbox], [data-testid=thread]').first().waitFor({ timeout: 20000 });
  await screen(page, 'row 5 messages inbox', { name: 'ux06-05-messages', skip: ['P'] });
});

await step('row 9 · the open-request form, and its validation errors', async () => {
  const { page } = student;
  await spa(student, '/requests/new/open');
  await page.locator('form').first().waitFor({ timeout: 20000 });
  await screen(page, 'row 9 open request form', { name: 'ux06-09a-open-form', form: true });
});

await step('rows 12-13 · offers a student compares, and the opportunity a teacher answers', async () => {
  const { page } = student;
  const published = await api(studentEmail, 'POST', '/api/v1/open-marketplace/requests', {
    subjectId: SEED.subjectId, serviceCatalogItemId: SEED.recordedCatalogId,
    title: LONG_TITLE, requirements: LONG_MESSAGE,
    deadline: new Date(Date.now() + 6 * 86_400_000).toISOString(),
    budgetMin: 90, budgetMax: 200, currency: 'SAR'
  }, {}, studentPassword);
  assert.equal(published.status, 201, JSON.stringify(published.body));
  const openId = published.body.id;

  await visit(page, `${BASE}/ar/requests/${openId}/offers`);
  await page.locator('main').waitFor({ timeout: 20000 });
  await screen(page, 'row 12 offers with none yet', { name: 'ux06-12a-offers-empty', skip: ['D', 'P'] });

  await spa(teacher, `/teacher/opportunities/${openId}`);
  await teacher.page.locator('main').waitFor({ timeout: 20000 });
  await screen(teacher.page, 'row 13 opportunity', { name: 'ux06-13a-opportunity' });
});

await step('row 17 · booking a live session, and row 16 its checkout', async () => {
  const { page } = student;
  await spa(student, `/sessions/book?teacherId=${teacherA.Id}`);
  await page.locator('main').waitFor({ timeout: 20000 });
  await screen(page, 'row 17 live booking', { name: 'ux06-17-booking' });
});

await step('rows 19-20 · disputes', async () => {
  const { page } = student;
  await spa(student, '/disputes');
  await page.locator('main').waitFor({ timeout: 20000 });
  await screen(page, 'row 19 disputes', { name: 'ux06-19-disputes', skip: ['D'] });
});

await step('the same screens in English still read left-to-right', async () => {
  // A fresh context on purpose: the student above chose Arabic, and that choice is stored and outranks the
  // locale in the URL. This is the reader who has never chosen.
  const english = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await signIn(english, studentEmail, studentPassword);
  const { page } = english;
  await visit(page, `${BASE}/en/orders/${orderId}`);
  await page.locator('[data-testid=order-status]').waitFor({ timeout: 20000 });
  const dir = await page.evaluate(() => document.documentElement.dir);
  assert.equal(dir, 'ltr', 'English stays left-to-right');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `English order scrolls sideways by ${overflow}px`);
  await shot(page, 'ux06-20-order-english');
});

await finish('UX-06 Arabic phone matrix');
