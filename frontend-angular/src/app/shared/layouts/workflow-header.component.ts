import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandMarkComponent } from '@shared/components/brand-mark.component';
import { LangToggleComponent } from '@shared/components/lang-toggle.component';
import { ThemeToggleComponent } from '@shared/components/theme-toggle.component';

/**
 * The narrow header used by single-purpose pages: brand, one breadcrumb, and the
 * two preference toggles. Policies, About and the checkout flow each carried
 * their own copy of it.
 */
@Component({
  selector: 'tf-workflow-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BrandMarkComponent, LangToggleComponent, ThemeToggleComponent],
  template: `
    <header class="tf-workflow-header">
      <div class="tf-shell tf-workflow-header__inner">
        <a class="tf-workflow-header__brand" routerLink="/" aria-label="Tafseel home">
          <tf-brand-mark [width]="18" [height]="24" />
        </a>
        @if (crumb(); as text) {
          <span class="tf-workflow-header__crumb">/ {{ text }}</span>
        }
        <div class="tf-workflow-header__actions">
          <tf-lang-toggle />
          <tf-theme-toggle />
        </div>
      </div>
    </header>
  `,
  styles: `:host { display: contents; }`
})
export class WorkflowHeaderComponent {
  readonly crumb = input<string>('');
}
