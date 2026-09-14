import { Role } from '@core/auth/models/role';

/**
 * Where the server's links land.
 *
 * Notifications and emails link to what they are about — an order, a live session, a
 * conversation, a request — without knowing who will open the link or which screen that
 * person uses. These rules turn a link into the screen for the signed-in role, and they carry
 * the id along so the destination can show the item the link was about.
 *
 * A destination is a path plus query parameters, never a full URL: the router applies the
 * locale base (`/ar/` or `/en/`) the reader is already in.
 */
export interface Destination {
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
}

export type RequestSourcing = 'direct' | 'open' | 'unknown';

const has = (roles: readonly Role[], role: Role) => roles.includes(role);

/** The workspace a signed-in user lands on when a link has no screen for their role. */
export function homeDestination(roles: readonly Role[]): Destination {
  if (has(roles, 'Admin')) return { path: '/admin/home' };
  if (has(roles, 'QualityReviewer')) return { path: '/quality/applications' };
  if (has(roles, 'Teacher')) return { path: '/teacher/home' };
  if (has(roles, 'Student')) return { path: '/student/overview' };
  return { path: '/' };
}

/** A live session. There is no single-session screen yet, so each party's sessions list opens on it. */
export function liveSessionDestination(roles: readonly Role[], sessionId: string): Destination {
  if (has(roles, 'Student')) return { path: '/student/sessions', query: { sessionId } };
  if (has(roles, 'Teacher')) return { path: '/teacher/work', query: { tab: 'sessions', sessionId } };
  if (has(roles, 'Admin')) return { path: '/admin/operations', query: { tab: 'sessions', sessionId } };
  return homeDestination(roles);
}

/** A conversation. Messaging opens on it; the thread view itself arrives with the messaging screen. */
export function conversationDestination(roles: readonly Role[], conversationId?: string): Destination {
  const query: Record<string, string> = conversationId ? { conversationId } : {};
  if (has(roles, 'Student')) return { path: '/student/messages', query };
  if (has(roles, 'Teacher')) return { path: '/teacher/messages', query };
  return homeDestination(roles);
}

/**
 * A learning request. A student's open request (and its offers) lives on the marketplace
 * page; a direct request lives in the student's requests. A teacher sees an open request as
 * an opportunity and a direct one as incoming work.
 */
export function requestDestination(
  roles: readonly Role[], requestId: string, sourcing: RequestSourcing, offers = false
): Destination {
  if (has(roles, 'Student')) {
    return offers || sourcing === 'open'
      ? { path: '/requests', query: { requestId } }
      : { path: '/student/requests', query: { tab: 'requests', requestId } };
  }
  if (has(roles, 'Teacher')) {
    return sourcing === 'direct'
      ? { path: '/teacher/work', query: { tab: 'requests', requestId } }
      : { path: '/teacher/opportunities', query: { requestId } };
  }
  if (has(roles, 'Admin')) return { path: '/admin/operations', query: { tab: 'requests', requestId } };
  return homeDestination(roles);
}

/** A dispute case. The dispute centre already opens a case from `selectedId`. */
export function disputeDestination(disputeId: string): Destination {
  return { path: '/disputes', query: { selectedId: disputeId } };
}

/** A review of a teacher, shown in that teacher's profile reviews. */
export function teacherReviewDestination(reviewId: string): Destination {
  return { path: '/teacher/qualifications', query: { tab: 'reviews', reviewId } };
}
