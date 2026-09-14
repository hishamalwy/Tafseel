import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleService } from '@core/i18n/locale.service';
import {
  AcceptPolicy, acceptDefaults, acceptPolicyFor, deliveryWindow, fromLocalInput, toAcceptBody, toLocalInput, validateAccept
} from '../models/accept-terms';
import { AcceptRequestGateway } from '../services/accept-request.gateway';
import { AcceptRequestDialogComponent } from './accept-request-dialog.component';

const POLICY: AcceptPolicy = {
  teacherServiceId: 'svc-1', currency: 'SAR', minPrice: 50, maxPrice: 500, minDeliveryHours: 24, maxDeliveryHours: 240,
  maxRevisions: 3, defaultPrice: 100, defaultDeliveryHours: 48, defaultRevisions: 1
};
const NOW = new Date(2030, 0, 10, 12, 0);
const hoursFromNow = (h: number) => toLocalInput(new Date(NOW.getTime() + h * 3_600_000));

describe('accept terms (J3-07)', () => {
  it('reads the offering and its catalog limits from the marketplace services', () => {
    expect(acceptPolicyFor([
      { currencyCode: 'SAR', offerings: [{ id: 'other' }] },
      { currencyCode: 'SAR', minimumPrice: 50, maximumPrice: 500, minimumDeliveryHours: 24, maximumDeliveryHours: 240,
        maximumRevisions: 3, offerings: [{ id: 'svc-1', price: 100, currency: 'SAR', deliveryHours: 48, revisions: 1 }] }
    ], 'svc-1')).toEqual(POLICY);
    expect(acceptPolicyFor([], 'svc-1')).toBeNull();
  });

  it('starts from the offering’s terms, or the student’s date when the catalog allows it', () => {
    expect(acceptDefaults(POLICY, null, NOW)).toEqual({ price: '100', deliveryLocal: toLocalInput(new Date(NOW.getTime() + 48 * 3_600_000 + 600_000)), revisions: '1' });
    const studentDate = new Date(NOW.getTime() + 72 * 3_600_000).toISOString();
    expect(acceptDefaults(POLICY, studentDate, NOW).deliveryLocal).toBe(hoursFromNow(72));
  });

  it('accepts terms inside every limit', () => {
    expect(validateAccept({ price: '120.50', deliveryLocal: hoursFromNow(72), revisions: '3' }, POLICY, NOW)).toEqual([]);
  });

  it.each([
    [{ price: '' }, 'price'], [{ price: '49.99' }, 'price'], [{ price: '501' }, 'price'], [{ price: '10.001' }, 'price'],
    [{ deliveryLocal: hoursFromNow(23) }, 'delivery'], [{ deliveryLocal: hoursFromNow(241) }, 'delivery'],
    [{ deliveryLocal: '' }, 'delivery'], [{ deliveryLocal: '2030-02-30T10:00' }, 'delivery'],
    [{ revisions: '4' }, 'revisions'], [{ revisions: '-1' }, 'revisions'], [{ revisions: '1.5' }, 'revisions']
  ])('rejects %o as %s', (change, error) => {
    const form = { price: '120', deliveryLocal: hoursFromNow(72), revisions: '1', ...change };
    expect(validateAccept(form, POLICY, NOW)).toContain(error);
  });

  it('keeps a margin so a delivery at the very edge is not refused when the server processes it', () => {
    const [earliest, latest] = deliveryWindow(POLICY, NOW);
    expect(earliest.getTime() - NOW.getTime()).toBe(24 * 3_600_000 + 600_000);
    expect(NOW.getTime() + 240 * 3_600_000 - latest.getTime()).toBe(600_000);
  });

  it('builds the body with the service currency and an ISO delivery instant', () => {
    const local = hoursFromNow(72);
    expect(toAcceptBody({ price: '120.5', deliveryLocal: local, revisions: '2' }, POLICY)).toEqual({
      finalPrice: 120.5, currency: 'SAR', agreedDeliveryAt: fromLocalInput(local)!.toISOString(), revisionAllowance: 2
    });
  });
});

describe('AcceptRequestGateway', () => {
  it('posts exactly the AcceptLearningRequest keys with If-Match and Idempotency-Key', async () => {
    TestBed.configureTestingModule({ providers: [AcceptRequestGateway, provideHttpClient(), provideHttpClientTesting()] });
    const gateway = TestBed.inject(AcceptRequestGateway);
    const backend = TestBed.inject(HttpTestingController);
    const body = { finalPrice: 120, currency: 'SAR', agreedDeliveryAt: '2030-01-13T09:00:00.000Z', revisionAllowance: 2 };

    const sent = firstValueFrom(gateway.accept('r1', 'AAAAAAAAB9E=', 'key-1', body));
    const request = backend.expectOne('/api/v1/learning-requests/r1/accept');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    expect(Object.keys(request.request.body).sort()).toEqual(['agreedDeliveryAt', 'currency', 'finalPrice', 'revisionAllowance']);
    expect(request.request.headers.get('If-Match')).toBe('AAAAAAAAB9E=');
    expect(request.request.headers.get('Idempotency-Key')).toBe('key-1');
    request.flush({ id: 'order-1', status: 0 });
    await sent;
  });
});

describe('AcceptRequestDialogComponent', () => {
  let accept: ReturnType<typeof vi.fn>;

  async function open(policy: AcceptPolicy | null = { ...POLICY, minDeliveryHours: 1, maxDeliveryHours: 8000 }) {
    TestBed.configureTestingModule({
      imports: [AcceptRequestDialogComponent],
      providers: [
        { provide: AcceptRequestGateway, useValue: { policy: () => of(policy), accept } },
        { provide: LocaleService, useValue: { t: (_: string, fallback: string) => fallback } }
      ]
    });
    const fixture = TestBed.createComponent(AcceptRequestDialogComponent);
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    dialog.showModal = vi.fn(() => dialog.setAttribute('open', ''));
    dialog.close = vi.fn(() => { dialog.removeAttribute('open'); dialog.dispatchEvent(new Event('close')); });
    const emitted: unknown[] = [];
    fixture.componentInstance.accepted.subscribe(() => emitted.push(true));
    await fixture.componentInstance.open({ id: 'r1', version: 'v1', title: 'Limits', teacherServiceId: 'svc-1', preferredDeliveryAt: null });
    fixture.detectChanges();
    return { fixture, dialog, emitted };
  }

  beforeEach(() => { accept = vi.fn(() => of({ id: 'order-1' })); });

  it('sends the default terms once with one idempotency key and reports acceptance', async () => {
    const { fixture, dialog, emitted } = await open();
    await fixture.componentInstance.submit();

    expect(accept).toHaveBeenCalledTimes(1);
    const [requestId, version, key, body] = accept.mock.calls[0]!;
    expect([requestId, version]).toEqual(['r1', 'v1']);
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).toMatchObject({ finalPrice: 100, currency: 'SAR', revisionAllowance: 1 });
    expect(dialog.close).toHaveBeenCalled();
    expect(emitted).toHaveLength(1);
  });

  it('does not send invalid terms and shows which field is wrong', async () => {
    const { fixture } = await open();
    fixture.componentInstance.patch({ price: '1' });
    await fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(accept).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('#accept-price').getAttribute('aria-invalid')).toBe('true');
  });

  it('closes on cancel without sending anything', async () => {
    const { fixture, dialog, emitted } = await open();
    fixture.componentInstance.cancel();
    expect(dialog.close).toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();
    expect(emitted).toHaveLength(0);
  });

  it('shows the server’s reason and stays open when the acceptance is refused', async () => {
    accept = vi.fn(() => throwError(() => new HttpErrorResponse({
      status: 400, error: { code: 'service_delivery_out_of_policy', detail: 'Accepted delivery must be between 24 and 240 hours from acceptance.' }
    })));
    const { fixture, dialog, emitted } = await open();
    await fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('between 24 and 240 hours');
    expect(dialog.close).not.toHaveBeenCalled();
    expect(emitted).toHaveLength(0);
  });
});
