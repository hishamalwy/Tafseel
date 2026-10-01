/* Browse filters and primary-service action on a fresh fulfilment seed, Arabic phone. */
import assert from 'node:assert/strict';
import { BASE, SEED, context, finish, noHorizontalOverflow, shot, start, step, visit, waitForCall } from './wave3b-harness.mjs';

await start();
const visitor = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-SA' });

await step('catalog labels, sort, and search use the server filters', async () => {
  const page = visitor.page;
  await visit(page, `${BASE}/ar/teachers`);
  await page.locator('.tf-mkb-card').first().waitFor();
  await page.locator('.tf-mkb-mobile .tf-mkb-sheet-btn').click();
  await page.waitForFunction(() => document.querySelector('#browse-filter-sheet select')?.querySelectorAll('option').length > 1);
  assert.ok((await page.locator('#browse-filter-sheet select').first().locator('option').nth(1).innerText()).trim());
  const sorted = waitForCall(page, 'GET', /^\/api\/v1\/teachers$/);
  await page.locator('.tf-mkb-mobile .tf-mk-select').selectOption('rating');
  const response = await sorted;
  assert.equal(new URL(response.url()).searchParams.get('sort'), 'highest-rated');
  assert.equal(response.status(), 200);

  await page.locator('#f-q').fill('Calculus Teacher A');
  const searched = waitForCall(page, 'GET', /^\/api\/v1\/teachers$/);
  await page.locator('.tf-smart-search__submit').click();
  const result = await searched;
  assert.equal(new URL(result.url()).searchParams.get('search'), 'Calculus Teacher A');
  assert.equal(result.status(), 200);
  await page.locator('.tf-mkb-card').first().waitFor();
  assert.equal(await page.locator('.tf-mkb-card').count(), 1);
  const action = page.locator('.tf-mkb-card .tf-mkb-profile-link');
  assert.match(await action.getAttribute('href') ?? '', new RegExp(`teacherId=${SEED.teacherA.Id}`));
  assert.match(await action.getAttribute('href') ?? '', /teacherServiceId=[0-9a-f-]{36}/);
  assert.equal(await action.isVisible(), true);
  await noHorizontalOverflow(page);
  await shot(page, 'browse-filters-ar-phone');
});

await step('profile service cards align and use distinct service colors', async () => {
  const page = visitor.page;
  await visit(page, `${BASE}/ar/teachers/${SEED.teacherA.Id}`);
  const cards = page.locator('.tf-mkp-svc');
  await cards.first().waitFor();
  assert.equal(await cards.count(), 2);
  const facts = await cards.locator('.tf-mkp-svc-facts').all();
  const first = await facts[0].boundingBox();
  const second = await facts[1].boundingBox();
  // At phone width the cards stack; at desktop they share a row. The visual snapshot covers phone.
  assert.ok(first && second);
  const colors = await cards.evaluateAll(elements => elements.map(card =>
    getComputedStyle(card.querySelector('.tf-mkp-svc-kind')).color));
  assert.notEqual(colors[0], colors[1]);
  await noHorizontalOverflow(page);
  await shot(page, 'teacher-profile-services-ar-phone');
  await page.locator('.tf-mkp-svc.is-live button[aria-pressed]').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'teacher-profile-live-action-ar-phone');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'teacher-profile-live-action-ar-desktop');
});

await finish('Browse filters and request CTA');
