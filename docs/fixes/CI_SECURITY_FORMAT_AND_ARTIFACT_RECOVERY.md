# CI / Security / Formatting / Artifact Recovery

Date: 2026-08-08  
Branch: `main`  
HEAD inspected: `0c8f47caa08a785cea62cb20efc9afb522cd3bbc` (`R9 Done`)  
Scope: GitHub Actions recovery only. No Release reopen. No commit, push, or deploy.

Canonical product state preserved:

- Release 5 — VERIFIED & CLOSED (unchanged)
- Release 6 — VERIFIED & CLOSED (unchanged)
- Release 7 — VERIFIED & CLOSED (unchanged)
- Release 9 — AI-Assisted Marketplace concurrently implemented, CONDITIONALLY VERIFIED pending real Groq verification (not re-declared, not overwritten)
- Release 8 — still the next Product Experience & Responsive Hardening release (not implemented)

## Failures observed

1. `dotnet format Tafseel.sln --verify-no-changes --no-restore` exit 2 (WHITESPACE).
2. Gitleaks: 13 `generic-api-key` findings.
3. `actions/upload-artifact` path `TestResults` found no files (`if-no-files-found: error`).
4. Node 20 / punycode / `url.parse` deprecation warnings from Actions runtimes.

## Classification

| Issue | Class |
| --- | --- |
| Format verify WHITESPACE on three C# files | Formatting Issue — not a Product Bug |
| R5 evidence `"token"` JSON properties | Documentation/Evidence Hygiene + False Positive (message markers, not credentials) |
| R6 browser cert used a local identifier whose name resembled an API key assignment; rewritten to unexpectedStatus401 | False Positive (JavaScript identifier, not a credential) |
| Historical copies of those 13 findings in `0c8f47c` | Historical Secret Exposure assessed; values are not reusable credentials |
| TestResults upload after format failure | CI Configuration Issue (root cause A: pre-test gate stopped the job before tests created `TestResults`) |
| Node 20 / punycode / `url.parse` | Dependency/Action Warning |
| GROQ / JWT signing / Resend / payment webhook / SQL passwords in HEAD | No real leak found in current tracked files |

No Product Regression was introduced. Query semantics, R7 funnel formulas, authz, concurrency, and R5/R6/R7/R9 assertions were not changed.

## Formatting

`dotnet format Tafseel.sln --no-restore` then `dotnet format Tafseel.sln --verify-no-changes --no-restore` → exit 0.

Whitespace-only wrapping in:

- `src/Tafseel.Infrastructure/Governance/GovernanceService.cs`
- `src/Tafseel.Infrastructure/Marketplace/MarketplaceIntelligenceService.cs`
- `tests/Tafseel.IntegrationTests/Release7MarketplaceIntelligenceTests.cs`

Diffs expand anonymous-object / query formatting only. No semantic change to governance queries, marketplace intelligence formulas, R7 funnel, authorization, or assertions.

Format gate retained.

## Gitleaks investigation (all 13)

Tool: gitleaks 8.30.1 with `.gitleaks.toml` (`useDefault = true`). Values masked below.

| # | File | Line | Rule | Value type (masked) | Classification | Rotation |
| --- | --- | --- | --- | --- | --- | --- |
| 1–2 | `docs/features/evidence/phase4-release5-order-communication/final-acceptance/realtime-trace.json` | 6, 15 | generic-api-key | `"token": "R5LIVE-[dir]-[digits]"` | Deterministic chat message marker (`R5LIVE-*` + `Date.now()`), not JWT/session | No |
| 3–4 | `.../final-browser-certification/realtime-retention.json` | 6, 13 | generic-api-key | `"token": "R5CERT-[ST]-[digits]"` | Same marker family from R5 final cert | No |
| 5–6 | `.../rate-limit-final-cert/realtime-retention.json` | 4, 9 | generic-api-key | `"token": "PRE_RL_[ST]_[digits]"` | Same marker family from rate-limit cert | No |
| 7–8 | `.../rate-limit-final-cert/rate-limit-final-cert.json` | 869, 874 | generic-api-key | same `PRE_RL_*` | Embedded realtime trace copy | No |
| 9–10 | `.../rate-limit-final-cert-session-collision.json` | 141, 146 | generic-api-key | same `PRE_RL_*` | Embedded realtime trace copy | No |
| 11–12 | `.../rate-limit-final-cert-loc-ar-fail.json` | 869, 874 | generic-api-key | same `PRE_RL_*` | Embedded realtime trace copy | No |
| 13 | `tests/browser/release6-final-acceptance-cert.mjs` | 61 | generic-api-key | JS identifier (not a credential); rewritten to unexpectedStatus401 | False positive: variable name resembled a secret assignment | No |

Generators confirm markers are constructed as `` `R5CERT-S-${Date.now()}` `` / `` `R5LIVE-S2T-${Date.now()}` `` / `` `PRE_RL_S_${Date.now()}` `` and sent as chat body text to prove one-render realtime delivery. They are not access, refresh, API, or session credentials.

No `eyJ…` JWT, no `gsk_…`, no `Bearer` literal secrets, no `re_…` Resend live tokens, and no SQL passwords were found in tracked HEAD.

Local-only `--no-git` also saw `.vs/**/applicationhost.config` `sessionKey` values. `.vs/` is gitignored and not present in CI checkout. Allowlisted under generated-data paths for local scan parity.

## Real vs expired vs fixture

These were never authenticatable credentials. Expiry analysis of JWT payloads is not applicable. **No rotation required.** Azure App Service env, GitHub Environment Secrets, Groq, JWT signing key, Resend, and payment webhook secrets were not changed and were not found as values in tracked files.

`GROQ_API_KEY` appears only as a secret **name** (code + R9 evidence notes). No value is tracked. Values remain in GitHub Environment Secret and/or Azure App Service env.

`launchSettings.json` contains the labeled local-dev JWT placeholder `local-dev-only-signing-key-not-a-real-secret-32chars`. Production/appsettings use `REPLACE_WITH_SECRET_MANAGER_VALUE`.

## Release 5 evidence sanitization

Renamed JSON property `"token"` → `"messageMarker"` and kept the original marker strings, timestamps, conversation IDs, HTTP/status-adjacent fields, render counts, limiter settings, and scenario outcomes. Historical R5 certification verdict is unchanged. Evidence remains meaningful for realtime one-render proof.

R5 browser generators now write `messageMarker` so a future cert re-run does not reintroduce `generic-api-key` on a `"token"` property.

R5 integrity script (`scripts/ci/check-release5-order-communication.mjs`) does not parse those JSON keys; it still passes.

## Release 6 false positive

R6 browser cert used a local identifier whose name resembled an API key assignment; rewritten to unexpectedStatus401. The Gitleaks hit was a JavaScript identifier, not a credential. 401 filtering behavior is unchanged. R6 discovery integrity and frontend gates pass.

## Gitleaks strategy

1. Sanitize / rename evidence property.
2. Rewrite R6 identifier.
3. Narrow allowlist only for the **historical** 13 fingerprints on commit `0c8f47c`, `condition = "AND"` with those exact file paths. New secrets in those files still fail. `generic-api-key` remains enabled globally. Gitleaks is not disabled, not `continue-on-error`, and `docs/**` / `tests/**` are not broadly excluded.

Local results after fix:

- `gitleaks detect --no-git` → 0 leaks
- `gitleaks detect` (45 commits, same config as CI) → 0 leaks

## TestResults root cause

**A — pre-test gate:** format failed first, so `dotnet test` never ran, `TestResults/` was never created, then `upload-artifact` with `if: always()` and `if-no-files-found: error` failed.

Not B/C (wrong logger path) for the observed failure: when tests run, TRX lands at `TestResults/{architecture,domain,application,integration}/*.trx` and `path: TestResults` matches. Locally confirmed after this recovery.

Not a fake empty artifact issue.

## Artifact upload fix

CI test steps now have ids. Upload runs only when at least one test step concluded `success` or `failure` (not when they were skipped after format). `if-no-files-found: error` remains when tests actually ran. SQL job uses the same pattern. Failed tests still upload real TRX/coverage when the test step executed.

## GitHub Action / Node runtime audit

| Action | Previous pin | New pin | Notes |
| --- | --- | --- | --- |
| `actions/checkout` | `11d5960` (v4 backport, Node 20) | `3d3c42e` v7.0.1 | Node 24 |
| `actions/setup-dotnet` | `67a3573` (2025 cache bump) | `a98b568` v6.0.0 | Node 24 / ESM |
| `actions/setup-node` | `49933ea` | `8207627` v7.0.0 | Node 24 |
| `actions/upload-artifact` | `ea165f8` (~v4.6, Node 20) | `043fb46` v7.0.1 | Node 24; no download-artifact in repo |
| `gitleaks/gitleaks-action` | `e0c47f4` | unchanged | Already v3 / Node 24 |
| `github/codeql-action/*` | `3b0bd1d` | unchanged | Major bump deferred; possible remaining Node 20 warning on CodeQL job only |

`ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION` was **not** set.

punycode / `url.parse`: attributed to third-party action runtimes (especially older upload-artifact / gitleaks-action Node 20). Tafseel frontend was not modified. Residual warnings after v7/v3 upgrades are external non-blocking Dependency/Action Warnings.

## Git history risk

Secret-like `generic-api-key` strings were already in pushed commit `0c8f47c`. They are chat message markers / an identifier, not reusable credentials. History was **not** rewritten. Current HEAD is sanitized. Fingerprint allowlist covers only those 13 historical findings. A history purge is **not** required for legal/security policy based on this investigation.

## Tests and build

| Suite | Result |
| --- | --- |
| Architecture | 1 passed, 0 failed, 0 skipped |
| Domain | 89 passed, 0 failed, 0 skipped |
| Application | 5 passed, 0 failed, 0 skipped |
| Integration (full, including SqlServer/localdb) | 248 passed, 0 failed, 0 skipped |
| R5 / R6 / R7 / R9 frontend integrity | PASS |
| Frontend integrity, localization, localization usage, template leak, auth UI, auth return, guided request, notification routing, JS, browser harness self-test 5/5 | PASS |
| Deploy-gate script tests | 46/46 |
| Staging migration script tests | 34/34 |
| `dotnet build -c Release` | 0 errors |

Build warnings: 2× pre-existing `CS8604` in `TeacherApplicationService.cs` (null `degree`). Not introduced by this remediation.

## Remaining risks

- CodeQL job may still emit Node 20 deprecation until that action is major-bumped separately.
- Third-party punycode/`url.parse` warnings may persist inside action bundles we do not own.
- Git history still contains the old `"token"` JSON property on `0c8f47c` (non-credential markers; fingerprint-allowlisted).
- R9 remains CONDITIONALLY VERIFIED pending real Groq verification — unchanged.
- This recovery was verified locally; GitHub-hosted confirmation happens after user-reviewed push.

## Files changed

Workflows, `.gitleaks.toml`, R5 evidence JSON (property rename), R5/R6 browser cert scripts, three format-only C# files, this report.

## Follow-up — Gitleaks on this recovery report (c0d7047)

Push of the recovery commit failed Gitleaks on **this document only** (`gitleaks detect --log-opts=-1`, rule `generic-api-key`, lines 29 / 63 / 89). The report had documented the R6 false-positive identifier using an assignment-looking phrase; the scanner matched that documentation. **Not a real secret. No rotation.**

Those three sentences were rewritten so they describe the false positive without a scanner-triggering assignment pattern. Product code, R5 evidence, workflows, Azure, and GitHub secrets were not changed.

Because CI scans only the newest commit, the next user-reviewed commit+push of this rewrite is the primary fix. The three `c0d7047` fingerprints (and the earlier `0c8f47c` marker/identifier fingerprints) are listed in `.gitleaksignore` so a future full-history / scheduled scan does not fail on already-pushed false positives. CI gitleaks 8.24.3 does not apply multiple `[[allowlists]]` blocks (that landed in 8.25); fingerprint ignores are therefore file-specific via `.gitleaksignore`, not a whole-file path exclude. `generic-api-key` remains enabled. No real secret. No rotation.

## Follow-up — Groq contract LocalChatServer dispose (Linux CI)

Classification: Test Issue / Test Infrastructure Issue. Not a Groq production defect.

Linux GitHub runner failed 6 `GroqAiProviderContractTests` with `ObjectDisposedException` (`listener`) in `LocalChatServer.ListenAsync` / `DisposeAsync`. Assertions can already have passed; dispose then stops the `HttpListener` and awaits the accept loop. On Linux, pending `EndGetContext` throws `ObjectDisposedException` rather than only `HttpListenerException`, so the test fails during teardown.

Fix: catch `ObjectDisposedException`, `HttpListenerException`, and `OperationCanceledException` on the accept loop and in `DisposeAsync`. Assertions are unchanged (custom endpoint + strict schema; error classification without exposing vendor bodies; invalid structured response rejected). Groq SDK wiring, prompts, secrets, and R9 product behavior were not changed. Tests were not deleted, skipped, or excluded.

## Follow-up — Sqlite CreateFunction race under parallel factories

Classification: Test Issue / Test Infrastructure Issue. Not a Student Learning Preferences production defect.

Linux provider-neutral integration failed all four `StudentLearningPreferencesTests` with `InvalidOperationException` from `Dictionary.TryInsert` inside `Microsoft.Data.Sqlite.SqliteConnection.CreateFunctionCore` during `TafseelApiFactory` host/DB initialization (`EnsureCreated` / `InitializeIdentity` / canonical-service backfill). The same process-wide function registry is written when EF Core opens a Sqlite connection. Parallel `WebApplicationFactory` startup — and `NotificationOutboxWorker` opening Sqlite after `host.Start()` while CreateHost still initializes — corrupts that dictionary.

Assembly-level `CollectionBehavior(DisableTestParallelization = true)` remains. The harness fix serializes `CreateHost` behind a static lock and runs `EnsureCreated` plus `InitializeIdentity` after `Build` and before `Start`, so hosted services do not open Sqlite during function registration. Preference API semantics, validation, and authz assertions are unchanged. Tests were not deleted, skipped, or excluded.

Groq `LocalChatServer` dispose-safe catches (accept loop + `DisposeAsync`, including request handling and `Close`) are retained for Linux CI. No product Groq provider change.
