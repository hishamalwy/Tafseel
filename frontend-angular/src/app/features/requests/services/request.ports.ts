import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { RequestDraft, RequestableService } from '../models/learning-request';

export interface CreatedRequest {
  readonly id: string;
  readonly version: string;
}

export interface NewRequest {
  /** Client-side only: which teacher's draft to clear. The service names the teacher on the wire. */
  readonly teacherId: string;
  readonly teacherServiceId: string;
  readonly title: string;
  readonly description: string;
  /** ISO instant, in the future. */
  readonly preferredDeliveryAt: string;
  /** Null when the student is flexible on budget. */
  readonly budget: number | null;
}

/** What the request assistant answered (AiRequestAssistantResult). */
export interface BriefSuggestion {
  /** success, needs_clarification, no_canonical_match, unavailable, unsupported */
  readonly status: string;
  /** The server's own sentence for the reader, whatever the status. */
  readonly message: string;
  /** Suggested description when the status is success. */
  readonly suggestion: string | null;
}

export interface LearningPreferences {
  readonly explanationStyle: string | null;
  readonly preferredTeachingLanguageId: string | null;
}

/** `LearningRequestStatus` as the API serializes it. */
export const enum RequestStatus { OpenForOffers = 5, AwaitingPayment = 6, ConvertedToOrder = 7, Expired = 8 }
/** `TeacherOfferStatus` as the API serializes it. */
export const enum OfferStatus { Submitted = 0, Selected = 1, Accepted = 2, Withdrawn = 3, NotSelected = 4, Expired = 5 }

/**
 * An open request, as seen by a student (from `GET /learning-requests/mine`) or a teacher
 * (from `GET /open-marketplace/opportunities`). Both are mapped into this one shape.
 */
export interface OpenRequest {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** The subject for a teacher; the service for a student, whose list does not carry the subject. */
  readonly subjectName: string;
  readonly subjectNameArabic: string;
  readonly status: number;
  readonly deadline: string | null;
  readonly budget: number | null;
  readonly currency: string;
  readonly offerCount: number;
  readonly createdAt: string;
  /** Concurrency token; sent as If-Match when the student selects an offer. */
  readonly version: string;
  readonly selectedOfferId: string | null;
  /** While the request is reserved for payment of the selected offer. */
  readonly paymentReservationExpiresAt: string | null;
  /** The teacher's own offer on this request, if they already sent one. */
  readonly myOfferId: string | null;
}

export interface Offer {
  readonly id: string;
  readonly teacherId: string;
  readonly teacherDisplayName: string | null;
  readonly teacherDisplayNameEnglish: string | null;
  readonly price: number;
  readonly currency: string;
  readonly deliveryHours: number;
  readonly includedRevisions: number;
  readonly validUntil: string | null;
  readonly message: string;
  readonly status: number;
  /** Concurrency token; sent as X-Offer-Version when the student selects it. */
  readonly version: string;
}

/** What a teacher offers (SubmitTeacherOffer). */
export interface OfferTerms {
  readonly amount: number;
  readonly deliveryHours: number;
  readonly includedRevisions: number;
  readonly validityHours: number;
  readonly message: string;
}

/** The teacher a direct request goes to: who they are, and what can be asked of them. */
export interface RequestTeacher {
  readonly fullName: string;
  readonly fullNameEnglish: string;
  readonly services: readonly RequestableService[];
}

export interface RequestGateway {
  requestTeacher(teacherId: string): Observable<RequestTeacher>;
  preferences(): Observable<LearningPreferences>;
  create(request: NewRequest): Observable<CreatedRequest>;
  attach(requestId: string, file: File, version: string): Observable<void>;
  /** AI-assisted first draft of the brief; entirely optional to the flow. */
  assist(notes: string): Observable<BriefSuggestion>;
  /**
   * Which AI actions the server says the client may offer (UX-08). The server decides: the client never
   * infers availability from its environment, and a failure means "do not offer it".
   */
  aiCapabilities(): Observable<AiCapabilities>;
}

/** `AiCapabilitiesDto`: one boolean per product capability, nothing about how it is provided. */
export interface AiCapabilities {
  readonly requestAssistant: boolean;
}

/** The open marketplace: requests published for any qualified teacher to bid on. */
export interface MarketplaceGateway {
  /** The student's own open-marketplace requests. */
  myRequests(): Observable<readonly OpenRequest[]>;
  opportunities(): Observable<readonly OpenRequest[]>;
  offers(requestId: string): Observable<readonly Offer[]>;
  submitOffer(requestId: string, terms: OfferTerms): Observable<void>;
  /**
   * Selects an offer. This does not create an order: it reserves the request for payment of
   * that offer. Both versions come from the server and guard against a stale selection.
   */
  selectOffer(
    request: Pick<OpenRequest, 'id' | 'version'>, offer: Pick<Offer, 'id' | 'version'>
  ): Observable<void>;
}

/** Draft persistence. Behind a port so it can move off localStorage later. */
export interface DraftStore {
  read(studentId: string, teacherId: string): RequestDraft | null;
  write(studentId: string, teacherId: string, draft: RequestDraft): void;
  clear(studentId: string, teacherId: string): void;
}

export const REQUEST_GATEWAY = new InjectionToken<RequestGateway>('RequestGateway');
export const MARKETPLACE_GATEWAY = new InjectionToken<MarketplaceGateway>('MarketplaceGateway');
export const DRAFT_STORE = new InjectionToken<DraftStore>('DraftStore');
