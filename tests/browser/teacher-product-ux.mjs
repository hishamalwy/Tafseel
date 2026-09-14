/**
 * Teacher PRODUCT workspace suite (PASS 05, Revision 2).
 *
 * `teacher-ux.mjs` certifies the foundation the Teacher surface is built from — IA, headers, state
 * grammar, tone grammar, overlay mechanic. This suite asks the different question: can the Teacher
 * actually do their job here? What needs action, what is available, what is owed, what blocks
 * selling, what was earned.
 *
 * Split from that suite deliberately: the Development auth policy is 10 req/min and the JWT expires
 * in 15 minutes, so one very long run risks redirecting to Auth mid-suite and reporting a product
 * failure that is really a session expiry.
 *
 * Performs no destructive financial mutation and persists nothing.
 *
 * Run: node tests/browser/teacher-product-ux.mjs
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const runtimeErrors = [];
page.on("console", (m) => { if (m.type() === "error" && /dc-runtime/.test(m.text())) runtimeErrors.push(m.text()); });
page.on("pageerror", (e) => runtimeErrors.push("pageerror: " + e.message));
await loginAs(ctx, "SeedTeacher", 1, page);
await page.goto(`${BASE_URL}/app/Tafseel-Teacher-Dashboard.dc.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(1800);

const ANCHORS = { new: "new-requests", orders: "active-orders", sessions: "live-sessions" };
const go = async (key) => {
  const sel = `#teacher-sidebar [data-nav-key="${key}"]`;
  const btn = await page.$(sel);
  if (!btn) throw new Error(`nav destination '${key}' not found`);
  await page.$eval(sel, (b) => b.scrollIntoView({ block: "center" }));
  await btn.click({ timeout: 15000 });
  await page.waitForTimeout(1500);
  if (ANCHORS[key]) return;
  const current = await page.$eval(sel, (b) => b.getAttribute("aria-current"));
  if (current !== "page") throw new Error(`nav '${key}' did not become current (aria-current=${current})`);
};
/** Read a slice of the served page source — used to assert projections the seeded data cannot show. */
const projection = (marker, length) => page.evaluate(async ({ marker, length }) => {
  const t = await (await fetch("/app/Tafseel-Teacher-Dashboard.dc.html")).text();
  const at = t.indexOf(marker);
  return at === -1 ? "" : t.slice(at, at + length);
}, { marker, length });

// ---------------------------------------------------------------- overview as a work board
await check("overview_answers_the_workspace_questions", async () => {
  await go("overview");
  const board = await page.evaluate(() => {
    const main = document.querySelector("main");
    const has = (sel) => !!main.querySelector(sel);
    return {
      title: main.querySelector(".tf-page-header h1")?.textContent.trim() || "",
      // "what needs my action" is a counted summary of real pending work, not an invented score
      summary: main.querySelector(".tf-page-header-desc")?.textContent.trim() || "",
      availableWork: has(".tf-teacher-opportunities"),
      directRequests: has("#new-requests"),
      orders: has("#active-orders"),
      sessions: has("#live-sessions"),
      business: /Earnings|الأرباح/.test(main.innerText)
    };
  });
  for (const k of ["title", "summary", "availableWork", "directRequests", "orders", "sessions", "business"]) {
    if (!board[k]) throw new Error(`the Overview no longer answers '${k}'`);
  }
  return `work board complete (available work, direct requests, orders, sessions, business); summary: "${board.summary}"`;
});

await check("overview_attention_summary_is_counted_not_invented", async () => {
  const src = await projection("greetingSub:", 500);
  if (!src) throw new Error("could not read the greeting projection");
  if (!/PENDING\.length - s\.declined\.length/.test(src)) {
    throw new Error("the action count is no longer derived from real pending requests");
  }
  if (!/liveSessions/.test(src)) throw new Error("the session count is no longer derived from real sessions");
  for (const invented of ["urgency", "riskScore", "slaBreach", "priority"]) {
    if (src.includes(invented)) throw new Error(`the attention summary invents '${invented}'`);
  }
  return "attention summary counts real pending requests + real sessions; no urgency/SLA/priority invented";
});

// ---------------------------------------------------------------- marketplace readiness
await check("readiness_blockers_match_canonical_state", async () => {
  await go("overview");
  // Readiness is loaded after first paint, so wait for it to become known rather than racing it.
  await page.waitForTimeout(2500);
  const live = await page.evaluate(() => {
    const block = document.querySelector(".tf-teacher-readiness");
    return {
      shown: !!block,
      items: block ? [...block.querySelectorAll(".tf-teacher-readiness-item")]
        .map((li) => li.textContent.replace(/\s+/g, " ").trim()) : [],
      percentage: block ? /\d+\s*%/.test(block.textContent) : false
    };
  });
  if (live.percentage) throw new Error("readiness rendered a percentage — it must name blockers, not score them");
  /** Cross-check against the canonical APIs so this proves backend truth, not merely that text appeared. */
  const truth = await page.evaluate(async () => {
    const g = async (u) => { try { return await window.Tafseel.api.get(u); } catch { return null; } };
    const [subjects, services, profile] = await Promise.all([
      g("/teachers/me/eligible-subjects"), g("/teachers/me/marketplace-services"), g("/teachers/me")
    ]);
    const active = (services || []).flatMap((c) => (c.offerings || [])
      .filter((o) => o.isActive && !o.isSuperseded));
    return {
      approved: (subjects || []).length,
      active: active.length,
      scheduled: active.some((o) => o.requiresScheduling),
      availability: ((profile || {}).availability || []).length,
      published: profile ? profile.isPubliclyVisible : null
    };
  });
  const expected = [];
  if (!truth.approved) expected.push("no approved Subjects");
  else if (!truth.active) expected.push("no active service");
  if (truth.scheduled && !truth.availability) expected.push("scheduled service without availability");
  if (truth.published === false) expected.push("profile hidden");
  if (expected.length !== live.items.length) {
    throw new Error(`canonical state implies ${expected.length} blocker(s) [${expected.join("; ")}] `
      + `but ${live.items.length} rendered [${live.items.join(" | ")}]`);
  }
  if (!expected.length && live.shown) throw new Error("an unblocked Teacher still sees the blocker block");
  return expected.length
    ? `${live.items.length} blocker(s) match canonical state: ${live.items.join(" | ")}`
    : "no blockers in canonical state; the block is correctly absent";
});

// ---------------------------------------------------------------- offers
/**
 * The selected-but-unpaid Offer truth, proven by RENDERING the real production code path.
 *
 * The live lifecycle is unreachable here: submitting an offer requires an approved qualification and
 * the seeded Teacher has none. Driving a Quality approval to manufacture one would fabricate domain
 * state for a test, which this programme forbids. So the module's transport is stubbed for the
 * duration of this check and the real `mountTeacherOpportunities` renders a status-1 offer. The DOM
 * asserted below comes from production code — only the transport is a double, and nothing persists.
 */
await check("selected_unpaid_offer_renders_waiting_never_work", async () => {
  const dom = await page.evaluate(async () => {
    const realGet = window.Tafseel.api.get;
    const host = document.createElement("div");
    document.querySelector("main").appendChild(host);
    const offer = {
      id: "00000000-0000-0000-0000-0000000000ff", status: 1, price: 100, currency: "SAR",
      deliveryHours: 24, revisions: 1, message: "", version: "v1"
    };
    const request = {
      id: "00000000-0000-0000-0000-0000000000aa", title: "Probe request", status: 1,
      subjectName: "Subject", serviceName: "Service", deadline: new Date().toISOString(),
      requirements: "probe", offerCount: 1, attachments: [], myOffer: offer
    };
    window.Tafseel.api.get = async (url) => {
      if (url.includes("/opportunities?")) return { items: [request], totalCount: 1 };
      if (url.includes("/opportunities/")) return request;
      return { items: [], totalCount: 0 };
    };
    try {
      await window.TafseelOpenMarketplace.mountTeacherOpportunities(host, { focusId: request.id });
      await new Promise((r) => setTimeout(r, 500));
      return {
        text: host.innerText,
        controls: [...host.querySelectorAll("button, input, textarea, select")]
          .map((c) => (c.textContent || c.value || c.getAttribute("name") || c.type || "").trim())
          .filter(Boolean),
        size: host.innerHTML.length
      };
    } finally {
      window.Tafseel.api.get = realGet;
      host.remove();
    }
  });
  if (!dom.size) throw new Error("the real module rendered nothing for a status-1 offer");
  if (!/payment|بانتظار|الدفع/i.test(dom.text)) {
    throw new Error(`no awaiting-payment copy rendered: ${dom.text.slice(0, 160)}`);
  }
  const work = dom.controls.filter((c) => /start|begin|deliver|upload|ابدأ|تسليم|رفع/i.test(c));
  if (work.length) throw new Error(`a selected-unpaid offer exposed work control(s): ${work.join(", ")}`);
  const editor = dom.controls.filter((c) => /price|revision|submit offer|السعر|مراجعات/i.test(c));
  if (editor.length) throw new Error(`the offer editor rendered for a selected offer: ${editor.join(", ")}`);
  return `real module rendered the waiting panel only — ${dom.controls.length} control(s), `
    + "none of them work-start or offer-edit";
});

// ---------------------------------------------------------------- orders & sessions
await check("orders_action_hierarchy_is_state_aware", async () => {
  const src = await projection("orders: filteredOrders.map", 2400);
  if (!src) throw new Error("could not read the orders projection");
  for (const [needle, what] of [
    ["td_stage_start_work", "start action"],
    ["td_stage_upload_delivery", "deliver action"],
    ["td_action_submit_revision", "revision action"],
    ["actionBusy", "busy guard"],
    ["pendingExtension", "extension response path"],
    ["disputeLabel", "dispute eligibility"]
  ]) {
    if (!src.includes(needle)) throw new Error(`the orders projection lost its ${what}`);
  }
  await go("overview");
  const live = await page.evaluate(() => {
    const table = document.querySelector("#active-orders table");
    if (!table) return null;
    return {
      rows: table.querySelectorAll("tbody tr").length,
      tones: [...table.querySelectorAll("[data-tone]")].map((b) => b.dataset.tone),
      toneWithCss: [...table.querySelectorAll("[data-tone]")].filter((b) => /[;:]/.test(b.dataset.tone)).length
    };
  });
  if (live && live.toneWithCss) throw new Error("an order status tone carries CSS again");
  return "start/deliver/revision + busy guard + extension + dispute paths intact; "
    + (live ? `${live.rows} live row(s), tones: ${[...new Set(live.tones)].join(",") || "none"}` : "no order table in this state");
});

await check("sessions_are_work_and_invent_no_presence", async () => {
  const src = await projection("sessions: (s.liveSessions", 2000);
  if (!src) throw new Error("could not read the sessions projection");
  for (const needle of ["rescheduleNeedsResponse", "confirmTeacherNoShow", "pendingStudentReview", "disputeLabel"]) {
    if (!src.includes(needle)) throw new Error(`the sessions projection lost '${needle}'`);
  }
  for (const fake of ["isOnline", "onlineNow", "availableNow", "lastSeen"]) {
    if (src.includes(fake)) throw new Error(`sessions invent a presence signal: ${fake}`);
  }
  return "sessions model reschedule / no-show / awaiting-student-review / dispute; no presence invented";
});

// ---------------------------------------------------------------- messages
await check("messages_is_an_entry_point_not_a_second_inbox", async () => {
  await go("messages");
  const inbox = await page.evaluate(() => {
    const main = document.querySelector("main");
    return {
      rows: main.querySelectorAll(".tf-dash-inbox-row").length,
      state: main.querySelector(".tf-state")?.getAttribute("data-state") || null,
      /** A second inbox would render its own thread view or composer inside the page. */
      threadPane: !!main.querySelector("[data-thread], .tf-chat-thread, .tf-chat-compose"),
      widget: !!document.querySelector(".tf-chat-widget")
    };
  });
  if (inbox.threadPane) throw new Error("a message thread or composer is rendered inside the dashboard page");
  if (!inbox.widget) throw new Error("the canonical chat widget is absent");
  if (!inbox.rows && !inbox.state) throw new Error("Messages resolved to neither rows nor a state");
  return `list-only entry point (${inbox.rows} row(s), state=${inbox.state}); the canonical widget owns threads`;
});

// ---------------------------------------------------------------- marketplace setup
await check("services_communicates_what_can_be_sold", async () => {
  await go("services");
  const svc = await page.evaluate(() => {
    const main = document.querySelector("main");
    return {
      filters: [...main.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean),
      state: main.querySelector(".tf-state")?.getAttribute("data-state") || null,
      groups: main.querySelectorAll(".tf-service-category-head").length
    };
  });
  const src = await projection("const filterState =", 300);
  for (const s of ["enabled", "needs_configuration", "available", "unavailable"]) {
    if (!src.includes(s)) throw new Error(`the service selling-state model lost '${s}'`);
  }
  if (!svc.filters.length && !svc.state) throw new Error("Services rendered neither filters nor a state");
  return `selling states enabled/needs_configuration/available/unavailable modelled; `
    + `filters: ${svc.filters.join(" / ") || "none"}; state=${svc.state}; ${svc.groups} group(s)`;
});

await check("availability_states_its_timezone_and_invents_nothing", async () => {
  await go("availability");
  const av = await page.evaluate(() => {
    const main = document.querySelector("main");
    const tz = main.querySelector("select");
    return {
      timezone: tz ? tz.value : null,
      options: tz ? tz.options.length : 0,
      state: main.querySelector(".tf-state")?.getAttribute("data-state") || null,
      controls: [...main.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 5),
      presence: /online now|متصل الآن/i.test(main.innerText)
    };
  });
  if (!av.timezone) throw new Error("availability no longer states which timezone its windows are in");
  if (av.presence) throw new Error("the availability surface advertises online presence");
  return `timezone=${av.timezone} (${av.options} options), state=${av.state}, controls: ${av.controls.join(", ")}`;
});

await check("qualifications_separate_application_from_qualification", async () => {
  await go("qualifications");
  const q = await page.evaluate(() => {
    const main = document.querySelector("main");
    return {
      state: main.querySelector(".tf-state")?.getAttribute("data-state") || null,
      badges: [...main.querySelectorAll(".tf-badge[data-tone]")]
        .map((b) => ({ tone: b.dataset.tone, text: b.textContent.trim() })),
      /** The dashboard must route to the canonical Apply flow, never re-implement it. */
      duplicatedForm: !!main.querySelector("form input[type='file'], form textarea"),
      applyRoute: [...main.querySelectorAll("button, a")].some((b) => /apply|تقديم/i.test(b.textContent))
    };
  });
  if (q.duplicatedForm) throw new Error("the Apply flow is duplicated inside the dashboard");
  if (!q.applyRoute) throw new Error("no route into the canonical Apply flow");
  const lying = q.badges.filter((b) => b.tone === "success" && /progress|review|قيد|مراجعة/i.test(b.text));
  if (lying.length) throw new Error(`an application is badged as qualified: ${JSON.stringify(lying)}`);
  const src = await projection("const statusTone = stateKey === 'Qualified'", 400);
  if (!/'Qualified' \? 'success'/.test(src)) throw new Error("Qualified is no longer the only success tone");
  if (/ApplicationInProgress' \? 'success'/.test(src)) throw new Error("an in-progress application maps to success");
  return `state=${q.state}, ${q.badges.length} badge(s); Apply routed not duplicated; only Qualified is success`;
});

await check("samples_state_grammar_and_no_completeness_score", async () => {
  await go("samples");
  const sm = await page.evaluate(() => {
    const main = document.querySelector("main");
    return {
      state: main.querySelector(".tf-state")?.getAttribute("data-state") || null,
      cards: main.querySelectorAll("article").length,
      badges: [...main.querySelectorAll(".tf-badge[data-tone]")].map((b) => b.dataset.tone),
      score: /\d+\s*%|portfolio score|completeness/i.test(main.innerText),
      addRoute: [...main.querySelectorAll("button")].some((b) => /add|إضافة/i.test(b.textContent))
    };
  });
  if (sm.score) throw new Error("the samples surface shows a portfolio completeness score");
  if (!sm.state && !sm.cards) throw new Error("samples resolved to neither a state nor cards");
  if (!sm.addRoute) throw new Error("no route to add a showcase");
  return `state=${sm.state}, ${sm.cards} card(s), tones: ${[...new Set(sm.badges)].join(",") || "none"}; no score`;
});

// ---------------------------------------------------------------- business
await check("reviews_carry_exact_score_and_date_without_ranking", async () => {
  await go("reviews");
  const rv = await page.evaluate(() => {
    const main = document.querySelector("main");
    const cards = [...main.querySelectorAll("article")];
    return {
      state: main.querySelector(".tf-state")?.getAttribute("data-state") || null,
      cards: cards.length,
      sample: cards.slice(0, 2).map((c) => c.innerText.replace(/\s+/g, " ").trim().slice(0, 80)),
      ranking: /top rated|percentile|#\d+ of|الأفضل تقييم/i.test(main.innerText)
    };
  });
  if (rv.ranking) throw new Error("the reviews surface makes an unsupported ranking claim");
  if (!rv.cards && rv.state !== "empty") throw new Error("reviews resolved to neither cards nor an empty state");
  const src = await projection("teacherReviews: (s.liveReviews", 900);
  if (!/score: Number\(review\.overallScore/.test(src)) throw new Error("the exact review score is not projected");
  if (!/date: review\.createdAt/.test(src)) throw new Error("the review date is not projected");
  return rv.cards
    ? `${rv.cards} card(s): ${rv.sample.join(" | ")}`
    : "no reviews seeded; empty state shown and the projection carries exact score + date";
});

await check("earnings_never_presents_orders_as_a_wallet", async () => {
  await go("overview");
  const ov = await page.evaluate(() =>
    [...document.querySelectorAll("main .tf-money-lede")].map((p) => p.textContent.trim()));
  if (!ov.length) throw new Error("the Overview earnings block states no wallet disclaimer");
  if (!/not a second wallet|ليست محفظة/i.test(ov.join(" "))) {
    throw new Error(`the disclaimer no longer says orders are not a wallet: ${ov.join(" | ")}`);
  }
  await go("earnings");
  const ea = await page.evaluate(() => {
    const main = document.querySelector("main");
    return {
      lede: main.querySelector(".tf-money-lede")?.textContent.trim() || "",
      amounts: [...main.querySelectorAll(".tf-money-amt, .tf-table__money")]
        .map((a) => a.textContent.trim()).filter(Boolean).slice(0, 4),
      invented: /projected|estimated|forecast|potential earnings/i.test(main.innerText)
    };
  });
  if (ea.invented) throw new Error("the earnings surface presents a projected or estimated bucket");
  /** Order money must be the Teacher's net where the API supplies it. */
  const src = await projection("const priceView = Tafseel.moneyView(", 160);
  if (!/teacherNet/.test(src)) throw new Error("order amounts no longer prefer the Teacher net");
  return `both surfaces disclaim the order list; amounts use the Teacher net; sample: ${ea.amounts.join(" | ") || "none"}`;
});

await check("withdrawals_validate_before_they_transfer", async () => {
  const src = await projection("onWithdraw: async", 1800);
  if (!src) throw new Error("could not read the withdrawal path");
  for (const [needle, what] of [
    ["s.withdrawalBusy", "double-submit guard"],
    ["payoutProfile", "payout-profile verification gate"],
    ["minimumAmount", "minimum-amount rule"],
    ["balance.available", "available-balance ceiling"],
    ["Idempotency-Key", "idempotency key"]
  ]) {
    if (!src.includes(needle)) throw new Error(`the withdrawal path lost its ${what}`);
  }
  await go("withdrawals");
  const w = await page.evaluate(() => {
    const main = document.querySelector("main");
    const btn = [...main.querySelectorAll("button")].find((b) => /withdraw|سحب/i.test(b.textContent));
    return {
      state: main.querySelector(".tf-state")?.getAttribute("data-state") || null,
      button: btn ? { label: btn.textContent.trim(), disabled: btn.disabled } : null
    };
  });
  return "validation chain intact (busy guard, payout profile, minimum, available ceiling, idempotency); "
    + `state=${w.state}, control=${w.button ? `"${w.button.label}" disabled=${w.button.disabled}` : "none"}; `
    + "no transfer executed by this suite";
});

// ---------------------------------------------------------------- account
await check("profile_and_settings_own_different_jobs", async () => {
  await go("profile");
  const prof = await page.evaluate(() => ({
    publication: [...document.querySelectorAll("main button")]
      .some((b) => /publish|unpublish|نشر|إخفاء/i.test(b.textContent)),
    expertise: /expertise|certificate|الخبرة|الشهادات/i.test(document.querySelector("main").innerText)
  }));
  if (!prof.publication) throw new Error("the Profile surface exposes no publication control");
  await go("settings");
  const set = await page.evaluate(() => {
    const t = document.querySelector("main").innerText;
    return {
      account: /password|email|notification|كلمة المرور|البريد|الإشعارات/i.test(t),
      /** Selling setup must never migrate into Account settings. */
      leaked: /marketplace service|availability window|qualification subject/i.test(t)
    };
  });
  if (!set.account) throw new Error("Settings exposes no real account settings");
  if (set.leaked) throw new Error("selling setup leaked into Account settings");
  return "Profile owns publication and presentation; Settings owns account only, with no selling setup";
});

await check("no_dc_runtime_errors_during_product_suite", async () => {
  if (runtimeErrors.length) throw new Error(runtimeErrors.slice(0, 3).join(" | "));
  return "no dc-runtime console errors or page errors across the whole run";
});

await page.screenshot({ path: join(SHOTS, "teacher-product-final.png") });
await ctx.close();
await browser.close();

console.log(`\n${results.length - failed}/${results.length} Teacher product-workspace checks passed.`);
console.log(`Evidence: ${SHOTS}`);
if (failed) { console.error("Teacher product UX suite FAILED."); process.exit(1); }
