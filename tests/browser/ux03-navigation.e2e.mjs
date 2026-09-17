/* UX-03 end-to-end: every role's navigation is a short list of goals, in their own words.
 *
 *   1. A student has exactly five destinations, in Arabic at 390px, and each one opens.
 *   2. The destinations the clutter came from are gone from navigation but not from the product:
 *      the old addresses still work, they just land where the capability lives now.
 *   3. An item opened from anywhere keeps the destination it belongs to highlighted.
 *   4. A teacher has exactly six, with the five setup pages inside one of them.
 *   5. Quality has two and Admin six, and nothing V1 hides is offered.
 *   6. The bell, the account menu and the language switch are in the header for every role.
 *
 * Same environment variables as tests/browser/wave3b-harness.mjs; the Wave 3B fulfilment seed.
 * The database is only read.
 */
import assert from 'node:assert/strict';
import {
  BASE, SEED, context, finish, noHorizontalOverflow, pathOf, registerStudent, sendDirectRequest, shot, signIn,
  start, step, visit
} from './wave3b-harness.mjs';

const stamp = Date.now();
const studentEmail = `ux03-student-${stamp}@example.test`;
const studentPassword = `Ux03!Nav-${stamp}`;
const directTitle = `شرح قاعدة السلسلة ${stamp}`;

await start();
// The phone is the case that matters, and Arabic is the default language.
const student = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-SA' });
const teacher = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-SA' });
const reviewer = await context();
const admin = await context();
let requestId = '';

/** The primary destinations a page offers, as the reader sees them. */
const nav = async page => page.locator('[data-testid=nav-item]').evaluateAll(items => items.map(item => ({
  key: item.getAttribute('data-nav'),
  label: item.textContent.trim(),
  href: item.getAttribute('href'),
  current: item.getAttribute('aria-current') === 'page'
})));

const activeKey = async page => (await nav(page)).find(item => item.current)?.key ?? '';

/** Opens a workspace page and waits for its navigation to be there. */
async function openPage(actor, path) {
  await visit(actor.page, `${BASE}${path}`);
  await actor.page.locator('[data-testid=primary-nav]').waitFor({ timeout: 20000 });
  return actor.page;
}

/**
 * Every destination is real: it answers, it stays on the address the navigation claimed (no redirect to
 * a sign-in or a not-found), and it says something. Discovery and the request wizard are public-shell
 * screens with no sidebar; the workspace ones must also highlight the destination they belong to.
 */
async function everyDestinationOpens(actor, items) {
  for (const item of items) {
    const response = await actor.page.goto(`${BASE}${item.href}`, { waitUntil: 'networkidle' });
    assert.ok(response.ok(), `${item.href} answers (${response.status()})`);
    assert.equal(pathOf(actor.page.url()).replace(/\/$/, ''), item.href.replace(/\/$/, ''),
      `${item.href} stays where the navigation pointed`);
    assert.equal(await actor.page.locator('[data-testid=not-found], [data-testid=page-not-found]').count(), 0,
      `${item.href} is not a dead link`);
    if (await actor.page.locator('[data-testid=primary-nav]').count())
      assert.equal(await activeKey(actor.page), item.key, `${item.href} highlights ${item.key}`);
    else
      assert.ok((await actor.page.locator('main').innerText()).trim().length > 0, `${item.href} renders a page`);
  }
}

await step('1. a student is offered five goals, in Arabic, on a phone', async () => {
  await registerStudent(student, `طالبة UX-03 ${stamp}`, studentEmail, studentPassword);
  const page = await openPage(student, '/ar/student/overview');

  const items = await nav(page);
  assert.equal(items.length, 5, `five destinations (${items.map(i => i.label).join(' · ')})`);
  assert.deepEqual(items.map(i => i.label), ['الرئيسية', 'ابحث عن معلم', 'اطلب شرحاً', 'طلباتي', 'الرسائل']);
  assert.deepEqual(items.map(i => i.href.replace(/^\/ar/, '').replace(/\/$/, '')),
    ['/student/overview', '/teachers', '/requests/new', '/student/requests', '/messages']);
  assert.equal(await activeKey(page), 'home', 'the home is the one highlighted');

  // The navigation is Arabic, fits the phone, and every item is a real target.
  const text = (await page.locator('[data-testid=primary-nav]').innerText()).replace(/\s+/g, ' ');
  assert.doesNotMatch(text, /[A-Za-z]{3,}/, `no English in the Arabic navigation (${text})`);
  for (const item of await page.locator('[data-testid=nav-item]').all()) {
    const box = await item.boundingBox();
    assert.ok(box && box.height >= 44, `every destination is a 44px target (${box?.height}px)`);
  }
  await noHorizontalOverflow(page, 'student navigation at 390px');
  await shot(page, 'ux03-student-nav-ar');
});

await step('2. each of the five opens, and the header keeps the bell, account and language', async () => {
  const items = await nav(student.page);
  await everyDestinationOpens(student, items);

  const page = await openPage(student, '/ar/student/overview');
  for (const control of ['notification-bell', 'account-menu-toggle'])
    assert.equal(await page.locator(`[data-testid=${control}]`).count(), 1, `${control} is in the header`);
  assert.ok(await page.locator('tf-lang-toggle, [data-testid=lang-toggle]').count() >= 1, 'the language switch is there');

  // The bell is where notifications live now.
  await page.locator('[data-testid=notification-bell]').click();
  await page.locator('[data-testid=notification-panel]').waitFor({ timeout: 15000 });
  // The account menu is where settings went.
  await page.keyboard.press('Escape').catch(() => {});
  await page.locator('[data-testid=account-menu-toggle]').click();
  await page.locator('[data-testid=account-menu]').waitFor({ timeout: 15000 });
  assert.match(await page.locator('[data-testid=account-settings]').getAttribute('href'), /\/student\/settings\/?$/);
  await shot(page, 'ux03-student-account-ar');
});

await step('3. the destinations that left navigation still answer their old addresses', async () => {
  const moved = [
    ['/ar/student/payments', '/ar/student/requests'],
    ['/ar/student/sessions', '/ar/student/requests'],
    ['/ar/student/reviews', '/ar/student/requests'],
    ['/ar/student/saved', '/ar/teachers'],
    ['/ar/student/notifications', '/ar/student/overview']
  ];
  for (const [old, landing] of moved) {
    await visit(student.page, `${BASE}${old}`);
    await student.page.waitForURL(url => pathOf(url).replace(/\/$/, '') === landing, { timeout: 20000 });
    // Saved teachers is a filter on Find a teacher, not a destination of its own; the filter travels.
    if (old.endsWith('/saved')) assert.match(student.page.url(), /saved=1/, 'the saved filter is carried through');
  }
  const items = await nav(await openPage(student, '/ar/student/overview'));
  const html = items.map(i => i.href).join(' ');
  for (const gone of ['/student/payments', '/student/saved', '/student/sessions', '/student/reviews'])
    assert.ok(!html.includes(gone), `${gone} is not a destination any more`);
});

await step('4. an item opened from anywhere keeps its own destination highlighted', async () => {
  requestId = await sendDirectRequest(student, SEED.teacherA, directTitle);
  await openPage(student, `/ar/requests/${requestId}`);
  assert.equal(await activeKey(student.page), 'my_requests', 'a request belongs to My requests & orders');

  // The list itself is one place for requests, orders and sessions, with its chips.
  const list = await openPage(student, '/ar/student/requests');
  const chips = await list.locator('[data-testid=work-chip]').allInnerTexts();
  assert.deepEqual(chips.map(c => c.trim()), ['الكل', 'يحتاج إجراء', 'جارية', 'منتهية']);
  assert.ok((await list.locator('[data-testid=work-item]').count()) >= 1, 'the request the student just sent is in it');
  await visit(student.page, `${BASE}/ar/student/requests?view=action`);
  await list.locator('[data-testid=work-chip][data-chip=action][aria-pressed=true]').waitFor({ timeout: 15000 });
  await noHorizontalOverflow(list, 'my requests and orders at 390px');
  await shot(list, 'ux03-student-work-ar');
});

await step('5. a teacher is offered six, with the setup pages inside one of them', async () => {
  await signIn(teacher, SEED.teacherA.Email);
  const page = await openPage(teacher, '/ar/teacher/home');

  const items = await nav(page);
  assert.equal(items.length, 6, `six destinations (${items.map(i => i.label).join(' · ')})`);
  assert.deepEqual(items.map(i => i.label), ['الرئيسية', 'أعمالي', 'طلبات مفتوحة', 'الرسائل', 'أرباحي', 'إعداد ملفي']);
  assert.deepEqual(items.map(i => i.href.replace(/^\/ar/, '').replace(/\/$/, '')),
    ['/teacher/home', '/teacher/work', '/teacher/opportunities', '/messages', '/teacher/earnings', '/teacher/profile']);
  // Profile, services, availability, qualifications and visibility are not top-level entries.
  const hrefs = items.map(i => i.href).join(' ');
  for (const nested of ['/teacher/services', '/teacher/availability', '/teacher/qualifications', '/teacher/publication'])
    assert.ok(!hrefs.includes(nested), `${nested} is not a primary destination`);

  await everyDestinationOpens(teacher, items);
  await noHorizontalOverflow(page, 'teacher navigation at 390px');
  await shot(await openPage(teacher, '/ar/teacher/home'), 'ux03-teacher-nav-ar');
});

await step('6. the teaching-setup group holds its five pages and stays highlighted on each', async () => {
  const pages = ['/teacher/profile', '/teacher/services', '/teacher/availability', '/teacher/qualifications', '/teacher/publication'];
  for (const path of pages) {
    const page = await openPage(teacher, `/ar${path}`);
    assert.equal(await activeKey(page), 'setup', `${path} keeps My teaching setup highlighted`);
    const children = await page.locator('[data-testid=nav-child]').evaluateAll(items =>
      items.map(item => ({ key: item.getAttribute('data-nav'), href: item.getAttribute('href'), current: item.getAttribute('aria-current') === 'page' })));
    assert.equal(children.length, 5, `${path} lists the five setup pages`);
    assert.equal(children.find(c => c.current)?.href.replace(/^\/ar/, '').replace(/\/$/, ''), path,
      `${path} is the one marked current`);
  }
  // Teacher Offerings are «خدماتي», never "create a service".
  const services = await openPage(teacher, '/ar/teacher/services');
  const text = (await services.locator('main').innerText()).replace(/\s+/g, ' ');
  assert.match(text, /خدماتي/, 'the page is called My services');
  assert.doesNotMatch(text, /أنشئ خدمة/, 'nothing suggests the teacher creates a Tafseel service');
  await shot(services, 'ux03-teacher-setup-ar');
});

await step('7. a teacher’s order and opportunity keep Work and Open requests highlighted', async () => {
  await openPage(teacher, `/ar/requests/${requestId}`);
  assert.equal(await activeKey(teacher.page), 'work', 'a request assigned to the teacher belongs to Work');
  const work = await openPage(teacher, '/ar/teacher/work');
  assert.deepEqual((await work.locator('[data-testid=work-chip]').allInnerTexts()).map(c => c.trim()),
    ['الكل', 'يحتاج إجراء', 'جارية', 'منتهية']);
  assert.equal(await activeKey(work), 'work');
  await noHorizontalOverflow(work, 'teacher work list at 390px');
});

await step('8. quality has two destinations and admin six, with nothing V1 hides', async () => {
  await signIn(reviewer, SEED.reviewer.Email);
  const quality = await openPage(reviewer, '/en/quality/applications');
  const qualityItems = await nav(quality);
  assert.equal(qualityItems.length, 2, `two destinations (${qualityItems.map(i => i.label).join(' · ')})`);
  assert.deepEqual(qualityItems.map(i => i.label), ['Applications', 'Account']);
  await everyDestinationOpens(reviewer, qualityItems);
  // Showcase moderation returns with B11-05; its address still answers, it just lands on the queue.
  await visit(reviewer.page, `${BASE}/en/quality/showcases`);
  await reviewer.page.waitForURL(url => pathOf(url).replace(/\/$/, '') === '/en/quality/applications', { timeout: 20000 });

  await signIn(admin, SEED.admin.Email);
  const adminPage = await openPage(admin, '/en/admin/home');
  const adminItems = await nav(adminPage);
  assert.equal(adminItems.length, 6, `six areas (${adminItems.map(i => i.label).join(' · ')})`);
  assert.deepEqual(adminItems.map(i => i.label),
    ['Attention', 'People', 'Catalog & pricing', 'Operations', 'Finance', 'Audit']);
  await everyDestinationOpens(admin, adminItems);
  // Insights is B11-10: the address answers, the navigation does not offer it.
  await visit(admin.page, `${BASE}/en/admin/insights`);
  await admin.page.waitForURL(url => pathOf(url).replace(/\/$/, '') === '/en/admin/home', { timeout: 20000 });
  await shot(adminPage, 'ux03-admin-nav-en');
});

await step('no script errors on any page', async () => {
  for (const actor of [student, teacher, reviewer, admin])
    assert.deepEqual(actor.page.problems, [], 'no page errors');
});

await finish('UX-03 navigation');
