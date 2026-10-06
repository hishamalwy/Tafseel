/* FIN-01 end-to-end: a teacher reads their money without knowing how Tafseel keeps it.
 *
 *   1. A student requests, pays, and completes a delivered order — real money through the real flow.
 *   2. The server credits the teacher's net as clearing, not as available (checked in the database).
 *   3. The teacher opens Earnings in Arabic at 390px: the amount is under «قيد الإتاحة», not «متاح للسحب»,
 *      with the sentence that says why and the date it becomes available.
 *   4. Nothing offers a withdrawal yet (FIN-03), and no ledger, maturity or escrow word appears.
 *   5. A teacher who has finished no work sees the empty state, not empty money cards.
 *   6. A student cannot read a teacher's balances — from the API, and from the route.
 *
 * Same environment variables as tests/browser/wave3b-harness.mjs; the Wave 3B fulfilment seed. The
 * database is only read: the balance is created by completing an order, never written directly.
 */
import assert from 'node:assert/strict';
import {
  BASE, SEED, acceptRequest, api, attribute, confirmDialog, context, file, finish, noHorizontalOverflow, pathOf, payInSimulator,
  pdf, registerStudent, sendDirectRequest, shot, signIn, spa, sql, start, step, visit, waitForCall
} from './wave3b-harness.mjs';

const stamp = Date.now();
const studentEmail = `fin01-student-${stamp}@example.test`;
const studentPassword = `Fin01!Earnings-${stamp}`;
const title = `شرح قاعدة السلسلة ${stamp}`;
const PRICE = 200;

await start();
const student = await context();
const teacher = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-SA' });
const teacherB = await context();
let orderId = '';
let teacherNet = '';

const earnings = {
  available: () => teacher.page.locator('[data-testid=earnings-available]'),
  clearing: () => teacher.page.locator('[data-testid=earnings-clearing]'),
  next: () => teacher.page.locator('[data-testid=earnings-next]'),
  why: () => teacher.page.locator('[data-testid=earnings-why]')
};

await step('1. a student pays for work and completes it, so the teacher has really earned something', async () => {
  await registerStudent(student, `طالبة FIN-01 ${stamp}`, studentEmail, studentPassword);
  await signIn(teacher, SEED.teacherA.Email);

  const requestId = await sendDirectRequest(student, SEED.teacherA, title);
  orderId = await acceptRequest(teacher, requestId, PRICE);

  await spa(student, `/orders/${orderId}`);
  await student.page.locator('[data-testid=pay-order]').click();
  await student.page.waitForURL(url => pathOf(url) === '/en/checkout', { timeout: 15000 });
  await payInSimulator(student.page, new RegExp(`^/en/orders/${orderId}$`));
  await attribute(student.page, '[data-testid=order-status]', 'data-payment', 1);

  await spa(teacher, `/orders/${orderId}`);
  await teacher.page.locator('[data-testid=start-order]').click();
  const started = waitForCall(teacher.page, 'POST', new RegExp(`^/api/v1/orders/${orderId}/start$`));
  await confirmDialog(teacher.page);
  assert.equal((await started).status(), 204);
  await attribute(teacher.page, '[data-testid=order-status]', 'data-status', 1);
  await teacher.page.locator('[data-testid=open-deliver]').click();
  await teacher.page.locator('#deliver-files').setInputFiles(file('chain-rule.pdf', pdf('FIN-01 delivery')));
  await teacher.page.locator('#deliver-message').fill('التمارين من ١ إلى ٦ محلولة بالكامل.');
  const delivered = waitForCall(teacher.page, 'POST', new RegExp(`^/api/v1/orders/${orderId}/deliveries$`));
  await teacher.page.locator('[data-testid=submit-delivery]').click();
  assert.ok((await delivered).ok(), 'delivered');

  await spa(student, `/orders/${orderId}`);
  await student.page.locator('[data-testid=complete-order]').click();
  const completed = waitForCall(student.page, 'POST', new RegExp(`^/api/v1/orders/${orderId}/complete$`));
  await confirmDialog(student.page);
  assert.ok((await completed).ok(), 'completed');
  await attribute(student.page, '[data-testid=order-status]', 'data-status', 4);
});

await step('2. the server holds the teacher’s net as clearing, not as available', async () => {
  teacherNet = sql(`SELECT TeacherNet FROM Orders WHERE Id = '${orderId}'`);
  assert.match(teacherNet, /^\d+\.\d{2}$/, `the order records a teacher net (${teacherNet})`);
  assert.equal(sql(`SELECT Status FROM TeacherEarningMaturities WHERE OrderId = '${orderId}'`), '0',
    'the earning is Pending until the objection period ends');
  const balances = await api(SEED.teacherA.Email, 'GET', '/api/v1/withdrawals/balances');
  assert.equal(balances.status, 200);
  const sar = balances.body.find(b => b.currency === 'SAR');
  assert.equal(sar.available, 0, 'nothing is withdrawable yet');
  assert.equal(String(sar.pendingClearance.toFixed(2)), teacherNet, 'the whole net is clearing');
  assert.ok(sar.nextClearanceAt, 'the server says when it becomes available');
});

await step('3. the teacher reads it in Arabic on a phone: clearing, why, and when', async () => {
  const { page } = teacher;
  await visit(page, `${BASE}/ar/teacher/earnings`);
  await earnings.clearing().waitFor({ timeout: 20000 });
  const amount = Number(teacherNet).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(Number(Number(teacherNet))) ? 0 : 2 });

  const clearing = (await earnings.clearing().innerText()).replace(/\s+/g, ' ');
  assert.match(clearing, /أرباح ستُتاح قريبًا/);
  assert.ok(clearing.includes(amount), `the clearing card shows ${amount} (${clearing})`);
  assert.match(clearing, /ثم تنتقل تلقائيًا إلى «متاح للسحب»/);

  const available = (await earnings.available().innerText()).replace(/\s+/g, ' ');
  assert.match(available, /متاح للسحب/);
  assert.ok(!available.includes(amount), `the earned amount is not offered as withdrawable (${available})`);

  await earnings.next().waitFor({ timeout: 10000 });
  assert.match(await earnings.next().innerText(), /أقرب مبلغ يصبح متاحًا في .+/);

  await earnings.why().locator('summary').click();
  assert.match(await earnings.why().innerText(), /فترة|الاعتراض/);
  assert.match(await earnings.why().innerText(), /7 أيام/);

  await noHorizontalOverflow(page, 'teacher earnings');
  const box = await earnings.why().locator('summary').boundingBox();
  assert.ok(box && box.height >= 44, `the explanation is a 44px target (${box?.height}px)`);
  await shot(page, 'fin01-earnings-ar');
});

await step('4. nothing offers a withdrawal yet, and no internal money words appear', async () => {
  const { page } = teacher;
  const main = await page.locator('main').innerText();
  for (const word of ['ledger', 'escrow', 'maturity', 'pendingClearance', 'pendingWithdrawal', 'TeacherPending', 'account'])
    assert.ok(!main.toLowerCase().includes(word.toLowerCase()), `no "${word}" on the earnings screen`);
  // FIN-02/03 exist now: the only action is adding payout details; nothing offers money that is not available.
  assert.equal(await page.locator('[data-testid=withdraw-open]').count(), 0, 'no withdrawal before payout details and cleared money');
  assert.equal(await page.locator('[data-testid=payout-open]').count(), 1, 'payout details can be added');
  // The earnings screen is not the old entity list.
  assert.equal(await page.locator('.tf-dashboard-search, .tf-dashboard-grid').count(), 0);
  assert.ok(!main.match(/[A-Za-z]{3,}/), `the Arabic screen carries no English product words (${main.slice(0, 120)})`);
});

await step('5. a teacher who has finished no work sees the empty state, not empty money cards', async () => {
  await signIn(teacherB, SEED.teacherB.Email);
  await visit(teacherB.page, `${BASE}/en/teacher/earnings`);
  const empty = teacherB.page.locator('[data-testid=earnings-empty]');
  await empty.waitFor({ timeout: 20000 });
  assert.match(await empty.innerText(), /No earnings yet/);
  assert.equal(await teacherB.page.locator('[data-testid=earnings-available], [data-testid=earnings-clearing]').count(), 0);
  assert.match(await empty.locator('a').getAttribute('href') ?? '', /\/en\/teacher\/opportunities\/?$/);
  await shot(teacherB.page, 'fin01-earnings-empty-en');
});

await step('6. a student cannot read a teacher’s money, by API or by route', async () => {
  assert.equal((await api(studentEmail, 'GET', '/api/v1/withdrawals/balances', undefined, {}, studentPassword)).status, 403);
  assert.equal((await api(studentEmail, 'GET', '/api/v1/withdrawals/policy', undefined, {}, studentPassword)).status, 403);
  const anonymous = await fetch(`${BASE}/api/v1/withdrawals/balances`);
  assert.equal(anonymous.status, 401);

  await visit(student.page, `${BASE}/en/teacher/earnings`);
  await student.page.waitForURL(url => !pathOf(url).startsWith('/en/teacher'), { timeout: 15000 });
  assert.equal(await student.page.locator('[data-testid=earnings-available], [data-testid=earnings-clearing]').count(), 0,
    'the student never sees a teacher’s balances');
});

await step('no script errors on any page', async () => {
  assert.deepEqual([...student.page.problems, ...teacher.page.problems, ...teacherB.page.problems], []);
});

await finish('FIN-01 teacher earnings');
