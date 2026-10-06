# UX/UI craft implementation — 2026-10-05

| Field | Value |
|---|---|
| ID | CRAFT-2026-10-05, child scopes UX-01..13 then UI-01..10 |
| Release | V1 presentation refinement |
| Priority | P1/P2/P3 as recorded in the audit |
| Blocker | No new business/provider decisions |
| Size | Sequential small batches; never more than two independent scopes active |
| Owner | Codex, authorized by Product Owner in this chat |
| Status | Complete — 13 UX scopes verified before 10 UI scopes |
| Gates | 1–3 recorded below; 4 Build and 5 published-browser verification complete |

## Actor / problem / user goal

Visitor, Student, Teacher, QualityReviewer, Admin and Finance. The accepted audit identifies 13 UX and 10 UI opportunities. Users need complete discovery, protected edits, reliable saving/recovery, clear comparison and preview, and consistent accessible interaction. Audit evidence and final bilingual directions: `docs/audits/2026-10-05/UX.md`, `UI.md`, `COVERAGE.md`.

## Business rule / states / authorization

Product Contract §§2, 3.1–3.3, 7a remains authoritative: roles remain unchanged; budget is guidance; teacher offers are facts, not a ranking; a live offering remains hourly and student payment follows acceptance. Protected files stay behind authorized content endpoints. This work changes presentation/local navigation state, not domain states, fees, eligibility or providers. Existing participant/role checks, 404/403, If-Match and idempotency remain authoritative. No new server paths or API shapes.

## Preconditions / happy path / negative cases

The incumbent implementation is the starting point; its uncommitted changes are preserved. Bilingual local published builds and disposable SQL/browser fixtures are available. Implement UX scopes sequentially, verify them, then implement UI scopes. For each scope, demonstrate the audit direction in its actual page and maintain keyboard, RTL and Arabic 390px. Check failure/retry, refused uploads, stale saves, missing resources, cancelled confirmation and browser Back where relevant. No real payment, transfer, publication or external message is needed for verification.

## UX

- Entry points, hierarchy and final AR/EN wording follow the accepted audit. Existing service facts and public identity remain authoritative.
- Primary actions remain real V1 actions; comparison/preview are local display of existing facts.
- Mobile: filters are usable at 390px; forms/compare/preview stack with visible focus and real touch targets.
- Loading, empty, error and unavailable states are distinct; a failed load never pretends the collection is empty.
- Non-sensitive unsaved edits are guarded; credentials and financial details are not stored locally.
- Confirmation preserves the stated consequence and existing authorization.
- Gate question: yes, each change expresses a user task without backend terminology.

## API contracts

| UI action | Endpoint / verb / request / headers | Response / server state |
|---|---|---|
| Existing load/save/upload/publish/financial actions | Existing ports and gateways unchanged; request and headers preserved | Existing DTOs and transitions unchanged |
| Filter/context/compare/preview/theme/motion changes | Local UI only | No server state change |
| File retry | Repeat the existing authorized content request | Same resource, no storage-key exposure |

No new customer error codes; new frontend wording is added in both locale files. Observability: no analytics or external services added.

## Acceptance criteria / tests

- [x] Every UX-01..13 and UI-01..10 has an implemented result and evidence in the completion ledger.
- [x] UX verification completed before UI implementation begins: 642 Angular tests, 8/8 UX browser groups and 9/9 open-marketplace groups.
- [x] Meaningful unit/component tests cover new guards, save races, URL restoration and rendering logic.
- [x] Published-browser tests cover Arabic 390px, keyboard/Back/retry and English/theme variants; screenshots retained.
- [x] .NET build/format/tests, strict API gate, dependency gate, Angular tests/build/i18n/styles pass.
- [x] No app regression is hidden or skipped; new out-of-scope findings are logged rather than silently expanded.

## Out of scope / dependencies

Backend business/financial/provider/storage changes, deployment, commits/pushes, new analytics, ranking, eligibility decisions, product claims and retired capabilities. No new dependency is planned. Dependencies: audit, current tokens/components, existing domain tests and browser harness.

## Evidence / sequential scope ledger

Baseline: `TestResults/ux-ui-implementation/baseline.json`; preserved source copies under `baseline/`. Build/test/browser evidence will live in that TestResults directory. No commit was requested.

| Scope | Result | Evidence |
|---|---|---|
| UX-01 | Subject/service mobile filter panel; URL state and focus return | `ux-ui-craft`, `ux01-mobile-filters.png` |
| UX-02 | Dirty-edit guard for profile, services, account and quality; no sensitive local persistence | Guard unit tests; browser cancelled navigation; `ui01-named-confirmation.png` |
| UX-03 | Support history error/retry distinct from empty; existing data retained | Injected 503 then real retry; `ux03-history-retry.png` |
| UX-04 | Serialized revision-aware draft saving, status/retry, safe upload/save races | Autosave race/error/destroy unit tests; draft retry/reload browser group |
| UX-05 | Quality/support/audit query context, Back and return focus | URL-context unit tests; quality/support/audit reload and Back groups |
| UX-06 | Booking time/duration/cost before brief; compact slot set and show more | Booking browser DOM order; real sending/acceptance in `navigation-polish` |
| UX-07 | Service explanation, title/brief examples and SAR estimated budget copy | `ux07-request-guidance.png`; direct real publication in open-marketplace journey |
| UX-08 | Student CTA copy matches direct open-explanation request | Craft CTA assertion; navigation direct-entry assertion and screenshot |
| UX-09 | Messages role action and dashboard first-use/filter reset actions | `ux09-messages-next-step.png`; navigation first-use/filter groups |
| UX-10 | Protected-file retry in the same dialog; unavailable order/session return actions | Protected-viewer unit retry using same authorized path; missing-order browser group |
| UX-11 | Optional factual offer comparison, captioned scroll table; original offer order | Real two-offer comparison; `wave3b-open-marketplace` 9/9 |
| UX-12 | Shared public/local-preview promotion content, AR/EN preview without publication | SPA promotions tab and bilingual text assertions; `ux12-local-promotion-preview.png` |
| UX-13 | Searchable localized city/zone labels; saved/detected/common ordering; IANA preserved | Timezone unit tests; Arabic Paris search; Unicode source/license retained |
| UI-01 | Native dialogs/viewer named by headings; destructive confirmation starts at Cancel | Dialog/viewer unit tests; browser accessible name and active-element assertion |
| UI-02 | Field-specific semantic border roles in light/dark and input states | Actual computed field contrast ≥3:1 in both themes; light/dark screenshots |
| UI-03 | Shared field name, required, disabled and readonly native contract | Component contract tests; English auth DOM name/required assertion |
| UI-04 | Busy feedback identifies finance action and row, using existing directive | Real payout loop 7/7; delayed instruction response busy-state screenshot |
| UI-05 | Table/queue/form skeleton variants in staff and draft pages; explicit loading state | Held real payments response; table skeleton screenshot, no empty decoration |
| UI-06 | Teacher/booking feature CSS loaded with lazy pages; mixed/shared selectors stay common | 19,246 fewer base CSS bytes; actual lazy teacher/profile/book navigation; keyboard/reduced-motion regression |
| UI-07 | Visible Pause/Resume, pause on keyboard focus, reduced-motion control removal | Visible step/control, 4.5-second focus assertion, pause/resume and media-change assertions |
| UI-08 | Finance segment targets ≥44px | Every rendered segment measured; Arabic 390px no horizontal overflow |
| UI-09 | ThemeService synchronizes meta theme-color with current canvas | DOM meta equals computed canvas in both themes |
| UI-10 | Operational title role and token spacing for marketing | Real promotions page screenshot; shared field/preview integration |

The scope IDs above belong to the 2026-10-05 audit, not the earlier release-control UX ticket numbers.

## Final checks and delivery

All paths below are relative to `TestResults/ux-ui-implementation/`:

| Required check | Result | Evidence |
|---|---|---|
| Release .NET build | Passed, 0 warnings/errors | `dotnet-build.log` |
| dotnet format verify | Passed | `dotnet-format.log` |
| Full Release .NET tests | 940 passed: Domain 154 + Application 14 + Architecture 1 + Integration 771; 0 skipped | `dotnet-test-local-sql.log` |
| Latest client-focused integration checks | 233 passed | `final-client-integration.log` |
| Strict API contract | 301 call shapes matched, 0 violations | `api-contract.log` |
| Dependency vulnerability check | 0 reported | `vulnerable-packages.log` |
| Final Angular tests/guards | 83 files, 645 passed; locale/style/skip-link checks pass | `ui-final-tests.log` |
| Final production client/API publish | Passed; initial 714.41 kB below 720 kB budget | `final-publish.log` |
| Final UX/UI browser groups | 11/11 | `final-browser/ux-ui-craft.log` |
| Navigation and original polish coverage | 7/7 | `final-browser/navigation-polish.log` |
| Real open-marketplace comparison/payment journey | 9/9 | `ux-browser/wave3b-open-marketplace.log` |
| Real withdrawal/Finance authorization journey | 7/7 | `ui-browser/fin02-payout-loop.log` |

LocalDB was unavailable on this host. Full tests and disposable published-browser fixtures were rerun successfully against the installed SQL Server at localhost; no tests were disabled. The xUnit discovery log reports deduplicated generated data rows; the executed test summary has 0 skipped. Financial assertions include existing outsider/wrong-role/participant restrictions; the UI work adds no new authorization or money rules.

Delivery: [Arabic Before/After/Why report](UX_UI_CRAFT_COMPLETION_2026_10_05.md), and `TestResults/opportunities-gallery/ux-ui-2026-10-05/index.html` with 23 new scopes plus the previous 17. Original PNGs, source hashes and exact local asset/navigation measurements are in the gallery manifest. Existing dirty backend/provider changes predate this task and were preserved.

Verification scope: this is a source-backed implementation with representative actual browser journeys, not a claim that every role × state × language × viewport permutation or production Core Web Vitals was measured. No rule, fee, provider, API shape or EF model change was needed.
