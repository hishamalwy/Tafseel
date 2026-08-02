/**
 * BUG-001 display-name regression checks.
 * Run: node scripts/ci/check-bug001-display-names.mjs
 */
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const localeCtx = { window: {} };
runInNewContext(readFileSync("js/locales.js", "utf8"), localeCtx);
const locales = localeCtx.window.TafseelLocales;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const tafseelSrc = readFileSync("js/tafseel.js", "utf8");
assert(!/chat_participant.*slice\(0,\s*8\)/.test(tafseelSrc), "old slice fallback still near chat_participant");
assert(tafseelSrc.includes("looksLikeInternalId"), "missing looksLikeInternalId");
assert(tafseelSrc.includes("partyDisplayName"), "missing partyDisplayName");

const helperCtx = {
  window: { TafseelLocales: locales, localStorage: { getItem() { return null; }, setItem() {} } },
  document: {
    documentElement: { setAttribute() {}, dataset: {} },
    body: null,
    readyState: "complete",
    addEventListener() {},
    dispatchEvent() {},
    querySelectorAll() { return []; },
    createTreeWalker() { return { nextNode() { return null; } }; }
  },
  NodeFilter: { SHOW_TEXT: 4 },
  Node: { TEXT_NODE: 3 },
  CustomEvent: function CustomEvent() {},
  MutationObserver: function () { this.observe = function () {}; },
  Intl,
  setTimeout,
  clearTimeout
};
runInNewContext(tafseelSrc + "\nthis.Tafseel = window.Tafseel;", helperCtx);
const T = helperCtx.Tafseel || helperCtx.window.Tafseel;
assert(T && T.looksLikeInternalId, "Tafseel helpers not initialized");

T.lang = "ar";
assert(T.looksLikeInternalId("31c315a9-e08e-44eb-9401-93504bedd633"), "full guid");
assert(T.looksLikeInternalId("31c315a9"), "guid prefix");
assert(!T.looksLikeInternalId("Tafseel Student"), "real name");

assert(T.participantLabel("31c315a9-e08e-44eb-9401-93504bedd633") === T.t("name_unavailable"),
  "participantLabel must not render GUID");
assert(!String(T.participantLabel("31c315a9")).includes("31c315a9"),
  "participantLabel must not include prefix");
assert(T.participantLabel({ displayName: "Tafseel Student" }) === "Tafseel Student",
  "participantLabel prefers displayName");

assert(T.partyName({
  studentDisplayName: "Tafseel Student",
  studentDisplayNameEnglish: ""
}, "student") === "Tafseel Student", "AR prefers primary");

T.lang = "en";
assert(T.partyName({
  studentDisplayName: "Tafseel Student",
  studentDisplayNameEnglish: "Student EN"
}, "student") === "Student EN", "EN prefers english");
assert(T.partyName({
  studentDisplayName: "Tafseel Student",
  studentDisplayNameEnglish: ""
}, "student") === "Tafseel Student", "EN falls back to primary");
assert(T.partyName({
  studentDisplayName: "31c315a9",
  studentDisplayNameEnglish: ""
}, "student") === T.t("name_unavailable"), "rejects id-like primary");

T.lang = "ar";
assert(T.partyDisplayName("الاسم العربي", "English Name") === "الاسم العربي", "profile AR prefers primary");
assert(T.partyDisplayName("", "English Name") === "English Name", "profile AR falls back to English");
T.lang = "en";
assert(T.partyDisplayName("الاسم العربي", "English Name") === "English Name", "profile EN prefers English");
assert(T.partyDisplayName("الاسم العربي", "") === "الاسم العربي", "profile EN falls back to primary");
assert(TafseelProfileRuleCheck(), "profile display-name rule check failed");

assert(T.orderTitle({ requestTitle: "Sprint2 UAT Chapter Notes" }) === "Sprint2 UAT Chapter Notes");
assert(T.orderTitle({ requestTitle: "3f011f19-643b-4d57-9c9a-e44487015d0e" }) === T.t("td_order"));
assert(T.orderTitle({}) === T.t("td_order"));

const teacherDash = readFileSync("Tafseel-Teacher-Dashboard.dc.html", "utf8");
assert(!teacherDash.includes("participantLabel(peerId)"), "teacher still falls back with peerId");
assert(teacherDash.includes("participantLabel(peer || {})"), "teacher should pass peer object");
assert(!/student:'Verified student'/.test(teacherDash), "hardcoded Verified student overwrite remains");

const payment = readFileSync("Tafseel-Payment.dc.html", "utf8");
assert(!/pay_order_id_label.*item\.id/.test(payment), "payment still shows full order GUID");

const profile = readFileSync("Tafseel-Teacher-Profile.dc.html", "utf8");
const profileCss = readFileSync("css/tafseel.css", "utf8");
assert(profile.includes("Tafseel.partyDisplayName(profile.fullName, profile.fullNameEnglish)"), "profile must use canonical bilingual name selection");
assert(!profile.includes("const teacherName = profile ? Tafseel.userName(profile)"), "profile still uses language-agnostic userName");
assert(profile.includes('class="tf-profile-video-hero"') && profile.includes('class="tf-profile-conversion-card"') &&
  profile.includes('class="tf-profile-marketplace-layout"'),
  "video-first profile conversion structure is missing");
assert(profile.includes('data-media-preview="true"') && profile.includes('controls preload="metadata" playsinline'),
  "featured media must expose native controls and metadata preload");
assert((profile.match(/<video\b/g) || []).length === 1 && !profile.includes('class="tf-profile-sample-picker"'),
  "profile must mount one reusable video and omit the legacy sample cards");
assert((profile.match(/\{\{ featuredSample\.trust \}\}/g) || []).length === 1,
  "sample trust type must render exactly once");
assert((profile.match(/id="featured-sample-title"/g) || []).length === 1 &&
  (profile.match(/<h2 id="featured-sample-title">\{\{ featuredSample\.title \}\}<\/h2>/g) || []).length === 1,
  "featured video title must have one visible owner");
assert((profile.match(/class="tf-profile-carousel-arrow/g) || []).length === 2 &&
  (profile.match(/<button[^>]+class="tf-profile-carousel-arrow[^"]*"[^>]*>[\s\S]*?<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">/g) || []).length === 2 &&
  !profile.includes('&#8592;') && !profile.includes('&#8594;'),
  "carousel navigation must use decorative inline SVG controls, not raw Unicode arrows");
assert(profile.includes('class="tf-profile-qualification-icon"') &&
  profile.includes("favClass: 'tf-profile-secondary-action tf-profile-save-action'") &&
  !profile.includes('>↗ <span data-i18n="tp_share"') && !profile.includes('>✉ <span data-i18n="tp_message"'),
  "profile trust and secondary actions must use the premium SVG treatment");
assert(profile.includes('sv.iconPath') && !profile.includes('>⏱ {{ sv.delivery }}') &&
  !profile.includes('>↪ {{ sv.revisions }}') && !profile.includes('🛡'),
  "service and payment facts must not fall back to prototype glyphs");
assert(profile.includes('data-i18n="tp_reviews_first_title"') &&
  profile.includes('data-i18n="tp_reviews_first_body"'),
  "review empty state must explain the post-purchase review path");
const defaultAvatar = readFileSync("assets/brand/default-avatar.svg", "utf8");
assert(defaultAvatar.includes('viewBox="0 0 256 256"') && defaultAvatar.includes('<linearGradient') &&
  defaultAvatar.includes('abstract open book') && !defaultAvatar.includes('<circle cx="48" cy="37"'),
  "default avatar must be a high-resolution intentional educational asset, not the temporary silhouette");
assert(tafseelSrc.includes("default-avatar.svg?v=premium-1"),
  "default avatar URL must invalidate the retired placeholder cache");
assert(profile.includes("previousVideoLabel: t('tp_previous_video')") &&
  profile.includes("nextVideoLabel: t('tp_next_video')"),
  "carousel labels must use localization keys");
assert(profile.includes("samplePositionLabel: featuredSample") &&
  !profile.includes("featuredSample.trust + ' ' + Tafseel.number(sampleIndex + 1)"),
  "carousel indicator must remain numeric and not repeat the trust type");
assert((profile.match(/<sc-if value="\{\{ hasMultipleSamples \}\}"/g) || []).length === 3 &&
  profile.includes('hasMultipleSamples: carouselNavigationVisible(publicSamples)'),
  "single-video state must hide both arrows and the position indicator");
assert(profile.includes('onKeyDown="{{ onCarouselKeyDown }}"') && profile.includes('onTouchEnd="{{ onCarouselTouchEnd }}"') &&
  profile.includes("event.key === 'Home'") && profile.includes("event.key === 'End'"),
  "video carousel must support keyboard boundaries and touch swipe");
assert(profile.includes("carouselKeyDelta(event.key, s.lang === 'ar')"),
  "carousel keyboard direction must follow visual left/right in both RTL and LTR");
assert(profile.includes("carouselSwipeDelta(distance)"),
  "carousel touch swipe behavior must remain wired");
assert(profileCss.includes('.tf-profile-video-overlay{position:absolute;inset:16px 16px auto') &&
  profileCss.includes('.tf-profile-carousel-arrow{position:absolute;inset-block-start:50%') &&
  profileCss.includes('object-fit:contain'),
  "video overlay and arrows must stay above the native control zone without cropping media");
const carouselCtx = {};
const carouselHelpers = ["carouselNavigationVisible", "carouselKeyDelta", "carouselSwipeDelta"]
  .map(name => profile.match(new RegExp("function " + name + "\\([\\s\\S]*?\\n}"))[0])
  .join("\n");
runInNewContext(carouselHelpers, carouselCtx);
assert(!carouselCtx.carouselNavigationVisible([]) && !carouselCtx.carouselNavigationVisible([{}]) &&
  carouselCtx.carouselNavigationVisible([{}, {}]),
  "carousel navigation visibility must distinguish zero/one from multiple videos");
assert(carouselCtx.carouselKeyDelta("ArrowLeft", false) === -1 &&
  carouselCtx.carouselKeyDelta("ArrowRight", false) === 1 &&
  carouselCtx.carouselKeyDelta("ArrowLeft", true) === 1 &&
  carouselCtx.carouselKeyDelta("ArrowRight", true) === -1,
  "carousel keyboard delta must follow visual direction in LTR and RTL");
assert(carouselCtx.carouselSwipeDelta(-60) === 1 && carouselCtx.carouselSwipeDelta(60) === -1 &&
  carouselCtx.carouselSwipeDelta(30) === 0,
  "carousel swipe delta must require a deliberate gesture and preserve direction");
assert(profile.indexOf('class="tf-profile-video-hero"') < profile.indexOf('id="profile-services"') &&
  profile.indexOf('id="profile-services"') < profile.indexOf('id="profile-reviews"') &&
  profile.indexOf('id="profile-reviews"') < profile.indexOf('id="profile-about"') &&
  profile.indexOf('id="profile-about"') < profile.indexOf('id="profile-availability"'),
  "profile must preserve the video-first marketplace decision path");
assert(!profile.includes('role="tablist"') && profile.includes('class="tf-profile-mobile-cta"'),
  "profile must expose a continuous sales path with a mobile request action");
assert(profile.includes('showTimeline: timeline.length > 0') && !profile.includes('tp_timeline_empty">'),
  "empty biography and credential sections must collapse instead of occupying decision space");
assert(profile.includes('<a href="#main" class="tf-skip">') && profile.includes('<main id="main"'),
  "profile must expose the shared keyboard skip link");
assert(profile.includes('<nav data-hide-sm class="tf-nav-track"'),
  "profile navigation must use the shared compact-header breakpoint");
assert(profile.includes("document.title = pageTitle"), "localized profile title must be applied at render time");
assert(!profile.includes('value="{{ false }}"') && !profile.includes('profile-legacy'),
  "profile must not retain hidden legacy implementations");
assert(profile.includes('avatar: Tafseel.defaultAvatar') && !profile.includes('src="{{ accountAvatar }}" alt="" width="38"'),
  "reviews must use a neutral avatar, never the current account avatar");
assert(profile.includes('const languageName = item =>') && profile.includes('tf-profile-chip-language" data-i18n-skip'),
  "dynamic profile languages must be localized once and skipped by the mutation translator");
assert(profile.includes('hasReviews: reviewItems.length > 0'),
  "zero-review profiles must use the compact honest empty state");

const browse = readFileSync("Tafseel-Browse-Teachers.dc.html", "utf8");
assert(browse.includes("Tafseel.partyDisplayName(teacher.fullName, teacher.fullNameEnglish)"),
  "comparison must use the canonical bilingual name selection");

const ids = [...profile.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert(new Set(ids).size === ids.length, "profile contains duplicate static IDs");

function TafseelProfileRuleCheck() {
  return T.partyDisplayName("Primary", "English") === "English";
}

console.log("BUG-001 display-name checks passed.");
