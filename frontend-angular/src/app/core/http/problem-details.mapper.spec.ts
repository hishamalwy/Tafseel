import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { toAuthFailure } from './problem-details.mapper';

/**
 * The boundary where HTTP vocabulary becomes the app's own. Adding a server code
 * should be a change here and nowhere else.
 */
describe('toAuthFailure', () => {
  const problem = (status: number, body: unknown) =>
    new HttpErrorResponse({ status, statusText: 'x', error: body });

  it('maps every documented auth code to a reason', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['invalid_credentials', 'invalid-credentials'],
      ['mfa_required', 'mfa-required'],
      ['invalid_mfa_code', 'invalid-mfa-code'],
      ['email_confirmation_required', 'email-not-confirmed'],
      ['account_suspended', 'account-suspended'],
      ['registration_failed', 'email-unavailable'],
      ['policy_acceptance_required', 'policy-outdated'],
      ['invalid_reset_token', 'reset-link-invalid'],
      ['confirmation_send_failed', 'confirmation-not-sent']
    ];
    for (const [code, reason] of cases) {
      expect(toAuthFailure(problem(400, { code })).reason).toBe(reason);
    }
  });

  it('treats every refresh-token failure as one ended session', () => {
    for (const code of ['refresh_token_missing', 'refresh_token_invalid',
                        'refresh_token_expired', 'refresh_token_reused']) {
      const failure = toAuthFailure(problem(401, { code }));
      expect(failure.reason).toBe('session-expired');
      expect(failure.endsSession).toBe(true);
    }
  });

  it('carries the trace id and field errors through', () => {
    const failure = toAuthFailure(problem(409, {
      code: 'registration_failed', detail: 'Taken.', traceId: 't-1',
      errors: { email: ['Already in use.'] }
    }));
    expect(failure.message).toBe('Taken.');
    expect(failure.traceId).toBe('t-1');
    expect(failure.fieldErrors['email']).toEqual(['Already in use.']);
  });

  it('separates offline from server fault', () => {
    expect(toAuthFailure(problem(0, null)).reason).toBe('offline');
    expect(toAuthFailure(problem(503, { code: 'nope' })).reason).toBe('server-fault');
  });

  it('falls back to unknown for an unmapped 4xx code', () => {
    expect(toAuthFailure(problem(400, { code: 'brand_new_code' })).reason).toBe('unknown');
  });

  it('flags mfa_required as needing a second factor, not as a failure', () => {
    expect(toAuthFailure(problem(401, { code: 'mfa_required' })).needsSecondFactor).toBe(true);
  });
});
