# Backup and Restore

## Backup checklist

- [ ] Identify environment (Staging / Production) and subscription
- [ ] Azure SQL automated backups enabled (PITR window documented)
- [ ] On-demand backup or export taken before schema migrate
- [ ] Backup artifact ID / timestamp recorded in change ticket
- [ ] Blob storage soft-delete / versioning policy confirmed for `tafseel-private`
- [ ] Data Protection key ring backed up if not using managed key storage
- [ ] Retention meets legal/ops policy (document days)

## Restore checklist

- [ ] Declare incident severity and freeze writes if needed
- [ ] Choose restore point (time or backup ID)
- [ ] Restore Azure SQL to a **side** database first when possible
- [ ] Validate schema version vs application release
- [ ] Restore or re-attach private Blob container only if object loss is in scope
- [ ] Rotate secrets if compromise is suspected
- [ ] Point app connection string only after validation queries pass
- [ ] Run `/health/ready`, auth smoke, catalog smoke
- [ ] Document restore duration and residual data loss window

## Disaster recovery checklist

- [ ] RPO / RTO targets agreed with product owner
- [ ] Secondary region decision documented (active/active not required for MVP)
- [ ] DNS / Front Door failover owner named
- [ ] Communication template for status page / stakeholders
- [ ] Post-incident review scheduled within 5 business days

## Application data classes

| Data | Store | Notes |
|---|---|---|
| Relational domain | SQL Server | Source of truth for orders, payments ledger, messaging metadata |
| Private media | Azure Blob (Production) / Local disk (Dev) | Keys in DB; binaries in object store |
| Identity | ASP.NET Identity tables | Same SQL database |
| Data Protection keys | Filesystem path or future Key Vault | Required for multi-instance cookie/token protection consistency |

## Prohibitions

- Do not delete Production backups to “free space” without dual control.
- Do not restore Production over Staging without scrubbing secrets and PII controls.
- Do not run untested reverse migrations in Production.
