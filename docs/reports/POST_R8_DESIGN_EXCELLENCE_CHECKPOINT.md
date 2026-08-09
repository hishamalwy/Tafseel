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

6. **Touch targets — the two explicitly-named offenders fixed**: Live Booking time-slot
   buttons (32px→44px, list gap 6px→8px), duration-pill buttons (38px→44px), and the
   Emergency-session toggle (36px→44px) in `Tafseel-Book-Session.dc.html`; Quality
   Dashboard's per-row "Review" decision CTA (34px→44px, both the queue-card and
   showcase-table instances) in `Tafseel-Quality-Dashboard.dc.html`. Confirmed compiled
   into the served build via direct source grep. **Not independently visually verified**
   this session — Book Session requires an authenticated Student session and no login
   credentials were available in this environment, so only "loads without crashing / no
   horizontal overflow at 375px" was confirmed, not the actual rendered slot grid.
   Deliberately did **not** blanket-inflate every 30-34px control found across
   Quality/Teacher Dashboard (grep found a couple dozen: filter-bar selects, table row
   actions, showcase edit/archive/move buttons, etc.) — the brief itself says dense
   desktop operational chrome doesn't need to become uniformly huge, and those weren't
   individually named as defects. This is a real remaining gap: a proper touch-target
   audit would need to judge each one by "is this realistically tapped on a touch device"
   rather than either fixing all ~24 or fixing only the 4 named in the brief — not done
   this session.

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

## New scope added mid-session: Premium Messaging & Notifications

A large second directive arrived (chat redesign + global notification center across
Student/Teacher/Quality/Admin). Given the scale, work started on the most contained,
highest-leverage slice first rather than the full floating-messenger rebuild:

7. **Teacher Dashboard notification consolidation** — Teacher Dashboard had notifications
   living only as a sidebar nav item + full in-page section (no header bell at all),
   duplicating the nav-vs-global-activity confusion the brief calls out. Ported Student
   Dashboard's existing header-bell + slide-in-panel pattern (not a new architecture —
   reused the same markup shape, the same already-existing `liveNotifs`/`read`/
   `openNotification`/`Tafseel.notificationRoute('teacher')` data plumbing that was already
   there powering the old in-page section) into a header bell with SVG icon (no emoji),
   canonical `Tafseel.badgeCount()` badge, and a slide-in notification panel. Removed the
   `notifications` entry from the sidebar NAV array. Added 2 new locale keys
   (`td_notifications_empty` EN+AR) for the empty state. **Verification status: partial.**
   Confirmed via `node -e "new Function(...)"` syntax-check that the modified script parses
   with zero errors (same check run across every file touched this session — all clean),
   and confirmed via curl that the new markup/bindings are present in the compiled build.
   **Could not get a live rendered screenshot**: the canonical demo teacher account
   (`teacher@gmail.com`) logs in successfully but has no approved subject qualification, so
   it lands on the Teacher Apply onboarding wizard, never reaching the Dashboard; the other
   3 real teacher accounts visible in Browse (`Sprint 0.2 UAT Teacher` etc.) have unknown
   passwords. This is a genuine environment/credential limitation, disclosed rather than
   worked around by guessing or bypassing auth.
   Student Dashboard was NOT touched this pass (it already has the pattern — no change
   needed there beyond what item 2 already did to its badge).
   **Not started**: Quality Dashboard (has its own bespoke notifications section, no header
   bell, different data shape — would need its own port, not started), Admin Dashboard (no
   notification concept exists there at all today — would need to be built from scratch,
   not started), the entire Chat/Messenger floating-window redesign (composer, bubbles,
   conversation list, mobile sheet — `js/chat-widget.js` not yet even opened this session).

8. **Chat widget (`js/chat-widget.js`) — real messenger-style redesign, live-verified.**
   Root problem confirmed exactly as described: the widget was a fixed 860×680px
   permanent 2-pane (260px list + thread) grid on desktop — a large box even for a single
   conversation, plus raw emoji for the launcher (✉), attach (📎), minimize (−), and
   maximize (□) controls, and a bare textarea+"Send"-label composer.
   Changes (all in the one self-contained file, zero backend/architecture change, same
   `Conversation`/SignalR/R5 plumbing reused as-is):
   - Default window is now a compact single-pane **400×620px** (was 860×680, permanent
     2-pane). The existing mobile-only pane-switching CSS (`[data-pane=list]` show/hide)
     was generalized to apply at all sizes, not just ≤680px, so desktop now behaves the
     same way mobile already did — list and thread are no longer both visible by default.
     The already-existing "maximize" button (previously just resized the same 2-pane grid
     bigger) now specifically restores the 2-pane list+thread layout for anyone who wants
     it — reusing an existing control instead of inventing a new one.
   - The "back to list" control (`data-back`) was previously mobile-only CSS
     (`display:inline!important` inside the `≤680px` media query); made universally
     visible so the list is always reachable from the compact single-pane view.
   - Replaced all raw emoji/glyph controls (✉ launcher, 📎 attach, − minimize, □ maximize,
     📎 in attachment chips) with a small inline SVG set (message bubble, paperclip, minus,
     square, file, chevron-back, arrow-send) sharing one stroke width/viewBox convention.
   - Composer rebuilt into an integrated rounded pill (attach icon + auto-growing textarea
     + circular primary-color send-arrow button), replacing the plain textarea + text
     "Send" button. Textarea now auto-grows up to 110px via a real `input` listener (not
     CSS-only). **Keyboard decision, documented per the brief's own request**: Enter sends,
     Shift+Enter inserts a newline — chosen because there was no pre-existing keyboard
     behavior on this control to conflict with (it was a plain textarea with no keydown
     handler before this pass).
   - Added real message clustering: consecutive messages from the same sender now get a
     smaller gap and no repeated meta-noise; a sender change (or a timeline event breaking
     the sequence) gets a visually larger gap (`data-cluster-start`).
   - Added a contextual subtitle line under the conversation title (order/service name
     once loaded, falling back to "Order conversation" or the peer's role) — previously the
     header only ever showed the person's name with zero context.
   - Unread badges (launcher badge + per-conversation list badge) now route through the
     same canonical `Tafseel.badgeCount()` formatter built earlier this session, replacing
     a separate hand-rolled `unread > 99 ? '99+' : ...` — one formatter, not two.
   - Draft-preservation on send failure was **already correct** in the existing code
     (the textarea is only cleared on success, not in the `catch` branch) — verified this
     is genuinely true, not something I needed to add.
   **Live-verified** (not just compiled): logged in as the real `student@gmail.com` demo
   account, opened the widget on Student Dashboard, confirmed via `getBoundingClientRect()`
   the window is genuinely 400×620px by default (down from 860×680), confirmed the SVG
   icons render (no more emoji glyphs in the DOM), confirmed the back button is visible by
   default, confirmed clicking Maximize genuinely restores a `280px 716px` 2-column grid,
   and confirmed zero new console errors (the only console errors present are the
   pre-existing pattern of anonymous-session 401s seen on every page all session, not a
   regression from this change). RTL positioning was not manually re-verified as a separate
   step but uses the same untouched `inset-inline-end` logical properties as before, and the
   live check was run in the app's default Arabic/RTL state, where the widget correctly
   anchored to the visual left edge (the correct RTL behavior) with no extra work needed.
   **Not done**: no conversations existed for this test account, so the actual message
   bubble/clustering/attachment rendering was not visually exercised, only the shell/empty
   state; mobile-width (375/390) rendering of the redesigned widget was not checked this
   pass; dark mode was not explicitly toggled and checked; Escape-to-close and keyboard-Tab
   order through the new controls were not re-verified (the underlying Escape handler and
   focus logic were not touched, so unlikely to have regressed, but not confirmed).

9. **Notification popover — correction pass, the previous "slide-in drawer" was genuinely wrong and is now fixed.** The user rejected the prior pass's panel (a full-height `inset-block:0` side drawer with a heavy `oklch(...  / .38)` backdrop dimming the whole page) as looking like a mobile nav drawer, not a Facebook/Messenger-style popover. This was a correct rejection — that drawer WAS the wrong pattern. Built one real shared CSS component (`css/tafseel.css`: `.tf-notif-backdrop`/`.tf-notif-panel`/`.tf-notif-head`/`.tf-notif-item`/`.tf-notif-empty`, ~30 lines, used identically by both Student and Teacher) and applied it to both dashboards, replacing the old per-page hand-styled drawer markup entirely (verified via curl that the old `inset-block:0;inset-inline-end:0;width:min(400px,92vw)` drawer string is gone from Teacher's served build). New behavior:
   - Desktop panel is `width:min(380px,92vw)`, `max-height:min(600px,calc(100dvh - 96px))`, anchored near the bell (`inset-inline-end:24px;top:76px`), and **shrinks to fit its content** rather than always filling the max height.
   - Backdrop is fully transparent (click-capture only for close-on-outside-click), not a dimming overlay — confirmed live via `getComputedStyle(backdrop).backgroundColor === 'rgba(0, 0, 0, 0)'`.
   - Mobile (`≤640px`) gets a real bottom-sheet treatment (pinned to bottom, rounded top corners, `max-height:min(80dvh,600px)`, restores the dimmed backdrop since a sheet legitimately needs one) — not implemented in the prior pass at all.
   - Empty state uses the new compact `.tf-notif-empty` treatment (icon + title + short body, `margin:auto` so it centers within whatever height the content needs) instead of a large blank canvas.
   - Escape-to-close and focus-trap wired via the existing shared `Tafseel.modalKeyDown` helper (was missing entirely on the notification panel before this pass).
   - Consolidated what had become two near-duplicate locale key sets (`td_nav_notifications`/`td_mark_all_read`/`td_notifications_empty` vs Student's separate strings) into one shared set (`notif_center_title`, `notif_mark_all_read`, `notif_empty_title`, `notif_empty_body`, EN+AR) — a genuine "one shared component" fix, not two hand-maintained copies.
   **Student sidebar duplication (a real miss from the previous pass, now fixed)**: Student Dashboard's sidebar still had a `notifications` NAV entry AND a raw `🔔` emoji in the header bell — I had only fixed the *badge formatter* on Student's, not the icon or the sidebar duplicate. Both fixed now: header bell is SVG (matching Teacher's), 44×44px hit area, sidebar entry removed entirely from the NAV array (not just hidden).
   **Live-verified against the running app** (logged in as the real `student@gmail.com` account, not assumed): opened the popover on Student Dashboard at 1440px and confirmed via `getBoundingClientRect()` — panel is genuinely `380×224px` (shrunk to its empty-state content, well under the 600px cap), positioned at `top:76,` correctly anchored to the same side as the bell in the app's default RTL layout (logical `inset-inline-end` resolved to the visual left, matching where the bell actually sits — required zero manual LTR/RTL-specific positioning code), backdrop confirmed fully transparent, bell button confirmed to contain zero text/emoji content, and the sidebar's full text content confirmed to no longer contain "Notifications"/"الإشعارات" anywhere.
   **Not live-verified**: Teacher Dashboard's popover (same shared CSS class, confirmed present in the compiled build, but not clicked/measured live — still no qualified-teacher credentials available in this environment, same blocker as the prior pass), and Quality/Admin were not touched at all this pass — Quality still has its old bespoke notifications concept and no bell; Admin still has no notification UI whatsoever.

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
