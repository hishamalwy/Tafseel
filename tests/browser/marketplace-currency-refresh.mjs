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
fs.mkdirSync("docs/features/evidence/teacher-marketplace-visual-recovery/currency", { recursive: true });
const price = page.locator(".tf-result-card .tf-price-line").first();
await price.screenshot({ path: "docs/features/evidence/teacher-marketplace-visual-recovery/currency/browse-price-ar-dark.png" });
const info = await price.evaluate((el) => {
  const mark = el.querySelector(".tf-riyal-mark, .tf-price-currency--mark, .tf-mk-riyal");
  const box = mark ? mark.getBoundingClientRect() : null;
  const before = mark ? getComputedStyle(mark, "::before").content : "";
  return {
    hasMark: !!mark,
    before,
    fontOk: document.documentElement.classList.contains("tf-riyal-font-ok"),
    markW: box && box.width,
    markH: box && box.height,
    html: el.innerHTML.slice(0, 280),
  };
});
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: "docs/features/evidence/teacher-marketplace-visual-recovery/after/browse/1440-ar-dark.png", fullPage: false });
await browser.close();
console.log("CURRENCY_REFRESH_OK");
