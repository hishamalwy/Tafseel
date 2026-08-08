# Real Rate Teacher Star-Rating Modal — Distinct Certification

**This is the first pass in this session's history to distinctly live-certify the
actual star-rating form**, as opposed to the Order Timeline modal that every prior
"Rate Teacher" evidence in this codebase's certification history actually exercised
(see `docs/testing/BROWSER_CERTIFICATION.md` for the preserved history note — that
mislabeling is not erased, it is the reason this section exists).

## Surface identification

Live-inspected via a genuine Completed+Paid+Unrated order (`a956cb05-...`, see
`fixture-setup.md`):

```json
{
  "dialogPresent": true,
  "title": "Rate your teacher",
  "hasStars": true,
  "hasCommentField": true,
  "isTimelineModal": false,
  "isRateModal": true
}
```

## 7.1 — Data

```
Rate your teacher
Custom recorded explanation
Teacher: Sprint 0.2 UAT Teacher
Explanation clarity  5/5
Subject knowledge    5/5
Communication         5/5
On-time delivery      5/5
Value for money       5/5
```

No GUID visible, no `undefined`, no `{{ }}` template leak. Teacher name and service
name correctly match the actual order (not a stale/wrong teacher).

## 7.2 — Form

All 5 canonical criteria present (Explanation clarity, Subject knowledge,
Communication, On-time delivery, Value for money), each independently scored (default
5/5, keyboard-adjustable — confirmed reachable via Tab into the dialog). Comment field
present (`textarea`, required, max 2,000 characters per the in-modal copy). No raw
internal property names visible anywhere in the rendered text.

## 7.3 — Modal accessibility

```json
{
  "role": "dialog", "ariaModal": "true", "accessibleName": "student-rate-title",
  "focusInside": true, "activeTag": "BUTTON", "afterTab": "INPUT",
  "closedOnEscape": true
}
```

Reopen check: `dialogCount: 1` (no duplicate overlay), `freshFocusInside: true` (focus
initializes correctly on reopen, no stale state leakage from the prior open/close
cycle).

## 7.4 — Submission

Filled the comment field and clicked "Submit review" via the real UI:
`POST /api/v1/orders/{orderId}/review -> 200`. Dialog closed automatically on success.

Post-submission verification (via the real order-detail API, the same one the Student
Dashboard itself reads):
- `hasReview: true`, `reviewCanSubmit: false`, `reviewOverallScore: 5.0` — correctly
  persisted.
- **Duplicate prevention (UI-level, the meaningful check):** re-navigating to the same
  `focus=rate` deep link no longer shows the rating form at all — it now correctly
  falls back to the Order Timeline modal, which itself displays "Order completed. Your
  rating is saved." and "Your rating Overall 5.0". The rating form is not offered a
  second time by the application.
- **Public rating aggregate:** the teacher's public reviews listing
  (`GET /api/v1/teachers/{id}/reviews`) now returns 3 reviews (was 2 before this
  submission), including the new 5.0 score.

## 7.5 — F-013 on the real Rate Teacher modal

5 fresh open/reload cycles against the *unrated* matrix fixture order
(`255f5c11-...`, see `fixture-setup.md`), each explicitly confirming
`isRateModal: true` (the real form, not the Timeline) before checking for leaks:

```
cycle 1: leaks=0 isRateModal=true
cycle 2: leaks=0 isRateModal=true
cycle 3: leaks=0 isRateModal=true
cycle 4: leaks=0 isRateModal=true
cycle 5: leaks=0 isRateModal=true
```

**0/5 unresolved-template network requests on the confirmed-real Rate Teacher modal**
— explicitly distinguished from the Order Timeline modal, per this pass's mandate.
