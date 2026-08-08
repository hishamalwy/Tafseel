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
const wait = ms => new Promise(r => setTimeout(r, ms));

const budget = createRequestBudget({ baseUrl: BASE_URL, globalSafety: 50, authSafety: 2 });

async function waitApi(page) {
  await page.waitForFunction(() => window.Tafseel && window.Tafseel.api && window.Tafseel.api.me && window.Tafseel.api.me(), null, { timeout: 25000 });
}

async function waitChatReady(page) {
  await page.waitForFunction(() => typeof window.TafseelChat === "object" && typeof window.TafseelChat.open === "function", null, { timeout: 20000 });
}

async function openThread(page, conversationId) {
  await waitChatReady(page);
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
      connected,
      connectCount: debug && debug.connectCount || 0,
      widgets: debug && debug.widgets || document.querySelectorAll(".tf-chat-widget").length,
      hasSharedHub: !!(debug && debug.hasSharedHub) || !!hub
    };
  });
}

async function main() {
  if (!CREDENTIALS.Student.password || !CREDENTIALS.Teacher.password) throw new Error("UAT passwords missing");
  const browser = await chromium.launch();
  let studentPack;
  let teacherPack;
  try {
    budget.setScenario("login-student");
    await loginOnceAndSave(browser, "Student", { beforeLogin: page => budget.attachPage(page, "Student") });
    budget.setScenario("login-teacher");
    await loginOnceAndSave(browser, "Teacher", { beforeLogin: page => budget.attachPage(page, "Teacher") });

    budget.setScenario("student-dashboard-load");
    const studentStart = Date.now();
    studentPack = await openAuthedPage(browser, "Student", `${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html?section=orders`, {
      theme: "light", lang: "en", beforeGoto: page => budget.attachPage(page, "Student")
    });
    await waitApi(studentPack.page).catch(() => {});
    await wait(2500);
    const studentLoad = budget.summarizeWindow(studentStart, Date.now());

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

    budget.setScenario("conversation-open");
    const openStart = Date.now();
    await openThread(studentPack.page, orderData.conversationId);
    await wait(800);
    const conversationOpen = budget.summarizeWindow(openStart, Date.now());
    const afterOpenHub = await hubSnapshot(studentPack.page);

    budget.setScenario("teacher-dashboard-load");
    const teacherStart = Date.now();
    teacherPack = await openAuthedPage(browser, "Teacher", `${BASE_URL}/app/Tafseel-Teacher-Dashboard.dc.html?section=orders`, {
      theme: "light", lang: "en", beforeGoto: page => budget.attachPage(page, "Teacher")
    });
    await waitApi(teacherPack.page).catch(() => {});
    await wait(2500);
    const teacherLoad = budget.summarizeWindow(teacherStart, Date.now());

    await budget.waitForHeadroom({ global: Math.max(40, studentLoad.firstPartyRequests + 10), auth: 2 }, "pre-student-remount");
    budget.setScenario("student-single-remount");
    const sRemountStart = Date.now();
    await persistContextState(studentPack.context, "Student");
    await paceAuthSensitive();
    await studentPack.page.goto(`${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html?section=orders&filter=completed`, { waitUntil: "load", timeout: 30000 });
    await waitApi(studentPack.page);
    await wait(1200);
    const btn = studentPack.page.locator("button", { hasText: /Messages|الرسائل/i }).first();
    if (await btn.count()) await btn.click();
    await openThread(studentPack.page, orderData.completedConversationId || orderData.conversationId);
    const sHub = await hubSnapshot(studentPack.page);
    const studentRemount = budget.summarizeWindow(sRemountStart, Date.now());

    await budget.waitForHeadroom({ global: Math.max(40, teacherLoad.firstPartyRequests + 10), auth: 2 }, "pre-teacher-remount");
    budget.setScenario("teacher-single-remount");
    const tRemountStart = Date.now();
    await persistContextState(teacherPack.context, "Teacher");
    await paceAuthSensitive();
    await teacherPack.page.goto(`${BASE_URL}/app/Tafseel-Teacher-Dashboard.dc.html?section=orders`, { waitUntil: "load", timeout: 30000 });
    await waitApi(teacherPack.page);
    await wait(1200);
    await openThread(teacherPack.page, orderData.completedConversationId || orderData.conversationId);
    const tHub = await hubSnapshot(teacherPack.page);
    const teacherRemount = budget.summarizeWindow(tRemountStart, Date.now());

    const plan = deriveBatchPlan(
      Math.max(studentRemount.firstPartyRequests, teacherRemount.firstPartyRequests),
      Math.max(studentRemount.authRequests, teacherRemount.authRequests, 1)
    );

    const duplicateNotes = [];
    for (const [label, summary] of [["student-remount", studentRemount], ["teacher-remount", teacherRemount], ["conversation-open", conversationOpen]]) {
      for (const [route, n] of Object.entries(summary.routes || {})) {
        if (n >= 3 && /GET \/(api\/v1\/(conversations|orders|learning-requests|notifications)|hubs\/messages\/negotiate)/.test(route)) {
          duplicateNotes.push({ label, route, n, judgment: n >= 5 ? "investigate" : "likely-expected-boot-plus-select" });
        }
      }
    }

    const baseline = {
      capturedAt: new Date().toISOString(),
      limiter: budget.config,
      effectivePartitionNote: "UseRateLimiter precedes UseAuthentication; global partition falls back to IP for this host.",
      studentDashboardLoad: studentLoad,
      teacherDashboardLoad: teacherLoad,
      conversationOpen,
      studentSingleRemount: studentRemount,
      teacherSingleRemount: teacherRemount,
      afterOpenHub,
      studentRemountHub: sHub,
      teacherRemountHub: tHub,
      batchPlan: plan,
      limiterHeadersSeen: budget.limiterHeadersSeen(),
      maxRolling60s: budget.maxRolling(),
      maxAuthRolling60s: budget.maxAuthRolling(),
      status429: budget.events.filter(e => e.status === 429).length,
      status401: budget.events.filter(e => e.status === 401).length,
      conversationId: orderData.conversationId,
      completedConversationId: orderData.completedConversationId
    };
    fs.writeFileSync(path.join(outDir, "request-budget-baseline.json"), JSON.stringify(baseline, null, 2));
    fs.writeFileSync(path.join(outDir, "single-remount-trace.json"), JSON.stringify({
      student: { summary: studentRemount, hub: sHub },
      teacher: { summary: teacherRemount, hub: tHub },
      conversationOpen,
      duplicateNotes,
      events: budget.events.filter(e => e.kind === "request" && e.firstParty && /remount|conversation-open|dashboard-load/.test(e.scenario))
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

    console.log(JSON.stringify({
      studentLoad: studentLoad.firstPartyRequests,
      teacherLoad: teacherLoad.firstPartyRequests,
      conversationOpen: conversationOpen.firstPartyRequests,
      studentRemount: studentRemount.firstPartyRequests,
      teacherRemount: teacherRemount.firstPartyRequests,
      studentAuthRemount: studentRemount.authRequests,
      teacherAuthRemount: teacherRemount.authRequests,
      negotiateStudent: studentRemount.signalRNegotiateRequests,
      negotiateTeacher: teacherRemount.signalRNegotiateRequests,
      batchPlan: plan,
      status429: baseline.status429,
      status401: baseline.status401
    }, null, 2));
  } finally {
    await closeAuthed(studentPack);
    await closeAuthed(teacherPack);
    await browser.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
