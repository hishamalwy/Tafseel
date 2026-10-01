/* An Admin gives the Finance role from Admin → People and takes it away again; the server decides access each time.
 *
 *   1. Admin finds a person in People and ticks Finance; the change is saved.
 *   2. That person signs in and lands on the Finance workspace; the Finance API answers them.
 *   3. Admin clears Finance.
 *   4. The person's old session stops working; signed in again, the Finance screens send them home and the
 *      Finance API refuses them (403).
 */
import assert from 'node:assert/strict';
import {
  BASE, SEED, api, confirmDialog, context, finish, pathOf, shot, signIn, spa, start, step, tokenFor, visit, waitForCall
} from './wave3b-harness.mjs';

const person = SEED.outsider.Email;

await start();
const admin = await context();

async function setFinance(assigned) {
  const { page } = admin;
  await spa(admin, '/admin/people');
  const search = page.locator('[data-testid=ops-search]');
  await search.waitFor({ timeout: 15000 });
  await search.fill(person);
  const listed = waitForCall(page, 'GET', /^\/api\/v1\/admin\/users$/);
  await page.locator('.tf-dashboard-search-all button[type=submit]').click();
  assert.ok((await listed).ok(), 'people search answered');
  const card = page.locator('.tf-dashboard-card').filter({ has: page.locator('[data-testid=admin-roles]') }).first();
  await card.locator('[data-testid=admin-roles]').click();
  const finance = card.locator('[data-testid=admin-roles-panel] label').filter({ hasText: /^\s*Finance\s*$/ }).locator('input');
  assert.equal(await finance.isChecked(), !assigned, `Finance is ${assigned ? 'not yet' : 'currently'} ticked`);
  const saved = waitForCall(page, 'PUT', /^\/api\/v1\/admin\/users\/[^/]+\/roles$/);
  await finance.click();
  await confirmDialog(page);
  assert.ok((await saved).ok(), 'role change saved');
  await shot(page, `finance-role-${assigned ? 'granted' : 'removed'}`);
}

await step('1. Admin gives Finance to a person from People', async () => {
  await signIn(admin, SEED.admin.Email);
  await setFinance(true);
});

let holder;
let oldToken = '';
await step('2. the person signs in to the Finance workspace and the Finance API answers them', async () => {
  holder = await context();
  await signIn(holder, person);
  await visit(holder.page, `${BASE}/en/finance/home`);
  assert.equal(pathOf(holder.page.url()), '/en/finance/home');
  const payments = await api(person, 'GET', '/api/v1/finance/payments?page=1&pageSize=5');
  assert.equal(payments.status, 200, 'Finance work is allowed');
  oldToken = await tokenFor(person);
});

await step('3. Admin removes Finance', async () => {
  await setFinance(false);
});

await step('4. the old session ends, and Finance is refused on screen and by the API', async () => {
  const stale = await fetch(`${BASE}/api/v1/finance/payments?page=1&pageSize=5`, { headers: { Authorization: `Bearer ${oldToken}` } });
  assert.equal(stale.status, 401, 'the session from before the change no longer works');
  const again = await context();
  await signIn(again, person);
  await visit(again.page, `${BASE}/en/finance/home`);
  await again.page.waitForURL(url => pathOf(url) !== '/en/finance/home', { timeout: 15000 });
  const fresh = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: person, password: process.env.TAFSEEL_E2E_PASSWORD })
  });
  const token = (await fresh.json()).accessToken;
  const refused = await fetch(`${BASE}/api/v1/finance/payments?page=1&pageSize=5`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(refused.status, 403, 'the Finance API refuses a person without the role');
  await again.ctx.close();
});

assert.deepEqual(admin.page.problems, [], 'no script errors');
await holder?.ctx.close();
await admin.ctx.close();
await finish('Finance role assignment');
