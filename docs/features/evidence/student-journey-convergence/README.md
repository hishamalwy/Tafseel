# Student Journey Convergence — evidence

Captured 2026-08-16 against a live Development instance on `http://127.0.0.1:5099`
(isolated build output; the concurrent session's server on 5090 was left running).
Logins are real application logins through `Tafseel-Auth.dc.html`. No forged
tokens, no raw SQL fixture mutation.

## Layout

- `before/` — baseline, captured before any change in this pass.
- `after/` — post-change matrix for every surface this pass touched.
- `shot-errors.json` — pageerror / HTTP 5xx recorded per cell (empty = clean).

## Matrix

Each surface is captured at **1440 EN light**, **1440 AR dark**, **390 AR light**
and **390 EN dark**.

| Surface | Directory | Shows |
|---|---|---|
| Landing, guest | `after/landing/landing-guest-*` | Post a Request primary, Browse teachers secondary, Become a teacher shown, How Tafseel Works card |
| Landing, Student | `after/landing/landing-student-*` | "Your requests" module replacing How Tafseel Works; Direct badges, status, due date, per-row CTA, View all |
| Landing, Teacher | `after/landing/landing-teacher-*` | View opportunities primary; **no** Student conversion CTA; Become a teacher hidden |
| Student Dashboard | `after/student-dashboard/student-overview-*` | Corrected "Post a Request" CTA; attention CTAs aligned in their own column; recessed attention panel |

## Capture notes

The harness scrolls each page and then **waits for every `data-reveal` element to
settle opaque** before capturing. Without this, reveal-on-scroll sections are
still at `opacity:0` when a full-page screenshot is taken and working UI is
misreported as dead space — that artifact was hit and corrected during this pass,
so any blank region in these images is real.

Evidence shots seed a dismissed campaign in `localStorage`, exercising the real
Part 16 suppression path rather than hiding the dialog with CSS.

## Behavioural gate

`tests/browser/convergence-promo-gate.mjs` — 13 assertions covering single-campaign
presentation, dismissal persistence across reloads, the engagement record shape,
no drip-feeding of the campaign backlog, and cooldown lapse. Run with:

```bash
TAFSEEL_BASE_URL=http://127.0.0.1:5099 node tests/browser/convergence-promo-gate.mjs
```

## Not covered

The awaiting-payment Landing module, the full Student and Teacher E2E journeys,
and the Quality/Admin/Payment/Open Request surfaces are **not** represented here.
See the *Deferred Items* section of
[the implementation report](../../../reports/STUDENT_JOURNEY_AND_UI_CONVERGENCE_IMPLEMENTATION_2026_08.md).

---

## Closure continuation (2026-08-17)

`closure/` holds evidence from the blocker-closure pass.

| Directory | Shows |
|---|---|
| `closure/open-request/` | Simplified Post a Request form + searchable Subject picker (1440 EN light, 390 AR light) |
| `closure/profile/` | Teacher self-view (Manage services / Edit profile, no purchase actions) vs Student view |
| `closure/e2e/` | Real Landing awaiting-payment state, plus `e2e-log.txt` and `e2e-state.json` |
| `closure/awaiting-payment/` | Needs Attention "Payment due" and Teacher dashboard after the Offer |

### E2E

`tests/browser/convergence-e2e.mjs` drives Student → Teacher → Offer → Select
through the application's own authenticated API client. No forged tokens, no raw
SQL. It records the request id, offer id and the server-issued reservation.

```bash
TAFSEEL_BASE_URL=http://127.0.0.1:5099 node tests/browser/convergence-e2e.mjs
```

### Behavioural gates

```bash
node tests/browser/convergence-promo-gate.mjs
node tests/browser/convergence-open-request-gate.mjs
node tests/browser/convergence-role-profile-gate.mjs
```

Run `convergence-role-profile-gate` **alone**. The Development auth policy is
10 req/min; back-to-back gate runs can drop its session, and the gate exits 2
with a "re-run alone" message rather than reporting a false product failure.
