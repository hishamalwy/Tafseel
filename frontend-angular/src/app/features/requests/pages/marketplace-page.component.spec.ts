import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { DialogService } from '@shared/services/dialog.service';
import { ToastService } from '@shared/services/toast.service';
import { PublicHeaderComponent } from '@shared/layouts/public-header.component';
import { SkipLinkComponent } from '@shared/layouts/skip-link.component';
import { Offer, OpenRequest } from '../services/request.ports';
import { ListMarketplaceRequests, SelectOffer, SubmitOffer } from '../services/request.use-cases';
import { MarketplacePageComponent } from './marketplace-page.component';

const OPEN: OpenRequest = {
  id: 'r1', title: 'Integrals', description: 'Need integrals', subjectName: 'Explanation', subjectNameArabic: 'شرح',
  status: 5, deadline: '2030-01-05T00:00:00Z', budget: 200, currency: 'SAR', offerCount: 1, createdAt: '2030-01-01T00:00:00Z',
  version: 'req-v1', selectedOfferId: null, paymentReservationExpiresAt: null, myOfferId: null
};
const RESERVED: OpenRequest = {
  ...OPEN, status: 6, version: 'req-v2', selectedOfferId: 'o1', paymentReservationExpiresAt: '2030-01-01T00:30:00Z'
};
const OFFER: Offer = {
  id: 'o1', teacherId: 't1', teacherDisplayName: 'معلم', teacherDisplayNameEnglish: 'Teacher', price: 180, currency: 'SAR',
  deliveryHours: 48, includedRevisions: 2, validUntil: null, message: 'I can help', status: 0, version: 'offer-v1'
};

describe('MarketplacePageComponent — choosing an offer (J4-07)', () => {
  let lists: OpenRequest[][];
  let select: ReturnType<typeof vi.fn>;
  let toasts: string[];

  async function render() {
    TestBed.configureTestingModule({
      imports: [MarketplacePageComponent],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: SignalSessionStore, useValue: { roles: signal(['Student']), isAuthenticated: signal(true), current: () => ({}) } },
        { provide: SESSION_STORE, useValue: { current: () => ({}) } },
        { provide: ListMarketplaceRequests, useValue: {
          mine: vi.fn(async () => lists.shift() ?? [RESERVED]),
          opportunities: vi.fn(async () => []),
          offers: vi.fn(async () => [OFFER])
        } },
        { provide: SelectOffer, useValue: { execute: select } },
        { provide: SubmitOffer, useValue: { execute: vi.fn() } },
        { provide: DialogService, useValue: { confirm: vi.fn(async () => true) } },
        { provide: ToastService, useValue: { show: (m: string) => toasts.push(m), message: signal(''), leaving: signal(false) } }
      ]
    });
    // The site header is not under test and brings the whole auth graph with it.
    TestBed.overrideComponent(MarketplacePageComponent, {
      remove: { imports: [PublicHeaderComponent, SkipLinkComponent] },
      add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] }
    });
    const fixture = TestBed.createComponent(MarketplacePageComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    toasts = [];
    select = vi.fn(async () => undefined);
  });

  it('selects with the versions it was given, then shows the reservation instead of going to an order', async () => {
    lists = [[OPEN], [RESERVED]];
    const fixture = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');

    await fixture.componentInstance.choose(OFFER);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(select).toHaveBeenCalledWith(OPEN, OFFER);
    expect(navigate).not.toHaveBeenCalled();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('[data-testid="offer-reservation"]')).not.toBeNull();
    expect(fixture.componentInstance.canSelect()).toBe(false);
    expect(page.querySelector('[data-testid="offer"] button')).toBeNull();
  });

  it('reloads and says so when the request or offer changed underneath (409)', async () => {
    lists = [[OPEN], [OPEN]];
    select = vi.fn(async () => { throw new HttpErrorResponse({ status: 409, error: { code: 'concurrency_conflict' } }); });
    const fixture = await render();
    const mine = TestBed.inject(ListMarketplaceRequests).mine as ReturnType<typeof vi.fn>;
    const loadsBefore = mine.mock.calls.length;

    await fixture.componentInstance.choose(OFFER);

    expect(toasts.at(-1)).toContain('changed');
    expect(mine.mock.calls.length).toBe(loadsBefore + 1);
  });
});
