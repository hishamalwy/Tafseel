# Versioning and Releases

Releases use annotated or lightweight semantic tags: `vMAJOR.MINOR.PATCH`.

- Major: incompatible API or operational contract.
- Minor: backward-compatible feature.
- Patch: backward-compatible fix.

The Release workflow rejects non-semantic versions and commits not reachable from `main`. Assemblies receive the numeric version and `InformationalVersion=<version>+<Git SHA>`.

Images are tagged `sha-<40-character SHA>` and the exact semantic version. `latest` is intentionally not used. Release assets contain the API archive, frontend, idempotent migration, SPDX SBOM, Docker digest metadata, gate summary, and SHA-256 checksums.

A tag creates artifacts but never deploys Production. Production is a separate manually approved workflow tied to an existing GitHub Release.
