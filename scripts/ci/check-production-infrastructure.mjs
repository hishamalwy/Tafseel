/**
 * Production infrastructure structural smoke (Node).
 * Run: node scripts/ci/check-production-infrastructure.mjs
 */
import { existsSync, readFileSync } from "node:fs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const di = readFileSync("src/Tafseel.Infrastructure/DependencyInjection.cs", "utf8");
const local = "src/Tafseel.Infrastructure/Files/LocalFileStorageService.cs";
const azure = "src/Tafseel.Infrastructure/Files/AzureBlobFileStorageService.cs";
const health = "src/Tafseel.Infrastructure/Files/FileStorageHealthCheck.cs";
const mockPay = "src/Tafseel.Infrastructure/Finance/MockPaymentProvider.cs";
const mockLive = "src/Tafseel.Infrastructure/LiveSessions/MockLiveSessionLinkProvider.cs";
const program = readFileSync("src/Tafseel.Api/Program.cs", "utf8");
const prodSettings = readFileSync("src/Tafseel.Api/appsettings.Production.json", "utf8");
const baseSettings = readFileSync("src/Tafseel.Api/appsettings.json", "utf8");
const payments = readFileSync("src/Tafseel.Api/Controllers/PaymentsController.cs", "utf8");
const prodGate = readFileSync("scripts/ci/check-production-config.ps1", "utf8");

for (const path of [local, azure, health, mockPay, mockLive]) {
  assert(existsSync(path), `missing ${path}`);
}

assert(di.includes('options.Provider.Equals("AzureBlob"'), "DI must select AzureBlob vs Local by configuration");
assert(di.includes("MockPaymentProvider"), "DI must keep Mock payment provider");
assert(di.includes("MockLiveSessionLinkProvider"), "DI must keep Mock live-session provider");
assert(di.includes("Production requires FileStorage:Provider=AzureBlob"), "Production must fail-closed on Local storage");
assert(di.includes("No non-mock payment provider implementation is registered yet"), "Production payment remain fail-closed");
assert(di.includes("The mock live-session provider is forbidden in Production."), "Production live-session must refuse Mock");
assert(di.includes("Production JaaS requires per-participant signing"), "Production JaaS must refuse a shared static token");
assert(di.includes("Production requires MalwareScanning:Mode=ClamAv"), "Production must refuse the development scanner");

const guard = "src/Tafseel.Infrastructure/Operations/ProductionConfigurationGuard.cs";
assert(existsSync(guard), `missing ${guard}`);
assert(program.includes("ProductionConfigurationGuard.EnsureReady"), "Production must refuse placeholder, local and demo settings before serving");
assert(program.includes("OperationalBacklogHealthCheck"), "Ready health must include the operational backlog");
assert(payments.includes('EnableRateLimiting("webhook")'), "Provider webhooks must use their own rate-limit policy");

assert(program.includes("FileStorageHealthCheck"), "Ready health must include file storage");
assert(program.includes("AddApplicationInsightsTelemetry"), "Application Insights must be opt-in ready");
assert(program.includes("/health/live") && program.includes("/health/ready"), "liveness and readiness required");

assert(baseSettings.includes('"Provider": "Local"'), "Development default storage must stay Local");
assert(prodSettings.includes('"Provider": "AzureBlob"'), "Production settings must select AzureBlob");
assert(prodSettings.includes("REPLACE_WITH_REGISTERED_REAL_PROVIDER"), "Production payment/session placeholders must remain");

assert(payments.includes('HttpPost("payments/webhooks/{provider}")'), "Webhook route must be provider-named");
assert(payments.includes("paymentProvider.Name"), "Webhook must fail closed on provider mismatch");

assert(prodGate.includes("FileStorage__Provider"), "Deploy gate must require FileStorage provider");
assert(prodGate.includes('FileStorage__Provider -ne "AzureBlob"'), "Deploy gate must require private object storage");
assert(prodGate.includes("ASPNETCORE_FORWARDEDHEADERS_ENABLED") && prodGate.includes("MalwareScanning__ClamAv__Host"), "Deploy gate must require proxy headers and the scanner");

const deploy = readFileSync(".github/workflows/deploy-production.yml", "utf8");
// ODBC sqlcmd defaults QUOTED_IDENTIFIER OFF; the filtered unique indexes then fail to create.
assert(/sqlcmd -C -b -I /.test(deploy), "Production migration must run sqlcmd with -I (QUOTED_IDENTIFIER ON)");
assert(deploy.includes('"$DEPLOY_IMAGE" provision'), "Production deploy must run provisioning after the migration");

assert(existsSync("docs/operations/RUNBOOK.md"), "missing RUNBOOK");
assert(existsSync("docs/operations/BACKUP_AND_RESTORE.md"), "missing BACKUP_AND_RESTORE");
assert(existsSync("docs/ENVIRONMENTS.md"), "missing ENVIRONMENTS");
// Demo data never reaches Production, and no environment mails the seeded demo addresses.
const seed = readFileSync("src/Tafseel.Infrastructure/Seeding/EnvironmentSeed.cs", "utf8");
assert(seed.includes("AllowsDemoData()"), "The canonical seed must refuse Production");
assert(di.includes("Production sends every email through Resend and suppresses no recipient."), "Production must not use outbox mail or suppression");
assert(!di.includes("@Admin123"), "No built-in demo password");
for (const doc of [
  "docs/releases/PRODUCTION_LAUNCH_READINESS.md",
  "docs/releases/GO_LIVE_CHECKLIST.md",
  "docs/operations/PRODUCTION_SECRETS_CHECKLIST.md",
  "docs/operations/DATABASE_RUNBOOK.md",
  "docs/operations/DAY1_RUNBOOK.md",
]) {
  assert(existsSync(doc), `missing ${doc}`);
}

console.log("Production infrastructure structural checks passed.");
