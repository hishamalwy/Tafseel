import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LocaleService } from '@core/i18n/locale.service';

/**
 * Arabic/English switch. The label names the language you would move *to*,
 * written in that language — the convention the legacy pages used.
 */
@Component({
  selector: 'tf-lang-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="tf-lang-toggle" (click)="locale.toggle()"
            [attr.aria-label]="label()" [attr.title]="label()"></button>
  `,
  styles: `:host { display: contents; }`
})
export class LangToggleComponent {
  readonly locale = inject(LocaleService);
  readonly label = computed(() => (this.locale.lang() === 'ar' ? 'English' : 'العربية'));
}
