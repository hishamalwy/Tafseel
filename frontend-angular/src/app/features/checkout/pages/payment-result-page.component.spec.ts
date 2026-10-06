import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { LocaleService } from '@core/i18n/locale.service';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaymentResultPageComponent } from './payment-result-page.component';
import { PAYMENT_GATEWAY, PaymentState } from '../services/checkout.ports';

const ID = '6f1c2b8e-4a3d-4f5e-9b1a-2c3d4e5f6a7b';
const payment = { id: ID, orderId: ID, liveSessionBookingId: null, learningRequestId: null, amount: 108, currency: 'SAR' };
function setup(gateway: object, params = { paymentId: ID, success: 'true', hmac: 'forged' }) {
  TestBed.configureTestingModule({ imports: [PaymentResultPageComponent], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
    { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(params) } } },
    { provide: PAYMENT_GATEWAY, useValue: gateway }] });
  const locale = TestBed.inject(LocaleService);
  locale.seed('en', { pay_result_verifying_title: 'Verifying your payment', pay_result_confirmed_title: 'Payment confirmed', pay_result_failed_title: 'Payment did not go through' });
  locale.seed('ar', { pay_result_verifying_title: 'جارٍ التحقق من دفعتك', pay_result_confirmed_title: 'تم تأكيد الدفع', pay_result_failed_title: 'لم يكتمل الدفع' });
  return TestBed.createComponent(PaymentResultPageComponent);
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('Payment result from authoritative backend status', () => {
  afterEach(() => { vi.useRealTimers(); TestBed.resetTestingModule(); });
  it('ignores redirect success parameters and waits for a backend update', async () => {
    vi.useFakeTimers(); let state: PaymentState['state'] = 'Pending';
    const fixture = setup({ state: () => of({ payment, state }) }); await settle(); fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('verifying');
    state = 'Confirmed'; await vi.advanceTimersByTimeAsync(2500); fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('confirmed');
    expect(fixture.nativeElement.querySelector('[role=status]').getAttribute('aria-live')).toBe('polite');
  });
  it('renders failed and unknown states without changing payment', async () => {
    const fixture = setup({ state: () => of({ payment, state: 'Failed' }) }); await settle(); expect(fixture.componentInstance.state()).toBe('failed');
    fixture.destroy(); TestBed.resetTestingModule();
    const failed = setup({ state: () => throwError(() => new Error('offline')) }); await settle(); expect(failed.componentInstance.state()).toBe('unknown');
  });
  it('stops polling at still processing and permits an explicit status retry', async () => {
    vi.useFakeTimers(); let state: PaymentState['state'] = 'Pending';
    const fixture = setup({ state: () => of({ payment, state }) }); await settle(); await vi.advanceTimersByTimeAsync(30000);
    expect(fixture.componentInstance.state()).toBe('processing');
    state = 'Confirmed'; await fixture.componentInstance.retry(); expect(fixture.componentInstance.state()).toBe('confirmed');
  });
  it('starts from the backend again on Refresh or Back', async () => {
    const first = setup({ state: () => of({ payment, state: 'Confirmed' }) }); await settle(); expect(first.componentInstance.state()).toBe('confirmed');
    first.destroy(); TestBed.resetTestingModule();
    const refreshed = setup({ state: () => of({ payment, state: 'Pending' }) }); await settle(); expect(refreshed.componentInstance.state()).toBe('verifying');
  });
  it('does not query an invalid payment id and preserves a leading skip link', async () => {
    const request = vi.fn(); const fixture = setup({ state: request }, { paymentId: 'invalid', success: 'true', hmac: '' }); await settle(); fixture.detectChanges();
    expect(request).not.toHaveBeenCalled(); expect(fixture.componentInstance.state()).toBe('unknown');
    expect(fixture.nativeElement.firstElementChild.tagName.toLowerCase()).toBe('tf-skip-link');
  });
});
