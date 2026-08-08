# Security Certification

- Student authorization and unauthenticated 401 verified.
- No generic model-proxy endpoint; only three typed semantic operations.
- Secret scan found no Groq key-shaped value.
- Key access exists only in Infrastructure via `GROQ_API_KEY`.
- Browser never calls Groq.
- Strict JSON, disallowed unknown members, field bounds, canonical resolution, no tools.
- Output uses escaped text bindings; no model `innerHTML` sink.
- Raw prompt/response and raw bearer values are not logged.
- Unsupported high-risk policy topics are refused before provider invocation.

Open: live-provider adversarial evaluation and formal Privacy/Business approval.
