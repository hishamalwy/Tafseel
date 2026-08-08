import { chromium } from "@playwright/test";
import { loginAs } from "./lib/auth.mjs";
import { BASE_URL } from "./lib/auth.mjs";

const orderId = process.argv[2];
if (!orderId) throw new Error("usage: node fixture-payment.mjs <orderId>");

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await loginAs(ctx, "Student");
  await page.goto(`${BASE_URL}/app/Tafseel-Payment.dc.html?orderId=${orderId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const clicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(b => /pay securely|pay now|checkout/i.test(b.textContent || ""));
    if (btn) { btn.click(); return true; }
    return false;
  });
  console.log("clicked pay button:", clicked);
  await page.waitForTimeout(1500);
  // Now on Mock Checkout page
  const confirmClicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(b => /simulate successful payment/i.test(b.textContent || ""));
    if (btn) { btn.click(); return true; }
    return false;
  });
  console.log("clicked simulate payment:", confirmClicked);
  await page.waitForTimeout(2000);
  const finalUrl = page.url();
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log("final url:", finalUrl);
  console.log("body preview:", bodyText);
  await ctx.close();
  await browser.close();
  console.log("FIXTURE_PAYMENT_DONE");
}
main().catch(err => { console.error(err); process.exit(1); });
