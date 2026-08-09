import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "..", "..");
const outDir = process.argv[2] || path.join("docs", "fixes", "evidence", "unified-intelligent-discovery-search");
fs.mkdirSync(outDir, { recursive: true });

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
};

const mathId = "11111111-1111-4111-8111-111111111111";
const liveId = "22222222-2222-4222-8222-222222222222";
const catalogs = {
  subjects: [{ id: mathId, name: "Mathematics", nameEn: "Mathematics", nameAr: "الرياضيات", code: null }],
  services: [{
    id: liveId, name: "Live session", nameEn: "Live session", nameAr: "جلسة مباشرة",
    code: "live_session", orderType: "live_session", isPublic: true, teacherSelectable: true
  }]
};

const origin = await new Promise(resolve => {
  const server = http.createServer((_, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><html><body></body></html>");
  });
  server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
});

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${origin.port}/`);
  await page.addScriptTag({ path: path.join(root, "js", "locales.js") });
  await page.addScriptTag({ path: path.join(root, "js", "tafseel.js") });

  const helper = await page.evaluate(({ catalogs, mathId, liveId }) => {
    const d = window.Tafseel.discovery;
    const zone = "UTC";
    const primary = "عندي امتحان رياضيات الخميس ومحتاج live session في التكامل";
    const arabic = d.interpretLocal(primary, catalogs, zone);
    const english = d.interpretLocal("Need a calculus live session Thursday", catalogs, zone);
    const mixed = d.interpretLocal("محتاج live session يوم الخميس في calculus", catalogs, zone);
    const calculus = d.interpretLocal("calculus", catalogs, zone);
    const hisham = d.interpretLocal("Hisham", catalogs, zone);
    d.storeIntent(primary);
    const first = d.consumeIntent();
    const second = d.consumeIntent();
    d.storeIntent(primary);
    const raw = sessionStorage.getItem(d.INTENT_KEY);
    const parsed = JSON.parse(raw);
    parsed.createdAt = Date.now() - d.INTENT_TTL_MS - 1000;
    sessionStorage.setItem(d.INTENT_KEY, JSON.stringify(parsed));
    const stale = d.consumeIntent();
    return {
      arabic,
      english,
      mixed,
      calculus,
      hishamName: d.isProbablyTeacherName("Hisham"),
      calculusNotName: !d.isProbablyTeacherName("calculus"),
      hishamHasAny: hisham.hasAny,
      intentfulPrimary: d.looksLikeIntent(primary),
      consumeOnce: !!(first && first.text === primary && !second),
      staleCleared: stale == null,
      nextThursday: d.nextWeekdayIso(4, zone),
      mathId,
      liveId
    };
  }, { catalogs, mathId, liveId });

  check("arabic-primary-local-math-live-thursday",
    helper.arabic.subjectId === mathId && helper.arabic.serviceId === liveId && !!helper.arabic.availableOn
    && helper.arabic.hasStrong && helper.intentfulPrimary);
  check("english-calculus-live-thursday",
    helper.english.subjectId === mathId && helper.english.serviceId === liveId && !!helper.english.availableOn);
  check("mixed-arabic-english",
    helper.mixed.subjectId === mathId && helper.mixed.serviceId === liveId && !!helper.mixed.availableOn);
  check("calculus-no-unnecessary-clarification",
    helper.calculus.subjectId === mathId && !helper.calculus.serviceId && helper.calculusNotName);
  check("hisham-ordinary-keyword", helper.hishamName && !helper.hishamHasAny);
  check("sessionstorage-consume-once", helper.consumeOnce);
  check("stale-intent-not-replayed", helper.staleCleared);
  check("thursday-iso-present", /^\d{4}-\d{2}-\d{2}$/.test(helper.nextThursday));

  const landing = fs.readFileSync(path.join(root, "Tafseel-Landing.dc.html"), "utf8");
  const browse = fs.readFileSync(path.join(root, "Tafseel-Browse-Teachers.dc.html"), "utf8");
  check("landing-guest-handoff", landing.includes("Tafseel.discovery.handoffToBrowse") && landing.includes('role="search"'));
  check("landing-no-raw-nl-url", !landing.includes("?search=' + encodeURIComponent") && !landing.includes("api.groq.com"));
  check("browse-unified-search", browse.includes('id="f-q"') && browse.includes("runUnifiedSearch") && !browse.includes('id="ai-discovery-title"'));
  check("browse-no-groq-browser", !browse.includes("api.groq.com"));
  check("chips-are-ordinary-filters", browse.includes("chip.removeLabel") && browse.includes("availableOn"));

  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => {
    document.documentElement.setAttribute("dir", "rtl");
    document.documentElement.setAttribute("lang", "ar");
    document.body.innerHTML = '<form role="search"><label for="f-q">بحث</label><input id="f-q" style="width:100%;min-height:44px" /><button type="submit">ابحث</button></form><div style="display:flex;flex-wrap:wrap;gap:8px"><button type="button" style="min-height:44px">الرياضيات ✕</button><button type="button" style="min-height:44px">جلسة مباشرة ✕</button><button type="button" style="min-height:44px">الخميس ✕</button></div>';
  });
  const mobile = await page.evaluate(() => ({
    dir: document.documentElement.dir,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  }));
  check("arabic-rtl-mobile-no-overflow", mobile.dir === "rtl" && !mobile.overflow, JSON.stringify(mobile));
  await page.screenshot({ path: path.join(outDir, "unified-search-ar-375.png") });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    document.documentElement.setAttribute("dir", "ltr");
    document.documentElement.setAttribute("lang", "en");
  });
  const desktop = await page.evaluate(() => ({
    dir: document.documentElement.dir,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  }));
  check("english-ltr-desktop-no-overflow", desktop.dir === "ltr" && !desktop.overflow);
  await page.screenshot({ path: path.join(outDir, "unified-search-en-1440.png") });

  const report = { generatedAtUtc: new Date().toISOString(), results };
  fs.writeFileSync(path.join(outDir, "browser-helper-results.json"), JSON.stringify(report, null, 2));
  if (results.some(result => !result.pass)) process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise(resolve => origin.server.close(resolve));
}
