/**
 * Product words for every status a student or teacher can see (UX-04,
 * `docs/tickets/v1/UX-04.md`).
 *
 * The API serializes its enums as integers and no DTO carries a status name, so this is the one
 * place a number becomes something a person can read. The mappings are presentation only: the
 * server's enums are unchanged and the server still decides what is allowed. The action named
 * here is the verb a card shows when the item's own screen offers that action to this viewer.
 *
 * Tone rule: `warning` = waiting for *this viewer*; `info` = in progress or waiting for someone
 * else; `success` = done well; `danger` = ended without the intended outcome; `neutral` =
 * inactive or historical.
 *
 * Every key sits in a labelKey property, which `scripts/check-locales.mjs` collects, so both locales must carry it.
 */

export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';
export type Viewer = 'student' | 'teacher';

export interface Label { readonly labelKey: string; readonly fallback: string }
export interface StatusView extends Label {
  readonly tone: Tone;
  /** The verb for this viewer, when their next step is theirs to take. */
  readonly action?: Label;
}

const UNKNOWN: StatusView = { labelKey: 'status_unknown', fallback: 'Unknown', tone: 'neutral' };

// ---- actions ----
export const ACTIONS = {
  open: { labelKey: 'dashboard_open', fallback: 'Open' },
  reviewRequest: { labelKey: 'action_review_request', fallback: 'Review the request' },
  answerTeacher: { labelKey: 'action_answer_teacher', fallback: 'Answer the teacher' },
  payNow: { labelKey: 'action_pay_now', fallback: 'Pay now' },
  findAnotherTeacher: { labelKey: 'action_find_another_teacher', fallback: 'Find another teacher' },
  compareOffers: { labelKey: 'action_compare_offers', fallback: 'Compare offers' },
  sendOffer: { labelKey: 'action_send_offer', fallback: 'Send an offer' },
  openOrder: { labelKey: 'action_open_order', fallback: 'Open the order' },
  postNewRequest: { labelKey: 'action_post_new_request', fallback: 'Post a new request' },
  startWork: { labelKey: 'action_start_work', fallback: 'Start the work' },
  deliverWork: { labelKey: 'action_deliver_work', fallback: 'Deliver the work' },
  reviewDelivery: { labelKey: 'action_review_delivery', fallback: 'Review the delivery' },
  deliverRevision: { labelKey: 'action_deliver_revision', fallback: 'Deliver the revision' },
  writeReview: { labelKey: 'action_write_review', fallback: 'Write a review' },
  joinSession: { labelKey: 'action_join_session', fallback: 'Join the session' },
  confirmSession: { labelKey: 'action_confirm_session', fallback: 'Confirm the session' },
  confirmSessionEnded: { labelKey: 'action_confirm_session_ended', fallback: 'Confirm the session ended' },
  reviewReport: { labelKey: 'action_review_report', fallback: 'Review the report' },
  reviewTime: { labelKey: 'action_review_time', fallback: 'Review the proposed time' },
  chooseOffer: { labelKey: 'action_choose_offer', fallback: 'Choose this offer' },
  editOffer: { labelKey: 'action_edit_offer', fallback: 'Edit offer' },
  sendAgain: { labelKey: 'action_send_offer_again', fallback: 'Send again' },
  viewApplication: { labelKey: 'action_view_application', fallback: 'View application' },
  updateApplication: { labelKey: 'action_update_application', fallback: 'Update application' },
  applyAgain: { labelKey: 'action_apply_again', fallback: 'Apply again' },
  pause: { labelKey: 'action_pause', fallback: 'Pause' },
  activate: { labelKey: 'action_activate', fallback: 'Activate' }
} as const satisfies Record<string, Label>;

const view = (labelKey: string, fallback: string, tone: Tone, action?: Label): StatusView =>
  action ? { labelKey, fallback, tone, action } : { labelKey, fallback, tone };

// ---- Learning Request (LearningRequestStatus) ----
export const REQUEST = {
  PENDING_TEACHER_REVIEW: 0, CLARIFICATION_REQUESTED: 1, ACCEPTED: 2, DECLINED: 3, CANCELLED: 4,
  OPEN_FOR_OFFERS: 5, AWAITING_PAYMENT: 6, CONVERTED_TO_ORDER: 7, EXPIRED: 8
} as const;

export function requestStatus(status: unknown, viewer: Viewer = 'student', offerCount: number | null = null): StatusView {
  const student = viewer === 'student';
  switch (status) {
    case 0: return student
      ? { labelKey: 'demand_status_pending', fallback: 'Waiting for the teacher', tone: 'info' }
      : { labelKey: 'demand_status_pending', fallback: 'Waiting for the teacher', tone: 'warning', action: ACTIONS.reviewRequest };
    case 1: return student
      ? { labelKey: 'demand_status_clarification', fallback: 'Teacher asked a question', tone: 'warning', action: ACTIONS.answerTeacher }
      : { labelKey: 'demand_status_clarification', fallback: 'Teacher asked a question', tone: 'info' };
    case 2: return view('demand_status_accepted', 'Accepted — order created', 'success', student ? ACTIONS.payNow : undefined);
    case 3: return view('demand_status_declined', 'Declined', 'danger', student ? ACTIONS.findAnotherTeacher : undefined);
    case 4: return view('demand_status_cancelled', 'Cancelled', 'neutral');
    case 5: {
      const offers = (offerCount ?? 0) > 0;
      if (!student) return { labelKey: 'demand_status_open', fallback: 'Receiving offers', tone: 'info', action: ACTIONS.sendOffer };
      return offers
        ? { labelKey: 'demand_status_open', fallback: 'Receiving offers', tone: 'warning', action: ACTIONS.compareOffers }
        : { labelKey: 'demand_status_open', fallback: 'Receiving offers', tone: 'info' };
    }
    case 6: return student
      ? { labelKey: 'demand_status_reserved', fallback: 'Offer held for payment', tone: 'warning', action: ACTIONS.payNow }
      : { labelKey: 'demand_status_reserved', fallback: 'Offer held for payment', tone: 'info' };
    case 7: return { labelKey: 'demand_status_converted', fallback: 'Became an order', tone: 'success', action: ACTIONS.openOrder };
    case 8: return view('demand_status_expired', 'Expired', 'danger', student ? ACTIONS.postNewRequest : undefined);
    default: return UNKNOWN;
  }
}

export function requestMode(sourcingMode: unknown): Label {
  return sourcingMode === 1
    ? { labelKey: 'request_mode_open', fallback: 'Open request' }
    : { labelKey: 'request_mode_direct', fallback: 'Request to one teacher' };
}

// ---- Order (OrderStatus × OrderPaymentStatus) ----
export const ORDER = { AWAITING_PAYMENT: 0, IN_PROGRESS: 1, DELIVERED: 2, REVISION_REQUESTED: 3, COMPLETED: 4, CANCELLED: 5 } as const;
export const ORDER_PAYMENT = { PENDING: 0, PAID: 1, FAILED: 2, REFUNDED: 3 } as const;

export interface OrderFlags {
  readonly isOverdue?: boolean;
  readonly reviewCanSubmit?: boolean;
  readonly hasReview?: boolean;
}

export function orderStatus(status: unknown, paymentStatus: unknown, viewer: Viewer = 'student', flags: OrderFlags = {}): StatusView {
  const student = viewer === 'student';
  switch (status) {
    case 0:
      if (paymentStatus === ORDER_PAYMENT.PAID) return student
        ? { labelKey: 'order_status_payment_confirmed', fallback: 'Paid — waiting for the teacher to start', tone: 'info' }
        : { labelKey: 'order_status_paid_start', fallback: 'Paid — start the work', tone: 'warning', action: ACTIONS.startWork };
      return student
        ? { labelKey: 'order_status_payment_required', fallback: 'Payment required', tone: 'warning', action: ACTIONS.payNow }
        : { labelKey: 'order_status_awaiting_student_payment', fallback: 'Waiting for the student’s payment', tone: 'info' };
    case 1: return student
      ? { labelKey: 'order_status_in_progress', fallback: 'In progress', tone: 'info' }
      : { labelKey: 'order_status_in_progress', fallback: 'In progress', tone: flags.isOverdue ? 'warning' : 'info', action: ACTIONS.deliverWork };
    case 2: return student
      ? { labelKey: 'order_status_delivered_review', fallback: 'Delivered — review it', tone: 'warning', action: ACTIONS.reviewDelivery }
      : { labelKey: 'order_status_delivered', fallback: 'Delivered', tone: 'info' };
    case 3: return student
      ? { labelKey: 'order_status_revision', fallback: 'Revision requested', tone: 'info' }
      : { labelKey: 'order_status_revision', fallback: 'Revision requested', tone: 'warning', action: ACTIONS.deliverRevision };
    case 4: return view('order_status_completed', 'Completed', 'success',
      student && flags.reviewCanSubmit && !flags.hasReview ? ACTIONS.writeReview : undefined);
    case 5: return view('order_status_cancelled', 'Cancelled', 'neutral');
    default: return UNKNOWN;
  }
}

export const LATE_BADGE: StatusView = { labelKey: 'order_badge_late', fallback: 'Late', tone: 'danger' };

export function orderPayment(paymentStatus: unknown): StatusView {
  switch (paymentStatus) {
    case 0: return { labelKey: 'order_payment_0', fallback: 'Pending', tone: 'warning' };
    case 1: return { labelKey: 'order_payment_1', fallback: 'Paid', tone: 'success' };
    case 2: return { labelKey: 'order_payment_2', fallback: 'Payment failed', tone: 'danger' };
    case 3: return { labelKey: 'order_payment_3', fallback: 'Refunded', tone: 'neutral' };
    default: return UNKNOWN;
  }
}

// ---- Live Session Booking (LiveSessionStatus) ----
export const SESSION = {
  AWAITING_PAYMENT: 0, CONFIRMED: 1, COMPLETED: 2, CANCELLED: 3, STUDENT_NO_SHOW: 4, TEACHER_NO_SHOW: 5,
  COMPLETION_PENDING: 6, STUDENT_NO_SHOW_PENDING: 7, TEACHER_NO_SHOW_PENDING: 8
} as const;

/** Minutes either side of the session in which both participants may join (`LiveSessionOptions`). */
export const SESSION_JOIN_WINDOW_MINUTES = 15;

export interface SessionTiming {
  readonly startsAt?: unknown;
  readonly endsAt?: unknown;
  /** Epoch milliseconds; omit for a timeless label (no join/after-end verbs). */
  readonly now?: number;
}

export function sessionStatus(status: unknown, viewer: Viewer = 'student', timing: SessionTiming = {}): StatusView {
  const student = viewer === 'student';
  switch (status) {
    case 0: return student
      ? { labelKey: 'session_status_awaiting_payment', fallback: 'Payment required', tone: 'warning', action: ACTIONS.payNow }
      : { labelKey: 'session_status_awaiting_payment', fallback: 'Payment required', tone: 'info' };
    case 1: {
      const base = { labelKey: 'session_status_confirmed', fallback: 'Confirmed', tone: 'info' as Tone };
      const now = timing.now, starts = Date.parse(String(timing.startsAt ?? '')), ends = Date.parse(String(timing.endsAt ?? ''));
      if (now === undefined || Number.isNaN(starts) || Number.isNaN(ends)) return base;
      const window = SESSION_JOIN_WINDOW_MINUTES * 60_000;
      if (now >= starts - window && now <= ends + window) return { ...base, action: ACTIONS.joinSession };
      if (!student && now > ends + window) return { ...base, action: ACTIONS.confirmSessionEnded };
      return base;
    }
    case 2: return view('session_status_completed', 'Completed', 'success');
    case 3: return view('session_status_cancelled', 'Cancelled', 'neutral');
    case 4: return view('session_status_student_no_show', 'Student did not attend', 'danger');
    case 5: return view('session_status_teacher_no_show', 'Teacher did not attend', 'danger');
    case 6: return student
      ? { labelKey: 'session_status_completion_pending_student', fallback: 'Waiting for your confirmation', tone: 'warning', action: ACTIONS.confirmSession }
      : { labelKey: 'session_status_completion_pending_teacher', fallback: 'Waiting for the student to confirm', tone: 'info' };
    case 7: return student
      ? { labelKey: 'session_status_student_no_show_pending_student', fallback: 'The teacher reported you absent', tone: 'warning', action: ACTIONS.reviewReport }
      : { labelKey: 'session_status_student_no_show_pending_teacher', fallback: 'Waiting for the student', tone: 'info' };
    case 8: return student
      ? { labelKey: 'session_status_teacher_no_show_pending_student', fallback: 'Waiting for the teacher', tone: 'info' }
      : { labelKey: 'session_status_teacher_no_show_pending_teacher', fallback: 'The student reported you absent', tone: 'warning', action: ACTIONS.reviewReport };
    default: return UNKNOWN;
  }
}

/** A reschedule someone proposed: waiting for the viewer unless the viewer proposed it. */
export function rescheduleBadge(proposedStartsAt: unknown, requestedById: unknown, viewerId: string, status: unknown): StatusView | null {
  if (!proposedStartsAt || (status !== 0 && status !== 1)) return null;
  return requestedById && requestedById !== viewerId
    ? { labelKey: 'session_badge_new_time', fallback: 'New time proposed', tone: 'warning', action: ACTIONS.reviewTime }
    : { labelKey: 'session_badge_new_time', fallback: 'New time proposed', tone: 'info' };
}

// ---- Teacher Offer (TeacherOfferStatus) ----
export const OFFER = { SUBMITTED: 0, SELECTED: 1, ACCEPTED: 2, WITHDRAWN: 3, NOT_SELECTED: 4, EXPIRED: 5 } as const;

export function offerStatus(status: unknown, viewer: Viewer = 'student'): StatusView {
  const student = viewer === 'student';
  switch (status) {
    case 0: return student
      ? { labelKey: 'offer_status_submitted_student', fallback: 'New offer', tone: 'info', action: ACTIONS.chooseOffer }
      : { labelKey: 'offer_status_submitted_teacher', fallback: 'Waiting for the student', tone: 'info', action: ACTIONS.editOffer };
    case 1: return view('offer_status_selected', 'Chosen — waiting for payment', 'warning', student ? ACTIONS.payNow : undefined);
    case 2: return { labelKey: 'offer_status_accepted', fallback: 'Became an order', tone: 'success', action: ACTIONS.openOrder };
    case 3: return view('offer_status_withdrawn', 'Withdrawn', 'neutral', student ? undefined : ACTIONS.sendAgain);
    case 4: return view('offer_status_not_selected', 'Not chosen', 'neutral');
    case 5: return view('offer_status_expired', 'Expired', 'danger');
    default: return UNKNOWN;
  }
}

// ---- Dispute (DisputeStatus, DisputeResolution) ----
export function disputeStatus(status: unknown): StatusView {
  switch (status) {
    case 0: case 'open': return { labelKey: 'dispute_status_open', fallback: 'Open', tone: 'warning' };
    case 1: case 'under-review': return { labelKey: 'dispute_status_under_review', fallback: 'Being reviewed by Tafseel', tone: 'info' };
    case 2: case 'resolved': return { labelKey: 'dispute_status_resolved', fallback: 'Resolved', tone: 'neutral' };
    default: return UNKNOWN;
  }
}

export function disputeResolution(resolution: unknown): Label {
  switch (resolution) {
    case 0: case 'refund-student': return { labelKey: 'dispute_resolution_refund', fallback: 'Refunded to the student' };
    case 1: case 'release-teacher': return { labelKey: 'dispute_resolution_release', fallback: 'Paid to the teacher' };
    case 2: case 'no-financial-action': return { labelKey: 'dispute_resolution_none', fallback: 'No change to the payment' };
    default: return UNKNOWN;
  }
}

// ---- Withdrawals and payout details (WithdrawalStatus, PayoutVerificationStatus) ----
export function withdrawalStatus(status: unknown): StatusView {
  switch (status) {
    case 0: return { labelKey: 'withdrawal_status_pending', fallback: 'Processing', tone: 'info' };
    case 1: return { labelKey: 'withdrawal_status_completed', fallback: 'Transferred', tone: 'success' };
    case 2: return { labelKey: 'withdrawal_status_rejected', fallback: 'Rejected — returned to your balance', tone: 'danger' };
    default: return UNKNOWN;
  }
}

export function payoutStatus(status: unknown): StatusView {
  switch (status) {
    case 0: return { labelKey: 'payout_status_pending', fallback: 'Under review', tone: 'info' };
    case 1: return { labelKey: 'payout_status_verified', fallback: 'Approved', tone: 'success' };
    case 2: return { labelKey: 'payout_status_rejected', fallback: 'Rejected — update your details', tone: 'danger' };
    default: return UNKNOWN;
  }
}

// ---- Teacher setup ----
export function offeringActive(isActive: unknown): StatusView {
  return isActive
    ? { labelKey: 'offering_status_active', fallback: 'Visible to students', tone: 'success', action: ACTIONS.pause }
    : { labelKey: 'offering_status_paused', fallback: 'Paused', tone: 'neutral', action: ACTIONS.activate };
}

/** `TeacherQualificationCardState`: Qualified, ApplicationInProgress, ChangesRequested, Rejected, Revoked, AvailableToApply, Unavailable. */
export function qualificationState(state: unknown): StatusView {
  switch (state) {
    case 0: return { labelKey: 'qualification_state_qualified', fallback: 'Qualified', tone: 'success' };
    case 1: return { labelKey: 'qualification_state_in_review', fallback: 'Application in review', tone: 'info', action: ACTIONS.viewApplication };
    case 2: return { labelKey: 'qualification_state_changes', fallback: 'Changes requested', tone: 'warning', action: ACTIONS.updateApplication };
    case 3: return { labelKey: 'qualification_state_rejected', fallback: 'Not approved', tone: 'danger', action: ACTIONS.applyAgain };
    case 4: return { labelKey: 'qualification_state_revoked', fallback: 'Qualification removed', tone: 'danger' };
    case 5: return { labelKey: 'qualification_state_available', fallback: 'You can apply', tone: 'neutral' };
    case 6: return { labelKey: 'qualification_state_unavailable', fallback: 'Not available', tone: 'neutral' };
    default: return UNKNOWN;
  }
}

// ---- Conversation scope (ConversationScope) ----
export function conversationScope(scope: unknown): Label {
  switch (scope) {
    case 1: return { labelKey: 'messages_scope_request', fallback: 'About a request' };
    case 2: return { labelKey: 'messages_scope_order', fallback: 'About an order' };
    case 3: return { labelKey: 'messages_scope_session', fallback: 'About a live session' };
    default: return { labelKey: 'messages_scope_general', fallback: 'Conversation' };
  }
}

// ---- Notifications (server `type`) ----
const NOTIFICATION_COPY: Readonly<Record<string, Label>> = {
  NewRequest: { labelKey: 'notification_type_new_request', fallback: 'You have a new request' },
  NewMessage: { labelKey: 'notification_type_new_message', fallback: 'You have a new message' },
  ClarificationRequested: { labelKey: 'notification_type_clarification_requested', fallback: 'The teacher has a question about your request' },
  ClarificationReplied: { labelKey: 'notification_type_clarification_replied', fallback: 'The student answered your question' },
  RequestDeclined: { labelKey: 'notification_type_request_declined', fallback: 'The teacher declined your request' },
  RequestExpired: { labelKey: 'notification_type_request_expired', fallback: 'Your request expired' },
  PaymentRequired: { labelKey: 'notification_type_payment_required', fallback: 'Your request was accepted — complete payment' },
  PaymentConfirmed: { labelKey: 'notification_type_payment_confirmed', fallback: 'Payment received' },
  OfferReceived: { labelKey: 'notification_type_offer_received', fallback: 'You received a new offer' },
  OfferSelected: { labelKey: 'notification_type_offer_selected', fallback: 'The student chose your offer — waiting for payment' },
  OfferReservationReminder: { labelKey: 'notification_type_offer_reservation_reminder', fallback: 'Complete payment before the offer hold ends' },
  OfferReservationExpired: { labelKey: 'notification_type_offer_reservation_expired', fallback: 'The offer hold ended' },
  WorkStarted: { labelKey: 'notification_type_work_started', fallback: 'The teacher started the work' },
  DeliveryUploaded: { labelKey: 'notification_type_delivery_uploaded', fallback: 'Your delivery has arrived — review it' },
  RevisionRequested: { labelKey: 'notification_type_revision_requested', fallback: 'The student asked for a revision' },
  OrderCompleted: { labelKey: 'notification_type_order_completed', fallback: 'The order is complete' },
  OrderAutoCompleted: { labelKey: 'notification_type_order_auto_completed', fallback: 'The order was completed automatically' },
  OrderExtensionRequested: { labelKey: 'notification_type_order_extension', fallback: 'Update on the delivery time' },
  OrderExtensionDecided: { labelKey: 'notification_type_order_extension', fallback: 'Update on the delivery time' },
  SessionBooking: { labelKey: 'notification_type_session_booking', fallback: 'Update on your session booking' },
  SessionReminder: { labelKey: 'notification_type_session_reminder', fallback: 'Your session starts soon' },
  SessionRescheduleRequested: { labelKey: 'notification_type_session_reschedule_requested', fallback: 'A new session time was proposed' },
  SessionRescheduled: { labelKey: 'notification_type_session_rescheduled', fallback: 'The session time was changed' },
  SessionRescheduleRejected: { labelKey: 'notification_type_session_reschedule_rejected', fallback: 'The proposed time was declined' },
  SessionCancelled: { labelKey: 'notification_type_session_cancelled', fallback: 'The session was cancelled' },
  SessionCompletionRequested: { labelKey: 'notification_type_session_outcome_required', fallback: 'Confirm what happened in the session' },
  SessionOutcomeRequired: { labelKey: 'notification_type_session_outcome_required', fallback: 'Confirm what happened in the session' },
  SessionNoShowReview: { labelKey: 'notification_type_session_outcome_required', fallback: 'Confirm what happened in the session' },
  SessionSettlementConfirmed: { labelKey: 'notification_type_session_outcome_confirmed', fallback: 'The session outcome is confirmed' },
  SessionSettlementFinalized: { labelKey: 'notification_type_session_outcome_confirmed', fallback: 'The session outcome is confirmed' },
  SessionOutcomeResolved: { labelKey: 'notification_type_session_outcome_confirmed', fallback: 'The session outcome is confirmed' },
  Dispute: { labelKey: 'notification_type_dispute', fallback: 'Update on the objection' },
  Refund: { labelKey: 'notification_type_refund', fallback: 'Your payment was refunded' },
  Review: { labelKey: 'notification_type_review', fallback: 'You received a new review' },
  ReviewSubmitted: { labelKey: 'notification_type_review', fallback: 'You received a new review' },
  Withdrawal: { labelKey: 'notification_type_withdrawal', fallback: 'Update on your earnings' },
  ApplicationSubmitted: { labelKey: 'notification_type_application', fallback: 'Update on your teaching application' },
  ApplicationUnderReview: { labelKey: 'notification_type_application', fallback: 'Update on your teaching application' },
  ApplicationDecision: { labelKey: 'notification_type_application', fallback: 'Update on your teaching application' },
  ProfilePublished: { labelKey: 'notification_type_profile_published', fallback: 'Your profile is now visible to students' },
  ProfileUnpublished: { labelKey: 'notification_type_profile_unpublished', fallback: 'Your profile is no longer visible to students' }
};

const SHOWCASE_COPY: Label = { labelKey: 'notification_type_showcase', fallback: 'Update on your teaching samples' };
export const NOTIFICATION_UNKNOWN: Label = { labelKey: 'notification_type_unknown', fallback: 'You have a new update' };

/** Every server notification type a student or teacher receives, as written in the `QueueAsync` calls. */
export const STUDENT_TEACHER_NOTIFICATION_TYPES = Object.keys(NOTIFICATION_COPY);

/** The product copy for a notification type, or null when the type is not one Tafseel names. */
export function notificationCopy(type: unknown): Label | null {
  if (typeof type !== 'string') return null;
  if (type in NOTIFICATION_COPY) return NOTIFICATION_COPY[type];
  if (/^Showcase[A-Z]/.test(type) && type !== 'ShowcaseSubmitted') return SHOWCASE_COPY;
  return null;
}
