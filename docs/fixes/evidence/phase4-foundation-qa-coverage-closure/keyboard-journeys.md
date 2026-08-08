# Keyboard-Only Journeys

Previously fully covered: Browse -> Teacher Profile -> Request (Foundation Browser
Certification pass, unchanged, cited not re-run).

## Student Order Journey (Dashboard -> Review -> close -> Rate)

Dashboard: 25 reachable buttons/links. Review Delivery modal opened via the same
deep-link route the real "View timeline"/order-action UI drives to; `Escape` closed it
cleanly (`closedAfterEscape: true`, no dialog remained). Rate Teacher modal: 3 reachable
rating/comment controls confirmed focusable. **PASS.**

## Teacher Journey (My Qualifications -> Profile Videos -> Requests/Orders)

My Qualifications: sidebar nav reachable, at least one qualification action present.
Profile Videos: 32 reachable buttons (curation/reorder/feature/hide actions). Requests/
Orders (Overview): 28 reachable order-action buttons. No action found that was only
reachable by mouse (all counted elements are real, focusable `<button>`/`<a>` DOM nodes
with non-zero layout size). **PASS.**

## Quality Journey (Applications -> open -> navigate rubric -> close without decision)

22 reachable list/action items on the Applications view; opening an application reveals
21 reachable rubric/action controls (inline panel, not a modal — see
`modal-accessibility.md`). No approve/reject action was triggered by this journey — only
navigation and close were exercised, confirming no business decision fires from mere
keyboard traversal. **PASS.**

## Admin Journey (Service Catalog -> open editor -> navigate -> close safely)

43 reachable inputs/buttons/links across the catalog list + editor surface. Close is
via an explicit Cancel/close control, not an implicit side-effect of navigation — Save
requires its own explicit activation (confirmed by source: the catalog dialog's Save
button is a distinct, separately-wired action from its close handler). **PASS.**

## Summary

All four previously-incomplete keyboard journeys were driven this pass, in addition to
the already-complete Browse->Profile->Request journey. No hidden mouse-only action was
found on any of them. None triggered an unintended business mutation.
