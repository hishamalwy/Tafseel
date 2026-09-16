/**
 * What the student's home shows, and in what order (UX-01, `docs/tickets/v1/UX-01.md`).
 *
 * The home answers four questions, in this order: is anything waiting for me, what am I doing, is a
 * live session coming, and how do I start something. This file decides which of the student's own
 * requests, orders and sessions answer each question — nothing else. It re-derives no domain rule: it
 * reads the states the server already decided and sorts them by how much they need the student now.
 *
 * Pure, so the page passes a formatter and the same code is tested in Arabic and English. The teacher
 * home (`UX-02`) will bring its own composition; this is deliberately not a shared mega-dashboard.
 */
import { ACTIONS, Label, StatusView, orderStatus, requestStatus, sessionStatus } from '@shared/vocabulary/status-vocabulary';

export interface HomeFormat {
  readonly lang: 'ar' | 'en';
  t(key: string, fallback: string): string;
  format(key: string, values: Readonly<Record<string, string | number>>, fallback: string): string;
  /** Date and time in the viewer's zone. */
  dateTime(value: unknown): string;
  /** Time of day only. */
  time(value: unknown): string;
  /** "in 3 days" / «خلال ٣ أيام». */
  until(value: unknown): string;
}

export type Row = Record<string, unknown>;

export interface HomeInput {
  readonly requests: readonly Row[];
  readonly orders: readonly Row[];
  readonly sessions: readonly Row[];
  readonly viewerId: string;
  readonly now: number;
  readonly fmt: HomeFormat;
}

export interface HomeLink {
  readonly path: readonly string[];
  readonly query?: Readonly<Record<string, string>>;
}

export interface HomeCard {
  /** Stable across refreshes so the DOM does not jump: the item's id plus what it is asking for. */
  readonly key: string;
  readonly title: string;
  readonly supporting: string;
  /** The product status, from the UX-04 vocabulary; the action cards say it in their own title. */
  readonly status?: StatusView;
  /**
   * An amount to pay, kept out of the sentence: Arabic draws SAR as the SAMA mark, which is markup
   * (`tf-price`), not text — "180 SAR" inside an Arabic line would be the one English phrase on the page.
   */
  readonly amount?: { readonly value: unknown; readonly currency: unknown };
  readonly cta: string;
  readonly link: HomeLink;
  /** A2 only: the moment the hold ends, so the page can count down and refetch at zero. */
  readonly expiresAt?: number;
}

export interface StudentHome {
  readonly actions: readonly HomeCard[];
  readonly current: readonly HomeCard[];
  readonly upcoming: HomeCard | null;
  /** How many action and current-work items exist beyond the three shown. */
  readonly moreActions: number;
  readonly moreCurrent: number;
  /** Nothing anywhere: a student with no requests, orders or sessions at all. */
  readonly newStudent: boolean;
}

/** Join-window minutes either side of a live session (`LiveSessionOptions`). */
const JOIN_WINDOW = 15 * 60_000;
export const MAX_CARDS = 3;

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const at = (value: unknown): number => Date.parse(String(value ?? ''));

const L = (labelKey: string, fallback: string): Label => ({ labelKey, fallback });

const COPY = {
  joinNow: L('sh_a1_title', 'Your session is on now'),
  payReserved: L('sh_a2_title', 'Pay to keep the offer you chose'),
  confirmSession: L('sh_a3_title', 'Confirm the session took place'),
  absenceReported: L('sh_a4_title', 'The teacher reported you absent'),
  acceptedPay: L('sh_a5_title', 'The teacher accepted — complete payment'),
  paySession: L('sh_a6_title', 'Complete payment for your session'),
  question: L('sh_a7_title', 'The teacher has a question'),
  delivered: L('sh_a8_title', 'Your delivery has arrived — review it'),
  newTime: L('sh_a9_title', 'The teacher proposed a new time'),
  late: L('sh_a10_title', 'The delivery is late'),
  review: L('sh_a12_title', 'How was your experience with {teacher}?'),
  offers: L('sh_a11_title', 'You have {n} offers'),
  untitled: L('card_untitled_request', 'Untitled request'),
  teacher: L('demand_teacher', 'Teacher'),
  holdEnds: L('sh_hold_ends', 'The hold ends in {minutes} min'),
  withUntil: L('sh_with_until', 'With {teacher} · ends {time}'),
  by: L('sh_by', 'By {when}'),
  from: L('sh_from', '{title} · from {teacher}'),
  proposed: L('sh_proposed', 'Proposed time {when}'),
  wasDue: L('sh_was_due', '{title} · was due {when}'),
  delivery: L('sh_delivery_due', 'Delivery {when}'),
  startsIn: L('sh_starts_in', 'Starts {relative}'),
  open: L('dashboard_open', 'Open'),
  sessionDetails: L('sh_session_details', 'Session details')
} as const satisfies Record<string, Label>;

interface Draft {
  readonly rank: number;
  readonly deadline: number;
  readonly createdAt: number;
  readonly card: HomeCard;
}

export function composeStudentHome(input: HomeInput): StudentHome {
  const { fmt, now, viewerId } = input;
  const text = (label: Label) => fmt.t(label.labelKey, label.fallback);
  const fill = (label: Label, values: Record<string, string | number>) => fmt.format(label.labelKey, values, label.fallback);
  const teacherOf = (row: Row): string =>
    (fmt.lang === 'en' ? str(row['teacherDisplayNameEnglish']) || str(row['teacherDisplayName'])
      : str(row['teacherDisplayName']) || str(row['teacherDisplayNameEnglish'])) || text(COPY.teacher);
  const titleOf = (row: Row, ...fallbacks: unknown[]): string =>
    str(row['title']) || str(row['requestTitle']) || fallbacks.map(str).find(Boolean) || text(COPY.untitled);
  const serviceOf = (row: Row): string => (fmt.lang === 'ar'
    ? str(row['serviceNameArabic']) || str(row['serviceNameEnglish'])
    : str(row['serviceNameEnglish']) || str(row['serviceNameArabic']));

  const actions: Draft[] = [];
  const current: Draft[] = [];
  const hidden = new Set<string>();

  const action = (rank: number, row: Row, card: HomeCard, deadline = Number.POSITIVE_INFINITY) =>
    actions.push({ rank, deadline, createdAt: at(row['createdAt']) || 0, card });
  const inProgress = (row: Row, card: HomeCard, status: StatusView) =>
    current.push({ rank: 0, deadline: 0, createdAt: at(row['createdAt']) || 0, card: { ...card, status } });

  // ---- live sessions ----
  let upcoming: { startsAt: number; card: HomeCard } | null = null;
  for (const session of input.sessions) {
    const id = str(session['id']);
    if (!id) continue;
    const status = session['status'];
    const starts = at(session['startsAt']);
    const ends = at(session['endsAt']);
    const link: HomeLink = { path: ['/live-sessions', id] };
    const outcomeDeadline = at(session['outcomeReviewDeadline']);
    const deadlineOf = (value: number) => (Number.isNaN(value) ? Number.POSITIVE_INFINITY : value);

    if (status === 1 && !Number.isNaN(starts) && !Number.isNaN(ends) && now >= starts - JOIN_WINDOW && now <= ends + JOIN_WINDOW) {
      action(1, session, {
        key: `${id}:join`, title: text(COPY.joinNow),
        supporting: fill(COPY.withUntil, { teacher: teacherOf(session), time: fmt.time(session['endsAt']) }),
        cta: text(sessionStatus(1, 'student', { startsAt: session['startsAt'], endsAt: session['endsAt'], now }).action
          ?? COPY.open), link
      }, deadlineOf(ends));
      continue;
    }
    if (status === 6 || status === 7) {
      const view = sessionStatus(status, 'student');
      action(status === 6 ? 3 : 4, session, {
        key: `${id}:outcome`, title: text(status === 6 ? COPY.confirmSession : COPY.absenceReported),
        supporting: Number.isNaN(outcomeDeadline) ? '' : fill(COPY.by, { when: fmt.dateTime(session['outcomeReviewDeadline']) }),
        cta: text(view.action ?? COPY.open), link
      }, deadlineOf(outcomeDeadline));
      continue;
    }
    if (status === 0) {
      action(6, session, {
        key: `${id}:pay`, title: text(COPY.paySession),
        supporting: fmt.dateTime(session['startsAt']),
        amount: { value: session['totalPrice'], currency: session['currency'] },
        cta: text(sessionStatus(0, 'student').action ?? COPY.open),
        link: { path: ['/checkout'], query: { liveSessionId: id } }
      }, deadlineOf(starts));
      continue;
    }
    const proposedBySomeoneElse = !!session['proposedStartsAt']
      && str(session['rescheduleRequestedById']) !== viewerId && (status === 0 || status === 1);
    if (proposedBySomeoneElse) {
      action(9, session, {
        key: `${id}:reschedule`, title: text(COPY.newTime),
        supporting: fill(COPY.proposed, { when: fmt.dateTime(session['proposedStartsAt']) }),
        cta: text(ACTIONS.reviewTime), link
      }, deadlineOf(at(session['proposedStartsAt'])));
      continue;
    }
    if (status === 8 || (!!session['proposedStartsAt'] && (status === 0 || status === 1))) {
      inProgress(session, {
        key: `${id}:waiting`, title: titleOf(session, serviceOf(session)),
        supporting: teacherOf(session), cta: text(COPY.open), link
      }, sessionStatus(status === 8 ? 8 : 1, 'student'));
      continue;
    }
    if (status === 1 && !Number.isNaN(starts) && starts > now + JOIN_WINDOW && (!upcoming || starts < upcoming.startsAt)) {
      upcoming = {
        startsAt: starts,
        card: {
          key: `${id}:upcoming`, title: titleOf(session, serviceOf(session)),
          supporting: `${teacherOf(session)} · ${fmt.dateTime(session['startsAt'])} · ${fill(COPY.startsIn, { relative: fmt.until(session['startsAt']) })}`,
          status: sessionStatus(1, 'student'), cta: text(COPY.sessionDetails), link
        }
      };
    }
  }

  // ---- orders ----
  for (const order of input.orders) {
    const id = str(order['id']);
    if (!id) continue;
    const status = order['status'];
    const payment = order['paymentStatus'];
    const link: HomeLink = { path: ['/orders', id] };
    const request = str(order['learningRequestId']);
    const title = titleOf(order, serviceOf(order));

    if (status === 0 && payment === 0) {
      action(5, order, {
        key: `${id}:pay`, title: text(COPY.acceptedPay),
        supporting: fill(COPY.from, { title, teacher: teacherOf(order) }),
        amount: { value: order['studentTotal'], currency: order['currency'] },
        cta: text(orderStatus(0, 0, 'student').action ?? COPY.open),
        link: { path: ['/checkout'], query: { orderId: id } }
      }, at(order['agreedDeliveryAt']) || Number.POSITIVE_INFINITY);
      if (request) hidden.add(request);
      continue;
    }
    if (order['canReportNonDelivery'] === true) {
      action(10, order, {
        key: `${id}:late`, title: text(COPY.late),
        supporting: fill(COPY.wasDue, { title, when: fmt.dateTime(order['agreedDeliveryAt']) }),
        cta: text(ACTIONS.openOrder), link
      }, at(order['agreedDeliveryAt']) || Number.POSITIVE_INFINITY);
      if (request) hidden.add(request);
      continue;
    }
    if (status === 2) {
      action(8, order, {
        key: `${id}:review-delivery`, title: text(COPY.delivered),
        supporting: fill(COPY.from, { title, teacher: teacherOf(order) }),
        cta: text(orderStatus(2, payment, 'student').action ?? COPY.open), link
      }, Number.POSITIVE_INFINITY);
      if (request) hidden.add(request);
      continue;
    }
    if (status === 4 && order['reviewCanSubmit'] === true && order['hasReview'] !== true) {
      action(12, order, {
        key: `${id}:review`, title: fill(COPY.review, { teacher: teacherOf(order) }),
        supporting: title,
        cta: text(orderStatus(4, payment, 'student', { reviewCanSubmit: true, hasReview: false }).action ?? COPY.open), link
      }, Number.POSITIVE_INFINITY);
      if (request) hidden.add(request);
      continue;
    }
    if ((status === 0 && payment === 1) || status === 1 || status === 3) {
      const view = orderStatus(status, payment, 'student');
      inProgress(order, {
        key: `${id}:current`, title,
        supporting: status === 1 && order['agreedDeliveryAt']
          ? `${teacherOf(order)} · ${fill(COPY.delivery, { when: fmt.dateTime(order['agreedDeliveryAt']) })}`
          : teacherOf(order),
        cta: text(COPY.open), link
      }, view);
      if (request) hidden.add(request);
    }
  }

  // ---- learning requests ----
  for (const request of input.requests) {
    const id = str(request['id']);
    if (!id || hidden.has(id)) continue;
    const status = request['status'];
    const link: HomeLink = { path: ['/requests', id] };
    const title = titleOf(request, serviceOf(request));
    const offers = num(request['offerCount']) ?? 0;

    if (status === 6) {
      const expires = at(request['paymentReservationExpiresAt']);
      if (!Number.isNaN(expires) && expires > now) {
        action(2, request, {
          key: `${id}:pay-reserved`, title: text(COPY.payReserved),
          supporting: fill(COPY.holdEnds, { minutes: Math.max(1, Math.ceil((expires - now) / 60_000)) }),
          cta: text(requestStatus(6, 'student').action ?? COPY.open),
          link: { path: ['/checkout'], query: { learningRequestId: id } },
          expiresAt: expires
        }, expires);
        continue;
      }
    }
    if (status === 1) {
      action(7, request, {
        key: `${id}:answer`, title: text(COPY.question), supporting: title,
        cta: text(requestStatus(1, 'student').action ?? COPY.open), link
      });
      continue;
    }
    if (status === 5 && offers > 0) {
      action(11, request, {
        key: `${id}:offers`, title: fill(COPY.offers, { n: offers }), supporting: title,
        cta: text(requestStatus(5, 'student', offers).action ?? COPY.open),
        link: { path: ['/requests', id, 'offers'] }
      }, at(request['preferredDeliveryAt']) || Number.POSITIVE_INFINITY);
      continue;
    }
    if (status === 0 || (status === 5 && offers === 0)) {
      inProgress(request, {
        key: `${id}:current`, title,
        supporting: request['sourcingMode'] === 1 ? serviceOf(request) : teacherOf(request),
        cta: text(COPY.open), link
      }, requestStatus(status, 'student', offers));
    }
  }

  const ordered = [...actions].sort((a, b) => a.rank - b.rank || a.deadline - b.deadline || b.createdAt - a.createdAt);
  const workingCards = [...current].sort((a, b) => b.createdAt - a.createdAt);

  return {
    actions: ordered.slice(0, MAX_CARDS).map(d => d.card),
    current: workingCards.slice(0, MAX_CARDS).map(d => d.card),
    upcoming: upcoming?.card ?? null,
    moreActions: Math.max(0, ordered.length - MAX_CARDS),
    moreCurrent: Math.max(0, workingCards.length - MAX_CARDS),
    newStudent: input.requests.length === 0 && input.orders.length === 0 && input.sessions.length === 0
  };
}
