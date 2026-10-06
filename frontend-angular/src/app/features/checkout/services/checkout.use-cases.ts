import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { GUID, Payable, PayableKind } from '../models/payable';
import { PAYABLE_GATEWAY, PAYMENT_GATEWAY, PaymentInitiation, TeacherSummary } from './checkout.ports';

export interface CheckoutContext {
  readonly payable: Payable;
  readonly teacher: TeacherSummary | null;
  readonly attachmentCount: number | null;
}

/**
 * Assemble everything the checkout screen needs for one payable.
 *
 * The enrichment calls — teacher profile and attachment count —
 * are all optional context. A failure in any of them must not stop a student
 * paying, so each is caught and degrades to null rather than rejecting.
 */
@Injectable({ providedIn: 'root' })
export class LoadCheckoutContext {
  private readonly payables = inject(PAYABLE_GATEWAY);

  async execute(kind: PayableKind, id: string, isArabic: boolean): Promise<CheckoutContext | null> {
    if (!GUID.test(id)) return null;

    const payable = kind === 'order' ? await this.findOrder(id, isArabic)
      : kind === 'open-request' ? await this.findReservedRequest(id)
      : await this.findLiveSession(id);
    if (!payable) return null;

    const [teacher, attachmentCount] = await Promise.all([
      this.optional(() => payable.teacherId
        ? firstValueFrom(this.payables.teacher(payable.teacherId))
        : Promise.resolve(null), null),
      this.optional(() => payable.learningRequestId
        ? firstValueFrom(this.payables.requestAttachmentCount(payable.learningRequestId))
        : Promise.resolve(null), null)
    ]);

    return { payable, teacher, attachmentCount };
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
    if (!offer) return null;
    const quote = await firstValueFrom(this.payables.openRequestQuote(id));
    return Payable.fromOpenRequest(request, offer, quote);
  }

  private async findLiveSession(id: string): Promise<Payable | null> {
    const bookings = await firstValueFrom(this.payables.myLiveSessions());
    const match = bookings.find(b => String(b.id).toLowerCase() === id.toLowerCase());
    // An unanswered request is not a checkout. The teacher must accept first.
    return match && match.status !== 9 && match.status !== 10 && match.status !== 3
      ? Payable.fromLiveSession(match) : null;
  }

  private async optional<T>(run: () => Promise<T>, fallback: T): Promise<T> {
    try { return await run(); } catch { return fallback; }
  }
}

export type PaymentOutcome = { readonly kind: 'redirect'; readonly url: string };

@Injectable({ providedIn: 'root' })
export class InitiatePayment {
  private readonly payments = inject(PAYMENT_GATEWAY);

  async execute(payable: Payable, couponCode: string | null = null): Promise<PaymentOutcome> {
    const result: PaymentInitiation = await firstValueFrom(
      this.payments.initiate(payable, Payable.idempotencyKey(payable), couponCode));
    const url = result.checkoutReference.trim();
    if (/^\/checkout\/result\?paymentId=[\da-f-]{36}$/i.test(url)) return { kind: 'redirect', url };
    const target = new URL(url);
    if (target.origin !== 'https://ksa.checkout.paymob.com' || target.username || target.password) {
      throw new Error('Unsafe payment checkout URL');
    }
    return { kind: 'redirect', url };
  }
}
