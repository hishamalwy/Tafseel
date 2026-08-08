# Browser Certification

Accepted isolated Development run: `tests/browser/release9-ai-assisted-marketplace-cert.mjs` against `http://127.0.0.1:5095`, a fresh SQL Server database, seeded Student/catalog, and a local OpenAI-compatible contract double.

Result: **15/15 PASS**.

Covered: authenticated Student AI entry; successful canonical discovery handoff; bounded clarification; supported help; deterministic unsupported-policy refusal; provider-429 fallback; AR/RTL; 375 px no horizontal overflow; request draft preview; no automatic submission; explicit Use action; zero unexpected Tafseel 429/500; zero actionable console errors; zero page errors; zero failed first-party resources. Screenshots and machine-readable results are under `browser/`.

This is not real-Groq UAT. Request-page teacher/profile prerequisites were browser-routed fixtures, while authentication and all AI endpoints were the real Tafseel backend. No actionable `console.error`, `pageerror`, or failed first-party resource was observed by the run; the permanent frontend gates additionally check template/resource integrity.
