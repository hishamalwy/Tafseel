import { describe, expect, it } from 'vitest';
import { disputeDestination, homeDestination, teacherReviewDestination } from './destinations';

describe('server link destinations', () => {
  it('lands a signed-in reader on their own workspace', () => {
    expect(homeDestination(['Admin'])).toEqual({ path: '/admin/home' });
    expect(homeDestination(['QualityReviewer'])).toEqual({ path: '/quality/applications' });
    expect(homeDestination(['Teacher'])).toEqual({ path: '/teacher/home' });
    expect(homeDestination(['Student'])).toEqual({ path: '/student/overview' });
    expect(homeDestination([])).toEqual({ path: '/' });
  });

  it('keeps disputes and reviews on the screens that already read their ids', () => {
    expect(disputeDestination('d1')).toEqual({ path: '/disputes', query: { selectedId: 'd1' } });
    expect(teacherReviewDestination('v1')).toEqual({ path: '/teacher/qualifications', query: { tab: 'reviews', reviewId: 'v1' } });
  });

  it('never bakes a locale into a destination', () => {
    for (const destination of [homeDestination(['Admin']), disputeDestination('x'), teacherReviewDestination('x')])
      expect(destination.path).not.toMatch(/^\/(ar|en)(\/|$)/);
  });
});
