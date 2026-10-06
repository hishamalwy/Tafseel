import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { LiveSessionLike, OfferLike, OpenRequestLike, OpenRequestPaymentQuote, OrderLike, Payable } from '../models/payable';

export interface TeacherSummary {
  readonly id: string;
  readonly hasAvatar: boolean;
  readonly fullName: string;
  readonly fullNameEnglish: string;
  readonly isQualifiedOnTafseel: boolean;
}

export interface PaymentInitiation {
  /** HTTPS Unified Checkout or Tafseel's authoritative result page. */
  readonly checkoutReference: string;
}
export interface PaymentState {
  readonly state: 'Pending' | 'Confirmed' | 'Failed' | 'Refunded';
  readonly payment: { id: string; amount: number; currency: string; orderId: string | null;
    liveSessionBookingId: string | null; learningRequestId: string | null };
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
  openRequestQuote(learningRequestId: string): Observable<OpenRequestPaymentQuote>;
}

/** Starting and resuming a payment. */
export interface PaymentGateway {
  /** `Idempotency-Key` makes a repeat attempt join the existing payment. */
  initiate(payable: Payable, idempotencyKey: string, couponCode: string | null): Observable<PaymentInitiation>;
  quoteCoupon(payable: Payable, code: string): Observable<CouponCheckoutQuote>;
  state(paymentId: string): Observable<PaymentState>;
}

export interface CouponCheckoutQuote {
  readonly code: string;
  readonly baseAmount: number;
  readonly discountAmount: number;
  readonly chargeAmount: number;
  readonly currency: string;
}

export const PAYABLE_GATEWAY = new InjectionToken<PayableGateway>('PayableGateway');
export const PAYMENT_GATEWAY = new InjectionToken<PaymentGateway>('PaymentGateway');

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
