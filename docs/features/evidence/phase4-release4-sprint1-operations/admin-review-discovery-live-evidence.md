# Evidence — Admin Review Moderation Discovery (Release 4 Sprint 1)

Date: 2026-08-08
Environment: Development, `dotnet build -c Release` + `bin/Release/net8.0` server on `http://localhost:5000`, real LocalDB.
Actor: `qa.admin.sprint02@example.com` (Admin role, seeded via `SeedUsers`).

## 1. API contract — live curl verification

- `GET /api/v1/admin/reviews` (Admin token) → `200 OK`, returns `PagedResult<AdminReviewListItemDto>`.
- `GET /api/v1/admin/reviews/{id}` (Admin token) → `200 OK`, returns `AdminReviewDetailDto` with full criteria breakdown and moderation history.
- Same two endpoints called with a Student token → `403 Forbidden` (confirmed earlier in this pass, not re-run here since permission wiring did not change).
- Same two endpoints called with the QualityReviewer UAT account → `403 Forbidden` (QualityReviewer intentionally NOT granted `Reviews.Moderate` — no business-policy grant was given for this in the Sprint 1 prompt, so authorization is unchanged from baseline).

## 2. Browser-live discovery + moderation flow (Chrome DevTools-driven, not Playwright — see Limitations)

1. Logged into `/app/Tafseel-Auth.dc.html` as Admin.
2. Navigated Admin Dashboard sidebar → **Reviews**. `Review Moderation` queue rendered with filters (search / visibility / rating / sort), a paginated table (Teacher / Service / Score / Date / Visibility / Actions), and no requirement to know any Review ID in advance.
3. Clicked **Open** on a review discovered purely through the queue (no ID typed anywhere). Network tab confirmed `GET /api/v1/admin/reviews/{id}` fired with the ID taken from the already-loaded row data, not user input.
4. **Found and fixed a real rendering bug during this check**: the detail modal's "loaded" content block used the same `reviewDetailLoading` condition as its own loading-spinner sibling block (an `<sc-if>` copy-paste error), so once the API call resolved, `reviewDetailLoading` flipped to `false` and *neither* branch matched — the modal permanently showed only its header (title + close button), the criteria/history/reason/Hide/Restore content never rendered. Root-caused via `document.querySelectorAll('[role="dialog"]')` DOM inspection (confirmed API returned 200 with a full body, but the DOM literally had no content past the header). Fixed by adding a dedicated `reviewDetailReady` computed prop (`!!(s.reviewDetailModal && s.reviewDetailModal.id && !s.reviewDetailModal.loading)`) and pointing the content block's `<sc-if>` at it instead of the loading flag. Rebuilt, restarted the dev server, re-verified live — modal now renders correctly.
5. With the fix live: opened the review again — full detail rendered (5 criteria scores + overall, original comment, moderation history "—", reason textarea, Hide/Restore buttons).
6. Entered a reason and clicked **Hide**. Toast confirmed; moderation history immediately showed the new "Hidden" entry with timestamp/reason; the underlying queue row's Visibility badge flipped to "Hidden" without a page reload.
7. Switched the **Visibility** filter to **Hidden** — the queue correctly narrowed to show only the just-hidden review (proving the discovery/filter path works both ways: finding a review to act on, and finding it again afterward by its new state).
8. Reopened it from the Hidden-filtered queue, clicked **Restore** with an empty reason field — correctly blocked client-side by the existing `admin_review_reason_required` validation (confirmed via curl afterward that the review was still `isVisible:false` and moderation history still had only 1 entry — the empty-reason Restore attempt was a no-op, as intended).
9. Filled a reason, clicked **Restore** again — succeeded. Moderation history now showed both entries (Hidden → Visible). Confirmed via direct `curl GET /api/v1/admin/reviews/{id}` afterward: `"isVisible":true`.
10. At no point in steps 2–9 was a Review ID copied, typed, or placed in a URL/API request by the operator — satisfying the sprint's stated key acceptance criterion.

## 3. What was NOT done in this pass (see honest disclosure in the main report)

- No Playwright-automated version of the above flow was recorded (harness exists at `tests/browser/` but was not extended this pass under the current time budget) — the flow above was driven manually through the same in-app browser tooling used for live verification, not scripted.
- Public-facing teacher rating/review aggregate recomputation on Hide/Restore was NOT re-verified visually against the Teacher Profile page in this pass (the underlying aggregate-recompute code path is unchanged from the pre-existing `ModerateReviewAsync`, which was certified in earlier Phase 4 sprints — see `PHASE_4_FOUNDATION_FINAL_ACCEPTANCE_GATE.md`).
- Deep-link (`?section=reviews&reviewId=...`) was implemented in code but not live-clicked/verified in this pass.
- No automated integration test was written for the two new endpoints; correctness was established via live curl + live UI only.

## 4. Backend regression (full suite, post-fix)

```
Tafseel.ArchitectureTests: 1 passed
Tafseel.Domain.Tests: 89 passed
Tafseel.Application.Tests: 5 passed
Tafseel.IntegrationTests: 215 passed
Total: 310 passed, 0 failed
```

`dotnet ef migrations has-pending-model-changes` → "No changes have been made to the model since the last migration." (confirms the no-migration design goal held).

## 5. Frontend CI gates (post-fix, all green)

```
node scripts/ci/check-js.mjs
  Auth UI mode isolation validation passed.
  Localization validation passed for 12 frontend entry points and 2996 paired keys.
  Frontend integrity validation passed for 13 entry points.
  Guided request checks passed.
  Sprint 6 notification routing checks passed.

node scripts/ci/check-bug001-display-names.mjs → passed
node scripts/ci/check-teacher-profile-mobile-cta.mjs → passed
node scripts/ci/check-template-placeholder-leak.mjs → passed (12 surfaces scanned)
```
