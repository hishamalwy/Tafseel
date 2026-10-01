import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LocaleService } from '@core/i18n/locale.service';

/**
 * Skip-to-content link: the first focusable element on every screen with a <main>.
 *
 * It moves focus itself instead of relying on the `#fragment`. The app runs under
 * `<base href="/ar/">`, so a bare `href="#main"` resolves to `/ar/#main` and, on any page
 * other than the home page, sent the reader back to the home page instead of past the
 * navigation. `scripts/check-component-styles.mjs` fails the build when a template with a
 * <main> has no skip link pointing at that main's id.
 */
@Component({
  selector: 'tf-skip-link',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<a [attr.href]="'#' + target()" class="tf-skip" (click)="skip($event)">{{ label() }}</a>`,
  styles: `:host { display: contents; }`
})
export class SkipLinkComponent {
  private readonly locale = inject(LocaleService);
  private readonly document = inject(DOCUMENT);

  /** The id of the <main> this link skips to. */
  readonly target = input('main');

  readonly label = computed(() =>
    this.locale.lang() === 'ar' ? 'تخطَّ إلى المحتوى الرئيسي' : 'Skip to main content');

  skip(event: Event): void {
    const main = this.document.getElementById(this.target());
    if (!main) return;
    event.preventDefault();
    // A <main> is not focusable by default; -1 lets script focus it without adding a tab stop.
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    main.focus();
    main.scrollIntoView?.({ block: 'start' });
  }
}
