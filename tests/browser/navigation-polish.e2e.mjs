/* Public navigation regression and OPP-01 screenshot coverage, on a disposable published build.
 * Network gates delay real responses only: screenshots never inject product data or fake success.
 */
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { BASE, SEED, attribute, context, finish, noHorizontalOverflow, pathOf, pickSlot, shot,
  signIn, spa, start, step, visit, waitForCall } from './wave3b-harness.mjs';

await start();
const visitor = await context({ locale: 'ar-SA', ...(process.env.TAFSEEL_SHOT_DIR ? {
  recordVideo: { dir: process.env.TAFSEEL_SHOT_DIR, size: { width: 1280, height: 900 } }
} : {}) });
const { page } = visitor;
const measurements = [];
let sessionId;
const settled = tab => tab.waitForFunction(() => document.getAnimations().every(a => a.effect?.getTiming().iterations === Infinity || a.playState !== 'running'));
const snapshot = async (tab, name) => { await tab.evaluate(() => document.fonts.ready); await settled(tab); await shot(tab, name); };
const detail = async (tab, selector, name) => {
  if (process.env.TAFSEEL_SHOT_DIR) await tab.locator(selector).screenshot({ path: join(process.env.TAFSEEL_SHOT_DIR, `${name}.png`) });
};

await step('Arabic prerender already has Arabic navigation without JavaScript', async () => {
  const staticPage = await context({ locale: 'ar-SA', javaScriptEnabled: false });
  await visit(staticPage.page, `${BASE}/ar/about`);
  assert.equal((await staticPage.page.locator('.tf-public-header__nav').innerText()).trim(), 'تصفح المعلمين\nانشر طلبًا\nمن نحن');
  assert.match(await staticPage.page.locator('#about-title').innerText(), /تفصيل/);
  await shot(staticPage.page, 'new-01-arabic-first-paint');
});

await step('Full-width header keeps the logo at the language edge in both themes and ultrawide width; language is consistent', async () => {
  await visit(page, `${BASE}/ar/about`);
  for (const theme of ['light', 'dark']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('tf-theme-toggle button').first().click();
    await snapshot(page, `new-02-navbar-${theme}-ar-desktop`);
    await detail(page, '[data-public-header]', `new-02-navbar-${theme}-strip`);
    await detail(page, '.tf-public-header__nav', `new-08-navigation-label-${theme}`);
  }
  await page.getByTestId('header-demand-link').hover();
  await settled(page);
  await detail(page, '.tf-public-header__nav', 'new-08-navigation-hover');
  await page.mouse.move(500, 180);
  await page.keyboard.press('Tab');
  await page.locator('.tf-public-header__nav a').first().focus();
  const focus = await page.locator('.tf-public-header__nav a').first().evaluate(el => ({
    visible: el.matches(':focus-visible'), outline: getComputedStyle(el).outlineWidth
  }));
  assert.ok(focus.visible && parseFloat(focus.outline) >= 2, 'keyboard navigation has a visible focus outline');
  await detail(page, '[data-public-header]', 'new-08-navigation-keyboard-focus');
  await page.mouse.move(500, 180);
  await page.setViewportSize({ width: 2547, height: 1050 });
  const geometry = await page.locator('[data-public-header]').evaluate(el => {
    const brand = el.querySelector('.tf-public-header__brand').getBoundingClientRect();
    const nav = el.querySelector('nav').getBoundingClientRect();
    return { width: el.getBoundingClientRect().width, gap: brand.left - nav.right,
      edge: document.documentElement.clientWidth - brand.right };
  });
  assert.ok(geometry.width > 2500 && geometry.gap >= 24 && geometry.gap <= 40 && geometry.edge <= 25, JSON.stringify(geometry));
  await snapshot(page, 'new-03-navbar-ultrawide');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('tf-lang-toggle button').first().click();
  await page.waitForURL(url => pathOf(url) === '/en/about');
  await page.locator('.tf-public-header__nav').getByText('About', { exact: true }).waitFor();
  assert.ok((await page.locator('.tf-public-header__brand').boundingBox()).x <= 25, 'English logo stays at the left edge');
  assert.match(await page.title(), /Tafseel/);
  await snapshot(page, 'new-04-about-english');
  await detail(page, '.tf-public-header__nav', 'new-08-navigation-label-english');
  for (const width of [900, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await noHorizontalOverflow(page, `English public navigation at ${width}px`);
    const separated = await page.locator('[data-public-header]').evaluate(el =>
      el.querySelector('nav').getBoundingClientRect().right <= el.querySelector('.tf-public-header__actions').getBoundingClientRect().left);
    assert.ok(separated, `English navigation and account actions do not overlap at ${width}px`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('tf-lang-toggle button').first().click();
  await page.waitForURL(url => pathOf(url) === '/ar/about');
  await page.locator('.tf-public-header__nav').getByText('من نحن', { exact: true }).waitFor();
  assert.match(await page.title(), /تفصيل/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-public-menu-toggle]').click();
  await page.locator('[data-public-menu=open]').waitFor();
  await page.locator('[data-public-menu=open] nav a[aria-current=page]').getByText('من نحن', { exact: true }).waitFor();
  await noHorizontalOverflow(page, 'Arabic public menu');
  await snapshot(page, 'new-06-navbar-ar-phone');
  await page.locator('[data-public-menu-toggle]').click();
  await page.setViewportSize({ width: 1280, height: 900 });
});

await step('Public page links stay in one document; warmed route changes are measured', async () => {
  let documents = 0;
  const count = request => { if (request.resourceType() === 'document') documents++; };
  page.on('request', count);
  for (let repeat = 0; repeat < 3; repeat++) {
    const started = Date.now();
    await page.locator('.tf-public-header__nav a[href*="/teachers"]').click();
    await page.locator('.tf-browse-page, .tf-mkb-page, tf-browse-teachers-page main').first().waitFor();
    measurements.push({ route: 'about → teachers shell', ms: Date.now() - started });
    const back = Date.now();
    await page.locator('.tf-public-header__nav a[href*="/about"]').click();
    await page.locator('#about-title').waitFor();
    measurements.push({ route: 'teachers → about', ms: Date.now() - back });
  }
  page.off('request', count);
  assert.equal(documents, 0, 'normal page changes do not reload the document');
  console.log('  local navigation measurements:', JSON.stringify(measurements));
});

await step('Real delayed requests show shaped skeletons; avatar transition completes without waiting for the profile API', async () => {
  let releaseList;
  const listGate = new Promise(resolve => { releaseList = resolve; });
  const listPattern = /\/api\/v1\/teachers\?/;
  await page.route(listPattern, async route => { await listGate; await route.continue(); });
  const listResponse = page.waitForResponse(listPattern);
  await page.locator('.tf-public-header__nav a[href*="/teachers"]').click();
  await page.locator('[data-kind=teachers][data-state=loading]').waitFor();
  await shot(page, 'opp-02-teacher-skeleton');
  releaseList(); await listResponse; await page.unroute(listPattern);
  const link = page.locator(`.tf-mkb-name[href*="${SEED.teacherA.Id}"]`).first();
  await link.waitFor();
  await snapshot(page, 'opp-17-avatar-source');
  let releaseProfile;
  const gate = new Promise(resolve => { releaseProfile = resolve; });
  await page.route(`**/api/v1/teachers/${SEED.teacherA.Id}`, async route => { await gate; await route.continue(); });
  const profileResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/teachers/${SEED.teacherA.Id}`);
  await page.evaluate(() => {
    window.__avatarTransition = null;
    if (!document.startViewTransition) return;
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = update => {
      const began = performance.now();
      const result = start(update);
      result.updateCallbackDone.then(() => { window.__avatarTransition = { updatedMs: performance.now() - began }; });
      return result;
    };
  });
  await link.click();
  await page.locator('[data-kind=profile] img').waitFor();
  const skeletonLine = await page.locator('[data-kind=profile] .tf-loading-shape__line').first().boundingBox();
  assert.ok(skeletonLine.height <= 18, 'profile skeleton uses text lines, not old full-page placeholder heights');
  await page.waitForFunction(() => window.__avatarTransition !== null, { timeout: 5000 });
  const timing = await page.evaluate(() => window.__avatarTransition);
  assert.ok(timing.updatedMs < 600, `profile shell transition should not wait 700ms for data: ${JSON.stringify(timing)}`);
  measurements.push({ route: 'avatar → profile shell with API held', ms: Math.round(timing.updatedMs) });
  await settled(page);
  await shot(page, 'new-05-instant-profile-shell');
  releaseProfile(); await profileResponse; await page.unroute(`**/api/v1/teachers/${SEED.teacherA.Id}`);
  await page.locator('.tf-mk-av--l').waitFor();
  await snapshot(page, 'opp-17-avatar-destination');
});

await step('Arabic phone: first-use, caught-up, filtered states, marker, keyboard/reduced motion and dark overlay', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(visitor, SEED.outsider.Email);
  await spa(visitor, '/about');
  await page.locator('[data-public-menu-toggle]').click();
  await page.locator('[data-public-menu=open] nav a[href*="/requests/new"]').click();
  await page.waitForURL(url => pathOf(url) === '/ar/requests/new/open');
  await page.locator('#open-title').waitFor();
  assert.equal(await page.locator('[data-testid=request-modes]').count(), 0, 'Post a request opens the form without a mode choice');
  await snapshot(page, 'new-07-post-explanation-direct');
  await visit(page, `${BASE}/ar/requests/new`);
  await page.waitForURL(url => pathOf(url) === '/ar/requests/new/open');
  await page.locator('#open-title').waitFor();
  await spa(visitor, '/student/requests');
  await page.locator('[data-testid=work-empty]').waitFor();
  await snapshot(page, 'opp-07-first-use-empty');
  await page.locator('[data-chip=action]').click();
  await page.locator('[data-variant=caught-up]').waitFor();
  await snapshot(page, 'opp-11-sliding-selection');
  await page.locator('[data-chip=finished]').click();
  await page.locator('[data-variant=filtered]').waitFor();
  await snapshot(page, 'opp-05-filtered-state');
  await page.locator('[data-chip=action]').press('Enter');
  assert.equal(await page.locator('.tf-segment-indicator').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  await snapshot(page, 'opp-04-keyboard-motion-policy');
  const chipFocus=await page.locator('[data-chip=action]').evaluate(el=>({visible:el.matches(':focus-visible'),width:getComputedStyle(el).outlineWidth,offset:getComputedStyle(el).outlineOffset,height:el.getBoundingClientRect().height}));
  assert.ok(chipFocus.visible&&chipFocus.width==='2px'&&chipFocus.offset==='-2px'&&chipFocus.height>=44,'segmented keyboard focus remains visible inside a real touch target');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('[data-chip=all]').click();
  assert.equal(await page.locator('.tf-segment-indicator').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  await snapshot(page, 'opp-04-reduced-motion');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  if (await page.locator('html').getAttribute('data-theme') !== 'dark') await page.locator('tf-theme-toggle button').first().click();
  await page.locator('[data-chip=action]').click();await settled(page);
  await detail(page,'[data-testid=work-chips]','buttons-work-filter-dark-ar-phone');
  await page.locator('[data-chip=action]').press('Enter');
  await detail(page,'[data-testid=work-chips]','buttons-work-filter-focus-dark-ar-phone');
  await page.locator('[data-testid=account-menu-toggle]').click();
  await page.locator('[data-testid=account-menu]').waitFor();
  await snapshot(page, 'opp-14-dark-overlay');
  await page.locator('[data-testid=account-menu-toggle]').click();
  await page.locator('[data-testid=account-menu]').waitFor({ state: 'detached' });
  await noHorizontalOverflow(page, 'Arabic phone work states');
});

await step('Booking selection, file preview, actual sending feedback, waiting confirmation, summary and cancellable dialog', async () => {
  await spa(visitor, `/sessions/book?teacherId=${SEED.teacherA.Id}&teacherServiceId=${SEED.teacherA.liveServiceId}`);
  await page.locator('#book-session-title').fill('مراجعة قاعدة السلسلة');
  await page.locator('#book-topic').fill('شرح خطوات الحل ومراجعة الأمثلة مع المعلم.');
  await pickSlot(page, 3);
  await page.locator('.tf-book-selection').waitFor();
  await snapshot(page, 'opp-09-slot-selection');
  await detail(page, '.tf-book-slots', 'opp-09-slot-selection-detail');
  await page.locator('tf-file-picker input[type=file]').setInputFiles(resolve('assets/brand/apple-touch-icon.png'));
  await page.locator('.tf-upload-file-preview').waitFor();
  await snapshot(page, 'opp-13-attachment-preview');
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const pattern = '**/api/v1/live-sessions';
  await page.route(pattern, async route => { if (route.request().method() === 'POST') await gate; await route.continue(); });
  const created = waitForCall(page, 'POST', /^\/api\/v1\/live-sessions$/);
  await page.locator('.tf-book-confirm').click();
  await page.locator('.tf-book-confirm[data-feedback=busy]').waitFor();
  await shot(page, 'opp-06-action-pending');
  release();
  const response = await created;
  assert.equal(response.status(), 201, 'the server created the time request');
  await page.waitForURL(url => /^\/ar\/live-sessions\/[0-9a-f-]{36}$/.test(pathOf(url)));
  await page.unroute(pattern);
  sessionId = pathOf(page.url()).split('/').pop();
  await page.locator('tf-ui-state [data-state=waiting]').waitFor();
  await snapshot(page, 'opp-01-time-request-sent');
  await snapshot(page, 'opp-08-status-date-summary');
  await page.locator('[data-testid=cancel-session]').click();
  await page.locator('dialog[open]').waitFor();
  await snapshot(page, 'opp-10-confirmation-dialog');
  await detail(page, 'dialog[open]', 'opp-10-confirmation-dialog-detail');
  const modal=page.locator('dialog[open]');
  for(const theme of ['dark','light']){
    if(await page.locator('html').getAttribute('data-theme')!==theme){
      await page.keyboard.press('Escape');await modal.waitFor({state:'detached'});
      await page.locator('tf-theme-toggle button').first().click();
      await page.getByTestId('cancel-session').click();await modal.waitFor();
    }
    const confirm=modal.locator('button[value=confirm]'),back=modal.locator('button[value=cancel]');
    assert.equal(await confirm.evaluate(el=>el.classList.contains('tf-button-danger')),true);
    assert.equal(await back.evaluate(el=>el.classList.contains('tf-button-secondary')),true);
    const fills=await modal.locator('button').evaluateAll(els=>els.map(el=>getComputedStyle(el).backgroundColor));
    assert.notEqual(fills[0],fills[1],'confirm and return have distinct rendered hierarchy');
    const contrast=await confirm.evaluate(el=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
      const lum=color=>{ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const c=[...ctx.getImageData(0,0,1,1).data].slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
      const css=getComputedStyle(el),a=lum(css.color),b=lum(css.backgroundColor);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });
    assert.ok(contrast>=4.5,`${theme} destructive button text contrast: ${contrast}`);
    const body=await modal.locator('p').boundingBox(),actions=await modal.locator('.tf-system-dialog-actions').boundingBox();
    assert.ok(actions.y-body.y-body.height>=20,'confirmation actions are separated from the consequence');
    await detail(page,'dialog[open]',`buttons-dialog-${theme}-ar-phone`);
  }
  await page.keyboard.press('Escape');
  await page.locator('.tf-system-dialog').waitFor({ state: 'detached' });
  assert.equal(await page.locator('[data-testid=cancel-session]').evaluate(el => el === document.activeElement), true);
});

await step('A teacher accepts through the real endpoint; the inline success state follows the response', async () => {
  const teacher = await context({ locale: 'ar-SA', viewport: { width: 1280, height: 900 } });
  await signIn(teacher, SEED.teacherA.Email);
  await spa(teacher, `/live-sessions/${sessionId}`);
  await teacher.page.locator('[data-testid=accept-session-request]').click();
  await attribute(teacher.page, '[data-testid=session-status]', 'data-status', 0);
  await teacher.page.locator('tf-ui-state [data-state=success]').waitFor();
  await snapshot(teacher.page, 'opp-03-state-change-success');
  await snapshot(teacher.page, 'opp-15-arabic-type-spacing');
  await snapshot(teacher.page, 'opp-16-status-icons');
  await detail(teacher.page, 'tf-ui-state:has([data-state=success])', 'opp-16-status-icon-detail');
  await spa(teacher, '/teacher/profile');
  await teacher.page.locator('#profile-city').fill('الرياض');
  await teacher.page.locator('[data-testid=save-profile]').click();
  await teacher.page.locator('[data-testid=save-profile][data-feedback=success]').waitFor();
  await snapshot(teacher.page, 'opp-01-profile-save');
});

if (process.env.TAFSEEL_SHOT_DIR) {
  writeFileSync(join(process.env.TAFSEEL_SHOT_DIR, 'navigation-measurements.json'), JSON.stringify(measurements, null, 2));
  const video = page.video();
  await visitor.ctx.close();
  await video.saveAs(join(process.env.TAFSEEL_SHOT_DIR, 'motion-demo.webm'));
}
await finish('navigation polish and screenshot coverage');
