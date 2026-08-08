import { chromium } from "@playwright/test";
import { SURFACES, fullUrl } from "./lib/surfaces.mjs";

const url = fullUrl(SURFACES.find(s => s.id === "browse"));
const wait = ms => new Promise(r => setTimeout(r, ms));

async function cycle(browser, viewport, lang, theme, delayMs = 10000) {
  await new Promise(r => setTimeout(r, delayMs)); // respect the real "auth" rate-limit policy (10/min)
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", m => {
    if (m.type() !== "error") return;
    if (/Failed to load resource.*(401|429)/.test(m.text())) return; // benign anon auth/refresh probe or harness-pacing rate-limit noise, not a defect in the fix under test
    consoleErrors.push(m.text());
  });
  await page.setViewportSize(viewport);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ lang, theme }) => {
    localStorage.setItem("tafseel-lang", lang);
    localStorage.setItem("tafseel-theme", theme);
  }, { lang, theme });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(700); // settle past the ~200ms React re-render window proven earlier
  const placeholder = await page.evaluate(() => document.getElementById("f-q")?.placeholder);
  await ctx.close();
  return { placeholder, consoleErrors: consoleErrors.length };
}

async function main() {
  const browser = await chromium.launch();
  const AR_EXPECTED = "اسم المعلم أو الموضوع أو كلمة مفتاحية";
  const EN_EXPECTED = "Teacher, topic or keyword";

  let arPass = 0;
  const arResults = [];
  for (let i = 1; i <= 20; i++) {
    const r = await cycle(browser, { width: 1440, height: 900 }, "ar", "light");
    const ok = r.placeholder === AR_EXPECTED && r.consoleErrors === 0;
    if (ok) arPass++;
    arResults.push({ cycle: i, ...r, ok });
    console.log(`AR cycle ${i}: ${ok ? "PASS" : "FAIL"} placeholder="${r.placeholder}" consoleErrors=${r.consoleErrors}`);
  }

  const enResult = await cycle(browser, { width: 1440, height: 900 }, "en", "light");
  console.log(`EN check: placeholder="${enResult.placeholder}" expected="${EN_EXPECTED}" -> ${enResult.placeholder === EN_EXPECTED ? "PASS" : "FAIL"}`);

  const mobileAr = await cycle(browser, { width: 375, height: 667 }, "ar", "dark");
  console.log(`AR mobile dark: placeholder="${mobileAr.placeholder}" -> ${mobileAr.placeholder === AR_EXPECTED ? "PASS" : "FAIL"}`);

  const desktopArDark = await cycle(browser, { width: 1440, height: 900 }, "ar", "dark");
  console.log(`AR desktop dark: placeholder="${desktopArDark.placeholder}" -> ${desktopArDark.placeholder === AR_EXPECTED ? "PASS" : "FAIL"}`);

  // Live EN<->AR toggle without full reload, using Tafseel.setLang
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const toggleResults = [];
  for (const targetLang of ["ar", "en", "ar"]) {
    await page.evaluate((lang) => window.Tafseel.setLang(lang), targetLang);
    await page.waitForTimeout(300);
    const ph = await page.evaluate(() => document.getElementById("f-q")?.placeholder);
    const expected = targetLang === "ar" ? AR_EXPECTED : EN_EXPECTED;
    toggleResults.push({ targetLang, placeholder: ph, ok: ph === expected });
    console.log(`live toggle -> ${targetLang}: "${ph}" -> ${ph === expected ? "PASS" : "FAIL"}`);
  }
  await ctx.close();

  await browser.close();
  console.log(`\nPH_SEARCH_CYCLES_DONE arPass=${arPass}/20`);
}
main().catch(err => { console.error(err); process.exit(1); });
