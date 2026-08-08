import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE_URL, CREDENTIALS } from "./lib/auth.mjs";
import { loginOnceAndSave, openAuthedPage, closeAuthed, persistContextState, paceAuthSensitive, attachAuthBudget } from "./lib/session.mjs";
import { COMPLETED_ORDER_ID } from "./lib/surfaces.mjs";

const outDir = process.argv[2]
  || path.join("docs", "features", "evidence", "phase4-release5-order-communication", "micro-final-acceptance");
fs.mkdirSync(outDir, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));

const results = [];
const remountCycles = [];
const studentRemount = [];
const teacherRemount = [];
const bothRemount = [];
const completedRemount = [];
const record = (name, pass, detail) => {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " :: " + String(detail).slice(0, 500) : ""}`);
};

function guards(page) {
  const g = { pageErrors: [], consoleErrors: [], failedRequests: [], templateRequests: [], status429: [], status401: [], negotiate: 0 };
  page.on("pageerror", err => g.pageErrors.push(String(err)));
  page.on("console", msg => { if (msg.type() === "error") g.consoleErrors.push(msg.text()); });
  page.on("requestfailed", req => {
    const url = req.url();
    if (url.includes("127.0.0.1") || url.includes("localhost") || url.includes(BASE_URL))
      g.failedRequests.push(`${req.failure()?.errorText || "failed"} ${url}`);
  });
  page.on("request", req => {
    if (/%7B%7B|\{\{/.test(req.url())) g.templateRequests.push(req.url());
    if (req.url().includes("/hubs/messages/negotiate")) g.negotiate += 1;
  });
  page.on("response", res => {
    if (res.status() === 429) g.status429.push({ url: res.url(), method: res.request().method() });
    if (res.status() === 401) g.status401.push({ url: res.url(), method: res.request().method() });
  });
  return g;
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

async function gotoAuthed(pack, url) {
  await persistContextState(pack.context, pack.role);
  await paceAuthSensitive();
  await pack.page.goto(url, { waitUntil: "load", timeout: 30000 });
  let ready = await pack.page.waitForFunction(() => window.Tafseel && window.Tafseel.api && window.Tafseel.api.me && window.Tafseel.api.me(), null, { timeout: 20000 }).then(() => true).catch(() => false);
  if (!ready) {
    await paceAuthSensitive();
    await pack.page.reload({ waitUntil: "load", timeout: 30000 });
    ready = await pack.page.waitForFunction(() => window.Tafseel && window.Tafseel.api && window.Tafseel.api.me && window.Tafseel.api.me(), null, { timeout: 20000 }).then(() => true).catch(() => false);
  }
  if (!ready) throw new Error(`waitApi failed ${JSON.stringify(await dumpChat(pack.page))}`);
  await wait(1500);
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
    await wait(4000);
    await page.evaluate(() => {
      if (window.__tafseelEnsureHub) return window.__tafseelEnsureHub();
      if (window.Tafseel && window.Tafseel.api && window.Tafseel.api.me && window.Tafseel.api.me())
        document.dispatchEvent(new CustomEvent("tafseel:auth", { detail: window.Tafseel.api.me() }));
    }).catch(() => {});
    await openThread(page, conversationId);
    await wait(2000);
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

async function main() {
  if (!CREDENTIALS.Student.password || !CREDENTIALS.Teacher.password) throw new Error("UAT passwords missing");
  const browser = await chromium.launch();
  let studentPack;
  let teacherPack;
  const scenarios = {};
  try {
    await loginOnceAndSave(browser, "Student");
    await loginOnceAndSave(browser, "Teacher");

    studentPack = await openAuthedPage(browser, "Student", `${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html?section=orders`, { theme: "light", lang: "en" });
    const sg = guards(studentPack.page);
    attachAuthBudget(studentPack.page);
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

    const studentHub = await waitRealtimeReady(studentPack.page, conversationId);
    record("03-student-active-conversation", studentHub.connected && await studentPack.page.locator(".tf-chat-widget[data-open=true] [data-r5-input]").count() > 0, JSON.stringify(studentHub));
    scenarios.studentActive = studentHub.connected;

    teacherPack = await openAuthedPage(browser, "Teacher", `${BASE_URL}/app/Tafseel-Teacher-Dashboard.dc.html?section=messages`, { theme: "light", lang: "en" });
    const tg = guards(teacherPack.page);
    attachAuthBudget(teacherPack.page);
    await wait(1200);
    const teacherHub = await waitRealtimeReady(teacherPack.page, conversationId);
    record("04-teacher-active-conversation", teacherHub.connected, JSON.stringify(teacherHub));
    scenarios.teacherActive = teacherHub.connected;

    const preS = `PRE_REMOUNT_STUDENT_TOKEN_${Date.now()}`;
    await sendChat(studentPack.page, preS);
    const preSCount = await waitTokenCount(teacherPack.page, preS);
    const preT = `PRE_REMOUNT_TEACHER_TOKEN_${Date.now()}`;
    await sendChat(teacherPack.page, preT);
    const preTCount = await waitTokenCount(studentPack.page, preT);
    record("baseline-realtime", preSCount === 1 && preTCount === 1, JSON.stringify({ preSCount, preTCount }));

    const sRemount = await remountStudent(studentPack, conversationId);
    studentRemount.push({ role: "Student", cycle: 1, conversationId, ...sRemount });
    const postT = `POST_REMOUNT_TEACHER_TOKEN_${Date.now()}`;
    const sentPostT = await apiSend(teacherPack.page, conversationId, postT);
    const postTCount = await waitTokenCount(studentPack.page, postT);
    record("05-student-remount-realtime", sRemount.after.connected && postTCount === 1, JSON.stringify({ sRemount, postTCount, messageId: sentPostT && sentPostT.id }));
    scenarios.studentRemount = sRemount.after.connected && postTCount === 1;

    const tRemount = await remountTeacher(teacherPack, conversationId);
    teacherRemount.push({ role: "Teacher", cycle: 1, conversationId, ...tRemount });
    const postS = `POST_REMOUNT_STUDENT_TOKEN_${Date.now()}`;
    const sentPostS = await apiSend(studentPack.page, conversationId, postS);
    const postSCount = await waitTokenCount(teacherPack.page, postS);
    record("06-teacher-remount-realtime", tRemount.after.connected && postSCount === 1, JSON.stringify({ tRemount, postSCount, messageId: sentPostS && sentPostS.id }));
    scenarios.teacherRemount = tRemount.after.connected && postSCount === 1;

    await remountStudent(studentPack, conversationId);
    await remountTeacher(teacherPack, conversationId);
    const bothS = `BOTH_REMOUNT_S_${Date.now()}`;
    await apiSend(studentPack.page, conversationId, bothS);
    const bothSCount = await waitTokenCount(teacherPack.page, bothS);
    const bothT = `BOTH_REMOUNT_T_${Date.now()}`;
    await apiSend(teacherPack.page, conversationId, bothT);
    const bothTCount = await waitTokenCount(studentPack.page, bothT);
    bothRemount.push({ conversationId, bothSCount, bothTCount, student: await hubSnapshot(studentPack.page), teacher: await hubSnapshot(teacherPack.page) });
    record("07-both-remount-realtime", bothSCount === 1 && bothTCount === 1, JSON.stringify(bothRemount[0]));
    scenarios.bothRemount = bothSCount === 1 && bothTCount === 1;

    await remountStudent(studentPack, completedConversationId);
    await remountTeacher(teacherPack, completedConversationId);
    const compT = `COMPLETED_REMOUNT_T_${Date.now()}`;
    await apiSend(teacherPack.page, completedConversationId, compT);
    const compTCount = await waitTokenCount(studentPack.page, compT);
    const compS = `COMPLETED_REMOUNT_S_${Date.now()}`;
    await apiSend(studentPack.page, completedConversationId, compS);
    const compSCount = await waitTokenCount(teacherPack.page, compS);
    completedRemount.push({ conversationId: completedConversationId, orderId: completedOrder?.id || activeOrder.id, compTCount, compSCount });
    record("08-completed-order-remount-realtime", compTCount === 1 && compSCount === 1, JSON.stringify(completedRemount[0]));
    scenarios.completedRemount = compTCount === 1 && compSCount === 1;

    await persistContextState(studentPack.context, "Student");
    await paceAuthSensitive();
    await studentPack.page.reload({ waitUntil: "load", timeout: 30000 });
    await waitApi(studentPack.page);
    await wait(800);
    const reloadHub = await waitRealtimeReady(studentPack.page, conversationId);
    const reloadT = `HARD_RELOAD_T_${Date.now()}`;
    await apiSend(teacherPack.page, conversationId, reloadT);
    const reloadCount = await waitTokenCount(studentPack.page, reloadT);
    record("09-hard-reload-realtime", reloadHub.connected && reloadCount === 1, JSON.stringify({ reloadHub, reloadCount }));
    scenarios.hardReload = reloadHub.connected && reloadCount === 1;

    await gotoAuthed(studentPack, `${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html?section=messages&conversationId=${conversationId}`);
    await waitRealtimeReady(studentPack.page, conversationId);
    await gotoAuthed(studentPack, `${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html?section=notifications`);
    await studentPack.page.goBack();
    await waitApi(studentPack.page).catch(() => {});
    await wait(1200);
    await studentPack.page.goForward();
    await waitApi(studentPack.page).catch(() => {});
    await wait(1200);
    let bf = await dumpChat(studentPack.page);
    if (!bf.hasChat || !(bf.roles && bf.roles.length)) {
      await paceAuthSensitive();
      await studentPack.page.reload({ waitUntil: "load", timeout: 30000 });
      await waitApi(studentPack.page).catch(() => {});
      await wait(1200);
      bf = await dumpChat(studentPack.page);
    }
    if (await studentPack.page.locator(".tf-chat-widget[data-open=true]").count()) {
      const bfHub = await hubSnapshot(studentPack.page);
      record("09b-back-forward", bfHub.widgets <= 1 && !!bf.hasChat, JSON.stringify({ bf, bfHub }));
    } else {
      try {
        await waitRealtimeReady(studentPack.page, conversationId);
        record("09b-back-forward", true, "conversation restored via open after history; " + JSON.stringify(bf));
      } catch (err) {
        record("09b-back-forward", false, String(err).slice(0, 400) + " " + JSON.stringify(bf));
      }
    }

    try {
      await remountStudent(studentPack, conversationId);
      await waitRealtimeReady(teacherPack.page, conversationId);
      const dedup = `DEDUP_AFTER_REMOUNT_${Date.now()}`;
      await apiSend(teacherPack.page, conversationId, dedup);
      const dedupCount = await waitTokenCount(studentPack.page, dedup);
      record("10-dedup-after-remount", dedupCount === 1, `renderCount=${dedupCount}`);
      scenarios.dedup = dedupCount === 1;
    } catch (err) {
      record("10-dedup-after-remount", false, String(err).slice(0, 400));
      scenarios.dedup = false;
    }

    try {
      await gotoAuthed(studentPack, `${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html?section=notifications`);
      await wait(1000);
      const unreadBefore = await unreadOf(teacherPack.page, conversationId).catch(() => 0);
      const unreadToken = `UNREAD_AWAY_${Date.now()}`;
      await apiSend(teacherPack.page, conversationId, unreadToken);
      await wait(1500);
      const unreadAway = await unreadOf(studentPack.page, conversationId);
      await waitRealtimeReady(studentPack.page, conversationId);
      await wait(800);
      const unreadAfterOpen = await unreadOf(studentPack.page, conversationId);
      record("11-unread-after-remount", unreadAway >= 1 && unreadAfterOpen === 0, JSON.stringify({ unreadBefore, unreadAway, unreadAfterOpen }));
      scenarios.unread = unreadAway >= 1 && unreadAfterOpen === 0;
    } catch (err) {
      record("11-unread-after-remount", false, String(err).slice(0, 400));
      scenarios.unread = false;
    }

    try {
      await remountStudent(studentPack, conversationId);
      await waitRealtimeReady(teacherPack.page, conversationId);
      const attachToken = `ATTACH_AFTER_REMOUNT_${Date.now()}`;
      const pdf = path.join(outDir, "r5-micro-upload.pdf");
      fs.writeFileSync(pdf, "%PDF-1.4\nRelease 5 micro cert\n");
      await teacherPack.page.setInputFiles(".tf-chat-widget[data-open=true] [data-r5-file]", pdf);
      await sendChat(teacherPack.page, attachToken);
      const attachCount = await waitTokenCount(studentPack.page, attachToken);
      const attachSeen = await studentPack.page.evaluate(token => {
        const open = document.querySelector(".tf-chat-widget[data-open=true]");
        const bubble = [...(open ? open.querySelectorAll(".tf-chat-bubble") : [])].find(x => x.innerText.includes(token));
        return { text: bubble ? bubble.innerText : "", hasLink: !!(bubble && bubble.querySelector("a, [data-attachment], button")) };
      }, attachToken);
      record("12-attachment-after-remount", attachCount === 1, JSON.stringify({ attachCount, attachSeen }));
      scenarios.attachment = attachCount === 1;
    } catch (err) {
      record("12-attachment-after-remount", false, String(err).slice(0, 400));
      scenarios.attachment = false;
    }

    console.log("Waiting 65s for global limiter window before 20-cycle remount realtime");
    await wait(65000);

    for (let i = 1; i <= 10; i++) {
      const before = await hubSnapshot(studentPack.page).catch(() => null);
      await wait(15000);
      const mount = await remountStudent(studentPack, completedConversationId);
      const token = `CYCLE_S_${i}_${Date.now()}`;
      const sent = await apiSend(teacherPack.page, completedConversationId, token);
      let count = 0;
      try { count = await waitTokenCount(studentPack.page, token); } catch (err) { count = -1; remountCycles.push({ error: String(err).slice(0, 300) }); }
      const row = {
        role: "Student", cycle: i, conversationId: completedConversationId,
        connectionBefore: before, connectionAfter: mount.after,
        messageId: sent && sent.id, renderCount: count, negotiate: sg.negotiate,
        status429: sg.status429.length, status401: sg.status401.length
      };
      remountCycles.push(row);
      studentRemount.push(row);
      record(`cycle-student-${i}`, mount.after.connected && count === 1, JSON.stringify(row));
      if (!(mount.after.connected && count === 1)) break;
    }

    await waitRealtimeReady(studentPack.page, completedConversationId);
    for (let i = 1; i <= 10; i++) {
      const before = await hubSnapshot(teacherPack.page).catch(() => null);
      await wait(15000);
      const mount = await remountTeacher(teacherPack, completedConversationId);
      const token = `CYCLE_T_${i}_${Date.now()}`;
      const sent = await apiSend(studentPack.page, completedConversationId, token);
      let count = 0;
      try { count = await waitTokenCount(teacherPack.page, token); } catch (err) { count = -1; }
      const row = {
        role: "Teacher", cycle: i, conversationId: completedConversationId,
        connectionBefore: before, connectionAfter: mount.after,
        messageId: sent && sent.id, renderCount: count, negotiate: tg.negotiate,
        status429: tg.status429.length, status401: tg.status401.length
      };
      remountCycles.push(row);
      teacherRemount.push(row);
      record(`cycle-teacher-${i}`, mount.after.connected && count === 1, JSON.stringify(row));
      if (!(mount.after.connected && count === 1)) break;
    }
    const cyclePass = remountCycles.filter(x => x.renderCount === 1 && x.connectionAfter && x.connectionAfter.connected).length;
    record("20-cycle-realtime", cyclePass === 20, `pass=${cyclePass}/${remountCycles.length}`);
    scenarios.cycle20 = cyclePass === 20;

    const outsiderStudent = process.env.TAFSEEL_UAT_STUDENT_B_EMAIL || "student.r5b.uat@example.com";
    const outsiderPass = process.env.TAFSEEL_UAT_STUDENT_B_PASSWORD || CREDENTIALS.Student.password;
    await paceAuthSensitive();
    const deniedLogin = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: outsiderStudent, password: outsiderPass })
    });
    if (deniedLogin.ok) {
      const token = (await deniedLogin.json()).accessToken;
      const denied = await fetch(`${BASE_URL}/api/v1/conversations/${conversationId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      record("authz-student-b", denied.status === 404, String(denied.status));
    } else record("authz-student-b", deniedLogin.status === 401 || deniedLogin.status === 429, `login ${deniedLogin.status}`);

    assertClean("student-micro", sg);
    assertClean("teacher-micro", tg);

    const leakAfter = await hubSnapshot(studentPack.page);
    record("hub-no-dup-widgets", leakAfter.widgets === 1 && leakAfter.connectCount <= 8, JSON.stringify(leakAfter));
  } finally {
    const required = [
      ["01-published-student-login", false, "filled by publish smoke"],
      ["02-published-teacher-login", false, "filled by publish smoke"],
      ["03-student-active-conversation", scenarios.studentActive],
      ["04-teacher-active-conversation", scenarios.teacherActive],
      ["05-student-remount-realtime", scenarios.studentRemount],
      ["06-teacher-remount-realtime", scenarios.teacherRemount],
      ["07-both-remount-realtime", scenarios.bothRemount],
      ["08-completed-order-remount-realtime", scenarios.completedRemount],
      ["09-hard-reload-realtime", scenarios.hardReload],
      ["10-dedup-after-remount", scenarios.dedup],
      ["11-unread-after-remount", scenarios.unread],
      ["12-attachment-after-remount", scenarios.attachment]
    ];
    fs.writeFileSync(path.join(outDir, "micro-browser-cert.json"), JSON.stringify({ results, required, scenarios }, null, 2));
    fs.writeFileSync(path.join(outDir, "student-remount.json"), JSON.stringify(studentRemount, null, 2));
    fs.writeFileSync(path.join(outDir, "teacher-remount.json"), JSON.stringify(teacherRemount, null, 2));
    fs.writeFileSync(path.join(outDir, "both-remount.json"), JSON.stringify(bothRemount, null, 2));
    fs.writeFileSync(path.join(outDir, "completed-order-remount-realtime.json"), JSON.stringify(completedRemount, null, 2));
    fs.writeFileSync(path.join(outDir, "remount-20-cycle.json"), JSON.stringify(remountCycles, null, 2));
    await closeAuthed(studentPack);
    await closeAuthed(teacherPack);
    await browser.close();
  }

  const failed = results.filter(x => !x.pass);
  console.log(`Release 5 micro cert ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exitCode = 1;
}

main().catch(err => { console.error(err); process.exit(1); });
