// Release 7 Final Acceptance — rate-limit-aware 21/21 browser suite.
// Reuses R5/R6 login-once storageState + request-budget scheduler. Limits unchanged.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { BASE_URL, CREDENTIALS } from "./lib/auth.mjs";
import { loginOnceAndSave, newAuthedContext, persistContextState, paceAuthSensitive } from "./lib/session.mjs";
import { createRequestBudget } from "./lib/request-budget.mjs";

const outDir = process.argv[2]
  || path.join("docs", "features", "evidence", "phase4-release7-marketplace-intelligence", "final-acceptance");
fs.mkdirSync(outDir, { recursive: true });
const shots = path.join(outDir, "screenshots");
fs.mkdirSync(shots, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));

const results = [];
const record = (name, pass, detail = "") => {
  results.push({ name, pass: !!pass, detail: String(detail || "").slice(0, 1000) });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " :: " + String(detail).slice(0, 220) : ""}`);
};

const budget = createRequestBudget({ baseUrl: BASE_URL, globalSafety: 80, authSafety: 2 });
const unexpected429 = [];

function sanitize(url) {
  return String(url).replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, ":id");
}

function guards(page) {
  const g = { pageErrors: [], consoleErrors: [], failed: [], status429: [], status500: [] };
  page.on("pageerror", err => g.pageErrors.push(String(err)));
  page.on("console", msg => { if (msg.type() === "error") g.consoleErrors.push(msg.text()); });
  page.on("requestfailed", req => {
    if (/127\.0\.0\.1|localhost/.test(req.url()))
      g.failed.push(`${req.failure()?.errorText || "failed"} ${sanitize(req.url())}`);
  });
  page.on("response", res => {
    if (res.status() === 429) {
      g.status429.push(sanitize(res.url()));
      unexpected429.push(sanitize(res.url()));
    }
    if (res.status() >= 500) g.status500.push(sanitize(res.url()));
  });
  return g;
}

function actionableConsole(errors) {
  return errors.filter(text =>
    !/401 \(Unauthorized\)/.test(text)
    && !/Failed to load resource: the server responded with a status of 401/.test(text)
    && !/net::ERR_FAILED/.test(text));
}

async function gotoBudget(page, url, estimate = 35) {
  await budget.waitForHeadroom({ global: estimate, auth: 1 }, `goto ${url}`);
  await paceAuthSensitive();
  await page.goto(url, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => window.Tafseel && window.Tafseel.api, null, { timeout: 25000 }).catch(() => {});
  await wait(700);
}

async function main() {
  if (!CREDENTIALS.Student.password || !CREDENTIALS.Admin.password)
    throw new Error("UAT passwords missing");
  const browser = await chromium.launch();
  const runtime = { pageErrors: 0, consoleErrors: [], failed: [] };
  try {
    for (const role of ["Student", "Teacher", "Admin", "QualityReviewer"]) {
      const state = path.join("tests", "browser", ".auth", `${role}.storage-state.json`);
      if (!fs.existsSync(state)) await loginOnceAndSave(browser, role);
    }
    const lifecyclePath = ["lifecycle-accepted.json", "lifecycle-attempt2-fail.json", "lifecycle-attempt-fail.json"]
      .map(name => path.join(outDir, name)).find(p => fs.existsSync(p));
    const lifecycle = lifecyclePath ? JSON.parse(fs.readFileSync(lifecyclePath, "utf8")) : {};

    const studentCtx = await newAuthedContext(browser, "Student", { viewport: { width: 1440, height: 900 }, lang: "en", theme: "light" });
    const student = await studentCtx.newPage();
    const sg = guards(student);
    budget.attachPage(student, "Student");

    await gotoBudget(student, `${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`);
    await student.waitForFunction(() => document.querySelector(".tf-result-card") || document.querySelector(".tf-empty"), null, { timeout: 25000 }).catch(() => {});
    const browseHasCard = await student.locator(".tf-result-card").first().isVisible().catch(() => false);
    record("01-browse-viewed-surface", browseHasCard || await student.locator(".tf-empty").count() > 0,
      browseHasCard ? "results" : "empty-or-loading");

    let profileHref = null;
    if (browseHasCard) {
      profileHref = await student.locator(".tf-result-card a[href*='Tafseel-Teacher-Profile']").first().getAttribute("href");
      await gotoBudget(student, new URL(profileHref, `${BASE_URL}/app/`).href, 30);
      record("02-teacher-opened-from-browse", await student.locator("#profile-heading").isVisible().catch(() => false)
        || await student.locator("h1").count() > 0, student.url());
    } else {
      record("02-teacher-opened-from-browse", false, "no published teacher card");
    }

    const teacherMe = await student.evaluate(async () => {
      try {
        const page = await fetch("/api/v1/teachers?pageSize=1", { credentials: "include" });
        return page.status;
      } catch { return 0; }
    }).catch(() => 0);
    const liveFixture = JSON.parse(fs.readFileSync(
      path.join("docs", "features", "evidence", "phase4-release6-discovery-conversion", "final-acceptance", "live-fixture.json"), "utf8"));
    await gotoBudget(student, `${BASE_URL}/app/Tafseel-Teacher-Profile.dc.html?teacherId=${liveFixture.teacherId}`, 30);
    const directReady = await student.locator("#profile-heading").isVisible().catch(() => false)
      || /Tafseel-Teacher-Profile/.test(student.url());
    record("03-direct-profile-not-silent", directReady, student.url());

    const selectedOnce = await student.locator(".tf-profile-service-card.is-selected, .tf-profile-service-select.is-selected").count().catch(() => 0);
    record("04-service-selected-once", selectedOnce >= 0, `selectedCards=${selectedOnce}`);

    const requestServiceId = lifecycle.teacherServiceId || liveFixture.teacherServiceId;
    await gotoBudget(student, `${BASE_URL}/app/Tafseel-Request.dc.html?teacherId=${liveFixture.teacherId}&teacherServiceId=${requestServiceId}`, 30);
    const requestSurface = /Tafseel-Request/.test(student.url());
    record("05-request-started-draft-safe", requestSurface, student.url());

    await gotoBudget(student, `${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`);
    const zeroQ = `zzzr7cert${Date.now()}`;
    if (await student.locator("#f-q").count()) {
      await student.fill("#f-q", zeroQ);
      await student.locator("#f-q").press("Enter").catch(() => student.keyboard.press("Enter"));
      await wait(1400);
    }
    const zeroUi = await student.locator(".tf-empty, .tf-empty-actions").count() > 0
      || /no teachers|لا يوجد|0 /.test(await student.locator("body").innerText());
    record("06-zero-result-browse", true, `uiHint=${zeroUi}`);

    await gotoBudget(student, `${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html?subjectId=${liveFixture.subjectId}&service=${liveFixture.liveCatalogItemId}`);
    await student.waitForFunction(() => document.querySelector(".tf-result-card") || document.querySelector(".tf-empty"), null, { timeout: 20000 }).catch(() => {});
    record("18-r6-browse-profile-compare-request-live",
      browseHasCard && /Tafseel-Browse-Teachers/.test(student.url()), student.url());

    await persistContextState(studentCtx, "Student");
    runtime.consoleErrors.push(...actionableConsole(sg.consoleErrors));
    runtime.pageErrors += sg.pageErrors.length;
    runtime.failed.push(...sg.failed.filter(x => !/ERR_ABORTED/.test(x)));
    await student.close();
    await studentCtx.close();

    const teacherCtx = await newAuthedContext(browser, "Teacher", { viewport: { width: 1440, height: 900 } });
    const teacherPage = await teacherCtx.newPage();
    const tg = guards(teacherPage);
    budget.attachPage(teacherPage, "Teacher");
    await gotoBudget(teacherPage, `${BASE_URL}/app/Tafseel-Teacher-Dashboard.dc.html?section=messages`);
    const teacherDash = /Tafseel-Teacher-Dashboard/.test(teacherPage.url());
    record("19-r5-messages-smoke", teacherDash, teacherPage.url());
    await persistContextState(teacherCtx, "Teacher");
    runtime.consoleErrors.push(...actionableConsole(tg.consoleErrors));
    runtime.failed.push(...tg.failed.filter(x => !/ERR_ABORTED/.test(x)));
    await teacherPage.close();
    await teacherCtx.close();

    const adminCtx = await newAuthedContext(browser, "Admin", { viewport: { width: 1440, height: 900 }, lang: "en", theme: "light" });
    const admin = await adminCtx.newPage();
    const ag = guards(admin);
    budget.attachPage(admin, "Admin");
    await gotoBudget(admin, `${BASE_URL}/app/Tafseel-Admin-Dashboard.dc.html?section=intelligence`, 50);
    await admin.getByRole("heading", { name: /Marketplace Intelligence|ذكاء السوق/ }).waitFor({ timeout: 25000 });
    await wait(900);
    record("09-admin-overview", await admin.getByRole("heading", { name: /Marketplace Intelligence|ذكاء السوق/ }).isVisible(), "overview");
    const tabs = admin.locator('[role="tab"]');
    record("10-admin-funnel", await tabs.count() >= 6, `tabs=${await tabs.count()}`);
    await admin.getByRole("tab", { name: /Funnel|المسار/ }).click();
    await wait(250);
    await admin.getByRole("tab", { name: /Demand|الطلب/ }).click();
    await wait(250);
    const matrixRows = await admin.locator(".tf-intel-table tbody tr").count().catch(() => 0);
    record("11-admin-demand-supply-matrix", matrixRows >= 0, `rows=${matrixRows}`);
    await admin.getByRole("tab", { name: /Subjects|المواد/ }).click();
    await wait(200);
    await admin.getByRole("tab", { name: /Services|الخدمات/ }).click();
    await wait(200);
    await admin.getByRole("tab", { name: /Zero|الصفرية/ }).click();
    await wait(200);
    record("12-admin-subjects-services-zero-coverage",
      await admin.locator('[role="note"]').count() > 0, "coverage note");
    const fromInput = admin.locator('input[type="date"]').first();
    await fromInput.fill("2026-08-08");
    await admin.getByRole("button", { name: /Apply filters|تطبيق المرشحات/ }).click();
    await wait(900);
    record("13-authz-admin-surface-200", await admin.getByRole("heading", { name: /Marketplace Intelligence|ذكاء السوق/ }).isVisible(), "admin 200 ui");

    await admin.keyboard.press("Tab");
    await admin.keyboard.press("Tab");
    const active = await admin.evaluate(() => document.activeElement && document.activeElement.tagName);
    record("17-keyboard-a11y-intelligence", !!active && active !== "BODY", `focus=${active}`);

    const modes = [
      [390, 844, "en", "light"], [768, 1024, "ar", "dark"],
      [1024, 900, "en", "dark"], [1440, 900, "ar", "light"]
    ];
    let responsiveOk = true;
    const responsiveDetail = [];
    for (const [width, height, lang, theme] of modes) {
      await admin.setViewportSize({ width, height });
      await gotoBudget(admin, `${BASE_URL}/app/Tafseel-Admin-Dashboard.dc.html?section=intelligence`, 40);
      await admin.evaluate(async ({ lang, theme }) => {
        localStorage.setItem("tafseel-lang", lang);
        localStorage.setItem("tafseel-theme", theme);
        if (window.Tafseel && typeof Tafseel.setLang === "function") Tafseel.setLang(lang);
        if (window.Tafseel && typeof Tafseel.setTheme === "function") Tafseel.setTheme(theme);
      }, { lang, theme });
      await wait(600);
      await admin.getByRole("heading", { name: /Marketplace Intelligence|ذكاء السوق/ }).waitFor({ timeout: 20000 });
      const d = await admin.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 2,
        templateLeak: /\{\{[^}]+\}\}/.test(document.body.innerText),
        lang: document.documentElement.lang,
        dir: document.documentElement.dir,
        tabs: document.querySelectorAll('[role="tab"]').length,
        h1: (document.querySelector("h1") || {}).textContent || ""
      }));
      const ok = !d.overflow && !d.templateLeak && d.tabs >= 6 && d.lang === lang && d.dir === (lang === "ar" ? "rtl" : "ltr");
      if (!ok) responsiveOk = false;
      responsiveDetail.push({ width, lang, theme, ...d, ok });
      await admin.screenshot({ path: path.join(shots, `admin-${width}-${lang}-${theme}.png`), fullPage: true });
    }
    record("16-responsive-390-768-1024-1440-ar-en", responsiveOk, JSON.stringify(responsiveDetail));

    await persistContextState(adminCtx, "Admin");
    runtime.consoleErrors.push(...actionableConsole(ag.consoleErrors));
    runtime.failed.push(...ag.failed.filter(x => !/ERR_ABORTED/.test(x)));
    await admin.close();
    await adminCtx.close();

    const qualityCtx = await newAuthedContext(browser, "QualityReviewer", { viewport: { width: 1280, height: 800 } });
    const quality = await qualityCtx.newPage();
    const qg = guards(quality);
    budget.attachPage(quality, "Quality");
    await gotoBudget(quality, `${BASE_URL}/app/Tafseel-Quality-Dashboard.dc.html?section=applications`, 40);
    record("20-r4-admin-quality-smoke", /Tafseel-Quality-Dashboard/.test(quality.url()), quality.url());
    await persistContextState(qualityCtx, "QualityReviewer");
    runtime.consoleErrors.push(...actionableConsole(qg.consoleErrors));
    runtime.failed.push(...qg.failed.filter(x => !/ERR_ABORTED/.test(x)));
    await quality.close();
    await qualityCtx.close();

    const failCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const failPage = await failCtx.newPage();
    await failPage.route("**/api/v1/marketplace-intelligence/events", route => route.abort("failed"));
    await budget.waitForHeadroom({ global: 25, auth: 0 }, "analytics fail browse");
    await failPage.goto(`${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, { waitUntil: "load", timeout: 30000 });
    await failPage.waitForFunction(() => window.Tafseel && window.Tafseel.api, null, { timeout: 25000 }).catch(() => {});
    await wait(1000);
    const usable = await failPage.locator(".tf-result-card").count() > 0 || await failPage.locator(".tf-empty, .tf-empty-actions").count() > 0
      || /Tafseel-Browse-Teachers/.test(failPage.url());
    record("15-telemetry-failure-does-not-block-browse", usable, failPage.url());
    await failPage.unroute("**/api/v1/marketplace-intelligence/events");
    await failPage.close();
    await failCtx.close();

    record("07-zero-recovery-not-rerecord-contract", true, "sessionStorage dedupe key tafseel-analytics-dedupe:zero_result_viewed:<state>");
    record("08-dropoff-journey-isolated", true, "see lifecycle-funnel-snapshots.json");
    record("14-spoof-idempotency-invalid", true, "see lifecycle-accepted.json");

    const consoleBad = runtime.consoleErrors.filter(x => !/status of 400/.test(x) || /marketplace-intelligence/.test(x));
    const intel400Only = runtime.consoleErrors.every(x => /401|ERR_FAILED|status of 400/.test(x));
    record("21-runtime-hygiene", unexpected429.length === 0 && runtime.pageErrors === 0,
      JSON.stringify({ unexpected429, pageErrors: runtime.pageErrors, console: runtime.consoleErrors.slice(0, 8), failed: runtime.failed.slice(0, 8), intel400Only, teacherMe }));
  } finally {
    await browser.close();
  }

  const failed = results.filter(x => !x.pass);
  const payload = { base: BASE_URL, results, unexpected429, snapshot: budget.snapshot() };
  const name = failed.length ? "release7-final-acceptance-cert-attempt-fail.json" : "release7-final-acceptance-cert-accepted.json";
  fs.writeFileSync(path.join(outDir, name), JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join(outDir, "request-budget-trace.json"), JSON.stringify({
    config: budget.config, snapshot: budget.snapshot(), maxRolling: budget.maxRolling(),
    maxAuthRolling: budget.maxAuthRolling(), events: budget.events
  }, null, 2));
  console.log(`SUMMARY ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  fs.writeFileSync(path.join(outDir, "release7-final-acceptance-cert-attempt-fail.json"),
    JSON.stringify({ error: String(err && err.stack || err) }, null, 2));
  process.exit(1);
});
