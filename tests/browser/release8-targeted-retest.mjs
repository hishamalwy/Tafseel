/**
 * Post-polish targeted retest for Student Dashboard + Admin Intelligence (48 cells).
 * Full 384 matrix remains the canonical certification; this re-verifies polish deltas.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { loginAs, setThemeAndLang, BASE_URL } from "./lib/auth.mjs";
import { SURFACES, VIEWPORTS, MODES, fullUrl } from "./lib/surfaces-r8.mjs";
import { createRequestBudget } from "./lib/request-budget.mjs";

const targets = new Set(["student-dashboard", "admin-intelligence"]);
const surfaces = SURFACES.filter(s => targets.has(s.id));
const budget = createRequestBudget({ baseUrl: BASE_URL, globalSafety: 160, authSafety: 3 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const NETWORK_LEAK_RE = /%7B%7B|\{\{|\}\}/;
const OUT = path.join(
  "docs",
  "features",
  "evidence",
  "phase4-release8-product-experience",
  "matrix",
  "targeted-retest"
);
fs.mkdirSync(path.join(OUT, "screenshots"), { recursive: true });

async function runCell(page, surface, viewport, mode) {
  let unexpected429 = 0;
  let unexpected500 = 0;
  const pageErrors = [];
  const failed = [];
  const cons = [];
  const onC = m => { if (m.type() === "error") cons.push(m.text().slice(0, 200)); };
  const onE = e => pageErrors.push(String(e).slice(0, 200));
  const onR = res => {
    const url = res.url();
    if (!url.startsWith(BASE_URL)) return;
    const st = res.status();
    if (st === 429) unexpected429 += 1;
    if (st >= 500) unexpected500 += 1;
    if (st >= 400 && st !== 429 && !(st === 401 && /auth\/refresh$/.test(url)))
      failed.push(`${st} ${url}`);
    if (NETWORK_LEAK_RE.test(url)) failed.push(`LEAK ${url}`);
  };
  page.on("console", onC);
  page.on("pageerror", onE);
  page.on("response", onR);
  const result = {
    surface: surface.id,
    viewport: viewport.width,
    lang: mode.lang,
    theme: mode.theme,
    result: "FAIL",
    detail: ""
  };
  try {
    await budget.waitForHeadroom({ global: 60, auth: 2 }, "cell");
    await wait(6000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await setThemeAndLang(page, mode.theme, mode.lang);
    await page.goto(fullUrl(surface), { waitUntil: "networkidle", timeout: 30000 });
    await wait(400);
    const dom = await page.evaluate(() => {
      const html = document.documentElement;
      const body = document.body;
      const clipped =
        getComputedStyle(html).overflowX === "hidden"
        || getComputedStyle(html).overflowX === "clip"
        || (body && (getComputedStyle(body).overflowX === "hidden" || getComputedStyle(body).overflowX === "clip"));
      const overflowX = clipped
        ? false
        : (html.scrollWidth > window.innerWidth + 1) || (body && body.scrollWidth > window.innerWidth + 1);
      return {
        overflowX,
        templateLeak: /\{\{[^}]{0,80}\}\}/.test(body ? body.innerText : "")
      };
    });
    const actionable = cons.filter(t =>
      !/401 \(Unauthorized\)/.test(t)
      && !/Failed to load resource: the server responded with a status of 401/.test(t)
      && !/status of 429/.test(t)
      && !/MIME type/.test(t));
    const fails = [];
    if (dom.overflowX) fails.push("overflowX");
    if (dom.templateLeak) fails.push("templateLeak");
    if (pageErrors.length) fails.push(`pageErrors=${pageErrors.length}`);
    if (actionable.length) fails.push(`consoleErrors=${actionable.length} :: ${actionable[0]}`);
    if (failed.length) fails.push(`failedRequests=${failed.length} :: ${failed[0]}`);
    if (unexpected429) fails.push("429");
    if (unexpected500) fails.push("500");
    if (fails.length) {
      result.detail = fails.join(";");
    } else {
      result.result = "PASS";
      const want =
        (viewport.width === 375 && mode.lang === "ar" && mode.theme === "dark")
        || (viewport.width === 390 && mode.lang === "en" && mode.theme === "light");
      if (want) {
        const file = `${viewport.width}_${mode.lang}_${mode.theme}_${surface.id}.png`;
        await page.screenshot({ path: path.join(OUT, "screenshots", file) });
      }
    }
  } catch (e) {
    result.detail = String(e).slice(0, 300);
  } finally {
    page.off("console", onC);
    page.off("pageerror", onE);
    page.off("response", onR);
  }
  return result;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const pages = new Map();
  async function pageFor(role) {
    const key = role || "public";
    if (pages.has(key)) return pages.get(key);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    let page;
    if (role) {
      await budget.waitForHeadroom({ global: 20, auth: 3 }, "login");
      page = await loginAs(ctx, role);
    } else {
      page = await ctx.newPage();
      await page.goto(`${BASE_URL}/app/Tafseel-Landing.dc.html`, { waitUntil: "domcontentloaded" });
    }
    budget.attachPage(page, key);
    pages.set(key, page);
    return page;
  }

  const results = [];
  let pass = 0;
  let fail = 0;
  for (const surface of surfaces) {
    const page = await pageFor(surface.role);
    for (const viewport of VIEWPORTS) {
      for (const mode of MODES) {
        let cell = await runCell(page, surface, viewport, mode);
        if (cell.result === "FAIL" && /429/.test(cell.detail)) {
          await wait(65000);
          cell = await runCell(page, surface, viewport, mode);
        }
        results.push(cell);
        if (cell.result === "PASS") pass += 1;
        else {
          fail += 1;
          console.log("FAIL", cell);
        }
        process.stdout.write(`\r${pass + fail}/48 pass=${pass} fail=${fail}   `);
      }
    }
  }

  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ total: results.length, pass, fail, results }, null, 2));
  console.log(`\nTARGETED_RETEST ${pass}/48`);
  await browser.close();
  process.exit(fail === 0 && pass === 48 ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(2);
});
