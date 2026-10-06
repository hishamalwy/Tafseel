import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { OfferLike, Payable } from '../models/payable';
import { PAYABLE_GATEWAY, PAYMENT_GATEWAY, PayableGateway } from './checkout.ports';
import { InitiatePayment, LoadCheckoutContext } from './checkout.use-cases';

const REQUEST_ID = '6f1c2b8e-4a3d-4f5e-9b1a-2c3d4e5f6a7b';

function load(request: object, offers: object[]) {
  const payables: Partial<PayableGateway> = {
    openRequest: () => of({ id: REQUEST_ID, title: 'Integration', ...request }),
    offers: () => of(offers as readonly OfferLike[]),
    openRequestQuote: () => of({ offerAmount: 120, studentFeePercent: 8,
      studentFeeAmount: 9.6, total: 129.6, currency: 'SAR', reservationExpiresAt: future() }),
    teacher: () => of(null),
    requestAttachmentCount: () => of(2)
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: PAYABLE_GATEWAY, useValue: payables },
      { provide: PAYMENT_GATEWAY, useValue: {} }
    ]
  });
  return TestBed.inject(LoadCheckoutContext).execute('open-request', REQUEST_ID, false);
}

const future = () => new Date(Date.now() + 30 * 60_000).toISOString();
const OFFER = { id: 'o1', teacherId: 't1', amount: 120, currency: 'SAR', includedRevisions: 2 };

describe('LoadCheckoutContext for a reserved open request', () => {
  it('shows the server-quoted fee and total before payment', async () => {
    const context = await load({ status: 6, selectedOfferId: 'o1', paymentReservationExpiresAt: future() }, [{ ...OFFER, id: 'o0', amount: 999 }, OFFER]);
    expect(context?.payable.kind).toBe('open-request');
    expect(context?.payable.total).toBe(129.6);
    expect(context?.payable.lines.map(line => line.amount)).toEqual([120, 9.6]);
    expect(context?.payable.teacherId).toBe('t1');
    expect(Payable.paymentPath(context!.payable)).toBe(`/api/v1/payments/open-requests/${REQUEST_ID}`);
  });

  it('is not payable once the reservation has expired, even if the status has not caught up', async () => {
    expect(await load({ status: 6, selectedOfferId: 'o1', paymentReservationExpiresAt: new Date(Date.now() - 1000).toISOString() }, [OFFER])).toBeNull();
  });

  it('is not payable without a selection', async () => {
    expect(await load({ status: 5, selectedOfferId: null, paymentReservationExpiresAt: null }, [OFFER])).toBeNull();
    expect(await (TestBed.resetTestingModule(), load({ status: 6, selectedOfferId: 'gone', paymentReservationExpiresAt: future() }, [OFFER]))).toBeNull();
  });
});

describe('LoadCheckoutContext for a live session request', () => {
  it('does not open checkout before the teacher accepts', async () => {
    const payables: Partial<PayableGateway> = {
      myLiveSessions: () => of([{ id: REQUEST_ID, status: 9, totalPrice: 120 }])
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: PAYABLE_GATEWAY, useValue: payables },
        { provide: PAYMENT_GATEWAY, useValue: {} }
      ]
    });
    expect(await TestBed.inject(LoadCheckoutContext).execute('live-session', REQUEST_ID, true)).toBeNull();
  });
});


describe('Paymob checkout initiation', () => {
  const payable = Payable.fromOrder({ id: REQUEST_ID, price: 100, studentTotal: 108, currency: 'SAR' }, false);
  it('redirects to the official KSA Unified Checkout with the same command key across retries', async () => {
    const keys: string[] = [];
    TestBed.configureTestingModule({ providers: [{ provide: PAYMENT_GATEWAY, useValue: {
      initiate: (_: Payable, key: string) => { keys.push(key); return of({ checkoutReference: 'https://ksa.checkout.paymob.com/?publicKey=public&clientSecret=checkout' }); }
    } }] });
    const useCase = TestBed.inject(InitiatePayment);
    expect((await useCase.execute(payable)).url).toContain('https://ksa.checkout.paymob.com/');
    await useCase.execute(payable);
    expect(keys[0]).toBe(keys[1]);
  });
  it('accepts only the owned result route and refuses an arbitrary redirect host', async () => {
    let url = `/checkout/result?paymentId=${REQUEST_ID}`;
    TestBed.configureTestingModule({ providers: [{ provide: PAYMENT_GATEWAY, useValue: { initiate: () => of({ checkoutReference: url }) } }] });
    expect((await TestBed.inject(InitiatePayment).execute(payable)).url).toBe(url);
    url = 'https://evil.example/';
    await expect(TestBed.inject(InitiatePayment).execute(payable)).rejects.toThrow('Unsafe');
  });
});
