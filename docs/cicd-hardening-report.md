# CI/CD Hardening Report

- Least-privilege workflow permissions are explicit.
- Fork pull requests receive no deployment or environment secrets.
- Untrusted versions and SHAs are regex-validated before use.
- Production artifacts originate only from complete reusable gates.
- Actions are pinned by immutable SHA and dependencies use lock files.
- Gitleaks scans history; CodeQL scans C# and JavaScript; Trivy gates Critical/High image findings.
- Deployment uses immutable image digests and verified SHA-256 release assets.
- Database operations are serialized, separate from startup, reviewed, and never automatically rolled back.
- Staging can cancel superseded work; Production cannot.
- Production requires GitHub Environment approval, migration confirmation, backup evidence, real providers, durable storage/keys, exact HTTPS origins, and a verified sender.

Local evidence and GitHub-only evidence are separated in `cicd-implementation-report.md`.
