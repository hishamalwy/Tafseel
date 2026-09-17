import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { OrderDetail, OrderTimelineEvent } from '../models/order-detail';
import { OrderDetailGateway } from '../services/order-detail.gateway';
import { OrderDetailPageComponent } from './order-detail-page.component';

const DELIVERED: OrderDetail = {
  id: 'o1', studentId: 'student-1', teacherId: 'teacher-1', price: 100, currency: 'SAR', studentTotal: 110,
  agreedDeliveryAt: '2026-09-20T12:00:00Z', revisionAllowance: 2, revisionsUsed: 1, status: 2, paymentStatus: 1,
  createdAt: '2026-09-10T09:00:00Z', requestTitle: 'Calculus limits', version: 'v1',
  deliveries: [{ id: 'f1', originalName: 'limits.pdf', contentType: 'application/pdf', size: 10, message: 'Worked answers', createdAt: '2026-09-12T09:00:00Z' }]
};
const TIMELINE: OrderTimelineEvent[] = [{ id: 'e1', eventType: 'delivery_uploaded', occurredAt: '2026-09-12T09:00:00Z', actorRole: 'teacher' }];

interface Options {
  readonly userId?: string;
  readonly timeline?: () => Observable<readonly OrderTimelineEvent[]>;
  readonly gateway?: Partial<Record<keyof OrderDetailGateway, unknown>>;
}

async function open(order: () => Observable<OrderDetail>, options: Options = {}) {
  const userId = options.userId ?? 'student-1';
  const gateway = { order, timeline: options.timeline ?? (() => of<readonly OrderTimelineEvent[]>(TIMELINE)), ...options.gateway };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(), provideHttpClientTesting(),
      provideRouter([{ path: 'orders/:orderId', component: OrderDetailPageComponent }, { path: '**', children: [] }]),
      { provide: OrderDetailGateway, useValue: gateway },
      { provide: SignalSessionStore, useValue: { current: signal({ userId }), roles: signal([]) } },
      { provide: SESSION_STORE, useValue: { current: () => ({ userId, email: 'reader@example.test', roles: [] }) } }
    ]
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/orders/o1');
  await new Promise(resolve => setTimeout(resolve));
  harness.detectChanges();
  return { page: harness.routeNativeElement as HTMLElement, harness, gateway };
}

const testId = (page: HTMLElement, id: string) => page.querySelector(`[data-testid="${id}"]`);

describe('OrderDetailPageComponent', () => {
  it('shows what the order is, where it stands, its files and its history', async () => {
    const { page } = await open(() => of(DELIVERED));
    expect(page.querySelector('h1')?.textContent).toContain('Calculus limits');
    // UX-04: the student reads the delivered order as something to review.
    expect(testId(page, 'order-status')?.textContent?.trim()).toBe('Delivered — review it');
    expect(page.textContent).toContain('limits.pdf');
    expect(testId(page, 'revisions-used')?.textContent?.trim()).toBe('1 / 2');
    expect(page.querySelectorAll('[data-testid="order-timeline"] li')).toHaveLength(1);
  });

  it('offers the student the decisions a delivered order allows, and nothing that belongs to the teacher', async () => {
    const { page } = await open(() => of(DELIVERED));
    expect(testId(page, 'complete-order')).not.toBeNull();
    expect(testId(page, 'open-revision')).not.toBeNull();
    expect(testId(page, 'start-order')).toBeNull();
    expect(testId(page, 'open-deliver')).toBeNull();
    expect(testId(page, 'pay-order')).toBeNull();
  });

  it('shows the teacher of the same delivered order only that it awaits the student', async () => {
    const { page } = await open(() => of(DELIVERED), { userId: 'teacher-1' });
    expect(testId(page, 'complete-order')).toBeNull();
    expect(testId(page, 'open-revision')).toBeNull();
    expect(testId(page, 'open-deliver')).toBeNull();
    expect(page.querySelector('.tf-back-link')?.getAttribute('href')).toBe('/teacher/work?tab=orders');
  });

  it('does not offer another revision once the allowance is used', async () => {
    const { page } = await open(() => of({ ...DELIVERED, revisionsUsed: 2 }));
    expect(testId(page, 'open-revision')).toBeNull();
    expect(testId(page, 'complete-order')).not.toBeNull();
  });

  it('sends an unpaid order to checkout, and after payment waits for the teacher instead of claiming work started', async () => {
    const unpaid = await open(() => of({ ...DELIVERED, status: 0, paymentStatus: 0, deliveries: [] }));
    expect(testId(unpaid.page, 'pay-order')?.getAttribute('href')).toBe('/checkout?orderId=o1');

    TestBed.resetTestingModule();
    const paid = await open(() => of({ ...DELIVERED, status: 0, paymentStatus: 1, deliveries: [] }));
    expect(testId(paid.page, 'pay-order')).toBeNull();
    expect(testId(paid.page, 'order-status')?.textContent?.trim()).toBe('Paid — waiting for the teacher to start');

    TestBed.resetTestingModule();
    const teacher = await open(() => of({ ...DELIVERED, status: 0, paymentStatus: 1, deliveries: [] }), { userId: 'teacher-1' });
    expect(testId(teacher.page, 'start-order')).not.toBeNull();
  });

  it('tells the teacher a completed order’s earnings are pending clearance, not withdrawable', async () => {
    const { page } = await open(() => of({ ...DELIVERED, status: 4 }), { userId: 'teacher-1' });
    const note = testId(page, 'order-completed-note')?.textContent ?? '';
    expect(note).toContain('pending clearance');
    expect(testId(page, 'open-review')).toBeNull();
  });

  it('offers a review only while the server says one can be submitted', async () => {
    const eligible = await open(() => of({ ...DELIVERED, status: 4, reviewCanSubmit: true, hasReview: false }));
    expect(testId(eligible.page, 'open-review')).not.toBeNull();

    TestBed.resetTestingModule();
    const reviewed = await open(() => of({ ...DELIVERED, status: 4, reviewCanSubmit: false, hasReview: true, reviewOverallScore: 4.6 }));
    expect(testId(reviewed.page, 'open-review')).toBeNull();
    expect(testId(reviewed.page, 'review-submitted')).not.toBeNull();
  });

  it('asks for a reason before requesting a revision, then sends it with the order version', async () => {
    const requestRevision = vi.fn(() => of(undefined));
    const { page, harness } = await open(() => of(DELIVERED), { gateway: { requestRevision } });
    (testId(page, 'open-revision') as HTMLButtonElement).click();
    harness.detectChanges();
    (testId(page, 'submit-revision') as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve));
    harness.detectChanges();
    expect(requestRevision).not.toHaveBeenCalled();
    expect(testId(page, 'order-error')).not.toBeNull();

    const reason = page.querySelector('#revision-reason') as HTMLTextAreaElement;
    reason.value = 'Add a worked example for question 3.';
    reason.dispatchEvent(new Event('input'));
    harness.detectChanges();
    (testId(page, 'submit-revision') as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve));
    expect(requestRevision).toHaveBeenCalledWith('o1', 'Add a worked example for question 3.', 'v1');
  });

  it('does not publish a review until every criterion is rated and a comment is written', async () => {
    const review = vi.fn(() => of(undefined));
    const { page, harness } = await open(() => of({ ...DELIVERED, status: 4, reviewCanSubmit: true }), { gateway: { review } });
    (testId(page, 'open-review') as HTMLButtonElement).click();
    harness.detectChanges();
    (testId(page, 'submit-review') as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve));
    harness.detectChanges();
    expect(review).not.toHaveBeenCalled();
    expect(page.querySelector('[data-testid="review-form"] [role="alert"]')).not.toBeNull();
  });

  it('says the order is unavailable instead of rendering an empty page', async () => {
    const { page } = await open(() => throwError(() => new HttpErrorResponse({ status: 404 })));
    expect(page.querySelector('[role="alert"] .tf-state-title')).not.toBeNull();
    expect(testId(page, 'order-actions')).toBeNull();
  });

  it('tells the student the price they were quoted beside the one they owe', async () => {
    // UX-09: the offering said 100 when the request was sent; the teacher accepted at 150.
    const changed: OrderDetail = {
      ...DELIVERED, price: 150, studentFeePercent: 8, studentFeeAmount: 12, studentTotal: 162,
      listedPriceAtRequest: 100, listedCurrencyAtRequest: 'SAR'
    };
    const { page } = await open(() => of(changed));

    const panel = testId(page, 'order-price');
    expect(panel?.textContent).toContain('100');
    expect(panel?.textContent).toContain('150');
    expect(panel?.textContent).toContain('162');
    expect(panel?.querySelector('[data-testid="price-row-listed"]')).not.toBeNull();
    // The fee and the total belong to the agreed price, never to the one that was quoted.
    expect(panel?.querySelector('[data-testid="price-row-fee"]')?.textContent).toContain('12');
  });

  it('makes no comparison for an order whose request carries no captured price', async () => {
    const { page } = await open(() => of(DELIVERED));

    expect(testId(page, 'order-price')?.querySelector('[data-testid="price-row-listed"]')).toBeNull();
    expect(testId(page, 'order-price')?.querySelector('[data-testid="price-row-price"]')?.textContent).toContain('100');
  });

  it('keeps the price disclosure to the student whose money it is', async () => {
    const { page } = await open(() => of(DELIVERED), { userId: 'teacher-1' });

    expect(testId(page, 'order-price')).toBeNull();
    expect(page.textContent).not.toContain('Total to pay');
  });

  it('offers a retry when the API fails, and still shows the order if only the timeline fails', async () => {
    const failed = await open(() => throwError(() => new HttpErrorResponse({ status: 500 })));
    expect(failed.page.querySelector('[role="alert"] button')).not.toBeNull();

    TestBed.resetTestingModule();
    const partial = await open(() => of(DELIVERED), { timeline: () => throwError(() => new HttpErrorResponse({ status: 500 })) });
    expect(partial.page.querySelector('h1')?.textContent).toContain('Calculus limits');
    expect(testId(partial.page, 'order-timeline')).toBeNull();
    expect(partial.page.textContent).toContain('The history could not be loaded.');
  });
});
