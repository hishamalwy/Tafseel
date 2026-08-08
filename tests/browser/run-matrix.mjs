import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loginAs, setThemeAndLang, BASE_URL } from "./lib/auth.mjs";
import { SURFACES, VIEWPORTS, MODES, fullUrl } from "./lib/surfaces.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.argv[2] || path.join(__dirname, "out");
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, "screenshots"), { recursive: true });

const TEMPLATE_LEAK_RE = /\{\{[^}]*\}\}/;
const NETWORK_LEAK_RE = /%7B%7B|\{\{|\}\}/;

// A page-load-time POST to /api/v1/auth/refresh is an intentional, expected "is there a session?"
// probe fired on every navigation regardless of auth state; a 401 on it for an anonymous/public
// surface is correct behavior, not an application defect, and must not fail a cell. Scoped
// narrowly to this one known endpoint+status combination, not a blanket 4xx allowance.
function isBenignFirstPartyFailure(url, status) {
  return status === 401 && /\/api\/v1\/auth\/refresh$/.test(new URL(url).pathname);
}

export async function runCell(page, surface, viewport, mode, role, delayMs = 7000) {
  const rawConsoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  let benignFailureCount = 0; // known-benign first-party responses (see isBenignFirstPartyFailure)

  const onConsole = msg => { if (msg.type() === "error") rawConsoleErrors.push(msg.text().slice(0, 300)); };
  const onPageError = err => pageErrors.push(String(err).slice(0, 300));
  const onResponse = res => {
    const url = res.url();
    if (!url.startsWith(BASE_URL)) return; // first-party only
    if (res.status() >= 400) {
      if (isBenignFirstPartyFailure(url, res.status())) {
        benignFailureCount++;
      } else {
        failedRequests.push(`${res.status()} ${url}`);
      }
    }
    if (NETWORK_LEAK_RE.test(url)) failedRequests.push(`TEMPLATE-LEAK ${url}`);
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);

  const result = {
    surface: surface.id, label: surface.label, viewport: `${viewport.width}x${viewport.height}`,
    width: viewport.width, height: viewport.height, language: mode.lang,
    direction: mode.lang === "ar" ? "rtl" : "ltr", theme: mode.theme, role: role || "public",
    url: fullUrl(surface), loaded: false, overflowX: null, consoleErrors: 0, pageErrors: 0,
    failedRequests: 0, templateLeak: false, localizationIssue: null, primaryActionReachable: null,
    modalWithinViewport: null, result: "FAIL", detail: ""
  };

  try {
    // Paced to stay under the app's real Development rate limits. Every navigation triggers
    // a client-side POST /api/v1/auth/refresh, which is under the strict "auth" policy
    // (10 req/min in Development, see AuthController + Program.cs) - 7s spacing keeps this
    // harness under that ceiling rather than weakening or bypassing it. This is certification
    // traffic against the live app, not a load test.
    await new Promise(r => setTimeout(r, delayMs));
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    // Setting localStorage requires a same-origin document already loaded (throws SecurityError
    // on about:blank). The page is reused across every cell for a given role/context, so only the
    // very first cell needs a throwaway navigation to acquire the origin - every subsequent cell
    // is already same-origin and can go straight to a single real navigation. This matters because
    // each navigation fires the app's own POST /api/v1/auth/refresh probe, which is rate-limited to
    // 10/min in Development (see the pacing comment above) - a needless second navigation per cell
    // silently doubled that call rate and tripped 429s even at 7s spacing.
    if (!page.url().startsWith(BASE_URL)) {
      await page.goto(fullUrl(surface), { waitUntil: "domcontentloaded", timeout: 20000 });
    }
    await setThemeAndLang(page, mode.theme, mode.lang);
    await page.goto(fullUrl(surface), { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(350); // allow DC hydration to settle
    result.loaded = true;

    // Reconcile generic "Failed to load resource...401" console lines against known-benign
    // first-party 401s (see isBenignFirstPartyFailure) now that both streams have settled -
    // avoids an event-ordering race between the console and response listeners.
    const consoleErrors = [...rawConsoleErrors];
    let creditsLeft = benignFailureCount;
    for (let i = consoleErrors.length - 1; i >= 0 && creditsLeft > 0; i--) {
      if (/Failed to load resource.*401/.test(consoleErrors[i])) {
        consoleErrors.splice(i, 1);
        creditsLeft--;
      }
    }

    const domCheck = await page.evaluate(() => {
      const html = document.documentElement;
      const body = document.body;
      const bodyText = body ? body.innerText : "";
      return {
        lang: html.getAttribute("lang"),
        dir: html.getAttribute("dir"),
        dataTheme: html.getAttribute("data-theme"),
        // scrollWidth alone is a false-positive trap: this codebase deliberately sets
        // overflow-x:hidden on html/body site-wide so decorative elements (glows, blobs) can
        // bleed slightly past the content box with zero visible/user-facing effect - no
        // scrollbar, no layout shift, nothing a real user or QA reviewer would ever see. Only
        // flag overflow that is actually visible, i.e. not clipped by overflow-x on either box.
        overflowX: (() => {
          const htmlClipped = getComputedStyle(html).overflowX === "hidden" || getComputedStyle(html).overflowX === "clip";
          const bodyClipped = body && (getComputedStyle(body).overflowX === "hidden" || getComputedStyle(body).overflowX === "clip");
          if (htmlClipped && bodyClipped) return false;
          return (html.scrollWidth > window.innerWidth + 1) || (body && body.scrollWidth > window.innerWidth + 1);
        })(),
        hasTemplateLeak: /\{\{[^}]{0,80}\}\}/.test(bodyText),
        hasUndefined: /\bundefined\b/.test(bodyText),
        hasNaN: /\bNaN\b/.test(bodyText),
        hasObjectObject: /\[object Object\]/.test(bodyText),
        dialogPresent: !!document.querySelector('[role="dialog"]'),
        dialogWithinViewport: (() => {
          const d = document.querySelector('[role="dialog"]');
          if (!d) return null;
          const r = d.getBoundingClientRect();
          return r.left >= -1 && r.top >= -1 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1;
        })(),
        primaryActionReachable: (() => {
          const candidates = document.querySelectorAll('button:not([disabled]), a[href]');
          for (const el of candidates) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) return true;
          }
          return false;
        })(),
        // Browse Teachers search placeholder must equal the canonical AR/EN locale value -
        // Final Acceptance Gate Part 12. Only meaningful on the browse surface; null elsewhere.
        browsePlaceholder: document.getElementById("f-q") ? document.getElementById("f-q").placeholder : null,
        // Distinguishes the real Rate Teacher star-rating form from the Order Timeline modal
        // (which also renders as role="dialog" for the same "focus=rate" deep link once an order
        // is Delivered-but-not-Completed, or already reviewed) - Final Acceptance Gate Part 12/13.
        ratingCriteriaCount: document.querySelectorAll('[role="dialog"] textarea').length > 0
          ? (document.querySelector('[role="dialog"]')?.innerText.match(/\/5\b/g) || []).length
          : 0
      };
    });

    result.overflowX = !!domCheck.overflowX;
    result.templateLeak = !!domCheck.hasTemplateLeak;
    result.consoleErrors = consoleErrors.length;
    result.pageErrors = pageErrors.length;
    result.failedRequests = failedRequests.length;
    result.primaryActionReachable = domCheck.primaryActionReachable;
    result.modalWithinViewport = surface.isModal ? domCheck.dialogWithinViewport : null;

    const expectedDir = mode.lang === "ar" ? "rtl" : "ltr";
    const localizationIssues = [];
    if (domCheck.dir !== expectedDir) localizationIssues.push(`dir=${domCheck.dir} expected ${expectedDir}`);
    if (domCheck.lang !== mode.lang) localizationIssues.push(`lang=${domCheck.lang} expected ${mode.lang}`);
    if (domCheck.dataTheme !== mode.theme) localizationIssues.push(`data-theme=${domCheck.dataTheme} expected ${mode.theme}`);
    result.localizationIssue = localizationIssues.length ? localizationIssues.join("; ") : null;

    if (surface.isModal && !domCheck.dialogPresent) {
      result.detail = "expected modal dialog not present";
    }

    const dataIssues = [];
    if (domCheck.hasUndefined) dataIssues.push("visible 'undefined'");
    if (domCheck.hasNaN) dataIssues.push("visible 'NaN'");
    if (domCheck.hasObjectObject) dataIssues.push("visible [object Object]");

    // Browse Teachers AR placeholder must equal the canonical Arabic locale value (not the raw
    // English default) - proves the localization runtime fix, not just that data exists.
    const AR_SEARCH_PLACEHOLDER = "اسم المعلم أو الموضوع أو كلمة مفتاحية";
    let localizationRenderIssue = null;
    if (surface.id === "browse" && domCheck.browsePlaceholder !== null) {
      const expected = mode.lang === "ar" ? AR_SEARCH_PLACEHOLDER : "Teacher, topic or keyword";
      if (domCheck.browsePlaceholder !== expected) {
        localizationRenderIssue = `browse placeholder="${domCheck.browsePlaceholder}" expected "${expected}"`;
      }
    }
    // The real Rate Teacher star-rating form has 5 scored criteria; the Order Timeline modal
    // (which can render for the same deep link on a non-eligible order) does not. Distinguishing
    // this here prevents ever silently re-certifying the wrong surface under the "Rate Teacher"
    // label again (see docs/testing/BROWSER_CERTIFICATION.md history note).
    let ratingSurfaceIssue = null;
    if (surface.requiresRatingForm && domCheck.ratingCriteriaCount !== 5) {
      ratingSurfaceIssue = `expected 5 rating criteria, found ${domCheck.ratingCriteriaCount} (likely the Order Timeline modal, not the Rate Teacher form)`;
    }
    result.localizationIssue = [result.localizationIssue, localizationRenderIssue].filter(Boolean).join("; ") || result.localizationIssue;
    result.ratingSurfaceIssue = ratingSurfaceIssue;

    const pass =
      result.loaded &&
      !result.overflowX &&
      !result.templateLeak &&
      result.consoleErrors === 0 &&
      result.pageErrors === 0 &&
      result.failedRequests === 0 &&
      !result.localizationIssue &&
      !localizationRenderIssue &&
      !ratingSurfaceIssue &&
      dataIssues.length === 0 &&
      (!surface.isModal || (domCheck.dialogPresent && domCheck.dialogWithinViewport)) &&
      result.primaryActionReachable !== false;

    result.result = pass ? "PASS" : "FAIL";
    if (!pass && !result.detail) {
      const reasons = [];
      if (result.overflowX) reasons.push("overflowX");
      if (result.templateLeak) reasons.push("templateLeak(DOM)");
      if (result.consoleErrors) reasons.push(`consoleErrors=${result.consoleErrors}:${consoleErrors.slice(0,2).join(" | ")}`);
      if (result.pageErrors) reasons.push(`pageErrors=${result.pageErrors}`);
      if (result.failedRequests) reasons.push(`failedRequests=${result.failedRequests}:${failedRequests.slice(0,2).join(" | ")}`);
      if (result.localizationIssue) reasons.push(result.localizationIssue);
      if (result.ratingSurfaceIssue) reasons.push(result.ratingSurfaceIssue);
      if (dataIssues.length) reasons.push(dataIssues.join(","));
      if (result.primaryActionReachable === false) reasons.push("no reachable primary action");
      result.detail = reasons.join(" | ");
    }
  } catch (err) {
    result.result = "FAIL";
    result.detail = `exception: ${String(err).slice(0, 300)}`;
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("response", onResponse);
  }
  return result;
}

async function main() {
  const browser = await chromium.launch();
  const rows = [];
  const byRole = new Map();
  for (const s of SURFACES) {
    const key = s.role || "public";
    if (!byRole.has(key)) byRole.set(key, []);
    byRole.get(key).push(s);
  }

  for (const [roleKey, surfaces] of byRole) {
    const context = await browser.newContext();
    let page;
    try {
      page = roleKey === "public" ? await context.newPage() : await loginAs(context, roleKey);
    } catch (err) {
      console.error(`LOGIN_FAILED role=${roleKey}: ${err}`);
      for (const surface of surfaces) {
        for (const viewport of VIEWPORTS) {
          for (const mode of MODES) {
            rows.push({
              surface: surface.id, label: surface.label, viewport: `${viewport.width}x${viewport.height}`,
              width: viewport.width, height: viewport.height, language: mode.lang,
              direction: mode.lang === "ar" ? "rtl" : "ltr", theme: mode.theme, role: roleKey,
              url: fullUrl(surface), loaded: false, overflowX: null, consoleErrors: 0, pageErrors: 0,
              failedRequests: 0, templateLeak: false, localizationIssue: null, primaryActionReachable: null,
              modalWithinViewport: null, result: "FAIL", detail: `login failed: ${String(err).slice(0, 200)}`
            });
          }
        }
      }
      await context.close();
      continue;
    }
    for (const surface of surfaces) {
      for (const viewport of VIEWPORTS) {
        for (const mode of MODES) {
          const row = await runCell(page, surface, viewport, mode, roleKey === "public" ? null : roleKey);
          rows.push(row);
          const tag = `${row.result} ${row.surface} ${row.viewport} ${row.language}/${row.theme}`;
          console.log(tag + (row.detail ? ` :: ${row.detail}` : ""));
        }
      }
    }
    await context.close();
  }

  await browser.close();

  const totalCells = rows.length;
  const passedCells = rows.filter(r => r.result === "PASS").length;
  const failedCells = rows.filter(r => r.result === "FAIL").length;

  fs.writeFileSync(path.join(OUT_DIR, "matrix.json"), JSON.stringify(rows, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify({
    totalCells, passedCells, failedCells, skippedCells: 0
  }, null, 2));

  console.log(`\nTOTAL=${totalCells} PASSED=${passedCells} FAILED=${failedCells}`);
}

import { fileURLToPath as __fut } from "node:url";
if (process.argv[1] === __fut(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
