import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5091";
const OUTBOX = process.env.TAFSEEL_DEV_OUTBOX
  || path.join("artifacts", "phase4-release5-final-publish", "App_Data", "dev-outbox");
const wait = ms => new Promise(r => setTimeout(r, ms));

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

async function resetPassword(email, password) {
  const forgot = await post("/api/v1/auth/forgot-password", { email, lang: "en" });
  if (forgot.status !== 202) throw new Error(`forgot-password ${email} -> ${forgot.status}`);
  await wait(800);
  const html = latestOutbox(email);
  if (!html) throw new Error(`no outbox mail for ${email}`);
  const token = extractToken(html);
  if (!token) throw new Error(`no reset token for ${email}`);
  const reset = await post("/api/v1/auth/reset-password", { email, token, password });
  if (reset.status !== 204 && reset.status !== 200)
    throw new Error(`reset-password ${email} -> ${reset.status} ${reset.text}`);
}

async function register(email, password, fullName, role) {
  const res = await post("/api/v1/auth/register", { email, password, fullName, role, lang: "en" });
  if (res.status === 409) return "exists";
  if (res.status !== 202) throw new Error(`register ${email} -> ${res.status} ${res.text}`);
  await wait(800);
  const html = latestOutbox(email);
  const token = html ? extractToken(html) : null;
  if (!token) throw new Error(`no confirm token for ${email}`);
  const confirm = await post("/api/v1/auth/confirm-email", { email, token });
  if (confirm.status !== 204 && confirm.status !== 200)
    throw new Error(`confirm ${email} -> ${confirm.status}`);
  return "created";
}

async function login(email, password) {
  const res = await post("/api/v1/auth/login", { email, password });
  if (res.status !== 200) throw new Error(`login ${email} -> ${res.status}`);
  return res.json.accessToken;
}

async function main() {
  const studentEmail = "student.sprint02.uat@example.com";
  const teacherEmail = "teacher.sprint02.uat@example.com";
  const password = process.env.TAFSEEL_UAT_SESSION_PASSWORD;
  if (!password) throw new Error("TAFSEEL_UAT_SESSION_PASSWORD is required");
  await resetPassword(studentEmail, password);
  await wait(7000);
  await resetPassword(teacherEmail, password);
  await wait(7000);
  await login(studentEmail, password);
  await login(teacherEmail, password);
  const studentB = process.env.TAFSEEL_UAT_STUDENT_B_EMAIL || "student.r5b.uat@example.com";
  const teacherB = process.env.TAFSEEL_UAT_TEACHER_B_EMAIL || "teacher.r5b.uat@example.com";
  console.log("student-b", await register(studentB, password, "Student R5 B", "Student"));
  await wait(7000);
  console.log("teacher-b", await register(teacherB, password, "Teacher R5 B", "Teacher"));
  console.log("uat-bootstrap-ok");
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
