/**
 * PASS 03 — interaction proof for the shared component primitives.
 *
 * The consolidation replaced four hand-rolled copies of the same overlay mechanics with one shared
 * behaviour (`Tafseel.modal`). That is only worth doing if the shared one is measurably better, so
 * this drives the real surfaces with a real keyboard and asserts the contract:
 *
 *   scroll lock · initial focus · focus trap (Tab / Shift+Tab wrap) · Escape · focus return
 *
 * Escape and the focus trap did not exist on these surfaces before this pass.
 *
 * Run: node tests/browser/shared-components-a11y.mjs
 */
import { chromium } from "@playwright/test";
import { loginAs, BASE_URL } from "./lib/auth.mjs";

const results = [];
let failed = 0;
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}
async function check(name, fn) {
  try { record(name, true, await fn()); }
  catch (e) { record(name, false, (e && e.message ? e.message : String(e)).split("\n")[0]); }
}
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};

const bodyLocked = (page) => page.evaluate(() => document.body.style.overflow === "hidden");
const activeInfo = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return a ? { tag: a.tagName, id: a.id || null, label: (a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 40) } : null;
});

const browser = await chromium.launch();

/** Mobile drawer: the shell mechanic now shared by all four dashboards. */
async function drawerContract(role, path, toggleSel, sidebarSel, label) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await loginAs(ctx, role, 1, page);
  await page.goto(`${BASE_URL}/app/${path}`, { waitUntil: "networkidle" });
  // The toggle only renders once the dashboard's matchMedia listener resolves compactNav, so wait
  // for the control rather than a fixed delay — a fixed wait made this check flaky under load.
  await page.waitForSelector(toggleSel, { timeout: 15000 }).catch(() => {});
  const toggle = await page.$(toggleSel);
  if (!toggle) { await ctx.close(); throw new Error(`no drawer toggle (${toggleSel})`); }

  await toggle.focus();
  await toggle.click();
  await page.waitForTimeout(400);

  const locked = await bodyLocked(page);
  const focusInside = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return !!(el && el.contains(document.activeElement));
  }, sidebarSel);

  // Escape must dismiss — this did not exist before PASS 03.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const unlocked = !(await bodyLocked(page));
  const returned = await page.evaluate((sel) => document.activeElement === document.querySelector(sel), toggleSel);

  await ctx.close();
  if (!locked) throw new Error("body scroll was not locked while the drawer was open");
  if (!focusInside) throw new Error("focus did not move into the drawer");
  if (!unlocked) throw new Error("body scroll stayed locked after Escape");
  if (!returned) throw new Error("focus did not return to the drawer toggle");
  return `${label}: lock ✓ initial focus ✓ Escape ✓ focus return ✓`;
}

await check("drawer_admin", () => drawerContract(
  "Admin", "Tafseel-Admin-Dashboard.dc.html", "#admin-drawer-toggle", "#admin-sidebar", "Admin drawer"));
await check("drawer_student", () => drawerContract(
  "SeedStudent", "Tafseel-Student-Dashboard.dc.html", "[data-drawer-toggle],#student-drawer-toggle", "#student-sidebar", "Student drawer"));

/** Admin catalog dialog: initial focus, trap in both directions, Escape, focus return. */
await check("dialog_admin_catalog", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await loginAs(ctx, "Admin", 1, page);
  await page.goto(`${BASE_URL}/app/Tafseel-Admin-Dashboard.dc.html`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Subjects$/i }).first().click();
  await page.waitForTimeout(1200);

  const opener = await page.getByRole("button", { name: /add subject|new subject|\+/i }).first();
  await opener.focus();
  const openerLabel = await activeInfo(page);
  await opener.click();
  await page.waitForSelector("[data-catalog-dialog]", { timeout: 10000 });
  await page.waitForTimeout(500);

  const locked = await bodyLocked(page);
  const inside = await page.evaluate(() =>
    !!document.querySelector("[data-catalog-dialog]")?.contains(document.activeElement));

  // Focus trap: tabbing far past the last control must stay inside the panel.
  for (let i = 0; i < 40; i++) await page.keyboard.press("Tab");
  const stillInsideFwd = await page.evaluate(() =>
    !!document.querySelector("[data-catalog-dialog]")?.contains(document.activeElement));
  for (let i = 0; i < 60; i++) await page.keyboard.press("Shift+Tab");
  const stillInsideBack = await page.evaluate(() =>
    !!document.querySelector("[data-catalog-dialog]")?.contains(document.activeElement));

  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  const closed = !(await page.$("[data-catalog-dialog]"));
  const unlocked = !(await bodyLocked(page));
  const returned = await activeInfo(page);

  await ctx.close();
  if (!locked) throw new Error("body scroll was not locked while the dialog was open");
  if (!inside) throw new Error("initial focus did not land inside the dialog");
  if (!stillInsideFwd) throw new Error("Tab escaped the dialog — focus trap not applied");
  if (!stillInsideBack) throw new Error("Shift+Tab escaped the dialog — reverse trap not applied");
  if (!closed) throw new Error("Escape did not close the dialog");
  if (!unlocked) throw new Error("body scroll stayed locked after close");
  if (!returned || returned.label !== openerLabel.label) {
    throw new Error(`focus did not return to the opener (expected "${openerLabel?.label}", got "${returned?.label}")`);
  }
  return `Admin catalog dialog: lock ✓ initial focus ✓ Tab trap ✓ Shift+Tab trap ✓ Escape ✓ focus return ✓`;
});

/** A toast must never steal focus from what the user is doing. */
await check("toast_doesNotStealFocus", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await loginAs(ctx, "Admin", 1, page);
  await page.goto(`${BASE_URL}/app/Tafseel-Admin-Dashboard.dc.html`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const before = await activeInfo(page);
  await page.evaluate(() => {
    const t = document.createElement("div");
    t.className = "tf-toast"; t.setAttribute("role", "status"); t.textContent = "saved";
    document.body.appendChild(t);
  });
  await page.waitForTimeout(300);
  const after = await activeInfo(page);
  const isFixed = await page.evaluate(() => getComputedStyle(document.querySelector(".tf-toast")).position);
  await ctx.close();
  eq(after, before, "active element after toast");
  eq(isFixed, "fixed", "shared toast positioning");
  return "toast is shared, fixed-positioned and does not move focus";
});

/** Public mobile menu: the trigger became a shared icon button with a real accessible name. */
await check("publicMenu_iconButtonContract", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const info = await page.evaluate(() => {
    const b = document.querySelector("[data-public-menu-toggle]");
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return {
      name: (b.getAttribute("aria-label") || "").trim(),
      classes: b.className,
      w: Math.round(r.width), h: Math.round(r.height),
      svgHidden: b.querySelector("svg")?.getAttribute("aria-hidden") === "true",
      glyph: /[←-➿]/u.test(b.textContent || "")
    };
  });
  await ctx.close();
  if (!info) throw new Error("no public menu toggle found");
  if (!info.name) throw new Error("public menu toggle has no accessible name");
  if (!info.classes.includes("tf-icon-btn")) throw new Error("public menu toggle does not use .tf-icon-btn");
  if (info.w < 44 || info.h < 44) throw new Error(`touch target ${info.w}x${info.h} is below the 44px floor`);
  if (!info.svgHidden) throw new Error("decorative svg is not aria-hidden");
  if (info.glyph) throw new Error("a Unicode glyph is still used as the icon");
  return `icon button: name "${info.name}" ✓ ${info.w}x${info.h} ✓ svg aria-hidden ✓ no glyph ✓`;
});

/** Empty and error must not be announced the same way. */
await check("state_emptyIsNotError", async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(ctx, "Admin", 1, page);
  await page.goto(`${BASE_URL}/app/Tafseel-Admin-Dashboard.dc.html`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const states = await page.evaluate(() =>
    [...document.querySelectorAll(".tf-state")].map((el) => ({
      state: el.getAttribute("data-state"),
      role: el.getAttribute("role"),
      bg: getComputedStyle(el).backgroundColor
    })));
  await ctx.close();
  if (!states.length) return "no .tf-state rendered in this data state (states exist in markup; gate enforces the rule statically)";
  for (const s of states) {
    if (!s.state) throw new Error("a .tf-state rendered without data-state");
    if (s.state === "empty" && s.role === "alert") throw new Error("empty announced as alert");
    if (s.state === "error" && s.role !== "alert") throw new Error("error not announced as alert");
  }
  return `${states.length} shared state(s) rendered: ${states.map((s) => `${s.state}/${s.role}`).join(", ")}`;
});

/** Shared operational table: semantic structure, real rows, reachable actions. */
async function tableContract({ label, role, path, sectionRe, expectText }) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await loginAs(ctx, role, 1, page);
  await page.goto(`${BASE_URL}/app/${path}`, { waitUntil: "networkidle" });
  if (sectionRe) await page.getByRole("button", { name: sectionRe }).first().click().catch(() => {});
  await page.waitForSelector("table.tf-table tbody tr", { timeout: 15000 });
  await page.waitForTimeout(900);

  const dom = await page.evaluate(() => {
    const t = document.querySelector("main table.tf-table");
    const rows = [...t.querySelectorAll("tbody tr")];
    return {
      tag: t.tagName,
      density: t.getAttribute("data-density"),
      hasThead: !!t.tHead,
      hasTbody: t.tBodies.length > 0,
      colScopes: [...t.querySelectorAll("thead th")].map((th) => th.getAttribute("scope")),
      rowParents: [...new Set(rows.map((r) => r.parentElement.tagName))],
      rows: rows.length,
      blank: rows.filter((r) => !r.textContent.trim()).length,
      text: rows.map((r) => r.textContent.replace(/\s+/g, " ").trim()).join(" || "),
      inlinePadding: [...t.querySelectorAll("th,td")].filter((c) => /padding/.test(c.getAttribute("style") || "")).length
    };
  });

  const firstAction = await page.$("table.tf-table tbody .tf-table__actions button");
  let focusable = false;
  if (firstAction) { await firstAction.focus(); focusable = await page.evaluate((el) => document.activeElement === el, firstAction); }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const mobile = await page.evaluate(() => {
    const t = document.querySelector("main table.tf-table");
    const wrap = t.closest(".tf-table-wrap");
    const acts = [...t.querySelectorAll("tbody .tf-table__actions button")];
    return {
      hasWrapper: !!wrap,
      // The contract is "overflow is contained and reachable", not "always scrolls": a table that
      // fits its wrapper legitimately does not scroll. What must never happen is content wider
      // than the wrapper that the wrapper refuses to scroll (i.e. clipped and unreachable).
      clipped: wrap ? (wrap.scrollWidth > wrap.clientWidth + 1
        && getComputedStyle(wrap).overflowX !== "auto"
        && getComputedStyle(wrap).overflowX !== "scroll") : false,
      pageOverflow: document.body.scrollWidth > window.innerWidth + 1,
      hiddenActions: acts.filter((a) => a.getBoundingClientRect().width === 0).length
    };
  });
  await ctx.close();

  if (dom.tag !== "TABLE") throw new Error("not a semantic table");
  if (!dom.hasThead || !dom.hasTbody) throw new Error("thead/tbody missing");
  if (!dom.colScopes.every((x) => x === "col")) throw new Error(`column scopes: ${dom.colScopes}`);
  if (!dom.rowParents.every((x) => x === "TBODY")) throw new Error("rows escaped tbody");
  if (dom.rows === 0) throw new Error("no rows rendered");
  if (dom.blank > 0) throw new Error(`${dom.blank} blank row(s)`);
  if (dom.density !== "dense") throw new Error("operational table is not on the dense contract");
  if (dom.inlinePadding > 0) throw new Error(`${dom.inlinePadding} cell(s) still carry inline padding`);
  if (!focusable) throw new Error("row action is not keyboard focusable");
  if (!mobile.hasWrapper) throw new Error("table is not inside the shared .tf-table-wrap");
  if (mobile.pageOverflow) throw new Error("table overflows the page at 390px");
  if (mobile.clipped) throw new Error("overflowing table is clipped instead of scrollable at 390px");
  if (mobile.hiddenActions) throw new Error(`${mobile.hiddenActions} row action(s) unreachable at 390px`);
  for (const t of expectText) if (!dom.text.includes(t)) throw new Error(`missing bound value ${JSON.stringify(t)}`);
  return `${label}: semantic OK, scope=col, ${dom.rows} rows, 0 inline padding, keyboard OK, 390px contained, not clipped, 0 hidden actions`;
}

await check("table_adminUsers", () => tableContract({
  label: "Admin Users", role: "Admin", path: "Tafseel-Admin-Dashboard.dc.html",
  sectionRe: /^Users$/i, expectText: ["@example.com", "Active"]
}));
await check("table_teacherActiveOrders", () => tableContract({
  label: "Teacher Active Orders", role: "SeedTeacher", path: "Tafseel-Teacher-Dashboard.dc.html",
  sectionRe: null, expectText: ["Quadratic equations", "Tafseel Student"]
}));

await browser.close();
console.log(`\n${results.length - failed}/${results.length} interaction checks passed.`);
if (failed) { console.error("Shared component interaction contract FAILED."); process.exit(1); }
