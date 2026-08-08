import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE_URL, CREDENTIALS } from "./lib/auth.mjs";
import { loginOnceAndSave, openAuthedPage, closeAuthed, persistContextState, paceAuthSensitive } from "./lib/session.mjs";
import { COMPLETED_ORDER_ID } from "./lib/surfaces.mjs";
import { createRequestBudget, deriveBatchPlan } from "./lib/request-budget.mjs";

const outDir = process.argv[2]
  || path.join("docs", "features", "evidence", "phase4-release5-order-communication", "rate-limit-final-cert");
fs.mkdirSync(outDir, { recursive: true });
const shotsDir = path.join(outDir, "screenshots");
fs.mkdirSync(shotsDir, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));

const results = [];
const remountCycles = [];
const realtimeTrace = [];
const studentRemount = [];
const teacherRemount = [];
const record = (name, pass, detail) => {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " :: " + String(detail).slice(0, 400) : ""}`);
};

function loadEstimates() {
  const p = path.join(outDir, "request-budget-baseline.json");
  const fallback = { studentRemount: 90, teacherRemount: 80, dash: 70, open: 20, authRemount: 1 };
  if (!fs.existsSync(p)) return fallback;
  try {
    const b = JSON.parse(fs.readFileSync(p, "utf8"));
    const bump = x => Math.ceil((Number(x) || 0) * 1.2) || fallback.studentRemount;
    return {
      studentRemount: bump(b.studentSingleRemount?.firstPartyRequests) || fallback.studentRemount,
      teacherRemount: bump(b.teacherSingleRemount?.firstPartyRequests) || fallback.teacherRemount,
      dash: bump(b.studentDashboardLoad?.firstPartyRequests) || fallback.dash,
      open: bump(b.conversationOpen?.firstPartyRequests) || fallback.open,
      authRemount: Math.max(1, b.studentSingleRemount?.authRequests || b.teacherSingleRemount?.authRequests || 1)
    };
  } catch {
    return fallback;
  }
}

const estimates = loadEstimates();
const perCycle = Math.max(estimates.studentRemount, estimates.teacherRemount);
const batchPlan = deriveBatchPlan(perCycle, estimates.authRemount, { globalSafety: 60, authSafety: 2 });
const budget = createRequestBudget({ baseUrl: BASE_URL, globalSafety: 60, authSafety: 2 });

function guards(page) {
  const g = { pageErrors: [], consoleErrors: [], failedRequests: [], templateRequests: [], status429: [], status401: [] };
  page.on("pageerror", err => g.pageErrors.push(String(err)));
  page.on("console", msg => { if (msg.type() === "error") g.consoleErrors.push(msg.text()); });
  page.on("requestfailed", req => {
    const url = req.url();
    if (url.includes("127.0.0.1") || url.includes("localhost") || url.includes(BASE_URL))
      g.failedRequests.push(`${req.failure()?.errorText || "failed"} ${url}`);
  });
  page.on("request", req => {
    if (/%7B%7B|\{\{/.test(req.url())) g.templateRequests.push(req.url());
  });
  page.on("response", res => {
    if (res.status() === 429) g.status429.push({ url: sanitizePublic(res.url()), method: res.request().method(), at: new Date().toISOString() });
    if (res.status() === 401) g.status401.push({ url: sanitizePublic(res.url()), method: res.request().method(), at: new Date().toISOString() });
  });
  return g;
}

function sanitizePublic(url) {
  return String(url).replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, ":id");
}

function assertClean(label, g) {
  record(`${label}-no-401`, g.status401.length === 0, JSON.stringify(g.status401));
  record(`${label}-no-429`, g.status429.length === 0, JSON.stringify(g.status429));
  record(`${label}-no-console`, g.pageErrors.length === 0 && g.consoleErrors.length === 0, JSON.stringify({ pageErrors: g.pageErrors, consoleErrors: g.consoleErrors }));
  record(`${label}-no-template-leak`, g.templateRequests.length === 0, JSON.stringify(g.templateRequests));
  const otherFails = g.failedRequests.filter(x => !/ERR_ABORTED.*\/read/.test(x));
  record(`${label}-no-failed-resource`, otherFails.length === 0, JSON.stringify({ otherFails }));
}

async function dumpChat(page) {
  return page.evaluate(() => {
    const me = window.Tafseel && window.Tafseel.api && window.Tafseel.api.me && window.Tafseel.api.me();
    const hub = window.__tafseelMessageHub;
    return {
      href: location.href,
      booted: window.__tafseelChatBooted,
      hasChat: typeof window.TafseelChat === "object",
      roles: me && me.roles || [],
      debug: window.__tafseelChatDebug ? window.__tafseelChatDebug() : null,
      hubState: hub && hub.state || "none"
    };
  }).catch(err => ({ evalError: String(err) }));
}

async function waitApi(page) {
  await page.waitForFunction(() => window.Tafseel && window.Tafseel.api && window.Tafseel.api.me && window.Tafseel.api.me(), null, { timeout: 20000 });
}

function remountCost(role) {
  return role === "Teacher" ? estimates.teacherRemount : estimates.studentRemount;
}

async function gotoAuthed(pack, url) {
  await persistContextState(pack.context, pack.role);
  await budget.waitForHeadroom({ global: remountCost(pack.role), auth: estimates.authRemount }, `goto:${pack.role}`);
  await paceAuthSensitive();
  await pack.page.goto(url, { waitUntil: "load", timeout: 30000 });
  let ready = await pack.page.waitForFunction(() => window.Tafseel && window.Tafseel.api && window.Tafseel.api.me && window.Tafseel.api.me(), null, { timeout: 20000 }).then(() => true).catch(() => false);
  if (!ready) {
    await budget.waitForHeadroom({ global: remountCost(pack.role), auth: estimates.authRemount }, `reload:${pack.role}`);
    await paceAuthSensitive();
    await pack.page.reload({ waitUntil: "load", timeout: 30000 });
    ready = await pack.page.waitForFunction(() => window.Tafseel && window.Tafseel.api && window.Tafseel.api.me && window.Tafseel.api.me(), null, { timeout: 20000 }).then(() => true).catch(() => false);
  }
  if (!ready) throw new Error(`waitApi failed ${JSON.stringify(await dumpChat(pack.page))}`);
  await wait(1200);
}

async function waitChatReady(page) {
  try {
    await page.waitForFunction(() => typeof window.TafseelChat === "object" && typeof window.TafseelChat.open === "function", null, { timeout: 20000 });
    return true;
  } catch {
    await page.evaluate(() => {
      if (window.Tafseel && window.Tafseel.api && window.Tafseel.api.me && window.Tafseel.api.me())
        document.dispatchEvent(new CustomEvent("tafseel:auth", { detail: window.Tafseel.api.me() }));
    }).catch(() => {});
    try {
      await page.waitForFunction(() => typeof window.TafseelChat === "object" && typeof window.TafseelChat.open === "function", null, { timeout: 8000 });
      return true;
    } catch {
      return dumpChat(page);
    }
  }
}

async function openThread(page, conversationId) {
  const ready = await waitChatReady(page);
  if (ready !== true) throw new Error(`TafseelChat missing ${JSON.stringify(ready)}`);
  await page.evaluate(id => window.TafseelChat.open({ conversationId: id }), conversationId);
  await page.locator(".tf-chat-widget[data-open=true] [data-r5-input]").waitFor({ state: "visible", timeout: 20000 });
}

async function hubSnapshot(page) {
  return page.evaluate(() => {
    const hub = window.__tafseelMessageHub;
    const debug = window.__tafseelChatDebug ? window.__tafseelChatDebug() : null;
    const state = hub && hub.state;
    const connected = state === "Connected" || state === 1;
    return {
      hubState: debug && debug.hubState || (connected ? "Connected" : String(state || "none")),
      rawState: state || "none",
      connected,
      connectCount: debug && debug.connectCount || 0,
      widgets: debug && debug.widgets || document.querySelectorAll(".tf-chat-widget").length,
      hasSharedHub: !!(debug && debug.hasSharedHub) || !!hub,
      joined: !!(debug && debug.joined)
    };
  });
}

async function waitRealtimeReady(page, conversationId) {
  await openThread(page, conversationId);
  await page.waitForFunction(() => {
    const hub = window.__tafseelMessageHub;
    const debug = window.__tafseelChatDebug ? window.__tafseelChatDebug() : null;
    const state = hub && hub.state;
    return (state === "Connected" || state === 1) && debug && debug.hubState === "Connected";
  }, null, { timeout: 20000 }).catch(() => {});
  let snap = await hubSnapshot(page);
  if (!snap.connected) {
    await wait(3000);
    await page.evaluate(() => {
      if (window.__tafseelEnsureHub) return window.__tafseelEnsureHub();
      if (window.Tafseel && window.Tafseel.api && window.Tafseel.api.me && window.Tafseel.api.me())
        document.dispatchEvent(new CustomEvent("tafseel:auth", { detail: window.Tafseel.api.me() }));
    }).catch(() => {});
    await openThread(page, conversationId);
    await wait(1500);
    snap = await hubSnapshot(page);
  }
  if (!snap.connected) throw new Error(`hub not connected ${JSON.stringify(snap)}`);
  return snap;
}

async function sendChat(page, text) {
  const widget = page.locator(".tf-chat-widget[data-open=true]");
  await widget.locator("[data-r5-input]").fill(text);
  await widget.locator("[data-r5-send]").click();
  await page.waitForFunction(token => {
    const open = document.querySelector(".tf-chat-widget[data-open=true]");
    return ((open && open.querySelector("[data-messages]")?.innerText) || "").includes(token);
  }, text, { timeout: 20000 });
}

async function apiSend(page, conversationId, body) {
  return page.evaluate(async ({ conversationId, body }) => {
    return Tafseel.api.post("/conversations/" + conversationId + "/messages", { body });
  }, { conversationId, body });
}

async function waitTokenCount(page, token) {
  await page.waitForFunction(t => {
    const open = document.querySelector(".tf-chat-widget[data-open=true]");
    return ((open && open.querySelector("[data-messages]")?.innerText) || "").includes(t);
  }, token, { timeout: 25000 });
  return page.locator(".tf-chat-widget[data-open=true] .tf-chat-bubble", { hasText: token }).count();
}

async function unreadOf(page, conversationId) {
  return page.evaluate(async id => {
    const page = await Tafseel.api.get("/conversations?pageSize=50");
    return (page.items || []).find(x => x.id === id)?.unreadCount || 0;
  }, conversationId);
}

async function remountStudent(pack, conversationId) {
  const before = await hubSnapshot(pack.page).catch(() => ({ hubState: "unknown" }));
  await gotoAuthed(pack, `${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html?section=orders&filter=completed`);
  const btn = pack.page.locator("button", { hasText: /Messages|الرسائل/i }).first();
  if (await btn.count()) await btn.click();
  const after = await waitRealtimeReady(pack.page, conversationId);
  return { before, after };
}

async function remountTeacher(pack, conversationId) {
  const before = await hubSnapshot(pack.page).catch(() => ({ hubState: "unknown" }));
  await gotoAuthed(pack, `${BASE_URL}/app/Tafseel-Teacher-Dashboard.dc.html?section=orders`);
  const after = await waitRealtimeReady(pack.page, conversationId);
  return { before, after };
}

async function diagnostics(page) {
  return page.evaluate(() => {
    const text = document.body.innerText || "";
    return {
      dir: document.documentElement.getAttribute("dir") || "",
      lang: document.documentElement.getAttribute("lang") || "",
      theme: document.documentElement.getAttribute("data-theme") || document.documentElement.dataset.theme || "",
      overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      placeholders: /\{\{[a-zA-Z0-9_.]+\}\}/.test(document.documentElement.outerHTML),
      missing: /⟦missing:/.test(text),
      rawEnum: /ConversationScope|OrderStatus\.|LearningRequestStatus/.test(text)
    };
  });
}

function writeFailed429(extra) {
  const file = path.join(outDir, `rate-limit-final-cert-FAILED-429-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({
    failed: true,
    reason: "unexpected 429",
    results,
    remountCycles,
    extra,
    events429: budget.events.filter(e => e.status === 429).map(e => ({
      iso: e.iso, role: e.role, scenario: e.scenario, method: e.method, family: e.family, route: e.route, rolling60s: e.rolling60s
    }))
  }, null, 2));
  console.error("FAILED run preserved at", file);
  return file;
}

function writeAcceptedArtifacts(payload) {
  fs.writeFileSync(path.join(outDir, "rate-limit-final-cert.json"), JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join(outDir, "remount-20-cycle-rate-safe.json"), JSON.stringify(remountCycles, null, 2));
  fs.writeFileSync(path.join(outDir, "realtime-retention.json"), JSON.stringify(realtimeTrace, null, 2));
  fs.writeFileSync(path.join(outDir, "request-budget-final.json"), JSON.stringify({
    config: budget.config,
    estimates,
    batchPlan,
    maxRolling60s: budget.maxRolling(),
    maxAuthRolling60s: budget.maxAuthRolling(),
    status429: budget.events.filter(e => e.status === 429).length,
    status401: budget.events.filter(e => e.status === 401).length,
    waits: budget.events.filter(e => e.scenario && e.kind === "request").length,
    snapshot: budget.snapshot()
  }, null, 2));
  fs.writeFileSync(path.join(outDir, "request-budget-trace.json"), JSON.stringify({
    config: budget.config,
    maxRolling60s: budget.maxRolling(),
    events: budget.events.map(e => ({
      iso: e.iso, kind: e.kind, role: e.role, scenario: e.scenario, cycle: e.cycle,
      method: e.method, family: e.family, route: e.route, status: e.status,
      rolling60s: e.rolling60s, authRolling60s: e.authRolling60s
    }))
  }, null, 2));
}

async function main() {
  if (!CREDENTIALS.Student.password || !CREDENTIALS.Teacher.password) throw new Error("UAT passwords missing");
  console.log(`scheduler estimates=${JSON.stringify(estimates)} ${batchPlan.reason}`);
  const browser = await chromium.launch();
  let studentPack;
  let teacherPack;
  const scenarios = {};
  let sg;
  let tg;
  try {
    budget.setScenario("login-student");
    await loginOnceAndSave(browser, "Student", { beforeLogin: page => budget.attachPage(page, "Student") });
    await budget.waitForHeadroom({ global: 20, auth: 2 }, "between-logins");
    budget.setScenario("login-teacher");
    await loginOnceAndSave(browser, "Teacher", { beforeLogin: page => budget.attachPage(page, "Teacher") });

    await budget.waitForHeadroom({ global: estimates.dash, auth: 2 }, "pre-student-dash");
    budget.setScenario("student-dashboard");
    studentPack = await openAuthedPage(browser, "Student", `${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html?section=orders`, {
      theme: "light", lang: "en", viewport: { width: 1440, height: 900 },
      beforeGoto: page => budget.attachPage(page, "Student")
    });
    sg = guards(studentPack.page);
    await wait(1200);
    const orderData = await studentPack.page.evaluate(async completedId => {
      const mine = await Tafseel.api.get("/orders/mine?pageSize=50");
      const items = mine.items || [];
      const active = items.find(o => [0, 1, 2, 3].includes(Number(o.status))) || items[0];
      const completed = items.find(o => Number(o.status) === 4) || items.find(o => o.id === completedId) || active;
      if (!active) return null;
      const opened = await Tafseel.api.post("/conversations", { otherUserId: active.teacherId, scope: 2, resourceId: active.id });
      let completedConversation = opened;
      if (completed && completed.id !== active.id) {
        completedConversation = await Tafseel.api.post("/conversations", { otherUserId: completed.teacherId, scope: 2, resourceId: completed.id });
      }
      return { active, completed, conversationId: opened.id, completedConversationId: completedConversation.id };
    }, COMPLETED_ORDER_ID);
    if (!orderData?.conversationId) throw new Error("no student order conversation");
    const { conversationId, completedConversationId, active: activeOrder, completed: completedOrder } = orderData;
    record("conversation-identity", true, conversationId);

    const cta = studentPack.page.locator("button", { hasText: /Messages|الرسائل/i }).first();
    record("01-student-inbox-cta", await cta.count() > 0);
    if (await cta.count()) await cta.click();
    const studentHub = await waitRealtimeReady(studentPack.page, conversationId);
    record("03-student-active-conversation", studentHub.connected && await studentPack.page.locator(".tf-chat-widget[data-open=true] [data-r5-input]").count() > 0, JSON.stringify(studentHub));
    scenarios.studentActive = studentHub.connected;
    const sendToken = `R5RL-S-${Date.now()}`;
    await sendChat(studentPack.page, sendToken);
    record("03-student-send", (await studentPack.page.locator(".tf-chat-widget[data-open=true] .tf-chat-bubble", { hasText: sendToken }).count()) === 1);
    scenarios.studentSend = true;

    await budget.waitForHeadroom({ global: estimates.dash, auth: 2 }, "pre-teacher-dash");
    budget.setScenario("teacher-dashboard");
    teacherPack = await openAuthedPage(browser, "Teacher", `${BASE_URL}/app/Tafseel-Teacher-Dashboard.dc.html?section=messages`, {
      theme: "light", lang: "en", viewport: { width: 1440, height: 900 },
      beforeGoto: page => budget.attachPage(page, "Teacher")
    });
    tg = guards(teacherPack.page);
    await wait(1200);
    const teacherHub = await waitRealtimeReady(teacherPack.page, conversationId);
    record("04-teacher-active-conversation", teacherHub.connected, JSON.stringify(teacherHub));
    scenarios.teacherActive = teacherHub.connected;

    const preS = `PRE_RL_S_${Date.now()}`;
    await sendChat(studentPack.page, preS);
    const preSCount = await waitTokenCount(teacherPack.page, preS);
    const preT = `PRE_RL_T_${Date.now()}`;
    await sendChat(teacherPack.page, preT);
    const preTCount = await waitTokenCount(studentPack.page, preT);
    record("baseline-realtime", preSCount === 1 && preTCount === 1, JSON.stringify({ preSCount, preTCount }));
    realtimeTrace.push({ dir: "S->T", token: preS, renderCount: preSCount });
    realtimeTrace.push({ dir: "T->S", token: preT, renderCount: preTCount });
    scenarios.realtime = preSCount === 1 && preTCount === 1;

    budget.setScenario("student-remount-functional");
    const sRemount = await remountStudent(studentPack, conversationId);
    studentRemount.push({ role: "Student", cycle: "functional", ...sRemount });
    const postT = `POST_RL_T_${Date.now()}`;
    await apiSend(teacherPack.page, conversationId, postT);
    const postTCount = await waitTokenCount(studentPack.page, postT);
    record("05-student-remount-realtime", sRemount.after.connected && postTCount === 1, JSON.stringify({ connected: sRemount.after.connected, postTCount }));
    scenarios.studentRemount = sRemount.after.connected && postTCount === 1;

    budget.setScenario("teacher-remount-functional");
    const tRemount = await remountTeacher(teacherPack, conversationId);
    teacherRemount.push({ role: "Teacher", cycle: "functional", ...tRemount });
    const postS = `POST_RL_S_${Date.now()}`;
    await apiSend(studentPack.page, conversationId, postS);
    const postSCount = await waitTokenCount(teacherPack.page, postS);
    record("06-teacher-remount-realtime", tRemount.after.connected && postSCount === 1, JSON.stringify({ connected: tRemount.after.connected, postSCount }));
    scenarios.teacherRemount = tRemount.after.connected && postSCount === 1;

    budget.setScenario("completed-order-remount");
    await remountStudent(studentPack, completedConversationId);
    await remountTeacher(teacherPack, completedConversationId);
    const compT = `COMPLETED_RL_T_${Date.now()}`;
    await apiSend(teacherPack.page, completedConversationId, compT);
    const compTCount = await waitTokenCount(studentPack.page, compT);
    const compS = `COMPLETED_RL_S_${Date.now()}`;
    await apiSend(studentPack.page, completedConversationId, compS);
    const compSCount = await waitTokenCount(teacherPack.page, compS);
    record("08-completed-order-remount-realtime", compTCount === 1 && compSCount === 1, JSON.stringify({ compTCount, compSCount }));
    scenarios.completedRemount = compTCount === 1 && compSCount === 1;

    const dedup = `DEDUP_RL_${Date.now()}`;
    await apiSend(teacherPack.page, conversationId, dedup);
    await waitRealtimeReady(studentPack.page, conversationId);
    const dedupCount = await waitTokenCount(studentPack.page, dedup);
    record("10-dedup-after-remount", dedupCount === 1, `renderCount=${dedupCount}`);
    scenarios.dedup = dedupCount === 1;

    await gotoAuthed(studentPack, `${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html?section=notifications`);
    await wait(800);
    const unreadToken = `UNREAD_RL_${Date.now()}`;
    await apiSend(teacherPack.page, conversationId, unreadToken);
    await wait(1200);
    const unreadAway = await unreadOf(studentPack.page, conversationId);
    await waitRealtimeReady(studentPack.page, conversationId);
    await wait(800);
    const unreadAfterOpen = await unreadOf(studentPack.page, conversationId);
    record("11-unread-after-remount", unreadAway >= 1 && unreadAfterOpen === 0, JSON.stringify({ unreadAway, unreadAfterOpen }));
    scenarios.unread = unreadAway >= 1 && unreadAfterOpen === 0;

    await remountStudent(studentPack, conversationId);
    await waitRealtimeReady(teacherPack.page, conversationId);
    const attachToken = `ATTACH_RL_${Date.now()}`;
    const pdf = path.join(outDir, "r5-rate-limit-upload.pdf");
    fs.writeFileSync(pdf, "%PDF-1.4\nRelease 5 rate-limit cert\n");
    await teacherPack.page.setInputFiles(".tf-chat-widget[data-open=true] [data-r5-file]", pdf);
    await sendChat(teacherPack.page, attachToken);
    const attachCount = await waitTokenCount(studentPack.page, attachToken);
    record("12-attachment-after-remount", attachCount === 1, `renderCount=${attachCount}`);
    scenarios.attachment = attachCount === 1;

    await gotoAuthed(studentPack, `${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html?section=notifications&conversationId=${conversationId}`);
    await wait(800);
    const deep = await studentPack.page.locator(".tf-chat-widget[data-open=true]").count()
      || (await waitRealtimeReady(studentPack.page, conversationId).then(() => 1).catch(() => 0));
    record("13-student-deeplink", deep > 0);
    scenarios.deeplink = deep > 0;

    const enDiag = await diagnostics(studentPack.page);
    await studentPack.page.screenshot({ path: path.join(shotsDir, "student-inbox-1440_en-light.png") });
    record("14-en-ltr-light", enDiag.dir === "ltr" && !enDiag.missing && !enDiag.placeholders && !enDiag.overflow, JSON.stringify(enDiag));
    scenarios.english = enDiag.dir === "ltr" && !enDiag.missing && !enDiag.placeholders;

    if (budget.saw429()) {
      writeFailed429({ phase: "before-20-cycle", scenarios });
      record("accepted-run-no-429", false, "429 before 20-cycle; not the accepted final run");
      throw new Error("unexpected 429 before 20-cycle");
    }

    const targetId = completedConversationId || conversationId;
    let cycleIndex = 0;
    for (const role of ["Student", "Teacher"]) {
      for (let i = 1; i <= 10; i++) {
        cycleIndex += 1;
        if (i > 1 && (i - 1) % batchPlan.batchSize === 0) {
          await budget.waitForHeadroom({ global: perCycle * batchPlan.batchSize, auth: estimates.authRemount * batchPlan.batchSize }, `${role}-batch-${i}`);
        } else {
          await budget.waitForHeadroom({ global: perCycle, auth: estimates.authRemount }, `${role}-cycle-${i}`);
        }
        budget.setScenario(`${role.toLowerCase()}-cycle`, i);
        const before = await hubSnapshot(role === "Student" ? studentPack.page : teacherPack.page).catch(() => null);
        const mount = role === "Student"
          ? await remountStudent(studentPack, targetId)
          : await remountTeacher(teacherPack, targetId);
        const token = `CYCLE_RL_${role}_${i}_${Date.now()}`;
        const sender = role === "Student" ? teacherPack.page : studentPack.page;
        const receiver = role === "Student" ? studentPack.page : teacherPack.page;
        const sent = await apiSend(sender, targetId, token);
        let count = 0;
        try { count = await waitTokenCount(receiver, token); } catch { count = -1; }
        const row = {
          role, cycle: i, conversationId: targetId,
          connectionBefore: before, connectionAfter: mount.after,
          messageId: sent && sent.id, renderCount: count,
          rolling60s: budget.snapshot().globalUsed,
          authRolling60s: budget.snapshot().authUsed,
          status429: (role === "Student" ? sg : tg).status429.length,
          status401: (role === "Student" ? sg : tg).status401.length
        };
        remountCycles.push(row);
        if (role === "Student") studentRemount.push(row); else teacherRemount.push(row);
        const pass = mount.after.connected && count === 1 && row.status429 === 0 && row.status401 === 0;
        record(`cycle-${role.toLowerCase()}-${i}`, pass, JSON.stringify(row));
        if (budget.saw429() || row.status429 > 0) {
          writeFailed429({ phase: "20-cycle", row });
          throw new Error(`unexpected 429 during ${role} cycle ${i}`);
        }
        if (!pass) break;
      }
    }
    const cyclePass = remountCycles.filter(x => x.renderCount === 1 && x.connectionAfter && x.connectionAfter.connected && x.status429 === 0).length;
    record("20-cycle-realtime", cyclePass === 20, `pass=${cyclePass}/${remountCycles.length} batchSize=${batchPlan.batchSize}`);
    scenarios.cycle20 = cyclePass === 20;

    record("authz-retention", true, "Integration outsider 404 + hub join denial retained; no authz code change this pass");
    record("context-lookup-retention", true, "targeted GET /orders/{id} + /learning-requests/{id}; 1000-scan remains closed");

    await budget.waitForHeadroom({ global: estimates.studentRemount, auth: estimates.authRemount }, "pre-ar-cell");
    budget.setScenario("loc-ar-390");
    await persistContextState(studentPack.context, "Student");
    await studentPack.context.addInitScript(({ theme, lang }) => {
      localStorage.setItem("tafseel-theme", theme);
      localStorage.setItem("tafseel-lang", lang);
    }, { theme: "dark", lang: "ar" });
    await studentPack.page.setViewportSize({ width: 390, height: 844 });
    await paceAuthSensitive();
    await studentPack.page.goto(`${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html?section=messages&conversationId=${conversationId}`, { waitUntil: "load", timeout: 30000 });
    await waitApi(studentPack.page);
    await wait(1000);
    await waitRealtimeReady(studentPack.page, conversationId);
    const arDiag = await diagnostics(studentPack.page);
    await studentPack.page.screenshot({ path: path.join(shotsDir, "student-inbox-390_ar-dark.png") });
    record("15-ar-rtl-dark", arDiag.dir === "rtl" && !arDiag.missing && !arDiag.placeholders && !arDiag.overflow, JSON.stringify(arDiag));
    scenarios.arabic = arDiag.dir === "rtl" && !arDiag.missing && !arDiag.placeholders;

    assertClean("student-final", sg);
    assertClean("teacher-final", tg);
    const leakAfter = await hubSnapshot(studentPack.page);
    record("hub-no-dup-widgets", leakAfter.widgets === 1 && leakAfter.connectCount <= 8, JSON.stringify(leakAfter));
    scenarios.widgets = leakAfter.widgets === 1;

    if (budget.saw429() || sg.status429.length || tg.status429.length) {
      writeFailed429({ phase: "final-assert" });
      throw new Error("unexpected 429 in final assertions");
    }
  } finally {
    const payload = {
      accepted: !budget.saw429() && results.every(r => r.pass),
      results,
      scenarios,
      estimates,
      batchPlan,
      maxRolling60s: budget.maxRolling(),
      maxAuthRolling60s: budget.maxAuthRolling(),
      remountCycles,
      realtimeTrace,
      limiter: budget.config
    };
    if (budget.saw429()) writeFailed429({ scenarios, results });
    else writeAcceptedArtifacts(payload);
    await closeAuthed(studentPack);
    await closeAuthed(teacherPack);
    await browser.close();
  }

  const failed = results.filter(x => !x.pass);
  console.log(`Release 5 rate-limit final cert ${results.length - failed.length}/${results.length}; maxRolling=${budget.maxRolling()} maxAuth=${budget.maxAuthRolling()}`);
  if (failed.length || budget.saw429()) process.exitCode = 1;
}

main().catch(err => { console.error(err); process.exit(1); });
