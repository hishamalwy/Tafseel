/* A throttled Arabic sign-in gives a useful Arabic response at phone width. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const base = (process.env.TAFSEEL_BASE_URL ?? 'http://localhost:5311').replace(/\/$/, '');
const ar = JSON.parse(readFileSync(new URL('../../frontend-angular/public/locale/ar.json', import.meta.url), 'utf8'));
const browser = await chromium.launch();

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-SA' });
  const page = await context.newPage();
  await page.goto(`${base}/ar/auth`, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-email').fill('nobody@example.test');
  await page.locator('#login-password').fill('Invalid!Password1');

  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await page.request.post(`${base}/api/v1/auth/login`, {
      data: { email: 'nobody@example.test', password: 'Invalid!Password1' }
    });
    assert.equal(response.status(), 401, `warm-up login ${attempt + 1}`);
  }

  const response = page.waitForResponse(result => result.url().endsWith('/api/v1/auth/login'));
  await page.locator('form button[type=submit]').first().click();
  assert.equal((await response).status(), 429);
  const alert = page.locator('.tf-auth-alert[role=alert]');
  await alert.waitFor({ state: 'visible' });
  assert.equal(await alert.innerText(), ar.auth_rate_limited);
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'ar');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  if (process.env.TAFSEEL_SHOT_DIR)
    await page.screenshot({ path: join(process.env.TAFSEEL_SHOT_DIR, 'auth-rate-limit-ar-phone.png') });
  await context.close();
  console.log('Arabic 429 sign-in journey passed at 390px.');
} finally {
  await browser.close();
}
