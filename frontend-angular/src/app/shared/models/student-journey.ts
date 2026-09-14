/**
 * Where a Student stands in their own journey.
 *
 * Landing's contextual module, the dashboard's Needs Attention panel and the
 * request detail surface all describe the same position. They read it from this
 * one projection so a Student can never be told "pay now" on one surface and
 * "waiting for offers" on another.
 *
 * Every value is server-derived. The reservation deadline is the API's
 * `paymentReservationExpiresAt`, never a client clock guess, and an elapsed
 * reservation is reported as expired rather than as fake remaining urgency.
 */

export const LEARNING_REQUEST_STATUS = {
  PENDING_TEACHER_REVIEW: 0, CLARIFICATION_REQUESTED: 1, ACCEPTED: 2,
  DECLINED: 3, CANCELLED: 4, OPEN_FOR_OFFERS: 5, AWAITING_PAYMENT: 6,
  CONVERTED_TO_ORDER: 7, EXPIRED: 8
} as const;

export const SOURCING_OPEN_MARKETPLACE = 1;

/** A learning request row as `/learning-requests/mine` returns it. */
export interface StudentRequestRow {
  readonly id: string;
  readonly title: string;
  readonly status: number;
  readonly sourcingMode: number;
  readonly offerCount: number | null;
  readonly paymentReservationExpiresAt: string;
  readonly preferredDeliveryAt: string;
  readonly teacherDisplayName: string;
  readonly teacherDisplayNameEnglish: string;
  readonly selectedOfferId: string;
}

export interface JourneyItem {
  readonly id: string;
  readonly title: string;
  readonly status: number;
  readonly isOpen: boolean;
  /** Translation key for the sourcing badge. */
  readonly sourcingKey: string;
  readonly offerCount: number | null;
  readonly hasOffers: boolean;
  readonly awaitingPayment: boolean;
  /** Null when there is no reservation; `<= 0` means the window has elapsed. */
  readonly reservationMsRemaining: number | null;
  readonly reservationExpired: boolean;
  readonly deadline: string;
  readonly teacher: string;
  readonly priority: number;
}

export interface StudentJourney {
  readonly items: readonly JourneyItem[];
  readonly total: number;
  /** The one request whose payment reservation is still running, if any. */
  readonly actionRequired: JourneyItem | null;
}

const TERMINAL = new Set<number>([
  LEARNING_REQUEST_STATUS.DECLINED,
  LEARNING_REQUEST_STATUS.CANCELLED,
  LEARNING_REQUEST_STATUS.EXPIRED,
  LEARNING_REQUEST_STATUS.CONVERTED_TO_ORDER
]);

/**
 * Action value ordering: pay first, then offers waiting on a decision, then
 * requests still gathering offers, then everything else.
 */
function priorityOf(awaitingPayment: boolean, isOpen: boolean, status: number, offers: number | null): number {
  if (awaitingPayment) return 10;
  if (isOpen && status === LEARNING_REQUEST_STATUS.OPEN_FOR_OFFERS) {
    return (offers ?? 0) > 0 ? 20 : 30;
  }
  return 40;
}

export function projectStudentJourney(
  requests: readonly StudentRequestRow[], now = Date.now()
): StudentJourney {
  const items = requests
    // Terminal states are history, not journey position.
    .filter(row => !TERMINAL.has(Number(row.status)))
    .map<JourneyItem>(row => {
      const status = Number(row.status);
      const isOpen = Number(row.sourcingMode) === SOURCING_OPEN_MARKETPLACE;
      const offerCount = typeof row.offerCount === 'number' ? row.offerCount : null;
      const expiresAt = row.paymentReservationExpiresAt
        ? Date.parse(row.paymentReservationExpiresAt) : Number.NaN;
      const reservationMs = Number.isNaN(expiresAt) ? null : expiresAt - now;
      const awaitingPayment = status === LEARNING_REQUEST_STATUS.AWAITING_PAYMENT;

      return {
        id: row.id,
        title: String(row.title ?? '').trim(),
        status,
        isOpen,
        sourcingKey: isOpen ? 'sd_sourcing_open' : 'sd_sourcing_direct',
        offerCount,
        hasOffers: (offerCount ?? 0) > 0,
        awaitingPayment,
        reservationMsRemaining: awaitingPayment ? reservationMs : null,
        reservationExpired: awaitingPayment && reservationMs !== null && reservationMs <= 0,
        deadline: row.preferredDeliveryAt ?? '',
        teacher: row.teacherDisplayName || row.teacherDisplayNameEnglish || '',
        priority: priorityOf(awaitingPayment, isOpen, status, offerCount)
      };
    })
    .sort((a, b) => a.priority !== b.priority
      ? a.priority - b.priority
      : String(b.deadline).localeCompare(String(a.deadline)));

  const payable = items.filter(x => x.awaitingPayment && !x.reservationExpired);
  return { items, total: items.length, actionRequired: payable[0] ?? null };
}

/** Minutes left on the reservation, rounded up, never below one. */
export function reservationMinutes(item: JourneyItem): number | null {
  if (item.reservationMsRemaining === null) return null;
  return Math.max(1, Math.ceil(item.reservationMsRemaining / 60000));
}

/**
 * The canonical lifecycle wording. Direct requests use it verbatim; the open
 * marketplace overlays offer counts on top of it, which is a different sentence
 * about the same status rather than a different status.
 */
const STATUS_KEYS = [
  'req_status_pending_review',
  'req_status_clarification',
  'req_status_accepted',
  'req_status_declined',
  'req_status_cancelled',
  'req_status_open_for_offers',
  'req_status_awaiting_payment',
  'req_status_converted',
  'req_status_expired'
] as const;

export function requestStatusKey(status: number): string {
  return STATUS_KEYS[status] ?? 'req_status_unknown';
}
