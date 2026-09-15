import { HttpClient, HttpEvent, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { OrderDetail, OrderTimelineEvent, ReviewDraft } from '../models/order-detail';

/** Orders as their participants read and move them. Every write carries the version read (If-Match). */
@Injectable({ providedIn: 'root' })
export class OrderDetailGateway {
  private readonly http = inject(HttpClient);

  order(orderId: string): Observable<OrderDetail> {
    return this.http.get<OrderDetail>(`/api/v1/orders/${encodeURIComponent(orderId)}`);
  }

  timeline(orderId: string): Observable<readonly OrderTimelineEvent[]> {
    return this.http.get<readonly OrderTimelineEvent[]>(`/api/v1/orders/${encodeURIComponent(orderId)}/timeline`);
  }

  start(orderId: string, version: string): Observable<void> {
    return this.http.post<void>(`/api/v1/orders/${encodeURIComponent(orderId)}/start`, null, { headers: ifMatch(version) });
  }

  /** Multipart upload with progress events, so the page can show how far it got. */
  deliver(orderId: string, files: readonly File[], message: string, version: string): Observable<HttpEvent<unknown>> {
    const body = new FormData();
    for (const file of files) body.append('files', file, file.name);
    body.append('message', message);
    return this.http.post(`/api/v1/orders/${encodeURIComponent(orderId)}/deliveries`, body,
      { headers: ifMatch(version), reportProgress: true, observe: 'events' });
  }

  requestRevision(orderId: string, reason: string, version: string): Observable<void> {
    return this.http.post<void>(`/api/v1/orders/${encodeURIComponent(orderId)}/revision`, { reason }, { headers: ifMatch(version) });
  }

  complete(orderId: string, version: string): Observable<void> {
    return this.http.post<void>(`/api/v1/orders/${encodeURIComponent(orderId)}/complete`, null, { headers: ifMatch(version) });
  }

  cancel(orderId: string, version: string): Observable<void> {
    return this.http.post<void>(`/api/v1/orders/${encodeURIComponent(orderId)}/cancel`, null, { headers: ifMatch(version) });
  }

  review(orderId: string, draft: ReviewDraft): Observable<void> {
    return this.http.post<unknown>(`/api/v1/orders/${encodeURIComponent(orderId)}/review`, {
      explanationClarity: draft.explanationClarity, subjectKnowledge: draft.subjectKnowledge, communication: draft.communication,
      onTimeDelivery: draft.onTimeDelivery, valueForMoney: draft.valueForMoney, comment: draft.comment.trim(), recommends: draft.recommends
    }).pipe(map(() => undefined));
  }

  /** The order's conversation: an existing one is returned rather than a second created. */
  conversation(orderId: string, otherUserId: string): Observable<string> {
    return this.http.post<{ id: string }>('/api/v1/conversations', { otherUserId, scope: 2, resourceId: orderId })
      .pipe(map(conversation => conversation.id));
  }
}

function ifMatch(version: string): HttpHeaders {
  return new HttpHeaders({ 'If-Match': version });
}

