import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5090";
const OUTBOX = process.env.TAFSEEL_DEV_OUTBOX
  || path.join("src", "Tafseel.Api", "App_Data", "dev-outbox");
const wait = ms => new Promise(r => setTimeout(r, ms));

async function post(url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: res.status, text: await res.text() };
}

function latestOutbox(email) {
  if (!fs.existsSync(OUTBOX)) return null;
  const needle = email.replace(/[^a-zA-Z0-9@._-]/g, "_");
  const files = fs.readdirSync(OUTBOX)
    .filter(name => name.toLowerCase().includes(needle.toLowerCase()))
    .map(name => ({ full: path.join(OUTBOX, name), mtime: fs.statSync(path.join(OUTBOX, name)).mtimeMs }))
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
  if (forgot.status === 429) throw new Error(`forgot-password 429 for ${email}`);
  if (forgot.status !== 202) throw new Error(`forgot-password ${email} -> ${forgot.status}`);
  await wait(1000);
  const html = latestOutbox(email);
  if (!html) throw new Error(`no outbox mail for ${email}`);
  const token = extractToken(html);
  if (!token) throw new Error(`no reset token for ${email}`);
  const reset = await post("/api/v1/auth/reset-password", { email, token, password });
  if (reset.status !== 204 && reset.status !== 200)
    throw new Error(`reset-password ${email} -> ${reset.status}`);
}

async function main() {
  const password = process.env.TAFSEEL_UAT_SESSION_PASSWORD;
  if (!password) throw new Error("TAFSEEL_UAT_SESSION_PASSWORD is required");
  const emails = [
    "student.sprint02.uat@example.com",
    "teacher.sprint02.uat@example.com"
  ];
  for (const email of emails) {
    await resetPassword(email, password);
    await wait(8000);
  }
  console.log(`UAT reset ok for ${emails.length} accounts`);
}

main().catch(err => { console.error(err.message || err); process.exit(1); });
