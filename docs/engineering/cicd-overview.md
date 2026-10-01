# CI/CD Overview

Tafseel uses focused GitHub Actions workflows. Every deployable release is identified by a semantic version and immutable Git SHA; production is never deployed from a pull-request artifact.

| Workflow | Trigger | Purpose |
|---|---|---|
| CI | PR/main/manual/reusable | Locked restore, format, build, tests, coverage, JavaScript, EF drift, publish smoke |
| Security | PR/main/weekly/manual/reusable | vulnerable/deprecated packages, Gitleaks history scan, C#/JS CodeQL, production-config policy |
| Database | migration PR/main/manual/reusable | SQL Server fresh/upgrade migrations, model drift, destructive-change gate, Linux migration bundle, idempotent SQL |
| Docker | PR/main/manual/reusable | multi-stage image, Trivy, read-only runtime smoke, routes, health, fail-closed Production |
| Release | semantic tag/manual | invokes all gates, publishes immutable image, API archive, migration, SBOM, checksums, release notes |
| Staging Gate | main push/manual | waits with bounded retry until required same-commit checks succeed; does not deploy or migrate |
| Deploy Staging - Azure App Service | auto after Staging Gate success on main; manual SHA fallback | resolves exact validated `workflow_run.head_sha` (or dispatch SHA), applies safe pending EF migrations to `tafseel-staging-db`, verifies history/schema, then OIDC-deploys the same SHA and runs smoke tests |
| Deploy Production | manual validated release | Production Environment approval, verifies checksums/digest/config, migrates separately, deploys and smoke-tests |
| Scheduled Maintenance | weekly/manual | dependencies, secrets, migration drift, container baseline, optional health/backup metadata |

Deployment concurrency is cancelable for superseded CI/staging work, serialized for database work, and never canceled for Production.

Staging uses Azure App Service code deployment through a user-assigned managed identity and OIDC. Azure SQL migration execution is separately scoped and currently repo-documented as a dedicated Staging SQL login because the repository only proves OIDC access for Azure control-plane/App Service deployment, not SQL data-plane authorization. Production remains separate and provider-neutral; its authenticated deployment adapter is unchanged.
