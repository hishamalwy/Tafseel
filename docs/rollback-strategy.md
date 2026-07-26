# Rollback Strategy

## Application

Record the release version, Git SHA, and image digest. If post-deployment health fails, redeploy `PREVIOUS_IMAGE` through the adapter. Verify that the previous application is compatible with the current database before approval.

## Database

Do not automatically run down migrations. Prefer a forward fix. For corruption or an incompatible destructive change, use a tested point-in-time restore or backup restoration. Destructive migrations require compatibility review, backup evidence, Environment approval, and rollback-drill evidence before execution.

## Providers and secrets

- Restore the previous verified payment/email/session/storage configuration only when its credentials remain valid.
- For exposure: revoke, replace, redeploy/restart, then verify the old credential is rejected.
- Rotate storage and Data Protection access without deleting historical keys or inaccessible encrypted data.

Rollback evidence must include actor, time, release/image, database state, health result, and incident link.
