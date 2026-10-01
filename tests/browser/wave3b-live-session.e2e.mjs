/* Wave 3B end-to-end: live sessions with the mock meeting provider (J8-02, J8-05, J8-06).
 *
 *   STUDENT registers and requests three times; each teacher accepts before payment
 *   BOTH see the booking on its own screen; joining the later session is refused as too early;
 *   teacher A cancels it; an unrelated account cannot join
 *   IN THE WINDOW both participants join the nearest session through the page
 *   AFTER IT ENDS teacher A asks to complete and the student confirms (completion settlement)
 *   AFTER THE 15-MINUTE GRACE the student reports that teacher B did not attend and teacher B confirms
 *
 * Everything waits for real time: the server decides the window and the grace period, and the
 * journey never changes a clock or a row. Expect it to take about 80 minutes. The database is only read.
 */
import assert from 'node:assert/strict';
import {
  BASE, SEED, api, attribute, confirmDialog, context, finish, pathOf, payInSimulator, registerStudent, shot, signIn,
  spa, sql, start, step, visit, waitForCall, waitUntil, pickSlot
} from './wave3b-harness.mjs';

const stamp = Date.now();
const studentEmail = `wave3b-live-${stamp}@example.test`;
const studentPassword = `Wave3b!Live-${stamp}`;
const MINUTE = 60_000;

await start();
const sessions = {};

const student = await context();
const teacherA = await context();
const teacherB = await context();
// The mock room is not a real site: record the address the page opens instead of navigating to it.
for (const actor of [student, teacherA, teacherB])
  await actor.ctx.addInitScript(() => { window.open = url => { window.__openedRoom = String(url); return null; }; });

async function book(teacher, slotIndex, title) {
  const { page } = student;
  await spa(student, `/sessions/book?teacherId=${teacher.Id}&teacherServiceId=${teacher.liveServiceId}`);
  await page.locator('#book-session-title').fill(title);
  await page.locator('#book-topic').fill('Related rates: the ladder and the conical tank problems.');
  await pickSlot(page, slotIndex);
  const created = waitForCall(page, 'POST', /^\/api\/v1\/live-sessions$/);
  await page.locator('button.tf-book-confirm').click();
  const response = await created;
  assert.equal(response.status(), 201, 'requested');
  const booking = await response.json();
  await page.waitForURL(url => pathOf(url) === `/en/live-sessions/${booking.id}`, { timeout: 15000 });
  await attribute(page, '[data-testid=session-status]', 'data-status', 9);
  assert.equal(await page.locator('[data-testid=pay-session]').count(), 0, 'payment waits for teacher approval');
  const teacherActor = teacher.Id === SEED.teacherA.Id ? teacherA : teacherB;
  await open(teacherActor, booking.id);
  await attribute(teacherActor.page, '[data-testid=session-status]', 'data-status', 9);
  const accepted = waitForCall(teacherActor.page, 'POST', new RegExp(`^/api/v1/live-sessions/${booking.id}/request/respond$`));
  await teacherActor.page.locator('[data-testid=accept-session-request]').click();
  assert.equal((await accepted).status(), 204);
  await attribute(teacherActor.page, '[data-testid=session-status]', 'data-status', 0);
  await open(student, booking.id);
  await page.locator('[data-testid=pay-session]').click();
  await page.waitForURL(url => pathOf(url) === '/en/checkout', { timeout: 15000 });
  await payInSimulator(page, new RegExp(`^/en/live-sessions/${booking.id}$`), async () => {
    assert.equal(sql(`SELECT Status FROM LiveSessionBookings WHERE Id = '${booking.id}'`), '0', 'awaiting payment while the simulator is open');
  });
  await attribute(page, '[data-testid=session-status]', 'data-status', 1);
  assert.equal(sql(`SELECT Status FROM Payments WHERE LiveSessionBookingId = '${booking.id}'`), '1', 'payment Confirmed');
  return { id: booking.id, startsAt: Date.parse(booking.startsAt), endsAt: Date.parse(booking.endsAt) };
}

async function open(actor, id) {
  await visit(actor.page, `${BASE}/${actor.locale}/live-sessions/${id}`);
  await actor.page.locator('[data-testid=session-status]').waitFor({ timeout: 20000 });
}

await step('J8 student books and pays the nearest slot with each teacher and a later one with teacher A', async () => {
  await registerStudent(student, `Wave3B Live Student ${stamp}`, studentEmail, studentPassword);
  await signIn(teacherA, SEED.teacherA.Email);
  await signIn(teacherB, SEED.teacherB.Email);
  sessions.completion = await book(SEED.teacherA, 0, `Related rates with A ${stamp}`);
  // Payments, including the simulator's reads, are limited to 10 a minute per student: one booking a minute.
  await waitUntil(Date.now() + 61_000, 'the payment limit window resets');
  sessions.noShow = await book(SEED.teacherB, 0, `Related rates with B ${stamp}`);
  await waitUntil(Date.now() + 61_000, 'the payment limit window resets');
  // Six half-hours later than the nearest slot: well outside its join window.
  sessions.later = await book(SEED.teacherA, 6, `Optimisation later ${stamp}`);
  assert.ok(sessions.later.startsAt - Date.now() > 2 * 60 * MINUTE, 'the later session starts in more than two hours');
  console.log(`  nearest session ${new Date(sessions.completion.startsAt).toISOString()} - ${new Date(sessions.completion.endsAt).toISOString()}`);
});

await step('J8-06 both participants see the booking on its own screen, reached from their work lists', async () => {
  // UX-03 made sessions part of each role's work list (`tf-work-card`); this journey predates it, and is
  // matched to both card kinds exactly as wave3b-direct-order was then.
  await spa(teacherA, '/teacher/work?tab=sessions');
  const card = teacherA.page.locator('article.tf-dashboard-card, article.tf-work-card', { hasText: `Related rates with A ${stamp}` })
    .filter({ has: teacherA.page.locator('[data-testid=row-open]') });
  await card.waitFor({ timeout: 20000 });
  await card.locator('[data-testid=row-open]').click();
  await teacherA.page.waitForURL(url => pathOf(url) === `/en/live-sessions/${sessions.completion.id}`, { timeout: 15000 });
  await attribute(teacherA.page, '[data-testid=session-status]', 'data-status', 1);
  await teacherA.page.locator('[data-testid=join-window]').waitFor();
  await shot(teacherA.page, 'live-01-teacher-booking');

  await spa(student, '/student/sessions');
  const mine = student.page.locator('article.tf-dashboard-card, article.tf-work-card', { hasText: `Related rates with B ${stamp}` })
    .filter({ has: student.page.locator('[data-testid=row-open]') });
  await mine.waitFor({ timeout: 20000 });
  await open(teacherB, sessions.noShow.id);
  await attribute(teacherB.page, '[data-testid=session-status]', 'data-status', 1);
});

await step('J8-02 joining too early is refused by the server, and an unrelated account is refused outright', async () => {
  await open(student, sessions.later.id);
  assert.equal(await student.page.locator('[data-testid=join-session]').isDisabled(), true,
    'the page prevents joining before the window');
  assert.equal(await student.page.evaluate(() => window.__openedRoom ?? null), null, 'no room opened');
  const early = await api(studentEmail, 'GET', `/api/v1/live-sessions/${sessions.later.id}/join`, undefined, {}, studentPassword);
  assert.equal(early.body.code, 'join_window_closed');
  assert.equal((await api(SEED.outsider.Email, 'GET', `/api/v1/live-sessions/${sessions.completion.id}/join`)).status, 404);
  assert.equal((await api(SEED.teacherB.Email, 'GET', `/api/v1/live-sessions/${sessions.completion.id}/join`)).status, 404);
  await shot(student.page, 'live-02-too-early');
});

await step('J8-06 teacher A cancels the later session; the page says the student is refunded', async () => {
  await open(teacherA, sessions.later.id);
  await teacherA.page.locator('[data-testid=cancel-session]').click();
  const body = await teacherA.page.locator('dialog.tf-system-dialog[open]').innerText();
  assert.match(body, /refunded/i, 'a teacher cancellation refunds the student');
  const cancelled = waitForCall(teacherA.page, 'POST', new RegExp(`^/api/v1/live-sessions/${sessions.later.id}/cancel$`));
  await confirmDialog(teacherA.page);
  assert.equal((await cancelled).status(), 204);
  await attribute(teacherA.page, '[data-testid=session-status]', 'data-status', 3);
  assert.equal(sql(`SELECT Status FROM LiveSessionBookings WHERE Id = '${sessions.later.id}'`), '3');
});

await step('J8-02 in the join window both the student and the teacher join through the page', async () => {
  await waitUntil(sessions.completion.startsAt - 14 * MINUTE, 'the join window opens');
  for (const actor of [student, teacherA]) {
    await open(actor, sessions.completion.id);
    const joined = waitForCall(actor.page, 'GET', new RegExp(`^/api/v1/live-sessions/${sessions.completion.id}/join$`));
    await actor.page.locator('[data-testid=join-session]').click();
    assert.equal((await joined).status(), 200);
    await actor.page.locator('[data-testid=join-link]').waitFor({ timeout: 10000 });
    assert.match(await actor.page.evaluate(() => window.__openedRoom ?? ''), /^https:\/\/meet\.local\/session\//, 'the mock room opened');
  }
  // Completion is not offered, and is refused, before the session ends.
  assert.equal(await teacherA.page.locator('[data-testid=complete-session]').count(), 0);
  const tooSoon = await api(SEED.teacherA.Email, 'POST', `/api/v1/live-sessions/${sessions.completion.id}/complete`, undefined,
    { 'If-Match': sqlVersion(sessions.completion.id) });
  assert.equal(tooSoon.status, 409);
  await shot(teacherA.page, 'live-03-joined-teacher');
});

await step('J8-05 after the session ends teacher A asks to complete; only the student can confirm it', async () => {
  await waitUntil(sessions.completion.endsAt + 30_000, 'the nearest session ends');
  await open(teacherA, sessions.completion.id);
  assert.equal(await teacherA.page.locator('[data-testid=report-no-show]').count(), 0, 'no-show waits for the grace period');
  const requested = waitForCall(teacherA.page, 'POST', new RegExp(`^/api/v1/live-sessions/${sessions.completion.id}/complete$`));
  await teacherA.page.locator('[data-testid=complete-session]').click();
  await confirmDialog(teacherA.page);
  assert.equal((await requested).status(), 204);
  await attribute(teacherA.page, '[data-testid=session-status]', 'data-status', 6);
  assert.equal(await teacherA.page.locator('[data-testid=confirm-settlement]').count(), 0, 'the teacher cannot confirm their own claim');

  await open(student, sessions.completion.id);
  await attribute(student.page, '[data-testid=session-status]', 'data-status', 6);
  const confirmed = waitForCall(student.page, 'POST', new RegExp(`^/api/v1/live-sessions/${sessions.completion.id}/settlement/confirm$`));
  await student.page.locator('[data-testid=confirm-settlement]').click();
  await confirmDialog(student.page);
  assert.equal((await confirmed).status(), 204);
  await attribute(student.page, '[data-testid=session-status]', 'data-status', 2);
  assert.equal(sql(`SELECT Status FROM LiveSessionBookings WHERE Id = '${sessions.completion.id}'`), '2', 'Completed');
  await shot(student.page, 'live-04-completed-student');

  await open(teacherA, sessions.completion.id);
  assert.match(await teacherA.page.locator('[data-testid=session-actions]').innerText(), /pending clearance/i);
});

await step('PRODUCT-P1 the student reviews the completed session once; the teacher cannot', async () => {
  await open(teacherA, sessions.completion.id);
  assert.equal(await teacherA.page.locator('[data-testid=open-session-review]').count(), 0, 'teachers do not review');
  await open(student, sessions.completion.id);
  await student.page.locator('[data-testid=open-session-review]').click();
  const form = student.page.locator('[data-testid=session-review-form]');
  await form.waitFor();
  // Nothing is sent while the form is incomplete.
  await form.locator('[data-testid=submit-session-review]').click();
  await form.locator('[role=alert]').first().waitFor();
  for (const criterion of ['explanationClarity', 'subjectKnowledge', 'communication', 'onTimeDelivery', 'valueForMoney'])
    await form.locator(`[data-testid=session-rate-${criterion}-5]`).click();
  await form.locator('[data-testid=session-review-comment]').fill('Clear, patient and on time.');
  const reviewed = waitForCall(student.page, 'POST', new RegExp(`^/api/v1/live-sessions/${sessions.completion.id}/review$`));
  await form.locator('[data-testid=submit-session-review]').click();
  assert.ok((await reviewed).ok(), 'review published');
  await student.page.locator('[data-testid=session-reviewed]').waitFor({ timeout: 15000 });
  assert.equal(await student.page.locator('[data-testid=open-session-review]').count(), 0, 'one review per session');
  await shot(student.page, 'live-04b-reviewed-student');
});

await step('J8-05 after the 15-minute grace the student reports teacher B absent; only teacher B can confirm it', async () => {
  await open(student, sessions.noShow.id);
  assert.equal(await student.page.locator('[data-testid=report-no-show]').count(), 0, 'not before the grace period');
  const early = await api(studentEmail, 'POST', `/api/v1/live-sessions/${sessions.noShow.id}/no-show`, { studentNoShow: false },
    { 'If-Match': sqlVersion(sessions.noShow.id) }, studentPassword);
  assert.equal(early.status, 409, 'the server refuses a no-show before the grace period ends');

  await waitUntil(sessions.noShow.endsAt + 15 * MINUTE + 30_000, 'the no-show grace period ends');
  await open(student, sessions.noShow.id);
  const reported = waitForCall(student.page, 'POST', new RegExp(`^/api/v1/live-sessions/${sessions.noShow.id}/no-show$`));
  await student.page.locator('[data-testid=report-no-show]').click();
  await confirmDialog(student.page);
  const response = await reported;
  assert.equal(response.status(), 204);
  assert.deepEqual(response.request().postDataJSON(), { studentNoShow: false });
  await attribute(student.page, '[data-testid=session-status]', 'data-status', 8);
  assert.equal(await student.page.locator('[data-testid=confirm-settlement]').count(), 0, 'the student cannot confirm their own claim');

  await open(teacherB, sessions.noShow.id);
  await attribute(teacherB.page, '[data-testid=session-status]', 'data-status', 8);
  const confirmed = waitForCall(teacherB.page, 'POST', new RegExp(`^/api/v1/live-sessions/${sessions.noShow.id}/settlement/confirm$`));
  await teacherB.page.locator('[data-testid=confirm-settlement]').click();
  await confirmDialog(teacherB.page);
  assert.equal((await confirmed).status(), 204);
  await attribute(teacherB.page, '[data-testid=session-status]', 'data-status', 5);
  assert.equal(sql(`SELECT Status FROM LiveSessionBookings WHERE Id = '${sessions.noShow.id}'`), '5', 'TeacherNoShow');
  await shot(teacherB.page, 'live-05-teacher-no-show');
  assert.equal((await api(SEED.outsider.Email, 'POST', `/api/v1/live-sessions/${sessions.noShow.id}/settlement/confirm`, undefined,
    { 'If-Match': sqlVersion(sessions.noShow.id) })).status, 404);
});

await step('settlement outcomes recorded by the existing finance flow', async () => {
  console.log(`  completion payment/escrow: ${sql(`SELECT CONCAT(p.Status, '/', (SELECT COUNT(*) FROM EscrowEntries e WHERE e.PaymentId = p.Id)) FROM Payments p WHERE p.LiveSessionBookingId = '${sessions.completion.id}'`)}`);
  console.log(`  no-show payment/escrow: ${sql(`SELECT CONCAT(p.Status, '/', (SELECT COUNT(*) FROM EscrowEntries e WHERE e.PaymentId = p.Id)) FROM Payments p WHERE p.LiveSessionBookingId = '${sessions.noShow.id}'`)}`);
  console.log(`  cancelled payment: ${sql(`SELECT Status FROM Payments WHERE LiveSessionBookingId = '${sessions.later.id}'`)}`);
  assert.equal(sql(`SELECT COUNT(*) FROM TeacherEarningMaturities WHERE LiveSessionBookingId = '${sessions.completion.id}' AND Status = 0`), '1',
    'the completed session’s earning is pending, not available');
});

await step('no script errors on any page', async () => {
  assert.deepEqual([...student.page.problems, ...teacherA.page.problems, ...teacherB.page.problems], []);
});

await finish('Wave 3B live session');

function sqlVersion(id) {
  const hex = sql(`SELECT CONVERT(varchar(64), CAST(RowVersion AS varbinary(8)), 2) FROM LiveSessionBookings WHERE Id = '${id}'`);
  return Buffer.from(hex, 'hex').toString('base64');
}
