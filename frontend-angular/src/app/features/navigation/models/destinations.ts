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

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `/requests`, the retired Wave 2 marketplace page (UX-05). Each goal now has one screen: a student
 * posts through the request-mode choice and opens a request on its own page (its offers are one
 * step further, `/requests/:id/offers`); a teacher's marketplace is Open requests. A stored link that
 * named a request (`?requestId=`) still opens that request for either side; a value that is not a
 * request id is ignored rather than followed. Admin and Quality have no marketplace screen.
 */
export function marketplaceDestination(roles: readonly Role[], requestId: string | null): Destination {
  const id = requestId && GUID.test(requestId) ? requestId : '';
  if (has(roles, 'Admin') || has(roles, 'QualityReviewer')) return homeDestination(roles);
  // Someone who is both keeps the student path, as the header does.
  if (has(roles, 'Student')) return { path: id ? `/requests/${id}` : '/requests/new' };
  if (has(roles, 'Teacher')) return { path: id ? `/teacher/opportunities/${id}` : '/teacher/opportunities' };
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
