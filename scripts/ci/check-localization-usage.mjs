import { existsSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

// Complements check-localization.mjs (EN/AR key-pairing parity). This script instead
// catches the opposite failure mode: a key that IS referenced by Tafseel.t(...)/this.t(...)
// at runtime but does not exist in js/locales.js at all — which paired-key parity alone
// cannot detect, and which silently renders a `⟦missing:key⟧` marker to end users because
// `Tafseel.t(key) || fallback` never falls through (the missing-key marker is truthy).

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
  "Tafseel-Book-Session.dc.html",
  "Tafseel-Payment.dc.html",
  "Tafseel-Mock-Checkout.dc.html"
];

const scripts = ["js/tafseel.js", "js/teacher-apply.js", "js/chat-widget.js", "js/guided-request.js", "js/api.js"];

const localeContext = { window: {} };
runInNewContext(readFileSync("js/locales.js", "utf8"), localeContext);
const locales = localeContext.window.TafseelLocales;
if (!locales?.en) throw new Error("English localization resource is required.");
const enKeys = new Set(Object.keys(locales.en));

const CALL_SITE = /\bt\(([^)]*)\)/g;
const KEY_LITERAL = /(['"])([a-z][a-z0-9_]*)\1/g;
// Comparison operands (sm.trustCode === 'some_value') are data values being tested, never
// the key argument to t(...), even when the comparison sits inside the same t(...) call
// (e.g. inside a ternary). Strip both operand orders before extracting key candidates.
const COMPARISON_OPERAND = new RegExp(
  `(?:${["===", "!==", "==", "!="].map(op => op.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")).join("|")})\\s*(['"])[a-z][a-z0-9_]*\\1` +
    `|(['"])[a-z][a-z0-9_]*\\2\\s*(?:${["===", "!==", "==", "!="].map(op => op.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")).join("|")})`,
  "g"
);

const missing = new Map(); // key -> Set(sources)

for (const path of [...pages, ...scripts]) {
  if (!existsSync(path)) continue;
  const text = readFileSync(path, "utf8");
  for (const call of text.matchAll(CALL_SITE)) {
    const withoutComparisons = call[1].replace(COMPARISON_OPERAND, "");
    for (const literal of withoutComparisons.matchAll(KEY_LITERAL)) {
      const key = literal[2];
      // Only snake_case, multi-segment identifiers look like real locale keys
      // (excludes bare words, CSS custom properties, file names, API paths, etc.).
      if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(key)) continue;
      if (enKeys.has(key)) continue;
      if (!missing.has(key)) missing.set(key, new Set());
      missing.get(key).add(path);
    }
  }
}

if (missing.size) {
  const lines = [...missing.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, sources]) => `  ${key}  (referenced in ${[...sources].sort().join(", ")})`);
  throw new Error(
    `Referenced-but-undefined localization keys (usage coverage, not just EN/AR pairing):\n${lines.join("\n")}`
  );
}

console.log(
  `Localization usage coverage passed — every Tafseel.t()/this.t() key literal across ${pages.length} pages and ${scripts.length} scripts exists in locales.js.`
);
