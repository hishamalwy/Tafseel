/* OPP-01: RTL segmentation, reduced motion, theme surfaces, empty states, local previews.
 * Uses the existing disposable published-build workflow and fulfilment seed.
 */
import assert from 'node:assert/strict';
import { BASE, SEED, context, finish, noHorizontalOverflow, shot, signIn, spa, start, step, visit } from './wave3b-harness.mjs';

await start();
const visitor = await context({ viewport: { width: 390, height: 844 }, locale: 'ar-SA' });
const { page } = visitor;

async function aligned(tab = page) {
  await tab.waitForFunction(() => {
    const selected = document.querySelector('.tf-segmented [aria-pressed="true"]');
    const marker = document.querySelector('.tf-segment-indicator');
    if (!selected || !marker) return false;
    const a = selected.getBoundingClientRect(), b = marker.getBoundingClientRect();
    return Math.abs(a.x - b.x) < 1 && Math.abs(a.width - b.width) < 1;
  });
}

await step('Arabic phone: segmentation follows pointer selection, and keyboard state replacement is immediate', async () => {
  await visit(page, `${BASE}/ar/auth`);
  await page.locator('.tf-segment-indicator').waitFor();
  await page.locator('.tf-auth-tabs button').nth(1).click();
  await page.locator('#reg-fullname').waitFor();
  await aligned();
  await noHorizontalOverflow(page, 'Arabic registration');
  await page.locator('.tf-auth-tabs button').nth(0).press('Enter');
  assert.equal(await page.locator('html').getAttribute('data-motion-input'), 'keyboard');
  assert.equal(await page.locator('.tf-segment-indicator').evaluate(node => getComputedStyle(node).transitionDuration), '0s');
  await aligned();
});

await step('Reduced motion suppresses all new recipes; profile navigation still works', async () => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.tf-auth-tabs button').nth(1).click();
  assert.equal(await page.locator('.tf-segment-indicator').evaluate(node => getComputedStyle(node).transitionDuration), '0s');
  await spa(visitor, '/teachers');
  const link = page.locator(`.tf-mkb-name[href*="${SEED.teacherA.Id}"]`).first();
  await link.waitFor(); await link.click();
  await page.locator('.tf-mk-av--l').waitFor();
  assert.equal(await page.locator('.tf-mk-av--l').evaluate(node => getComputedStyle(node).viewTransitionName), 'none');
  await noHorizontalOverflow(page, 'reduced motion teacher profile');
});

await step('Empty work and overlay surfaces read in both themes; reduced-motion exits remove the menu', async () => {
  await signIn(visitor, SEED.outsider.Email);
  await spa(visitor, '/student/requests');
  await page.locator('[data-testid=work-empty]').waitFor();
  await page.locator('[data-chip=action]').click();
  await page.locator('[data-testid=work-empty] [data-variant=caught-up]').waitFor();
  for (const theme of ['light', 'dark']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('tf-theme-toggle button').first().click();
    await noHorizontalOverflow(page, `${theme} empty work`);
    await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running'));
    await shot(page, `craft-${theme}-ar-phone`);
    await page.locator('[data-testid=account-menu-toggle]').click();
    await page.locator('[data-testid=account-menu]').waitFor();
    assert.equal(await page.locator('[data-testid=account-menu]').evaluate(node => getComputedStyle(node).animationName), 'none');
    await page.locator('[data-testid=account-menu-toggle]').click();
    await page.locator('[data-testid=account-menu]').waitFor({ state: 'detached' });
  }
});

await step('Chosen images preview locally and disappear when removed; a desktop English pass keeps the indicator aligned', async () => {
  await spa(visitor, `/sessions/book?teacherId=${SEED.teacherA.Id}`);
  await page.locator('tf-file-picker input[type=file]').setInputFiles({ name: 'preview.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPa0AAAAASUVORK5CYII=', 'base64') });
  await page.locator('.tf-upload-file-preview').waitFor();
  assert.match(await page.locator('.tf-upload-file-preview').getAttribute('src'), /^blob:/);
  await page.locator('.tf-upload-file-remove').click();
  await page.locator('.tf-upload-file-preview').waitFor({ state: 'detached' });
  const desktop = await context();
  await visit(desktop.page, `${BASE}/en/auth`);
  await desktop.page.locator('.tf-auth-tabs button').nth(1).click();
  await desktop.page.locator('#reg-fullname').waitFor();
  await aligned(desktop.page);
  await noHorizontalOverflow(desktop.page, 'English registration');
  await shot(desktop.page, 'craft-en-desktop');
});
await finish('OPP-01 craft');
