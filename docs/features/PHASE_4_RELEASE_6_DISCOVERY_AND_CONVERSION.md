# Phase 4 Release 6 — Discovery & Conversion

Date: 2026-08-08  
Verdict: **RELEASE 6 — DISCOVERY & CONVERSION VERIFIED**

Historical first-pass verdict (preserved, not erased): **CONDITIONALLY VERIFIED** — authenticated Favorites, guest continuation, and populated live conversion were then unproven, and some docs still cited a Release 5 status conflict. Final Acceptance Closure (same day) closed those gaps. See [Final Acceptance Closure](../fixes/PHASE_4_RELEASE_6_FINAL_ACCEPTANCE_CLOSURE.md).

## Outcome

Release 6 replaces the Browse page's 100-row client-side filtering model with bounded, deterministic server discovery. Students now choose a canonical Subject and public Teacher-selectable Service, receive eligible Teachers whose same-subject service is actually offered, see contextual price and terms, compare 2–3 Teachers without ranking, and carry the selected TeacherService into Profile and Request/booking links.

The slice reuses `TeacherProfile`, `TeacherSubjectQualification`, `TeacherService`, `ServiceCatalogItem`, visible Review projections, favorites, availability summaries, Guided Request, and live-session booking. Release 6 itself introduces no discovery entity, recommendation engine, AI, analytics event, migration, or dependency. Concurrent Release 7 later added minimized marketplace-intelligence events on Browse/Profile; those calls were preserved and do not change discovery query or conversion semantics.

## Finding classification

| Finding | Classification | Resolution |
|---|---|---|
| Browse fetched 100 Teachers then filtered, sorted and paged in the browser | API Mismatch | Replaced by server query parameters and server pagination. |
| Browse used a hardcoded service taxonomy | Missing Feature | Replaced with `/services` public catalog rows. |
| Price/sort could lack a single subject-service commercial context | API Mismatch | Added deterministic eligible `contextOffer`. |
| Query-count assertion assumed the old two-read projection | Test Issue | Retained a fixed bounded 1–4-read contract and added intersection coverage. |
| Selected live service could fall through to a different availability-summary service on Profile | UI/View Issue | Booking is now permitted only when the summary TeacherService exactly matches the selected service. |

No Production Bug was claimed for ordinary product refinement.

## Architecture and contract

`TeacherPublicQueries.BrowsableTeachers` remains the canonical public-eligibility root. A scoped offer projection joins active, non-superseded TeacherServices to active/public/Teacher-selectable catalog items and active Subjects, and requires a non-revoked Approved qualification for the same Teacher and Subject. Search, Subject, Service, maximum price and price sort all consume that offer scope.

`TeacherCardDto.ContextOffer` provides the precise TeacherService, Subject, catalog item, order type, price/currency, delivery/revisions, scheduling flag and allowed actions. Compare accepts optional Subject/Service context and returns only eligible contextual subjects/services. API privacy remains public-only; tests assert no email or phone fields.

## Product behavior

- Decision order is Subject → Service → optional preferences → Teachers → Compare/Profile → Request/Live Session.
- Search covers public name, English name, approved bilingual Subject names and eligible bilingual Service names.
- Filters cover canonical Subject, Service, education level, language, public rating, contextual maximum price and qualified-only state.
- Sort is limited to stable name, eligible visible-review rating, contextual lowest price and contextual highest price. No Best, Popular, Trending, winner or recommendation exists.
- Empty states name active constraints and offer deterministic recovery: remove price, remove languages, show all services for the Subject, or reset.
- URL state is shareable for Subject, Service, query, education, language, rating, price, qualification, sort and page; `popstate` restores it.
- Cards show contextual Subject, Service, commercial terms, exact price, evidence-backed qualification and eligible public rating. Availability appears only for scheduling services.
- Async CTA targets Guided Request with the exact TeacherService. Live CTA appears only for the exact service when canonical availability is bookable.
- Profile selects the carried TeacherService, preserves Browse context, and never redirects booking to a different live service.

## Verification

| Gate | Result |
|---|---|
| Focused discovery/comparison integration | 13/13 passed |
| Architecture | 1/1 passed |
| Domain | 89/89 passed |
| Application | 5/5 passed |
| Integration | 224/224 then 226/226 passed, 0 skipped (count rose with concurrent Release 7 tests) |
| Frontend/localization/template gates | Passed; 3,085 paired EN/AR keys |
| Browser harness self-test | 5/5 passed |
| Release 6 Playwright certification | 16/16 passed; 0 unexpected 429, pageerror, failed first-party resource or actionable console error |
| In-app browser visual review | 390 mobile cards and mobile Compare, 768 AR/RTL dark, 1440 EN/LTR dark, Profile conversion inspected |
| EF | No pending model changes |
| Publish | Release publish succeeded; static Browse 200 with `no-cache` |
| Health | `/health/live` 200 and `/health/ready` 200 |

The build reports two pre-existing nullable warnings in `TeacherApplicationService`; Release 6 introduced no warning in its files.

## Conditional items (historical first pass)

The first closure pass was intentionally not marked VERIFIED. No Student UAT password was configured then, so authenticated Favorites E2E was not rerun. The Development fixtures then exposed only async services, so a populated live-service conversion could not be browser-proven (the exact-service negative safety was covered by code/tests). Some living docs still described a Release 5 status conflict; that conflict is now stale — Release 5 is **VERIFIED & CLOSED** after rate-limit-aware final certification. This historical CONDITIONALLY VERIFIED wording is preserved.

## Final Acceptance Closure

Authenticated Student UAT, Favorites add/persist/remove/race, guest→Auth same-origin return to Guided Request (Teacher + TeacherService), legitimate live TeacherService conversion without cross-service fallback, Back/Forward + compare URL state, a11y semantics (external screen-reader session not performed; not a blocking defect), targeted 390/1440 + 375 CTA, rate-limit-aware 16/16 with 0 unexpected 429, sequential backend 1/89/5/226, EF clean, Release build, isolated `:5092` publish smoke then stop.

See the [first-pass evidence index](./evidence/phase4-release6-discovery-conversion/final-summary.md), [final-acceptance pack](./evidence/phase4-release6-discovery-conversion/final-acceptance/final-summary.md), and [retrospective](../reports/PHASE_4_RELEASE_6_DISCOVERY_AND_CONVERSION_RETROSPECTIVE.md).
