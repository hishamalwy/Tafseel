# RunASP PreProduction (tafseel.runasp.net)

The hosted PreProduction environment ([docs/ENVIRONMENTS.md](../docs/ENVIRONMENTS.md)). IIS in-process on a shared
MonsterASP plan: one site (`site84355`), one SQL Server database (`db63194`), HTTPS terminated by IIS.

## Server-owned settings

`appsettings.PreProduction.Host.json` lives next to `Tafseel.Api.dll` on the server and holds every secret
(template: [appsettings.PreProduction.Host.example.json](appsettings.PreProduction.Host.example.json)). The local copy is
`deploy/iis-runasp/appsettings.PreProduction.Host.json` (git-ignored); the publish profile uploads it. It is never
committed, pasted into chat or printed.

## Deploy

```powershell
dotnet publish src/Tafseel.Api -c Release -p:PublishProfile=tafseel-preproduction
```

The profile (`src/Tafseel.Api/Properties/PublishProfiles/tafseel-preproduction.pubxml`, git-ignored) publishes over
Web Deploy with `EnvironmentName=PreProduction`, takes the site offline during the copy and keeps `App_Data`
(uploaded files, Data Protection keys, logs).

Startup never migrates. After a deploy that adds migrations, or to start PreProduction over, run from a trusted machine
with the server's settings (same connection string):

```powershell
$env:ASPNETCORE_ENVIRONMENT = "PreProduction"
dotnet src/Tafseel.Api/bin/Release/net8.0/Tafseel.Api.dll reset-database --confirm db63194   # empty, migrate, seed
dotnet src/Tafseel.Api/bin/Release/net8.0/Tafseel.Api.dll seed                               # seed only (idempotent)
```

For a plain schema upgrade that keeps data, apply the release's idempotent script with `sqlcmd -I` against `db63194`
([DATABASE_RUNBOOK](../docs/operations/DATABASE_RUNBOOK.md#3-deployment-migration-procedure)).

## Check

- `https://tafseel.runasp.net/health/ready` → `Healthy` (or `Degraded` with an operational backlog).
- Every page shows the "Test environment" strip: payments are simulated here.
- Sign in as each demo account with the PreProduction seed password.

## Limits of this host

Local file storage (no object storage), the development malware scanner (no ClamAV), one database (Staging runs
locally). These are PreProduction-only compromises; Production refuses all three.
