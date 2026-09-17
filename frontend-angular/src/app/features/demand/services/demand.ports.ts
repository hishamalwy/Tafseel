import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { CatalogOption, LearningRequest, Offer, OfferInput, OpenRequest, OpenRequestInput } from '../models/demand';

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
}

export interface DemandGateway {
  subjects(): Observable<readonly CatalogOption[]>;
  /** Service types an open request can name: asynchronous, public, teacher-selectable. */
  openServiceTypes(): Observable<readonly CatalogOption[]>;
  publish(input: OpenRequestInput): Observable<OpenRequest>;

  request(id: string): Observable<LearningRequest>;
  cancel(id: string, version: string): Observable<void>;
  replyToClarification(id: string, message: string, version: string): Observable<void>;
  requestClarification(id: string, message: string, version: string): Observable<void>;
  decline(id: string, reason: string, version: string): Observable<void>;
  /** The student's or teacher's orders, to find the one a request became. */
  orders(asTeacher: boolean): Observable<readonly OrderRef[]>;

  openRequest(id: string): Observable<OpenRequest>;
  offers(requestId: string): Observable<readonly Offer[]>;
  selectOffer(request: Pick<OpenRequest, 'id' | 'version'>, offer: Pick<Offer, 'id' | 'version'>): Observable<void>;
  cancelSelection(request: Pick<OpenRequest, 'id' | 'version'>): Observable<void>;

  opportunity(id: string): Observable<OpenRequest>;
  submitOffer(requestId: string, input: OfferInput): Observable<Offer>;
  updateOffer(offer: Pick<Offer, 'id' | 'version'>, input: OfferInput): Observable<Offer>;
  withdrawOffer(offer: Pick<Offer, 'id' | 'version'>): Observable<void>;
}

export const DEMAND_GATEWAY = new InjectionToken<DemandGateway>('DemandGateway');
