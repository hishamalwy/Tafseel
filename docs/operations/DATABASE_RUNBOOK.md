# Database runbook (SQL Server)

The database is the system of record for money (ledger, escrow, payouts), identity and every lifecycle. Object
storage holds file bytes only; the database holds their keys. Backup and restore are about both, but the database is
the one that must never be lost.

Owner of this runbook: the named on-call operator ([DAY1_RUNBOOK §1](DAY1_RUNBOOK.md#1-day-1-accounts)). Related:
[BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md) (checklists), [PRODUCTION_SECRETS_CHECKLIST.md](PRODUCTION_SECRETS_CHECKLIST.md).

## 1. Facts

| Item | Value (2026-09-30) |
|---|---|
| Engine | SQL Server (tested on 2022 CU26 in CI and 2025 locally). Azure SQL Database / Managed Instance compatible |
| Migrations | 49 EF Core migrations; latest `20260929181412_TeacherIntroVideo`; model drift: none |
| Schema | 85 tables, 268 indexes (57 unique besides primary keys, 23 filtered), 150 CHECK constraints, 142 foreign keys, 24 row-version columns |
| Money paths | Serializable transactions + `ApplicationLock`; unique idempotency indexes on payments, refunds, withdrawals, dispute resolution, webhook events |
| App startup | **Never migrates** outside Development. Migrations are a separate, approved deploy step |
| Reference data | `dotnet Tafseel.Api.dll provision` (roles, canonical services with the DEC-01 policy, languages, first Admin). Idempotent |
| Retention | `DataRetentionWorker`: read notifications 180 d, auth records 30 d, marketplace analytics 365 d (`Privacy:*`) |
| RPO / RTO | **PROPOSED, not agreed:** ≤ 15 min / ≤ 4 h ([SYSTEM_ARCHITECTURE › Quality targets](../architecture/SYSTEM_ARCHITECTURE.md#quality-targets)). No business SLA is invented here |

## 2. Logins (least privilege)

| Login | Rights | Used by |
|---|---|---|
| `tafseel_app` | `db_datareader`, `db_datawriter`, `EXECUTE` (application locks call `sp_getapplock`) | The running API (`ConnectionStrings__Tafseel`) |
| `tafseel_migrator` | `db_ddladmin` + the above | Deploy job only (`SQL_USERNAME`) |
| Platform admin | Server admin | Break-glass; two named people |

Encryption in transit (`Encrypt=True`) and at rest (platform TDE) are required.

## 3. Deployment migration procedure

Automated in `.github/workflows/deploy-production.yml`; the manual equivalent is the same steps.

1. **Review.** The release's `tafseel-idempotent.sql` is attached to the GitHub Release with a SHA-256 in `SHA256SUMS`.
   CI already ran the destructive-change gate (`check-migration-safety.ps1`) on every new migration and the
   upgrade-from-previous test (`database.yml`). Read the new migrations' `Up()` yourself.
2. **Backup first.** Take an on-demand backup / restore point; record its id as `BACKUP_EVIDENCE_ID`. The workflow
   refuses to migrate without it.
3. **Apply** with the migration login. `-I` is mandatory: the ODBC `sqlcmd` defaults `QUOTED_IDENTIFIER OFF`, and the
   filtered unique indexes then fail (found and fixed in this pass):
   ```bash
   sqlcmd -C -b -I -S "$SQL_SERVER" -d "$SQL_DATABASE" -U "$SQL_USERNAME" -i tafseel-idempotent.sql
   ```
   Each migration runs in its own transaction and is recorded in `__EFMigrationsHistory`; re-running the script is safe.
4. **Provision** (idempotent): `docker run --rm -e ASPNETCORE_ENVIRONMENT=Production -e ConnectionStrings__Tafseel -e Jwt__SigningKey -e Provisioning__BootstrapAdminEmail <image> provision`.
5. **Verify** (below), then deploy the application image.

### Manual verification queries

```sql
SELECT COUNT(*) AS migrations, MAX(MigrationId) AS latest FROM __EFMigrationsHistory;   -- latest = the release's newest migration
SELECT name FROM AspNetRoles ORDER BY name;                                             -- Admin, Finance, QualityReviewer, Student, Teacher
SELECT Code, MinPrice, MaxPrice FROM ServiceCatalogItems ORDER BY DisplayOrder;         -- DEC-01 table, not 0.01 / 1000000
SELECT COUNT(*) FROM sys.indexes WHERE has_filter = 1;                                  -- 23 at this release
DBCC CHECKDB WITH NO_INFOMSGS;                                                          -- platform-permitting
```

## 4. Backup procedure

| What | How | Frequency | Retention |
|---|---|---|---|
| Database | Platform automated backups with point-in-time restore (full + differential + log) | Continuous (log ≤ 15 min for the proposed RPO) | ≥ 35 days PITR; monthly long-term copy kept 12 months (**owner to confirm**, L-33 retention) |
| Database, per release | On-demand backup / restore point before every migration (`BACKUP_EVIDENCE_ID`) | Every production deploy | Until the next release is stable + 30 days |
| Object storage `tafseel-private` | Soft delete (≥ 30 days) + blob versioning; optionally geo-redundant replication | Continuous | 30 days soft delete |
| Data Protection key ring | Lives on the durable key volume; include it in the volume's snapshot policy | Daily | 90 days |
| Payout vault key | In the secret store with its own backup/recovery; two named custodians | On creation and rotation | Forever while any destination is sealed with it |

On a self-managed SQL Server, `BACKUP DATABASE … WITH CHECKSUM` to storage outside the server; always `COPY_ONLY` for
ad-hoc copies so the platform chain is untouched.

**Who can restore:** the two named platform admins. Production restores need the owner's go-ahead (money and personal
data change). Never restore Production into Staging without scrubbing personal data and payout destinations.

## 5. Rollback

- **Application:** redeploy the previous image by digest (`vars.PREVIOUS_IMAGE`); the workflow does it automatically
  when the post-deploy smoke fails.
- **Database: no automatic rollback.** Migrations are forward-only in Production. `Down()` methods are not a rollback
  plan: they can drop data written since the release.
- **What makes application rollback safe:** every migration must be backward compatible with the previous release
  (expand → deploy → contract). Additive columns must be nullable or defaulted; renames and drops happen one release
  after the code stopped using them. The CI safety gate refuses drops, renames and type narrowing without a named
  approval. All nine migrations added since the last commit passed it (0 warnings).
- **If a migration itself is wrong:** stop writes (maintenance response at the proxy), restore to a **new** database at
  the pre-migration restore point, verify with §3 queries and the drill script, repoint `ConnectionStrings__Tafseel`,
  redeploy the previous image. Everything written after the restore point is lost and must be reconciled by hand
  (payments against the PSP dashboard, payouts against the bank statement). This is why the backup id is mandatory.

## 6. Proof run (2026-09-30)

Machine: SQL Server 2025 Developer (17.0.1000.7), Windows; non-production data only.

| Check | Result |
|---|---|
| Idempotent release script generated (`dotnet ef migrations script --idempotent`) | 251 KB, 49 migrations, SHA-256 `81374829…81d1d` |
| Apply to an **empty** database | PASS, 2.2 s — with `-I`. **Without `-I` it fails** (`Msg 1934 … QUOTED_IDENTIFIER`): production workflow fixed |
| Re-apply the same script over the latest schema | PASS, 1.0 s, no errors, still 49 rows in history |
| Upgrade from the last committed schema (`20260917122520_ListedPriceAtRequest`, 40 migrations) | PASS, 40 → 49 |
| `has-pending-model-changes` | "No changes have been made to the model since the last migration." |
| Destructive-change gate on the 9 new migrations | 9/9 OK, 0 warnings, 0 approvals |
| `provision` in `Production` mode | Roles, services, languages in place; unknown bootstrap email refused ("account does not exist") |
| Production start with the shipped settings | Refused, listing 9 settings by name, no values |
| Production start with clean settings but no real providers | Refused: storage, scanner, meeting provider, payout keys |
| Backup → verify → restore to new DB → `DBCC CHECKDB` → compare (seeded drill DB) | PASS: 85 tables, 120 rows, 49 migrations; every count + checksum identical; backup 0.1 s, restore 0.4 s |
| Same drill on a browser-journey database (orders, payments, ledger, sessions) | PASS: 85 tables, 412 rows; identical |

Repeat the drill any time:

```powershell
./scripts/ops/Test-TafseelBackupRestore.ps1 -Server <server> -Database <db> -BackupDirectory <path SQL Server can write> -ReportPath drill.md
```

On Azure SQL Database (no `BACKUP TO DISK`): restore a point in time to a new database from the platform, then run the
script with `-SkipBackup -RestoredDatabase <new db>` against the restored copy and compare with the source.

**Still required on the real platform (REL-01):** one point-in-time restore of the production-like staging database,
timed against the agreed RTO, with the result recorded here.

## 7. Routine maintenance

- Automatic statistics on (default). Weekly index maintenance (rebuild > 30 % fragmentation, reorganize 10–30 %) or the
  platform's automatic tuning.
- Watch: database size, log growth, DTU/vCore saturation, blocking over 30 s, deadlocks (money paths serialize by
  design; a deadlock is a bug to report, not to retry blindly).
- Never run ad-hoc `UPDATE`/`DELETE` on ledger, payment, refund, withdrawal or escrow tables. Money corrections go
  through the Finance screens so they are audited and balanced.
