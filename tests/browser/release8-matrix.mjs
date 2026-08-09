/**
 * Release 8 — 384-state visual/responsive matrix.
 * 16 entry points × 6 viewports × 4 modes (ar/en × dark/light).
 * Rate-limit-aware: request budget + cool-down retry on 429 (never marks 429 retry as PASS without a clean retest).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loginAs, setThemeAndLang, BASE_URL } from "./lib/auth.mjs";
import { SURFACES, VIEWPORTS, MODES, fullUrl } from "./lib/surfaces-r8.mjs";
import { createRequestBudget } from "./lib/request-budget.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.argv[2]
  || path.join("docs", "features", "evidence", "phase4-release8-product-experience", "matrix");
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, "screenshots"), { recursive: true });

const NETWORK_LEAK_RE = /%7B%7B|\{\{|\}\}/;
const budget = createRequestBudget({ baseUrl: BASE_URL, globalSafety: 160, authSafety: 3 });
const wait = ms => new Promise(r => setTimeout(r, ms));

function isBenignFirstPartyFailure(url, status) {
  return status === 401 && /\/api\/v1\/auth\/refresh$/.test(new URL(url).pathname);
}

async function runCellOnce(page, surface, viewport, mode) {
  const rawConsoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  let unexpected429 = 0;
  let unexpected500 = 0;

  const onConsole = msg => { if (msg.type() === "error") rawConsoleErrors.push(msg.text().slice(0, 300)); };
  const onPageError = err => pageErrors.push(String(err).slice(0, 300));
  const onResponse = res => {
    const url = res.url();
    if (!url.startsWith(BASE_URL)) return;
    const status = res.status();
    if (status === 429) unexpected429++;
    if (status >= 500) unexpected500++;
    if (status >= 400) {
      if (!isBenignFirstPartyFailure(url, status) && status !== 429)
        failedRequests.push(`${status} ${url}`);
    }
    if (NETWORK_LEAK_RE.test(url)) failedRequests.push(`TEMPLATE-LEAK ${url}`);
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);

  const result = {
    surface: surface.id, label: surface.label,
    viewport: `${viewport.width}x${viewport.height}`,
    width: viewport.width, height: viewport.height,
    language: mode.lang, direction: mode.lang === "ar" ? "rtl" : "ltr",
    theme: mode.theme, role: surface.role || "public",
    url: fullUrl(surface), loaded: false, overflowX: null,
    consoleErrors: 0, pageErrors: 0, failedRequests: 0,
    unexpected429: 0, unexpected500: 0,
    templateLeak: false, result: "FAIL", detail: "", retried: false
  };

  try {
    await budget.waitForHeadroom({ global: 60, auth: 2 }, `cell ${surface.id}`);
    await wait(8000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    if (!page.url().startsWith(BASE_URL)) {
      await page.goto(fullUrl(surface), { waitUntil: "domcontentloaded", timeout: 25000 });
    }
    await setThemeAndLang(page, mode.theme, mode.lang);
    await page.goto(fullUrl(surface), { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForFunction(() => window.Tafseel && window.Tafseel.api, null, { timeout: 20000 }).catch(() => {});
    await wait(500);
    result.loaded = true;

    const domCheck = await page.evaluate(() => {
      const html = document.documentElement;
      const body = document.body;
      const bodyText = body ? body.innerText : "";
      return {
        overflowX: (() => {
          const htmlClipped = getComputedStyle(html).overflowX === "hidden" || getComputedStyle(html).overflowX === "clip";
          const bodyClipped = body && (getComputedStyle(body).overflowX === "hidden" || getComputedStyle(body).overflowX === "clip");
          if (htmlClipped || bodyClipped) return false;
          return (html.scrollWidth > window.innerWidth + 1) || (body && body.scrollWidth > window.innerWidth + 1);
        })(),
        templateLeak: /\{\{[^}]{0,80}\}\}/.test(bodyText)
      };
    });
    result.overflowX = domCheck.overflowX;
    result.templateLeak = domCheck.templateLeak;

    const actionableConsole = rawConsoleErrors.filter(t =>
      !/401 \(Unauthorized\)/.test(t)
      && !/Failed to load resource: the server responded with a status of 401/.test(t)
      && !/status of 429/.test(t)
      && !/MIME type/.test(t));

    result.consoleErrors = actionableConsole.length;
    result.pageErrors = pageErrors.length;
    result.failedRequests = failedRequests.filter(x => !/\b429\b/.test(x)).length;
    result.unexpected429 = unexpected429;
    result.unexpected500 = unexpected500;

    const failures = [];
    if (!result.loaded) failures.push("not loaded");
    if (result.overflowX) failures.push("overflowX");
    if (result.templateLeak) failures.push("template leak in visible text");
    if (result.pageErrors) failures.push(`pageErrors=${result.pageErrors}`);
    if (result.consoleErrors) failures.push(`consoleErrors=${result.consoleErrors}`);
    if (result.failedRequests) failures.push(`failedRequests=${result.failedRequests}`);
    if (result.unexpected429) failures.push(`unexpected429=${result.unexpected429}`);
    if (result.unexpected500) failures.push(`unexpected500=${result.unexpected500}`);

    if (failures.length) {
      result.result = "FAIL";
      result.detail = failures.join("; ") + (actionableConsole[0] ? ` :: ${actionableConsole[0]}` : "");
    } else {
      result.result = "PASS";
    }

    const shotKey = `${viewport.width}_${mode.lang}_${mode.theme}_${surface.id}`;
    const wantShot =
      (viewport.width === 375 && mode.lang === "ar" && mode.theme === "dark")
      || (viewport.width === 390 && mode.lang === "en" && mode.theme === "light")
      || (viewport.width === 768 && mode.lang === "ar" && mode.theme === "light")
      || (viewport.width === 1024 && mode.lang === "en" && mode.theme === "dark")
      || (viewport.width === 1280 && mode.lang === "ar" && mode.theme === "dark")
      || (viewport.width === 1440 && mode.lang === "en" && mode.theme === "light");
    const highRisk = new Set([
      "landing", "browse", "teacher-profile", "student-dashboard", "teacher-dashboard",
      "guided-request", "messages", "live-booking", "admin-intelligence", "compare"
    ]);
    if (result.result === "PASS" && wantShot && highRisk.has(surface.id)) {
      await page.screenshot({
        path: path.join(OUT_DIR, "screenshots", `${shotKey}.png`),
        fullPage: false
      });
    }
  } catch (err) {
    result.result = "FAIL";
    result.detail = String(err).slice(0, 400);
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("response", onResponse);
  }
  return result;
}

async function runCell(page, surface, viewport, mode) {
  let result = await runCellOnce(page, surface, viewport, mode);
  if (result.result === "FAIL" && result.unexpected429 > 0 && !/overflowX|template leak|pageErrors|consoleErrors|unexpected500/.test(result.detail)) {
    // Cool down a full rolling window, then retest once. Only the clean retest can PASS.
    console.log(`COOLDOWN 65s after 429 on ${surface.id} ${viewport.width} ${mode.lang}/${mode.theme}`);
    await wait(65000);
    result = await runCellOnce(page, surface, viewport, mode);
    result.retried = true;
  }
  return result;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const contexts = new Map();
  const pages = new Map();

  async function pageFor(role) {
    const key = role || "public";
    if (pages.has(key)) return pages.get(key);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    contexts.set(key, context);
    let page;
    if (role) {
      await budget.waitForHeadroom({ global: 20, auth: 3 }, `login ${role}`);
      page = await loginAs(context, role);
    } else {
      page = await context.newPage();
      await page.goto(`${BASE_URL}/app/Tafseel-Landing.dc.html`, { waitUntil: "domcontentloaded" });
    }
    budget.attachPage(page, key);
    pages.set(key, page);
    return page;
  }

  const results = [];
  let pass = 0;
  let fail = 0;
  for (const surface of SURFACES) {
    const page = await pageFor(surface.role);
    for (const viewport of VIEWPORTS) {
      for (const mode of MODES) {
        const cell = await runCell(page, surface, viewport, mode);
        results.push(cell);
        if (cell.result === "PASS") pass++;
        else {
          fail++;
          console.log(`FAIL ${surface.id} ${viewport.width} ${mode.lang}/${mode.theme} :: ${cell.detail}`);
        }
        process.stdout.write(`\r${pass + fail}/384 pass=${pass} fail=${fail}   `);
      }
    }
  }

  const summary = {
    total: results.length,
    pass,
    fail,
    skipped: 0,
    unexpected429: results.reduce((n, r) => n + (r.unexpected429 || 0), 0),
    unexpected500: results.reduce((n, r) => n + (r.unexpected500 || 0), 0),
    pageErrors: results.reduce((n, r) => n + (r.pageErrors || 0), 0),
    consoleErrors: results.reduce((n, r) => n + (r.consoleErrors || 0), 0),
    resourceFailures: results.reduce((n, r) => n + (r.failedRequests || 0), 0),
    templateLeaks: results.filter(r => r.templateLeak).length,
    generatedAt: new Date().toISOString()
  };

  fs.writeFileSync(path.join(OUT_DIR, "matrix.json"), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(`\nRelease 8 matrix: ${pass}/${summary.total} PASS, ${fail} FAIL`);
  await browser.close();
  process.exit(fail === 0 && pass === 384 ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(2);
});
