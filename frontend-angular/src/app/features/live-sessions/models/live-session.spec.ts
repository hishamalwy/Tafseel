import { describe, expect, it } from 'vitest';
import { LiveSession, SESSION_STATUS, Session } from './live-session';

const START = Date.parse('2026-09-20T10:00:00Z');
const MIN = 60_000;
const session = (patch: Partial<LiveSession> = {}): LiveSession => ({
  id: 'b1', studentId: 's', teacherId: 't', title: 'Revision', notes: '', startsAt: '2026-09-20T10:00:00Z', endsAt: '2026-09-20T10:30:00Z',
  studentTimeZoneId: 'UTC', teacherTimeZoneId: 'UTC', totalPrice: 120, currency: 'SAR', cancellationWindowHours: 24,
  status: SESSION_STATUS.CONFIRMED, attachments: [], version: 'v', studentName: '', teacherName: '', serviceName: '', serviceNameArabic: '',
  proposedStartsAt: '', rescheduleRequestedById: '', outcomeReviewDeadline: '', rescheduleCount: 0, ...patch
});

describe('Session.actions', () => {
  it('asks the student, not the teacher, to pay an unpaid booking, and offers no join before payment', () => {
    const unpaid = session({ status: SESSION_STATUS.AWAITING_PAYMENT });
    expect(Session.actions(unpaid, 's', START - 60 * MIN)).toContain('pay');
    expect(Session.actions(unpaid, 't', START - 60 * MIN)).not.toContain('pay');
    expect(Session.actions(unpaid, 's', START)).not.toContain('join');
  });

  it('offers nothing to someone outside the booking', () => {
    expect(Session.actions(session(), 'outsider', START)).toEqual([]);
  });

  it('lets only the teacher request completion, and only once the session has ended', () => {
    expect(Session.actions(session(), 't', START + 29 * MIN)).not.toContain('complete');
    expect(Session.actions(session(), 't', START + 30 * MIN)).toContain('complete');
    expect(Session.actions(session(), 's', START + 30 * MIN)).not.toContain('complete');
  });

  it('allows a no-show report only after the 15-minute grace period', () => {
    expect(Session.actions(session(), 's', START + 44 * MIN)).not.toContain('no-show');
    expect(Session.actions(session(), 's', START + 45 * MIN)).toContain('no-show');
    expect(Session.actions(session(), 't', START + 45 * MIN)).toContain('no-show');
  });

  it('asks the other party to confirm each pending settlement', () => {
    const at = START + 60 * MIN;
    expect(Session.actions(session({ status: SESSION_STATUS.COMPLETION_PENDING }), 's', at)).toContain('confirm-settlement');
    expect(Session.actions(session({ status: SESSION_STATUS.COMPLETION_PENDING }), 't', at)).not.toContain('confirm-settlement');
    expect(Session.actions(session({ status: SESSION_STATUS.STUDENT_NO_SHOW_PENDING }), 's', at)).toContain('confirm-settlement');
    expect(Session.actions(session({ status: SESSION_STATUS.STUDENT_NO_SHOW_PENDING }), 't', at)).not.toContain('confirm-settlement');
    expect(Session.actions(session({ status: SESSION_STATUS.TEACHER_NO_SHOW_PENDING }), 't', at)).toContain('confirm-settlement');
    expect(Session.actions(session({ status: SESSION_STATUS.TEACHER_NO_SHOW_PENDING }), 's', at)).not.toContain('confirm-settlement');
  });

  it('does not reopen a settled or pending session for joining, cancelling or reporting', () => {
    for (const status of [SESSION_STATUS.COMPLETED, SESSION_STATUS.COMPLETION_PENDING, SESSION_STATUS.TEACHER_NO_SHOW, SESSION_STATUS.CANCELLED]) {
      const actions = Session.actions(session({ status }), 's', START + 60 * MIN);
      expect(actions).not.toContain('join');
      expect(actions).not.toContain('cancel');
      expect(actions).not.toContain('no-show');
    }
  });

  it('lets the other party answer a reschedule request, and blocks a second request meanwhile', () => {
    const pending = session({ rescheduleRequestedById: 's', proposedStartsAt: '2026-09-21T10:00:00Z' });
    expect(Session.actions(pending, 't', START - 120 * MIN)).toContain('respond-reschedule');
    expect(Session.actions(pending, 's', START - 120 * MIN)).not.toContain('respond-reschedule');
    expect(Session.actions(pending, 's', START - 120 * MIN)).not.toContain('reschedule');
    expect(Session.actions(session(), 's', START + MIN)).not.toContain('reschedule');
  });
});

describe('Session timing and refunds', () => {
  it('opens the join window 15 minutes before the start and closes it 15 minutes after the end', () => {
    expect(Session.joinOpensAt(session())).toBe(START - 15 * MIN);
    expect(Session.joinClosesAt(session())).toBe(START + 45 * MIN);
  });

  it('refunds a teacher cancellation always, and a student one only before the cancellation window', () => {
    const late = START - 23 * 60 * MIN;
    expect(Session.cancellationRefunds(session(), 't', late)).toBe(true);
    expect(Session.cancellationRefunds(session(), 's', late)).toBe(false);
    expect(Session.cancellationRefunds(session(), 's', START - 24 * 60 * MIN)).toBe(true);
  });

  it('sends a reschedule as wall-clock time with seconds and its zone', () => {
    expect(Session.rescheduleInput('2026-09-21T10:00', 'Egypt Standard Time')).toEqual({ localStart: '2026-09-21T10:00:00', timeZoneId: 'Egypt Standard Time' });
  });
});
