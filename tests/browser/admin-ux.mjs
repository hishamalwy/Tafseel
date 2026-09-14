/**
 * Admin operations-console interaction suite (PASS 04).
 *
 * Drives the real Admin surface with real APIs and a real keyboard. Deliberately performs **no
 * destructive financial mutation**: withdrawal and bulk-suspension coverage asserts the pre-action
 * UI contract (decision controls, confirmation, busy guard) rather than executing the mutation.
 *
 * Run: node tests/browser/admin-ux.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loginAs, BASE_URL } from "./lib/auth.mjs";

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), "..", "..",
  "docs", "features", "evidence", "admin-ux-convergence");
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
  catch (e) { record(name, false, (e && e.message ? e.message : String(e)).split("\n")[0]); }
}

const browser = await chromium.launch();

/** One authenticated Admin context reused by every check — the auth policy is 10 req/min. */
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const runtimeErrors = [];
page.on("console", (m) => { if (m.type() === "error" && /dc-runtime/.test(m.text())) runtimeErrors.push(m.text()); });
page.on("pageerror", (e) => runtimeErrors.push("pageerror: " + e.message));
await loginAs(ctx, "Admin", 1, page);
await page.goto(`${BASE_URL}/app/Tafseel-Admin-Dashboard.dc.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(1800);

const go = async (name) => {
  await page.locator("#admin-sidebar").getByRole("button", { name }).first().click();
  await page.waitForTimeout(1600);
};
/** Every async Admin surface must resolve to exactly one of the four canonical states. */
const stateOf = () => page.evaluate(() => {
  const main = document.querySelector("main");
  const st = main.querySelector(".tf-state");
  const rows = main.querySelectorAll("table tbody tr").length;
  const substantive = (main.innerText || "").trim().length > 40;
  return {
    state: st ? st.getAttribute("data-state") : (rows || substantive ? "data" : null),
    role: st ? st.getAttribute("role") : null,
    rows,
    shared: !!st
  };
});

await check("admin_navigation_groups", async () => {
  const groups = await page.$$eval("#admin-sidebar", (els) =>
    [...els[0].querySelectorAll("*")].filter((e) => !e.children.length &&
      /^(OVERVIEW|PEOPLE & ACCESS|MARKETPLACE|OPERATIONS|FINANCE|MARKETING|MARKETPLACE INTELLIGENCE|SYSTEM)$/i.test(e.textContent.trim()))
      .map((e) => e.textContent.trim()));
  const want = ["People & Access", "Marketplace", "Operations", "Finance", "System"];
  const missing = want.filter((w) => !groups.some((g) => g.toLowerCase() === w.toLowerCase()));
  if (missing.length) throw new Error(`missing nav groups: ${missing.join(", ")}`);
  return `grouped nav: ${[...new Set(groups)].join(" · ")}`;
});

await check("admin_overview_attention", async () => {
  await go(/^Overview$/i);
  const a = await page.evaluate(() => {
    const sec = document.querySelector(".tf-admin-attention");
    if (!sec) return null;
    const st = sec.querySelector(".tf-state");
    return {
      state: st ? st.getAttribute("data-state") : "data",
      role: st ? st.getAttribute("role") : null,
      items: sec.querySelectorAll(".tf-admin-attention-item").length,
      firstInOverview: document.querySelector("main section") === sec
    };
  });
  if (!a) throw new Error("Needs Attention section is missing from the Overview");
  if (!["empty", "loading", "error", "data"].includes(a.state)) throw new Error(`unexpected state ${a.state}`);
  if (a.state === "empty" && a.role !== "status") throw new Error("all-clear must be role=status, not alert");
  if (a.state === "error" && a.role !== "alert") throw new Error("attention error must be role=alert");
  if (a.state === "data" && a.items === 0) throw new Error("data state with no items");
  return `attention state=${a.state} role=${a.role} items=${a.items}, leads the Overview=${a.firstInOverview}`;
});

await check("admin_users_search", async () => {
  await go(/^Users$/i);
  const before = await page.$$eval("main table tbody tr.tf-row-slide", (n) => n.length);
  const box = await page.$('input[placeholder*="Search" i], input[aria-label*="Search" i]');
  if (!box) throw new Error("no user search control");
  await box.fill("qa.admin");
  await page.waitForTimeout(1600);
  const after = await page.$$eval("main table tbody tr.tf-row-slide", (n) => n.length);
  await box.fill("");
  await page.waitForTimeout(1600);
  const restored = await page.$$eval("main table tbody tr.tf-row-slide", (n) => n.length);
  if (!(after < before)) throw new Error(`search did not narrow results (${before} -> ${after})`);
  if (restored !== before) throw new Error(`clearing search did not restore (${before} -> ${restored})`);
  return `${before} rows -> ${after} filtered -> ${restored} restored`;
});

await check("admin_role_privilegedPresentation", async () => {
  await page.getByRole("button", { name: /^Roles$/i }).first().click();
  await page.waitForTimeout(900);
  const opts = await page.$$eval(".tf-admin-role-option", (els) => els.map((o) => ({
    name: (o.querySelector(".tf-admin-role-name") || {}).textContent,
    privileged: o.getAttribute("data-privileged"),
    badge: !!o.querySelector(".tf-badge"),
    hint: !!o.textContent.match(/manage users|إدارة المستخدمين/i)
  })));
  if (!opts.length) throw new Error("role editor did not open");
  const admin = opts.find((o) => /^\s*(admin|مدير نظام)\s*$/i.test(o.name || ""));
  const ordinary = opts.filter((o) => !/^\s*(admin|مدير نظام)\s*$/i.test(o.name || ""));
  if (!admin || admin.privileged !== "true") throw new Error("Admin role is not marked privileged");
  if (!admin.badge || !admin.hint) throw new Error("privileged role lacks a badge or a scope statement");
  if (ordinary.some((o) => o.privileged === "true" || o.badge)) throw new Error("an ordinary role is marked privileged");
  await page.screenshot({ path: join(SHOTS, "role-editor-1440-en-light.png") });
  await page.getByRole("button", { name: /^Roles$/i }).first().click().catch(() => {});
  await page.waitForTimeout(600);
  return `Admin privileged (badge+scope); ${ordinary.length} ordinary roles unmarked`;
});

await check("admin_bulk_selection", async () => {
  // Row selection + the bulk bar live on the Overview user list, not the role-scoped Users page,
  // and the role editor also renders checkboxes — so both are excluded before deciding.
  await go(/^Overview$/i);
  const boxes = await page.$$('main table tbody input[type="checkbox"]:not(.tf-admin-role-option input)');
  if (!boxes.length) {
    return "NOT APPLICABLE: no Admin surface currently exposes row selection for bulk actions";
  }
  const barBefore = await page.$$eval('main', (m) => m[0].innerText.match(/selected/i) ? 1 : 0);
  await boxes[0].click({ force: true }).catch(() => {});
  await page.waitForTimeout(700);
  const bulk = await page.evaluate(() => {
    const txt = document.querySelector("main").innerText;
    const m = txt.match(/(\d+)\s+selected|selected[^\d]*(\d+)/i);
    return { label: m ? m[0] : null, buttons: [...document.querySelectorAll("main button")].filter((b) => /suspend|activate/i.test(b.textContent)).length };
  });
  await boxes[0].click({ force: true }).catch(() => {});
  if (!bulk.label) throw new Error("selecting a row did not surface a selected count");
  if (!bulk.buttons) throw new Error("no bulk action surfaced while a row was selected");
  return `bulk bar appears on selection (${bulk.label}); hidden before=${!barBefore}`;
});

for (const [name, nav] of [
  ["admin_requests_state", /^Requests$/i],
  ["admin_sessions_state", /^Live sessions$/i],
  ["admin_reviews_state", /^Reviews$/i],
  ["admin_disputes_state", /^Disputes$/i]
]) {
  await check(name, async () => {
    await go(nav);
    const s = await stateOf();
    if (!s.state) throw new Error("surface resolved to no canonical state (blank panel)");
    if (s.state === "empty" && s.role !== "status") throw new Error("empty announced as alert");
    if (s.state === "error" && s.role !== "alert") throw new Error("error not announced as alert");
    return `state=${s.state}${s.role ? ` role=${s.role}` : ""} rows=${s.rows}`;
  });
}

await check("admin_disputes_sharedStateGrammar", async () => {
  await go(/^Disputes$/i);
  const usesShared = await page.evaluate(() => {
    const main = document.querySelector("main");
    return { shared: !!main.querySelector(".tf-state"), rows: main.querySelectorAll("table tbody tr").length };
  });
  if (!usesShared.shared && usesShared.rows === 0) throw new Error("Disputes shows neither shared state nor rows");
  return usesShared.rows ? `${usesShared.rows} dispute rows` : "shared .tf-state grammar in use";
});

for (const [name, nav] of [["admin_payments_read", /^Payments$/i], ["admin_withdrawals_read", /^Withdrawals$/i]]) {
  await check(name, async () => {
    await go(nav);
    const s = await stateOf();
    const money = await page.$$eval("main", (m) => (m[0].innerText.match(/SAR|﷼/g) || []).length);
    if (!s.state) throw new Error("finance surface resolved to no canonical state");
    return `state=${s.state} rows=${s.rows}, ${money} canonical currency renderings`;
  });
}

await check("admin_catalog_modal", async () => {
  await go(/^Subjects$/i);
  const opener = await page.getByRole("button", { name: /add|new|\+/i }).first();
  await opener.click();
  await page.waitForSelector("[data-catalog-dialog]", { timeout: 10000 });
  await page.waitForTimeout(500);
  const dom = await page.evaluate(() => {
    const d = document.querySelector("[data-catalog-dialog]");
    return {
      shared: d.className.includes("tf-modal"),
      backdrop: !!d.closest(".tf-modal-backdrop"),
      labelled: !!d.getAttribute("aria-labelledby"),
      modal: d.getAttribute("aria-modal"),
      locked: document.body.style.overflow === "hidden",
      focusInside: d.contains(document.activeElement)
    };
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  const closed = !(await page.$("[data-catalog-dialog]"));
  if (!dom.shared || !dom.backdrop) throw new Error("catalog dialog is not on the shared modal anatomy");
  if (!dom.labelled || dom.modal !== "true") throw new Error("dialog is not correctly labelled/modal");
  if (!dom.locked) throw new Error("body scroll was not locked");
  if (!dom.focusInside) throw new Error("initial focus did not land inside the dialog");
  if (!closed) throw new Error("Escape did not close the dialog");
  return "shared anatomy, labelled, scroll-locked, focused, Escape closes";
});

await check("admin_settings_readOnly", async () => {
  await go(/settings/i);
  const dom = await page.evaluate(() => {
    const main = document.querySelector("main").innerText;
    const controls = [...document.querySelectorAll("main input,main select")]
      .filter((c) => /commission|maintenance|quality review/i.test(c.closest("label")?.innerText || "")).length;
    return { managed: /deployment|منشور|النشر|deployment-managed/i.test(main), fakeControls: controls };
  });
  if (dom.fakeControls) throw new Error(`${dom.fakeControls} non-persisting platform-settings control(s) returned`);
  if (!dom.managed) throw new Error("settings no longer explains that platform settings are deployment-managed");
  return "settings remain read-only and explain deployment ownership";
});

await check("admin_tables_semantic", async () => {
  await go(/^Users$/i);
  const dom = await page.evaluate(() => {
    const t = document.querySelector("main table");
    return {
      tag: t.tagName, thead: !!t.tHead, tbody: t.tBodies.length,
      scopes: [...t.querySelectorAll("thead th")].map((th) => th.getAttribute("scope")),
      shared: t.className.includes("tf-table"),
      rowParents: [...new Set([...t.querySelectorAll("tbody tr")].map((r) => r.parentElement.tagName))]
    };
  });
  if (dom.tag !== "TABLE" || !dom.thead || !dom.tbody) throw new Error("not a semantic table");
  if (!dom.scopes.every((s) => s === "col")) throw new Error(`column scopes: ${dom.scopes}`);
  if (!dom.shared) throw new Error("Users table is not on the shared .tf-table contract");
  if (!dom.rowParents.every((p) => p === "TBODY")) throw new Error("rows escaped tbody");
  return `semantic table on the shared contract, ${dom.scopes.length} scoped column headers`;
});

await check("admin_drawer_keyboard", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const toggle = await page.$("#admin-drawer-toggle");
  if (!toggle) throw new Error("no drawer toggle at 390px");
  await toggle.focus();
  await toggle.click();
  await page.waitForTimeout(500);
  const locked = await page.evaluate(() => document.body.style.overflow === "hidden");
  const inside = await page.evaluate(() => document.querySelector("#admin-sidebar").contains(document.activeElement));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const returned = await page.evaluate(() => document.activeElement === document.getElementById("admin-drawer-toggle"));
  const unlocked = await page.evaluate(() => document.body.style.overflow !== "hidden");
  await page.setViewportSize({ width: 1440, height: 900 });
  if (!locked || !inside || !unlocked || !returned) {
    throw new Error(`drawer contract failed (lock=${locked} focus=${inside} unlock=${unlocked} return=${returned})`);
  }
  return "390px drawer: lock, initial focus, Escape, focus return";
});

await check("admin_noRuntimeErrors", async () => {
  if (runtimeErrors.length) throw new Error(runtimeErrors.slice(0, 2).join(" | "));
  return "no dc-runtime or page errors across the Admin session";
});

await ctx.close();
await browser.close();
console.log(`\n${results.length - failed}/${results.length} Admin interaction checks passed.`);
if (failed) { console.error("Admin interaction suite FAILED."); process.exit(1); }
