import { chromium } from "@playwright/test";
import { loginAs, setThemeAndLang, BASE_URL } from "./lib/auth.mjs";
import { SURFACES, fullUrl } from "./lib/surfaces.mjs";

async function main() {
  const browser = await chromium.launch();

  // public
  const pubCtx = await browser.newContext();
  const pubPage = await pubCtx.newPage();
  await pubPage.goto(fullUrl(SURFACES.find(s => s.id === "landing")), { waitUntil: "domcontentloaded" });
  await setThemeAndLang(pubPage, "dark", "ar");
  await pubPage.reload({ waitUntil: "networkidle" });
  console.log("landing title:", await pubPage.title());
  console.log("landing dir:", await pubPage.evaluate(() => document.documentElement.getAttribute("dir")));
  await pubCtx.close();

  // student login + review modal
  const stuCtx = await browser.newContext();
  const stuPage = await loginAs(stuCtx, "Student");
  console.log("student logged in, url:", stuPage.url());
  await stuPage.goto(fullUrl(SURFACES.find(s => s.id === "review-modal")), { waitUntil: "domcontentloaded" });
  await setThemeAndLang(stuPage, "light", "en");
  await stuPage.reload({ waitUntil: "networkidle" });
  await stuPage.waitForTimeout(300);
  console.log("review modal present:", await stuPage.evaluate(() => !!document.querySelector('[role="dialog"]')));
  await stuCtx.close();

  // admin login
  const adminCtx = await browser.newContext();
  const adminPage = await loginAs(adminCtx, "Admin");
  console.log("admin logged in, url:", adminPage.url());
  await adminCtx.close();

  await browser.close();
}

main().catch(err => { console.error("SMOKE_FAIL", err); process.exit(1); });
