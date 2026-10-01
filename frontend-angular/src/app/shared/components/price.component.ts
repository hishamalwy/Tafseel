import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';

/**
 * An amount of money, rendered the way Tafseel renders money.
 *
 * SAR is drawn with the official SAMA mark (U+20C1) via the self-hosted
 * `saudi_riyal` face — the same glyph in Arabic and English. Every other
 * currency falls back to `amount CODE`. The legacy pages repeated this pair of
 * `sc-if` branches at every price on every screen; the decision belongs to the
 * amount, not to each site that shows one.
 *
 * `dir="ltr"` is on the number on purpose: prices read left-to-right even in an
 * Arabic layout.
 */
@Component({
  selector: 'tf-price',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (view().isSarAmount) {
      <span class="tf-price-line" dir="ltr">
        <span class="tf-price-currency tf-price-currency--mark"
              [title]="currencyName()" [attr.aria-label]="currencyName()" data-i18n-skip></span>@if (size(); as scale) {
          <strong [class]="'tf-price-' + scale">{{ view().amountNumber }}</strong>
        } @else {
          {{ view().amountNumber }}
        }
      </span>
    } @else {
      {{ view().amount }}
    }
  `,
  styles: `:host { display: contents; }`
})
export class PriceComponent {
  private readonly fmt = inject(FormatService);
  private readonly locale = inject(LocaleService);

  readonly amount = input.required<number | string | null | undefined>();
  readonly currency = input<string>('SAR');
  /** Shown when the amount is missing; defaults to the translated placeholder. */
  readonly emptyText = input<string | undefined>(undefined);
  /**
   * Type scale, when the site wants one. It has to sit *inside* `.tf-price-line`
   * because `css/tafseel.css` sizes the riyal mark from it
   * (`.tf-price-line:has(.tf-price-md) .tf-price-currency--mark`) — putting the
   * class on a wrapper would leave the mark at body size beside a 28px number.
   */
  readonly size = input<'md' | 'lg' | 'xl' | ''>('');

  readonly view = computed(() =>
    this.fmt.moneyView(this.amount(), this.currency(), this.emptyText()));

  /**
   * What a screen reader says for the drawn mark. It is the only word on the price, so in Arabic it is an
   * Arabic word — "SAR" read aloud in an Arabic sentence is the same defect as printing it (UX-06).
   */
  readonly currencyName = computed(() => this.locale.t('currency_sar', 'SAR'));
}
