# Backend regression

Sequential after the accepted browser run (leftover Debug `Tafseel.Api` on `:5089` stopped to release a DLL lock; not the R6 `:5090` host).

| Suite | Result |
|---|---|
| Architecture | 1/1 |
| Domain | 89/89 |
| Application | 5/5 |
| Integration | **226/226**, 0 skipped, 0 fail |

Count rose from the prior R6 baseline 224 by two concurrent Release 7 Marketplace Intelligence tests. R6 introduced no new Integration failure.

EF: `dotnet ef migrations has-pending-model-changes` → **No changes have been made to the model since the last migration.** Release 6 added no migration. A concurrent R7 intelligence migration exists in the worktree and is in sync.

Release build: 0 errors. Two pre-existing nullable warnings in `TeacherApplicationService` only — not R6.
