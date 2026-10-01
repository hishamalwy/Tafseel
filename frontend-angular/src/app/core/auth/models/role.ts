/**
 * Roles as the API issues them (`Tafseel.Application.Authorization.Roles`).
 * Domain layer: no Angular, no HTTP, no DTO shapes — just the rule that a role
 * is one of five names and that they have a precedence order.
 */
export type Role = 'Admin' | 'Finance' | 'QualityReviewer' | 'Teacher' | 'Student';

/** Most privileged first. A user holding several lands on the first they match. */
export const ROLE_PRECEDENCE: readonly Role[] = ['Admin', 'Finance', 'QualityReviewer', 'Teacher', 'Student'];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLE_PRECEDENCE as readonly string[]).includes(value);
}

/** The role that decides where a user goes when no destination was requested. */
export function primaryRole(roles: readonly Role[]): Role | null {
  return ROLE_PRECEDENCE.find(r => roles.includes(r)) ?? null;
}
