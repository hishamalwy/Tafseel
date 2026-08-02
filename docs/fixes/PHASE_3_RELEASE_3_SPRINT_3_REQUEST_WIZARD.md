# Phase 3 Release 3 Sprint 3 — Request Wizard Consumer Experience

Date: 2026-08-02  
Scope: Student Request Wizard only — product/UX/conversion audit and frontend conversion fixes. No business-rule, pricing, payment, qualification, or marketplace-governance changes. No commit / push / deploy.

Evidence: [phase3-r3-sprint3-request-wizard](./evidence/phase3-r3-sprint3-request-wizard/)

## Summary

The Guided Request wizard (ADR-008) already had a solid five-step structure, drafts, service prompts, and honest attachment chaining. What it lacked for a premium marketplace purchase flow was **persistent commercial context** and **honest post-submit next steps**. Students lost sight of teacher / price / delivery / revisions after step 1; the success dialog misused catalog `deliveryHours` as a fabricated “usually replies within X hours” SLA; review pricing conflated budget preference with amount due; and mobile progress labels collided.

This sprint fixed those conversion leaks without touching APIs, payments, or catalog rules.

## Product findings

1. **Context loss (critical).** Steps 2–4 showed no sticky summary of teacher, selected service, listed price, estimated delivery, revisions, qualified subject, or payment protection — Students could forget what they were buying.
2. **False reply SLA (trust).** Success copy used `service.deliveryHours` as teacher response time. Delivery hours are work-delivery estimates, not reply SLAs — an integrity violation in the same family as F-002.
3. **Payment timing ambiguity.** Review implied a “total” that looked payable now; the real lifecycle is Request → Teacher accept → Payment.
4. **Service cards under-informed.** Profile shows delivery + revisions; wizard cards showed only title/description/price.
5. **Success was a dead-end.** One dashboard link, no “what happens next” path.

## UX findings

1. Mobile progress labels for “Deadline & budget” overlapped “Review” at 375.
2. An attempted sticky panel footer (`inset-block-end:0`) pulled Continue/Submit into the middle of long review content — reverted to normal document-flow nav.
3. Upload control used an emoji glyph; protection used 🛡 — inconsistent with the SVG language on Profile/Browse.
4. Goal field lacked guidance beyond the placeholder (blank-page anxiety).
5. Profile return link used `?teacherId=` (still accepted) but canonical Profile entry is `?id=` — aligned to `id`.

## Conversion findings

Against Preply / Italki / Fiverr purchase confidence (not visual cloning):

| Question | Before | After |
|---|---|---|
| What am I buying? | Only clear on step 1 | Always visible in context rail |
| From whom? | Easy to lose | Sticky teacher + qualification badge |
| For how much? | Price on step 1 / confused total on review | Listed price always + budget preference separate |
| When will I receive it? | Missing mid-flow | Estimated delivery from catalog hours |
| What happens next? | Fake reply hours | Honest 4-step next path |

## Product recommendations

Respecting ADR-005, ADR-008, F-002, and marketplace governance:

1. **Keep five steps** (do not merge Deadline into Review yet) — Guided Request prompts + checklist already depend on this shape; merge only after measured abandonment data.
2. **Next sprint (Payment):** apply the same persistent commercial summary on Payment / Mock Checkout so the Student never loses “what / whom / how much” between accept and pay.
3. **Optional files reminder:** progress marks Files “done” when visited even with zero files; consider a softer progress state vs checklist (do not invent completion metrics).
4. **Arabic plural polish** for `2 أيام` shares Profile’s `formatDelivery` pattern — fix once shared helper is extracted.
5. **Do not surface unused `req_platform_fee` (8%)** — no approved fee display rule in this release.

## Root cause

The wizard was built as a form for Learning Request creation, not as a **purchase continuation of Teacher Profile**. Commercial facts lived on Profile’s conversion card and were dropped at the wizard boundary. Success messaging then borrowed the nearest numeric field (`deliveryHours`) to invent reassurance. Mobile label overlap was label length + dense five-step chrome without truncation.

## Implementation

Frontend-only:

- **`Tafseel-Request.dc.html`** — persistent commercial context rail; service-card delivery/revisions; review price clarity; honest success next-steps + dual CTAs; SVG upload/protection; goal hint + char count; progress label state; profile `?id=` links; 44px nav targets.
- **`css/tafseel.css`** — `.tf-req-*` layout (sticky context ≥960px, mobile fact grid, progress ellipsis, upload focus, success-step number-only styling).
- **`js/locales.js`** — EN/AR keys for context, pay-after-accept, success next steps, goal hint, shortened progress “Deadline” / “الموعد”; success body no longer claims reply hours.

No backend, schema, pricing, payment, or qualification changes.

## Browser validation

Host: `http://127.0.0.1:5090` (Development, `TafseelLocalDb`), teacher `f64f6c10-d606-498f-a637-920224d44e1c`, student `student@gmail.com`.

| Case | Result |
|---|---|
| Missing teacher | Honest “Teacher required” + Browse CTA |
| 1440 EN light — step 1–5 | Context rail sticky; delivery/revisions; pay-after-accept; overflow 0 |
| 375 / 390 | Progress labels no longer collide; overflow 0; context above form |
| AR RTL + dark — review + submit | Localized context + success next steps; overflow 0 |
| Success dialog | Honest body + 4 next steps + “Go to my requests” + “Back to teacher profile” |
| Success-step CSS regression | Number circle styles only `li > span:first-child` (text no longer crushed) |
| Keyboard | Step heading focus on advance preserved |
| Console | No errors observed on validated states |

Evidence: `desktop-en-light-1440-review.png`, `mobile-ar-dark-390-success.png`.

## Tests

| Gate | Result |
|---|---|
| `dotnet build … -c Release` | Passed (0 errors; pre-existing nullable warnings elsewhere) |
| `check-guided-request.mjs` | Passed |
| `check-localization.mjs` | Passed — 2,835 paired keys |
| `check-localization-usage.mjs` | Passed |
| `check-frontend-integrity.mjs` | Passed — 13 entry points |
| `check-js.mjs` | Passed |
| `check-bug001-display-names.mjs` | Passed |
| Unrelated domain/integration suites | Not re-run (frontend-only) |

## Files changed

- `Tafseel-Request.dc.html`
- `css/tafseel.css`
- `js/locales.js`
- `docs/fixes/PHASE_3_RELEASE_3_SPRINT_3_REQUEST_WIZARD.md`
- `docs/fixes/evidence/phase3-r3-sprint3-request-wizard/*`
- `docs/INDEX.md`
- `docs/PROJECT_STATUS.md`

## Remaining limitations

1. Full multi-file upload browser matrix not re-driven this sprint (attachment chaining unchanged from ADR-008).
2. Progress chrome still marks visited Files step complete with zero files (checklist correctly shows recommended incomplete).
3. Arabic day pluralization remains Profile-parity approximate (`2 أيام`).
4. Teacher approach text may appear as service description when Teachers store short approach strings (content quality, not wizard logic).
5. Payment / Mock Checkout screens were not redesigned in this sprint.

## Risks

Low. Presentation-only. Reverting locales restores old success copy. Context rail depends on existing public teacher DTO fields (`price`, `deliveryHours`, `revisions`, `trustBadges`).

## Next step

**Sprint 4 candidate:** Payment + Mock Checkout consumer confidence — same commercial context rail, fee honesty, return flows — still without inventing KPIs or changing payment math.

Roadmap: Phase 3 Release 3 is ~3/4 through consumer surfaces (Browse ✓, Profile ✓, Request ✓, Payment/Timeline/Reviews remaining).

## Final verdict

**REQUEST WIZARD CONVERSION PASS CONDITIONALLY VERIFIED.** Persistent commercial context, honest success path, and mobile progress clarity are browser-proven on authenticated Development data. Conditional only for optional multi-file upload re-certification and Payment-surface follow-through, which were explicitly out of this sprint’s scope.
