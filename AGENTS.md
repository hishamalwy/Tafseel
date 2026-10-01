# AGENTS.md

Instructions for any coding agent (Claude, Codex, Cursor) working in this repository. Read this
first; it routes to the documents that decide things. When they disagree, the order below wins.

## Order of authority

1. The backend domain (`src/Tafseel.Domain`) and its tests.
2. [Product Contract](docs/product/TAFSEEL_PRODUCT_CONTRACT.md): business rules, roles, fees, providers.
3. [V1 Scope](docs/product/V1_SCOPE.md): what V1 is, per capability, and its state.
4. Everything else, including this file.

A rule that is not in the contract is not a rule. A new or changed rule is a `DECISION REQUIRED`
for the Product Owner, not something to settle in code.

## How work is done

Every product ticket follows [SDLC.md](docs/engineering/SDLC.md): Gate 1 business, Gate 2 UX,
Gate 3 contract, Gate 4 build, Gate 5 E2E. Ticket template:
[FEATURE_TICKET.md](docs/engineering/templates/FEATURE_TICKET.md). Open work and its order live in
[V1_RELEASE_BLOCKERS.md](docs/releases/V1_RELEASE_BLOCKERS.md); owner decisions in
[V1_OWNER_DECISIONS.md](docs/releases/V1_OWNER_DECISIONS.md).

- One major journey, or two small independent tickets, at a time.
- Anything found outside the ticket becomes a backlog entry; it is not fixed silently.
- Done means the Definition of Done in SDLC.md §6, including authorization tests for wrong
  participant, wrong role and outsider, and Arabic at 390px for customer journeys.

## Protected code

`Tafseel.Domain`, `FinancialService`, the ledger, escrow, maturity, idempotency, reconciliation
and migrations change **only** for a demonstrated defect, with a failing test written first.
Money paths run Serializable and take locks through `ApplicationLock.AcquireAsync`; never call
`sp_getapplock` directly. Never widen a CHECK constraint or drop a unique idempotency index to make
a test pass.

## Rules the code relies on

- Authorization: load resources by id **and** caller inside the query
  (`x.Id == id && (x.StudentId == userId || x.TeacherId == userId)`); non-participants get 404.
- State changes carry `If-Match`; money-starting calls carry an `Idempotency-Key` that stays the
  same across retries of one attempt.
- Errors are `DomainException("snake_code", "English sentence")`. Every code a customer can hit
  needs `err_<code>` in both `frontend-angular/public/locale/ar.json` and `en.json`; Arabic UI must
  never show the English sentence.
- Files are streamed through authorized content endpoints only; storage keys never leave the server.
- Production refuses mock payment, mock meeting and local storage at startup. Keep it that way; the
  mocks stay the only providers until contracts are signed (PAY-01, MEET-01).
- No secrets in the repository, in docs, in test scripts or in audit output. Local values go in user
  secrets or `Properties/launchSettings.json` placeholders.

## Frontend (frontend-angular/)

Organised by feature, not by layer: see [frontend-angular/ARCHITECTURE.md](frontend-angular/ARCHITECTURE.md).
A feature does not import another feature's internals. Pages call use cases; use cases call ports;
gateways implement ports over HTTP. Every screen with a `<main>` starts with `<tf-skip-link>`
(the build fails otherwise). Colours come from tokens in `css/tafseel.css`; logical properties
(`inset-inline`, `margin-inline`) keep RTL correct.

## Verify before you say done

```bash
dotnet build Tafseel.sln -c Release
dotnet format Tafseel.sln --verify-no-changes
dotnet test Tafseel.sln -c Release
node scripts/ci/check-api-contract.mjs --strict
node scripts/ci/check-vulnerable-packages.mjs
cd frontend-angular && npm test -- --watch=false && npm run build
```

- Changed an API request or response shape on purpose: regenerate the contract snapshot with
  `UPDATE_API_CONTRACT_SNAPSHOT=1 dotnet test tests/Tafseel.IntegrationTests --filter ApiContractSnapshotTests`.
- Changed the EF model: add a migration and check
  `dotnet ef migrations has-pending-model-changes --project src/Tafseel.Infrastructure --startup-project src/Tafseel.Api`.
- Browser journeys live in `tests/browser/*.e2e.mjs` (Playwright) and run against a published build
  on a fresh database.

## Do not

- Commit, push, force-push, rewrite history, or delete branches unless the person asks.
- Skip or fence a failing test to get green.
- Add a "coming soon" screen, a dead control, or a button the user cannot use in V1.
- Add analytics, ranking, or AI inference as a source of business truth (PRODUCT.md, Constraints).
