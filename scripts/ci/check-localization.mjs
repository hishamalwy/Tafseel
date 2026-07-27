import { existsSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const pages = [
  "Tafseel-Landing.dc.html",
  "Tafseel-Browse-Teachers.dc.html",
  "Tafseel-Teacher-Profile.dc.html",
  "Tafseel-Request.dc.html",
  "Tafseel-Student-Dashboard.dc.html",
  "Tafseel-Teacher-Dashboard.dc.html",
  "Tafseel-Quality-Dashboard.dc.html",
  "Tafseel-Admin-Dashboard.dc.html",
  "Tafseel-Auth.dc.html",
  "Tafseel-Teacher-Apply.dc.html",
  "Tafseel-Chat.dc.html",
  "Tafseel-Book-Session.dc.html",
  "Tafseel-Payment.dc.html"
];

const localeContext = { window: {} };
runInNewContext(readFileSync("js/locales.js", "utf8"), localeContext);
const locales = localeContext.window.TafseelLocales;
if (!locales?.en || !locales?.ar) throw new Error("Both English and Arabic resources are required.");

const enKeys = Object.keys(locales.en).sort();
const arKeys = Object.keys(locales.ar).sort();
if (JSON.stringify(enKeys) !== JSON.stringify(arKeys))
  throw new Error("English and Arabic localization keys are not in parity.");
for (const key of enKeys) {
  if (!String(locales.en[key]).trim() || !String(locales.ar[key]).trim())
    throw new Error(`Empty localization value: ${key}`);
  if (String(locales.ar[key]).includes("???"))
    throw new Error(`Corrupt Arabic localization value: ${key}`);
}

const englishValues = new Set(Object.values(locales.en));
const isHumanText = value => {
  if (!value || value.length > 220 || !/[A-Za-z]/.test(value)) return false;
  if (/{{|}}|var\(--|color-mix|=>|===|&&|\|\||<\/|\/>|;|="/.test(value)) return false;
  if (/^(\/|#|\.|data-|aria-|tf-|Tafseel-|&|https?:|mailto:)/.test(value)) return false;
  if (/^[\w.-]+\.(html|js|css|pdf|docx|pptx|zip|png|jpe?g|svg)$/i.test(value)) return false;
  if (/^[a-z][a-zA-Z]*(\.[a-zA-Z]+)+$/.test(value)) return false;
  if (/^[a-z][a-zA-Z_-]*$/.test(value)) return false;
  return true;
};
const normalize = value => value.replace(/\s+/g, " ").trim();

for (const page of pages) {
  if (!existsSync(page)) throw new Error(`Missing published frontend entry point: ${page}`);
  const source = readFileSync(page, "utf8");
  const localePosition = source.indexOf('src="js/locales.js"');
  const runtimePosition = source.indexOf('src="js/tafseel.js"');
  if (localePosition < 0 || runtimePosition < 0 || localePosition > runtimePosition)
    throw new Error(`${page} must load locales.js before tafseel.js.`);

  const markup = source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  const candidates = [
    ...[...markup.matchAll(/>([^<]+)</g)].map(match => normalize(match[1])),
    ...[...markup.matchAll(/\b(?:placeholder|title|aria-label)="([^"]+)"/g)].map(match => normalize(match[1]))
  ];
  for (const candidate of candidates) {
    if (isHumanText(candidate) && !englishValues.has(candidate))
      throw new Error(`${page} has an unregistered visible string: ${candidate}`);
  }
}

// Auth-page structural assertions (mode isolation, Student/Teacher-only self-registration,
// real backend wiring) live in check-auth-ui.mjs, which runs alongside this check.

const css = readFileSync("css/tafseel.css", "utf8");
for (const required of [
  "--font-ar:'Thmanyah Sans'",
  "--font-en:Inter",
  'html[lang="ar"]',
  'html[lang="en"]'
]) {
  if (!css.includes(required)) throw new Error(`Missing bilingual typography rule: ${required}`);
}
for (const font of ["light", "regular", "medium", "bold", "black"]) {
  if (!existsSync(`assets/fonts/thmanyah-sans/thmanyah-sans-${font}.woff2`))
    throw new Error(`Missing Thmanyah font weight: ${font}`);
}
for (const font of ["regular", "medium", "semibold", "bold"]) {
  if (!existsSync(`assets/fonts/inter/inter-${font}.woff2`))
    throw new Error(`Missing Inter font weight: ${font}`);
}

const runtimeSources = [
  ...pages.map(page => readFileSync(page, "utf8")),
  readFileSync("css/tafseel.css", "utf8"),
  readFileSync("js/tafseel.js", "utf8"),
  readFileSync("support.js", "utf8")
].join("\n");
if (/fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com/i.test(runtimeSources))
  throw new Error("Frontend runtime must not depend on an external font or script CDN.");

const attributes = {};
const textNodes = ["Welcome to Tafseel", "Create account"].map(nodeValue => ({
  nodeType: 3,
  nodeValue,
  parentElement: { closest: () => null }
}));
const root = {
  nodeType: 1,
  setAttribute: (name, value) => { attributes[name] = value; },
  querySelectorAll: () => []
};
const storage = new Map([["tafseel-lang", "en"]]);
const runtimeContext = {
  window: { TafseelLocales: locales, MutationObserver: class { observe() {} } },
  document: {
    body: {},
    title: "Sign in — Tafseel",
    documentElement: root,
    readyState: "complete",
    createTreeWalker: () => {
      let index = 0;
      return { nextNode: () => textNodes[index++] || null };
    },
    querySelectorAll: () => [],
    addEventListener() {},
    dispatchEvent() {}
  },
  localStorage: {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value)
  },
  Node: { TEXT_NODE: 3 },
  NodeFilter: { SHOW_TEXT: 4 },
  MutationObserver: class { observe() {} },
  CustomEvent: class {},
  Intl,
  Date,
  Map,
  Object,
  String
};
runtimeContext.window.window = runtimeContext.window;
runInNewContext(readFileSync("js/tafseel.js", "utf8"), runtimeContext);
const runtime = runtimeContext.window.Tafseel;
runtime.setLang("ar");
if (attributes.lang !== "ar" || attributes.dir !== "rtl")
  throw new Error("Arabic switching must set lang=ar and dir=rtl.");
if (!/[\u0600-\u06ff]/.test(textNodes[0].nodeValue) || !/[\u0600-\u06ff]/.test(textNodes[1].nodeValue))
  throw new Error("Arabic switching left visible or hidden auth content untranslated.");
runtime.setLang("en");
if (attributes.lang !== "en" || attributes.dir !== "ltr" || textNodes[0].nodeValue !== "Welcome to Tafseel")
  throw new Error("English switching must restore lang, direction, and visible content.");

console.log(`Localization validation passed for ${pages.length} frontend entry points and ${enKeys.length} paired keys.`);
