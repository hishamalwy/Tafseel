/**
 * Teacher Profile mobile CTA structure/regression checks.
 * Runtime geometry and first-paint visibility are covered by the browser evidence pass.
 * Run: node scripts/ci/check-teacher-profile-mobile-cta.mjs
 */
import { readFileSync } from "node:fs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const profile = readFileSync("Tafseel-Teacher-Profile.dc.html", "utf8");
const css = readFileSync("css/tafseel.css", "utf8");

// CTA and no-service copy use distinct, truthful predicates.
assert(profile.includes('<sc-if value="{{ showHeroCta }}" hint-placeholder-val="{{ false }}"><div class="tf-mkp-mcta">'),
  "mobile CTA bar must be gated on showHeroCta");
assert(profile.includes('<sc-if value="{{ heroCtaHidden }}" hint-placeholder-val="{{ false }}"><p class="tf-mkp-shelf-note"'),
  "no-service shelf note must be gated on heroCtaHidden");
assert(profile.includes("heroCtaHidden: services.length === 0") && profile.includes("showHeroCta: !!(canRequest || canBook)"),
  "heroCtaHidden must mean zero services; showHeroCta stays CTA-eligibility-driven");

// The fixed CTA stays hidden until the in-flow commerce shelf has passed above the viewport.
assert(/_syncMobileCta\(\)\s*\{[\s\S]*?classList\.toggle\('is-on', shelf\.getBoundingClientRect\(\)\.bottom <= 0\)/.test(profile),
  "mobile CTA must appear only after the commerce shelf passes above the viewport");
assert(profile.includes("window.removeEventListener('scroll', this._onShelfScroll)"),
  "mobile CTA scroll listener must be removed during cleanup and before re-binding");
assert(profile.includes("window.addEventListener('scroll', this._onShelfScroll, { passive: true })"),
  "mobile CTA scroll listener must be passive");
assert(profile.includes("this._syncMobileCta();"),
  "mobile CTA observer must be synchronized after render");

// The bar is mobile-only, fixed, and inert until the observer enables it.
assert(/@media \(max-width:640px\)[\s\S]*?\.tf-mkp-mcta\{[\s\S]*?position:fixed;[\s\S]*?pointer-events:none;[\s\S]*?visibility:hidden/.test(css),
  "mobile CTA must be fixed and non-interactive while hidden inside the mobile breakpoint");
assert(/\.tf-mkp-mcta\.is-on\{[^}]*pointer-events:auto;[^}]*visibility:visible/.test(css),
  "mobile CTA must become visible and interactive only in its is-on state");

// 7. No fabricated copy — the no-service state reuses the existing, already-localized key instead
// of inventing new "coming soon" style messaging.
assert(profile.includes('data-i18n="tp_services_empty">No services available.</p>'),
  "no-service mobile note must reuse the existing tp_services_empty key, not new copy");
const locales = readFileSync("js/locales.js", "utf8");
assert(locales.includes('"tp_services_empty"'), "tp_services_empty key must exist in locales.js");

// Safe-area inset is counted once along the block end.
const barRule = css.match(/\.tf-mkp-mcta\{\s*position:fixed;[\s\S]*?\}/)[0];
const bottomSafeArea = barRule.match(/env\(safe-area-inset-bottom\)/g) || [];
assert(bottomSafeArea.length === 1, "mobile CTA must reference the bottom safe-area inset exactly once");

// Desktop remains unaffected by the fixed CTA.
assert(css.includes(".tf-mkp-mcta{display:none}"), "mobile CTA must default to display:none");

// 13. Sprint 2's honest share-copy fix (only flash on confirmed success) must still be intact.
assert(/let copied = false;[\s\S]*?if \(copied\) this\.flash\(t\('tp_share_copied'\)\);/.test(profile),
  "share action must still only report success on a confirmed copy (Sprint 2 regression)");

console.log("Teacher Profile mobile CTA checks passed.");
