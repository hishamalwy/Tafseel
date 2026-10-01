import { describe, expect, it } from 'vitest';
import ar from '../../../../public/locale/ar.json';
import en from '../../../../public/locale/en.json';
import {
  ACTIONS, Label, STUDENT_TEACHER_NOTIFICATION_TYPES, StatusView, conversationScope, disputeResolution, disputeStatus,
  notificationCopy, offerStatus, offeringActive, orderPayment, orderStatus, payoutStatus, qualificationState,
  requestStatus, rescheduleBadge, sessionStatus, withdrawalStatus
} from './status-vocabulary';

const tables = { ar: ar as Record<string, string>, en: en as Record<string, string> };
const text = (lang: 'ar' | 'en', label: Label) => tables[lang][label.labelKey];
const both = (label: Label) => [text('ar', label), text('en', label)];

describe('UX-04 status vocabulary — approved Arabic and English terms', () => {
  it('names every learning request status in the Product Contract words, never the number', () => {
    expect(both(requestStatus(0))).toEqual(['بانتظار المعلم', 'Waiting for the teacher']);
    expect(both(requestStatus(1))).toEqual(['المعلم لديه سؤال', 'Teacher asked a question']);
    expect(both(requestStatus(2))).toEqual(['مقبول — تم إنشاء طلب العمل', 'Accepted — order created']);
    expect(both(requestStatus(3))).toEqual(['مرفوض', 'Declined']);
    expect(both(requestStatus(4))).toEqual(['ملغى', 'Cancelled']);
    expect(both(requestStatus(5))).toEqual(['يستقبل العروض', 'Receiving offers']);
    expect(both(requestStatus(6))).toEqual(['العرض محجوز للدفع', 'Offer held for payment']);
    expect(both(requestStatus(7))).toEqual(['أصبح طلب عمل', 'Became an order']);
    expect(both(requestStatus(8))).toEqual(['منتهي', 'Expired']);
  });

  it('gives the student and the teacher the tone and verb that belong to them', () => {
    expect(requestStatus(0, 'student')).toMatchObject({ tone: 'info' });
    expect(requestStatus(0, 'student').action).toBeUndefined();
    expect(requestStatus(0, 'teacher')).toMatchObject({ tone: 'warning', action: ACTIONS.reviewRequest });
    expect(requestStatus(1, 'student')).toMatchObject({ tone: 'warning', action: ACTIONS.answerTeacher });
    expect(requestStatus(1, 'teacher').tone).toBe('info');
    expect(requestStatus(5, 'student', 0)).toMatchObject({ tone: 'info' });
    expect(requestStatus(5, 'student', 3)).toMatchObject({ tone: 'warning', action: ACTIONS.compareOffers });
    expect(requestStatus(6, 'student')).toMatchObject({ tone: 'warning', action: ACTIONS.payNow });
    // An accepted request's order may already be paid; the order row owns "Pay now".
    expect(requestStatus(2, 'student').action).toBe(ACTIONS.openOrder);
    expect(requestStatus(6, 'teacher').tone).toBe('info');
    // The teacher reads their own work list: "Waiting for the teacher" there meant them.
    expect(both(requestStatus(0, 'teacher'))).toEqual(['طلب جديد — بانتظار ردك', 'New request — waiting for your answer']);
    expect(both(requestStatus(1, 'teacher'))).toEqual(['سألت الطالب — بانتظار رده', 'You asked a question — waiting for the student']);
    expect(both(requestStatus(6, 'teacher'))).toEqual(['اختار الطالب عرضك — بانتظار الدفع', 'Your offer was chosen — waiting for payment']);
    expect(both(sessionStatus(0, 'teacher'))).toEqual(['مقبولة — بانتظار دفع الطالب', 'Accepted — waiting for the student’s payment']);
    expect(both(ACTIONS.answerTeacher)).toEqual(['أجب المعلم', 'Answer the teacher']);
  });

  it('reads an order in role-aware words, including the paid-but-not-started state', () => {
    expect(both(orderStatus(0, 0, 'student'))).toEqual(['بانتظار الدفع', 'Payment required']);
    expect(both(orderStatus(0, 0, 'teacher'))).toEqual(['بانتظار دفع الطالب', 'Waiting for the student’s payment']);
    expect(both(orderStatus(0, 1, 'student'))).toEqual(['تم الدفع', 'Paid — waiting for the teacher to start']);
    expect(both(orderStatus(0, 1, 'teacher'))).toEqual(['تم الدفع — ابدأ العمل', 'Paid — start the work']);
    expect(orderStatus(0, 1, 'teacher')).toMatchObject({ tone: 'warning', action: ACTIONS.startWork });
    expect(both(orderStatus(2, 1, 'student'))).toEqual(['تم التسليم — راجعه', 'Delivered — review it']);
    expect(both(orderStatus(2, 1, 'teacher'))).toEqual(['تم التسليم — بانتظار الطالب', 'Delivered — waiting for the student']);
    expect(both(orderStatus(3, 1, 'student'))).toEqual(['طلبت تعديلًا — بانتظار المعلم', 'You asked for changes — waiting for the teacher']);
    expect(orderStatus(3, 1, 'teacher')).toMatchObject({ tone: 'warning', action: ACTIONS.deliverRevision });
    expect(orderStatus(1, 1, 'teacher', { isOverdue: true }).tone).toBe('warning');
    expect(orderStatus(4, 1, 'student', { reviewCanSubmit: true, hasReview: false }).action).toEqual(ACTIONS.writeReview);
    expect(orderStatus(4, 1, 'student', { reviewCanSubmit: true, hasReview: true }).action).toBeUndefined();
    expect(both(orderPayment(2))).toEqual(['تعذّر الدفع', 'Payment failed']);
  });

  it('tells each side of a pending live-session outcome what it is waiting for', () => {
    expect(both(sessionStatus(6, 'student'))).toEqual(['بانتظار تأكيدك', 'Waiting for your confirmation']);
    expect(both(sessionStatus(6, 'teacher'))).toEqual(['بانتظار تأكيد الطالب', 'Waiting for the student to confirm']);
    expect(both(sessionStatus(7, 'student'))).toEqual(['المعلم أبلغ عن غيابك', 'The teacher reported you absent']);
    expect(both(sessionStatus(8, 'teacher'))).toEqual(['الطالب أبلغ عن غيابك', 'The student reported you absent']);
    expect(sessionStatus(8, 'teacher')).toMatchObject({ tone: 'warning', action: ACTIONS.reviewReport });
    expect(sessionStatus(8, 'student').tone).toBe('info');
  });

  it('offers joining only inside the join window, and asks the teacher to confirm once it closed', () => {
    const startsAt = '2026-09-15T10:00:00Z', endsAt = '2026-09-15T11:00:00Z';
    const at = (iso: string) => Date.parse(iso);
    expect(sessionStatus(1, 'student', { startsAt, endsAt, now: at('2026-09-15T09:30:00Z') }).action).toBeUndefined();
    expect(sessionStatus(1, 'student', { startsAt, endsAt, now: at('2026-09-15T09:50:00Z') }).action).toEqual(ACTIONS.joinSession);
    expect(sessionStatus(1, 'teacher', { startsAt, endsAt, now: at('2026-09-15T11:20:00Z') }).action).toEqual(ACTIONS.confirmSessionEnded);
    expect(sessionStatus(1, 'student', { startsAt, endsAt, now: at('2026-09-15T11:20:00Z') }).action).toBeUndefined();
    expect(rescheduleBadge('2026-09-16T10:00:00Z', 'teacher-1', 'student-1', 1)).toMatchObject({ tone: 'warning', action: ACTIONS.reviewTime });
    expect(rescheduleBadge('2026-09-16T10:00:00Z', 'student-1', 'student-1', 1)?.tone).toBe('info');
    expect(rescheduleBadge(null, 'teacher-1', 'student-1', 1)).toBeNull();
  });

  it('names teacher offers for whoever reads them', () => {
    expect(both(offerStatus(0, 'student'))).toEqual(['عرض جديد', 'New offer']);
    expect(both(offerStatus(0, 'teacher'))).toEqual(['بانتظار قرار الطالب', 'Waiting for the student']);
    expect(both(offerStatus(1))).toEqual(['اختاره الطالب — بانتظار الدفع', 'Chosen — waiting for payment']);
    expect(both(offerStatus(4))).toEqual(['لم يُختر', 'Not chosen']);
    expect(both(offerStatus(5))).toEqual(['انتهت صلاحيته', 'Expired']);
    expect(offerStatus(3, 'teacher').action).toEqual(ACTIONS.sendAgain);
  });

  it('describes disputes, withdrawals, payout details, offerings and qualifications in product words', () => {
    expect(both(disputeStatus('under-review'))).toEqual(['قيد المراجعة لدى تفصيل', 'Being reviewed by Tafseel']);
    expect(disputeStatus(0).tone).toBe('warning');
    expect(disputeStatus('resolved').tone).toBe('neutral');
    expect(both(disputeResolution('release-teacher'))).toEqual(['صُرف المبلغ للمعلم', 'Paid to the teacher']);
    expect(both(withdrawalStatus(2))).toEqual(['مرفوض — أُعيد المبلغ إلى رصيدك', 'Rejected — returned to your balance']);
    expect(withdrawalStatus(1).tone).toBe('success');
    expect(both(payoutStatus(1))).toEqual(['معتمدة', 'Approved']);
    expect(both(offeringActive(true))).toEqual(['ظاهرة للطلاب', 'Visible to students']);
    expect(both(offeringActive(false))).toEqual(['موقوفة', 'Paused']);
    expect(both(qualificationState(2))).toEqual(['مطلوب تعديلات', 'Changes requested']);
    expect(both(conversationScope(2))).toEqual(['عن طلب عمل', 'About an order']);
  });

  it('never turns an unknown value into its number or code', () => {
    const unknown: StatusView[] = [requestStatus(42), orderStatus(9, 1), sessionStatus('x'), offerStatus(-1),
      disputeStatus(7), withdrawalStatus(5), payoutStatus(null), qualificationState(99)];
    for (const view of unknown) expect(both(view)).toEqual(['غير معروف', 'Unknown']);
  });

  it('has Arabic and English copy for every notification type a student or teacher receives', () => {
    // The `type` strings written by the server's QueueAsync calls for students and teachers.
    const server = ['ApplicationDecision', 'ApplicationSubmitted', 'ApplicationUnderReview', 'ClarificationReplied',
      'ClarificationRequested', 'DeliveryUploaded', 'Dispute', 'NewMessage', 'NewRequest', 'OfferReceived',
      'OfferReservationExpired', 'OfferReservationReminder', 'OfferSelected', 'OrderAutoCompleted', 'OrderCompleted',
      'OrderExtensionDecided', 'OrderExtensionRequested', 'PaymentConfirmed', 'PaymentRequired', 'ProfilePublished',
      'ProfileUnpublished', 'Refund', 'RequestDeclined', 'RequestExpired', 'Review', 'ReviewSubmitted', 'RevisionRequested',
      'SessionBooking', 'SessionCancelled', 'SessionCompletionRequested', 'SessionNoShowReview', 'SessionOutcomeRequired',
      'SessionOutcomeResolved', 'SessionReminder', 'SessionRescheduleRejected', 'SessionRescheduleRequested',
      'SessionRescheduled', 'SessionSettlementConfirmed', 'SessionSettlementFinalized', 'Withdrawal', 'WorkStarted',
      'QualificationRevoked', 'SessionRequest', 'SessionRequestAccepted', 'SessionRequestDeclined', 'Support',
      'RequestCancelled', 'OrderCancelled', 'PaymentFailed', 'AccountStatus'];
    for (const type of server) {
      const copy = notificationCopy(type);
      expect(copy, type).not.toBeNull();
      expect(text('ar', copy!), type).toMatch(/[؀-ۿ]/);
      expect(text('en', copy!), type).toBeTruthy();
    }
    expect([...STUDENT_TEACHER_NOTIFICATION_TYPES].sort()).toEqual([...server].sort());
    expect(text('ar', notificationCopy('OfferReservationReminder')!)).toBe('أكمل الدفع قبل انتهاء حجز العرض');
    expect(text('en', notificationCopy('ShowcaseApproved')!)).toBe('Update on your teaching samples');
    // Staff queues are named too, so an Arabic bell never shows the English server title.
    expect(text('ar', notificationCopy('DisputeAdmin')!)).toBe('بلاغ مشكلة بانتظار قرارك');
    expect(notificationCopy('SomethingUnknown')).toBeNull();
    expect(notificationCopy(42)).toBeNull();
  });

  it('keeps every vocabulary key present in both locale tables', () => {
    const views: Label[] = [...Object.values(ACTIONS)];
    for (let s = 0; s <= 8; s++) for (const v of ['student', 'teacher'] as const) {
      views.push(requestStatus(s, v, 1), orderStatus(s % 6, 0, v), orderStatus(s % 6, 1, v), sessionStatus(s, v));
    }
    for (let s = 0; s <= 6; s++) views.push(offerStatus(s % 6, 'student'), offerStatus(s % 6, 'teacher'), qualificationState(s));
    for (const label of views) {
      expect(tables.ar[label.labelKey], label.labelKey).toBeTruthy();
      expect(tables.en[label.labelKey], label.labelKey).toBeTruthy();
    }
  });
});
