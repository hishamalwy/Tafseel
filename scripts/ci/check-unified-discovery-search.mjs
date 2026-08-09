import { readFileSync } from "node:fs";

const root = process.cwd();
const read = file => readFileSync(new URL(file, `file://${root.replaceAll("\\", "/")}/`), "utf8");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const browse = readFileSync("Tafseel-Browse-Teachers.dc.html", "utf8");
const landing = readFileSync("Tafseel-Landing.dc.html", "utf8");
const shared = readFileSync("js/tafseel.js", "utf8");
const assistant = readFileSync("src/Tafseel.Infrastructure/Ai/AiMarketplaceAssistant.cs", "utf8");
const search = readFileSync("src/Tafseel.Application/Marketplace/MarketplaceContracts.cs", "utf8");
const marketplace = readFileSync("src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs", "utf8");
const live = readFileSync("src/Tafseel.Infrastructure/LiveSessions/LiveSessionService.cs", "utf8");
const provider = readFileSync("src/Tafseel.Infrastructure/Ai/GroqAiProvider.cs", "utf8");

assert(browse.includes('role="search"') && landing.includes('role="search"'),
  "Landing and Browse must expose role=search.");
assert(landing.includes("Tafseel.discovery.handoffToBrowse") && shared.includes("INTENT_KEY"),
  "Landing must hand off through namespaced sessionStorage, not a second Groq path.");
assert(!landing.includes("?search=' + encodeURIComponent"),
  "Landing must not put raw natural-language search text in the Browse URL.");
assert(shared.includes("sessionStorage.removeItem(this.INTENT_KEY)") && shared.includes("INTENT_TTL_MS"),
  "Discovery intent must be consume-once with a short TTL against stale replay.");
assert(browse.includes("runUnifiedSearch") && browse.includes("/ai/discovery") && browse.includes("availableOn"),
  "Browse orchestration must interpret then apply canonical filters including availability date.");
assert(!browse.includes('id="ai-discovery-title"') && !browse.includes("Understand & apply") && !browse.includes("tf-ai-panel"),
  "Standalone AI discovery panel and Understand-and-apply workflow must be gone.");
assert(assistant.includes("DiscoveryCatalogResolver") && assistant.includes("DiscoveryCalendar.ResolveUpcoming"),
  "Application must resolve subject/service/day canonically after model interpretation.");
assert(search.includes("AvailableOn") && live.includes("FindTeachersWithExactServiceAvailabilityAsync"),
  "Exact-service availability must be a first-class teacher search capability.");
assert(marketplace.includes("FindTeachersWithExactServiceAvailabilityAsync")
  && !marketplace.includes("AvailableThisWeek = true"),
  "Date filtering must reuse the scheduler, not weekly presence.");
assert(provider.includes("StatusCategory") && provider.includes("AiProviderStatusCategories.For")
  && !browse.includes("api.groq.com") && !landing.includes("api.groq.com"),
  "Provider logs must classify failures safely and the browser must never call Groq.");
assert(browse.includes("queryPresent") && !browse.includes("best AI") && !browse.includes("AI recommended"),
  "R7 privacy telemetry and no AI ranking claims must remain.");
assert(browse.includes('aria-label="{{ chip.removeLabel }}"') && browse.includes("discovery_remove_filter"),
  "Interpreted filters must be ordinary accessible removable chips.");
assert(browse.includes('role="status"') && browse.includes("aria-live"),
  "Search status must be announced accessibly.");

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log("Unified intelligent discovery search integrity: PASS");
