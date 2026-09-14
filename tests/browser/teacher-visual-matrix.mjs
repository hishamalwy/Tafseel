/**
 * Teacher responsive / RTL / theme certification (PASS 05).
 *
 * Captures the Teacher evidence matrix AND asserts the responsive contract at every viewport, so a
 * run fails on a real defect instead of quietly producing screenshots nobody opened:
 *
 *   - no page-level horizontal overflow (table wrappers may scroll; the page may not)
 *   - the drawer toggle exists below the desktop breakpoint and the sidebar stays reachable
 *   - no visible labelled control is clipped to zero width
 *   - no untranslated interpolation leaks into the rendered page
 *   - the canonical page header survives every viewport, direction and theme
 *
 * Navigation is by data-nav-key, never by label: an earlier Admin run matched English labels, so in
 * Arabic every click silently missed and the whole matrix screenshotted one screen while claiming
 * to be eleven. A miss now fails loudly.
 *
 * Run: node tests/browser/teacher-visual-matrix.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loginAs, BASE_URL } from "./lib/auth.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..",
  "docs", "features", "evidence", "teacher-ux-convergence");

/** Section destinations only — the three Overview anchors are covered by the interaction suite. */
const SCREENS = ["overview", "opportunities", "services", "availability", "qualifications",
                 "samples", "reviews", "earnings", "withdrawals", "profile", "settings"];

const MODES = [
  { name: "1440-en-light", w: 1440, h: 900, theme: "light", lang: "en" },
  { name: "1440-ar-dark", w: 1440, h: 900, theme: "dark", lang: "ar" },
  { name: "390-en-light", w: 390, h: 844, theme: "light", lang: "en" },
  { name: "390-ar-dark", w: 390, h: 844, theme: "dark", lang: "ar" }
];
/** Density probes — the widths where a workspace is most likely to break. */
const PROBE_WIDTHS = [375, 768, 1024, 1280];
const PROBE_SCREENS = ["overview", "opportunities", "services", "earnings", "settings"];

const results = [];
let failed = 0;
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  if (!ok) { failed++; console.log(`FAIL  ${name}\n        ${detail}`); }
  // Zoom rows print their measured geometry so the evidence describes itself rather than
  // relying on someone eyeballing a PNG.
  else if (name.startsWith("zoom_")) console.log("PASS  " + name + " :: " + detail);
};

const auditViewport = (page) => page.evaluate(() => {
  const docW = document.documentElement.clientWidth;
  const clipped = [...document.querySelectorAll("main button, main a[href], #teacher-sidebar button")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return el.offsetParent !== null && r.width === 0 && (el.textContent || "").trim().length > 0;
    }).length;
  // A wrapper that scrolls is intentional; the PAGE overflowing is not.
  const pageOverflow = document.body.scrollWidth > docW + 1;
  const widest = [...document.querySelectorAll("main *")]
    .filter((el) => el.getBoundingClientRect().right > docW + 1 && !el.closest(".tf-table-wrap"))
    .slice(0, 1).map((el) => el.className || el.tagName)[0] || null;
  const unresolved = (document.querySelector("main")?.innerText.match(/\{\{[^}]*\}\}/g) || []).length;
  const drawerToggle = !!document.querySelector("[data-drawer-toggle], #teacher-drawer-toggle");
  const header = !!document.querySelector("main .tf-page-header");
  return { pageOverflow, widest, clipped, unresolved, drawerToggle, header };
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await loginAs(ctx, "SeedTeacher", 1, page);

async function setMode(theme, lang) {
  await page.evaluate(({ theme, lang }) => {
    localStorage.setItem("tafseel-theme", theme);
    localStorage.setItem("tafseel-lang", lang);
  }, { theme, lang });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
}
async function goto(key) {
  const sel = `#teacher-sidebar [data-nav-key="${key}"]`;
  const btn = await page.$(sel);
  if (!btn) throw new Error(`nav destination '${key}' not found`);
  // Below the desktop breakpoint the sidebar is an off-canvas drawer, so the item exists but sits
  // outside the viewport until the drawer is opened.
  const onscreen = async () => page.$eval(sel, (b) => {
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.right > 0 && r.left < window.innerWidth;
  });
  if (!(await onscreen())) {
    await page.click("[data-drawer-toggle], #teacher-drawer-toggle").catch(() => {});
    await page.waitForTimeout(500);
  }
  await page.$eval(sel, (b) => b.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(150);
  if (!(await onscreen())) throw new Error(`nav '${key}' is unreachable at this viewport`);
  await btn.click({ timeout: 15000 });
  await page.waitForTimeout(1300);
  // Prove the click landed rather than trusting it.
  const current = await page.$eval(sel, (b) => b.getAttribute("aria-current"));
  if (current !== "page") throw new Error(`nav '${key}' did not become current (aria-current=${current})`);
}

let shots = 0;
const sweep = async (dirName, screens, width, height, theme, lang) => {
  await page.setViewportSize({ width, height });
  await page.goto(`${BASE_URL}/app/Tafseel-Teacher-Dashboard.dc.html`, { waitUntil: "networkidle" });
  if (theme) await setMode(theme, lang);
  const dir = join(ROOT, dirName);
  mkdirSync(dir, { recursive: true });
  for (const screen of screens) {
    try {
      await goto(screen);
    } catch (e) {
      record(`nav_${screen} @ ${dirName}`, false, e.message);
      continue;
    }
    await page.screenshot({ path: join(dir, `${screen}.png`) });
    shots++;
    const a = await auditViewport(page);
    const label = `${screen} @ ${dirName}`;
    if (a.pageOverflow) record(`overflow_${label}`, false, `page scrolls horizontally (widest: ${a.widest})`);
    if (a.clipped) record(`clipped_${label}`, false, `${a.clipped} labelled control(s) collapsed to zero width`);
    if (a.unresolved) record(`unresolved_${label}`, false, `${a.unresolved} unresolved {{ }} placeholder(s)`);
    if (!a.header) record(`header_${label}`, false, "no canonical .tf-page-header on this surface");
    record(`ok_${label}`, true, "");
  }
};

for (const m of MODES) await sweep(m.name, SCREENS, m.w, m.h, m.theme, m.lang);
await setMode("light", "en");
for (const width of PROBE_WIDTHS) await sweep(`${width}-en-light`, PROBE_SCREENS, width, 900, null, null);


// ------------------------------------------------------------------ 200% browser zoom (PASS 05 R3)
/**
 * Genuine 200% browser zoom, not a simulation of one.
 *
 * The technique is a CDP `Emulation.setDeviceMetricsOverride` that halves the CSS viewport while
 * doubling the device pixel ratio. That is precisely what Chrome does at 200% zoom: a 1280x800
 * physical window becomes a 640x400 CSS viewport at DPR 2, and layout reflows against the smaller
 * CSS viewport. It is deliberately NOT any of the shortcuts that would look similar and prove
 * nothing:
 *   - a 375px viewport is a small screen at DPR 1, not a zoomed large one;
 *   - `transform: scale()` paints bigger without reflowing, so it cannot surface a reflow bug;
 *   - a resized screenshot changes only the image;
 *   - `deviceScaleFactor` alone raises pixel density without changing the CSS viewport at all.
 *
 * Each assertion below is checked only while the override is active, and the run fails if the zoom
 * is not actually in effect — so deleting the zoom cannot leave a green suite behind.
 */
const ZOOM_BASE = { width: 1280, height: 800 };
const zoomAudit = (page) => page.evaluate(() => {
  const docW = document.documentElement.clientWidth;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return el.offsetParent !== null && r.width > 0 && r.height > 0;
  };
  const labelled = [...document.querySelectorAll("main button, main a[href], #teacher-sidebar button")]
    .filter((el) => (el.textContent || "").trim().length > 0);
  const title = document.querySelector("main .tf-page-header h1");
  const titleBox = title ? title.getBoundingClientRect() : null;
  /** A wrapper that scrolls is intentional; the PAGE scrolling sideways is not. */
  const widest = [...document.querySelectorAll("main *")]
    .filter((el) => el.getBoundingClientRect().right > docW + 1 && !el.closest(".tf-table-wrap"))
    .slice(0, 1).map((el) => el.className || el.tagName)[0] || null;
  /** Money and date cells must not be visually truncated by the narrower CSS viewport. */
  const clippedText = [...document.querySelectorAll(
    "main .tf-money-amt, main .tf-table__money, main .tf-price-line, main td, main .tf-teacher-readiness-item")]
    .filter((el) => visible(el) && el.scrollWidth > el.clientWidth + 2
      && getComputedStyle(el).overflow !== "visible").length;
  return {
    cssViewport: window.innerWidth,
    dpr: window.devicePixelRatio,
    pageOverflow: document.body.scrollWidth > docW + 1,
    widest,
    zeroWidthControls: labelled.filter((el) => el.offsetParent !== null
      && el.getBoundingClientRect().width === 0).length,
    titleVisible: !!titleBox && titleBox.width > 0 && titleBox.height > 0 && titleBox.top < window.innerHeight,
    unresolved: (document.querySelector("main")?.innerText.match(/\{\{[^}]*\}\}/g) || []).length,
    navReachable: !!document.querySelector("[data-drawer-toggle], #teacher-drawer-toggle")
      || visible(document.querySelector("#teacher-sidebar [data-nav-key]") || document.createElement("i")),
    clippedText,
    statusText: [...document.querySelectorAll("main .tf-badge[data-tone]")]
      .filter(visible).map((b) => b.textContent.trim()).filter(Boolean)
  };
});

/**
 * Wait for the off-canvas drawer to reach a resting position before measuring or screenshotting.
 *
 * `goto` opens the drawer to reach a nav item and the drawer animates closed on navigation. Capturing
 * during that animation produced a "200% zoom" screenshot showing a half-clipped sidebar overlapping
 * a crushed Active Orders table — a transition frame presented as the settled layout. The settled
 * layout is correct; the evidence was not. Resting means fully on-screen or fully off-canvas, never
 * partially overlapping.
 */
const settle = async (page) => {
  // `goto` opens the drawer to reach a nav item; clicking the item that is already current does not
  // toggle it back, so an open drawer sits over the content. Close it explicitly before measuring.
  const open = await page.evaluate(() => {
    const aside = document.querySelector("#teacher-sidebar");
    return !!aside && aside.getAttribute("data-drawer") === "open";
  });
  if (open) {
    await page.click("[data-drawer-toggle], #teacher-drawer-toggle").catch(() => {});
  }
  await page.waitForFunction(() => {
    const aside = document.querySelector("#teacher-sidebar");
    if (!aside) return true;
    const r = aside.getBoundingClientRect();
    // Resting = fully off-canvas, or fully visible without covering the content beside it.
    return r.right <= 0.5 || r.left >= -0.5;
  }, { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(600);
};

/** Apply / release real browser zoom through the device-metrics override. */
async function withZoom(page, factor, fn) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: Math.round(ZOOM_BASE.width / factor),
    height: Math.round(ZOOM_BASE.height / factor),
    deviceScaleFactor: factor,
    mobile: false
  });
  /**
   * Capture through CDP, not page.screenshot().
   *
   * Playwright's screenshot path applies its own device-metrics override and clobbers this one, so
   * `page.screenshot()` produced a 1280px-wide unzoomed image while every assertion above it had
   * been measured at 640px. The picture disagreed with the proof. Page.captureScreenshot leaves the
   * override alone, so the image IS the state that was asserted.
   */
  const shot = async (path) => {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(path, Buffer.from(data, "base64"));
  };
  // Reload under the override so load-time device gates (the off-canvas drawer among them) re-run
  // against the zoomed CSS viewport instead of the one the page was originally laid out for.
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  try { return await fn(shot); }
  finally { await cdp.send("Emulation.clearDeviceMetricsOverride"); await cdp.detach(); }
}

const zoomDir = join(ROOT, "zoom-200");
mkdirSync(zoomDir, { recursive: true });

/**
 * Overview at 200%, EN Light — the work board, including the Active Orders table whose row actions
 * are the densest controls a Teacher uses.
 */
await page.setViewportSize(ZOOM_BASE);
await page.goto(`${BASE_URL}/app/Tafseel-Teacher-Dashboard.dc.html`, { waitUntil: "networkidle" });
await setMode("light", "en");
await withZoom(page, 2, async (shot) => {
  await goto("overview");
  await settle(page);
  const a = await zoomAudit(page);
  const label = "overview @ 200% EN-Light";

  // Prove the zoom is actually in effect before trusting anything measured under it.
  if (a.cssViewport > 700 || a.dpr < 2) {
    record(`zoom_active_${label}`, false,
      `zoom not applied (css viewport ${a.cssViewport}px, dpr ${a.dpr})`);
    return;
  }
  if (true) record(`zoom_overflow_${label}`, false, `page scrolls horizontally (widest: ${a.widest})`);
  if (a.zeroWidthControls) record(`zoom_clipped_${label}`, false, `${a.zeroWidthControls} labelled control(s) collapsed`);
  if (!a.titleVisible) record(`zoom_title_${label}`, false, "the page title is not visible");
  if (!a.navReachable) record(`zoom_nav_${label}`, false, "navigation is unreachable at 200%");
  if (a.unresolved) record(`zoom_unresolved_${label}`, false, `${a.unresolved} unresolved placeholder(s)`);
  if (a.clippedText) record(`zoom_text_${label}`, false, `${a.clippedText} money/date cell(s) visually truncated`);

  /**
   * A resting drawer must be fully open or fully away. A partial overlap steals width from the
   * content underneath it, which is what made the first zoom screenshot look broken.
   */
  const drawer = await page.evaluate(() => {
    const aside = document.querySelector("#teacher-sidebar");
    if (!aside) return null;
    const r = aside.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
  });
  if (drawer && drawer.right > 0.5 && drawer.left < -0.5) {
    record(`zoom_drawer_${label}`, false,
      `the sidebar rests partially over the content (left ${drawer.left}, right ${drawer.right})`);
  }

  /** Active Orders row actions must remain reachable — the brief's dense-control requirement. */
  const orders = await page.evaluate(() => {
    const table = document.querySelector("#active-orders table");
    if (!table) return { rows: 0, actions: 0, hidden: 0 };
    const actions = [...table.querySelectorAll("tbody button, tbody a[href]")];
    const hidden = actions.filter((b) => {
      const r = b.getBoundingClientRect();
      return b.offsetParent === null || r.width === 0 || r.height === 0;
    }).length;
    return { rows: table.querySelectorAll("tbody tr").length, actions: actions.length, hidden };
  });
  if (orders.actions && orders.hidden) {
    record(`zoom_order_actions_${label}`, false, `${orders.hidden}/${orders.actions} order row action(s) unreachable`);
  }

  /** Keyboard focus must stay visible under zoom. */
  await page.keyboard.press("Tab");
  await page.waitForTimeout(200);
  const focus = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      onScreen: r.width > 0 && r.height > 0,
      ring: cs.outlineStyle !== "none" || cs.boxShadow !== "none" || cs.borderColor !== "rgba(0, 0, 0, 0)"
    };
  });
  if (!focus || !focus.onScreen) record(`zoom_focus_${label}`, false, "focused element is not visible at 200%");
  else if (!focus.ring) record(`zoom_focus_ring_${label}`, false, "focused element shows no visible focus indicator");

  await shot(join(zoomDir, "overview-200zoom-en-light.png"));
  shots++;
  record(`zoom_ok_${label}`, true,
    `css viewport ${a.cssViewport}px @ dpr ${a.dpr}, drawer ${drawer ? `[${drawer.left},${drawer.right}]` : "n/a"}; `
    + `${orders.rows} order row(s), `
    + `${orders.actions} action(s) all reachable; status: ${a.statusText.join(", ") || "none"}`);
});

/**
 * Services at 200%, AR Dark — the densest configuration surface, under RTL pressure at the same time.
 */
await page.setViewportSize(ZOOM_BASE);
await setMode("dark", "ar");
await withZoom(page, 2, async (shot) => {
  await goto("services");
  await settle(page);
  const a = await zoomAudit(page);
  const label = "services @ 200% AR-Dark";

  if (a.cssViewport > 700 || a.dpr < 2) {
    record(`zoom_active_${label}`, false,
      `zoom not applied (css viewport ${a.cssViewport}px, dpr ${a.dpr})`);
    return;
  }
  const dir = await page.evaluate(() => document.documentElement.dir);
  if (dir !== "rtl") record(`zoom_rtl_${label}`, false, `direction is '${dir}', not rtl`);
  if (a.pageOverflow) record(`zoom_overflow_${label}`, false, `page scrolls horizontally (widest: ${a.widest})`);
  if (a.zeroWidthControls) record(`zoom_clipped_${label}`, false, `${a.zeroWidthControls} labelled control(s) collapsed`);
  if (!a.titleVisible) record(`zoom_title_${label}`, false, "the page title is not visible");
  if (!a.navReachable) record(`zoom_nav_${label}`, false, "navigation is unreachable at 200%");
  if (a.unresolved) record(`zoom_unresolved_${label}`, false, `${a.unresolved} unresolved placeholder(s)`);
  if (a.clippedText) record(`zoom_text_${label}`, false, `${a.clippedText} money/date cell(s) visually truncated`);

  /**
   * A resting drawer must be fully open or fully away. A partial overlap steals width from the
   * content underneath it, which is what made the first zoom screenshot look broken.
   */
  const drawer = await page.evaluate(() => {
    const aside = document.querySelector("#teacher-sidebar");
    if (!aside) return null;
    const r = aside.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
  });
  if (drawer && drawer.right > 0.5 && drawer.left < -0.5) {
    record(`zoom_drawer_${label}`, false,
      `the sidebar rests partially over the content (left ${drawer.left}, right ${drawer.right})`);
  }

  /** The Configure / Enable action is the primary job of this surface; it must survive the zoom. */
  const configure = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("main button")]
      .filter((b) => /configure|enable|disable|تهيئة|تفعيل|تعطيل/i.test(b.textContent || ""));
    const reachable = buttons.filter((b) => {
      const r = b.getBoundingClientRect();
      return b.offsetParent !== null && r.width > 0 && r.height > 0 && r.left < window.innerWidth && r.right > 0;
    });
    return { total: buttons.length, reachable: reachable.length, sample: reachable.slice(0, 3).map((b) => b.textContent.trim()) };
  });
  if (!configure.total) record(`zoom_configure_${label}`, false, "no configure/enable action rendered at 200%");
  else if (configure.reachable < configure.total) {
    record(`zoom_configure_${label}`, false,
      `${configure.total - configure.reachable}/${configure.total} configure action(s) unreachable at 200%`);
  }

  /** Opening the service dialog at 200% proves its footer actions are not pushed out of reach. */
  let dialog = { opened: false, footerReachable: null };
  const opener = await page.$("main button:has-text('تهيئة'), main button:has-text('تفعيل'), "
    + "main button:has-text('Configure'), main button:has-text('Enable')");
  if (opener) {
    await opener.click();
    await page.waitForTimeout(900);
    dialog = await page.evaluate(() => {
      const panel = [...document.querySelectorAll(".tf-modal, [role='dialog']")]
        .find((d) => !d.classList.contains("tf-chat-widget") && d.offsetParent !== null);
      if (!panel) return { opened: false, footerReachable: null };
      const actions = [...panel.querySelectorAll("footer button, .tf-modal-footer button, button[type='submit']")];
      const reachable = actions.filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0;
      });
      // The panel itself must be scrollable to its own footer rather than clipping it away.
      const scrollable = panel.scrollHeight <= panel.clientHeight + 2
        || getComputedStyle(panel).overflowY !== "visible"
        || [...panel.querySelectorAll("*")].some((el) => getComputedStyle(el).overflowY === "auto");
      return { opened: true, actions: actions.length, reachable: reachable.length, scrollable };
    });
    if (dialog.opened && dialog.actions && !dialog.reachable && !dialog.scrollable) {
      record(`zoom_dialog_footer_${label}`, false, "the dialog footer actions are unreachable at 200%");
    }
    await shot(join(zoomDir, "services-dialog-200zoom-ar-dark.png"));
    shots++;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
  }

  await shot(join(zoomDir, "services-200zoom-ar-dark.png"));
  shots++;
  record(`zoom_ok_${label}`, true,
    `css viewport ${a.cssViewport}px @ dpr ${a.dpr}, dir=${dir}; `
    + `${configure.reachable}/${configure.total} configure action(s) reachable (${configure.sample.join(", ")}); `
    + `dialog ${dialog.opened ? "opened, footer reachable" : "not opened"}`);
});
await setMode("light", "en");

await ctx.close();
await browser.close();

const checks = results.length;
console.log(`\n${checks - failed}/${checks} responsive/RTL/theme assertions passed across ${shots} screenshots.`);
console.log(`Evidence: ${ROOT}`);
if (failed) { console.error("Teacher visual matrix FAILED."); process.exit(1); }
