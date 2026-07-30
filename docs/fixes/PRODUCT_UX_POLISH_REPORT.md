# Product UX Polish Report

**Date:** 2026-07-30  
**Scope:** Pre-production UI/UX hardening across Tafseel public and authenticated surfaces  
**Constraint compliance:** No architecture redesign, no new business rules, no invented APIs, no mock data, no commit/push/deploy

## Verdict

**PRODUCT UX POLISH PASS COMPLETED (LOCALLY)** — high-impact navigation, honesty, accessibility, and interaction defects were fixed across shared CSS/JS and primary pages. Remaining polish items are lower severity and do not block Staging validation.

## Findings (prioritized)

### P0 — broken or misleading flows

| ID | Finding | Evidence |
|---|---|---|
| UX-01 | Browse **Request** used the same `profileHref` as Profile | `Tafseel-Browse-Teachers.dc.html` CTA row |
| UX-02 | Landing featured **View profile** href pointed at Browse | `Tafseel-Landing.dc.html` featured cards |
| UX-03 | Student saved teachers linked to Profile without `?id=` | `Tafseel-Student-Dashboard.dc.html` |
| UX-04 | Landing footer **Request an explanation** opened Request without `teacherId` (unavailable state) | Footer Students column |

### P1 — unfinished / dishonest UI

| ID | Finding | Evidence |
|---|---|---|
| UX-05 | Auth **Continue with Google** toasted “coming soon” | Fake OAuth CTA |
| UX-06 | Payment applied any coupon client-side and claimed success | No coupon validation API |
| UX-07 | Landing stories showed ★★★★★ as if real reviews | Hardcoded testimonials |
| UX-08 | Missing `--danger` / `--danger-soft` tokens used by chat | Chat badge / widgets |
| UX-09 | Theme/lang FOUC before `tafseel.js` hydrate | Flash of wrong theme/dir |
| UX-10 | Quality / Teacher accept / Admin withdrawal lacked busy guards | Double-submit risk |
| UX-11 | Chat send had no busy guard / silent errors / no Escape close | `js/chat-widget.js` |
| UX-12 | Avatar FOUC / 404 before hydrate | Literal `{{ t.avatar }}` src |

### P2 — consistency / responsive / a11y

| ID | Finding | Evidence |
|---|---|---|
| UX-13 | Duplicate conflicting `.tf-skip` rules | `css/tafseel.css` |
| UX-14 | Browse grid `minmax(330px)` overflow risk on narrow phones | Browse results grid |
| UX-15 | Auth toolbar put lang control mid-row | Auth header |
| UX-16 | Featured teachers had no loading/empty honesty | Landing featured section |

## Root Cause

Frontend polish had drifted: CTAs reused nearby hrefs, unfinished auth/payment affordances stayed visible, marketing copy looked like verified social proof, and shared interaction patterns (busy, toast, skip, danger tokens, avatar fallback) were incomplete or duplicated.

## Fix

### Navigation correctness

- Browse Request → `Tafseel-Request.dc.html?teacherId=…`
- Landing featured View profile → `profileHref` with teacher id + real avatar
- Student saved teachers → `profileHref` + avatar
- Landing footer Request → Browse (teacher must be selected first)

### Honesty

- Removed Google OAuth CTA (login + register)
- Replaced fake coupon apply UI with `pay_coupon_unavailable` copy; payment POST no longer invents coupon application
- Reframed testimonials as **Illustrative scenarios** (no fake star ratings)
- Featured teachers: loading / empty / ready states (no invent cards)

### Shared system

- `--danger` / `--danger-soft` aliases (light + dark)
- Shared toast positioning, button variants (`danger` / `ghost` / `sm` / `block`), disabled/busy styles
- `js/boot-prefs.js` before CSS on all major pages (theme/lang FOUC)
- `Tafseel.bindAvatarFallbacks` for `.tf-img-avatar` / `[data-tf-avatar]`
- Single `.tf-skip` focus reveal rule

### Interaction safety

- Quality decision buttons: `decisionBusy`
- Teacher accept modal: `acceptBusy`
- Admin withdrawals: `withdrawalBusyId` + disabled Approve/Reject
- Chat: send busy guard, inline error status, Escape closes widget

### Responsive

- Browse / Landing grids use `minmax(min(100%, …), 1fr)`
- Testimonial cards `width:min(320px,85vw)`

## Browser Validation

| Check | Result |
|---|---|
| Landing RTL + dark | Pass — stats use `—` when unknown; stories labeled illustrative |
| Landing footer Request href | Pass — `Tafseel-Browse-Teachers.dc.html` |
| Browse Request href (when teachers present) | Pass — includes `teacherId` |
| Browse empty state | Pass — “0 teachers match” (no invent) |
| Auth LTR + light | Pass — no Google CTA; toolbar grouped; UTF-8 intact |
| Auth RTL + dark | Pass — Arabic brand/title preserved |
| 375 width overflow (Landing) | Pass — `scrollWidth === innerWidth` |
| 1440 / 768 | Exercised via device metrics; no horizontal overflow observed on Landing |
| Payment unauthenticated | Redirects to Auth (expected role gate) |

Server used: `http://127.0.0.1:5099` (Development API serving `/app`).

## Files Changed

- `css/tafseel.css`
- `js/boot-prefs.js` (new)
- `js/tafseel.js`
- `js/chat-widget.js`
- `Tafseel-Landing.dc.html`
- `Tafseel-Browse-Teachers.dc.html`
- `Tafseel-Student-Dashboard.dc.html`
- `Tafseel-Auth.dc.html`
- `Tafseel-Payment.dc.html`
- `Tafseel-Quality-Dashboard.dc.html`
- `Tafseel-Teacher-Dashboard.dc.html`
- `Tafseel-Admin-Dashboard.dc.html`
- `Tafseel-Teacher-Apply.dc.html`
- `Tafseel-Teacher-Profile.dc.html`
- `Tafseel-Request.dc.html`
- `Tafseel-Book-Session.dc.html`
- `docs/fixes/PRODUCT_UX_POLISH_REPORT.md`
- `docs/INDEX.md`
- `docs/PROJECT_STATUS.md`

## Remaining UX Issues

1. Modal Escape / focus trap still uneven on some Admin catalog modals and Student notification panel.
2. Toast still uses page-local inline corner styles in several dashboards (shared `.tf-toast` exists but not fully adopted).
3. Landing legal footer Privacy/Terms remain non-link spans; social icons are decorative.
4. Recommended teachers on Student Dashboard remain intentionally empty (`dash_recommended_unavailable`) until a real recommendation API exists.
5. Authenticated dashboard deep flows (order timeline, book session with live slots) need a populated Staging dataset for full mouse/keyboard regression.

## Risks

- Theme boot script must stay **before** `css/tafseel.css` on every page; omitting it restores FOUC.
- PowerShell default encoding can corrupt Arabic when rewriting HTML; prefer UTF-8-safe editors/scripts for Arabic pages.
- Coupon UI removal is honest today; when a real coupon API lands, Payment must be re-wired end-to-end (validate → price lines → pay).

## Next Step

1. Staging smoke with seeded teachers/orders: Browse Request → Guided Request → Payment → Teacher accept → Quality decision.
2. Adopt shared toast class + modal Escape helper on remaining Admin/Student overlays.
3. Continue Production blockers (F-003 providers, F-004 storage, ADR-011 Showcase gates) — outside this UX pass.
