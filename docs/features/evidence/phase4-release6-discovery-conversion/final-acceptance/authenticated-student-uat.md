# Authenticated Student UAT

Student: `student.sprint02.uat@example.com`  
Teacher: `teacher.sprint02.uat@example.com`  
Admin/Quality: SeedUsers password via `dotnet user-secrets list --project src/Tafseel.Api` (not printed).

Strategy: R5 login-once Playwright `storageState` under `tests/browser/.auth/`, one live context per role, `tests/browser/lib/session.mjs` + `request-budget.mjs`. Passwords loaded into `TAFSEEL_UAT_*` env; users were not reset. Dev API `http://127.0.0.1:5090`. Frontend served from `bin/Release/net8.0/frontend`.

UAT was available and used for Favorites, guest continuation login, live conversion, dashboards, and publish smoke.
