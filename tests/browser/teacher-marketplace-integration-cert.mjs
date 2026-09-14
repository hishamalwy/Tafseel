import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE_URL, setThemeAndLang } from "./lib/auth.mjs";

const cells = [
  { width: 1440, height: 1000, lang: "en", theme: "light" },
  { width: 1024, height: 900, lang: "ar", theme: "dark" },
  { width: 768, height: 1024, lang: "en", theme: "dark" },
  { width: 390, height: 844, lang: "ar", theme: "light" },
];
const output = path.resolve("docs/features/evidence/teacher-marketplace-design-lab/integration/audit.json");
const findings = [];
const results = [];
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

page.on("pageerror", (error) => findings.push({ page: "runtime", type: "pageerror", detail: error.message }));

function check(condition, finding) {
  if (!condition) findings.push(finding);
}

async function load(url, theme, lang) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await setThemeAndLang(page, theme, lang);
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
}

const response = await fetch(`${BASE_URL}/api/v1/teachers?page=1&pageSize=1`);
if (!response.ok) throw new Error(`Teacher discovery returned HTTP ${response.status}`);
const teacherId = (await response.json()).items?.[0]?.teacherId;
if (!teacherId) throw new Error("No public teacher is available for the profile certificate.");

for (const cell of cells) {
  const label = `${cell.width}-${cell.lang}-${cell.theme}`;
  await page.setViewportSize({ width: cell.width, height: cell.height });

  await load(`${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, cell.theme, cell.lang);
  await page.waitForSelector(".tf-mkb-card", { timeout: 20000 });
  const browse = await page.evaluate(() => {
    const date = document.querySelector(".tf-mkb-filters .tf-mk-date");
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      cards: document.querySelectorAll(".tf-mkb-card").length,
      columns: getComputedStyle(document.querySelector(".tf-mkb-grid")).gridTemplateColumns,
      dateVisible: !!date && getComputedStyle(date).display !== "none" && date.getBoundingClientRect().width > 0,
      dateWidth: date?.getBoundingClientRect().width || 0,
      direction: document.documentElement.dir,
      missingTranslations: [...document.querySelectorAll("[data-i18n]")]
        .filter((node) => /^\[.+\]$/.test(node.textContent.trim())).length,
    };
  });
  check(browse.scrollWidth <= browse.clientWidth + 1, { page: "browse", cell: label, type: "horizontal-overflow", detail: `${browse.scrollWidth} > ${browse.clientWidth}` });
  check(browse.cards > 0, { page: "browse", cell: label, type: "missing-cards" });
  check(browse.missingTranslations === 0, { page: "browse", cell: label, type: "missing-translations", detail: browse.missingTranslations });
  check(browse.direction === (cell.lang === "ar" ? "rtl" : "ltr"), { page: "browse", cell: label, type: "direction", detail: browse.direction });
  if (cell.width > 860 && browse.dateVisible)
    check(browse.dateWidth <= 180, { page: "browse", cell: label, type: "date-filter-width", detail: browse.dateWidth });
  if (cell.width <= 720) {
    const sheetButton = page.locator(".tf-mkb-sheet-btn");
    await sheetButton.click();
    check(await page.locator(".tf-mkb-sheet.is-open").isVisible(), { page: "browse", cell: label, type: "mobile-filter-sheet" });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
      { page: "browse", cell: label, type: "sheet-overflow" });
    await page.keyboard.press("Escape");
  }
  results.push({ page: "browse", cell: label, ...browse });

  await load(`${BASE_URL}/app/Tafseel-Teacher-Profile.dc.html?id=${encodeURIComponent(teacherId)}`, cell.theme, cell.lang);
  await page.waitForSelector(".tf-mkp-stage", { timeout: 20000 });
  await page.waitForSelector(".tf-mkp-svc", { timeout: 20000 });
  const profile = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    stage: !!document.querySelector(".tf-mkp-stage"),
    shelf: !!document.querySelector(".tf-mkp-shelf"),
    services: document.querySelectorAll(".tf-mkp-svc").length,
    reviews: document.querySelectorAll(".tf-mkp-rev").length,
    direction: document.documentElement.dir,
    mobileCtaDisplay: getComputedStyle(document.querySelector(".tf-mkp-mcta")).display,
    mobileCtaInitiallyOn: document.querySelector(".tf-mkp-mcta")?.classList.contains("is-on") || false,
    missingTranslations: [...document.querySelectorAll("[data-i18n]")]
      .filter((node) => /^\[.+\]$/.test(node.textContent.trim())).length,
  }));
  check(profile.scrollWidth <= profile.clientWidth + 1, { page: "profile", cell: label, type: "horizontal-overflow", detail: `${profile.scrollWidth} > ${profile.clientWidth}` });
  check(profile.stage && profile.shelf && profile.services > 0, { page: "profile", cell: label, type: "missing-composition" });
  check(profile.missingTranslations === 0, { page: "profile", cell: label, type: "missing-translations", detail: profile.missingTranslations });
  check(profile.direction === (cell.lang === "ar" ? "rtl" : "ltr"), { page: "profile", cell: label, type: "direction", detail: profile.direction });

  if (cell.width <= 640) {
    check(!profile.mobileCtaInitiallyOn, { page: "profile", cell: label, type: "mobile-cta-first-paint" });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(700);
    const mobileCtaAfterScroll = await page.evaluate(() => {
      const node = document.querySelector(".tf-mkp-mcta");
      const shelf = document.querySelector(".tf-mkp-shelfwrap");
      return {
        on: node?.classList.contains("is-on") || false,
        visible: !!node && getComputedStyle(node).visibility === "visible",
        shelfBottom: shelf?.getBoundingClientRect().bottom ?? null,
        scrollY,
      };
    });
    check(mobileCtaAfterScroll.on && mobileCtaAfterScroll.visible,
      { page: "profile", cell: label, type: "mobile-cta-after-scroll", detail: mobileCtaAfterScroll });
  }

  if (cell.width === 1440) {
    const alternative = page.locator('.tf-mkp-svc button[aria-pressed="false"]:not([disabled])').first();
    if (await alternative.count()) {
      const alternativeName = await alternative.locator("xpath=ancestor::article[1]//h3").textContent();
      await alternative.click();
      await page.waitForTimeout(100);
      const selectedName = await page.locator(".tf-mkp-svc.is-selected h3").textContent();
      check(selectedName?.trim() === alternativeName?.trim(), { page: "profile", cell: label, type: "service-selection" });
    }
  }
  results.push({ page: "profile", cell: label, ...profile });
}

await browser.close();
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl: BASE_URL, results, findings }, null, 2));

if (findings.length) {
  console.error(JSON.stringify(findings, null, 2));
  process.exitCode = 1;
} else {
  console.log(`Teacher marketplace integration certificate passed (${results.length} page/viewport cells).`);
  console.log(output);
}
