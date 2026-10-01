import { describe, expect, it } from 'vitest';
import { CardFormat } from './dashboard-card';
import { presentAdminOperation } from './admin-operation-card';

const fmt: CardFormat = {
  lang: 'en', t: (_, fallback) => fallback, format: (_, __, fallback) => fallback,
  money: (value, currency) => `${value} ${currency}`, date: value => String(value),
  relative: value => String(value)
};

describe('admin operation cards', () => {
  it('gives requests the student, teacher, deadline and readable status', () => {
    const card = presentAdminOperation({
      _source: '/admin/operations/requests?page=2', title: 'Calculus help', status: 0,
      studentName: 'Mona', teacherName: 'Nour', scheduledAt: '2026-10-01', amount: 150, currency: 'SAR'
    }, fmt, Date.now());
    expect(card?.badges[0].text).toBe('Waiting for the teacher');
    expect(card?.secondary).toBe('Student: Mona · Teacher: Nour');
    expect(card?.fields).toContainEqual({ label: 'Deadline', value: '2026-10-01' });
    expect(card?.fields).toContainEqual({ label: 'Amount', value: '150 SAR' });
  });

  it('calls out an overdue order and a session needing Admin review', () => {
    const order = presentAdminOperation({
      _source: '/admin/operations/orders', status: 1, scheduledAt: '2026-01-01'
    }, fmt, Date.parse('2026-09-24'));
    expect(order?.badges.map(b => b.text)).toEqual(['In progress', 'Late']);
    const session = presentAdminOperation({
      _source: '/admin/operations/sessions', status: 1, passiveReviewRequired: true,
      scheduledAt: '2026-10-02'
    }, fmt, Date.parse('2026-09-24'));
    expect(session?.badges.map(b => b.text)).toEqual(['Confirmed', 'Needs Admin review']);
    expect(session?.fields).toContainEqual({ label: 'Scheduled', value: '2026-10-02' });
  });

  it('does not change cards outside the three operation queues', () => {
    expect(presentAdminOperation({ _source: '/admin/users', status: 0 }, fmt, Date.now())).toBeNull();
  });
});
