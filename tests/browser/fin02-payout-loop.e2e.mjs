/* PRODUCT-P0 (DEC-04): the payout loop closes, and a Finance operator runs it without Admin powers.
 *
 *   1. A student pays for work and completes it; the earning clears (test clock on the throwaway database).
 *   2. The teacher enters bank details with a full IBAN; every screen afterwards shows only the last four.
 *   3. A Finance user lands on the Finance workspace, sees the queue, and verifies the details. They cannot
 *      open Admin screens, and the API refuses them.
 *   4. The teacher requests a withdrawal.
 *   5. Finance opens the audited transfer details, starts the transfer, is refused when Tafseel's own note is
 *      typed as the bank's reference, then records the bank's evidence: the withdrawal becomes Transferred.
 *   6. The teacher reads "Transferred" and when it was sent, in Arabic at 390px, with no IBAN on the page.
 *   7. Finance finds the payment by the student's email and reads its trail; the financial audit lists every
 *      step, including each view of the full bank details.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  SEED, acceptRequest, api, attribute, confirmDialog, context, file, finish, noHorizontalOverflow, pathOf, payInSimulator,
  pdf, registerStudent, sendDirectRequest, shot, signIn, spa, sql, start, step, waitForCall
} from './wave3b-harness.mjs';
import { SQL_SERVER, sqlAuth, sqlcmd } from './lib/sql.mjs';

const stamp = Date.now();
const studentEmail = `fin02-student-${stamp}@example.test`;
const studentPassword = `Fin02!Payout-${stamp}`;
const IBAN = 'SA03 8000 0000 6080 1016 7519';
const PRICE = 120;
const DATABASE = process.env.TAFSEEL_E2E_DATABASE ?? '';

/** Test clock only, on the throwaway database: the refund window of this order has passed. */
function clearingEndsNow(orderId) {
  if (!/^TafseelE2E/i.test(DATABASE)) throw new Error('throwaway database only');
  execFileSync(sqlcmd(), ['-S', SQL_SERVER, ...sqlAuth(), '-d', DATABASE, '-b', '-Q',
    `UPDATE TeacherEarningMaturities SET MaturesAt = DATEADD(minute, -5, SYSUTCDATETIME()) WHERE OrderId = '${orderId}'`]);
}

await start();
const student = await context();
const teacher = await context();
const finance = await context();
let orderId = '';
let withdrawalId = '';

await step('1. a student pays for work and completes it, and the earning clears', async () => {
  await registerStudent(student, `FIN-02 Student ${stamp}`, studentEmail, studentPassword);
  await signIn(teacher, SEED.teacherA.Email);
  const requestId = await sendDirectRequest(student, SEED.teacherA, `Payout loop ${stamp}`);
  orderId = await acceptRequest(teacher, requestId, PRICE);
  await spa(student, `/orders/${orderId}`);
  await student.page.locator('[data-testid=pay-order]').click();
  await student.page.waitForURL(url => pathOf(url) === '/en/checkout', { timeout: 15000 });
  await payInSimulator(student.page, new RegExp(`^/en/orders/${orderId}$`));
  await spa(teacher, `/orders/${orderId}`);
  await teacher.page.locator('[data-testid=start-order]').click();
  await confirmDialog(teacher.page);
  await attribute(teacher.page, '[data-testid=order-status]', 'data-status', 1);
  await teacher.page.locator('[data-testid=open-deliver]').click();
  await teacher.page.locator('#deliver-files').setInputFiles(file('payout.pdf', pdf('FIN-02 delivery')));
  await teacher.page.locator('#deliver-message').fill('The worked explanation.');
  const delivered = waitForCall(teacher.page, 'POST', new RegExp(`^/api/v1/orders/${orderId}/deliveries$`));
  await teacher.page.locator('[data-testid=submit-delivery]').click();
  assert.ok((await delivered).ok(), 'delivered');
  await spa(student, `/orders/${orderId}`);
  await student.page.locator('[data-testid=complete-order]').click();
  const completed = waitForCall(student.page, 'POST', new RegExp(`^/api/v1/orders/${orderId}/complete$`));
  await confirmDialog(student.page);
  assert.ok((await completed).ok(), 'completed');

  clearingEndsNow(orderId);
  // The maturity worker runs every five minutes; nothing is promoted by hand.
  let available = 0;
  for (let i = 0; i < 80 && available <= 0; i++) {
    const balances = (await api(SEED.teacherA.Email, 'GET', '/api/v1/withdrawals/balances')).body;
    available = Number((balances ?? []).find(b => b.currency === 'SAR')?.available ?? 0);
    if (available <= 0) await new Promise(r => setTimeout(r, 5000));
  }
  assert.ok(available >= 50, `earnings cleared (${available})`);
});

await step('2. the teacher enters bank details with a full IBAN; screens show only the last four', async () => {
  const page = teacher.page;
  await spa(teacher, '/teacher/earnings');
  await page.locator('[data-testid=payout-open]').first().click();
  await page.locator('#payout-name').fill('Calculus Teacher A');
  await page.locator('#payout-country').selectOption('SA');
  await page.locator('#payout-institution').fill('Al Rajhi Bank');
  await page.locator('#payout-iban').fill('SA03 8000 0000 6080 1016 7518');
  await page.locator('#payout-id').fill('4321');
  let sentEarly = false;
  const watch = request => { if (request.method() === 'PUT' && request.url().includes('/withdrawals/profile')) sentEarly = true; };
  page.on('request', watch);
  await page.locator('[data-testid=payout-save]').click();
  // A mistyped IBAN (wrong check digits) is caught on the page, before anything is sent.
  await page.locator('[data-testid=payout-panel] .tf-field-error').first().waitFor({ timeout: 5000 });
  page.off('request', watch);
  assert.equal(sentEarly, false, 'a mistyped IBAN is not sent');
  await page.locator('#payout-iban').fill(IBAN);
  const saved = waitForCall(page, 'PUT', /withdrawals\/profile$/);
  await page.locator('[data-testid=payout-save]').click();
  assert.ok((await saved).ok(), 'payout details saved');
  await page.locator('[data-testid=payout-pending]').waitFor({ timeout: 15000 });
  const text = await page.locator('main').innerText();
  assert.ok(text.includes('••••7519'), 'the masked destination is shown');
  assert.ok(!text.includes('60801016'), 'the IBAN itself is never shown back');
  await shot(page, 'fin02-payout-pending');
});

await step('3. a Finance user verifies the details from the Finance workspace, and cannot reach Admin', async () => {
  await signIn(finance, SEED.finance.Email);
  await finance.page.waitForURL(url => pathOf(url).startsWith('/en/finance'), { timeout: 15000 });
  await finance.page.locator('[data-testid=finance-queue-payout-profiles]').click();
  await finance.page.locator('[data-testid=finance-payout-row]').first().waitFor({ timeout: 15000 });
  const row = finance.page.locator('[data-testid=finance-payout-row]', { hasText: 'Calculus Teacher A' }).first();
  assert.ok((await row.innerText()).includes('••••7519'));
  await row.locator('[data-testid=finance-payout-verify]').click();
  const reviewed = waitForCall(finance.page, 'POST', /admin\/payout-profiles\/.+\/review$/);
  await confirmDialog(finance.page);
  assert.ok((await reviewed).ok(), 'verified');
  await shot(finance.page, 'fin02-finance-payouts');

  await spa(finance, '/admin/people');
  await finance.page.waitForURL(url => pathOf(url).startsWith('/en/finance'), { timeout: 15000 });
  const navText = await finance.page.locator('nav').first().innerText();
  for (const adminOnly of ['People', 'Catalog', 'Operations']) assert.ok(!navText.includes(adminOnly), `no ${adminOnly} for Finance`);
  assert.equal((await api(SEED.finance.Email, 'GET', '/api/v1/admin/users')).status, 403);
  assert.equal((await api(SEED.finance.Email, 'GET', '/api/v1/admin/disputes')).status, 403);
});

await step('4. the teacher requests a withdrawal', async () => {
  const page = teacher.page;
  await spa(teacher, '/teacher/earnings');
  await page.locator('[data-testid=withdraw-open]').click();
  await page.locator('#withdraw-amount').fill('50');
  await page.locator('[data-testid=withdraw-submit]').click();
  const requested = waitForCall(page, 'POST', /^\/api\/v1\/withdrawals$/);
  await confirmDialog(page);
  const response = await requested;
  assert.ok(response.ok(), 'withdrawal requested');
  withdrawalId = (await response.json()).id;
});

await step('5. Finance sends it: audited details, start, evidence — never a bare reference', async () => {
  const page = finance.page;
  await spa(finance, '/finance/withdrawals');
  const row = () => page.locator(`[data-testid=finance-withdrawal-row][data-withdrawal-id="${withdrawalId}"]`);
  await row().waitFor({ timeout: 15000 });
  const instruction = waitForCall(page, 'POST', /transfer-instruction$/);
  await row().locator('[data-testid=finance-transfer-details]').click();
  assert.ok((await instruction).ok());
  assert.equal(await page.locator('[data-testid=finance-instruction-iban]').innerText(), IBAN.replaceAll(' ', ''));
  const note = await page.locator('[data-testid=finance-instruction-note]').innerText();
  assert.match(note, /^TFS-W-/);
  await shot(page, 'fin02-transfer-details');
  await page.locator('[data-testid=finance-start-transfer]').click();
  const started = waitForCall(page, 'POST', /transfer-initiation$/);
  await confirmDialog(page);
  assert.ok((await started).ok(), 'transfer started');

  await row().locator('[data-testid=finance-record-evidence]').click();
  await page.locator('[data-testid=finance-evidence-reference]').fill(note);
  await page.locator('[data-testid=finance-evidence-source]').fill('Tafseel operating account');
  await page.locator('[data-testid=finance-evidence-attest]').check();
  const refused = waitForCall(page, 'POST', /transfer-confirmation$/);
  await page.locator('[data-testid=finance-evidence-submit]').click();
  assert.equal((await refused).status(), 400, 'Tafseel’s own note is not bank evidence');
  await page.locator('[data-testid=finance-evidence] .tf-field-error').waitFor();

  await page.locator('[data-testid=finance-evidence-reference]').fill(`FT${stamp}`);
  const confirmed = waitForCall(page, 'POST', /transfer-confirmation$/);
  await page.locator('[data-testid=finance-evidence-submit]').click();
  assert.ok((await confirmed).ok(), 'transfer confirmed with evidence');
  assert.equal(sql(`SELECT Status FROM WithdrawalRequests WHERE Id = '${withdrawalId}'`), '1');
  assert.equal(sql(`SELECT COUNT(*) FROM PayoutTransferEvidence WHERE WithdrawalId = '${withdrawalId}'`), '1');
});

await step('6. the teacher reads that the money was sent, in Arabic at 390px, and never sees the IBAN', async () => {
  const phone = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-SA' });
  await signIn(phone, SEED.teacherA.Email);
  await spa(phone, '/teacher/earnings');
  const row = phone.page.locator('[data-testid=withdrawal-row]').first();
  await row.waitFor({ timeout: 15000 });
  const text = await row.innerText();
  assert.ok(text.includes('تم التحويل') || text.includes('حُوّل'), `transferred in Arabic: ${text}`);
  assert.ok(!(await phone.page.locator('main').innerText()).includes('60801016'));
  await noHorizontalOverflow(phone.page, 'earnings after a transfer');
  await shot(phone.page, 'fin02-earnings-transferred-ar');
});

await step('7. Finance finds the payment and reads the audit of every step', async () => {
  const page = finance.page;
  await spa(finance, `/finance/payments?query=${encodeURIComponent(studentEmail)}`);
  await page.locator('[data-testid=finance-payment-row]').first().waitFor({ timeout: 15000 });
  await page.locator('[data-testid=finance-payment-open]').first().click();
  await page.locator('[data-testid=finance-ledger]').waitFor({ timeout: 15000 });
  await shot(page, 'fin02-payment-detail');
  const audit = await api(SEED.finance.Email, 'GET', `/api/v1/finance/audit?query=${withdrawalId}&pageSize=50`);
  const actions = (audit.body.items ?? []).map(x => x.action);
  for (const action of ['WithdrawalRequested', 'WithdrawalTransferInstructionViewed', 'WithdrawalTransferInitiated', 'WithdrawalTransferConfirmed'])
    assert.ok(actions.includes(action), `${action} is in the financial audit (${actions.join(', ')})`);
});

await finish('payout loop and Finance role');
