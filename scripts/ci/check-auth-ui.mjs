import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("Tafseel-Auth.dc.html", "utf8");
const scriptMatch = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, "Missing the Auth page's inline component script");
const script = scriptMatch[1];

const localePosition = html.indexOf('src="js/locales.js"');
const apiPosition = html.indexOf('src="js/api.js"');
assert.ok(localePosition >= 0 && apiPosition >= 0, "Auth page must load js/locales.js and js/api.js");

for (const forbidden of ["fonts.googleapis.com", "fonts.gstatic.com"])
  assert.doesNotMatch(html, new RegExp(forbidden), `Auth page must not depend on ${forbidden}`);

// Mode isolation: login/register/reset are mutually exclusive by construction — a single
// `mode` string drives all three `sc-if` gates, so exactly one can render at a time.
for (const gate of ["isLogin: s.mode === 'login'", "isRegister: s.mode === 'register'", "isReset: s.mode === 'reset'"])
  assert.ok(script.includes(gate), `Missing mode gate: ${gate}`);
for (const flag of ["isLogin", "isRegister", "isReset"])
  assert.match(html, new RegExp(`<sc-if value="\\{\\{ ${flag} \\}\\}"`), `Missing <sc-if> panel for ${flag}`);

// Every auth action must call the real backend — no client-only stubs left over from a mock page.
assert.match(script, /Tafseel\.api\.login\(/, "Login must call the real Tafseel.api.login");
assert.match(script, /Tafseel\.api\.register\(/, "Register must call the real Tafseel.api.register");
assert.match(script, /\/auth\/forgot-password/, "Forgot-password must call the real endpoint");
assert.match(script, /\/auth\/reset-password/, "Reset must call the real endpoint");
assert.match(script, /\/auth\/confirm-email/, "Email confirmation must call the real endpoint");
assert.doesNotMatch(script, /location\.href\s*=\s*'Tafseel-Student-Dashboard\.dc\.html'/,
  "Login/registration must not hardcode a redirect that bypasses the real session/role check");
assert.doesNotMatch(script, /Connecting to Google/i, "No fabricated OAuth affordance without a backend provider");

// Self-registration must only ever be able to send Student or Teacher as the role — the ternary
// below is structurally incapable of producing any other value, regardless of UI state.
assert.match(script, /s\.role === 'teacher' \? 'Teacher' : 'Student'/,
  "Registration role must be restricted to Student/Teacher");
assert.doesNotMatch(html, /<option value="Admin"|<option value="QualityReviewer"/,
  "Admin/QualityReviewer must never appear as a selectable registration option");

// Password-reset links must carry both an email and a token before the reset form is reachable.
assert.match(script, /mode === 'reset' && email && token/, "Reset mode must require email+token from the query string");

console.log("Auth UI mode isolation validation passed.");
