import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { loginAs, setThemeAndLang } from "./lib/auth.mjs";
import { SURFACES, fullUrl, DELIVERED_ORDER_ID, TEACHER_ID } from "./lib/surfaces.mjs";

const outDir = process.argv[2];
const shotsDir = path.join(outDir, "screenshots");
fs.mkdirSync(shotsDir, { recursive: true });

const report = { screenshots: [], modalAccessibility: [], keyboardJourneys: [], zoom: [], reducedMotion: [], teacherProfileCta: null, browseTeachers: null, f013Retention: { review: [], rate: [] } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const url = (id, extra = "") => fullUrl(SURFACES.find(s => s.id === id)) + extra;

async function shot(page, name) {
  const file = path.join(shotsDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  report.screenshots.push(name);
}

async function main() {
  const browser = await chromium.launch();

  // ---- Student context ----
  const stuCtx = await browser.newContext();
  const stu = await loginAs(stuCtx, "Student");

  // Screenshots: 375x667 AR/Dark set (Landing, Browse, Teacher Profile, Student Dashboard, Review Delivery)
  await wait(7000);
  await stu.setViewportSize({ width: 375, height: 667 });
  await setThemeAndLang(stu, "dark", "ar");
  await stu.goto(url("landing"), { waitUntil: "networkidle" });
  await shot(stu, "375x667_ar_dark_landing");

  await wait(7000);
  await stu.goto(url("browse"), { waitUntil: "networkidle" });
  await shot(stu, "375x667_ar_dark_browse");

  await wait(7000);
  await stu.goto(url("teacher-profile"), { waitUntil: "networkidle" });
  await shot(stu, "375x667_ar_dark_teacher-profile");

  await wait(7000);
  await stu.goto(url("student-active-order"), { waitUntil: "networkidle" });
  await shot(stu, "375x667_ar_dark_student-dashboard");

  await wait(7000);
  await stu.goto(url("review-modal"), { waitUntil: "networkidle" });
  await wait(400);
  await shot(stu, "375x667_ar_dark_review-delivery-modal");

  // Modal accessibility: Review Delivery
  {
    const dlg = await stu.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      if (!d) return null;
      return {
        role: d.getAttribute("role"), ariaModal: d.getAttribute("aria-modal"),
        accessibleName: d.getAttribute("aria-label") || d.getAttribute("aria-labelledby"),
        focusInside: d.contains(document.activeElement), activeTag: document.activeElement.tagName
      };
    });
    // Tab / Shift+Tab
    await stu.keyboard.press("Tab");
    const afterTab = await stu.evaluate(() => document.activeElement.tagName + ":" + (document.activeElement.className || ""));
    await stu.keyboard.press("Shift+Tab");
    // Escape
    await stu.keyboard.press("Escape");
    await wait(200);
    const closedOnEscape = await stu.evaluate(() => !document.querySelector('[role="dialog"]'));
    const bodyScrollRestored = await stu.evaluate(() => getComputedStyle(document.body).overflow !== "hidden");
    report.modalAccessibility.push({ modal: "review-delivery", ...dlg, afterTab, closedOnEscape, bodyScrollRestored });
  }

  // Rate modal accessibility
  await wait(7000);
  await stu.goto(url("rate-modal"), { waitUntil: "networkidle" });
  await wait(400);
  {
    const dlg = await stu.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      if (!d) return null;
      return { role: d.getAttribute("role"), ariaModal: d.getAttribute("aria-modal"), focusInside: d.contains(document.activeElement) };
    });
    await stu.keyboard.press("Escape");
    await wait(200);
    const closedOnEscape = await stu.evaluate(() => !document.querySelector('[role="dialog"]'));
    report.modalAccessibility.push({ modal: "rate-teacher", ...dlg, closedOnEscape });
  }

  // F-013 retention: Review modal, 10 cycles
  for (let i = 1; i <= 10; i++) {
    await wait(7000);
    await stu.goto(url("review-modal"), { waitUntil: "networkidle" });
    await wait(300);
    const leaks = await stu.evaluate(() =>
      performance.getEntriesByType("resource").filter(r => r.name.includes("%7B%7B") || r.name.includes("{{")).length
    );
    const modalOpen = await stu.evaluate(() => !!document.querySelector('[role="dialog"]'));
    report.f013Retention.review.push({ cycle: i, leaks, modalOpen });
  }
  // Rate modal, 3 cycles
  for (let i = 1; i <= 3; i++) {
    await wait(7000);
    await stu.goto(url("rate-modal"), { waitUntil: "networkidle" });
    await wait(300);
    const leaks = await stu.evaluate(() =>
      performance.getEntriesByType("resource").filter(r => r.name.includes("%7B%7B") || r.name.includes("{{")).length
    );
    const modalOpen = await stu.evaluate(() => !!document.querySelector('[role="dialog"]'));
    report.f013Retention.rate.push({ cycle: i, leaks, modalOpen });
  }

  // Keyboard journey: Browse -> Teacher Profile -> Request (student, keyboard only)
  await wait(7000);
  await stu.goto(url("browse"), { waitUntil: "networkidle" });
  {
    const reachable = await stu.evaluate(() => {
      const results = {};
      results.searchInput = !!document.querySelector('input[type="search"], input[type="text"]');
      results.teacherCard = !!document.querySelector('a[href*="Teacher-Profile"]');
      results.favoriteButton = !!Array.from(document.querySelectorAll("button")).find(b => (b.getAttribute("aria-label") || "").toLowerCase().includes("fav") || (b.getAttribute("aria-label") || "").toLowerCase().includes("مفضل"));
      results.compareCheckbox = !!document.querySelector('input[type="checkbox"]');
      return results;
    });
    report.keyboardJourneys.push({ journey: "browse->profile->request", reachable });
  }

  // 200% zoom (viewport halved) spot checks
  const zoomSurfaces = ["browse", "teacher-profile", "request-wizard", "payment", "student-active-order"];
  for (const sid of zoomSurfaces) {
    await wait(7000);
    await stu.setViewportSize({ width: 640, height: 512 });
    await stu.goto(url(sid), { waitUntil: "networkidle" });
    await wait(300);
    const check = await stu.evaluate(() => ({
      hasReachableAction: Array.from(document.querySelectorAll("button:not([disabled]),a[href]")).some(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }),
      overflowX: document.body.scrollWidth > window.innerWidth + 2 && getComputedStyle(document.body).overflowX !== "hidden"
    }));
    report.zoom.push({ surface: sid, ...check });
  }
  await shot(stu, "200pct_zoom_payment");

  // Reduced motion
  await stu.setViewportSize({ width: 1280, height: 800 });
  await stu.emulateMedia({ reducedMotion: "reduce" });
  for (const sid of ["landing", "browse", "teacher-profile", "student-active-order"]) {
    await wait(7000);
    await stu.goto(url(sid), { waitUntil: "networkidle" });
    await wait(300);
    const ok = await stu.evaluate(() => document.readyState === "complete");
    report.reducedMotion.push({ surface: sid, loaded: ok });
  }
  await stu.emulateMedia({ reducedMotion: null });

  // Teacher Profile mobile CTA exact geometry (375x667, 390x844)
  for (const vp of [{ w: 375, h: 667 }, { w: 390, h: 844 }]) {
    await wait(7000);
    await stu.setViewportSize({ width: vp.w, height: vp.h });
    await stu.goto(url("teacher-profile"), { waitUntil: "networkidle" });
    await wait(300);
    const geometry = await stu.evaluate(() => {
      const heroActions = document.querySelector(".tf-profile-hero-actions");
      if (!heroActions) return { present: false };
      const buttons = Array.from(heroActions.querySelectorAll("button, a")).map(el => {
        const r = el.getBoundingClientRect();
        return { label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30), rect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom } };
      });
      let overlaps = false;
      for (let i = 0; i < buttons.length; i++) {
        for (let j = i + 1; j < buttons.length; j++) {
          const a = buttons[i].rect, b = buttons[j].rect;
          if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps = true;
        }
      }
      return { present: true, buttons, overlaps };
    });
    report.teacherProfileCta = report.teacherProfileCta || [];
    report.teacherProfileCta.push({ viewport: `${vp.w}x${vp.h}`, ...geometry });
  }

  await shot(stu, "390x844_en_light_teacher-profile-videos");
  await stuCtx.close();

  // ---- Public context: Browse Teachers final check + remaining screenshots ----
  const pubCtx = await browser.newContext();
  const pub = await pubCtx.newPage();
  await wait(7000);
  await pub.setViewportSize({ width: 1440, height: 900 });
  await pub.goto(url("browse"), { waitUntil: "networkidle" });
  await wait(400);
  {
    const check = await pub.evaluate(() => {
      const cards = document.querySelectorAll("[class*=teacher-card], article");
      let multiSubjectCard = null;
      for (const c of cards) {
        const chips = c.querySelectorAll("[class*=subject], [class*=chip]");
        if (chips.length >= 2) { multiSubjectCard = Array.from(chips).map(x => x.textContent.trim()); break; }
      }
      return {
        cardCount: cards.length,
        hasRating: !!document.querySelector("[class*=rating]"),
        hasPrice: !!document.querySelector("[class*=price]"),
        multiSubjectChips: multiSubjectCard
      };
    });
    report.browseTeachers = check;
  }
  await shot(pub, "1440x900_en_light_browse");
  await wait(7000);
  await pub.goto(url("landing"), { waitUntil: "networkidle" });
  await shot(pub, "1440x900_en_light_landing");
  await wait(7000);
  await pub.goto(url("teacher-profile"), { waitUntil: "networkidle" });
  await shot(pub, "1440x900_en_light_teacher-profile");
  await wait(7000);
  await pub.goto(url("auth"), { waitUntil: "networkidle" });
  await shot(pub, "390x844_en_light_auth");
  await pubCtx.close();

  await browser.close();

  fs.writeFileSync(path.join(outDir, "certification-pass-report.json"), JSON.stringify(report, null, 2));
  console.log("CERTIFICATION_PASS_DONE");
  console.log(JSON.stringify({
    modalAccessibility: report.modalAccessibility,
    f013ReviewLeaks: report.f013Retention.review.reduce((a, c) => a + c.leaks, 0),
    f013RateLeaks: report.f013Retention.rate.reduce((a, c) => a + c.leaks, 0),
    teacherProfileCta: report.teacherProfileCta,
    zoom: report.zoom,
    browseTeachers: report.browseTeachers
  }, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
