/* Impeccable's loaded-page responsive pass: seeded roles, Arabic, narrow and wide viewports.
 * The functional journeys create detail states separately; this checks the main workspace surfaces.
 */
import assert from 'node:assert/strict';
import { BASE, SEED, context, finish, sendDirectRequest, shot, signIn, start, step, visit } from './wave3b-harness.mjs';

const roles = [
  ['guest', null, ['/', '/about', '/policies/terms', '/policies/privacy', '/auth', '/auth/confirm-email']],
  ['student', SEED.outsider.Email, ['/student/overview', '/student/requests', '/student/saved', '/requests/new',
    '/requests/new/open', '/messages', '/account', '/teachers', `/teachers/${SEED.teacherA.Id}`]],
  ['teacher', SEED.teacherA.Email, ['/teacher/home', '/teacher/work', '/teacher/profile',
    '/teacher/services', '/teacher/availability', '/teacher/publication', '/teacher/earnings',
    '/teach/apply', '/messages']],
  ['reviewer', SEED.reviewer.Email, ['/quality/applications', '/quality/review', '/account']],
  ['admin', SEED.admin.Email, ['/admin/home', '/admin/people', '/admin/marketplace',
    '/admin/operations', '/admin/help', '/finance/home', '/admin/system', '/account', '/disputes']],
  ['finance', SEED.finance.Email, ['/finance/home', '/finance/payments', '/finance/withdrawals',
    '/finance/payout-profiles', '/finance/reconciliation', '/finance/audit', '/account']]
];

await start();
for (const [role, email, routes] of roles) {
  const actor = await context({ viewport: { width: 320, height: 900 }, locale: 'ar-SA' });
  await step(`${role}: seeded Arabic workspace fits 320px and 1440px`, async () => {
    if (email) await signIn(actor, email);
    if (role === 'student') await sendDirectRequest(actor, SEED.teacherA, 'Responsive audit request');
    for (const width of [320, 1440]) {
      await actor.page.setViewportSize({ width, height: 900 });
      for (const route of routes) {
        actor.page.problems.length = 0;
        await visit(actor.page, `${BASE}/ar${route}`);
        await actor.page.locator('main').first().waitFor({ timeout: 15000 });
        await actor.page.waitForTimeout(250);
        const state = await actor.page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth + 2,
          brokenImages: [...document.images].filter(img => img.complete && img.naturalWidth === 0).length,
          heading: !!document.querySelector('h1'),
          sidebar: (() => {
            const aside = document.querySelector('.tf-dashboard-sidebar');
            if (!aside) return null;
            const rect = aside.getBoundingClientRect();
            return { left: rect.left, right: rect.right };
          })()
        }));
        assert.equal(state.overflow, false, `${role} ${route} at ${width}px has horizontal overflow`);
        if (width === 320 && state.sidebar) {
          assert.ok(state.sidebar.right <= 0 || state.sidebar.left >= width,
            `${role} ${route}: closed sidebar overlaps the ${width}px view (${JSON.stringify(state.sidebar)})`);
        }
        assert.equal(state.brokenImages, 0, `${role} ${route} at ${width}px has a broken image`);
        assert.ok(state.heading, `${role} ${route} at ${width}px has a page heading`);
        assert.deepEqual(actor.page.problems, [], `${role} ${route} at ${width}px has no script error`);
        if (route === routes[0]) await shot(actor.page, `impeccable-${role}-${width}`);
        if (role === 'admin' && route === '/admin/operations') {
          const card = actor.page.locator('.tf-dashboard-card').first();
          await card.waitFor({ timeout: 15000 });
          assert.match(await card.innerText(), /Responsive audit request/);
          assert.notEqual(await card.locator('[data-testid=card-status]').first().innerText(), '0');
          assert.ok(await card.locator('dt').count() >= 2, 'operational facts are visible');
          await shot(actor.page, `impeccable-admin-operations-${width}`);
        }
      }
    }
  });
  await actor.ctx.close();
}
await finish('Impeccable responsive');
