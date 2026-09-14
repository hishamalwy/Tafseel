import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { readPage } from "./lib/frontend-pages.mjs";

const shared = readFileSync("js/tafseel.js", "utf8");
const auth = readPage("Tafseel-Auth.dc.html");
const confirmation = readPage("Tafseel-Confirm-Email.dc.html");
const api = readFileSync("js/api.js", "utf8");

assert.match(shared, /safeAppReturnHref:\s*function/, "shared runtime must expose safeAppReturnHref");
assert.match(shared, /authHref:\s*function/, "shared runtime must expose authHref");
assert.match(auth, /Tafseel\.safeAppReturnHref/, "Auth destination must sanitize return");
/* Canonical post-login rule (2026-08, Student Journey Convergence): an explicit
   safe continuation target wins for every role; otherwise the role's home is
   used. The Student home moved from Browse Teachers to the context-aware
   Landing, which now carries active Requests, Offer counts and the
   awaiting-payment action — Browse Teachers restarts discovery instead of
   continuing the journey. These assertions pin the new rule; they are not a
   relaxation of the old one. */
assert.match(shared, /roleHomeHref:\s*function/,
  "shared runtime must expose the canonical roleHomeHref");
assert.match(shared, /roleHomeHref[\s\S]*?indexOf\('Student'\)\s*>=\s*0\)\s*return 'Tafseel-Landing\.dc\.html'/,
  "Shared Student home must be the context-aware Landing");
assert.match(shared, /roleHomeHref[\s\S]*?indexOf\('Teacher'\)\s*>=\s*0\)\s*return 'Tafseel-Teacher-Dashboard\.dc\.html'/,
  "Shared Teacher home must be the Teacher Dashboard");
assert.match(shared, /roleHomeHref[\s\S]*?indexOf\('Admin'\)\s*>=\s*0\)\s*return 'Tafseel-Admin-Dashboard\.dc\.html'/,
  "Shared Admin home must be the Admin Dashboard");
assert.match(shared, /roleHomeHref[\s\S]*?indexOf\('QualityReviewer'\)\s*>=\s*0\)\s*return 'Tafseel-Quality-Dashboard\.dc\.html'/,
  "Shared Quality home must be the Quality Dashboard");
assert.match(auth, /if \(intended\) return intended;/,
  "Auth must prefer an explicit safe continuation target over the role home");
assert.match(auth, /return Tafseel\.roleHomeHref\(roles\)/,
  "Auth must fall back to the canonical role home");
assert.doesNotMatch(auth, /'Tafseel-Browse-Teachers\.dc\.html'/,
  "Auth must not reintroduce the obsolete Browse Teachers login default");
// A Teacher who has not finished onboarding must still be routed by lifecycle,
// never dropped onto a workspace they cannot use yet.
assert.match(auth, /if \(!lifecycle\.isPublished && lifecycle\.nextUrl\) return lifecycle\.nextUrl;/,
  "Teacher onboarding lifecycle must outrank both the return target and the role home");
assert.match(auth, /location\.href = confirmationPageHref\(s\.regEmail, s\.role, false\)/,
  "Successful registration must navigate to the email confirmation page");
assert.match(confirmation, /Tafseel\.authHref\(loginReturn\)/,
  "Confirmation page must provide a safe role-aware login link");
assert.match(api, /window\.Tafseel\.authHref/, "requireSession must reuse authHref");

const match = shared.match(/safeAppReturnHref:\s*function\s*\(raw\)\s*\{([\s\S]*?)\n    \},/);
assert.ok(match, "Could not extract safeAppReturnHref body");
const safeAppReturnHref = new Function("raw", match[1]);

const allowed = [
  "Tafseel-Request.dc.html?teacherId=abc&teacherServiceId=def",
  "/app/Tafseel-Teacher-Profile.dc.html?id=abc&teacherServiceId=def&subjectId=x",
  "Tafseel-Browse-Teachers.dc.html?subjectId=1&service=2&search=math",
  "Tafseel-Open-Marketplace.dc.html",
  "/app/Tafseel-Open-Marketplace.dc.html"
];
for (const href of allowed)
  assert.ok(safeAppReturnHref(href), `should allow ${href}`);

const rejected = [
  "https://evil.example/phish",
  "//evil.example/phish",
  "/\\\\evil.example/phish",
  "javascript:alert(1)",
  "data:text/html;base64,aaaa",
  "/admin",
  "/app/../secrets",
  "Tafseel-Auth.dc.html?return=https://evil.example",
  "https://127.0.0.1:5090/app/Tafseel-Student-Dashboard.dc.html",
  "Tafseel-NotAPage.html",
  ""
];
for (const href of rejected)
  assert.equal(safeAppReturnHref(href), "", `should reject ${href}`);

console.log("Auth return-URL sanitizer validation passed.");
