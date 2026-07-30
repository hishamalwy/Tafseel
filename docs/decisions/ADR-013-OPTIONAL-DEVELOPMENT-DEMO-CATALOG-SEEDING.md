# ADR-013: Optional Development Demo Catalog Seeding

## Status

Accepted.

## Context

ADR-012 makes the four canonical demo accounts available in Development, opt-in and disabled by
default. Logged in as one of those accounts, a fresh Development database is still empty of content:
no subjects, topics, qualification topics or education levels — the screens that depend on them
(Browse Teachers, Teacher Apply, student request forms) have nothing to show. Subjects/topics are real
business content (whatever subjects the product actually teaches), not infrastructure like the
canonical service catalog codes the app's business logic keys off of — so, unlike `CanonicalServices`,
they must not seed unconditionally in every environment.

## Decision

Add a second, independent opt-in option, `SeedDemoData:Enabled` (default `false`), gated by the exact
same Development-only pattern as ADR-012: the outer `IdentityInitialization.RunAsync` gate, a
`developmentSeedEnabled`/`demoCatalogSeedEnabled`-style computed flag, and a defensive guard repeated
inside `SeedDevelopmentDemoCatalogAsync` itself that never trusts its caller. It is deliberately a
separate flag from `SeedUsers`, not a shared one: a developer may want demo users without placeholder
catalog content, or vice versa, and neither implies the other. Unlike `SeedUsers`, no secret is
involved — catalog content isn't a credential — so there is nothing to validate at startup.

Seeding creates seven demo subjects (Mathematics, Physics, Chemistry, Biology, English Language,
Arabic Language, Computer Science), each with a few topics and one qualification topic (a bilingual
teaching-demo task, matching the 3-minute video copy already shown to teacher applicants), plus four
education levels. Matching is by `NormalizedName` (subjects globally, topics/qualification topics
scoped to their subject) since these entities have no other natural business key. Idempotent and
repair-only: a missing subject/topic/qualification-topic/education-level is (re)created; nothing
already present is modified or deleted, so any real admin edits to demo content survive a restart.

## Consequences

- A developer enables both together with `dotnet user-secrets set "SeedUsers:Enabled" "true"` and
  `dotnet user-secrets set "SeedDemoData:Enabled" "true"` (or just the latter, for catalog content
  without demo accounts).
- Staging and Production are structurally unaffected regardless of configuration, identical in spirit
  to ADR-012.
- The fast idempotency check only verifies subject presence by name (not every topic/qualification
  topic), matching ADR-012's existing tradeoff of a cheap heuristic over an exhaustive check — a
  false "nothing to do" is impossible (subjects are the parent of everything else, so their absence is
  always caught), the only risk is a startup that fully re-verifies topics/qualification-topics/levels
  when only the subject set was actually still complete; the seeding method is idempotent regardless.

## Alternatives Considered

- Seed catalog content unconditionally in every environment, like `CanonicalServices`: rejected — real
  subjects are business content the product team decides, not infrastructure a fresh database always
  needs to function.
- Reuse `SeedUsers:Enabled` for both users and catalog content: rejected — conflates two independent
  concerns under a name that doesn't suggest it also writes Subjects/Topics; a developer could
  reasonably want only one.
- Model qualification topics' evaluation guidance as freeform admin-authored content generated at
  seed time: rejected — fixed, reviewable seed text is simpler and avoids any dependency on an LLM or
  external content source for local development.
