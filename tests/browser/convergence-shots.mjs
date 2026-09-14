// Student Journey Convergence — evidence capture harness.
// Drives the real application through legitimate login; no forged tokens, no SQL mutation.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { BASE_URL, loginAs } from "./lib/auth.mjs";

const OUT = process.env.TAFSEEL_SHOT_DIR
  || path.join("docs", "features", "evidence", "student-journey-convergence");

// name, url(relative to /app/), role(null = guest)
const SURFACES = JSON.parse(process.env.TAFSEEL_SURFACES || "[]");
const MATRIX = JSON.parse(process.env.TAFSEEL_MATRIX
  || '[{"w":1440,"lang":"en","theme":"light"}]');

const contexts = new Map();

async function contextFor(browser, role, lang, theme, width) {
  const key = `${role}|${lang}|${theme}|${width}`;
  if (contexts.has(key)) return contexts.get(key);
  const ctx = await browser.newContext({
    viewport: { width, height: width < 500 ? 900 : 950 },
    deviceScaleFactor: 1
  });
  await ctx.addInitScript(({ t, l }) => {
    localStorage.setItem("tafseel-theme", t);
    localStorage.setItem("tafseel-lang", l);
    // Evidence shots are of the product surfaces, so present as a visitor who
    // already closed the campaign this visit rather than hiding it with CSS.
    sessionStorage.setItem("tafseel.campaigns.session", JSON.stringify({
      closedAt: new Date().toISOString()
    }));
  }, { t: theme, l: lang });
  if (role) {
    const page = await ctx.newPage();
    await loginAs(ctx, role, 1, page);
    await page.close();
  }
  contexts.set(key, ctx);
  return ctx;
}

const errors = [];

async function shot(browser, surface, cell) {
  const { w, lang, theme } = cell;
  const ctx = await contextFor(browser, surface.role || null, lang, theme, w);
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(String(e)));
  page.on("response", r => {
    if (r.status() >= 500) pageErrors.push(`HTTP ${r.status()} ${r.url()}`);
  });
  const url = `${BASE_URL}/app/${surface.url}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(surface.wait || 2600);
  if (surface.click) {
    try {
      await page.click(surface.click, { timeout: 5000 });
      await page.waitForTimeout(1500);
    } catch { /* optional interaction */ }
  }
  /* Reveal-on-scroll content sits at opacity:0 until its observer fires, and a
     full-page screenshot never scrolls. Walk the page first so the capture shows
     what a visitor actually sees rather than a page of blank sections. */
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.75);
    const end = document.body.scrollHeight;
    for (let y = 0; y < end; y += step) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 110));
    }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 320));
  });
  /* Do not capture until every reveal has actually settled opaque. Without this
     the last section on a long page can still be mid-transition and screenshot
     as a blank band, which would misreport working UI as dead space. */
  await page.waitForFunction(() => {
    const pending = Array.from(document.querySelectorAll("[data-reveal],[data-reveal-group] > *"))
      .filter(el => el.getBoundingClientRect().height > 0
        && Number(getComputedStyle(el).opacity) < 0.99);
    return pending.length === 0;
  }, { timeout: 8000 }).catch(() => { /* recorded by the visual review, not fatal */ });
  await page.waitForTimeout(500);

  const dir = path.join(OUT, surface.dir || "misc");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${surface.name}-${w}-${lang}-${theme}.png`);
  await page.screenshot({ path: file, fullPage: surface.fullPage !== false });
  if (pageErrors.length) errors.push({ surface: surface.name, cell, pageErrors });
  console.log(`shot ${file}${pageErrors.length ? "  ERRORS:" + pageErrors.length : ""}`);
  await page.close();
}

const browser = await chromium.launch();
for (const surface of SURFACES)
  for (const cell of MATRIX) {
    try { await shot(browser, surface, cell); }
    catch (e) { errors.push({ surface: surface.name, cell, fatal: String(e) }); console.log(`FAIL ${surface.name} ${JSON.stringify(cell)}: ${e}`); }
  }
for (const ctx of contexts.values()) await ctx.close();
await browser.close();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "shot-errors.json"), JSON.stringify(errors, null, 2));
console.log(errors.length ? `\n${errors.length} surface(s) reported errors` : "\nno page errors");
