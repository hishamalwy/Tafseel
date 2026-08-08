import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5092";
const password = process.env.TAFSEEL_UAT_SESSION_PASSWORD
  || process.env.TAFSEEL_UAT_STUDENT_PASSWORD
  || process.env.TAFSEEL_UAT_TEACHER_PASSWORD;
const studentEmail = process.env.TAFSEEL_UAT_STUDENT_EMAIL || "student.sprint02.uat@example.com";
const teacherEmail = process.env.TAFSEEL_UAT_TEACHER_EMAIL || "teacher.sprint02.uat@example.com";
const outDir = process.argv[2]
  || path.join("docs", "features", "evidence", "phase4-release5-order-communication", "micro-final-acceptance");
fs.mkdirSync(outDir, { recursive: true });

const checks = [];
const record = (name, pass, detail) => {
  checks.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " :: " + detail : ""}`);
};

async function get(url, token) {
  const res = await fetch(`${BASE}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  return { status: res.status, cache: res.headers.get("cache-control") || "", text: await res.text() };
}

async function login(email) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}

async function main() {
  if (!password) throw new Error("UAT password env is required");
  const live = await get("/health/live");
  const ready = await get("/health/ready");
  record("health-live", live.status === 200, String(live.cache));
  record("health-ready", ready.status === 200, String(ready.cache));

  const student = await login(studentEmail);
  record("published-student-login", student.status === 200, student.status === 200 ? "200" : `status=${student.status} error=${student.json && student.json.error || ""}`);
  const teacher = await login(teacherEmail);
  record("published-teacher-login", teacher.status === 200, teacher.status === 200 ? "200" : `status=${teacher.status}`);

  if (student.status === 200 && teacher.status === 200) {
    const sToken = student.json.accessToken;
    const tToken = teacher.json.accessToken;
    const sConv = await get("/api/v1/conversations?pageSize=10", sToken);
    const tConv = await get("/api/v1/conversations?pageSize=10", tToken);
    record("published-student-conversations", sConv.status === 200, String(sConv.status));
    record("published-teacher-conversations", tConv.status === 200, String(tConv.status));
    const sDash = await get("/app/Tafseel-Student-Dashboard.dc.html?section=orders");
    const tDash = await get("/app/Tafseel-Teacher-Dashboard.dc.html?section=messages");
    record("published-student-dashboard", sDash.status === 200, String(sDash.cache));
    record("published-teacher-dashboard", tDash.status === 200, String(tDash.cache));
    const widget = await get("/app/js/chat-widget.js");
    record("static-chat-widget", widget.status === 200 && widget.text.includes("__tafseelMessageHub"), `${widget.status} cache=${widget.cache}`);
    const css = await get("/app/css/tafseel.css");
    record("static-css", css.status === 200, `${css.status} ${css.cache}`);

    let studentConversationId = null;
    try {
      const parsed = JSON.parse(sConv.text);
      studentConversationId = (parsed.items || [])[0]?.id || null;
    } catch { /* ignore */ }
    if (studentConversationId) {
      const thread = await get(`/api/v1/conversations/${studentConversationId}/messages?pageSize=5`, sToken);
      record("published-student-thread", thread.status === 200, String(thread.status));
      const teacherThread = await get(`/api/v1/conversations/${studentConversationId}/messages?pageSize=5`, tToken);
      record("published-teacher-thread", teacherThread.status === 200 || teacherThread.status === 404, String(teacherThread.status));
    } else {
      record("published-student-thread", false, "no conversation");
    }

    if (process.env.TAFSEEL_PUBLISH_REALTIME === "1") {
      record("published-realtime-smoke", false, "browser SignalR against isolated publish requires Playwright routing; run micro-cert against Dev host");
    }
  }

  const retention = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: studentEmail, password })
  });
  if (retention.status === 200) {
    const session = await retention.json();
    const again = await fetch(`${BASE}/api/v1/conversations?pageSize=1`, {
      headers: { Authorization: `Bearer ${session.accessToken}` }
    });
    record("published-auth-retention", again.status === 200, String(again.status));
  } else {
    record("published-auth-retention", false, `second login ${retention.status}`);
  }

  fs.writeFileSync(path.join(outDir, "publish-smoke-final.json"), JSON.stringify({ base: BASE, checks }, null, 2));
  if (checks.some(x => !x.pass)) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
