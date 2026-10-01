import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { AgreedPriceSource, PriceRow, agreedPrice } from '@shared/models/agreed-price';
import { PriceComponent } from './price.component';

/**
 * What the student pays, and — when the teacher accepted at a different price — what they were shown when
 * they sent the request (UX-09).
 *
 * The request, the order and checkout all render this one component, so the three screens cannot drift into
 * three different accounts of the same money. The rows come from `agreedPrice`; this only puts words and the
 * house money mark on them.
 */
@Component({
  selector: 'tf-price-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PriceComponent],
  template: `
    <dl class="tf-price-panel" [attr.data-comparison]="view().comparison" [attr.data-emphasis]="emphasis()" data-testid="price-panel">
      @for (row of view().rows; track row.key) {
        <div class="tf-price-panel-row" [attr.data-row]="row.key" [attr.data-testid]="'price-row-' + row.key">
          <dt>{{ label(row) }}</dt>
          <dd><tf-price [amount]="row.amount" [currency]="view().currency" [size]="row.key === 'total' ? totalSize() : ''" /></dd>
        </div>
      }
    </dl>
    @if (reason(); as why) {
      <p class="tf-price-panel-reason" data-testid="price-reason"><strong>{{ locale.t('price_reason_label', 'Why the price changed (the teacher’s words):') }}</strong> <span dir="auto">{{ why }}</span></p>
    }
    @if (!paid()) {
      <p class="tf-price-panel-note" data-testid="price-note">{{ locale.t('price_nothing_charged', 'Nothing is charged unless you choose to pay.') }}</p>
    }
  `,
  styles: `
    :host { display: block; }
    .tf-price-panel { display: flex; flex-direction: column; gap: 12px; margin: 0; }
    .tf-price-panel-row { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; font-size: 15px; }
    .tf-price-panel-row dt { color: var(--text-2); margin: 0; }
    .tf-price-panel-row dd { margin: 0; font-weight: 650; text-align: end; word-break: break-word; }
    .tf-price-panel-row[data-row='total'] { margin-block-start: 4px; padding-block-start: 14px; border-block-start: 1px solid var(--border); }
    .tf-price-panel-row[data-row='total'] dt { color: var(--text); font-weight: 650; }
    .tf-price-panel-reason { margin: 12px 0 0; padding: 10px 12px; font-size: 14px; line-height: 1.6; background: var(--surface-2); border-radius: var(--r-sm); }
    .tf-price-panel-note { margin: 12px 0 0; font-size: 13px; color: var(--text-2); line-height: 1.5; max-width: 48ch; }
    /* Checkout: the amount being charged is the loudest thing on the screen, as it was before UX-09. */
    .tf-price-panel[data-emphasis='true'] .tf-price-panel-row[data-row='total'] { margin-block-start: 8px; padding-block-start: 16px; }
    .tf-price-panel[data-emphasis='true'] .tf-price-panel-row[data-row='total'] dd {
      font-family: var(--font-display); font-weight: 700; letter-spacing: -.03em; font-variant-numeric: tabular-nums; line-height: 1.1;
    }
  `
})
export class PricePanelComponent {
  readonly locale = inject(LocaleService);
  private readonly fmt = inject(FormatService);

  /** The order, straight from the API: its price, fee, total and captured listed price. */
  readonly order = input.required<AgreedPriceSource>();
  /** True once the money has actually been taken, which changes only the last label. */
  readonly paid = input(false);
  /** Checkout sizes the total like the headline it is; the detail pages keep it in the body scale. */
  readonly emphasis = input(false);

  readonly view = computed(() => agreedPrice(this.order(), this.paid()));
  /** Shown only when the agreed price differs from the listed one and the teacher explained it. */
  readonly reason = computed(() => {
    const value = this.order().priceChangeReason;
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  });
  readonly totalSize = computed<'md' | 'xl' | ''>(() => (this.emphasis() ? 'xl' : 'md'));

  label(row: PriceRow): string {
    return row.percent === undefined
      ? this.locale.t(row.labelKey, row.fallback)
      // The fee is the one label that carries a number, and it is the rate the order recorded — not a
      // constant this screen knows.
      : this.locale.format(row.labelKey, { percent: this.fmt.number(row.percent, { maximumFractionDigits: 2 }) }, row.fallback);
  }
}
