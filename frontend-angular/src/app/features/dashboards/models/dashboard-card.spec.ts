import { describe, expect, it } from 'vitest';
import ar from '../../../../../public/locale/ar.json';
import en from '../../../../../public/locale/en.json';
import { CardContext, CardFormat, DashboardCardView, presentCard } from './dashboard-card';

const NOW = Date.parse('2026-09-15T12:00:00Z');

function formatter(lang: 'ar' | 'en'): CardFormat {
  const table = (lang === 'ar' ? ar : en) as Record<string, string>;
  const t = (key: string, fallback: string) => table[key] ?? fallback;
  return {
    lang,
    t,
    format: (key, values, fallback) =>
      Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), t(key, fallback)),
    money: (value, currency) => `${value} ${typeof currency === 'string' ? currency : 'SAR'}`,
    date: value => (value ? `@${value}` : ''),
    relative: value => (value ? `~${value}` : '')
  };
}

const context = (lang: 'ar' | 'en', viewer: 'student' | 'teacher' = 'student'): CardContext =>
  ({ viewer, viewerId: viewer === 'student' ? 'student-1' : 'teacher-1', now: NOW, fmt: formatter(lang) });

const text = (card: DashboardCardView | null) =>
  card ? [card.title, card.secondary, card.body, card.action, ...card.badges.map(b => b.text),
    ...card.fields.flatMap(f => [f.label, f.value])].join(' | ') : '';

const GUID = '8f14e45f-ceea-467a-9575-3b1f3f0f5a21';

const request = { _source: '/learning-requests/mine?pageSize=50', id: GUID, studentId: 'student-1', title: 'Related rates',
  status: 1, sourcingMode: 0, teacherDisplayName: 'نورة', teacherDisplayNameEnglish: 'Noura', budget: null,
  serviceNameArabic: 'شرح مسجّل', serviceNameEnglish: 'Recorded explanation', createdAt: '2026-09-15T10:00:00Z', version: 'AAAA' };
const order = { _source: '/orders/mine?pageSize=50', id: GUID, requestTitle: 'Integrals', status: 0, paymentStatus: 0,
  studentTotal: 162, currency: 'SAR', teacherNet: null, teacherDisplayName: 'نورة', teacherDisplayNameEnglish: 'Noura',
  studentDisplayName: 'سارة', createdAt: '2026-09-15T10:00:00Z', updatedAt: '2026-09-15T11:00:00Z' };
const session = { _source: '/live-sessions/mine?pageSize=50', id: GUID, studentId: 'student-1', teacherId: 'teacher-1',
  title: 'Related rates with A', status: 6, startsAt: '2026-09-15T09:00:00Z', endsAt: '2026-09-15T10:00:00Z',
  studentDisplayName: 'سارة', teacherDisplayName: 'نورة', totalPrice: 150, currency: 'SAR' };

describe('UX-04 dashboard cards', () => {
  it('shows a request as product words in Arabic and English, with the student’s next step', () => {
    const arCard = presentCard(request, context('ar'))!;
    expect(arCard.badges).toEqual([{ text: 'المعلم لديه سؤال', tone: 'warning' }]);
    expect(arCard.action).toBe('أجب المعلم');
    expect(arCard.secondary).toBe('نورة · شرح مسجّل');
    expect(arCard.fields.map(f => f.label)).toEqual(['أُرسل', 'الميزانية']);
    expect(arCard.fields[1].value).toBe('ميزانية مرنة');
    const enCard = presentCard(request, context('en'))!;
    expect(enCard.badges[0].text).toBe('Teacher asked a question');
    expect(enCard.action).toBe('Answer the teacher');
    expect(enCard.secondary).toBe('Noura · Recorded explanation');
  });

  it('reads the same order differently to its student and its teacher', () => {
    const student = presentCard(order, context('en', 'student'))!;
    expect(student.badges[0]).toEqual({ text: 'Payment required', tone: 'warning' });
    expect(student.action).toBe('Pay now');
    expect(student.fields).toEqual([{ label: 'Amount', value: '162 SAR' }]);
    const teacher = presentCard({ ...order, _source: '/orders/assigned', paymentStatus: 1, teacherNet: 127.5 }, context('ar', 'teacher'))!;
    expect(teacher.badges[0]).toEqual({ text: 'تم الدفع — ابدأ العمل', tone: 'warning' });
    expect(teacher.action).toBe('ابدأ العمل');
    expect(teacher.secondary).toContain('سارة');
    expect(teacher.fields).toEqual([{ label: 'صافي ربحك', value: '127.5 SAR' }]);
    const late = presentCard({ ...order, _source: '/orders/assigned', status: 1, paymentStatus: 1, isOverdue: true }, context('en', 'teacher'))!;
    expect(late.badges.map(b => b.text)).toEqual(['In progress', 'Late']);
  });

  it('keeps a live session’s own title and names the pending outcome for each side', () => {
    const student = presentCard(session, context('ar', 'student'))!;
    expect(student.title).toBe('Related rates with A');
    expect(student.badges[0]).toEqual({ text: 'بانتظار تأكيدك', tone: 'warning' });
    expect(student.action).toBe('أكّد انتهاء الجلسة');
    expect(student.fields.map(f => f.label)).toEqual(['الموعد', 'المدة']);
    expect(student.fields[1].value).toBe('60 دقيقة');
    const teacher = presentCard(session, context('en', 'teacher'))!;
    expect(teacher.badges[0]).toEqual({ text: 'Waiting for the student to confirm', tone: 'info' });
    expect(teacher.action).toBe('Open');
  });

  it('marks a teacher’s opportunity once they have sent an offer, and names its budget', () => {
    const row = { _source: '/open-marketplace/opportunities?pageSize=50', id: GUID, title: 'Limits', status: 5,
      deadline: '2026-09-20T00:00:00Z', budgetMin: 100, budgetMax: 200, currency: 'SAR', subjectName: 'Calculus',
      subjectNameArabic: 'التفاضل', serviceName: 'Recorded explanation', serviceNameArabic: 'شرح مسجّل', myOffer: null };
    const open = presentCard(row, context('ar', 'teacher'))!;
    expect(open.secondary).toBe('شرح مسجّل · التفاضل');
    expect(open.action).toBe('أرسل عرضًا');
    expect(open.fields[1]).toEqual({ label: 'الميزانية', value: '100 SAR – 200 SAR' });
    const sent = presentCard({ ...row, myOffer: { id: 'x', status: 0 } }, context('en', 'teacher'))!;
    expect(sent.badges.map(b => b.text)).toEqual(['Receiving offers', 'You sent an offer']);
    expect(sent.action).toBe('Open');
  });

  it('names notifications by type, and never shows the English server title in Arabic', () => {
    const known = { _source: '/notifications?pageSize=100', id: GUID, type: 'OfferReservationReminder',
      title: 'Complete payment to keep your Offer', body: 'Your selected Offer reservation expires in about 20 minutes.',
      link: `/requests/${GUID}`, createdAt: '2026-09-15T11:40:00Z', readAt: null };
    const arKnown = presentCard(known, context('ar'))!;
    expect(arKnown.title).toBe('أكمل الدفع قبل انتهاء حجز العرض');
    expect(arKnown.body).toBe('');
    expect(text(arKnown)).not.toMatch(/[A-Za-z]{3,}/);
    const enKnown = presentCard(known, context('en'))!;
    expect(enKnown.title).toBe('Complete payment before the offer hold ends');
    expect(enKnown.body).toBe(known.body);

    const unknown = { ...known, type: 'SomethingNew', title: 'Order update' };
    expect(presentCard(unknown, context('ar'))!.title).toBe('لديك تحديث جديد');
    expect(presentCard(unknown, context('en'))!.title).toBe('Order update');
    expect(presentCard({ ...unknown, title: '' }, context('en'))!.title).toBe('You have a new update');
    expect(text(presentCard(unknown, context('ar')))).not.toContain('SomethingNew');
  });

  it('presents disputes, withdrawals, payout details, qualifications and teacher money in product words', () => {
    const dispute = presentCard({ _source: '/disputes/mine', id: GUID, orderId: GUID, status: 1, createdAt: '2026-09-15T10:00:00Z' }, context('ar'))!;
    expect(dispute.title).toBe('اعتراض على طلب عمل');
    expect(dispute.badges[0]).toEqual({ text: 'قيد المراجعة لدى تفصيل', tone: 'info' });
    const withdrawal = presentCard({ _source: '/withdrawals/mine?page=1', id: GUID, amount: 200, currency: 'SAR', status: 2,
      rejectionReason: 'Name mismatch', createdAt: '2026-09-15T10:00:00Z' }, context('en', 'teacher'))!;
    expect(withdrawal.title).toBe('200 SAR');
    expect(withdrawal.badges[0]).toEqual({ text: 'Rejected — returned to your balance', tone: 'danger' });
    const payout = presentCard({ _source: '/withdrawals/profile', teacherId: 'teacher-1', status: 0, destinationLabel: '•••• 4821' }, context('ar', 'teacher'))!;
    expect(payout.badges[0].text).toBe('قيد المراجعة');
    expect(payout.secondary).toBe('•••• 4821');
    const qualification = presentCard({ _source: '/teachers/me/qualifications', subjectId: GUID, subjectName: 'Calculus', subjectNameAr: 'التفاضل', state: 0 }, context('ar', 'teacher'))!;
    expect(qualification.title).toBe('التفاضل');
    expect(qualification.badges[0]).toEqual({ text: 'مؤهل', tone: 'success' });
    const balance = presentCard({ _source: '/withdrawals/balances', currency: 'SAR', available: 50, pendingWithdrawal: 0, pendingClearance: 127.5, nextClearanceAt: '2026-09-22T10:00:00Z' }, context('ar', 'teacher'))!;
    expect(balance.fields.map(f => f.label)).toEqual(['متاح للسحب', 'قيد الإتاحة', 'أقرب مبلغ يصبح متاحًا']);
    const summary = presentCard({ _source: '/teachers/me/business/home-summary', directRequests: 2, activeOrders: 1, activeSessions: 0, unreadMessages: 3 }, context('en', 'teacher'))!;
    expect(summary.fields).toEqual([
      { label: 'New requests', value: '2' }, { label: 'Orders in progress', value: '1' },
      { label: 'Upcoming live sessions', value: '0' }, { label: 'Unread messages', value: '3' }]);
  });

  it('never titles a card with an id or an email, and hides reference rows', () => {
    const bare = presentCard({ _source: '/something/new', id: GUID, email: 'someone@example.com', code: 'CODE_1', status: 3 }, context('ar'))!;
    expect(bare.title).toBe('بدون عنوان');
    expect(text(bare)).not.toContain(GUID);
    expect(text(bare)).not.toContain('someone@example.com');
    expect(presentCard({ ...request, title: '', serviceNameArabic: '', serviceNameEnglish: '' }, context('ar'))!.title).toBe('طلب بدون عنوان');
    expect(presentCard({ _source: '/languages', id: GUID, name: 'Arabic' }, context('en'))).toBeNull();
  });

  // Regression (UX-04 AC1): the generic dashboard printed `row.status` and raw field names.
  it('never renders a numeric status, a GUID, null or an entity-explorer label on any student or teacher card', () => {
    const sources: Record<string, unknown>[] = [request, order, session,
      { ...request, _source: '/learning-requests/assigned', status: 0, sourcingMode: 1, offerCount: 2 },
      { ...order, _source: '/orders/assigned', status: 3, paymentStatus: 1 },
      { _source: '/open-marketplace/opportunities', id: GUID, title: 'Limits', status: 6, myOffer: null },
      { _source: '/notifications', id: GUID, type: 'PaymentRequired', title: 'Payment required', body: 'x', createdAt: '2026-09-15T10:00:00Z' },
      { _source: '/conversations', id: GUID, scope: 2, unreadCount: 2, participants: [{ userId: 'teacher-1', displayName: 'نورة' }] },
      { _source: '/favorite-teachers', teacherId: GUID, fullName: 'نورة', headline: 'Calculus', rating: 4.8, ratingCount: 12, startingPrice: 120, currency: 'SAR' },
      { _source: '/disputes/eligible', type: 'Order', id: GUID, title: 'Integrals', titleArabic: 'التكامل', otherPartyName: 'نورة', amount: 162, currency: 'SAR', eligibleUntil: '2026-09-20T00:00:00Z' },
      { _source: '/disputes/mine', id: GUID, liveSessionBookingId: GUID, status: 0, createdAt: '2026-09-15T10:00:00Z' },
      { _source: '/withdrawals/balances', currency: 'SAR', available: 0, pendingWithdrawal: 0, pendingClearance: 0, nextClearanceAt: null },
      { _source: '/withdrawals/mine', id: GUID, amount: 60, currency: 'SAR', status: 0, createdAt: '2026-09-15T10:00:00Z' },
      { _source: '/withdrawals/policy', minimumAmount: 50, currency: 'SAR', expectedSettlementBusinessDays: 3 },
      { _source: '/teachers/me/business/analytics', offersSubmitted: 3, offersSelected: 1, ordersTotal: 2, ordersCompleted: 1, sessionsTotal: 0, sessionsCompleted: 0, netEarnings: 127.5, offerSelectionRate: 0.33, completionRate: 0.5, repeatStudents: 0 },
      { _source: '/teachers/me/qualifications', subjectId: GUID, subjectName: 'Calculus', state: 1 },
      { _source: '/teachers/me', teacherId: GUID, rating: null, ratingCount: 0 },
      { _source: '/notification-preferences', inAppEnabled: true, emailEnabled: false },
      { _source: '/students/me/learning-preferences', explanationStyle: 'visual', preferredTeachingLanguage: null, version: 'AAAA' },
      { _source: '/auth/sessions', id: GUID, createdAt: '2026-09-15T10:00:00Z', expiresAt: '2026-09-22T10:00:00Z', isCurrent: true }];
    for (const lang of ['ar', 'en'] as const) for (const viewer of ['student', 'teacher'] as const) {
      for (const row of sources) {
        const card = presentCard(row, context(lang, viewer));
        const shown = text(card);
        const where = `${String(row['_source'])} ${lang} ${viewer}`;
        for (const badge of card?.badges ?? []) expect(badge.text, where).not.toMatch(/^\s*-?\d+\s*$/);
        expect(shown, where).not.toContain(GUID);
        expect(shown, where).not.toMatch(/\bnull\b|\bundefined\b|\bNaN\b/);
        expect(shown, where).not.toMatch(/\b(Currency|Updated|Count|statusName|createdAt|totalCount|HTTP|404|409)\b/);
        expect(shown, where).not.toMatch(/العملة|آخر تحديث|العدد/);
        if (lang === 'ar') expect(card?.badges.every(b => /[؀-ۿ]/.test(b.text)) ?? true, where).toBe(true);
      }
    }
  });
});
