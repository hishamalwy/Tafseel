/**
 * DC table-repeater runtime regression suite (PASS 01).
 *
 * Protects the systemic defect proven in Phase 1: `<sc-for>`/`<sc-if>` written directly inside a
 * table section are FOSTER-PARENTED out of the table by the HTML parser before any JavaScript
 * runs, so the runtime never sees the repeater/row relationship and the row renders once, blank.
 * The repair is a parser-safe directive host — `<template sc-for ...>` — recognised by
 * `walk()` in support.js.
 *
 * This suite fails against the pre-fix runtime: `<template sc-for>` was routed to `walkElement`,
 * which renders an inert `<template>` and zero data rows.
 *
 * Every table assertion checks BOUND CELL CONTENT, not just row counts.
 *
 * Run (server on :5091 — see .claude/launch.json "tafseel-prototypes"):
 *   node tests/browser/dc-table-repeater-runtime.mjs
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.TAFSEEL_STATIC_BASE || "http://localhost:5091";
const FIXTURE_PATH = "/Tafseel-DC-Runtime-TableRepeat.dc.html";
const FIXTURE_HTML = readFileSync(join(HERE, "fixtures", "dc-table-repeater.dc.html"), "utf8");

const results = [];
let failed = 0;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "\n        " + detail}`);
}
async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail);
  } catch (e) {
    record(name, false, e && e.message ? e.message : String(e));
  }
}
function eq(actual, expected, what) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what}: expected ${b}, got ${a}`);
}

const browser = await chromium.launch();
const page = await browser.newPage();

// Serve the fixture from the site root so `./support.js` and `./js/vendor/*` resolve normally,
// without adding a synthetic surface to the repository root.
await page.route("**" + FIXTURE_PATH, (route) =>
  route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: FIXTURE_HTML })
);

const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

await page.goto(BASE + FIXTURE_PATH, { waitUntil: "networkidle" });
try {
  await page.waitForSelector("#people tbody tr", { timeout: 15000 });
} catch {
  // Pre-fix runtime lands here: `<template sc-for>` is routed to walkElement, so the repeated
  // rows never exist at all. Report it as a failure rather than an uncaught timeout.
  record("tableRepeat_mountsAnyRows", false, "no <tr> ever rendered into #people tbody — the runtime does not recognise <template sc-for>");
  await browser.close();
  console.error("\nDC table-repeater runtime regression FAILED (repeater never mounted).");
  process.exit(1);
}

const click = async (id) => { await page.click("#" + id); await page.waitForTimeout(60); };
const rowNames = () => page.$$eval("#people tbody tr .cell-name", (n) => n.map((e) => e.textContent.trim()));
const dataRowCount = () => page.$$eval("#people tbody tr", (n) => n.length);

// ---------------------------------------------------------------- row-count invariants
await check("tableRepeat_8Items", async () => {
  await click("set-8");
  eq(await dataRowCount(), 8, "row count");
  eq((await rowNames())[0], "Ahmed Salah", "first row name");
  return "8 rows";
});
await check("tableRepeat_0Items", async () => {
  await click("set-0");
  eq(await dataRowCount(), 0, "row count");
  return "0 rows, no phantom row";
});
await check("tableRepeat_1Item", async () => {
  await click("set-1");
  eq(await rowNames(), ["Ahmed Salah"], "row names");
  return "1 row";
});
await check("tableRepeat_2Items", async () => {
  await click("set-2");
  eq(await rowNames(), ["Ahmed Salah", "Bushra Nasser"], "row names");
  return "2 rows";
});

// ---------------------------------------------------------------- binding invariants
await check("tableRepeat_bindingsResolve", async () => {
  await click("set-2");
  const row = await page.$eval("#people tbody tr:first-child", (tr) => ({
    id: tr.getAttribute("data-id"),
    cls: tr.getAttribute("class"),
    name: tr.querySelector(".cell-name").textContent.trim(),
    email: tr.querySelector(".cell-email a").textContent.trim(),
    href: tr.querySelector(".cell-email a").getAttribute("href"),
    role: tr.querySelector(".cell-role").textContent.trim(),
    status: tr.querySelector(".cell-status").textContent.trim(),
    activeBadges: tr.querySelectorAll(".badge-active").length,
    suspendedBadges: tr.querySelectorAll(".badge-suspended").length,
    btnLabel: tr.querySelector(".row-action").getAttribute("aria-label"),
    btnText: tr.querySelector(".row-action").textContent.trim()
  }));
  eq(row.id, "u1", "data-id");
  eq(row.name, "Ahmed Salah", "name cell");
  eq(row.email, "ahmed@example.com", "email cell");
  eq(row.href, "mailto:ahmed@example.com", "href binding");
  eq(row.role, "Teacher", "role cell");
  eq(row.btnLabel, "Suspend Ahmed Salah", "aria-label binding");
  eq(row.btnText, "Suspend", "button label");
  if (!row.cls.includes("is-active")) throw new Error(`class binding: got "${row.cls}"`);
  if (!/\bActive\b/.test(row.status)) throw new Error(`status text: got "${row.status}"`);
  return "text, class, data-attr, href, aria-label, button label all bound";
});
await check("tableRepeat_nestedIf", async () => {
  await click("set-2");
  const badges = await page.$$eval("#people tbody tr", (rows) =>
    rows.map((tr) => [tr.querySelectorAll(".badge-active").length, tr.querySelectorAll(".badge-suspended").length])
  );
  eq(badges, [[1, 0], [0, 1]], "per-row sc-if branches");
  return "sc-if inside a repeated row picks the correct branch per item";
});

// ---------------------------------------------------------------- event invariants
await check("tableRepeat_eventScope", async () => {
  await click("set-8");
  await page.click("#people tbody tr:nth-child(2) .row-action");
  await page.waitForTimeout(60);
  eq(await page.textContent("#last-action"), "action:u2", "handler after clicking row B");
  await page.click("#people tbody tr:nth-child(5) .row-action");
  await page.waitForTimeout(60);
  eq(await page.textContent("#last-action"), "action:u5", "handler after clicking row E");
  return "row handlers resolve to their own item, not the first or last";
});

// ---------------------------------------------------------------- rerender invariants
await check("tableRepeat_rerender", async () => {
  await click("seq-abc"); eq(await rowNames(), ["Ahmed Salah", "Bushra Nasser", "Camelia Roux"], "[A,B,C]");
  await click("seq-ac");  eq(await rowNames(), ["Ahmed Salah", "Camelia Roux"], "[A,C]");
  await click("seq-d");   eq(await rowNames(), ["Dawud Haddad"], "[D]");
  await click("seq-empty"); eq(await dataRowCount(), 0, "[]");
  await click("seq-ab");  eq(await rowNames(), ["Ahmed Salah", "Bushra Nasser"], "[A,B]");
  return "3 -> 2 -> 1 -> 0 -> 2 with no orphan or duplicate rows";
});
await check("tableRepeat_eventScopeAfterRerender", async () => {
  await click("seq-ac");
  await page.click("#people tbody tr:nth-child(2) .row-action");
  await page.waitForTimeout(60);
  eq(await page.textContent("#last-action"), "action:u3", "handler after list changed under the row");
  return "handlers rebind to the new item at that position";
});

// ---------------------------------------------------------------- filter / pagination
await check("tableRepeat_filter", async () => {
  await click("set-8");
  eq(await dataRowCount(), 8, "before filter");
  await click("filter-on");
  eq(await rowNames(), ["Ahmed Salah", "Dawud Haddad", "Faris Qadir"], "filtered to Teacher");
  await click("filter-off");
  eq(await dataRowCount(), 8, "after clearing filter");
  return "8 -> 3 -> 8, rows replaced not appended";
});
await check("tableRepeat_pagination", async () => {
  await click("set-8"); await click("filter-off");
  const pageLabels = async () => page.textContent("#page-label");
  const matrix = () => page.$$eval("#matrix tbody tr th", (n) => n.map((e) => e.textContent.trim()));
  eq(await pageLabels(), "1/3", "page 1 label");
  const p1 = await matrix();
  eq(p1, ["Ahmed Salah", "Bushra Nasser", "Camelia Roux"], "page 1 rows");
  await click("page-next");
  eq(await matrix(), ["Dawud Haddad", "Eman Farouk", "Faris Qadir"], "page 2 rows");
  await click("page-prev");
  eq(await matrix(), p1, "back to page 1");
  return "page 1 -> 2 -> 1, exactly one page of rows each time";
});

// ---------------------------------------------------------------- structural / nesting
await check("tableRepeat_multipleTables", async () => {
  await click("set-2");
  eq(await page.$$eval("#totals .total-row .total-label", (n) => n.map((e) => e.textContent.trim())), ["Rows", "Filter"], "totals labels");
  eq(await page.$eval("#totals .total-row .total-value", (e) => e.textContent.trim()), "2", "totals value tracks the other table");
  eq(await dataRowCount(), 2, "primary table unaffected");
  return "two repeated tables on one page render independently";
});
await check("tableRepeat_nestedFor", async () => {
  await click("set-2");
  eq(await page.$$eval("#matrix thead .matrix-head", (n) => n.map((e) => e.textContent.trim())), ["Alpha", "Beta"], "repeated header cells");
  eq(await page.$$eval("#matrix tbody tr", (rows) =>
    rows.map((tr) => [...tr.querySelectorAll(".matrix-cell")].map((td) => td.textContent.trim()))
  ), [["Teacher", "Active"], ["Student", "Suspended"]], "nested cell repeat");
  return "sc-for inside a repeated <tr>, plus a repeated <th> in <thead>";
});
await check("tableRepeat_ifWrappingFor", async () => {
  await click("set-2");
  eq(await page.$$eval("#gated .gated-row td", (n) => n.map((e) => e.textContent.trim())), ["Ahmed Salah", "Bushra Nasser"], "gated rows visible");
  await click("toggle-section");
  eq(await page.$$eval("#gated .gated-row", (n) => n.length), 0, "gated rows hidden");
  await click("toggle-section");
  eq(await page.$$eval("#gated .gated-row", (n) => n.length), 2, "gated rows restored");
  return "sc-if wrapping sc-for inside <tbody> toggles cleanly";
});

// ---------------------------------------------------------------- semantic / a11y
await check("tableRepeat_semanticStructure", async () => {
  await click("set-2");
  const dom = await page.evaluate(() => {
    const t = document.getElementById("people");
    const body = t.tBodies[0];
    return {
      tableTag: t.tagName,
      caption: t.caption ? t.caption.textContent.trim() : null,
      tbodyChildren: [...body.children].map((c) => c.tagName),
      rowParents: [...body.querySelectorAll("tr")].map((r) => r.parentElement.tagName),
      headerScopes: [...t.tHead.querySelectorAll("th")].map((th) => th.getAttribute("scope")),
      matrixRowHeaders: [...document.querySelectorAll("#matrix tbody tr > th")].map((th) => th.getAttribute("scope")),
      leftoverTemplates: document.querySelectorAll("#dc-root template").length,
      focusableActions: document.querySelectorAll("#people tbody tr .row-action").length
    };
  });
  eq(dom.tableTag, "TABLE", "table element");
  eq(dom.caption, "People (2)", "caption bound");
  eq(dom.tbodyChildren, ["TR", "TR"], "tbody contains only rows");
  eq(dom.rowParents, ["TBODY", "TBODY"], "rows are children of tbody");
  eq(dom.headerScopes, ["col", "col", "col", "col", "col"], "column header scopes preserved");
  eq(dom.matrixRowHeaders, ["row", "row"], "row header scopes preserved");
  eq(dom.leftoverTemplates, 0, "no inert <template> left in the rendered tree");
  eq(dom.focusableActions, 2, "row actions reachable");
  return "semantic table preserved; directive hosts fully compiled away";
});

// ---------------------------------------------------------------- non-table control group
await check("nonTableRepeat_unchanged", async () => {
  await click("set-2");
  eq(await page.$$eval("#cards .card h3", (n) => n.map((e) => e.textContent.trim())), ["Ahmed Salah", "Bushra Nasser"], "div/article repeat");
  eq(await page.$$eval("#cards .card-active", (n) => n.length), 1, "sc-if inside a non-table repeat");
  eq(await page.$$eval("#list .list-item", (n) => n.map((e) => e.textContent.trim())), ["Ahmed Salah", "Bushra Nasser"], "li repeat");
  eq(await page.$$eval("#picker option", (n) => n.map((e) => e.value)), ["u1", "u2"], "select/option repeat");
  eq(await page.$$eval("#btn-group .grp-btn", (n) => n.length), 2, "button-group repeat");
  eq(await page.$$eval("#empty-repeat .never", (n) => n.length), 0, "empty sc-for renders nothing");
  eq(await page.$$eval("#siblings .sib-a", (n) => n.length), 2, "first sibling repeater");
  eq(await page.$$eval("#siblings .sib-b", (n) => n.length), 2, "second sibling repeater");
  return "bare <sc-for>/<sc-if> outside tables behave exactly as before";
});
await check("nonTableRepeat_eventScope", async () => {
  await click("set-8");
  await page.click("#btn-group .grp-btn:nth-child(3)");
  await page.waitForTimeout(60);
  eq(await page.textContent("#last-action"), "action:u3", "non-table repeated handler scope");
  return "non-table repeated handlers keep their own item scope";
});

await check("noRuntimeConsoleErrors", async () => {
  const relevant = consoleErrors.filter((t) => /dc-runtime|Warning|Uncaught/.test(t));
  if (relevant.length) throw new Error(relevant.join(" | "));
  return "no runtime console errors";
});

await browser.close();

console.log(`\n${results.length - failed}/${results.length} checks passed.`);
if (failed) {
  console.error(`DC table-repeater runtime regression FAILED (${failed} failing check(s)).`);
  process.exit(1);
}
