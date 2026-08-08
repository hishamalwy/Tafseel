// Targeted Test-Issue probe: request_started after draft clear + zero_result via #f-q.
// Does not re-run the paid lifecycle. Failed prior JSON kept as lifecycle-attempt2.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { BASE_URL, CREDENTIALS } from "./lib/auth.mjs";
import { loginOnceAndSave, newAuthedContext, persistContextState, paceAuthSensitive } from "./lib/session.mjs";
import { createRequestBudget } from "./lib/request-budget.mjs";

const outDir = process.argv[2]
  || path.join("docs", "features", "evidence", "phase4-release7-marketplace-intelligence", "final-acceptance");
const wait = ms => new Promise(r => setTimeout(r, ms));
const fromIso = new Date(Date.now() - 2000).toISOString();
const budget = createRequestBudget({ baseUrl: BASE_URL, globalSafety: 80, authSafety: 2 });
const findings = [];
const record = (name, pass, detail = "") => {
  findings.push({ name, pass: !!pass, detail: String(detail || "").slice(0, 800) });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " :: " + String(detail).slice(0, 240) : ""}`);
};

async function loginApi(email, password) {
  await budget.waitForHeadroom({ global: 2, auth: 1 }, "login");
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`login ${res.status}`);
  return data.accessToken;
}

async function report(token) {
  await budget.waitForHeadroom({ global: 2, auth: 0 }, "admin report");
  const qs = `from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(new Date(Date.now() + 60000).toISOString())}`;
  const res = await fetch(`${BASE_URL}/api/v1/admin/marketplace-intelligence?${qs}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  return res.json();
}

function count(rep, code) {
  return (rep.funnel || []).find(x => x.code === code)?.count ?? 0;
}

async function main() {
  const adminToken = await loginApi(CREDENTIALS.Admin.email, CREDENTIALS.Admin.password);
  const fixture = JSON.parse(fs.readFileSync(
    path.join("docs", "features", "evidence", "phase4-release6-discovery-conversion", "final-acceptance", "live-fixture.json"), "utf8"));
  const lifecyclePath = ["lifecycle-accepted.json", "lifecycle-attempt-fail.json", "lifecycle-attempt2-fail.json"]
    .map(name => path.join(outDir, name)).find(p => fs.existsSync(p));
  const lifecycle = JSON.parse(fs.readFileSync(lifecyclePath, "utf8"));
  const teacherId = lifecycle.teacherId || fixture.teacherId;
  const teacherServiceId = lifecycle.teacherServiceId || fixture.teacherServiceId;

  const browser = await chromium.launch();
  try {
    if (!fs.existsSync(path.join("tests", "browser", ".auth", "Student.storage-state.json")))
      await loginOnceAndSave(browser, "Student");
    const ctx = await newAuthedContext(browser, "Student", { viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    budget.attachPage(page, "Student");
    const events = [];
    page.on("request", req => {
      if (req.url().includes("/marketplace-intelligence/events") && req.method() === "POST") {
        try { events.push(JSON.parse(req.postData() || "{}")); } catch { /* ignore */ }
      }
    });
    await budget.waitForHeadroom({ global: 20, auth: 0 }, "dash for draft clear");
    await paceAuthSensitive();
    await page.goto(`${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html`, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(() => window.Tafseel && window.Tafseel.api, null, { timeout: 25000 });
    await page.evaluate(teacherId => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.includes(String(teacherId))) keys.push(k);
      }
      keys.forEach(k => localStorage.removeItem(k));
      Object.keys(sessionStorage).filter(k => k.includes("request_started")).forEach(k => sessionStorage.removeItem(k));
    }, teacherId);

    const before = await report(adminToken);
    await budget.waitForHeadroom({ global: 30, auth: 0 }, "fresh request");
    await page.goto(`${BASE_URL}/app/Tafseel-Request.dc.html?teacherId=${encodeURIComponent(teacherId)}&teacherServiceId=${encodeURIComponent(teacherServiceId)}`, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(() => window.Tafseel && window.Tafseel.api, null, { timeout: 25000 });
    await wait(1800);
    const afterStart = await report(adminToken);
    const startedEvents = events.filter(e => e.eventName === "request_started");
    record("request-started-fresh", startedEvents.length === 1 || count(afterStart, "request_started") >= count(before, "request_started") + 1,
      `events=${startedEvents.length} funnel ${count(before, "request_started")}→${count(afterStart, "request_started")}`);

    await page.reload({ waitUntil: "load" });
    await wait(1500);
    const afterDraft = await report(adminToken);
    const startedAfterReload = events.filter(e => e.eventName === "request_started").length;
    record("request-draft-no-double", startedAfterReload <= 1 && count(afterDraft, "request_started") === count(afterStart, "request_started"),
      `events=${startedAfterReload} funnel ${count(afterStart, "request_started")}→${count(afterDraft, "request_started")}`);

    const zeroQ = `zzzr7probe${Date.now()}`;
    await budget.waitForHeadroom({ global: 35, auth: 0 }, "zero browse");
    await page.goto(`${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(() => window.Tafseel && window.Tafseel.api, null, { timeout: 25000 });
    await wait(700);
    await page.fill("#f-q", zeroQ);
    await page.locator("#f-q").press("Enter");
    await wait(1800);
    await page.fill("#f-q", "");
    await page.locator("#f-q").press("Enter");
    await wait(1400);
    await page.fill("#f-q", zeroQ);
    await page.locator("#f-q").press("Enter");
    await wait(1800);
    const zeros = events.filter(e => e.eventName === "zero_result_viewed");
    record("zero-result-persisted", zeros.length >= 1, `count=${zeros.length}`);
    record("zero-result-no-raw-query", zeros.every(e => !JSON.stringify(e).includes(zeroQ) && e.queryPresent === true),
      JSON.stringify(zeros[0] || {}));
    record("zero-result-recovery-dedupe", zeros.length === 1, `zero events=${zeros.length}`);

    await persistContextState(ctx, "Student");
    await page.close();
    await ctx.close();
  } finally {
    await browser.close();
  }

  const failed = findings.filter(x => !x.pass);
  fs.writeFileSync(path.join(outDir, failed.length ? "probe-attempt-fail.json" : "probe-accepted.json"),
    JSON.stringify({ findings }, null, 2));
  console.log(`SUMMARY ${findings.length - failed.length}/${findings.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
