/**
 * PASS 02 — representative visual validation across the three UI families.
 *
 * Global tokens can affect every surface, so this renders one representative page per family at
 * desktop and mobile, in Light and Dark, English and Arabic, and writes them under a labelled
 * directory so before/after can be compared directly.
 *
 *   node tests/browser/ui-foundation-shots.mjs before
 *   node tests/browser/ui-foundation-shots.mjs after
 *
 * Authenticated dashboards are included when credentials are present; public surfaces always run.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loginAs, BASE_URL } from "./lib/auth.mjs";

const LABEL = process.argv[2] || "after";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..",
  "docs", "features", "evidence", "ui-foundation-consolidation", LABEL);

/** family → representative surface. Composition differs by family by design; the language does not. */
const PUBLIC_SURFACES = [
  ["marketplace", "landing", "Tafseel-Landing.dc.html"],
  ["marketplace", "browse", "Tafseel-Browse-Teachers.dc.html"],
  ["workflow", "auth", "Tafseel-Auth.dc.html"]
];
const AUTHED_SURFACES = [
  ["dashboard", "student", "Student", "Tafseel-Student-Dashboard.dc.html"],
  ["dashboard", "teacher", "Teacher", "Tafseel-Teacher-Dashboard.dc.html"],
  ["dashboard", "admin", "Admin", "Tafseel-Admin-Dashboard.dc.html"],
  ["workflow", "request", "Student", "Tafseel-Request.dc.html"]
];

// The four required combinations: desktop/mobile × Light/Dark × EN/AR.
const MODES = [
  { name: "1440-en-light", w: 1440, h: 900, theme: "light", lang: "en" },
  { name: "1440-ar-dark", w: 1440, h: 900, theme: "dark", lang: "ar" },
  { name: "390-en-light", w: 390, h: 844, theme: "light", lang: "en" },
  { name: "390-ar-dark", w: 390, h: 844, theme: "dark", lang: "ar" }
];

async function shoot(page, family, surface, file, mode) {
  await page.setViewportSize({ width: mode.w, height: mode.h });
  await page.goto(`${BASE_URL}/app/${file}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ theme, lang }) => {
    localStorage.setItem("tafseel-theme", theme);
    localStorage.setItem("tafseel-lang", lang);
  }, mode);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  const dir = join(ROOT, family);
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${surface}-${mode.name}.png`) });
}

const browser = await chromium.launch();
let shots = 0;

const anon = await browser.newContext();
const anonPage = await anon.newPage();
for (const [family, surface, file] of PUBLIC_SURFACES) {
  for (const mode of MODES) {
    await shoot(anonPage, family, surface, file, mode);
    shots++;
  }
}
await anon.close();

// The Development "auth" policy allows 10 requests/minute; logging four roles in back to back
// trips it, so each authenticated surface waits before taking its turn.
let first = true;
for (const [family, surface, role, file] of AUTHED_SURFACES) {
  if (!process.env[`TAFSEEL_UAT_${role.toUpperCase()}_PASSWORD`]) {
    console.log(`skip ${surface}: no ${role} credentials`);
    continue;
  }
  if (!first) await new Promise((r) => setTimeout(r, 20000));
  first = false;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await loginAs(ctx, role, 1, page); // attempt=1 so the helper's rate-limit backoff can retry
    for (const mode of MODES) {
      await shoot(page, family, surface, file, mode);
      shots++;
    }
  } catch (e) {
    console.log(`skip ${surface}: ${String(e.message).split("\n")[0]}`);
  }
  await ctx.close();
}

await browser.close();
console.log(`${LABEL}: ${shots} screenshots written to ${ROOT}`);
