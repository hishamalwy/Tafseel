# ADR-014: AI Provider and Trust Boundaries

Date: 2026-08-08  
Status: Accepted for Release 9; live-provider production enablement pending

## Context

Release 9 needs natural-language discovery, request drafting, and bounded product help. AI must interpret language, but Tafseel's database and deterministic Release 6 services remain the only marketplace authority.

## Decision

Use `IAiProvider` in Application and a Groq implementation in Infrastructure through the official OpenAI .NET SDK's custom endpoint support. The configured model is `openai/gpt-oss-120b`. Calls are non-streaming and request strict JSON Schema. Provider DTOs do not escape Infrastructure/Application boundaries.

The application validates every model result, resolves names against active canonical catalog rows, and then invokes the existing deterministic discovery flow. Model output cannot supply Teacher IDs, change eligibility, rank Teachers, write catalog data, submit requests, call tools, search the web, or decide policy.

`GROQ_API_KEY` is read only from the server process environment. AI is disabled by default. Missing credentials or runtime provider failures return a bounded unavailable result while normal Browse and Guided Request remain operational.

No new persistence, vector database, AI memory, tool execution, file ingestion, or migration is introduced. Inputs and token output are bounded, AI has a separate application limiter, and raw prompts/responses are not logged.

## Consequences

- Adding another provider requires only a new `IAiProvider` implementation and explicit provider validation.
- Groq strict structured-output restrictions determine the initial model choice.
- Provider output remains advisory and requires deterministic validation.
- Production enablement requires secret provisioning, privacy approval, live semantic evaluation, and operational monitoring.

## Rejected alternatives

- A browser-to-Groq call would expose the key and bypass server controls.
- A generic prompt proxy would expand the attack surface.
- Model-authored IDs, ranking, or SQL/catalog writes would violate marketplace truth.
- A vector database or agent framework has no demonstrated Release 9 need.
