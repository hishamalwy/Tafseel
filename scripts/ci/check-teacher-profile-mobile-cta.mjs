/**
 * Teacher Profile mobile CTA geometry/regression checks (Phase 3 Release 3 Sprint 2.1).
 * Static structural checks only — the actual zero-overlap/reachability claims are proven by
 * live browser measurement (elementFromPoint, getBoundingClientRect) captured in the sprint
 * report, since first-paint geometry depends on real layout/paint and can't be asserted from
 * source text alone.
 * Run: node scripts/ci/check-teacher-profile-mobile-cta.mjs
 */
import { readFileSync } from "node:fs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const profile = readFileSync("Tafseel-Teacher-Profile.dc.html", "utf8");
const css = readFileSync("css/tafseel.css", "utf8");

// 1/6. Mobile CTA and the no-service note are rendered from complementary conditions — a
// published teacher with services never shows the no-service note, and a teacher with none
// never shows the fixed CTA bar (which would otherwise be a lie: a button that goes nowhere).
assert(profile.includes('<sc-if value="{{ showHeroCta }}" hint-placeholder-val="{{ false }}"><div class="tf-profile-mobile-cta">'),
  "mobile CTA bar must be gated on showHeroCta");
assert(profile.includes('<sc-if value="{{ heroCtaHidden }}" hint-placeholder-val="{{ false }}"><p class="tf-profile-mobile-no-service"'),
  "no-service mobile note must be gated on heroCtaHidden");
assert(profile.includes("heroCtaHidden: !canRequest && !canBook") && profile.includes("showHeroCta: !!(canRequest || canBook)"),
  "showHeroCta and heroCtaHidden must remain exact logical complements");

// 2. The dynamic clearance measurement must always re-baseline to 0px before measuring, or a
// previously-applied clearance masks the true overlap and gets zeroed back out on the next pass
// (the oscillation bug found and fixed in this sprint).
assert(/_measureMobileCtaClearance\(\)\s*\{[\s\S]*?root\.style\.setProperty\('--tf-profile-mobile-clearance', '0px'\);\s*void row\.getBoundingClientRect\(\);/.test(profile),
  "clearance measurement must reset to a neutral baseline and force a layout flush before reading geometry");
assert(profile.includes("if (rowDocTop >= window.innerHeight) return;"),
  "clearance measurement must not treat off-screen (not-yet-scrolled-to) content as an overlap");
assert(profile.includes("_trackAvatarLoad"), "clearance must be re-measured once the avatar image finishes loading");

// 3/4/5. The bar stays fixed and its CTA link stays clickable; only the bar's own decorative
// padding ignores pointer events, so it can never swallow a tap meant for real content beneath it.
assert(/\.tf-profile-mobile-cta\{position:fixed;[^}]*pointer-events:none\}/.test(css),
  "mobile CTA bar must remain position:fixed with pointer-events:none on its own box");
assert(/\.tf-profile-mobile-cta a\{[^}]*pointer-events:auto\}/.test(css),
  "mobile CTA link must keep pointer-events:auto so it stays clickable");

// 7. No fabricated copy — the no-service state reuses the existing, already-localized key instead
// of inventing new "coming soon" style messaging.
assert(profile.includes('data-i18n="tp_services_empty">No services available.</p>'),
  "no-service mobile note must reuse the existing tp_services_empty key, not new copy");
const locales = readFileSync("js/locales.js", "utf8");
assert(locales.includes('"tp_services_empty"'), "tp_services_empty key must exist in locales.js");

// 8. Safe-area inset must not be double-counted within the bar's own padding declaration.
const barRule = css.match(/\.tf-profile-mobile-cta\{position:fixed;[\s\S]*?\}/)[0];
const safeAreaInBarPadding = barRule.match(/env\(safe-area-inset-bottom/g) || [];
assert(safeAreaInBarPadding.length === 1,
  "the mobile CTA bar's own padding must reference safe-area-inset-bottom exactly once");

// 11. No hardcoded left/right was introduced by this sprint's new rules — logical properties only.
const newRuleBlock = css.slice(css.indexOf(".tf-profile-mobile-no-service"), css.indexOf(".tf-profile-mobile-no-service") + 2000);
assert(!/[^-](?:^|[;{])\s*(left|right)\s*:/.test(newRuleBlock.replace(/inset-inline-(start|end)/g, "")),
  "new mobile CTA rules must use logical (inline-start/end) properties, not hardcoded left/right, to stay RTL-safe");

// 12. Everything new is scoped to the mobile breakpoint — desktop must be untouched.
["--tf-profile-mobile-clearance", ".tf-profile-mobile-no-service{display:block", "scroll-margin-block-end"]
  .forEach(needle => {
    const idx = css.indexOf(needle);
    assert(idx > -1, `expected to find "${needle}" in css/tafseel.css`);
    const precedingMediaQuery = css.lastIndexOf("@media (max-width:860px)", idx);
    const precedingCloseBrace = css.lastIndexOf("\n}", idx);
    assert(precedingMediaQuery > -1 && precedingMediaQuery > css.lastIndexOf("\n}\n", idx - 1),
      `"${needle}" must stay inside the max-width:860px media query so desktop is unaffected`);
  });

// 13. Sprint 2's honest share-copy fix (only flash on confirmed success) must still be intact.
assert(/let copied = false;[\s\S]*?if \(copied\) this\.flash\(t\('tp_share_copied'\)\);/.test(profile),
  "share action must still only report success on a confirmed copy (Sprint 2 regression)");

console.log("Teacher Profile mobile CTA checks passed.");
