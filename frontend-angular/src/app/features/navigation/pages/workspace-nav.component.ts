import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Event } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { LocaleService } from '@core/i18n/locale.service';
import { DashboardRole } from '@features/dashboards/models/dashboard';
import { IconComponent } from '@shared/components/icon.component';
import { NAV_GROUP_STARTS, NAV_ICONS, NavDestination, NavGroupLabel, PRIMARY_NAV, activeChild, activeKey } from '../models/primary-nav';
import { UnreadMessages } from '../services/unread-messages';

interface NavRow { readonly item: NavDestination; readonly group: NavGroupLabel | null }

/**
 * The primary navigation list (UX-03), shared by both workspace shells so a person sees the same
 * destinations wherever they are. The active destination is decided by the route, explicitly: an order
 * opened from a notification still belongs to the list it came from.
 *
 * Visually each destination carries its icon, and related destinations sit under a quiet group label; the
 * order and the destinations themselves are Gate 2's and do not change here.
 */
@Component({
  selector: 'tf-workspace-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <nav class="tf-dash-nav" [attr.aria-label]="t('dashboard_navigation', 'Dashboard navigation')" data-testid="primary-nav">
      <div class="tf-dash-nav-group">
        @for (row of rows(); track row.item.key) {
          @if (row.group) { <p class="tf-dash-nav-group-label" aria-hidden="true">{{ t(row.group.labelKey, row.group.fallback) }}</p> }
          <a class="tf-dash-nav-item" data-testid="nav-item" [attr.data-nav]="row.item.key"
             [routerLink]="row.item.path" [queryParams]="row.item.query ?? null" (click)="navigated.emit()"
             [attr.aria-current]="row.item.key === active() ? 'page' : null">
            <span class="tf-dash-nav-ico-wrap"><tf-icon [name]="icon(row.item.key)" [size]="18" /></span>
            <span class="tf-dash-nav-text">{{ t(row.item.labelKey, row.item.fallback) }}</span>
            @if (row.item.key === 'messages' && unread.count() > 0) {
              <!-- Re-created when the number changes, so the count gives one small pulse, not a loop. -->
              @for (n of [unread.count()]; track n) {
                <span class="tf-nav-count" data-testid="nav-unread-messages">{{ n > 99 ? '99+' : n }}<span class="tf-sr-only">{{ ' ' + t('nav_unread_messages', 'unread') }}</span></span>
              }
            }
          </a>
          @if (row.item.children?.length && row.item.key === active()) {
            <div class="tf-dash-subnav" data-testid="nav-children">
              @for (sub of row.item.children; track sub.key) {
                <a class="tf-dash-subnav-item" data-testid="nav-child" [attr.data-nav]="sub.key"
                   [routerLink]="sub.path" (click)="navigated.emit()"
                   [attr.aria-current]="sub.key === child() ? 'page' : null">{{ t(sub.labelKey, sub.fallback) }}</a>
              }
            </div>
          }
        }
      </div>
    </nav>
  `,
  styles: `
    /* The drawer is how a phone navigates, so every destination is a 44px target (UX-03 AC9). */
    .tf-dash-nav-item { min-height: 44px; }
    .tf-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  `
})
export class WorkspaceNavComponent {
  readonly role = input.required<DashboardRole>();
  /** Raised when a destination is chosen, so a mobile drawer can close itself. */
  readonly navigated = output<void>();

  private readonly locale = inject(LocaleService);
  private readonly router = inject(Router);
  readonly unread = inject(UnreadMessages);
  private readonly url = toSignal(this.router.events.pipe(
    filter((event: Event): event is NavigationEnd => event instanceof NavigationEnd),
    map(event => event.urlAfterRedirects),
    startWith(this.router.url)
  ), { initialValue: this.router.url });

  readonly destinations = computed<readonly NavDestination[]>(() => PRIMARY_NAV[this.role()]);
  readonly rows = computed<readonly NavRow[]>(() => {
    const starts = NAV_GROUP_STARTS[this.role()];
    return this.destinations().map(item => ({ item, group: starts[item.key] ?? null }));
  });
  readonly active = computed(() => activeKey(this.role(), this.url()));
  readonly child = computed(() => activeChild(this.role(), this.url()));

  constructor() {
    effect(() => {
      this.url();
      if (PRIMARY_NAV[this.role()].some(item => item.key === 'messages')) void untracked(() => this.unread.refresh());
    });
  }

  icon(key: string) { return NAV_ICONS[key] ?? 'home'; }
  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
}
