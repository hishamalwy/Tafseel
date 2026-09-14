import { describe, expect, it } from 'vitest';
import {
  conversationDestination, disputeDestination, homeDestination, liveSessionDestination, requestDestination,
  teacherReviewDestination
} from './destinations';

describe('server link destinations', () => {
  it('opens a live session in the list each role actually has', () => {
    expect(liveSessionDestination(['Student'], 's1')).toEqual({ path: '/student/sessions', query: { sessionId: 's1' } });
    expect(liveSessionDestination(['Teacher'], 's1')).toEqual({ path: '/teacher/work', query: { tab: 'sessions', sessionId: 's1' } });
    expect(liveSessionDestination(['Admin'], 's1')).toEqual({ path: '/admin/operations', query: { tab: 'sessions', sessionId: 's1' } });
    expect(liveSessionDestination(['QualityReviewer'], 's1')).toEqual({ path: '/quality/applications' });
  });

  it('opens a conversation in the reader’s messages and tolerates a link without an id', () => {
    expect(conversationDestination(['Student'], 'c1')).toEqual({ path: '/student/messages', query: { conversationId: 'c1' } });
    expect(conversationDestination(['Teacher'])).toEqual({ path: '/teacher/messages', query: {} });
    expect(conversationDestination([], 'c1')).toEqual({ path: '/' });
  });

  it('sends a request to the screen that owns its sourcing mode', () => {
    expect(requestDestination(['Student'], 'r1', 'direct')).toEqual({ path: '/student/requests', query: { tab: 'requests', requestId: 'r1' } });
    expect(requestDestination(['Student'], 'r1', 'open')).toEqual({ path: '/requests', query: { requestId: 'r1' } });
    expect(requestDestination(['Student'], 'r1', 'unknown', true)).toEqual({ path: '/requests', query: { requestId: 'r1' } });
    expect(requestDestination(['Teacher'], 'r1', 'direct')).toEqual({ path: '/teacher/work', query: { tab: 'requests', requestId: 'r1' } });
    expect(requestDestination(['Teacher'], 'r1', 'open')).toEqual({ path: '/teacher/opportunities', query: { requestId: 'r1' } });
    expect(requestDestination(['Teacher'], 'r1', 'unknown')).toEqual({ path: '/teacher/opportunities', query: { requestId: 'r1' } });
    expect(requestDestination(['Admin'], 'r1', 'unknown')).toEqual({ path: '/admin/operations', query: { tab: 'requests', requestId: 'r1' } });
  });

  it('keeps disputes and reviews on the screens that already read their ids', () => {
    expect(disputeDestination('d1')).toEqual({ path: '/disputes', query: { selectedId: 'd1' } });
    expect(teacherReviewDestination('v1')).toEqual({ path: '/teacher/qualifications', query: { tab: 'reviews', reviewId: 'v1' } });
  });

  it('never bakes a locale into a destination', () => {
    const all = [
      homeDestination(['Admin']), liveSessionDestination(['Student'], 'x'), conversationDestination(['Teacher'], 'x'),
      requestDestination(['Student'], 'x', 'open'), disputeDestination('x'), teacherReviewDestination('x')
    ];
    for (const destination of all) expect(destination.path).not.toMatch(/^\/(ar|en)(\/|$)/);
  });
});
