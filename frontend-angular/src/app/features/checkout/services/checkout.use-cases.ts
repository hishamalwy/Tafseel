import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthFailure } from '@core/auth/models/auth-failure';
import { GUID, Payable, PayableKind, mockReference } from '../models/payable';
import { PAYABLE_GATEWAY, PAYMENT_GATEWAY, PaymentInitiation, TeacherSummary } from './checkout.ports';

export interface CheckoutContext {
  readonly payable: Payable;
  readonly teacher: TeacherSummary | null;
  readonly attachmentCount: number | null;
  readonly mockEnabled: boolean;
  /** A mock checkout already exists and can be resumed instead of re-initiated. */
  readonly canResumeMock: boolean;
}

/**
 * Assemble everything the checkout screen needs for one payable.
 *
 * The enrichment calls — teacher profile, attachment count, mock capability —
 * are all optional context. A failure in any of them must not stop a student
 * paying, so each is caught and degrades to null/false rather than rejecting.
 */
@Injectable({ providedIn: 'root' })
export class LoadCheckoutContext {
  private readonly payables = inject(PAYABLE_GATEWAY);
  private readonly payments = inject(PAYMENT_GATEWAY);

  async execute(kind: PayableKind, id: string, isArabic: boolean): Promise<CheckoutContext | null> {
    if (!GUID.test(id)) return null;

    const payable = kind === 'order' ? await this.findOrder(id, isArabic)
      : kind === 'open-request' ? await this.findReservedRequest(id)
      : await this.findLiveSession(id);
    if (!payable) return null;

    const [teacher, attachmentCount, mockEnabled] = await Promise.all([
      this.optional(() => payable.teacherId
        ? firstValueFrom(this.payables.teacher(payable.teacherId))
        : Promise.resolve(null), null),
      this.optional(() => payable.learningRequestId
        ? firstValueFrom(this.payables.requestAttachmentCount(payable.learningRequestId))
        : Promise.resolve(null), null),
      this.optional(() => firstValueFrom(this.payments.mockSimulatorEnabled()), false)
    ]);

    const canResumeMock = mockEnabled
      ? await this.optional(
          () => firstValueFrom(this.payments.mockCheckoutExists(mockReference(payable.id))), false)
      : false;

    return { payable, teacher, attachmentCount, mockEnabled, canResumeMock };
  }

  private async findOrder(id: string, isArabic: boolean): Promise<Payable | null> {
    const orders = await firstValueFrom(this.payables.myOrders());
    const match = orders.find(o => String(o.id).toLowerCase() === id.toLowerCase());
    return match ? Payable.fromOrder(match, isArabic) : null;
  }

  /**
   * Only a request still held for its selected offer is payable. The countdown on the page is a
   * convenience; the server decides whether the reservation still stands when payment starts.
   */
  private async findReservedRequest(id: string): Promise<Payable | null> {
    const [request, offers] = await Promise.all([
      firstValueFrom(this.payables.openRequest(id)), firstValueFrom(this.payables.offers(id))
    ]);
    const expires = Date.parse(request.paymentReservationExpiresAt ?? '');
    if (request.status !== 6 || !request.selectedOfferId || Number.isNaN(expires) || expires <= Date.now()) return null;
    const offer = offers.find(o => o.id === request.selectedOfferId);
    return offer ? Payable.fromOpenRequest(request, offer) : null;
  }

  private async findLiveSession(id: string): Promise<Payable | null> {
    const bookings = await firstValueFrom(this.payables.myLiveSessions());
    const match = bookings.find(b => String(b.id).toLowerCase() === id.toLowerCase());
    return match ? Payable.fromLiveSession(match) : null;
  }

  private async optional<T>(run: () => Promise<T>, fallback: T): Promise<T> {
    try { return await run(); } catch { return fallback; }
  }
}

export type PaymentOutcome =
  | { readonly kind: 'redirect'; readonly url: string }
  | { readonly kind: 'mock'; readonly reference: string }
  | { readonly kind: 'initiated'; readonly reference: string }
  | { readonly kind: 'resume-mock'; readonly reference: string };

/**
 * Start a payment and say what should happen next.
 *
 * The interesting case is `payment_already_initiated`: the same payable already
 * has a pending initiation, usually from a previous attempt with the same key.
 * That is not an error to show the student — under the mock provider the
 * reference is deterministic, so the right move is to resume that checkout
 * rather than invent a second payment.
 */
@Injectable({ providedIn: 'root' })
export class InitiatePayment {
  private readonly payments = inject(PAYMENT_GATEWAY);

  async execute(payable: Payable, mockEnabled: boolean): Promise<PaymentOutcome> {
    try {
      const result: PaymentInitiation = await firstValueFrom(
        this.payments.initiate(payable, Payable.idempotencyKey(payable)));

      const reference = (result.checkoutReference ?? '').trim();
      if (/^(\/|https?:)/i.test(reference)) return { kind: 'redirect', url: reference };
      if (mockEnabled && reference.startsWith('mock_')) return { kind: 'mock', reference };
      return { kind: 'initiated', reference };
    } catch (error) {
      const failure = error as AuthFailure & { reason?: string };
      const alreadyInitiated =
        (error as { code?: string })?.code === 'payment_already_initiated'
        || (error as { error?: { code?: string } })?.error?.code === 'payment_already_initiated'
        || failure?.message?.includes('payment_already_initiated');

      if (alreadyInitiated && mockEnabled) {
        return { kind: 'resume-mock', reference: mockReference(payable.id) };
      }
      throw error;
    }
  }
}
