import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { LocaleService } from '@core/i18n/locale.service';
import { DASHBOARDS, DashboardRole } from '@features/dashboards/models/dashboard';
import { AccountMenuComponent } from '@features/navigation/pages/account-menu.component';
import { NotificationBellComponent } from '@features/navigation/pages/notification-bell.component';
import { WorkspaceNavComponent } from '@features/navigation/pages/workspace-nav.component';
import { BrandMarkComponent } from '@shared/components/brand-mark.component';
import { LangToggleComponent } from '@shared/components/lang-toggle.component';
import { ThemeToggleComponent } from '@shared/components/theme-toggle.component';

/**
 * The frame of a role workspace screen that is not the generic dashboard: the same
 * sections in the sidebar (from `DASHBOARDS`, so both kinds of screen list the same
 * places), a title bar, and the page in the middle. It is the design system's
 * dashboard shell (`tf-dashboard-shell`, `tf-dash-*`), including its mobile drawer.
 */
@Component({
  selector: 'tf-workspace-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AccountMenuComponent, BrandMarkComponent, LangToggleComponent, NotificationBellComponent,
    ThemeToggleComponent, WorkspaceNavComponent],
  template: `
    <div class="tf-dashboard-shell" data-stack="app">
      <aside class="tf-dash-sidebar" id="workspace-navigation" [attr.data-drawer]="drawer() ? 'open' : 'closed'">
        <a routerLink="/" class="tf-dash-brand" aria-label="Tafseel"><tf-brand-mark [width]="25" [height]="34" /></a>
        <tf-workspace-nav [role]="role()" (navigated)="drawer.set(false)" />
      </aside>
      <button type="button" [attr.data-drawer-overlay]="drawer() ? 'open' : 'closed'"
              (click)="drawer.set(false)" [attr.aria-label]="t('common_close_navigation', 'Close navigation')"></button>
      <div data-dash-main>
        <header class="tf-dash-header" data-dash-header>
          <button type="button" class="tf-dash-header__icon tf-dash-header__menu" data-drawer-toggle (click)="drawer.set(!drawer())"
                  aria-controls="workspace-navigation" [attr.aria-expanded]="drawer()" [attr.aria-label]="t('common_open_navigation', 'Open navigation')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <span class="tf-dash-header__title">{{ t(config().titleKey, config().title) }}</span>
          <div class="tf-dash-header__actions">
            <tf-notification-bell /><tf-account-menu [role]="role()" /><tf-lang-toggle /><tf-theme-toggle />
          </div>
        </header>
        <main class="tf-workspace-content" id="main-content"><ng-content /></main>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .tf-workspace-content { box-sizing: border-box; width: 100%; max-width: 1240px; margin-inline: auto; padding: 28px 28px 64px; }
    @media (max-width: 720px) { .tf-workspace-content { padding: 20px 16px 48px; } }
  `
})
export class WorkspaceShellComponent {
  readonly role = input.required<DashboardRole>();
  /** The sidebar section this screen belongs to. */
  readonly section = input.required<string>();
  readonly session = inject(SESSION_STORE);
  private readonly locale = inject(LocaleService);
  readonly config = computed(() => DASHBOARDS[this.role()]);
  readonly drawer = signal(false);

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
}
