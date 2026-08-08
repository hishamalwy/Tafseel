import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { loginAs, BASE_URL } from "./lib/auth.mjs";

const outDir = process.argv[2];
const shotsDir = path.join(outDir, "screenshots");
fs.mkdirSync(shotsDir, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const report = {};

async function certifyModal(page, label) {
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
  if (!before.present) { report[label] = { present: false }; console.log(label, "not present"); return; }
  await page.keyboard.press("Tab");
  const afterTab = await page.evaluate(() => document.activeElement.tagName);
  await page.keyboard.press("Escape");
  await wait(400);
  const closedOnEscape = await page.evaluate(() => !document.querySelector('[role="dialog"]'));
  const bodyScrollRestored = await page.evaluate(() => getComputedStyle(document.body).overflow !== "hidden");
  report[label] = { ...before, afterTab, closedOnEscape, bodyScrollRestored };
  console.log(label, JSON.stringify(report[label]));
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await loginAs(ctx, "Teacher");
  await page.setViewportSize({ width: 1280, height: 800 });

  // Accept Request modal
  await page.goto(`${BASE_URL}/app/Tafseel-Teacher-Dashboard.dc.html`, { waitUntil: "networkidle" });
  await wait(500);
  const acceptOpened = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(b => /^accept$/i.test((b.textContent || "").trim()));
    if (btn) { btn.click(); return true; }
    return false;
  });
  console.log("accept opened:", acceptOpened);
  if (acceptOpened) {
    await page.screenshot({ path: path.join(shotsDir, "accept-request-modal-1280x800.png") });
    await certifyModal(page, "accept-request");
  } else {
    report["accept-request"] = { present: false, note: "no accept button found" };
  }

  // Delivery Upload modal
  await wait(2000);
  await page.goto(`${BASE_URL}/app/Tafseel-Teacher-Dashboard.dc.html`, { waitUntil: "networkidle" });
  await wait(500);
  const deliveryOpened = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(b => /upload delivery/i.test(b.textContent || ""));
    if (btn) { btn.click(); return true; }
    return false;
  });
  console.log("delivery opened:", deliveryOpened);
  if (deliveryOpened) {
    await page.screenshot({ path: path.join(shotsDir, "delivery-upload-modal-1280x800.png") });
    await certifyModal(page, "delivery-upload");
  } else {
    report["delivery-upload"] = { present: false, note: "no upload delivery button found" };
  }

  await ctx.close();
  await browser.close();
  fs.writeFileSync(path.join(outDir, "teacher-modal-report.json"), JSON.stringify(report, null, 2));
  console.log("TEACHER_MODAL_CERT_DONE");
}
main().catch(err => { console.error(err); process.exit(1); });
