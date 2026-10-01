# Tafseel documentation

What Tafseel must do, and how to run it. Authority order is in [AGENTS.md](../AGENTS.md).

## Product rules
- [Product Contract](product/TAFSEEL_PRODUCT_CONTRACT.md) — business rules, roles, fees, providers
- [V1 Scope](product/V1_SCOPE.md) and [V1.1 Backlog](product/V1_1_BACKLOG.md)
- [Roles and permissions](product/ROLES_AND_PERMISSIONS.md)
- [State machines](product/STATE_MACHINES.md)
- [UX principles](product/UX_PRINCIPLES.md)
- [Owner decisions](releases/V1_OWNER_DECISIONS.md) and [V1 release blockers](releases/V1_RELEASE_BLOCKERS.md)
- Decision records: [decisions/](decisions/) · V1 tickets: [tickets/v1/](tickets/v1/README.md)

## Architecture
- [System architecture](architecture/SYSTEM_ARCHITECTURE.md), [domain model](architecture/DOMAIN_MODEL.md),
  [API guidelines](architecture/API_GUIDELINES.md), [security](architecture/SECURITY.md), [deployment](architecture/DEPLOYMENT.md)

## Running Tafseel
- [Environments](ENVIRONMENTS.md) — Development, Staging, PreProduction, Production; databases; seed; reset
- Operations: [runbook](operations/RUNBOOK.md), [Day-1 runbook](operations/DAY1_RUNBOOK.md),
  [database runbook](operations/DATABASE_RUNBOOK.md), [backup and restore](operations/BACKUP_AND_RESTORE.md),
  [observability and alerts](operations/OBSERVABILITY_AND_ALERTS.md), [production secrets](operations/PRODUCTION_SECRETS_CHECKLIST.md),
  [JaaS live sessions](operations/JAAS_LIVE_SESSIONS.md)

## Going to production
- [Launch readiness](releases/PRODUCTION_LAUNCH_READINESS.md), [go-live checklist](releases/GO_LIVE_CHECKLIST.md),
  [payment provider contract](releases/PAYMENT_PROVIDER_INTEGRATION_CONTRACT.md)

## Engineering
- [SDLC](engineering/SDLC.md) and the [ticket template](engineering/templates/FEATURE_TICKET.md)
- [CI/CD overview](engineering/cicd-overview.md), [CI secrets and environments](engineering/cicd-secrets-and-environments.md),
  [testing in CI](engineering/testing-in-ci.md), [branch protection](engineering/branch-protection.md),
  [versioning and releases](engineering/versioning-and-releases.md)
