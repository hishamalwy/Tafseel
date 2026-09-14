import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The Tafseel mark and bilingual wordmark.
 *
 * Appears in every header and footer of the legacy pages, copy-pasted each time
 * with slightly different sizes and a `data-tafseel-mark-force` attribute on the
 * dark variants. One component, three inputs.
 */
@Component({
  selector: 'tf-brand-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (tone() === 'auto') {
      <img class="tf-brand-mark-light" decoding="async" data-tafseel-mark
           [attr.loading]="eager() ? null : 'lazy'" src="assets/brand/tafseel-mark.svg"
           [attr.alt]="alt()" [width]="width()" [height]="height()" />
      <img class="tf-brand-mark-dark" decoding="async" data-tafseel-mark data-tafseel-mark-force="dark"
           [attr.loading]="eager() ? null : 'lazy'" src="assets/brand/tafseel-mark-dark.svg"
           alt="" [width]="width()" [height]="height()" />
    } @else {
      <img decoding="async" data-tafseel-mark
           [attr.data-tafseel-mark-force]="tone() === 'dark' ? 'dark' : null"
           [attr.loading]="eager() ? null : 'lazy'"
           [src]="tone() === 'dark' ? 'assets/brand/tafseel-mark-dark.svg' : 'assets/brand/tafseel-mark.svg'"
           [attr.alt]="alt()" [width]="width()" [height]="height()" />
    }
    <span translate="no" class="tf-mursala tf-wordmark">
      <span class="tf-wordmark__ar" lang="ar" dir="rtl">تفصيــل</span><span class="tf-wordmark__en" lang="en">Tafseel</span>
    </span>
  `,
  styles: `
    :host { display: contents; }
    .tf-brand-mark-dark { display: none; }
    :host-context(html[data-theme="dark"]) .tf-brand-mark-light { display: none; }
    :host-context(html[data-theme="dark"]) .tf-brand-mark-dark { display: block; }
  `
})
export class BrandMarkComponent {
  /**
   * Which mark to draw. `auto` follows the theme and is the default, because a
   * mark on a themed surface has to: defaulting to `light` painted the violet
   * mark on the ink background in dark mode, where it nearly disappeared.
   * `light` and `dark` are for surfaces that keep one colour in both themes.
   */
  readonly tone = input<'light' | 'dark' | 'auto'>('auto');
  readonly width = input(20);
  readonly height = input(27);
  /** Empty by default: the surrounding link carries the accessible name. */
  readonly alt = input('');
  readonly eager = input(true);
}
