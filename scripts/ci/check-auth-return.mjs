import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const shared = readFileSync("js/tafseel.js", "utf8");
const auth = readFileSync("Tafseel-Auth.dc.html", "utf8");
const api = readFileSync("js/api.js", "utf8");

assert.match(shared, /safeAppReturnHref:\s*function/, "shared runtime must expose safeAppReturnHref");
assert.match(shared, /authHref:\s*function/, "shared runtime must expose authHref");
assert.match(auth, /Tafseel\.safeAppReturnHref/, "Auth destination must sanitize return");
assert.match(api, /window\.Tafseel\.authHref/, "requireSession must reuse authHref");

const match = shared.match(/safeAppReturnHref:\s*function\s*\(raw\)\s*\{([\s\S]*?)\n    \},/);
assert.ok(match, "Could not extract safeAppReturnHref body");
const safeAppReturnHref = new Function("raw", match[1]);

const allowed = [
  "Tafseel-Request.dc.html?teacherId=abc&teacherServiceId=def",
  "/app/Tafseel-Teacher-Profile.dc.html?id=abc&teacherServiceId=def&subjectId=x",
  "Tafseel-Browse-Teachers.dc.html?subjectId=1&service=2&search=math"
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
