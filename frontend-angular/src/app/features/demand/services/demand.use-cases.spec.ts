import { HttpErrorResponse, HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { LearningRequest, OFFER_STATUS, Offer, OpenRequest, REQUEST_STATUS, SOURCING } from '../models/demand';
import { DEMAND_GATEWAY, DemandGateway } from './demand.ports';
import { DraftInvalid, LoadRequest, ManageOffer, ManageRequest, OfferChanged, PublishOpenRequest, SelectOffer } from './demand.use-cases';
import { HttpDemandGateway } from './http-demand.gateway';

function withGateway(gateway: Partial<DemandGateway>) {
  TestBed.configureTestingModule({
    providers: [LoadRequest, ManageRequest, ManageOffer, PublishOpenRequest, SelectOffer, { provide: DEMAND_GATEWAY, useValue: gateway }]
  });
}

const OPEN = { id: 'r1', version: 'rv1', status: REQUEST_STATUS.OPEN_FOR_OFFERS } as OpenRequest;
const OFFER = { id: 'o1', version: 'ov1', status: OFFER_STATUS.SUBMITTED } as Offer;
const OFFER_DRAFT = { amount: 120, deliveryHours: 48, includedRevisions: 2, validityHours: 72, message: 'Worked examples.' };

describe('SelectOffer', () => {
  it('turns a 409 into OfferChanged so the student reviews the new terms', async () => {
    withGateway({ selectOffer: () => throwError(() => new HttpErrorResponse({ status: 409 })) });
    await expect(TestBed.inject(SelectOffer).execute(OPEN, OFFER)).rejects.toBeInstanceOf(OfferChanged);
  });

  it('passes other failures through unchanged', async () => {
    const failure = new HttpErrorResponse({ status: 400, error: { code: 'offer_expired' } });
    withGateway({ selectOffer: () => throwError(() => failure) });
    await expect(TestBed.inject(SelectOffer).execute(OPEN, OFFER)).rejects.toBe(failure);
  });
});

describe('ManageOffer', () => {
  it('updates a submitted offer, and submits again when the previous one was withdrawn', async () => {
    const updateOffer = vi.fn(() => of(OFFER)), submitOffer = vi.fn(() => of(OFFER));
    withGateway({ updateOffer, submitOffer });
    const manage = TestBed.inject(ManageOffer);
    await manage.save('r1', OFFER, OFFER_DRAFT);
    expect(updateOffer).toHaveBeenCalledWith(OFFER, OFFER_DRAFT);
    await manage.save('r1', { ...OFFER, status: OFFER_STATUS.WITHDRAWN }, OFFER_DRAFT);
    await manage.save('r1', null, OFFER_DRAFT);
    expect(submitOffer).toHaveBeenCalledTimes(2);
    expect(updateOffer).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when the terms are invalid', async () => {
    const submitOffer = vi.fn(() => of(OFFER));
    withGateway({ submitOffer });
    await expect(TestBed.inject(ManageOffer).save('r1', null, { ...OFFER_DRAFT, amount: null })).rejects.toBeInstanceOf(DraftInvalid);
    expect(submitOffer).not.toHaveBeenCalled();
  });
});

describe('PublishOpenRequest and ManageRequest', () => {
  it('does not publish an incomplete request', async () => {
    const publish = vi.fn();
    withGateway({ publish });
    await expect(TestBed.inject(PublishOpenRequest).execute({
      subjectId: '', serviceTypeId: '', title: '', requirements: '', deadline: '', budgetMin: null, budgetMax: null
    })).rejects.toBeInstanceOf(DraftInvalid);
    expect(publish).not.toHaveBeenCalled();
  });

  it('trims a clarification and refuses an empty one', async () => {
    const replyToClarification = vi.fn(() => of(undefined));
    withGateway({ replyToClarification });
    const manage = TestBed.inject(ManageRequest);
    const request = { id: 'r1', version: 'v1' } as Parameters<ManageRequest['reply']>[0];
    await expect(manage.reply(request, '   ')).rejects.toBeInstanceOf(DraftInvalid);
    await manage.reply(request, '  Chapter four only. ');
    expect(replyToClarification).toHaveBeenCalledWith('r1', 'Chapter four only.', 'v1');
  });

  it('sends the files the teacher asked for before the answer, each against the latest version (UX-24)', async () => {
    const calls: string[] = [];
    let version = 1;
    const attach = vi.fn((_id: string, file: File, v: string) => { calls.push(`attach ${file.name} ${v}`); version++; return of(undefined); });
    const request = vi.fn(() => of({ id: 'r1', version: `v${version}` }));
    const replyToClarification = vi.fn((_id: string, _m: string, v: string) => { calls.push(`reply ${v}`); return of(undefined); });
    withGateway({ attach, request, replyToClarification } as unknown as Partial<DemandGateway>);
    const manage = TestBed.inject(ManageRequest);
    const files = [new File(['a'], 'page1.png', { type: 'image/png' }), new File(['b'], 'page2.png', { type: 'image/png' })];
    await manage.reply({ id: 'r1', version: 'v1' } as Parameters<ManageRequest['reply']>[0], 'Here they are.', files);
    expect(calls).toEqual(['attach page1.png v1', 'attach page2.png v2', 'reply v3']);
  });
});

describe('LoadRequest', () => {
  const request = (patch: object) => ({ id: 'r1', studentId: 's1', teacherId: 't1', sourcing: SOURCING.DIRECT, status: REQUEST_STATUS.PENDING_TEACHER_REVIEW, ...patch });
  const order = (patch: object) => ({
    id: 'order-1', learningRequestId: 'r1', price: 150, currency: 'SAR',
    studentFeePercent: 8, studentFeeAmount: 12, studentTotal: 162, paymentStatus: 0,
    listedPriceAtRequest: 100, listedCurrencyAtRequest: 'SAR', ...patch
  });

  it('finds the order a request became among the viewer’s own orders', async () => {
    const orders = vi.fn(() => of([order({ id: 'other', learningRequestId: 'r9' }), order({})]));
    withGateway({ request: () => of(request({ status: REQUEST_STATUS.ACCEPTED }) as unknown as LearningRequest), orders });
    const view = await TestBed.inject(LoadRequest).execute('r1', 't1');
    expect(view.orderId).toBe('order-1');
    expect(orders).toHaveBeenCalledWith(true);
  });

  it('brings back that order’s money, so the request can disclose the agreed price', async () => {
    // UX-09: the page shows what the student was quoted beside what they owe, and reads no second endpoint
    // to do it.
    const orders = vi.fn(() => of([order({})]));
    withGateway({ request: () => of(request({ status: REQUEST_STATUS.ACCEPTED }) as unknown as LearningRequest), orders });
    const view = await TestBed.inject(LoadRequest).execute('r1', 's1');
    expect(view.order?.price).toBe(150);
    expect(view.order?.listedPriceAtRequest).toBe(100);
    expect(view.order?.studentTotal).toBe(162);
    expect(orders).toHaveBeenCalledTimes(1);
  });

  it('carries no order when the request never became one', async () => {
    withGateway({ request: () => of(request({}) as unknown as LearningRequest), orders: vi.fn(() => of([])) });
    const view = await TestBed.inject(LoadRequest).execute('r1', 's1');
    expect(view.order).toBeNull();
    expect(view.orderId).toBe('');
  });

  it('reads the open-marketplace view only for the request’s own student', async () => {
    const openRequest = vi.fn(() => of(OPEN));
    withGateway({ request: () => of(request({ sourcing: SOURCING.OPEN, status: REQUEST_STATUS.OPEN_FOR_OFFERS }) as unknown as LearningRequest), openRequest, orders: vi.fn() });
    expect((await TestBed.inject(LoadRequest).execute('r1', 's1')).open).toBe(OPEN);
    expect((await TestBed.inject(LoadRequest).execute('r1', 't1')).open).toBeNull();
    expect(openRequest).toHaveBeenCalledTimes(1);
  });
});

describe('HttpDemandGateway', () => {
  function gateway() {
    TestBed.configureTestingModule({ providers: [HttpDemandGateway, provideHttpClient(), provideHttpClientTesting()] });
    return { http: TestBed.inject(HttpDemandGateway), backend: TestBed.inject(HttpTestingController) };
  }
  const header = (headers: HttpHeaders, name: string) => headers.get(name);

  it('selects with both versions it read, so a changed offer is refused', async () => {
    const { http, backend } = gateway();
    const done = firstValueFrom(http.selectOffer(OPEN, OFFER));
    const call = backend.expectOne('/api/v1/open-marketplace/requests/r1/offers/o1/select');
    expect(call.request.method).toBe('POST');
    expect(header(call.request.headers, 'If-Match')).toBe('rv1');
    expect(header(call.request.headers, 'X-Offer-Version')).toBe('ov1');
    call.flush(null);
    await done;
    backend.verify();
  });

  it('edits and withdraws an offer under its own version', async () => {
    const { http, backend } = gateway();
    const updated = firstValueFrom(http.updateOffer(OFFER, OFFER_DRAFT));
    const put = backend.expectOne('/api/v1/open-marketplace/offers/o1');
    expect(put.request.method).toBe('PUT');
    expect(header(put.request.headers, 'If-Match')).toBe('ov1');
    expect(Object.keys(put.request.body).sort()).toEqual(['amount', 'deliveryHours', 'includedRevisions', 'message', 'validityHours']);
    put.flush({ id: 'o1', learningRequestId: 'r1', status: 0, version: 'ov2' });
    expect((await updated).version).toBe('ov2');

    const withdrawn = firstValueFrom(http.withdrawOffer(OFFER));
    const post = backend.expectOne('/api/v1/open-marketplace/offers/o1/withdraw');
    expect(header(post.request.headers, 'If-Match')).toBe('ov1');
    post.flush(null);
    await withdrawn;
    backend.verify();
  });

  it('reads the reservation from the field the API names', async () => {
    const { http, backend } = gateway();
    const read = firstValueFrom(http.openRequest('r1'));
    backend.expectOne('/api/v1/open-marketplace/requests/r1').flush({
      id: 'r1', status: 6, selectedOfferId: 'o1', paymentReservationExpiresAt: '2026-09-15T12:00:00Z', attachments: [], version: 'v'
    });
    const request = await read;
    expect(request.reservationExpiresAt).toBe('2026-09-15T12:00:00Z');
    expect(request.selectedOfferId).toBe('o1');
  });
});
