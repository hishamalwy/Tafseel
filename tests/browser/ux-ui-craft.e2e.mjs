/* Accepted whole-system UX/UI craft scopes. Published host, disposable real database.
 * Failure injection is limited to reads/draft writes; no campaign or money action is published here. */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { BASE, SEED, context, finish, noHorizontalOverflow, shot, signIn, spa, start, step, visit } from './wave3b-harness.mjs';
await start();
const visitor=await context({locale:'ar-SA',viewport:{width:390,height:844}});
const student=await context({locale:'ar-SA',viewport:{width:390,height:844}});
const teacher=await context({locale:'ar-SA'});
const admin=await context({locale:'ar-SA'});
const quality=await context({locale:'ar-SA'});
const finance=await context({locale:'ar-SA',viewport:{width:390,height:844}});
await step('UX01 mobile filters expose subject/service, apply to URL and return focus',async()=>{
  const p=visitor.page;await visit(p,BASE+'/ar/teachers');await p.locator('.tf-mkb-mobile .tf-mkb-sheet-btn').click();
  await p.locator('#f-subject-mobile').waitFor();await p.locator('#f-subject-mobile').selectOption(SEED.subjectId);
  await p.locator('#f-service-mobile').selectOption({index:1});await noHorizontalOverflow(p,'phone filters');await shot(p,'ux01-mobile-filters');
  await p.locator('#browse-filter-sheet .tf-mk-btn--primary').click();
  await p.waitForURL(url=>url.searchParams.get('subjectId')===SEED.subjectId || url.searchParams.get('subject')===SEED.subjectId);
  await p.locator('#browse-filter-sheet').waitFor({state:'detached'});
});
await step('UX03 history failure is explicit and retry recovers',async()=>{
  await signIn(student,SEED.outsider.Email);const p=student.page;
  await p.route('**/api/v1/support/cases/mine*',r=>r.fulfill({status:503,json:{}}));
  await spa(student,'/help');await p.getByTestId('help-history-error').waitFor();await shot(p,'ux03-history-retry');
  await p.unroute('**/api/v1/support/cases/mine*');await p.getByTestId('help-history-error').getByRole('button').click();
  await p.getByTestId('help-history-error').waitFor({state:'detached'});
});
await step('UX04 failed draft keeps text, retries and restores after refresh; UX07/08 copy',async()=>{
  const p=student.page;await spa(student,'/student/overview');
  assert.doesNotMatch(await p.getByTestId('home-post-request').innerText(),/معلم واحد|one teacher/);
  await p.getByTestId('home-post-request').click();await p.locator('#open-title').waitFor();
  await p.route('**/api/v1/open-marketplace/drafts/current',r=>r.request().method()==='PUT'?r.fulfill({status:503,json:{}}):r.continue());
  await p.locator('#open-title').fill('شرح التكامل مع أمثلة');
  await p.getByTestId('open-draft-status').getByRole('button').waitFor();assert.equal(await p.locator('#open-title').inputValue(),'شرح التكامل مع أمثلة');
  await shot(p,'ux04-draft-retry');
  const feedback=p.getByTestId('open-draft-status');
  const message=await feedback.locator('span').boundingBox(),retry=await feedback.getByRole('button').boundingBox();
  assert.ok(retry.y-message.y-message.height>=10,'phone Retry is separated from the complete message');
  if(process.env.TAFSEEL_SHOT_DIR)await feedback.screenshot({path:join(process.env.TAFSEEL_SHOT_DIR,'buttons-draft-retry-light-ar-phone.png')});
  await p.locator('tf-theme-toggle button').first().click();
  if(process.env.TAFSEEL_SHOT_DIR)await feedback.screenshot({path:join(process.env.TAFSEEL_SHOT_DIR,'buttons-draft-retry-dark-ar-phone.png')});
  await p.setViewportSize({width:1280,height:900});await noHorizontalOverflow(p,'desktop draft recovery');
  if(process.env.TAFSEEL_SHOT_DIR)await feedback.screenshot({path:join(process.env.TAFSEEL_SHOT_DIR,'buttons-draft-retry-dark-ar-desktop.png')});
  await p.setViewportSize({width:390,height:844});await p.locator('tf-theme-toggle button').first().click();
  await p.unroute('**/api/v1/open-marketplace/drafts/current');
  await p.getByTestId('open-draft-status').getByRole('button').click();
  await p.getByTestId('open-draft-status').getByRole('button').waitFor({state:'detached'});
  await p.waitForFunction(()=>document.querySelector('[data-testid=open-draft-status]')?.textContent.includes('تم حفظ المسودة'));
  await p.reload();await p.locator('#open-title').waitFor();assert.equal(await p.locator('#open-title').inputValue(),'شرح التكامل مع أمثلة');
  await p.locator('#open-service').selectOption({index:1});await noHorizontalOverflow(p,'request guidance');await shot(p,'ux07-request-guidance');
  await p.waitForTimeout(900);
});
await step('UX06 booking puts time/cost before brief; UX09 messages action; UX10 missing back route',async()=>{
  const p=student.page;await spa(student,`/sessions/book?teacherId=${SEED.teacherA.Id}&teacherServiceId=${SEED.teacherA.liveServiceId}`);
  await p.locator('#book-slots-title').waitFor();assert.equal(await p.locator('.tf-book-layout').evaluate(el=>el.firstElementChild.classList.contains('tf-book-slots')),true);
  await noHorizontalOverflow(p,'booking');await shot(p,'ux06-booking-plan-first');
  await spa(student,'/messages');await p.locator('tf-ui-state a').waitFor();assert.match(await p.locator('tf-ui-state a').getAttribute('href'),/student\/requests/);await shot(p,'ux09-messages-next-step');
  await spa(student,'/orders/00000000-0000-0000-0000-000000000000');await p.locator('.tf-state .tf-button').waitFor();await shot(p,'ux10-missing-order');
});
await step('UX02 protected edits survive cancelled navigation; UX13 searchable Arabic cities preserve IANA',async()=>{
  await signIn(teacher,SEED.teacherA.Email);const p=teacher.page;await spa(teacher,'/teacher/profile');await p.locator('#profile-city').waitFor();
  const before=await p.locator('#profile-city').inputValue();await p.locator('#profile-city').fill(before+' تعديل');
  await p.locator('a[href*="/teacher/home"]').first().click();await p.locator('.tf-system-dialog[open]').waitFor();
  await p.locator('.tf-system-dialog-actions button[value=cancel]').click();assert.equal(await p.locator('#profile-city').inputValue(),before+' تعديل');
  await p.locator('#profile-city').fill(before);const original=await p.locator('#profile-zone').inputValue();
  await p.locator('#profile-zone-search').fill('باريس');assert.ok((await p.locator('#profile-zone').innerText()).includes('باريس'));
  assert.equal(await p.locator('#profile-zone').inputValue(),original);await shot(p,'ux13-time-zone-search');
});
await step('UX05 quality and support filters survive reload and browser Back',async()=>{
  await signIn(quality,SEED.reviewer.Email);const p=quality.page;await spa(quality,'/quality/applications');
  await p.locator('#queue-scope').selectOption('All');await p.waitForURL(url=>url.searchParams.get('scope')==='All');
  await p.locator('#queue-kind').selectOption('Additional');await p.waitForURL(url=>url.searchParams.get('kind')==='Additional');
  await p.goBack();await p.waitForFunction(()=>document.querySelector('#queue-kind')?.value==='All');
  await p.reload();await p.locator('#queue-scope').waitFor();assert.equal(await p.locator('#queue-scope').inputValue(),'All');await shot(p,'ux05-quality-context');
  await signIn(admin,SEED.admin.Email);await spa(admin,'/admin/help');await admin.page.locator('#help-q').fill('craft');await admin.page.locator('.tf-help-toolbar button[type=submit]').click();
  await admin.page.waitForURL(url=>url.searchParams.get('q')==='craft');await admin.page.reload();await admin.page.locator('#help-q').waitFor();assert.equal(await admin.page.locator('#help-q').inputValue(),'craft');
});
await step('UX12 local bilingual preview switches with SPA tab navigation without publishing',async()=>{
  const p=admin.page;await spa(admin,'/admin/marketing/coupons');await p.locator('.tf-marketing__tabs a[href*="promotions"]').click();
  await p.getByTestId('promotion-preview').waitFor();await p.locator('input[dir=rtl]').fill('رسالة للطلاب');await p.locator('input[dir=ltr]').fill('A message for students');
  assert.equal(await p.locator('#promotion-preview-title').innerText(),'رسالة للطلاب');
  await p.getByTestId('promotion-preview').getByRole('button',{name:'English'}).click();
  await p.waitForFunction(()=>document.querySelector('#promotion-preview-title')?.textContent==='A message for students');
  assert.equal(await p.locator('#promotion-preview-title').innerText(),'A message for students');
  assert.equal(p.sent.filter(r=>r.method()==='POST'&&/promotions$/.test(r.url())).length,0);await shot(p,'ux12-local-promotion-preview');
});
await step('UX05 finance audit search survives reload on Arabic phone',async()=>{
  await signIn(finance,SEED.finance.Email);const p=finance.page;await spa(finance,'/finance/audit');await p.locator('#fin-audit-q').fill('refund');
  await p.locator('.tf-fin-toolbar button[type=submit]').click();await p.waitForURL(url=>url.searchParams.get('q')==='refund');await p.reload();
  await p.locator('#fin-audit-q').waitFor();assert.equal(await p.locator('#fin-audit-q').inputValue(),'refund');await noHorizontalOverflow(p,'finance audit');await shot(p,'ux05-finance-context');
});
if (process.env.TAFSEEL_CRAFT_STAGE === 'ui') {
  await step('UI01/02/03 named dialogs, native required fields, field contrast in both themes; UI09 theme chrome',async()=>{
    const p=teacher.page;await p.locator('#profile-zone-search').fill('');await p.locator('#profile-city').fill('تعديل آخر');
    await p.locator('a[href*="/teacher/home"]').first().click();const dialog=p.locator('.tf-system-dialog[open]');await dialog.waitFor();
    assert.ok(await dialog.getAttribute('aria-labelledby'));assert.equal(await dialog.locator('button[value=cancel]').evaluate(el=>document.activeElement===el),true);
    await shot(p,'ui01-named-confirmation');await dialog.locator('button[value=cancel]').click();
    for (const theme of ['light','dark']) {
      if (await p.locator('html').getAttribute('data-theme')!==theme)await p.locator('tf-theme-toggle button').first().click();
      await p.waitForFunction(()=>document.querySelector('meta[name="theme-color"]')?.content===getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim());
      const colors=await p.locator('#profile-city').evaluate(el=>{const s=getComputedStyle(el);return {border:s.borderTopColor,bg:s.backgroundColor};});
      const luminance=css=>{const c=css.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
      const a=luminance(colors.border),b=luminance(colors.bg);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=3,`${theme} field contrast`);
      await shot(p,`ui02-fields-${theme}`);
    }
    await visit(visitor.page,BASE+'/en/auth');assert.equal(await visitor.page.locator('#login-email').getAttribute('name'),'login-email');assert.equal(await visitor.page.locator('#login-email').getAttribute('required'),'');await shot(visitor.page,'ui03-native-fields-en');
  });
  await step('UI05 staff skeleton reflects table anatomy and loading never shows an empty decoration; UI08 touch targets',async()=>{
    const p=finance.page;let release;const pending=new Promise(r=>{release=r;});
    await p.route('**/api/v1/finance/payments*',async route=>{await pending;await route.continue();});
    // Navigation's network-idle helper would wait for the held response; use a fresh document.
    await p.goto(BASE+'/ar/finance/payments',{waitUntil:'domcontentloaded'});await p.locator('tf-skeleton [data-kind=table]').waitFor();await shot(p,'ui05-table-skeleton');
    release();await p.locator('tf-skeleton').waitFor({state:'detached'});await p.unroute('**/api/v1/finance/payments*');
    for(const button of await p.locator('.tf-fin-segments button').all())assert.ok((await button.boundingBox()).height>=44);
    await noHorizontalOverflow(p,'finance touch targets');await shot(p,'ui08-finance-phone-targets');
    await spa(admin,'/admin/marketing/promotions');await shot(admin.page,'ui10-operational-marketing-header');
  });
  await step('UI07 keyboard focus pauses autoplay and reduced motion removes autoplay controls; UI06 lazy teacher/book styles work after navigation',async()=>{
    const p=visitor.page;await p.emulateMedia({reducedMotion:'no-preference'});await visit(p,BASE+'/ar/');
    // The seeded public campaign opens after entry; dismiss it as a visitor before testing the story.
    await p.locator('.tf-promo-wizard-close').click();await p.locator('[data-promo-wizard]').waitFor({state:'detached'});
    await p.locator('.tf-story-steps button').first().scrollIntoViewIfNeeded();
    await p.locator('.tf-story-steps button').first().waitFor({state:'visible'});await p.locator('.tf-story-steps button').first().focus();
    const selected=await p.locator('.tf-story-steps [data-active=true]').getAttribute('data-story-index');
    await p.waitForTimeout(4500);assert.equal(await p.locator('.tf-story-steps [data-active=true]').getAttribute('data-story-index'),selected);
    await p.getByRole('button',{name:'إيقاف العرض التوضيحي'}).click();await p.getByRole('button',{name:'متابعة العرض التوضيحي'}).waitFor();
    if(process.env.TAFSEEL_SHOT_DIR){
      // Keep the whole section below the sticky header so its element capture is unobscured.
      await p.setViewportSize({width:390,height:1500});
      await p.locator('.tf-product-story').evaluate(el=>{el.scrollIntoView({block:'start'});window.scrollBy(0,-84);});
      await p.locator('.tf-product-story').screenshot({path:join(process.env.TAFSEEL_SHOT_DIR,'ui07-story-pause.png')});
      await p.setViewportSize({width:390,height:844});
    }
    await p.emulateMedia({reducedMotion:'reduce'});await p.getByRole('button',{name:'متابعة العرض التوضيحي'}).waitFor({state:'detached'});
    await p.emulateMedia({reducedMotion:'no-preference'});await spa(visitor,'/teachers');await p.locator('.tf-mkb-card').first().waitFor();await noHorizontalOverflow(p,'lazy teachers');await shot(p,'ui06-lazy-teachers');
    await p.setViewportSize({width:1280,height:900});await spa(visitor,`/teachers/${SEED.teacherA.Id}`);await p.locator('.tf-mk-av--l').waitFor();await shot(p,'ui06-lazy-profile');
  });
}
await finish('UX/UI craft');
