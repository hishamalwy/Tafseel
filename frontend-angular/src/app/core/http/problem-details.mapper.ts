import { HttpErrorResponse } from '@angular/common/http';
import { AuthFailure, AuthFailureReason } from '@core/auth/models/auth-failure';
import { ProblemDetailsDto } from './api.dto';

/**
 * The one place the transport's vocabulary is translated into the domain's.
 *
 * Above this line nothing knows what a 401 is; below it nothing knows what
 * `email-not-confirmed` means. Adding a server code is a change here only.
 */
const REASON_BY_CODE: Readonly<Record<string, AuthFailureReason>> = {
  invalid_credentials: 'invalid-credentials',
  mfa_required: 'mfa-required',
  invalid_mfa_code: 'invalid-mfa-code',
  email_confirmation_required: 'email-not-confirmed',
  account_suspended: 'account-suspended',
  refresh_token_missing: 'session-expired',
  refresh_token_invalid: 'session-expired',
  refresh_token_expired: 'session-expired',
  refresh_token_reused: 'session-expired',
  registration_failed: 'email-unavailable',
  policy_acceptance_required: 'policy-outdated',
  invalid_reset_token: 'reset-link-invalid',
  confirmation_send_failed: 'confirmation-not-sent'
};

export function toAuthFailure(response: HttpErrorResponse): AuthFailure {
  if (response.status === 0) {
    return new AuthFailure('offline', 'Could not reach the server.');
  }

  const body = (response.error ?? {}) as ProblemDetailsDto;
  const message = body.detail || body.title || response.statusText || 'Request failed.';
  const mapped = body.code ? REASON_BY_CODE[body.code] : undefined;
  const reason: AuthFailureReason =
    mapped ?? (response.status === 429 ? 'rate-limited' : response.status >= 500 ? 'server-fault' : 'unknown');

  return new AuthFailure(reason, message, body.traceId ?? null, body.errors ?? {});
}
