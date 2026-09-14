import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE_URL, setThemeAndLang } from "./lib/auth.mjs";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = "docs/features/evidence/teacher-marketplace-visual-recovery";
const teacherId = "f64f6c10-d606-498f-a637-920224d44e1c";

async function shot(page, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: false });
  console.log("shot", file);
}

const browser = await chromium.launch();
const page = await browser.newPage();

async function prep(theme, lang) {
  await page.goto(`${BASE_URL}/app/Tafseel-Landing.dc.html`, { waitUntil: "domcontentloaded" });
  await setThemeAndLang(page, theme, lang);
}

// Critical evidence refresh after cooldown
await prep("dark", "ar");
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, { waitUntil: "networkidle" });
await wait(1500);
await shot(page, path.join(OUT, "after/browse/1440-ar-dark.png"));
const price = page.locator(".tf-result-card .tf-price-line").first();
if (await price.count()) {
  await price.screenshot({ path: path.join(OUT, "currency/browse-price-ar-dark.png") });
  console.log("price mark", await price.evaluate((el) => {
    const m = el.querySelector(".tf-price-currency--mark");
    const cs = m && getComputedStyle(m);
    return { w: cs?.width, h: cs?.height, title: m?.getAttribute("title") };
  }));
}
await page.goto(`${BASE_URL}/app/Tafseel-Teacher-Profile.dc.html?id=${teacherId}`, { waitUntil: "networkidle" });
await wait(1600);
await shot(page, path.join(OUT, "after/profile/1440-ar-dark.png"));
await page.locator("#profile-reviews").scrollIntoViewIfNeeded();
await wait(500);
await shot(page, path.join(OUT, "reviews/1440-ar-dark.png"));
await page.locator("#profile-services").scrollIntoViewIfNeeded();
await wait(400);
await shot(page, path.join(OUT, "services/1440-ar-dark.png"));

await prep("light", "en");
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, { waitUntil: "networkidle" });
await wait(1500);
await shot(page, path.join(OUT, "after/browse/1440-en-light.png"));
await page.goto(`${BASE_URL}/app/Tafseel-Teacher-Profile.dc.html?id=${teacherId}`, { waitUntil: "networkidle" });
await wait(1600);
await shot(page, path.join(OUT, "after/profile/1440-en-light.png"));

// Mobile
for (const [w, h, theme, lang, name] of [
  [390, 844, "dark", "ar", "390-ar-dark"],
  [375, 812, "dark", "en", "375-en-dark"],
  [768, 900, "dark", "ar", "768-ar-dark"],
]) {
  await prep(theme, lang);
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, { waitUntil: "networkidle" });
  await wait(1600);
  await shot(page, path.join(OUT, "after/browse", `${name}.png`));
  await wait(1500);
  await page.goto(`${BASE_URL}/app/Tafseel-Teacher-Profile.dc.html?id=${teacherId}`, { waitUntil: "networkidle" });
  await wait(1800);
  await shot(page, path.join(OUT, "after/profile", `${name}.png`));
  await wait(1500);
}

await browser.close();
console.log("CRITICAL_EVIDENCE_DONE");
