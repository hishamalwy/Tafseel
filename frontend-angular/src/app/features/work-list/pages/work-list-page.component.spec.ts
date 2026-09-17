import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it } from 'vitest';
import ar from '../../../../../public/locale/ar.json';
import en from '../../../../../public/locale/en.json';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { LocaleService } from '@core/i18n/locale.service';
import { DashboardGateway } from '@features/dashboards/services/dashboard.gateway';
import { NotificationsGateway } from '@features/navigation/services/notifications.gateway';
import { of } from 'rxjs';
import { WorkListPageComponent } from './work-list-page.component';

const soon = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

type Result = { source: string; payload: unknown; error?: string };

interface Options {
  readonly viewer?: 'student' | 'teacher';
  readonly url?: string;
  readonly lang?: 'ar' | 'en';
  readonly load?: (sources: readonly string[]) => Promise<readonly Result[]>;
}

const page = (items: readonly unknown[]) => ({ items, totalCount: items.length });

async function open(options: Options = {}) {
  const viewer = options.viewer ?? 'student';
  const lang = options.lang ?? 'en';
  const table = (lang === 'ar' ? ar : en) as Record<string, string>;
  const locale = {
    lang: signal(lang), isRtl: signal(lang === 'ar'),
    t: (key: string, fallback = '') => table[key] ?? fallback,
    format: (key: string, values: Record<string, string | number>, fallback = '') =>
      Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), table[key] ?? fallback),
    toggle: () => {}
  };
  const user = { userId: 'user-1', fullName: 'سارة', roles: [viewer === 'student' ? 'Student' : 'Teacher'] };
  const load = options.load ?? (async (sources: readonly string[]) => sources.map(source => ({ source, payload: page([]) })));

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(), provideHttpClientTesting(),
      provideRouter([{ path: '**', component: WorkListPageComponent, data: { viewer } }]),
      { provide: DashboardGateway, useValue: { load } },
      { provide: NotificationsGateway, useValue: { latest: () => of([]), markRead: () => of(void 0), markAllRead: () => of(void 0) } },
      { provide: LocaleService, useValue: locale },
      { provide: SignalSessionStore, useValue: { current: signal(user), roles: signal(user.roles) } },
      { provide: SESSION_STORE, useValue: { current: () => user } }
    ]
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(options.url ?? (viewer === 'student' ? '/student/requests' : '/teacher/work'));
  await new Promise(resolve => setTimeout(resolve));
  harness.detectChanges();
  return harness.routeNativeElement as HTMLElement;
}

const testId = (root: HTMLElement, id: string) => root.querySelector(`[data-testid="${id}"]`);
const textOf = (root: HTMLElement, id: string) => testId(root, id)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const chips = (root: HTMLElement) => [...root.querySelectorAll('[data-testid="work-chip"]')];
const titles = (root: HTMLElement) => [...root.querySelectorAll('[data-testid="work-item"] h2')].map(h => h.textContent?.trim());

const student = async (options: Options = {}) => open({ ...options, viewer: 'student' });

describe('UX-03 one list of requests, orders and sessions', () => {
  it('offers the four chips and starts on All', async () => {
    const root = await student();
    expect(chips(root).map(c => c.textContent?.trim())).toEqual(['All', 'Needs action', 'In progress', 'Finished']);
    expect(chips(root).find(c => c.getAttribute('aria-pressed') === 'true')?.getAttribute('data-chip')).toBe('all');
  });

  it('shows all three kinds in one list, each opening its own screen', async () => {
    const root = await student({ load: async sources => sources.map(source => ({
      source,
      payload: source.startsWith('/learning-requests') ? page([{ id: 'r1', title: 'Chain rule', status: 0, createdAt: soon(-60) }])
        : source.startsWith('/orders') ? page([{ id: 'o1', requestTitle: 'Essay', status: 1, paymentStatus: 1, createdAt: soon(-30), agreedDeliveryAt: soon(2880) }])
          : page([{ id: 's1', title: 'Integrals', status: 1, startsAt: soon(240), endsAt: soon(300), createdAt: soon(-10) }])
    })) });
    expect(titles(root)).toHaveLength(3);
    const links = [...root.querySelectorAll('[data-testid="row-open"]')].map(a => a.getAttribute('href'));
    expect(links).toEqual(expect.arrayContaining(['/requests/r1', '/orders/o1', '/live-sessions/s1']));
  });

  it('opens on Needs action when a link says so, and shows only what needs the reader', async () => {
    const root = await student({
      url: '/student/requests?view=action',
      load: async sources => sources.map(source => ({
        source,
        payload: source.startsWith('/orders')
          ? page([
            { id: 'pay', requestTitle: 'Pay me', status: 0, paymentStatus: 0, createdAt: soon(-60) },
            { id: 'running', requestTitle: 'Running', status: 1, paymentStatus: 1, createdAt: soon(-30), agreedDeliveryAt: soon(2880) }
          ])
          : page([])
      }))
    });
    expect(chips(root).find(c => c.getAttribute('aria-pressed') === 'true')?.getAttribute('data-chip')).toBe('action');
    expect(titles(root)).toEqual(['Pay me']);
  });

  it('says the section is empty in the words of the chip, and offers the way to start', async () => {
    const root = await student({ url: '/student/requests?view=action' });
    expect(textOf(root, 'work-empty')).toContain('Nothing needs action right now.');
    expect(testId(root, 'work-empty')?.querySelector('a')?.getAttribute('href')).toBe('/requests/new');
  });

  it('says so when one list failed, and errors only when they all did', async () => {
    const partial = await student({ load: async sources => sources.map((source, index) =>
      (index === 0 ? { source, payload: null, error: 'Request failed' } : { source, payload: page([]) })) });
    expect(textOf(partial, 'work-partial')).toContain('Some of your items couldn’t load.');
    expect(testId(partial, 'work-error')).toBeNull();

    const failed = await student({ load: async sources => sources.map(source => ({ source, payload: null, error: 'Request failed' })) });
    expect(textOf(failed, 'work-error')).toContain('We couldn’t load your items.');
  });

  it('reads the teacher’s own assignments, in Arabic, under its own name', async () => {
    const root = await open({
      viewer: 'teacher', lang: 'ar',
      load: async sources => {
        expect(sources.some(source => source.startsWith('/learning-requests/assigned'))).toBe(true);
        expect(sources.some(source => source.startsWith('/orders/assigned'))).toBe(true);
        return sources.map(source => ({ source, payload: page([]) }));
      }
    });
    expect(root.querySelector('h1')?.textContent?.trim()).toBe('أعمالي');
    expect(chips(root).map(c => c.textContent?.trim())).toEqual(['الكل', 'يحتاج إجراء', 'جارية', 'منتهية']);
    expect(testId(root, 'work-empty')?.querySelector('a')?.getAttribute('href')).toBe('/teacher/opportunities');
  });
});
