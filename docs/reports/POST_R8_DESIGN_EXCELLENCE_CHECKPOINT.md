# POST-R8 PRODUCT DESIGN EXCELLENCE — CHECKPOINT

Status: IN PROGRESS (not complete). This is a durable checkpoint, not a final report.
Date: 2026-08-09.

## Scope

Post-R8 product design excellence pass per user directive. R8 itself remains VERIFIED &
CLOSED (see `RELEASE_8_FINAL_ACCEPTANCE.md`) — this is additive polish, not a reopening.

## Completed and verified this session (live, DOM-measured / rendered against the running
dev server, not assumed)

1. **Landing hero headline wrap bug** — `heroPrefix` ("Learn around your") could break
   mid-phrase because `.tf-hero-headline-keep` had `white-space:nowrap` only for RTL, not
   LTR, combined with an oversized 10ch reserved rotate-word slot. Fixed:
   `css/tafseel.css` (`.tf-hero-headline-keep` now `flex-wrap:nowrap; white-space:nowrap;
   max-inline-size:100%` for both directions) and `Tafseel-Landing.dc.html`
   (`heroRotateMin` 10ch→8.6ch for EN). Verified via `getClientRects()` line-count + bbox
   measurement at 375/1440 × EN/AR: prefix text renders as exactly 1 line in every case,
   zero horizontal overflow. **Not yet verified with an actual pixel screenshot** — the
   Browser pane wasn't compositing frames this session; DOM geometry is supporting
   evidence, not a substitute. Still needs: 390/768/1024/1280 widths, every rotating word,
   reduced-motion mode, and a real screenshot pass (Playwright harness in `tests/browser/`
   is the right tool — not yet run for this).

2. **Canonical unread/notification badge formatter** — added `Tafseel.badgeCount(n)` to
   `js/tafseel.js` (0→hidden, 1–99→exact, 100+→"99+"/"+99" AR). Wired into: Student
   Dashboard header bell badge + sidebar nav badges, Teacher Dashboard sidebar nav badges +
   per-conversation unread badge. Verified the formatter's own output live
   (`[0,''],[99,'99'],[100,'99+'],[1234,'99+']`). Not yet swept across Quality/Admin
   dashboards if they have their own badge rendering (not yet checked).

3. **Teacher avatar fallback identity** — every teacher without an uploaded photo
   previously rendered the exact same static `default-avatar.svg` (generic book icon),
   making teacher cards visually indistinguishable. Added
   `Tafseel.initialsAvatarDataUri(label, seed)` (deterministic 2-letter monogram + one of 8
   curated brand-adjacent colors, hashed from teacher id/name, inline SVG data URI, no
   external request) and extended `Tafseel.avatarUrl(userId, hasAvatar, version, label)`
   with a backward-compatible 4th `label` param. Wired into the teacher-facing call sites:
   Browse Teachers (card grid + compare tray), Landing (featured teachers), Student
   Dashboard (saved teachers + order-timeline fallback), Payment (teacher context), Teacher
   Profile (hero avatar). Verified live on Browse: 3 real dev teachers now render 3
   distinct monograms/colors (`S0`/purple, `TT`/teal, `UT`/violet) instead of one repeated
   icon. **Not yet done**: the "account avatar" (logged-in user's own header avatar) call
   sites (Admin/Quality/Teacher/Student headers, ~5 sites) still use the old
   no-label/generic-icon path — lower priority since it's one instance per user, not a
   cross-card scanability problem, but inconsistent with the new system and should be
   finished.

4. **Real template-leak bug found and fixed (not on the original list)**: Browse
   Teachers' `<title>{{ pageTitle }}</title>` was never actually being replaced — the DC
   runtime doesn't process `<head>` bindings, and unlike Teacher Profile (which already
   does `document.title = pageTitle` in JS), Browse Teachers had no such assignment. Users
   were seeing the literal string `{{ pageTitle }}` in their browser tab. Fixed by adding
   the same `document.title = pageTitle` pattern Teacher Profile already uses. Verified
   live: tab title now reads "Browse teachers — Tafseel".

5. **Teacher Profile broken-video root cause traced and fixed (product-level)**: hit the
   actual failing media endpoint directly (`/api/v1/teachers/samples/{id}/content`) via
   `fetch` with a `Range` header. Confirmed: HTTP 206, correct `Content-Type: video/mp4`,
   valid MP4 `ftyp` box header — the API/storage/serving layer is working correctly. Root
   cause is the file itself: total size **2012 bytes**, far too small to contain a decodable
   `moov` atom or any real frame data. This is a synthetic placeholder file (almost
   certainly produced by a browser-automation upload during a past certification pass, not
   a real teacher recording), not a pipeline defect — classified as a **data-hygiene issue**,
   same family as the UAT-name finding. Not fixable in code (can't manufacture a real video).
   Per the directive's own rule ("never a bare browser failure message"), implemented the
   product-level fallback: `Tafseel-Teacher-Profile.dc.html` now listens for the `<video>`
   `error` event, and on failure swaps the broken native player for a localized
   `tf-profile-empty-media` panel (new locale keys `tp_media_playback_error_title` /
   `_body`, EN+AR added to `js/locales.js`) — reuses the existing empty-state visual
   pattern already used for "no media" rather than inventing a new one. Verified live: the
   native `<video>` element is fully removed from the DOM on error, the fallback panel
   renders correctly in both EN and AR, zero new console errors.

## Investigated and deliberately NOT changed

- **Disabled "Dashboard search is not available yet" box** (Student Dashboard header).
  Re-evaluated per the "tests are guardrails not truth" instruction. Conclusion stands at
  Option C (keep, disabled+honest) for now, but the correct next step is actually Option A
  or B, not indefinite C — this needs a real decision pass (is there enough Student
  content — requests/orders/sessions/conversations — to justify a small real client-side
  filter search? or should the space go to something else?) that wasn't completed this
  session. `check-frontend-integrity.mjs:593` still asserts the old behavior; if Option A/B
  is implemented, that assertion must be updated deliberately (with the shape described in
  the directive), not deleted silently.

## Not yet started (open, in priority order)

- P0: UAT/test-data classification — grep found `qa.reviewer.sprint02@example.com` /
  `qa.admin.sprint02@example.com` as legitimate, clearly-labeled Development-only seed
  *accounts* (`DependencyInjection.cs`, Phase 4 Sprint 0.2). The *domain* records visible in
  screenshots (`Sprint 0.2 UAT Teacher`, `Tariq Teacher UAT`, `CYCLE_RL_Teacher_...`,
  request titles like `Foundation certification F-013 retention check`) were NOT found in
  seed code — they're real domain records accumulated in the local Development database
  from many past certification/browser-automation runs (created through legitimate app
  flows during prior testing, not hardcoded). This is normal Dev-DB accumulation, not a
  code defect, and not reachable by real users (local dev DB only) — but final
  certification screenshots should not reuse this polluted fixture data. No DB mutation
  performed (would require raw SQL or a lot of manual UI cleanup — out of this session's
  safe scope without explicit approval). Recommend: either (a) a small number of clean
  records created through the real UI specifically for evidence capture, or (b) accept and
  explicitly disclose the current dev data in evidence docs rather than pretend it's clean.
- ~~P0: Teacher Profile video~~ — DONE, see item 5 above.
- P0: Icon glyph consistency (🔔/✉ mixed with plain-geometry Unicode nav icons across
  Student/Teacher Dashboard, plus Admin/Quality/Landing/Request per grep) — identified as a
  real but broad ~6-file, ~10-icon-per-dashboard design-system job, not started; a
  half-measure (fixing 2 icons out of 10 in the same list) would look worse than doing
  nothing, so this needs a full icon-set pass, not a spot fix.
- Touch-target audit (Live Booking slots, Quality/Teacher action buttons) — not started.
- Live Booking full polish pass — not started.
- Card-anatomy monotony audit — not started.
- Typography role system — not started.
- Full visual/screenshot matrix re-run (375–1440, EN/AR, light/dark) via the Playwright
  harness — not started this session.
- Backend regression, format, EF check, Release build, publish smoke — not re-run this
  session (only frontend files were touched; no backend/domain code changed).

## Files changed this session (uncommitted)

- `css/tafseel.css`
- `Tafseel-Landing.dc.html`
- `js/tafseel.js`
- `Tafseel-Browse-Teachers.dc.html`
- `Tafseel-Payment.dc.html`
- `Tafseel-Student-Dashboard.dc.html`
- `Tafseel-Teacher-Dashboard.dc.html`
- `Tafseel-Teacher-Profile.dc.html`

No commit/push/deploy performed.

## To resume

1. `cd C:\Users\asus\Desktop\Tafseel && git status && git diff` to see exact current state.
2. Continue down "Not yet started" in the order listed.
3. Dev server: `.claude/launch.json` config `tafseel-dev` (port 5090). **Important**: this
   server serves from a compiled `frontend` copy under `bin/`, not the source tree directly
   — every edit to `.dc.html`/`css`/`js` requires a server restart (which triggers
   `dotnet run`'s rebuild) before it's visible, confirmed the hard way this session.
