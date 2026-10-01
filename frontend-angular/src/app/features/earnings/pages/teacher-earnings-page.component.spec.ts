import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';
import ar from '../../../../../public/locale/ar.json';
import en from '../../../../../public/locale/en.json';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { LocaleService } from '@core/i18n/locale.service';
import { Balance, EarningsStatement, WithdrawalPolicy } from '../models/earnings';
import { EARNINGS_GATEWAY } from '../services/earnings.ports';
import { LoadEarnings, LoadPayouts, LoadStatement, RequestWithdrawal, SavePayoutDetails } from '../services/earnings.use-cases';
import { PayoutProfile, Withdrawal } from '../models/payouts';
import { TeacherEarningsPageComponent } from './teacher-earnings-page.component';

const POLICY: WithdrawalPolicy = { minimumAmount: 50, currency: 'SAR', expectedSettlementBusinessDays: 3 };
const balance = (over: Partial<Balance> = {}): Balance =>
  ({ currency: 'SAR', available: 0, pendingWithdrawal: 0, pendingClearance: 0, nextClearanceAt: null, ...over });

interface Options {
  readonly balances?: () => Observable<readonly Balance[]>;
  readonly policy?: () => Observable<WithdrawalPolicy>;
  readonly lang?: 'ar' | 'en';
  readonly profile?: PayoutProfile | null;
  readonly withdrawals?: readonly Withdrawal[];
  readonly statement?: () => Observable<EarningsStatement>;
}

/** The page with a fake gateway and the real locale tables, so the words asserted are the shipped ones. */
async function open(options: Options = {}) {
  const lang = options.lang ?? 'en';
  const table = (lang === 'ar' ? ar : en) as Record<string, string>;
  const locale = {
    lang: signal(lang),
    isRtl: signal(lang === 'ar'),
    t: (key: string, fallback = '') => table[key] ?? fallback,
    format: (key: string, values: Record<string, string | number>, fallback = '') =>
      Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), table[key] ?? fallback),
    toggle: () => {}
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(), provideHttpClientTesting(),
      provideRouter([{ path: 'teacher/earnings', component: TeacherEarningsPageComponent }, { path: '**', children: [] }]),
      LoadEarnings, LoadPayouts, LoadStatement, SavePayoutDetails, RequestWithdrawal,
      { provide: EARNINGS_GATEWAY, useValue: {
        balances: options.balances ?? (() => of<readonly Balance[]>([balance({ available: 200, pendingClearance: 127.5 })])),
        policy: options.policy ?? (() => of(POLICY)),
        statement: options.statement ?? (() => of<EarningsStatement>({ totals: [], items: [], totalItems: 0 })),
        payoutProfile: () => of(options.profile ?? null),
        withdrawals: () => of(options.withdrawals ?? []),
        savePayoutProfile: () => of(options.profile ?? null),
        requestWithdrawal: () => of(null)
      } },
      { provide: LocaleService, useValue: locale },
      { provide: SignalSessionStore, useValue: { current: signal({ userId: 'teacher-1', fullName: 'نورة' }), roles: signal(['Teacher']) } },
      { provide: SESSION_STORE, useValue: { current: () => ({ userId: 'teacher-1', fullName: 'نورة', roles: ['Teacher'] }) } }
    ]
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/teacher/earnings');
  await new Promise(resolve => setTimeout(resolve));
  harness.detectChanges();
  return harness.routeNativeElement as HTMLElement;
}

const testId = (page: HTMLElement, id: string) => page.querySelector(`[data-testid="${id}"]`);
const textOf = (page: HTMLElement, id: string) => testId(page, id)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('FIN-01 TeacherEarningsPageComponent', () => {
  it('leads with what can be withdrawn now, and quotes the minimum from the policy', async () => {
    const page = await open();
    expect(textOf(page, 'earnings-available')).toContain('Available to withdraw');
    expect(textOf(page, 'earnings-available')).toContain('200');
    expect(textOf(page, 'earnings-minimum')).toMatch(/The minimum withdrawal is\s*50/);
    // Without approved payout details the only action is to add them; nothing offers a withdrawal that cannot work.
    const actions = Array.from(page.querySelectorAll('main button')).map(b => b.textContent?.trim());
    expect(actions).toContain('Set up payout details');
    expect(page.textContent).not.toContain('Request withdrawal');
  });

  it('says what clearing money is waiting for, and when the next amount arrives', async () => {
    const page = await open({ balances: () => of([balance({ available: 0, pendingClearance: 127.5, nextClearanceAt: '2126-09-23T10:00:00Z' })]) });
    expect(textOf(page, 'earnings-clearing')).toContain('Becoming available');
    expect(textOf(page, 'earnings-clearing')).toContain('127.5');
    expect(textOf(page, 'earnings-clearing')).toContain('Then it moves to “Available to withdraw now” by itself.');
    expect(textOf(page, 'earnings-next')).toMatch(/The next amount becomes available on .+/);
    expect(textOf(page, 'earnings-why')).toContain('7 days');
  });

  it('says "soon" rather than a date in the past, and nothing when there is no date', async () => {
    const past = await open({ balances: () => of([balance({ pendingClearance: 100, nextClearanceAt: '2020-01-01T00:00:00Z' })]) });
    expect(textOf(past, 'earnings-next')).toBe('Becoming available soon');
    const none = await open({ balances: () => of([balance({ pendingClearance: 100 })]) });
    expect(testId(none, 'earnings-next')).toBeNull();
  });

  it('shows money on its way only when some is, and says how long it takes', async () => {
    const quiet = await open({ balances: () => of([balance({ available: 200 })]) });
    expect(testId(quiet, 'earnings-transferring')).toBeNull();
    const moving = await open({ balances: () => of([balance({ available: 10, pendingWithdrawal: 60 })]) });
    expect(textOf(moving, 'earnings-transferring')).toContain('Being sent to your bank');
    expect(textOf(moving, 'earnings-transferring')).toContain('within 3 business days');
  });

  it('tells a teacher under the minimum what they still need', async () => {
    const page = await open({ balances: () => of([balance({ available: 20 })]) });
    expect(textOf(page, 'earnings-minimum')).toMatch(/You need at least\s*50\s*to request a withdrawal\./);
    expect(textOf(page, 'earnings-minimum')).not.toContain('You can request a withdrawal');
  });

  it('does not promise a withdrawal to a teacher whose available balance is zero', async () => {
    const page = await open({ balances: () => of([balance({ pendingClearance: 170, nextClearanceAt: '2126-09-23T10:00:00Z' })]) });
    expect(textOf(page, 'earnings-available')).toContain('Available to withdraw');
    expect(testId(page, 'earnings-minimum')).toBeNull();
    expect(textOf(page, 'earnings-clearing')).toContain('170');
  });

  it('shows the empty state, not empty money cards, before the first completed work', async () => {
    const none = await open({ balances: () => of([]) });
    expect(textOf(none, 'earnings-empty')).toContain('No earnings yet');
    expect(textOf(none, 'earnings-empty')).toContain('Browse open requests');
    expect(none.querySelector('[data-testid=earnings-empty] a')?.getAttribute('href')).toBe('/teacher/opportunities');
    expect(testId(none, 'earnings-available')).toBeNull();
    const zeros = await open({ balances: () => of([balance()]) });
    expect(testId(zeros, 'earnings-empty')).not.toBeNull();
  });

  it('keeps the amounts when only the policy fails, and says so when the balances fail', async () => {
    const withoutPolicy = await open({ policy: () => throwError(() => new HttpErrorResponse({ status: 500 })) });
    expect(textOf(withoutPolicy, 'earnings-available')).toContain('200');
    expect(withoutPolicy.textContent).not.toContain('minimum withdrawal');
    expect(testId(withoutPolicy, 'earnings-error')).toBeNull();

    // A failed read must never read as a balance of zero.
    const failed = await open({ balances: () => throwError(() => new HttpErrorResponse({ status: 500 })) });
    expect(textOf(failed, 'earnings-error')).toContain('We couldn’t load your earnings.');
    expect(textOf(failed, 'earnings-error')).toContain('Retry');
    expect(testId(failed, 'earnings-available')).toBeNull();
    expect(testId(failed, 'earnings-empty')).toBeNull();
    expect(failed.textContent).not.toMatch(/\b0\b/);
  });

  it('shows a loading state before the first answer, without claiming a balance', async () => {
    TestBed.resetTestingModule();
    const page = await open({ balances: () => new Observable<readonly Balance[]>(() => {}) });
    expect(page.querySelector('[data-state=loading]')).not.toBeNull();
    expect(testId(page, 'earnings-available')).toBeNull();
    expect(testId(page, 'earnings-empty')).toBeNull();
  });

  it('reads in Arabic, with no ledger, maturity or escrow words in either language', async () => {
    const page = await open({ lang: 'ar', balances: () => of([balance({ available: 200, pendingClearance: 127.5, pendingWithdrawal: 60, nextClearanceAt: '2126-09-23T10:00:00Z' })]) });
    expect(textOf(page, 'earnings-available')).toContain('متاح للسحب');
    expect(textOf(page, 'earnings-clearing')).toContain('أرباح ستُتاح قريبًا');
    expect(textOf(page, 'earnings-clearing')).toContain('ثم تنتقل تلقائيًا إلى «متاح للسحب الآن»');
    expect(textOf(page, 'earnings-transferring')).toContain('قيد التحويل');
    expect(textOf(page, 'earnings-why')).toContain('لماذا لا يُتاح المبلغ فورًا؟');
    expect(textOf(page, 'earnings-why')).toContain('7 أيام');
    const main = page.querySelector('main')?.textContent ?? '';
    for (const word of ['ledger', 'escrow', 'maturity', 'pendingClearance', 'pendingWithdrawal', 'TeacherPending', 'account'])
      expect(main.toLowerCase()).not.toContain(word.toLowerCase());
    // The Arabic page shows no English product words at all (names and the SAR mark aside).
    expect(main.replace(/نورة/g, '')).not.toMatch(/[A-Za-z]{3,}/);
  });
});


/** FIN-02/03 (UX audit P0, UX-81): the teacher always has the next step towards being paid. */
describe('TeacherEarningsPageComponent — payouts', () => {
  const verified: PayoutProfile = { legalName: 'Noura', countryCode: 'SA', payoutMethod: 'bank_transfer', destinationLabel: 'Al Rajhi ••••1234',
    identityLast4: '9876', state: 'verified', rejectionReason: null, submittedAt: '2026-09-01T00:00:00Z', reenrollmentRequired: false };

  it('asks for payout details first when there are none', async () => {
    const page = await open();
    expect(page.querySelector('[data-testid=payout-missing]')).not.toBeNull();
    expect(page.querySelector('[data-testid=withdraw-open]')).toBeNull();
  });

  it('says the details are being checked while they are pending, and offers no withdrawal yet', async () => {
    const page = await open({ profile: { ...verified, state: 'pending' } });
    expect(page.querySelector('[data-testid=payout-pending]')?.textContent).toContain('Al Rajhi ••••1234');
    expect(page.querySelector('[data-testid=withdraw-open]')).toBeNull();
  });

  it('offers a withdrawal once the details are approved, and lists past withdrawals in words', async () => {
    const page = await open({ profile: verified, withdrawals: [{ id: 'w1', amount: 120, currency: 'SAR', state: 'requested', status: 0,
      destinationLabel: 'Al Rajhi ••••1234', rejectionReason: null, createdAt: '2026-09-20T10:00:00Z', updatedAt: null,
      transferInitiatedAt: null, transferredAt: null, bankReference: null }] });
    expect(page.querySelector('[data-testid=withdraw-open]')).not.toBeNull();
    const row = page.querySelector('[data-testid=withdrawal-row]')?.textContent ?? '';
    expect(row).toContain('Requested — being transferred');
    expect(row).not.toMatch(/Pending|status/);
  });
});


/** Finance transparency: where every riyal of the balance came from, in the server's numbers. */
describe('TeacherEarningsPageComponent — statement', () => {
  const verified: PayoutProfile = { legalName: 'Noura', countryCode: 'SA', payoutMethod: 'bank_transfer', destinationLabel: 'Demo Bank ••••7519',
    identityLast4: '9876', state: 'verified', rejectionReason: null, submittedAt: '2026-09-01T00:00:00Z', reenrollmentRequired: false };
  const transferred: Withdrawal = { id: 'w1', amount: 60, currency: 'SAR', state: 'transferred', status: 1, destinationLabel: 'Demo Bank ••••7519',
    rejectionReason: null, createdAt: '2026-09-28T10:00:00Z', updatedAt: null, transferInitiatedAt: '2026-09-29T10:00:00Z',
    transferredAt: '2026-09-30T10:00:00Z', bankReference: 'BANKREF-001' };
  // The seeded PreProduction scenario: 120 order, 15% = 18 commission, 102 earned, 60 transferred, 42 left.
  const statement = (over: Partial<EarningsStatement['totals'][number]> = {}): EarningsStatement => ({
    totals: [{ currency: 'SAR', earned: 102, available: 42, clearing: 0, inTransfer: 0, transferred: 60, transferredCount: 1, addsUp: true, ...over }],
    items: [{ kind: 'order', referenceId: 'o1', title: 'Calculus homework', earnedAt: '2026-09-17T10:00:00Z', price: 120,
      commissionPercent: 15, commission: 18, adjustment: 0, net: 102, currency: 'SAR', state: 'available', availableAt: null }],
    totalItems: 1
  });
  const seeded = (lang: 'ar' | 'en' = 'en', over: Partial<EarningsStatement['totals'][number]> = {}) => open({
    lang, profile: verified, withdrawals: [transferred], statement: () => of(statement(over)),
    balances: () => of([balance({ available: 42 })])
  });

  it('answers "why 42 after receiving 60" on the page itself', async () => {
    const page = await seeded();
    expect(textOf(page, 'earnings-available')).toContain('42');
    expect(textOf(page, 'earnings-transferred')).toContain('Already transferred to you');
    expect(textOf(page, 'earnings-transferred')).toContain('60');
    expect(textOf(page, 'earnings-transferred')).toContain('no longer part of your balance');
    const sum = textOf(page, 'earnings-explained');
    expect(sum).toMatch(/You have earned 102 .* in total/);
    expect(sum).toMatch(/60 .* of it is already in your bank\./);
    expect(sum).toMatch(/That leaves 42 .* to withdraw now\./);
  });

  it('breaks each earning into price, commission and net exactly as the server sent them', async () => {
    const row = textOf(await seeded(), 'earning-row');
    expect(row).toContain('Calculus homework');
    expect(row).toMatch(/Order price\s*120/);
    expect(row).toMatch(/Tafseel commission \(15%\)\s*−\s*18/);
    expect(row).toMatch(/Your earning\s*102/);
    expect(row).toContain('In your balance');
  });

  it('shows a completed withdrawal as history with its dates, destination and bank reference', async () => {
    const row = textOf(await seeded(), 'withdrawal-row');
    expect(row).toContain('Transferred');
    expect(row).toContain('Demo Bank ••••7519');
    expect(row).toContain('BANKREF-001');
    expect(row).toMatch(/Requested.*Transferred/);
  });

  it('does not show a sum the server could not reconcile', async () => {
    const page = await seeded('en', { addsUp: false });
    expect(testId(page, 'earnings-explained')).toBeNull();
    expect(testId(page, 'earning-row')).not.toBeNull();
  });

  it('keeps the balances when the statement cannot be read', async () => {
    const page = await open({ statement: () => throwError(() => new HttpErrorResponse({ status: 500 })) });
    expect(textOf(page, 'earnings-available')).toContain('200');
    expect(testId(page, 'earnings-explained')).toBeNull();
    expect(testId(page, 'earnings-error')).toBeNull();
  });

  it('reads naturally in Arabic', async () => {
    const page = await seeded('ar');
    expect(textOf(page, 'earnings-available')).toContain('متاح للسحب الآن');
    expect(textOf(page, 'earnings-transferred')).toContain('حُوِّل إليك سابقًا');
    expect(textOf(page, 'earnings-explained')).toContain('فيتبقى لك');
    expect(textOf(page, 'earning-row')).toContain('عمولة تفصيل (15٪)');
    expect(textOf(page, 'earning-row')).toContain('ربحك');
  });
});
