import assert from 'node:assert/strict';
import { BASE, SEED, context, finish, noHorizontalOverflow, shot, signIn, start, step, visit } from './wave3b-harness.mjs';

await start();
const teacher = await context({ viewport: { width: 390, height: 844 }, locale: 'ar-SA' });
await step('qualified teacher can start another subject application from Services', async () => {
  await signIn(teacher, SEED.teacherA.Email);
  const { page } = teacher;
  await visit(page, `${BASE}/ar/teacher/services`);
  await page.locator('[data-testid="account-menu-toggle"]').click();
  const signOut = page.locator('[data-testid="account-sign-out"]');
  await signOut.waitFor();
  assert.match(await signOut.innerText(), /تسجيل الخروج/);
  await page.locator('[data-testid="account-menu-toggle"]').click();
  const action = page.locator('[data-testid="apply-another-subject"]');
  await action.waitFor();
  await action.click();
  await page.waitForURL(url => /^\/ar\/teach\/apply\/?$/.test(url.pathname) && url.searchParams.get('mode') === 'additional');
  const subject = page.locator('#apply-subject');
  await subject.waitFor();
  const enabled = await subject.locator('option:not([disabled])').count();
  assert.ok(enabled > 0, 'at least one other subject accepts applications');
  await noHorizontalOverflow(page, 'additional subject application');
  await shot(page, 'teacher-additional-subject-ar-phone');
});
await teacher.ctx.close();
await finish('teacher additional subject');
