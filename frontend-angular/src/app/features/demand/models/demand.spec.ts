import { describe, expect, it } from 'vitest';
import { Demand, MyOffer, OFFER_STATUS, Offer, OpenRequestDraft, REQUEST_STATUS, myOfferOutcome } from './demand';

const NOW = Date.parse('2026-09-15T10:00:00Z');
const draft = (patch: Partial<OpenRequestDraft> = {}): OpenRequestDraft => ({
  subjectId: 'subject-1', serviceTypeId: 'catalog-1', title: 'Integration by parts',
  requirements: 'Explain every worked example.', deadline: '2026-09-20T18:00', budgetMin: null, budgetMax: null, ...patch
});

describe('Demand request rules', () => {
  it('lets the student cancel only while the domain allows it', () => {
    const allowed = Object.values(REQUEST_STATUS).filter(s => Demand.canCancel(s));
    expect(allowed).toEqual([REQUEST_STATUS.PENDING_TEACHER_REVIEW, REQUEST_STATUS.CLARIFICATION_REQUESTED,
      REQUEST_STATUS.OPEN_FOR_OFFERS, REQUEST_STATUS.AWAITING_PAYMENT]);
  });

  it('gives the assigned teacher accept, clarify and decline only before a decision', () => {
    expect(Demand.canAccept(REQUEST_STATUS.PENDING_TEACHER_REVIEW)).toBe(true);
    expect(Demand.canAccept(REQUEST_STATUS.CLARIFICATION_REQUESTED)).toBe(false);
    expect(Demand.canRequestClarification(REQUEST_STATUS.CLARIFICATION_REQUESTED)).toBe(false);
    expect(Demand.canDecline(REQUEST_STATUS.CLARIFICATION_REQUESTED)).toBe(true);
    expect(Demand.canDecline(REQUEST_STATUS.ACCEPTED)).toBe(false);
  });

  it('knows a request has an order only once accepted or converted', () => {
    expect(Demand.hasOrder(REQUEST_STATUS.ACCEPTED)).toBe(true);
    expect(Demand.hasOrder(REQUEST_STATUS.CONVERTED_TO_ORDER)).toBe(true);
    expect(Demand.hasOrder(REQUEST_STATUS.AWAITING_PAYMENT)).toBe(false);
  });

  it('maps unknown statuses to a neutral unknown label rather than a wrong one', () => {
    expect(Demand.statusKey(42)).toBe('demand_status_unknown');
    expect(Demand.statusKey(REQUEST_STATUS.AWAITING_PAYMENT)).toBe('demand_status_reserved');
    expect(Demand.offerStatusKey(OFFER_STATUS.NOT_SELECTED)).toBe('offer_status_not_selected');
  });
});

describe('Demand open-marketplace rules', () => {
  it('treats a request as reserved only when awaiting payment with an expiry', () => {
    expect(Demand.isReserved({ status: REQUEST_STATUS.AWAITING_PAYMENT, reservationExpiresAt: '2026-09-15T12:00:00Z' })).toBe(true);
    expect(Demand.isReserved({ status: REQUEST_STATUS.AWAITING_PAYMENT, reservationExpiresAt: '' })).toBe(false);
    expect(Demand.isReserved({ status: REQUEST_STATUS.OPEN_FOR_OFFERS, reservationExpiresAt: '2026-09-15T12:00:00Z' })).toBe(false);
  });

  it('counts the reservation down without going negative', () => {
    expect(Demand.reservationSecondsLeft('2026-09-15T10:02:05Z', NOW)).toBe(125);
    expect(Demand.reservationSecondsLeft('2026-09-15T09:00:00Z', NOW)).toBe(0);
    expect(Demand.reservationSecondsLeft('not a date', NOW)).toBe(0);
    expect(Demand.countdown(125)).toBe('2:05');
    expect(Demand.countdown(7265)).toBe('2:01:05');
  });

  it('allows editing or withdrawing an offer only while it is merely submitted', () => {
    expect(Demand.canEditOffer({ status: OFFER_STATUS.SUBMITTED })).toBe(true);
    for (const status of [OFFER_STATUS.SELECTED, OFFER_STATUS.ACCEPTED, OFFER_STATUS.WITHDRAWN, OFFER_STATUS.NOT_SELECTED, OFFER_STATUS.EXPIRED])
      expect(Demand.canEditOffer({ status })).toBe(false);
    expect(Demand.canEditOffer(null)).toBe(false);
    expect(Demand.canResubmitOffer({ status: OFFER_STATUS.WITHDRAWN })).toBe(true);
  });

  it('compares only live offers, in the order the API returned them', () => {
    const offers = [OFFER_STATUS.WITHDRAWN, OFFER_STATUS.SUBMITTED, OFFER_STATUS.EXPIRED, OFFER_STATUS.SELECTED]
      .map((status, i) => ({ id: `o${i}`, status }) as Offer);
    expect(Demand.liveOffers(offers).map(o => o.id)).toEqual(['o1', 'o3']);
  });
});

describe('Demand open request form', () => {
  it('accepts a complete draft and sends the catalog item under the API name', () => {
    expect(Demand.openProblems(draft(), NOW)).toEqual({});
    const input = Demand.openInput(draft({ title: '  Integration by parts ' }));
    expect(Object.keys(input).sort()).toEqual(['budgetMax', 'budgetMin', 'deadline', 'requirements', 'serviceCatalogItemId', 'subjectId', 'title']);
    expect(input.serviceCatalogItemId).toBe('catalog-1');
    expect(input.title).toBe('Integration by parts');
    expect(input.deadline).toBe(new Date('2026-09-20T18:00').toISOString());
  });

  it('refuses missing terms instead of inventing them', () => {
    expect(Demand.openProblems(Demand.emptyOpenDraft(), NOW)).toEqual({
      subjectId: 'required', serviceTypeId: 'required', title: 'required', requirements: 'required', deadline: 'required'
    });
  });

  it('refuses a past deadline and an incomplete or inverted budget', () => {
    expect(Demand.openProblems(draft({ deadline: '2026-09-01T10:00' }), NOW).deadline).toBe('in_past');
    expect(Demand.openProblems(draft({ budgetMin: 50 }), NOW).budgetMax).toBe('budget_pair');
    expect(Demand.openProblems(draft({ budgetMin: 200, budgetMax: 100 }), NOW).budgetMax).toBe('budget_order');
    expect(Demand.openProblems(draft({ budgetMin: 100, budgetMax: 200 }), NOW)).toEqual({});
  });

  it('checks offer terms against SubmitTeacherOffer', () => {
    const ok = { amount: 120, deliveryHours: 48, includedRevisions: 2, validityHours: 72, message: 'Worked examples.' };
    expect(Demand.offerProblems(ok)).toEqual({});
    expect(Demand.offerProblems({ ...ok, amount: null }).amount).toBe('required');
    expect(Demand.offerProblems({ ...ok, amount: 12.345 }).amount).toBe('out_of_range');
    expect(Demand.offerProblems({ ...ok, deliveryHours: 1.5 }).deliveryHours).toBe('out_of_range');
    expect(Demand.offerProblems({ ...ok, includedRevisions: 21 }).includedRevisions).toBe('out_of_range');
    expect(Demand.offerProblems({ ...ok, validityHours: 0 }).validityHours).toBe('out_of_range');
    expect(Demand.offerProblems({ ...ok, message: ' ' }).message).toBe('required');
  });

  it('prefills an edit from the offer, keeping validity within the allowed range', () => {
    const offer = { amount: 90, deliveryHours: 24, includedRevisions: 1, message: 'Hi', validUntil: '2026-09-15T13:30:00Z' } as Offer;
    expect(Demand.offerDraft(offer, NOW)).toEqual({ amount: 90, deliveryHours: 24, includedRevisions: 1, validityHours: 4, message: 'Hi' });
    expect(Demand.offerDraft({ ...offer, validUntil: '2026-09-15T09:00:00Z' }, NOW).validityHours).toBe(1);
  });
});

describe('What became of a teacher’s offer (UX-82)', () => {
  const offer = (over: Partial<MyOffer>): MyOffer => ({
    id: 'o', requestId: 'r', requestTitle: 'Essay', subjectName: 'English', subjectNameArabic: null, serviceName: 'Review',
    serviceNameArabic: null, amount: 100, currency: 'SAR', deliveryHours: 48, status: OFFER_STATUS.SUBMITTED,
    requestStatus: REQUEST_STATUS.OPEN_FOR_OFFERS, anotherTeacherChosen: false, orderId: null, updatedAt: '', ...over
  });

  it('says another teacher was selected, not a bare "not chosen"', () => {
    const outcome = myOfferOutcome(offer({ status: OFFER_STATUS.NOT_SELECTED, requestStatus: REQUEST_STATUS.CONVERTED_TO_ORDER, anotherTeacherChosen: true }));
    expect(outcome.fallback).toBe('Another teacher was selected for this request.');
    expect(outcome.link).toBeNull();
  });

  it('links to the order when the teacher won, and to the request while it is still open', () => {
    expect(myOfferOutcome(offer({ status: OFFER_STATUS.ACCEPTED, orderId: 'ord' })).link?.path).toBe('/orders/ord');
    expect(myOfferOutcome(offer({})).link?.path).toBe('/teacher/opportunities/r');
    expect(myOfferOutcome(offer({ requestStatus: REQUEST_STATUS.CANCELLED })).key).toBe('my_offers_request_closed');
  });
});

describe('Offer price limits from the service (UX-43)', () => {
  const terms = { minPrice: 50, maxPrice: 400, minDeliveryHours: 12, maxDeliveryHours: 336, maxRevisions: 3 };
  const draft = { amount: 20, deliveryHours: 48, includedRevisions: 2, validityHours: 168, message: 'Hi' };

  it('names the allowed range instead of a bare out-of-range', () => {
    expect(Demand.offerProblems(draft, terms).amount).toBe('price_range');
    expect(Demand.offerProblems({ ...draft, amount: 60 }, terms).amount).toBeUndefined();
    expect(Demand.offerProblems({ ...draft, includedRevisions: 5 }, terms).includedRevisions).toBe('out_of_range');
  });

  it('moves a new offer’s starting values inside the service’s limits', () => {
    expect(Demand.fitOffer({ ...draft, deliveryHours: 1000, includedRevisions: 9 }, terms)).toMatchObject({ deliveryHours: 336, includedRevisions: 3 });
  });
});

describe('upload-first open requests', () => {
  const file = (name: string, size = 1024) => ({ name, size });

  it('accepts the document and image kinds a request carries', () => {
    for (const name of ['sheet.pdf', 'Photo.JPG', 'notes.txt', 'essay.docx', 'slides.pptx', 'scan.png'])
      expect(Demand.fileRefusal(file(name), 0)).toBeNull();
  });

  it('refuses another kind, an empty or oversized file, and a sixth file before sending anything', () => {
    expect(Demand.fileRefusal(file('setup.exe'), 0)).toBe('wrong-type');
    expect(Demand.fileRefusal(file('no-extension'), 0)).toBe('wrong-type');
    expect(Demand.fileRefusal(file('empty.pdf', 0), 0)).toBe('too-large');
    expect(Demand.fileRefusal(file('big.pdf', 25 * 1024 * 1024 + 1), 0)).toBe('too-large');
    expect(Demand.fileRefusal(file('sixth.pdf'), 5)).toBe('too-many');
  });

  it('sends the draft id with the request so its files move onto it, and nothing when there is no draft', () => {
    expect(Demand.openInput(draft(), 'draft-1').draftId).toBe('draft-1');
    expect('draftId' in Demand.openInput(draft())).toBe(false);
  });

  it('shows a saved deadline back in the browser’s own time, and nothing for none', () => {
    const iso = '2026-09-20T15:00:00.000Z';
    const local = Demand.localInputValue(iso);
    expect(new Date(local).toISOString()).toBe(iso);
    expect(Demand.localInputValue(null)).toBe('');
    expect(Demand.localInputValue('not a date')).toBe('');
  });

  it('treats a draft with nothing typed as blank, so it never overwrites the form with emptiness', () => {
    expect(Demand.isBlank(Demand.emptyOpenDraft())).toBe(true);
    expect(Demand.isBlank({ ...Demand.emptyOpenDraft(), title: 'Limits' })).toBe(false);
  });
});
