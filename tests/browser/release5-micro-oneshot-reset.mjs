import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5090";
const OUTBOX = process.env.TAFSEEL_DEV_OUTBOX
  || path.join("src", "Tafseel.Api", "bin", "Release", "net8.0", "App_Data", "dev-outbox");
const password = process.env.TAFSEEL_UAT_SESSION_PASSWORD || process.env.TAFSEEL_UAT_STUDENT_PASSWORD;
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

function latest(email) {
  const needle = email.replace(/[^a-zA-Z0-9@._-]/g, "_").toLowerCase();
  const files = fs.readdirSync(OUTBOX)
    .filter(name => name.toLowerCase().includes(needle))
    .map(name => ({ full: path.join(OUTBOX, name), m: fs.statSync(path.join(OUTBOX, name)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return files[0] ? fs.readFileSync(files[0].full, "utf8") : null;
}

function token(html) {
  const decoded = html.replace(/&amp;/g, "&");
  const match = decoded.match(/[?&]token=([^"'&\s]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

async function resetOnce(email) {
  const forgot = await post("/api/v1/auth/forgot-password", { email, lang: "en" });
  console.log("forgot", email, forgot.status);
  if (forgot.status !== 202) throw new Error(`forgot ${email} ${forgot.status}`);
  await wait(1000);
  const html = latest(email);
  if (!html) throw new Error(`no outbox ${email}`);
  const resetToken = token(html);
  if (!resetToken) throw new Error(`no token ${email}`);
  console.log("token-len", resetToken.length, "token-has-plus", resetToken.includes("+"), "token-has-slash", resetToken.includes("/"));
  const reset = await post("/api/v1/auth/reset-password", { email, token: resetToken, password });
  console.log("reset", email, reset.status, JSON.stringify(reset.json));
  if (reset.status !== 204 && reset.status !== 200) throw new Error(`reset ${email} ${reset.status}`);
}

async function main() {
  if (!password) throw new Error("password env missing");
  await resetOnce("student.sprint02.uat@example.com");
  await wait(8000);
  await resetOnce("teacher.sprint02.uat@example.com");
  await wait(8000);
  const student = await post("/api/v1/auth/login", { email: "student.sprint02.uat@example.com", password });
  const teacher = await post("/api/v1/auth/login", { email: "teacher.sprint02.uat@example.com", password });
  console.log("student-login", student.status, student.json && student.json.error || "");
  console.log("teacher-login", teacher.status, teacher.json && teacher.json.error || "");
  if (student.status !== 200 || teacher.status !== 200) process.exit(1);
  console.log("one-shot-reset-login-ok");
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
