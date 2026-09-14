import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { Session } from '@core/auth/models/session';
import { TeacherOnboarding } from '@core/auth/models/teacher-onboarding';
import { Role } from '@core/auth/models/role';

/**
 * Ports — what the application layer needs, expressed as narrow interfaces it
 * owns. Infrastructure implements them; nothing above this file knows whether a
 * session arrives over HTTP, from a cache, or from a test double.
 *
 * They are split rather than gathered into one `AuthRepository` on purpose
 * (interface segregation): the login screen has no business depending on a type
 * that also declares password-reset and onboarding methods, and a fake for one
 * use case should not have to stub the other six.
 */

export interface Credentials {
  readonly email: string;
  readonly password: string;
  /** Supplied only after the API has answered `mfa-required`. */
  readonly mfaCode?: string;
}

export interface Registration {
  readonly email: string;
  readonly password: string;
  readonly fullName: string;
  readonly role: Extract<Role, 'Student' | 'Teacher'>;
  readonly lang: 'ar' | 'en';
}

export interface PasswordReset {
  readonly email: string;
  readonly token: string;
  readonly newPassword: string;
}

/**
 * The refresh endpoint answered 429. That is a temporary throttle, not a verdict on the
 * session: the refresh cookie is still valid, so nothing about the reader's sign-in may be
 * cleared because of it (G-19).
 */
export class RefreshThrottled extends Error {
  constructor(readonly retryAfterSeconds: number | null) {
    super('refresh-throttled');
  }
}

/** Sign in, sign out, and re-establish a session from the refresh cookie. */
export interface SessionGateway {
  authenticate(credentials: Credentials): Observable<Session>;
  /**
   * Resolves to null when there is no live session — that is an answer, not an error.
   * Errors with RefreshThrottled when the endpoint is throttling.
   */
  restore(): Observable<Session | null>;
  revoke(): Observable<void>;
}

/** Everything about creating an account and recovering one. */
export interface AccountGateway {
  register(registration: Registration): Observable<void>;
  requestPasswordReset(email: string, lang: 'ar' | 'en'): Observable<void>;
  resetPassword(reset: PasswordReset): Observable<void>;
  resendConfirmation(email: string, lang: 'ar' | 'en'): Observable<void>;
  /** Spends the token from the welcome email's link. */
  confirmEmail(email: string, token: string): Observable<void>;
}

/** Teacher lifecycle, needed only to decide where a Teacher lands after login. */
export interface TeacherLifecycleGateway {
  onboardingStatus(): Observable<TeacherOnboarding>;
}

/**
 * Holds the current session for the running app. Separated from SessionGateway
 * because "where the session is kept" and "how it is obtained" change for
 * different reasons.
 */
export interface SessionStore {
  readonly current: () => Session | null;
  set(session: Session | null): void;
}

export const SESSION_GATEWAY = new InjectionToken<SessionGateway>('SessionGateway');
export const ACCOUNT_GATEWAY = new InjectionToken<AccountGateway>('AccountGateway');
export const TEACHER_LIFECYCLE_GATEWAY =
  new InjectionToken<TeacherLifecycleGateway>('TeacherLifecycleGateway');
export const SESSION_STORE = new InjectionToken<SessionStore>('SessionStore');
