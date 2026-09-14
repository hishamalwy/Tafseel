import { describe, expect, it } from 'vitest';
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

  it('clamps an unreadable video duration into the assignment range', () => {
    expect(Assignment.fallbackSeconds({ min: 30, max: 120, expected: 600 })).toBe(120);
    expect(Assignment.withinRange(90, { min: 30, max: 120, expected: 60 })).toBe(true);
  });
});
