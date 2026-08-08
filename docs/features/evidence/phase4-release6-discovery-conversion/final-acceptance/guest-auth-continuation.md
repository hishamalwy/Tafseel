# Guest Auth continuation

Guest Browse (Subject+Service) → Profile Start Request → Auth → Student login → Guided Request.

Accepted run:

- `04-guest-async-protected-action` PASS
- Auth URL contained `return=` same-origin app path (not an external host)
- `05-auth-return-guided-request` PASS — pathname `Tafseel-Request.dc.html` with same `teacherId` + `teacherServiceId`

Open-redirect audit: `scripts/ci/check-auth-return.mjs` PASS. `safeAppReturnHref` rejects `http(s)`, `//`, `\`, `javascript:`, `data:`, `vbscript:`, non-`/app/` paths, `..`, and `Tafseel-Auth` loops. Only `Tafseel-*.dc.html` app files are allowed. `requireSession` / guest CTAs use `authHref`.
