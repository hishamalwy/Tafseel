import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/**
 * The Admin decisions taken from a list row. Money-moving calls carry an Idempotency-Key that the caller
 * keeps for the whole attempt, so a retried click cannot refund or pay out twice.
 */
@Injectable({ providedIn: 'root' })
export class AdminActionsGateway {
  private readonly http = inject(HttpClient);

  setRole(userId: string, role: string, assigned: boolean): Promise<unknown> {
    return firstValueFrom(this.http.put(`/api/v1/admin/users/${encodeURIComponent(userId)}/roles`, { role, assigned }));
  }

  refund(paymentId: string, reason: string, key: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`/api/v1/payments/${encodeURIComponent(paymentId)}/refund`, { reason },
      { headers: new HttpHeaders({ 'Idempotency-Key': key }) }));
  }

  /** outcome: complete | student-no-show | teacher-no-show | dispute */
  resolveSession(sessionId: string, outcome: 'complete' | 'student-no-show' | 'teacher-no-show' | 'dispute',
    reason: string, version: string, key: string): Promise<unknown> {
    const id = encodeURIComponent(sessionId);
    const options = { headers: new HttpHeaders({ 'If-Match': version, 'Idempotency-Key': key }) };
    switch (outcome) {
      case 'complete':
        return firstValueFrom(this.http.post(`/api/v1/admin/operations/sessions/${id}/complete`, { reason }, options));
      case 'student-no-show':
        return firstValueFrom(this.http.post(`/api/v1/admin/operations/sessions/${id}/student-no-show`, { reason }, options));
      case 'teacher-no-show':
        return firstValueFrom(this.http.post(`/api/v1/admin/operations/sessions/${id}/teacher-no-show`, { reason }, options));
      case 'dispute':
        return firstValueFrom(this.http.post(`/api/v1/admin/operations/sessions/${id}/dispute`, { reason }, options));
    }
  }

  moderateReview(reviewId: string, visible: boolean, reason: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`/api/v1/admin/reviews/${encodeURIComponent(reviewId)}/moderate`, { visible, reason }));
  }

  processWithdrawal(id: string, approve: boolean, detail: string, version: string, key: string): Promise<unknown> {
    const body = approve ? { approve, providerReference: detail } : { approve, providerReference: null, rejectionReason: detail };
    return firstValueFrom(this.http.post(`/api/v1/withdrawals/${encodeURIComponent(id)}/process`, body,
      { headers: new HttpHeaders({ 'If-Match': version, 'Idempotency-Key': key }) }));
  }

  reviewPayoutProfile(teacherId: string, approve: boolean, reason: string | null, version: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`/api/v1/admin/payout-profiles/${encodeURIComponent(teacherId)}/review`,
      { approve, rejectionReason: reason }, { headers: new HttpHeaders({ 'If-Match': version }) }));
  }
}
