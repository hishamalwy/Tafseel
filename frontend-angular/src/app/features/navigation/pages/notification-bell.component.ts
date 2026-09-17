import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
  template: `
    <div class="tf-bell">
      <button type="button" class="tf-dash-header__icon" data-testid="notification-bell"
              [attr.aria-expanded]="open()" aria-haspopup="dialog"
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
        <div class="tf-bell-panel" role="dialog" data-testid="notification-panel"
             [attr.aria-label]="t('nav_notifications', 'Notifications')">
          <header>
            <strong>{{ t('nav_notifications', 'Notifications') }}</strong>
            @if (items().length) {
              <button type="button" class="tf-inline-action" data-testid="notification-mark-all"
                      (click)="markAll()">{{ t('nav_mark_all_read', 'Mark all as read') }}</button>
            }
          </header>
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
                      <span>{{ say(item) }}</span><small>{{ when(item) }}</small>
                    </a>
                  } @else {
                    <button type="button" (click)="openRow(item)">
                      <span>{{ say(item) }}</span><small>{{ when(item) }}</small>
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
    .tf-bell-panel { position: absolute; inset-block-start: calc(100% + 8px); inset-inline-end: 0; z-index: 40;
      width: min(340px, calc(100vw - 32px)); max-height: 70vh; overflow-y: auto; padding: 12px;
      border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface); box-shadow: var(--shadow-lg, 0 12px 32px rgba(0,0,0,.18)); }
    .tf-bell-panel header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-block-end: 8px; }
    .tf-bell-panel ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
    .tf-bell-panel a, .tf-bell-panel button:not(.tf-inline-action) { display: grid; gap: 2px; width: 100%; min-height: 44px;
      padding: 8px 10px; border: 0; border-radius: var(--r-sm); background: none; text-align: start; text-decoration: none;
      color: inherit; font: inherit; cursor: pointer; }
    .tf-bell-panel li.is-unread a, .tf-bell-panel li.is-unread button { background: var(--surface-2, rgba(0,0,0,.04)); font-weight: 700; }
    .tf-bell-panel small { color: var(--text-2); font-weight: 400; }
    .tf-bell-empty { margin: 0; padding: 12px 10px; color: var(--text-2); font-size: 14px; }
  `
})
export class NotificationBellComponent {
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
    this.open.set(!this.open());
    if (this.open()) await this.load();
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
