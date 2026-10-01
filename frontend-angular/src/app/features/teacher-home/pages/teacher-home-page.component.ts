import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { PriceComponent } from '@shared/components/price.component';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { SetupCard, setupCard } from '../models/setup-card';
import { HomeFormat, TeacherHome, composeTeacherHome } from '../models/teacher-home';
import { LoadTeacherHome, TeacherHomeData } from '../services/teacher-home.use-cases';

/**
 * The teacher's home (UX-02): can students find me, what needs me now, which open requests could I win,
 * when is my next session, and what have I earned.
 *
 * It was the generic dashboard over a counters endpoint, a raw balances object and a hundred notifications.
 * The reads are almost the same; the difference is that the page now answers the teacher's questions in
 * order — and that a teacher students cannot find yet is told the one thing that is stopping them, rather
 * than being shown a business dashboard for a business that cannot receive work.
 */
@Component({
  selector: 'tf-teacher-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PriceComponent, RouterLink, WorkspaceShellComponent],
  templateUrl: './teacher-home-page.component.html',
  styles: `
    /* The teacher's desk: today's work in the main column, the schedule and the money in a narrow rail beside
       it, so earnings never lead the teaching. */
    .tf-home { display: grid; gap: 32px 32px; align-items: start; max-inline-size: 1160px; margin-inline: auto; }
    @media (min-width: 1100px) {
      .tf-home { grid-template-columns: minmax(0, 1fr) minmax(300px, 348px); }
      .tf-home-rail { position: sticky; inset-block-start: calc(var(--shell-header-height, 64px) + 24px); }
      .tf-home > .tf-home-hero, .tf-home > .tf-home-setup { grid-column: 1 / -1; }
    }
    .tf-home-hero { display: grid; gap: 8px; }
    .tf-home-main, .tf-home-rail { display: grid; gap: 32px; align-content: start; min-inline-size: 0; }
    .tf-home-main:empty, .tf-home-rail:empty { display: none; }
    .tf-home-greeting { margin: 0; font-family: var(--font-display); font-size: clamp(28px, 2.6vw, 36px); line-height: 1.16;
      letter-spacing: -.028em; font-weight: var(--weight-heavy); text-wrap: balance; }
    .tf-home-date { margin: 0; font-size: 15px; font-weight: 600; color: var(--text-2); }
    .tf-home-greeting.tf-skeleton { height: 36px; max-width: 240px; }
    .tf-home-section { display: grid; gap: 12px; align-content: start; }
    .tf-home-section h2 { margin: 0 0 2px; font-size: var(--type-section-title-size); font-weight: 800; letter-spacing: -.012em; color: var(--text); }
    .tf-home-card { display: grid; gap: 8px; padding: 18px 20px; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); }
    [data-testid='home-actions'] .tf-home-card:first-of-type { border-color: color-mix(in oklab, var(--primary) 34%, var(--border));
      background: color-mix(in oklab, var(--primary-soft) 55%, var(--surface)); }
    :host-context(html[data-theme='dark']) [data-testid='home-actions'] .tf-home-card:first-of-type {
      border-color: color-mix(in oklab, var(--brand-lime) 34%, var(--border)); background: color-mix(in oklab, var(--brand-lime) 7%, var(--surface)); }
    .tf-home-card h3 { margin: 0; font-size: 16px; font-weight: 750; line-height: 1.4; text-wrap: pretty; }
    .tf-home-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    .tf-home-setup { padding: 24px 26px; border-color: color-mix(in oklab, var(--primary) 28%, var(--border));
      background: color-mix(in oklab, var(--primary-soft) 40%, var(--surface)); }
    .tf-home-setup h2 { margin: 0; font-size: 20px; font-weight: 800; line-height: 1.35; letter-spacing: -.012em; }
    .tf-home-steps { margin: 0; font-size: 13px; color: var(--text-2); font-variant-numeric: tabular-nums; }
    .tf-home-supporting { margin: 0; font-size: 13px; line-height: 1.6; color: var(--text-2); font-variant-numeric: tabular-nums; }
    /* .tf-price-line is a flex box, so a label and its amount need a row of their own to share. */
    .tf-home-money { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
    .tf-home-card .tf-button, .tf-home-card .tf-button-secondary { justify-self: start; min-height: 44px; margin-block-start: 4px; }
    .tf-home-link, .tf-home-more { font-size: 14px; font-weight: 700; justify-self: start; min-height: 44px; display: inline-flex;
      align-items: center; color: var(--primary); text-decoration: none; }
    .tf-home-link:hover, .tf-home-more:hover { text-decoration: underline; text-underline-offset: 3px; }
    .tf-home-quiet { margin: 0; padding: 16px 20px; border: 1px dashed var(--border-strong); border-radius: var(--r-lg);
      font-size: 14px; line-height: 1.55; color: var(--text-2); }
    .tf-home-quiet + .tf-home-quiet { border-style: solid; background: var(--surface); }
    /* The money card: one figure leads, the rest is quiet. */
    .tf-home-earnings { display: grid; gap: 10px; }
    .tf-home-earnings p { margin: 0; display: flex; gap: 8px; align-items: baseline; justify-content: space-between; font-size: 14px; }
    .tf-home-earnings span { color: var(--text-2); }
    .tf-home-earnings strong { font-weight: 800; font-variant-numeric: tabular-nums; }
    .tf-home-earnings [data-testid='home-available'] { flex-direction: column; align-items: flex-start; gap: 2px;
      padding-block-end: 12px; border-block-end: 1px solid var(--border); }
    .tf-home-earnings [data-testid='home-available'] strong { font-size: 28px; letter-spacing: -.02em; }
    [data-testid='home-upcoming'] .tf-home-card { border-color: color-mix(in oklab, var(--accent) 36%, var(--border));
      background: color-mix(in oklab, var(--accent-soft) 45%, var(--surface)); }
    .tf-home-card .tf-home-quiet { padding: 0; border: 0; background: none; }
    .tf-home[data-state='loading'] { grid-template-columns: minmax(0, 1fr); }
    .tf-home-section-error { margin: 0; font-size: 13px; color: var(--text-2); display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  `
})
export class TeacherHomePageComponent {
  private readonly load = inject(LoadTeacherHome);
  private readonly session = inject(SESSION_STORE);
  private readonly fmt = inject(FormatService);
  readonly locale = inject(LocaleService);

  readonly loading = signal(true);
  readonly error = signal('');
  private readonly data = signal<TeacherHomeData | null>(null);
  private readonly now = signal(Date.now());

  /** Today in the reader's language, under the greeting. */
  readonly today = computed(() => this.fmt.date(Date.now(), { weekday: 'long', day: 'numeric', month: 'long' }));
  /** The greeting uses the name written in the page's language when the person gave one (UX-89). */
  readonly firstName = computed(() => {
    const session = this.session.current();
    const name = this.locale.lang() === 'en' ? session?.fullNameEnglish || session?.fullName : session?.fullName || session?.fullNameEnglish;
    return (name ?? '').trim().split(/\s+/)[0] ?? '';
  });
  readonly failed = computed(() => this.data()?.failed ?? { work: false, opportunities: false, earnings: false });

  /** The one thing stopping students finding this teacher, or null when they can. */
  readonly setup = computed<SetupCard | null>(() => {
    const data = this.data();
    return data ? setupCard(data.onboarding) : null;
  });

  /** True while the teacher is waiting on a qualification decision: there is no business to show yet. */
  readonly applying = computed(() => {
    const data = this.data();
    return !!data && data.onboarding.approvedSubjectIds.length === 0;
  });

  readonly published = computed(() => this.data()?.onboarding.isPublished === true);

  readonly home = computed<TeacherHome | null>(() => {
    const data = this.data();
    if (!data) return null;
    const fmt: HomeFormat = {
      lang: this.locale.lang(),
      t: (key, fallback) => this.t(key, fallback),
      format: (key, values, fallback) => this.locale.format(key, values, fallback),
      dateTime: value => (typeof value === 'string' || typeof value === 'number' ? this.fmt.date(value) : ''),
      time: value => (typeof value === 'string' || typeof value === 'number' ? this.fmt.date(value, { timeStyle: 'short' }) : ''),
      until: value => this.until(value),
      since: value => (typeof value === 'string' || typeof value === 'number' ? this.fmt.relative(value, this.now()) : '')
    };
    return composeTeacherHome({
      requests: data.requests, orders: data.orders, sessions: data.sessions,
      opportunities: data.opportunities, opportunityCount: data.opportunityCount, balances: data.balances,
      viewerId: this.session.current()?.userId ?? '', now: this.now(), fmt
    });
  });

  constructor() {
    inject(Title).setTitle(`${this.t('th_title', 'Home')} — Tafseel`);
    void this.refresh();
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }

  /** The day an amount becomes withdrawable; FIN-01 words the sentence around it. */
  date(value: string): string { return this.fmt.dateOnly(value); }

  /**
   * "in 3 hours" / «خلال ٣ ساعات». `FormatService.relative` only looks backwards — it answers "2 hours
   * ago" and hands anything in the future to a plain date, which would repeat the date already shown.
   */
  private until(value: unknown): string {
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    const at = new Date(value).getTime();
    if (Number.isNaN(at)) return '';
    const minutes = Math.round((at - this.now()) / 60_000);
    const words = new Intl.RelativeTimeFormat(this.locale.lang() === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US', { numeric: 'auto' });
    if (minutes < 60) return words.format(Math.max(1, minutes), 'minute');
    if (minutes < 24 * 60) return words.format(Math.round(minutes / 60), 'hour');
    return words.format(Math.round(minutes / (24 * 60)), 'day');
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const data = await this.load.execute();
      this.data.set(data);
      this.now.set(Date.now());
    } catch (error) {
      this.data.set(null);
      this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.loading.set(false);
    }
  }
}
