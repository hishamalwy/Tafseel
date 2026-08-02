# Phase 3 — Release 1.1 Admin Catalog Certification

Date: 2026-08-01  
Scope: Release 1 migration certification and Admin service-catalog create/edit UX only. Release 2 and public/teacher ownership surfaces were not started.

## Migration certification

- Source: current Development database `Tafseel` on `(localdb)\TafseelLocal`.
- Isolated clone: `TafseelCatalogCert_20260801_01`, created from a copy-only backup.
- Migration: `20260801135831_MarketplaceServiceCatalogRelease1`.
- Apply window: `2026-08-01T17:45:27.2318407+03:00` to `2026-08-01T17:45:31.7541477+03:00`.
- Row preservation: catalog `4 → 4`, teacher services `1 → 1`, requests `1 → 1`, orders `1 → 1`, bookings `0 → 0`.
- Backfill: all four catalog rows mapped; the one historical request and order were linked.
- Integrity: seven check constraints and three restrictive foreign keys present; zero disabled or untrusted constraints.
- EF model: no pending model changes.
- Safety gate: `81 allowed, 0 warnings, 0 approved exceptions`.

The available fixture is Development-sized. No production-like backup was present, and it contains no historical bookings, so production-volume and booking-history rehearsal remain outside this certificate.

## Admin UX certification

The existing Admin service editor now groups identity, workflow and qualification, commercial policy, visibility, readiness, and preview into one responsive catalog workflow. Category and icon use human labels; immutable service codes remain locked during edit; async and live policies expose only relevant controls; the footer remains reachable and sticky.

Root causes found during browser mutation testing:

1. API responses expose `minPrice`/`maxPrice`, while the editor read `minimumPrice`/`maximumPrice`. Reopening an item therefore replaced the maximum with the fallback. The shared response mapping now uses the DTO contract.
2. Clearing live durations produced `0` because `Number('')` is zero. A single allowlist parser now accepts only `30`, `60`, `90`, and `120` everywhere the editor validates, previews, submits, or updates local state.
3. The page runtime may call `componentDidUpdate` without `prevState`; the dialog lifecycle read it unguarded and emitted repeated console errors. The lifecycle now handles the runtime contract safely.

## Browser mutation evidence

- Async service `cert_async_20260801` was created, edited, deactivated, reloaded, and reopened.
- Invalid `minimum 300 > maximum 220` kept the dialog open and focused the minimum-price field.
- Persisted async policy: prices `80/120/150/220`, delivery `12/24/36/72`, revisions `1/3`, display order `41`, public/selectable true, active false.
- Live service `cert_live_20260801` rejected an empty duration selection, then saved with `30,60` only.
- Persisted live policy: prices `200/250/300/400`, delivery columns null, revisions `0/0`, display order `42`, public/selectable/active true.
- Responsive checks completed at widths `375`, `390`, `768`, `1024`, `1280`, and `1440`.
- Visual captures completed for mobile English/light at `375×812` and desktop Arabic/RTL/dark at `1440×900`.

## Accessibility and regression evidence

- Dialog semantics, labelled controls, validation status, visible focus, focus return, Escape confirmation, and Tab trapping are implemented.
- Duration and icon groups are programmatically focusable for validation; reduced-motion preference disables smooth validation scrolling.
- Build: succeeded with zero errors; two existing nullable warnings remain in `TeacherApplicationService` and are outside this release scope.
- Frontend gates: JavaScript, localization (2,743 paired keys), localization usage, frontend integrity, and Release 1 Admin checks passed.
- Tests: 288 passed, zero failed (`82` domain, `5` application, `1` architecture, `200` integration).
- Fresh browser lifecycle check after the final build: zero console errors across navigation, dialog open/close, theme, and locale mutations.

## Verdict

Release 1 is certified with non-blocking limitations: no production-like dataset was available and booking-history migration could not be exercised because the source fixture had zero bookings. Release 2 must remain separate.
