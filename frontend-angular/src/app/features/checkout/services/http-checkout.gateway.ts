import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { LiveSessionLike, OrderLike, Payable } from '../models/payable';
import { BookableService, BookingDraft, Slot, toDateKey } from '../models/booking';
import {
  BookableTeacher, BookingGateway, CreatedBooking,
  MockCheckoutGateway, MockCheckoutSession, MockCompletion,
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
}

@Injectable()
export class HttpPaymentGateway implements PaymentGateway {
  private readonly http = inject(HttpClient);

  initiate(payable: Payable, idempotencyKey: string): Observable<PaymentInitiation> {
    return this.http
      .post<{ checkoutReference?: string; payment?: { providerReference?: string } }>(
        Payable.paymentPath(payable), {},
        { headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }) })
      .pipe(map(result => ({
        checkoutReference:
          result.checkoutReference || result.payment?.providerReference || ''
      })));
  }

  mockSimulatorEnabled(): Observable<boolean> {
    return this.http
      .get<{ mockSimulatorEnabled?: boolean }>('/api/v1/payments/mock/capabilities')
      .pipe(map(caps => !!caps?.mockSimulatorEnabled), catchError(() => of(false)));
  }

  /** A 404 here simply means there is nothing to resume. */
  mockCheckoutExists(reference: string): Observable<boolean> {
    return this.http
      .get(`/api/v1/payments/mock/simulator?ref=${encodeURIComponent(reference)}`)
      .pipe(map(() => true), catchError(() => of(false)));
  }
}

@Injectable()
export class HttpMockCheckoutGateway implements MockCheckoutGateway {
  private readonly http = inject(HttpClient);

  session(reference: string): Observable<MockCheckoutSession> {
    return this.http
      .get<{
        providerReference?: string; orderId?: string | null;
        amount?: number | null; currency?: string | null; status?: number | string;
      }>(`/api/v1/payments/mock/simulator?ref=${encodeURIComponent(reference)}`)
      .pipe(map(dto => ({
        providerReference: dto.providerReference || reference,
        orderId: dto.orderId ?? null,
        amount: dto.amount ?? null,
        currency: dto.currency || 'SAR',
        confirmed: isConfirmed(dto.status)
      })));
  }

  complete(reference: string, succeeded: boolean, returnPath: string): Observable<MockCompletion> {
    return this.http
      .post<{ status?: number | string; returnUrl?: string | null }>(
        '/api/v1/payments/mock/simulator/complete',
        { providerReference: reference, succeeded, returnPath })
      .pipe(map(result => ({
        confirmed: isConfirmed(result.status),
        returnUrl: result.returnUrl ?? null
      })));
  }
}

/** The API answers with either the enum ordinal or its name. */
function isConfirmed(status: number | string | undefined): boolean {
  return Number(status) === 1 || String(status).toLowerCase() === 'confirmed';
}

@Injectable()
export class HttpBookingGateway implements BookingGateway {
  private readonly http = inject(HttpClient);

  teacher(teacherId: string): Observable<BookableTeacher> {
    return this.http
      .get<{
        id?: string; userId?: string; hasAvatar?: boolean;
        fullName?: string; fullNameEnglish?: string; services?: BookableService[];
      }>(`/api/v1/teachers/${encodeURIComponent(teacherId)}`)
      .pipe(map(dto => ({
        id: dto.id ?? dto.userId ?? teacherId,
        hasAvatar: !!dto.hasAvatar,
        fullName: dto.fullName ?? '',
        fullNameEnglish: dto.fullNameEnglish ?? '',
        services: dto.services ?? []
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
