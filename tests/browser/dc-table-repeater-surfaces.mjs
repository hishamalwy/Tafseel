/**
 * PASS 01 — real-surface proof for the repaired table repeaters.
 *
 * Logs in through the real Auth page with Development-seeded credentials, drives each affected
 * product surface with its own canonical API data, and asserts that the number of rendered
 * semantic data rows matches the collection the API actually returned — and that the cells are
 * bound, not blank.
 *
 * Requires the Development API (see .claude/launch.json "tafseel-dev") and
 * TAFSEEL_UAT_ADMIN_PASSWORD / TAFSEEL_UAT_STUDENT_PASSWORD / TAFSEEL_UAT_TEACHER_PASSWORD.
 *
 * Run:  node tests/browser/dc-table-repeater-surfaces.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loginAs, BASE_URL } from "./lib/auth.mjs";

// Resolved against the repository root so the run works from any working directory.
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), "..", "..",
  "docs", "features", "evidence", "dc-table-repeater-runtime-repair");
mkdirSync(SHOTS, { recursive: true });

const results = [];
let failed = 0;
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}
async function check(name, fn) {
  try { record(name, true, await fn()); }
  catch (e) { record(name, false, e && e.message ? e.message : String(e)); }
}

/**
 * Rows that carry real bound content, plus a blank-row count — the exact reported symptom.
 * `dataRowSel` isolates the primary data row when a repeat body emits more than one `<tr>` per
 * item (Admin Users emits a data row plus a role-editor row).
 */
const TABLE_PROBE = ({ sel, dataRowSel }) => {
  const t = document.querySelector(sel);
  if (!t) return { missing: true };
  const all = [...t.querySelectorAll("tbody tr")];
  const rows = dataRowSel ? [...t.querySelectorAll("tbody " + dataRowSel)] : all;
  return {
    missing: false,
    rows: rows.length,
    allRows: all.length,
    blankRows: all.filter((r) => !r.textContent.trim()).length,
    leftoverTemplates: t.querySelectorAll("template").length,
    rowParents: [...new Set(all.map((r) => r.parentElement.tagName))],
    firstRowCells: rows[0] ? [...rows[0].children].map((td) => td.textContent.replace(/\s+/g, " ").trim()) : null,
    allRowsText: rows.map((r) => r.textContent.replace(/\s+/g, " ").trim())
  };
};

const browser = await chromium.launch();

// ------------------------------------------------------------------ ADMIN USERS (Phase 8)
await check("adminUsers_apiCountMatchesRenderedRows", async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const payloads = [];
  page.on("response", async (res) => {
    if (/\/admin\/users(\?|$)/.test(res.url()) && res.status() === 200) {
      try { payloads.push(await res.json()); } catch { /* non-JSON */ }
    }
  });

  await loginAs(ctx, "Admin", 1, page);
  await page.goto(`${BASE_URL}/app/Tafseel-Admin-Dashboard.dc.html`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^Users$/i }).first().click().catch(async () => {
    await page.click('[data-section="users"]');
  });
  await page.waitForTimeout(2500);

  const probe = await page.evaluate(TABLE_PROBE, { sel: "main table", dataRowSel: "tr.tf-row-slide" });
  const last = payloads[payloads.length - 1];
  const apiItems = last && Array.isArray(last.items) ? last.items.length : null;
  const apiTotal = last && typeof last.total === "number" ? last.total : null;

  await page.screenshot({ path: `${SHOTS}/admin-users-after.png`, fullPage: false });
  await ctx.close();

  if (probe.missing) throw new Error("no users table found on the Admin surface");
  if (apiItems === null) throw new Error("no /admin/users response captured");
  if (probe.rows !== apiItems) throw new Error(`API returned ${apiItems} records but ${probe.rows} data rows rendered`);
  if (probe.blankRows > 0) throw new Error(`${probe.blankRows} blank row(s) rendered`);
  if (probe.leftoverTemplates > 0) throw new Error("an inert <template> survived into the rendered table");
  if (!probe.rowParents.every((p) => p === "TBODY")) throw new Error(`rows escaped <tbody>: ${probe.rowParents}`);
  // Every data row must be populated — the reported symptom was a single row of empty cells.
  const unbound = probe.allRowsText.filter((t) => !/\S+@\S+/.test(t));
  if (unbound.length) throw new Error(`${unbound.length} data row(s) rendered without an email binding`);
  const cells = probe.firstRowCells || [];
  const emptyCells = cells.filter((c) => !c).length;
  if (emptyCells > 1) throw new Error(`first row has ${emptyCells} empty cells: ${JSON.stringify(cells)}`);
  return `API items=${apiItems} (total=${apiTotal}) -> ${probe.rows} data rows (${probe.allRows} <tr> incl. per-row role editors), 0 blank, all bound; first row: ${JSON.stringify(cells)}`;
});

// ------------------------------------------------------------------ STUDENT / TEACHER (Phase 9)
async function surfaceCheck(role, path, sectionRe, selector, label) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const runtimeErrors = [];
  page.on("console", (m) => { if (m.type() === "error" && /dc-runtime/.test(m.text())) runtimeErrors.push(m.text()); });
  page.on("pageerror", (e) => runtimeErrors.push("pageerror: " + e.message));
  await loginAs(ctx, role, 1, page);
  await page.goto(`${BASE_URL}/app/${path}`);
  await page.waitForLoadState("networkidle");
  if (sectionRe) {
    await page.getByRole("button", { name: sectionRe }).first().click().catch(() => {});
    await page.waitForTimeout(2000);
  }
  const probe = await page.evaluate(TABLE_PROBE, { sel: selector, dataRowSel: null });
  // A migrated directive that failed to compile would leave an inert <template> in the page.
  const strayTemplates = await page.$$eval("#dc-root template", (n) => n.length);
  await page.screenshot({ path: `${SHOTS}/${label}-after.png`, fullPage: true });
  await ctx.close();
  return { probe, strayTemplates, runtimeErrors };
}

/**
 * On a freshly reseeded Development database these accounts have no orders/transactions, so the
 * populated-row case is not browser-provable here. What IS provable on the real surface, and is
 * asserted unconditionally: the migrated directives compiled, nothing inert leaked into the page,
 * and the N=0 case renders no phantom blank row (the pre-fix symptom).
 */
async function surfaceAssert(label, role, path, sectionRe, selector) {
  const { probe, strayTemplates, runtimeErrors } = await surfaceCheck(role, path, sectionRe, selector, label);
  if (runtimeErrors.length) throw new Error("dc-runtime errors: " + runtimeErrors.join(" | "));
  if (strayTemplates > 0) throw new Error(`${strayTemplates} inert <template> element(s) survived into the rendered page`);
  if (probe.missing) return "compiled clean, no inert <template>; table absent for this account's data state (NOT BROWSER-PROVEN with populated rows)";
  if (probe.blankRows > 0) throw new Error(`${probe.blankRows} blank row(s)`);
  if (probe.rows === 0) return "compiled clean, no inert <template>, zero rows and zero phantom rows (NOT BROWSER-PROVEN with populated rows)";
  return `${probe.rows} rows, 0 blank; first row: ${JSON.stringify(probe.firstRowCells)}`;
}

/**
 * Populated proof: the API collection count must equal the number of rendered semantic data rows,
 * and the row content must carry the real bound values — not a blank phantom row.
 */
async function populatedTableAssert({ label, role, path, sectionRe, apiRe, expectText }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const runtimeErrors = [];
  const payloads = [];
  page.on("console", (m) => { if (m.type() === "error" && /dc-runtime/.test(m.text())) runtimeErrors.push(m.text()); });
  page.on("pageerror", (e) => runtimeErrors.push("pageerror: " + e.message));
  page.on("response", async (res) => {
    if (apiRe.test(res.url()) && res.status() === 200) {
      try { payloads.push(await res.json()); } catch { /* non-JSON */ }
    }
  });

  await loginAs(ctx, role, 1, page);
  await page.goto(`${BASE_URL}/app/${path}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: sectionRe }).first().click();
  await page.waitForSelector("table tbody tr", { timeout: 15000 });
  await page.waitForTimeout(1200);

  const probe = await page.evaluate(TABLE_PROBE, { sel: "table", dataRowSel: "tr.tf-row-slide" });
  const strayTemplates = await page.$$eval("#dc-root template", (n) => n.length);
  const unresolved = await page.$$eval("#dc-root", (roots) =>
    (roots[0]?.innerText.match(/\{\{[^}]*\}\}/g) || []).length);
  await page.screenshot({ path: `${SHOTS}/${label}-populated.png`, fullPage: true });
  await ctx.close();

  if (runtimeErrors.length) throw new Error("dc-runtime errors: " + runtimeErrors.join(" | "));
  const last = payloads[payloads.length - 1];
  const apiCount = last && Array.isArray(last.items) ? last.items.length : null;
  if (apiCount === null) throw new Error("no collection response captured");
  if (apiCount === 0) throw new Error("collection is empty — nothing to prove");
  if (probe.rows !== apiCount) throw new Error(`API returned ${apiCount} but ${probe.rows} data rows rendered`);
  if (probe.blankRows > 0) throw new Error(`${probe.blankRows} blank row(s)`);
  if (strayTemplates > 0) throw new Error(`${strayTemplates} inert <template> survived`);
  if (unresolved > 0) throw new Error(`${unresolved} unresolved {{ }} placeholder(s) rendered`);
  if (!probe.rowParents.every((p) => p === "TBODY")) throw new Error(`rows escaped <tbody>: ${probe.rowParents}`);
  const joined = probe.allRowsText.join(" || ");
  const missing = expectText.filter((t) => !joined.includes(t));
  if (missing.length) throw new Error(`rows missing expected bound values ${JSON.stringify(missing)} — got ${joined.slice(0, 300)}`);
  return `API ${apiCount} → ${probe.rows} data rows, 0 blank, 0 unresolved bindings; row 1: ${JSON.stringify(probe.firstRowCells)}`;
}

await check("studentTable_populatedRowsBound", () => populatedTableAssert({
  label: "student", role: "SeedStudent", path: "Tafseel-Student-Dashboard.dc.html",
  sectionRe: /my requests|طلباتي/i, apiRe: /\/learning-requests\/mine/,
  expectText: ["Quadratic equations", "Tafseel Teacher"]
}));

await check("teacherTable_populatedRowsBound", () => populatedTableAssert({
  label: "teacher", role: "SeedTeacher", path: "Tafseel-Teacher-Dashboard.dc.html",
  sectionRe: /^active orders/i, apiRe: /\/learning-requests\/assigned/,
  expectText: ["Quadratic equations", "Tafseel Student"]
}));

// ------------------------------------------------------------------ BROWSE COMPARISON (Phase 9)
/**
 * The Browse comparison table is the hardest shape the repair has to survive: a repeated `<th>`
 * inside `<thead><tr>`, a repeated `<tr>` in `<tbody>`, and a repeated `<td>` nested inside each
 * repeated row. All three were foster-parented before the fix.
 */
await check("browseComparison_populatedNestedTable", async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const runtimeErrors = [];
  page.on("console", (m) => { if (m.type() === "error" && /dc-runtime/.test(m.text())) runtimeErrors.push(m.text()); });
  page.on("pageerror", (e) => runtimeErrors.push("pageerror: " + e.message));

  await page.goto(`${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`);
  await page.waitForLoadState("networkidle");
  await page.waitForSelector('button[aria-label="Add to comparison"]', { timeout: 15000 });

  const addButtons = await page.$$('button[aria-label="Add to comparison"]');
  if (addButtons.length < 2) throw new Error(`only ${addButtons.length} comparable teacher(s) discoverable`);
  for (const b of addButtons.slice(0, 2)) { await b.click(); await page.waitForTimeout(200); }

  const openCompare = async () => {
    await page.getByRole("button", { name: /^compare/i }).first().click();
    await page.waitForSelector(".tf-compare-table", { timeout: 10000 });
    await page.waitForTimeout(600);
  };
  await openCompare();

  /** Reads the nested structure: header cells, row labels, and each row's per-teacher cells. */
  const readCompare = () => page.evaluate(() => {
    const t = document.querySelector(".tf-compare-table");
    if (!t) return null;
    const rows = [...t.querySelectorAll("tbody tr")];
    return {
      headerCells: [...t.querySelectorAll("thead th")].map((th) => th.textContent.replace(/\s+/g, " ").trim()),
      headerScopes: [...t.querySelectorAll("thead th")].map((th) => th.getAttribute("scope")),
      rowCount: rows.length,
      blankRows: rows.filter((r) => !r.textContent.trim()).length,
      rowParents: [...new Set(rows.map((r) => r.parentElement.tagName))],
      rowLabels: rows.map((r) => r.querySelector("th")?.textContent.trim() ?? null),
      rowLabelScopes: [...new Set(rows.map((r) => r.querySelector("th")?.getAttribute("scope")))],
      cellsPerRow: [...new Set(rows.map((r) => r.querySelectorAll("td.tf-compare-copy").length))],
      firstRowCells: rows[0] ? [...rows[0].querySelectorAll("td")].map((td) => td.textContent.replace(/\s+/g, " ").trim()) : null,
      strayTemplates: t.querySelectorAll("template").length
    };
  });

  const two = await readCompare();
  await page.screenshot({ path: `${SHOTS}/browse-comparison-populated.png`, fullPage: true });

  if (!two) throw new Error("comparison table did not render");
  // header = 1 field-label column + one repeated <th> per compared teacher
  if (two.headerCells.length !== 3) throw new Error(`expected 3 header cells, got ${JSON.stringify(two.headerCells)}`);
  if (!two.headerCells.some((c) => c.includes("Tafseel Teacher")) ||
      !two.headerCells.some((c) => c.includes("Tafseel Admin")))
    throw new Error(`repeated <th> missing a teacher: ${JSON.stringify(two.headerCells)}`);
  if (two.rowCount === 0) throw new Error("no comparison rows rendered");
  if (two.blankRows > 0) throw new Error(`${two.blankRows} blank comparison row(s)`);
  if (two.strayTemplates > 0) throw new Error("inert <template> survived into the comparison table");
  if (!two.rowParents.every((p) => p === "TBODY")) throw new Error(`rows escaped <tbody>: ${two.rowParents}`);
  // every repeated row must carry exactly one nested repeated cell per compared teacher
  if (JSON.stringify(two.cellsPerRow) !== JSON.stringify([2]))
    throw new Error(`nested cell repeat wrong: cells/row = ${JSON.stringify(two.cellsPerRow)}`);
  if (two.rowLabels.some((l) => !l)) throw new Error("a comparison row lost its row header");
  if (JSON.stringify(two.rowLabelScopes) !== JSON.stringify(["row"]))
    throw new Error(`row header scopes not preserved: ${JSON.stringify(two.rowLabelScopes)}`);

  // Removing one teacher must re-render to a single teacher column, not leave an orphan.
  // Dispatched on the element itself: the compare overlay wins hit-testing over the header
  // button, but the React handler is the same one a real click invokes.
  const removed = await page.$$eval(".tf-compare-table thead button", (btns) => {
    const b = btns.find((x) => /remove/i.test(x.getAttribute("aria-label") || x.textContent || ""));
    if (!b) return false;
    b.click();
    return true;
  });
  if (!removed) throw new Error("no per-teacher remove control found in the comparison header");
  await page.waitForTimeout(800);
  const one = await readCompare();
  if (one) {
    if (one.headerCells.length !== 2)
      throw new Error(`after removal expected 2 header cells, got ${JSON.stringify(one.headerCells)}`);
    if (JSON.stringify(one.cellsPerRow) !== JSON.stringify([1]))
      throw new Error(`after removal cells/row = ${JSON.stringify(one.cellsPerRow)}`);
  }

  // Close and reopen must not duplicate header or body cells.
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(400);
  const stillOpen = await page.$(".tf-compare-table");
  if (!stillOpen) {
    await page.getByRole("button", { name: /^compare/i }).first().click().catch(() => {});
    await page.waitForTimeout(800);
  }
  const reopened = await readCompare();
  if (reopened && reopened.rowCount !== (one ? one.rowCount : two.rowCount))
    throw new Error(`reopening changed row count: ${reopened.rowCount}`);

  await ctx.close();
  if (runtimeErrors.length) throw new Error("dc-runtime errors: " + runtimeErrors.join(" | "));
  return `2 teachers compared → ${two.headerCells.length} header cells (repeated <th>), ` +
         `${two.rowCount} rows (repeated <tr>), ${two.cellsPerRow[0]} nested cells/row (repeated <td>), ` +
         `0 blank; removal re-rendered to ${one ? one.headerCells.length : "?"} header cells; ` +
         `row 1: ${JSON.stringify(two.firstRowCells)}`;
});

await browser.close();
console.log(`\n${results.length - failed}/${results.length} surface checks passed.`);
if (failed) { console.error("Real-surface validation FAILED."); process.exit(1); }
