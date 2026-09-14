import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE_URL, setThemeAndLang } from "./lib/auth.mjs";

const mode = process.argv[2] || "smoke";
const teacherId = process.argv[3] || "f64f6c10-d606-498f-a637-920224d44e1c";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: false });
  console.log("shot", file);
}

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONERROR", m.text());
});

if (mode === "smoke") {
  await page.setViewportSize({ width: 1440, height: 900 });
  const browse = `${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`;
  const profile = `${BASE_URL}/app/Tafseel-Teacher-Profile.dc.html?id=${encodeURIComponent(teacherId)}`;
  await page.goto(browse, { waitUntil: "networkidle", timeout: 60000 });
  await setThemeAndLang(page, "dark", "ar");
  await page.goto(browse, { waitUntil: "networkidle", timeout: 60000 });
  await wait(1500);
  const browseInfo = await page.evaluate(() => ({
    cards: document.querySelectorAll(".tf-result-card").length,
    dateBg: getComputedStyle(document.querySelector("#f-available-on") || document.body).backgroundColor,
    h1: document.querySelector("h1")?.textContent,
    titleSize: document.querySelector("h1") ? getComputedStyle(document.querySelector("h1")).fontSize : null,
    layout: getComputedStyle(document.querySelector(".tf-browse-market-layout") || document.body).gridTemplateColumns,
  }));
  console.log("BROWSE", JSON.stringify(browseInfo, null, 2));
  await shot(page, "docs/features/evidence/teacher-marketplace-visual-recovery/after/browse/smoke-1440-ar-dark.png");

  await page.goto(profile, { waitUntil: "networkidle", timeout: 60000 });
  await setThemeAndLang(page, "dark", "ar");
  await page.goto(profile, { waitUntil: "networkidle", timeout: 60000 });
  await wait(2000);
  const profileInfo = await page.evaluate(() => ({
    title: document.title,
    ready: !!document.querySelector(".tf-profile-marketplace-layout"),
    video: !!document.querySelector("video"),
    conversion: !!document.querySelector(".tf-profile-conversion-card"),
    bodyText: (document.body.innerText || "").slice(0, 240),
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  console.log("PROFILE", JSON.stringify(profileInfo, null, 2));
  await shot(page, "docs/features/evidence/teacher-marketplace-visual-recovery/after/profile/smoke-1440-ar-dark.png");
} else if (mode === "before" || mode === "after" || mode === "matrix") {
  const OUT = `docs/features/evidence/teacher-marketplace-visual-recovery/${mode === "matrix" ? "after" : mode}`;
  const cells = [
    [1440, 900, "ar", "dark"],
    [1440, 900, "en", "light"],
    [1280, 800, "ar", "light"],
    [1024, 768, "en", "dark"],
    [768, 900, "ar", "dark"],
    [390, 844, "ar", "light"],
    [375, 812, "en", "dark"],
  ];
  for (const [w, h, lang, theme] of cells) {
    await page.setViewportSize({ width: w, height: h });
    const url = `${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await setThemeAndLang(page, theme, lang);
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await wait(2200);
    await shot(page, path.join(OUT, "browse", `${w}-${lang}-${theme}.png`));
    await wait(2000);
  }
  for (const [w, h, lang, theme] of cells) {
    await page.setViewportSize({ width: w, height: h });
    const url = `${BASE_URL}/app/Tafseel-Teacher-Profile.dc.html?id=${encodeURIComponent(teacherId)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await setThemeAndLang(page, theme, lang);
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await wait(2400);
    await shot(page, path.join(OUT, "profile", `${w}-${lang}-${theme}.png`));
    await wait(2000);
  }
  console.log("MATRIX_DONE", mode);
}

await browser.close();
