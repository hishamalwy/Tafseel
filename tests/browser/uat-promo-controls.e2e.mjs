/* Visitor UAT: a seeded campaign dialog is dismissible, and the landing controls work afterward. */
import assert from 'node:assert/strict';
import { BASE, context, finish, start, step, visit } from './wave3b-harness.mjs';

await start();
await step('visitor dismisses the campaign and uses the landing controls', async () => {
  const actor = await context();
  const page = actor.page;
  await visit(page, `${BASE}/en/`);
  const close = page.locator('.tf-promo-wizard-close');
  await close.waitFor({ timeout: 5000 });
  await close.click();
  await close.waitFor({ state: 'hidden' });

  assert.equal(await page.locator('.tf-hero-motion').count(), 0, 'the headline has no motion control');

  for (const index of [1, 2, 3]) {
    await page.locator(`[data-story-index="${index}"] button`).click();
    // The canvas follows on the next render, not synchronously with the click.
    await page.waitForFunction(state => document.querySelector('.tf-story-canvas')?.getAttribute('data-story-state') === state,
      String(index + 1), { timeout: 5000 });
  }
  assert.equal(await page.locator('[data-promo-wizard]').count(), 0);
  await actor.ctx.close();
});
await finish('UAT landing campaign controls');
