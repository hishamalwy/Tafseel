import { describe, expect, it } from 'vitest';
import { AgreedPriceSource, agreedPrice } from './agreed-price';

/**
 * UX-09 / DEC-13. The teacher's offering said 100 when the student sent the request; the teacher later
 * edited the offering to 120 and accepted at 150. The student is charged on 150 and is told both numbers.
 */
const order = (over: Partial<AgreedPriceSource> = {}): AgreedPriceSource => ({
  price: 150, currency: 'SAR', studentFeePercent: 8, studentFeeAmount: 12, studentTotal: 162,
  listedPriceAtRequest: 100, listedCurrencyAtRequest: 'SAR', ...over
});

const amountOf = (view: ReturnType<typeof agreedPrice>, key: string) =>
  view.rows.find(r => r.key === key)?.amount;

describe('agreedPrice', () => {
  it('shows both numbers when the teacher accepted at a different price', () => {
    const view = agreedPrice(order());

    expect(view.comparison).toBe(true);
    expect(view.rows.map(r => r.key)).toEqual(['listed', 'agreed', 'fee', 'total']);
    expect(amountOf(view, 'listed')).toBe(100);
    expect(amountOf(view, 'agreed')).toBe(150);
  });

  it('shows both numbers when the accepted price is lower than the one quoted', () => {
    // Disclosure is not a warning about increases: a discount is history too.
    const view = agreedPrice(order({ price: 80, studentFeeAmount: 6.4, studentTotal: 86.4 }));

    expect(view.comparison).toBe(true);
    expect(amountOf(view, 'listed')).toBe(100);
    expect(amountOf(view, 'agreed')).toBe(80);
  });

  it('says it once when the agreed price is the price the student saw', () => {
    const view = agreedPrice(order({ price: 100, studentFeeAmount: 8, studentTotal: 108 }));

    expect(view.comparison).toBe(false);
    expect(view.rows.map(r => r.key)).toEqual(['price', 'fee', 'total']);
    expect(amountOf(view, 'price')).toBe(100);
  });

  it('invents no history for a request sent before the price was captured', () => {
    const view = agreedPrice(order({ listedPriceAtRequest: null, listedCurrencyAtRequest: null }));

    expect(view.comparison).toBe(false);
    expect(view.rows.some(r => r.key === 'listed')).toBe(false);
    expect(amountOf(view, 'price')).toBe(150);
  });

  it('makes no comparison across currencies', () => {
    // Two amounts in different currencies are not a price change; showing them side by side would read
    // as one.
    const view = agreedPrice(order({ listedCurrencyAtRequest: 'USD' }));

    expect(view.comparison).toBe(false);
    expect(view.rows.some(r => r.key === 'listed')).toBe(false);
  });

  it('halves are treated as absent', () => {
    expect(agreedPrice(order({ listedCurrencyAtRequest: null })).comparison).toBe(false);
    expect(agreedPrice(order({ listedPriceAtRequest: null })).comparison).toBe(false);
  });

  it('carries the fee rate the order recorded, not one this screen knows', () => {
    const view = agreedPrice(order({ studentFeePercent: 5, studentFeeAmount: 7.5, studentTotal: 157.5 }));

    expect(view.rows.find(r => r.key === 'fee')?.percent).toBe(5);
    expect(amountOf(view, 'fee')).toBe(7.5);
  });

  it('leaves out a fee of nothing rather than printing a zero', () => {
    const view = agreedPrice(order({ studentFeeAmount: 0, studentTotal: 150 }));

    expect(view.rows.some(r => r.key === 'fee')).toBe(false);
    expect(view.total).toBe(150);
  });

  it('takes the total from the order and never adds it up itself', () => {
    // The server is the only authority on what is owed (DEC-02). If it says 999, the screen says 999.
    const view = agreedPrice(order({ studentTotal: 999 }));

    expect(view.total).toBe(999);
    expect(amountOf(view, 'total')).toBe(999);
  });

  it('never lets the captured price reach the arithmetic', () => {
    const cheap = agreedPrice(order({ listedPriceAtRequest: 1 }));
    const dear = agreedPrice(order({ listedPriceAtRequest: 999_999 }));

    expect(cheap.total).toBe(162);
    expect(dear.total).toBe(162);
    expect(amountOf(cheap, 'fee')).toBe(12);
    expect(amountOf(dear, 'fee')).toBe(12);
  });

  it('names the last row for what it is, before and after paying', () => {
    expect(agreedPrice(order()).rows.at(-1)?.labelKey).toBe('price_total_due');
    expect(agreedPrice(order(), true).rows.at(-1)?.labelKey).toBe('price_total_paid');
  });

  it('survives an order that arrives without its numbers', () => {
    const view = agreedPrice({});

    expect(view.currency).toBe('SAR');
    expect(view.comparison).toBe(false);
    expect(view.total).toBe(0);
  });
});
