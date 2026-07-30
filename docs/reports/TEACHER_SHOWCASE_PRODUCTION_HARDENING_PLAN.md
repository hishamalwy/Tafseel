# Teacher Showcase Production Hardening Plan

Date: 2026-07-30  
Status: Decision complete (Proposed ADR-011); no runtime implementation in this pass.  
Decision source: [ADR-011](../decisions/ADR-011-TEACHER-SHOWCASE-PRODUCTION-MEDIA.md)  
Related: [ADR-007](../decisions/ADR-007-TEACHER-PORTFOLIO-MODERATION.md), [Showcase MVP report](../features/TEACHER_SHOWCASE_MVP_REPORT.md)

## Findings

The Showcase MVP workflow (draft → submit → Quality → approved public trust labels) is Development/Staging-capable. The media plane is not Production-safe: local disk only, no malware quarantine, no reliable probe, incomplete retention, and no durable multi-instance delivery.

### Evidence matrix

| Area | Current State | Classification | Production Risk | Decision |
|---|---|---|---|---|
| Feature gates | Dev/Testing auto-on; Staging opt-in; Production requires seven readiness booleans | Development/Staging Only | Flags can claim readiness without implementations | Keep fail-closed; split capability gates in implementation; evidence before flip |
| Config | Defaults false in `appsettings.json` | Development/Staging Only | Mis-set Production `Enabled` | Validate implementations + booleans together |
| Storage abstraction | `IFileStorageService` present | Development/Staging Only | Only local adapter registered | Azure Blob provider behind same abstraction |
| Local storage | `LocalFileStorageService` MP4/`ftyp`/size | Development/Staging Only | App Service disk non-durable | Reject for Production durable media |
| Private endpoints | AuthZ + range stream | Production Ready (authZ) | Delivery still local | Proxy to private Blob |
| Public endpoints | Approved-only gates | Production Ready (authZ) | Bandwidth on App Service if proxied forever | Short-lived SAS after authorize |
| MP4 validation | Extension/MIME/`ftyp` | Technical Debt | Not malware/probe | Keep as pre-filter only |
| Size limits | 250 MB + upload rate 10/h | Technical Debt | Declared-size trust | Enforce counted bytes |
| Storage keys | Generated; not in DTOs | Production Ready | Low leakage risk | Retain opaque keys |
| Content disposition | Inline video/mp4 | Production Ready | — | Retain |
| Authorization | Ownership + `Teachers.ReviewShowcases` | Production Ready | Broad reviewer preview | Optional tighten later |
| Range requests | Local `FileStream` | Production Ready (local) | Blob needs parity | Proxy ranges + SAS ranges |
| Duration/probe | Null on showcase upload | Missing Production Dependency | Untrusted/absent duration | Isolated FFprobe worker |
| Thumbnails | None | Not Applicable | — | Deferred |
| Upload lifecycle | Complete moderation flow | Development/Staging Only | Media unsafe | Quarantine pipeline |
| Failed upload cleanup | Best-effort on SaveChanges fail | Technical Debt | Orphans | Reconciliation job |
| Draft replace cleanup | Old keys orphaned | Technical Debt | Storage leak | Delete/TTL after replace |
| Archived media | Hidden; files kept | Business Rule Required | Unbounded retention | Soft-delete + BR windows |
| Rejected retention | Immutable private versions | Business Rule Required | Legal uncertainty | Proposed 90–365d pending legal |
| Qualification revoke | Hide/archive | Production Ready (visibility) | Files remain | Retention job later |
| Moderation queue | Technical queue ready | Operational Requirement | No SLA/staffing | Owner + SLA before gate |
| Quality permissions | Dedicated permission | Production Ready | — | Keep |
| Audit/notifications | Core events | Technical Debt | Missing some ADR-007 actions | Complete in hardening phases |
| Legacy migration | Generated; not applied | Missing Production Dependency | Cutover risk | Checksummed Blob migration plan |
| App Service filesystem | Staging `/home` documented non-durable | Development/Staging Only | Data loss on scale/recycle | Forbidden for Production media |
| Azure Blob/scan/probe | Absent | Missing Production Dependency | Cannot enable Production | Phase 1–2 |
| CI media validation | Config gate only | Technical Debt | False readiness | Add storage/scan smoke |
| Security tests | AuthZ + basic MP4 | Technical Debt | Malware/probe untested | Expand threat tests |

## Root Cause

Showcase Product workflow reused private local file storage that was never designed as multi-instance, scanned, probed, retained, or cost-efficient public video delivery. Production readiness booleans correctly block enablement, but the underlying Azure media architecture was undecided.

## Decisions

1. **Storage:** Azure Blob private containers + Managed Identity. Reject App Service local disk as durable media.
2. **Delivery:** Hybrid — application proxy for private/Quality; short-lived read SAS for approved public; never permanent public URLs.
3. **Malware:** Quarantine → async scan → fail-closed; MIME/`ftyp` are not scanning.
4. **Probe:** Isolated worker/container with FFprobe and resource limits; no uncontrolled API shell-out.
5. **Pipeline:** Uploaded → Quarantined → Scanning → Probing → ReadyForModeration → Submitted → Approved → PubliclyAvailable; plus ScanFailed / Infected / ProbeFailed / ProcessingError.
6. **Retention:** Soft-delete + proposed windows; exact legal periods **Business Rule Required**.
7. **Copyright:** Attestation, report, takedown, repeat-infringement — **Business Rule Required** before gate.
8. **Moderation ops:** Quality owner; proposed 2-business-day SLA; no auto-approve — **Operational Requirement**.
9. **Gates:** Production defaults disabled; all readiness + implementations required; public omits unusable media.
10. **Secrets:** MI + Key Vault if needed; no signing keys in frontend.
11. **Network:** HTTPS, private containers, short SAS, CSP/CORS; CDN later.
12. **Limits:** Keep ADR-007 250 MB / 3600 s / 6 / 3 / 20; resolution & daily caps BR.
13. **Observability:** Upload/scan/probe/moderation/playback metrics; never log SAS/keys/bytes/notes.
14. **DR:** Blob redundancy/soft-delete independent of SQL backup; reconcile orphans.
15. **Legacy:** Inventory → scan/probe → checksum flip; fail closed on missing files.
16. **Threats:** Mitigations tabulated in ADR-011; residual SAS TTL and scanner zero-days accepted explicitly.
17. **Enablement:** All ten Production gates must pass before `Enabled=true`.

## Target Architecture

```text
Browser
→ Tafseel API
→ Quarantine Blob
→ Scan/Probe Worker
→ Private Blob (Teacher/Quality proxy stream)
→ Quality Moderation
→ Approved Blob
→ Short-Lived SAS (public playback)
```

SQL stores pointers and moderation state only. Local disk remains Development-only.

## Production Configuration Contract

| Setting | Production default | Notes |
|---|---|---|
| `TeacherShowcases__Enabled` | `false` | Master switch |
| `DurableObjectStorage` | `false` until Blob proven | Must match registered provider |
| `MalwareScanning` | `false` until scanner live | Fail-closed publish |
| `ReliableMediaProbing` | `false` until worker live | Server duration |
| `RetentionPolicy` | `false` until policy + jobs | Legal sign-off |
| `CopyrightReportingPolicy` | `false` until process approved | Legal/product |
| `ModerationOperations` | `false` until SLA/staffing | Quality owner |
| `SecureMediaDelivery` | `false` until hybrid tested | Proxy + SAS |
| Blob account / containers / MI | unset | No secrets in repo |
| `FileStorage` local root | Dev only | Forbidden as Production durable store |

Proposed future splits: Management / Upload / Moderation / PublicPlayback — implement later without weakening today’s aggregate validation.

## Security Threat Model

See ADR-011 Threat Model. Highest Production blockers: malware without quarantine, decoder bombs without isolated probe, App Service disk durability, and permanent or long-lived Blob URLs.

## Required Azure Resources

- Storage account (Staging and Production separated).
- Containers: quarantine, private, approved (private access level None).
- Managed Identity on App Service + worker with least-privilege RBAC.
- Optional: Defender for Storage malware scanning or equivalent scan worker.
- Container Apps / App Service WebJob / Container Instance for scan+probe worker.
- Key Vault only if non-MI secrets remain.
- Optional later: CDN for approved media; Private Endpoint.

No account keys or SAS examples with real signatures are documented here.

## Implementation Plan

Follow ADR-011 phases 1–7. **Next implementation pass: Phase 1 — Azure Blob Provider only.**

## Test Plan

| Layer | Cases |
|---|---|
| Unit | Blob key safety; size recount; processing state transitions |
| Integration | Upload → quarantine → clean → probe → submit → approve → SAS; Infected/ScanFailed/ProbeFailed fail closed; archive stops new SAS; IDOR unchanged |
| Config | Production Enabled without implementations fails; local provider forbidden when DurableObjectStorage claimed |
| Security | No storage keys in DTOs/logs; no SAS in logs; range abuse rate limits |
| Ops | Soft-delete restore drill; orphan reconciler dry-run |
| Migration | Checksum match; missing file fail closed; qualification provenance unchanged |

## Migration Plan

1. Inventory referenced keys on local/Staging disk.  
2. Copy to quarantine; scan; probe; place by status.  
3. Verify hash; flip DB keys in batches.  
4. Keep local copies until verification window.  
5. Public remains fail-closed for unresolved media.  
6. Do not apply or run migration in this decision pass.

## Operational Plan

- Quality owns queue; proposed MVP SLA 2 business days (BR).  
- Alerts on backlog, scan/probe down, infected spike, storage auth failures.  
- Runbooks: infected handling, SAS outage fallback to proxy, restore from soft-delete.  
- Weekly orphan reconciliation report.

## Cost/Scaling Considerations

- Capacity: ≤250 MB × versions × Teachers; lifecycle cool/archive later.  
- Egress: public SAS shifts bytes to Blob; private proxy still hits App Service.  
- Workers: scale on quarantine depth.  
- Scanner SKU cost vs false-positive ops time.  
- CDN deferred until playback volume justifies it.

## Production Gates

Storage, Scan, Probe, Retention, Copyright, Moderation, Delivery, Security, Observability, DR — all must pass. Showcase stays disabled until then.

## Risks

1. Readiness booleans treated as implementations.  
2. Legal retention/copyright delays Phase 7.  
3. Scanner false positives block Teachers.  
4. SAS TTL UX friction vs revoke window.  
5. Dual-provider bugs during Blob cutover.  
6. Unapplied Showcase schema migration still pending in environments.

## Deferred Scope

- CDN, transcoding, thumbnails, adaptive bitrate.  
- Non-MP4 / external embeds.  
- AI moderation.  
- Assigned-only reviewer tightening.  
- Permanent hard-delete before legal policy.  
- Populated Trust Badge browser matrix (separate track).  
- Committing/applying Showcase schema migration (separate ops).

## Final Verdict

**READY FOR SHOWCASE PRODUCTION HARDENING IMPLEMENTATION**

Architecture and phased plan are decision-complete. Retention periods, copyright/takedown text, and moderation SLA remain Business Rule / Operational sign-offs required before Production enablement (Phase 7), not before Phase 1 storage work.

## Next Step

**Phase 1 — Azure Blob Provider:** implement durable private Blob storage behind `IFileStorageService` with Managed Identity, private containers, and Production fail-closed provider selection — without enabling Production Showcase, without scan/probe yet, and without weakening existing gates.
