/* UX-06 — every V1 customer screen, in Arabic, on a 390px phone.
 *
 * The matrix in docs/tickets/v1/UX-06.md is the definition of "works on an Arabic phone", and this walks all
 * twenty rows of it, plus the shells the ticket names beside them: the student and teacher homes, the
 * teacher's earnings and the phone navigation drawer. Each stop calls `screen()` from ux06-checks.mjs, which
 * runs the same seven checks everywhere: no sideways scrolling, nothing spilling out of its box, a genuinely
 * right-to-left document, no English copy or raw keys or ids or `undefined`, money drawn rather than spelled,
 * targets a thumb can hit, and the screen's main action within reach.
 *
 * Every state is made the way a person makes it — register, publish, ask, answer, accept, pay, start,
 * deliver, message, dispute, offer, select, book — through the product's screens and API, never by writing
 * business rows. The long values the ticket asks to stress travel through all of it: a long Arabic title, a
 * long Arabic message, a sixty-character file name, a high but valid price, a live countdown.
 *
 * Payments are rate-limited to ten a minute per student, so the three payments here are a minute apart, as
 * in the live-session journey. One English pass at the end proves left-to-right still holds.
 */
import assert from 'node:assert/strict';
import {
  BASE, SEED, acceptRequest, api, attribute, confirmDialog, context, file, finish, pathOf, payButton, payInSimulator,
  pdf, registerStudent, shot, signIn, spa, start, step, visit, waitForCall, waitUntil
} from './wave3b-harness.mjs';
import { PHONE, allowFixture, screen } from './ux06-checks.mjs';

const stamp = Date.now();
const studentEmail = `ux06-student-${stamp}@example.test`;
const studentPassword = `Ux06!Phone-${stamp}`;
const teacherA = SEED.teacherA;
const teacherBSeed = SEED.teacherB;

/* The long values the ticket asks to stress. */
const LONG_TITLE = `شرح مفصل لقاعدة السلسلة في التفاضل مع تمارين محلولة خطوة بخطوة ومراجعة شاملة ${stamp}`;
const LONG_MESSAGE = 'أحتاج شرحًا مفصلًا جدًا لكل خطوة من خطوات الحل، '.repeat(6);
const LONG_FILE = 'شرح-قاعدة-السلسلة-مع-تمارين-محلولة-ومراجعة-شاملة-للفصل-الثالث.pdf';
/** High but inside the recorded-explanation policy (DEC-01: 50-800 SAR). */
const HIGH_PRICE = 790;

// The seed names what it creates with a random hex run id; that is fixture text, not an English word.
allowFixture(new RegExp(SEED.run, 'gi'));

await start();

const student = await context(PHONE);
const teacher = await context(PHONE);
const teacherB = await context(PHONE);

let requestId = '';
let orderId = '';
let openId = '';
let offerA = '';
let sessionId = '';

// ------------------------------------------------------------------ teacher side, before any work exists

await step('rows 1-4 · teacher setup: profile, services, availability, visibility', async () => {
  const { page } = teacher;
  await signIn(teacher, teacherA.Email);

  await spa(teacher, '/teacher/profile');
  await page.locator('[data-testid=profile-core]').waitFor({ timeout: 20000 });
  await screen(page, 'row 1 teacher profile', { name: 'ux06-01-teacher-profile', skip: ['D'], form: true });

  await spa(teacher, '/teacher/services');
  await page.locator('[data-testid=service-type]').first().waitFor({ timeout: 20000 });
  // DEC-01: the policy badge quotes the decided bounds, never the domain's unset-price fallback.
  const policy = await page.locator('[data-testid=service-type] .tf-badge').first().innerText();
  assert.ok(!/1,000,000|0\.01/.test(policy), `the price policy still reads "${policy}"`);
  assert.match(policy, /50/, `the recorded explanation quotes its decided minimum ("${policy}")`);
  await screen(page, 'row 2 teacher services', { name: 'ux06-02-teacher-services' });

  await spa(teacher, '/teacher/availability');
  await page.locator('[data-testid=add-rule], [data-testid=no-rules]').first().waitFor({ timeout: 20000 });
  await screen(page, 'row 3 availability', { name: 'ux06-03-availability', form: true });

  await spa(teacher, '/teacher/publication');
  await page.locator('[data-testid=publication-state]').waitFor({ timeout: 20000 });
  await screen(page, 'row 4 profile visibility', { name: 'ux06-04-publication', skip: ['D'] });
});

await step('shells · teacher home, earnings and the phone navigation drawer', async () => {
  const { page } = teacher;
  await spa(teacher, '/teacher/home');
  await page.locator('main').waitFor({ timeout: 20000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await screen(page, 'teacher home', { name: 'ux06-shell-teacher-home' });

  await spa(teacher, '/teacher/earnings');
  await page.locator('[data-testid=earnings-available], [data-testid=earnings-empty]').first().waitFor({ timeout: 20000 });
  await screen(page, 'teacher earnings', { name: 'ux06-shell-teacher-earnings', skip: ['P'] });

  // The drawer is how a phone reaches every destination (UX-03); it must open inside the screen.
  await page.locator('[data-drawer-toggle]').click();
  await page.locator('#workspace-navigation[data-drawer="open"]').waitFor({ timeout: 10000 });
  assert.equal(await page.locator('[data-drawer-toggle]').getAttribute('aria-expanded'), 'true', 'the toggle says it is open');
  await page.locator('#workspace-navigation [data-testid=nav-item]').first().waitFor({ timeout: 10000 });
  const drawer = await page.locator('#workspace-navigation').boundingBox();
  assert.ok(drawer && drawer.x >= -1 && drawer.x + drawer.width <= 391, `the open drawer stays on screen (${JSON.stringify(drawer)})`);
  await screen(page, 'navigation drawer', { name: 'ux06-shell-drawer', skip: ['P', 'D'] });
  // Closed deliberately, so no open drawer is left lying over the teacher's next screens.
  await page.locator('[data-drawer-toggle]').click();
  await page.locator('#workspace-navigation[data-drawer="closed"]').waitFor({ state: 'attached', timeout: 10000 });
});

// ------------------------------------------------------------------ a student and a direct request

await step('rows 7-8 · a new student posts a direct request with a long title and a long file name', async () => {
  const { page } = student;
  await registerStudent(student, `طالبة التحقق ${stamp}`, studentEmail, studentPassword);

  await spa(student, '/student/overview');
  await page.locator('main').waitFor({ timeout: 20000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await screen(page, 'student home, new student', { name: 'ux06-shell-student-home-new' });

  await spa(student, '/requests/new');
  await page.locator('[data-testid=request-modes]').waitFor({ timeout: 20000 });
  await screen(page, 'row 7 request-mode choice', { name: 'ux06-07-request-modes', skip: ['D'] });

  // A full load: the wizard is already mounted at /requests/new and would not remount for a query change.
  await visit(page, `${BASE}/ar/requests/new?teacherId=${teacherA.Id}&teacherServiceId=${teacherA.explanationServiceId}`);
  await page.locator('#req-title').waitFor({ timeout: 20000 });
  await page.locator('#req-title').fill(LONG_TITLE);
  await screen(page, 'row 8 direct wizard step 1', { name: 'ux06-08a-wizard-step1', skip: ['D'], form: true });

  const next = page.locator('.tf-req-nav button.tf-button:not(.tf-button-secondary)');
  await next.click();
  await page.locator('#req-goal').waitFor({ timeout: 15000 });
  await page.locator('#req-goal').fill(LONG_MESSAGE);
  // The brief's optional questions: labels must be questions, never field names, and no box says "undefined".
  const labels = await page.locator('label[for^="req-prompt-"]').allInnerTexts();
  assert.ok(labels.length > 0, 'the wizard asks its optional questions');
  for (const label of labels) assert.doesNotMatch(label, /[A-Za-z]/, `a prompt label reads "${label}"`);
  const values = await page.locator('textarea[id^="req-prompt-"]').evaluateAll(areas => areas.map(a => a.value));
  assert.ok(values.every(v => v === ''), `an unanswered question shows ${JSON.stringify(values)}`);
  await screen(page, 'row 8 direct wizard step 2', { name: 'ux06-08b-wizard-step2', skip: ['D'], form: true });
  await page.locator('#req-files').setInputFiles(file(LONG_FILE, pdf('long name')));
  await screen(page, 'row 8 wizard with a long attachment name', { name: 'ux06-08c-wizard-attachment', skip: ['D'], form: true });

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
  await screen(page, 'row 10 waiting for the teacher', { name: 'ux06-10a-request-waiting' });
});

await step('row 11 · the teacher’s side: the request, a question, and the accept and decline dialogs', async () => {
  const { page } = teacher;
  await spa(teacher, `/requests/${requestId}`);
  await page.locator('[data-testid=accept-request]').waitFor({ timeout: 20000 });
  await screen(page, 'row 11 teacher request detail', { name: 'ux06-11a-teacher-request' });

  await page.locator('[data-testid=accept-request]').click();
  await page.locator('[data-testid=accept-dialog] #accept-price').waitFor({ state: 'visible', timeout: 15000 });
  await screen(page, 'row 11 accept dialog', { name: 'ux06-11b-accept-dialog' });
  await page.keyboard.press('Escape');
  await page.locator('[data-testid=accept-dialog] #accept-price').waitFor({ state: 'hidden', timeout: 10000 });

  // The decline dialog is opened and seen, then dismissed: the request goes on to be accepted.
  await page.locator('[data-testid=decline-request]').click();
  await page.locator('dialog.tf-system-dialog[open]').waitFor({ timeout: 10000 });
  await screen(page, 'row 11 decline dialog', { name: 'ux06-11c-decline-dialog', skip: ['D'] });
  await page.keyboard.press('Escape');
  await page.locator('dialog.tf-system-dialog[open]').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});

  await page.locator('#request-message').fill('هل تريد الشرح بالفيديو فقط أم مع ملف مكتوب أيضًا؟');
  const asked = waitForCall(page, 'POST', new RegExp(`/learning-requests/${requestId}/request-clarification$`));
  await page.locator('section[aria-labelledby=request-thread-title] button[type=submit]').click();
  assert.ok((await asked).ok(), 'the question was sent');
  await screen(page, 'row 11 after asking a question', { name: 'ux06-11d-question-sent', form: true });
});

await step('row 10 · the teacher asked a question: the student’s reply box', async () => {
  const { page } = student;
  await visit(page, `${BASE}/ar/requests/${requestId}`);
  await page.locator('#request-message').waitFor({ timeout: 20000 });
  await screen(page, 'row 10 answering the teacher', { name: 'ux06-10b-reply-box', form: true });
  await page.locator('#request-message').fill('مع ملف مكتوب أيضًا، من فضلك.');
  const replied = waitForCall(page, 'POST', new RegExp(`/learning-requests/${requestId}/reply-clarification$`));
  await page.locator('section[aria-labelledby=request-thread-title] button[type=submit]').click();
  assert.ok((await replied).ok(), 'the answer was sent');
});

await step('rows 10 and 14 · accepted at a high, changed price: the request, the order and checkout', async () => {
  orderId = await acceptRequest(teacher, requestId, HIGH_PRICE);

  const { page } = student;
  await visit(page, `${BASE}/ar/requests/${requestId}`);
  await page.locator('[data-testid=request-price]').waitFor({ timeout: 20000 });
  // UX-09 still reads correctly at 390px: both prices, the fee and the total.
  const panel = await page.locator('[data-testid=price-panel]').first().innerText();
  assert.match(panel, /السعر عند إرسال الطلب/, 'the quoted price is still disclosed');
  assert.match(panel, /790/, 'the agreed price is the high one');
  await screen(page, 'row 10 accepted, with the agreed-price disclosure', { name: 'ux06-10c-request-accepted' });

  // The acceptance reaches the student as a notification carrying the long title.
  await page.locator('[data-testid=notification-bell]').click();
  await page.locator('[data-testid=notification-panel]').waitFor({ timeout: 15000 });
  await screen(page, 'notification panel with a long title', { name: 'ux06-shell-notifications', skip: ['P'] });
  await page.locator('[data-testid=notification-bell]').click();
  await page.locator('[data-testid=notification-panel]').waitFor({ state: 'hidden', timeout: 10000 });

  await page.locator('[data-testid=open-order]').click();
  await page.waitForURL(url => pathOf(url) === `/ar/orders/${orderId}`, { timeout: 15000 });
  await screen(page, 'row 14 order awaiting payment', { name: 'ux06-14a-order-unpaid' });

  await page.locator('[data-testid=pay-order]').click();
  await page.waitForURL(url => pathOf(url) === '/ar/checkout', { timeout: 15000 });
  await payButton(page).waitFor({ timeout: 15000 });
  const receipt = await page.locator('[data-testid=price-panel]').first().innerText();
  assert.match(receipt, /السعر عند إرسال الطلب/, 'checkout discloses the quoted price too');
  assert.ok(!/SAR/.test(await page.locator('main').innerText()), 'checkout spells no currency in Latin letters');
  await screen(page, 'row 14 checkout for the order', { name: 'ux06-14b-checkout-order' });
});

await step('row 14 · paid; the teacher’s order; start; a delivery with a long file name', async () => {
  const { page } = student;
  await payInSimulator(page, new RegExp(`^/ar/orders/${orderId}$`));
  await attribute(page, '[data-testid=order-status]', 'data-payment', 1);
  await screen(page, 'row 14 student order, paid', { name: 'ux06-14c-order-paid' });

  const t = teacher.page;
  await visit(t, `${BASE}/ar/orders/${orderId}`);
  await t.locator('[data-testid=start-order]').waitFor({ timeout: 20000 });
  await screen(t, 'teacher order, paid and ready to start', { name: 'ux06-14d-teacher-order' });
  const started = waitForCall(t, 'POST', new RegExp(`^/api/v1/orders/${orderId}/start$`));
  await t.locator('[data-testid=start-order]').click();
  await confirmDialog(t);
  assert.equal((await started).status(), 204);

  await t.locator('[data-testid=open-deliver]').click();
  await t.locator('#deliver-files').setInputFiles(file(LONG_FILE, pdf('delivery')));
  await t.locator('#deliver-message').fill('الحل الكامل مع شرح كل خطوة، والملف المكتوب مرفق كما طلبت.');
  await screen(t, 'teacher delivering with a long file name', { name: 'ux06-14e-teacher-deliver', form: true });
  const delivered = waitForCall(t, 'POST', new RegExp(`^/api/v1/orders/${orderId}/deliveries$`));
  await t.locator('[data-testid=submit-delivery]').click();
  assert.ok((await delivered).ok(), 'the delivery was sent');

  await visit(page, `${BASE}/ar/orders/${orderId}`);
  await page.locator('[data-testid=delivery]').first().waitFor({ timeout: 20000 });
  await screen(page, 'row 14 student order, delivered', { name: 'ux06-14f-order-delivered' });
});

await step('rows 5-6 · a conversation with a long Arabic message, and both inboxes', async () => {
  const { page } = student;
  await page.locator('[data-testid=open-conversation]').click();
  await page.waitForURL(url => /^\/ar\/conversations\/[0-9a-f-]{36}$/.test(pathOf(url)), { timeout: 20000 });
  const conversationId = pathOf(page.url()).split('/').pop();
  await page.locator('#message-body').fill(LONG_MESSAGE);
  const sent = waitForCall(page, 'POST', new RegExp(`^/api/v1/conversations/${conversationId}/messages$`));
  await page.locator('[data-testid=send-message]').click();
  assert.ok((await sent).ok(), 'the long message was sent');
  await page.locator('[data-testid=message]').first().waitFor({ timeout: 15000 });
  // The composer follows the thread, as a reply does: P proves it is reachable and sized.
  await screen(page, 'row 6 conversation', { name: 'ux06-06-conversation', form: true });

  await spa(student, '/messages');
  await page.locator('[data-testid=inbox], [data-testid=thread]').first().waitFor({ timeout: 20000 });
  await screen(page, 'row 5 student inbox', { name: 'ux06-05a-inbox-student', skip: ['P'] });

  await spa(teacher, '/messages');
  await teacher.page.locator('[data-testid=inbox], [data-testid=thread]').first().waitFor({ timeout: 20000 });
  await screen(teacher.page, 'row 5 teacher inbox', { name: 'ux06-05b-inbox-teacher', skip: ['P'] });
});

await step('rows 19-20 · the student opens a dispute on the delivered order; the list and the case', async () => {
  const { page } = student;
  await spa(student, '/disputes');
  await page.locator('#dispute-target').waitFor({ timeout: 20000 });
  await screen(page, 'row 19 disputes, the form to open one', { name: 'ux06-19a-disputes-form', form: true });

  const option = await page.locator('#dispute-target option').evaluateAll(options =>
    options.map(o => o.value).find(v => v));
  assert.ok(option, 'the delivered order can be disputed');
  await page.locator('#dispute-target').selectOption(option);
  await page.locator('#dispute-reason').fill(`الملف المسلّم لا يغطي التمارين المطلوبة في الطلب. ${LONG_MESSAGE}`);
  const opened = waitForCall(page, 'POST', /^\/api\/v1\/disputes$/);
  await page.locator('.tf-dispute-create__form button[type=submit]').click();
  const response = await opened;
  assert.ok(response.ok(), `the dispute was opened (${response.status()})`);
  const disputeId = (await response.json()).id;

  await visit(page, `${BASE}/ar/disputes/${disputeId}`);
  await page.locator('.tf-dispute-detail').waitFor({ timeout: 20000 });
  await screen(page, 'row 20 the open case', { name: 'ux06-20-dispute-detail', form: true });
  await screen(page, 'row 19 disputes list with an open case', { skip: ['P'] });
});

// ------------------------------------------------------------------ open marketplace

await step('row 9 · the open-request form, and its validation errors', async () => {
  const { page } = student;
  await spa(student, '/requests/new/open');
  await page.locator('[data-testid=open-request-form]').waitFor({ timeout: 20000 });
  await screen(page, 'row 9 open request form', { name: 'ux06-09a-open-form', form: true });
  await page.locator('[data-testid=publish-open-request]').click();
  await page.locator('[aria-invalid=true], .tf-field-error, [data-testid=open-request-error]').first().waitFor({ timeout: 10000 });
  await screen(page, 'row 9 open request form with errors', { name: 'ux06-09b-open-form-errors', form: true });
});

await step('rows 12-13 · the teacher’s opportunities, two offers, and the student comparing them', async () => {
  const published = await api(studentEmail, 'POST', '/api/v1/open-marketplace/requests', {
    subjectId: SEED.subjectId, serviceCatalogItemId: SEED.recordedCatalogId,
    title: LONG_TITLE, requirements: LONG_MESSAGE,
    deadline: new Date(Date.now() + 6 * 86_400_000).toISOString(),
    budgetMin: 90, budgetMax: 200, currency: 'SAR'
  }, {}, studentPassword);
  assert.equal(published.status, 201, JSON.stringify(published.body));
  openId = published.body.id;

  const { page } = student;
  await visit(page, `${BASE}/ar/requests/${openId}/offers`);
  await page.locator('main').waitFor({ timeout: 20000 });
  await screen(page, 'row 12 offers, none yet', { name: 'ux06-12a-offers-empty', skip: ['D', 'P'] });

  const t = teacher.page;
  await spa(teacher, '/teacher/opportunities');
  await t.locator('main').waitFor({ timeout: 20000 });
  await t.locator('[data-testid=row-open]').first().waitFor({ timeout: 20000 });
  await screen(t, 'teacher opportunities list', { name: 'ux06-13a-opportunities', skip: ['P'] });

  await visit(t, `${BASE}/ar/teacher/opportunities/${openId}`);
  await t.locator('[data-testid=offer-form]').waitFor({ timeout: 20000 });
  await screen(t, 'row 13 opportunity with the offer form', { name: 'ux06-13b-offer-form', form: true });
  await t.locator('#offer-amount').fill('150');
  await t.locator('#offer-hours').fill('48');
  await t.locator('#offer-revisions').fill('2');
  await t.locator('#offer-validity').fill('72');
  await t.locator('#offer-message').fill(LONG_MESSAGE);
  const saved = waitForCall(t, /POST|PUT/, /^\/api\/v1\/open-marketplace\/opportunities\/[0-9a-f-]{36}\/offers$/);
  await t.locator('[data-testid=save-offer]').click();
  const offer = await saved;
  assert.ok(offer.ok(), `teacher A's offer was saved (${offer.status()})`);
  offerA = (await offer.json()).id;
  await t.locator('[data-testid=my-offer]').waitFor({ timeout: 15000 });
  await screen(t, 'row 13 offer sent', { name: 'ux06-13c-offer-sent' });

  const b = teacherB.page;
  await signIn(teacherB, teacherBSeed.Email);
  await visit(b, `${BASE}/ar/teacher/opportunities/${openId}`);
  await b.locator('[data-testid=offer-form]').waitFor({ timeout: 20000 });
  await b.locator('#offer-amount').fill('200');
  await b.locator('#offer-hours').fill('24');
  await b.locator('#offer-revisions').fill('1');
  await b.locator('#offer-validity').fill('72');
  await b.locator('#offer-message').fill('أستطيع البدء فورًا وتسليم الحل خلال يوم واحد.');
  const savedB = waitForCall(b, /POST|PUT/, /^\/api\/v1\/open-marketplace\/opportunities\/[0-9a-f-]{36}\/offers$/);
  await b.locator('[data-testid=save-offer]').click();
  assert.ok((await savedB).ok(), 'teacher B’s offer was saved');

  await visit(page, `${BASE}/ar/requests/${openId}/offers`);
  await page.locator('[data-testid=offer]').nth(1).waitFor({ timeout: 20000 });
  await screen(page, 'row 12 comparing two offers', { name: 'ux06-12b-offers' });
});

await step('rows 12, 10 and 15 · the student selects an offer; the hold counts down; checkout for it', async () => {
  const { page } = student;
  const offer = page.locator(`[data-testid=offer][data-offer-id="${offerA}"]`);
  await offer.locator('[data-testid=select-offer]').click();
  await page.locator('dialog.tf-system-dialog[open]').waitFor({ timeout: 10000 });
  await screen(page, 'row 12 confirming the selection', { name: 'ux06-12c-select-dialog' });
  const selected = waitForCall(page, 'POST', new RegExp(`/offers/${offerA}/select$`));
  await confirmDialog(page);
  assert.equal((await selected).status(), 204);

  await visit(page, `${BASE}/ar/requests/${openId}`);
  await page.locator('[data-testid=reservation-countdown]').waitFor({ timeout: 20000 });
  const countdown = await page.locator('[data-testid=reservation-countdown]').innerText();
  assert.match(countdown, /^\d+:\d{2}(:\d{2})?$/, `the countdown is legible (${countdown})`);
  await screen(page, 'row 10 an offer held, counting down', { name: 'ux06-10d-offer-held' });

  // The second payment of the journey: payments are limited to ten a minute per student.
  await waitUntil(Date.now() + 61_000, 'the payment limit window resets');
  await page.locator('[data-testid=pay-reserved]').click();
  await page.waitForURL(url => pathOf(url) === '/ar/checkout', { timeout: 15000 });
  await page.locator('[data-testid=checkout-reservation]').waitFor({ timeout: 15000 });
  await page.locator('[data-testid=fee-at-payment]').waitFor();
  await screen(page, 'row 15 checkout for a reserved offer', { name: 'ux06-15-checkout-reserved' });
  await payInSimulator(page, /^\/ar\/orders\/[0-9a-f-]{36}$/);
  await attribute(page, '[data-testid=order-status]', 'data-payment', 1);
});

// ------------------------------------------------------------------ live session

await step('rows 17, 16 and 18 · booking a live session, its checkout, and the session on both sides', async () => {
  const { page } = student;
  await waitUntil(Date.now() + 61_000, 'the payment limit window resets');
  await visit(page, `${BASE}/ar/sessions/book?teacherId=${teacherA.Id}&teacherServiceId=${teacherA.liveServiceId}`);
  await page.locator('button.tf-book-slot').first().waitFor({ timeout: 20000 });
  await screen(page, 'row 17 live booking with slots', { name: 'ux06-17a-booking', form: true });

  await page.locator('#book-session-title').fill(`جلسة مباشرة لقاعدة السلسلة ${stamp}`);
  await page.locator('#book-topic').fill('معدلات التغير المرتبطة: مسألة السلم ومسألة الخزان المخروطي.');
  await page.locator('button.tf-book-slot').first().click();
  await screen(page, 'row 17 a slot chosen', { name: 'ux06-17b-booking-chosen', form: true });
  const created = waitForCall(page, 'POST', /^\/api\/v1\/live-sessions$/);
  await page.locator('button.tf-book-confirm').click();
  const response = await created;
  assert.equal(response.status(), 201, 'booked');
  sessionId = (await response.json()).id;

  await page.waitForURL(url => pathOf(url) === '/ar/checkout', { timeout: 15000 });
  await payButton(page).waitFor({ timeout: 15000 });
  await screen(page, 'row 16 checkout for a live session', { name: 'ux06-16-checkout-live' });
  await payInSimulator(page, new RegExp(`^/ar/live-sessions/${sessionId}$`));
  await attribute(page, '[data-testid=session-status]', 'data-status', 1);
  await screen(page, 'row 18 live session, confirmed (student)', { name: 'ux06-18a-session-student', skip: ['P'] });

  await visit(teacher.page, `${BASE}/ar/live-sessions/${sessionId}`);
  await attribute(teacher.page, '[data-testid=session-status]', 'data-status', 1);
  await screen(teacher.page, 'row 18 live session, confirmed (teacher)', { name: 'ux06-18b-session-teacher', skip: ['P'] });
});

await step('shells · the student home with work in progress', async () => {
  const { page } = student;
  await spa(student, '/student/overview');
  await page.locator('main').waitFor({ timeout: 20000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await screen(page, 'student home with work in progress', { name: 'ux06-shell-student-home' });
});

await step('the same screens in English still read left-to-right', async () => {
  // A fresh context on purpose: the student above chose Arabic, and that choice is stored and outranks the
  // locale in the URL. This is the reader who has never chosen.
  const english = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await signIn(english, studentEmail, studentPassword);
  const { page } = english;
  for (const path of [`/en/orders/${orderId}`, `/en/requests/${requestId}`, `/en/live-sessions/${sessionId}`]) {
    await visit(page, `${BASE}${path}`);
    await page.locator('main h1, main [data-testid]').first().waitFor({ timeout: 20000 });
    assert.equal(await page.evaluate(() => document.documentElement.dir), 'ltr', `${path} stays left-to-right`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `${path} scrolls sideways by ${overflow}px`);
  }
  await shot(page, 'ux06-21-english-session');
});

await finish('UX-06 Arabic phone matrix');
