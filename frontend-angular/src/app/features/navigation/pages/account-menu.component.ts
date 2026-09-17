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
          <button type="button" role="menuitem" data-testid="account-sign-out" (click)="signOut()">{{
            t('nav_sign_out', 'Sign out') }}</button>
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

  /** Quality reviewers keep their account section; admins have no settings screen of their own in V1. */
  readonly settingsPath = computed(() => {
    switch (this.role()) {
      case 'Student': return '/student/settings';
      case 'Teacher': return '/teacher/settings';
      case 'QualityReviewer': return '/quality/account';
      default: return '';
    }
  });

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }

  async signOut(): Promise<void> {
    this.open.set(false);
    await this.injector.get(LogOut).execute();
    await this.router.navigateByUrl('/auth');
  }
}
