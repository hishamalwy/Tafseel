# <ID> — <short title>

> Copy this file for each ticket. Every section is required; write "None" rather than deleting a
> section. A ticket moves to **Ready** only when Gates 1–3 are ticked; it enters **In Progress** only
> when every section is filled. See [`SDLC.md`](../SDLC.md).

| Field | Value |
|-------|-------|
| **ID** | e.g. `FIN-03` |
| **Release** | V1 / V1.1 / Later |
| **Priority** | P0 / P1 / P2 / P3 |
| **Blocker** | yes / no |
| **Size** | S / M / L |
| **Owner** | |
| **Status** | Backlog / Ready / In Progress / Done |
| **Gates** | ☐ 1 Business ☐ 2 UX ☐ 3 Contract ☐ 4 Build ☐ 5 E2E/Release |

## Actor
Who performs the action (Visitor, Student, Teacher, Quality Reviewer, Admin, system job).

## Problem
What is wrong or missing today, with evidence (matrix row, screenshot, test, file:line).

## User goal
The outcome in the actor's words: "As a …, I want to … so that …".

## Business rule
The rule(s) that govern this, quoting [Product Contract](../../product/TAFSEEL_PRODUCT_CONTRACT.md)
sections. New or changed rules: state them and update the contract. Unresolved: **DECISION REQUIRED**
(the ticket cannot be Ready).

## Business states
Entities and statuses involved; transitions before → action → after, in product terms.

## Preconditions
What must already be true (account state, data, prior tickets, configuration, providers).

## Happy path
Numbered steps from the entry point to the end state.

## Negative cases
Refusals, expiry, stale version (409), wrong participant (404), wrong role (403), limits, provider
failure, offline/realtime loss — and what the user sees for each.

## Authorization
Who may perform each action; expected responses for others; data the actor must not see.

## UX
- Entry point:
- Information hierarchy:
- Primary CTA per state:
- Wording (AR / EN):
- Mobile (390px):
- Loading / empty / error / not-available states:
- Confirmation dialogs (consequence stated):
- Gate question — can a normal user understand this without knowing Tafseel internals? yes/no, why

## API contracts
| UI action | Endpoint | Verb | Request | Headers / concurrency | Response | Resulting server state |
|-----------|----------|------|---------|-----------------------|----------|------------------------|
| | | | | | | |

Error codes the UI must explain:

## Analytics / observability
Events, logs, metrics or alerts needed (write "None" if not relevant).

## Acceptance criteria
- [ ] AC1 … (each testable, each mapped to a test below)

## Tests
| Level | Test | Proves |
|-------|------|--------|
| Unit / component | | |
| Integration / authorization | | |
| Contract gate | `check-api-contract.mjs --strict` | 0 violations |
| Browser journey | | happy path + key refusal; Arabic phone if customer-facing |

## Out of scope
Explicit list. Anything found during build that is not here → new Backlog ticket.

## Dependencies
Tickets, decisions (`DEC-*`), providers, configuration, data.

## Evidence (filled at Done)
Commits · test totals · journey log/screenshots · strict gate output · docs/matrix rows updated.
