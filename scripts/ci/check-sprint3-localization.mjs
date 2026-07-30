/**
 * Sprint 3 residual localization smoke (Node).
 * Run: node scripts/ci/check-sprint3-localization.mjs
 */
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const localeCtx = { window: {} };
runInNewContext(readFileSync("js/locales.js", "utf8"), localeCtx);
const locales = localeCtx.window.TafseelLocales;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(
  JSON.stringify(Object.keys(locales.en).sort()) === JSON.stringify(Object.keys(locales.ar).sort()),
  "EN/AR key parity failed"
);

const required = [
  "priority_low",
  "priority_medium",
  "priority_high",
  "quality_approve",
  "quality_reject",
  "quality_request_changes",
  "qd_nav_overview",
  "admin_nav_overview",
  "admin_status_active",
  "admin_status_suspended",
  "admin_approve",
  "admin_reject",
  "admin_settings_locked",
  "admin_toast_saved"
];

for (const key of required) {
  assert(locales.en[key] && locales.ar[key], `missing key ${key}`);
  assert(locales.en[key] !== locales.ar[key] || /[{}]/.test(locales.en[key]), `untranslated ${key}`);
}

const quality = readFileSync("Tafseel-Quality-Dashboard.dc.html", "utf8");
assert(!quality.includes("['Low','Medium','High']"), "Quality still hardcodes English priorities");
assert(quality.includes("TAB_RAW_STATUS"), "Quality missing rawStatus tab filter");
assert(quality.includes("priority_low"), "Quality missing priority_low wiring");
assert(quality.includes("decide(0)"), "Quality decisions must use numeric codes");
assert(!/a\.status === 'Pending'/.test(quality), "Quality must not filter on English status labels");

const admin = readFileSync("Tafseel-Admin-Dashboard.dc.html", "utf8");
assert(admin.includes("admin_nav_overview"), "Admin nav not localized");
assert(admin.includes("Tafseel.money(s.liveMetrics?.confirmedPayments"), "Admin paymentRows must use Tafseel.money");
assert(!admin.includes("'SAR ' + Number(s.liveMetrics"), "Admin still concatenates SAR +");
assert(admin.includes("admin_settings_locked"), "Admin settings flash not localized");
assert(admin.includes("statusKey"), "Admin disputes must use statusKey");

console.log("Sprint 3 localization checks passed.");
