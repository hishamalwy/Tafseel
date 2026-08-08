# Backend regression (micro gate)

Sequential after browser work. Widget/auth-fixture changes only; no messaging domain or schema change.

| Project | Result |
|---|---|
| Architecture | 1/1 PASS (this pass) |
| Domain | 89/89 PASS (this pass) |
| Application | 5/5 PASS (this pass) |
| Integration | **222/222** PASS, 0 fail, 0 skip, 0 source exclusions (this-pass baseline; factory outsider 404 + SignalR join denial retained) |

Release build: 0 errors. Pre-existing CS8604 nullable warnings in `TeacherApplicationService` unchanged.

This-pass outsider browser check `authz-student-b` recorded **login 401** (UAT outsider fixture lockout/churn), not a live SignalR join. Server hub authorization code was not modified; Integration suite remains the authorization proof.
