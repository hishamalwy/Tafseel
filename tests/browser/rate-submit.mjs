import { chromium } from "@playwright/test";
import { loginAs, BASE_URL } from "./lib/auth.mjs";

const orderId = process.argv[2];
const wait = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await loginAs(ctx, "Student");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html?orderId=${orderId}&focus=rate`, { waitUntil: "networkidle" });
  await wait(500);

  await page.fill('textarea', "Final Acceptance Gate legitimate UAT review: clear explanation, well organized, delivered on time. Automated certification pass.");
  const responses = [];
  page.on("response", r => { if (r.url().includes("/reviews") || (r.url().includes(`/orders/${orderId}`) && r.request().method() !== "GET")) responses.push(`${r.request().method()} ${r.url()} -> ${r.status()}`); });

  const submitClicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => /submit|send|rate/i.test(b.textContent || "") && !/cancel|close/i.test(b.textContent || ""));
    if (btn) { btn.click(); return btn.textContent; }
    return null;
  });
  console.log("submit button clicked:", submitClicked);
  await wait(1500);
  console.log("network:", JSON.stringify(responses));

  const afterState = await page.evaluate(() => ({
    dialogStillOpen: !!document.querySelector('[role="dialog"]'),
    bodyText: document.body.innerText.slice(0, 200)
  }));
  console.log("after submit:", JSON.stringify(afterState));

  await ctx.close();
  await browser.close();
  console.log("RATE_SUBMIT_DONE");
}
main().catch(err => { console.error(err); process.exit(1); });
