# Deployment

## Staging

Run `Deploy Staging` with a full Git SHA on `main`. The workflow verifies all required GitHub checks, validates production-like configuration, generates and applies the idempotent migration separately, invokes the authenticated deployment hook with `sha-<SHA>`, then tests readiness, liveness, frontend routes, protected routes, authentication, and a configured provider sandbox endpoint.

## Production

1. Create and validate a semantic GitHub Release.
2. Confirm backup evidence and migration review.
3. Run `Deploy Production` with the existing version and migration confirmation.
4. Approve the protected Production Environment.
5. The workflow downloads release assets, verifies checksums and image digest, validates configuration and SQL connectivity, applies SQL separately, deploys the immutable digest using the configured safe strategy, and runs production-safe smoke tests.

Application startup never applies Production migrations. Failed health triggers application-image rollback only; database rollback remains manual.

## Deployment adapter

`DEPLOY_HOOK_URL` receives authenticated JSON with environment, immutable image, revision/version, and strategy. It must return non-2xx until the platform has accepted and recorded the operation. Implement the hook using least-privilege OIDC in the target platform and preserve rolling or blue-green semantics.

Troubleshooting evidence is in job summaries and failure artifacts. Do not retry a migration or financial/provider operation until its idempotency and database state are understood.
