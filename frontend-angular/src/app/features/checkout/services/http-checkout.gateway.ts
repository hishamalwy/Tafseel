import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { LiveSessionLike, OfferLike, OpenRequestLike, OpenRequestPaymentQuote, OrderLike, Payable } from '../models/payable';
import { BookableService, BookingDraft, Slot, toDateKey } from '../models/booking';
import {
  BookableTeacher, BookingGateway, CreatedBooking,
  PaymentState, CouponCheckoutQuote,
  PayableGateway, PaymentGateway, PaymentInitiation, TeacherSummary
} from '../services/checkout.ports';

interface PageDto<T> { items?: T[] }

interface TeacherDto {
  id?: string; userId?: string; hasAvatar?: boolean;
  fullName?: string; fullNameEnglish?: string;
  trustBadges?: { code?: string }[];
}

interface LearningRequestDto {
  id: string;
  attachments?: unknown[];
}

@Injectable()
export class HttpPayableGateway implements PayableGateway {
  private readonly http = inject(HttpClient);

  /**
   * The API has no by-id endpoint for a student's own order, so the page reads a
   * page of their orders and matches locally — carried over from the legacy
   * client, including the 100-item page size.
   */
  myOrders(): Observable<readonly OrderLike[]> {
    return this.http
      .get<PageDto<OrderLike>>('/api/v1/orders/mine?pageSize=100')
      .pipe(map(page => page.items ?? []));
  }

  myLiveSessions(): Observable<readonly LiveSessionLike[]> {
    return this.http
      .get<PageDto<LiveSessionLike>>('/api/v1/live-sessions/mine?pageSize=100')
      .pipe(map(page => page.items ?? []));
  }

  teacher(teacherId: string): Observable<TeacherSummary | null> {
    return this.http
      .get<TeacherDto>(`/api/v1/teachers/${encodeURIComponent(teacherId)}`)
      .pipe(
        map(dto => ({
          id: dto.id ?? dto.userId ?? teacherId,
          hasAvatar: !!dto.hasAvatar,
          fullName: dto.fullName ?? '',
          fullNameEnglish: dto.fullNameEnglish ?? '',
          isQualifiedOnTafseel:
            (dto.trustBadges ?? []).some(b => b?.code === 'qualified_on_tafseel')
        })),
        catchError(() => of(null))
      );
  }

  requestAttachmentCount(learningRequestId: string): Observable<number | null> {
    return this.http
      .get<PageDto<LearningRequestDto>>('/api/v1/learning-requests/mine?pageSize=100')
      .pipe(
        map(page => {
          const match = (page.items ?? []).find(
            r => String(r.id).toLowerCase() === learningRequestId.toLowerCase());
          return Array.isArray(match?.attachments) ? match.attachments.length : null;
        }),
        catchError(() => of(null))
      );
  }

  openRequest(learningRequestId: string): Observable<OpenRequestLike> {
    return this.http.get<OpenRequestLike>(`/api/v1/open-marketplace/requests/${encodeURIComponent(learningRequestId)}`);
  }

  offers(learningRequestId: string): Observable<readonly OfferLike[]> {
    return this.http.get<OfferLike[]>(`/api/v1/open-marketplace/requests/${encodeURIComponent(learningRequestId)}/offers`);
  }

  openRequestQuote(learningRequestId: string): Observable<OpenRequestPaymentQuote> {
    return this.http.get<OpenRequestPaymentQuote>(
      `/api/v1/payments/open-requests/${encodeURIComponent(learningRequestId)}/quote`);
  }
}

@Injectable()
export class HttpPaymentGateway implements PaymentGateway {
  private readonly http = inject(HttpClient);

  initiate(payable: Payable, idempotencyKey: string, couponCode: string | null): Observable<PaymentInitiation> {
    return this.http
      .post<{ checkoutReference?: string; payment?: { providerReference?: string } }>(
        Payable.paymentPath(payable), couponCode ? { couponCode } : {},
        { headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }) })
      .pipe(map(result => ({
        checkoutReference:
          result.checkoutReference || result.payment?.providerReference || ''
      })));
  }

  quoteCoupon(payable: Payable, code: string): Observable<CouponCheckoutQuote> {
    return this.http.post<CouponCheckoutQuote>(
      `${Payable.paymentPath(payable)}/coupon-quote`, { couponCode: code });
  }

  state(paymentId: string): Observable<PaymentState> {
    return this.http.get<PaymentState>(`/api/v1/payments/${encodeURIComponent(paymentId)}/status`);
  }
}

/** A service as the public teacher profile returns it; a live offering's `price` is per hour. */
function toBookableService(x: Record<string, unknown>): BookableService {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    id: String(x['id'] ?? ''),
    currency: String(x['currency'] ?? 'SAR'),
    allowedDurations: Array.isArray(x['allowedDurations']) ? (x['allowedDurations'] as unknown[]).map(Number) : [],
    canBook: x['canBook'] === true,
    serviceCatalogCode: String(x['serviceCatalogCode'] ?? ''),
    basePrice: n(x['basePrice']) ?? n(x['price']),
    emergencyPremiumAmount: n(x['emergencyPremiumAmount'])
  };
}

@Injectable()
export class HttpBookingGateway implements BookingGateway {
  private readonly http = inject(HttpClient);

  teacher(teacherId: string): Observable<BookableTeacher> {
    return this.http
      .get<{
        id?: string; userId?: string; hasAvatar?: boolean;
        fullName?: string; fullNameEnglish?: string; services?: Record<string, unknown>[];
      }>(`/api/v1/teachers/${encodeURIComponent(teacherId)}`)
      .pipe(map(dto => ({
        id: dto.id ?? dto.userId ?? teacherId,
        hasAvatar: !!dto.hasAvatar,
        fullName: dto.fullName ?? '',
        fullNameEnglish: dto.fullNameEnglish ?? '',
        services: (dto.services ?? []).map(toBookableService)
      })));
  }

  slots(
    teacherId: string, teacherServiceId: string,
    durationMinutes: number, timeZoneId: string, days: number
  ): Observable<readonly Slot[]> {
    const from = toDateKey(new Date());
    const query = new URLSearchParams({
      teacherServiceId, from, days: String(days),
      durationMinutes: String(durationMinutes), studentTimeZoneId: timeZoneId
    });
    return this.http
      .get<Slot[]>(
        `/api/v1/live-sessions/teachers/${encodeURIComponent(teacherId)}/slots?${query}`)
      .pipe(map(slots => Array.isArray(slots) ? slots : []));
  }

  create(draft: BookingDraft): Observable<CreatedBooking> {
    return this.http
      .post<{ id: string; version?: string }>('/api/v1/live-sessions', draft)
      .pipe(map(b => ({ id: b.id, version: b.version ?? '' })));
  }

  attach(bookingId: string, file: File, version: string): Observable<void> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<void>(
      `/api/v1/live-sessions/${encodeURIComponent(bookingId)}/attachments`, form,
      { headers: new HttpHeaders({ 'If-Match': version }) });
  }
}
