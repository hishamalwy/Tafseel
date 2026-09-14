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
// PASS 05: the Admin sidebar now lists seven AREAS rather than twenty destinations, so its labels
// come from the `admin_area_*` / `admin_tab_*` vocabulary. The rule is unchanged — every nav label
// must be a localization key, never a hardcoded string or an inline lang check.
assert(admin.includes("Tafseel.t('admin_area_' + x.key)"), "Admin areas not localized");
assert(admin.includes("Tafseel.t('admin_tab_' + tab.key)"), "Admin tabs not localized");
// PASS 05: Home reads the /admin/attention projection; `homeMetrics` prefers it and falls back to
// /admin/metrics. Money must still be formatted, never concatenated.
assert(admin.includes("Tafseel.money(homeMetrics?.confirmedPayments")
  || admin.includes("Tafseel.money(homeMetrics.confirmedPayments"), "Admin paymentRows must use Tafseel.money");
assert(!admin.includes("'SAR ' + Number(homeMetrics") && !admin.includes("'SAR ' + Number(s.liveMetrics"),
  "Admin still concatenates SAR +");
// Admin platform settings. This originally asserted the literal `admin_settings_locked` flash,
// which belonged to an editable commission/quality/maintenance form whose Save button never
// persisted anything — it only flashed "these are deployment-managed". That surface was
// deliberately replaced by an honest read-only note, so asserting the old flash key was testing
// obsolete implementation text. The rule actually worth protecting is behavioural: Admin must
// state that platform settings are deployment-managed, through bound (localizable) strings, and
// must not reintroduce controls that appear to edit them but silently discard the change.
const settingsSection = admin.slice(admin.indexOf("{{ isSettingsPage }}"));
assert(settingsSection.includes("platformSettingsHeading"), "Admin settings must keep a platform-settings heading");
assert(
  ["platformSettingsManagedTitle", "platformSettingsManagedBody", "platformSettingsSnapshotHint"]
    .every((k) => new RegExp("\\{\\{\\s*" + k + "\\s*\\}\\}").test(settingsSection)),
  "Admin platform settings must render the deployment-managed note through bound strings, not literal markup text"
);
assert(admin.includes("Tafseel.t('admin_platform_settings')"), "Admin platform-settings heading not localized");
assert(
  !/onSavePlatformSettings|onCommissionRate|onRequireReview|onMaintenanceMode/.test(admin),
  "Admin must not reintroduce non-persisting platform-settings controls"
);
assert(admin.includes("statusKey"), "Admin disputes must use statusKey");

console.log("Sprint 3 localization checks passed.");
