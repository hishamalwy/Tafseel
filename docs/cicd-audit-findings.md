# CI/CD Audit Findings

Date: 2026-07-26

## Closed

- **High — Environment isolation:** SQL tests were hardcoded to Windows LocalDB. Fixed with an injected SQL Server connection and isolated database names.
- **High — Secret exposure risk:** shell commands initially interpolated secret expressions. Fixed by passing secrets through environment variables and quoting runtime references.
- **High — Deployment risk:** production deployment could have consumed mutable artifacts. Fixed with semantic releases, SHA tags, release checksums, and image digest verification.
- **High — Migration risk:** migrations could run implicitly or destructively. Fixed with separate idempotent execution, serialization, previous-version upgrade tests, destructive-change detection, approval, and backup evidence.
- **High — Supply-chain risk:** actions and tools were floating. GitHub Actions are pinned to commit SHAs; NuGet is locked; images use versioned tags; Trivy, CodeQL, Gitleaks, SBOM, and checksums are gates.
- **Medium — Runtime integrity:** container could write broadly. Fixed with non-root runtime and read-only smoke execution using explicit temporary paths.
- **Medium — Reproducibility:** package locks and CI deterministic build properties were absent. Fixed.

## Open external/manual

- The dependency report marks direct `System.IdentityModel.Tokens.Jwt` 7.1.2 and xUnit 2.9.3 as legacy. No known vulnerability was reported; migrate them in a dedicated compatibility change rather than altering authentication/tests inside this CI/CD task.
- GitHub workflows have not yet run on GitHub.
- GitHub Environments, reviewers, branch protection, secrets, and variables require repository administration.
- Docker/actionlint could not initially be executed from the local workstation unless installed.
- Real critical providers, durable storage, deployment hook, production SQL, monitoring, and backup integrations remain external blockers.
- Browser visual automation is deferred until the dynamic design-document runtime is replaced.

No open in-repository Critical or High pipeline defect is known after hardening.
