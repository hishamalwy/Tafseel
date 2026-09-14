import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5090";
const OUTBOX = process.env.TAFSEEL_DEV_OUTBOX
  || path.join("src", "Tafseel.Api", "App_Data", "dev-outbox");
const password = process.env.TAFSEEL_UAT_SESSION_PASSWORD || "R8-Uat!Session-2026";
const wait = ms => new Promise(r => setTimeout(r, ms));

async function post(url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  return { status: res.status, text };
}

function latestOutbox(email) {
  if (!fs.existsSync(OUTBOX)) return null;
  const needle = email.toLowerCase();
  const files = fs.readdirSync(OUTBOX)
    .filter(name => name.toLowerCase().includes(needle))
    .map(name => ({ full: path.join(OUTBOX, name), mtime: fs.statSync(path.join(OUTBOX, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0] ? fs.readFileSync(files[0].full, "utf8") : null;
}

function extractToken(html) {
  const decoded = html.replace(/&amp;/g, "&");
  const match = decoded.match(/[?&]token=([^"'&\s]+)/i) || decoded.match(/token=([^"'&\s]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

async function resetPassword(email) {
  const forgot = await post("/api/v1/auth/forgot-password", { email, lang: "en" });
  console.log("forgot", email, forgot.status);
  await wait(1000);
  const html = latestOutbox(email);
  if (!html) throw new Error(`no outbox mail for ${email} (dir=${OUTBOX})`);
  const token = extractToken(html);
  if (!token) throw new Error(`no reset token for ${email}`);
  const reset = await post("/api/v1/auth/reset-password", { email, token, password });
  console.log("reset", email, reset.status, reset.text.slice(0, 200));
  const login = await post("/api/v1/auth/login", { email, password });
  console.log("login", email, login.status);
  if (login.status !== 200) throw new Error(`login failed ${email}`);
}

async function main() {
  console.log("OUTBOX", OUTBOX, fs.existsSync(OUTBOX));
  await resetPassword("student.sprint02.uat@example.com");
  await wait(7000);
  await resetPassword("teacher.sprint02.uat@example.com");
  const authDir = path.join("tests", "browser", ".auth");
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(path.join(authDir, "r8-session.env"), [
    "TAFSEEL_UAT_STUDENT_EMAIL=student.sprint02.uat@example.com",
    "TAFSEEL_UAT_TEACHER_EMAIL=teacher.sprint02.uat@example.com",
    `TAFSEEL_UAT_SESSION_PASSWORD=${password}`,
    `TAFSEEL_UAT_STUDENT_PASSWORD=${password}`,
    `TAFSEEL_UAT_TEACHER_PASSWORD=${password}`,
    "TAFSEEL_UAT_ADMIN_PASSWORD=<your Development SeedUsers:Password>"
  ].join("\n"));
  console.log("password-reset-ok");
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
