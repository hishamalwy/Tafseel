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
    expect(Payable.fromOpenRequest({ id: 'r1' }, { id: 'of1', amount: 90 }, {
      offerAmount: 90, studentFeePercent: 8, studentFeeAmount: 7.2,
      total: 97.2, currency: 'SAR', reservationExpiresAt: new Date().toISOString()
    }).order).toBeNull();
  });
});

describe('Payable.fromOpenRequest — authoritative charge', () => {
  it('uses the server quote for the fee and final total', () => {
    const payable = Payable.fromOpenRequest({ id: 'r1', title: 'Algebra' },
      { id: 'of1', amount: 90, teacherId: 't1' }, {
        offerAmount: 120, studentFeePercent: 8, studentFeeAmount: 9.6,
        total: 129.6, currency: 'SAR', reservationExpiresAt: new Date().toISOString()
      });
    expect(payable.lines.map(line => line.amount)).toEqual([120, 9.6]);
    expect(payable.total).toBe(129.6);
  });
});

describe('Payable — a purchase that is already paid', () => {
  it('marks a paid or refunded order, so checkout does not offer to pay again', () => {
    expect(Payable.fromOrder({ ...ORDER, paymentStatus: 0 }, false).alreadyPaid).toBe(false);
    expect(Payable.fromOrder({ ...ORDER, paymentStatus: 1 }, false).alreadyPaid).toBe(true);
    expect(Payable.fromOrder({ ...ORDER, paymentStatus: 3 }, false).alreadyPaid).toBe(true);
  });

  it('marks a paid live session, but never an unanswered request, as already paid', () => {
    const booking = { id: 'b1', basePrice: 60, totalPrice: 60 };
    expect(Payable.fromLiveSession({ ...booking, status: 0 }).alreadyPaid).toBe(false);
    expect(Payable.fromLiveSession({ ...booking, status: 1 }).alreadyPaid).toBe(true);
    expect(Payable.fromLiveSession({ ...booking, status: 3 }).alreadyPaid).toBe(false);
    expect(Payable.fromLiveSession({ ...booking, status: 9 }).alreadyPaid).toBe(false);
    expect(Payable.fromLiveSession({ ...booking, status: 10 }).alreadyPaid).toBe(false);
  });
});
