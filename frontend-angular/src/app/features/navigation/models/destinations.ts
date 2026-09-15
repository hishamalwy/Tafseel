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

const has = (roles: readonly Role[], role: Role) => roles.includes(role);

/** The workspace a signed-in user lands on when a link has no screen for their role. */
export function homeDestination(roles: readonly Role[]): Destination {
  if (has(roles, 'Admin')) return { path: '/admin/home' };
  if (has(roles, 'QualityReviewer')) return { path: '/quality/applications' };
  if (has(roles, 'Teacher')) return { path: '/teacher/home' };
  if (has(roles, 'Student')) return { path: '/student/overview' };
  return { path: '/' };
}

/** A dispute case. The dispute centre already opens a case from `selectedId`. */
export function disputeDestination(disputeId: string): Destination {
  return { path: '/disputes', query: { selectedId: disputeId } };
}

/** A review of a teacher, shown in that teacher's profile reviews. */
export function teacherReviewDestination(reviewId: string): Destination {
  return { path: '/teacher/qualifications', query: { tab: 'reviews', reviewId } };
}
