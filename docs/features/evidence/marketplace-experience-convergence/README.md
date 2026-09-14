# Marketplace Experience Convergence — Evidence

Captured 2026-08-11 against local Development `http://127.0.0.1:5090`.

## Public (Family A)

| Cell | Landing | Browse | Post Request |
|---|---|---|---|
| 1440 AR Dark | `rtl/landing-1440-ar-dark.png` | `rtl/browse-1440-ar-dark.png` | `rtl/post-request-1440-ar-dark.png` (guest → Auth continuation) |
| 1440 EN Light | `public/landing-1440-en-light.png` | `public/browse-1440-en-light.png` | `public/post-request-student-1440-en-light.png` (authenticated form) |
| 390 AR Light | `public/landing-390-ar-light.png` + `mobile/landing-menu-390-ar-light.png` | `public/browse-390-ar-light.png` | `public/post-request-390-ar-light.png` (guest → Auth) |
| 390 EN Dark | `dark/landing-390-en-dark.png` | `dark/browse-390-en-dark.png` | `dark/post-request-390-en-dark.png` |

Landing hero composition is unchanged. Desktop nav is Browse teachers / Post a Request / How it works. Mobile menu exposes the same two Student jobs.

This Development database currently has **zero publicly eligible Teachers** (`GET /api/v1/teachers` totalCount 0), so Browse shows the canonical empty state and Profile was not recaptured here.

## Student (Family B)

- `student/overview-1440-en-light.png` — Find a teacher + Post a Request CTAs; Learning nav has My Requests, not Offers.
- `student/requests-1440-en-light.png` — Direct Request + Order rows in one My Requests list; Open Requests filter.
- `student/post-request-1440-en-light.png` — Consumer marketplace Post Request form; Find a Teacher instead.
- `student/overview-390-ar-light.png` — RTL Arabic overview with both CTAs.

## Teacher (Family B)

- `teacher/overview-1440-ar-dark.png` — Work group: Direct Requests, Opportunities, Active Orders. View Opportunities stays on the Teacher Dashboard.
- `teacher/opportunities-1440-ar-dark.png` — Full Opportunities surface inside `tf-dashboard-shell`. Empty vs loading distinguished.
- `teacher/opportunities-390-en-dark.png` — Mobile Opportunities empty state.

## Focused (Family C)

- `focused/payment-1440-en-light.png` and `focused/payment-student-1440-en-light.png` — workflow header, no dashboard sidebar.

## Harness

`tests/browser/marketplace-experience-convergence.mjs` + `regression/ia-cert.json`.
