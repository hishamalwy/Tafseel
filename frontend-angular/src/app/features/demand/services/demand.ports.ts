import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { CatalogOption, LearningRequest, Offer, OfferInput, OpenRequest, OpenRequestDraft, OpenRequestInput, MyOffer, OfferTerms, SavedOpenDraft } from '../models/demand';

/**
 * The order a request became, with the money the student is asked for.
 *
 * The request page already reads the order list to find the id; carrying the amounts back on the same
 * answer is what lets it disclose the agreed price (UX-09) without a second call.
 */
export interface OrderRef {
  readonly id: string;
  readonly learningRequestId: string;
  readonly price: number;
  readonly currency: string;
  readonly studentFeePercent: number;
  readonly studentFeeAmount: number;
  readonly studentTotal: number;
  readonly paymentStatus: number;
  /** The offering price when the request was sent; null for open and pre-UX-09 requests. */
  readonly listedPriceAtRequest: number | null;
  readonly listedCurrencyAtRequest: string | null;
  /** The teacher's reason when the agreed price differs from the listed one (DEC-UX-03). */
  readonly priceChangeReason?: string | null;
}

export interface DemandGateway {
  subjects(): Observable<readonly CatalogOption[]>;
  /** Service types an open request can name: asynchronous, public, teacher-selectable. */
  openServiceTypes(): Observable<readonly CatalogOption[]>;
  publish(input: OpenRequestInput): Observable<OpenRequest>;

  /** The student's upload-first draft; null when there is none yet. */
  currentDraft(): Observable<SavedOpenDraft | null>;
  /** Keeps what was typed so far (creates the draft if needed). */
  saveDraft(fields: OpenRequestDraft): Observable<SavedOpenDraft>;
  /** Uploads one file; the server scans it before it becomes part of the draft. */
  uploadDraftFile(file: File): Observable<SavedOpenDraft>;
  removeDraftFile(attachmentId: string): Observable<SavedOpenDraft>;

  request(id: string): Observable<LearningRequest>;
  cancel(id: string, version: string): Observable<void>;
  replyToClarification(id: string, message: string, version: string): Observable<void>;
  /** Adds one file to a request that is still being discussed (UX-24). The version changes after each file. */
  attach(id: string, file: File, version: string): Observable<void>;
  requestClarification(id: string, message: string, version: string): Observable<void>;
  decline(id: string, reason: string, version: string): Observable<void>;
  /** The student's or teacher's orders, to find the one a request became. */
  orders(asTeacher: boolean): Observable<readonly OrderRef[]>;

  openRequest(id: string): Observable<OpenRequest>;
  /** The teacher's own offers, newest first, with what became of each request (UX-82). */
  myOffers(): Observable<readonly MyOffer[]>;
  /** The teacher's usual reply time from their public profile, in minutes; null when they have not said. */
  teacherReplyMinutes(teacherId: string): Observable<number | null>;
  /** The catalog's limits for a kind of service, as it applies to this teacher; null if they do not offer it. */
  offerTerms(serviceTypeId: string): Observable<OfferTerms | null>;
  offers(requestId: string): Observable<readonly Offer[]>;
  selectOffer(request: Pick<OpenRequest, 'id' | 'version'>, offer: Pick<Offer, 'id' | 'version'>): Observable<void>;
  cancelSelection(request: Pick<OpenRequest, 'id' | 'version'>): Observable<void>;

  opportunity(id: string): Observable<OpenRequest>;
  submitOffer(requestId: string, input: OfferInput): Observable<Offer>;
  updateOffer(offer: Pick<Offer, 'id' | 'version'>, input: OfferInput): Observable<Offer>;
  withdrawOffer(offer: Pick<Offer, 'id' | 'version'>): Observable<void>;
}

export const DEMAND_GATEWAY = new InjectionToken<DemandGateway>('DemandGateway');
