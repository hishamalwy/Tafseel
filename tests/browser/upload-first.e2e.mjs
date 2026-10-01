/* Upload first (Product Contract §7a): from the landing page, the first thing a student does is upload their file.
 *
 *   1. English, desktop, signed out: "Upload your file" → sign in → straight back to the uploader. An infected file
 *      is refused and never attached; a clean one is scanned and attached.
 *   2. A later validation error, and a full refresh, keep the clean file attached and what was typed.
 *   3. The request is published and carries the original file.
 *   4. Arabic desktop and Arabic phone: the same path, in Arabic, with nothing wider than the screen.
 */
import assert from 'node:assert/strict';
import {
  BASE, SEED, api, context, finish, noHorizontalOverflow, pathOf, pdf, registerStudent, shot, start, step, visit,
  waitForCall
} from './wave3b-harness.mjs';

const stamp = Date.now();
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-SA' };
const inDays = days => {
  const at = new Date(Date.now() + days * 86_400_000);
  at.setUTCSeconds(0, 0);
  return at.toISOString().slice(0, 16);
};

await start();

const named = (name, buffer) => ({ name, mimeType: 'application/pdf', buffer });

/** Chooses files in the uploader that is on screen and waits until the server has answered the first one. */
async function choose(page, files) {
  const picker = page.locator('[data-testid=upload-first-step] input[type=file], [data-testid=open-request-files] input[type=file]').first();
  const answered = page.waitForResponse(r => r.request().method() === 'POST'
    && pathOf(r.url()) === '/api/v1/open-marketplace/drafts/current/attachments', { timeout: 30000 });
  await picker.setInputFiles(files);
  return answered;
}

async function fillDetails(page, { title, requirements, deadline }) {
  await page.locator('#open-subject').selectOption(String(SEED.subjectId));
  await page.locator('#open-service').selectOption(String(SEED.recordedCatalogId));
  await page.locator('#open-title').fill(title);
  await page.locator('#open-requirements').fill(requirements);
  await page.locator('#open-deadline').fill(deadline);
}

async function publishAndCheck(actor, fileName) {
  const { page } = actor;
  const published = waitForCall(page, 'POST', /^\/api\/v1\/open-marketplace\/requests$/);
  await page.locator('[data-testid=publish-open-request]').click();
  const response = await published;
  assert.equal(response.status(), 201, 'published');
  const created = await response.json();
  assert.deepEqual(created.attachments.map(a => a.originalName), [fileName], 'the request carries the original file');
  await page.waitForURL(url => pathOf(url).endsWith(`/requests/${created.id}`), { timeout: 20000 });
  await page.locator('.tf-file-list li', { hasText: fileName }).waitFor({ timeout: 20000 });
  return created.id;
}

let english;
await step('1. signed out, "Upload your file" leads through sign-in straight back to the uploader; only a clean file is attached', async () => {
  english = await context();
  const { page } = english;
  await visit(page, `${BASE}/en/`);
  await page.locator('[data-testid=landing-upload]').click();
  await page.waitForURL(url => pathOf(url) === '/en/auth', { timeout: 15000 });
  await page.locator('#login-email').fill(SEED.outsider.Email);
  await page.locator('#login-password').fill(process.env.TAFSEEL_E2E_PASSWORD);
  await page.locator('form button[type=submit]').first().click();
  await page.waitForURL(url => pathOf(url) === '/en/requests/new/open' && new URL(String(url)).search.includes('start=upload'), { timeout: 20000 });
  await page.locator('[data-testid=upload-first-step]').waitFor({ timeout: 15000 });
  assert.equal(await page.locator('#open-title').count(), 0, 'nothing but the uploader is asked first');
  assert.equal(await page.locator('[data-testid=upload-continue]').isDisabled(), true, 'nothing to continue with yet');

  const infected = await choose(page, [named('homework.pdf', Buffer.concat([pdf('infected'), Buffer.from(EICAR)]))]);
  assert.equal(infected.status(), 400, 'the infected file is refused');
  await page.locator('.tf-upload-file-error').waitFor({ timeout: 10000 });
  assert.equal(await page.locator('[data-testid=draft-file]').count(), 0, 'the unsafe file is not attached');
  assert.equal(await page.locator('[data-testid=upload-continue]').isDisabled(), true, 'the request cannot continue with it');

  const clean = await choose(page, [named('chapter-4.pdf', pdf('chapter four'))]);
  assert.equal(clean.status(), 200, 'the clean file is accepted after scanning');
  await page.locator('[data-testid=draft-file]', { hasText: 'chapter-4.pdf' }).waitFor({ timeout: 15000 });
  await shot(page, 'upload-first-en-file');
});

await step('2. a later validation error and a refresh keep the clean file and what was typed', async () => {
  const { page } = english;
  await page.locator('[data-testid=upload-continue]').click();
  await page.locator('[data-testid=open-request-form]').waitFor({ timeout: 10000 });
  await fillDetails(page, { title: `Explain chapter four ${stamp}`, requirements: 'Explain every exercise in the attached chapter.', deadline: inDays(-1) });
  await page.locator('[data-testid=publish-open-request]').click();
  await page.locator('#open-deadline-error').waitFor({ timeout: 10000 });
  assert.equal(await page.locator('[data-testid=draft-file]').count(), 1, 'the file stays attached after the error');

  await page.waitForTimeout(1200); // the draft saves what was typed after a short pause
  await visit(page, `${BASE}/en/requests/new/open?start=upload`);
  await page.locator('[data-testid=draft-file]', { hasText: 'chapter-4.pdf' }).waitFor({ timeout: 15000 });
  await page.locator('[data-testid=upload-continue]').click();
  assert.equal(await page.locator('#open-title').inputValue(), `Explain chapter four ${stamp}`, 'the title survived the refresh');
});

await step('3. published, the request carries the original file', async () => {
  const { page } = english;
  await page.locator('#open-deadline').fill(inDays(3));
  await publishAndCheck(english, 'chapter-4.pdf');
  const draft = await api(SEED.outsider.Email, 'GET', '/api/v1/open-marketplace/drafts/current');
  assert.equal(draft.status, 204, 'the draft is gone once published');
  assert.deepEqual(english.page.problems, [], 'no script errors');
  await english.ctx.close();
});

for (const [label, options] of [['Arabic desktop', { locale: 'ar-SA' }], ['Arabic phone', phone]]) {
  await step(`4. ${label}: upload first, then details, then publish`, async () => {
    const actor = await context(options);
    const { page } = actor;
    const email = `upload-first-${label.replace(/\W/g, '-')}-${stamp}@example.test`;
    await registerStudent(actor, `طالبة الرفع ${stamp}`, email, `Upload!First-${stamp}`);
    await visit(page, `${BASE}/ar/`);
    await page.locator('[data-testid=landing-upload]').click();
    await page.locator('[data-testid=upload-first-step]').waitFor({ timeout: 15000 });
    assert.match(await page.locator('#open-upload-title').innerText(), /[؀-ۿ]/, 'the uploader speaks Arabic');
    const answered = await choose(page, [named('الفصل-الرابع.pdf', pdf('arabic chapter'))]);
    assert.equal(answered.status(), 200);
    await page.locator('[data-testid=draft-file]').first().waitFor({ timeout: 15000 });
    if (options === phone) await noHorizontalOverflow(page, 'upload-first Arabic phone');
    await shot(page, `upload-first-${label.replace(/\W/g, '-').toLowerCase()}`);
    await page.locator('[data-testid=upload-continue]').click();
    await fillDetails(page, { title: `اشرح الفصل الرابع ${stamp}`, requirements: 'اشرح كل تمرين في الفصل المرفق خطوة بخطوة.', deadline: inDays(4) });
    if (options === phone) await noHorizontalOverflow(page, 'open request form Arabic phone');
    await publishAndCheck(actor, 'الفصل-الرابع.pdf');
    assert.deepEqual(page.problems, [], 'no script errors');
    await actor.ctx.close();
  });
}

await finish('upload-first open request');
