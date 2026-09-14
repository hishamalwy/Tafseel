/**
 * Admin responsive / RTL / theme certification (PASS 04).
 *
 * Captures the Admin evidence matrix AND asserts the responsive contract at every viewport, so the
 * run fails on a real defect instead of quietly producing screenshots nobody checked:
 *
 *   - no page-level horizontal overflow (table wrappers may scroll; the page may not)
 *   - the drawer toggle exists below the desktop breakpoint and the sidebar is reachable
 *   - no visible control is clipped to zero width
 *   - no untranslated interpolation leaks into the rendered page
 *
 * Run: node tests/browser/admin-visual-matrix.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loginAs, BASE_URL } from "./lib/auth.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..",
  "docs", "features", "evidence", "admin-ux-convergence");

/** One representative destination per Admin category, by sidebar label. */
/**
 * Selected by nav KEY, not by label. An earlier run matched English labels, so in Arabic every
 * click silently missed and the whole AR matrix screenshotted the Overview while claiming to be
 * eleven different screens. Keys are language-independent, and a miss now fails loudly.
 */
const SCREENS = ["overview", "users", "teachers", "requests", "sessions", "reviews",
                 "disputes", "payments", "withdrawals", "services", "settings"];

/** Core evidence matrix: desktop + phone × EN Light / AR Dark. */
const MODES = [
  { name: "1440-en-light", w: 1440, h: 900, theme: "light", lang: "en" },
  { name: "1440-ar-dark", w: 1440, h: 900, theme: "dark", lang: "ar" },
  { name: "390-en-light", w: 390, h: 844, theme: "light", lang: "en" },
  { name: "390-ar-dark", w: 390, h: 844, theme: "dark", lang: "ar" }
];
/** Density probes — the widths where Admin is most likely to break. */
const PROBE_WIDTHS = [375, 768, 1024, 1280];
const PROBE_SCREENS = ["overview", "users", "requests", "withdrawals", "services"];

const results = [];
let failed = 0;
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  if (!ok) failed++;
  if (!ok) console.log(`FAIL  ${name}\n        ${detail}`);
};

/** The responsive contract, asserted in-page at whatever viewport is current. */
const auditViewport = (page) => page.evaluate(() => {
  const docW = document.documentElement.clientWidth;
  const clipped = [...document.querySelectorAll("main button, main a[href], #admin-sidebar button")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return el.offsetParent !== null && r.width === 0 && (el.textContent || "").trim().length > 0;
    }).length;
  // A wrapper that scrolls is intentional; the PAGE overflowing is not.
  const pageOverflow = document.body.scrollWidth > docW + 1;
  const widest = [...document.querySelectorAll("main *")]
    .filter((el) => el.getBoundingClientRect().right > docW + 1 && !el.closest(".tf-table-wrap"))
    .slice(0, 1).map((el) => el.className || el.tagName)[0] || null;
  const unresolved = (document.querySelector("main")?.innerText.match(/\{\{[^}]*\}\}/g) || []).length;
  const drawerToggle = !!document.querySelector("#admin-drawer-toggle");
  return { pageOverflow, widest, clipped, unresolved, drawerToggle, docW };
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await loginAs(ctx, "Admin", 1, page);

async function setMode(theme, lang) {
  await page.evaluate(({ theme, lang }) => {
    localStorage.setItem("tafseel-theme", theme);
    localStorage.setItem("tafseel-lang", lang);
  }, { theme, lang });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
}
async function goto(key) {
  const sel = `#admin-sidebar [data-nav-key="${key}"]`;
  const btn = await page.$(sel);
  if (!btn) throw new Error(`nav destination '${key}' not found`);
  // Below the desktop breakpoint the sidebar is an off-canvas drawer, so the item exists but sits
  // outside the viewport until the drawer is opened.
  const onscreen = async () => page.$eval(sel, (b) => {
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.right > 0 && r.left < window.innerWidth;
  });
  if (!(await onscreen())) {
    await page.click("#admin-drawer-toggle").catch(() => {});
    await page.waitForTimeout(500);
  }
  await page.$eval(sel, (b) => b.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(150);
  if (!(await onscreen())) throw new Error(`nav '${key}' is unreachable at this viewport`);
  await btn.click({ timeout: 15000 });
  await page.waitForTimeout(1300);
  // Prove the click actually landed rather than trusting it.
  const current = await page.$eval(sel, (b) => b.getAttribute("aria-current"));
  if (current !== "page") throw new Error(`nav '${key}' did not become current (aria-current=${current})`);
}

let shots = 0;
// ------------------------------------------------------------------ core matrix
for (const mode of MODES) {
  await page.setViewportSize({ width: mode.w, height: mode.h });
  await page.goto(`${BASE_URL}/app/Tafseel-Admin-Dashboard.dc.html`, { waitUntil: "networkidle" });
  await setMode(mode.theme, mode.lang);
  const dir = join(ROOT, mode.name);
  mkdirSync(dir, { recursive: true });

  for (const screen of SCREENS) {
    await goto(screen);
    await page.screenshot({ path: join(dir, `${screen}.png`) });
    shots++;

    const a = await auditViewport(page);
    const label = `${screen} @ ${mode.name}`;
    if (a.pageOverflow) record(`overflow_${label}`, false, `page scrolls horizontally (widest: ${a.widest})`);
    if (a.clipped) record(`clipped_${label}`, false, `${a.clipped} labelled control(s) collapsed to zero width`);
    if (a.unresolved) record(`unresolved_${label}`, false, `${a.unresolved} unresolved {{ }} placeholder(s)`);
    if (mode.w < 1024 && !a.drawerToggle) record(`drawer_${label}`, false, "no drawer toggle below 1024px");
    record(`ok_${label}`, true, "");
  }
}

// ------------------------------------------------------------------ density probes
await setMode("light", "en");
for (const width of PROBE_WIDTHS) {
  await page.setViewportSize({ width, height: 900 });
  const dir = join(ROOT, `${width}-en-light`);
  mkdirSync(dir, { recursive: true });
  for (const screen of PROBE_SCREENS) {
    await goto(screen);
    await page.screenshot({ path: join(dir, `${screen}.png`) });
    shots++;
    const a = await auditViewport(page);
    const label = `${screen} @ ${width}`;
    if (a.pageOverflow) record(`overflow_${label}`, false, `page scrolls horizontally (widest: ${a.widest})`);
    if (a.clipped) record(`clipped_${label}`, false, `${a.clipped} labelled control(s) collapsed to zero width`);
    if (width < 1024 && !a.drawerToggle) record(`drawer_${label}`, false, "no drawer toggle below 1024px");
    record(`ok_${label}`, true, "");
  }
}

// ------------------------------------------------------------------ 200% zoom smoke
await page.setViewportSize({ width: 1280, height: 900 });
await goto("users");
await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
await page.waitForTimeout(800);
const zoom = await auditViewport(page);
await page.screenshot({ path: join(ROOT, "zoom-200-users-1280-en-light.png") });
shots++;
if (zoom.pageOverflow) record("zoom200_users", false, `page overflows at 200% zoom (widest: ${zoom.widest})`);
else record("zoom200_users", true, "");
await page.evaluate(() => { document.documentElement.style.zoom = ""; });

await ctx.close();
await browser.close();

const checks = results.length;
console.log(`\n${checks - failed}/${checks} responsive/RTL/theme assertions passed across ${shots} screenshots.`);
console.log(`Evidence: ${ROOT}`);
if (failed) { console.error("Admin visual matrix FAILED."); process.exit(1); }
