import { describe, expect, it } from 'vitest';
import { agreedPrice } from '@shared/models/agreed-price';
import { OrderLike, Payable } from './payable';

const ORDER: OrderLike = {
  id: 'o1', currency: 'SAR', price: 150, studentFeePercent: 8, studentFeeAmount: 12, studentTotal: 162,
  listedPriceAtRequest: 100, listedCurrencyAtRequest: 'SAR',
  requestTitle: 'Calculus limits', teacherId: 't1', learningRequestId: 'r1'
};

describe('Payable.fromOrder — the price checkout discloses (UX-09)', () => {
  it('hands checkout the order itself, so it says what the request and order pages say', () => {
    const payable = Payable.fromOrder(ORDER, false);

    expect(payable.order).toBe(ORDER);
    expect(agreedPrice(payable.order!).comparison).toBe(true);
    expect(agreedPrice(payable.order!).rows.map(r => r.key)).toEqual(['listed', 'agreed', 'fee', 'total']);
  });

  it('still charges the agreed total, whatever was quoted', () => {
    expect(Payable.fromOrder(ORDER, false).total).toBe(162);
    expect(Payable.fromOrder({ ...ORDER, listedPriceAtRequest: 1 }, false).total).toBe(162);
  });

  it('leaves the payables that have no order behind them without one', () => {
    expect(Payable.fromLiveSession({ id: 's1', basePrice: 100, totalPrice: 100 }).order).toBeNull();
    expect(Payable.fromOpenRequest({ id: 'r1' }, { id: 'of1', amount: 90 }).order).toBeNull();
  });
});
