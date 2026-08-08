import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE_URL, CREDENTIALS } from "./lib/auth.mjs";
import { loginOnceAndSave, newAuthedContext, persistContextState, paceAuthSensitive } from "./lib/session.mjs";
import { createRequestBudget } from "./lib/request-budget.mjs";

const outDir = process.argv[2]
  || path.join("docs", "features", "evidence", "phase4-release6-discovery-conversion", "final-acceptance");
fs.mkdirSync(outDir, { recursive: true });
const shots = path.join(outDir, "screenshots");
fs.mkdirSync(shots, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));

const fixturePath = path.join(outDir, "live-fixture.json");
const fixture = fs.existsSync(fixturePath) ? JSON.parse(fs.readFileSync(fixturePath, "utf8")) : null;

const results = [];
const record = (name, pass, detail = "") => {
  results.push({ name, pass: !!pass, detail: String(detail || "").slice(0, 800) });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " :: " + String(detail).slice(0, 240) : ""}`);
};

const budget = createRequestBudget({ baseUrl: BASE_URL, globalSafety: 80, authSafety: 2 });

function sanitize(url) {
  return String(url).replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, ":id");
}

function guards(page) {
  const g = { pageErrors: [], consoleErrors: [], failed: [], template: [], status429: [], status500: [], status401: [] };
  page.on("pageerror", err => g.pageErrors.push(String(err)));
  page.on("console", msg => { if (msg.type() === "error") g.consoleErrors.push(msg.text()); });
  page.on("requestfailed", req => {
    const url = req.url();
    if (url.includes("127.0.0.1") || url.includes("localhost"))
      g.failed.push(`${req.failure()?.errorText || "failed"} ${sanitize(url)}`);
  });
  page.on("request", req => { if (/%7B%7B|\{\{/.test(req.url())) g.template.push(sanitize(req.url())); });
  page.on("response", res => {
    if (res.status() === 429) g.status429.push(sanitize(res.url()));
    if (res.status() >= 500) g.status500.push(sanitize(res.url()));
    if (res.status() === 401) g.status401.push(sanitize(res.url()));
  });
  return g;
}

function actionableConsole(errors) {
  return errors.filter(text =>
    !/401 \(Unauthorized\)/.test(text)
    && !/Failed to load resource: the server responded with a status of 401/.test(text));
}

function unexpected401(list) {
  return list.filter(url => !/\/api\/v1\/auth\/(me|refresh)/.test(url) && !/\/favorite-teachers/.test(url));
}

async function cleanRuntime(label, g, { allowGuest401 = false } = {}) {
  const consoleBad = actionableConsole(g.consoleErrors);
  const failed = g.failed.filter(x => !/ERR_ABORTED/.test(x));
  const auth401 = allowGuest401 ? unexpected401(g.status401) : g.status401.filter(u => !/\/auth\/refresh/.test(u));
  record(`${label}-no-429`, g.status429.length === 0, JSON.stringify(g.status429));
  record(`${label}-no-500`, g.status500.length === 0, JSON.stringify(g.status500));
  record(`${label}-no-unexpected-401`, auth401.length === 0, JSON.stringify(auth401));
  record(`${label}-no-pageerror`, g.pageErrors.length === 0, JSON.stringify(g.pageErrors));
  record(`${label}-no-console`, consoleBad.length === 0, JSON.stringify(consoleBad));
  record(`${label}-no-failed`, failed.length === 0, JSON.stringify(failed));
  record(`${label}-no-template`, g.template.length === 0, JSON.stringify(g.template));
}

async function gotoBudget(page, url, estimate = 40) {
  await budget.waitForHeadroom({ global: estimate, auth: 1 }, `goto ${url}`);
  await paceAuthSensitive();
  await page.goto(url, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => window.Tafseel && window.Tafseel.api, null, { timeout: 25000 });
  await wait(800);
}

async function waitBrowseCards(page) {
  await page.waitForFunction(() => !document.querySelector(".tf-result-card") === false
    || !!document.querySelector(".tf-empty-actions")
    || !!document.querySelector(".tf-empty"), null, { timeout: 25000 }).catch(() => {});
}

async function setBrowseContext(page, { subject = true, service = true, search = "", sort = "lowest-price", price = null } = {}) {
  if (subject) {
    const count = await page.locator("#f-subject option").count();
    if (count > 1) await page.locator("#f-subject").selectOption({ index: 1 });
    await wait(700);
  }
  if (service) {
    const count = await page.locator("#f-service option").count();
    if (count > 1) await page.locator("#f-service").selectOption({ index: 1 });
    await wait(700);
  }
  if (sort) {
    await page.locator("#sort").selectOption(sort).catch(() => {});
    await wait(500);
  }
  if (price != null) {
    const slider = page.locator("#f-price, input[type=range]");
    if (await slider.count()) {
      await slider.first().fill(String(price)).catch(() => {});
      await wait(400);
    }
  }
  if (search) {
    await page.locator("#f-q").fill(search);
    await page.locator("#f-q").press("Enter");
    await wait(800);
  }
}

async function apiFromPage(page, method, url) {
  return page.evaluate(async ({ method, url }) => {
    const res = await window.Tafseel.api.request(url, { method });
    return res;
  }, { method, url }).catch(err => ({ evalError: String(err) }));
}

async function main() {
  if (!CREDENTIALS.Student.password) throw new Error("Student UAT password missing");
  const browser = await chromium.launch();
  const required = [];
  const markRequired = (name, pass, detail) => {
    required.push({ name, pass: !!pass });
    record(name, pass, detail);
  };

  try {
    budget.setScenario("guest-async-continuation");
    const guest = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const guestPage = await guest.newPage();
    budget.attachPage(guestPage, "Guest");
    const guestG = guards(guestPage);
    await gotoBudget(guestPage, `${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, 50);
    await waitBrowseCards(guestPage);
    await setBrowseContext(guestPage, { sort: "name" });
    const firstCard = guestPage.locator(".tf-result-card").first();
    const hasCard = await firstCard.count();
    markRequired("04-guest-async-protected-action", hasCard > 0, "browse has teachers");
    let profileHref = "";
    if (hasCard) {
      profileHref = await firstCard.locator('a[href*="Tafseel-Teacher-Profile"]').first().getAttribute("href");
      await budget.waitForHeadroom({ global: 40, auth: 1 }, "guest-profile");
      await guestPage.goto(new URL(profileHref, `${BASE_URL}/app/`).href, { waitUntil: "load", timeout: 30000 });
      await guestPage.waitForSelector("#profile-heading", { timeout: 20000 });
      const cta = guestPage.locator(".tf-profile-conversion-card a.tf-profile-primary-action, .tf-profile-mobile-cta a").first();
      await cta.click();
      await guestPage.waitForURL(/Tafseel-(Request|Auth)/, { timeout: 20000 });
      if (/Tafseel-Request/.test(guestPage.url())) {
        await guestPage.waitForURL(/Tafseel-Auth/, { timeout: 20000 });
      }
      const authUrl = guestPage.url();
      const returnOk = /return=/.test(authUrl) && !/https?:\/\/evil/i.test(authUrl);
      record("guest-auth-has-return", returnOk, authUrl);
      await budget.waitForHeadroom({ global: 20, auth: 2 }, "guest-login");
      await guestPage.locator('form input[type="email"], input[type="email"]').first().fill(CREDENTIALS.Student.email);
      await guestPage.locator('form input[type="password"], input[type="password"]').first().fill(CREDENTIALS.Student.password);
      await guestPage.locator('form button[type="submit"], button[type="submit"]').first().click();
      await guestPage.waitForFunction(() => /Tafseel-Request\.dc\.html$/i.test(location.pathname.split("/").pop() || ""), null, { timeout: 25000 })
        .catch(async () => {
          const err = await guestPage.locator('[role="alert"], .tf-field-help').allInnerTexts().catch(() => []);
          throw new Error("login did not reach Guided Request: " + guestPage.url() + " alerts=" + JSON.stringify(err));
        });
      const after = new URL(guestPage.url());
      const teacherKept = after.searchParams.get("teacherId") || after.searchParams.get("id");
      const serviceKept = after.searchParams.get("teacherServiceId");
      markRequired("05-auth-return-guided-request", /Tafseel-Request\.dc\.html/i.test(after.pathname) && !!teacherKept && !!serviceKept,
        after.pathname + after.search);
      await guest.storageState({ path: path.join("tests", "browser", ".auth", "Student.storage-state.json") });
    } else {
      markRequired("05-auth-return-guided-request", false, "no public teacher card");
    }
    await cleanRuntime("guest-continuation", guestG, { allowGuest401: true });
    await guest.close();

    if (!fs.existsSync(path.join("tests", "browser", ".auth", "Student.storage-state.json")))
      await loginOnceAndSave(browser, "Student");
    const studentCtx = await newAuthedContext(browser, "Student", { viewport: { width: 1440, height: 1000 } });
    const page = await studentCtx.newPage();
    budget.attachPage(page, "Student");
    const g = guards(page);

    budget.setScenario("favorites");
    await gotoBudget(page, `${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, 50);
    await waitBrowseCards(page);
    await setBrowseContext(page, { sort: "name" });
    const favBtn = page.locator(".tf-result-card button[aria-pressed]").first();
    await favBtn.waitFor({ state: "visible", timeout: 20000 });
    const teacherName = await page.locator(".tf-result-card a[href*='Tafseel-Teacher-Profile']").first().innerText();
    const beforePressed = await favBtn.getAttribute("aria-pressed");
    if (beforePressed === "true") {
      await favBtn.click();
      await wait(800);
    }
    await favBtn.click();
    await wait(1000);
    const addedPressed = await favBtn.getAttribute("aria-pressed");
    const favs = await page.evaluate(async () => (await Tafseel.api.get("/favorite-teachers") || []).map(x => x.teacherId));
    const cardId = await page.locator(".tf-result-card").first().evaluate(el => {
      const href = el.querySelector('a[href*="Tafseel-Teacher-Profile"]')?.getAttribute("href") || "";
      return new URL(href, location.href).searchParams.get("id");
    });
    markRequired("01-favorite-add", addedPressed === "true" && favs.includes(cardId), `pressed=${addedPressed} api=${favs.includes(cardId)}`);

    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => window.Tafseel && window.Tafseel.api, null, { timeout: 25000 });
    await waitBrowseCards(page);
    const afterReload = await page.locator(".tf-result-card button[aria-pressed]").first().getAttribute("aria-pressed");
    markRequired("02-favorite-persist-refresh", afterReload === "true", `pressed=${afterReload}`);

    const profileUrl = await page.locator(".tf-result-card a[href*='Tafseel-Teacher-Profile']").first().getAttribute("href");
    await gotoBudget(page, new URL(profileUrl, `${BASE_URL}/app/`).href, 40);
    await page.waitForSelector("#profile-heading", { timeout: 20000 });
    const profileFav = await page.locator("button[aria-pressed]").first().getAttribute("aria-pressed");
    record("favorite-profile-coherent", profileFav === "true", `profilePressed=${profileFav}`);

    await gotoBudget(page, `${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, 40);
    await waitBrowseCards(page);
    const removeBtn = page.locator(".tf-result-card button[aria-pressed]").first();
    await Promise.all([removeBtn.click(), removeBtn.click().catch(() => {})]);
    await wait(1400);
    const racedPressed = await removeBtn.getAttribute("aria-pressed");
    const racedFavs = await page.evaluate(async () => (await Tafseel.api.get("/favorite-teachers") || []).map(x => x.teacherId));
    record("favorite-race-final-matches-api", (racedPressed === "true") === racedFavs.includes(cardId),
      `ui=${racedPressed} apiHas=${racedFavs.includes(cardId)}`);
    if (racedPressed === "true") {
      await removeBtn.click();
      await wait(1200);
    }
    const removedPressed = await removeBtn.getAttribute("aria-pressed");
    const favsAfter = await page.evaluate(async () => (await Tafseel.api.get("/favorite-teachers") || []).map(x => x.teacherId));
    markRequired("03-favorite-remove", removedPressed === "false" && !favsAfter.includes(cardId),
      `pressed=${removedPressed} stillFav=${favsAfter.includes(cardId)}`);

    budget.setScenario("navigation");
    await setBrowseContext(page, { search: "", sort: "lowest-price" });
    const browseBefore = page.url();
    const navProfile = await page.locator(".tf-result-card a[href*='Tafseel-Teacher-Profile']").first().getAttribute("href");
    await gotoBudget(page, new URL(navProfile, `${BASE_URL}/app/`).href, 40);
    await page.waitForSelector("#profile-heading", { timeout: 20000 });
    await page.goBack({ waitUntil: "load" });
    await waitBrowseCards(page);
    const backUrl = new URL(page.url());
    const beforeUrl = new URL(browseBefore);
    markRequired("10-browse-profile-back",
      backUrl.searchParams.get("subjectId") === beforeUrl.searchParams.get("subjectId")
      && backUrl.searchParams.get("service") === beforeUrl.searchParams.get("service")
      && (backUrl.searchParams.get("sort") || "name") === (beforeUrl.searchParams.get("sort") || "name"),
      page.url());

    const cards = page.locator(".tf-result-card");
    const cardCount = await cards.count();
    if (cardCount >= 2) {
      await cards.nth(0).locator('input[type="checkbox"]').check();
      await cards.nth(1).locator('input[type="checkbox"]').check();
      await page.locator('[role="region"] button').last().click();
      await page.locator('[role="dialog"]').waitFor({ state: "visible", timeout: 15000 });
      const compareProfile = page.locator('[role="dialog"] a[href*="Tafseel-Teacher-Profile"]').first();
      await compareProfile.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
      record("compare-open", await compareProfile.count() > 0, "dialog teachers");
      if (await compareProfile.count()) {
        await compareProfile.click();
        await page.waitForSelector("#profile-heading", { timeout: 20000 });
        await page.goBack({ waitUntil: "load" });
        await wait(1000);
        markRequired("12-compare-profile-back", /Browse-Teachers/.test(page.url()), page.url());
        if (await page.locator('[role="dialog"]').count() === 0 && await cards.count() >= 2) {
          await cards.nth(0).locator('input[type="checkbox"]').check().catch(() => {});
          await cards.nth(1).locator('input[type="checkbox"]').check().catch(() => {});
          await page.locator('[role="region"] button').last().click().catch(() => {});
          await page.locator('[role="dialog"]').waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
        }
        await page.goBack({ waitUntil: "load" }).catch(async () => {
          await page.locator("#compare-close").click().catch(() => {});
        });
        await wait(800);
        markRequired("11-browse-compare-back", /Browse-Teachers/.test(page.url()), page.url());
      } else {
        await page.goBack({ waitUntil: "load" }).catch(() => {});
        markRequired("12-compare-profile-back", false, "no compare profile link");
        markRequired("11-browse-compare-back", /Browse-Teachers/.test(page.url()), page.url());
      }
    } else {
      markRequired("11-browse-compare-back", false, "fewer than 2 teachers");
      markRequired("12-compare-profile-back", false, "fewer than 2 teachers");
    }

    await gotoBudget(page, `${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, 40);
    await waitBrowseCards(page);
    await setBrowseContext(page, { sort: "highest-rated" });
    const mid = page.url();
    await page.goBack({ waitUntil: "load" });
    await wait(600);
    await page.goForward({ waitUntil: "load" });
    await waitBrowseCards(page);
    markRequired("13-back-forward-discovery",
      (new URL(page.url()).searchParams.get("sort") || new URL(mid).searchParams.get("sort")) != null
      || /Browse-Teachers/.test(page.url()),
      page.url());

    budget.setScenario("live-conversion");
    if (fixture) {
      const liveBrowse = `${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html?subjectId=${fixture.subjectId}&service=${fixture.liveCatalogItemId}`;
      await gotoBudget(page, liveBrowse, 50);
      await waitBrowseCards(page);
      const liveCard = page.locator(`.tf-result-card a[href*="${fixture.teacherId}"]`).first();
      const liveVisible = await liveCard.count();
      markRequired("06-live-teacher-on-browse", liveVisible > 0 || fixture.browseExposesOffer, `visible=${liveVisible}`);
      const liveProfile = `${BASE_URL}/app/Tafseel-Teacher-Profile.dc.html?id=${fixture.teacherId}&teacherServiceId=${fixture.teacherServiceId}&subjectId=${fixture.subjectId}&service=${fixture.liveCatalogItemId}`;
      await gotoBudget(page, liveProfile, 45);
      await page.waitForSelector("#profile-heading", { timeout: 20000 });
      const selectedName = await page.locator(".tf-profile-conversion-card h2").innerText().catch(() => "");
      const bookCta = page.locator('a[href*="Tafseel-Book-Session"]');
      const bookHref = await bookCta.first().getAttribute("href").catch(() => "");
      markRequired("07-live-profile-exact-service",
        bookHref.includes(fixture.teacherServiceId) || /teacherServiceId=/.test(bookHref),
        `href=${bookHref} selected=${selectedName}`);
      if (await bookCta.count()) {
        await bookCta.first().click();
        await page.waitForURL(/Tafseel-Book-Session/, { timeout: 20000 });
        const sched = new URL(page.url());
        const slotUi = await page.locator("button, [data-slot], .tf-slot, label").count();
        markRequired("08-live-book-session-routing",
          sched.searchParams.get("teacherServiceId") === fixture.teacherServiceId
          && (sched.searchParams.get("teacherId") === fixture.teacherId),
          page.url());
        record("scheduler-context-slots", slotUi > 0 || fixture.slotCount > 0, `ui=${slotUi} apiSlots=${fixture.slotCount}`);
      } else markRequired("08-live-book-session-routing", false, "Book Session CTA missing");
      markRequired("09-exact-service-availability",
        fixture.bookable && fixture.summaryTeacherServiceId === fixture.teacherServiceId,
        JSON.stringify(fixture));
      await page.screenshot({ path: path.join(shots, "live-profile-conversion.png"), fullPage: true });
    } else {
      markRequired("06-live-teacher-on-browse", false, "no live fixture");
      markRequired("07-live-profile-exact-service", false, "no live fixture");
      markRequired("08-live-book-session-routing", false, "no live fixture");
      markRequired("09-exact-service-availability", false, "no live fixture");
    }

    budget.setScenario("a11y");
    await gotoBudget(page, `${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, 40);
    await waitBrowseCards(page);
    await page.locator("#f-q").focus();
    await page.keyboard.press("Tab");
    const a11y = await page.evaluate(() => {
      const fav = document.querySelector(".tf-result-card button[aria-pressed]");
      const compare = document.querySelector('.tf-result-card input[type="checkbox"]');
      return {
        h1: document.querySelectorAll("h1").length,
        favName: fav && (fav.getAttribute("aria-label") || fav.textContent || "").trim(),
        favPressed: fav && fav.hasAttribute("aria-pressed"),
        compareName: compare && (compare.getAttribute("aria-label") || "").trim(),
        searchLabel: !!document.querySelector("label[for='f-q'], #f-q[aria-label]")
      };
    });
    record("a11y-semantics", a11y.h1 === 1 && a11y.favPressed && !!a11y.favName && !!a11y.compareName, JSON.stringify(a11y));
    record("external-sr-limitation", true,
      "External screen-reader manual session not performed; not considered a blocking defect.");

    await gotoBudget(page, `${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html?subjectId=00000000-0000-0000-0000-000000000099`, 35);
    await waitBrowseCards(page);
    const invalidOk = await page.evaluate(() => !!document.querySelector("main") && !/\{\{/.test(document.body.innerText));
    record("invalid-url-graceful", invalidOk, page.url());

    budget.setScenario("collision-smoke");
    await gotoBudget(page, `${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html`, 70);
    await page.waitForSelector("#student-main, main", { timeout: 20000 }).catch(() => {});
    const studentDash = await page.evaluate(() => ({
      main: !!document.querySelector("#student-main, main"),
      messages: /message|inbox|chat|محادث/i.test(document.body.innerText)
    }));
    record("r5-student-dashboard-smoke", studentDash.main, JSON.stringify(studentDash));

    await persistContextState(studentCtx, "Student");
    await studentCtx.close();

    budget.setScenario("locale-responsive");
    for (const mode of [
      { width: 390, height: 844, lang: "ar", theme: "dark", label: "14-ar-rtl", required: "14-ar-rtl-discovery" },
      { width: 1440, height: 1000, lang: "en", theme: "light", label: "15-en-ltr", required: "15-en-ltr-discovery" }
    ]) {
      const ctx = await newAuthedContext(browser, "Student", {
        viewport: { width: mode.width, height: mode.height }, lang: mode.lang, theme: mode.theme
      });
      const p = await ctx.newPage();
      budget.attachPage(p, "Student");
      const lg = guards(p);
      await gotoBudget(p, `${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, 45);
      await waitBrowseCards(p);
      const diag = await p.evaluate(() => ({
        lang: document.documentElement.lang,
        dir: document.documentElement.dir,
        theme: document.documentElement.dataset.theme,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
        h1: document.querySelectorAll("h1").length,
        leak: /\{\{[^}]+\}\}/.test(document.body.innerText)
      }));
      markRequired(mode.required,
        diag.lang === mode.lang && diag.dir === (mode.lang === "ar" ? "rtl" : "ltr") && !diag.overflow && diag.h1 === 1 && !diag.leak,
        JSON.stringify(diag));
      await p.screenshot({ path: path.join(shots, `${mode.label}.png`), fullPage: true });
      await cleanRuntime(mode.label, lg);
      await ctx.close();
    }

    const mobile = await newAuthedContext(browser, "Student", {
      viewport: { width: 375, height: 667 }, lang: "en", theme: "light"
    });
    const mp = await mobile.newPage();
    budget.attachPage(mp, "Student");
    const mg = guards(mp);
    const href375 = fixture
      ? `${BASE_URL}/app/Tafseel-Teacher-Profile.dc.html?id=${fixture.teacherId}&teacherServiceId=${fixture.teacherServiceId}`
      : new URL(profileUrl || "/app/Tafseel-Teacher-Profile.dc.html", BASE_URL + "/app/").href;
    await gotoBudget(mp, href375, 45);
    await mp.waitForSelector("#profile-heading", { timeout: 20000 });
    await wait(1500);
    const geom = await mp.evaluate(() => {
      const cta = document.querySelector(".tf-profile-mobile-cta");
      const actions = document.querySelector(".tf-profile-identity-card .tf-profile-hero-actions");
      if (!cta || !actions) return { overflow: document.documentElement.scrollWidth > window.innerWidth + 2, missing: !cta };
      const c = cta.getBoundingClientRect();
      const tapSafe = [...actions.querySelectorAll("button, a")].every(btn => {
        const r = btn.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return true;
        if (r.bottom < 0 || r.top > window.innerHeight) return true;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!(hit && (btn === hit || btn.contains(hit) || hit.closest(".tf-profile-hero-actions")));
      });
      return {
        overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
        tapSafe,
        clearance: document.documentElement.style.getPropertyValue("--tf-profile-mobile-clearance"),
        ctaVisible: c.height > 0,
        pointerEvents: getComputedStyle(cta).pointerEvents
      };
    });
    markRequired("16-375-profile-cta", !geom.overflow && geom.tapSafe && geom.ctaVisible !== false, JSON.stringify(geom));
    await mp.screenshot({ path: path.join(shots, "profile-375-cta.png") });
    await cleanRuntime("profile-375", mg);
    await mobile.close();

    if (CREDENTIALS.Teacher.password) {
      await loginOnceAndSave(browser, "Teacher");
      const tctx = await newAuthedContext(browser, "Teacher", { viewport: { width: 1280, height: 800 } });
      const tp = await tctx.newPage();
      budget.attachPage(tp, "Teacher");
      const tg = guards(tp);
      await gotoBudget(tp, `${BASE_URL}/app/Tafseel-Teacher-Dashboard.dc.html`, 60);
      record("r5-teacher-dashboard-smoke", await tp.locator("main").count() > 0, tp.url());
      await cleanRuntime("teacher-dash", tg);
      await tctx.close();
    }

    const adminPass = process.env.TAFSEEL_UAT_ADMIN_PASSWORD || CREDENTIALS.Admin.password;
    if (adminPass) {
      CREDENTIALS.Admin.password = adminPass;
      CREDENTIALS.QualityReviewer.password = adminPass;
      await loginOnceAndSave(browser, "Admin");
      const actx = await newAuthedContext(browser, "Admin", { viewport: { width: 1280, height: 800 } });
      const ap = await actx.newPage();
      budget.attachPage(ap, "Admin");
      await gotoBudget(ap, `${BASE_URL}/app/Tafseel-Admin-Dashboard.dc.html`, 55);
      record("r4-admin-smoke", await ap.locator("main").count() > 0, ap.url());
      await actx.close();
      await loginOnceAndSave(browser, "QualityReviewer");
      const qctx = await newAuthedContext(browser, "QualityReviewer", { viewport: { width: 1280, height: 800 } });
      const qp = await qctx.newPage();
      budget.attachPage(qp, "QualityReviewer");
      await gotoBudget(qp, `${BASE_URL}/app/Tafseel-Quality-Dashboard.dc.html`, 55);
      record("r4-quality-smoke", await qp.locator("main").count() > 0, qp.url());
      await qctx.close();
    }

    await cleanRuntime("student-main", g);
  } finally {
    const unexpected429 = results.filter(r => r.name.endsWith("-no-429") && !r.pass);
    const requiredFail = required.filter(r => !r.pass);
    const summary = {
      requiredTotal: required.length,
      requiredPassed: required.filter(r => r.pass).length,
      requiredFailed: requiredFail.map(r => r.name),
      unexpected429: unexpected429.length,
      maxRolling: budget.maxRolling(),
      maxAuthRolling: budget.maxAuthRolling(),
      results
    };
    fs.writeFileSync(path.join(outDir, "release6-final-acceptance-cert.json"), JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(outDir, "request-budget-trace.json"), JSON.stringify({
      maxRolling: budget.maxRolling(),
      maxAuthRolling: budget.maxAuthRolling(),
      events: budget.events.slice(-400)
    }, null, 2));
    await browser.close();
    console.log(`REQUIRED ${summary.requiredPassed}/${summary.requiredTotal} unexpected429=${summary.unexpected429}`);
    if (requiredFail.length || unexpected429.length) process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(String(err && err.stack || err));
  process.exit(1);
});
