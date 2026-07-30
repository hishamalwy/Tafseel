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
assert(di.includes("No non-mock live-session provider implementation is registered yet"), "Production live-session remain fail-closed");

assert(program.includes("FileStorageHealthCheck"), "Ready health must include file storage");
assert(program.includes("AddApplicationInsightsTelemetry"), "Application Insights must be opt-in ready");
assert(program.includes("/health/live") && program.includes("/health/ready"), "liveness and readiness required");

assert(baseSettings.includes('"Provider": "Local"'), "Development default storage must stay Local");
assert(prodSettings.includes('"Provider": "AzureBlob"'), "Production settings must select AzureBlob");
assert(prodSettings.includes("REPLACE_WITH_REGISTERED_REAL_PROVIDER"), "Production payment/session placeholders must remain");

assert(payments.includes('HttpPost("payments/webhooks/{provider}")'), "Webhook route must be provider-named");
assert(payments.includes("paymentProvider.Name"), "Webhook must fail closed on provider mismatch");

assert(prodGate.includes("FileStorage__Provider"), "Deploy gate must require FileStorage provider");
assert(prodGate.includes('FileStorage__Provider -eq "Local"'), "Deploy gate must forbid Local storage");

assert(existsSync("docs/operations/PRODUCTION_CHECKLIST.md"), "missing PRODUCTION_CHECKLIST");
assert(existsSync("docs/operations/RUNBOOK.md"), "missing RUNBOOK");
assert(existsSync("docs/operations/BACKUP_AND_RESTORE.md"), "missing BACKUP_AND_RESTORE");
assert(existsSync("docs/operations/ENVIRONMENT_CONFIGURATION.md"), "missing ENVIRONMENT_CONFIGURATION");
assert(existsSync("docs/reports/PRODUCTION_OPERATIONAL_READINESS_REPORT.md"), "missing readiness report");

console.log("Production infrastructure structural checks passed.");
