# Backend regression (rate-limit-aware final cert)

Sequential after browser work. Harness + two locale keys only; no messaging domain or schema change.

| Project | Result |
|---|---|
| Architecture | 1/1 PASS |
| Domain | 89/89 PASS |
| Application | 5/5 PASS |
| Integration | **224/224** PASS, 0 fail, 0 skip, 0 source exclusions (count rose legitimately from 222 with concurrent worktree tests) |

Release build: 0 errors. Pre-existing CS8604 nullable warnings in `TeacherApplicationService` unchanged when that project rebuilds. EF: no pending model changes. Latest migration remains `20260802083847_TeacherProfileVideoCuration`.
