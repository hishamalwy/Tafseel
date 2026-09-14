/**
 * Targeted visual evidence for FINAL PRODUCT CONVERGENCE.
 * Browse + Profile across key widths/modes; currency glyph probe.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setThemeAndLang, BASE_URL } from "./lib/auth.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2]
  || path.join("docs", "features", "evidence", "final-product-convergence");
const shots = path.join(OUT, "marketplace");
fs.mkdirSync(path.join(shots, "browse"), { recursive: true });
fs.mkdirSync(path.join(shots, "profile"), { recursive: true });
fs.mkdirSync(path.join(shots, "currency"), { recursive: true });

const wait = ms => new Promise(r => setTimeout(r, ms));

async function shot(page, dir, name) {
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("shot", file);
}

async function openBrowse(page, width, height, lang, theme) {
  await page.setViewportSize({ width, height });
  await page.goto(`${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await setThemeAndLang(page, theme, lang);
  await page.goto(`${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForFunction(() => window.Tafseel && window.Tafseel.moneyParts, null, { timeout: 15000 }).catch(() => {});
  await wait(800);
}

async function openFirstProfile(page) {
  const href = await page.evaluate(() => {
    const a = document.querySelector(".tf-result-name, .tf-marketplace-results a[href*='Teacher-Profile']");
    return a ? a.getAttribute("href") : null;
  });
  if (!href) return false;
  await page.goto(new URL(href, `${BASE_URL}/app/`).toString(), { waitUntil: "networkidle", timeout: 45000 });
  await wait(700);
  return true;
}

async function currencyProbe(page, outFile, theme, lang) {
  await page.goto(`${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, { waitUntil: "networkidle", timeout: 45000 });
  await setThemeAndLang(page, theme, lang);
  await page.waitForFunction(() => window.Tafseel && window.Tafseel.moneyHtml, null, { timeout: 15000 });
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "tf-riyal-probe";
    host.style.cssText = "position:fixed;inset:0;z-index:9999;padding:32px;background:var(--bg);color:var(--text);overflow:auto";
    const sizes = [
      ["12px", "sm"], ["16px", "md"], ["20px", "lg"], ["24px", "xl"], ["32px", "xxl"], ["40px", "xxl"]
    ];
    host.innerHTML = "<h1 style='font-size:18px;margin:0 0 16px'>Riyal mark matrix</h1>" + sizes.map(([fs, sz]) =>
      `<div style="display:flex;align-items:center;gap:14px;margin:14px 0;font-size:${fs}">` +
      `<span style="width:48px;color:var(--muted)">${fs}</span>` +
      window.Tafseel.moneyHtml(120, "SAR", { size: sz }) +
      `<span class="tf-price-line"><strong style="font-size:1em">250</strong><span class="tf-price-currency tf-price-currency--mark" title="SAR" aria-label="SAR"></span></span>` +
      `</div>`
    ).join("");
    document.body.appendChild(host);
  });
  await wait(300);
  await page.screenshot({ path: outFile });
  console.log("shot", outFile);
  await page.evaluate(() => { const el = document.getElementById("tf-riyal-probe"); if (el) el.remove(); });
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const cells = [
    [1440, 900, "en", "light"],
    [1440, 900, "ar", "dark"],
    [1280, 800, "en", "dark"],
    [1024, 768, "ar", "light"],
    [768, 1024, "en", "light"],
    [390, 844, "ar", "light"],
    [375, 812, "en", "dark"]
  ];

  for (const [w, h, lang, theme] of cells) {
    const key = `${w}-${lang}-${theme}`;
    await openBrowse(page, w, h, lang, theme);
    await shot(page, path.join(shots, "browse"), key);
    const ok = await openFirstProfile(page);
    if (ok) await shot(page, path.join(shots, "profile"), key);
  }

  await currencyProbe(page, path.join(shots, "currency", "riyal-sizes-en-light.png"), "light", "en");
  await currencyProbe(page, path.join(shots, "currency", "riyal-sizes-ar-dark.png"), "dark", "ar");

  // Glyph sanity: no literal ?? near price currency marks on browse
  await openBrowse(page, 1440, 900, "en", "light");
  const glyphCheck = await page.evaluate(() => {
    const text = document.body.innerText || "";
    const marks = document.querySelectorAll(".tf-price-currency--mark").length;
    const currencySymbols = document.querySelectorAll(".tf-price-currency").length;
    return {
      marks,
      currencySymbols,
      hasDoubleQuestion: /\?\?/.test(text),
      samplePrice: (document.querySelector(".tf-price-line") || {}).textContent || ""
    };
  });
  fs.writeFileSync(path.join(OUT, "glyph-check.json"), JSON.stringify(glyphCheck, null, 2));
  console.log("glyph-check", glyphCheck);

  await browser.close();
  console.log("FINAL_PRODUCT_CONVERGENCE_SHOTS_DONE");
}

main().catch(err => { console.error(err); process.exit(1); });
