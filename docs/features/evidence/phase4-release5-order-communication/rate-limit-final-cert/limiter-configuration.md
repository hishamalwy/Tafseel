# Limiter configuration (from current code + runtime)

Source: `src/Tafseel.Api/Program.cs` `AddRateLimiter` / `UseRateLimiter`, plus `AuthController` and related `[EnableRateLimiting]` attributes. Development environment (not `Testing`). Limits were **not** changed this pass.

## Auth policy `"auth"`

| Field | Value |
|---|---|
| PermitLimit | **10** (Testing: 100) |
| Window | 1 minute fixed window |
| QueueLimit | **0** (no queue; immediate 429) |
| Partition key | `RemoteIpAddress` or `"unknown"` |
| Rejection | HTTP **429** (`RejectionStatusCode`) |

Endpoints (`EnableRateLimiting("auth")`):

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/confirm-email`
- `PUT /api/v1/auth/password`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`

`GET /api/v1/auth/me` and `POST /api/v1/auth/logout` are **not** on the auth policy.

## Global limiter

| Field | Value |
|---|---|
| PermitLimit | **300** (Testing: 10000) |
| Window | 1 minute **fixed** window |
| QueueLimit | **0** |
| Coded partition key | `User.FindFirstValue("sub")` ?? `RemoteIpAddress` ?? `"unknown"` |
| Effective partition (runtime) | **IP** on this host |

`app.UseRateLimiter()` runs **before** `app.UseAuthentication()`. At limiter evaluation time `User` has no `sub` claim, so every first-party request (API, static `/app/*`, SignalR negotiate/hub) shares the **same 300/min IP bucket** for Playwright on `127.0.0.1`.

No `OnRejected` callback is configured. Runtime measure recorded **no** `Retry-After` / `RateLimit-Remaining` / `RateLimit-Reset` headers.

## Other named policies (unchanged, not the 429 mode)

| Policy | Permit | Window | Typical use |
|---|---|---|---|
| `upload` | 10 | 1 hour | avatar, attachments, some create/upload |
| `confirmation` | 3 | 15 min | request-email-confirmation |
| `payment` | 10 (Testing 100) | 1 min | payment + mock simulator |
| `messaging` | 30 (Testing 100) | 1 min | `POST .../conversations/{id}/messages` |

Messaging send 30/min was not the historical dense-remount failure mode.

## SignalR

`MapHub<MessagingHub>("/hubs/messages")` has no named policy. Negotiate/hub traffic is covered only by the **global** limiter.
