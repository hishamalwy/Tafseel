import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { IconComponent } from '@shared/components/icon.component';
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
  imports: [NgTemplateOutlet, IconComponent, PriceComponent, RouterLink, WorkspaceShellComponent],
  templateUrl: './student-home-page.component.html',
  styles: `
    /* The student home is an attention rail: who you are and today, what needs you, then what is moving.
       The greeting sits on the canvas; only things you act on get a surface. */
    .tf-home { display: grid; gap: 40px; align-items: start; max-inline-size: 1160px; margin-inline: auto; }
    .tf-home-hero { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.08fr); align-items: end; gap: 32px; }
    .tf-home-hero--returning { grid-template-columns: minmax(0, 1fr); }
    .tf-home-hero:not(.tf-home-hero--returning) { padding: clamp(24px, 3vw, 40px); border: 1px solid var(--border);
      border-radius: var(--r-xl); background: var(--surface); }
    .tf-home-greeting, .tf-home-hero h1 { margin: 0; font-family: var(--font-display); font-size: clamp(28px, 2.6vw, 36px);
      line-height: 1.16; letter-spacing: -.028em; font-weight: var(--weight-heavy); text-wrap: balance; }
    .tf-home-hero__lede { max-inline-size: 52ch; margin: 10px 0 0; color: var(--text-2); font-size: 15px; line-height: 1.6; }
    .tf-home-date { color: var(--text); font-weight: 600; }
    .tf-home-date::after { content: "·"; margin-inline: 8px; color: var(--muted); }
    .tf-home-greeting.tf-skeleton { height: 36px; max-width: 240px; }
    .tf-home-start-block { display: grid; gap: 12px; }
    .tf-home-start-label { margin: 0; font-size: 13px; font-weight: 700; color: var(--text-2); }

    .tf-home-section { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; align-content: start; }
    [data-testid='home-start-later'] .tf-home-start-grid { grid-column: 1 / -1; }
    /* A spanning heading keeps every auto-fit track alive, so two cards would leave a hole: the attention row flexes instead. */
    [data-testid='home-actions'] { display: flex; flex-wrap: wrap; }
    [data-testid='home-actions'] > h2, [data-testid='home-actions'] > .tf-home-more { flex: 1 0 100%; }
    [data-testid='home-actions'] > .tf-home-card { flex: 1 1 300px; }
    .tf-home-section h2 { grid-column: 1 / -1; margin: 0 0 2px; font-size: var(--type-section-title-size); font-weight: 800;
      letter-spacing: -.012em; }
    .tf-home-card { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; min-inline-size: 0;
      padding: 20px 22px; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); }
    /* The first thing that needs you is the one the page leads with: tinted, with the only filled button. */
    [data-testid='home-actions'] .tf-home-card:first-of-type { border-color: color-mix(in oklab, var(--primary) 34%, var(--border));
      background: color-mix(in oklab, var(--primary-soft) 55%, var(--surface)); }
    [data-testid='home-actions'] .tf-home-card { min-block-size: 168px; }
    .tf-home-card h3 { margin: 0; font-size: 16px; font-weight: 750; line-height: 1.4; overflow-wrap: anywhere; text-wrap: pretty; }
    .tf-home-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    .tf-home-supporting { margin: 0; font-size: 13px; color: var(--text-2); line-height: 1.6; font-variant-numeric: tabular-nums; }
    .tf-home-card .tf-button, .tf-home-card .tf-button-secondary { margin-block-start: auto; min-height: 44px; }
    .tf-home-card .tf-button { margin-block-start: auto; }
    .tf-home-link { margin-block-start: auto; min-height: 44px; display: inline-flex; align-items: center; justify-content: center;
      gap: 6px; padding-inline: 16px; border: 1px solid var(--border-strong); border-radius: var(--r-sm);
      background: var(--surface); color: var(--text); font-size: 14px; font-weight: 700; text-decoration: none;
      transition: border-color var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out); }
    .tf-home-link:hover { border-color: var(--primary); color: var(--primary); }
    .tf-home-link:focus-visible { outline: 3px solid var(--focus-ring-color); outline-offset: 2px; }
    .tf-home-more { grid-column: 1 / -1; justify-self: start; font-size: 14px; font-weight: 700; min-height: 44px;
      display: inline-flex; align-items: center; color: var(--primary); }
    .tf-home-quiet { margin: 0; padding: 18px 22px; border: 1px dashed var(--border-strong); border-radius: var(--r-lg);
      font-size: 14px; color: var(--text-2); }

    /* What is moving: rows in one list, not a stack of separate boxes. */
    .tf-home-work { display: grid; grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); gap: 32px; align-items: start; }
    .tf-home-work--single { grid-template-columns: minmax(0, 1fr); }
    .tf-home-work .tf-home-section { grid-template-columns: minmax(0, 1fr); gap: 0; }
    .tf-home-work .tf-home-section h2 { margin-block-end: 14px; }
    .tf-home-work .tf-home-card { min-block-size: 0; padding: 16px 20px; gap: 6px; border-radius: 0; margin-block-start: -1px; }
    .tf-home-work .tf-home-section > .tf-home-card:nth-child(2) { border-start-start-radius: var(--r-lg); border-start-end-radius: var(--r-lg); margin-block-start: 0; }
    .tf-home-work .tf-home-section > .tf-home-card:last-of-type { border-end-start-radius: var(--r-lg); border-end-end-radius: var(--r-lg); }
    .tf-home-work .tf-home-card-head { inline-size: 100%; }
    .tf-home-work [data-testid='home-current-card'] { display: grid; grid-template-columns: minmax(0, 1fr) auto;
      align-items: center; column-gap: 24px; row-gap: 6px; transition: background var(--motion-fast) var(--ease-out); }
    .tf-home-work [data-testid='home-current-card']:hover { background: color-mix(in oklab, var(--primary-soft) 30%, var(--surface)); }
    .tf-home-work [data-testid='home-current-card'] .tf-home-card-head,
    .tf-home-work [data-testid='home-current-card'] .tf-home-supporting { grid-column: 1; }
    .tf-home-work [data-testid='home-current-card'] .tf-home-card-head { flex-direction: column; align-items: flex-start; gap: 7px; }
    .tf-home-work [data-testid='home-current-card'] .tf-home-link { grid-column: 2; grid-row: 1 / span 2; margin: 0; }
    .tf-home-work .tf-home-more { margin-block-start: 8px; }
    [data-testid='home-upcoming'] .tf-home-card { border-radius: var(--r-lg); margin: 0; min-block-size: 168px;
      border-color: color-mix(in oklab, var(--accent) 36%, var(--border)); background: color-mix(in oklab, var(--accent-soft) 45%, var(--surface)); }

    /* Starting something new: two equal doors, the icon tinted, an arrow that moves when you aim at it. */
    .tf-home-start-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .tf-home-start-card { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 14px; row-gap: 4px;
      align-items: start; min-inline-size: 0; padding: 18px 44px 18px 18px; border: 1px solid var(--border); border-radius: var(--r-lg);
      background: var(--surface); color: var(--text); text-decoration: none;
      transition: transform var(--dur-short) var(--ease-out), border-color var(--motion-fast) var(--ease-out), box-shadow var(--dur-short) var(--ease-out); }
    :host-context([dir='rtl']) .tf-home-start-card { padding: 18px 18px 18px 44px; }
    .tf-home-start-card:hover { transform: translateY(-2px); border-color: color-mix(in oklab, var(--primary) 50%, var(--border)); box-shadow: var(--shadow-hover); }
    .tf-home-start-card:focus-visible { outline: 3px solid var(--focus-ring-color); outline-offset: 3px; }
    .tf-home-start-card__icon { grid-row: 1 / span 2; display: grid; place-items: center; inline-size: 40px; block-size: 40px;
      border-radius: 10px; background: var(--primary-soft); color: var(--primary); }
    .tf-home-start-card strong { align-self: end; font-size: 15px; line-height: 1.35; }
    .tf-home-start-card > span:last-child { grid-column: 2; font-size: 13px; color: var(--text-2); line-height: 1.55; }
    .tf-home-start-card__go { position: absolute; inset-block-start: 18px; inset-inline-end: 16px; color: var(--muted);
      transition: transform var(--dur-short) var(--ease-out), color var(--motion-fast) var(--ease-out); }
    .tf-home-start-card:hover .tf-home-start-card__go { color: var(--primary); transform: translateX(3px); }
    :host-context([dir='rtl']) .tf-home-start-card:hover .tf-home-start-card__go { transform: translateX(-3px); }
    :host-context([dir='rtl']) .tf-home-start-card__go { transform: scaleX(-1); }
    :host-context([dir='rtl']) .tf-home-start-card:hover .tf-home-start-card__go { transform: scaleX(-1) translateX(3px); }
    :host-context(html[data-theme='dark']) .tf-home-start-card__icon { background: color-mix(in oklab, var(--brand-lime) 14%, transparent); color: var(--brand-lime); }
    :host-context(html[data-theme='dark']) .tf-home-start-card:hover .tf-home-start-card__go { color: var(--brand-lime); }
    :host-context(html[data-theme='dark']) [data-testid='home-actions'] .tf-home-card:first-of-type {
      border-color: color-mix(in oklab, var(--brand-lime) 34%, var(--border)); background: color-mix(in oklab, var(--brand-lime) 7%, var(--surface)); }

    @media (max-width: 1000px) {
      .tf-home-hero { grid-template-columns: minmax(0, 1fr); align-items: start; }
      .tf-home-section { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .tf-home-work { grid-template-columns: minmax(0, 1fr); }
    }
    @media (max-width: 640px) {
      .tf-home { gap: 28px; }
      .tf-home-hero:not(.tf-home-hero--returning) { padding: 22px; gap: 22px; }
      .tf-home-start-grid, .tf-home-section { grid-template-columns: minmax(0, 1fr); }
      [data-testid='home-actions'] .tf-home-card { min-block-size: 0; }
      .tf-home-work [data-testid='home-current-card'] { display: flex; flex-direction: column; align-items: flex-start; }
    }
    @media (prefers-reduced-motion: reduce) {
      .tf-home-start-card, .tf-home-start-card__go { transition: none; }
      .tf-home-start-card:hover { transform: none; }
    }
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

  /** The greeting uses the name written in the page's language when the person gave one (UX-89). */
  /** Today in the reader's language: a returning student reads where they are before what needs them. */
  readonly today = computed(() => this.fmt.date(Date.now(), { weekday: 'long', day: 'numeric', month: 'long' }));
  readonly firstName = computed(() => {
    const session = this.session.current();
    const name = this.locale.lang() === 'en' ? session?.fullNameEnglish || session?.fullName : session?.fullName || session?.fullNameEnglish;
    return (name ?? '').trim().split(/\s+/)[0] ?? '';
  });

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
    const words = new Intl.RelativeTimeFormat(this.locale.lang() === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US', { numeric: 'auto' });
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
