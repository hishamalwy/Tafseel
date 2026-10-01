import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { TEACH_GATEWAY } from '../services/teach.ports';
import { LoadTeachWorkspace } from '../services/teach.use-cases';
import { Application, APPLICATION_STATUS } from './application';
import { Assignment } from './assignment';

describe('teacher qualification rules', () => {
  it('does not offer approved or in-flight subjects twice', () => {
    const subjects = [{ id: 'math', name: 'Math', nameArabic: 'رياضيات' }, { id: 'science', name: 'Science', nameArabic: 'علوم' }];
    const applications = [{ id: 'a', subjectId: 'math', status: APPLICATION_STATUS.SUBMITTED }] as any;
    const result = Application.selectableSubjects(subjects, applications, null, []);
    expect(result[0]).toMatchObject({ disabled: true, reason: 'apply_subject_application_active' });
    expect(result[1]).toMatchObject({ disabled: false });
  });

  it('does not offer a subject with no qualification topic, and says why', () => {
    const subjects = [{ id: 'math', name: 'Math', nameArabic: 'رياضيات' }, { id: 'history', name: 'History', nameArabic: 'تاريخ' }];
    const result = Application.selectableSubjects(subjects, [], null, [], new Set(['math']));
    expect(result[0]).toMatchObject({ disabled: false });
    expect(result[1]).toMatchObject({ disabled: true, reason: 'apply_subject_not_open' });
    expect(Application.selectableSubjects(subjects, [], null, [], null).every(s => !s.disabled)).toBe(true);
  });

  it('clamps an unreadable video duration into the assignment range', () => {
    expect(Assignment.fallbackSeconds({ min: 30, max: 120, expected: 600 })).toBe(120);
    expect(Assignment.withinRange(90, { min: 30, max: 120, expected: 60 })).toBe(true);
  });

  it('opens the in-flight application of the subject the teacher was sent for, not a blank form', async () => {
    const applications = [
      { id: 'physics-app', subjectId: 'physics', status: APPLICATION_STATUS.APPROVED },
      { id: 'biology-app', subjectId: 'biology', status: APPLICATION_STATUS.CHANGES_REQUESTED }
    ] as any;
    TestBed.configureTestingModule({ providers: [{ provide: TEACH_GATEWAY, useValue: {
      subjects: () => of([{ id: 'physics' }, { id: 'biology' }, { id: 'chemistry' }]), languages: () => of([]),
      profile: () => of(null), applications: () => of(applications), lifecycle: () => of(null),
      qualifications: () => of([]), openSubjectIds: () => of(null)
    } }] });
    const load = TestBed.inject(LoadTeachWorkspace);
    const sent = await load.execute({ additional: true, preferredSubjectId: 'biology' });
    expect(sent.current?.id).toBe('biology-app');
    // Without a subject in flight, "apply for another subject" still opens a blank form.
    expect((await load.execute({ additional: true, preferredSubjectId: 'chemistry' })).current).toBeNull();
  });
});
