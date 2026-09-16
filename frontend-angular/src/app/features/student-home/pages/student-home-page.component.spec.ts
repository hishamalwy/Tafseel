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
import { Row } from '../models/student-home';
import { STUDENT_HOME_GATEWAY } from '../services/student-home.ports';
import { LoadStudentHome } from '../services/student-home.use-cases';
import { StudentHomePageComponent } from './student-home-page.component';

const soon = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
const failure = () => throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Server Error' }));
/** A read that is still in flight. */
const pending = () => new Observable<readonly Row[]>(() => {});

interface Options {
  readonly requests?: () => Observable<readonly Row[]>;
  readonly orders?: () => Observable<readonly Row[]>;
  readonly sessions?: () => Observable<readonly Row[]>;
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
  const student = { userId: 'student-1', fullName: 'سارة الحربي', roles: ['Student'] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(), provideHttpClientTesting(),
      provideRouter([{ path: 'student/overview', component: StudentHomePageComponent }, { path: '**', children: [] }]),
      LoadStudentHome,
      { provide: STUDENT_HOME_GATEWAY, useValue: {
        requests: options.requests ?? (() => of<readonly Row[]>([])),
        orders: options.orders ?? (() => of<readonly Row[]>([])),
        sessions: options.sessions ?? (() => of<readonly Row[]>([]))
      } },
      { provide: LocaleService, useValue: locale },
      { provide: SignalSessionStore, useValue: { current: signal(student), roles: signal(['Student']) } },
      { provide: SESSION_STORE, useValue: { current: () => student } }
    ]
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/student/overview');
  await new Promise(resolve => setTimeout(resolve));
  harness.detectChanges();
  return harness.routeNativeElement as HTMLElement;
}

const testId = (page: HTMLElement, id: string) => page.querySelector(`[data-testid="${id}"]`);
const textOf = (page: HTMLElement, id: string) => testId(page, id)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const hrefs = (page: HTMLElement) => [...page.querySelectorAll('a[href]')].map(a => a.getAttribute('href') ?? '');

describe('UX-01 StudentHomePageComponent', () => {
  it('shows a placeholder while the lists are still loading, and never an empty home', async () => {
    const page = await open({ requests: pending, orders: pending, sessions: pending });
    expect(page.querySelector('[data-state="loading"]')).not.toBeNull();
    expect(page.textContent).toContain('Loading');
    expect(testId(page, 'home-welcome')).toBeNull();
    expect(testId(page, 'home-actions')).toBeNull();
  });

  it('welcomes a brand-new student by name and offers the two ways to start', async () => {
    const page = await open();
    expect(textOf(page, 'home-welcome')).toBe('Welcome, سارة. How can we help today?');
    expect(textOf(page, 'home-find-teacher')).toContain('Find a teacher');
    expect(textOf(page, 'home-post-request')).toContain('Post a request');
    expect(hrefs(page)).toEqual(expect.arrayContaining(['/teachers', '/requests/new']));
    // Nothing is waiting, so the page does not pretend otherwise — and shows no entity lists.
    expect(testId(page, 'home-actions')).toBeNull();
    expect(testId(page, 'home-current')).toBeNull();
    expect(testId(page, 'home-nothing-needed')).toBeNull();
  });

  it('leads with the one thing waiting, as a single filled button that opens checkout', async () => {
    const page = await open({
      orders: () => of([{ id: 'o1', requestTitle: 'Chain rule', status: 0, paymentStatus: 0, studentTotal: 162, currency: 'SAR',
        teacherDisplayNameEnglish: 'Noura', createdAt: soon(-30) }]),
      sessions: () => of([{ id: 's1', title: 'Integrals', status: 1, startsAt: soon(240), endsAt: soon(300), createdAt: soon(-60),
        teacherDisplayNameEnglish: 'Noura' }])
    });
    expect(textOf(page, 'home-greeting')).toBe('Hi سارة');
    const cards = [...page.querySelectorAll('[data-testid="home-action-card"]')];
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain('The teacher accepted — complete payment');
    // The amount is drawn with the riyal mark, never the letters "SAR" in the middle of a sentence.
    expect(textOf(page, 'home-card-amount')).toBe('Amount 162');
    expect(page.textContent).not.toContain('SAR');
    const cta = testId(page, 'home-card-cta') as HTMLAnchorElement;
    expect(cta.getAttribute('href')).toBe('/checkout?orderId=o1');
    expect(cta.className).toBe('tf-button');
    // The next session is answer 3, below the action, and opens the session itself.
    expect(textOf(page, 'home-upcoming')).toContain('Your next session');
    expect((testId(page, 'home-session-open') as HTMLAnchorElement).getAttribute('href')).toBe('/live-sessions/s1');
  });

  it('counts a payment hold down to the second, and only the first action is a filled button', async () => {
    const page = await open({
      requests: () => of([
        { id: 'r1', title: 'Chain rule', status: 6, paymentReservationExpiresAt: soon(3), createdAt: soon(-60) },
        { id: 'r2', title: 'Limits', status: 1, createdAt: soon(-50) }
      ])
    });
    expect(textOf(page, 'home-countdown')).toMatch(/^The hold ends in [0-2]:\d\d$/);
    const ctas = [...page.querySelectorAll('[data-testid="home-card-cta"]')];
    expect(ctas.map(a => a.className)).toEqual(['tf-button', 'tf-button tf-button-secondary']);
    expect(ctas.map(a => a.getAttribute('href'))).toEqual(['/checkout?learningRequestId=r1', '/requests/r2']);
  });

  it('says so when a list fails, instead of claiming nothing needs the student', async () => {
    const page = await open({
      requests: failure,
      orders: () => of([{ id: 'o1', requestTitle: 'Chain rule', status: 1, paymentStatus: 1, teacherDisplayNameEnglish: 'Noura',
        createdAt: soon(-30) }])
    });
    expect(textOf(page, 'home-partial')).toContain('Some of your items couldn’t load.');
    expect(textOf(page, 'home-current')).toContain('Chain rule');
    expect(textOf(page, 'home-nothing-needed')).toBe('Nothing needs your attention right now.');
    expect(testId(page, 'home-error')).toBeNull();
  });

  it('shows one honest error, not a server exception, when nothing can be read', async () => {
    const page = await open({ requests: failure, orders: failure, sessions: failure });
    expect(textOf(page, 'home-error')).toContain('We couldn’t load your home.');
    expect(page.textContent).not.toContain('HttpErrorResponse');
    expect(page.textContent).not.toContain('500');
    expect(testId(page, 'home-welcome')).toBeNull();
    expect(testId(page, 'home-actions')).toBeNull();
  });

  it('reads in Arabic with product words only — no ids, statuses or technical fields', async () => {
    const page = await open({
      lang: 'ar',
      requests: () => of([{ id: '8f14e45f-ceea-467a-9575-3b1f3f0f5a21', title: 'قاعدة السلسلة', status: 1, createdAt: soon(-60),
        teacherDisplayName: 'نورة' }]),
      orders: () => of([
        { id: '3a0b9c22-1f4d-4a77-8a0f-0e1d2c3b4a59', requestTitle: 'التفاضل', status: 1, paymentStatus: 1,
          learningRequestId: 'x', teacherDisplayName: 'نورة', createdAt: soon(-30) },
        { id: '7c2e1b08-55aa-4f31-9b0e-6d4c2a1f8e33', requestTitle: 'النهايات', status: 0, paymentStatus: 0,
          studentTotal: 250, currency: 'SAR', learningRequestId: 'y', teacherDisplayName: 'نورة', createdAt: soon(-20) }
      ])
    });
    expect(textOf(page, 'home-greeting')).toBe('أهلًا سارة');
    expect(textOf(page, 'home-actions')).toContain('يحتاج انتباهك');
    expect(textOf(page, 'home-actions')).toContain('المعلم لديه سؤال');
    expect(textOf(page, 'home-current')).toContain('قيد التنفيذ');
    expect(textOf(page, 'home-card-amount')).toBe('المبلغ 250');
    expect(textOf(page, 'home-start')).toContain('ابدأ طلبًا جديدًا');
    const shown = page.textContent ?? '';
    expect(shown).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(shown).not.toMatch(/\bnull\b|\bundefined\b|\bNaN\b|\[object/);
    expect(shown).not.toMatch(/status|paymentStatus|learningRequestId|GUID|Id\b/);
  });

  it('routes every card to the item’s own screen, never to a dashboard section', async () => {
    const page = await open({
      requests: () => of([{ id: 'r1', title: 'Chain rule', status: 5, offerCount: 2, sourcingMode: 1, createdAt: soon(-60) }]),
      orders: () => of([{ id: 'o1', requestTitle: 'Essay', status: 1, paymentStatus: 1, learningRequestId: 'x',
        teacherDisplayNameEnglish: 'Noura', createdAt: soon(-30) }]),
      sessions: () => of([{ id: 's1', title: 'Integrals', status: 1, startsAt: soon(240), endsAt: soon(300), createdAt: soon(-60),
        teacherDisplayNameEnglish: 'Noura' }])
    });
    expect(hrefs(page)).toEqual(expect.arrayContaining([
      '/requests/r1/offers', '/orders/o1', '/live-sessions/s1', '/student/requests', '/teachers', '/requests/new'
    ]));
    // "See all my requests" is the one link to a list; every card itself goes to the item, never to a
    // dashboard section — the item screen is what owns the business action.
    const cards = [...page.querySelectorAll('[data-testid="home-card-cta"], [data-testid="home-card-open"], [data-testid="home-session-open"]')];
    expect(cards.length).toBe(3);
    expect(cards.every(a => !(a.getAttribute('href') ?? '').startsWith('/student/'))).toBe(true);
  });
});
