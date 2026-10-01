# UX-TEACHER-DISCOVERY-01 — Browse filters and direct service request

| Field | Value |
|-------|-------|
| Release / priority / blocker / size | V1 / P1 / yes / S |
| Owner / status | Engineering / Done |
| Gates | ☑ Business ☑ UX ☑ Contract ☑ Build ☑ E2E |

## Actor, problem and goal

A visitor or student browsing teachers needs results that reflect the selected filters, and a direct request action for the service shown on each card. The Product Contract's teacher eligibility and service capabilities remain server-owned. Previously the URL query was cached, several HTTP parameter names did not match `TeacherSearch`, sort values were unsupported, catalog labels were unmapped, and the card used a profile link for conversion.

## States, happy path and negative cases

The URL remains the source of truth. Entering a search, selecting filters, paging or using Back starts a new query and replaces results only when the latest response returns. Search and filter values map to the server's names (`search`, `serviceTypeId`, `minimumRating`, `maximumPrice`); sort maps to supported values. The card uses the `ContextOffer` returned by the API, so price, service title and request target describe the same offering. An asynchronous service opens `/requests/new`; a live service opens `/sessions/book`. Missing context offers fall back to the public profile. Empty, loading and failed states retain their existing localized messages and retry. Anonymous visitors may browse; the request or booking flow enforces its own sign-in and authorization.

## UX and API contract

Entry: `/teachers`. Primary CTA: “طلب هذه الخدمة” / “Request this service”, or the live-session request label. The name still opens the profile. The closed filter controls use the established marketplace styling; service kind dots are colored and service cards on the profile share aligned facts and button sizes. The mobile view is checked at 390px in Arabic. `GET /api/v1/teachers` and its existing catalog endpoints are unchanged; query names now match the existing server contract. No money action or new error code is introduced.

## Acceptance evidence

- [x] Frontend mapping tests verify catalog labels, primary offer and query names; 582/582 frontend tests passed.
- [x] Strict API gate: 236 route matches, 0 violations.
- [x] Fresh-database browser journey `browse-filters.e2e.mjs` passed at 390px Arabic, including search, sort, CTA, profile service colors and overflow.
- [x] Screenshots: `TestResults/browse-filters/browser/browse-filters/`.

Out of scope: payment design, qualification, Admin promotions, and other requested journeys are separate tickets. No analytics were added.
