import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';
import ar from '../../../../../public/locale/ar.json';
import en from '../../../../../public/locale/en.json';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { LocaleService } from '@core/i18n/locale.service';
import { DashboardRole } from '@features/dashboards/models/dashboard';
import { AccountMenuComponent } from './account-menu.component';
import { NotificationBellComponent } from './notification-bell.component';
import { WorkspaceNavComponent } from './workspace-nav.component';
import { Notification, NotificationsGateway } from '../services/notifications.gateway';

@Component({
  selector: 'tf-nav-host',
  imports: [AccountMenuComponent, NotificationBellComponent, WorkspaceNavComponent],
  template: `
    <tf-workspace-nav [role]="role" />
    <tf-notification-bell />
    <tf-account-menu [role]="role" />
  `
})
class NavHostComponent {
  readonly role = inject(ActivatedRoute).snapshot.data['role'] as DashboardRole;
}

const notification = (over: Partial<Notification> = {}): Notification => ({
  id: 'n1', type: 'PaymentConfirmed', title: 'Order paid', body: 'The student paid.',
  link: '/orders/8f14e45f', createdAt: new Date().toISOString(), read: false, ...over
});

interface Options {
  readonly role?: DashboardRole;
  readonly url?: string;
  readonly lang?: 'ar' | 'en';
  readonly latest?: () => Observable<readonly Notification[]>;
}

async function open(options: Options = {}) {
  const lang = options.lang ?? 'en';
  const table = (lang === 'ar' ? ar : en) as Record<string, string>;
  const locale = {
    lang: signal(lang), isRtl: signal(lang === 'ar'),
    t: (key: string, fallback = '') => table[key] ?? fallback,
    format: (key: string, values: Record<string, string | number>, fallback = '') =>
      Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), table[key] ?? fallback),
    toggle: () => {}
  };
  const user = { userId: 'user-1', fullName: 'نورة الحربي', roles: [options.role ?? 'Student'] };
  const read: string[] = [];

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(), provideHttpClientTesting(),
      provideRouter([{ path: '**', component: NavHostComponent, data: { role: options.role ?? 'Student' } }]),
      { provide: NotificationsGateway, useValue: {
        latest: options.latest ?? (() => of<readonly Notification[]>([])),
        markRead: (id: string) => { read.push(id); return of(void 0); },
        markAllRead: () => { read.push('*'); return of(void 0); }
      } },
      { provide: LocaleService, useValue: locale },
      { provide: SignalSessionStore, useValue: { current: signal(user), roles: signal(user.roles) } },
      { provide: SESSION_STORE, useValue: { current: () => user } }
    ]
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(options.url ?? '/student/overview', NavHostComponent);
  await new Promise(resolve => setTimeout(resolve));
  harness.detectChanges();
  return { page: harness.routeNativeElement as HTMLElement, read };
}

const items = (page: HTMLElement) => [...page.querySelectorAll('[data-testid="nav-item"]')];
const labels = (page: HTMLElement) => items(page).map(a => a.textContent?.trim() ?? '');
const current = (page: HTMLElement) => items(page).find(a => a.getAttribute('aria-current') === 'page')?.getAttribute('data-nav') ?? '';
const testId = (page: HTMLElement, id: string) => page.querySelector(`[data-testid="${id}"]`);

describe('UX-03 workspace navigation', () => {
  it('shows the student exactly five destinations, with canonical links', async () => {
    const { page } = await open();
    expect(labels(page)).toEqual(['Home', 'Find a teacher', 'Post a request', 'My requests & orders', 'Messages']);
    expect(items(page).map(a => a.getAttribute('href'))).toEqual([
      '/student/overview', '/teachers', '/requests/new', '/student/requests', '/messages'
    ]);
    expect(current(page)).toBe('home');
    // The retired destinations are not offered anywhere in the list.
    const html = page.innerHTML;
    for (const gone of ['/student/payments', '/student/saved', '/student/sessions', '/student/reviews',
      '/student/notifications', '/student/settings'])
      expect(html).not.toContain(gone);
  });

  it('shows the teacher six, and unfolds the setup group only on its own pages', async () => {
    const { page } = await open({ role: 'Teacher', url: '/teacher/home' });
    expect(labels(page)).toEqual(['Home', 'Work', 'Open requests', 'Messages', 'Earnings', 'My teaching setup']);
    expect(current(page)).toBe('home');
    expect(testId(page, 'nav-children')).toBeNull();

    const inside = await open({ role: 'Teacher', url: '/teacher/services' });
    expect(current(inside.page)).toBe('setup');
    const children = [...inside.page.querySelectorAll('[data-testid="nav-child"]')];
    expect(children.map(a => a.getAttribute('href'))).toEqual([
      '/teacher/profile', '/teacher/services', '/teacher/availability', '/teacher/qualifications', '/teacher/publication'
    ]);
    expect(children.find(a => a.getAttribute('aria-current') === 'page')?.getAttribute('data-nav')).toBe('services');
  });

  it('keeps an item opened from elsewhere under the destination it belongs to', async () => {
    expect(current((await open({ url: '/orders/8f14e45f' })).page)).toBe('my_requests');
    expect(current((await open({ url: '/live-sessions/8f14e45f' })).page)).toBe('my_requests');
    expect(current((await open({ url: '/requests/new' })).page)).toBe('post_request');
    expect(current((await open({ role: 'Teacher', url: '/orders/8f14e45f' })).page)).toBe('work');
    expect(current((await open({ role: 'Teacher', url: '/teacher/opportunities/8f14e45f' })).page)).toBe('open_requests');
  });

  it('gives quality two destinations and admin six areas', async () => {
    const quality = await open({ role: 'QualityReviewer', url: '/quality/applications' });
    expect(labels(quality.page)).toEqual(['Applications', 'Account']);
    const admin = await open({ role: 'Admin', url: '/admin/home' });
    expect(labels(admin.page)).toEqual(['Attention', 'People', 'Catalog & marketing', 'Operations', 'Finance', 'Audit']);
    // Hidden V1.1 areas are nowhere in the navigation.
    for (const gone of ['/admin/insights', '/quality/showcases'])
      expect(admin.page.innerHTML + quality.page.innerHTML).not.toContain(gone);
  });

  it('reads in Arabic, with no English word in the navigation', async () => {
    const { page } = await open({ lang: 'ar', role: 'Teacher', url: '/teacher/home' });
    expect(labels(page)).toEqual(['الرئيسية', 'أعمالي', 'طلبات مفتوحة', 'الرسائل', 'أرباحي', 'إعداد ملفي']);
    expect(labels(page).join(' ')).not.toMatch(/[A-Za-z]{3,}/);
  });

  it('shows the bell without a dot when everything has been read', async () => {
    const { page } = await open({ latest: () => of([notification({ read: true })]) });
    expect(testId(page, 'notification-bell')).not.toBeNull();
    expect(testId(page, 'notification-dot')).toBeNull();
  });

  it('marks the dot when the page has something unread, and reads it on the way out', async () => {
    const { page, read } = await open({ latest: () => of([notification()]) });
    expect(testId(page, 'notification-dot')).not.toBeNull();
    (testId(page, 'notification-bell') as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve));
    const row = testId(page, 'notification-row');
    expect(row?.textContent).toContain('Payment received');
    const link = row?.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/orders/8f14e45f');
    (link as HTMLAnchorElement).click();
    await new Promise(resolve => setTimeout(resolve));
    expect(read).toEqual(['n1']);
  });

  it('never follows a notification link that leaves this site', async () => {
    const { page, read } = await open({ latest: () => of([notification({ link: 'https://example.test/steal' })]) });
    (testId(page, 'notification-bell') as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve));
    const row = testId(page, 'notification-row');
    expect(row?.querySelector('a')).toBeNull();
    const button = row?.querySelector('button') as HTMLButtonElement;
    expect(button).not.toBeNull();
    button.click();
    await new Promise(resolve => setTimeout(resolve));
    expect(read).toContain('n1');
    expect(testId(page, 'notification-feedback')?.textContent).toContain('Notification marked as read.');
  });

  it('still follows a link stored before the move to Angular, through the host redirect', async () => {
    const { page, read } = await open({ latest: () => of([notification({
      id: 'legacy-1', link: '/app/Tafseel-Student-Dashboard.dc.html?section=payments'
    })]) });
    (testId(page, 'notification-bell') as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve));
    const link = testId(page, 'notification-row')?.querySelector('a') as HTMLAnchorElement | null;

    // Relative to the locale's <base href>, so /en/app/... reaches LegacyLinks on the host.
    expect(link?.getAttribute('href')).toBe('app/Tafseel-Student-Dashboard.dc.html?section=payments');
    link?.addEventListener('click', event => event.preventDefault());
    link?.click();
    await new Promise(resolve => setTimeout(resolve));
    expect(read).toContain('legacy-1');
  });

  it('says so when notifications cannot be read, and shows an empty state otherwise', async () => {
    const failed = await open({ latest: () => throwError(() => new HttpErrorResponse({ status: 500 })) });
    (testId(failed.page, 'notification-bell') as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve));
    expect(testId(failed.page, 'notification-error')?.textContent).toContain('We couldn’t load your notifications.');
    expect(testId(failed.page, 'notification-dot')).toBeNull();

    const empty = await open();
    (testId(empty.page, 'notification-bell') as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve));
    expect(testId(empty.page, 'notification-empty')?.textContent).toContain('No notifications');
  });

  it('puts settings and sign-out in the account menu, where they now live', async () => {
    const { page } = await open();
    expect(testId(page, 'account-menu')).toBeNull();
    (testId(page, 'account-menu-toggle') as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve));
    expect(testId(page, 'account-settings')?.getAttribute('href')).toBe('/account');
    expect(testId(page, 'account-sign-out')).not.toBeNull();
    expect(testId(page, 'account-public-profile')).toBeNull();
  });

  it('offers a teacher their public profile, which is where their reviews are read', async () => {
    const { page } = await open({ role: 'Teacher', url: '/teacher/home' });
    (testId(page, 'account-menu-toggle') as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve));
    expect(testId(page, 'account-public-profile')?.getAttribute('href')).toBe('/teachers/user-1');
    expect(testId(page, 'account-settings')?.getAttribute('href')).toBe('/account');
  });
});
