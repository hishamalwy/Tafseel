# Provider Capability Verification

Verified 2026-08-08 against official Groq documentation:

- Groq exposes an OpenAI-compatible base URL at `https://api.groq.com/openai/v1`.
- Chat Completions accepts JSON Schema structured output.
- Strict structured output is supported for `openai/gpt-oss-20b` and `openai/gpt-oss-120b`; strict schemas require all properties and `additionalProperties: false`.
- Structured output is not combined with streaming or tool use in this release.
- The selected `openai/gpt-oss-120b` supports multilingual input and JSON Schema.

Sources: https://console.groq.com/docs/openai, https://console.groq.com/docs/structured-outputs, https://console.groq.com/docs/model/openai/gpt-oss-120b.

This is capability verification, not a live credentialed smoke. See `real-provider-smoke.md`.
