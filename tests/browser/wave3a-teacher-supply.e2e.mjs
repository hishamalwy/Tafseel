/* Wave 3A end-to-end: the teacher supply lifecycle, through the Angular client only.
 *
 *   NEW TEACHER registers in /auth, confirms the address from the dev outbox, signs in and
 *   applies to teach a subject with a demo, then submits it
 *   QUALITY REVIEWER opens the queue, the application and the demo, starts the review,
 *   requests changes (the teacher resubmits), then approves; a second application is rejected
 *   TEACHER completes the profile, creates services at valid prices (an unqualified subject
 *   cannot be sold), sets weekly availability and time off, sees readiness turn green, publishes
 *   VISITOR browses /teachers, finds the teacher and opens the profile with its services
 *
 * Runs against a published build in Development on a throwaway database. The seed
 * (scripts/dev/E2ESeed, TAFSEEL_E2E_SCENARIO=supply) creates only the reviewer identity and
 * catalog data. Every business transition happens here, in the browser, against the real API;
 * a few direct API calls only prove that the server refuses what the UI never offers.
 *
 * Environment:
 *   TAFSEEL_BASE_URL        default http://localhost:5312
 *   TAFSEEL_E2E_SEED        the seeder's JSON output (required)
 *   TAFSEEL_E2E_PASSWORD    the seeded reviewer's password (required)
 *   TAFSEEL_DEV_OUTBOX      the host's App_Data/dev-outbox directory (required)
 *   TAFSEEL_SHOT_DIR        optional directory for screenshots
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const BASE = (process.env.TAFSEEL_BASE_URL ?? 'http://localhost:5312').replace(/\/$/, '');
const SEED = JSON.parse(readFileSync(required('TAFSEEL_E2E_SEED'), 'utf8'));
const REVIEWER_PASSWORD = required('TAFSEEL_E2E_PASSWORD');
const OUTBOX = required('TAFSEEL_DEV_OUTBOX');
const SHOTS = process.env.TAFSEEL_SHOT_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const TIME_ZONE = 'Asia/Riyadh';
const stamp = Date.now();
const teacherEmail = `wave3a-teacher-${stamp}@example.test`;
const teacherPassword = `Wave3a!Teach-${stamp}`;
const teacherName = `Wave3A Teacher ${stamp}`;
const headline = `Physics made visible ${stamp}`;
const bio = 'I explain mechanics with worked examples, sketches and short checks for understanding.';

const AUTH_LIMITED = /^\/api\/v1\/auth\/(register|login|refresh|confirm-email|forgot-password|reset-password|password)$/;
const authCalls = [];
const results = [];
async function step(name, run) {
  // One journey: once a step fails, the steps after it would only fail for the same reason.
  if (results.some(r => !r.ok)) { results.push({ name, ok: false, skipped: true }); console.log(`- ${name} (skipped)`); return; }
  const started = Date.now();
  try {
    await run();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`✓ ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error?.stack ?? error) });
    console.log(`✗ ${name}\n  ${String(error?.stack ?? error).split('\n').slice(0, 8).join('\n  ')}`);
    if (SHOTS && currentPage) await currentPage.screenshot({ path: join(SHOTS, `FAILED-${results.length}.png`), fullPage: true }).catch(() => {});
  }
}

await waitForHost();
const browser = await chromium.launch();
let currentPage = null;
let teacherId = '';
let applicationId = '';
let chemistryApplicationId = '';

// ---- the teacher arrives ------------------------------------------------------------------
const teacher = await context();

await step('J2 teacher registers in /auth, confirms from the outbox and signs in', async () => {
  const { page } = teacher;
  await visit(page, `${BASE}/en/auth`);
  await page.locator('.tf-auth-tabs button').nth(1).click();
  await page.getByRole('button', { name: /as Teacher/ }).click();
  await page.locator('#reg-fullname').fill(teacherName);
  await page.locator('#reg-email').fill(teacherEmail);
  await page.locator('#reg-password').fill(teacherPassword);
  await page.locator('#reg-confirm').fill(teacherPassword);
  await page.locator('.tf-check--start input[type=checkbox]').check();
  await authBudget(1);
  const registered = waitForCall(page, 'POST', /^\/api\/v1\/auth\/register$/);
  await page.locator('form button[type=submit]', { hasText: /create account/i }).click();
  assert.ok((await registered).ok(), 'register accepted');
  await page.waitForURL(url => pathOf(url) === '/en/auth/confirm-email', { timeout: 15000 });
  assert.equal(await page.locator('[data-testid=not-found]').count(), 0, 'registration lands on the confirm-email screen');
  await shot(page, '01-registered-confirm-email');

  const link = await outboxLink(teacherEmail, 'mode=confirm');
  await visit(page, link);
  await page.locator('[data-testid=auth-notice], .tf-auth-success, .tf-toast').first().waitFor({ state: 'visible', timeout: 15000 });

  await page.locator('#login-email').fill(teacherEmail);
  await page.locator('#login-password').fill(teacherPassword);
  await authBudget(1);
  await page.locator('form button[type=submit]').first().click();
  await page.waitForURL(url => pathOf(url) === '/en/teach/apply', { timeout: 20000 });
  const me = await api(page, 'GET', '/api/v1/auth/me');
  teacherId = me.body.id ?? me.body.userId;
  assert.match(String(teacherId), /^[0-9a-f-]{36}$/i);
});

await step('J11-02 teacher cannot sell anything before approval', async () => {
  const { page } = teacher;
  await spa(page, '/teacher/services');
  await page.locator('[data-testid=no-qualified-subject]').waitFor({ timeout: 15000 });
  const refused = await api(page, 'POST', '/api/v1/teachers/me/services', serviceBody(SEED.subjectId, SEED.explanation.Id, 100));
  assert.equal(refused.status, 400);
  assert.equal(refused.body.code, 'teacher_not_approved');
  await shot(page, '02-services-before-approval');
});

async function applyFor(page, subjectId, query = '') {
  await spa(page, `/teach/apply${query}`);
  const subject = page.locator('#apply-subject');
  await subject.waitFor({ timeout: 15000 });
  await subject.selectOption(subjectId);
  await page.waitForFunction(() => document.querySelectorAll('#apply-topic option').length > 0, null, { timeout: 15000 });
  await page.locator('#apply-city').fill('Riyadh');
  await page.locator('#apply-years').fill('6');
  const language = page.locator('.tf-lang-chip input[type=checkbox]').first();
  if (!(await language.isChecked())) await language.check();
  const saved = waitForCall(page, /POST|PUT/, /^\/api\/v1\/teacher-applications(\/[0-9a-f-]{36})?$/);
  await page.locator('form button[type=submit]').click();
  const response = await saved;
  assert.ok(response.ok(), `application saved ${response.status()}`);
  const demo = page.locator('input[type=file]');
  await demo.waitFor({ timeout: 15000 });
  await demo.setInputFiles(demoFile());
  const uploaded = waitForCall(page, 'POST', /^\/api\/v1\/teacher-applications\/[0-9a-f-]{36}\/demo$/);
  await page.getByRole('button', { name: 'Upload demo' }).click();
  const upload = await uploaded;
  assert.equal(upload.status(), 200, 'demo stored');
  const id = new URL(upload.url()).pathname.split('/')[4];
  const submitted = waitForCall(page, 'POST', /\/submit$/);
  await page.getByRole('button', { name: 'Submit for review' }).click();
  assert.equal((await submitted).status(), 204, 'submitted');
  await page.locator('.tf-apply-review').waitFor({ timeout: 15000 });
  return id;
}

await step('J11-01 teacher applies for a subject, uploads the demo and submits', async () => {
  const { page } = teacher;
  applicationId = await applyFor(page, SEED.subjectId);
  const status = await api(page, 'GET', '/api/v1/teachers/onboarding-status');
  assert.equal(status.body.applicationStatus, 1, 'Submitted');
  await shot(page, '03-application-submitted');
});

// ---- the reviewer ---------------------------------------------------------------------------
const reviewer = await context();

await step('J11-05 reviewer signs in, finds the application in the queue and opens it', async () => {
  const { page } = reviewer;
  await visit(page, `${BASE}/en/auth`);
  await page.locator('#login-email').fill(SEED.reviewer.Email);
  await page.locator('#login-password').fill(REVIEWER_PASSWORD);
  await authBudget(1);
  await page.locator('form button[type=submit]').first().click();
  await page.waitForURL(url => pathOf(url) === '/en/quality/applications', { timeout: 20000 });
  const row = page.locator(`[data-testid=queue-row][data-application-id="${applicationId}"]`);
  await row.waitFor({ timeout: 15000 });
  assert.match(await row.innerText(), new RegExp(teacherName));
  await shot(page, '04-queue');
  await row.getByRole('link', { name: 'Open review' }).click();
  await page.waitForURL(url => pathOf(url) === `/en/quality/applications/${applicationId}`, { timeout: 15000 });
  await page.locator('[data-testid=review-status][data-status="1"]').waitFor({ timeout: 15000 });
});

await step('J11-05 reviewer watches the demo through the authorized content endpoint', async () => {
  const { page } = reviewer;
  const content = waitForCall(page, 'GET', new RegExp(`^/api/v1/teacher-applications/${applicationId}/demo/content$`));
  await page.locator('[data-testid=watch-demo]').click();
  const response = await content;
  assert.equal(response.status(), 200);
  assert.equal((await response.body()).length, demoBytes().length, 'the uploaded bytes');
  const src = await page.locator('[data-testid=demo-player]').getAttribute('src');
  assert.match(src ?? '', /^blob:/, 'played from an object URL, not a storage path');
  const html = await page.content();
  assert.doesNotMatch(html, /App_Data|storageKey|\\uploads\\|\/uploads\//i, 'no storage path in the page');
  // The endpoint needs the reviewer's credentials: the same URL without them is refused.
  const anonymous = await fetch(`${BASE}/api/v1/teacher-applications/${applicationId}/demo/content`);
  assert.equal(anonymous.status, 401);
});

await step('J11-05 reviewer starts the review; the decision form validates before sending', async () => {
  const { page } = reviewer;
  await page.locator('#review-priority').selectOption({ label: 'High' });
  const started = waitForCall(page, 'POST', /\/start-review$/);
  await page.locator('[data-testid=start-review]').click();
  const request = (await started).request();
  assert.equal((await started).status(), 204);
  assert.ok(request.headers()['if-match'], 'start-review sends If-Match');
  assert.deepEqual(JSON.parse(request.postData()), { priority: 2 });
  await page.locator('[data-testid=decision-form]').waitFor({ timeout: 15000 });

  let decisionCalls = 0;
  const count = r => { if (/\/decision$/.test(new URL(r.url()).pathname)) decisionCalls++; };
  page.on('request', count);
  await page.locator('[data-testid=record-decision]').click();
  await page.locator('#decision-scores-error').waitFor();
  await page.locator('#decision-choice-error').waitFor();
  await page.locator('[data-testid=decision-1]').check();
  await page.locator('[data-testid=record-decision]').click();
  await page.getByText('Explain what the teacher should change').waitFor();
  assert.equal(decisionCalls, 0, 'nothing sent while the form is incomplete');
  page.off('request', count);
  await shot(page, '05-decision-validation');
});

await step('J11-05 reviewer requests changes; the teacher sees the feedback and resubmits', async () => {
  const { page } = reviewer;
  for (let criterion = 0; criterion < 9; criterion++) await page.locator(`[data-testid=score-${criterion}-3]`).click();
  await page.locator('#decision-comment').fill('Please add a second worked example with friction.');
  await page.locator('#decision-notes').fill('Audio fine; content thin.');
  const decided = waitForCall(page, 'POST', /\/decision$/);
  await page.locator('[data-testid=record-decision]').dblclick();
  await page.locator('.tf-system-dialog button', { hasText: 'Record decision' }).click();
  const response = await decided;
  assert.equal(response.status(), 204);
  const body = JSON.parse(response.request().postData());
  assert.equal(body.decision, 1);
  assert.equal(body.scores.length, 9);
  assert.ok(response.request().headers()['if-match']);
  await page.locator('[data-testid=review-status][data-status="3"]').waitFor({ timeout: 15000 });

  const { page: t } = teacher;
  await spa(t, '/teach/apply');
  await t.locator('[data-testid=reviewer-feedback]', { hasText: 'Please add a second worked example with friction.' }).waitFor({ timeout: 15000 });
  const current = await api(t, 'GET', '/api/v1/teacher-applications/mine');
  const application = current.body.find(a => a.id === applicationId);
  assert.equal(application.status, 3, 'ChangesRequested');
  const submitted = waitForCall(t, 'POST', /\/submit$/);
  await t.getByRole('button', { name: 'Submit for review' }).click();
  assert.equal((await submitted).status(), 204);
  await shot(t, '06-teacher-resubmitted');
});

await step('J11-05 reviewer approves; the teacher onboarding reflects the qualification', async () => {
  const { page } = reviewer;
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-testid=review-status][data-status="1"]').waitFor({ timeout: 15000 });
  await page.locator('[data-testid=start-review]').click();
  await page.locator('[data-testid=decision-form]').waitFor({ timeout: 15000 });
  for (let criterion = 0; criterion < 9; criterion++) await page.locator(`[data-testid=score-${criterion}-4]`).click();
  await page.locator('[data-testid=decision-0]').check();
  const decided = waitForCall(page, 'POST', /\/decision$/);
  await page.locator('[data-testid=record-decision]').click();
  await page.locator('.tf-system-dialog button', { hasText: 'Record decision' }).click();
  assert.equal((await decided).status(), 204);
  await page.locator('[data-testid=review-status][data-status="4"]').waitFor({ timeout: 15000 });
  const records = await page.locator('[data-testid=review-records] li').allInnerTexts();
  assert.ok(records.some(r => r.includes('Approve')) && records.some(r => r.includes('Request changes')), 'both decisions in the record');
  await shot(page, '07-approved');

  const status = await api(teacher.page, 'GET', '/api/v1/teachers/onboarding-status');
  assert.deepEqual(status.body.approvedSubjectIds, [SEED.subjectId]);
  assert.equal(status.body.status, 9, 'ApprovedButProfileIncomplete');
});

await step('J11-05 a second application is rejected and its subject stays unsellable', async () => {
  const { page: t } = teacher;
  chemistryApplicationId = await applyFor(t, SEED.unqualifiedSubjectId, `?mode=additional&subjectId=${SEED.unqualifiedSubjectId}`);
  const { page } = reviewer;
  await spa(page, `/quality/applications/${chemistryApplicationId}`);
  await page.locator('[data-testid=start-review]').click();
  await page.locator('[data-testid=decision-form]').waitFor({ timeout: 15000 });
  for (let criterion = 0; criterion < 9; criterion++) await page.locator(`[data-testid=score-${criterion}-1]`).click();
  await page.locator('[data-testid=decision-2]').check();
  await page.locator('#decision-comment').fill('The explanation contains a balancing error.');
  const decided = waitForCall(page, 'POST', /\/decision$/);
  await page.locator('[data-testid=record-decision]').click();
  await page.locator('.tf-system-dialog button', { hasText: 'Record decision' }).click();
  assert.equal((await decided).status(), 204);
  await page.locator('[data-testid=review-status][data-status="5"]').waitFor({ timeout: 15000 });
  await page.locator('[data-testid=review-closed]').waitFor();

  const refused = await api(t, 'POST', '/api/v1/teachers/me/services', serviceBody(SEED.unqualifiedSubjectId, SEED.explanation.Id, 100));
  assert.equal(refused.status, 400, 'a rejected subject cannot be sold');
  assert.equal(refused.body.code, 'teacher_not_approved');
});

await step('J11-09 readiness lists the server blockers and publish stays disabled', async () => {
  const { page } = teacher;
  await spa(page, '/teacher/publication');
  const blockers = page.locator('[data-testid=readiness-blockers] li');
  await blockers.first().waitFor({ timeout: 15000 });
  const codes = await blockers.evaluateAll(items => items.map(item => item.getAttribute('data-code')));
  assert.deepEqual(codes, ['profile_incomplete', 'active_service_required']);
  assert.ok(await page.locator('[data-testid=publish]').isDisabled());
  await shot(page, '08-readiness-blocked');
  await page.locator('[data-code=profile_incomplete] a').click();
  await page.waitForURL(url => pathOf(url) === '/en/teacher/profile', { timeout: 15000 });
});

await step('J11-06 teacher completes the profile: core fields, topics, certification', async () => {
  const { page } = teacher;
  await page.locator('[data-testid=profile-core]').waitFor({ timeout: 15000 });
  const put = [];
  page.on('request', r => { if (r.method() === 'PUT' && new URL(r.url()).pathname === '/api/v1/teachers/me') put.push(r); });
  await page.locator('[data-testid=save-profile]').click();
  await page.getByText('This field is required.').first().waitFor();
  assert.equal(put.length, 0, 'an empty profile is not sent');

  await page.locator('#profile-headline').fill(headline);
  await page.locator('#profile-bio').fill(bio);
  await page.locator('#profile-country').fill('Saudi Arabia');
  await page.locator('#profile-city').fill('Riyadh');
  await page.locator('#profile-zone').selectOption(TIME_ZONE);
  await page.locator('#profile-response').evaluate(s => { s.value = [...s.options].find(o => o.dataset.value === '60').value; s.dispatchEvent(new Event('change', { bubbles: true })); });
  const saved = waitForCall(page, 'PUT', /^\/api\/v1\/teachers\/me$/);
  await page.locator('[data-testid=save-profile]').click();
  const response = await saved;
  assert.equal(response.status(), 204);
  assert.deepEqual(JSON.parse(response.request().postData()), {
    headline, bio, country: 'Saudi Arabia', city: 'Riyadh', timeZoneId: TIME_ZONE, responseTimeMinutes: 60
  });
  await page.getByText('Your profile has everything publication needs.').waitFor({ timeout: 15000 });

  const topic = page.locator('#profile-topics-title').locator('xpath=ancestor::section').locator('input[type=checkbox]').first();
  await topic.check();
  const topics = waitForCall(page, 'PUT', /^\/api\/v1\/teachers\/me\/topics$/);
  await page.locator('#profile-topics-title').locator('xpath=ancestor::section').getByRole('button', { name: 'Save' }).click();
  assert.equal((await topics).status(), 204);

  const card = page.locator('[data-testid=certifications-card]');
  await card.locator('#certifications-title-input').fill('BSc Physics');
  await card.locator('#certifications-org-input').fill('King Saud University');
  const added = waitForCall(page, 'POST', /^\/api\/v1\/teachers\/me\/certifications$/);
  await card.getByRole('button', { name: 'Add' }).click();
  assert.equal((await added).status(), 201);
  await card.getByText('BSc Physics').waitFor({ timeout: 15000 });

  const profile = await api(page, 'GET', '/api/v1/teachers/me');
  assert.equal(profile.body.headline, headline);
  assert.equal(profile.body.topics.length, 1);
  assert.equal(profile.body.certifications[0].title, 'BSc Physics');
  await shot(page, '09-profile-saved');
});

await step('J11-07 teacher creates services at valid prices; only the approved subject is offered', async () => {
  const { page } = teacher;
  await spa(page, '/teacher/services');
  const explanation = page.locator(`[data-testid=service-type][data-code="${SEED.explanation.Code}"]`);
  await explanation.waitFor({ timeout: 15000 });
  await explanation.locator('[data-testid=add-offering]').click();
  await explanation.locator('#offer-subject option').first().waitFor({ state: 'attached', timeout: 15000 });
  const subjects = await explanation.locator('#offer-subject option').evaluateAll(options => options.map(o => o.value));
  assert.deepEqual(subjects, [SEED.subjectId], 'only the approved subject can be chosen');

  let creates = 0;
  const count = r => { if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/v1/teachers/me/services') creates++; };
  page.on('request', count);
  await explanation.locator('#offer-price').fill('5');
  await explanation.locator('[data-testid=save-offering]').click();
  await explanation.getByText(/Choose a price from/).waitFor();
  assert.equal(creates, 0, 'an out-of-range price is not sent');
  page.off('request', count);

  await explanation.locator('#offer-price').fill('150');
  await explanation.locator('#offer-delivery').evaluate((s, v) => { s.value = [...s.options].find(o => o.dataset.value === String(v)).value; s.dispatchEvent(new Event('change', { bubbles: true })); }, '24');
  await explanation.locator('#offer-revisions').evaluate((s, v) => { s.value = [...s.options].find(o => o.dataset.value === String(v)).value; s.dispatchEvent(new Event('change', { bubbles: true })); }, '2');
  await explanation.locator('#offer-approach-en').fill('Step-by-step worked solutions.');
  const created = waitForCall(page, 'POST', /^\/api\/v1\/teachers\/me\/services$/);
  await explanation.locator('[data-testid=save-offering]').click();
  assert.equal((await created).status(), 201);
  await explanation.locator('[data-testid=offering][data-active=true]').waitFor({ timeout: 15000 });
  await page.locator('tf-ui-state [data-state=success]').waitFor();

  const live = page.locator(`[data-testid=service-type][data-code="${SEED.live.Code}"]`);
  await live.locator('[data-testid=add-offering]').click();
  await live.locator('#offer-price').fill('120');
  const liveCreated = waitForCall(page, 'POST', /^\/api\/v1\/teachers\/me\/services$/);
  await live.locator('[data-testid=save-offering]').click();
  assert.equal((await liveCreated).status(), 201);
  await live.locator('[data-testid=offering][data-active=true]').waitFor({ timeout: 15000 });

  // Switching off and on again goes through the active endpoint with the offering's version.
  const toggleOff = waitForCall(page, 'PUT', /^\/api\/v1\/teachers\/me\/services\/[0-9a-f-]{36}\/active$/);
  await explanation.locator('[data-testid=offering-active]').uncheck();
  const off = await toggleOff;
  assert.equal(off.status(), 204);
  assert.ok(off.request().headers()['if-match']);
  await explanation.locator('[data-testid=offering][data-active=false]').waitFor({ timeout: 15000 });
  const toggleOn = waitForCall(page, 'PUT', /\/active$/);
  await explanation.locator('[data-testid=offering-active]').check();
  assert.equal((await toggleOn).status(), 204);
  await explanation.locator('[data-testid=offering][data-active=true]').waitFor({ timeout: 15000 });
  await shot(page, '10-services');
});

await step('J11-09 a live service without availability is reported as the only blocker', async () => {
  const { page } = teacher;
  await spa(page, '/teacher/publication');
  const blockers = page.locator('[data-testid=readiness-blockers] li');
  await blockers.first().waitFor({ timeout: 15000 });
  assert.deepEqual(await blockers.evaluateAll(items => items.map(i => i.getAttribute('data-code'))), ['availability_required']);
  assert.ok(await page.locator('[data-testid=publish]').isDisabled());
  await page.locator('[data-code=availability_required] a').click();
  await page.waitForURL(url => pathOf(url) === '/en/teacher/availability', { timeout: 15000 });
});

await step('J11-08 weekly windows: multiple days, invalid and overlapping ranges, update, delete', async () => {
  const { page } = teacher;
  await page.locator('[data-testid=zone-note]').waitFor({ timeout: 15000 });
  // UX-06: the note names the profile's zone the way a person reads it («Arabian Standard Time»), no longer
  // as its IANA id. Still this exact zone; the value sent to the server is still the id (asserted below).
  const note = await page.locator('[data-testid=zone-note]').innerText();
  // UX-75 then led with the city people look for («Riyadh (GMT+3)»), falling back to the zone's long name.
  const zoneName = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, timeZoneName: 'long' })
    .formatToParts(new Date()).find(part => part.type === 'timeZoneName').value;
  const city = TIME_ZONE.split('/').pop().replace(/_/g, ' ');
  assert.ok(note.includes(city) || note.includes(zoneName), `the note names ${TIME_ZONE} as "${city}" or "${zoneName}" (${note})`);
  assert.ok(!note.includes(TIME_ZONE), `the note no longer prints the IANA id (${note})`);

  await page.locator('[data-testid=add-rule]').click();
  await page.locator('[data-testid=day-0]').check();
  await page.locator('[data-testid=day-2]').check();
  await page.locator('#rule-start').fill('12:00');
  await page.locator('#rule-end').fill('09:00');
  await page.locator('[data-testid=save-rule]').click();
  await page.locator('[data-testid=rule-problems] [data-problem=end_before_start]').waitFor();

  await page.locator('#rule-start').fill('09:00');
  await page.locator('#rule-end').fill('12:00');
  const replaced = waitForCall(page, 'PUT', /^\/api\/v1\/teachers\/me\/availability\/rules$/);
  await page.locator('[data-testid=save-rule]').click();
  const put = await replaced;
  assert.equal(put.status(), 200);
  const sent = JSON.parse(put.request().postData()).rules;
  assert.deepEqual(sent.map(r => [r.dayOfWeek, r.start, r.end, r.timeZoneId, r.slotMinutes]),
    [[0, '09:00:00', '12:00:00', TIME_ZONE, 60], [2, '09:00:00', '12:00:00', TIME_ZONE, 60]], 'the zone and wall-clock times as entered');
  await page.locator('[data-testid=rule]').nth(1).waitFor({ timeout: 15000 });
  assert.equal(await page.locator('[data-testid=rule]').count(), 2);
  await page.locator('tf-ui-state [data-state=success]').waitFor();

  await page.locator('[data-testid=add-rule]').click();
  await page.locator('[data-testid=day-0]').check();
  await page.locator('#rule-start').fill('11:00');
  await page.locator('#rule-end').fill('13:00');
  await page.locator('[data-testid=save-rule]').click();
  await page.locator('[data-testid=rule-problems] [data-problem=overlap]').waitFor();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // The server is the authority on overlaps too.
  const overlapping = await api(page, 'PUT', '/api/v1/teachers/me/availability/rules', { rules: [
    { dayOfWeek: 1, start: '09:00:00', end: '11:00:00', timeZoneId: TIME_ZONE, slotMinutes: 60 },
    { dayOfWeek: 1, start: '10:00:00', end: '12:00:00', timeZoneId: TIME_ZONE, slotMinutes: 60 }
  ] });
  assert.equal(overlapping.status, 409, 'ApiExceptionHandler answers conflict codes with 409');
  assert.equal(overlapping.body.code, 'availability_conflict');

  const tuesday = page.locator('[data-testid=rule][data-day="2"]');
  await tuesday.getByRole('button', { name: 'Edit' }).click();
  await page.locator('#rule-start').fill('13:00');
  await page.locator('#rule-end').fill('15:00');
  const updated = waitForCall(page, 'PUT', /^\/api\/v1\/teachers\/me\/availability\/rules$/);
  await page.locator('[data-testid=save-rule]').click();
  assert.equal((await updated).status(), 200);
  await page.locator('[data-testid=rule][data-day="2"][data-start="13:00"][data-end="15:00"]').waitFor({ timeout: 15000 });
  assert.equal(await page.locator('[data-testid=rule]').count(), 2);

  const removed = waitForCall(page, 'DELETE', /^\/api\/v1\/teachers\/me\/availability\/rules\/[0-9a-f-]{36}$/);
  await page.locator('[data-testid=rule][data-day="2"] [data-testid=remove-rule]').click();
  await page.locator('.tf-system-dialog button', { hasText: 'Remove' }).click();
  assert.equal((await removed).status(), 204);
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=rule]').length === 1, null, { timeout: 15000 });
  await shot(page, '11-availability');
});

await step('J11-08 time off: add and remove an exception', async () => {
  const { page } = teacher;
  const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await page.locator('#exception-start').fill(`${day}T11:00`);
  await page.locator('#exception-end').fill(`${day}T10:00`);
  await page.locator('[data-testid=add-exception]').click();
  await page.locator('[data-testid=exception-problems] [data-problem=end_before_start]').waitFor();
  await page.locator('#exception-end').fill(`${day}T12:30`);
  await page.locator('#exception-reason').fill('Conference');
  const added = waitForCall(page, 'POST', /^\/api\/v1\/teachers\/me\/availability\/exceptions$/);
  await page.locator('[data-testid=add-exception]').click();
  const response = await added;
  assert.equal(response.status(), 201);
  const body = JSON.parse(response.request().postData());
  // The browser runs in Asia/Riyadh (UTC+3): 11:00 there is 08:00Z.
  assert.equal(body.startsAt, `${day}T08:00:00.000Z`);
  assert.equal(body.endsAt, `${day}T09:30:00.000Z`);
  await page.locator('[data-testid=exception]').waitFor({ timeout: 15000 });
  const removed = waitForCall(page, 'DELETE', /^\/api\/v1\/teachers\/me\/availability\/exceptions\/[0-9a-f-]{36}$/);
  await page.locator('[data-testid=remove-exception]').click();
  await page.locator('.tf-system-dialog button', { hasText: 'Remove' }).click();
  assert.equal((await removed).status(), 204);
  await page.waitForFunction(() => !document.querySelector('[data-testid=exception]'), null, { timeout: 15000 });
});

await step('J11-09 readiness turns green and the teacher publishes', async () => {
  const { page } = teacher;
  await spa(page, '/teacher/publication');
  await page.locator('[data-testid=publication-state][data-ready=true]').waitFor({ timeout: 15000 });
  assert.equal(await page.locator('[data-testid=readiness-blockers]').count(), 0);
  await shot(page, '12-readiness-ready');
  const published = waitForCall(page, 'PUT', /^\/api\/v1\/teachers\/me\/publication$/);
  await page.locator('[data-testid=publish]').click();
  const response = await published;
  assert.equal(response.status(), 204);
  assert.deepEqual(JSON.parse(response.request().postData()), { published: true });
  await page.locator('[data-testid=publication-state][data-published=true]').waitFor({ timeout: 15000 });
  await page.locator('[data-testid=view-public-profile]').waitFor();
  await shot(page, '13-published');
});

await step('Visitor finds the teacher in /teachers and the profile shows the new data', async () => {
  const visitor = await context();
  const { page } = visitor;
  await visit(page, `${BASE}/en/teachers`);
  const card = page.getByText(teacherName).first();
  await card.waitFor({ timeout: 20000 });
  await shot(page, '14-browse');
  await visit(page, `${BASE}/en/teachers/${teacherId}`);
  await page.getByText(headline).first().waitFor({ timeout: 20000 });
  const text = await page.evaluate(() => document.body.innerText);
  assert.match(text, new RegExp(teacherName));
  assert.match(text, new RegExp(bio.slice(0, 40)));
  assert.match(text, new RegExp(`E2E Worked explanation ${SEED.run}`));
  assert.match(text, new RegExp(`E2E Live lesson ${SEED.run}`));
  assert.match(text, /150/);
  assert.match(text, /BSc Physics/);
  assert.match(text, new RegExp(`Mechanics ${SEED.run}`));
  await shot(page, '15-public-profile');
  assert.deepEqual(page.problems, [], 'no script errors on the public pages');
  await visitor.ctx.close();
});

await step('PRODUCT-P1 second subject: changes requested, resubmitted, approved, sold and discoverable', async () => {
  const { page: t } = teacher;
  const secondId = await applyFor(t, SEED.secondSubjectId, `?mode=additional&subjectId=${SEED.secondSubjectId}`);
  const { page } = reviewer;
  // Changes requested on the added subject: the teacher's first subject keeps selling meanwhile.
  await spa(page, `/quality/applications/${secondId}`);
  await page.locator('[data-testid=start-review]').click();
  await page.locator('[data-testid=decision-form]').waitFor({ timeout: 15000 });
  for (let criterion = 0; criterion < 9; criterion++) await page.locator(`[data-testid=score-${criterion}-3]`).click();
  await page.locator('[data-testid=decision-1]').check();
  await page.locator('#decision-comment').fill('Label the phases on the diagram.');
  let decided = waitForCall(page, 'POST', /\/decision$/);
  await page.locator('[data-testid=record-decision]').click();
  await page.locator('.tf-system-dialog button', { hasText: 'Record decision' }).click();
  assert.equal((await decided).status(), 204);
  const physicsServices = (await api(t, 'GET', '/api/v1/teachers/me')).body.services.filter(x => x.subjectId === SEED.subjectId && x.isActive);
  assert.ok(physicsServices.length > 0, 'the first subject stays on sale while the second is in review');

  await spa(t, `/teach/apply?mode=additional&subjectId=${SEED.secondSubjectId}`);
  await t.locator('[data-testid=reviewer-feedback]', { hasText: 'Label the phases on the diagram.' }).waitFor({ timeout: 15000 });
  const resubmitted = waitForCall(t, 'POST', /\/submit$/);
  await t.getByRole('button', { name: 'Submit for review' }).click();
  assert.equal((await resubmitted).status(), 204);

  await spa(page, `/quality/applications/${secondId}`);
  await page.locator('[data-testid=review-status][data-status="1"]').waitFor({ timeout: 15000 });
  await page.locator('[data-testid=start-review]').click();
  await page.locator('[data-testid=decision-form]').waitFor({ timeout: 15000 });
  for (let criterion = 0; criterion < 9; criterion++) await page.locator(`[data-testid=score-${criterion}-4]`).click();
  await page.locator('[data-testid=decision-0]').check();
  decided = waitForCall(page, 'POST', /\/decision$/);
  await page.locator('[data-testid=record-decision]').click();
  await page.locator('.tf-system-dialog button', { hasText: 'Record decision' }).click();
  assert.equal((await decided).status(), 204);
  await page.locator('[data-testid=review-status][data-status="4"]').waitFor({ timeout: 15000 });
  // The reviewer now sees the qualification this approval granted, with the control to withdraw it later.
  await page.locator('[data-testid=review-qualification][data-active=true] [data-testid=revoke-open]').waitFor();
  await shot(page, '14a-second-subject-approved');

  const status = await api(t, 'GET', '/api/v1/teachers/onboarding-status');
  assert.deepEqual([...status.body.approvedSubjectIds].sort(), [SEED.subjectId, SEED.secondSubjectId].sort());
  const created = await api(t, 'POST', '/api/v1/teachers/me/services', serviceBody(SEED.secondSubjectId, SEED.explanation.Id, 120));
  assert.ok(created.status === 200 || created.status === 201, `second-subject service created (${created.status})`);

  const visitor = await context();
  await visit(visitor.page, `${BASE}/en/teachers?subjectId=${SEED.secondSubjectId}`);
  await visitor.page.getByText(teacherName).first().waitFor({ timeout: 20000 });
  await shot(visitor.page, '14b-second-subject-discoverable');
  await visitor.ctx.close();
});

await step('PRODUCT-P1 intro video: the application video is shown only after the teacher agrees', async () => {
  const { page } = teacher;
  const visitor = await context();
  const introPath = `/api/v1/teachers/${teacherId}/intro-video/content`;
  const profileIntro = async () => (await (await fetch(`${BASE}/api/v1/teachers/${teacherId}`)).json()).introVideo;
  // Approval kept the demo private: the published profile has no video at all.
  assert.equal(await profileIntro(), null, 'no intro video before the teacher chooses one');
  assert.equal((await fetch(`${BASE}${introPath}`)).status, 404);

  await spa(page, '/teacher/publication');
  const card = page.locator('[data-testid=public-video]');
  await card.waitFor({ timeout: 15000 });
  await card.locator('[data-testid=intro-application] input[type=radio]').first().check();
  const use = card.locator('[data-testid=intro-use-application]');
  assert.equal(await use.isDisabled(), true, 'showing it needs the consent tick');
  await card.locator('[data-testid=intro-consent]').check();
  const consented = waitForCall(page, 'POST', /^\/api\/v1\/teachers\/me\/intro-video\/from-application$/);
  await use.click();
  const response = await consented;
  assert.equal(response.status(), 200);
  assert.equal(JSON.parse(response.request().postData()).consent, true);
  await card.locator('[data-testid=intro-current][data-public=true]').waitFor();
  await shot(page, '15a-intro-application-shown');

  const shown = await profileIntro();
  assert.ok(shown?.contentUrl, 'the public profile carries the chosen intro');
  assert.equal((await fetch(`${BASE}${shown.contentUrl}`)).status, 200);
  await visit(visitor.page, `${BASE}/en/teachers/${teacherId}`);
  await visitor.page.locator('video').first().waitFor({ timeout: 20000 });
  assert.match(await visitor.page.evaluate(() => document.body.innerText), /Introduction video/);
  await shot(visitor.page, '15b-profile-with-intro');

  // Hiding withdraws the consent; the profile shows no video and nothing plays.
  await card.locator('[data-testid=intro-hide]').click();
  const hidden = waitForCall(page, 'PUT', /^\/api\/v1\/teachers\/me\/intro-video\/visibility$/);
  await page.locator('.tf-system-dialog[open] button[value=confirm]').click();
  assert.equal((await hidden).status(), 200);
  await card.locator('[data-testid=intro-current][data-public=false]').waitFor();
  assert.equal(await profileIntro(), null);
  assert.equal((await fetch(`${BASE}${introPath}`)).status, 404);
  await visitor.ctx.close();
});

await step('PRODUCT-P1 intro video: upload, preview, show, replace and remove the teacher’s own video', async () => {
  const { page } = teacher;
  const card = page.locator('[data-testid=public-video]');
  const uploaded = waitForCall(page, 'POST', /^\/api\/v1\/teachers\/me\/intro-video$/);
  await card.locator('[data-testid=intro-file]').setInputFiles(demoFile());
  assert.equal((await uploaded).status(), 200);
  // A new upload starts hidden until the teacher has watched it.
  await card.locator('[data-testid=intro-current][data-public=false]', { hasText: 'Your upload:' }).waitFor();
  const preview = waitForCall(page, 'GET', new RegExp(`^/api/v1/teachers/${teacherId}/intro-video/content$`));
  await card.locator('[data-testid=intro-watch]').click();
  assert.equal((await preview).status(), 200);
  await card.locator('[data-testid=intro-preview]').waitFor();

  const shown = waitForCall(page, 'PUT', /^\/api\/v1\/teachers\/me\/intro-video\/visibility$/);
  await card.locator('[data-testid=intro-show]').click();
  assert.equal((await shown).status(), 200);
  await card.locator('[data-testid=intro-current][data-public=true]').waitFor();
  assert.equal((await fetch(`${BASE}/api/v1/teachers/${teacherId}/intro-video/content`)).status, 200);

  const replaced = waitForCall(page, 'POST', /^\/api\/v1\/teachers\/me\/intro-video$/);
  await card.locator('[data-testid=intro-file]').setInputFiles(demoFile());
  const replaceResponse = await replaced;
  assert.equal(replaceResponse.status(), 200);
  assert.ok(replaceResponse.request().headers()['if-match'], 'replacing sends the version the teacher saw');
  await card.locator('[data-testid=intro-current][data-public=false]').waitFor();
  await shot(page, '15c-intro-own-upload');

  await card.locator('[data-testid=intro-remove]').click();
  const removed = waitForCall(page, 'DELETE', /^\/api\/v1\/teachers\/me\/intro-video$/);
  await page.locator('.tf-system-dialog[open] button[value=confirm]').click();
  assert.equal((await removed).status(), 200);
  await card.locator('[data-testid=intro-current]').waitFor({ state: 'detached' });
  assert.equal((await fetch(`${BASE}/api/v1/teachers/${teacherId}`).then(r => r.json())).introVideo, null);
});

await step('Arabic and phone width: the publication screen renders in RTL at 390px', async () => {
  const phone = await context({ viewport: { width: 390, height: 844 }, locale: 'ar-SA' });
  const { page } = phone;
  await visit(page, `${BASE}/ar/auth`);
  await page.locator('#login-email').fill(teacherEmail);
  await page.locator('#login-password').fill(teacherPassword);
  await authBudget(1);
  await page.locator('form button[type=submit]').first().click();
  await page.waitForURL(url => !/\/auth$/.test(pathOf(url)), { timeout: 20000 });
  await spa(page, '/teacher/publication');
  await page.locator('[data-testid=publication-state]').waitFor({ timeout: 15000 });
  assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal scroll');
  assert.match(await page.locator('[data-testid=publication-state] h2').innerText(), /ملفك منشور/);
  const intro = page.locator('[data-testid=public-video]');
  await intro.waitFor();
  assert.match(await intro.innerText(), /فيديو تعريفي/);
  assert.doesNotMatch(await intro.innerText(), /[A-Za-z]{4,} [A-Za-z]{4,}/, 'no English sentences in the Arabic intro card');
  await shot(page, '16-publication-ar-phone');
  await phone.ctx.close();
});

for (const { page } of [teacher, reviewer]) assert.deepEqual(page.problems, [], 'no script errors');
await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} Wave 3A supply journeys passed`);
if (failed.length) process.exit(1);

// ---- helpers ------------------------------------------------------------------------------
async function context(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US', timezoneId: TIME_ZONE, ...options });
  ctx.on('request', request => {
    if (request.method() === 'POST' && AUTH_LIMITED.test(new URL(request.url()).pathname)) authCalls.push(Date.now());
  });
  const page = await ctx.newPage();
  page.problems = [];
  page.on('pageerror', error => page.problems.push(String(error)));
  page.on('dialog', dialog => dialog.dismiss());
  currentPage = page;
  return { ctx, page };
}

/** Navigates inside the running client, so the session is not re-read from a full page load. */
async function spa(page, path) {
  currentPage = page;
  const locale = pathOf(page.url()).startsWith('/ar') ? 'ar' : 'en';
  // The router ignores a navigation to the address it is already on; reload to read fresh data.
  const current = new URL(page.url()), target = new URL(`${BASE}/${locale}${path}`);
  // A screen reads its query when it opens; a query change on the same screen needs a real load.
  if (pathOf(current) === pathOf(target) && current.search !== target.search) {
    await visit(page, target.href);
    return;
  }
  const same = pathOf(current) === pathOf(target);
  if (same) await authBudget(2);
  await page.evaluate(target => {
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  }, `/${locale}${path}`);
  await page.waitForURL(url => pathOf(url) === pathOf(`${BASE}/${locale}${path}`), { timeout: 15000 });
  if (same) await page.reload({ waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');
}

/** A same-origin API call with the page's session (the client keeps the access token in memory). */
async function api(page, method, path, body) {
  return page.evaluate(async ({ method, path, body }) => {
    const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    const token = refresh.ok ? (await refresh.json()).accessToken : '';
    const response = await fetch(path, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    return { status: response.status, body: parsed };
  }, { method, path, body }).then(async result => { authCalls.push(Date.now()); await authBudget(0); return result; });
}

function serviceBody(subjectId, catalogId, price) {
  return { subjectId, serviceCatalogItemId: catalogId, price, currency: 'SAR', deliveryHours: 24, revisions: 1, approachEn: '', approachAr: '', isAvailable: true };
}

function demoBytes() {
  return Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32]);
}

function demoFile() {
  const path = join(tmpdir(), `wave3a-demo-${stamp}.mp4`);
  writeFileSync(path, demoBytes());
  return path;
}

function waitForCall(page, method, pattern) {
  return page.waitForResponse(r =>
    (method instanceof RegExp ? method.test(r.request().method()) : r.request().method() === method)
    && pattern.test(new URL(r.url()).pathname), { timeout: 20000 });
}

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

async function authBudget(needed) {
  for (;;) {
    const now = Date.now();
    while (authCalls.length && now - authCalls[0] > 61000) authCalls.shift();
    if (authCalls.length + needed <= 8) return;
    await new Promise(r => setTimeout(r, 61000 - (now - authCalls[0]) + 250));
  }
}

async function visit(page, url) {
  currentPage = page;
  await authBudget(2);
  return page.goto(url, { waitUntil: 'networkidle' });
}

async function waitForHost() {
  for (let attempt = 0; attempt < 240; attempt++) {
    try { if ((await fetch(`${BASE}/health/live`)).ok) return; } catch { /* not listening yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`${BASE} did not become ready`);
}

function pathOf(url) {
  const path = new URL(String(url)).pathname;
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

async function outboxLink(address, marker) {
  const safe = address.replace(/[^A-Za-z0-9@._-]/g, '_');
  for (let attempt = 0; attempt < 60; attempt++) {
    const files = existsSync(OUTBOX)
      ? readdirSync(OUTBOX).filter(f => f.endsWith(`-${safe}.html`)).map(f => join(OUTBOX, f)).sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs)
      : [];
    for (const file of files.reverse()) {
      const href = [...readFileSync(file, 'utf8').matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&')).find(h => h.includes(marker));
      if (href) return href;
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`No ${marker} email for ${address} in ${OUTBOX}`);
}
