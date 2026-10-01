import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LocaleService } from '@core/i18n/locale.service';
import { ThemeService } from '@core/theme/theme.service';

let nextMaskId = 0;

/**
 * Light/dark switch. One icon morphs between a crescent and a sun: the disc
 * shrinks, the shadow that bites it slides away and the rays open. Every step is
 * driven by `css/tafseel.css` through `html[data-theme]`, so nothing is toggled
 * from here and the first paint is already right.
 */
@Component({
  selector: 'tf-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="tf-theme-toggle" (click)="theme.toggle()" [attr.aria-label]="label()">
      <svg class="tf-theme-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <mask [attr.id]="maskId">
          <rect width="24" height="24" fill="#fff" />
          <circle class="tf-theme-icon__bite" cx="18.5" cy="5.5" r="7" fill="#000" />
        </mask>
        <circle class="tf-theme-icon__disc" cx="12" cy="12" r="8.5" [attr.mask]="'url(#' + maskId + ')'" />
        <g class="tf-theme-icon__rays">
          <path d="M12 1.75v1.5M12 20.75v1.5M1.75 12h1.5M20.75 12h1.5M4.75 4.75l1.06 1.06M18.19 18.19l1.06 1.06M4.75 19.25l1.06-1.06M18.19 5.81l1.06-1.06" />
        </g>
      </svg>
    </button>
  `,
  styles: `:host { display: contents; }`
})
export class ThemeToggleComponent {
  readonly theme = inject(ThemeService);
  private readonly locale = inject(LocaleService);

  /** Mask ids are document-global, and a page can hold more than one toggle. */
  readonly maskId = `tf-theme-mask-${nextMaskId++}`;

  readonly label = computed(() =>
    this.locale.lang() === 'ar' ? 'تبديل المظهر' : 'Toggle theme');
}
