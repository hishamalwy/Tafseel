# Authentication

Implemented endpoints:

| Method | Route | Notes |
|---|---|---|
| POST | `/api/v1/auth/register` | Creates an unconfirmed Student or Teacher account and sends confirmation; no tokens are issued. |
| POST | `/api/v1/auth/login` | Identity password validation and lockout protection. |
| POST | `/api/v1/auth/refresh` | Rotates the refresh token. Reuse revokes the token family and security stamp. |
| POST | `/api/v1/auth/logout` | Revokes the current refresh token. |
| GET | `/api/v1/auth/me` | Returns the authenticated user's public account fields. |
| POST | `/api/v1/auth/forgot-password` | Sends a reset link through Resend without revealing whether the account exists. |
| POST | `/api/v1/auth/reset-password` | Resets the password and revokes all existing sessions. |
| POST | `/api/v1/auth/request-email-confirmation` | Non-enumerating, rate-limited confirmation resend with a per-account cooldown. |
| POST | `/api/v1/auth/confirm-email` | Confirms ownership through an ASP.NET Core Identity token. |

Access tokens last 15 minutes by default. Refresh tokens last 30 days, are stored only as SHA-256 hashes, and are sent in the `__Host-tafseel-refresh` cookie with `Secure`, `HttpOnly`, `SameSite=Strict`, no Domain, and `Path=/`. JWTs contain centralized role and permission claims. Every authenticated request checks suspension and the Identity security stamp.

`Jwt:SigningKey` is intentionally invalid in source control. Configure it with User Secrets locally and an environment secret in deployed environments. CORS origins are configured through `Cors:AllowedOrigins`.

Resend is configured through `Resend:ApiToken`; the token is never stored in source control. Password-reset and confirmation tokens are sent only by email and are never logged or returned by the API. Registration and login do not issue access or refresh tokens until email confirmation succeeds.

`SameSite=Strict` blocks the refresh cookie on cross-site requests. A frontend on another origin under the same registrable site can work with configured credentialed CORS; a frontend on a different site cannot use this cookie contract. Do not switch to `SameSite=None` without a deliberate cross-site deployment design and additional CSRF protection. Refresh and logout are POST-only; confirmation uses a one-time bearer token in the request body, and resend is anonymous, non-enumerating, rate-limited, and cooled down.
