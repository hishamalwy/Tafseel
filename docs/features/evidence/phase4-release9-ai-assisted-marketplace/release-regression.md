# Release Regression

Isolated Release test run:

- Architecture: 1/1
- Domain: 89/89
- Application: 5/5
- Integration: 248/248
- Total: **343/343 passed; 0 failed; 0 skipped**

All named frontend gates passed, including auth return/UI, BUG-001, guided request, JS, localization (12 entry points, 3,115 paired keys), localization usage, R5, R6, R7, R9, catalog, notification routing, teacher CTA, template leak, frontend integrity (13 entry points), and browser harness self-test 5/5.

Two pre-existing nullable warnings remain in `TeacherApplicationService.cs`; R9 introduced no warning or error. Release 5/Foundation checks remain green. Release 7 is still conditional and no canonical R8 record exists.
