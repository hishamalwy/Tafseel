import { describe, expect, it } from 'vitest';
import { disputeDestination, homeDestination, marketplaceDestination, teacherReviewDestination } from './destinations';

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

  it('sends the retired /requests page to one canonical screen per role (UX-05)', () => {
    const id = '8f14e45f-ceea-467a-9575-3b1f3f0f5a21';
    expect(marketplaceDestination(['Student'], null)).toEqual({ path: '/requests/new' });
    expect(marketplaceDestination(['Teacher'], null)).toEqual({ path: '/teacher/opportunities' });
    expect(marketplaceDestination(['Student'], id)).toEqual({ path: `/requests/${id}` });
    expect(marketplaceDestination(['Teacher'], id)).toEqual({ path: `/teacher/opportunities/${id}` });
    expect(marketplaceDestination(['Student', 'Teacher'], null)).toEqual({ path: '/requests/new' });
    expect(marketplaceDestination(['Admin'], id)).toEqual({ path: '/admin/home' });
    expect(marketplaceDestination(['QualityReviewer'], null)).toEqual({ path: '/quality/applications' });
  });

  it('ignores a requestId that is not a request id instead of following it', () => {
    for (const bad of ['', '../admin', 'r1', '8f14e45f-ceea-467a-9575-3b1f3f0f5a21/offers', 'javascript:alert(1)'])
      expect(marketplaceDestination(['Student'], bad)).toEqual({ path: '/requests/new' });
    expect(marketplaceDestination(['Teacher'], '%2F%2Fevil')).toEqual({ path: '/teacher/opportunities' });
  });

  it('never bakes a locale into a destination', () => {
    for (const destination of [homeDestination(['Admin']), disputeDestination('x'), teacherReviewDestination('x')])
      expect(destination.path).not.toMatch(/^\/(ar|en)(\/|$)/);
  });
});
