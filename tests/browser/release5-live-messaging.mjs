import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { loginAs, BASE_URL, setThemeAndLang, CREDENTIALS } from "./lib/auth.mjs";

const outDir = process.argv[2]
  || path.join("docs", "features", "evidence", "phase4-release5-order-communication", "final-acceptance");
fs.mkdirSync(outDir, { recursive: true });
const shotsDir = path.join(outDir, "screenshots");
fs.mkdirSync(shotsDir, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const realtimeTrace = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail: detail || "" });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " :: " + detail : ""}`);
};

async function apiLogin(email, password) {
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error(`login ${email} ${res.status}`);
  return (await res.json()).accessToken;
}
async function apiJson(token, method, url, body) {
  const res = await fetch(`${BASE_URL}/api/v1${url}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
async function openThread(page, conversationId) {
  await page.evaluate(id => window.TafseelChat && window.TafseelChat.open({ conversationId: id }), conversationId);
  await page.locator(".tf-chat-widget[data-open=true] [data-r5-input]").waitFor({ state: "visible", timeout: 20000 });
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
async function composerGeometry(page) {
  return page.evaluate(() => {
    const widget = document.querySelector(".tf-chat-widget[data-open=true]");
    if (!widget) return { ok: false, reason: "widget closed" };
    const input = widget.querySelector("[data-r5-input]");
    const send = widget.querySelector("[data-r5-send]");
    const attach = widget.querySelector("[data-r5-attach]");
    const compose = widget.querySelector("[data-r5-composer]");
    const messages = widget.querySelector("[data-messages]");
    const hit = el => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!(top && (el === top || el.contains(top) || top.closest("[data-r5-composer]")));
    };
    const vis = r => r.width > 8 && r.height > 8 && r.bottom <= window.innerHeight + 2;
    const overflow = document.documentElement.scrollWidth > window.innerWidth + 2;
    return {
      ok: vis(compose.getBoundingClientRect()) && vis(input.getBoundingClientRect()) && vis(send.getBoundingClientRect())
        && vis(attach.getBoundingClientRect()) && hit(input) && hit(send) && hit(attach) && !overflow
        && messages.getBoundingClientRect().bottom <= compose.getBoundingClientRect().top + 12,
      overflow
    };
  });
}

async function main() {
  if (!CREDENTIALS.Student.password || !CREDENTIALS.Teacher.password) throw new Error("missing UAT passwords");
  const studentToken = await apiLogin(CREDENTIALS.Student.email, CREDENTIALS.Student.password);
  const teacherToken = await apiLogin(CREDENTIALS.Teacher.email, CREDENTIALS.Teacher.password);
  const mine = await apiJson(studentToken, "GET", "/orders/mine?pageSize=50");
  const order = (mine.json?.items || []).find(o => [0, 1, 2, 3, 4].includes(Number(o.status)));
  if (!order) throw new Error("no student order");
  const opened = await apiJson(studentToken, "POST", "/conversations", {
    otherUserId: order.teacherId, scope: 2, resourceId: order.id
  });
  const conversationId = opened.json.id;
  record("conversation-id", !!conversationId, conversationId);

  const browser = await chromium.launch();
  try {
    const studentCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const teacherCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const studentPage = await loginAs(studentCtx, "Student");
    await wait(12000);
    const teacherPage = await loginAs(teacherCtx, "Teacher");
    await setThemeAndLang(studentPage, "light", "en");
    await setThemeAndLang(teacherPage, "light", "en");
    await studentPage.goto(`${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html?section=orders`, { waitUntil: "domcontentloaded" });
    await wait(1500);
    const cta = studentPage.locator("button", { hasText: /Messages|الرسائل/i }).first();
    record("student-cta", await cta.count() > 0);
    if (await cta.count()) await cta.click();
    await openThread(studentPage, conversationId);
    await studentPage.screenshot({ path: path.join(shotsDir, "student-live-thread.png") });
    await teacherPage.goto(`${BASE_URL}/app/Tafseel-Teacher-Dashboard.dc.html?section=messages&conversationId=${conversationId}`, { waitUntil: "domcontentloaded" });
    await wait(1500);
    await openThread(teacherPage, conversationId);
    await teacherPage.screenshot({ path: path.join(shotsDir, "teacher-live-thread.png") });

    const liveToken = `R5LIVE-S2T-${Date.now()}`;
    const httpSendAt = Date.now();
    await sendChat(studentPage, liveToken);
    record("student-send", (await studentPage.locator(".tf-chat-widget[data-open=true] .tf-chat-bubble", { hasText: liveToken }).count()) === 1);
    await teacherPage.waitForFunction(token => {
      const open = document.querySelector(".tf-chat-widget[data-open=true]");
      return ((open && open.querySelector("[data-messages]")?.innerText) || "").includes(token);
    }, liveToken, { timeout: 20000 });
    const teacherCount = await teacherPage.locator(".tf-chat-widget[data-open=true] .tf-chat-bubble", { hasText: liveToken }).count();
    record("realtime-s2t", teacherCount === 1, `count=${teacherCount}`);
    realtimeTrace.push({ sender: "student", receiver: "teacher", conversationId, token: liveToken, httpSendTimestamp: httpSendAt, signalRReceiveTimestamp: Date.now(), renderCount: teacherCount });
    await wait(2500);
    record("dedup-s2t", (await teacherPage.locator(".tf-chat-widget[data-open=true] .tf-chat-bubble", { hasText: liveToken }).count()) === 1);

    const replyToken = `R5LIVE-T2S-${Date.now()}`;
    const replyAt = Date.now();
    await sendChat(teacherPage, replyToken);
    await studentPage.waitForFunction(token => {
      const open = document.querySelector(".tf-chat-widget[data-open=true]");
      return ((open && open.querySelector("[data-messages]")?.innerText) || "").includes(token);
    }, replyToken, { timeout: 20000 });
    const studentCount = await studentPage.locator(".tf-chat-widget[data-open=true] .tf-chat-bubble", { hasText: replyToken }).count();
    record("realtime-t2s", studentCount === 1, `count=${studentCount}`);
    realtimeTrace.push({ sender: "teacher", receiver: "student", conversationId, token: replyToken, httpSendTimestamp: replyAt, signalRReceiveTimestamp: Date.now(), renderCount: studentCount });
    await wait(2500);
    record("dedup-t2s", (await studentPage.locator(".tf-chat-widget[data-open=true] .tf-chat-bubble", { hasText: replyToken }).count()) === 1);

    const pdf = path.join(outDir, "r5-upload.pdf");
    fs.writeFileSync(pdf, "%PDF-1.4\nRelease 5 attachment\n");
    await studentPage.setInputFiles(".tf-chat-widget[data-open=true] [data-r5-file]", pdf);
    const attachToken = `R5FILE-${Date.now()}`;
    await sendChat(studentPage, attachToken);
    await teacherPage.waitForFunction(token => ((document.querySelector(".tf-chat-widget[data-open=true] [data-messages]")?.innerText) || "").includes(token), attachToken, { timeout: 20000 });
    record("attachment-live", (await teacherPage.locator(".tf-chat-widget[data-open=true] .tf-chat-bubble", { hasText: attachToken }).count()) === 1);

    await teacherPage.goto(`${BASE_URL}/app/Tafseel-Teacher-Dashboard.dc.html?section=notifications`, { waitUntil: "domcontentloaded" });
    await wait(1200);
    const notif = teacherPage.locator("[data-r5-notification]").first();
    record("teacher-notif-row", await notif.count() > 0);
    if (await notif.count()) {
      await notif.click();
      await wait(1200);
      record("teacher-deeplink", await teacherPage.locator(".tf-chat-widget[data-open=true]").count() > 0);
    }
    await teacherPage.screenshot({ path: path.join(shotsDir, "teacher-notif-live.png") });

    await studentPage.goto(`${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html?section=orders&filter=completed`, { waitUntil: "domcontentloaded" });
    await wait(1200);
    await studentPage.screenshot({ path: path.join(shotsDir, "student-completed-live.png") });
    const completedCta = studentPage.locator("button", { hasText: /Messages|الرسائل/i }).first();
    record("completed-cta", await completedCta.count() > 0);
    await studentPage.goto(`${BASE_URL}/app/Tafseel-Student-Dashboard.dc.html?section=messages&conversationId=${conversationId}`, { waitUntil: "domcontentloaded" });
    await wait(1200);
    try {
      await openThread(studentPage, conversationId);
      record("completed-open", await studentPage.locator(".tf-chat-widget[data-open=true]").count() > 0);
    } catch (error) {
      record("completed-open", false, String(error.message || error));
    }

    await studentPage.close(); await teacherPage.close();
    await studentCtx.close(); await teacherCtx.close();

    for (const [w, h, role] of [[375, 667, "Student"], [390, 844, "Student"], [375, 667, "Teacher"], [390, 844, "Teacher"]]) {
      await wait(12000);
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await loginAs(ctx, role);
      await setThemeAndLang(page, "light", "en");
      const dash = role === "Student" ? "Tafseel-Student-Dashboard.dc.html" : "Tafseel-Teacher-Dashboard.dc.html";
      await page.goto(`${BASE_URL}/app/${dash}?section=messages&conversationId=${conversationId}`, { waitUntil: "domcontentloaded" });
      await wait(1500);
      await openThread(page, conversationId);
      const geo = await composerGeometry(page);
      await page.screenshot({ path: path.join(shotsDir, `composer-live-${role.toLowerCase()}-${w}x${h}.png`) });
      record(`composer-${role.toLowerCase()}-${w}x${h}`, !!geo.ok, JSON.stringify(geo));
      await page.close(); await ctx.close();
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(outDir, "realtime-trace.json"), JSON.stringify(realtimeTrace, null, 2));
  fs.writeFileSync(path.join(outDir, "live-messaging.json"), JSON.stringify({ results, conversationId }, null, 2));
  const failed = results.filter(x => !x.pass);
  console.log(`Release 5 live messaging ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exitCode = 1;
}

main().catch(err => { console.error(err); process.exit(1); });
