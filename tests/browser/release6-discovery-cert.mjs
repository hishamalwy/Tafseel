import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const base = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5196";
const out = process.argv[2] || path.resolve(import.meta.dirname, "../../docs/features/evidence/phase4-release6-discovery-conversion/browser");
const shots = path.join(out, "screenshots");
fs.mkdirSync(shots, { recursive: true });

const results = [];
const record = (name, pass, detail = "") => {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
};

function guard(page) {
  const state = { pageErrors: [], consoleErrors: [], failed: [], status429: [], teacherQueries: [] };
  page.on("pageerror", error => state.pageErrors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") state.consoleErrors.push(message.text()); });
  page.on("requestfailed", request => state.failed.push(`${request.failure()?.errorText || "failed"} ${request.url()}`));
  page.on("response", response => {
    if (response.status() === 429) state.status429.push(response.url());
    if (/\/api\/v1\/teachers\?/.test(response.url())) state.teacherQueries.push(response.url());
  });
  return state;
}

async function diagnostics(page) {
  return page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    theme: document.documentElement.dataset.theme || "",
    overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    templateLeak: /\{\{[^}]+\}\}/.test(document.body.innerText),
    missingKey: /missing:|âŸ¦missing/.test(document.body.innerText),
    main: !!document.querySelector("main"),
    h1: document.querySelectorAll("h1").length
  }));
}

async function openMode(browser, { width, height, lang, theme, label }) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addInitScript(({ lang, theme }) => {
    localStorage.setItem("tafseel-lang", lang);
    localStorage.setItem("tafseel-theme", theme);
  }, { lang, theme });
  const page = await context.newPage();
  const g = guard(page);
  await page.goto(`${base}/app/Tafseel-Browse-Teachers.dc.html`, { waitUntil: "networkidle", timeout: 30000 });
  await page.locator(".tf-result-card").first().waitFor({ state: "visible", timeout: 20000 });
  const d = await diagnostics(page);
  record(`${label}-document`, d.main && d.h1 === 1 && !d.overflow && !d.templateLeak && !d.missingKey, JSON.stringify(d));
  record(`${label}-locale-theme`, d.lang === lang && d.dir === (lang === "ar" ? "rtl" : "ltr") && d.theme === theme, JSON.stringify(d));
  const actionableConsole = g.consoleErrors.filter(message => !/401 \(Unauthorized\)/.test(message));
  record(`${label}-clean-runtime`, !g.pageErrors.length && !actionableConsole.length && !g.failed.length && !g.status429.length, JSON.stringify({ ...g, actionableConsole }));
  await page.screenshot({ path: path.join(shots, `${label}.png`), fullPage: true });
  await context.close();
}

const browser = await chromium.launch();
try {
  for (const mode of [
    { width: 390, height: 844, lang: "en", theme: "light", label: "browse-390-en-light" },
    { width: 768, height: 1024, lang: "ar", theme: "dark", label: "browse-768-ar-dark" },
    { width: 1440, height: 1000, lang: "en", theme: "dark", label: "browse-1440-en-dark" }
  ]) await openMode(browser, mode);

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const g = guard(page);
  await page.goto(`${base}/app/Tafseel-Browse-Teachers.dc.html`, { waitUntil: "networkidle", timeout: 30000 });
  await page.locator(".tf-result-card").first().waitFor({ state: "visible", timeout: 20000 });

  const subject = page.locator("#f-subject");
  const subjectOptions = await subject.locator("option").count();
  if (subjectOptions > 1) await subject.selectOption({ index: 1 });
  await page.waitForTimeout(800);
  const service = page.locator("#f-service");
  const serviceOptions = await service.locator("option").count();
  if (serviceOptions > 1) await service.selectOption({ index: 1 });
  await page.waitForTimeout(800);
  await page.locator("#sort").selectOption("lowest-price");
  await page.waitForTimeout(800);
  const urlState = new URL(page.url());
  const lastQuery = g.teacherQueries.at(-1) || "";
  record("server-filter-sort-url-state", urlState.searchParams.has("subjectId") && urlState.searchParams.has("service") && urlState.searchParams.get("sort") === "lowest-price" && /subjectId=/.test(lastQuery) && /serviceTypeId=/.test(lastQuery) && /sort=lowest-price/.test(lastQuery), `${page.url()} | ${lastQuery}`);

  await page.locator("#f-q").fill("no-such-teacher-release-six-9d7e");
  await page.locator("#f-q").press("Enter");
  await page.waitForTimeout(900);
  const empty = page.locator(".tf-empty-actions");
  record("truthful-zero-result-recovery", await empty.isVisible() && await empty.locator("button").count() >= 1, await empty.innerText().catch(() => "missing"));
  await page.screenshot({ path: path.join(shots, "zero-result-recovery.png"), fullPage: true });
  await empty.locator("button").last().click();
  await page.locator(".tf-result-card").first().waitFor({ state: "visible", timeout: 20000 });

  const cards = page.locator(".tf-result-card");
  const cardCount = await cards.count();
  record("catalog-backed-contextual-cards", cardCount > 0 && await cards.first().locator(".tf-context-offer").innerText().then(text => text.trim().length > 0), `cards=${cardCount}`);
  if (cardCount >= 2) {
    await cards.nth(0).locator('input[type="checkbox"]').check();
    await cards.nth(1).locator('input[type="checkbox"]').check();
    const compareButton = page.locator('[role="region"] button').last();
    await compareButton.click();
    await page.locator('[role="dialog"]').waitFor({ state: "visible", timeout: 15000 });
    await page.locator('[role="dialog"] .tf-compare-person').first().waitFor({ state: "visible", timeout: 15000 });
    const compareText = await page.locator('[role="dialog"]').innerText();
    record("compare-decision-surface", await page.locator('[role="dialog"] .tf-compare-person').count() >= 2 && !/best match|top pick|winner:/i.test(compareText), "two scoped teachers; no fabricated selection");
    await page.screenshot({ path: path.join(shots, "compare-desktop.png"), fullPage: true });
    await page.locator("#compare-close").click();
  } else record("compare-decision-surface", false, "fewer than two public fixtures");

  const profileHref = await cards.first().locator('a[href*="Tafseel-Teacher-Profile"]').first().getAttribute("href");
  record("profile-link-preserves-context", /teacherServiceId=/.test(profileHref || ""), profileHref || "missing");
  await page.waitForTimeout(2500);
  await page.goto(new URL(profileHref, `${base}/app/`).href, { waitUntil: "networkidle", timeout: 30000 });
  await page.locator("#profile-heading").waitFor({ state: "visible", timeout: 20000 });
  const profileDiag = await diagnostics(page);
  record("profile-conversion-surface", await page.locator("#profile-services").isVisible() && await page.locator(".tf-profile-conversion-card").isVisible() && !profileDiag.overflow && !profileDiag.templateLeak, JSON.stringify(profileDiag));
  await page.screenshot({ path: path.join(shots, "profile-desktop.png"), fullPage: true });
  const actionableConsole = g.consoleErrors.filter(message => !/401 \(Unauthorized\)/.test(message));
  record("functional-runtime-clean", !g.pageErrors.length && !actionableConsole.length && !g.failed.length && !g.status429.length, JSON.stringify({ ...g, actionableConsole }));
  await context.close();
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(out, "release6-browser-certification.json"), JSON.stringify({ base, results }, null, 2));
const failed = results.filter(result => !result.pass);
console.log(`SUMMARY ${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exitCode = 1;
