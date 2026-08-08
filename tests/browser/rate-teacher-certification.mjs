import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { loginAs, BASE_URL } from "./lib/auth.mjs";

const orderId = process.argv[2];
const outDir = process.argv[3];
if (!orderId || !outDir) throw new Error("usage: node rate-teacher-certification.mjs <orderId> <outDir>");
const shotsDir = path.join(outDir, "screenshots");
fs.mkdirSync(shotsDir, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const report = {};

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await loginAs(ctx, "Student");
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto(`${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html?orderId=${orderId}&focus=rate`, { waitUntil: "networkidle" });
  await wait(500);

  // Identify which surface actually mounted
  const identify = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return { dialogPresent: false };
    const title = d.querySelector("h2")?.textContent || "";
    const hasStars = !!d.querySelector('[class*="star"], [aria-label*="star" i], [role="radiogroup"], input[type="range"]');
    const starButtons = Array.from(d.querySelectorAll("button")).filter(b => /★|star/i.test(b.textContent || b.getAttribute("aria-label") || "")).length;
    const hasCommentField = !!d.querySelector("textarea");
    const hasRecommendControl = !!Array.from(d.querySelectorAll("button,input[type=checkbox],input[type=radio]")).find(el => /recommend/i.test(el.textContent || el.getAttribute("aria-label") || ""));
    return {
      dialogPresent: true, title, hasStars, starButtons, hasCommentField, hasRecommendControl,
      isTimelineModal: /timeline/i.test(title),
      isRateModal: /rate|rating/i.test(title) || hasStars || starButtons > 0
    };
  });
  report.surfaceIdentification = identify;
  console.log("Surface identification:", JSON.stringify(identify, null, 2));

  await page.screenshot({ path: path.join(shotsDir, "real-rate-teacher-modal-1280x800-en-light.png") });

  // Data checks
  const dataCheck = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const text = d ? d.innerText : "";
    return {
      hasGuid: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text),
      hasUndefined: /\bundefined\b/.test(text),
      hasTemplateLeak: /\{\{[^}]{0,80}\}\}/.test(text),
      teacherAvatarPresent: !!d.querySelector('img[alt=""], img[class*="avatar"]'),
      fullText: text.slice(0, 500)
    };
  });
  report.dataCheck = dataCheck;
  console.log("Data check:", JSON.stringify(dataCheck, null, 2));

  // Modal accessibility
  const a11y = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    return {
      role: d.getAttribute("role"), ariaModal: d.getAttribute("aria-modal"),
      accessibleName: d.getAttribute("aria-label") || d.getAttribute("aria-labelledby"),
      focusInside: d.contains(document.activeElement), activeTag: document.activeElement.tagName
    };
  });
  await page.keyboard.press("Tab");
  const afterTab = await page.evaluate(() => document.activeElement.tagName);
  await page.keyboard.press("Escape");
  await wait(300);
  const closedOnEscape = await page.evaluate(() => !document.querySelector('[role="dialog"]'));
  report.accessibility = { ...a11y, afterTab, closedOnEscape };
  console.log("Accessibility:", JSON.stringify(report.accessibility, null, 2));

  // Reopen and check for stale state / duplicate overlays
  await wait(500);
  await page.goto(`${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html?orderId=${orderId}&focus=rate`, { waitUntil: "networkidle" });
  await wait(500);
  const reopenCheck = await page.evaluate(() => ({
    dialogCount: document.querySelectorAll('[role="dialog"]').length,
    freshFocusInside: document.querySelector('[role="dialog"]')?.contains(document.activeElement)
  }));
  report.reopenCheck = reopenCheck;
  console.log("Reopen check:", JSON.stringify(reopenCheck));

  await ctx.close();
  await browser.close();
  fs.writeFileSync(path.join(outDir, "real-rate-teacher-report.json"), JSON.stringify(report, null, 2));
  console.log("RATE_CERT_DONE");
}
main().catch(err => { console.error(err); process.exit(1); });
