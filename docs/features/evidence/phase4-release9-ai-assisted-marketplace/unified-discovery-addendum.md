# Release 9 addendum — Unified Intelligent Discovery Search

Date: 2026-08-09

This addendum does not rewrite Release 9 evidence and does not change the R9 verdict.

Browse no longer exposes a standalone AI Discovery panel. Landing hero and Browse Teachers share one search field. Interpretation still uses `POST /api/v1/ai/discovery` → the same `IAiProvider` / Groq structured-output path. There is no second Groq implementation. Deterministic `GET /api/v1/teachers` remains the only Teacher selector.

**Release 9 status: still CONDITIONALLY VERIFIED** until real-provider Groq smoke and semantic scoring complete.

See [UNIFIED_INTELLIGENT_DISCOVERY_SEARCH.md](../../../fixes/UNIFIED_INTELLIGENT_DISCOVERY_SEARCH.md).
