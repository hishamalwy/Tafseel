import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5090";
const OUTBOX = process.env.TAFSEEL_DEV_OUTBOX
  || path.join("src", "Tafseel.Api", "bin", "Release", "net8.0", "App_Data", "dev-outbox");
const password = process.env.TAFSEEL_UAT_SESSION_PASSWORD || process.env.TAFSEEL_UAT_STUDENT_PASSWORD;
const email = process.argv[2] || "student.sprint02.uat@example.com";

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

function getLastToken(targetEmail) {
  const local = targetEmail.split("@")[0].toLowerCase();
  const all = fs.readdirSync(OUTBOX);
  const files = all
    .filter(name => name.toLowerCase().includes(local))
    .map(name => ({ full: path.join(OUTBOX, name), m: fs.statSync(path.join(OUTBOX, name)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (!files[0]) throw new Error(`no outbox match local=${local} count=${all.length}`);
  const html = fs.readFileSync(files[0].full, "utf8");
  const encoded = (html.match(/token=([^"&]+)/) || [])[1];
  if (!encoded) throw new Error("no token field");
  const htmlDecoded = encoded.replace(/&amp;/g, "&").replace(/&#x2B;/gi, "+").replace(/&#43;/g, "+");
  return { encodedLen: encoded.length, token: decodeURIComponent(htmlDecoded), file: files[0].full };
}

const forgot = await post("/api/v1/auth/forgot-password", { email, lang: "en" });
console.log("forgot", forgot.status);
await new Promise(r => setTimeout(r, 1200));
const extracted = getLastToken(email);
console.log("encoded-len", extracted.encodedLen, "decoded-len", extracted.token.length);
for (const token of [
  extracted.token,
  extracted.token.replace(/ /g, "+"),
  encodeURIComponent(extracted.token)
]) {
  const reset = await post("/api/v1/auth/reset-password", { email, token, password });
  console.log("reset-try", reset.status, reset.json && reset.json.errors || reset.json && reset.json.code || "");
  if (reset.status === 204 || reset.status === 200) {
    const login = await post("/api/v1/auth/login", { email, password });
    console.log("login", login.status, login.json && login.json.error || "");
    process.exit(login.status === 200 ? 0 : 1);
  }
}
process.exit(1);
