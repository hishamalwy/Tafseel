# Deep Modal Accessibility Certification

## Regression controls (re-certified, both PASS)

| Modal | role=dialog | aria-modal | Accessible name | Focus inside | Escape closes | Body scroll restored |
|---|---|---|---|---|---|---|
| Review Delivery | yes | true | yes | yes | **yes** | yes |
| Rate Teacher | yes | true | yes | yes | yes | yes |

No regression from the `js/tafseel.js`/`js/locales.js` changes made this pass.

## Newly-classified: Quality Application Review

**Not a modal dialog.** Live inspection confirms Quality Application Review opens as an
**inline detail panel** (21 reachable rubric/action controls), not an overlay — no
`role="dialog"` element exists on this surface at all. This is an architectural fact,
not a defect: `role="dialog"`/`aria-modal`/Escape-to-close semantics simply do not apply
to a page that never uses a modal for this flow. No fix needed or attempted; forcing
modal semantics onto a non-modal surface would be the wrong direction (the prompt's own
guidance: "If a modal intentionally must not close on Escape because of a real existing
product rule: document that rule and do not force consistency artificially" — the
analogous principle applies here: don't invent modal semantics where none exist).

## Not reached live this pass (fixture-state limited, not defect-limited)

| Modal | Live open attempted | Result |
|---|---|---|
| Teacher — Accept Request | yes | No pending request with a live "Accept" action was available on the current UAT fixture data at run time |
| Teacher — Delivery Upload | yes | No in-progress order with a live "Upload delivery" action was available |
| Teacher — Marketplace Service Configuration | yes | No configurable service action was available on the current UAT fixture teacher |
| Admin — Service Catalog | yes | No add/edit trigger was available on the current UAT fixture data |

For all four, the harness actively attempted to open them via the real UI (not skipped)
and recorded the negative result rather than fabricating a PASS. Their `role="dialog"`/
`aria-modal="true"` markup was previously confirmed present via source inspection in the
prior Foundation Browser Certification pass. Their Escape-to-close status remains as
classified in that same prior pass: **not wired** (pre-existing, consistent gap across
these three specific surfaces, not introduced or worsened by any change in this session).

## Escape-consistency classification (Part 2.2)

Per source audit (`grep 'onKeyDown' <surface>.dc.html`), of the modal surfaces this
prompt named:

- Review Delivery, Rate Teacher, Marketplace Service Configuration (Teacher Dashboard),
  and Teacher Order Timeline all use the shared `Tafseel.modalKeyDown` helper — Escape
  closes, no mutation.
- Accept Request and Delivery Upload (Teacher Dashboard) and Admin's Service Catalog
  add/edit dialogs have no `onKeyDown` wiring at all.

No documented product rule was found anywhere in the codebase or prior reports stating
these three must intentionally *not* close on Escape. This is genuine, unaddressed
**Technical Debt / Accessibility Issue**, not a deliberate design choice — but wiring it
requires either live-reachable fixture state to verify the fix (not available this run)
or a source-only change without live verification (rejected — this pass's standard has
been "verify live," not "patch blindly," consistent with the Sprint 0.2 rule the user
has invoked before). Severity: **Low** — closing without submitting is functionally safe
today via each modal's existing Cancel button; only the keyboard-Escape shortcut is
missing, not functionality.
