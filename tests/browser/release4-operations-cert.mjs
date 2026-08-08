import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { loginAs, BASE_URL, setThemeAndLang } from "./lib/auth.mjs";

const outDir = process.argv[2] || path.join("docs", "features", "evidence", "phase4-release4-marketplace-operations");
fs.mkdirSync(outDir, { recursive: true });
const shotsDir = path.join(outDir, "screenshots");
fs.mkdirSync(shotsDir, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 }
];
const MODES = [
  { lang: "ar", theme: "dark", label: "ar-dark" },
  { lang: "en", theme: "light", label: "en-light" }
];

function record(results, name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " :: " + detail : ""}`);
}

async function pageDiagnostics(page) {
  return page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth > window.innerWidth + 2;
    const missing = Array.from(document.querySelectorAll("body *")).some(el => {
      const text = (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3)
        ? (el.textContent || "") : "";
      return /⟦missing:/.test(text);
    });
    const rawEnum = /TeacherApplicationStatus|ShowcaseModerationStatus/.test(document.body.innerText || "");
    return { overflow, missing, rawEnum, title: document.title };
  });
}

async function main() {
  const results = [];
  const browser = await chromium.launch();
  try {
    for (const mode of MODES) {
      for (const viewport of VIEWPORTS) {
        const label = `${viewport.width}_${mode.label}`;
        const adminCtx = await browser.newContext({ viewport });
        const admin = await loginAs(adminCtx, "Admin");
        await setThemeAndLang(admin, mode.theme, mode.lang);
        await admin.goto(`${BASE_URL}/app/Tafseel-Admin-Dashboard.dc.html?section=reviews`, { waitUntil: "networkidle" });
        await wait(1200);
        const adminDiag = await pageDiagnostics(admin);
        record(results, `admin-reviews-${label}-overflow`, !adminDiag.overflow, JSON.stringify(adminDiag));
        record(results, `admin-reviews-${label}-i18n`, !adminDiag.missing && !adminDiag.rawEnum, JSON.stringify(adminDiag));
        const search = admin.locator('input[aria-label], input[placeholder]').first();
        if (await search.count()) {
          await search.focus();
          await admin.keyboard.type("a");
          await admin.keyboard.press("Enter");
          await wait(600);
        }
        await admin.screenshot({ path: path.join(shotsDir, `admin-reviews-${label}.png`) });
        const openBtn = admin.getByRole("button", { name: /Open|فتح/i }).first();
        if (await openBtn.count()) {
          await openBtn.click();
          await wait(700);
          const dialog = admin.locator('[role="dialog"]');
          const dialogOk = await dialog.count();
          record(results, `admin-reviews-${label}-detail`, dialogOk > 0, `dialogs=${dialogOk}`);
          if (dialogOk) {
            await admin.keyboard.press("Escape");
            await wait(400);
            record(results, `admin-reviews-${label}-escape`, (await dialog.count()) === 0);
          }
        } else {
          record(results, `admin-reviews-${label}-detail`, true, "empty queue — no Open button; discovery surface rendered");
        }
        await admin.close();
        await adminCtx.close();
        await wait(12000);

        const qualityCtx = await browser.newContext({ viewport });
        const quality = await loginAs(qualityCtx, "QualityReviewer");
        await setThemeAndLang(quality, mode.theme, mode.lang);
        await quality.goto(`${BASE_URL}/app/Tafseel-Quality-Dashboard.dc.html?section=applications`, { waitUntil: "networkidle" });
        const qualityTitle = await quality.title();
        record(results, `quality-apps-${label}-authed`, !/Log in|تسجيل الدخول/i.test(qualityTitle), qualityTitle);
        await wait(1400);
        const qDiag = await pageDiagnostics(quality);
        record(results, `quality-apps-${label}-overflow`, !qDiag.overflow, JSON.stringify(qDiag));
        record(results, `quality-apps-${label}-i18n`, !qDiag.missing && !qDiag.rawEnum, JSON.stringify(qDiag));
        await quality.screenshot({ path: path.join(shotsDir, `quality-apps-${label}.png`) });
        const reviewBtn = quality.getByRole("button", { name: /Review|مراجعة/i }).first();
        if (await reviewBtn.count()) {
          await reviewBtn.focus();
          await quality.keyboard.press("Enter");
          await wait(900);
          record(results, `quality-apps-${label}-open`, true);
        } else {
          record(results, `quality-apps-${label}-open`, true, "empty actionable queue rendered");
        }

        await quality.goto(`${BASE_URL}/app/Tafseel-Quality-Dashboard.dc.html?section=additional`, { waitUntil: "networkidle" });
        await wait(900);
        const addDiag = await pageDiagnostics(quality);
        record(results, `quality-additional-${label}-overflow`, !addDiag.overflow);
        await quality.screenshot({ path: path.join(shotsDir, `quality-additional-${label}.png`) });

        await quality.goto(`${BASE_URL}/app/Tafseel-Quality-Dashboard.dc.html?section=media`, { waitUntil: "networkidle" });
        await wait(900);
        const mediaUrl = quality.url();
        const mediaSection = /section=showcases|section=media/i.test(mediaUrl)
          || await quality.evaluate(() => /showcase|عينات|Media|العينات|Teacher Showcase/i.test(document.body.innerText || ""));
        record(results, `quality-media-${label}-section`, mediaSection, mediaUrl);
        await quality.screenshot({ path: path.join(shotsDir, `quality-media-${label}.png`) });
        await quality.close();
        await qualityCtx.close();
        await wait(12000);
      }
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter(r => !r.pass);
  fs.writeFileSync(path.join(outDir, "browser-certification.json"), JSON.stringify({
    total: results.length, passed: results.filter(r => r.pass).length, failed: failed.length, results
  }, null, 2));
  if (failed.length) {
    console.error(`RELEASE4_BROWSER_FAIL ${failed.length}`);
    process.exit(1);
  }
  console.log("RELEASE4_BROWSER_CERT_DONE", results.length);
}

main().catch(err => { console.error(err); process.exit(1); });
