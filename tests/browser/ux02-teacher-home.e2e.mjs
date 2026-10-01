/* UX-02 end-to-end: the teacher's home tells the teacher what to do next.
 *
 *   1. A teacher students cannot find yet is told the one thing stopping them, with one Fix button —
 *      and is shown no business dashboard behind it.
 *   2. A published teacher who switches their profile off is told they are ready to be seen again.
 *   3. A new direct request is the first thing on the home, and opens the request's own screen.
 *   4. Once the student pays, starting the work is the first thing, with the teacher's own earnings.
 *   5. Open requests the teacher could win are previewed from the real opportunities contract.
 *   6. A booked session becomes "your next session".
 *   7. After the work is finished the earnings summary says what FIN-01's contract says.
 *   8. Arabic at 390px throughout: no entity grid, no search, no Refresh, no English product word.
 *
 * Same environment variables as tests/browser/wave3b-harness.mjs; the Wave 3B fulfilment seed.
 * Every state is created through the product's own flows; the database is only read.
 */
import assert from 'node:assert/strict';
import {
  BASE, SEED, acceptRequest, api, attribute, confirmDialog, context, file, finish, noHorizontalOverflow, pathOf,
  outboxLink, payInSimulator, pdf, registerStudent, sendDirectRequest, shot, signIn, spa, sql, start, step, visit,
  waitForCall, waitUntil, pickSlot
} from './wave3b-harness.mjs';

const stamp = Date.now();
const studentEmail = `ux02-student-${stamp}@example.test`;
const studentPassword = `Ux02!Home-${stamp}`;
const applicantEmail = `ux02-teacher-${stamp}@example.test`;
const applicantPassword = `Ux02!Teach-${stamp}`;
const directTitle = `شرح قاعدة السلسلة ${stamp}`;
const openTitle = `شرح النهايات ${stamp}`;
const sessionTitle = `جلسة المعدلات المرتبطة ${stamp}`;
const PRICE = 200;
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

await start();
// The teacher is the case that matters: Arabic, on a phone.
const teacher = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-SA' });
const applicant = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-SA' });
const teacherB = await context();
const student = await context();
let orderId = '';
let requestId = '';
let openRequestId = '';
let sessionId = '';

const home = {
  greeting: () => teacher.page.locator('[data-testid=home-greeting]'),
  setup: () => teacher.page.locator('[data-testid=home-setup]'),
  actions: () => teacher.page.locator('[data-testid=home-action-card]'),
  opportunities: () => teacher.page.locator('[data-testid=home-opportunity]'),
  upcoming: () => teacher.page.locator('[data-testid=home-upcoming]'),
  earnings: () => teacher.page.locator('[data-testid=home-earnings]'),
  nothing: () => teacher.page.locator('[data-testid=home-nothing-needed]')
};

/** Loads a teacher's home and waits for it to have decided what to show. */
async function openHome(actor = teacher) {
  await visit(actor.page, `${BASE}/ar/teacher/home`);
  await actor.page.locator('[data-testid=home-setup], [data-testid=home-actions]').first().waitFor({ timeout: 20000 });
  return actor.page;
}

const homeText = async page => (await page.locator('.tf-home').innerText()).replace(/\s+/g, ' ').trim();
const href = async locator => (await locator.getAttribute('href') ?? '').replace(/\/(?=\?|$)/, '');

/** The 390×844 fold: what the teacher sees without scrolling. */
async function aboveTheFold(locator, what) {
  const box = await locator.boundingBox();
  assert.ok(box, `${what} is on the screen`);
  assert.ok(box.y + box.height <= 844, `${what} is above the fold (ends at ${Math.round(box.y + box.height)}px)`);
}

/**
 * A real teacher account through /auth: register as a teacher, confirm the address from the dev outbox
 * and sign in. The account is genuine and brand new — approved for nothing, so the server's own readiness
 * is what the home has to explain.
 */
async function registerTeacher(actor, fullName, email, password) {
  const { page } = actor;
  await visit(page, `${BASE}/ar/auth`);
  await page.locator('.tf-auth-tabs button').nth(1).click();
  await page.getByRole('button', { name: /as Teacher|قدّم كمعلم/i }).click();
  await page.locator('#reg-fullname').fill(fullName);
  await page.locator('#reg-email').fill(email);
  await page.locator('#reg-password').fill(password);
  await page.locator('#reg-confirm').fill(password);
  await page.locator('.tf-check--start input[type=checkbox]').check();
  const registered = waitForCall(page, 'POST', /^\/api\/v1\/auth\/register$/);
  await page.locator('form button[type=submit].tf-auth-submit:visible').click();
  assert.ok((await registered).ok(), 'registration accepted');
  await page.waitForURL(url => pathOf(url).endsWith('/auth/confirm-email'), { timeout: 15000 });
  await visit(page, await outboxLink(email, 'mode=confirm'));
  await page.locator('.tf-auth-success, .tf-toast').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.locator('form button[type=submit]').first().click();
  await page.waitForURL(url => !/\/auth(\/.*)?$/.test(pathOf(url)), { timeout: 20000 });
}

await step('1. a teacher students cannot find yet is told the one thing to do, and nothing else', async () => {
  await registerTeacher(applicant, `معلم UX-02 ${stamp}`, applicantEmail, applicantPassword);
  // Approved for nothing yet: the server's first blocking reason is the qualification, and the home says so.
  const page = await openHome(applicant);
  const setup = applicant.page.locator('[data-testid=home-setup]');
  const text = (await setup.innerText()).replace(/\s+/g, ' ');
  assert.match(text, /ابدأ طلب الانضمام في مادتك/, `the first blocker is the qualification (${text})`);
  assert.match(text, /خطوات متبقية: 3/, 'the teacher is told how many steps are left');

  const cta = applicant.page.locator('[data-testid=home-setup-cta]');
  assert.equal(await cta.count(), 1, 'one obvious thing to do');
  assert.equal(await href(cta), '/ar/teach/apply');
  const box = await cta.boundingBox();
  assert.ok(box && box.height >= 44, `the fix button is a 44px target (${box?.height}px)`);

  // No business dashboard behind it: no work, no open requests, no money, no entity grid.
  for (const hidden of ['home-actions', 'home-opportunities', 'home-earnings'])
    assert.equal(await applicant.page.locator(`[data-testid=${hidden}]`).count(), 0, `${hidden} is not shown yet`);
  assert.equal(await page.locator('.tf-dashboard-grid, .tf-dashboard-search, .tf-dashboard-card').count(), 0);
  assert.equal(await page.locator('.tf-home button').count(), 0, 'the home acts on nothing');

  await aboveTheFold(setup, 'the setup card');
  await noHorizontalOverflow(page, 'teacher home, setup');
  const shown = await homeText(page);
  assert.doesNotMatch(shown, /[A-Za-z]{3,}/, `the Arabic home carries no English product word (${shown})`);
  assert.doesNotMatch(shown, /email_unconfirmed|profile_not_published|qualification_required/, 'no server codes');
  await shot(page, 'ux02-home-setup-ar');
});

await step('2. a teacher who switches their profile off is told they are ready to be seen again', async () => {
  await signIn(teacherB, SEED.teacherB.Email);
  await visit(teacherB.page, `${BASE}/en/teacher/publication`);
  const unpublish = teacherB.page.locator('[data-testid=unpublish]');
  await teacherB.page.locator('[data-testid=unpublish], [data-testid=publish]').first().waitFor({ timeout: 20000 });
  if (await unpublish.count()) {
    const off = waitForCall(teacherB.page, 'PUT', /^\/api\/v1\/teachers\/me\/publication$/);
    await unpublish.click();
    // Going invisible to students is confirmed on its own screen, as every business action is.
    await confirmDialog(teacherB.page);
    assert.ok((await off).ok(), 'publication switched off');
  }

  // This teacher works in English; the Arabic of the same screen is proven in steps 1, 3 and 8.
  await visit(teacherB.page, `${BASE}/en/teacher/home`);
  const setup = teacherB.page.locator('[data-testid=home-setup]');
  await setup.waitFor({ timeout: 20000 });
  const ready = (await setup.innerText()).replace(/\s+/g, ' ');
  assert.match(ready, /Your profile is ready for students/);
  assert.match(ready, /Review and go visible/);
  // Nothing is left to fix, so the card does not count steps at this teacher.
  assert.equal(await teacherB.page.locator('[data-testid=home-steps-left]').count(), 0);
  assert.equal(await href(teacherB.page.locator('[data-testid=home-setup-cta]')), '/en/teacher/publication');
  // Invisible teachers are not offered work they cannot win.
  assert.equal(await teacherB.page.locator('[data-testid=home-opportunities]').count(), 0, 'no open requests while invisible');

  // Fixing the one thing the card named clears it: the home re-evaluates from the server, not from a guess.
  await visit(teacherB.page, `${BASE}/en/teacher/publication`);
  const on = waitForCall(teacherB.page, 'PUT', /^\/api\/v1\/teachers\/me\/publication$/);
  await teacherB.page.locator('[data-testid=publish]').click();
  assert.ok((await on).ok(), 'publication switched back on');

  await visit(teacherB.page, `${BASE}/en/teacher/home`);
  await teacherB.page.locator('[data-testid=home-actions]').waitFor({ timeout: 20000 });
  assert.equal(await teacherB.page.locator('[data-testid=home-setup]').count(), 0, 'nothing is stopping students now');
  assert.equal(await teacherB.page.locator('[data-testid=home-opportunities]').count(), 1, 'and open requests are offered');
});

await step('3. a new direct request is the first thing on the teacher’s home', async () => {
  await signIn(teacher, SEED.teacherA.Email);
  await registerStudent(student, `طالبة UX-02 ${stamp}`, studentEmail, studentPassword);
  requestId = await sendDirectRequest(student, SEED.teacherA, directTitle);

  const page = await openHome();
  assert.equal(await home.setup().count(), 0, 'a visible teacher is not shown setup');
  assert.match(await home.greeting().innerText(), /أهلًا/);
  const first = home.actions().first();
  await first.waitFor({ timeout: 20000 });
  const text = (await first.innerText()).replace(/\s+/g, ' ');
  assert.match(text, /طلب جديد من/, `the request leads the home (${text})`);
  assert.match(text, new RegExp(escape(directTitle)), 'and names the work');

  const cta = first.locator('[data-testid=home-card-cta]');
  assert.equal(await cta.innerText(), 'راجع الطلب');
  assert.equal(await cta.getAttribute('class'), 'tf-button', 'the first action is the one filled button');
  assert.equal(await href(cta), `/ar/requests/${requestId}`);
  await aboveTheFold(home.greeting(), 'the greeting');
  await aboveTheFold(home.actions().last(), 'the last action card');
  await noHorizontalOverflow(page, 'teacher home, request waiting');
  await shot(page, 'ux02-home-new-request-ar');

  // The card opens the request's own screen, which is where the teacher acts.
  await cta.click();
  await page.waitForURL(url => pathOf(url) === `/ar/requests/${requestId}`, { timeout: 20000 });
});

await step('4. once the student pays, starting the work is the first thing, with the teacher’s own earnings', async () => {
  orderId = await acceptRequest(teacher, requestId, PRICE);
  await spa(student, `/orders/${orderId}`);
  await student.page.locator('[data-testid=pay-order]').click();
  await student.page.waitForURL(url => pathOf(url) === '/en/checkout', { timeout: 15000 });
  await payInSimulator(student.page, new RegExp(`^/(ar|en)/orders/${orderId}$`));
  await attribute(student.page, '[data-testid=order-status]', 'data-payment', 1);

  const page = await openHome();
  const first = home.actions().first();
  await first.waitFor({ timeout: 20000 });
  assert.match((await first.innerText()).replace(/\s+/g, ' '), /تم الدفع — ابدأ العمل/);

  // The amount is the teacher's net, as the server calculated it, drawn with the riyal mark.
  const net = Number(sql(`SELECT TeacherNet FROM Orders WHERE Id = '${orderId}'`));
  assert.ok(net > 0 && net < PRICE, `the net is the price minus commission (${net})`);
  const amount = (await first.locator('[data-testid=home-card-amount]').innerText()).replace(/\s+/g, ' ');
  assert.match(amount, new RegExp(`صافي ربحك[^\\d]*${escape(net.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(Number(net)) ? 0 : 2 }))}`),
    `the card names the teacher's own earnings (${amount})`);
  assert.ok(!amount.includes('SAR'), 'the currency is the mark, not Latin letters');
  assert.equal(await href(first.locator('[data-testid=home-card-cta]')), `/ar/orders/${orderId}`);
  await shot(page, 'ux02-home-start-work-ar');
});

await step('5. open requests the teacher could win are previewed from the real contract', async () => {
  const published = await api(studentEmail, 'POST', '/api/v1/open-marketplace/requests', {
    subjectId: SEED.subjectId, serviceCatalogItemId: SEED.recordedCatalogId, title: openTitle,
    requirements: 'اشرح كل تمرين في الفصل الثالث خطوة بخطوة.',
    deadline: new Date(Date.now() + 3 * 86_400_000).toISOString(), budgetMin: 90, budgetMax: 200
  }, {}, studentPassword);
  assert.equal(published.status, 201, JSON.stringify(published.body));
  openRequestId = published.body.id;

  const page = await openHome();
  const preview = home.opportunities().first();
  await preview.waitFor({ timeout: 20000 });
  const text = (await preview.innerText()).replace(/\s+/g, ' ');
  assert.match(text, new RegExp(escape(openTitle)), `the open request is previewed (${text})`);
  assert.match(text, /آخر موعد/, 'with its deadline');
  assert.match(text, /الميزانية/, 'and the budget the student named');
  // No student identity: the marketplace hides it until an offer is accepted.
  assert.doesNotMatch(text, /طالبة UX-02|ux02-student/, 'no student identity in the preview');
  assert.equal(await href(preview.locator('[data-testid=home-opportunity-open]')), `/ar/teacher/opportunities/${openRequestId}`);
  assert.match(await page.locator('[data-testid=home-see-opportunities]').innerText(), /عرض الكل \(\d+\)/);
  await shot(page, 'ux02-home-opportunities-ar');
});

await step('6. a booked session becomes the teacher’s next session', async () => {
  // Payments are limited to 10 a minute per student: the booking's payment waits for the window.
  await waitUntil(Date.now() + 61_000, 'the payment limit window resets');
  const { page } = student;
  await spa(student, `/sessions/book?teacherId=${SEED.teacherA.Id}&teacherServiceId=${SEED.teacherA.liveServiceId}`);
  await page.locator('#book-session-title').fill(sessionTitle);
  await page.locator('#book-topic').fill('مسائل المعدلات المرتبطة: السلّم والخزان المخروطي.');
  await pickSlot(page, 6);
  const created = waitForCall(page, 'POST', /^\/api\/v1\/live-sessions$/);
  await page.locator('button.tf-book-confirm').click();
  const booked = await created;
  assert.equal(booked.status(), 201, 'booked');
  sessionId = (await booked.json()).id;
  await page.waitForURL(url => pathOf(url) === `/en/live-sessions/${sessionId}`, { timeout: 20000 });
  await visit(teacher.page, `${BASE}/ar/live-sessions/${sessionId}`);
  await teacher.page.locator('[data-testid=accept-session-request]').click();
  await attribute(teacher.page, '[data-testid=session-status]', 'data-status', 0);
  await visit(page, `${BASE}/en/live-sessions/${sessionId}`);
  await page.locator('[data-testid=pay-session]').click();
  await page.waitForURL(url => pathOf(url) === '/en/checkout', { timeout: 20000 });
  await payInSimulator(page, new RegExp(`^/(ar|en)/live-sessions/${sessionId}$`));

  await openHome();
  const upcoming = home.upcoming();
  await upcoming.waitFor({ timeout: 20000 });
  const text = (await upcoming.innerText()).replace(/\s+/g, ' ');
  assert.match(text, /جلستك القادمة/);
  assert.match(text, new RegExp(escape(sessionTitle)));
  assert.match(text, /مؤكدة/, 'the session says its state in product words');
  assert.match(text, /تبدأ/, 'and when it starts, in words');
  assert.equal(await href(upcoming.locator('[data-testid=home-session-open]')), `/ar/live-sessions/${sessionId}`);
  // A paid, confirmed session in the future is not an outstanding task.
  const titles = await home.actions().allInnerTexts();
  assert.ok(!titles.some(t => t.includes('جلستك الآن')), 'a future session is not "on now"');
});

await step('7. after the work is finished the earnings summary says what the money contract says', async () => {
  const { page } = teacher;
  await spa(teacher, `/orders/${orderId}`);
  await page.locator('[data-testid=start-order]').click();
  const started = waitForCall(page, 'POST', new RegExp(`^/api/v1/orders/${orderId}/start$`));
  await confirmDialog(page);
  assert.equal((await started).status(), 204);
  await page.locator('[data-testid=open-deliver]').click();
  await page.locator('#deliver-files').setInputFiles(file('chain-rule.pdf', pdf('UX-02 delivery')));
  await page.locator('#deliver-message').fill('التمارين من ١ إلى ٦ محلولة بالكامل.');
  const delivered = waitForCall(page, 'POST', new RegExp(`^/api/v1/orders/${orderId}/deliveries$`));
  await page.locator('[data-testid=submit-delivery]').click();
  assert.ok((await delivered).ok(), 'delivered');

  await spa(student, `/orders/${orderId}`);
  await student.page.locator('[data-testid=complete-order]').click();
  const completed = waitForCall(student.page, 'POST', new RegExp(`^/api/v1/orders/${orderId}/complete$`));
  await confirmDialog(student.page);
  assert.ok((await completed).ok(), 'completed');

  // What the home shows is what the authoritative balances contract says — not a second calculation.
  const balances = await api(SEED.teacherA.Email, 'GET', '/api/v1/withdrawals/balances');
  assert.equal(balances.status, 200);
  const sar = balances.body.find(row => row.currency === 'SAR');
  assert.ok(sar.pendingClearance > 0, 'the finished work is clearing');

  const home7 = await openHome();
  const earnings = (await home.earnings().innerText()).replace(/\s+/g, ' ');
  assert.match(earnings, /متاح للسحب/);
  assert.match(earnings, /قيد الإتاحة/);
  assert.ok(earnings.includes(sar.pendingClearance.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(Number(sar.pendingClearance)) ? 0 : 2 })),
    `the clearing amount is the server's (${earnings})`);
  assert.ok(!earnings.includes('SAR'), 'money is drawn with the riyal mark');
  for (const word of ['ledger', 'escrow', 'maturity', 'pendingClearance', 'account'])
    assert.ok(!earnings.toLowerCase().includes(word.toLowerCase()), `no "${word}" on the home`);
  assert.equal(await href(home7.locator('[data-testid=home-earnings-details]')), '/ar/teacher/earnings');
  await shot(home7, 'ux02-home-earnings-ar');
});

await step('8. the whole home stays Arabic, inside the phone, and free of machine words', async () => {
  const page = await openHome();
  const text = await homeText(page);
  assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-/i, `no id on the home (${text})`);
  assert.doesNotMatch(text, /\bnull\b|\bundefined\b|\bNaN\b|\[object/);
  // The seed's run id (hex) appears in test names and titles; it is data, not product copy.
  assert.doesNotMatch(text.replaceAll(SEED.run, ''), /[A-Za-z]{3,}/, `no English product word on the Arabic home (${text})`);
  assert.doesNotMatch(text, /العملة|آخر تحديث|الحالة:/, `no entity-explorer label (${text})`);
  assert.equal(await page.locator('.tf-dashboard-grid, .tf-dashboard-search, .tf-dashboard-card').count(), 0,
    'no entity grid, no search box, no Refresh');
  assert.equal(await page.locator('.tf-home .tf-badge').filter({ hasText: /^\s*-?\d+\s*$/ }).count(), 0,
    'no status is a number');
  for (const link of await page.locator('.tf-home a').all()) {
    const box = await link.boundingBox();
    assert.ok(box && box.height >= 44, `every tap target is 44px (${(await link.innerText()).slice(0, 24)}: ${box?.height}px)`);
  }
  await noHorizontalOverflow(page, 'teacher home, full');
  await shot(page, 'ux02-home-full-ar');

  // The home is the teacher's own: a student who opens it is sent to their own.
  await visit(student.page, `${BASE}/en/teacher/home`);
  await student.page.waitForURL(url => !pathOf(url).startsWith('/en/teacher'), { timeout: 20000 });
});

await step('no script errors on any page', async () => {
  for (const actor of [teacher, applicant, teacherB, student])
    assert.deepEqual(actor.page.problems, [], 'no page errors');
});

await finish('UX-02 teacher home');
