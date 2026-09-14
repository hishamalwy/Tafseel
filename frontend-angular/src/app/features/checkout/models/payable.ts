/**
 * The two things a student can pay for.
 *
 * Orders and live-session bookings are different resources with different
 * endpoints and different price breakdowns, but checkout treats them the same
 * way: one payable with a title, a set of price lines, and a total. Modelling
 * that here is what stops the page carrying `kind === 'order' ? … : …` in
 * nineteen places, which is what the legacy version did.
 */

export type PayableKind = 'order' | 'live-session';

export interface PriceLine {
  /** Translation key for the label; the UI resolves it. */
  readonly labelKey: string;
  readonly amount: number;
}

export interface Payable {
  readonly kind: PayableKind;
  readonly id: string;
  readonly currency: string;
  readonly title: string;
  readonly subtitleKey: string;
  readonly lines: readonly PriceLine[];
  readonly total: number;

  readonly teacherId: string | null;
  /** Order-only context; null for a live session. */
  readonly learningRequestId: string | null;
  readonly agreedDeliveryAt: string | null;
  readonly revisionAllowance: number | null;
  readonly categoryCode: string | null;
}

/** The raw order shape, as the API returns it. */
export interface OrderLike {
  id: string; currency?: string | null;
  // Party names travel on the order DTO; `partyName` reads them so the screen
  // never has to show a teacher id.
  teacherDisplayName?: string | null; teacherDisplayNameEnglish?: string | null;
  studentDisplayName?: string | null; studentDisplayNameEnglish?: string | null;
  price?: number | null; studentFeeAmount?: number | null; studentTotal?: number | null;
  requestTitle?: string | null;
  serviceNameEnglish?: string | null; serviceNameArabic?: string | null;
  teacherId?: string | null; learningRequestId?: string | null;
  agreedDeliveryAt?: string | null; revisionAllowance?: number | null;
  categoryCode?: string | null;
}

export interface LiveSessionLike {
  id: string; currency?: string | null;
  basePrice?: number | null; emergencyPremiumAmount?: number | null; totalPrice?: number | null;
  title?: string | null; teacherId?: string | null;
}

export const Payable = {
  /**
   * An order's total is the service price plus the student's platform fee. The
   * fee line is omitted when it is zero rather than shown as "0 SAR".
   */
  fromOrder(order: OrderLike, isArabic: boolean): Payable {
    const lines: PriceLine[] = [{ labelKey: 'pay_service_price', amount: Number(order.price) || 0 }];
    if (Number(order.studentFeeAmount) > 0) {
      lines.push({ labelKey: 'pay_platform_fee', amount: Number(order.studentFeeAmount) });
    }
    const service = isArabic
      ? (order.serviceNameArabic || order.serviceNameEnglish)
      : (order.serviceNameEnglish || order.serviceNameArabic);

    return {
      kind: 'order',
      id: order.id,
      currency: order.currency || 'SAR',
      title: order.requestTitle || service || '',
      subtitleKey: '',
      lines,
      total: Number(order.studentTotal) || 0,
      teacherId: order.teacherId ?? null,
      learningRequestId: order.learningRequestId ?? null,
      agreedDeliveryAt: order.agreedDeliveryAt ?? null,
      revisionAllowance: order.revisionAllowance ?? null,
      categoryCode: order.categoryCode ?? null
    };
  },

  /** A booking's total is the base price plus any emergency premium. */
  fromLiveSession(booking: LiveSessionLike): Payable {
    const lines: PriceLine[] = [{ labelKey: 'pay_base_price', amount: Number(booking.basePrice) || 0 }];
    if (Number(booking.emergencyPremiumAmount) > 0) {
      lines.push({
        labelKey: 'pay_emergency_premium',
        amount: Number(booking.emergencyPremiumAmount)
      });
    }
    return {
      kind: 'live-session',
      id: booking.id,
      currency: booking.currency || 'SAR',
      title: booking.title || '',
      subtitleKey: 'pay_live_session_subtitle',
      lines,
      total: Number(booking.totalPrice) || 0,
      teacherId: booking.teacherId ?? null,
      learningRequestId: null,
      agreedDeliveryAt: null,
      revisionAllowance: null,
      categoryCode: null
    };
  },

  /** The endpoint that starts a payment for this payable. */
  paymentPath(payable: Payable): string {
    return payable.kind === 'order'
      ? `/api/v1/payments/orders/${encodeURIComponent(payable.id)}`
      : `/api/v1/payments/live-sessions/${encodeURIComponent(payable.id)}`;
  },

  /**
   * Stable per payable, not per attempt.
   *
   * Retrying a payment must not create a second one, and the legacy code relied
   * on this exact shape (`payment-{id}`) so a resumed checkout matches an
   * earlier initiation.
   */
  idempotencyKey(payable: Payable): string {
    return `payment-${payable.id}`;
  }
} as const;

/** A GUID, used to reject junk in the query string before any request is made. */
export const GUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The mock provider derives its reference from the payable id, so a resumed
 * checkout can be found without storing anything.
 */
export function mockReference(payableId: string): string {
  return 'mock_' + String(payableId).replace(/-/g, '').toLowerCase();
}
