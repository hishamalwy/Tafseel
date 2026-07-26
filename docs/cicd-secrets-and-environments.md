# CI/CD Secrets and Environments

Create GitHub Environments named `development`, `staging`, and `production`. Production must require reviewers, prevent self-approval, and allow only protected semantic release tags.

## Repository CI secret

- `CI_SQL_PASSWORD`: strong, CI-only SQL Server SA password. Fork pull requests do not receive it and therefore fail closed until a maintainer runs the trusted gate.

## Staging and Production secrets

- `DATABASE_CONNECTION_STRING`, `JWT_SIGNING_KEY`, `RESEND_API_TOKEN`, `PAYMENTS_WEBHOOK_SECRET`
- `SQL_SERVER`, `SQL_DATABASE`, `SQL_USERNAME`, `SQL_PASSWORD`
- `DEPLOY_HOOK_URL`, `DEPLOY_HOOK_TOKEN`
- `SMOKE_EMAIL`, `SMOKE_PASSWORD` (Staging only)
- `PROVIDER_SMOKE_URL`, `PROVIDER_SMOKE_TOKEN` (Staging only)
- `BACKUP_EVIDENCE_ID` (Production)
- Optional maintenance: `BACKUP_STATUS_TOKEN`

## Environment variables

- `APP_URL`, `EMAIL_FROM`, `EMAIL_CONFIRMATION_URL`, `EMAIL_PASSWORD_RESET_URL`
- `PAYMENTS_PROVIDER`, `LIVE_SESSIONS_PROVIDER`, `FILE_STORAGE_PROVIDER`
- `DATA_PROTECTION_KEYS_PATH`, `CORS_ORIGIN`, `DEPLOY_STRATEGY`
- `PREVIOUS_IMAGE` (Production rollback target)
- Optional maintenance: `PRODUCTION_HEALTH_URL`, `BACKUP_STATUS_URL`

All URLs must be exact HTTPS values. Production rejects mock critical providers, Resend sandbox senders, wildcard/non-HTTPS CORS, local storage, relative key paths, or missing names. Use OIDC/workload identity in a future cloud-specific deployment adapter; do not replace the hook token with broad, long-lived cloud credentials.
