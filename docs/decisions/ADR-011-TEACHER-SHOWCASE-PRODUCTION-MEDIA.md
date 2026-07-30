# ADR-011: Teacher Showcase Production Media Hardening

## Status

Proposed.

## Context

The Limited Teacher Showcase MVP implements an immutable MP4 draft → submit → Quality review → approved public lifecycle with fail-closed Production configuration gates (`TeacherShowcases:*` readiness booleans). ADR-007 already classified durable object storage, malware scanning/quarantine, reliable media probing, retention, copyright/takedown, moderation operations, and secure delivery as **Required before Production**.

Repository evidence shows the media plane is still Development/Staging-only:

- Only `LocalFileStorageService` is registered for `IFileStorageService`.
- No Azure Blob, malware scanner, FFprobe/FFmpeg worker, SAS signing, CDN, or Key Vault media integration exists in code.
- Showcase uploads clear `DurationSeconds` (no server probe); `ftyp` is not a full parser.
- Draft video replacement orphans previous files; no retention automation.
- Staging App Service paths under `/home` are explicitly non-durable.
- Production defaults keep Showcase disabled; enabling without every readiness flag fails closed — but flags are configuration claims, not implementations.

This ADR produces an implementation-ready production media architecture. It does **not** implement a storage provider, change entities/DTOs, generate a migration, enable Production Showcase, or weaken existing gates.

Governing sources:

- [ADR-007](./ADR-007-TEACHER-PORTFOLIO-MODERATION.md)
- [Showcase MVP report](../features/TEACHER_SHOWCASE_MVP_REPORT.md)
- [File storage notes](../file-storage.md)
- [Local adapter](../../src/Tafseel.Infrastructure/Files/LocalFileStorageService.cs)
- [Showcase options / DI gates](../../src/Tafseel.Infrastructure/DependencyInjection.cs)
- [Marketplace service](../../src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs)

## Current State

| Area | Classification | Summary |
|---|---|---|
| Feature gates (`TeacherShowcases`) | Development/Staging Only | Dev/Testing auto-on; Staging opt-in; Production fail-closed unless all seven readiness booleans are true |
| Configuration | Development/Staging Only | Defaults disabled; flags do not wire real media controls |
| `IFileStorageService` | Development/Staging Only | Abstraction exists; single local implementation |
| Local filesystem | Development/Staging Only | Not multi-instance / restart durable |
| Private media endpoints | Production Ready (authZ) | Owner + Quality review permission; keys not in URLs; range streaming |
| Public sample streaming | Production Ready (authZ) | Anonymous approved-only; rechecks every visibility gate |
| MP4 extension/MIME/`ftyp` | Technical Debt | Necessary but insufficient vs malware/probe |
| Size limits (250 MB) | Technical Debt | Declared-size + controller limit; stream recount incomplete |
| Storage keys | Production Ready | Generated GUID paths; never in DTOs |
| Content disposition | Production Ready | Inline `video/mp4` with range processing |
| Authorization / IDOR | Production Ready | Ownership and role boundaries tested |
| Range requests | Production Ready (local) | Works for `FileStream`; Blob needs equivalent |
| Media duration/probe | Missing Production Dependency | No FFprobe; duration null on showcase upload |
| Thumbnails | Not Applicable | Deferred per ADR-007 |
| Upload lifecycle | Development/Staging Only | Workflow complete; media plane local |
| Failed upload cleanup | Technical Debt | Best-effort delete on SaveChanges failure only |
| Draft replacement cleanup | Technical Debt | Previous keys orphaned |
| Archived / rejected retention | Business Rule Required | Retained forever; no approved purge windows |
| Qualification revocation | Production Ready (visibility) | Archives/hides; files not deleted |
| Moderation queue | Operational Requirement | Technical queue ready; staffing/SLA missing |
| Quality permissions | Production Ready | `Teachers.ReviewShowcases` separate from qualification review |
| Audit / notifications | Technical Debt / Production Ready | Core events present; some ADR-007 actions still missing |
| Legacy migration | Missing Production Dependency | Migration generated; not applied; no Blob remapping |
| Azure App Service disk | Development/Staging Only | Explicitly non-durable |
| Azure Blob / scan / probe | Missing Production Dependency | Absent |
| CI media gates | Technical Debt | Config gate tested; no durable-storage smoke |
| Security tests | Technical Debt | AuthZ + basic MP4 covered; malware/probe/orphan absent |

## Production Blockers

1. Durable private object storage (not App Service local disk).
2. Malware scanning with quarantine and fail-closed publication.
3. Constrained server-side media probing (container validity, video stream, duration, dimensions).
4. Approved retention/deletion and orphan reconciliation.
5. Copyright attestation, report, and takedown process.
6. Moderation owner, SLA, and escalation.
7. Secure multi-instance playback delivery with no permanent public Blob URLs.
8. Observability and DR for media independent of SQL backups.
9. Controlled legacy/local → Blob migration with fail-closed missing-file behavior.
10. Production feature enablement only after every readiness gate is proven — not merely set to `true`.

## Storage Decision

**Selected: Azure Blob Storage with private containers and Managed Identity.**

| Option | Verdict |
|---|---|
| Azure Blob Storage | **Adopt** for Production (and Staging when proving media) |
| Azure App Service local filesystem | **Rejected** as durable media — ephemeral/shared-disk risk, scale-out split brain, slot swap loss |
| Other providers | **Out of scope** — no existing multi-cloud storage abstraction beyond `IFileStorageService` |

Blob requirements:

- Separate private containers at minimum: `showcase-quarantine`, `showcase-private`, `showcase-approved` (names illustrative).
- Account in the same Azure region as App Service / SQL when practical.
- Redundancy: ZRS preferred where available; LRS minimum for non-Production proof environments.
- Lifecycle rules aligned with Retention decision (quarantine TTL, soft-delete, cool/archive tiers later).
- SDK: Azure.Storage.Blobs with range/download streaming support.
- Auth: user-assigned or system-assigned Managed Identity with least-privilege RBAC (`Storage Blob Data Contributor` or narrower custom roles per container).
- Connection-string fallback allowed **only** for local Development; forbidden as sole Production auth.
- Cost: dominated by capacity + egress through App Service proxy and/or SAS downloads; measure before CDN.

## Access and Delivery Decision

**Selected: Hybrid delivery.**

| Media class | Model | Rationale |
|---|---|---|
| Private drafts / submitted / ChangesRequested / Rejected | **Application-proxy streaming** | Strongest authorization; no Blob URL leakage; Quality/Teacher IDOR controls stay in API |
| Quality preview | **Application-proxy streaming** | Same private path; reviewer permission already enforced |
| Approved public media | **Short-lived signed Blob URL (read-only SAS)** after API authorization | Offloads bandwidth from App Service; browser-friendly range playback; no permanent public containers |

Rules:

- Never expose permanent public Blob URLs or container listing.
- API remains the only issuer of SAS; signing keys/MI never reach the frontend.
- SAS lifetime: short (proposed **3–15 minutes**, exact value Business Rule Required within that band); refresh via re-authorize endpoint.
- Revocation: archive/reject/qualification hide stops new SAS issuance immediately; in-flight SAS expires naturally (residual window accepted and documented).
- Private proxy retains `enableRangeProcessing`-equivalent Blob range reads.
- Cache: public SAS responses may use short private cache; never long-lived shared CDN cache of private drafts in MVP.
- Logging must not record full SAS query strings or storage keys.

Rejected pure-proxy for all traffic: App Service bandwidth and scale cost for public playback. Rejected pure-SAS for private drafts: wider exposure and harder immediate revoke for unreviewed media.

## Malware Scanning

**Selected architecture: upload → quarantine container → asynchronous scan worker → promote or destroy; publication fail-closed.**

Workflow:

1. Authenticated upload writes **only** to quarantine (never directly to approved).
2. Object marked `Uploaded` / `Quarantined` / `Scanning`.
3. Azure-compatible scanner options (architecture-level, vendor deferred): Defender for Storage malware scanning, or a dedicated scan worker reading quarantine via MI.
4. Outcomes: `Clean` → promote to private container and continue probe; `Infected` → quarantine retain then delete per retention; `ScanError` / timeout → `ScanFailed`, no Teacher submit, no Quality approve, no public SAS.
5. Retry with bounded backoff; after max attempts remain fail-closed.
6. Audit scan result category without logging file bytes.
7. Notify Teacher on infected / terminal scan failure (safe message; no malware detail that aids evasion).

Extension/MIME/`ftyp` checks remain **pre-filters only**. They are not malware scanning.

## Media Probing

**Selected: isolated background worker/container running FFprobe (optionally FFmpeg-limited) with CPU/memory/time limits.**

| Option | Verdict |
|---|---|
| Shell FFprobe from the web request | **Rejected** — DoS, timeout, and process-escape risk |
| Managed media service | Optional later; cost/ops overhead not required for MVP probe |
| Background worker / container with FFprobe | **Adopt** |

Probe must verify:

- valid MP4 container;
- at least one video stream (reject audio-only disguised as MP4);
- codec allowlist (start narrow: e.g. H.264 + AAC);
- duration within ADR-007 bound (**≤ 3,600 s**);
- dimensions/bitrate within proposed ceilings (Business Rule Required for exact numbers; see Limits);
- reject corrupt / unreadable containers;
- hard wall-clock and memory limits to mitigate decoder bombs.

On success: persist server-derived `DurationSeconds` (and optional width/height/codec metadata). On failure: `ProbeFailed`; Teacher cannot submit.

## Processing Pipeline

Canonical success flow:

```text
Uploaded
→ Quarantined
→ Scanning
→ Probing
→ ReadyForModeration
→ Submitted
→ Approved
→ PubliclyAvailable
```

Failure states (keep minimal):

```text
ScanFailed
Infected
ProbeFailed
ProcessingError
```

Do not invent parallel “Published” vs “Approved” media states; public visibility remains approved pointer + existing profile/qualification gates (ADR-007).

Decisions:

- **Upload completion:** synchronous store to quarantine + enqueue processing; HTTP returns after durable quarantine write and DB pointer update — not after scan/probe.
- **Teacher submit:** allowed only when current draft media is `ReadyForModeration` (clean + probed).
- **Quality preview:** allowed from `ReadyForModeration` onward for non-draft statuses (existing permission model); never for `Infected`.
- **Public:** only after Quality `Approved` **and** media in approved container **and** all public gates.
- **Retry:** automatic for transient `ScanFailed`/`ProcessingError`; terminal after N attempts; Teacher-visible safe status.
- **Failure visibility:** Teacher sees non-technical statuses; internal notes/audit hold detail codes.

Mapping to current domain statuses: keep Draft/Submitted/UnderReview/… for moderation; add **media processing status** on the version (or adjacent record) without collapsing moderation and scanning into one enum.

## Retention and Deletion

Do **not** invent legal retention periods. Where law/product is silent, classify **Business Rule Required** and propose safe defaults for product/legal sign-off.

| Class | Logical delete | Physical delete (proposed pending BR) | Teacher | Moderator | Public |
|---|---|---|---|---|---|
| Draft files | On replace/archive | Soft-delete then purge after **7–30 days** unused | Yes | No (draft) | No |
| Replaced draft files | Immediate logical unlink | Purge after short orphan TTL (**1–7 days**) | No | No | No |
| Submitted / UnderReview | Retain while queue active | Soft-delete only after decision + BR window | Yes | Yes | No |
| Rejected / ChangesRequested | Retain for audit | Proposed **90–365 days** then purge unless legal hold | Yes | Yes | No |
| Approved historical (superseded) | Retain | Proposed **1–3 years** or account lifetime + BR | Yes | Yes | No (only current approved) |
| Archived Showcases | Hide immediately | Same as superseded approved | Yes | Yes | No |
| Teacher account deletion | Follow platform deletion BR | Media purge only after identity deletion BR | — | Audit retain per BR | No |
| Qualification revocation | Archive/hide (existing) | Files retained until retention BR | Yes | Yes | No |
| Moderator removal | Hide + audit (API still missing vs ADR-007) | Retain evidence per BR | Limited | Yes | No |
| Infected uploads | Immediate unlink from product paths | Quarantine retain **≤ 30 days** for forensics then destroy | Status only | Ops | No |
| Orphaned uploads | Reconciliation job | Delete when no DB reference after TTL | No | Ops | No |

Legal/audit retention overrides purge. Soft delete + Blob versioning preferred before hard destroy.

## Copyright and Reporting

**Business Rule Required** — document product/legal decisions; do not invent statutes.

Production must eventually provide:

1. Copyright / ownership attestation checkbox at upload (stored with version audit).
2. Prohibited-content summary linked from upload UI (policy text owned by product/legal).
3. Public **Report content** entry on Teacher Profile showcase items.
4. Takedown workflow: report → triage → temporary hide → decision → notify Teacher → retain evidence.
5. Repeated infringement escalation (warn → temporary upload ban → permanent ban) — thresholds BR.
6. Moderator escalation to Admin/legal contact.
7. Evidence retention for disputes independent of Teacher archive.
8. Legal contact / process page (or email) published for rights holders.

Until approved, `CopyrightReportingPolicy` readiness flag remains false and Production Showcase stays disabled.

## Moderation Operations

Technical queue is **not** sufficient for Production.

Required before `ModerationOperations=true`:

- **Owner:** Quality Reviewer role (ADR-007 Option A); Admin override only.
- **SLA target:** Business Rule Required (propose **2 business days** to first decision for MVP).
- Queue prioritization: oldest Submitted first; optional subject filters later.
- Reviewer assignment: existing start-review concurrency; avoid dual active reviewers (already applocked).
- Escalation: stuck UnderReview beyond SLA → Admin oversight dashboard metric.
- Rejected/ChangesRequested: existing reason codes + Teacher-visible notes.
- Abuse reporting: feeds same Quality queue or Admin triage (BR).
- Metrics: queue age p50/p95, approvals/rejections/changes counts, reviewer workload.
- Backup reviewer coverage documented.
- **No automatic approval.**

## Production Feature Gates

Keep fail-closed. Prefer splitting runtime capability (implementation phase) while preserving today’s aggregate readiness booleans until code lands.

Proposed config contract (names illustrative; wire in implementation):

```text
TeacherShowcases__Enabled                     # master; Production default false
TeacherShowcases__ManagementEnabled           # Teacher CRUD without public
TeacherShowcases__UploadEnabled               # MP4 upload path
TeacherShowcases__ModerationEnabled           # Quality queue decisions
TeacherShowcases__PublicPlaybackEnabled       # public SAS / sample content

TeacherShowcases__DurableObjectStorage        # proven Blob provider registered
TeacherShowcases__MalwareScanning             # scanner live + fail-closed
TeacherShowcases__ReliableMediaProbing        # probe worker live
TeacherShowcases__RetentionPolicy             # policy approved + jobs live
TeacherShowcases__CopyrightReportingPolicy    # legal/product approved
TeacherShowcases__ModerationOperations        # owner + SLA approved
TeacherShowcases__SecureMediaDelivery         # hybrid delivery tested
```

Rules:

- Production defaults: all false.
- Production `Enabled=true` requires every readiness boolean true **and** registered Blob + scan + probe implementations (not config theater).
- Incomplete Production config → host validation failure or Showcase APIs return safe feature-disabled errors; public profiles omit unusable media.
- Staging: explicit opt-in; may use Blob + scan in non-prod SKUs.
- Development: local provider allowed; scan/probe may be stubs that still fail closed when “production-like” flags are forced on.

Do not implement gate splits in this pass.

## Secrets and Identity

- Prefer **Managed Identity** for Blob data-plane access.
- RBAC least privilege per container; no account keys in source or frontend.
- Remaining secrets (if any) in **Azure Key Vault** / App Service references; rotation documented.
- Local Development: developer storage emulator or dedicated Dev account connection string via user secrets / env — never committed.
- CI: ephemeral credentials or emulator; no Production secrets in PR workflows.
- Staging/Production storage accounts separated.
- SAS signing uses server-side MI/user delegation keys; **never** expose signing keys to browsers.

## Networking and Delivery

**MVP Production requirements:**

- HTTPS only.
- Private Blob containers; public access level **None**.
- API/App Service egress to Blob via MI; prefer service endpoints / private endpoint when network controls exist.
- Range requests for private proxy and SAS downloads.
- Correct `Content-Type: video/mp4`; inline disposition for playback.
- CSP `media-src` allows self (proxy) and the Blob/SAS host only.
- CORS locked to Tafseel web origins if browser loads Blob directly via SAS.
- Short SAS lifetime; no hotlink-friendly permanent URLs.

**Later optimization:** CDN in front of approved media with token/SAS alignment; adaptive bitrate/transcoding; private link hardening.

## Limits and Abuse Controls

Respect ADR-007 / current options where defined:

| Limit | Source | Value |
|---|---|---|
| Max file size | ADR-007 / `MaxDemoBytes` | **250 MB** |
| Max duration | ADR-007 | **3,600 s** (server-enforced after probe) |
| Max public showcases / Teacher | Options default | **6** |
| Max public / subject | Options default | **3** |
| Max versions / showcase | Options default | **20** |
| Upload rate limit | Existing `"upload"` policy | **10 / hour** / user-or-IP |

Business Rule Required (propose for sign-off):

- Max resolution (e.g. **1920×1080**).
- Max average bitrate ceiling.
- Daily/weekly upload count beyond hourly rate limit.
- Concurrent processing jobs per Teacher / per host.
- Abandoned upload / quarantine TTL.
- Stream byte recount must match declared size (close Technical Debt).

## Observability

Required logs/metrics (no SAS, storage keys, file bytes, internal notes, or sensitive Teacher PII):

- upload started / completed / failed;
- scan result category + latency;
- probe result category + latency;
- processing queue depth and age;
- storage failures;
- playback / SAS issue failures;
- authorization denials (counts);
- moderation queue age; approve/reject/changes counts;
- public playback latency;
- orphan cleanup counts.

Alerts: scan worker down; probe p95 latency; quarantine backlog; infected spike; storage auth failures; queue SLA breach; public 5xx on sample content.

## Backup and Disaster Recovery

- Blob redundancy (ZRS/GRS as cost allows) **independent** of SQL backup.
- Soft delete + optional versioning on containers.
- Accidental deletion recovery runbook.
- DB ↔ media consistency: every `StorageKey` must resolve or public/private open fails closed; reconciliation job.
- Restore testing cadence (Operational Requirement).
- Regional outage: media unavailable fail closed on profiles (no broken players claiming playable).
- Migration rollback: keep quarantine copies until cutover ACK.
- Orphan media reconciliation after restore.

## Legacy Media Migration

Do not migrate in this pass. Plan:

1. Inventory local `FileStorage:RootPath` keys referenced by showcase/sample rows.
2. Copy to quarantine → scan → probe → private/approved containers by status.
3. Validate size + content hash (checksum) before flipping DB keys.
4. Missing file: leave private; public fail closed; mark `ProcessingError` / migration-failed.
5. Duplicates: single Blob, shared key only when domain already shared intentionally.
6. Qualification-generated samples: migrate storage only; never change provenance.
7. Legacy self-published → already fail-closed Submitted in Showcase migration; still require scan/probe before approval.
8. Rollback: retain local copies until checksum verification window ends.
9. Public visibility during migration: keep previous fail-closed behavior; do not show half-migrated public URLs.

## Threat Model

| Threat | Current protection | Missing | Required mitigation | Residual risk |
|---|---|---|---|---|
| Malicious MP4 | `ftyp`/MIME/size | Full parse, sandbox decode | Probe worker limits + codec allowlist | Novel exploits |
| Polyglot files | `ftyp` + extension | Deep content scan | Malware scan + probe | Scanner gaps |
| Path traversal | Generated keys + path guard | — | Keep; Blob keys opaque | Low |
| Storage-key enumeration | Keys not in API | — | Keep; no list APIs | Low |
| IDOR | Ownership/reviewer checks | Assigned-only reviewer optional | Keep tests; optional tighten | Broad reviewer access |
| SAS leakage | N/A today | — | Short TTL; no log of SAS; HTTPS | TTL window |
| Replay | Auth tokens | — | Short SAS; re-auth | TTL window |
| Oversized upload DoS | 250 MB + rate limit | Stream recount | Enforce counted bytes + quotas | Determined attackers |
| Decoder bombs | None | — | Probe time/memory caps | Residual |
| Malicious metadata | Partial | — | Probe + strip untrusted client duration | Low |
| Range abuse | Local only | Blob range limits | Proxy/SAS range; rate limits | Bandwidth cost |
| Scan bypass | None | Scanner | Fail-closed publish | Zero-days |
| Moderator preview risk | AuthZ | Infected gate | Block Infected preview | Insider risk |
| Infected download | None | — | No Teacher download when Infected | Ops forensics only |
| Direct Blob access | Local disk | — | Private containers; no anonymous | Misconfig |
| Stale public after archive/revoke | Gate recheck on open | SAS TTL window | Stop issuing SAS; short TTL | Brief playback remnant |

## Production Readiness Gates

| Gate | Pass criteria |
|---|---|
| Storage | Blob provider registered; private containers; MI auth; multi-instance open works |
| Scan | Async quarantine scan live; Infected/ScanFailed cannot submit/approve/public |
| Probe | Server duration/codec/dimensions enforced; ProbeFailed cannot submit |
| Retention | Written policy approved; soft-delete/orphan jobs scheduled |
| Copyright | Attestation + report/takedown process approved |
| Moderation | Owner + SLA + escalation documented and staffed |
| Delivery | Hybrid proxy + short-lived SAS tested; no permanent public URLs |
| Security | AuthZ/IDOR/upload threat tests pass including scan/probe fail-closed |
| Observability | Metrics/logs/alerts live without forbidden fields |
| DR | Blob soft-delete/restore drill completed; DB/media reconcile documented |

**Production Showcase remains disabled until all gates pass.** Setting readiness booleans without evidence is forbidden.

## Architecture

```text
Browser
  │
  ├─ Teacher upload (auth)
  │     → Tafseel API
  │         → Quarantine Blob container (MI)
  │         → enqueue Scan/Probe worker
  │
  ├─ Teacher/Quality private preview (auth)
  │     → Tafseel API authorize
  │         → stream from Private Blob (range)   [application proxy]
  │
  └─ Public playback (anonymous)
        → Tafseel API authorize public gates
            → issue short-lived read SAS
                → Approved Blob container (direct range GET)
                → (later) optional CDN

Scan/Probe Worker (isolated)
  Quarantine → scan → probe → promote Private
  on Approve → copy/move to Approved container
  Infected/Failed → retain policy → delete

SQL (Azure SQL) holds pointers + moderation state only — not media bytes.
Local App Service disk is Development-only fallback, never Production durable store.
```

## Implementation Phases

### Phase 1 — Azure Blob Provider

- Backend: Blob `IFileStorageService` (or composed provider); DI selection by config; keep local for Development.
- Infrastructure: storage account, private containers, MI, RBAC.
- Azure: separate Staging/Production accounts.
- Tests: store/open/delete/range; path safety; config validation rejects Production local-only.
- Risks: key remap bugs; dual-write complexity.
- Rollback: feature flag back to local in non-Production only.
- Non-goals: scan, probe, SAS public delivery, CDN, migration of all legacy files.

### Phase 2 — Quarantine and Processing

- Backend: media processing status; enqueue; fail-closed submit.
- Infrastructure: worker/container; scanner integration point.
- Tests: Infected/ScanFailed/ProbeFailed cannot submit/approve.
- Risks: scanner false positives; backlog.
- Rollback: disable upload gate.
- Non-goals: Production enablement; transcoding.

### Phase 3 — Secure Playback

- Backend: private proxy via Blob ranges; public short-lived SAS issuer.
- Tests: no key leakage; archive stops SAS; CSP/CORS.
- Risks: SAS TTL UX; clock skew.
- Rollback: proxy-only for public (costly but safe).
- Non-goals: CDN, ABR.

### Phase 4 — Retention and Cleanup

- Backend: orphan reconciliation; replace-draft delete; TTL jobs.
- Azure: lifecycle + soft delete.
- Tests: orphan removal; infected purge.
- Risks: premature delete under legal hold.
- Rollback: disable purge job; keep soft delete.
- Non-goals: account hard-deletion product redesign.

### Phase 5 — Operations and Observability

- Metrics/alerts; moderation SLA dashboards; copyright report intake (process).
- Tests: alert hooks; audit redaction.
- Risks: alert noise.
- Rollback: mute alerts; keep metrics.
- Non-goals: AI moderation.

### Phase 6 — Legacy Migration

- Controlled copy/verify/flip; qualification keys untouched semantically.
- Tests: checksum; missing-file fail closed.
- Rollback: revert key pointers to previous provider.
- Non-goals: rewriting moderation history.

### Phase 7 — Production Enablement

- Flip gates only after evidence checklist; E2E Staging clone; rollback disable `Enabled`.
- Non-goals: expanding content types; performance badges; feeds.

## Consequences

- Production Showcase stays disabled until every gate is evidenced.
- Development keeps local disk; Staging should move to Blob before claiming media readiness.
- Hybrid delivery balances authZ strength and App Service cost.
- Quality workload and legal/retention BRs remain external dependencies for enablement.
- Readiness booleans must be backed by registered implementations and runbooks, not config alone.

## Rejected Alternatives

- App Service `/home` as Production media store.
- Permanent public Blob containers or long-lived SAS.
- Treating MIME/`ftyp` as malware scanning.
- Synchronous FFprobe inside API request threads without isolation.
- Auto-approval of Showcases.
- Enabling Production by setting readiness flags without implementations.
- Broadening to non-MP4 or external embeds in this hardening track.

## Implementation Preconditions

1. Product/legal accept or amend proposed retention windows, copyright/report/takedown, and moderation SLA.
2. Azure subscription capacity for Storage + worker + optional Defender scanning.
3. Managed Identity and RBAC design reviewed.
4. Phase 1 Blob provider design reuses `IFileStorageService` without breaking qualification demos.
5. Keep Production `TeacherShowcases:Enabled=false` until Phase 7 evidence pack is signed.
6. No weakening of existing DI Production validation.
7. Do not commit secrets; do not document real keys in ADRs/reports.
