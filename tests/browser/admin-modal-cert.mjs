import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { loginAs, BASE_URL } from "./lib/auth.mjs";

const outDir = process.argv[2];
const shotsDir = path.join(outDir, "screenshots");
fs.mkdirSync(shotsDir, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await loginAs(ctx, "Admin");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE_URL}/app/Tafseel-Admin-Dashboard.dc.html`, { waitUntil: "networkidle" });
  await wait(500);
  await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll("button")).find(b => /Services/.test(b.textContent || ""));
    if (nav) nav.click();
  });
  await wait(600);
  const opened = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(b => /Add service|^Edit$/.test((b.textContent || "").trim()));
    if (btn) { btn.click(); return btn.textContent; }
    return null;
  });
  console.log("opened via:", opened);
  await wait(500);
  const before = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return { present: false };
    return {
      present: true, role: d.getAttribute("role"), ariaModal: d.getAttribute("aria-modal"),
      accessibleName: d.getAttribute("aria-label") || d.getAttribute("aria-labelledby"),
      focusInside: d.contains(document.activeElement), activeTag: document.activeElement.tagName
    };
  });
  console.log("before:", JSON.stringify(before));
  if (before.present) {
    await page.screenshot({ path: path.join(shotsDir, "admin-catalog-modal-1280x800.png") });
    await page.keyboard.press("Escape");
    await wait(400);
    const closedOnEscape = await page.evaluate(() => !document.querySelector('[role="dialog"]'));
    const bodyScrollRestored = await page.evaluate(() => getComputedStyle(document.body).overflow !== "hidden");
    console.log("closedOnEscape:", closedOnEscape, "bodyScrollRestored:", bodyScrollRestored);
    fs.writeFileSync(path.join(outDir, "admin-catalog-report.json"), JSON.stringify({ ...before, closedOnEscape, bodyScrollRestored }, null, 2));
  } else {
    fs.writeFileSync(path.join(outDir, "admin-catalog-report.json"), JSON.stringify({ present: false, note: "no add/edit action found" }, null, 2));
  }
  await ctx.close();
  await browser.close();
  console.log("ADMIN_MODAL_CERT_DONE");
}
main().catch(err => { console.error(err); process.exit(1); });
