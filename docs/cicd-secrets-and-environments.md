# CI/CD Secrets and Environments

Create GitHub Environments named `development`, `staging`, and `production`. Production must require reviewers, prevent self-approval, and allow only protected semantic release tags.

## Repository CI secret

- `CI_SQL_PASSWORD`: strong, CI-only SQL Server SA password. Fork pull requests do not receive it and therefore fail closed until a maintainer runs the trusted gate.

## Azure Staging Environment

Create these secrets in the GitHub Environment named `staging`:

- `AZURE_CLIENT_ID`: client ID of the user-assigned managed identity.
- `AZURE_TENANT_ID`: Microsoft Entra tenant ID.
- `AZURE_SUBSCRIPTION_ID`: Azure subscription ID.
- `STAGING_SQL_SERVER`: Azure SQL logical server DNS name for Staging only.
- `STAGING_SQL_USERNAME`: dedicated least-privilege SQL login for Staging migrations only.
- `STAGING_SQL_PASSWORD`: password for the dedicated Staging migration login.

Create this Environment variable:

- `APP_URL`: `https://tafseel-api-hisham-dchqfbhsfbbndfgx.francecentral-01.azurewebsites.net`
- `STAGING_SQL_DATABASE`: `tafseel-staging-db`

The federated credential must use issuer `https://token.actions.githubusercontent.com`, audience `api://AzureADTokenExchange`, and subject `repo:hishamalwy/Tafseel:environment:staging`. Grant the managed identity only the App Service deployment permissions it needs, preferably `Website Contributor` scoped to this Web App.

These are OIDC identifiers, not client secrets. Do not add a publish profile or Azure client secret.

If Deployment Center has not yet created the identity because its generated workflow was canceled, create the user-assigned identity and federated credential manually with the values above, assign the scoped role, then copy the three identifiers into the GitHub Environment.

The repository does not currently prove that the GitHub OIDC principal is configured as an Azure SQL Microsoft Entra user with data-plane rights. The documented safe default is therefore a dedicated Staging SQL login scoped only to `tafseel-staging-db` for pre-deploy migration execution. Do not reuse Production SQL credentials.

Recommended one-time SQL setup for the Staging migration login:

- Scope it to `tafseel-staging-db` only.
- Grant only the permissions required to apply reviewed migrations and backfills, typically `db_datareader`, `db_datawriter`, and `db_ddladmin`.
- Do not grant `db_owner` unless a reviewed migration demonstrably requires it.
- Rotate `STAGING_SQL_PASSWORD` on the normal secret-rotation cadence and immediately after any exposure suspicion.

Azure Staging does not read `DEPLOY_HOOK_URL`, `DEPLOY_HOOK_TOKEN`, `DATABASE_CONNECTION_STRING`, `SQL_SERVER`, `SQL_DATABASE`, `SQL_USERNAME`, `SQL_PASSWORD`, `SMOKE_EMAIL`, `SMOKE_PASSWORD`, `PROVIDER_SMOKE_URL`, or `PROVIDER_SMOKE_TOKEN`. Do not add them to the `staging` Environment.

Runtime application secrets belong in Azure App Service Configuration, not GitHub:

- `ConnectionStrings__Tafseel`
- `Jwt__SigningKey`
- `Resend__ApiToken`
- `Payments__WebhookSecret`

The remaining required App Service settings and demo-safe values are listed in `deployment.md`.

## Production secrets

- `DATABASE_CONNECTION_STRING`, `JWT_SIGNING_KEY`, `RESEND_API_TOKEN`, `PAYMENTS_WEBHOOK_SECRET`
- `SQL_SERVER`, `SQL_DATABASE`, `SQL_USERNAME`, `SQL_PASSWORD`
- `DEPLOY_HOOK_URL`, `DEPLOY_HOOK_TOKEN`
- `BACKUP_EVIDENCE_ID` (Production)
- Optional maintenance: `BACKUP_STATUS_TOKEN`

## Environment variables

- `APP_URL`, `EMAIL_FROM`, `EMAIL_CONFIRMATION_URL`, `EMAIL_PASSWORD_RESET_URL`
- `PAYMENTS_PROVIDER`, `LIVE_SESSIONS_PROVIDER`, `FILE_STORAGE_PROVIDER`
- `DATA_PROTECTION_KEYS_PATH`, `CORS_ORIGIN`, `DEPLOY_STRATEGY`
- `PREVIOUS_IMAGE` (Production rollback target)
- Optional maintenance: `PRODUCTION_HEALTH_URL`, `BACKUP_STATUS_URL`

All URLs must be exact HTTPS values. Production rejects mock critical providers, Resend sandbox senders, wildcard/non-HTTPS CORS, local storage, relative key paths, or missing names. Azure Staging's mock/local exceptions do not weaken the Production workflow or application validation.
