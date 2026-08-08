import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5092";
const password = process.env.TAFSEEL_UAT_ADMIN_PASSWORD || process.env.TAFSEEL_UAT_STUDENT_PASSWORD;
const outDir = process.argv[2]
  || path.join("docs", "features", "evidence", "phase4-release7-marketplace-intelligence", "final-acceptance");
fs.mkdirSync(outDir, { recursive: true });
const checks = [];
const unexpected = { status429: [], status500: [] };
const record = (name, pass, detail = "") => {
  checks.push({ name, pass: !!pass, detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " :: " + detail : ""}`);
};

async function get(url, token) {
  const res = await fetch(`${BASE}${url}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (res.status === 429) unexpected.status429.push(url);
  if (res.status >= 500) unexpected.status500.push(url);
  return { status: res.status, cache: res.headers.get("cache-control") || "", text: await res.text() };
}

async function main() {
  if (!password) throw new Error("UAT password env required");
  const live = await get("/health/live");
  const ready = await get("/health/ready");
  record("health-live", live.status === 200, live.cache);
  record("health-ready", ready.status === 200, ready.cache);
  for (const [url, name] of [
    ["/app/Tafseel-Landing.dc.html", "public-landing"],
    ["/app/Tafseel-Browse-Teachers.dc.html", "public-browse"],
    ["/app/Tafseel-Admin-Dashboard.dc.html", "admin-page"],
    ["/app/css/tafseel.css", "static-css"],
    ["/app/js/tafseel.js", "static-js"]
  ]) {
    const r = await get(url);
    record(name, r.status === 200, `${r.status} ${r.cache}`);
  }
  record("frontend-has-intelligence", (await get("/app/Tafseel-Admin-Dashboard.dc.html")).text.includes("Marketplace Intelligence"), "markup");
  record("frontend-has-analytics-helper", (await get("/app/js/tafseel.js")).text.includes("/marketplace-intelligence/events"), "helper");
  const anonIntel = await get("/api/v1/admin/marketplace-intelligence");
  record("anon-admin-intel-denied", anonIntel.status === 401 || anonIntel.status === 403, String(anonIntel.status));
  const login = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "qa.admin.sprint02@example.com", password })
  });
  const loginJson = await login.json().catch(() => ({}));
  record("admin-login", login.status === 200, String(login.status));
  const token = loginJson.accessToken;
  const intel = await get("/api/v1/admin/marketplace-intelligence", token);
  record("admin-intel-200", intel.status === 200 && !/email|phone|password/i.test(intel.text), String(intel.status));
  const ev = await fetch(`${BASE}/api/v1/marketplace-intelligence/events`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventName: "browse_viewed", sourceSurface: "Browse", clientEventId: crypto.randomUUID(),
      anonymousSessionId: crypto.randomUUID(), resultCount: 1
    })
  });
  record("event-ingest-accepted", ev.status === 202, String(ev.status));
  const spoof = await fetch(`${BASE}/api/v1/marketplace-intelligence/events`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventName: "payment_confirmed", sourceSurface: "Browse", clientEventId: crypto.randomUUID(),
      anonymousSessionId: crypto.randomUUID()
    })
  });
  record("spoof-rejected", spoof.status === 400, String(spoof.status));
  record("no-unexpected-429", unexpected.status429.length === 0, JSON.stringify(unexpected.status429));
  record("no-unexpected-500", unexpected.status500.length === 0, JSON.stringify(unexpected.status500));
  const failed = checks.filter(x => !x.pass);
  fs.writeFileSync(path.join(outDir, "publish-smoke-final.json"), JSON.stringify({ base: BASE, checks }, null, 2));
  console.log(`SUMMARY ${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
