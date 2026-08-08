# Published Student 401 root cause

Date: 2026-08-08. Isolated publish `http://127.0.0.1:5092` (`artifacts/phase4-release5-micro-final-publish`, Development). Same SQL Server Development database as `:5090`.

## Observation

On the prior Final Browser Certification publish smoke, Teacher `POST /api/v1/auth/login` returned **200** on the same host while Student `student.sprint02.uat@example.com` returned **401** `invalid_credentials`. The same Student authenticated throughout the `:5090` browser matrix.

## What was ruled out

| Hypothesis | Evidence |
|---|---|
| Published host misconfigured / wrong DB | Teacher 200 on `:5092`; health live/ready 200; conversations 200 after recovery |
| Development auth bypass missing | No bypass exists; none added |
| Auth rate limit (`auth` 10/min) | 401 body was `invalid_credentials`, not 429 |
| Email unconfirmed / suspended | Account existed, confirmed, not suspended |
| Refresh-cookie / published DP-key mismatch as the login 401 | Login is password check before refresh cookie issuance |
| Application authentication bug | Teacher + fresh register/confirm/reset Student succeeded on the same published host |

## Exact cause

**UAT Fixture Issue** (not a Production Bug, not an auth-code defect).

Sprint-02 Student had accumulated:

1. **Identity lockout** — failed-password churn from dense cert/reset loops. Lockout policy remains 5 failures / 15 minutes. Locked users return the same **401 `invalid_credentials`** as a wrong password (no lockout oracle).
2. **Password / security-stamp churn** — repeated forgot/reset against the same identity. HTTP `ResetPassword` with an outbox token returned **Invalid token** for the churned sprint-02 users (Data Protection keys + stamp drift across publish/dev content roots). A **fresh** register → confirm → reset Student returned **204** on the same host.
3. **HTTP reset does not clear lockout** — even a successful password reset leaves `LockoutEnd` set, so the next login still 401s until lockout expires or is cleared through Identity.

Recovery used the supported in-process Identity path (`scripts/dev/UatIdentityReset`): `UserManager.ResetPasswordAsync` + `SetLockoutEndDateAsync(null)` + `ResetAccessFailedCountAsync`. No raw SQL. Password/token values are not recorded here.

Classification: **UAT Fixture Issue**. Auth thresholds, Identity lockout, and SignalR authorization were not weakened.
