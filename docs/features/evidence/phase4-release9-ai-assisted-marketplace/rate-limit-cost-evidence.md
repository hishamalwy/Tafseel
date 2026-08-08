# Rate Limit and Cost Evidence

- Dedicated `ai` policy: 10 requests/minute per authenticated bearer partition; Testing uses 100/minute.
- The bearer is one-way SHA-256 partitioned; raw tokens are not retained.
- Normal marketplace traffic does not consume the AI partition.
- Inputs: discovery 2,000 chars, request 4,000, help 1,000; global provider input configurable and capped.
- Output tokens: configured `MaxOutputTokens=700`; timeout 15 seconds; help context is one small approved paragraph.
- No history, files, Teacher corpus, embeddings, tools, or model cascade.
- Provider usage tokens and latency are logged as aggregates.

Groq's documented `openai/gpt-oss-120b` price observed 2026-08-08 was $0.15/M input and $0.60/M output tokens; pricing can change and is not encoded as product truth. Real per-feature cost evidence is pending live calls.
