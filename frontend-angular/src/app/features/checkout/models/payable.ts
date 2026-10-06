/**
 * The three things a student can pay for.
 *
 * Orders and live-session bookings are different resources with different
 * endpoints and different price breakdowns, but checkout treats them the same
 * way: one payable with a title, a set of price lines, and a total. Modelling
 * that here is what stops the page carrying `kind === 'order' ? … : …` in
 * nineteen places, which is what the legacy version did.
 */

import { AgreedPriceSource } from '@shared/models/agreed-price';

export type PayableKind = 'order' | 'live-session' | 'open-request';

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
  /**
   * The order itself, when this is an order, so checkout can disclose the agreed price the same way the
   * request and the order pages do (UX-09). Null for the payables that have no order behind them yet.
   */
  readonly order: AgreedPriceSource | null;

  readonly teacherId: string | null;
  /** Order-only context; null for a live session. */
  readonly learningRequestId: string | null;
  readonly agreedDeliveryAt: string | null;
  /** Open request only: the offer's delivery time, counted from payment (there is no date until then). */
  readonly deliveryHours?: number | null;
  readonly revisionAllowance: number | null;
  readonly categoryCode: string | null;
  /** Open request only: the reservation the payment must beat. */
  readonly reservationExpiresAt: string | null;
  /** A live session's time; what the student is paying for is that hour, not a delivery. */
  readonly session?: { readonly startsAt: string; readonly endsAt: string; readonly timeZoneId: string } | null;
  /** The payment for this payable is already confirmed: checkout must not offer to pay again. */
  readonly alreadyPaid?: boolean;
}

/** The raw order shape, as the API returns it. */
export interface OrderLike {
  id: string; currency?: string | null;
  // Party names travel on the order DTO; `partyName` reads them so the screen
  // never has to show a teacher id.
  teacherDisplayName?: string | null; teacherDisplayNameEnglish?: string | null;
  studentDisplayName?: string | null; studentDisplayNameEnglish?: string | null;
  price?: number | null; studentFeeAmount?: number | null; studentTotal?: number | null;
  studentFeePercent?: number | null;
  listedPriceAtRequest?: number | null; listedCurrencyAtRequest?: string | null;
  priceChangeReason?: string | null;
  requestTitle?: string | null;
  serviceNameEnglish?: string | null; serviceNameArabic?: string | null;
  teacherId?: string | null; learningRequestId?: string | null;
  agreedDeliveryAt?: string | null; revisionAllowance?: number | null;
  /** `OrderPaymentStatus`: 1 is Paid, 3 is Refunded. */
  paymentStatus?: number | null;
  categoryCode?: string | null;
}

/** A reserved open request and its selected offer, as the marketplace endpoints return them. */
export interface OpenRequestLike {
  id: string; title?: string | null; status?: number | null; selectedOfferId?: string | null;
  paymentReservationExpiresAt?: string | null; currency?: string | null;
}

export interface OfferLike {
  id: string; teacherId?: string | null; amount?: number | null; currency?: string | null;
  deliveryHours?: number | null; includedRevisions?: number | null;
}

/** The server's authoritative price for a selected, unexpired open-request offer. */
export interface OpenRequestPaymentQuote {
  offerAmount: number;
  studentFeePercent: number;
  studentFeeAmount: number;
  total: number;
  currency: string;
  reservationExpiresAt: string;
}

export interface LiveSessionLike {
  id: string; currency?: string | null;
  basePrice?: number | null; emergencyPremiumAmount?: number | null; totalPrice?: number | null;
  title?: string | null; teacherId?: string | null;
  startsAt?: string | null; endsAt?: string | null; studentTimeZoneId?: string | null;
  /** `LiveSessionStatus`: 0 is awaiting payment, 3 cancelled, 9 awaiting teacher, 10 declined. */
  status?: number | null;
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
      order,
      teacherId: order.teacherId ?? null,
      learningRequestId: order.learningRequestId ?? null,
      agreedDeliveryAt: order.agreedDeliveryAt ?? null,
      revisionAllowance: order.revisionAllowance ?? null,
      categoryCode: order.categoryCode ?? null,
      reservationExpiresAt: null,
      alreadyPaid: order.paymentStatus === 1 || order.paymentStatus === 3
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
      order: null,
      teacherId: booking.teacherId ?? null,
      learningRequestId: null,
      agreedDeliveryAt: null,
      revisionAllowance: null,
      categoryCode: null,
      reservationExpiresAt: null,
      session: booking.startsAt && booking.endsAt
        ? { startsAt: booking.startsAt, endsAt: booking.endsAt, timeZoneId: booking.studentTimeZoneId || '' }
        : null,
      alreadyPaid: booking.status != null && ![0, 3, 9, 10].includes(booking.status)
    };
  },

  /**
   * The order does not exist yet. The server quotes the charge for the selected offer before
   * payment begins and creates the order when payment succeeds.
   */
  fromOpenRequest(request: OpenRequestLike, offer: OfferLike, quote: OpenRequestPaymentQuote): Payable {
    return {
      kind: 'open-request',
      id: request.id,
      currency: quote.currency,
      title: request.title || '',
      subtitleKey: 'pay_open_request_subtitle',
      lines: [
        { labelKey: 'pay_offer_price', amount: quote.offerAmount },
        { labelKey: 'pay_platform_fee', amount: quote.studentFeeAmount }
      ],
      total: quote.total,
      order: null,
      teacherId: offer.teacherId ?? null,
      learningRequestId: request.id,
      agreedDeliveryAt: null,
      revisionAllowance: offer.includedRevisions ?? null,
      deliveryHours: offer.deliveryHours ?? null,
      categoryCode: null,
      reservationExpiresAt: quote.reservationExpiresAt
    };
  },

  /** The endpoint that starts a payment for this payable. */
  paymentPath(payable: Payable): string {
    switch (payable.kind) {
      case 'order': return `/api/v1/payments/orders/${encodeURIComponent(payable.id)}`;
      case 'open-request': return `/api/v1/payments/open-requests/${encodeURIComponent(payable.id)}`;
      default: return `/api/v1/payments/live-sessions/${encodeURIComponent(payable.id)}`;
    }
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

