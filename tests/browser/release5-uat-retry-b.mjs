import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5091";
const OUTBOX = path.join("artifacts", "phase4-release5-final-publish", "App_Data", "dev-outbox");
const email = process.env.TAFSEEL_UAT_TEACHER_B_EMAIL || "teacher.r5b.uat@example.com";

const files = fs.readdirSync(OUTBOX)
  .filter(name => name.toLowerCase().includes(email.replace(/[^a-zA-Z0-9@._-]/g, "_").toLowerCase()))
  .map(name => ({ name, t: fs.statSync(path.join(OUTBOX, name)).mtimeMs }))
  .sort((a, b) => b.t - a.t);
if (!files.length) throw new Error("no teacher B outbox");
const html = fs.readFileSync(path.join(OUTBOX, files[0].name), "utf8").replace(/&amp;/g, "&");
const token = decodeURIComponent((html.match(/[?&]token=([^"'&\s]+)/i) || [])[1] || "");
const confirm = await fetch(`${BASE}/api/v1/auth/confirm-email`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, token })
});
console.log("teacher-b-confirm", confirm.status);
const loginB = await fetch(`${BASE}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: process.env.TAFSEEL_UAT_TEACHER_B_PASSWORD })
});
console.log("teacher-b-login", loginB.status);
const student = await fetch(`${BASE}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "student.sprint02.uat@example.com", password: process.env.TAFSEEL_UAT_STUDENT_PASSWORD })
});
console.log("student-a-login", student.status);
const teacher = await fetch(`${BASE}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "teacher.sprint02.uat@example.com", password: process.env.TAFSEEL_UAT_TEACHER_PASSWORD })
});
console.log("teacher-a-login", teacher.status);
if (student.status !== 200 || teacher.status !== 200) process.exit(1);
