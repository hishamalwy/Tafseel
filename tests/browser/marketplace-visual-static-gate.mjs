import { chromium } from "@playwright/test";
import { BASE_URL, setThemeAndLang } from "./lib/auth.mjs";
import fs from "node:fs";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, { waitUntil: "networkidle" });
await setThemeAndLang(page, "dark", "ar");
await page.goto(`${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const input = page.locator("#f-available-on");
await input.scrollIntoViewIfNeeded();
const box = await input.boundingBox();
console.log("box", box);
const styles = await input.evaluate((el) => {
  const cs = getComputedStyle(el);
  return {
    bg: cs.backgroundColor,
    color: cs.color,
    border: cs.borderColor,
    scheme: cs.colorScheme,
    htmlScheme: getComputedStyle(document.documentElement).colorScheme,
  };
});
console.log("styles", styles);
fs.mkdirSync("docs/features/evidence/teacher-marketplace-visual-recovery/filters", { recursive: true });
await input.screenshot({ path: "docs/features/evidence/teacher-marketplace-visual-recovery/filters/date-dark-closeup.png" });

// EN light browse + profile static gate
await setThemeAndLang(page, "light", "en");
await page.goto(`${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.screenshot({ path: "docs/features/evidence/teacher-marketplace-visual-recovery/after/browse/1440-en-light.png", fullPage: false });
await page.goto(`${BASE_URL}/app/Tafseel-Teacher-Profile.dc.html?id=f64f6c10-d606-498f-a637-920224d44e1c`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: "docs/features/evidence/teacher-marketplace-visual-recovery/after/profile/1440-en-light.png", fullPage: false });

// Profile reviews section
await page.locator("#profile-reviews").scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
await page.screenshot({ path: "docs/features/evidence/teacher-marketplace-visual-recovery/reviews/profile-reviews-1440-ar-dark.png", fullPage: false });

await setThemeAndLang(page, "dark", "ar");
await page.goto(`${BASE_URL}/app/Tafseel-Teacher-Profile.dc.html?id=f64f6c10-d606-498f-a637-920224d44e1c`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.locator("#profile-reviews").scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
await page.screenshot({ path: "docs/features/evidence/teacher-marketplace-visual-recovery/reviews/profile-reviews-scroll.png", fullPage: false });

await page.screenshot({ path: "docs/features/evidence/teacher-marketplace-visual-recovery/after/browse/1440-ar-dark.png", fullPage: false });
await page.goto(`${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.screenshot({ path: "docs/features/evidence/teacher-marketplace-visual-recovery/after/browse/1440-ar-dark.png", fullPage: false });
await page.goto(`${BASE_URL}/app/Tafseel-Teacher-Profile.dc.html?id=f64f6c10-d606-498f-a637-920224d44e1c`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.screenshot({ path: "docs/features/evidence/teacher-marketplace-visual-recovery/after/profile/1440-ar-dark.png", fullPage: false });

await browser.close();
console.log("STATIC_GATE_SHOTS_DONE");
