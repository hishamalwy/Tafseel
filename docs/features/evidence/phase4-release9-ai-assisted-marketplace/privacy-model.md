# Privacy Model

Provider-bound data is limited to the current normalized Student text, a fixed system instruction, and—only for Product Help—the one relevant approved help paragraph. No uploaded file, Teacher dataset, account profile, email, phone, token, private review, Admin/Quality data, or prior conversation is included.

Raw input/output is not persisted or logged. Operational logs contain feature, provider/model, prompt version, status, latency, and aggregate token counts only. The browser never receives the provider key or system prompt.

Open dependency: Business/Privacy must approve sending voluntarily entered Student text to Groq and define retention/DPA/region/user-notice requirements before Production enablement.
