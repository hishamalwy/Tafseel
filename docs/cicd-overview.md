# CI/CD Overview

Tafseel uses focused GitHub Actions workflows. Every deployable release is identified by a semantic version and immutable Git SHA; production is never deployed from a pull-request artifact.

| Workflow | Trigger | Purpose |
|---|---|---|
| CI | PR/main/manual/reusable | Locked restore, format, build, tests, coverage, JavaScript, EF drift, publish smoke |
| Security | PR/main/weekly/manual/reusable | vulnerable/deprecated packages, Gitleaks history scan, C#/JS CodeQL, production-config policy |
| Database | migration PR/main/manual/reusable | SQL Server fresh/upgrade migrations, model drift, destructive-change gate, idempotent SQL |
| Docker | PR/main/manual/reusable | multi-stage image, Trivy, read-only runtime smoke, routes, health, fail-closed Production |
| Release | semantic tag/manual | invokes all gates, publishes immutable image, API archive, migration, SBOM, checksums, release notes |
| Deploy Staging | manual SHA | verifies commit checks, migrates separately, invokes deployment adapter, runs smoke tests |
| Deploy Production | manual validated release | Production Environment approval, verifies checksums/digest/config, migrates separately, deploys and smoke-tests |
| Scheduled Maintenance | weekly/manual | dependencies, secrets, migration drift, container baseline, optional health/backup metadata |

Deployment concurrency is cancelable for superseded CI/staging work, serialized for database work, and never canceled for Production.

The provider-neutral deployment adapter is an authenticated HTTPS hook accepting environment, immutable image, revision/version, and strategy. A cloud-specific OIDC adapter can replace that single step later without changing release gates.
