# TRUST-01 — Phase 1 Quality Trust and Safety

| Field | Value |
|---|---|
| ID | TRUST-01 |
| Release | V1 production hardening Phase 1 |
| Priority | P1 |
| Blocker | yes |
| Size | L — one major journey |
| Owner | Product Owner for DEC-16; engineering for implementation |
| Status | Backlog — DECISION REQUIRED |
| Gates | ⛔ 1 Business · ◐ 2 UX · ◐ 3 Contract · ☐ 4 Build · ☐ 5 E2E/Release |

## Actor

Quality Reviewer, Student, Teacher, Admin and existing authorized financial operator.

## Problem

Quality has only teacher application/showcase permissions. Admin owns help/abuse and disputes.
Free-text SupportCase.RelatedReference cannot establish investigation entitlement; private reads lack
case-scoped audit and operational assignment controls. [Baseline](../../audits/production-hardening-phase1/BASELINE.md).

## User goal

As a Quality Reviewer, I want to investigate my assigned safety case using Tafseel's existing evidence,
ask the relevant people and record an accountable decision without receiving Admin or money powers.

## Business rule

Product Contract §2 currently assigns help and dispute operations to Admin and restricts Quality to
application/showcase duties. §§7/7a require participant authorization, self-processing guards, private
files and separate paid-purchase disputes. The user explicitly requests the Phase 1 role expansion.
SLA, safeguards, earlier-case visibility and takeover/access policy are **DECISION REQUIRED (DEC-16)**.
Do not update the implemented contract to claim these proposals are effective before the owner decides.
Proposed rules are concrete in [system design §§4–9](../../audits/production-hardening-phase1/SYSTEM_DESIGN.md).

## Business states

Keep existing SupportCase/Dispute states and financial rules. Add an independent operational state:
NeedsTriage -> Assigned -> UnderReview -> WaitingStudent/WaitingTeacher -> UnderReview ->
Escalated/RecommendationPending/Resolved. A recommendation never resolves financial exposure itself.

## Preconditions

Active unsuspended operator, current permission/stamp, no case-party conflict; a validated subject;
If-Match for mutations; current assignment/state for sensitive reads; DEC-16 and Gates 1–3 completed.

## Happy path

1. Participant opens a validated report/dispute.
2. Quality finds it in Safety & Cases and claims it.
3. Starts review and opens related context/evidence.
4. Asks the student and teacher; they answer through recipient-authorized questions.
5. Adds a staff-only note and an explained non-financial outcome, or a recommendation for authorized
   financial review. A serious case may require an approved temporary safeguard/escalation.
6. Relevant participants receive the public outcome; internal notes and private answers stay private.

## Negative cases

403 wrong role; 404 unrelated/conflicted case or ID swap; 409 stale/concurrent claim; denied after role
revocation, suspension, reassignment or impermissible state; audit/storage/scanner failure closed;
no self handling even with multiple roles; no Quality direct settlement/refund/withdrawal/user management.
Keep user drafts after stale/error responses and offer an explicit recovery action.

## Authorization

Explicit TrustSafety permissions plus case assignment, state and resource relationships. Queue metadata
does not grant context entitlement. Financial execution stays in existing authorized routes.
See [system design permission and security tables](../../audits/production-hardening-phase1/SYSTEM_DESIGN.md).

## UX

- Entry point: Quality -> Safety & Cases, alongside Applications and Account.
- Hierarchy: summary/parties/timeline before private context, evidence, notes and decisions.
- Primary CTA: Take case (unassigned), Start review (assigned), ask/review (active), await Admin (escalated),
  read outcome (resolved). No destructive action before case context.
- AR/EN: final principal labels in system design §9; complete field/error text must be recorded before Gate 2 passes.
- Mobile 390px: single column, wrapped filenames/IDs, 44px controls; existing Dashboard shell and logical CSS.
- Loading/empty/error/unavailable/stale: existing skeleton/state patterns, filter reset, retry, safe denied message,
  preserved drafts and reload-before-resubmit.
- Confirmations: resolution states participant visibility; safeguards state effect and duration;
  recommendation explicitly says no money moves.
- Gate question: yes for the proposed hierarchy; Gate 2 remains partial until all action/state wording is complete.

## API contracts

The action/verb/request/response and authorization design is in system design §6. All routes are proposed.
If-Match covers mutations. Existing finance routes retain If-Match and Idempotency-Key. File descriptors
name only case-scoped authorized content endpoints. Stable case/concurrency errors need both locale entries.
Gate 3 remains partial until DEC-16 fixes policy, complete DTOs/error mappings and snapshot/test changes are recorded.

## Analytics / observability

Existing audit/outbox only. Privileged read events identify actor, case, resource, UTC time and request.
No sensitive payloads in audit. Operational due/escalation notifications follow owner-approved SLA.

## Acceptance criteria

- [ ] AC1 Quality can triage/claim/investigate an eligible case without Admin capabilities.
- [ ] AC2 Wrong owner/role/party/resource/state and revoked access are refused; all private reads audited.
- [ ] AC3 Both addressed participants can answer/upload evidence; internal notes never reach them.
- [ ] AC4 Non-financial resolution and financial recommendation are separate; recommendation moves no money.
- [ ] AC5 Approved safeguards have an actor/reason/timestamps/expiry/review/removal and cover all relevant server callers.
- [ ] AC6 Legacy support/dispute history survives additive migration; no inferred private links or financial edits.
- [ ] AC7 AR390 and EN desktop full browser journeys and all required verification pass.

## Tests

| Level | Planned test | Proves |
|---|---|---|
| Domain | Failing tests before protected edits | Ownership, waiting/decision states, subject invariants and approved policy |
| Integration/authorization | TrustSafetyAuthorizationTests | AC1–4; every route wrong participant/role/outsider; ID swaps; stale/conflicts/revocation |
| Integration/audit | TrustSafetyAuditTests | Context reads persist safe audit; write failure reveals no sensitive content |
| Integration/migration | TrustSafetyLegacyMigrationTests | AC6; populated legacy histories and safe defaults |
| Component | Quality queue/detail/participant question specs | Action/state/error/denied/RTL rendering and no note leakage |
| Contract | `node scripts/ci/check-api-contract.mjs --strict` | Zero violations, snapshots match intended API |
| Browser | `tests/browser/phase1-trust-safety.e2e.mjs` (to be added after gates) | Queue, claim, context, both-party questions, evidence, note, resolution, AR390/EN desktop |
| Safeguards | Caller matrix integration tests | AC5; expiry/removal and no new purchase entry bypass |

## Out of scope

Phases 2–9, provider integration, permanent sanctions, generic private-data search, financial semantics,
incumbent design-system replacement, unrelated dependency/Docker fixes. Findings go to existing backlog.

## Dependencies

DEC-16; full Gates 1–3; explicit necessary protected additive changes with failing tests first.
Existing provider/hosting/legal launch blockers remain. New UI is not a substitute for production contracts.

## Evidence (filled at Done)

Not Done. [Baseline evidence](../../audits/production-hardening-phase1/BASELINE.md) records current-tree checks,
not Phase 1 acceptance. No feature code, migration, API snapshot or browser journey has been added yet.
