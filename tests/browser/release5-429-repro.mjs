import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5090";
const outDir = process.argv[2]
  || path.join("docs", "features", "evidence", "phase4-release5-order-communication", "final-browser-certification");
fs.mkdirSync(outDir, { recursive: true });

async function hit(method, url, body) {
  const started = Date.now();
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, method, url, ms: Date.now() - started, at: new Date().toISOString() };
}

async function main() {
  const rows = [];
  for (let i = 1; i <= 12; i++) {
    rows.push({
      i,
      login: await hit("POST", "/api/v1/auth/login", {
        email: "student.sprint02.uat@example.com",
        password: "not-a-real-password-used-only-to-trip-the-auth-limiter"
      }),
      refresh: await hit("POST", "/api/v1/auth/refresh", {})
    });
  }
  const status429 = rows.flatMap(r => [r.login, r.refresh]).filter(x => x.status === 429);
  const summary = {
    classifiedAs: "Test Issue",
    limiter: "auth policy: 10/min/IP covering login+refresh+forgot+reset (Program.cs unchanged)",
    signalR: "hub /hubs/messages is not on the auth policy; prior negotiate 429 was a cascade after refresh 429 emptied the in-memory JWT",
    rows,
    status429
  };
  fs.writeFileSync(path.join(outDir, "429-repro-raw.json"), JSON.stringify(summary, null, 2));
  console.log(`429 repro hits=${status429.length} first=${status429[0] ? JSON.stringify(status429[0]) : "none"}`);
  if (!status429.length) process.exitCode = 2;
}

main().catch(err => { console.error(err); process.exit(1); });
