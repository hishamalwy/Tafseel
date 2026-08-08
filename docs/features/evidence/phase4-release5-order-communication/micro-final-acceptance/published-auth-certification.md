# Published authentication certification

Isolated `dotnet publish src/Tafseel.Api -c Release -o artifacts/phase4-release5-micro-final-publish` (not deployed). Hosted Development `http://127.0.0.1:5092`, then stopped.

After Identity recovery of sprint-02 Student + Teacher (no secrets in this file):

| Check | Result |
|---|---|
| `POST /api/v1/auth/login` Student | **200** |
| `POST /api/v1/auth/login` Teacher | **200** |
| `GET /api/v1/conversations` Student | **200** |
| `GET /api/v1/conversations` Teacher | **200** |
| Student Dashboard HTML | **200** `no-cache` |
| Teacher Dashboard HTML | **200** `no-cache` |
| Student thread `GET .../messages` | **200** |
| Teacher thread same conversation | **200** |
| Second Student login → authenticated conversations | **200** (auth retention smoke) |

No unexpected 401/429/logout loop on this smoke (not a load test). HTML 200 without a Bearer token was not treated as proof.

Published two-context SignalR browser smoke was **not** run against `:5092`: Playwright storageState and hub routing are bound to the Dev `:5090` cert host. Mandatory Student + Teacher authenticated publish API smoke still passed.

Instance stopped. No deploy.
