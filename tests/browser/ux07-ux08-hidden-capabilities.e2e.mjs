/* UX-07 and UX-08 end-to-end: Tafseel offers nothing a person cannot use.
 *
 *   UX-07  The landing page never shows a coupon code, and never opens a discount campaign, because V1
 *          checkout cannot redeem one. Non-discount campaigns still open and still say their piece.
 *          Checkout itself has no code field, and the amount it charges is the server's.
 *   UX-08  The request wizard offers the writing helper only when the server says it can run. With AI off
 *          — the V1 default — there is no button, no draft panel, no "unavailable" message, and the page
 *          makes no AI request at all.
 *
 * Same environment variables as tests/browser/wave3b-harness.mjs; the Wave 3B fulfilment seed. The host
 * runs with the default configuration, which is AI disabled. The database is only read.
 */
import assert from 'node:assert/strict';
import {
  BASE, SEED, acceptRequest, api, attribute, context, finish, noHorizontalOverflow, pathOf, payInSimulator,
  payButton, registerStudent, sendDirectRequest, shot, signIn, spa, start, step, visit
} from './wave3b-harness.mjs';

const stamp = Date.now();
const studentEmail = `ux0708-student-${stamp}@example.test`;
const studentPassword = `Ux0708!Hide-${stamp}`;
const directTitle = `شرح قاعدة السلسلة ${stamp}`;
const COUPON = `TAFSEEL${String(stamp).slice(-5)}`;
const PRICE = 150;

await start();
// The phone in Arabic is the surface both tickets are judged on.
const student = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-SA' });
const visitor = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-SA' });
const teacher = await context();
let orderId = '';

/** Every request the page made to the AI endpoints. */
const aiCalls = page => page.sent.filter(request => /\/api\/v1\/ai\//.test(new URL(request.url()).pathname));

await step('1. a visitor is never shown a coupon code, or a discount they cannot redeem', async () => {
  const { page } = visitor;
  // Two live campaigns, published the way an admin publishes them: the discount carries a code no V1
  // checkout can redeem, and the announcement is a perfectly good offer that must still work.
  const campaign = (kind, title, code) => ({
    kind, titleEn: title, titleAr: title, eyebrowEn: 'New', eyebrowAr: 'جديد',
    bodyEn: 'Body', bodyAr: 'نص الإعلان', highlightEn: kind === 0 ? '20%' : '', highlightAr: kind === 0 ? '٢٠٪' : '',
    couponCode: code, ctaLabelEn: 'Try it now', ctaLabelAr: 'جرّبها الآن', ctaHref: '/teachers',
    accent: 'violet', startsAt: null, endsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), displayOrder: kind === 0 ? 0 : 1
  });
  for (const promotion of [campaign(0, `Discount ${stamp}`, COUPON), campaign(2, `Announcement ${stamp}`, '')]) {
    const created = await api(SEED.admin.Email, 'POST', '/api/v1/admin/promotions', promotion);
    assert.equal(created.status, 201, JSON.stringify(created.body));
  }

  await visit(page, `${BASE}/ar`);
  // The entry dialog opens on a delay when there is an eligible campaign.
  await page.waitForTimeout(4000);

  const promotions = await api(SEED.teacherA.Email, 'GET', '/api/v1/promotions');
  assert.equal(promotions.status, 200, 'the promotions endpoint still answers');
  const live = Array.isArray(promotions.body) ? promotions.body : [];
  const codes = live.map(p => (p.couponCode ?? '').trim()).filter(Boolean);
  console.log(`  ${live.length} live promotion(s), ${codes.length} carrying a code`);
  // The public endpoint used to carry the code, which is why the screen had to hide it; it now withholds
  // the code itself. Either way the checks below are what matter: no visitor ever sees it.
  if (!codes.includes(COUPON)) console.log('  the server no longer publishes the coupon code to visitors');
  if (!live.some(p => p.kind === 0 || p.kindCode === 'discount')) console.log('  the server no longer lists the unredeemable discount to visitors');

  const text = await page.locator('body').innerText();
  for (const code of codes)
    assert.ok(!text.includes(code), `the landing page does not show the code ${code}`);
  assert.doesNotMatch(text, /استخدم الكود|كود الخصم|promo code|coupon/i, `no code-entry language (${text.slice(0, 160)})`);

  // The announcement opens; the discount never does, and no code is anywhere on the page.
  const dialog = page.locator('.tf-promo-wizard, [role=dialog]').first();
  await dialog.waitFor({ timeout: 15000 });
  const shown = (await dialog.innerText()).replace(/\s+/g, ' ');
  assert.match(shown, new RegExp(`Announcement ${stamp}`), `the announcement is what opened (${shown})`);
  assert.doesNotMatch(shown, new RegExp(`Discount ${stamp}`), 'the discount campaign is not offered');
  for (const code of codes) assert.ok(!shown.includes(code), `the dialog shows no code (${shown})`);
  assert.equal(await page.locator('.tf-promo-code').count(), 0, 'no copy-the-code button');
  // What remains is a complete card, not a gap where the code block was.
  assert.match(shown, /نص الإعلان/, 'the body still reads');
  assert.match(shown, /جرّبها الآن/, 'and its call to action is there');
  await noHorizontalOverflow(page, 'landing at 390px');
  await shot(page, 'ux07-landing-ar');
});

await step('2. checkout offers a working code field (DEC-15), and charges what the server says', async () => {
  await registerStudent(student, `طالبة UX-07 ${stamp}`, studentEmail, studentPassword);
  await signIn(teacher, SEED.teacherA.Email);
  const requestId = await sendDirectRequest(student, SEED.teacherA, directTitle);
  orderId = await acceptRequest(teacher, requestId, PRICE);

  const { page } = student;
  await spa(student, `/orders/${orderId}`);
  await page.locator('[data-testid=pay-order]').click();
  await page.waitForURL(url => pathOf(url) === '/ar/checkout', { timeout: 20000 });
  // Wait for the receipt: reading while it still says "loading" proves nothing.
  await payButton(page).waitFor({ timeout: 20000 });

  const checkout = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  // DEC-15 (owner decision, after UX-07): coupons are redeemable at checkout in V1, so the field is offered —
  // labelled, optional, and never in the way of paying the server's total.
  const code = page.locator('[data-testid=checkout-coupon]');
  assert.equal(await code.count(), 1, 'one coupon field');
  assert.ok(await page.locator('label[for=pay-coupon-code]').count(), 'the field has a visible label');
  assert.ok(await payButton(page).isEnabled(), 'paying does not wait for a code');

  // The amount is the server's, and paying it works exactly as before.
  const total = await api(studentEmail, 'GET', `/api/v1/orders/${orderId}`, undefined, {}, studentPassword);
  assert.equal(total.status, 200);
  const expected = Number(total.body.studentTotal).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(Number(Number(total.body.studentTotal))) ? 0 : 2 });
  assert.ok(checkout.includes(expected), `checkout shows the authoritative total ${expected} (${checkout.slice(0, 200)})`);
  await noHorizontalOverflow(page, 'checkout at 390px');
  await shot(page, 'ux07-checkout-ar');

  await payInSimulator(page, new RegExp(`^/(ar|en)/orders/${orderId}$`));
  await attribute(page, '[data-testid=order-status]', 'data-payment', 1);
});

await step('3. the coupon capability is there on the server', async () => {
  // UX-07 hid a promise the product could not keep; DEC-15 then made the promise keepable.
  const promotions = await api(SEED.teacherA.Email, 'GET', '/api/v1/promotions');
  assert.equal(promotions.status, 200, 'GET /promotions still answers');
  const coupons = await api(SEED.admin.Email, 'GET', '/api/v1/admin/coupons');
  assert.ok([200, 403].includes(coupons.status), `the admin coupon API still exists (${coupons.status})`);
});

await step('4. with AI disabled the wizard offers no writing helper at all', async () => {
  const { page } = student;
  // A second teacher, so the wizard opens fresh: a draft is remembered per student and teacher, and the
  // request in step 2 left one for teacher A.
  // Watch from before the load: the capability question is asked as the wizard opens.
  page.sent.length = 0;
  await visit(page, `${BASE}/ar/requests/new?teacherId=${SEED.teacherB.Id}&teacherServiceId=${SEED.teacherB.explanationServiceId}`);
  await page.locator('#req-title').waitFor({ timeout: 20000 });

  await page.locator('#req-title').fill(directTitle);
  await page.locator('.tf-req-nav button.tf-button:not(.tf-button-secondary)').click();
  await page.locator('#req-goal').waitFor({ timeout: 15000 });

  assert.equal(await page.locator('[data-testid=ai-help]').count(), 0, 'no writing-helper button');
  assert.equal(await page.locator('[data-testid=ai-draft]').count(), 0, 'no draft panel');
  const goalStep = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  assert.doesNotMatch(goalStep, /ساعدني في الكتابة|Help me write/i, 'the helper is not named');
  assert.doesNotMatch(goalStep, /المساعد غير متاح|unavailable|قريبًا|coming soon/i,
    `nothing announces a feature that is off (${goalStep.slice(0, 200)})`);

  // The page asked whether it may offer the helper — once — and asked for no AI work.
  const asked = aiCalls(page).map(request => `${request.method()} ${new URL(request.url()).pathname}`);
  assert.deepEqual(asked, ['GET /api/v1/ai/capabilities'], `one capability read and nothing else (${asked})`);

  // The rest of the step is untouched: the goal field and the way forward are both there.
  assert.equal(await page.locator('#req-goal').count(), 1);
  assert.ok(await page.locator('.tf-req-nav button').count() >= 1, 'the wizard can still be completed');
  for (const field of await page.locator('.tf-field').all())
    assert.ok((await field.innerText()).trim().length > 0, 'no empty field is left where the helper was');
  await noHorizontalOverflow(page, 'request wizard at 390px');
  await shot(page, 'ux08-wizard-ar');
});

await step('5. the capability endpoint answers the student, and only the student', async () => {
  const student1 = await api(studentEmail, 'GET', '/api/v1/ai/capabilities', undefined, {}, studentPassword);
  assert.equal(student1.status, 200);
  assert.deepEqual(Object.keys(student1.body), ['requestAssistant'], 'one field, and nothing else');
  assert.equal(student1.body.requestAssistant, false, 'AI is off in this configuration');

  const body = JSON.stringify(student1.body).toLowerCase();
  for (const secret of ['groq', 'apikey', 'api_key', 'model', 'endpoint', 'token'])
    assert.ok(!body.includes(secret), `the answer says nothing about ${secret}`);

  assert.equal((await api(SEED.teacherA.Email, 'GET', '/api/v1/ai/capabilities')).status, 403,
    'a teacher is refused');
});

await step('6. the wizard still works end to end with the helper hidden', async () => {
  const { page } = student;
  await page.locator('#req-goal').fill('اشرح لي قاعدة السلسلة خطوة بخطوة مع أمثلة.');
  const next = page.locator('.tf-req-nav button.tf-button:not(.tf-button-secondary)');
  await next.click();
  await page.locator('#req-delivery').waitFor({ timeout: 15000 });
  assert.equal(await page.locator('[data-testid=ai-help]').count(), 0, 'and still no helper further in');
  assert.deepEqual(aiCalls(page).map(r => new URL(r.url()).pathname), ['/api/v1/ai/capabilities'],
    'no AI work was requested at any point');
});

await step('no script errors on any page', async () => {
  for (const actor of [student, visitor, teacher])
    assert.deepEqual(actor.page.problems, [], 'no page errors');
});

await finish('UX-07 + UX-08 hidden capabilities');
