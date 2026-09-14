import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LocaleService } from '@core/i18n/locale.service';

/**
 * Skip-to-content link. Every page needs one and every legacy page wrote its own,
 * some translated through `data-i18n` and some not.
 */
@Component({
  selector: 'tf-skip-link',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<a href="#main" class="tf-skip">{{ label() }}</a>`,
  styles: `:host { display: contents; }`
})
export class SkipLinkComponent {
  private readonly locale = inject(LocaleService);
  readonly label = computed(() =>
    this.locale.lang() === 'ar' ? 'تخطَّ إلى المحتوى الرئيسي' : 'Skip to main content');
}
