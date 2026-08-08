# Foundation retention

Lightweight gates only (no Foundation reopen). Date: 2026-08-08.

| Gate | Result |
|---|---|
| `check-frontend-integrity.mjs` | PASS (13 entry points) |
| `check-localization.mjs` | PASS (3085 paired keys) |
| `check-localization-usage.mjs` | PASS after adding missing `browse_sort` / `filters_h` EN+AR (concurrent Browse Teachers references; not an R5 messaging change) |
| `check-bug001-display-names.mjs` | PASS |
| `check-template-placeholder-leak.mjs` | PASS |
| `check-js.mjs` | PASS |
| `check-auth-ui.mjs` | PASS |
| `check-guided-request.mjs` | PASS |
| `check-sprint6-notification-routing.mjs` | PASS |
| `check-teacher-profile-mobile-cta.mjs` | PASS |
| `tests/browser/self-test.mjs` | PASS 5/5 |
| `check-release5-order-communication.mjs` | PASS |
| `git diff --check` | PASS (CRLF warnings only) |
