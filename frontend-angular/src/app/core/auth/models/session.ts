import { Role, primaryRole } from './role';

/**
 * An authenticated session.
 *
 * Note what is absent: the refresh token. It is an HttpOnly cookie the browser
 * holds and JavaScript cannot read, so it is not part of the domain model — only
 * the access token the client actually presents.
 */
export interface Session {
  readonly userId: string;
  readonly email: string;
  readonly fullName: string;
  readonly fullNameEnglish: string;
  readonly roles: readonly Role[];
  readonly hasAvatar: boolean;
  readonly mfaEnabled: boolean;
  readonly accessToken: string;
  readonly accessTokenExpiresAt: string;
}

export const Session = {
  has(session: Session | null, ...roles: readonly Role[]): boolean {
    if (!session) return false;
    return roles.some(r => session.roles.includes(r));
  },

  /** The role that decides this user's home surface. */
  primary(session: Session | null): Role | null {
    return session ? primaryRole(session.roles) : null;
  }
} as const;
