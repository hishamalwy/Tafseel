import { chromium } from "@playwright/test";
import { loginAs } from "./lib/auth.mjs";
import { SURFACES, fullUrl, DELIVERED_ORDER_ID } from "./lib/surfaces.mjs";

const wait = ms => new Promise(r => setTimeout(r, ms));
const url = (id, extra = "") => fullUrl(SURFACES.find(s => s.id === id)) + extra;

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const stu = await loginAs(ctx, "Student");

  const review = [];
  for (let i = 1; i <= 5; i++) {
    await wait(7000);
    await stu.goto(url("review-modal"), { waitUntil: "networkidle" });
    await wait(300);
    const leaks = await stu.evaluate(() => performance.getEntriesByType("resource").filter(r => r.name.includes("%7B%7B") || r.name.includes("{{")).length);
    review.push({ cycle: i, leaks });
    console.log(`review cycle ${i}: leaks=${leaks}`);
  }

  const rate = [];
  for (let i = 1; i <= 3; i++) {
    await wait(7000);
    await stu.goto(url("rate-modal"), { waitUntil: "networkidle" });
    await wait(300);
    const leaks = await stu.evaluate(() => performance.getEntriesByType("resource").filter(r => r.name.includes("%7B%7B") || r.name.includes("{{")).length);
    rate.push({ cycle: i, leaks });
    console.log(`rate cycle ${i}: leaks=${leaks}`);
  }

  await ctx.close();
  await browser.close();
  const totalLeaks = review.reduce((a, c) => a + c.leaks, 0) + rate.reduce((a, c) => a + c.leaks, 0);
  console.log(`F013_TARGETED_DONE totalLeaks=${totalLeaks}`);
}
main().catch(err => { console.error(err); process.exit(1); });
