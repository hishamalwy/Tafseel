# Phase 4 Release 9 — AI-Assisted Marketplace

Date: 2026-08-08  
Verdict: **RELEASE 9 — AI-ASSISTED MARKETPLACE CONDITIONALLY VERIFIED**

Release 9 adds an optional Student-only AI interpretation layer without replacing Tafseel's deterministic marketplace. Natural-language discovery produces a validated canonical filter proposal; the existing Release 6 teacher endpoint performs the search and preserves eligibility, price, availability, ordering, pagination, and zero-result behavior. Guided Request gains an explicit draft/review/use/discard assistant. Product Help answers only from small approved in-process content and refuses unsupported policy questions.

The provider boundary is `IAiProvider`; Infrastructure uses Groq's OpenAI-compatible Chat Completions endpoint via OpenAI .NET 2.12.0, strict JSON Schema, non-streaming calls, cancellation, a configured timeout, and safe failure mapping. The server alone reads `GROQ_API_KEY`. AI defaults off.

Verification is green for 343/343 backend tests, all named frontend gates, 17/17 R9/provider focused tests, clean EF model state, Release build/publish, isolated publish smoke, and 15/15 browser contract-double checks. The accepted browser run recorded zero unexpected Tafseel 429/500, console errors, page errors, and failed first-party resources.

The conditional verdict is mandatory: no `GROQ_API_KEY` was available, so real Groq smoke and semantic scoring were not run; Privacy/Business approval for provider-bound Student text remains open; Release 7 is only conditionally verified; and no canonical Release 8 completion record exists in the reconciled worktree. Release 6 and Release 5 remain verified and closed. No commit, push, or deployment was performed.

Evidence: [final summary](./evidence/phase4-release9-ai-assisted-marketplace/final-summary.md), [browser certification](./evidence/phase4-release9-ai-assisted-marketplace/browser-certification.md), [ADR-014](../decisions/ADR-014-AI-PROVIDER-AND-BOUNDARIES.md), and [retrospective](../reports/PHASE_4_RELEASE_9_AI_ASSISTED_MARKETPLACE_RETROSPECTIVE.md).
