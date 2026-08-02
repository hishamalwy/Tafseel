import { readFileSync } from "node:fs";

const page = readFileSync("Tafseel-Admin-Dashboard.dc.html", "utf8");
const locales = readFileSync("js/locales.js", "utf8");

for (const token of [
  "catalogOrderType", "isAsyncServiceCreate", "isLiveServiceCreate", "catalogAllowedDurations",
  "editImmutablePolicy", "catalogBusy", "editBusy", "tf-catalog-layout", "tf-catalog-footer",
  "tf-icon-picker", "createPolicyIssues", "focusPolicyIssue", "data-catalog-dialog",
  "catalogDirty", "editDirty", "aria-describedby", "dir=\"rtl\"", "dir=\"ltr\""
]) if (!page.includes(token)) throw new Error(`Missing Release 1 Admin behavior: ${token}`);

for (const forbidden of [
  '<option value="async_request">async_request</option>',
  '<option value="live_session">live_session</option>',
  '<option value="{{ opt }}">{{ opt }}</option>',
  'Safe icon', 'الأيقونة الآمنة',
  'Minimum1'
]) if (page.includes(forbidden) || locales.includes(forbidden)) throw new Error(`Technical or concatenated Admin label remains: ${forbidden}`);

for (const token of [
  '@media(max-width:600px)', 'height:100dvh', 'max-height:min(92dvh,900px)',
  'grid-template-columns:repeat(4,minmax(0,1fr))', 'position:sticky',
  "if (s.catalogBusy) return", "if (s.editBusy) return", "e.key === 'Tab'",
  'this._catalogOpener?.focus()', 'catalog-minimum-delivery', 'edit-minimum-delivery',
  'minimumPrice: x.minPrice', 'maximumPrice: x.maxPrice', 'serviceDurationValues', 'SERVICE_DURATION_OPTIONS.includes', 'prevState && (prevState.catalogModal || prevState.editModal)', 'id="catalog-durations" tabindex="-1"',
  "prefers-reduced-motion: reduce"
]) if (!page.includes(token)) throw new Error(`Missing Release 1.1 UX safeguard: ${token}`);

for (const key of [
  "admin_service_identity", "admin_service_visibility", "admin_service_commercial",
  "admin_service_delivery", "admin_service_revisions", "admin_service_live",
  "admin_service_policy_locked", "admin_service_editor_description", "admin_service_preview_title",
  "admin_service_ready_activate", "admin_service_incomplete_policy", "admin_service_workflow_async_request",
  "admin_service_workflow_live_session", "admin_service_qualification_subject_qualification_required"
]) {
  const matches = locales.match(new RegExp(`"${key}"`, "g")) || [];
  if (matches.length !== 2) throw new Error(`Localization parity failed for ${key}`);
}

if (/admin\/catalog\/services\/[^'"\s]+\/delete/i.test(page) || /Delete service/i.test(page))
  throw new Error("Physical service deletion must not be exposed.");

console.log("Service catalog Release 1 Admin checks passed.");
