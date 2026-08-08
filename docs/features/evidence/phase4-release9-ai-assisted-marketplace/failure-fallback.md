# Failure and Fallback

Disabled AI, missing credentials, 401, 403, 429, timeout, cancellation, 5xx, connection failure, and invalid model output map to bounded safe states. No raw provider error or secret reaches the browser.

Integration tests prove Browse remains healthy on provider failure. Browser certification triggered a real backend 429 classification through the contract double and displayed the ordinary-flow fallback. Guided Request remains usable because AI is optional and never owns submission.
