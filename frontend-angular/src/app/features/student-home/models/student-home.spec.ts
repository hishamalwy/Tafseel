import { describe, expect, it } from 'vitest';
import ar from '../../../../../public/locale/ar.json';
import en from '../../../../../public/locale/en.json';
import { HomeFormat, MAX_CARDS, Row, composeStudentHome } from './student-home';

const NOW = Date.parse('2026-09-16T12:00:00Z');
const iso = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();
const GUID = '8f14e45f-ceea-467a-9575-3b1f3f0f5a21';

function formatter(lang: 'ar' | 'en'): HomeFormat {
  const table = (lang === 'ar' ? ar : en) as Record<string, string>;
  const t = (key: string, fallback: string) => table[key] ?? fallback;
  return {
    lang, t,
    format: (key, values, fallback) =>
      Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), t(key, fallback)),
    dateTime: value => (value ? `@${value}` : ''),
    time: value => (value ? `~${value}` : ''),
    until: value => (value ? `+${value}` : '')
  };
}

const compose = (lists: { requests?: Row[]; orders?: Row[]; sessions?: Row[] }, lang: 'ar' | 'en' = 'en') =>
  composeStudentHome({
    requests: lists.requests ?? [], orders: lists.orders ?? [], sessions: lists.sessions ?? [],
    viewerId: 'student-1', now: NOW, fmt: formatter(lang)
  });

const request = (over: Partial<Row> = {}): Row => ({
  id: 'r1', title: 'Chain rule', status: 0, sourcingMode: 0, offerCount: 0, createdAt: iso(-60),
  teacherDisplayName: 'نورة', teacherDisplayNameEnglish: 'Noura', ...over
});
const order = (over: Partial<Row> = {}): Row => ({
  id: 'o1', requestTitle: 'Chain rule', learningRequestId: 'r1', status: 0, paymentStatus: 0, studentTotal: 162,
  currency: 'SAR', createdAt: iso(-30), teacherDisplayName: 'نورة', teacherDisplayNameEnglish: 'Noura', ...over
});
const session = (over: Partial<Row> = {}): Row => ({
  id: 's1', title: 'Integrals', status: 1, startsAt: iso(180), endsAt: iso(240), totalPrice: 150, currency: 'SAR',
  createdAt: iso(-120), teacherDisplayName: 'نورة', teacherDisplayNameEnglish: 'Noura', ...over
});

describe('UX-01 student home composition', () => {
  it('shows a request waiting for the teacher without offering checkout', () => {
    const home = compose({ sessions: [session({ status: 9 })] });
    expect(home.actions).toEqual([]);
    expect(home.current[0]).toMatchObject({
      status: { labelKey: 'session_status_awaiting_teacher_student' },
      link: { path: ['/live-sessions', 's1'] }
    });
  });
  it('shows a brand-new student nothing but the two ways to start', () => {
    const home = compose({});
    expect(home).toMatchObject({ newStudent: true, moreActions: 0, moreCurrent: 0, upcoming: null });
    expect(home.actions).toEqual([]);
    expect(home.current).toEqual([]);
  });

  it('puts an accepted order awaiting payment first, and links to its checkout', () => {
    const home = compose({ orders: [order()], requests: [request({ status: 0 })] });
    expect(home.actions).toHaveLength(1);
    expect(home.actions[0]).toMatchObject({
      title: 'The teacher accepted — complete payment',
      supporting: 'Chain rule · from Noura',
      // The amount stays out of the sentence so Arabic can draw the SAMA mark instead of "SAR".
      amount: { value: 162, currency: 'SAR' },
      cta: 'Pay now',
      link: { path: ['/checkout'], query: { orderId: 'o1' } }
    });
    // The request it came from is not shown twice.
    expect(home.current).toEqual([]);
  });

  it('asks for payment on a held offer while the hold lasts, and stops when it expires', () => {
    const held = request({ status: 6, paymentReservationExpiresAt: iso(42) });
    const home = compose({ requests: [held] });
    expect(home.actions[0]).toMatchObject({
      title: 'Pay to keep the offer you chose',
      supporting: 'The hold ends in 42 min',
      link: { path: ['/checkout'], query: { learningRequestId: 'r1' } }
    });
    expect(home.actions[0].expiresAt).toBe(Date.parse(String(held['paymentReservationExpiresAt'])));
    const expired = compose({ requests: [request({ status: 6, paymentReservationExpiresAt: iso(-1) })] });
    expect(expired.actions).toEqual([]);
  });

  it('asks the student to answer the teacher, to review a delivery, and to compare offers', () => {
    expect(compose({ requests: [request({ status: 1 })] }).actions[0]).toMatchObject({
      title: 'The teacher has a question', cta: 'Answer the teacher', link: { path: ['/requests', 'r1'] }
    });
    expect(compose({ orders: [order({ status: 2, paymentStatus: 1 })] }).actions[0]).toMatchObject({
      title: 'Your delivery has arrived — review it', cta: 'Review the delivery', link: { path: ['/orders', 'o1'] }
    });
    expect(compose({ requests: [request({ status: 5, offerCount: 3, sourcingMode: 1 })] }).actions[0]).toMatchObject({
      title: 'You have 3 offers', cta: 'Compare offers', link: { path: ['/requests', 'r1', 'offers'] }
    });
  });

  it('asks for the session outcome the student owes, and to join a session that is on now', () => {
    expect(compose({ sessions: [session({ status: 6, outcomeReviewDeadline: iso(600) })] }).actions[0]).toMatchObject({
      title: 'Confirm the session took place', cta: 'Confirm the session', link: { path: ['/live-sessions', 's1'] }
    });
    expect(compose({ sessions: [session({ status: 7 })] }).actions[0].title).toBe('The teacher reported you absent');
    const live = compose({ sessions: [session({ startsAt: iso(-5), endsAt: iso(55) })] });
    expect(live.actions[0]).toMatchObject({ title: 'Your session is on now', cta: 'Join the session' });
    expect(live.upcoming).toBeNull();
  });

  it('asks the student to answer a proposed time, and says when a delivery is late', () => {
    const proposed = compose({ sessions: [session({ proposedStartsAt: iso(1440), rescheduleRequestedById: 'teacher-9' })] });
    expect(proposed.actions[0]).toMatchObject({
      title: 'The teacher proposed a new time', cta: 'Review the proposed time', link: { path: ['/live-sessions', 's1'] }
    });
    // A time the student proposed themselves is not their own task.
    const mine = compose({ sessions: [session({ proposedStartsAt: iso(1440), rescheduleRequestedById: 'student-1' })] });
    expect(mine.actions).toEqual([]);
    expect(mine.current[0].title).toBe('Integrals');

    const late = compose({ orders: [order({ status: 1, paymentStatus: 1, canReportNonDelivery: true, agreedDeliveryAt: iso(-2880) })] });
    expect(late.actions[0]).toMatchObject({
      title: 'The delivery is late', supporting: 'Chain rule · was due @2026-09-14T12:00:00.000Z',
      cta: 'Open the order', link: { path: ['/orders', 'o1'] }
    });
  });

  it('leaves work that is waiting on someone else in progress, not in the action list', () => {
    const home = compose({
      requests: [request({ id: 'r2', status: 0 })],
      orders: [order({ id: 'o2', learningRequestId: 'r9', status: 1, paymentStatus: 1, agreedDeliveryAt: iso(2880) })]
    });
    expect(home.actions).toEqual([]);
    expect(home.current.map(c => c.title)).toEqual(['Chain rule', 'Chain rule']);
    expect(home.current[0].status?.labelKey).toBe('order_status_in_progress');
    expect(home.current[0].cta).toBe('View order');
    expect(home.current[0].link).toEqual({ path: ['/orders', 'o2'] });
    const paid = compose({ orders: [order({ status: 0, paymentStatus: 1 })] });
    expect(paid.actions).toEqual([]);
    expect(paid.current[0].status?.labelKey).toBe('order_status_payment_confirmed');
  });

  it('keeps finished and dead items off the home', () => {
    const home = compose({
      requests: [request({ id: 'r3', status: 3 }), request({ id: 'r4', status: 4 }), request({ id: 'r5', status: 8 }),
        request({ id: 'r6', status: 7 })],
      orders: [order({ id: 'o3', status: 5, learningRequestId: 'x' }),
        order({ id: 'o4', status: 4, paymentStatus: 1, learningRequestId: 'y', hasReview: true, reviewCanSubmit: false })],
      sessions: [session({ id: 's2', status: 2 }), session({ id: 's3', status: 3 })]
    });
    expect(home.actions).toEqual([]);
    expect(home.current).toEqual([]);
    expect(home.upcoming).toBeNull();
    expect(home.newStudent).toBe(false);
  });

  it('still asks for the one thing a completed order can need: the review', () => {
    const home = compose({ orders: [order({ status: 4, paymentStatus: 1, reviewCanSubmit: true, hasReview: false })] });
    expect(home.actions[0]).toMatchObject({
      title: 'How was your experience with Noura?', cta: 'Write a review', link: { path: ['/orders', 'o1'] }
    });
  });

  it('orders the action list by what is most urgent, and caps it at three', () => {
    const home = compose({
      requests: [request({ id: 'r1', status: 1 }), request({ id: 'r2', status: 6, paymentReservationExpiresAt: iso(30) })],
      orders: [order({ id: 'o1', status: 0, paymentStatus: 0, learningRequestId: 'x' }),
        order({ id: 'o2', status: 2, paymentStatus: 1, learningRequestId: 'y' })],
      sessions: [session({ id: 's1', startsAt: iso(-5), endsAt: iso(55) })]
    });
    expect(home.actions.map(c => c.title)).toEqual([
      'Your session is on now',            // A1 — happening right now
      'Pay to keep the offer you chose',   // A2 — a hold that expires
      'The teacher accepted — complete payment' // A5
    ]);
    expect(home.actions).toHaveLength(MAX_CARDS);
    expect(home.moreActions).toBe(2);
  });

  it('picks the nearest session that has not started, and counts extra work in progress', () => {
    const home = compose({
      sessions: [session({ id: 's-late', startsAt: iso(600), endsAt: iso(660) }),
        session({ id: 's-next', startsAt: iso(120), endsAt: iso(180) })],
      requests: [request({ id: 'r1' }), request({ id: 'r2' }), request({ id: 'r3' }), request({ id: 'r4' })]
    });
    expect(home.upcoming?.link).toEqual({ path: ['/live-sessions', 's-next'] });
    expect(home.upcoming?.status?.labelKey).toBe('session_status_confirmed');
    expect(home.current).toHaveLength(MAX_CARDS);
    expect(home.moreCurrent).toBe(1);
  });

  it('reads in Arabic, and never shows an id or a raw field on any card', () => {
    const home = compose({
      requests: [request({ id: GUID, status: 1 })],
      orders: [order({ id: 'o9', status: 1, paymentStatus: 1, learningRequestId: 'x', agreedDeliveryAt: iso(2880) })],
      sessions: [session({ id: 's9', startsAt: iso(120), endsAt: iso(180) })]
    }, 'ar');
    expect(home.actions[0]).toMatchObject({ title: 'المعلم لديه سؤال', cta: 'أجب المعلم' });
    expect(home.current[0].status?.labelKey).toBe('order_status_in_progress');
    expect(home.upcoming?.cta).toBe('تفاصيل الجلسة');
    const shown = [...home.actions, ...home.current, home.upcoming!]
      .flatMap(card => [card.title, card.supporting, card.cta]).join(' | ');
    expect(shown).not.toContain(GUID);
    expect(shown).not.toMatch(/\bnull\b|\bundefined\b|\bNaN\b/);
    expect(shown).not.toMatch(/status|paymentStatus|Currency|Updated|Count/i);
  });
});
