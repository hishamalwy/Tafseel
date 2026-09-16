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
import { Balance } from '@features/earnings/models/earnings';
import { OnboardingState } from '@features/teacher-setup/models/readiness';
import { ONBOARDING } from '../models/setup-card';
import { Row } from '../models/teacher-home';
import { OpportunityPage, TEACHER_HOME_GATEWAY } from '../services/teacher-home.ports';
import { LoadTeacherHome } from '../services/teacher-home.use-cases';
import { TeacherHomePageComponent } from './teacher-home-page.component';

const soon = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
const fail = <T,>() => throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Server Error' })) as Observable<T>;
const pending = <T,>() => new Observable<T>(() => {});

const published: OnboardingState = {
  status: ONBOARDING.Published, emailConfirmed: true, approvedSubjectIds: ['s1'], profileComplete: true,
  hasActiveService: true, hasAvailability: true, hasPublicSample: false, isPublished: true,
  readyForPublication: false, blockingReasons: [], missingRequirements: []
};
const onboarding = (over: Partial<OnboardingState> = {}): OnboardingState => ({ ...published, ...over });

interface Options {
  readonly onboarding?: () => Observable<OnboardingState>;
  readonly requests?: () => Observable<readonly Row[]>;
  readonly orders?: () => Observable<readonly Row[]>;
  readonly sessions?: () => Observable<readonly Row[]>;
  readonly opportunities?: () => Observable<OpportunityPage>;
  readonly balances?: () => Observable<readonly Balance[]>;
  readonly lang?: 'ar' | 'en';
}

/** Counts what the page actually asked the server for, so suppression can be asserted. */
interface Calls { onboarding: number; requests: number; orders: number; sessions: number; opportunities: number; balances: number }

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
  const teacher = { userId: 'teacher-1', fullName: 'نورة الحربي', roles: ['Teacher'] };
  const calls: Calls = { onboarding: 0, requests: 0, orders: 0, sessions: 0, opportunities: 0, balances: 0 };
  const count = <T,>(key: keyof Calls, run: () => Observable<T>) => () => { calls[key]++; return run(); };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(), provideHttpClientTesting(),
      provideRouter([{ path: 'teacher/home', component: TeacherHomePageComponent }, { path: '**', children: [] }]),
      LoadTeacherHome,
      { provide: TEACHER_HOME_GATEWAY, useValue: {
        onboarding: count('onboarding', options.onboarding ?? (() => of(published))),
        waitingRequests: count('requests', options.requests ?? (() => of<readonly Row[]>([]))),
        assignedOrders: count('orders', options.orders ?? (() => of<readonly Row[]>([]))),
        sessions: count('sessions', options.sessions ?? (() => of<readonly Row[]>([]))),
        opportunities: count('opportunities', options.opportunities ?? (() => of<OpportunityPage>({ items: [], totalCount: 0 }))),
        balances: count('balances', options.balances ?? (() => of<readonly Balance[]>([])))
      } },
      { provide: LocaleService, useValue: locale },
      { provide: SignalSessionStore, useValue: { current: signal(teacher), roles: signal(['Teacher']) } },
      { provide: SESSION_STORE, useValue: { current: () => teacher } }
    ]
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/teacher/home');
  await new Promise(resolve => setTimeout(resolve));
  harness.detectChanges();
  return { page: harness.routeNativeElement as HTMLElement, calls };
}

const testId = (page: HTMLElement, id: string) => page.querySelector(`[data-testid="${id}"]`);
const textOf = (page: HTMLElement, id: string) => testId(page, id)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const hrefs = (page: HTMLElement) => [...page.querySelectorAll('a[href]')].map(a => a.getAttribute('href') ?? '');

describe('UX-02 TeacherHomePageComponent', () => {
  it('shows a placeholder while readiness is still being read', async () => {
    const { page } = await open({ onboarding: pending });
    expect(page.querySelector('[data-state="loading"]')).not.toBeNull();
    expect(testId(page, 'home-setup')).toBeNull();
    expect(testId(page, 'home-actions')).toBeNull();
  });

  it('tells an unpublished teacher the one thing to fix, and asks the server for nothing else while they apply', async () => {
    const { page, calls } = await open({
      onboarding: () => of(onboarding({
        status: ONBOARDING.ApplicationRequired, approvedSubjectIds: [], profileComplete: false,
        hasActiveService: false, isPublished: false,
        blockingReasons: ['qualification_required', 'profile_incomplete', 'profile_not_published']
      }))
    });
    expect(textOf(page, 'home-setup')).toContain('Apply to teach your subject');
    expect((testId(page, 'home-setup-cta') as HTMLAnchorElement).getAttribute('href')).toBe('/teach/apply');
    expect(textOf(page, 'home-steps-left')).toBe('Steps left: 2');
    // Nothing else is worth showing — or asking for — before the quality team decides.
    expect(calls).toMatchObject({ onboarding: 1, requests: 0, orders: 0, sessions: 0, opportunities: 0, balances: 0 });
    expect(testId(page, 'home-actions')).toBeNull();
    expect(testId(page, 'home-opportunities')).toBeNull();
    expect(testId(page, 'home-earnings')).toBeNull();
  });

  it('keeps an unpublished teacher’s paid work visible under the setup card, but not open requests', async () => {
    const { page, calls } = await open({
      onboarding: () => of(onboarding({ isPublished: false, hasActiveService: false, blockingReasons: ['active_service_required', 'profile_not_published'] })),
      orders: () => of([{ id: 'o1', requestTitle: 'Chain rule', status: 0, paymentStatus: 1, teacherNet: 153, currency: 'SAR', createdAt: soon(-60) }]),
      balances: () => of([{ currency: 'SAR', available: 0, pendingWithdrawal: 0, pendingClearance: 120, nextClearanceAt: soon(10_000) }])
    });
    expect(textOf(page, 'home-setup')).toContain('Turn on at least one service');
    expect(textOf(page, 'home-actions')).toContain('Paid — start the work');
    expect(textOf(page, 'home-earnings')).toContain('Clearing');
    // Students cannot find this teacher yet, so they are not offered work they cannot win.
    expect(testId(page, 'home-opportunities')).toBeNull();
    expect(calls.opportunities).toBe(0);
    // The setup card owns the only filled button while the teacher is invisible.
    expect([...page.querySelectorAll('a.tf-button:not(.tf-button-secondary)')].map(a => a.getAttribute('data-testid')))
      .toEqual(['home-setup-cta']);
  });

  it('gives a new approved teacher one job and nothing else to read', async () => {
    const { page } = await open({
      onboarding: () => of(onboarding({
        status: ONBOARDING.ApprovedButProfileIncomplete, profileComplete: false, hasActiveService: false, isPublished: false,
        blockingReasons: ['profile_incomplete', 'active_service_required', 'profile_not_published']
      }))
    });
    expect(textOf(page, 'home-setup')).toContain('Complete your profile');
    expect(textOf(page, 'home-steps-left')).toBe('Steps left: 2');
    // No work, no open requests, no earnings: empty sections would only dilute the one thing to do.
    expect(testId(page, 'home-actions')).toBeNull();
    expect(testId(page, 'home-opportunities')).toBeNull();
    expect(testId(page, 'home-earnings')).toBeNull();
  });

  it('leads a published teacher with the work waiting, in the ticket’s order, and no setup card', async () => {
    const { page } = await open({
      requests: () => of([{ id: 'r1', title: 'Limits', status: 0, clarifications: [], createdAt: soon(-120), studentDisplayNameEnglish: 'Sara' }]),
      orders: () => of([{ id: 'o1', requestTitle: 'Chain rule', status: 0, paymentStatus: 1, teacherNet: 153, currency: 'SAR', createdAt: soon(-60) }])
    });
    expect(testId(page, 'home-setup')).toBeNull();
    expect(textOf(page, 'home-greeting')).toBe('Hi نورة');
    const cards = [...page.querySelectorAll('[data-testid="home-action-card"]')];
    expect(cards.map(card => card.querySelector('h3')?.textContent?.trim()))
      .toEqual(['Paid — start the work', 'New request from Sara']);
    const ctas = [...page.querySelectorAll('[data-testid="home-card-cta"]')];
    expect(ctas.map(a => a.className)).toEqual(['tf-button', 'tf-button tf-button-secondary']);
    expect(ctas.map(a => a.getAttribute('href'))).toEqual(['/orders/o1', '/requests/r1']);
    // The amount is the teacher's own net, drawn with the riyal mark rather than the letters.
    expect(textOf(page, 'home-card-amount')).toBe('Your earnings 153');
    expect(page.textContent).not.toContain('SAR');
  });

  it('previews open requests and the next session, each opening its own screen', async () => {
    const { page } = await open({
      opportunities: () => of({ items: [
        { id: 'p1', title: 'Limits worksheet', deadline: soon(4320), budgetMin: 90, budgetMax: 200, currency: 'SAR',
          serviceNameEnglish: 'Recorded explanation', subjectName: 'Calculus', myOffer: null },
        { id: 'p2', title: 'Already offered', deadline: soon(60), myOffer: { id: 'offer-1' } }
      ], totalCount: 7 }),
      sessions: () => of([{ id: 's1', title: 'Integrals', status: 1, startsAt: soon(240), endsAt: soon(300),
        createdAt: soon(-600), studentDisplayNameEnglish: 'Sara' }])
    });
    const previews = [...page.querySelectorAll('[data-testid="home-opportunity"]')];
    expect(previews).toHaveLength(1);
    expect(previews[0].textContent).toContain('Limits worksheet');
    expect(textOf(page, 'home-opportunity-budget')).toBe('Budget 90 – 200');
    expect(textOf(page, 'home-see-opportunities')).toBe('See all (7)');
    expect(hrefs(page)).toEqual(expect.arrayContaining([
      '/teacher/opportunities/p1', '/teacher/opportunities', '/live-sessions/s1', '/teacher/work', '/teacher/earnings'
    ]));
    expect(textOf(page, 'home-upcoming')).toContain('Your next session');
  });

  it('says a section could not be read instead of pretending it was empty', async () => {
    const { page } = await open({ orders: fail, opportunities: fail, balances: fail });
    expect(textOf(page, 'home-work-error')).toContain('Couldn’t load.');
    expect(textOf(page, 'home-opportunities-error')).toContain('Couldn’t load.');
    expect(textOf(page, 'home-earnings-error')).toContain('Couldn’t load.');
    // None of the three is allowed to read as "nothing to do" or as no money.
    expect(testId(page, 'home-nothing-needed')).toBeNull();
    expect(testId(page, 'home-no-opportunities')).toBeNull();
    expect(testId(page, 'home-no-earnings')).toBeNull();
    expect(page.textContent).not.toContain('500');
  });

  it('refuses to guess the teacher’s standing when readiness itself fails', async () => {
    const { page } = await open({ onboarding: fail });
    expect(textOf(page, 'home-error')).toContain('We couldn’t load your home.');
    expect(page.textContent).not.toContain('HttpErrorResponse');
    expect(testId(page, 'home-setup')).toBeNull();
    expect(testId(page, 'home-actions')).toBeNull();
  });

  it('greets a published teacher with nothing to do without inventing lists', async () => {
    const { page } = await open();
    expect(textOf(page, 'home-nothing-needed')).toBe('Nothing needs your attention right now.');
    expect(textOf(page, 'home-no-opportunities')).toBe('No open requests match your services right now.');
    expect(textOf(page, 'home-no-earnings')).toBe('No earnings yet');
    expect(testId(page, 'home-upcoming')).toBeNull();
    // Home is not the entity explorer: no grid, no search box, no Refresh.
    expect(page.querySelectorAll('.tf-dashboard-grid, .tf-dashboard-search, .tf-dashboard-card').length).toBe(0);
  });

  it('reads in Arabic, with money in FIN-01’s words and no internal terms', async () => {
    const { page } = await open({
      lang: 'ar',
      orders: () => of([{ id: '3a0b9c22-1f4d-4a77-8a0f-0e1d2c3b4a59', requestTitle: 'قاعدة السلسلة', status: 3,
        paymentStatus: 1, agreedDeliveryAt: soon(2880), createdAt: soon(-60), studentDisplayName: 'سارة' }]),
      balances: () => of([{ currency: 'SAR', available: 340, pendingWithdrawal: 0, pendingClearance: 127.5, nextClearanceAt: soon(10_000) }])
    });
    expect(textOf(page, 'home-greeting')).toBe('أهلًا نورة');
    expect(textOf(page, 'home-actions')).toContain('يحتاج انتباهك');
    expect(textOf(page, 'home-actions')).toContain('الطالب طلب تعديلًا');
    expect(textOf(page, 'home-available')).toContain('متاح للسحب');
    expect(textOf(page, 'home-clearing')).toContain('قيد الإتاحة');
    expect(textOf(page, 'home-next-clearance')).toContain('أقرب مبلغ يصبح متاحًا في');
    const shown = page.textContent ?? '';
    expect(shown).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(shown).not.toMatch(/\bnull\b|\bundefined\b|\bNaN\b|\[object/);
    expect(shown).not.toMatch(/ledger|escrow|maturity|onboarding|pendingClearance|SAR/i);
  });
});
