import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { RequestDraft, RequestableService } from '../models/learning-request';

export interface CreatedRequest {
  readonly id: string;
  readonly version: string;
}

export interface NewRequest {
  readonly teacherId: string;
  readonly teacherServiceId: string;
  readonly title: string;
  readonly description: string;
  readonly deliveryDate: string | null;
  readonly budget: number | null;
  readonly flexibleBudget: boolean;
}

export interface LearningPreferences {
  readonly explanationStyle: string | null;
  readonly preferredTeachingLanguageId: string | null;
}

/** An open request on the marketplace, as seen by a student or a teacher. */
export interface OpenRequest {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly subjectName: string;
  readonly subjectNameArabic: string;
  readonly status: number;
  readonly deadline: string | null;
  readonly budget: number | null;
  readonly currency: string;
  readonly offerCount: number;
  readonly createdAt: string;
}

export interface Offer {
  readonly id: string;
  readonly teacherId: string;
  readonly teacherDisplayName: string | null;
  readonly teacherDisplayNameEnglish: string | null;
  readonly price: number;
  readonly currency: string;
  readonly deliveryDays: number | null;
  readonly message: string;
  readonly status: number;
}

export interface RequestGateway {
  teacherServices(teacherId: string): Observable<readonly RequestableService[]>;
  preferences(): Observable<LearningPreferences>;
  create(request: NewRequest): Observable<CreatedRequest>;
  attach(requestId: string, file: File, version: string): Observable<void>;
  /** AI-assisted first draft of the brief; entirely optional to the flow. */
  assist(prompt: string): Observable<string>;
}

/** The open marketplace: requests published for any qualified teacher to bid on. */
export interface MarketplaceGateway {
  myRequests(): Observable<readonly OpenRequest[]>;
  opportunities(): Observable<readonly OpenRequest[]>;
  request(requestId: string): Observable<OpenRequest>;
  offers(requestId: string): Observable<readonly Offer[]>;
  submitOffer(
    requestId: string, price: number, deliveryDays: number, message: string
  ): Observable<void>;
  acceptOffer(offerId: string): Observable<{ readonly orderId: string }>;
  publish(requestId: string): Observable<void>;
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
