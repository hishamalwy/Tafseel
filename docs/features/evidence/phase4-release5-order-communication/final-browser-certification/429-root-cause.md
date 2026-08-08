# 429 root cause

Classification: **Test Issue** (dense Playwright / API churn), not a Production UX defect for normal interactive use.

## Exact limiter

Unchanged `Program.cs`:

- Policy `auth`: 10 requests / minute / IP. Covers `POST /auth/login`, `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password`.
- Global limiter: 300 requests / minute / `sub` or IP. Applies to authenticated API **and** anonymous static/hub negotiate when no user principal.
- Messaging send: 30 / minute / user. Not the historical dense-cert failure mode.

Repro (`429-repro-raw.json`): 12 rapid `POST /api/v1/auth/login` + `POST /api/v1/auth/refresh` with a deliberately wrong password. First 429: **POST /api/v1/auth/login**, then refresh also 429. 14 total 429 hits. Rate-limit thresholds were not changed.

## SignalR negotiate 429

`/hubs/messages` is **not** on the `auth` policy. Historical negotiate 429 was a **cascade**: refresh 429 emptied the in-memory JWT, then negotiate/API retries failed. A second mode appeared under dense dashboard remounts: **global 300/min** on `GET /conversations`, dashboard fan-out, and `POST /hubs/messages/negotiate` after many full Student Dashboard reloads in one window.

## Interactive user

A human Student/Teacher does not log in + refresh 10 times/minute, nor reload the dashboard 15+ times/minute. Classification remains Test Issue. Harness adapted: login-once `storageState`, 8s auth-sensitive pacing, 15s remount gap, 65s window resets, 20s matrix-cell retry. Failed cells still fail on unexpected 429 (not whitelisted).
