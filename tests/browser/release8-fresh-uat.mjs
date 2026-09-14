/**
 * Create fresh R8 UAT Student/Teacher accounts with known password.
 * Confirms via Development outbox when needed.
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5090";
const password = process.env.TAFSEEL_UAT_SESSION_PASSWORD || "R8-Uat!Session-2026";
const stamp = Date.now().toString(36);
const studentEmail = process.env.TAFSEEL_UAT_STUDENT_EMAIL || `student.r8.${stamp}@example.com`;
const teacherEmail = process.env.TAFSEEL_UAT_TEACHER_EMAIL || `teacher.r8.${stamp}@example.com`;

async function api(method, urlPath, body, headers = {}) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  const setCookie = res.headers.getSetCookie?.() || [];
  return { status: res.status, json, text, setCookie };
}

async function register(email, role, fullName) {
  return api("POST", "/api/v1/auth/register", {
    email, password, fullName, fullNameEnglish: fullName, role
  });
}

async function confirmViaDevOutbox(email) {
  // Development may expose confirmation tokens via admin/dev endpoints or auto-confirm.
  // Try login first; if 403 email not confirmed, probe common confirm paths.
  const login = await api("POST", "/api/v1/auth/login", { email, password });
  if (login.status === 200) return login;
  // Try resend confirmation then scan health-only fallbacks
  await api("POST", "/api/v1/auth/resend-confirmation", { email }).catch(() => null);
  // Dev outbox file path used historically
  const candidates = [
    path.join("src", "Tafseel.Api", "bin", "Release", "net8.0", "dev-outbox"),
    path.join("src", "Tafseel.Api", "bin", "Debug", "net8.0", "dev-outbox"),
    path.join("dev-outbox")
  ];
  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).sort().reverse();
    for (const f of files.slice(0, 30)) {
      const content = fs.readFileSync(path.join(dir, f), "utf8");
      if (!content.includes(email)) continue;
      const m = content.match(/confirm(?:ation)?[^\\s\"']{0,40}([0-9a-fA-F-]{20,})/i)
        || content.match(/token=([A-Za-z0-9%._~-]{16,})/)
        || content.match(/\/auth\/confirm[^\"'\\s]*token=([^\"'\\s&]+)/i);
      if (m) {
        const token = decodeURIComponent(m[1]);
        const conf = await api("POST", "/api/v1/auth/confirm-email", { email, token });
        console.log("confirm", email, conf.status);
        break;
      }
    }
  }
  return api("POST", "/api/v1/auth/login", { email, password });
}

async function main() {
  console.log("student", studentEmail);
  console.log("teacher", teacherEmail);
  const sReg = await register(studentEmail, "Student", "R8 Student UAT");
  console.log("register student", sReg.status, (sReg.text || "").slice(0, 120));
  const tReg = await register(teacherEmail, "Teacher", "R8 Teacher UAT");
  console.log("register teacher", tReg.status, (tReg.text || "").slice(0, 120));

  const sLogin = await confirmViaDevOutbox(studentEmail);
  const tLogin = await confirmViaDevOutbox(teacherEmail);
  console.log("login student", sLogin.status);
  console.log("login teacher", tLogin.status);

  const adminPass = requiredEnv("TAFSEEL_UAT_ADMIN_PASSWORD");
  const authDir = path.join("tests", "browser", ".auth");
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(path.join(authDir, "r8-session.env"), [
    `TAFSEEL_UAT_STUDENT_EMAIL=${studentEmail}`,
    `TAFSEEL_UAT_TEACHER_EMAIL=${teacherEmail}`,
    `TAFSEEL_UAT_SESSION_PASSWORD=${password}`,
    `TAFSEEL_UAT_STUDENT_PASSWORD=${password}`,
    `TAFSEEL_UAT_TEACHER_PASSWORD=${password}`,
    `TAFSEEL_UAT_ADMIN_PASSWORD=${adminPass}`
  ].join("\n"));
  if (sLogin.status !== 200 || tLogin.status !== 200)
    process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} (the Development SeedUsers:Password).`);
  return value;
}
