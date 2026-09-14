# Tafseel — Marketplace Experience Convergence

Date: 2026-08-11  
Verdict: **MARKETPLACE EXPERIENCE CONVERGENCE VERIFIED**  
No commit / push / deploy.

Evidence: [docs/features/evidence/marketplace-experience-convergence/](../features/evidence/marketplace-experience-convergence/)

---

## Executive Verdict

The Open Request capability is no longer presented as a later-added mini-product. Find a Teacher and Post a Request are two sourcing strategies inside one Tafseel marketplace. After publish, Students manage work in My Requests. Teachers act on Opportunities under Work inside the Teacher Dashboard. Payment remains a focused checkout. Canonical domain is unchanged: `LearningRequest` + `TeacherOffer` + existing Payment + existing Order.

## Existing Product Architecture

Preserved:

- Public discovery: Landing, Browse Teachers, Teacher Profile
- Direct Request wizard → Payment → Order
- Open sourcing: `RequestSourcingMode.OpenMarketplace`, `TeacherOffer`, two-hour reservation, qualified-Teacher file access
- APIs under `/open-marketplace/*`
- Shared `css/tafseel.css`, `js/tafseel.js`, Saudi Riyal renderer

No second Request, Offer, Order, Payment, messaging, or file-storage domain was created.

## Previous IA Problem

`Tafseel-Open-Marketplace.dc.html` had become a mixed-role shell (Student create, Teacher Opportunities, Student Offers, payment-required) while Student and Teacher dashboards already owned management. That duplicated IA and made Open Marketplace feel bolted on.

## Canonical Student Mental Model

Need help → Find a Teacher **or** Post a Request → Direct Request **or** Teacher Offers → Payment → Order → delivery / revision / review.

## Canonical Teacher Mental Model

Teacher Dashboard → Work → Direct Requests **or** Opportunities **or** Active Orders. Opportunity → Submit Offer → selected / waiting payment → Order after payment only.

## Three-Shell Product Architecture

| Family | Surfaces | Chrome |
|---|---|---|
| A Consumer Marketplace | Landing, Browse, Profile, Post a Request | Public header, 68px, marketplace world |
| B Operational Dashboard | Student, Teacher, Quality, Admin | `tf-dashboard-shell`, grouped nav, header bell |
| C Focused Workflow | Direct Request, Book Session, Payment, Checkout, Teacher Apply | `tf-workflow-header`, no sidebar |

No fourth `.om-*` visual island remains.

## Public Marketplace

Desktop nav priority: Browse teachers → Post a Request → How it works. Teacher acquisition remains Become a Teacher on Browse/Profile and in mobile menus. Landing desktop nav is not overloaded.

## Landing Freeze

Hero composition, visual design, section layout, motion, and art direction were not redesigned. Only journey links were aligned: public header, mobile menu, and compact footer expose Post a Request beside Browse.

## Browse Teachers

Remains canonical Teacher discovery. Public header includes Post a Request. Guest Log in uses `Tafseel.authHref`. This Development database currently has zero publicly eligible Teachers, so Browse shows the canonical empty state.

## Post a Request

`Tafseel-Open-Marketplace.dc.html` is now the public Post Request entry (`body.tf-mk-world`, marketplace header). Canonical fields preserved: Subject, async Service, title, requirements, deadline, optional files, optional budget range, visibility, publish review. After publish, the Student continues to Student Dashboard Request Detail.

## Auth Continuation

Guests hitting Post a Request are sent to Auth with a safe `return` URL (`Tafseel.authHref` / `api.requireSession`). Authenticated Students see the form. Teachers/Admin/Quality are routed to their dashboard (Teachers to Opportunities). Intent is not dropped.

## Student Dashboard

Overview exposes **Post a Request** and **Find a teacher**. Needs Attention includes selected-offer payment (`sd_attention_payment_offer` → Pay now → Request Detail). Notification Bell remains header-only.

## My Requests

One Learning destination. Direct Requests, Open Requests, and Orders share the list. Sourcing is a badge/filter (`Open Request` / `Direct Request` / `Order`), not two account systems.

## Direct vs Open Request

Same My Requests surface. Filters: All open, Open Requests, Pending requests, Orders, Completed. Entry paths stay separate: Browse/Profile vs Post a Request. Forms are not merged into one overloaded toggle.

## Offers

Top-level Student Offers nav removed. Offers mount inside Request Detail via `TafseelOpenMarketplace.mountStudentRequest`. Each Offer: Teacher identity, qualification, rating, price, delivery, proposal, View Profile, Select.

## Teacher Profile Return Context

Offer → Profile writes `sessionStorage tafseel.teacherProfileReturn` (no sensitive query-string return). Profile breadcrumb becomes Back to Offers when that context is valid.

## Awaiting Payment

Request Detail shows selected Teacher, price, delivery, two-hour timer, Continue to Payment, Cancel selection. Needs Attention surfaces the same job. Work does not start before payment.

## Teacher Dashboard

Overview keeps a compact Opportunities preview and **View Opportunities** / View all, both targeting `Tafseel-Teacher-Dashboard.dc.html?section=opportunities`.

## Teacher Opportunities

Full surface lives in `#tf-teacher-opportunities-work` inside the dashboard shell. Header: Opportunities — open Student requests matched to approved Subjects. Empty and error states are distinct. Competitor names/prices/proposals are not shown.

## Teacher Work IA

```
OVERVIEW    Overview
WORK        Direct Requests, Opportunities, Active Orders, Live Sessions, Messages
MARKETPLACE Services, Availability, Qualifications, Teaching Samples
BUSINESS    Reviews, Earnings, Withdrawals
ACCOUNT     Profile, Settings
```

Opportunities moved out of Marketplace configuration. Direct Requests nav label matches the overview section.

## Marketplace Configuration IA

Services, Availability, Qualifications, Samples remain “how I participate.” They are not the work feed.

## Focused Workflow System

Request, Book Session, Payment, Mock Checkout, Teacher Apply use `tf-workflow-header` (68px, flat public chrome). Payment has no `tf-dashboard-shell`. Direct Request still requires a Teacher.

## Open Marketplace Standalone Migration

Presentation extracted:

| Job | Destination |
|---|---|
| Student create | Public Post Request page |
| Student Offers / selection / awaiting payment | Student Dashboard Request Detail |
| Teacher Opportunities / Offer | Teacher Dashboard |
| Pay | Focused Payment |

The HTML file is retained as the Post Request route plus compatibility redirects (`?requestId` / `mode=offers` → Student; `?opportunityId` / `mode=teacher` → Teacher). Domain APIs were not deleted.

## Route Compatibility

Bookmarked Open Marketplace URLs with request/opportunity query params no longer render the mixed-role mini-app. They `location.replace` into the owning dashboard. Public `/app/Tafseel-Open-Marketplace.dc.html` remains the Post Request URL.

## Notifications

Open Marketplace events continue to feed the existing header Notification Bell. Sidebar Notifications were not restored. No new messaging architecture: pre-payment Proposal, post-payment Order Conversation.

## Messaging

Unchanged compact Chat. Not expanded in this IA pass.

## Files / Security

Qualified-Teacher attachment access is unchanged (active eligible Teacher + approved matching Subject + accessible Request). Public Post Request does not expose private file URLs. Authorization was not weakened.

## Currency

Shared `Tafseel.moneyHtml` / Riyal mark is used for Open Request budget, Offer price, selected Offer, and dashboard amounts. No independent `??` currency path was introduced.

## Arabic / RTL

Locales EN/AR parity held (3433 paired keys). Certified: public nav Post a Request, Student overview CTAs, My Requests sourcing labels, Teacher Work/Opportunities, Post Request form, payment-required copy. 390 AR Student overview and 1440 AR Teacher Opportunities were inspected as rendered pixels.

## Mobile

Public hamburger includes Browse teachers and Post a Request. Student: My Requests → Request → Offers. Teacher: Work → Opportunities. No extra bottom-sheet stack.

## Accessibility

Semantic public nav, progress `aria-current`, live regions on marketplace mounts, 44px controls, Riyal `aria-label`, form labels, focus-visible on marketplace buttons, dashboard drawer unchanged.

## Browser E2E

Harness: `tests/browser/marketplace-experience-convergence.mjs`.

- Public: Landing hero present; Browse + Post Request discoverable; guest Post Request continues to Auth with return; OM query shims leave the mixed-role page; Payment is not a dashboard.
- Student (UAT): Overview CTAs; My Requests contains Direct + Open filter; no Offers nav; Post Request form in marketplace shell; 390 AR RTL overview.
- Teacher (UAT): Opportunities under Work; View all stays on Teacher Dashboard; Opportunities empty state inside dashboard shell.
- Direct Request live conversion was not re-run here because this Dev catalog currently has zero public Teachers. Source contract still requires `teacherId` / `teacherServiceId`.

## Regression

| Gate | Result |
|---|---|
| Architecture | 1/1 |
| Domain | 95/95 |
| Application | 14/14 |
| Integration | 264/264 |
| Frontend `check-js.mjs` (incl. localization, integrity, R6/R7/R9, unified search, OM IA, auth return) | PASS |
| R5 order-communication + Profile mobile CTA | PASS |
| `dotnet format --verify-no-changes` | PASS |
| EF `has-pending-model-changes` | No pending |
| `dotnet build -c Release` | 0 errors (2 pre-existing CS8604 warnings) |
| Isolated publish `:5092` `/health/live` `/health/ready` + Landing + Post Request | 200 |
| Dev `:5090` live/ready during browser cert | 200 |

## Files Changed

This pass (presentation / IA; not an exhaustive dirty-tree dump):

- `Tafseel-Open-Marketplace.dc.html`, `Tafseel-Landing.dc.html`, `Tafseel-Browse-Teachers.dc.html`, `Tafseel-Teacher-Profile.dc.html`
- `Tafseel-Student-Dashboard.dc.html`, `Tafseel-Teacher-Dashboard.dc.html`
- `Tafseel-Request.dc.html`, `Tafseel-Book-Session.dc.html`, `Tafseel-Payment.dc.html`, `Tafseel-Mock-Checkout.dc.html`, `Tafseel-Teacher-Apply.dc.html`
- `css/tafseel.css`, `js/tafseel.js`, `js/locales.js`, `js/open-marketplace.js`, `js/open-marketplace-locales.js`
- `scripts/ci/check-open-marketplace.mjs`, `scripts/ci/check-js.mjs`, `scripts/ci/check-frontend-integrity.mjs`, `scripts/ci/check-guided-request.mjs`, `scripts/ci/check-auth-return.mjs`
- `tests/browser/marketplace-experience-convergence.mjs`
- `docs/reports/MARKETPLACE_EXPERIENCE_CONVERGENCE_2026_08.md`, `docs/PROJECT_STATUS.md`, `docs/INDEX.md`
- `docs/features/evidence/marketplace-experience-convergence/`

## Remaining Limitations

- This Development database currently returns zero publicly eligible Teachers, so Profile recapture and live Direct Request conversion were not re-executed in this shell.
- The UAT Teacher had no matching Open Requests; Opportunities certified the dashboard-owned empty state, not a submitted-offer pixel.
- Guest Post Request screenshots are Auth (correct continuation). The creation form was certified while authenticated.
- UAT Teacher overview can toast “Teacher was not found” from an existing `/teachers/me` miss; not introduced by this IA pass.
- Full create → offer → select → pay → Order lifecycle remains covered by the prior Open Request Marketplace domain certification; this pass certified placement, not a second domain rewrite.

---

## MARKETPLACE EXPERIENCE CONVERGENCE VERIFIED
