import { existsSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { allPages, readPage } from "./lib/frontend-pages.mjs";

for (const file of readdirSync("js").filter(x => x.endsWith(".js")))
  execFileSync(process.execPath, ["--check", join("js", file)], { stdio: "inherit" });

const support = readFileSync("support.js", "utf8");
if (!support.includes("!window.__resources && window.parent !== window"))
  throw new Error("Standalone pages must not fetch and parse their HTML twice");
const teacherDashboard = readPage("Tafseel-Teacher-Dashboard.dc.html");
const teacherBootstrapStart = teacherDashboard.indexOf("return Promise.allSettled([", teacherDashboard.indexOf("/teachers/onboarding-status"));
const teacherBootstrapEnd = teacherDashboard.indexOf("]);", teacherBootstrapStart);
const teacherBootstrap = teacherDashboard.slice(teacherBootstrapStart, teacherBootstrapEnd);
if ((teacherBootstrap.match(/Tafseel\.api\./g) || []).length > 10)
  throw new Error("Teacher dashboard bootstrap must keep section-only API calls deferred");
if (!teacherDashboard.includes("loadSectionData(section, sectionView = '')"))
  throw new Error("Teacher dashboard must load deferred data when its section opens");
if (teacherDashboard.includes("payoutLegalName:payoutProfile ? payoutProfile.legalName : (session.fullName"))
  throw new Error("Teacher bootstrap must not use the session callback variable outside its scope");
const studentDashboard = readPage("Tafseel-Student-Dashboard.dc.html");
const studentBootstrapStart = studentDashboard.indexOf("return Promise.allSettled([", studentDashboard.indexOf("requireRoles(['Student'])"));
const studentBootstrapEnd = studentDashboard.indexOf("]);", studentBootstrapStart);
const studentBootstrap = studentDashboard.slice(studentBootstrapStart, studentBootstrapEnd);
if ((studentBootstrap.match(/Tafseel\.api\./g) || []).length > 7)
  throw new Error("Student dashboard bootstrap must keep settings-only API calls deferred");
if (!studentDashboard.includes("loadSectionData(section)"))
  throw new Error("Student dashboard must load settings data only when settings opens");
if (!studentDashboard.includes("publishedRequestRows = openMarketplaceRows.filter(x => Number(x.rawStatus) === 5)")
  || !studentDashboard.includes('class="tf-published-requests"')
  || !studentDashboard.includes("onAction: () => this.openRequestDetail(r.id)"))
  throw new Error("Student dashboard must show published OpenForOffers requests as detail-linked cards");
const adminDashboard = readPage("Tafseel-Admin-Dashboard.dc.html");
if (adminDashboard.includes("Tafseel.api.allPages('/admin/users'"))
  throw new Error("Admin users must use server-side pagination instead of downloading every account");
if (!adminDashboard.includes("query.set('role', role)") || !adminDashboard.includes("onClick: () => this.reloadUsers(n)"))
  throw new Error("Admin user filters and page controls must query the server");
for (const endpoint of ["/admin/disputes", "/admin/withdrawals", "/admin/payout-profiles"]) {
  if (adminDashboard.includes(`Tafseel.api.allPages('${endpoint}`))
    throw new Error(`Admin queue ${endpoint} must use bounded server-side pagination`);
}
// PASS 05: operations lists are opened by the canonical router, which addresses them by tab key.
if (!adminDashboard.includes("this.loadOperationList(tab, 1)")
  || !/withdrawalsTotal:\s*Number\((?:result|withdrawals)\.totalCount\s*\|\|\s*0\)/.test(adminDashboard)
  || !/payoutProfilesTotal:\s*Number\((?:result|profiles)\.totalCount\s*\|\|\s*0\)/.test(adminDashboard))
  throw new Error("Admin dispute and finance queues must navigate with server totals and bounded pages");
const disputeCenter = readPage("Tafseel-Disputes.dc.html");
if (disputeCenter.includes("Tafseel.api.allPages(this.state.isAdmin?'/admin/disputes':'/disputes/mine'"))
  throw new Error("Dispute Center must not download every case");
if (!disputeCenter.includes("pageSize='+PAGE_SIZE") || !disputeCenter.includes("hasPagination:Number(s.total)>PAGE_SIZE"))
  throw new Error("Dispute Center must expose bounded server-side case pagination");
if (teacherDashboard.includes("Tafseel.api.allPages('/withdrawals/mine'"))
  throw new Error("Teacher withdrawal history must not download every withdrawal");
const vendorScripts = new Map([
  ["js/vendor/react.production.min.js", "DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z"],
  ["js/vendor/react-dom.production.min.js", "gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1"],
  ["js/vendor/babel.min.js", "m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y"]
]);
if (support.includes("unpkg.com")) throw new Error("support.js must not load runtime scripts from unpkg.com");
for (const [file, expectedHash] of vendorScripts) {
  if (!existsSync(file)) throw new Error(`Missing vendored runtime: ${file}`);
  if (!support.includes(`./${file}`)) throw new Error(`support.js does not reference ${file}`);
  if (createHash("sha384").update(readFileSync(file)).digest("base64") !== expectedHash)
    throw new Error(`Vendored runtime hash mismatch: ${file}`);
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}
execFileSync(process.execPath, ["--check", "support.js"], { stdio: "inherit" });

if (!existsSync("js/vendor/signalr.min.js"))
  throw new Error("Missing vendored SignalR client: js/vendor/signalr.min.js");
execFileSync(process.execPath, ["--check", "js/vendor/signalr.min.js"], { stdio: "inherit" });

// Includes pages that have migrated to Angular and moved to legacy-archive/:
// they are still published, so their embedded logic still has to parse.
for (const { name: file, path: pagePath } of allPages()) {
  const source = readFileSync(pagePath, "utf8");
  const match = source.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/);
  if (!match) continue;
  const temp = join(tmpdir(), `${file}.check.js`);
  writeFileSync(temp, match[1]);
  try { execFileSync(process.execPath, ["--check", temp], { stdio: "inherit" }); }
  finally { unlinkSync(temp); }
}

execFileSync(process.execPath, ["scripts/ci/check-auth-ui.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/ci/check-localization.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/ci/check-frontend-integrity.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/ci/check-guided-request.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/ci/check-sprint6-notification-routing.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/ci/check-release6-discovery.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/ci/check-release7-marketplace-intelligence.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/ci/check-release9-ai-assisted-marketplace.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/ci/check-unified-discovery-search.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/ci/check-template-placeholder-leak.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/ci/check-localization-usage.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/ci/check-auth-return.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/ci/check-open-marketplace.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/ci/check-frontend-security.mjs"], { stdio: "inherit" });
// PASS 05: the per-role IA gates now run with the rest of the frontend suite. They were written as
// standalone scripts and were never invoked here, so an IA regression could land unnoticed.
execFileSync(process.execPath, ["scripts/ci/check-admin-ux.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/ci/check-quality-ux.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/ci/check-teacher-ux.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/ci/check-dashboard-nav-unification.mjs"], { stdio: "inherit" });
