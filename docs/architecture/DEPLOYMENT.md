# Tafseel Deployment Architecture

## GitHub Actions

The repository contains focused workflows for CI, security scanning, database checks, Docker image work, Staging gates/deployment, Production deployment and scheduled maintenance. Locked dependency restore and validation gates are preserved.

## Staging

Staging deployment follows its required workflow gates. Normal application startup does not run Development identity/catalog initialization and does not apply migrations. Environment settings must provide non-Development email configuration and valid secrets.

## Production

Production deployment remains manual. Current startup validation deliberately fails while mock payment or live-session providers are selected. Production is not considered ready until the production checklist and external integrations are completed.

## Manual Migrations

Staging and Production database migrations are generated/reviewed separately and applied manually. Application startup must not apply them. Development bootstrap retains its existing migration behavior.

## Environment Configuration

Configuration contracts include:

- SQL Server connection string.
- JWT issuer, audience, signing key and lifetimes.
- CORS origins.
- Resend token and verified sender.
- Email application, confirmation and password-reset URLs.
- Payment provider and webhook secret.
- Live-session provider and timing settings.
- Fee, dispute, file-storage and data-protection settings.

## Startup Validation

Options validation fails startup for missing/placeholder JWT settings, invalid URLs/senders, missing Resend credentials, invalid fee/timing boundaries, automatic financial release and unsupported Production providers.

## Development-only Initialization

Normal startup invokes identity/catalog initialization only in Development and passes migrations enabled, preserving the established Development behavior.

Testing skips the Program startup invocation and uses the explicit integration-test factory bootstrap.

Staging and Production do not invoke the initializer, do not repair seed data, do not create demo identities and do not trigger migrations through this path.
