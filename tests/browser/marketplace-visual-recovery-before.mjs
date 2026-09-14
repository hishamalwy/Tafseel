/**
 * Capture REJECTED before-state for Teacher Marketplace Visual Recovery.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE_URL, setThemeAndLang } from "./lib/auth.mjs";

const OUT = "docs/features/evidence/teacher-marketplace-visual-recovery/before";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("shot", file);
}

async function openBrowse(page, w, h, lang, theme) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await setThemeAndLang(page, theme, lang);
  await page.goto(`${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, { waitUntil: "networkidle", timeout: 60000 });
  await wait(900);
}

async function openProfile(page, w, h, lang, theme) {
  await openBrowse(page, w, h, lang, theme);
  const href = await page.evaluate(() => {
    const a = document.querySelector(".tf-result-name, a[href*='Teacher-Profile']");
    return a ? a.getAttribute("href") : null;
  });
  if (!href) throw new Error("No teacher profile link on browse");
  await page.goto(new URL(href, `${BASE_URL}/app/`).toString(), { waitUntil: "networkidle", timeout: 60000 });
  await wait(1000);
}

const browseCells = [
  [1440, 900, "ar", "dark"],
  [1440, 900, "en", "light"],
  [1280, 800, "ar", "light"],
  [1024, 768, "en", "dark"],
  [768, 900, "ar", "dark"],
  [390, 844, "ar", "light"],
  [375, 812, "en", "dark"],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [w, h, lang, theme] of browseCells) {
  await openBrowse(page, w, h, lang, theme);
  await shot(page, path.join(OUT, "browse"), `${w}-${lang}-${theme}`);
}
for (const [w, h, lang, theme] of browseCells) {
  await openProfile(page, w, h, lang, theme);
  await shot(page, path.join(OUT, "profile"), `${w}-${lang}-${theme}`);
}
await browser.close();
console.log("BEFORE_CAPTURE_DONE");
