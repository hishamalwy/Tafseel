# Final Staging Certification

Date: 2026-08-01  
Scope: final manual media, showcase-preview, regression, and browser certification gate.  
Repository changes: documentation only; no feature, workflow, business-rule, migration, commit, push, or deployment changes.

## Runtime Startup Blocker

Classification: **Port/Process Conflict**.

The corrected `TafseelLocalDb` run reached a healthy API process. A duplicate `launch-profile http` attempt then failed immediately because port `5089` was already owned by the controlled Tafseel API process. This was not a media defect.

Exact successful command:

```powershell
$env:ASPNETCORE_ENVIRONMENT = "Development"
$env:ConnectionStrings__Tafseel = "Server=(localdb)\TafseelLocal;Database=TafseelLocalDb;Trusted_Connection=True;TrustServerCertificate=True;"
dotnet run --project src/Tafseel.Api -c Release --no-build --launch-profile http
```

Successful validation URL: `http://127.0.0.1:5089`. A clean timing run used `http://127.0.0.1:5090`.

## Root Cause

- The blocked pass used the appsettings default `(localdb)\\mssqllocaldb` / `Tafseel` instead of `TafseelLocal` / `TafseelLocalDb`.
- `TafseelLocal` was initially stopped, but started successfully without database repair or reset.
- A controlled Tafseel API process remained bound to port `5089`; a second startup correctly failed with `AddressInUseException`.
- No provider, health-check, migration, media, or product behavior defect was proven.

## Startup Timing

Clean run on `2026-08-01`:

| Event | Evidence |
|---|---|
| Command start | 11:16:42.684 +03:00 |
| `Hosting starting` | 11:16:46 |
| Bound port | `http://127.0.0.1:5090` |
| `/health/ready = 200` | 11:16:47; database and file-storage checks healthy |
| `/health/live = 200` | 11:16:48 |
| Startup result | Passed |

The duplicate launch on `5089` failed at 11:08:18 with `Failed to bind to address ... address already in use`.

## LocalDB Evidence

- `sqllocaldb info` listed `MSSQLLocalDB` and `TafseelLocal`.
- `sqllocaldb start TafseelLocal` returned success; the instance pipe was available.
- `sqlcmd -S '(localdb)\\TafseelLocal' -d TafseelLocalDb -E` returned `SELECT 1` successfully.
- Required tables present: `AspNetUsers`, `TeacherProfiles`, `LearningRequests`, `Orders`, `Payments`.
- API readiness reported database and local file-storage health as `Healthy`.

## Browser Certification Rerun

The runtime and actual API URL were validated. HTTP media certification on `http://127.0.0.1:5089` passed:

- Qualification demo and approved showcase media returned `206 Partial Content` for `Range: bytes=0-1023`.
- `Content-Type: video/mp4`, `Accept-Ranges: bytes`, and correct `Content-Range` were present.
- Quality Reviewer and Teacher access returned 200/206; anonymous access returned 401; unrelated Student access returned 404.
- Existing authenticated data included a qualification demo and approved showcase version; no permanent public URL was exposed.

The in-app browser-control tool was not callable in this session, so actual frame rendering, seek, pause/resume, audio, viewport matrix, console, overflow, and full click-driven lifecycle checks remain limitations rather than inferred passes.

## Findings

- The Release solution build passed with two pre-existing nullable-reference warnings in `TeacherApplicationService.cs`; no errors.
- The local Development API could not reach `/health/live` within 180 seconds while starting against the LocalDB-backed Development database. No live authenticated browser session was therefore available.
- Edge is installed on the workstation, but the API/data prerequisite failed before a normal browser certification could begin.
- No media defect was proven. The uncompleted manual assertions are intentionally recorded as unverified rather than inferred from source or tests.

## Manual Media Verification

Status: **UNVERIFIED — environment blocked**.

Static and automated evidence confirms:

- Qualification demo endpoint: authenticated `GET /api/v1/teacher-applications/{id}/demo/content`.
- Private showcase endpoint: authenticated `GET /api/v1/teachers/me/showcases/{id}/versions/{versionId}/content`.
- Public approved sample endpoint is anonymous only after server-side visibility checks.
- Media responses use `video/mp4`, inline playback, and ASP.NET range processing.
- Owner and Quality Reviewer authorization paths exist; anonymous and unrelated-role denial paths are covered by the existing integration/security suites.
- MP4 validation, generated storage keys, private storage, and localized loading/error/download copy are present.

Not certified manually because the Development API could not start: actual frames, seek, pause/resume, audio, browser network/media error classification, fallback download, rendered rectangle state, and localized loading/error display.

## Showcase Preview Regression

Status: **AUTOMATED CONTRACT COVERAGE PASSED; BROWSER PREVIEW UNVERIFIED**.

The existing `TeacherShowcaseMvpTests` and marketplace/integration coverage passed within the provider-neutral and SQL Server runs. Draft, submitted, and moderation/public visibility rules are covered at API/domain level. An approved public browser preview was not exercised because the live authenticated API could not start.

No permanent public media URL was created or exposed.

## Regression Validation

| Gate | Result |
|---|---:|
| Release build | PASS; 0 errors, 2 existing warnings |
| Architecture | PASS — 1/1 |
| Domain | PASS — 69/69 |
| Application | PASS — 5/5 |
| Provider-neutral integration | PASS — 110/110 |
| SQL Server integration | PASS — 85/85 |
| Frontend integrity / JavaScript / auth UI | PASS |
| Localization parity | PASS — 2,630 paired keys |
| Localization usage coverage | PASS |
| Payment simulator, order lifecycle, delivery/revision/review | PASS in integration suite |
| RoleBootstrap | PASS in integration suite |
| Publish smoke | PASS |
| EF pending-model check | PASS — no pending changes |
| Migration safety | PASS — 9/9 |
| Staging migration checks | PASS — 34/34 |
| `git diff --check` | PASS |

## Browser Certification

Status: **NOT CERTIFIED — Development runtime unavailable**.

Student request, Teacher accept, mock payment, Start Work, delivery, revision, completion, rating, quality video preview, chat, notifications, Arabic/RTL/Dark, English/LTR/Light, and the 375/768/1024/1440 viewport matrix were not claimed as passed. No-console-error, no-mixed-language, no-GUID, no-duplicate, no-dead-button, and accessibility/file checks require the live browser flow and remain open.

## Files Changed

- `docs/reports/FINAL_STAGING_CERTIFICATION_REPORT.md` — created.
- `docs/INDEX.md` — added this report to the report index.
- `docs/PROJECT_STATUS.md` — recorded the conditional certification result and blocker.

## Remaining Limitations

- Repeat the manual browser/media matrix against a running Development or Staging instance backed by legitimate seeded data.
- Capture browser network/media evidence if playback fails and classify codec, range, CSP, or authorization before any code change.
- Production remains out of scope and retains the documented durable-storage, scanning/probing, provider, backup, and observability limitations.

## Risks

- The unverified browser surface could still contain a runtime-only media, CSP, authorization, or localization issue despite passing automated coverage.
- LocalDB startup instability prevents this report from proving the end-to-end UI state against real data.

## Final Verdict

**RUNTIME RESTORED — READY FOR STAGING WITH LIMITATIONS**

## Next Step

## Normal Browser Environment

- Actual URL: `http://127.0.0.1:5089`.
- Exactly one controlled Tafseel API process owned port 5089 during the pass; `/health/live` and `/health/ready` both returned 200.
- Legitimate Quality Reviewer account was used. No permanent public media URL was exposed.
- Arabic/RTL at the available 1280×720 normal-browser viewport was executed. The requested 375/768/1024/1440, English/LTR/light, touch, and keyboard-only cells were not claimed.

## Quality Video Visual Playback

The Quality Reviewer UI opened a submitted qualification demo and rendered the expected metadata, but the media surface remained a black rectangle. An authenticated blob URL was assigned, yet actual frames, duration, pause/resume, seek, audio, and fullscreen behavior were not observed. Native controls were not usable in the rendered result.

HTTP diagnostics confirmed the server path is healthy: authenticated `200 video/mp4`, `Accept-Ranges: bytes`, and `Range: bytes=0-1023` returned `206` with the correct `Content-Range`; anonymous access returned 401 and unrelated-role access was denied. This is not classified as a range, authorization, or startup defect. The proven issue is a frontend media-render/lifecycle failure after the blob is assigned; codec/CSP remains unclassified because no browser media error was emitted.

An attempted minimal source correction made the affected video templates explicit about the controls value because the renderer converted an empty Boolean attribute to false. The normal-browser retest still showed the black/non-playing result, and the frontend-integrity gate rejected the altered markup, so the attempted change was reverted. No source change remains from this pass; certification remains blocked.

## Full Lifecycle Browser UAT

The click-driven Student request → Teacher accept → Mock Checkout → Start Work → Delivery → Revision → Approval → Completion → Rating flow was not claimed as passed in this final pass. Chat, notifications, and dependent lifecycle evidence remain unverified.

## Browser Matrix

Only the authenticated Quality Reviewer Arabic/RTL path at 1280×720 was executed. No claims are made for 375, 768, 1024, or 1440; English/LTR/light; touch; or keyboard-only cells. The captured page had no horizontal overflow or raw GUIDs, but the black video is a blocking visual defect.

## Console and Network Evidence

- Browser console: no media error was emitted; repeated non-fatal `dc-runtime` warnings reported unresolved queue interpolation placeholders (`a.name`, `a.subject`, `a.submitted`, `a.priority`, `a.status`) although visible queue values rendered.
- Network/API: authenticated qualification content `200`, `video/mp4`, 1,163,763 bytes; range `206` with `Content-Range: bytes 0-1023/1163763`; anonymous `401`; unrelated role denied.
- Browser screenshot: Quality Reviewer review page showed a black media rectangle beneath `عرض تجريبي`, with duration metadata rendered separately.

## Final Verdict Update

**STAGING CERTIFICATION BLOCKED**

The runtime is healthy and automated gates remain passed. Staging certification is blocked solely by the proven visible browser playback defect and unexecuted dependent browser matrix. No deployment, commit, or push was performed.

Use the corrected LocalDB connection and ensure only one controlled Tafseel process owns the port. Complete the normal browser click-through and viewport certification before deployment.

## Teacher Profile Media Recovery Update

The focused browser-proven defect was classified as **CSP / media-src Issue**. Private Quality previews use authenticated blob URLs, but the previous CSP only allowed `default-src 'self'`; `blob:` media was therefore blocked. The renderer also treated empty Boolean attributes such as `controls` as false.

The recovery pass now adds `media-src 'self' blob:`, normalizes Boolean DOM properties in the shared renderer, keeps Quality demo object URLs alive until component cleanup, and adds a shared media-preview helper with loading, ready, playing, paused, error, unsupported, and secure download-fallback states. Public Profile samples keep their existing authorized endpoint and no storage URL is exposed.

Teacher Profile qualification samples and reviewed showcases now use larger responsive cards with explicit trust labels and distinct qualification/review descriptions. The existing service/request sidebar and moderation rules are unchanged.

Server evidence after the fix: `/health/live = 200`, `/health/ready = 200`, public sample Range `206`, `Content-Type: video/mp4`, `Content-Range: bytes 0-1023/1163763`, and the response CSP includes `media-src 'self' blob:`. Browser playback rerun after the rebuilt runtime is still required before changing the final staging verdict.
