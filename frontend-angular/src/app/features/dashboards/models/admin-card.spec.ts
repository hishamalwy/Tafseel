import { describe, expect, it } from 'vitest';
import { actionWords, auditSummary, presentAdminCard } from './admin-card';
import { CardFormat } from './dashboard-card';

const fmt = (lang: 'ar' | 'en' = 'en'): CardFormat => ({
  lang,
  t: (_key, fallback) => fallback,
  format: (_key, values, fallback) => Object.entries(values).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), fallback),
  money: (value, currency) => `${value} ${currency ?? 'SAR'}`,
  date: value => String(value),
  relative: value => String(value)
});

describe('Admin cards show what the Admin decides on, never ids', () => {
  it('names the teacher, the score and the comment of a review', () => {
    const card = presentAdminCard({ _source: '/admin/reviews?page=1', id: 'r1', teacherDisplayName: 'نورة', teacherDisplayNameEnglish: 'Nora',
      serviceName: 'Recorded', overallScore: 4.6, recommends: true, commentExcerpt: 'Clear', createdAt: 'd', isVisible: false }, fmt())!;
    expect(card.title).toBe('Nora');
    expect(card.badges[0]).toMatchObject({ text: 'Hidden', tone: 'neutral' });
    expect(card.body).toBe('Clear');
    expect(JSON.stringify(card)).not.toContain('r1');
  });

  it('says what an audit entry did and who did it', () => {
    const card = presentAdminCard({ _source: '/admin/audit', id: 'a1', actorId: 'u1', actorName: 'مشرف', actorNameEnglish: 'Admin One',
      action: 'CatalogItemCreated', entityType: 'Subject', summary: 'Catalog item created.', createdAt: 'd' }, fmt())!;
    expect(card).toMatchObject({ title: 'Catalog item created', secondary: 'Admin One', body: 'Catalog item created.' });
    expect(presentAdminCard({ _source: '/admin/audit', action: 'NewThing', actorId: 'worker' }, fmt('ar'))!.title).toBe('Recorded action');
  });

  it('keeps internal codes out of the audit sentence (UX-85)', () => {
    expect(auditSummary('Decision: RequestChanges.')).toBe('Decision: changes requested.');
    expect(auditSummary('Held-escrow dispute opened.')).toBe('Dispute opened on a paid purchase.');
    expect(auditSummary('Catalog item created.')).toBe('Catalog item created.');
  });

  it('turns the reconciliation report into a verdict and the amounts behind it', () => {
    const card = presentAdminCard({ _source: '/admin/finance/reconciliation', isBalanced: true, totalPayments: 672, anomalies: [] }, fmt())!;
    expect(card.badges[0]).toMatchObject({ text: 'Balanced', tone: 'success' });
    expect(card.fields[0]).toEqual({ label: 'Payments received', value: '672 SAR' });
  });

  it('opens a dispute on its case screen', () => {
    const card = presentAdminCard({ _source: '/admin/disputes', id: 'd1', status: 0, reason: 'Late', createdAt: 'd', orderId: 'o1' }, fmt())!;
    expect(card).toMatchObject({ title: 'Order dispute', secondary: 'Late', action: 'Open the case' });
  });

  it('leaves the rows it does not know to the other presenters', () => {
    expect(presentAdminCard({ _source: '/admin/users' }, fmt())).toBeNull();
    expect(actionWords('RoleAssigned')).toBe('Role assigned');
  });
});
