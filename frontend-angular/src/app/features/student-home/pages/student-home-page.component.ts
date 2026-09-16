import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { PriceComponent } from '@shared/components/price.component';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { HomeCard, HomeFormat, StudentHome, composeStudentHome } from '../models/student-home';
import { HomeData, LoadStudentHome } from '../services/student-home.use-cases';

/**
 * The student's home (UX-01, J1-08/J3-*): what needs the student now, what is in progress, the next
 * live session, and the two ways to start something.
 *
 * It was a grid of up to ~250 identical entity cards — every request, order, session and notification
 * with its numeric status, a search box and a Refresh button. The lists are the same; the difference is
 * that the page now decides what they mean. Every card links to the item's own screen, which owns the
 * business action: the home never acts on an item itself.
 */
@Component({
  selector: 'tf-student-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PriceComponent, RouterLink, WorkspaceShellComponent],
  templateUrl: './student-home-page.component.html',
  styles: `
    .tf-home { display: grid; gap: 20px; max-width: 680px; }
    .tf-home-greeting { margin: 0; font-size: 20px; font-weight: 800; }
    .tf-home-greeting.tf-skeleton { height: 24px; max-width: 220px; }
    .tf-home-welcome h1 { margin: 0 0 4px; font-size: 22px; font-weight: 800; line-height: 1.4; }
    .tf-home-section { display: grid; gap: 10px; }
    .tf-home-section h2 { margin: 0; font-size: 14px; font-weight: 700; color: var(--text-2); }
    .tf-home-card { display: grid; gap: 8px; padding: 16px 18px; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface); }
    .tf-home-card h3 { margin: 0; font-size: 16px; font-weight: 700; line-height: 1.4; }
    .tf-home-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    .tf-home-supporting { margin: 0; font-size: 13px; color: var(--text-2); font-variant-numeric: tabular-nums; }
    .tf-home-card .tf-button, .tf-home-card .tf-button-secondary { justify-self: start; min-height: 44px; display: inline-flex; align-items: center; }
    .tf-home-link { font-size: 13px; font-weight: 700; justify-self: start; min-height: 44px; display: inline-flex; align-items: center; }
    .tf-home-more { font-size: 13px; font-weight: 700; min-height: 44px; display: inline-flex; align-items: center; }
    .tf-home-quiet { margin: 0; font-size: 14px; color: var(--text-2); }
    .tf-home-start-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
    .tf-home-start-card { display: grid; gap: 4px; padding: 16px 18px; border: 1px solid var(--border-strong); border-radius: var(--r-md);
      background: var(--surface); text-decoration: none; min-height: 44px; }
    .tf-home-start-card strong { font-size: 16px; }
    .tf-home-start-card span { font-size: 13px; color: var(--text-2); line-height: 1.6; }
  `
})
export class StudentHomePageComponent {
  private readonly load = inject(LoadStudentHome);
  private readonly session = inject(SESSION_STORE);
  private readonly fmt = inject(FormatService);
  readonly locale = inject(LocaleService);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly partial = signal(false);
  private readonly data = signal<HomeData | null>(null);
  /** Ticks so a payment hold counts down; also what expires a card at zero. */
  private readonly now = signal(Date.now());

  readonly firstName = computed(() => (this.session.current()?.fullName ?? '').trim().split(/\s+/)[0] ?? '');

  readonly home = computed<StudentHome | null>(() => {
    const data = this.data();
    if (!data) return null;
    const fmt: HomeFormat = {
      lang: this.locale.lang(),
      t: (key, fallback) => this.t(key, fallback),
      format: (key, values, fallback) => this.locale.format(key, values, fallback),
      dateTime: value => (typeof value === 'string' || typeof value === 'number' ? this.fmt.date(value) : ''),
      time: value => (typeof value === 'string' || typeof value === 'number' ? this.fmt.date(value, { timeStyle: 'short' }) : ''),
      until: value => this.until(value)
    };
    return composeStudentHome({
      requests: data.requests, orders: data.orders, sessions: data.sessions,
      viewerId: this.session.current()?.userId ?? '', now: this.now(), fmt
    });
  });

  constructor() {
    inject(Title).setTitle(`${this.t('sh_title', 'Home')} — Tafseel`);
    // A held offer is only worth paying while the hold lasts, so the page keeps its own clock. It only
    // recomposes every second while something is actually counting down; otherwise a minute is enough.
    const timer = setInterval(() => {
      const counting = this.home()?.actions.some(card => card.expiresAt) ?? false;
      if (!counting && Date.now() - this.now() < 60_000) return;
      this.now.set(Date.now());
      if (counting && !this.home()?.actions.some(card => card.expiresAt)) void this.refresh(false);
    }, 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    void this.refresh();
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }

  /** Minutes left on a held offer, never negative; the card itself disappears at zero. */
  countdown(card: HomeCard): string {
    const left = Math.max(0, (card.expiresAt ?? 0) - this.now());
    const minutes = Math.max(1, Math.ceil(left / 60_000));
    return left < 5 * 60_000
      ? this.locale.format('sh_hold_ends_seconds', { time: this.clock(left) }, 'The hold ends in {time}')
      : this.locale.format('sh_hold_ends', { minutes }, 'The hold ends in {minutes} min');
  }

  /**
   * "in 3 hours" / «خلال ٣ ساعات». `FormatService.relative` only looks backwards — it answers "2 hours
   * ago" and hands anything in the future to a plain date, which would repeat the date already shown.
   */
  private until(value: unknown): string {
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    const at = new Date(value).getTime();
    if (Number.isNaN(at)) return '';
    const minutes = Math.round((at - this.now()) / 60_000);
    const words = new Intl.RelativeTimeFormat(this.locale.lang() === 'ar' ? 'ar-SA' : 'en-US', { numeric: 'auto' });
    if (minutes < 60) return words.format(Math.max(1, minutes), 'minute');
    if (minutes < 24 * 60) return words.format(Math.round(minutes / 60), 'hour');
    return words.format(Math.round(minutes / (24 * 60)), 'day');
  }

  private clock(ms: number): string {
    const total = Math.floor(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  async refresh(showLoading = true): Promise<void> {
    if (showLoading) this.loading.set(true);
    this.error.set('');
    try {
      const data = await this.load.execute();
      this.data.set(data);
      this.partial.set(data.partial);
      this.now.set(Date.now());
    } catch (error) {
      this.data.set(null);
      this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.loading.set(false);
    }
  }
}
