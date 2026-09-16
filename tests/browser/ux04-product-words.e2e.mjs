/* UX-04 end-to-end: no Student or Teacher list shows the machine's version of the truth.
 *
 * Walks every Student and Teacher dashboard section in Arabic (390px) and English (desktop) with
 * real work in several states — a direct request waiting for the teacher, an accepted order
 * awaiting payment, an open request receiving an offer, and the teacher's opportunity, money and
 * qualification lists — and asserts on the rendered DOM that:
 *
 *   - no status badge is a number, an enum name or an empty dash;
 *   - no card title, field or badge contains a GUID, an email address, `null` or `undefined`;
 *   - no entity-explorer label ("Currency", "Updated", "Count") and no search box or Refresh button;
 *   - in Arabic every badge and field label is Arabic (no English product words);
 *   - a notification reads as Tafseel's own sentence in Arabic, never the server's English title.
 *
 * Same environment variables as tests/browser/wave3b-harness.mjs; the Wave 3B fulfilment seed.
 * The database is only read.
 */
import assert from 'node:assert/strict';
import {
  BASE, SEED, acceptRequest, api, context, finish, noHorizontalOverflow, registerStudent, sendDirectRequest,
  shot, signIn, start, step, visit
} from './wave3b-harness.mjs';

const stamp = Date.now();
const studentEmail = `ux04-student-${stamp}@example.test`;
const studentPassword = `Ux04!Words-${stamp}`;
const directTitle = `شرح المشتقات ${stamp}`;
const openTitle = `شرح النهايات ${stamp}`;

const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const LATIN_WORD = /[A-Za-z]{3,}/;
const FORBIDDEN_LABELS = /\b(Currency|Updated|Count|statusName|createdAt|totalCount)\b|العملة|آخر تحديث/;

/** What the cards on the current section actually say. */
const readCards = page => page.evaluate(() => [...document.querySelectorAll('article.tf-dashboard-card')].map(card => ({
  title: card.querySelector('h2')?.textContent?.trim() ?? '',
  badges: [...card.querySelectorAll('.tf-badge')].map(b => b.textContent.trim()),
  labels: [...card.querySelectorAll('dt')].map(d => d.textContent.trim()),
  values: [...card.querySelectorAll('dd')].map(d => d.textContent.trim()),
  action: card.querySelector('[data-testid=row-open], [data-testid=notification-action]')?.textContent?.trim() ?? '',
  text: card.innerText
})));

async function audit(actor, path, { arabic }) {
  const { page } = actor;
  await visit(page, `${BASE}/${arabic ? 'ar' : 'en'}${path}`);
  await page.locator('.tf-dashboard-grid, .tf-dashboard-empty, .tf-dashboard-settings').first().waitFor({ timeout: 20000 });
  const where = `${path} ${arabic ? 'ar' : 'en'}`;

  assert.equal(await page.locator('.tf-dashboard-search').count(), 0, `${where}: no search box`);
  assert.equal(await page.locator('.tf-dashboard-heading button').count(), 0, `${where}: no Refresh button`);

  for (const card of await readCards(page)) {
    const shown = [card.title, ...card.badges, ...card.labels, ...card.values, card.action].join(' | ');
    assert.doesNotMatch(shown, GUID, `${where}: a card shows an id — ${shown}`);
    assert.doesNotMatch(shown, /@[a-z0-9.-]+\.[a-z]{2,}/i, `${where}: a card shows an email — ${shown}`);
    assert.doesNotMatch(shown, /\bnull\b|\bundefined\b|\bNaN\b/, `${where}: a card shows a missing value — ${shown}`);
    assert.doesNotMatch(shown, FORBIDDEN_LABELS, `${where}: entity-explorer label — ${shown}`);
    assert.ok(card.title.length > 0, `${where}: every card has a title`);
    for (const badge of card.badges) {
      assert.doesNotMatch(badge, /^\s*-?\d+\s*$/, `${where}: numeric status badge "${badge}"`);
      assert.doesNotMatch(badge, /^(Pending|Awaiting|Submitted|Selected|None|Unknown)$/i, `${where}: enum-looking badge "${badge}"`);
      if (arabic) assert.match(badge, /[؀-ۿ]/, `${where}: badge not in Arabic — "${badge}"`);
    }
    if (arabic) for (const label of [...card.labels, card.action].filter(Boolean))
      assert.doesNotMatch(label, LATIN_WORD, `${where}: English label in Arabic — "${label}"`);
  }
  if (arabic) await noHorizontalOverflow(page, where);
  return page;
}

await start();
const student = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-SA' });
const studentEn = await context();
const teacher = await context();
const teacherAr = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-SA' });

await step('the student and teacher have work in several states', async () => {
  await registerStudent(student, `طالبة UX-04 ${stamp}`, studentEmail, studentPassword);
  await signIn(teacher, SEED.teacherA.Email);
  // A direct request, accepted so an order awaits payment; a second one still waiting for the teacher.
  const accepted = await sendDirectRequest(student, SEED.teacherA, directTitle);
  await acceptRequest(teacher, accepted, 150);
  // The wizard is left on its "sent" screen; a full load starts the second request from the beginning.
  await visit(student.page, `${BASE}/ar/student/overview`);
  await sendDirectRequest(student, SEED.teacherB, `${directTitle} (2)`);
  // An open request with one offer: the student sees offers, teacher A sees an opportunity they answered.
  const published = await api(studentEmail, 'POST', '/api/v1/open-marketplace/requests', {
    subjectId: SEED.subjectId, serviceCatalogItemId: SEED.recordedCatalogId, title: openTitle,
    requirements: 'اشرح كل تمرين في الفصل الثالث خطوة بخطوة.',
    deadline: new Date(Date.now() + 3 * 86_400_000).toISOString(), budgetMin: 90, budgetMax: 200
  }, {}, studentPassword);
  assert.equal(published.status, 201, JSON.stringify(published.body));
  const offered = await api(SEED.teacherB.Email, 'POST', `/api/v1/open-marketplace/opportunities/${published.body.id}/offers`,
    { amount: 150, deliveryHours: 48, includedRevisions: 2, validityHours: 72, message: 'سأشرح كل تمرين.' });
  assert.equal(offered.status, 201, JSON.stringify(offered.body));
  await signIn(studentEn, studentEmail, studentPassword);
  await signIn(teacherAr, SEED.teacherA.Email);
});

await step('every student list speaks product words, in Arabic and in English', async () => {
  const sections = ['/student/overview', '/student/requests', '/student/requests?tab=orders', '/student/sessions',
    '/student/saved', '/student/payments', '/student/reviews', '/student/notifications', '/student/settings'];
  for (const section of sections) {
    await audit(student, section, { arabic: true });
    await audit(studentEn, section, { arabic: false });
  }
  await shot(student.page, 'ux04-student-sections-ar');
});

await step('the student’s own work reads as its state, not its number', async () => {
  const page = await audit(student, '/student/requests', { arabic: true });
  const cards = await readCards(page);
  const waiting = cards.find(c => c.title.includes('(2)'));
  assert.ok(waiting, 'the request still waiting for its teacher is listed');
  assert.deepEqual(waiting.badges, ['بانتظار المعلم']);
  const open = cards.find(c => c.title === openTitle);
  assert.ok(open?.badges.includes('يستقبل العروض'), `open request badge: ${open?.badges}`);
  assert.equal(open.action, 'قارن العروض', 'an offer is waiting, so the card offers to compare');

  const orders = await readCards(await audit(student, '/student/requests?tab=orders', { arabic: true }));
  const order = orders.find(c => c.title === directTitle);
  assert.ok(order, 'the accepted order is listed');
  assert.deepEqual(order.badges, ['بانتظار الدفع']);
  assert.equal(order.action, 'ادفع الآن');
  assert.ok(order.labels.includes('المبلغ'), `amount is named: ${order.labels}`);
  await shot(page, 'ux04-student-requests-ar');

  const english = await readCards(await audit(studentEn, '/student/requests?tab=orders', { arabic: false }));
  assert.deepEqual(english.find(c => c.title === directTitle)?.badges, ['Payment required']);
});

await step('every teacher list speaks product words, in Arabic and in English', async () => {
  const sections = ['/teacher/home', '/teacher/work', '/teacher/work?tab=orders', '/teacher/work?tab=sessions',
    '/teacher/opportunities', '/teacher/qualifications', '/teacher/settings'];
  for (const section of sections) {
    await audit(teacherAr, section, { arabic: true });
    await audit(teacher, section, { arabic: false });
  }
  await shot(teacherAr.page, 'ux04-teacher-sections-ar');
});

await step('the teacher reads the same order from their own side, and their money in words', async () => {
  const work = await readCards(await audit(teacher, '/teacher/work?tab=orders', { arabic: false }));
  const order = work.find(c => c.title === directTitle);
  assert.ok(order, 'the accepted order is on the teacher’s work list');
  assert.deepEqual(order.badges, ['Waiting for the student’s payment'], 'the teacher waits on the student, not on "Payment required"');
  assert.ok(order.labels.includes('Your net earnings'), `net earnings named: ${order.labels}`);

  // Earnings is its own screen since FIN-01, so it is not part of the generic-list sweep above; its own
  // journey (fin01-teacher-earnings) proves it. Here we only check it speaks the same product language.
  await visit(teacherAr.page, `${BASE}/ar/teacher/earnings`);
  await teacherAr.page.locator('[data-testid=earnings-empty], [data-testid=earnings-available]').first().waitFor({ timeout: 20000 });
  const money = await teacherAr.page.locator('main').innerText();
  assert.doesNotMatch(money, /ledger|escrow|maturity|pendingClearance|minimumAmount/i, 'no internal money words');
  assert.doesNotMatch(money, /[A-Za-z]{3,}/, 'the Arabic earnings screen carries no English product words');
  await shot(teacherAr.page, 'ux04-teacher-earnings-ar');
});

await step('a notification is Tafseel’s sentence in Arabic, and the server’s English only in English', async () => {
  const ar = await readCards(await audit(student, '/student/notifications', { arabic: true }));
  assert.ok(ar.length > 0, 'the student has notifications');
  assert.ok(ar.some(c => c.title === 'طلبك مقبول — أكمل الدفع'), `accepted-request notification in Arabic: ${ar.map(c => c.title)}`);
  for (const card of ar) assert.doesNotMatch(card.title, LATIN_WORD, `Arabic notification title: "${card.title}"`);

  const en = await readCards(await audit(studentEn, '/student/notifications', { arabic: false }));
  assert.ok(en.some(c => c.title === 'Your request was accepted — complete payment'),
    `accepted-request notification in English: ${en.map(c => c.title)}`);
});

await step('no script errors on any page', async () => {
  assert.deepEqual([...student.page.problems, ...studentEn.page.problems, ...teacher.page.problems, ...teacherAr.page.problems], []);
});

await finish('UX-04 product words');
