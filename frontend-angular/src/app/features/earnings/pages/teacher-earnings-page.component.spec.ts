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
import { Balance, WithdrawalPolicy } from '../models/earnings';
import { EARNINGS_GATEWAY } from '../services/earnings.ports';
import { LoadEarnings } from '../services/earnings.use-cases';
import { TeacherEarningsPageComponent } from './teacher-earnings-page.component';

const POLICY: WithdrawalPolicy = { minimumAmount: 50, currency: 'SAR', expectedSettlementBusinessDays: 3 };
const balance = (over: Partial<Balance> = {}): Balance =>
  ({ currency: 'SAR', available: 0, pendingWithdrawal: 0, pendingClearance: 0, nextClearanceAt: null, ...over });

interface Options {
  readonly balances?: () => Observable<readonly Balance[]>;
  readonly policy?: () => Observable<WithdrawalPolicy>;
  readonly lang?: 'ar' | 'en';
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
      LoadEarnings,
      { provide: EARNINGS_GATEWAY, useValue: {
        balances: options.balances ?? (() => of<readonly Balance[]>([balance({ available: 200, pendingClearance: 127.5 })])),
        policy: options.policy ?? (() => of(POLICY))
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
    // FIN-03 owns requesting a withdrawal; until it exists the page offers no button that cannot work.
    expect(page.querySelectorAll('main button, main [role=button]').length).toBe(0);
    expect(page.textContent).not.toContain('Request withdrawal');
  });

  it('says what clearing money is waiting for, and when the next amount arrives', async () => {
    const page = await open({ balances: () => of([balance({ available: 0, pendingClearance: 127.5, nextClearanceAt: '2126-09-23T10:00:00Z' })]) });
    expect(textOf(page, 'earnings-clearing')).toContain('Clearing');
    expect(textOf(page, 'earnings-clearing')).toContain('127.5');
    expect(textOf(page, 'earnings-clearing')).toContain('Becomes available to withdraw once the objection period ends.');
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
    expect(textOf(moving, 'earnings-transferring')).toContain('Being transferred');
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
    expect(textOf(page, 'earnings-clearing')).toContain('قيد الإتاحة');
    expect(textOf(page, 'earnings-clearing')).toContain('يصبح متاحًا للسحب بعد انتهاء فترة الاعتراض.');
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
