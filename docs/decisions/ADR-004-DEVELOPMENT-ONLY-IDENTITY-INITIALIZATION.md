# ADR-004: Identity Initialization Is Development-only

## Status

Accepted.

## Context

The initializer can apply Development migrations, repair canonical roles/catalog/languages and, when directly invoked with a Staging environment, manage demo identities. Normal hosted startup must not mutate Staging or Production data.

## Decision

Normal application startup invokes the initializer only in Development with migrations enabled. Testing preserves its explicit factory bootstrap. Staging and Production do not invoke the initializer.

## Consequences

- Development retains first-run bootstrap behavior.
- Staging and Production migrations remain manual.
- Normal Staging startup cannot create demo identities.
- Production configuration validation and fail-fast behavior remain independent and unchanged.

## Alternatives Considered

- Pass `migrate: false` outside Development: rejected because seeding still runs.
- Add a configuration flag: rejected because the existing environment boundary is sufficient.
- Move seeding to a background worker: rejected because it would preserve unauthorized hosted mutation and weaken fail-fast behavior.
