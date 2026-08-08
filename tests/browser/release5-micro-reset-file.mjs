import fs from "node:fs";

const BASE = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5090";
const file = process.argv[2];
const email = process.argv[3];
const password = process.env.TAFSEEL_UAT_SESSION_PASSWORD || process.env.TAFSEEL_UAT_STUDENT_PASSWORD;
const html = fs.readFileSync(file, "utf8");
const encoded = (html.match(/token=([^"&]+)/) || [])[1];
if (!encoded) throw new Error("no token");
const token = decodeURIComponent(encoded.replace(/&amp;/g, "&"));
console.log("token-len", token.length);
const reset = await fetch(`${BASE}/api/v1/auth/reset-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, token, password })
});
console.log("reset", reset.status, (await reset.text()).slice(0, 300));
const login = await fetch(`${BASE}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password })
});
console.log("login", login.status, (await login.text()).slice(0, 160));
