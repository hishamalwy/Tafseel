/**
 * Blocker-closure visual recert: Admin AR chrome + Teacher/Admin nav IA.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASE_URL, CREDENTIALS, loginAs, setThemeAndLang } from "./lib/auth.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join("docs", "features", "evidence", "final-product-convergence", "blocker-closure");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

if (!process.env.TAFSEEL_UAT_ADMIN_PASSWORD) throw new Error("Set TAFSEEL_UAT_ADMIN_PASSWORD (the Development SeedUsers:Password).");
if (!CREDENTIALS.Admin.password) CREDENTIALS.Admin.password = process.env.TAFSEEL_UAT_ADMIN_PASSWORD;
if (!CREDENTIALS.Teacher.password) CREDENTIALS.Teacher.password = process.env.TAFSEEL_UAT_TEACHER_PASSWORD || process.env.TAFSEEL_UAT_ADMIN_PASSWORD;
if (!CREDENTIALS.Student.password) CREDENTIALS.Student.password = process.env.TAFSEEL_UAT_STUDENT_PASSWORD || process.env.TAFSEEL_UAT_ADMIN_PASSWORD;
if (!CREDENTIALS.QualityReviewer.password) CREDENTIALS.QualityReviewer.password = process.env.TAFSEEL_UAT_ADMIN_PASSWORD;

async function shot(page, dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("shot", file);
  return file;
}

async function collectEnglishChrome(page) {
  return page.evaluate(() => {
    const chrome = [];
    const walk = (root) => {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        const t = (n.nodeValue || "").trim();
        if (!t || t.length > 60) continue;
        if (!/[A-Za-z]{3,}/.test(t)) continue;
        if (/^[\d\s.,%₹$€£\-/:]+$/.test(t)) continue;
        const p = n.parentElement;
        if (!p || p.closest("script,style,code,pre,[translate=no],[data-i18n-skip]")) continue;
        // skip user data cells that look like emails/names with latin
        if (/@/.test(t)) continue;
        chrome.push(t);
      }
    };
    walk(document.body);
    return [...new Set(chrome)].slice(0, 80);
  });
}

async function main() {
  const browser = await chromium.launch();
  const findings = { adminArChrome: [], teacherNav: {}, adminNav: {}, shots: [] };

  // Admin AR light desktop
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await loginAs(ctx, "Admin");
    await setThemeAndLang(page, "light", "ar");
    await page.goto(`${BASE_URL}/app/Tafseel-Admin-Dashboard.dc.html`, { waitUntil: "networkidle", timeout: 60000 });
    await wait(1000);
    findings.shots.push(await shot(page, path.join(OUT, "admin"), "1440-ar-light-overview"));
    // open nav groups present?
    findings.adminNav.groupLabels = await page.evaluate(() =>
      [...document.querySelectorAll(".tf-dash-nav-group-label")].map((el) => el.textContent.trim())
    );
    findings.adminNav.itemCount = await page.evaluate(() => document.querySelectorAll(".tf-dash-nav-item").length);
    findings.adminNav.hasNotifications = await page.evaluate(() =>
      [...document.querySelectorAll(".tf-dash-nav-item")].some((b) => /notif|إشعار/i.test(b.textContent))
    );

    // Users table chrome
    await page.click('.tf-dash-nav-item:has-text("المستخدمون"), .tf-dash-nav-item:has-text("Users")').catch(() => {});
    // navigate via evaluate to users
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll(".tf-dash-nav-item")].find((b) => /مستخدم|Users/i.test(b.textContent));
      if (btn) btn.click();
    });
    await wait(800);
    findings.shots.push(await shot(page, path.join(OUT, "admin"), "1440-ar-light-users"));

    // Settings
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll(".tf-dash-nav-item")].find((b) => /إعداد|Settings/i.test(b.textContent));
      if (btn) btn.click();
    });
    await wait(800);
    findings.shots.push(await shot(page, path.join(OUT, "admin"), "1440-ar-light-settings"));

    // Intelligence
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll(".tf-dash-nav-item")].find((b) => /ذكاء|Intelligence|Reports|تقارير/i.test(b.textContent));
      if (btn) btn.click();
    });
    await wait(1200);
    findings.shots.push(await shot(page, path.join(OUT, "admin"), "1440-ar-light-intelligence"));

    findings.adminArChrome = await collectEnglishChrome(page);

    // Mobile drawer
    await page.setViewportSize({ width: 390, height: 844 });
    await wait(400);
    await page.click("#admin-drawer-toggle").catch(() => {});
    await wait(500);
    findings.shots.push(await shot(page, path.join(OUT, "admin"), "390-ar-light-drawer"));

    await ctx.close();
  }

  // Admin EN dark
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await loginAs(ctx, "Admin");
    await setThemeAndLang(page, "dark", "en");
    await page.goto(`${BASE_URL}/app/Tafseel-Admin-Dashboard.dc.html`, { waitUntil: "networkidle", timeout: 60000 });
    await wait(900);
    findings.shots.push(await shot(page, path.join(OUT, "admin"), "1280-en-dark-overview"));
    await ctx.close();
  }

  // Teacher nav
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    let page;
    try {
      page = await loginAs(ctx, "Teacher");
    } catch (e) {
      console.warn("Teacher login failed, skipping teacher shots", e.message);
      await ctx.close();
      page = null;
    }
    if (page) {
      await setThemeAndLang(page, "light", "ar");
      await page.goto(`${BASE_URL}/app/Tafseel-Teacher-Dashboard.dc.html`, { waitUntil: "networkidle", timeout: 60000 });
      await wait(1000);
      findings.teacherNav.groupLabels = await page.evaluate(() =>
        [...document.querySelectorAll(".tf-dash-nav-group-label")].map((el) => el.textContent.trim())
      );
      findings.teacherNav.itemCount = await page.evaluate(() => document.querySelectorAll(".tf-dash-nav-item").length);
      findings.teacherNav.hasNotifications = await page.evaluate(() =>
        [...document.querySelectorAll(".tf-dash-nav-item")].some((b) => /notif|إشعار/i.test(b.textContent))
      );
      findings.shots.push(await shot(page, path.join(OUT, "teacher"), "1440-ar-light-overview"));
      await page.setViewportSize({ width: 390, height: 844 });
      await wait(400);
      await page.click("#teacher-drawer-toggle").catch(() => {});
      await wait(500);
      findings.shots.push(await shot(page, path.join(OUT, "teacher"), "390-ar-light-drawer"));
      await ctx.close();
    }
  }

  // Student / Quality spot checks for notifications not in sidebar + files gone
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const page = await loginAs(ctx, "Student");
      await page.goto(`${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html?section=files`, { waitUntil: "networkidle", timeout: 60000 });
      await wait(800);
      const filesDead = await page.evaluate(() => /Files|الملفات/.test(document.body.innerText) && !!document.querySelector('[data-section="files"]'));
      findings.studentFilesDead = !filesDead;
      findings.shots.push(await shot(page, path.join(OUT, "student"), "1280-en-files-redirect"));
    } catch (e) {
      console.warn("Student check skipped", e.message);
    }
    await ctx.close();
  }

  fs.writeFileSync(path.join(OUT, "visual-findings.json"), JSON.stringify(findings, null, 2));
  console.log("FINDINGS", JSON.stringify(findings, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
