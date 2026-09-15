import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { OfferLike, Payable } from '../models/payable';
import { PAYABLE_GATEWAY, PAYMENT_GATEWAY, PayableGateway } from './checkout.ports';
import { LoadCheckoutContext } from './checkout.use-cases';

const REQUEST_ID = '6f1c2b8e-4a3d-4f5e-9b1a-2c3d4e5f6a7b';

function load(request: object, offers: object[]) {
  const payables: Partial<PayableGateway> = {
    openRequest: () => of({ id: REQUEST_ID, title: 'Integration', ...request }),
    offers: () => of(offers as readonly OfferLike[]),
    teacher: () => of(null),
    requestAttachmentCount: () => of(2)
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: PAYABLE_GATEWAY, useValue: payables },
      { provide: PAYMENT_GATEWAY, useValue: { mockSimulatorEnabled: () => of(false) } }
    ]
  });
  return TestBed.inject(LoadCheckoutContext).execute('open-request', REQUEST_ID, false);
}

const future = () => new Date(Date.now() + 30 * 60_000).toISOString();
const OFFER = { id: 'o1', teacherId: 't1', amount: 120, currency: 'SAR', includedRevisions: 2 };

describe('LoadCheckoutContext for a reserved open request', () => {
  it('prices the selected offer and leaves the student fee to the server', async () => {
    const context = await load({ status: 6, selectedOfferId: 'o1', paymentReservationExpiresAt: future() }, [{ ...OFFER, id: 'o0', amount: 999 }, OFFER]);
    expect(context?.payable.kind).toBe('open-request');
    expect(context?.payable.total).toBe(120);
    expect(context?.payable.feeAtPayment).toBe(true);
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
