import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { LiveSessionLike, OfferLike, OpenRequestLike, OrderLike, Payable } from '../models/payable';

export interface TeacherSummary {
  readonly id: string;
  readonly hasAvatar: boolean;
  readonly fullName: string;
  readonly fullNameEnglish: string;
  readonly isQualifiedOnTafseel: boolean;
}

export interface PaymentInitiation {
  /** Either a URL to send the browser to, or a provider reference. */
  readonly checkoutReference: string;
}

/** Reading what is being paid for. */
export interface PayableGateway {
  myOrders(): Observable<readonly OrderLike[]>;
  myLiveSessions(): Observable<readonly LiveSessionLike[]>;
  teacher(teacherId: string): Observable<TeacherSummary | null>;
  /** How many files the originating request carried, for the context panel. */
  requestAttachmentCount(learningRequestId: string): Observable<number | null>;
  /** The student's open request, with its reservation. */
  openRequest(learningRequestId: string): Observable<OpenRequestLike>;
  offers(learningRequestId: string): Observable<readonly OfferLike[]>;
}

/** Starting and resuming a payment. */
export interface PaymentGateway {
  /** `Idempotency-Key` makes a repeat attempt join the existing payment. */
  initiate(payable: Payable, idempotencyKey: string): Observable<PaymentInitiation>;
  /** Whether this deployment offers the mock simulator instead of a real provider. */
  mockSimulatorEnabled(): Observable<boolean>;
  /** Whether a mock checkout already exists for this payable and can be resumed. */
  mockCheckoutExists(reference: string): Observable<boolean>;
}

export const PAYABLE_GATEWAY = new InjectionToken<PayableGateway>('PayableGateway');
export const PAYMENT_GATEWAY = new InjectionToken<PaymentGateway>('PaymentGateway');

/** One simulated checkout session, as the mock provider models it. */
export interface MockCheckoutSession {
  readonly providerReference: string;
  readonly orderId: string | null;
  readonly liveSessionBookingId: string | null;
  readonly learningRequestId: string | null;
  readonly amount: number | null;
  readonly currency: string;
  readonly confirmed: boolean;
}

export interface MockCompletion {
  readonly confirmed: boolean;
  readonly returnUrl: string | null;
}

/**
 * The payment simulator that stands in for a provider in non-production
 * environments. Separate from PaymentGateway because it exists only where the
 * simulator is enabled, and no production code path should depend on it.
 */
export interface MockCheckoutGateway {
  session(reference: string): Observable<MockCheckoutSession>;
  complete(reference: string, succeeded: boolean, returnPath: string): Observable<MockCompletion>;
}

export const MOCK_CHECKOUT_GATEWAY = new InjectionToken<MockCheckoutGateway>('MockCheckoutGateway');

/** The teacher profile a booking needs, plus the services it can book. */
export interface BookableTeacher {
  readonly id: string;
  readonly hasAvatar: boolean;
  readonly fullName: string;
  readonly fullNameEnglish: string;
  readonly services: readonly import('../models/booking').BookableService[];
}

export interface CreatedBooking {
  readonly id: string;
  readonly version: string;
}

/** Reading availability and creating a live-session booking. */
export interface BookingGateway {
  teacher(teacherId: string): Observable<BookableTeacher>;
  slots(
    teacherId: string, teacherServiceId: string,
    durationMinutes: number, timeZoneId: string, days: number
  ): Observable<readonly import('../models/booking').Slot[]>;
  create(draft: import('../models/booking').BookingDraft): Observable<CreatedBooking>;
  /** Optional: a booking stands whether or not the attachment lands. */
  attach(bookingId: string, file: File, version: string): Observable<void>;
}

export const BOOKING_GATEWAY = new InjectionToken<BookingGateway>('BookingGateway');
