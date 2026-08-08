import fs from "node:fs";

const BASE = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5090";
const file = process.argv[2];
const email = process.argv[3];
const html = fs.readFileSync(file, "utf8");
const encoded = (html.match(/token=([^"&]+)/) || [])[1];
if (!encoded) throw new Error("no token");
const token = decodeURIComponent(encoded.replace(/&amp;/g, "&"));
console.log("token-len", token.length);
const res = await fetch(`${BASE}/api/v1/auth/confirm-email`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, token })
});
const text = await res.text();
console.log("confirm", res.status, text.slice(0, 240));
if (res.status === 204 || res.status === 200) {
  const password = process.env.TAFSEEL_UAT_SESSION_PASSWORD || process.env.TAFSEEL_UAT_STUDENT_PASSWORD;
  const login = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  console.log("login", login.status, (await login.text()).slice(0, 160));
}
