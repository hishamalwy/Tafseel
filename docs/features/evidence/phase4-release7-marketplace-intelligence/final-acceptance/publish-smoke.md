# Isolated publish smoke

`dotnet publish src/Tafseel.Api -c Release -o artifacts/phase4-release7-final-acceptance-publish`  
Hosted Development `http://127.0.0.1:5092`, then **stopped**. Not deployed.

Machine-readable: `publish-smoke-final.json` — **16/16**.

Health live/ready 200 `no-store, no-cache`. Landing/Browse/Admin/static 200 `no-cache`. Intelligence markup + analytics helper present. Anon Admin aggregate 401. Admin login 200; aggregate 200 without email/phone/password. Event ingest 202; spoof `payment_confirmed` 400. Unexpected 429/500: none.
