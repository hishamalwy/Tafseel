import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { OrderDetail, OrderTimelineEvent } from '../models/order-detail';
import { OrderDetailGateway } from '../services/order-detail.gateway';
import { OrderDetailPageComponent } from './order-detail-page.component';

const ORDER: OrderDetail = {
  id: 'o1', studentId: 'student-1', teacherId: 'teacher-1', price: 100, currency: 'SAR', studentTotal: 110,
  agreedDeliveryAt: '2026-09-20T12:00:00Z', revisionAllowance: 2, revisionsUsed: 1, status: 2, paymentStatus: 1,
  createdAt: '2026-09-10T09:00:00Z', requestTitle: 'Calculus limits',
  deliveries: [{ id: 'f1', originalName: 'limits.pdf', contentType: 'application/pdf', size: 10, message: 'Worked answers', createdAt: '2026-09-12T09:00:00Z' }]
};
const TIMELINE: OrderTimelineEvent[] = [{ id: 'e1', eventType: 'delivery_uploaded', occurredAt: '2026-09-12T09:00:00Z', actorRole: 'teacher' }];

async function open(order: () => Observable<OrderDetail>, userId = 'student-1', timeline = () => of<readonly OrderTimelineEvent[]>(TIMELINE)) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(), provideHttpClientTesting(),
      provideRouter([{ path: 'orders/:orderId', component: OrderDetailPageComponent }, { path: '**', children: [] }]),
      { provide: OrderDetailGateway, useValue: { order, timeline } },
      { provide: SignalSessionStore, useValue: { current: signal({ userId }), roles: signal([]) } },
      { provide: SESSION_STORE, useValue: { current: () => ({ userId, email: 'reader@example.test' }) } }
    ]
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/orders/o1');
  await new Promise(resolve => setTimeout(resolve));
  harness.detectChanges();
  return harness.routeNativeElement as HTMLElement;
}

describe('OrderDetailPageComponent', () => {
  it('shows what the order is, where it stands, its files and its history', async () => {
    const page = await open(() => of(ORDER));
    expect(page.querySelector('h1')?.textContent).toContain('Calculus limits');
    expect(page.querySelector('[data-testid="order-status"]')?.textContent?.trim()).toBe('Delivered');
    expect(page.textContent).toContain('limits.pdf');
    expect(page.textContent).toContain('1 / 2');
    expect(page.querySelectorAll('.tf-order-detail__timeline li')).toHaveLength(1);
    expect(page.querySelector('.tf-order-detail__actions a')?.getAttribute('href')).toBe('/student/requests?tab=orders&orderId=o1');
  });

  it('sends the teacher back to their own work list', async () => {
    const page = await open(() => of(ORDER), 'teacher-1');
    expect(page.querySelector('.tf-order-detail__actions a')?.getAttribute('href')).toBe('/teacher/work?tab=orders&orderId=o1');
  });

  it('says the order is unavailable instead of rendering an empty page', async () => {
    const page = await open(() => throwError(() => new HttpErrorResponse({ status: 404 })));
    expect(page.querySelector('[role="alert"] h1')).not.toBeNull();
    expect(page.querySelector('.tf-order-detail__facts')).toBeNull();
  });

  it('offers a retry when the API fails, and still shows the order if only the timeline fails', async () => {
    const failed = await open(() => throwError(() => new HttpErrorResponse({ status: 500 })));
    expect(failed.querySelector('[role="alert"] button')).not.toBeNull();

    TestBed.resetTestingModule();
    const partial = await open(() => of(ORDER), 'student-1', () => throwError(() => new HttpErrorResponse({ status: 500 })));
    expect(partial.querySelector('h1')?.textContent).toContain('Calculus limits');
    expect(partial.querySelector('.tf-order-detail__section [role="alert"]')).not.toBeNull();
  });
});
