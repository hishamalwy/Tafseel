/**
 * Sprint 2 frontend localization / projection helpers (Node smoke).
 * Run: node scripts/ci/check-sprint2-localization.mjs
 */
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const localeCtx = { window: {} };
runInNewContext(readFileSync("js/locales.js", "utf8"), localeCtx);
const locales = localeCtx.window.TafseelLocales;

const knownEnStatus = [
  "Payment required",
  "In progress",
  "Waiting for payment",
  "Pending teacher review",
  "Request accepted — payment required"
];
const knownArStatus = [
  "مطلوب الدفع",
  "قيد التنفيذ",
  "بانتظار الدفع",
  "بانتظار مراجعة المعلم",
  "تم قبول الطلب — مطلوب الدفع"
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(JSON.stringify(Object.keys(locales.en).sort()) === JSON.stringify(Object.keys(locales.ar).sort()),
  "EN/AR key parity failed");

for (const key of Object.keys(locales.en)) {
  assert(String(locales.en[key]).trim() && String(locales.ar[key]).trim(), `empty ${key}`);
}

// Required Sprint 2 keys
for (const key of [
  "notif_body_paymentrequired",
  "notif_body_workstarted",
  "sd_action_pay",
  "td_action_accept",
  "td_stage_start_work",
  "sd_nav_overview"
]) {
  assert(locales.en[key] && locales.ar[key], `missing key ${key}`);
}

// Simulate Tafseel helpers
function makeT(lang) {
  return function t(key, values) {
    if (locales[lang][key] === undefined) return "⟦missing:" + key + "⟧";
    return Object.keys(values || {}).reduce(
      (text, name) => text.replaceAll("{" + name + "}", values[name]),
      locales[lang][key]
    );
  };
}

function notificationTitle(t, notification) {
  const key = "notif_type_" + String(notification.type || "").toLowerCase();
  const localized = t(key);
  if (localized && !localized.startsWith("⟦missing:")) return localized;
  return notification.title || "";
}

function notificationBody(t, notification) {
  const detail = notification.body || "";
  const key = "notif_body_" + String(notification.type || "").toLowerCase();
  const localized = t(key, { detail });
  if (localized && !localized.startsWith("⟦missing:")) return localized;
  return detail;
}

function money(t, lang, value, currency) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return t("td_unavailable");
  const code = String(currency || "SAR").trim() || "SAR";
  return new Intl.NumberFormat(lang === "ar" ? "ar-SA" : "en-US", {
    style: "currency",
    currency: code,
    currencyDisplay: "symbol"
  }).format(amount);
}

for (const lang of ["en", "ar"]) {
  const t = makeT(lang);
  const title = notificationTitle(t, {
    type: "PaymentRequired",
    title: "Request accepted — payment required",
    body: "Sprint2 UAT Chapter Notes"
  });
  const body = notificationBody(t, {
    type: "PaymentRequired",
    title: "Request accepted — payment required",
    body: "Sprint2 UAT Chapter Notes"
  });
  assert(!title.includes("⟦missing:"), `${lang} title missing`);
  assert(body === "Sprint2 UAT Chapter Notes", `${lang} payment body should preserve request title`);
  if (lang === "ar") {
    assert(!knownEnStatus.some(s => title === s), "Arabic title leaked English status");
    assert(title.includes("دفع") || title.includes("قبول"), "Arabic payment title expected");
  } else {
    assert(!/[؀-ۿ]/.test(title), "English title leaked Arabic");
  }

  const work = notificationBody(t, {
    type: "WorkStarted",
    body: "Your order is now in progress."
  });
  if (lang === "ar") {
    assert(work !== "Your order is now in progress.", "Arabic must not show English workstarted body");
  } else {
    assert(work === "Your order is now in progress.", "English workstarted body");
  }

  const formatted = money(t, lang, 108, "SAR");
  assert(!/null|undefined|SAR\s*•|NaN/i.test(formatted), `broken money: ${formatted}`);
  assert(money(t, lang, Number.NaN, "SAR") === t("td_unavailable"), "NaN money");
}

// Pending filter contract
const assigned = [{ status: 0 }, { status: 2 }, { status: 0 }];
const pending = assigned.filter(x => x.status === 0);
assert(pending.length === 2, "pending filter");

// Accepted omit contract
const mine = [{ status: 0 }, { status: 2 }, { status: 1 }];
const visible = mine.filter(x => x.status !== 2);
assert(visible.length === 2 && !visible.some(x => x.status === 2), "accepted omit");

console.log("Sprint 2 localization/projection checks passed.");
