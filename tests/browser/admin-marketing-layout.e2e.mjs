import assert from 'node:assert/strict';
import { BASE, SEED, api, context, finish, noHorizontalOverflow, shot, signIn, start, step, visit } from './wave3b-harness.mjs';

await start();
const admin = await context();
let promotedCode = '';
await step('admin creates a checkout code and publishes a matching landing promotion', async () => {
  await signIn(admin, SEED.admin.Email);
  const { page } = admin;
  await visit(page, `${BASE}/en/admin/marketing/coupons`);
  const code = `E2E${Date.now().toString().slice(-7)}`;
  promotedCode = code;
  await page.locator('.tf-marketing__form input').nth(0).fill('Browser campaign');
  await page.locator('.tf-marketing__form input').nth(1).fill(code);
  await page.locator('.tf-marketing__form button[type=submit]').click();
  await page.locator('[data-testid="admin-coupon"]').filter({ hasText: code }).waitFor();
  await visit(page, `${BASE}/en/admin/marketing/promotions`);
  await page.locator('.tf-marketing__form select').first().selectOption('0');
  await page.locator('.tf-marketing__form input').nth(0).fill('خصم على الشرح');
  await page.locator('.tf-marketing__form input').nth(1).fill('A better way to learn');
  await page.locator('.tf-marketing__form select').nth(1).selectOption(code);
  await page.locator('.tf-marketing__form button[type=submit]').click();
  await page.locator('[data-testid="admin-promotion"]').filter({ hasText: code }).waitFor();
  const live = await fetch(`${BASE}/api/v1/promotions`).then(response => response.json());
  assert.ok(live.some(item => item.couponCode === code));
  await shot(page, 'admin-marketing-promotion');
});

await step('visitor sees the usable code and the light About page', async () => {
  const visitor = await context({ locale: 'ar-SA' });
  await visit(visitor.page, `${BASE}/ar/`);
  await visitor.page.locator('[data-promo-wizard]').getByText(promotedCode).waitFor();
  await visit(visitor.page, `${BASE}/ar/about`);
  assert.notEqual(await visitor.page.locator('html').getAttribute('data-theme'), 'dark');
  await shot(visitor.page, 'about-light-ar');
  await visitor.ctx.close();
});

await step('catalog subject dropdown is separate from pill filters and fits Arabic phone', async () => {
  const { page } = admin;
  await visit(page, `${BASE}/ar/admin/marketplace?tab=qualification-topics`);
  await page.setViewportSize({ width: 390, height: 844 });
  const control = page.locator('.tf-catalog-subject-filter select');
  await control.waitFor();
  assert.equal(await control.evaluate(element => getComputedStyle(element).appearance), 'none');
  assert.equal(await page.locator('.tf-admin-filter select').count(), 0);
  const bounds = await control.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390);
  const table = await page.locator('.tf-admin-qualification-table').evaluate(element => ({
    width: element.getBoundingClientRect().width,
    firstCellWidth: element.querySelector('tbody tr td')?.getBoundingClientRect().width ?? 0,
    viewportWidth: element.parentElement.getBoundingClientRect().width
  }));
  assert.ok(table.width > table.viewportWidth && table.firstCellWidth >= 200,
    'the qualification list scrolls horizontally with a readable assignment column');
  await noHorizontalOverflow(page, 'admin qualification catalog');
  await shot(page, 'admin-catalog-filter-ar-phone');
});

await step('request status tags start at the same card position', async () => {
  const { page } = admin;
  for (const title of ['Short request', 'Explain the full quadratic worksheet with detailed worked examples']) {
    const created = await api(SEED.outsider.Email, 'POST', '/api/v1/learning-requests', {
      teacherId: SEED.teacherA.Id, teacherServiceId: SEED.teacherA.explanationServiceId,
      title, description: 'Please explain every step.',
      preferredDeliveryAt: new Date(Date.now() + 5 * 86_400_000).toISOString(), budget: null
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await visit(page, `${BASE}/en/admin/operations?tab=requests`);
  const badges = page.locator('.tf-dashboard-card-status');
  await badges.first().waitFor();
  assert.ok(await badges.count() >= 2);
  // Admin lists render as rows (one record per row), so the tag's place is measured inside its own card.
  const positions = await badges.evaluateAll(nodes => nodes.map(node => {
    const card = node.closest('.tf-dashboard-card').getBoundingClientRect(), tag = node.getBoundingClientRect();
    return `${Math.round(tag.top - card.top)},${Math.round(tag.left - card.left)}`;
  }));
  assert.equal(positions[0], positions[1]);
  await shot(page, 'admin-request-cards');
});

await admin.ctx.close();
await finish('admin marketing and layout');
