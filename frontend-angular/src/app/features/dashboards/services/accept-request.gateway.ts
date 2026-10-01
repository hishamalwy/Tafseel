import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { AcceptBody, AcceptPolicy, acceptPolicyFor } from '../models/accept-terms';

/** A teacher accepting a direct learning request (J3-07). */
@Injectable({ providedIn: 'root' })
export class AcceptRequestGateway {
  private readonly http = inject(HttpClient);

  /** The offering the request names, with the catalog limits the acceptance must respect. */
  policy(teacherServiceId: string): Observable<AcceptPolicy | null> {
    return this.http
      .get<Parameters<typeof acceptPolicyFor>[0]>('/api/v1/teachers/me/marketplace-services')
      .pipe(map(services => acceptPolicyFor(services, teacherServiceId)));
  }

  /**
   * POST /learning-requests/{id}/accept. If-Match is the request's version; the idempotency
   * key is chosen once per dialog, so a retried click cannot create a second order.
   */
  accept(requestId: string, version: string, idempotencyKey: string, body: AcceptBody): Observable<unknown> {
    return this.http.post(
      `/api/v1/learning-requests/${encodeURIComponent(requestId)}/accept`,
      {
        finalPrice: body.finalPrice,
        currency: body.currency,
        agreedDeliveryAt: body.agreedDeliveryAt,
        revisionAllowance: body.revisionAllowance,
        // DEC-UX-03: only when the price differs from the listed one; the server refuses a change without it.
        ...(body.priceChangeReason ? { priceChangeReason: body.priceChangeReason } : {})
      },
      { headers: new HttpHeaders({ 'If-Match': version, 'Idempotency-Key': idempotencyKey }) });
  }
}
