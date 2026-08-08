import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5090";
const OUTBOX = process.env.TAFSEEL_DEV_OUTBOX
  || path.join("src", "Tafseel.Api", "bin", "Release", "net8.0", "App_Data", "dev-outbox");
const password = process.env.TAFSEEL_UAT_SESSION_PASSWORD || process.env.TAFSEEL_UAT_STUDENT_PASSWORD;
const stamp = Date.now().toString(36);
const studentEmail = `student.r5micro.${stamp}@example.com`;
const teacherEmail = `teacher.r5micro.${stamp}@example.com`;
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

function latestToken(email) {
  const needle = email.replace(/[^a-zA-Z0-9@._-]/g, "_").toLowerCase();
  const files = fs.readdirSync(OUTBOX)
    .filter(name => name.toLowerCase().includes(needle))
    .map(name => ({ full: path.join(OUTBOX, name), m: fs.statSync(path.join(OUTBOX, name)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (!files[0]) return null;
  const html = fs.readFileSync(files[0].full, "utf8");
  const encoded = (html.match(/token=([^"&]+)/) || [])[1];
  if (!encoded) return null;
  return decodeURIComponent(encoded.replace(/&amp;/g, "&"));
}

async function registerAndConfirm(email, fullName, role) {
  const reg = await post("/api/v1/auth/register", { email, password, fullName, role, lang: "en" });
  console.log("register", email, reg.status, reg.json && reg.json.code || "");
  if (reg.status !== 202) throw new Error(`register ${email} ${reg.status}`);
  await wait(1000);
  const token = latestToken(email);
  if (!token) throw new Error(`no confirm token ${email}`);
  const confirm = await post("/api/v1/auth/confirm-email", { email, token });
  console.log("confirm", email, confirm.status, confirm.json && confirm.json.code || confirm.json && confirm.json.errors || "");
  if (confirm.status !== 204 && confirm.status !== 200) throw new Error(`confirm ${email} ${confirm.status}`);
}

async function login(email) {
  const res = await post("/api/v1/auth/login", { email, password });
  console.log("login", email, res.status, res.json && res.json.code || "");
  if (res.status !== 200) throw new Error(`login ${email} ${res.status}`);
  return res.json.accessToken;
}

async function main() {
  if (!password) throw new Error("password env missing");
  await registerAndConfirm(studentEmail, "Student R5 Micro", "Student");
  await wait(8000);
  await registerAndConfirm(teacherEmail, "Teacher R5 Micro", "Teacher");
  await wait(8000);
  const studentToken = await login(studentEmail);
  await wait(2000);
  const teacherToken = await login(teacherEmail);
  fs.mkdirSync(path.join("tests", "browser", ".auth"), { recursive: true });
  fs.writeFileSync(path.join("tests", "browser", ".auth", "micro-fresh-emails.json"), JSON.stringify({
    studentEmail, teacherEmail
  }, null, 2));
  console.log("fresh-pair-ok", studentEmail, teacherEmail, !!studentToken, !!teacherToken);
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
