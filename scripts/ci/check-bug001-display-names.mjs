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

assert(T.orderTitle({ requestTitle: "Sprint2 UAT Chapter Notes" }) === "Sprint2 UAT Chapter Notes");
assert(T.orderTitle({ requestTitle: "3f011f19-643b-4d57-9c9a-e44487015d0e" }) === T.t("td_order"));
assert(T.orderTitle({}) === T.t("td_order"));

const teacherDash = readFileSync("Tafseel-Teacher-Dashboard.dc.html", "utf8");
assert(!teacherDash.includes("participantLabel(peerId)"), "teacher still falls back with peerId");
assert(teacherDash.includes("participantLabel(peer || {})"), "teacher should pass peer object");
assert(!/student:'Verified student'/.test(teacherDash), "hardcoded Verified student overwrite remains");

const payment = readFileSync("Tafseel-Payment.dc.html", "utf8");
assert(!/pay_order_id_label.*item\.id/.test(payment), "payment still shows full order GUID");

console.log("BUG-001 display-name checks passed.");
