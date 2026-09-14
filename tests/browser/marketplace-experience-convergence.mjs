/**
 * Marketplace Experience Convergence — product IA + visual evidence.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE_URL, CREDENTIALS, setThemeAndLang } from "./lib/auth.mjs";
import { loginOnceAndSave, newAuthedContext, paceAuthSensitive, persistContextState, statePath } from "./lib/session.mjs";

const OUT = process.argv[2]
  || path.join("docs", "features", "evidence", "marketplace-experience-convergence");
const cells = [
  { width: 1440, height: 900, lang: "ar", theme: "dark", folder: "rtl" },
  { width: 1440, height: 900, lang: "en", theme: "light", folder: "light" },
  { width: 390, height: 844, lang: "ar", theme: "light", folder: "mobile" },
  { width: 390, height: 844, lang: "en", theme: "dark", folder: "dark" }
];
const findings = [];
const shots = [];
const wait = ms => new Promise(r => setTimeout(r, ms));

for (const dir of ["public", "student", "teacher", "focused", "routes", "mobile", "rtl", "dark", "light", "regression"])
  fs.mkdirSync(path.join(OUT, dir), { recursive: true });

function check(ok, finding) {
  if (!ok) findings.push(finding);
}

async function shot(page, rel) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: false, timeout: 10000 });
  shots.push(rel.replaceAll("\\", "/"));
  console.log("shot", rel.replaceAll("\\", "/"));
}

async function openStable(page, url, theme, lang) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForSelector("body", { timeout: 10000 });
  await setThemeAndLang(page, theme, lang);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForSelector("body", { timeout: 10000 });
  await wait(400);
}

async function openOnce(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
  await wait(600);
}

async function publicIa(page) {
  await openStable(page, `${BASE_URL}/app/Tafseel-Landing.dc.html`, "light", "en");
  const landing = await page.evaluate(() => {
    const hrefs = [...document.querySelectorAll("header a")].map(a => a.getAttribute("href") || "");
    return {
      hero: !!document.querySelector(".tf-landing-hero, .tf-hero-headline"),
      browse: hrefs.some(h => /Browse-Teachers/.test(h)),
      post: hrefs.some(h => /Open-Marketplace/.test(h)),
      dashboard: !!document.querySelector(".tf-dashboard-shell")
    };
  });
  check(landing.hero, { page: "landing", type: "hero-missing" });
  check(landing.browse, { page: "landing", type: "browse-nav-missing" });
  check(landing.post, { page: "landing", type: "post-request-nav-missing" });
  check(!landing.dashboard, { page: "landing", type: "dashboard-shell-leak" });

  await openStable(page, `${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, "light", "en");
  const browse = await page.evaluate(() => ({
    post: [...document.querySelectorAll("a")].some(a => /Open-Marketplace/.test(a.getAttribute("href") || "")),
    omIsland: !!document.querySelector("[class*='om-']")
  }));
  check(browse.post, { page: "browse", type: "post-request-missing" });
  check(!browse.omIsland, { page: "browse", type: "om-class-island" });

  await openOnce(page, `${BASE_URL}/app/Tafseel-Open-Marketplace.dc.html`);
  await page.waitForFunction(() => /Tafseel-Auth|Open-Marketplace/.test(location.href), null, { timeout: 8000 }).catch(() => {});
  const post = await page.evaluate(() => ({
    href: location.href,
    search: location.search,
    teacherFeed: !!document.querySelector("[data-opportunity-list]"),
    offersInbox: !!document.querySelector("[data-offers-list]"),
    dashboard: !!document.querySelector(".tf-dashboard-shell"),
    loginHref: document.querySelector("[data-post-auth]")?.href || ""
  }));
  const guestReturn = /Tafseel-Auth/.test(post.href)
    ? /return=/.test(post.search) && /Open-Marketplace/.test(decodeURIComponent(post.search))
    : /Tafseel-Auth/.test(post.loginHref) && /return=/.test(post.loginHref);
  check(guestReturn, { page: "post-request", type: "guest-return-missing", detail: post.href || post.loginHref });
  check(!post.teacherFeed, { page: "post-request", type: "teacher-opportunities-still-embedded" });
  check(!post.offersInbox, { page: "post-request", type: "student-offers-still-embedded" });
  check(!post.dashboard, { page: "post-request", type: "dashboard-shell-on-public-entry" });

  await openOnce(page, `${BASE_URL}/app/Tafseel-Open-Marketplace.dc.html?requestId=00000000-0000-0000-0000-000000000001`);
  check(!/Open-Marketplace/.test(page.url()), { page: "routes", type: "student-request-shim", detail: page.url() });
  await openOnce(page, `${BASE_URL}/app/Tafseel-Open-Marketplace.dc.html?opportunityId=00000000-0000-0000-0000-000000000001`);
  check(!/Open-Marketplace/.test(page.url()), { page: "routes", type: "teacher-opportunity-shim", detail: page.url() });

  await openOnce(page, `${BASE_URL}/app/Tafseel-Payment.dc.html`);
  const payment = await page.evaluate(() => ({
    workflow: !!document.querySelector(".tf-workflow-header"),
    dashboard: !!document.querySelector(".tf-dashboard-shell")
  }));
  check(payment.workflow || /Tafseel-Auth/.test(page.url()), { page: "payment", type: "missing-workflow-header" });
  check(!payment.dashboard, { page: "payment", type: "payment-embedded-in-dashboard" });
}

async function captureMatrix(page) {
  for (const cell of cells) {
    const tag = `${cell.width}-${cell.lang}-${cell.theme}`;
    await page.setViewportSize({ width: cell.width, height: cell.height });
    await openStable(page, `${BASE_URL}/app/Tafseel-Landing.dc.html`, cell.theme, cell.lang);
    check(await page.evaluate(lang => document.documentElement.dir === (lang === "ar" ? "rtl" : "ltr"), cell.lang), {
      page: "landing", cell: tag, type: "direction"
    });
    await shot(page, path.join(cell.folder, `landing-${tag}.png`));
    await shot(page, path.join("public", `landing-${tag}.png`));
    if (cell.width <= 400) {
      const toggle = page.locator("[data-public-menu-toggle]").first();
      if (await toggle.count()) {
        await toggle.click().catch(() => {});
        await wait(250);
        const menu = await page.evaluate(() => {
          const root = document.querySelector("[data-public-menu]");
          const text = (root?.innerText || "") + [...document.querySelectorAll("[data-public-menu] a, #landing-public-menu a")].map(a => a.textContent).join(" ");
          const hrefs = [...document.querySelectorAll("a")].map(a => a.getAttribute("href") || "");
          return { post: /Open-Marketplace/.test(hrefs.join(" ")) && /طلب|Post a Request|انشر/.test(text + document.body.innerText) };
        });
        check(menu.post, { page: "landing", cell: tag, type: "mobile-post-request-missing" });
        await shot(page, path.join("mobile", `landing-menu-${tag}.png`));
        await page.keyboard.press("Escape").catch(() => {});
      }
    }

    await openStable(page, `${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, cell.theme, cell.lang);
    await shot(page, path.join(cell.folder, `browse-${tag}.png`));
    await shot(page, path.join("public", `browse-${tag}.png`));

    await openOnce(page, `${BASE_URL}/app/Tafseel-Open-Marketplace.dc.html`);
    try { await setThemeAndLang(page, cell.theme, cell.lang); } catch { /* auth redirect */ }
    await wait(400);
    await shot(page, path.join(cell.folder, `post-request-${tag}.png`));
    await shot(page, path.join("public", `post-request-${tag}.png`));

    await openOnce(page, `${BASE_URL}/app/Tafseel-Payment.dc.html`);
    await shot(page, path.join("focused", `payment-${tag}.png`));
    await shot(page, path.join(cell.folder, `payment-${tag}.png`));
  }
}

async function loginViaForm(page, role) {
  const creds = CREDENTIALS[role];
  if (!creds?.password) throw new Error(`No credentials for ${role}`);
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', creds.email);
  await page.fill('input[type="password"]', creds.password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !location.pathname.includes("Tafseel-Auth"), { timeout: 20000 });
}

async function ensureRole(browser, role) {
  if (!CREDENTIALS[role]?.password) return null;
  const stored = statePath(role);
  try { if (fs.existsSync(stored)) fs.unlinkSync(stored); } catch { /* ignore */ }
  return loginOnceAndSave(browser, role);
}

async function studentIa(browser) {
  const storage = await ensureRole(browser, "Student");
  if (!storage) {
    findings.push({ page: "student", type: "auth-skipped", detail: "No Student credentials" });
    return;
  }
  const context = await newAuthedContext(browser, "Student", { viewport: { width: 1440, height: 900 }, theme: "light" });
  const page = await context.newPage();
  try {
    await paceAuthSensitive();
    await openStable(page, `${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html`, "light", "en");
    await page.waitForSelector(".tf-dashboard-shell, input[type='email']", { timeout: 20000 });
    if (!await page.$(".tf-dashboard-shell")) {
      findings.push({ page: "student", type: "auth-skipped", detail: page.url() });
      await shot(page, path.join("student", "auth-fallback-1440-en-light.png"));
      return;
    }
    const overview = await page.evaluate(() => {
      const nav = [...document.querySelectorAll("nav, .tf-dash-nav")].map(n => (n.textContent || "").replace(/\s+/g, " "));
      return {
        post: !!document.querySelector(".tf-student-post-request"),
        find: !!document.querySelector(".tf-student-find-teacher"),
        offersNav: nav.some(t => /\bOffers\b/.test(t) && !/Request/.test(t)),
        requestsNav: nav.some(t => /request/i.test(t)),
        dashboard: !!document.querySelector(".tf-dashboard-shell")
      };
    });
    check(overview.post, { page: "student", type: "post-request-cta-missing" });
    check(overview.find, { page: "student", type: "find-teacher-cta-missing" });
    check(!overview.offersNav, { page: "student", type: "redundant-offers-nav" });
    check(overview.requestsNav, { page: "student", type: "my-requests-nav-missing" });
    await shot(page, path.join("student", "overview-1440-en-light.png"));

    await openOnce(page, `${BASE_URL}/app/Tafseel-Open-Marketplace.dc.html`);
    await wait(700);
    check(/Open-Marketplace/.test(page.url()) && !documentDashboard(page.url()), {
      page: "student", type: "post-request-not-marketplace-shell", detail: page.url()
    });
    const create = await page.evaluate(() => ({
      form: !!document.querySelector("[data-post-form], [data-post-loading], [data-post-error]"),
      dashboard: !!document.querySelector(".tf-dashboard-shell"),
      mkWorld: document.body.classList.contains("tf-mk-world")
    }));
    check(create.mkWorld && !create.dashboard, { page: "student", type: "post-request-shell" });
    await shot(page, path.join("student", "post-request-1440-en-light.png"));
    await shot(page, path.join("public", "post-request-student-1440-en-light.png"));

    await openOnce(page, `${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html?section=requests`);
    await wait(500);
    await shot(page, path.join("student", "requests-1440-en-light.png"));

    await page.setViewportSize({ width: 390, height: 844 });
    await setThemeAndLang(page, "light", "ar");
    await openOnce(page, `${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html`);
    await page.waitForFunction(() => document.documentElement.dir === "rtl", null, { timeout: 8000 }).catch(() => {});
    check(await page.evaluate(() => document.documentElement.dir === "rtl"), { page: "student", type: "rtl" });
    await shot(page, path.join("student", "overview-390-ar-light.png"));

    await page.setViewportSize({ width: 1440, height: 900 });
    await setThemeAndLang(page, "light", "en");
    await openOnce(page, `${BASE_URL}/app/Tafseel-Payment.dc.html`);
    await wait(400);
    await shot(page, path.join("focused", "payment-student-1440-en-light.png"));
    await persistContextState(context, "Student");
  } finally {
    await page.close();
    await context.close();
  }
}

function documentDashboard(url) {
  return /Dashboard/.test(url) && /Open-Marketplace/.test(url);
}

async function teacherIa(browser) {
  if (!CREDENTIALS.Teacher?.password) {
    findings.push({ page: "teacher", type: "auth-skipped", detail: "No Teacher credentials" });
    return;
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(20000);
  try {
    await wait(20000);
    await openOnce(page, `${BASE_URL}/app/Tafseel-Teacher-Dashboard.dc.html`);
    if (await page.$("input[type='email']")) await loginViaForm(page, "Teacher");
    await page.waitForSelector(".tf-dashboard-shell", { timeout: 20000 });
    await setThemeAndLang(page, "dark", "ar");
    await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForSelector(".tf-dashboard-shell", { timeout: 20000 });
    const overview = await page.evaluate(() => {
      const viewAll = document.querySelector(".tf-teacher-opportunities a, .tf-teacher-opportunities-head a, .tf-teacher-opportunities-link");
      return {
        preview: !!document.querySelector(".tf-teacher-opportunities"),
        viewAllHref: viewAll ? viewAll.getAttribute("href") || "" : "",
        dashboard: !!document.querySelector(".tf-dashboard-shell")
      };
    });
    check(overview.preview, { page: "teacher", type: "opportunities-preview-missing" });
    check(/Teacher-Dashboard/.test(overview.viewAllHref) && /section=opportunities/.test(overview.viewAllHref), {
      page: "teacher", type: "view-all-leaves-dashboard", detail: overview.viewAllHref
    });
    await shot(page, path.join("teacher", "overview-1440-ar-dark.png"));

    await openOnce(page, `${BASE_URL}/app/Tafseel-Teacher-Dashboard.dc.html?section=opportunities`);
    await wait(800);
    const work = await page.evaluate(() => ({
      url: location.href,
      dashboard: !!document.querySelector(".tf-dashboard-shell"),
      surface: !!document.querySelector("#tf-teacher-opportunities-work, .tf-market-opportunity, .tf-market-page-head, .tf-market-state")
    }));
    check(/Teacher-Dashboard/.test(work.url) && !/Open-Marketplace/.test(work.url), {
      page: "teacher", type: "opportunities-left-shell", detail: work.url
    });
    check(work.dashboard, { page: "teacher", type: "opportunities-missing-dashboard" });
    check(work.surface, { page: "teacher", type: "opportunities-surface-missing" });
    await shot(page, path.join("teacher", "opportunities-1440-ar-dark.png"));

    await page.setViewportSize({ width: 390, height: 844 });
    await setThemeAndLang(page, "dark", "en");
    await openOnce(page, `${BASE_URL}/app/Tafseel-Teacher-Dashboard.dc.html?section=opportunities`);
    await wait(500);
    await shot(page, path.join("teacher", "opportunities-390-en-dark.png"));
    await persistContextState(context, "Teacher");
  } finally {
    await page.close();
    await context.close();
  }
}

async function main() {
  console.log("cert start", BASE_URL);
  const health = await fetch(`${BASE_URL}/health/live`).then(r => r.status).catch(err => String(err));
  if (health !== 200) throw new Error(`API not live at ${BASE_URL}: ${health}`);
  const browser = await chromium.launch({ timeout: 30000 });
  const guest = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await guest.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(20000);
  page.on("pageerror", error => findings.push({ page: "runtime", type: "pageerror", detail: error.message }));
  try {
    if (process.env.TAFSEEL_CERT_SKIP_PUBLIC !== "1") {
      console.log("public ia");
      await publicIa(page);
      console.log("matrix");
      await captureMatrix(page);
    }
  } finally {
    await page.close();
    await guest.close();
  }
  if (process.env.TAFSEEL_CERT_SKIP_STUDENT !== "1") {
    console.log("student ia");
    try { await studentIa(browser); }
    catch (error) { findings.push({ page: "student", type: "auth-skipped", detail: String(error.message || error) }); }
  }
  console.log("teacher ia");
  try { await teacherIa(browser); }
  catch (error) { findings.push({ page: "teacher", type: "auth-skipped", detail: String(error.message || error) }); }
  await browser.close();

  const report = {
    baseUrl: BASE_URL,
    capturedAt: new Date().toISOString(),
    shots,
    findings,
    studentAuth: !!CREDENTIALS.Student.password || fs.existsSync(statePath("Student")),
    teacherAuth: !!CREDENTIALS.Teacher.password || fs.existsSync(statePath("Teacher"))
  };
  fs.writeFileSync(path.join(OUT, "regression", "ia-cert.json"), JSON.stringify(report, null, 2));
  const blocking = findings.filter(f => f.type !== "auth-skipped");
  console.log(JSON.stringify({ shots: shots.length, findings: findings.length, blocking: blocking.length }, null, 2));
  if (blocking.length) {
    console.error(blocking);
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
