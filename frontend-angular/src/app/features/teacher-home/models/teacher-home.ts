/**
 * What the teacher's home shows, and in what order (UX-02, `docs/tickets/v1/UX-02.md`).
 *
 * The home answers five questions, in this order: can students find me, what needs me now, which open
 * requests could I win, when is my next session, and what have I earned. This file decides which of the
 * teacher's own assignments answer each question — nothing else. It re-derives no domain rule: the server
 * decided every state, and every card opens the screen that owns the action.
 *
 * Pure, so the page passes a formatter and the same code is tested in Arabic and English. The money is
 * FIN-01's model, not a second calculation: `Earnings.summary` is the one place balances become sentences.
 */
import { Balance, Earnings, EarningsView } from '@features/earnings/models/earnings';
import { ACTIONS, Label, StatusView, orderStatus, requestStatus, sessionStatus } from '@shared/vocabulary/status-vocabulary';

export interface HomeFormat {
  readonly lang: 'ar' | 'en';
  t(key: string, fallback: string): string;
  format(key: string, values: Readonly<Record<string, string | number>>, fallback: string): string;
  /** Date and time in the viewer's zone. */
  dateTime(value: unknown): string;
  /** Time of day only. */
  time(value: unknown): string;
  /** "in 3 hours" / «خلال ٣ ساعات», forwards. */
  until(value: unknown): string;
  /** "2 hours ago" / «قبل ساعتين», backwards. */
  since(value: unknown): string;
}

export type Row = Record<string, unknown>;

export interface HomeInput {
  /** `/learning-requests/assigned?status=0`: requests waiting for this teacher. */
  readonly requests: readonly Row[];
  readonly orders: readonly Row[];
  readonly sessions: readonly Row[];
  /** `/open-marketplace/opportunities`; empty for a teacher who is not visible yet. */
  readonly opportunities: readonly Row[];
  readonly opportunityCount: number;
  readonly balances: readonly Balance[];
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
  /** The product status, from the UX-04 vocabulary; action cards say it in their own title. */
  readonly status?: StatusView;
  /** An amount the teacher earns from this item, kept out of the sentence so Arabic can draw the mark. */
  readonly amount?: { readonly value: unknown; readonly currency: unknown };
  readonly cta: string;
  readonly link: HomeLink;
}

export interface Opportunity {
  readonly key: string;
  readonly title: string;
  /** «{service} · {subject}». */
  readonly supporting: string;
  readonly deadline: string;
  /** The budget in words, or null when the student left it open. */
  readonly budget: { readonly min: unknown; readonly max: unknown; readonly currency: unknown } | null;
  readonly flexibleBudget: boolean;
  readonly cta: string;
  readonly link: HomeLink;
}

export interface EarningsLines {
  readonly view: EarningsView | null;
  /** No balances at all, or every amount zero: "No earnings yet". */
  readonly empty: boolean;
}

export interface TeacherHome {
  readonly actions: readonly HomeCard[];
  readonly moreActions: number;
  readonly opportunities: readonly Opportunity[];
  readonly opportunityCount: number;
  readonly upcoming: HomeCard | null;
  readonly earnings: EarningsLines;
}

/** Join-window minutes either side of a live session (`LiveSessionOptions`). */
const JOIN_WINDOW = 15 * 60_000;
export const MAX_CARDS = 3;
export const MAX_OPPORTUNITIES = 3;

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const at = (value: unknown): number => Date.parse(String(value ?? ''));

const L = (labelKey: string, fallback: string): Label => ({ labelKey, fallback });

const COPY = {
  joinNow: L('th_t1_title', 'Your session is on now'),
  absenceReported: L('th_t2_title', 'The student reported you absent'),
  confirmEnded: L('th_t3_title', 'The session ended — confirm what happened'),
  revision: L('th_t4_title', 'The student asked for a revision'),
  overdue: L('th_t5_title', 'Delivery is overdue'),
  startWork: L('th_t6_title', 'Paid — start the work'),
  answered: L('th_t7_title', 'The student answered your question'),
  newRequest: L('th_t8_title', 'New request from {student}'),
  newTime: L('th_t9_title', 'The student proposed a new time'),
  student: L('th_student', 'A student'),
  untitled: L('card_untitled_request', 'Untitled request'),
  withUntil: L('th_with_until', 'With {student} · ends {time}'),
  by: L('th_by', 'By {when}'),
  endedWith: L('th_ended_with', 'With {student} · ended {relative}'),
  deliveryBy: L('th_delivery_by', '{title} · delivery {when}'),
  yourNet: L('th_your_net', '{title} · your earnings'),
  requestOf: L('th_request_of', '{title} · {service}'),
  proposed: L('th_proposed', 'Proposed time {when}'),
  startsIn: L('th_starts_in', 'Starts {relative}'),
  sessionDetails: L('th_session_details', 'Session details'),
  opportunityWhen: L('th_opportunity_deadline', 'Due {when}'),
  serviceSubject: L('th_service_subject', '{service} · {subject}'),
  viewRequest: L('th_view_request', 'View request'),
  open: L('dashboard_open', 'Open')
} as const satisfies Record<string, Label>;

interface Draft {
  readonly rank: number;
  readonly deadline: number;
  readonly createdAt: number;
  readonly card: HomeCard;
}

export function composeTeacherHome(input: HomeInput): TeacherHome {
  const { fmt, now, viewerId } = input;
  const text = (label: Label) => fmt.t(label.labelKey, label.fallback);
  const fill = (label: Label, values: Record<string, string | number>) => fmt.format(label.labelKey, values, label.fallback);
  const studentOf = (row: Row): string =>
    (fmt.lang === 'en' ? str(row['studentDisplayNameEnglish']) || str(row['studentDisplayName'])
      : str(row['studentDisplayName']) || str(row['studentDisplayNameEnglish'])) || text(COPY.student);
  const serviceOf = (row: Row): string => (fmt.lang === 'ar'
    ? str(row['serviceNameArabic']) || str(row['serviceNameEnglish'])
    : str(row['serviceNameEnglish']) || str(row['serviceNameArabic']));
  const titleOf = (row: Row, ...fallbacks: unknown[]): string =>
    str(row['title']) || str(row['requestTitle']) || fallbacks.map(str).find(Boolean) || text(COPY.untitled);

  const actions: Draft[] = [];
  const action = (rank: number, row: Row, card: HomeCard, deadline = Number.POSITIVE_INFINITY) =>
    actions.push({ rank, deadline, createdAt: at(row['createdAt']) || 0, card });
  const deadlineOf = (value: number) => (Number.isNaN(value) ? Number.POSITIVE_INFINITY : value);

  // ---- live sessions ----
  let upcoming: { startsAt: number; card: HomeCard } | null = null;
  for (const session of input.sessions) {
    const id = str(session['id']);
    if (!id) continue;
    const status = session['status'];
    const starts = at(session['startsAt']);
    const ends = at(session['endsAt']);
    const link: HomeLink = { path: ['/live-sessions', id] };
    const timing = { startsAt: session['startsAt'], endsAt: session['endsAt'], now };
    const live = status === 1 && !Number.isNaN(starts) && !Number.isNaN(ends)
      && now >= starts - JOIN_WINDOW && now <= ends + JOIN_WINDOW;

    if (live) {
      action(1, session, {
        key: `${id}:join`, title: text(COPY.joinNow),
        supporting: fill(COPY.withUntil, { student: studentOf(session), time: fmt.time(session['endsAt']) }),
        cta: text(sessionStatus(1, 'teacher', timing).action ?? ACTIONS.joinSession), link
      }, deadlineOf(ends));
      continue;
    }
    if (status === 8) {
      action(2, session, {
        key: `${id}:report`, title: text(COPY.absenceReported),
        supporting: session['outcomeReviewDeadline'] ? fill(COPY.by, { when: fmt.dateTime(session['outcomeReviewDeadline']) }) : '',
        cta: text(sessionStatus(8, 'teacher').action ?? ACTIONS.reviewReport), link
      }, deadlineOf(at(session['outcomeReviewDeadline'])));
      continue;
    }
    if (status === 1 && !Number.isNaN(ends) && now > ends + JOIN_WINDOW) {
      action(3, session, {
        key: `${id}:confirm`, title: text(COPY.confirmEnded),
        supporting: fill(COPY.endedWith, { student: studentOf(session), relative: fmt.since(session['endsAt']) }),
        cta: text(sessionStatus(1, 'teacher', timing).action ?? ACTIONS.confirmSessionEnded), link
      }, deadlineOf(ends));
      continue;
    }
    if (!!session['proposedStartsAt'] && str(session['rescheduleRequestedById']) !== viewerId
      && (status === 0 || status === 1)) {
      action(9, session, {
        key: `${id}:reschedule`, title: text(COPY.newTime),
        supporting: fill(COPY.proposed, { when: fmt.dateTime(session['proposedStartsAt']) }),
        cta: text(ACTIONS.reviewTime), link
      }, deadlineOf(at(session['proposedStartsAt'])));
      continue;
    }
    if (status === 1 && !Number.isNaN(starts) && starts > now + JOIN_WINDOW && (!upcoming || starts < upcoming.startsAt)) {
      upcoming = {
        startsAt: starts,
        card: {
          key: `${id}:upcoming`, title: titleOf(session, serviceOf(session)),
          supporting: `${studentOf(session)} · ${fmt.dateTime(session['startsAt'])} · ${fill(COPY.startsIn, { relative: fmt.until(session['startsAt']) })}`,
          status: sessionStatus(1, 'teacher'), cta: text(COPY.sessionDetails), link
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
    const title = titleOf(order, serviceOf(order));
    const due = deadlineOf(at(order['agreedDeliveryAt']));

    if (status === 3) {
      action(4, order, {
        key: `${id}:revision`, title: text(COPY.revision),
        supporting: fill(COPY.deliveryBy, { title, when: fmt.dateTime(order['agreedDeliveryAt']) }),
        cta: text(orderStatus(3, payment, 'teacher').action ?? COPY.open), link
      }, due);
      continue;
    }
    if (status === 1 && order['isOverdue'] === true) {
      action(5, order, {
        key: `${id}:overdue`, title: text(COPY.overdue),
        supporting: fill(COPY.deliveryBy, { title, when: fmt.dateTime(order['agreedDeliveryAt']) }),
        cta: text(orderStatus(1, payment, 'teacher', { isOverdue: true }).action ?? COPY.open), link
      }, due);
      continue;
    }
    if (status === 0 && payment === 1) {
      action(6, order, {
        key: `${id}:start`, title: text(COPY.startWork),
        supporting: fill(COPY.yourNet, { title }),
        amount: { value: order['teacherNet'], currency: order['currency'] },
        cta: text(orderStatus(0, 1, 'teacher').action ?? COPY.open), link
      }, due);
    }
  }

  // ---- requests assigned to this teacher and waiting for the teacher ----
  for (const request of input.requests) {
    const id = str(request['id']);
    if (!id || request['status'] !== 0) continue;
    const clarifications = Array.isArray(request['clarifications']) ? request['clarifications'] as Row[] : [];
    const last = clarifications[clarifications.length - 1];
    // A reply from anyone but this teacher is the student answering the question the teacher asked.
    const answered = !!last && str(last['senderId']) !== viewerId;
    action(answered ? 7 : 8, request, {
      key: `${id}:review`,
      title: answered ? text(COPY.answered) : fill(COPY.newRequest, { student: studentOf(request) }),
      supporting: fill(COPY.requestOf, { title: titleOf(request), service: serviceOf(request) }),
      cta: text(requestStatus(0, 'teacher').action ?? COPY.open),
      link: { path: ['/requests', id] }
    }, deadlineOf(at(request['preferredDeliveryAt'])));
  }

  // Oldest first for requests: a teacher answers in the order students asked.
  const ordered = [...actions].sort((a, b) => a.rank - b.rank || a.deadline - b.deadline || a.createdAt - b.createdAt);

  // ---- open requests this teacher could win ----
  const opportunities = input.opportunities
    .filter(row => !row['myOffer'] && str(row['id']))
    .sort((a, b) => (at(a['deadline']) || 0) - (at(b['deadline']) || 0))
    .slice(0, MAX_OPPORTUNITIES)
    .map<Opportunity>(row => {
      const id = str(row['id']);
      const subject = fmt.lang === 'ar'
        ? str(row['subjectNameArabic']) || str(row['subjectName'])
        : str(row['subjectName']) || str(row['subjectNameArabic']);
      const min = row['budgetMin'];
      const max = row['budgetMax'];
      const hasBudget = typeof min === 'number' || typeof max === 'number';
      return {
        key: id,
        title: titleOf(row),
        supporting: fill(COPY.serviceSubject, { service: serviceOf(row), subject }),
        deadline: fill(COPY.opportunityWhen, { when: fmt.dateTime(row['deadline']) }),
        budget: hasBudget ? { min, max, currency: row['currency'] } : null,
        flexibleBudget: !hasBudget,
        cta: text(COPY.viewRequest),
        link: { path: ['/teacher/opportunities', id] }
      };
    });

  // ---- money, as FIN-01 already decided to say it ----
  const summary = Earnings.summary(input.balances, null, now);
  const view = summary.balances.find(balance => balance.currency === 'SAR') ?? summary.balances[0] ?? null;

  return {
    actions: ordered.slice(0, MAX_CARDS).map(draft => draft.card),
    moreActions: Math.max(0, ordered.length - MAX_CARDS),
    opportunities,
    opportunityCount: Math.max(input.opportunityCount, opportunities.length),
    upcoming: upcoming?.card ?? null,
    earnings: { view, empty: summary.empty }
  };
}
