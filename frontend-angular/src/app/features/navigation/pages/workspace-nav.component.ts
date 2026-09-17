import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Event } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { LocaleService } from '@core/i18n/locale.service';
import { DashboardRole } from '@features/dashboards/models/dashboard';
import { NavDestination, PRIMARY_NAV, activeChild, activeKey } from '../models/primary-nav';

/**
 * The primary navigation list (UX-03), shared by both workspace shells so a person sees the same
 * destinations wherever they are. The active destination is decided by the route, explicitly: an order
 * opened from a notification still belongs to the list it came from.
 */
@Component({
  selector: 'tf-workspace-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <nav class="tf-dash-nav" [attr.aria-label]="t('dashboard_navigation', 'Dashboard navigation')" data-testid="primary-nav">
      <div class="tf-dash-nav-group">
        @for (item of destinations(); track item.key) {
          <a class="tf-dash-nav-item" data-testid="nav-item" [attr.data-nav]="item.key"
             [routerLink]="item.path" [queryParams]="item.query ?? null" (click)="navigated.emit()"
             [attr.aria-current]="item.key === active() ? 'page' : null">{{ t(item.labelKey, item.fallback) }}</a>
          @if (item.children?.length && item.key === active()) {
            <div class="tf-dash-subnav" data-testid="nav-children">
              @for (sub of item.children; track sub.key) {
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
    .tf-dash-nav-item { min-height: 44px; display: flex; align-items: center; }
    .tf-dash-subnav { display: grid; gap: 2px; padding-inline-start: 12px; margin-block: 2px 6px; }
    .tf-dash-subnav-item { display: flex; align-items: center; min-height: 44px; padding: 6px 10px;
      border-radius: var(--r-sm); font-size: 13px; color: var(--text-2); text-decoration: none; }
    .tf-dash-subnav-item[aria-current='page'] { color: var(--text); font-weight: 700; }
  `
})
export class WorkspaceNavComponent {
  readonly role = input.required<DashboardRole>();
  /** Raised when a destination is chosen, so a mobile drawer can close itself. */
  readonly navigated = output<void>();

  private readonly locale = inject(LocaleService);
  private readonly router = inject(Router);
  private readonly url = toSignal(this.router.events.pipe(
    filter((event: Event): event is NavigationEnd => event instanceof NavigationEnd),
    map(event => event.urlAfterRedirects),
    startWith(this.router.url)
  ), { initialValue: this.router.url });

  readonly destinations = computed<readonly NavDestination[]>(() => PRIMARY_NAV[this.role()]);
  readonly active = computed(() => activeKey(this.role(), this.url()));
  readonly child = computed(() => activeChild(this.role(), this.url()));

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
}
