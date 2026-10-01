# Testing in CI

Commands:

```bash
dotnet restore Tafseel.sln --locked-mode
dotnet build Tafseel.sln -c Release --no-restore
dotnet test tests/Tafseel.Domain.Tests -c Release --no-build
dotnet test tests/Tafseel.Application.Tests -c Release --no-build
dotnet test tests/Tafseel.ArchitectureTests -c Release --no-build
dotnet test tests/Tafseel.IntegrationTests -c Release --no-build --filter "Category!=SqlServer"
dotnet test tests/Tafseel.IntegrationTests -c Release --no-build --filter "Category=SqlServer"
```

Domain, Application, and Architecture are stable project-level categories. The mixed Integration project uses `SqlServer`, `Security`, `Concurrency`, and `Financial` traits where focused execution matters. The final release gate runs all tests.

SQL tests read `TAFSEEL_SQLSERVER_TEST_CONNECTION`; if absent they fall back to Windows LocalDB. CI supplies a real SQL Server 2022 container and each fixture creates and deletes an isolated database.

CI produces TRX and Cobertura artifacts. The first implementation reports coverage without imposing a vanity threshold; establish thresholds only after GitHub has retained a representative baseline. Critical financial, authorization, state-transition, and concurrency tests must never be excluded by a global percentage target.

Frontend checks include syntax for standalone and embedded scripts, API integration tests for auth/refresh/role routing/protected routes, container route allowlisting, unknown-path denial, and static token-storage checks. A Playwright visual suite was not added because the current design-document runtime would make it fragile; add a small browser suite after replacing that runtime.
