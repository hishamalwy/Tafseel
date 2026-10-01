import { describe, expect, it } from 'vitest';
import { Catalog, LanguageForm, QualificationForm, ServiceForm, SubjectForm } from './catalog';

const recorded = Catalog.service({
  id: 's1', name: 'Custom recorded explanation', nameEn: 'Custom recorded explanation', nameAr: 'شرح مسجّل مخصص',
  descriptionEn: 'A recorded video.', descriptionAr: 'فيديو مسجل.', isActive: true, code: 'recorded_explanation',
  categoryCode: 'recorded_explanation', iconCode: 'video', orderType: 'async_request', qualificationPolicy: 'subject_qualification_required',
  currencyCode: 'SAR', displayOrder: 10, isPublic: true, teacherSelectable: true, allowedDurations: [],
  minPrice: 50, maxPrice: 800, defaultPrice: 120, recommendedPrice: 120,
  minimumDeliveryHours: 12, defaultDeliveryHours: 48, recommendedDeliveryHours: 48, maximumDeliveryHours: 336,
  defaultRevisions: 2, maximumRevisions: 5, enabledTeacherCount: 3
});

describe('Admin catalog — service price policy (PROD-01)', () => {
  it('reads the policy an Admin edits and keeps the codes it does not show', () => {
    expect(recorded).toMatchObject({ isLive: false, minPrice: 50, maxPrice: 800, teacherCount: 3 });
    expect(recorded.carry).toMatchObject({ code: 'recorded_explanation', orderType: 'async_request', iconCode: 'video' });
  });

  it('refuses a suggested price outside the range and a maximum below the minimum', () => {
    const draft = { ...ServiceForm.from(recorded), minPrice: 100, maxPrice: 90, defaultPrice: 500 };
    const problems = ServiceForm.problems(draft);
    expect(problems.maxPrice).toBe('admin_problem_max_below_min');
    expect(problems.defaultPrice).toBe('admin_problem_default_in_range');
    expect(ServiceForm.problems(ServiceForm.from(recorded))).toEqual({});
  });

  it('asks a live service for session lengths, not delivery hours', () => {
    const live = { ...ServiceForm.empty(true), nameEn: 'Live', nameAr: 'مباشر', descriptionEn: 'x', descriptionAr: 'س', durations: [] };
    expect(Object.keys(ServiceForm.problems(live))).toEqual(['durations']);
  });

  it('sends the whole contract back, keeping the recommended price while it still fits', () => {
    const body = ServiceForm.payload({ ...ServiceForm.from(recorded), maxPrice: 700 }, recorded, true, 10);
    expect(body).toMatchObject({ code: 'recorded_explanation', orderType: 'async_request', maximumPrice: 700, recommendedPrice: 120, isActive: true });
    const moved = ServiceForm.payload({ ...ServiceForm.from(recorded), minPrice: 200, defaultPrice: 250 }, recorded, true, 10);
    expect(moved['recommendedPrice']).toBe(250);
  });
});

describe('Admin catalog — subjects and qualification topics (OPS-04)', () => {
  it('always sends the icon when a subject is renamed, because the update contract blanks a missing one', () => {
    expect(SubjectForm.update({ nameEn: 'History', nameAr: 'التاريخ', icon: '🏛️' }, 40))
      .toEqual({ name: 'History', nameAr: 'التاريخ', detail: '🏛️', displayOrder: 40 });
  });

  it('treats a subject as open to applicants only with an active qualification topic', () => {
    const topics = [
      Catalog.qualificationTopic({ id: 'q1', parentId: 'math', isActive: true }),
      Catalog.qualificationTopic({ id: 'q2', parentId: 'history', isActive: false })
    ];
    const open = Catalog.openSubjectIds(topics);
    expect(open.has('math')).toBe(true);
    expect(open.has('history')).toBe(false);
  });

  it('checks the demo length range when a qualification topic is created', () => {
    const draft = { ...QualificationForm.empty('math'), titleEn: 'T', titleAr: 'ع', instructionsEn: 'I', instructionsAr: 'ت', minSeconds: 200, expectedSeconds: 100, maxSeconds: 180 };
    expect(QualificationForm.problems(draft, false)).toMatchObject({ minSeconds: 'admin_problem_seconds', expectedSeconds: 'admin_problem_default_in_range' });
    expect(QualificationForm.update(draft)).toEqual({ name: 'T', nameAr: 'ع', detail: 'I', instructionsAr: 'ت', maxVideoSeconds: 180 });
  });

  it('accepts a two- or three-letter language code only', () => {
    expect(LanguageForm.problems({ name: 'French', code: 'fr' })).toEqual({});
    expect(LanguageForm.problems({ name: 'French', code: 'french' }).code).toBe('admin_problem_language_code');
  });
});
