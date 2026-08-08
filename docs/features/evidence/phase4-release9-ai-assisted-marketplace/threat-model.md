# Threat Model

| Threat | Control |
|---|---|
| Prompt injection | User input is labeled untrusted; no tools; strict output; application validation |
| Hidden Teacher disclosure | Model receives no Teacher rows/IDs; canonical public discovery enforces eligibility |
| Catalog hallucination | Names resolve only against active canonical rows; unknown/ambiguous values clarify |
| XSS | Model strings are rendered through text bindings and escaped frontend projections |
| Secret disclosure | Key is server environment-only; secret scan; no browser provider calls |
| Generic proxy abuse | Three narrow Student-authorized endpoints with typed inputs |
| Cost/DoS | Input/output/context bounds, timeout, cancellation, separate 10/min limiter |
| Policy hallucination | Topic allowlist plus approved context; refund/privacy/fee questions refuse before provider |
| Provider outage | Safe unavailable result; ordinary Browse/Guided Request remain active |
| Retry storm | One SDK operation with bounded SDK retry behavior; no nested retry/cascade |
