/**
 * Bootstrap / refresh Release 8 UAT passwords for sprint02 accounts.
 * Registers if missing; otherwise attempts login with the provided session password.
 * Never prints the password.
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5090";
const password = process.env.TAFSEEL_UAT_SESSION_PASSWORD
  || process.env.TAFSEEL_UAT_STUDENT_PASSWORD
  || "R8-Uat!Session-2026";

const accounts = [
  { email: "student.sprint02.uat@example.com", role: "Student", fullName: "Student Sprint02", fullNameEnglish: "Student Sprint02" },
  { email: "teacher.sprint02.uat@example.com", role: "Teacher", fullName: "Teacher Sprint02", fullNameEnglish: "Teacher Sprint02" }
];

async function api(method, urlPath, body, cookie) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, json, text, headers: res.headers };
}

async function login(email) {
  return api("POST", "/api/v1/auth/login", { email, password });
}

async function register(account) {
  return api("POST", "/api/v1/auth/register", {
    email: account.email,
    password,
    fullName: account.fullName,
    fullNameEnglish: account.fullNameEnglish,
    role: account.role
  });
}

async function main() {
  // Probe health
  const live = await fetch(`${BASE}/health/live`).catch(() => null);
  if (!live || !live.ok) throw new Error(`API not reachable at ${BASE}`);

  for (const account of accounts) {
    const existing = await login(account.email);
    if (existing.status === 200) {
      console.log(`OK login ${account.role}`);
      continue;
    }
    console.log(`login miss ${account.role} status=${existing.status}; trying register`);
    const reg = await register(account);
    console.log(`register ${account.role} status=${reg.status}`);
    // Dev email confirmation may be required — try login again
    const again = await login(account.email);
    console.log(`relogin ${account.role} status=${again.status}`);
  }

  // Admin/Quality use SeedUsers password
  const adminPass = requiredEnv("TAFSEEL_UAT_ADMIN_PASSWORD");
  for (const email of ["qa.admin.sprint02@example.com", "qa.reviewer.sprint02@example.com"]) {
    const res = await api("POST", "/api/v1/auth/login", { email, password: adminPass });
    console.log(`seed-role ${email} status=${res.status}`);
  }

  const authDir = path.join("tests", "browser", ".auth");
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(path.join(authDir, "r8-session.env"), [
    `TAFSEEL_UAT_SESSION_PASSWORD=${password}`,
    `TAFSEEL_UAT_STUDENT_PASSWORD=${password}`,
    `TAFSEEL_UAT_TEACHER_PASSWORD=${password}`,
    `TAFSEEL_UAT_ADMIN_PASSWORD=${adminPass}`
  ].join("\n"));
  console.log("Wrote tests/browser/.auth/r8-session.env (gitignored via .auth)");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} (the Development SeedUsers:Password).`);
  return value;
}
