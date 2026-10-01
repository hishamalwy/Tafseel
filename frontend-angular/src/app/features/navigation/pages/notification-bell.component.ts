import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { Dashboard } from '@features/dashboards/models/dashboard';
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
  imports: [RouterLink],
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
        <div id="notification-panel" class="tf-bell-panel" role="region" data-testid="notification-panel"
             [attr.aria-label]="t('nav_notifications', 'Notifications')">
          <header class="tf-bell-panel__head">
            <div class="tf-bell-panel__heading">
              <span class="tf-bell-panel__symbol" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3a5 5 0 0 0-5 5v3l-1.5 3h13L17 11V8a5 5 0 0 0-5-5zM10 19a2 2 0 0 0 4 0" /></svg></span>
              <strong>{{ t('nav_notifications', 'Notifications') }}</strong>
              @if (unread()) { <span class="tf-bell-panel__unread" aria-hidden="true"></span> }
            </div>
            <button type="button" class="tf-bell-panel__close" [attr.aria-label]="t('close', 'Close')" (click)="close()">×</button>
          </header>
          @if (items().length && unread()) {
            <div class="tf-bell-panel__toolbar">
              <button type="button" class="tf-inline-action" data-testid="notification-mark-all"
                      (click)="markAll()">{{ t('nav_mark_all_read', 'Mark all as read') }}</button>
            </div>
          }
          @if (error()) {
            <p class="tf-bell-empty" role="alert" data-testid="notification-error">
              {{ t('nav_notifications_error', 'We couldn’t load your notifications.') }}
              <button type="button" class="tf-inline-action" (click)="load()">{{ t('common_retry', 'Retry') }}</button>
            </p>
          } @else if (!items().length) {
            <p class="tf-bell-empty" data-testid="notification-empty">{{ t('nav_notifications_empty', 'No notifications') }}</p>
          } @else {
            <ul>
              @for (item of items(); track item.id) {
                <li [class.is-unread]="!item.read" data-testid="notification-row">
                  @if (routeOf(item); as route) {
                    <a [routerLink]="route.path" [queryParams]="route.query" (click)="openRow(item)">
                      <span class="tf-bell-panel__message">{{ say(item) }}</span><small>{{ when(item) }}</small>
                    </a>
                  } @else if (legacyHrefOf(item); as href) {
                    <!-- A link stored before the move to Angular (/app/*.dc.html): relative to the
                         locale's <base href>, the host redirects it to its Angular screen. -->
                    <a [attr.href]="href" (click)="openRow(item)">
                      <span class="tf-bell-panel__message">{{ say(item) }}</span><small>{{ when(item) }}</small>
                    </a>
                  } @else {
                    <button type="button" (click)="openRow(item)">
                      <span class="tf-bell-panel__message">{{ say(item) }}</span><small>{{ when(item) }}</small>
                    </button>
                  }
                </li>
              }
            </ul>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .tf-bell { position: relative; display: inline-flex; }
    .tf-bell-dot { position: absolute; inset-block-start: 6px; inset-inline-end: 6px; width: 8px; height: 8px;
      border-radius: 50%; background: var(--danger, #c0392b); }
    .tf-bell-panel { position: absolute; inset-block-start: calc(100% + 12px); inset-inline-end: 0; z-index: 40;
      width: min(400px, calc(100vw - 24px)); max-height: min(640px, calc(100dvh - 84px)); overflow: hidden;
      display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: var(--r-lg);
      background: var(--surface); box-shadow: var(--shadow-lg, 0 16px 48px rgba(0,0,0,.18)); }
    .tf-bell-panel__head { display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 16px 18px; border-block-end: 1px solid var(--border); flex: none; }
    .tf-bell-panel__heading { display: flex; align-items: center; gap: 10px; min-width: 0; font-size: 17px; }
    .tf-bell-panel__symbol { width: 36px; height: 36px; display: grid; place-items: center; flex: none;
      border-radius: 11px; color: var(--primary); background: var(--primary-soft); }
    .tf-bell-panel__symbol svg { width: 19px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
    .tf-bell-panel__unread { width: 7px; height: 7px; border-radius: 50%; background: var(--primary); }
    .tf-bell-panel__close { display: grid; place-items: center; flex: none; width: 36px; height: 36px;
      border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--surface); color: var(--text);
      font-size: 24px; line-height: 1; cursor: pointer; }
    .tf-bell-panel__close:hover, .tf-bell-panel__close:focus-visible { background: var(--surface-2); }
    .tf-bell-panel__toolbar { display: flex; justify-content: flex-end; padding: 8px 18px;
      border-block-end: 1px solid var(--border); background: var(--surface-2); }
    .tf-bell-panel__toolbar button { min-height: 32px; font-size: 13px; }
    .tf-bell-panel ul { list-style: none; margin: 0; padding: 5px 0; overflow-y: auto; min-height: 0; }
    .tf-bell-panel li + li { border-block-start: 1px solid var(--border); }
    .tf-bell-panel li { position: relative; }
    .tf-bell-panel li.is-unread::before { content: ''; position: absolute; inset-inline-start: 12px;
      inset-block-start: 21px; width: 7px; height: 7px; border-radius: 50%; background: var(--primary); }
    .tf-bell-panel a, .tf-bell-panel li button { display: grid; gap: 6px; width: 100%; min-height: 64px;
      padding-block: 12px; padding-inline: 27px 20px; border: 0; background: transparent; text-align: start; text-decoration: none;
      color: inherit; font: inherit; cursor: pointer; }
    .tf-bell-panel a:hover, .tf-bell-panel li button:hover,
    .tf-bell-panel a:focus-visible, .tf-bell-panel li button:focus-visible { background: var(--surface-2); }
    .tf-bell-panel li.is-unread a, .tf-bell-panel li.is-unread button { background: var(--primary-soft); }
    .tf-bell-panel__message { font-size: 14px; line-height: 1.5; font-weight: 650; }
    .tf-bell-panel small { color: var(--text-2); font-size: 12px; font-weight: 400; }
    .tf-bell-empty { margin: 0; padding: 30px 20px; text-align: center; color: var(--text-2); font-size: 14px; }
    @media (max-width: 480px) { .tf-bell-panel { position: fixed; inset-inline: 12px; inset-block-start: 58px;
      width: auto; max-height: min(70dvh, 640px); } }
  `
})
export class NotificationBellComponent {
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly gateway = inject(NotificationsGateway);
  private readonly fmt = inject(FormatService);
  private readonly locale = inject(LocaleService);

  readonly open = signal(false);
  readonly error = signal(false);
  readonly items = signal<readonly Notification[]>([]);
  readonly unread = computed(() => this.items().some(item => !item.read));

  constructor() { void this.load(); }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }

  async toggle(): Promise<void> {
    if (this.open()) { this.close(); return; }
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
    this.open.set(false);
    if (!item.read) {
      this.items.set(this.items().map(row => (row.id === item.id ? { ...row, read: true } : row)));
      try { await firstValueFrom(this.gateway.markRead(item.id)); } catch { /* reading is not the point of the tap */ }
    }
  }

  async markAll(): Promise<void> {
    this.items.set(this.items().map(row => ({ ...row, read: true })));
    try { await firstValueFrom(this.gateway.markAllRead()); } catch { await this.load(); }
  }
}
