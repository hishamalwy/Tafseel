import { ChangeDetectionStrategy, Component, Injector, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { LogOut } from '@core/auth/services/log-out.use-case';
import { LocaleService } from '@core/i18n/locale.service';
import { DashboardRole } from '@features/dashboards/models/dashboard';

/**
 * The account menu (UX-03): where settings went when they stopped being a primary destination. It adds no
 * account capability — it gathers the destinations each role already had.
 */
@Component({
  selector: 'tf-account-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="tf-account">
      <button type="button" class="tf-dash-header__icon" data-testid="account-menu-toggle"
              [attr.aria-expanded]="open()" aria-haspopup="menu"
              [attr.aria-label]="t('nav_account_menu', 'My account')" (click)="open.set(!open())">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0" />
        </svg>
      </button>
      @if (open()) {
        <div class="tf-account-menu" role="menu" data-testid="account-menu">
          <p class="tf-account-name">{{ session.current()?.fullName }}</p>
          @if (settingsPath(); as path) {
            <a role="menuitem" data-testid="account-settings" [routerLink]="path" (click)="open.set(false)">{{
              t('nav_account_menu', 'My account') }}</a>
          }
          @if (role() === 'Teacher' && session.current()?.userId; as id) {
            <a role="menuitem" data-testid="account-public-profile" [routerLink]="['/teachers', id]" (click)="open.set(false)">{{
              t('nav_public_profile', 'View my public profile') }}</a>
          }
          <!-- Help and reports: everyone can reach it. A paid purchase is sent on to its dispute from there. -->
          <a role="menuitem" data-testid="account-report-problem" routerLink="/help" (click)="open.set(false)">{{
            t('nav_help_reports', 'Help and reports') }}</a>
          <button type="button" class="tf-account-sign-out" role="menuitem" data-testid="account-sign-out" (click)="signOut()">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4m4-4H9" /></svg>
            <span>{{ t('nav_sign_out', 'Sign out') }}</span>
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .tf-account { position: relative; display: inline-flex; }
    .tf-account-menu { position: absolute; inset-block-start: calc(100% + 8px); inset-inline-end: 0; z-index: 40;
      min-width: 220px; padding: 8px; display: grid; gap: 2px; border: 1px solid var(--border);
      border-radius: var(--r-md); background: var(--surface); box-shadow: var(--shadow-lg, 0 12px 32px rgba(0,0,0,.18)); }
    .tf-account-name { margin: 0; padding: 6px 10px; font-weight: 700; }
    .tf-account-menu a, .tf-account-menu button { display: flex; align-items: center; min-height: 44px; padding: 8px 10px;
      border: 0; border-radius: var(--r-sm); background: none; text-align: start; text-decoration: none; color: inherit;
      font: inherit; cursor: pointer; }
    .tf-account-menu a:hover, .tf-account-menu button:hover { background: var(--surface-2, rgba(0,0,0,.04)); }
    .tf-account-menu .tf-account-sign-out { gap: 10px; margin-block-start: 6px; border-block-start: 1px solid var(--border); border-radius: 0 0 var(--r-sm) var(--r-sm); color: var(--danger); font-weight: 750; }
    .tf-account-sign-out svg { inline-size: 20px; block-size: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .tf-account-menu .tf-account-sign-out:hover { background: var(--danger-soft); }
    .tf-account-menu .tf-account-sign-out:focus-visible { outline: 2px solid var(--danger); outline-offset: 2px; }
  `
})
export class AccountMenuComponent {
  readonly role = input.required<DashboardRole>();
  readonly session = inject(SESSION_STORE);
  private readonly locale = inject(LocaleService);
  // Resolved only when someone actually signs out: rendering a menu should not need the session
  // machinery, and every screen that shows this header would otherwise have to provide it.
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);

  readonly open = signal(false);

  /** PRODUCT-P1: every role, Admin and Finance included, manages their own account on one page. */
  readonly settingsPath = computed(() => '/account');

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }

  async signOut(): Promise<void> {
    this.open.set(false);
    await this.injector.get(LogOut).execute();
    await this.router.navigateByUrl('/auth');
  }
}
