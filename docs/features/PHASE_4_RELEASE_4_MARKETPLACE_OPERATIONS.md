# Phase 4 — Release 4 — Marketplace Operations

Date: 2026-08-08  
Verdict: **RELEASE 4 — MARKETPLACE OPERATIONS CONDITIONALLY VERIFIED**

Sprint 1 delivered Admin Review Moderation Discovery only. This pass completed the remaining Release 4 operational system as one product release (not Sprint 2/3/4).

Master prompt: [PHASE_4_RELEASE_4_MARKETPLACE_OPERATIONS_COMPLETE_RELEASE.md](../prompts/PHASE_4_RELEASE_4_MARKETPLACE_OPERATIONS_COMPLETE_RELEASE.md)  
Evidence: [phase4-release4-marketplace-operations](./evidence/phase4-release4-marketplace-operations/)  
Retrospective: [PHASE_4_RELEASE_4_MARKETPLACE_OPERATIONS_RETROSPECTIVE.md](../reports/PHASE_4_RELEASE_4_MARKETPLACE_OPERATIONS_RETROSPECTIVE.md)

## Architecture

Operational UI is a projection over existing TeacherApplication, TeacherSubjectQualification, TeacherTeachingSample/Showcase, and TeacherReview truth. No new domains, workflow engines, notification systems, or migrations.

## Sort decision

- **Quality queues default OldestFirst (FIFO).** Actionable work should be processed in submission order. NewestFirst remains an explicit sort.
- **Admin Reviews default Newest.** Matches existing Admin convention and Sprint 1.

## Findings classified before change

| Finding | Class | Action |
|---|---|---|
| Quality queue returned unbounded array; no search/kind/pagination | Missing Feature | Paginated `PagedResult` + filters |
| Quality default dumped Draft/Withdrawn/Approved into “queue” | UI/View Issue | Default scope = Submitted + UnderReview |
| Initial vs Additional not distinguished in ops UI | Missing Feature | Derived projection from other active quals |
| Showcase queue lacked search/summary/item GET | Missing Feature | Extended existing moderation API |
| `notificationRoute` was Student-centric | API Mismatch | Role-aware routing; no new Notification domain |
| Quality dashboard had no inbox | Missing Feature | Notifications section over existing GET /notifications |
| Admin review detail Escape did not close (focus + listener on backdrop) | Production Bug (a11y, Low) | Dialog `tabindex=-1` + `Tafseel.modalKeyDown` + focus |
| Review aggregate has no RowVersion | Technical Debt | Classified; no migration; last-write-wins + rating applock unchanged |
| Named `ShowcaseQueueRow` EF projection 500’d | Production Bug | Restored anonymous IQueryable projection |
| Live Dev actionable application count = 0 | Legacy Compatibility / data | Honest empty state; lifecycle proven in SQL tests |
| Playwright 1440 Quality Auth landings | Test Issue | Auth 10 req/min vs multi-viewport login storm |
| Quality `GET {id}` now returns queue detail wrapper | API Mismatch (intentional) | Quality-only; teachers still use `/mine` |

## What shipped

### Admin Reviews (reconciled, not rewritten)

Server-side list/search/filter/sort/pagination, detail, Hide/Restore, privacy (no student email/id), summary counts, deep link `section=reviews&selectedId|reviewId`. QualityReviewer forbidden at endpoint.

### Quality Applications

Paged queue: status, kind (All/Initial/Additional), scope (Actionable/All), search (teacher name + subject), subject, submitted range, OldestFirst default. Summary counts. Detail + status history + review summaries (internal notes on detail only).

### Additional Subjects

Same workflow. `isAdditionalSubject` + `activeQualifications` so Subject A stays visibly Qualified while Subject B is under review.

### Media / Showcase

Distinct from qualification demos. Queue search/sort/summary/item GET. Authenticated preview unchanged. Production Showcase remains fail-closed.

### IA

QUALITY: Applications / Additional Subjects / Media (showcases) / Notifications / Reports / Settings  
ADMIN: Operations → Reviews + existing Admin surfaces

## Tests

- `Release4MarketplaceOperationsTests` — queue pagination/search/auth, additional-subject independence, admin privacy, showcase queue
- Existing Pass3 concurrency (If-Match stale decision → conflict)
- Playwright `tests/browser/release4-operations-cert.mjs`
- Frontend CI + EF clean + publish smoke

## Remaining gaps (why not VERIFIED)

1. Live Development DB had **0 actionable applications**; browser could not naturally discover a pending Initial/Additional application.
2. Playwright **2/ N** failures were auth rate-limit Test Issues at 1440 Quality.
3. Live F-013 cycles not re-run (Student UAT secret absent this shell).
4. Review moderation still has **no RowVersion** (pre-existing Technical Debt).
5. Full 384-cell Foundation matrix not re-executed (Foundation already closed; static + targeted smoke used).
