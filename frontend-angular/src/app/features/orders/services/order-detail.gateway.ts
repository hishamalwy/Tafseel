import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { OrderDetail, OrderTimelineEvent } from '../models/order-detail';

@Injectable({ providedIn: 'root' })
export class OrderDetailGateway {
  private readonly http = inject(HttpClient);

  order(orderId: string): Observable<OrderDetail> {
    return this.http.get<OrderDetail>(`/api/v1/orders/${encodeURIComponent(orderId)}`);
  }

  timeline(orderId: string): Observable<readonly OrderTimelineEvent[]> {
    return this.http.get<readonly OrderTimelineEvent[]>(`/api/v1/orders/${encodeURIComponent(orderId)}/timeline`);
  }
}
