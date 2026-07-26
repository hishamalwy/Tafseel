# Branch Protection

Protect `main` with:

- Pull request required; at least one reviewer; resolved conversations; branch up to date.
- No force pushes, branch deletion, or direct pushes.
- Signed commits where organization policy supports them.
- Required checks:
  - `CI / build-and-provider-neutral`
  - `CI / sql-server`
  - `CI / publish-smoke`
  - `Security / dependencies-and-secrets`
  - `Security / codeql-csharp`
  - `Security / codeql-javascript-typescript`
  - `Database / migrations`
  - `Docker / image`
- Require Production Environment approval separately from branch review.

Configure the `production` Environment with required reviewers, prevent self-approval, and restrict deployment to protected `v*.*.*` tags. These repository settings are manual GitHub administration; no undocumented settings automation is included.
