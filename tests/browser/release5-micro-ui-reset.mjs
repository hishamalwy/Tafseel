import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5090";
const OUTBOX = process.env.TAFSEEL_DEV_OUTBOX
  || path.join("src", "Tafseel.Api", "bin", "Release", "net8.0", "App_Data", "dev-outbox");
const password = process.env.TAFSEEL_UAT_SESSION_PASSWORD || process.env.TAFSEEL_UAT_STUDENT_PASSWORD;
const email = process.argv[2] || "student.sprint02.uat@example.com";
const wait = ms => new Promise(r => setTimeout(r, ms));

async function post(url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: res.status, text: await res.text() };
}

function latestHref(targetEmail) {
  const needle = targetEmail.replace(/[^a-zA-Z0-9@._-]/g, "_").toLowerCase();
  const files = fs.readdirSync(OUTBOX)
    .filter(name => name.toLowerCase().includes(needle))
    .map(name => ({ full: path.join(OUTBOX, name), m: fs.statSync(path.join(OUTBOX, name)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (!files[0]) return null;
  const html = fs.readFileSync(files[0].full, "utf8").replace(/&amp;/g, "&");
  const match = html.match(/href="(https?:\/\/[^"]+mode=reset[^"]+)"/i);
  return match ? match[1] : null;
}

async function main() {
  if (!password) throw new Error("password env missing");
  const forgot = await post("/api/v1/auth/forgot-password", { email, lang: "en" });
  console.log("forgot", forgot.status);
  if (forgot.status !== 202) throw new Error(`forgot ${forgot.status}`);
  await wait(1000);
  const href = latestHref(email);
  if (!href) throw new Error("no reset href");
  const url = href.replace("https://localhost:7272", BASE).replace("http://localhost:7272", BASE);
  if (!url.includes(BASE)) throw new Error("could not retarget reset URL");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "load", timeout: 30000 });
    await page.waitForSelector("#reset-password", { timeout: 15000 });
    await page.locator("#reset-password").click();
    await page.keyboard.type(password, { delay: 15 });
    await page.locator("#reset-confirm").click();
    await page.keyboard.type(password, { delay: 15 });
    await page.locator('form.tf-form button[type="submit"]').click({ timeout: 15000 });
    await wait(2500);
    const body = await page.evaluate(() => document.body.innerText.slice(0, 400));
    console.log("ui-reset-text", body.replace(/\s+/g, " ").slice(0, 240));
  } finally {
    await browser.close();
  }
  await wait(2000);
  const login = await post("/api/v1/auth/login", { email, password });
  console.log("login-after-ui-reset", login.status, login.text.slice(0, 160));
  if (login.status !== 200) process.exit(1);
  console.log("ui-reset-login-ok", email);
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
