import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocaleService } from '@core/i18n/locale.service';
import { BrandMarkComponent } from '@shared/components/brand-mark.component';
import { LangToggleComponent } from '@shared/components/lang-toggle.component';
import { ThemeToggleComponent } from '@shared/components/theme-toggle.component';
import { DashboardRole } from '@features/dashboards/models/dashboard';
import { AccountMenuComponent } from '@features/navigation/pages/account-menu.component';

/**
 * The narrow header used by single-purpose pages: brand, one breadcrumb, and the
 * two preference toggles. Policies, About and the checkout flow each carried
 * their own copy of it.
 */
@Component({
  selector: 'tf-workflow-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AccountMenuComponent, BrandMarkComponent, LangToggleComponent, ThemeToggleComponent],
  template: `
    <header class="tf-workflow-header">
      <div class="tf-shell tf-workflow-header__inner">
        <a class="tf-workflow-header__brand" routerLink="/" [attr.aria-label]="locale.t('nav_home', 'Tafseel home')">
          <tf-brand-mark [width]="18" [height]="24" />
        </a>
        @if (crumb(); as text) {
          <span class="tf-workflow-header__crumb">/ {{ text }}</span>
        }
        <div class="tf-workflow-header__actions">
          <!-- A signed-in person keeps their way home and out (UX-53): the application is long, and people leave mid-way. -->
          @if (role(); as r) { <tf-account-menu [role]="r" /> }
          <tf-lang-toggle />
          <tf-theme-toggle />
        </div>
      </div>
    </header>
  `,
  styles: `:host { display: contents; }`
})
export class WorkflowHeaderComponent {
  readonly locale = inject(LocaleService);
  readonly crumb = input<string>('');
  /** Shown to a signed-in person on a single-purpose page, for the account menu. */
  readonly role = input<DashboardRole | null>(null);
}
