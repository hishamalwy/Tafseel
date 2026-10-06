import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { Dashboard } from '@features/dashboards/models/dashboard';
import { IconComponent, IconName } from '@shared/components/icon.component';
import { NOTIFICATION_UNKNOWN, notificationCopy } from '@shared/vocabulary/status-vocabulary';
import { Notification, NotificationsGateway } from '../services/notifications.gateway';

/**
 * The notifications bell (UX-03): the one place notifications live, now that they are not a primary
 * destination. The dot only says there is something unread on the first page — no exact count is claimed
 * for a number the server was never asked for.
 *
 * A row reads as Tafseel's own sentence for its type (`UX-04`), never the server's English title, and
 * follows its link through the existing safe-link guard, so a stored link can never send the reader off
 * this site.
 */
@Component({
  selector: 'tf-notification-bell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgTemplateOutlet, IconComponent],
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <div class="tf-bell">
      <button #trigger type="button" class="tf-dash-header__icon" data-testid="notification-bell"
              [attr.aria-expanded]="open()" aria-controls="notification-panel"
              [attr.aria-label]="t('nav_notifications', 'Notifications')" (click)="toggle()">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3a5 5 0 0 0-5 5v3l-1.5 3h13L17 11V8a5 5 0 0 0-5-5zM10 19a2 2 0 0 0 4 0" />
        </svg>
        @if (unread()) {
          <span class="tf-bell-dot" data-testid="notification-dot"
                [attr.aria-label]="t('nav_unread', 'Unread notifications')"></span>
        }
      </button>
      @if (open()) {
        <div id="notification-panel" class="tf-bell-panel" animate.enter="tf-popover-enter" animate.leave="tf-popover-leave" [attr.inert]="!open() ? '' : null" role="region" data-testid="notification-panel"
             [attr.aria-label]="t('nav_notifications', 'Notifications')">
          <header class="tf-bell-panel__head">
            <h2 class="tf-bell-panel__title">{{ t('nav_notifications', 'Notifications') }}</h2>
            <div class="tf-bell-panel__actions">
              @if (items().length && unread()) {
                <button type="button" class="tf-button tf-button-ghost tf-button-sm" data-testid="notification-mark-all"
                        (click)="markAll()">{{ t('nav_mark_all_read', 'Mark all as read') }}</button>
              }
              <button type="button" class="tf-icon-btn tf-icon-btn-quiet tf-bell-panel__close"
                      [attr.aria-label]="t('close', 'Close')" (click)="close()">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
          </header>
          <!-- Read after an unread row's own sentence by screen readers; never shown, never part of the row's text. -->
          <span id="tf-bell-unread-note" hidden>{{ t('nav_unread_one', 'Unread') }}</span>
          @if (feedback(); as message) {
            <p class="tf-bell-feedback" role="status" aria-live="polite" data-testid="notification-feedback">{{ message }}</p>
          }
          @if (error()) {
            <div class="tf-bell-state" role="alert" data-testid="notification-error">
              <p>{{ t('nav_notifications_error', 'We couldn’t load your notifications.') }}</p>
              <button type="button" class="tf-button tf-button-secondary tf-button-sm" (click)="load()">{{ t('common_retry', 'Retry') }}</button>
            </div>
          } @else if (!items().length) {
            <div class="tf-bell-state" data-testid="notification-empty">
              <span class="tf-bell-state__icon" aria-hidden="true"><tf-icon name="bell" [size]="20" /></span>
              <p>{{ t('nav_notifications_empty', 'No notifications') }}</p>
            </div>
          } @else {
            <ul class="tf-bell-list">
              @for (item of items(); track item.id) {
                <li class="tf-bell-row" [class.is-unread]="!item.read" data-testid="notification-row">
                  @if (routeOf(item); as route) {
                    <a class="tf-bell-row__hit" [routerLink]="route.path" [queryParams]="route.query" (click)="openRow(item)"
                       [attr.aria-describedby]="item.read ? null : 'tf-bell-unread-note'">
                      <ng-container *ngTemplateOutlet="row; context: { $implicit: item }" />
                    </a>
                  } @else if (legacyHrefOf(item); as href) {
                    <!-- A link stored before the move to Angular (/app/*.dc.html): relative to the
                         locale's <base href>, the host redirects it to its Angular screen. -->
                    <a class="tf-bell-row__hit" [attr.href]="href" (click)="openRow(item)"
                       [attr.aria-describedby]="item.read ? null : 'tf-bell-unread-note'">
                      <ng-container *ngTemplateOutlet="row; context: { $implicit: item }" />
                    </a>
                  } @else {
                    <button type="button" class="tf-bell-row__hit" (click)="openRow(item)"
                            [attr.aria-describedby]="item.read ? null : 'tf-bell-unread-note'">
                      <ng-container *ngTemplateOutlet="row; context: { $implicit: item }" />
                    </button>
                  }
                </li>
              }
            </ul>
          }
        </div>
      }
    </div>
    <ng-template #row let-item>
      <span class="tf-bell-row__icon" aria-hidden="true"><tf-icon [name]="iconOf(item)" [size]="18" /></span>
      <span class="tf-bell-row__text">
        <span class="tf-bell-row__message">{{ say(item) }}</span>
        <small class="tf-bell-row__time">{{ when(item) }}</small>
      </span>
      <span class="tf-bell-row__dot" aria-hidden="true"></span>
    </ng-template>
  `,
  styles: `
    .tf-bell { position: relative; display: inline-flex; }
    .tf-bell-dot { position: absolute; inset-block-start: 8px; inset-inline-end: 8px; width: 8px; height: 8px;
      border-radius: 50%; background: var(--error); box-shadow: 0 0 0 2px var(--surface); }

    .tf-bell-panel { position: absolute; inset-block-start: calc(100% + var(--space-2)); inset-inline-end: 0; z-index: 40;
      width: min(400px, calc(100vw - 24px)); max-height: min(560px, calc(100dvh - 88px)); overflow: hidden;
      display: flex; flex-direction: column; border: 1px solid var(--edge-overlay); border-radius: var(--r-lg);
      background: var(--surface); box-shadow: var(--overlay-shadow); }
    .tf-bell-panel__head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
      min-height: 60px; padding-block: var(--space-2); padding-inline: var(--space-5) var(--space-2);
      border-block-end: 1px solid var(--border); flex: none; }
    .tf-bell-panel__title { margin: 0; font-size: var(--type-item-title-size); font-weight: 800; line-height: 1.3; }
    .tf-bell-panel__actions { display: flex; align-items: center; gap: var(--space-1); }
    .tf-bell-panel__actions .tf-button { color: var(--primary); border-color: transparent; }
    @media (hover:hover) and (pointer:fine){.tf-bell-panel__actions .tf-button:hover { border-color: var(--border); } }
    .tf-bell-panel__close svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }

    .tf-bell-list { list-style: none; margin: 0; padding: var(--space-2); overflow-y: auto; min-height: 0;
      overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent; }
    .tf-bell-list::-webkit-scrollbar { width: 6px; }
    .tf-bell-list::-webkit-scrollbar-thumb { background: var(--border-strong); border: 0; border-radius: 999px; }
    .tf-bell-list::-webkit-scrollbar-track { background: transparent; }
    /* Rows are separated by a rule, not one shared background, so twenty rows never read as one block. */
    .tf-bell-row + .tf-bell-row { border-block-start: 1px solid var(--border); }
    .tf-bell-row__hit { display: grid; grid-template-columns: 34px minmax(0, 1fr) 8px; align-items: start; gap: var(--space-3);
      width: 100%; min-height: 56px; margin-block: 2px; padding: var(--space-3); border: 0; border-radius: var(--r-sm);
      background: transparent; text-align: start; text-decoration: none; color: inherit; font: inherit; cursor: pointer;
      transition: background var(--t); }
    @media (hover:hover) and (pointer:fine){.tf-bell-row__hit:hover { background: var(--surface-2); } }
    .tf-bell-row__hit:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; background: var(--surface-2); }
    .tf-bell-row__icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: var(--r-sm);
      background: var(--surface-2); color: var(--text-2); }
    .tf-bell-row__text { display: grid; gap: 3px; min-width: 0; }
    .tf-bell-row__message { font-size: var(--type-body-sm-size); line-height: 1.45; font-weight: 500; color: var(--text-2); overflow-wrap: anywhere; }
    .tf-bell-row__time { font-size: var(--type-meta-size); line-height: 1.4; color: var(--text-2); }
    .tf-bell-row__dot { width: 8px; height: 8px; margin-block-start: 7px; border-radius: 50%; }
    /* Unread: the sentence in full weight and ink, the kind in the brand tint, and a dot at the end. */
    .tf-bell-row.is-unread .tf-bell-row__message { font-weight: 700; color: var(--text); }
    .tf-bell-row.is-unread .tf-bell-row__icon { background: var(--primary-soft); color: var(--primary); }
    .tf-bell-row.is-unread .tf-bell-row__dot { background: var(--primary); }

    .tf-bell-state { display: grid; justify-items: center; gap: var(--space-3); margin: 0; padding: var(--space-8) var(--space-5);
      text-align: center; color: var(--text-2); font-size: var(--type-body-sm-size); }
    .tf-bell-state p { margin: 0; }
    .tf-bell-feedback { margin: 0 var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid color-mix(in oklab, var(--primary) 34%, var(--border));
      border-radius: var(--r-sm); background: var(--primary-soft); color: var(--text); font-size: var(--type-meta-size); line-height: 1.45; }
    .tf-bell-state__icon { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 50%;
      background: var(--surface-2); color: var(--text-2); }

    @media (max-width: 480px) {
      .tf-bell-panel { position: fixed; inset-inline: var(--space-3); inset-block-start: 64px; width: auto;
        max-height: min(72dvh, 560px); }
      .tf-bell-panel__actions .tf-button { min-height: 44px; }
    }
    @media (prefers-reduced-motion: reduce) { .tf-bell-row__hit { transition: none; } }
  `
})
export class NotificationBellComponent {
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly gateway = inject(NotificationsGateway);
  private readonly fmt = inject(FormatService);
  private readonly locale = inject(LocaleService);

  readonly open = signal(false);
  readonly error = signal(false);
  readonly feedback = signal('');
  readonly items = signal<readonly Notification[]>([]);
  readonly unread = computed(() => this.items().some(item => !item.read));

  constructor() { void this.load(); }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }

  async toggle(): Promise<void> {
    if (this.open()) { this.feedback.set(''); this.close(); return; }
    this.open.set(true);
    await this.load();
  }

  close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.trigger()?.nativeElement.focus();
  }

  async load(): Promise<void> {
    this.error.set(false);
    this.feedback.set('');
    try {
      this.items.set(await firstValueFrom(this.gateway.latest()));
    } catch {
      this.error.set(true);
      this.items.set([]);
    }
  }

  /** Tafseel's own sentence for the type; the English server title is never shown in Arabic (UX-04). */
  say(item: Notification): string {
    const copy = notificationCopy(item.type);
    if (copy) return this.t(copy.labelKey, copy.fallback);
    if (this.locale.lang() === 'en' && item.title) return item.title;
    return this.t(NOTIFICATION_UNKNOWN.labelKey, NOTIFICATION_UNKNOWN.fallback);
  }

  when(item: Notification): string { return this.fmt.relative(item.createdAt); }

  /** A glyph per kind of update, so a long list scans by subject before it is read. Presentation only. */
  iconOf(item: Notification): IconName {
    const type = item.type;
    if (/Message|Clarification/.test(type)) return 'message';
    if (/^Session/.test(type)) return 'calendar';
    if (/Payment|Refund|Withdrawal|Finance/.test(type)) return 'wallet';
    if (/Review/.test(type)) return 'star';
    if (/Dispute/.test(type)) return 'flag';
    if (/Application|Qualification|Profile|Showcase/.test(type)) return 'teacher';
    if (/Support|AccountStatus/.test(type)) return 'inbox';
    if (/Request|Offer|Order|Delivery|Work|Revision/.test(type)) return 'briefcase';
    return 'bell';
  }

  /** Only a path on this site is followed — the existing notification link guard decides. */
  routeOf(item: Notification): { path: string; query: Readonly<Record<string, string>> } | null {
    const action = Dashboard.notificationAction(item.link);
    return action?.kind === 'route' ? { path: action.path, query: action.query } : null;
  }

  /** A stored `/app/...` address; the host's LegacyLinks redirect knows where it lives now. */
  legacyHrefOf(item: Notification): string | null {
    const action = Dashboard.notificationAction(item.link);
    return action?.kind === 'legacy' ? action.href : null;
  }

  async openRow(item: Notification): Promise<void> {
    const hasDestination = this.routeOf(item) !== null || this.legacyHrefOf(item) !== null;
    if (hasDestination) this.open.set(false);
    if (!item.read) {
      this.items.set(this.items().map(row => (row.id === item.id ? { ...row, read: true } : row)));
      try { await firstValueFrom(this.gateway.markRead(item.id)); } catch { /* reading is not the point of the tap */ }
    }
    if (!hasDestination) this.feedback.set(this.t('nav_notification_read', 'Notification marked as read.'));
  }

  async markAll(): Promise<void> {
    this.items.set(this.items().map(row => ({ ...row, read: true })));
    try {
      await firstValueFrom(this.gateway.markAllRead());
      this.feedback.set(this.t('nav_notifications_marked', 'All notifications marked as read.'));
    } catch { await this.load(); }
  }
}
