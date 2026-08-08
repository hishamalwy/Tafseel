# Provider Contract Tests

Eight tests exercise the official SDK against a local OpenAI-compatible HTTP endpoint:

- custom endpoint, configured model, strict JSON schema, absence of tools, response/usage parsing;
- 401, 403, 429, and 500 classification;
- caller cancellation and configured timeout;
- invalid structured response.

Combined focused R9/provider run: 17/17 passed. Full integration project: 248/248 passed.
