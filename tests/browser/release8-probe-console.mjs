import { chromium } from "@playwright/test";
import { loginAs, setThemeAndLang, BASE_URL } from "./lib/auth.mjs";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
const page = await loginAs(ctx, "Student");
const cons = [];
const pe = [];
const failed = [];
page.on("console", m => { if (m.type() === "error") cons.push(m.text()); });
page.on("pageerror", e => pe.push(String(e)));
page.on("response", res => {
  if (res.url().startsWith(BASE_URL) && res.status() >= 400)
    failed.push(`${res.status()} ${res.url()}`);
});
await setThemeAndLang(page, "light", "ar");
await page.goto(`${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html`, { waitUntil: "networkidle", timeout: 30000 });
await new Promise(r => setTimeout(r, 1500));
console.log("CONSOLE", JSON.stringify(cons, null, 2));
console.log("PAGEERROR", JSON.stringify(pe, null, 2));
console.log("FAILED", JSON.stringify(failed, null, 2));
await browser.close();
