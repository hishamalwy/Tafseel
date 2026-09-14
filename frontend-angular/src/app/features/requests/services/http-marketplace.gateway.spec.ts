import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { HttpMarketplaceGateway } from './http-request.gateway';
import { MARKETPLACE_GATEWAY, MarketplaceGateway, OfferTerms } from './request.ports';
import { SubmitOffer } from './request.use-cases';

const openRequest = (overrides: Record<string, unknown> = {}) => ({
  id: 'r-open', studentId: 's1', title: 'Integrals', description: 'Need integrals', preferredDeliveryAt: '2030-01-05T00:00:00Z',
  budget: 200, status: 6, createdAt: '2030-01-01T00:00:00Z', version: 'AAAAAAAAB9E=', sourcingMode: 1,
  serviceNameEnglish: 'Explanation', serviceNameArabic: 'شرح', selectedOfferId: 'o2',
  paymentReservationExpiresAt: '2030-01-01T00:30:00Z', offerCount: 3, ...overrides
});

describe('HttpMarketplaceGateway', () => {
  let gateway: HttpMarketplaceGateway;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [HttpMarketplaceGateway, provideHttpClient(), provideHttpClientTesting()] });
    gateway = TestBed.inject(HttpMarketplaceGateway);
    backend = TestBed.inject(HttpTestingController);
  });

  it('lists a student’s open requests from /learning-requests/mine, keeping only open-marketplace ones (J4-02)', async () => {
    const mine = firstValueFrom(gateway.myRequests());
    const request = backend.expectOne(r => r.url.startsWith('/api/v1/learning-requests/mine'));
    expect(request.request.method).toBe('GET');
    request.flush({ items: [openRequest(), openRequest({ id: 'r-direct', sourcingMode: 0 })], totalCount: 2 });

    const list = await mine;
    expect(list.map(r => r.id)).toEqual(['r-open']);
    expect(list[0]).toMatchObject({
      offerCount: 3, selectedOfferId: 'o2', status: 6,
      paymentReservationExpiresAt: '2030-01-01T00:30:00Z', version: 'AAAAAAAAB9E=',
      description: 'Need integrals', budget: 200, deadline: '2030-01-05T00:00:00Z'
    });
    backend.expectNone('/api/v1/open-marketplace/requests?pageSize=50');
  });

  it('maps a teacher opportunity, including whether the teacher already offered', async () => {
    const list = firstValueFrom(gateway.opportunities());
    backend.expectOne(r => r.url.startsWith('/api/v1/open-marketplace/opportunities')).flush({ items: [{
      id: 'r1', title: 'Integrals', requirements: 'Need integrals', deadline: '2030-01-05T00:00:00Z', budgetMin: 100,
      budgetMax: 250, currency: 'SAR', status: 5, publishedAt: '2030-01-01T00:00:00Z', paymentReservationExpiresAt: null,
      selectedOfferId: null, subjectName: 'Maths', subjectNameArabic: 'رياضيات', version: 'v', offerCount: 2,
      myOffer: { id: 'mine' }
    }] });
    expect((await list)[0]).toMatchObject({ description: 'Need integrals', budget: 250, myOfferId: 'mine', subjectName: 'Maths' });
  });

  it('reads the offer list as the plain array the API returns', async () => {
    const offers = firstValueFrom(gateway.offers('r1'));
    backend.expectOne('/api/v1/open-marketplace/requests/r1/offers').flush([{
      id: 'o1', teacherId: 't1', amount: 180, currency: 'SAR', deliveryHours: 48, message: 'I can help', status: 0,
      version: 'ov', includedRevisions: 3, validUntil: '2030-01-08T00:00:00Z'
    }]);
    expect(await offers).toEqual([{
      id: 'o1', teacherId: 't1', teacherDisplayName: null, teacherDisplayNameEnglish: null, price: 180, currency: 'SAR',
      deliveryHours: 48, includedRevisions: 3, validUntil: '2030-01-08T00:00:00Z', message: 'I can help', status: 0, version: 'ov'
    }]);
  });

  it('submits an offer to the opportunity endpoint with exactly the SubmitTeacherOffer keys (J4-05)', async () => {
    const terms: OfferTerms = { amount: 180, deliveryHours: 48, includedRevisions: 3, validityHours: 168, message: 'I can help' };
    const sent = firstValueFrom(gateway.submitOffer('r1', terms), { defaultValue: undefined });
    const request = backend.expectOne('/api/v1/open-marketplace/opportunities/r1/offers');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ amount: 180, deliveryHours: 48, includedRevisions: 3, validityHours: 168, message: 'I can help' });
    request.flush({ id: 'o1' }, { status: 201, statusText: 'Created' });
    await sent;
    backend.expectNone('/api/v1/open-marketplace/requests/r1/offers');
  });

  it('selects an offer on the real route with both server-issued versions and expects no order (J4-07)', async () => {
    const selected = firstValueFrom(
      gateway.selectOffer({ id: 'r1', version: 'AAAAAAAAB9E=' }, { id: 'o2', version: 'AAAAAAAAB9I=' }), { defaultValue: undefined });
    const request = backend.expectOne('/api/v1/open-marketplace/requests/r1/offers/o2/select');

    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('If-Match')).toBe('AAAAAAAAB9E=');
    expect(request.request.headers.get('X-Offer-Version')).toBe('AAAAAAAAB9I=');
    expect(request.request.body).toBeNull();
    request.flush(null, { status: 204, statusText: 'No Content' });
    // 204: nothing to read - in particular no orderId, because selection only reserves the request.
    await expect(selected).resolves.toBeNull();
  });

  it('surfaces a stale version as the API’s 409 conflict', async () => {
    const selected = firstValueFrom(gateway.selectOffer({ id: 'r1', version: 'old' }, { id: 'o2', version: 'old' }));
    backend.expectOne('/api/v1/open-marketplace/requests/r1/offers/o2/select')
      .flush({ code: 'concurrency_conflict' }, { status: 409, statusText: 'Conflict' });
    const error = await selected.catch(e => e);
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(409);
  });
});

describe('SubmitOffer', () => {
  const calls: unknown[] = [];
  const valid: OfferTerms = { amount: 100, deliveryHours: 24, includedRevisions: 2, validityHours: 168, message: ' Ready ' };

  beforeEach(() => {
    calls.length = 0;
    const fake: Partial<MarketplaceGateway> = { submitOffer: (id, terms) => { calls.push([id, terms]); return of(undefined); } };
    TestBed.configureTestingModule({ providers: [{ provide: MARKETPLACE_GATEWAY, useValue: fake }] });
  });

  it('sends trimmed terms when they are within the contract', async () => {
    await TestBed.inject(SubmitOffer).execute('r1', valid);
    expect(calls).toEqual([['r1', { ...valid, message: 'Ready' }]]);
  });

  it.each([
    [{ amount: 0 }, 'offer-needs-price'],
    [{ deliveryHours: 0 }, 'offer-needs-delivery'],
    [{ deliveryHours: 8761 }, 'offer-needs-delivery'],
    [{ includedRevisions: 21 }, 'offer-needs-revisions'],
    [{ validityHours: 721 }, 'offer-needs-validity'],
    [{ message: '   ' }, 'offer-needs-message']
  ])('refuses %o before any request (%s)', async (change, code) => {
    await expect(TestBed.inject(SubmitOffer).execute('r1', { ...valid, ...change })).rejects.toThrow(code);
    expect(calls).toEqual([]);
  });
});
