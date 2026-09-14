# RunASP staging deployment

`deploy/iis-runasp/appsettings.Staging.Host.json` is the source of truth for this RunASP instance.
Upload that exact file to the deployed `wwwroot` as `appsettings.Staging.Host.json`. Do not recreate
it from the example and do not duplicate its settings in `web.config`.

The host file is intentionally excluded from source control and normal publish output. A new publish
therefore cannot leak or silently replace the RunASP credentials. Upload the publish output without
deleting the existing Host file, or upload the current file again immediately after publishing.

This RunASP Staging endpoint currently serves HTTP only. The Staging Host URLs therefore remain
`http://tafseel.runasp.net`; forced HTTPS, HSTS, and CSP request upgrades stay reserved for Production.
`Security:EnforceHttps` must stay `false` until the host answers successfully on port 443. Once TLS is
enabled, change every public URL and CORS origin in the Host file to `https://`, set the flag to `true`,
and recycle the application. Refresh cookies automatically become `Secure` `__Host-` cookies on HTTPS.

The site is the Angular client at the root (`/ar/`, `/en/`); the old `/app/*.dc.html` pages are gone
and their addresses redirect. Email links must therefore name the root, never `/app`. In the Host file:

- `Email:ConfirmationUrl` and `Email:PasswordResetUrl` → `http://tafseel.runasp.net/auth`
- `Email:AppBaseUrl` (if present) → `http://tafseel.runasp.net`
- `Payments:Mock:DefaultReturnPath` (if present) → `/student/overview`

A Host file still carrying the old values keeps working through the redirect table, but every email
link then costs an extra redirect. Change the scheme to `https://` together with the TLS step below.

Give the IIS application identity Modify permission on `App_Data`. Normal application logs are written
to rolling files under `App_Data/logs` with a 14-file retention limit. ANCM stdout logging is disabled;
enable it only while diagnosing a startup failure and disable it again immediately afterwards.

Before publishing, create a recoverable copy of private files and Data Protection keys (outside
`wwwroot`):

```powershell
.\scripts\ops\New-TafseelRecoverySnapshot.ps1
```

Database backup evidence is still required separately because the hosting database is outside the site
filesystem. Deploy a validated publish directory with automatic application rollback:

```powershell
.\scripts\ops\Deploy-TafseelRunAsp.ps1 -PublishDirectory C:\deploy\tafseel-publish
```

The deploy script preserves `App_Data` and `appsettings.Staging.Host.json`, uses `app_offline.htm`, checks
`/health/ready`, and restores the previous application snapshot if readiness fails.

Database migrations are an explicit deployment step in Staging. Run this from a trusted checkout
using the same Host configuration before recycling the application pool:

```powershell
dotnet ef database update --project src/Tafseel.Infrastructure --startup-project src/Tafseel.Api
```
