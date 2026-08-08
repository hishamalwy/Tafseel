# UAT fixtures

Created/reused through supported APIs only (no raw SQL, passwords not documented).

- Student A / Teacher A: existing Sprint 0.2 UAT identities; passwords rotated via `forgot-password` + Development outbox + `reset-password`.
- Student B / Teacher B: registered + email-confirmed via Development outbox (`student.r5b.uat@example.com`, `teacher.r5b.uat@example.com`).
- Order conversation: Student A ↔ Teacher A, `scope=Order`, `resourceId=Order.Id`, duplicate open returns same id `934ce59e-179a-4351-8dde-1da5aa90efeb` (live) / Integration identity tests.

Admin used only if SeedUsers enabled for publish; not granted conversation access.
