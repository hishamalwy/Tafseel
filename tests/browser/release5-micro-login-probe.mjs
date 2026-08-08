const BASE = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5090";

async function login(email, password, label) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  console.log(label, res.status, json && json.error || "");
  return res.status;
}

const which = process.argv[2];
const email = process.argv[3];
const password = process.env.TAFSEEL_PROBE_PASSWORD;
if (!password) throw new Error("TAFSEEL_PROBE_PASSWORD missing");
await login(email, password, which);
