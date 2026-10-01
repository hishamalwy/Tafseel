import { describe, expect, it } from 'vitest';
import ar from '../../../../../public/locale/ar.json';
import en from '../../../../../public/locale/en.json';
import { Balance } from '@features/earnings/models/earnings';
import { HomeFormat, MAX_CARDS, MAX_OPPORTUNITIES, Row, composeTeacherHome } from './teacher-home';

const NOW = Date.parse('2026-09-16T12:00:00Z');
const iso = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();
const TEACHER = 'teacher-1';
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
    until: value => (value ? `+${value}` : ''),
    since: value => (value ? `-${value}` : '')
  };
}

const compose = (lists: {
  requests?: Row[]; orders?: Row[]; sessions?: Row[]; opportunities?: Row[]; opportunityCount?: number; balances?: Balance[];
}, lang: 'ar' | 'en' = 'en') => composeTeacherHome({
  requests: lists.requests ?? [], orders: lists.orders ?? [], sessions: lists.sessions ?? [],
  opportunities: lists.opportunities ?? [], opportunityCount: lists.opportunityCount ?? (lists.opportunities?.length ?? 0),
  balances: lists.balances ?? [], viewerId: TEACHER, now: NOW, fmt: formatter(lang)
});

const request = (over: Partial<Row> = {}): Row => ({
  id: 'r1', title: 'Chain rule', status: 0, clarifications: [], createdAt: iso(-60),
  studentDisplayName: 'سارة', studentDisplayNameEnglish: 'Sara',
  serviceNameEnglish: 'Recorded explanation', serviceNameArabic: 'شرح مسجل', ...over
});
const order = (over: Partial<Row> = {}): Row => ({
  id: 'o1', requestTitle: 'Chain rule', status: 0, paymentStatus: 1, teacherNet: 153, currency: 'SAR',
  agreedDeliveryAt: iso(2880), createdAt: iso(-30), studentDisplayName: 'سارة', studentDisplayNameEnglish: 'Sara', ...over
});
const session = (over: Partial<Row> = {}): Row => ({
  id: 's1', title: 'Integrals', status: 1, startsAt: iso(180), endsAt: iso(240), createdAt: iso(-120),
  studentDisplayName: 'سارة', studentDisplayNameEnglish: 'Sara', ...over
});
const opportunity = (over: Partial<Row> = {}): Row => ({
  id: 'p1', title: 'Limits worksheet', deadline: iso(4320), budgetMin: 90, budgetMax: 200, currency: 'SAR',
  serviceNameEnglish: 'Recorded explanation', serviceNameArabic: 'شرح مسجل',
  subjectName: 'Calculus', subjectNameArabic: 'التفاضل', myOffer: null, ...over
});
const balance = (over: Partial<Balance> = {}): Balance =>
  ({ currency: 'SAR', available: 0, pendingWithdrawal: 0, pendingClearance: 0, nextClearanceAt: null, ...over });

describe('UX-02 teacher home composition', () => {
  it('puts unanswered session requests on the teacher action list', () => {
    const home = compose({ sessions: [session({ status: 9 })] });
    expect(home.actions[0]).toMatchObject({
      title: 'New session request', cta: 'Review session request',
      link: { path: ['/live-sessions', 's1'] }
    });
  });
  it('shows a teacher with nothing assigned no action cards at all', () => {
    const home = compose({});
    expect(home.actions).toEqual([]);
    expect(home.moreActions).toBe(0);
    expect(home.upcoming).toBeNull();
    expect(home.earnings.empty).toBe(true);
  });

  it('asks the teacher to start work a student has already paid for, and names their own earnings', () => {
    const home = compose({ orders: [order()] });
    expect(home.actions).toHaveLength(1);
    expect(home.actions[0]).toMatchObject({
      title: 'Paid — start the work',
      supporting: 'Chain rule',
      amount: { value: 153, currency: 'SAR' },
      cta: 'Start the work',
      link: { path: ['/orders', 'o1'] }
    });
  });

  it('asks for a revision, and flags a delivery that is late', () => {
    expect(compose({ orders: [order({ status: 3, paymentStatus: 1 })] }).actions[0]).toMatchObject({
      title: 'The student asked for a revision', cta: 'Deliver the revision', link: { path: ['/orders', 'o1'] }
    });
    expect(compose({ orders: [order({ status: 1, paymentStatus: 1, isOverdue: true })] }).actions[0]).toMatchObject({
      title: 'Delivery is overdue', cta: 'Deliver the work'
    });
  });

  it('puts a new direct request in the list, and says so differently once the student has answered', () => {
    expect(compose({ requests: [request()] }).actions[0]).toMatchObject({
      title: 'New request from Sara',
      supporting: 'Chain rule · Recorded explanation',
      cta: 'Review the request',
      link: { path: ['/requests', 'r1'] }
    });
    const answered = compose({ requests: [request({ clarifications: [
      { id: 'c1', senderId: TEACHER, message: 'Which chapter?' },
      { id: 'c2', senderId: 'student-9', message: 'Chapter three.' }
    ] })] });
    expect(answered.actions[0]).toMatchObject({ title: 'The student answered your question' });
    // The teacher's own last word is still the teacher waiting on the student, not a new task.
    const waiting = compose({ requests: [request({ clarifications: [{ id: 'c1', senderId: TEACHER, message: 'Which chapter?' }] })] });
    expect(waiting.actions[0].title).toBe('New request from Sara');
  });

  it('leaves work that is waiting on the student or on nobody off the home', () => {
    const home = compose({
      orders: [
        order({ id: 'o2', status: 0, paymentStatus: 0 }),              // not paid yet
        order({ id: 'o3', status: 1, paymentStatus: 1, isOverdue: false }), // in progress, on time
        order({ id: 'o4', status: 2, paymentStatus: 1 }),              // delivered, the student's move
        order({ id: 'o5', status: 4, paymentStatus: 1 }),              // completed
        order({ id: 'o6', status: 5, paymentStatus: 3 })               // cancelled
      ],
      requests: [request({ id: 'r2', status: 1 })],                    // clarification: the student's move
      sessions: [session({ id: 's2', status: 6 }), session({ id: 's3', status: 7 }), session({ id: 's4', status: 2 })]
    });
    expect(home.actions).toEqual([]);
  });

  it('asks about a session that is on now, one that ended, and an absence report', () => {
    const live = compose({ sessions: [session({ startsAt: iso(-5), endsAt: iso(55) })] });
    expect(live.actions[0]).toMatchObject({ title: 'Your session is on now', cta: 'Join the session' });
    expect(live.upcoming).toBeNull();

    const ended = compose({ sessions: [session({ startsAt: iso(-120), endsAt: iso(-60) })] });
    expect(ended.actions[0]).toMatchObject({
      title: 'The session ended — confirm what happened', cta: 'Confirm the session ended', link: { path: ['/live-sessions', 's1'] }
    });

    expect(compose({ sessions: [session({ status: 8, outcomeReviewDeadline: iso(600) })] }).actions[0]).toMatchObject({
      title: 'The student reported you absent', supporting: 'By @2026-09-16T22:00:00.000Z', cta: 'Review the report'
    });
  });

  it('asks the teacher to answer a time the student proposed, but not one they proposed themselves', () => {
    expect(compose({ sessions: [session({ proposedStartsAt: iso(1440), rescheduleRequestedById: 'student-9' })] }).actions[0])
      .toMatchObject({ title: 'The student proposed a new time', cta: 'Review the proposed time' });
    const mine = compose({ sessions: [session({ proposedStartsAt: iso(1440), rescheduleRequestedById: TEACHER })] });
    expect(mine.actions).toEqual([]);
  });

  it('orders the list by what is most urgent, caps it at three, and counts the rest', () => {
    const home = compose({
      sessions: [session({ id: 's1', startsAt: iso(-5), endsAt: iso(55) }), session({ id: 's5', status: 8 })],
      orders: [order({ id: 'o7', status: 3, paymentStatus: 1 }), order({ id: 'o8' })],
      requests: [request({ id: 'r3' })]
    });
    expect(home.actions.map(card => card.title)).toEqual([
      'Your session is on now',                       // T1
      'The student reported you absent',              // T2
      'The student asked for a revision'              // T4
    ]);
    expect(home.actions).toHaveLength(MAX_CARDS);
    expect(home.moreActions).toBe(2);
  });

  it('answers requests in the order students asked, oldest first', () => {
    const home = compose({ requests: [
      request({ id: 'new', createdAt: iso(-10), studentDisplayNameEnglish: 'Nada' }),
      request({ id: 'old', createdAt: iso(-600), studentDisplayNameEnglish: 'Sara' })
    ] });
    expect(home.actions.map(card => card.title)).toEqual(['New request from Sara', 'New request from Nada']);
  });

  it('previews the three soonest open requests it has not offered on, and links each to its own screen', () => {
    const home = compose({
      opportunities: [
        opportunity({ id: 'p-late', deadline: iso(10_000) }),
        opportunity({ id: 'p-mine', deadline: iso(60), myOffer: { id: 'offer-1' } }),
        opportunity({ id: 'p-soon', deadline: iso(120) }),
        opportunity({ id: 'p-mid', deadline: iso(500) }),
        opportunity({ id: 'p-open', deadline: iso(900), budgetMin: null, budgetMax: null })
      ],
      opportunityCount: 12
    });
    expect(home.opportunities.map(o => o.key)).toEqual(['p-soon', 'p-mid', 'p-open']);
    expect(home.opportunities).toHaveLength(MAX_OPPORTUNITIES);
    expect(home.opportunities[0]).toMatchObject({
      title: 'Limits worksheet',
      supporting: 'Recorded explanation · Calculus',
      deadline: `Due @${iso(120)}`,
      budget: { min: 90, max: 200, currency: 'SAR' },
      flexibleBudget: false,
      cta: 'View request',
      link: { path: ['/teacher/opportunities', 'p-soon'] }
    });
    expect(home.opportunityCount).toBe(12);
    // An open budget is said in words, never as a missing number.
    const flexible = compose({ opportunities: [opportunity({ budgetMin: null, budgetMax: null })] });
    expect(flexible.opportunities[0]).toMatchObject({ budget: null, flexibleBudget: true });
  });

  it('picks the nearest session that has not started yet', () => {
    const home = compose({ sessions: [
      session({ id: 's-late', startsAt: iso(600), endsAt: iso(660) }),
      session({ id: 's-next', startsAt: iso(120), endsAt: iso(180) })
    ] });
    expect(home.upcoming).toMatchObject({
      title: 'Integrals', cta: 'Session details', link: { path: ['/live-sessions', 's-next'] }
    });
    expect(home.upcoming?.status?.labelKey).toBe('session_status_confirmed');
    expect(home.upcoming?.supporting).toContain('Sara');
  });

  it('reads money through FIN-01’s model rather than counting it again', () => {
    const home = compose({ balances: [balance({ available: 200, pendingClearance: 127.5, nextClearanceAt: iso(10_080) })] });
    expect(home.earnings.empty).toBe(false);
    expect(home.earnings.view).toMatchObject({
      currency: 'SAR', available: 200, clearing: 127.5, hasClearing: true,
      nextClearance: { kind: 'date', at: new Date(Date.parse(iso(10_080))).toISOString() }
    });
    // A date the maturity scan has not caught up with is "soon", never a date in the past.
    const passed = compose({ balances: [balance({ pendingClearance: 50, nextClearanceAt: iso(-60) })] });
    expect(passed.earnings.view?.nextClearance).toEqual({ kind: 'soon' });
  });

  it('says a teacher who has earned nothing has earned nothing, rather than showing zeros', () => {
    expect(compose({ balances: [balance()] }).earnings).toMatchObject({ empty: true });
    expect(compose({ balances: [] }).earnings).toMatchObject({ empty: true, view: null });
    // Money on its way out is FIN-01's to explain; the home does not mention it.
    const transferring = compose({ balances: [balance({ pendingWithdrawal: 300 })] });
    expect(transferring.earnings.empty).toBe(false);
    expect(transferring.earnings.view?.showTransferring).toBe(true);
  });

  it('reads in Arabic, and shows no id, raw field or internal money word anywhere', () => {
    const home = compose({
      requests: [request({ id: GUID })],
      orders: [order({ id: 'o9', status: 3, paymentStatus: 1 })],
      sessions: [session({ id: 's9', startsAt: iso(120), endsAt: iso(180) })],
      opportunities: [opportunity()],
      balances: [balance({ available: 100, pendingClearance: 20 })]
    }, 'ar');
    expect(home.actions[0]).toMatchObject({ title: 'الطالب طلب تعديلًا', cta: 'سلّم التعديل' });
    expect(home.actions[1]).toMatchObject({ title: 'طلب جديد من سارة', cta: 'راجع الطلب' });
    expect(home.opportunities[0].supporting).toBe('شرح مسجل · التفاضل');
    expect(home.upcoming?.cta).toBe('تفاصيل الجلسة');

    const shown = [...home.actions, home.upcoming!].flatMap(card => [card.title, card.supporting, card.cta])
      .concat(home.opportunities.flatMap(o => [o.title, o.supporting, o.deadline, o.cta])).join(' | ');
    expect(shown).not.toContain(GUID);
    expect(shown).not.toMatch(/\bnull\b|\bundefined\b|\bNaN\b/);
    expect(shown).not.toMatch(/ledger|escrow|maturity|pendingClearance|paymentStatus|teacherNet|status/i);
  });
});
