import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5095";
const outDir = process.argv[2] || path.resolve(
  import.meta.dirname, "../../docs/fixes/evidence/smart-search-experience-recovery/after");
fs.mkdirSync(outDir, { recursive: true });

const mathId = "11111111-1111-4111-8111-111111111111";
const liveId = "22222222-2222-4222-8222-222222222222";
const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
};

const session = {
  accessToken: "browser-contract-token",
  userId: "33333333-3333-4333-8333-333333333333",
  fullName: "Browser Student",
  roles: ["Student"],
  hasAvatar: false
};
const subjects = [{ id: mathId, name: "Mathematics", nameEn: "Mathematics", nameAr: "الرياضيات" }];
const services = [{
  id: liveId, name: "Live session", nameEn: "Live session", nameAr: "جلسة مباشرة",
  code: "live_session", orderType: "live_session", isPublic: true, teacherSelectable: true
}];
const emptyTeachers = { items: [], totalCount: 0, page: 1, pageSize: 9 };

function discoveryResult() {
  return {
    status: "success",
    needsClarification: false,
    clarificationQuestions: [],
    filters: {
      subjectId: mathId,
      serviceCatalogItemId: liveId,
      educationLevelId: null,
      languageId: null,
      availableOn: "2026-08-13",
      maximumPrice: null
    }
  };
}

async function stubApi(page, state) {
  await page.route("**/api/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname.replace(/^.*\/api\/v1/, "");
    if (apiPath === "/auth/refresh")
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) });
    if (apiPath === "/subjects" || apiPath.startsWith("/subjects/featured"))
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(subjects) });
    if (apiPath === "/services")
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(services) });
    if (apiPath === "/languages" || apiPath === "/education-levels" || apiPath === "/favorite-teachers")
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    if (apiPath === "/teachers") {
      state.teacherQueries.push(url.search);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(emptyTeachers) });
    }
    if (apiPath === "/marketplace-intelligence/events") return route.fulfill({ status: 202, body: "" });
    if (apiPath === "/ai/discovery") {
      state.aiCalls++;
      if (state.aiMode === "delay") await new Promise(resolve => setTimeout(resolve, 2500));
      if (state.aiMode === "failure")
        return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(discoveryResult()) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

async function openBrowse(browser, { width, height, lang, theme, aiMode = "success" }) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const state = { aiCalls: 0, aiMode, teacherQueries: [] };
  await stubApi(page, state);
  await page.addInitScript(({ lang, theme }) => {
    localStorage.setItem("tafseel-lang", lang);
    localStorage.setItem("tafseel-theme", theme);
  }, { lang, theme });
  await page.goto(`${baseUrl}/app/Tafseel-Browse-Teachers.dc.html`, { waitUntil: "networkidle" });
  await page.locator("#f-q").waitFor();
  return { context, page, state };
}

const browser = await chromium.launch({ headless: true });
try {
  {
    const { context, page, state } = await openBrowse(browser,
      { width: 390, height: 844, lang: "en", theme: "light" });
    const input = page.locator("#f-q");
    await input.fill("calculus live session Thursday");
    await input.focus();
    const accessibility = await page.evaluate(() => {
      const inputNode = document.querySelector("#f-q");
      const label = document.querySelector('label[for="f-q"]');
      const form = inputNode?.closest('form[role="search"]');
      const status = document.querySelector("#discovery-status");
      const focusStyle = getComputedStyle(document.querySelector(".tf-smart-search__bar"));
      return {
        labelled: Boolean(label?.textContent.trim()),
        searchRole: Boolean(form),
        focused: document.activeElement === inputNode,
        live: status?.getAttribute("aria-live") === "polite",
        focusOutline: parseFloat(focusStyle.outlineWidth) >= 2 && focusStyle.outlineStyle !== "none"
      };
    });
    check("browse-search-accessibility", Object.values(accessibility).every(Boolean), JSON.stringify(accessibility));
    await page.waitForTimeout(350);
    check("no-ai-on-keystroke", state.aiCalls === 0, `calls=${state.aiCalls}`);
    await page.screenshot({ path: path.join(outDir, "browse-390-en-light-typed.png") });
    await page.locator("#f-subject").selectOption(mathId);
    await page.waitForTimeout(100);
    check("no-ai-on-filter-change", state.aiCalls === 0, `calls=${state.aiCalls}`);
    await context.close();
  }

  {
    const { context, page, state } = await openBrowse(browser,
      { width: 1024, height: 768, lang: "en", theme: "dark", aiMode: "delay" });
    await page.locator("#f-q").fill("calculus Thursday");
    await page.locator("#f-q").press("Enter");
    await page.locator("#discovery-status").getByText("Understanding your search…", { exact: false }).waitFor();
    check("short-en-invokes-intelligent-path", state.aiCalls === 1, `calls=${state.aiCalls}`);
    check("interpreting-button-disabled", await page.locator(".tf-smart-search__submit").isDisabled());
    await page.screenshot({ path: path.join(outDir, "browse-1024-en-dark-interpreting.png") });
    await page.locator(".tf-active-filter-row button").first().waitFor({ timeout: 10000 });
    check("loading-clears-after-success", !(await page.locator(".tf-smart-search__submit").isDisabled()));
    await context.close();
  }

  {
    const { context, page, state } = await openBrowse(browser,
      { width: 1440, height: 900, lang: "ar", theme: "dark" });
    await page.locator("#f-q").fill("رياضيات live الخميس");
    await page.locator("#f-q").press("Enter");
    await page.locator(".tf-active-filter-row button").nth(2).waitFor();
    check("short-ar-invokes-intelligent-path", state.aiCalls === 1, `calls=${state.aiCalls}`);
    const chips = await page.locator(".tf-active-filter-row button").allTextContents();
    check("subject-service-thursday-chips",
      chips.some(x => x.includes("الرياضيات")) && chips.some(x => x.includes("جلسة مباشرة"))
      && chips.some(x => x.includes("الخميس")), chips.join(" | "));
    await page.waitForFunction(() => document.querySelector(".tf-smart-search")?.getAttribute("aria-busy") === "false");
    await page.screenshot({ path: path.join(outDir, "browse-1440-ar-dark-success.png") });
    await context.close();
  }

  {
    const { context, page, state } = await openBrowse(browser,
      { width: 375, height: 812, lang: "ar", theme: "light" });
    await page.locator("#f-q").fill("هشام");
    await page.locator("#f-q").press("Enter");
    await page.waitForTimeout(200);
    check("teacher-name-remains-deterministic", state.aiCalls === 0
      && state.teacherQueries.some(query => new URLSearchParams(query).get("search") === "هشام"));
    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      buttonWidth: document.querySelector(".tf-smart-search__submit")?.getBoundingClientRect().width || 0,
      viewport: innerWidth
    }));
    check("mobile-search-no-overflow", !geometry.overflow && geometry.buttonWidth <= geometry.viewport, JSON.stringify(geometry));
    await context.close();
  }

  {
    const { context, page, state } = await openBrowse(browser,
      { width: 390, height: 844, lang: "en", theme: "light", aiMode: "failure" });
    await page.locator("#f-q").fill("calculus Thursday");
    await page.locator("#f-q").press("Enter");
    await page.getByText("regular search", { exact: false }).waitFor();
    check("fallback-keeps-search-usable", state.aiCalls === 1
      && !(await page.locator(".tf-smart-search__submit").isDisabled()));
    await page.screenshot({ path: path.join(outDir, "browse-390-en-light-fallback.png") });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const state = { aiCalls: 0, aiMode: "success", teacherQueries: [] };
    await stubApi(page, state);
    await page.addInitScript(() => {
      localStorage.setItem("tafseel-lang", "ar");
      localStorage.setItem("tafseel-theme", "light");
    });
    await page.goto(`${baseUrl}/app/Tafseel-Landing.dc.html`, { waitUntil: "networkidle" });
    await page.locator("#hero-q").fill("رياضيات live الخميس");
    await page.screenshot({ path: path.join(outDir, "landing-1440-ar-light-typed.png") });
    await page.locator("#hero-q").press("Enter");
    await page.waitForURL(/Tafseel-Browse-Teachers/);
    await page.locator(".tf-active-filter-row button").nth(2).waitFor();
    check("landing-browse-consume-once-handoff", state.aiCalls === 1
      && await page.locator(".tf-active-filter-row button").count() === 3);
    check("raw-intent-not-in-url", !decodeURIComponent(page.url()).includes("رياضيات live الخميس"), page.url());
    await page.waitForFunction(() => document.querySelector(".tf-smart-search")?.getAttribute("aria-busy") === "false");
    await page.screenshot({ path: path.join(outDir, "landing-to-browse-1440-ar-light-success.png") });
    await context.close();
  }

  {
    const widths = [375, 390, 768, 1024, 1280, 1440];
    const modes = [
      { lang: "ar", theme: "dark" },
      { lang: "ar", theme: "light" },
      { lang: "en", theme: "dark" },
      { lang: "en", theme: "light" }
    ];
    const routes = [
      { path: "Tafseel-Landing.dc.html", input: "#hero-q" },
      { path: "Tafseel-Browse-Teachers.dc.html", input: "#f-q" }
    ];
    const failures = [];
    let cells = 0;
    for (const route of routes) {
      const context = await browser.newContext({ viewport: { width: widths[0], height: 900 } });
      const page = await context.newPage();
      const state = { aiCalls: 0, aiMode: "success", teacherQueries: [] };
      await stubApi(page, state);
      await page.goto(`${baseUrl}/app/${route.path}`, { waitUntil: "networkidle" });
      await page.locator(route.input).waitFor();
      for (const mode of modes) {
        await page.evaluate(({ lang, theme }) => {
          Tafseel.setLang(lang);
          Tafseel.setTheme(theme);
        }, mode);
        for (const width of widths) {
          await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
          const geometry = await page.evaluate(() => {
            const input = document.querySelector(".tf-smart-search__input");
            const submit = document.querySelector(".tf-smart-search__submit");
            return {
              overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
              inputHeight: input?.getBoundingClientRect().height || 0,
              submitHeight: submit?.getBoundingClientRect().height || 0,
              searchInputs: document.querySelectorAll(".tf-smart-search__input").length
            };
          });
          cells++;
          if (geometry.overflow || geometry.inputHeight < 44 || geometry.submitHeight < 44 || geometry.searchInputs !== 1) {
            failures.push(`${route.path}:${mode.lang}:${mode.theme}:${width}:${JSON.stringify(geometry)}`);
          }
        }
      }
      await context.close();
    }
    check("responsive-mode-matrix", failures.length === 0,
      failures.length ? failures.join(" || ") : `${cells} cells; 2 pages × 4 modes × 6 widths`);
  }

  fs.writeFileSync(path.join(outDir, "smart-search-results.json"), JSON.stringify({
    generatedAtUtc: new Date().toISOString(), baseUrl, results
  }, null, 2));
  if (results.some(result => !result.pass)) process.exitCode = 1;
} finally {
  await browser.close();
}
