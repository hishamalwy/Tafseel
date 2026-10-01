import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { LocaleService } from '@core/i18n/locale.service';
import { Dispute, EligiblePurchase } from '../models/dispute';
import { DISPUTE_ADMIN_GATEWAY, DISPUTE_GATEWAY } from '../services/dispute.ports';
import { DisputesPageComponent } from './disputes-page.component';

const CASE: Dispute = {
  id: 'd1', status: 'open', reason: 'The delivered file misses the exercises', createdAt: '2026-09-20T10:00:00Z',
  orderId: '3bdd12ab-0000-4000-8000-000000000001', liveSessionBookingId: null,
  studentId: 's1', teacherId: 't1', version: 'v1', actionDueAt: null,
  messages: [], evidence: [], history: [], decisions: []
};
const ELIGIBLE: EligiblePurchase = {
  type: 'order', id: 'o2', title: 'Recorded explanation', titleArabic: 'شرح مسجّل مخصص',
  amount: 853.2, currency: 'SAR', otherPartyName: 'معلمة التفاضل', otherPartyNameEnglish: 'Teacher A',
  eligibleUntil: '2026-09-30T10:00:00Z'
};

async function render(role: 'Student' | 'Admin') {
  const gateway = {
    list: () => of({ items: [CASE], page: 1, totalCount: 1 }),
    byId: () => of(CASE),
    eligiblePurchases: () => of([ELIGIBLE]),
    open: () => of(CASE), postMessage: () => of(undefined), postReviewerMessage: () => of(undefined), uploadEvidence: () => of(undefined),
    downloadEvidence: () => of(undefined)
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: DISPUTE_GATEWAY, useValue: gateway },
      { provide: DISPUTE_ADMIN_GATEWAY, useValue: { ...gateway, startReview: () => of(undefined), resolve: () => of(undefined) } },
      { provide: SignalSessionStore, useValue: { roles: signal([role]), value: signal({ userId: role === 'Admin' ? 'a1' : 's1' }) } },
      { provide: LocaleService, useValue: { lang: signal('ar'), isRtl: signal(true), t: (_: string, fallback = '') => (_ === 'currency_sar_short' ? '\u20C1' : fallback) } }
    ]
  });
  const fixture = TestBed.createComponent(DisputesPageComponent);
  fixture.detectChanges();
  // The page loads its cases and eligible purchases asynchronously; let both settle, then render.
  for (let i = 0; i < 5; i++) {
    await new Promise(resolve => setTimeout(resolve));
    fixture.detectChanges();
  }
  return fixture.nativeElement as HTMLElement;
}

/**
 * UX-06. A student's or teacher's dispute was named «طلب · 3bdd12ab» — the first eight characters of an order
 * id — and the purchase it was opened on was priced by Intl in Arabic-Indic digits.
 */
describe('DisputesPageComponent', () => {
  it('names a case without showing its student or teacher an id', async () => {
    const page = await render('Student');
    const labels = [...page.querySelectorAll('.tf-dispute-list strong, .tf-dispute-detail__target')]
      .map(el => el.textContent?.trim() ?? '');

    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(label).not.toMatch(/[0-9a-f]{6}/i);
  });

  it('links the case to the order it is about instead', async () => {
    const link = (await render('Student')).querySelector('[data-testid=dispute-purchase]');

    expect(link?.getAttribute('href')).toContain(`/orders/${CASE.orderId}`);
    expect(link?.textContent?.trim()).toBe('عرض الطلب');
  });

  it('prices a purchase the way every other price is written: Latin digits and the official mark', async () => {
    const option = [...(await render('Student')).querySelectorAll('#dispute-target option')]
      .map(o => o.textContent ?? '').find(text => text.includes('شرح'));

    expect(option).toContain('853.2');
    expect(option).toContain('\u20C1');
    expect(option).not.toMatch(/[٠-٩]/);
  });

  it('keeps the case reference for operations staff, who work cases by it', async () => {
    const page = await render('Admin');
    const target = page.querySelector('.tf-dispute-detail__target')?.textContent ?? '';

    expect(target).toContain('3bdd12ab');
    expect(page.querySelector('[data-testid=dispute-purchase]')).toBeNull();
  });
});
