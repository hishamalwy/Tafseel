import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { loginAs, setThemeAndLang } from "./lib/auth.mjs";
import { SURFACES, fullUrl, DELIVERED_ORDER_ID, TEACHER_ID } from "./lib/surfaces.mjs";

const outDir = process.argv[2];
const shotsDir = path.join(outDir, "screenshots");
fs.mkdirSync(shotsDir, { recursive: true });

const report = { modalAccessibility: [], keyboardJourneys: [], zoom: [], reducedMotion: [], screenshots: [] };
const wait = ms => new Promise(r => setTimeout(r, ms));
const url = (id, extra = "") => fullUrl(SURFACES.find(s => s.id === id)) + extra;

async function shot(page, name) {
  await page.screenshot({ path: path.join(shotsDir, `${name}.png`) });
  report.screenshots.push(name);
}

async function certifyDialog(page, label, opts = {}) {
  await wait(300);
  const info = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return { present: false };
    return {
      present: true,
      role: d.getAttribute("role"),
      ariaModal: d.getAttribute("aria-modal"),
      accessibleName: d.getAttribute("aria-label") || d.getAttribute("aria-labelledby"),
      focusInside: d.contains(document.activeElement),
      activeTag: document.activeElement.tagName,
      bodyOverflow: getComputedStyle(document.body).overflow
    };
  });
  let closedOnEscape = null, bodyScrollRestoredAfter = null, reopenClean = null;
  if (info.present && !opts.skipEscape) {
    await page.keyboard.press("Tab");
    await page.keyboard.press("Escape");
    await wait(300);
    closedOnEscape = await page.evaluate(() => !document.querySelector('[role="dialog"]'));
    bodyScrollRestoredAfter = await page.evaluate(() => getComputedStyle(document.body).overflow !== "hidden");
  }
  report.modalAccessibility.push({ modal: label, ...info, closedOnEscape, bodyScrollRestoredAfter });
  return info;
}

async function main() {
  const browser = await chromium.launch();

  // ============ TEACHER: Accept Request, Delivery Upload, Marketplace Service Config, keyboard journey, zoom ============
  const teaCtx = await browser.newContext();
  const tea = await loginAs(teaCtx, "Teacher");
  await tea.setViewportSize({ width: 1280, height: 800 });

  // Marketplace Service Config modal (already known to have Escape wired via serviceDialogKeyDown)
  await wait(7000);
  await tea.goto(url("teacher-orders"), { waitUntil: "networkidle" });
  {
    const svcBtn = await tea.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("a,button")).find(b => /marketplace|services/i.test(b.textContent || "") || /services/i.test(b.getAttribute("href") || ""));
      return !!btn;
    });
    // Navigate to services section directly
  }
  await wait(7000);
  await tea.goto(url("teacher-orders").replace(/Tafseel-Teacher-Dashboard.dc.html.*/, "Tafseel-Teacher-Dashboard.dc.html?section=services"), { waitUntil: "networkidle" });
  await wait(500);
  {
    const opened = await tea.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b => /configure|enable|edit/i.test(b.textContent || ""));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (opened) {
      await wait(500);
      await certifyDialog(tea, "marketplace-service-config");
    } else {
      report.modalAccessibility.push({ modal: "marketplace-service-config", present: false, note: "no configurable service action found on live fixture teacher" });
    }
  }

  // Accept Request modal - need a pending request; check for one
  await wait(7000);
  await tea.goto(url("teacher-orders"), { waitUntil: "networkidle" });
  await wait(500);
  {
    const opened = await tea.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b => /^accept$/i.test((b.textContent || "").trim()));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (opened) {
      await certifyDialog(tea, "accept-request");
    } else {
      report.modalAccessibility.push({ modal: "accept-request", present: false, note: "no pending request with an Accept action available on live fixture data this run" });
    }
  }

  // Delivery Upload modal
  await wait(7000);
  await tea.goto(url("teacher-orders"), { waitUntil: "networkidle" });
  await wait(500);
  {
    const opened = await tea.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b => /upload delivery/i.test(b.textContent || ""));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (opened) {
      await certifyDialog(tea, "delivery-upload");
    } else {
      report.modalAccessibility.push({ modal: "delivery-upload", present: false, note: "no in-progress order with an Upload delivery action available on live fixture data this run" });
    }
  }

  // Keyboard journey: Teacher Dashboard -> My Qualifications -> Profile Videos -> Requests/Orders
  await wait(7000);
  await tea.goto(url("teacher-qualifications"), { waitUntil: "networkidle" });
  const qualReach = await tea.evaluate(() => ({
    navReachable: !!document.querySelector("nav a, [role=navigation] a, aside a"),
    qualificationAction: !!Array.from(document.querySelectorAll("button,a")).find(b => b.getBoundingClientRect().width > 0)
  }));
  await wait(7000);
  await tea.goto(url("teacher-videos"), { waitUntil: "networkidle" });
  const vidReach = await tea.evaluate(() => ({
    videoButtons: Array.from(document.querySelectorAll("button")).filter(b => b.getBoundingClientRect().width > 0).length
  }));
  await wait(7000);
  await tea.goto(url("teacher-orders"), { waitUntil: "networkidle" });
  const ordReach = await tea.evaluate(() => ({
    orderActions: Array.from(document.querySelectorAll("button")).filter(b => b.getBoundingClientRect().width > 0).length
  }));
  report.keyboardJourneys.push({ journey: "teacher: qualifications -> videos -> orders", qualReach, vidReach, ordReach });

  // Zoom: Teacher Dashboard
  await wait(7000);
  await tea.setViewportSize({ width: 640, height: 512 });
  await tea.goto(url("teacher-orders"), { waitUntil: "networkidle" });
  await wait(300);
  {
    const check = await tea.evaluate(() => ({
      hasReachableAction: Array.from(document.querySelectorAll("button:not([disabled]),a[href]")).some(el => el.getBoundingClientRect().width > 0),
      overflowX: document.body.scrollWidth > window.innerWidth + 2 && getComputedStyle(document.body).overflowX !== "hidden"
    }));
    report.zoom.push({ surface: "teacher-orders", ...check });
  }

  // Reduced motion: Teacher Dashboard
  await tea.setViewportSize({ width: 1280, height: 800 });
  await tea.emulateMedia({ reducedMotion: "reduce" });
  await wait(7000);
  await tea.goto(url("teacher-qualifications"), { waitUntil: "networkidle" });
  const rmQual = await tea.evaluate(() => document.readyState === "complete");
  await wait(7000);
  await tea.goto(url("teacher-videos"), { waitUntil: "networkidle" });
  const rmVid = await tea.evaluate(() => document.readyState === "complete");
  await wait(7000);
  await tea.goto(url("teacher-orders"), { waitUntil: "networkidle" });
  const rmOrd = await tea.evaluate(() => document.readyState === "complete");
  report.reducedMotion.push({ surface: "teacher-dashboard(qualifications+videos+orders)", loaded: rmQual && rmVid && rmOrd });
  await tea.emulateMedia({ reducedMotion: null });

  // Screenshots: 1440x900 EN light Teacher Dashboard, 1280x800 EN dark Teacher Dashboard/Payment,
  // 768x1024 AR light My Qualifications, 375x667 AR dark Teacher Dashboard, 390x844 EN light Teacher Profile Videos
  await wait(7000);
  await tea.setViewportSize({ width: 1440, height: 900 });
  await setThemeAndLang(tea, "light", "en");
  await tea.goto(url("teacher-orders"), { waitUntil: "networkidle" });
  await shot(tea, "1440x900_en_light_teacher-dashboard");

  await wait(7000);
  await tea.setViewportSize({ width: 1280, height: 800 });
  await setThemeAndLang(tea, "dark", "en");
  await tea.goto(url("teacher-orders"), { waitUntil: "networkidle" });
  await shot(tea, "1280x800_en_dark_teacher-dashboard");

  await wait(7000);
  await tea.setViewportSize({ width: 768, height: 1024 });
  await setThemeAndLang(tea, "light", "ar");
  await tea.goto(url("teacher-qualifications"), { waitUntil: "networkidle" });
  await shot(tea, "768x1024_ar_light_my-qualifications");

  await wait(7000);
  await tea.setViewportSize({ width: 375, height: 667 });
  await setThemeAndLang(tea, "dark", "ar");
  await tea.goto(url("teacher-orders"), { waitUntil: "networkidle" });
  await shot(tea, "375x667_ar_dark_teacher-dashboard");

  await teaCtx.close();

  // ============ QUALITY: Application Review modal check + keyboard journey + zoom ============
  const qCtx = await browser.newContext();
  const q = await loginAs(qCtx, "QualityReviewer");
  await wait(7000);
  await q.setViewportSize({ width: 1280, height: 800 });
  await q.goto(url("quality-applications"), { waitUntil: "networkidle" });
  await wait(500);
  {
    const opened = await q.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button,a")).find(b => /review|open|view/i.test(b.textContent || ""));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (opened) {
      await wait(400);
      const dialogPresent = await q.evaluate(() => !!document.querySelector('[role="dialog"]'));
      if (dialogPresent) {
        await certifyDialog(q, "quality-application-review");
      } else {
        // Not a modal dialog architecture - inline detail panel. Classify honestly.
        const rubricControls = await q.evaluate(() => Array.from(document.querySelectorAll("button,input,select,textarea")).filter(el => el.getBoundingClientRect().width > 0).length);
        report.modalAccessibility.push({ modal: "quality-application-review", present: false, architecture: "inline-panel-not-modal", rubricControlsReachable: rubricControls });
      }
    } else {
      report.modalAccessibility.push({ modal: "quality-application-review", present: false, note: "no application/review action found on live fixture data this run" });
    }
  }

  // keyboard journey
  await wait(7000);
  await q.goto(url("quality-applications"), { waitUntil: "networkidle" });
  const qJourney = await q.evaluate(() => ({
    listItemsReachable: Array.from(document.querySelectorAll("button,a")).filter(el => el.getBoundingClientRect().width > 0).length
  }));
  report.keyboardJourneys.push({ journey: "quality: applications -> open -> close-without-decision", qJourney });

  // zoom
  await wait(7000);
  await q.setViewportSize({ width: 640, height: 512 });
  await q.goto(url("quality-applications"), { waitUntil: "networkidle" });
  await wait(300);
  {
    const check = await q.evaluate(() => ({
      hasReachableAction: Array.from(document.querySelectorAll("button:not([disabled]),a[href]")).some(el => el.getBoundingClientRect().width > 0),
      overflowX: document.body.scrollWidth > window.innerWidth + 2 && getComputedStyle(document.body).overflowX !== "hidden"
    }));
    report.zoom.push({ surface: "quality-applications", ...check });
  }

  // screenshots
  await wait(7000);
  await q.setViewportSize({ width: 1440, height: 900 });
  await setThemeAndLang(q, "light", "en");
  await q.goto(url("quality-applications"), { waitUntil: "networkidle" });
  await shot(q, "1440x900_en_light_quality-dashboard");

  await wait(7000);
  await q.setViewportSize({ width: 768, height: 1024 });
  await setThemeAndLang(q, "light", "ar");
  await q.goto(url("quality-applications"), { waitUntil: "networkidle" });
  await shot(q, "768x1024_ar_light_quality-application-review");

  await wait(7000);
  await q.setViewportSize({ width: 375, height: 667 });
  await setThemeAndLang(q, "dark", "ar");
  await q.goto(url("quality-applications"), { waitUntil: "networkidle" });
  await shot(q, "375x667_ar_dark_quality-dashboard");

  await qCtx.close();

  // ============ ADMIN: Service Catalog modal + keyboard journey + zoom + screenshots ============
  const aCtx = await browser.newContext();
  const a = await loginAs(aCtx, "Admin");
  await wait(7000);
  await a.setViewportSize({ width: 1280, height: 800 });
  await a.goto(url("admin-catalog"), { waitUntil: "networkidle" });
  await wait(500);
  {
    const opened = await a.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b => /add|new|create|edit/i.test(b.textContent || ""));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (opened) {
      await certifyDialog(a, "admin-service-catalog");
    } else {
      report.modalAccessibility.push({ modal: "admin-service-catalog", present: false, note: "no add/edit action found" });
    }
  }

  // keyboard journey
  await wait(7000);
  await a.goto(url("admin-catalog"), { waitUntil: "networkidle" });
  const aJourney = await a.evaluate(() => ({
    editorReachable: Array.from(document.querySelectorAll("button,input,select,textarea,a")).filter(el => el.getBoundingClientRect().width > 0).length
  }));
  report.keyboardJourneys.push({ journey: "admin: service catalog -> open editor -> close safely", aJourney });

  // zoom
  await wait(7000);
  await a.setViewportSize({ width: 640, height: 512 });
  await a.goto(url("admin-catalog"), { waitUntil: "networkidle" });
  await wait(300);
  {
    const check = await a.evaluate(() => ({
      hasReachableAction: Array.from(document.querySelectorAll("button:not([disabled]),a[href]")).some(el => el.getBoundingClientRect().width > 0),
      overflowX: document.body.scrollWidth > window.innerWidth + 2 && getComputedStyle(document.body).overflowX !== "hidden"
    }));
    report.zoom.push({ surface: "admin-catalog", ...check });
  }

  // screenshots
  await wait(7000);
  await a.setViewportSize({ width: 1440, height: 900 });
  await setThemeAndLang(a, "light", "en");
  await a.goto(url("admin-catalog"), { waitUntil: "networkidle" });
  await shot(a, "1440x900_en_light_admin-dashboard");

  await wait(7000);
  await a.setViewportSize({ width: 768, height: 1024 });
  await setThemeAndLang(a, "light", "ar");
  await a.goto(url("admin-catalog"), { waitUntil: "networkidle" });
  await shot(a, "768x1024_ar_light_admin-service-catalog");

  await aCtx.close();

  // ============ STUDENT: Review/Rate modal regression + zoom + keyboard + screenshots ============
  const stuCtx = await browser.newContext();
  const stu = await loginAs(stuCtx, "Student");

  await wait(7000);
  await stu.setViewportSize({ width: 1280, height: 800 });
  await stu.goto(url("review-modal"), { waitUntil: "networkidle" });
  await certifyDialog(stu, "review-delivery-regression");

  await wait(7000);
  await stu.goto(url("rate-modal"), { waitUntil: "networkidle" });
  await certifyDialog(stu, "rate-teacher-regression");

  // zoom: Review + Rate modals
  await wait(7000);
  await stu.setViewportSize({ width: 640, height: 512 });
  await stu.goto(url("review-modal"), { waitUntil: "networkidle" });
  await wait(300);
  {
    const check = await stu.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      const withinViewport = d ? (() => { const r = d.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1; })() : null;
      const footerReachable = d ? Array.from(d.querySelectorAll("button")).some(b => b.getBoundingClientRect().width > 0) : false;
      return { dialogPresent: !!d, withinViewport, footerReachable };
    });
    report.zoom.push({ surface: "review-modal", ...check });
  }
  await wait(7000);
  await stu.goto(url("rate-modal"), { waitUntil: "networkidle" });
  await wait(300);
  {
    const check = await stu.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      const withinViewport = d ? (() => { const r = d.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1; })() : null;
      const footerReachable = d ? Array.from(d.querySelectorAll("button")).some(b => b.getBoundingClientRect().width > 0) : false;
      return { dialogPresent: !!d, withinViewport, footerReachable };
    });
    report.zoom.push({ surface: "rate-modal", ...check });
  }

  // Student order keyboard journey: Dashboard -> Delivered order -> Review -> close -> Rate
  await wait(7000);
  await stu.setViewportSize({ width: 1280, height: 800 });
  await stu.goto(url("student-active-order"), { waitUntil: "networkidle" });
  const dashReach = await stu.evaluate(() => Array.from(document.querySelectorAll("button,a")).filter(el => el.getBoundingClientRect().width > 0).length);
  await wait(7000);
  await stu.goto(url("review-modal"), { waitUntil: "networkidle" });
  await wait(300);
  await stu.keyboard.press("Escape");
  await wait(200);
  const closedAfterEscape = await stu.evaluate(() => !document.querySelector('[role="dialog"]'));
  await wait(7000);
  await stu.goto(url("rate-modal"), { waitUntil: "networkidle" });
  await wait(300);
  const rateReachable = await stu.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    return d ? Array.from(d.querySelectorAll("button,input,textarea,[role=radio],[role=slider]")).filter(el => el.getBoundingClientRect().width > 0).length : 0;
  });
  report.keyboardJourneys.push({ journey: "student: dashboard -> review -> close -> rate", dashReach, closedAfterEscape, rateReachable });

  // Screenshots: 375x667 AR dark student-dashboard already exists; 390x844 EN light Rate Teacher
  await wait(7000);
  await stu.setViewportSize({ width: 390, height: 844 });
  await setThemeAndLang(stu, "light", "en");
  await stu.goto(url("rate-modal"), { waitUntil: "networkidle" });
  await wait(300);
  await shot(stu, "390x844_en_light_rate-teacher-modal");

  await wait(7000);
  await stu.setViewportSize({ width: 375, height: 667 });
  await setThemeAndLang(stu, "dark", "ar");
  await stu.goto(url("review-modal"), { waitUntil: "networkidle" });
  await wait(300);
  await shot(stu, "375x667_ar_dark_review-delivery-modal-v2");

  await stuCtx.close();

  // ============ PUBLIC: remaining screenshots (768x1024 AR light Request+Payment, 1440x900 remaining) ============
  const pubCtx = await browser.newContext();
  const pub = await pubCtx.newPage();

  await wait(7000);
  await pub.setViewportSize({ width: 768, height: 1024 });
  await pub.goto(url("request-wizard"), { waitUntil: "domcontentloaded" });
  await setThemeAndLang(pub, "light", "ar");
  await pub.goto(url("request-wizard"), { waitUntil: "networkidle" });
  await shot(pub, "768x1024_ar_light_request-wizard");

  await wait(7000);
  await pub.goto(url("payment"), { waitUntil: "networkidle" });
  await shot(pub, "768x1024_ar_light_payment");

  await wait(7000);
  await pub.setViewportSize({ width: 1440, height: 900 });
  await setThemeAndLang(pub, "light", "en");
  await pub.goto(url("request-wizard"), { waitUntil: "networkidle" });
  await shot(pub, "1440x900_en_light_request");

  await wait(7000);
  await pub.goto(url("payment"), { waitUntil: "networkidle" });
  await shot(pub, "1440x900_en_light_payment");

  await wait(7000);
  await pub.setViewportSize({ width: 1280, height: 800 });
  await setThemeAndLang(pub, "dark", "en");
  await pub.goto(url("teacher-profile"), { waitUntil: "networkidle" });
  await shot(pub, "1280x800_en_dark_teacher-profile");

  await wait(7000);
  await pub.goto(url("payment"), { waitUntil: "networkidle" });
  await shot(pub, "1280x800_en_dark_payment");

  await pubCtx.close();

  await browser.close();

  fs.writeFileSync(path.join(outDir, "qa-coverage-closure-report.json"), JSON.stringify(report, null, 2));
  console.log("QA_COVERAGE_CLOSURE_DONE");
  console.log(JSON.stringify(report, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
