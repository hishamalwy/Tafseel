import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LocaleService } from '@core/i18n/locale.service';
import { ThemeService } from '@core/theme/theme.service';

/**
 * Light/dark switch. The sun and moon are cross-faded by `css/tafseel.css`
 * through `html[data-theme]`, so both are always in the DOM and neither is
 * toggled from here.
 */
@Component({
  selector: 'tf-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="tf-theme-toggle" (click)="theme.toggle()" [attr.aria-label]="label()">
      <svg class="tf-icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 14.3A8.5 8.5 0 0 1 9.7 3 7 7 0 1 0 21 14.3z"/></svg>
      <svg class="tf-icon-sun" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0-5h1v3h-2V2zm0 17h1v3h-2v-3zM2 11h3v2H2v-2zm17 0h3v2h-3v-2zM4.2 4.2l2.1 2.1-1.4 1.4-2.1-2.1 1.4-1.4zm14.1 14.1 2.1 2.1-1.4 1.4-2.1-2.1 1.4-1.4zM19.8 4.2l1.4 1.4-2.1 2.1-1.4-1.4 2.1-2.1zM5.6 18.4l1.4 1.4-2.1 2.1-1.4-1.4 2.1-2.1z"/></svg>
    </button>
  `,
  styles: `:host { display: contents; }`
})
export class ThemeToggleComponent {
  readonly theme = inject(ThemeService);
  private readonly locale = inject(LocaleService);

  readonly label = computed(() =>
    this.locale.lang() === 'ar' ? 'تبديل المظهر' : 'Toggle theme');
}
