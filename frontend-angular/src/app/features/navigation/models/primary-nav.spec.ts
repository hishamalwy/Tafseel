import { describe, expect, it } from 'vitest';
import ar from '../../../../../public/locale/ar.json';
import en from '../../../../../public/locale/en.json';
import { DashboardRole } from '@features/dashboards/models/dashboard';
import { NAV_LIMITS, PRIMARY_NAV, TEACHER_SETUP, activeChild, activeKey } from './primary-nav';

const table = (lang: 'ar' | 'en') => (lang === 'ar' ? ar : en) as Record<string, string>;
const labels = (role: DashboardRole, lang: 'ar' | 'en') =>
  PRIMARY_NAV[role].map(item => table(lang)[item.labelKey] ?? item.fallback);
const paths = (role: DashboardRole) => PRIMARY_NAV[role].map(item => item.path);
const roles: readonly DashboardRole[] = ['Student', 'Teacher', 'QualityReviewer', 'Admin'];

describe('UX-03 primary navigation', () => {
  it('keeps every role within the limit Gate 2 set', () => {
    for (const role of roles)
      expect(PRIMARY_NAV[role].length, `${role} destinations`).toBeLessThanOrEqual(NAV_LIMITS[role]);
    expect(PRIMARY_NAV.Student).toHaveLength(5);
    expect(PRIMARY_NAV.Teacher).toHaveLength(6);
    expect(PRIMARY_NAV.QualityReviewer).toHaveLength(2);
    expect(PRIMARY_NAV.Admin).toHaveLength(6);
  });

  it('gives the student the five goals they actually have, in order', () => {
    expect(labels('Student', 'en')).toEqual([
      'Home', 'Find a teacher', 'Post a request', 'My requests & orders', 'Messages'
    ]);
    expect(labels('Student', 'ar')).toEqual([
      'الرئيسية', 'ابحث عن معلم', 'اطلب شرحاً', 'طلباتي', 'الرسائل'
    ]);
    expect(paths('Student')).toEqual(['/student/overview', '/teachers', '/requests/new', '/student/requests', '/messages']);
  });

  it('gives the teacher six, with the five setup pages grouped under one of them', () => {
    expect(labels('Teacher', 'en')).toEqual([
      'Home', 'Work', 'Open requests', 'Messages', 'Earnings', 'My teaching setup'
    ]);
    expect(labels('Teacher', 'ar')).toEqual([
      'الرئيسية', 'أعمالي', 'طلبات مفتوحة', 'الرسائل', 'أرباحي', 'إعداد ملفي'
    ]);
    expect(paths('Teacher')).toEqual([
      '/teacher/home', '/teacher/work', '/teacher/opportunities', '/messages', '/teacher/earnings', '/teacher/profile'
    ]);
    const setup = PRIMARY_NAV.Teacher.find(item => item.key === 'setup');
    expect(setup?.children?.map(c => c.path)).toEqual([
      '/teacher/profile', '/teacher/services', '/teacher/availability', '/teacher/qualifications', '/teacher/publication'
    ]);
    expect(setup?.children?.map(c => table('ar')[c.labelKey])).toEqual([
      'الملف الشخصي', 'خدماتي', 'مواعيدي', 'مؤهلاتي', 'ظهور ملفك للطلاب'
    ]);
  });

  it('gives quality two destinations and admin six areas', () => {
    expect(labels('QualityReviewer', 'en')).toEqual(['Applications', 'Account']);
    expect(labels('QualityReviewer', 'ar')).toEqual(['طلبات الانضمام', 'حسابي']);
    expect(labels('Admin', 'en')).toEqual(['Attention', 'People', 'Catalog & pricing', 'Operations', 'Finance', 'Audit']);
    expect(labels('Admin', 'ar')).toEqual(['يحتاج انتباهك', 'المستخدمون', 'الخدمات والأسعار', 'العمليات', 'المالية', 'سجل التدقيق']);
  });

  it('does not make a primary destination out of something that belongs elsewhere', () => {
    const student = paths('Student').join(' ');
    // Saved teachers is a filter on Find a teacher; payments, sessions, reviews, disputes,
    // notifications and settings each live where they belong.
    for (const gone of ['/student/saved', '/student/payments', '/student/sessions', '/student/reviews',
      '/student/notifications', '/student/settings'])
      expect(student).not.toContain(gone);
    const teacher = paths('Teacher').join(' ');
    for (const gone of ['/teacher/settings', '/teacher/notifications'])
      expect(teacher).not.toContain(gone);
    // The five setup pages are children, never primary destinations of their own.
    for (const nested of TEACHER_SETUP.slice(1))
      expect(paths('Teacher')).not.toContain(nested.path);
  });

  it('keeps the homes UX-01 and UX-02 built', () => {
    expect(PRIMARY_NAV.Student[0].path).toBe('/student/overview');
    expect(PRIMARY_NAV.Teacher[0].path).toBe('/teacher/home');
  });

  it('uses the canonical marketplace paths, never the retired inline page', () => {
    expect(paths('Student')).toContain('/requests/new');
    expect(paths('Teacher')).toContain('/teacher/opportunities');
    for (const role of roles)
      expect(paths(role)).not.toContain('/requests');
  });

  it('highlights the destination a contextual screen belongs to', () => {
    // Student: an item opened from anywhere still belongs to the list it came from.
    expect(activeKey('Student', '/student/overview')).toBe('home');
    expect(activeKey('Student', '/requests/8f14e45f-ceea-467a-9575-3b1f3f0f5a21')).toBe('my_requests');
    expect(activeKey('Student', '/orders/8f14e45f')).toBe('my_requests');
    expect(activeKey('Student', '/live-sessions/8f14e45f')).toBe('my_requests');
    expect(activeKey('Student', '/checkout?orderId=1')).toBe('my_requests');
    expect(activeKey('Student', '/disputes/8f14e45f')).toBe('my_requests');
    // …but posting a request is its own goal, not a prefix of the list.
    expect(activeKey('Student', '/requests/new')).toBe('post_request');
    expect(activeKey('Student', '/teachers')).toBe('find_teacher');
    expect(activeKey('Student', '/teachers/8f14e45f')).toBe('find_teacher');
    expect(activeKey('Student', '/teachers?saved=1')).toBe('find_teacher');
    expect(activeKey('Student', '/conversations/8f14e45f')).toBe('messages');
  });

  it('highlights Work for a teacher’s items and Open requests for an opportunity', () => {
    expect(activeKey('Teacher', '/teacher/work')).toBe('work');
    expect(activeKey('Teacher', '/orders/8f14e45f')).toBe('work');
    expect(activeKey('Teacher', '/live-sessions/8f14e45f')).toBe('work');
    expect(activeKey('Teacher', '/requests/8f14e45f')).toBe('work');
    expect(activeKey('Teacher', '/teacher/opportunities')).toBe('open_requests');
    expect(activeKey('Teacher', '/teacher/opportunities/8f14e45f')).toBe('open_requests');
    expect(activeKey('Teacher', '/teacher/earnings')).toBe('earnings');
  });

  it('keeps My teaching setup highlighted on every one of its pages', () => {
    for (const page of TEACHER_SETUP) {
      expect(activeKey('Teacher', page.path), page.path).toBe('setup');
      expect(activeChild('Teacher', page.path), page.path).toBe(page.key);
    }
    expect(activeChild('Teacher', '/teacher/qualifications?tab=videos')).toBe('qualifications');
    expect(activeChild('Teacher', '/teacher/home')).toBe('');
  });

  it('reads the locale prefix and trailing slash the client writes', () => {
    expect(activeKey('Student', '/ar/student/overview/')).toBe('home');
    expect(activeKey('Teacher', '/en/teacher/opportunities/8f14e45f/')).toBe('open_requests');
    expect(activeKey('Student', '/')).toBe('');
    expect(activeKey('Student', '/policies')).toBe('');
  });

  it('gives quality and admin their own grouping', () => {
    expect(activeKey('QualityReviewer', '/quality/applications/8f14e45f')).toBe('applications');
    expect(activeKey('QualityReviewer', '/quality/account')).toBe('account');
    expect(activeKey('Admin', '/admin/operations?tab=sessions')).toBe('operations');
    expect(activeKey('Admin', '/admin/home')).toBe('attention');
    expect(activeKey('Admin', '/admin/system')).toBe('audit');
  });

  it('carries a label in both languages for every destination and child', () => {
    for (const role of roles)
      for (const item of PRIMARY_NAV[role]) {
        expect(table('en')[item.labelKey], `${item.key} en`).toBeTruthy();
        expect(table('ar')[item.labelKey], `${item.key} ar`).toBeTruthy();
        // No English product word may leak into the Arabic navigation.
        expect(table('ar')[item.labelKey], `${item.key} ar`).not.toMatch(/[A-Za-z]{3,}/);
        for (const sub of item.children ?? []) {
          expect(table('en')[sub.labelKey], `${sub.key} en`).toBeTruthy();
          expect(table('ar')[sub.labelKey], `${sub.key} ar`).not.toMatch(/[A-Za-z]{3,}/);
        }
      }
  });
});
