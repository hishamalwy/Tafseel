import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5090";
const OUTBOX = process.env.TAFSEEL_DEV_OUTBOX
  || path.join("artifacts", "phase4-release5-micro-final-publish", "App_Data", "dev-outbox");
const wait = ms => new Promise(r => setTimeout(r, ms));

const studentEmail = process.env.TAFSEEL_UAT_STUDENT_EMAIL || "student.sprint02.uat@example.com";
const teacherEmail = process.env.TAFSEEL_UAT_TEACHER_EMAIL || "teacher.sprint02.uat@example.com";
const password = process.env.TAFSEEL_UAT_SESSION_PASSWORD
  || process.env.TAFSEEL_UAT_STUDENT_PASSWORD
  || process.env.TAFSEEL_UAT_TEACHER_PASSWORD;

async function post(url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json, text };
}

async function login(email) {
  if (!password) throw new Error("UAT password env is required");
  return post("/api/v1/auth/login", { email, password });
}

function latestOutbox(email) {
  if (!fs.existsSync(OUTBOX)) return null;
  const needle = email.replace(/[^a-zA-Z0-9@._-]/g, "_");
  const files = fs.readdirSync(OUTBOX)
    .filter(name => name.toLowerCase().includes(needle.toLowerCase()))
    .map(name => ({ name, full: path.join(OUTBOX, name), mtime: fs.statSync(path.join(OUTBOX, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0] ? fs.readFileSync(files[0].full, "utf8") : null;
}

function extractToken(html) {
  const decoded = html.replace(/&amp;/g, "&");
  const match = decoded.match(/[?&]token=([^"'&\s]+)/i) || decoded.match(/token=([^"'&\s]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

async function waitLogin(email, label) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < 16 * 60 * 1000) {
    last = await login(email);
    console.log(`${label} login`, last.status, last.json && last.json.error ? last.json.error : "");
    if (last.status === 200) return last;
    if (last.status === 429) {
      await wait(20000);
      continue;
    }
    // Likely Identity lockout (same 401 as bad password). Do not reset this identity.
    await wait(30000);
  }
  throw new Error(`${label} login still ${last && last.status} after lockout wait`);
}

async function registerFreshStudent() {
  const email = process.env.TAFSEEL_UAT_FRESH_STUDENT_EMAIL || "student.r5micro.uat@example.com";
  const res = await post("/api/v1/auth/register", {
    email, password, fullName: "Student R5 Micro", role: "Student", lang: "en"
  });
  if (res.status !== 202 && res.status !== 409)
    throw new Error(`register ${email} -> ${res.status} ${res.text}`);
  if (res.status === 202) {
    await wait(800);
    const html = latestOutbox(email);
    const token = html ? extractToken(html) : null;
    if (!token) throw new Error(`no confirm token for ${email}`);
    const confirm = await post("/api/v1/auth/confirm-email", { email, token });
    if (confirm.status !== 204 && confirm.status !== 200)
      throw new Error(`confirm ${email} -> ${confirm.status}`);
  }
  const logged = await login(email);
  if (logged.status !== 200) throw new Error(`fresh student login -> ${logged.status}`);
  console.log("fresh-student-ready", email);
  return email;
}

async function main() {
  if (!password) throw new Error("TAFSEEL_UAT_SESSION_PASSWORD or role password env is required");
  const teacher = await waitLogin(teacherEmail, "teacher");
  let student;
  try {
    student = await waitLogin(studentEmail, "student");
  } catch (err) {
    console.log("existing-student-unavailable", String(err.message || err));
    await registerFreshStudent();
    throw new Error("fresh student has no Order fixture; existing Student identity must unlock");
  }
  const sToken = student.json.accessToken;
  const tToken = teacher.json.accessToken;
  const sConv = await fetch(`${BASE}/api/v1/conversations?pageSize=1`, {
    headers: { Authorization: `Bearer ${sToken}` }
  });
  const tConv = await fetch(`${BASE}/api/v1/conversations?pageSize=1`, {
    headers: { Authorization: `Bearer ${tToken}` }
  });
  console.log("student-conversations", sConv.status);
  console.log("teacher-conversations", tConv.status);
  if (!sConv.ok || !tConv.ok) throw new Error("authenticated conversations failed");
  console.log("micro-bootstrap-ok", studentEmail, teacherEmail);
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
