# Architecture Decision Evidence

ADR-014 selects a server-side `IAiProvider` abstraction, Groq/OpenAI-compatible Infrastructure adapter, and application-owned validation/resolution. The dependency direction is API → Application contract ← Infrastructure implementation. Model responses are candidates, never domain facts.

No migration was needed because no prompt, response, conversation, embedding, or AI draft is persisted server-side. Browser draft behavior remains the existing Guided Request state.
