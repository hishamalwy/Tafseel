/**
 * What a student is being asked to pay, and — when it differs — what they were shown when they asked
 * (UX-09, DEC-13).
 *
 * A teacher may accept a Direct Request at a price other than the one listed on their offering, in either
 * direction. The student must be able to see both before they decide, so the same four rows appear on the
 * request, the order and checkout, in the same words.
 *
 * The comparison is shown only when there is something to compare: a captured price, in the same currency,
 * that is genuinely different. A request from before the snapshot existed has no history to show, and
 * nothing is invented from today's offering price.
 *
 * Nothing here computes money. The fee and the total come from the order, which the server calculated from
 * the agreed price; the listed price is disclosure only and never enters an arithmetic.
 */

/**
 * Every field is optional and untyped on purpose: this reads an order as the API hands it over, and a
 * screen that is missing one of these must still render the rest rather than fail.
 */
export interface AgreedPriceSource {
  /** The agreed price of the order — what the fee and total were calculated from. */
  readonly price?: unknown;
  readonly currency?: unknown;
  readonly studentFeePercent?: unknown;
  readonly studentFeeAmount?: unknown;
  readonly studentTotal?: unknown;
  /** The offering price when the student sent the request; null for open and historical requests. */
  readonly listedPriceAtRequest?: unknown;
  readonly listedCurrencyAtRequest?: unknown;
  /** The teacher's own words for a price that differs from the listed one (DEC-UX-03). */
  readonly priceChangeReason?: unknown;
}

export interface PriceRow {
  readonly key: 'listed' | 'agreed' | 'price' | 'fee' | 'total';
  readonly labelKey: string;
  readonly fallback: string;
  readonly amount: number;
  /** Fee only: the percentage the order recorded, so the label can say it. */
  readonly percent?: number;
}

export interface AgreedPriceView {
  /** True when the student saw a different price than the one agreed. */
  readonly comparison: boolean;
  readonly currency: string;
  readonly rows: readonly PriceRow[];
  /** The total, repeated for a sticky bar that shows it alone. */
  readonly total: number;
}

const money = (value: unknown): number | null =>
  (typeof value === 'number' && Number.isFinite(value) ? value : null);
const code = (value: unknown): string => (typeof value === 'string' ? value.trim().toUpperCase() : '');

/**
 * The rows to show for an order, and whether they include the comparison.
 *
 * `paid` only changes the last label: before payment it is what the student owes, afterwards it is what the
 * transaction came to.
 */
export function agreedPrice(order: AgreedPriceSource, paid = false): AgreedPriceView {
  const currency = code(order.currency) || 'SAR';
  const agreed = money(order.price) ?? 0;
  const listed = money(order.listedPriceAtRequest);
  const listedCurrency = code(order.listedCurrencyAtRequest);
  const fee = money(order.studentFeeAmount) ?? 0;
  const percent = money(order.studentFeePercent) ?? 0;
  const total = money(order.studentTotal) ?? agreed + fee;

  // A price in another currency cannot be compared with this one, so it is not shown at all.
  const comparison = listed !== null && !!listedCurrency && listedCurrency === currency && listed !== agreed;

  const rows: PriceRow[] = comparison
    ? [
      { key: 'listed', labelKey: 'price_when_sent', fallback: 'Price when you sent the request', amount: listed },
      { key: 'agreed', labelKey: 'price_after_review', fallback: 'Price after the teacher reviewed your request', amount: agreed }
    ]
    : [{ key: 'price', labelKey: 'price_plain', fallback: 'Price', amount: agreed }];

  if (fee > 0) rows.push({ key: 'fee', labelKey: 'price_fee', fallback: 'Tafseel service fee ({percent}%)', amount: fee, percent });
  rows.push({
    key: 'total',
    labelKey: paid ? 'price_total_paid' : 'price_total_due',
    fallback: paid ? 'Total' : 'Total to pay',
    amount: total
  });

  return { comparison, currency, rows, total };
}
