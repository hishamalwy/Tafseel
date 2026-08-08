# Auth session strategy

Access tokens stay **in memory**. Refresh tokens are **HttpOnly** `__Host-tafseel-refresh` cookies (`Secure`, `SameSite=Strict`). Playwright `storageState` captures the refresh cookie + `localStorage` theme/lang. It does not forge JWTs.

## Harness

1. Legitimate Auth-page login **once per role** (`loginOnceAndSave`).
2. Persist `tests/browser/.auth/{Role}.storage-state.json` (gitignored; not publish output).
3. Later contexts reuse `storageState`. `addInitScript` sets `tafseel-theme` / `tafseel-lang` without extra login.
4. Refresh tokens **rotate**. Only **one live context per role**. After each context closes (and after navigations that refresh), state is re-saved so the next context sees the current cookie.
5. Passwords come only from env (`TAFSEEL_UAT_*`). Never written to evidence JSON, screenshots, or docs.
6. Canonical refresh on each full navigation is allowed. No manual JWT minting. Role checks still apply.

## Safety

`.gitignore` includes `tests/browser/.auth/`. Debug dumps strip `accessToken` / `me` payloads.
