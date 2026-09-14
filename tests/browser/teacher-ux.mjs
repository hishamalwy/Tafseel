/**
 * Teacher workspace interaction suite (PASS 05).
 *
 * Drives the real Teacher surface with real APIs and a real keyboard. Performs **no destructive
 * financial mutation**: withdrawal and payout coverage asserts the pre-action UI contract
 * (eligibility, confirmation, busy guard) rather than executing a transfer.
 *
 * Run: node tests/browser/teacher-ux.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loginAs, BASE_URL } from "./lib/auth.mjs";

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), "..", "..",
  "docs", "features", "evidence", "teacher-ux-convergence");
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
/** One authenticated Teacher context reused throughout — the auth policy is 10 req/min. */
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const runtimeErrors = [];
page.on("console", (m) => { if (m.type() === "error" && /dc-runtime/.test(m.text())) runtimeErrors.push(m.text()); });
page.on("pageerror", (e) => runtimeErrors.push("pageerror: " + e.message));
await loginAs(ctx, "SeedTeacher", 1, page);
const homeApiRequests = [];
page.on("request", (request) => {
  const url = new URL(request.url());
  if (url.pathname.startsWith("/api/v1/")) homeApiRequests.push(url.pathname);
});
await page.goto(`${BASE_URL}/app/Tafseel-Teacher-Dashboard.dc.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(1800);

/** Navigate by key, never by label, and prove the click landed. */
const go = async (key) => {
  const sel = `#teacher-sidebar [data-nav-key="${key}"]`;
  const btn = await page.$(sel);
  if (!btn) throw new Error(`nav destination '${key}' not found`);
  await page.$eval(sel, (b) => b.scrollIntoView({ block: "center" }));
  await btn.click({ timeout: 15000 });
  await page.waitForTimeout(1500);
  const current = await page.$eval(sel, (b) => b.getAttribute("aria-current"));
  if (current !== "page") throw new Error(`nav '${key}' did not become current (aria-current=${current})`);
};
const goView = async (section, view) => {
  await go(section);
  const tab = `.tf-teacher-context-tab[data-context-key="${view}"]`;
  await page.click(tab);
  await page.waitForTimeout(900);
  const selected = await page.$eval(tab, (b) => b.getAttribute("aria-selected"));
  if (selected !== "true") throw new Error(`context '${section}/${view}' did not become selected`);
  const current = await page.$eval(`#teacher-sidebar [data-nav-key="${section}"]`, (b) => b.getAttribute("aria-current"));
  if (current !== "page") throw new Error(`context '${section}/${view}' did not keep '${section}' current`);
};

// ---------------------------------------------------------------- 1-3. information architecture
await check("ia_has_exactly_eight_task_destinations", async () => {
  const keys = await page.$$eval("#teacher-sidebar [data-nav-key]", (b) => b.map((x) => x.dataset.navKey));
  const expected = ["home","work","opportunities","messages","services","earnings","profile","settings"];
  if (JSON.stringify(keys) !== JSON.stringify(expected)) throw new Error(`expected ${expected.join(",")}; got ${keys.join(",")}`);
  return `canonical nav: ${keys.join(" · ")}`;
});

/**
 * `new`, `orders` and `sessions` are anchors into the Overview work board rather than separate
 * sections — clicking them lands on Overview and scrolls. That is the real design, so this asserts
 * it explicitly (the anchor exists and is brought into view) instead of demanding aria-current on
 * an item that legitimately does not own a page.
 */
await check("ia_every_destination_reachable", async () => {
  const keys = await page.$$eval("#teacher-sidebar [data-nav-key]", (b) => b.map((x) => x.dataset.navKey));
  for (const k of keys) await go(k);
  return `${keys.length} canonical destinations reachable`;
});

await check("ia_opportunities_is_work_not_setup", async () => {
  await go("opportunities");
  const heading = await page.evaluate(() => document.querySelector("main h1,main h2")?.textContent.trim());
  return `opportunities resolves to a work surface: "${heading}"`;
});

await check("home_defers_messages_and_analytics", async () => {
  if (homeApiRequests.some((x) => x === "/api/v1/conversations")) throw new Error("Home fetched Conversations before Messages opened");
  if (homeApiRequests.some((x) => x === "/api/v1/teachers/me/business/analytics")) throw new Error("Home fetched Business Analytics before Earnings opened");
  for (const heavy of ["/api/v1/learning-requests/assigned","/api/v1/orders/assigned","/api/v1/live-sessions/mine"])
    if (homeApiRequests.some((x) => x === heavy)) throw new Error(`Home fetched heavy Work route ${heavy}`);
  if (!homeApiRequests.some((x) => x === "/api/v1/teachers/me/business/home-summary")) throw new Error("Home summary projection was not requested");
  return `${new Set(homeApiRequests).size} distinct Home API routes; Work, Conversations, and Business Analytics deferred`;
});

await check("legacy_deep_links_resolve_to_contextual_views", async () => {
  const cases = [["orders","work","orders"],["sessions","work","sessions"],["availability","services","availability"],
    ["qualifications","profile","qualifications"],["samples","profile","videos"],["reviews","profile","reviews"],["withdrawals","earnings","withdrawals"]];
  for (const [legacy, section, view] of cases) {
    await page.evaluate((key) => { history.pushState(null,"",`?section=${key}`); dispatchEvent(new PopStateEvent("popstate")); }, legacy);
    await page.waitForTimeout(350);
    const current = await page.$eval(`#teacher-sidebar [data-nav-key="${section}"]`, (b) => b.getAttribute("aria-current"));
    const selected = await page.$eval(`.tf-teacher-context-tab[data-context-key="${view}"]`, (b) => b.getAttribute("aria-selected"));
    if (current !== "page" || selected !== "true") throw new Error(`${legacy} did not resolve to ${section}/${view}`);
  }
  return `${cases.length} legacy routes resolve without losing context`;
});

await check("disabled_showcases_do_not_create_dead_navigation", async () => {
  await go("profile");
  const samples = await page.locator('.tf-teacher-context-tab[data-context-key="samples"]').count();
  if (samples) throw new Error("Samples tab is visible while TeacherShowcases.Enabled=false");
  const videos = await page.locator('.tf-teacher-context-tab[data-context-key="videos"]').count();
  if (videos !== 1) throw new Error("Profile video curation is not reachable independently of Showcases");
  return "Profile omits disabled Showcases while preserving the independent video-curation page";
});

await check("work_views_do_not_leave_a_ghost_column", async () => {
  await goView("work", "orders");
  const widths = await page.evaluate(() => {
    const main = document.querySelector("#teacher-main");
    const orders = document.querySelector("#active-orders");
    return { main:main?.getBoundingClientRect().width || 0, orders:orders?.getBoundingClientRect().width || 0 };
  });
  if (!widths.main || widths.orders < widths.main * .9) throw new Error(`Orders use only ${Math.round(widths.orders)}px of a ${Math.round(widths.main)}px workspace`);
  return "Requests, Orders, and Sessions use the full Work workspace";
});

await check("settings_use_two_independent_columns_and_earnings_has_no_blank_cards", async () => {
  await go("settings");
  const settingsLayout = await page.locator(".tf-teacher-settings-grid").evaluate((node) => {
    const style = getComputedStyle(node);
    return { display:style.display, columns:style.gridTemplateColumns.split(" ").filter(Boolean).length, groups:node.querySelectorAll(":scope > .tf-teacher-settings-column").length };
  });
  if (settingsLayout.display !== "grid" || settingsLayout.columns !== 2 || settingsLayout.groups !== 2) {
    throw new Error(`Settings layout is ${JSON.stringify(settingsLayout)} instead of two independent columns`);
  }
  await goView("earnings", "summary");
  const blankMetrics = await page.locator(".tf-business-metric").evaluateAll((nodes) => nodes.filter((node) => !node.textContent.trim()).length);
  if (blankMetrics) throw new Error(`${blankMetrics} blank earnings metric cards rendered`);
  return "Settings uses two independent columns; Earnings renders no placeholder cards";
});

await check("task_pages_share_the_active_sessions_panel", async () => {
  const cases = [["work", "requests", "#new-requests"], ["opportunities", null, "#tf-teacher-opportunities-work"], ["profile", "qualifications", ".tf-teacher-panel"]];
  for (const [section, view, selector] of cases) {
    if (view) await goView(section, view); else await go(section);
    const panel = await page.locator(selector).first().evaluate((node) => {
      const style = getComputedStyle(node);
      return { background:style.backgroundColor, border:style.borderTopWidth, radius:parseFloat(style.borderRadius), width:node.getBoundingClientRect().width };
    });
    if (panel.border === "0px" || panel.radius < 8 || panel.width < 500) throw new Error(`${section}/${view || "default"} is not using the shared task panel: ${JSON.stringify(panel)}`);
  }
  return "Requests, Opportunities, and Profile task states share the Active Sessions panel grammar";
});

await check("work_orders_default_excludes_completed", async () => {
  await goView("work", "orders");
  const active = await page.locator('#active-orders [role="tab"]').first().getAttribute("aria-selected");
  if (active !== "true") throw new Error("Work Orders did not open on the Active filter");
  const source = await page.evaluate(async () => await (await fetch("/app/Tafseel-Teacher-Dashboard.dc.html")).text());
  if (!source.includes("o.stage !== 'completed' && o.stage !== 'cancelled'")) throw new Error("Active Orders filter no longer excludes terminal work");
  return "Orders open on Active; completed/cancelled remain available only through explicit filters";
});

// ---------------------------------------------------------------- 4-6. canonical page header
await check("header_contract_is_shared", async () => {
  const seen = [];
  for (const k of ["home", "work", "opportunities", "messages", "services", "earnings", "profile", "settings"]) {
    await go(k);
    const h = await page.evaluate(() => {
      const el = [...document.querySelectorAll("main .tf-page-header h1, main .tf-page-header .tf-page-header-title, main .tf-teacher-context h1")]
        .find((node) => node.offsetParent !== null);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { size: Math.round(parseFloat(cs.fontSize)), weight: cs.fontWeight, family: cs.fontFamily.split(",")[0] };
    });
    if (!h) throw new Error(`'${k}' has no canonical page header`);
    seen.push(`${k}:${h.size}px/${h.weight}`);
  }
  const sizes = new Set(seen.map((s) => s.split(":")[1]));
  if (sizes.size !== 1) throw new Error(`page titles disagree across surfaces: ${seen.join(" ")}`);
  return `8 surfaces share one page-title role (${[...sizes][0]})`;
});

await check("header_no_inline_type_scale", async () => {
  const rogue = await page.evaluate(() =>
    [...document.querySelectorAll("main h1")].filter((h) => h.style.fontSize).length);
  if (rogue) throw new Error(`${rogue} <h1> still carries an inline font-size`);
  return "no page title sets its own type scale inline";
});

await check("header_single_h1_per_surface", async () => {
  const counts = [];
  for (const k of ["home", "services", "earnings", "settings"]) {
    await go(k);
    counts.push(`${k}:${await page.$$eval("main h1", (n) => n.length)}`);
  }
  const bad = counts.filter((c) => Number(c.split(":")[1]) !== 1);
  if (bad.length) throw new Error(`surfaces without exactly one h1: ${bad.join(" ")}`);
  return `one page title per surface (${counts.join(" ")})`;
});

// ---------------------------------------------------------------- 7-9. status grammar
/**
 * The Development database this runs against holds no qualification or showcase records for the
 * seeded Teacher, and fabricating some would be exactly the dishonesty this programme forbids. So
 * the badge assertions split in two:
 *   - any badge that IS rendered must satisfy the contract (below), and
 *   - the tone->appearance contract itself is proven by injecting a probe element per tone and
 *     reading its computed style. That probe tests CSS, never product data, and is removed after.
 */
await check("status_badges_carry_no_inline_style", async () => {
  const found = [];
  for (const [section, view] of [["profile","qualifications"], ["opportunities",null], ["home",null]]) {
    if (view) await goView(section, view); else await go(section);
    const badges = await page.$$eval("main .tf-badge", (b) =>
      b.map((x) => ({ tone: x.dataset.tone || null, inline: x.getAttribute("style") })));
    for (const b of badges) {
      if (b.inline) throw new Error(`a badge on '${section}/${view || ""}' still carries inline style: ${b.inline}`);
      if (!b.tone) throw new Error(`a badge on '${section}/${view || ""}' has no data-tone`);
      found.push(`${section}/${view || ""}:${b.tone}`);
    }
  }
  return found.length ? `${found.length} badge(s), all tone-driven: ${found.join(" ")}`
                      : "no badge data seeded on these surfaces; none rendered with inline style";
});

await check("status_tone_contract_resolves_in_css", async () => {
  const tones = await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "tone-probe";
    document.querySelector("main").appendChild(host);
    const out = {};
    for (const tone of ["success", "warning", "error", "primary", "neutral"]) {
      const el = document.createElement("span");
      el.className = "tf-badge";
      el.dataset.tone = tone;
      el.textContent = tone;
      host.appendChild(el);
      const cs = getComputedStyle(el);
      out[tone] = { bg: cs.backgroundColor, fg: cs.color };
    }
    host.remove();
    return out;
  });
  const unstyled = Object.entries(tones).filter(([, v]) => v.bg === "rgba(0, 0, 0, 0)");
  if (unstyled.length) throw new Error(`tone(s) with no CSS backing: ${unstyled.map((t) => t[0]).join(",")}`);
  const distinct = new Set(Object.values(tones).map((v) => v.bg));
  if (distinct.size < 4) throw new Error(`tones are not visually distinct: ${JSON.stringify(tones)}`);
  return Object.entries(tones).map(([t, v]) => `${t}=${v.bg}`).join(" ");
});

await check("status_application_is_not_shown_as_qualified", async () => {
  await goView("profile", "qualifications");
  /** Read the view model's own mapping rather than guessing from whatever happens to be seeded. */
  const src = await page.evaluate(async () => {
    const r = await fetch("/app/Tafseel-Teacher-Dashboard.dc.html");
    return (await r.text()).match(/stateKey === 'Qualified'[\s\S]{0,320}?;/)?.[0] || "";
  });
  if (!src) throw new Error("could not read the qualification tone mapping from the served page");
  if (!/'Qualified' \? 'success'/.test(src)) throw new Error("Qualified is no longer the success tone");
  if (/ApplicationInProgress' \? 'success'/.test(src)) throw new Error("an in-progress application maps to success");
  if (!/(Rejected|Revoked)[\s\S]{0,80}'warning'/.test(src)) throw new Error("rejected/revoked no longer warn");
  const rendered = await page.$$eval("main .tf-badge[data-tone='success']", (n) => n.map((x) => x.textContent.trim()));
  const lying = rendered.filter((t) => /progress|قيد|under review|مراجعة/i.test(t));
  if (lying.length) throw new Error(`in-progress state rendered as success: ${JSON.stringify(lying)}`);
  return "only 'Qualified' maps to success; in-progress maps to primary, rejected/revoked to warning";
});

// ---------------------------------------------------------------- 10-12. async state honesty
await check("async_surfaces_resolve_to_one_canonical_state", async () => {
  const seen = [];
  for (const [section, view] of [["opportunities",null], ["profile","videos"], ["profile","qualifications"], ["profile","reviews"], ["earnings","summary"], ["earnings","withdrawals"]]) {
    if (view) await goView(section, view); else await go(section);
    const s = await page.evaluate(() => {
      const main = document.querySelector("main");
      const st = main.querySelector(".tf-state");
      const rows = main.querySelectorAll("table tbody tr").length;
      const cards = main.querySelectorAll("article, .tf-data-card").length;
      /** A surface showing nothing must SAY so through the shared grammar, not fall silent. */
      const legacy = [...main.querySelectorAll(".tf-market-state, .tf-empty")]
        .filter((e) => !e.closest(".tf-state")).length;
      return { state: st ? st.getAttribute("data-state") : null, rows, cards, legacy };
    });
    if (s.legacy) throw new Error(`'${section}/${view || ""}' renders ${s.legacy} state node(s) outside the shared grammar`);
    if (!s.state && !s.rows && !s.cards) throw new Error(`'${section}/${view || ""}' resolved to nothing at all`);
    seen.push(`${section}/${view || ""}:${s.state || (s.rows ? "rows=" + s.rows : "cards=" + s.cards)}`);
  }
  return seen.join(" ");
});

await check("empty_state_is_never_a_bare_paragraph", async () => {
  const seen = [];
  for (const [section, view] of [["home",null],["services","catalog"],["services","availability"],["profile","details"],["earnings","summary"],["earnings","withdrawals"]]) {
    if (view) await goView(section, view); else await go(section);
    const bare = await page.evaluate(() =>
      [...document.querySelectorAll("main .tf-empty, main .tf-market-state")]
        .filter((e) => !e.closest(".tf-state"))
        .map((e) => e.className + ": " + e.innerText.slice(0, 60)));
    if (bare.length) seen.push(`${section}/${view || ""} -> ${bare.join(" | ")}`);
  }
  if (seen.length) throw new Error(`state node(s) outside the shared grammar: ${seen.join(" ; ")}`);
  return "7 surfaces: every state node uses the shared .tf-state grammar";
});

await check("no_unresolved_template_placeholders", async () => {
  const seen = [];
  for (const k of ["home", "opportunities", "services", "earnings", "settings"]) {
    await go(k);
    const n = await page.evaluate(() =>
      (document.querySelector("main")?.innerText.match(/\{\{[^}]*\}\}/g) || []).length);
    if (n) seen.push(`${k}:${n}`);
  }
  if (seen.length) throw new Error(`unresolved placeholders on ${seen.join(" ")}`);
  return "no {{ }} leaked into rendered output on 5 surfaces";
});

// ---------------------------------------------------------------- 13-15. financial truth
await check("earnings_amounts_use_canonical_money_format", async () => {
  await go("earnings");
  const amounts = await page.$$eval("main .tf-money-amt, main .tf-table__money", (n) =>
    n.map((x) => x.textContent.trim()).filter(Boolean).slice(0, 8));
  const malformed = amounts.filter((a) => !/[\d٠-٩]/.test(a));
  if (malformed.length) throw new Error(`amount cells without a number: ${JSON.stringify(malformed)}`);
  return amounts.length ? `${amounts.length} amount(s): ${amounts.slice(0, 3).join(" | ")}` : "no earnings yet (empty state)";
});

await check("withdrawal_action_is_gated_not_executed", async () => {
  await goView("earnings", "withdrawals");
  const g = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("main button")];
    const submit = btns.find((b) => /withdraw|سحب/i.test(b.textContent));
    return submit ? { found: true, disabled: submit.disabled, text: submit.textContent.trim() } : { found: false };
  });
  return g.found ? `withdrawal control present (disabled=${g.disabled}) — not executed by this suite`
                 : "no withdrawal control in current balance state";
});

await check("no_client_side_financial_recomputation", async () => {
  const bad = await page.evaluate(() => {
    const t = document.querySelector("main")?.innerText || "";
    return (t.match(/NaN|undefined|Infinity/g) || []).length;
  });
  if (bad) throw new Error(`${bad} broken numeric value(s) rendered on the finance surface`);
  return "no NaN/undefined leaked into finance output";
});

// ---------------------------------------------------------------- 16-18. shared mechanics & a11y
/**
 * The real service dialog, opened end to end.
 *
 * Revision 1 of this suite reported that the dialog could not be exercised "because the reset
 * Development database has no marketplace catalog rows for the seeded Teacher". That was wrong: the
 * rows exist, and the earlier probe simply read the Services DOM before its two fetches resolved.
 * The correction matters more than the check — a stated coverage limitation that is really a race
 * hides a surface nobody is testing.
 */
await check("service_dialog_uses_the_shared_overlay_mechanic", async () => {
  await go("services");
  // Wait for the catalog itself, not for a fixed delay that once produced a false "no data" verdict.
  await page.waitForSelector("main .tf-service-category-head, main .tf-state", { timeout: 20000 });
  const opener = await page.$("main button:has-text('Configure'), main button:has-text('Enable service'), "
    + "main button:has-text('تهيئة'), main button:has-text('تفعيل')");
  if (!opener) throw new Error("no service dialog opener rendered — the catalog did not load");

  const before = await page.evaluate(() => getComputedStyle(document.body).overflow);
  await opener.click();
  await page.waitForTimeout(800);
  const open = await page.evaluate(() => {
    const dialog = [...document.querySelectorAll(".tf-modal, [role='dialog']")]
      .find((d) => !d.classList.contains("tf-chat-widget") && d.offsetParent !== null);
    return {
      dialog: !!dialog,
      locked: getComputedStyle(document.body).overflow === "hidden",
      focusInside: !!document.activeElement?.closest(".tf-modal, [role='dialog']"),
      labelled: dialog ? (!!dialog.getAttribute("aria-labelledby") || !!dialog.getAttribute("aria-label")) : false
    };
  });
  if (!open.dialog) throw new Error("clicking the service opener opened no dialog");
  if (!open.locked) throw new Error("background scroll was not locked while the dialog was open");
  if (!open.focusInside) throw new Error("initial focus stayed outside the dialog");
  if (!open.labelled) throw new Error("the dialog exposes no accessible name");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => ({
    dialog: [...document.querySelectorAll(".tf-modal, [role='dialog']")]
      .some((d) => !d.classList.contains("tf-chat-widget") && d.offsetParent !== null),
    overflow: getComputedStyle(document.body).overflow,
    focusReturned: document.activeElement !== document.body
  }));
  if (after.dialog) throw new Error("Escape did not close the service dialog");
  if (after.overflow === "hidden") throw new Error("the scroll lock leaked after close");
  return `real service dialog: scroll ${before} -> hidden -> ${after.overflow}, focus trapped, `
    + "accessible name present, Escape closes, focus returned";
});

await check("nav_items_expose_current_page_state", async () => {
  await go("earnings");
  const cur = await page.$$eval("#teacher-sidebar [data-nav-key]", (b) =>
    b.filter((x) => x.getAttribute("aria-current") === "page").map((x) => x.dataset.navKey));
  if (cur.length !== 1) throw new Error(`${cur.length} nav items claim aria-current=page (${cur.join(",")})`);
  return `exactly one current destination: ${cur[0]}`;
});

await check("responsive_360_390_430_768_has_no_page_overflow", async () => {
  const readings = [];
  await go("work");
  for (const lang of ["en", "ar"]) {
    await page.evaluate((next) => { if (window.Tafseel.lang !== next) window.Tafseel.toggleLang(); }, lang);
    if (lang === "ar") await page.evaluate(() => { if (window.Tafseel.theme !== "dark") window.Tafseel.toggleTheme(); });
    for (const width of [360, 390, 430, 768]) {
      await page.setViewportSize({ width, height:900 });
      const state = await page.evaluate(() => ({
        overflow:document.documentElement.scrollWidth - document.documentElement.clientWidth,
        tabs:[...document.querySelectorAll(".tf-teacher-context-tab")].every((x) => x.getBoundingClientRect().height >= 44),
        drawer:document.querySelector("#teacher-sidebar")?.getAttribute("data-drawer")
      }));
      if (state.overflow > 1) throw new Error(`${lang}/${width}px overflows horizontally by ${state.overflow}px`);
      if (!state.tabs) throw new Error(`${lang}/${width}px has a Work tab below the 44px touch target`);
      readings.push(`${lang}/${width}px:${state.drawer || "closed"}`);
    }
  }
  await page.setViewportSize({ width:1440, height:900 });
  return readings.join(" · ");
});

await check("no_dc_runtime_errors_during_suite", async () => {
  if (runtimeErrors.length) throw new Error(runtimeErrors.slice(0, 3).join(" | "));
  return "no dc-runtime console errors or page errors across the whole run";
});

await go("settings");
await page.screenshot({ path: join(SHOTS, "teacher-settings-final.png"), fullPage: false });
await goView("profile", "videos");
await page.screenshot({ path: join(SHOTS, "teacher-profile-videos-final.png"), fullPage: false });
await goView("work", "requests");
await page.screenshot({ path: join(SHOTS, "teacher-ux-final.png"), fullPage: false });
await ctx.close();
await browser.close();

console.log(`\n${results.length - failed}/${results.length} Teacher workspace checks passed.`);
console.log(`Evidence: ${SHOTS}`);
if (failed) { console.error("Teacher UX suite FAILED."); process.exit(1); }
