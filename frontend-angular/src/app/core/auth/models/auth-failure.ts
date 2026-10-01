/**
 * Why an authentication attempt did not succeed, as a closed set.
 *
 * The transport's own vocabulary (HTTP status, RFC 7807 `code`) stops at the
 * infrastructure boundary; above it the application and the UI branch on these.
 * Being a union rather than a string means a `switch` is exhaustively checked,
 * so a new reason cannot be silently ignored by a caller.
 */
export type AuthFailureReason =
  | 'invalid-credentials'
  | 'mfa-required'
  | 'invalid-mfa-code'
  | 'email-not-confirmed'
  | 'account-suspended'
  | 'session-expired'
  | 'email-unavailable'
  | 'policy-outdated'
  | 'reset-link-invalid'
  | 'confirmation-not-sent'
  | 'offline'
  | 'rate-limited'
  | 'server-fault'
  | 'unknown';

export class AuthFailure extends Error {
  constructor(
    readonly reason: AuthFailureReason,
    message: string,
    /** Correlation id from the API, for support tickets. Never shown by default. */
    readonly traceId: string | null = null,
    readonly fieldErrors: Readonly<Record<string, readonly string[]>> = {}
  ) {
    super(message);
    this.name = 'AuthFailure';
  }

  /** The session is gone; only signing in again resolves it. */
  get endsSession(): boolean {
    return this.reason === 'session-expired';
  }

  /** The attempt is incomplete rather than wrong — ask for the second factor. */
  get needsSecondFactor(): boolean {
    return this.reason === 'mfa-required';
  }
}
