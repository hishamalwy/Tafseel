# Phase 3 Release 3 Sprint 5 — Post-Purchase Experience

Date: 2026-08-02  
Scope: Student Order Timeline / progress / delivery review / completion confidence — frontend only. No lifecycle, settlement, payment, pricing, or revision-rule changes. No commit / push / deploy.

Evidence: [phase3-r3-sprint5-post-purchase](./evidence/phase3-r3-sprint5-post-purchase/)

## Summary

Post-payment UX lived entirely in `Tafseel-Student-Dashboard.dc.html` as a work table + thin timeline/review/rate modals. Lifecycle actions were already correct after the July recovery; what Students lacked was **purchase continuity**: current-step clarity, commercial context, honest waiting guidance, delivery version clarity, and a working return path from Payment (`?section=orders` blanked the main pane).

This sprint upgrades the Order Timeline into a post-purchase “hero + progress + events” surface and hardens delivery review / rating copy — without inventing percentages, ETAs, or KPIs.

## Product findings

1. **Deep-link dead end (critical).** Payment success linked to `?section=orders`, but dashboard sections are `overview|requests|…`. Unknown `section` blanked `<main>` — Students returning from checkout saw an empty shell.
2. **Context loss.** Rows/modals dropped catalog service names, teacher avatar, revision remaining, order/request refs, and “what should I do now?” guidance after payment.
3. **Misleading status tone.** Paid-but-unstarted orders (`Status=AwaitingPayment`, `PaymentStatus=Paid`) used error-red chips via `statusToneStyle(kind, rawStatus)` ignoring payment.
4. **Timeline = history only.** No current-step map; first-time Students could not see Payment → Work → Delivery → Review → Done.
5. **Delivery versioning weak.** Review modal listed deliveries without newest-first / “Latest” / “Delivery n of total”.
6. **Completion dead-end risk.** Rating modal lacked “files remain available / verified reviews only” reassurance.

## UX findings

1. Timeline/review/rate used dense inline styles; no shared `.tf-order-*` system.
2. Waiting states (`payment_confirmed`, `in_progress`, `revision`) had **no student CTA** (correct) but also **no guidance** (anxiety).
3. Progress step grid wrapped awkwardly at modal width (~640px) when breakpoint was 640px — tightened to 480px.
4. Browser/DC script caching made `tafseel.js` upgrades sticky; dashboard now includes a local `orderProgressSteps` fallback and `Tafseel.__build` gate.

## Trust findings

- Guidance and progress use only persisted stage / Order DTO fields — **no % complete, no ETA bars, no fabricated SLAs** (F-002 / ADR-005).
- Approve hint restates hold-until-approve release language already used on Payment.
- Rating note states files remain available and reviews are verified-only — no popularity claims.
- Revision remaining shows allowance − used from Order DTO only.

## Communication findings

- System timeline events remain the source of truth (“What happened”).
- Stage guides explain waiting without requiring support.
- Order-threaded chat is still out of scope (generic Messages remain); envelope FAB is global chat, not order-scoped.

## Timeline findings

| Stage | Progress current | Guide |
|---|---|---|
| awaiting_payment | Payment | Pay required before teacher starts |
| payment_confirmed / in_progress | Teacher working | Waiting / teacher working; notified on delivery |
| revision | Delivery | Waiting for updated delivery |
| delivered | Your review | Review files; approve or request revision |
| completed | Completed | Files available; can rate |
| cancelled | muted | Cancelled |

## Product recommendations

1. **Keep modal-over-table** for Release 3; consider a dedicated Order Detail route only if Timeline abandonment warrants it.
2. **Next:** Reviews / rating list surface + notification deep-links to a specific order (still no invented KPIs).
3. **F-005** (revision↔delivery linkage) remains a schema decision — UI already labels deliveries by chronological count only.
4. **Service name projection** depends on Order DTO catalog snapshots — ensure seeds always populate `ServiceName*`.
5. **Cache busting** for shared `tafseel.js` in Development (build marker) should stay when iterating dashboards.

## Root cause

Post-payment was treated as an **ops worklist**, not the continuation of Payment’s commercial confidence. Presentation recovered actions; return-path `section=orders` and red “payment confirmed” chips then actively increased anxiety. Timeline events answered “what happened” but not “where am I / what now.”

## Implementation

Frontend-only:

- **`js/tafseel.js`** — richer `projectStudentWorkList` (service, teacherId/avatar, refs, guideKey, revisions remaining); `statusToneStyle` + payment; `orderProgressSteps`; `__build: 'r3s5'`.
- **`Tafseel-Student-Dashboard.dc.html`** — safe `section=orders` mapping (initial state + didMount allowlist); order hero + progress + events; delivery Latest/version cards; rating after-note; local progress/tone fallbacks; row guidance + avatars.
- **`Tafseel-Teacher-Dashboard.dc.html`** — pass `paymentStatus` into status chips.
- **`css/tafseel.css`** — `.tf-order-*` dialog/hero/progress/events/delivery.
- **`js/locales.js`** — EN/AR guides, steps, hero labels, delivery/rating copy.

## Browser validation

Host: `http://127.0.0.1:5090` (Release, `TafseelLocalDb`), student `student@gmail.com`.

| Case | Result |
|---|---|
| `?section=orders` | Maps to My Work + Orders filter; main content renders |
| Payment-confirmed row | Info guidance under chip; View timeline |
| Timeline hero | Teacher, status, delivery, revisions left, paid total, order ref, 5-step progress (current = Teacher working), events |
| Delivery review | Newest-first + Latest + Delivery n of total (when Delivered) |
| Console | No logic errors after local progress fallback |
| Frontend CI | Localization 2889, usage, integrity, JS, BUG-001 passed |

Evidence: `timeline-en-light-desktop.png`.

## Tests

| Gate | Result |
|---|---|
| `check-localization.mjs` | Passed — 2,889 paired keys |
| `check-localization-usage.mjs` | Passed |
| `check-frontend-integrity.mjs` | Passed |
| `check-js.mjs` | Passed |
| `check-bug001-display-names.mjs` | Passed |
| `dotnet build -c Release` while API running | File lock on Infrastructure.dll — rebuild deferred; prior Release binary + hot-copied frontend used for browser |

## Files changed

- `Tafseel-Student-Dashboard.dc.html`
- `Tafseel-Teacher-Dashboard.dc.html`
- `js/tafseel.js`
- `js/locales.js`
- `css/tafseel.css`
- `docs/fixes/PHASE_3_RELEASE_3_SPRINT_5_POST_PURCHASE_EXPERIENCE.md`
- `docs/fixes/evidence/phase3-r3-sprint5-post-purchase/*`
- `docs/INDEX.md`
- `docs/PROJECT_STATUS.md`

## Remaining limitations

1. Not every viewport×locale screenshot pair captured this sprint (sampled EN light desktop timeline).
2. Delivered / revision / completed live paths not re-driven end-to-end (paid-waiting fixture used).
3. Catalog service title may still show “Personalized service” until Order DTO snapshots are populated on older fixtures.
4. Files / Reviews nav stubs unchanged.
5. Order-scoped messaging not built.

## Risks

Low. Presentation-only. Local progress fallback avoids cached-`tafseel.js` crashes. Allowlisting unknown `section` values prevents blank mains.

## Next step

**Release 3 close-out candidate:** Student Reviews / notification deep-links / archive clarity — still no invented KPIs; still no settlement changes.

Roadmap: Phase 3 Release 3 — Browse ✓, Profile ✓, Request ✓, Payment ✓, Post-purchase Timeline ✓; Reviews/Archive remaining for Release 3/4 finish.

## Final verdict

**POST-PURCHASE EXPERIENCE CONDITIONALLY VERIFIED.** Deep-link recovery, order hero, honest progress steps, waiting guidance, and delivery-version clarity are browser-proven on authenticated Development data without changing lifecycle or payment rules. Conditional for remaining state fixtures and full responsive screenshot matrix.
