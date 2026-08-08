import { chromium } from "@playwright/test";
import { loginAs, BASE_URL } from "./lib/auth.mjs";

const orderId = process.argv[2];
const wait = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await loginAs(ctx, "Student");
  await page.setViewportSize({ width: 1280, height: 800 });

  let totalLeaks = 0;
  for (let i = 1; i <= 5; i++) {
    await wait(7000);
    await page.goto(`${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html?orderId=${orderId}&focus=rate`, { waitUntil: "networkidle" });
    await wait(400);
    const check = await page.evaluate(() => {
      const leaks = performance.getEntriesByType("resource").filter(r => r.name.includes("%7B%7B") || r.name.includes("{{")).length;
      const isRateModal = /rate your teacher/i.test(document.querySelector('[role="dialog"] h2')?.textContent || "");
      return { leaks, isRateModal };
    });
    totalLeaks += check.leaks;
    console.log(`cycle ${i}: leaks=${check.leaks} isRateModal=${check.isRateModal}`);
  }

  await ctx.close();
  await browser.close();
  console.log(`RATE_F013_DONE totalLeaks=${totalLeaks}`);
}
main().catch(err => { console.error(err); process.exit(1); });
