import { describe, expect, it } from 'vitest';
import { Row, chipFrom, chipOf, filterItems, sortItems } from './work-item';

const NOW = Date.parse('2026-09-16T12:00:00Z');
const iso = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

const request = (over: Partial<Row> = {}): Row =>
  ({ id: 'r1', _source: '/learning-requests/mine', status: 0, createdAt: iso(-60), ...over });
const assigned = (over: Partial<Row> = {}): Row =>
  ({ id: 'r2', _source: '/learning-requests/assigned', status: 0, createdAt: iso(-60), ...over });
const order = (over: Partial<Row> = {}): Row =>
  ({ id: 'o1', _source: '/orders/mine', status: 1, paymentStatus: 1, createdAt: iso(-30), ...over });
const assignedOrder = (over: Partial<Row> = {}): Row =>
  ({ id: 'o2', _source: '/orders/assigned', status: 1, paymentStatus: 1, createdAt: iso(-30), ...over });
const session = (over: Partial<Row> = {}): Row =>
  ({ id: 's1', _source: '/live-sessions/mine', status: 1, startsAt: iso(240), endsAt: iso(300), createdAt: iso(-120), ...over });

describe('UX-03 one list of everything', () => {
  it('puts what waits for the student under Needs action', () => {
    expect(chipOf(request({ status: 1 }), 'student', NOW)).toBe('action');                 // teacher asked
    expect(chipOf(request({ status: 5, offerCount: 2 }), 'student', NOW)).toBe('action');   // offers to compare
    expect(chipOf(request({ status: 6, paymentReservationExpiresAt: iso(30) }), 'student', NOW)).toBe('action');
    expect(chipOf(order({ status: 0, paymentStatus: 0 }), 'student', NOW)).toBe('action');  // pay
    expect(chipOf(order({ status: 2 }), 'student', NOW)).toBe('action');                    // review the delivery
    expect(chipOf(order({ status: 4, reviewCanSubmit: true, hasReview: false }), 'student', NOW)).toBe('action');
    expect(chipOf(session({ status: 0 }), 'student', NOW)).toBe('action');                  // pay for the session
    expect(chipOf(session({ status: 6 }), 'student', NOW)).toBe('action');                  // confirm it happened
  });

  it('puts what waits for the teacher under Needs action, and not the student’s share', () => {
    expect(chipOf(assigned(), 'teacher', NOW)).toBe('action');                              // a request to review
    expect(chipOf(assignedOrder({ status: 0, paymentStatus: 1 }), 'teacher', NOW)).toBe('action');
    expect(chipOf(assignedOrder({ status: 3 }), 'teacher', NOW)).toBe('action');             // revision asked
    expect(chipOf(assignedOrder({ status: 1, isOverdue: true }), 'teacher', NOW)).toBe('action');
    expect(chipOf(session({ status: 8 }), 'teacher', NOW)).toBe('action');                   // absence reported
    // The same rows read differently from the other side.
    expect(chipOf(assignedOrder({ status: 0, paymentStatus: 1 }), 'student', NOW)).toBe('active');
    expect(chipOf(request({ status: 0 }), 'student', NOW)).toBe('active');
  });

  it('calls a live session on now an action for whoever is in it', () => {
    const live = session({ startsAt: iso(-5), endsAt: iso(55) });
    expect(chipOf(live, 'student', NOW)).toBe('action');
    expect(chipOf(live, 'teacher', NOW)).toBe('action');
    // A session that has ended is the teacher's to settle; the student waits.
    const over = session({ startsAt: iso(-120), endsAt: iso(-60) });
    expect(chipOf(over, 'teacher', NOW)).toBe('action');
    expect(chipOf(over, 'student', NOW)).toBe('active');
  });

  it('files work that is simply running under In progress', () => {
    expect(chipOf(order({ status: 1, isOverdue: false }), 'student', NOW)).toBe('active');
    expect(chipOf(order({ status: 1, isOverdue: false }), 'teacher', NOW)).toBe('active');
    expect(chipOf(session(), 'student', NOW)).toBe('active');
    expect(chipOf(request({ status: 5, offerCount: 0 }), 'student', NOW)).toBe('active');
  });

  it('files what is over under Finished, for both sides', () => {
    for (const viewer of ['student', 'teacher'] as const) {
      expect(chipOf(order({ status: 4, hasReview: true }), viewer, NOW)).toBe('finished');
      expect(chipOf(order({ status: 5 }), viewer, NOW)).toBe('finished');
      expect(chipOf(request({ status: 3 }), viewer, NOW)).toBe('finished');
      expect(chipOf(request({ status: 4 }), viewer, NOW)).toBe('finished');
      expect(chipOf(request({ status: 7 }), viewer, NOW)).toBe('finished');
      expect(chipOf(request({ status: 8 }), viewer, NOW)).toBe('finished');
      expect(chipOf(session({ status: 2 }), viewer, NOW)).toBe('finished');
      expect(chipOf(session({ status: 3 }), viewer, NOW)).toBe('finished');
    }
  });

  it('shows one list of all three kinds, with what needs the reader first', () => {
    const rows = [
      session({ id: 'old-session', status: 2, createdAt: iso(-1000) }),
      order({ id: 'running', status: 1, createdAt: iso(-10) }),
      order({ id: 'pay-me', status: 0, paymentStatus: 0, createdAt: iso(-500) }),
      request({ id: 'asked', status: 1, createdAt: iso(-900) })
    ];
    expect(sortItems(rows, 'student', NOW).map(row => row['id']))
      .toEqual(['pay-me', 'asked', 'running', 'old-session']);
    expect(filterItems(rows, 'action', 'student', NOW).map(row => row['id'])).toEqual(['pay-me', 'asked']);
    expect(filterItems(rows, 'active', 'student', NOW).map(row => row['id'])).toEqual(['running']);
    expect(filterItems(rows, 'finished', 'student', NOW).map(row => row['id'])).toEqual(['old-session']);
    expect(filterItems(rows, 'all', 'student', NOW)).toHaveLength(4);
  });

  it('treats an unknown chip in a link as All', () => {
    expect(chipFrom('action')).toBe('action');
    expect(chipFrom('ACTION')).toBe('action');
    expect(chipFrom('whatever')).toBe('all');
    expect(chipFrom(null)).toBe('all');
    expect(chipFrom(undefined)).toBe('all');
  });
});
