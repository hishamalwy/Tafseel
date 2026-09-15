# Tafseel Product Development Lifecycle (SDLC)

**Status:** permanent · adopted in Release Control 1, 2026-09-15. Applies to every product ticket,
every agent and every developer. Business rules come from the
[Product Contract](../product/TAFSEEL_PRODUCT_CONTRACT.md); scope from
[`V1_SCOPE.md`](../product/V1_SCOPE.md); UX rules from
[`UX_PRINCIPLES.md`](../product/UX_PRINCIPLES.md). Ticket template:
[`templates/FEATURE_TICKET.md`](./templates/FEATURE_TICKET.md).

## 1. Board

```
Backlog  →  Ready  →  In Progress  →  Done
```

| Column | Entry condition |
|--------|-----------------|
| **Backlog** | A ticket exists with an ID, release and one-line problem. |
| **Ready** | Gates 1, 2 and 3 are complete and recorded in the ticket. |
| **In Progress** | Ready, and WIP limit respected (§4). |
| **Done** | Gate 5 passed and the Definition of Done (§6) is met. |

A ticket **cannot move to Ready** until Gates 1–3 are complete. A ticket without the template's
required fields cannot enter In Progress.

## 2. Gates

### Gate 1 — Business
Required in the ticket:
- **Actor** (Visitor, Student, Teacher, Quality Reviewer, Admin, system job)
- **User goal** in the actor's words
- **Business rule(s)**, quoting the Product Contract section; a new or changed rule updates the contract
  in the same ticket or is marked `DECISION REQUIRED` and blocks Ready
- **Happy path**
- **Important negative paths** (refusals, expiry, concurrency, wrong actor)
- **Scope** and explicit **out of scope**
- **State transitions** (before → action → after, in product terms)
- **Authorization** (who may, who gets 404/403, which state errors)

### Gate 2 — UX
Required:
- **Entry point** (where the user starts; which navigation item or contextual link)
- **User-visible wording** in Arabic and English (final strings, not placeholders)
- **Information hierarchy** (what is first, what is disclosed later)
- **Primary CTA** for each state
- **Mobile behaviour** at 390px
- **Arabic / English** and RTL notes
- **Loading, empty and error states**, and the "not available to you" state
- **Confirmation** for money-moving or destructive actions, with the consequence stated

Gate question: **Can a normal user understand this without knowing Tafseel internals?** If not, the gate
is not passed.

### Gate 3 — Contract
For every user action:

```
UI action → endpoint → verb → request contract → headers / concurrency → response → resulting server state
```

- Headers: `If-Match` (version read), `X-Offer-Version`, `Idempotency-Key` where the endpoint requires them.
- Errors: the stable `code` values the UI must explain.
- Files: which protected content endpoint serves them.
- The **strict API contract gate** (`node scripts/ci/check-api-contract.mjs --strict`) stays mandatory
  and zero-tolerance: no known-violations file, no wildcard, computed URLs declared in
  `tests/contracts/dynamic-client-calls.json`.
- If the contract needs a backend change, that change is part of the ticket's scope and names its tests.

### Gate 4 — Build
Implementation starts only after Gates 1–3.
- **WIP limit:** one major journey, **or** at most two small independent tickets, per agent/developer.
- **No opportunistic features.** Anything discovered outside scope becomes a **Backlog ticket**; it is
  not fixed in the current change unless it blocks the ticket's own acceptance criteria.
- Protected code (`Tafseel.Domain`, `FinancialService`, ledger, escrow, maturity, idempotency,
  reconciliation, migrations) changes only for a demonstrated defect with a failing test first.

### Gate 5 — E2E / Release
Required before Done:
- Unit/component coverage where logic or rendering rules exist
- Integration and **authorization** tests for every new server path (wrong participant, wrong role, outsider)
- API strict gate green
- **Browser business journey** that runs the ticket's happy path and its key refusal against a
  published build on a fresh database, with no seeded business state for the transitions under test
- Arabic and English as appropriate; **Arabic at phone width for customer-facing journeys**
- No P0/P1 regression: previous waves' journeys green

## 3. Priorities

| Priority | Meaning |
|----------|---------|
| **P0** | Data loss, money error, security exposure, or the platform unusable. Stop the line. |
| **P1** | A V1 MUST journey broken or unusable, or an unsafe operation. Blocks release. |
| **P2** | Friction or a SHOULD capability missing. Does not block release unless listed. |
| **P3** | Cosmetic or hygiene. |

## 4. WIP and flow rules

1. One major journey or two small independent tickets in progress at a time.
2. A ticket that discovers a `DECISION REQUIRED` stops and returns to Backlog with the decision recorded.
3. Out-of-scope findings → Backlog ticket with a link from the current ticket. Never silent fixes.
4. A defect in a Done V1 journey is a new P0/P1 ticket, not a re-open of the original.

## 5. Evidence

Each Done ticket links: commits, test names and totals, the browser journey log and screenshots
(Arabic phone where required), the strict contract gate output, and the matrix/scope rows updated.
Evidence lives under `docs/audits/<ticket-or-wave>/` or the ticket itself.

## 6. Definition of Done

A product ticket is **Done** only when **all** hold:

- [ ] Acceptance criteria satisfied, each demonstrated by a named test or journey step
- [ ] No placeholder UI, no "coming soon", no dead control
- [ ] Known failure states handled (loading, empty, error, refused, expired, stale version)
- [ ] Correct authorization, proven by tests for wrong participant, wrong role and outsider
- [ ] API contract gate `--strict` green
- [ ] All test suites green (no skipped or fenced tests added to get green)
- [ ] Customer-facing Arabic and English complete (`check:i18n` green, no English inside Arabic UI)
- [ ] Mobile (390px) checked where the actor uses a phone
- [ ] No known P0/P1 defect introduced or left open in the touched journey
- [ ] Documentation updated: Product Contract (if a rule changed), `V1_SCOPE.md` state, remediation
      matrix row, blocker list

**"It compiles" is not Done. "The endpoint exists" is not Done. "It worked on my machine" is not Done.**
