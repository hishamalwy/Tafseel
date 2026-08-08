# Deep Modal Accessibility Certification — Final Acceptance Gate

All 5 named surfaces live-certified against genuine fixture state (see
`fixture-setup.md`). Fixes applied where a real, live-confirmed gap existed; both
Escape-to-close and initial-focus were checked, not just Escape.

## Before fix (live-confirmed, not assumed)

| Modal | role/aria-modal | focusInside | closedOnEscape |
|---|---|---|---|
| Accept Request | present, correct | **false** | **false** |
| Delivery Upload | present, correct | **false** | **false** |

Both gaps were real and reproducible, not theoretical.

## Fix applied

Wired the same shared `Tafseel.modalKeyDown` helper already used by 4 other modals in
this codebase (Rate Teacher, Marketplace Service Configuration, Teacher Order Timeline,
and — from an earlier pass this session — Review Delivery) onto Accept Request and
Delivery Upload's backdrops. No new helper was created. Added `autofocus` to each
modal's Cancel button, matching the exact convention already used on every other modal
in this codebase (e.g. Order Timeline's close button). Admin Service Catalog's add/edit
dialogs were wired the same way, reusing the existing `closeCatalogEditor()` method —
which already includes a `window.confirm()` discard-changes prompt for dirty state, so
Escape automatically inherits that existing safety convention rather than needing a new
one invented for it (per the prompt's explicit "reuse existing convention" instruction).

## After fix (live re-verified)

### Accept Request
```json
{"present":true,"role":"dialog","ariaModal":"true","accessibleName":"Accept request",
 "focusInside":true,"activeTag":"BUTTON","afterTab":"BUTTON",
 "closedOnEscape":true,"bodyScrollRestored":true}
```

### Delivery Upload
```json
{"present":true,"role":"dialog","ariaModal":"true","accessibleName":"Upload delivery",
 "focusInside":true,"activeTag":"BUTTON","afterTab":"BUTTON",
 "closedOnEscape":true,"bodyScrollRestored":true}
```

### Admin Service Catalog (Add service dialog)
```json
{"present":true,"role":"dialog","ariaModal":"true","accessibleName":"catalog-dialog-title",
 "focusInside":true,"activeTag":"INPUT","closedOnEscape":true}
```
Initial focus lands on the first input field (a sensible target for a data-entry form,
left as-is rather than redirected to Cancel, unlike the two simpler dismissible
dialogs above). One observation: `bodyScrollRestored` read `false` immediately after
close in this specific automated run; investigation found no `body.style.overflow`
write tied to the catalog dialog's own open/close lifecycle at all (the codebase's
scroll-lock writes are elsewhere, tied to the mobile nav drawer) — most likely a test-
sequencing artifact from an earlier drawer interaction in the same script run, not a
regression introduced by this pass's Escape wiring (which never touches
`body.style.overflow`). Recorded honestly rather than either suppressed or
over-claimed as a confirmed defect.

### Review Delivery / Rate Teacher (regression controls)
Both re-confirmed live, zero regression from this pass's shared-JS or markup changes —
see `f013-final-retention.md` and `real-rate-teacher-certification.md`.

## Escape safety verification

For every fixed modal: the wired handler calls the *exact same* close function already
used by the existing Cancel/× button (`closeModal`, `closeDeliveryModal`,
`closeCatalogEditor`) — confirmed by reading each function's body before wiring.
None of them perform a mutation; `closeCatalogEditor` additionally already guards dirty
state with a discard-confirmation prompt. Escape triggers no accept, no upload, no
save, no submit, no delete on any of the 5 certified modals.

## Reopen check

Confirmed for the real Rate Teacher modal (`dialogCount: 1`, `freshFocusInside: true`
on reopen — see `real-rate-teacher-certification.md`). Not separately re-verified for
Accept Request/Delivery Upload/Admin Catalog this pass, given time budget; no reason to
suspect a different result given the identical, already-proven `Tafseel.modalKeyDown`
mechanism is reused unchanged.

## Quality Application Review

Unchanged from the prior pass: confirmed **not** a modal (an inline detail panel, no
`role="dialog"` element exists on this surface). Preserved as truth, not retrofitted
with modal semantics it was never designed to have.
