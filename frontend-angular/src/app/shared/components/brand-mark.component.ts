import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The official Tafseel lockup, preserving the mark-to-lettering ratio. */
@Component({
  selector: 'tf-brand-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (tone() === 'auto') {
      <img class="tf-brand-lockup tf-brand-lockup-light" decoding="async"
           [attr.loading]="eager() ? null : 'lazy'" src="assets/brand/tafseel-lockup.svg"
           [attr.alt]="alt()" [width]="lockupWidth()" [height]="lockupHeight()" />
      <img class="tf-brand-lockup tf-brand-lockup-dark" decoding="async"
           [attr.loading]="eager() ? null : 'lazy'" src="assets/brand/tafseel-lockup-dark.svg"
           alt="" [width]="lockupWidth()" [height]="lockupHeight()" />
    } @else {
      <img class="tf-brand-lockup" decoding="async"
           [attr.loading]="eager() ? null : 'lazy'"
           [src]="tone() === 'dark' ? 'assets/brand/tafseel-lockup-dark.svg' : 'assets/brand/tafseel-lockup.svg'"
           [attr.alt]="alt()" [width]="lockupWidth()" [height]="lockupHeight()" />
    }
  `,
  styles: `
    :host { display: contents; }
    .tf-brand-lockup-dark { display: none; }
    :host-context(html[data-theme="dark"]) .tf-brand-lockup-light { display: none; }
    :host-context(html[data-theme="dark"]) .tf-brand-lockup-dark { display: block; }
  `
})
export class BrandMarkComponent {
  /** Auto follows the page theme; explicit tones support fixed-color surfaces. */
  readonly tone = input<'light' | 'dark' | 'auto'>('auto');
  readonly width = input(20);
  readonly height = input(27);
  lockupHeight(): number { return Math.max(44, this.height()); }
  lockupWidth(): number { return Math.max(this.width(), Math.round(this.lockupHeight() * 1080 / 475.64)); }
  /** Empty by default: the surrounding link carries the accessible name. */
  readonly alt = input('');
  readonly eager = input(true);
}
