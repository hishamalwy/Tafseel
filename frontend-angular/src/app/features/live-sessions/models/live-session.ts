/**
 * A live-session booking as its student or teacher sees it (J8-02, J8-05, J8-06).
 *
 * `LiveSessionStatus` is the API's enum. The mutual-settlement lifecycle is the domain's: the
 * teacher asks to complete once the session has ended, either side reports a no-show after the
 * grace period, and the other side confirms (or the server finalizes it after the review window).
 * These rules only decide what to offer; the server decides what happens.
 */

import { Tone, Viewer, sessionStatus } from '@shared/vocabulary/status-vocabulary';

export const SESSION_STATUS = {
  AWAITING_PAYMENT: 0, CONFIRMED: 1, COMPLETED: 2, CANCELLED: 3, STUDENT_NO_SHOW: 4, TEACHER_NO_SHOW: 5,
  COMPLETION_PENDING: 6, STUDENT_NO_SHOW_PENDING: 7, TEACHER_NO_SHOW_PENDING: 8,
  AWAITING_TEACHER_APPROVAL: 9, DECLINED: 10
} as const;

/** `LiveSessionOptions` defaults: join opens 15 minutes early, a no-show can be reported 15 minutes after the end. */
export const JOIN_WINDOW_MINUTES = 15;
export const NO_SHOW_GRACE_MINUTES = 15;

export interface SessionAttachment {
  readonly id: string;
  readonly name: string;
  readonly contentType: string;
}

export interface LiveSession {
  readonly id: string;
  readonly studentId: string;
  readonly teacherId: string;
  readonly title: string;
  readonly notes: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly studentTimeZoneId: string;
  readonly teacherTimeZoneId: string;
  readonly totalPrice: number;
  readonly currency: string;
  readonly cancellationWindowHours: number;
  readonly status: number;
  readonly attachments: readonly SessionAttachment[];
  readonly version: string;
  readonly studentName: string;
  readonly teacherName: string;
  readonly serviceName: string;
  readonly serviceNameArabic: string;
  readonly proposedStartsAt: string;
  readonly rescheduleRequestedById: string;
  readonly outcomeReviewDeadline: string;
  readonly rescheduleCount: number;
  /** The student has already reviewed this session; one review per completed session. */
  readonly hasReview: boolean;
}

export type SessionAction =
  | 'pay' | 'join' | 'reschedule' | 'respond-reschedule' | 'respond-request' | 'cancel' | 'complete' | 'no-show' | 'confirm-settlement' | 'attach'
  | 'review';

export const Session = {
  roleOf(session: Pick<LiveSession, 'studentId' | 'teacherId'>, viewerId: string): 'student' | 'teacher' | null {
    return session.studentId === viewerId ? 'student' : session.teacherId === viewerId ? 'teacher' : null;
  },

  /** The status in the viewer's words (UX-04): a pending outcome reads differently to each side. */
  statusKey(status: number, viewer: Viewer = 'student'): string {
    const view = sessionStatus(status, viewer);
    return view.labelKey === 'status_unknown' ? 'session_status_unknown' : view.labelKey;
  },

  statusTone(status: number, viewer: Viewer = 'student'): Tone { return sessionStatus(status, viewer).tone; },

  joinOpensAt(session: Pick<LiveSession, 'startsAt'>): number { return Date.parse(session.startsAt) - JOIN_WINDOW_MINUTES * 60_000; },
  joinClosesAt(session: Pick<LiveSession, 'endsAt'>): number { return Date.parse(session.endsAt) + JOIN_WINDOW_MINUTES * 60_000; },

  actions(session: LiveSession, viewerId: string, now: number): readonly SessionAction[] {
    const role = Session.roleOf(session, viewerId);
    if (!role) return [];
    const actions: SessionAction[] = [];
    const ends = Date.parse(session.endsAt);
    const open = session.status === SESSION_STATUS.AWAITING_PAYMENT || session.status === SESSION_STATUS.CONFIRMED;
    if (session.status === SESSION_STATUS.AWAITING_TEACHER_APPROVAL) {
      if (role === 'teacher') actions.push('respond-request');
      if (role === 'student') actions.push('cancel');
      actions.push('attach');
      return actions;
    }
    if (role === 'student' && session.status === SESSION_STATUS.AWAITING_PAYMENT) actions.push('pay');
    // Join is offered whenever the booking is confirmed; the server refuses it outside the window.
    if (session.status === SESSION_STATUS.CONFIRMED) actions.push('join');
    // DEC-UX-08: once the join window opens the session is happening; cancelling or moving it then only strands the
    // other person, who is already on the way. After the session the no-show and completion steps take over.
    const happening = session.status === SESSION_STATUS.CONFIRMED && now >= Session.joinOpensAt(session);
    if (open && !happening && !session.rescheduleRequestedById && Date.parse(session.startsAt) > now) actions.push('reschedule');
    if (session.rescheduleRequestedById && session.rescheduleRequestedById !== viewerId) actions.push('respond-reschedule');
    if (open && !happening) actions.push('cancel');
    if (open) actions.push('attach');
    if (role === 'teacher' && session.status === SESSION_STATUS.CONFIRMED && now >= ends) actions.push('complete');
    if (session.status === SESSION_STATUS.CONFIRMED && now >= ends + NO_SHOW_GRACE_MINUTES * 60_000) actions.push('no-show');
    if ((session.status === SESSION_STATUS.COMPLETION_PENDING && role === 'student')
      || (session.status === SESSION_STATUS.STUDENT_NO_SHOW_PENDING && role === 'student')
      || (session.status === SESSION_STATUS.TEACHER_NO_SHOW_PENDING && role === 'teacher')) actions.push('confirm-settlement');
    // `CreateLiveSessionReviewAsync`: the student reviews a completed session once.
    if (role === 'student' && session.status === SESSION_STATUS.COMPLETED && !session.hasReview) actions.push('review');
    return actions;
  },

  /** `LiveSessionBooking.RequiresRefundOnCancellation`: the teacher always refunds; a student only before the window. */
  cancellationRefunds(session: Pick<LiveSession, 'startsAt' | 'cancellationWindowHours' | 'teacherId'>, viewerId: string, now: number): boolean {
    return viewerId === session.teacherId || now <= Date.parse(session.startsAt) - session.cancellationWindowHours * 3_600_000;
  },

  /** A wall-clock `datetime-local` value, sent with the zone it was entered in (`RescheduleLiveSession`). */
  rescheduleInput(localStart: string, timeZoneId: string): { localStart: string; timeZoneId: string } {
    return { localStart: localStart.length === 16 ? `${localStart}:00` : localStart, timeZoneId };
  }
} as const;
