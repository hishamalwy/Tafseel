/**
 * F-013 regression gate — two checks:
 *
 * 1. (Missing-key check, original) fails if a `src="{{ x }}"` / `href="{{ x }}"` /
 *    `sc-camel-src="{{ x }}"` binding referenced in a production consumer surface's markup has no
 *    matching `x:` key anywhere in that file's render script.
 *
 * 2. (Raw resource-attribute check, added Phase 4 Sprint 0.3) fails if any `<img>`/`<video>`/
 *    `<source>` element uses a literal, browser-recognized `src="{{ ... }}"` (or `srcset`/`poster`)
 *    attribute. Root cause proven in Sprint 0.3: every `.dc.html` file is served byte-for-byte as
 *    static HTML, and `<x-dc>` is a plain (non-inert) custom element, so the browser's HTML parser
 *    sees the literal template markup and eagerly fetches it as a URL *before any JavaScript runs* —
 *    independent of `sc-if` gating and independent of whether the app-level data/fallback is
 *    correct. This is not a race that a "does the key exist" check (rule 1) can catch. The fix is to
 *    write interpolated resource attributes as `sc-camel-src="{{ x }}"` instead of `src="{{ x }}"`
 *    (an existing dc-runtime convention, already used for `sc-camel-value`): the browser's parser
 *    does not recognize `sc-camel-src` as resource-bearing and never fetches it, while the runtime
 *    still maps it to the real `src` DOM property once React resolves and mounts the element.
 *
 * Run: node scripts/ci/check-template-placeholder-leak.mjs
 */
import { readFileSync } from "node:fs";
import { findPage } from "./lib/frontend-pages.mjs";

const SURFACES = [
  "Tafseel-Student-Dashboard.dc.html",
  "Tafseel-Teacher-Dashboard.dc.html",
  "Tafseel-Admin-Dashboard.dc.html",
  "Tafseel-Quality-Dashboard.dc.html",
  "Tafseel-Teacher-Profile.dc.html",
  "Tafseel-Browse-Teachers.dc.html",
  "Tafseel-Request.dc.html",
  "Tafseel-Payment.dc.html",
  "Tafseel-Landing.dc.html",
  "Tafseel-Book-Session.dc.html",
  "Tafseel-Mock-Checkout.dc.html",
  "Tafseel-Auth.dc.html"
];

let failures = [];

for (const file of SURFACES) {
  let src;
  try {
    src = readFileSync(findPage(file) ?? file, "utf8");
  } catch (_) {
    continue; // surface not present in this checkout
  }

  // The template body (markup) and the DC component logic (script) are split at the
  // `<script type="text/x-dc" data-dc-script ...>` tag specifically — NOT the first `<script>` tag
  // in the file, which is `<script src="./support.js">` in `<head>`, well before `<x-dc>` even
  // starts. Splitting on the first `<script>` silently truncated `markup` to ~140 characters,
  // making every check below a no-op against real content (found and fixed Phase 4 Sprint 0.4).
  const markupEnd = src.indexOf('<script type="text/x-dc"');
  const markup = markupEnd === -1 ? src : src.slice(0, markupEnd);
  const script = markupEnd === -1 ? "" : src.slice(markupEnd);

  const bindingPattern = /(?:src|href|sc-camel-src)="\{\{\s*([A-Za-z_$][\w$.]*?)\s*\}\}"/g;
  const seen = new Set();
  let m;
  while ((m = bindingPattern.exec(markup))) {
    const root = m[1].split(".")[0];
    seen.add(root);
  }

  // sc-for/sc-if loop variables (`as="name"`) are locally scoped, not top-level renderVals() keys —
  // they must never be flagged as "missing" by rule 1.
  const loopVars = new Set();
  const asPattern = /\bas="([A-Za-z_$][\w$]*)"/g;
  let am;
  while ((am = asPattern.exec(markup))) loopVars.add(am[1]);

  for (const name of seen) {
    if (loopVars.has(name)) continue;
    const escaped = name.replace(/[$]/g, "\\$");
    // A key is "produced" if it's assigned as an explicit object-literal key (`name:`) or via ES6
    // shorthand property syntax (bare `name,` / `name}` / `name\n` inside a `return { ... }`).
    const producesKey =
      new RegExp("\\b" + escaped + "\\s*:").test(script) ||
      new RegExp("[{,]\\s*" + escaped + "\\s*[,}\\n]").test(script);
    if (!producesKey) {
      failures.push(`${file}: "{{ ${name} }}" used in a src/href/sc-camel-src attribute but no "${name}" key found in the render script`);
    }
  }

  // Rule 2: a raw, browser-recognized resource attribute must never carry an interpolated value.
  const rawResourcePattern = /<(?:img|video|source)\b[^>]*?\s(src|srcset|poster)="\{\{[^}]*\}\}"/g;
  let rm;
  while ((rm = rawResourcePattern.exec(markup))) {
    failures.push(`${file}: raw "${rm[1]}=\"{{ ... }}\"" on an <img>/<video>/<source> element — the browser's HTML parser will eagerly fetch the literal template text before JavaScript runs; use "sc-camel-${rm[1]}" instead`);
  }

  // Rule 3 (added Foundation Browser Certification): a raw SVG geometry attribute must never carry
  // an interpolated value. Unlike src/href, these don't trigger a network fetch, but the browser's
  // SVG parser still eagerly validates the literal template text before JavaScript runs, producing
  // a console parse error and a blank/broken shape on first paint (proven on Teacher Profile's
  // `<path d="{{ sv.iconPath }}" />`). Use "sc-camel-<attr>" instead, same convention as Rule 2.
  const rawGeometryPattern = /<(?:path|circle|ellipse|line|polygon|polyline|rect)\b[^>]*?\s(d|points|cx|cy|r|rx|ry|x1|y1|x2|y2)="\{\{[^}]*\}\}"/g;
  let gm;
  while ((gm = rawGeometryPattern.exec(markup))) {
    failures.push(`${file}: raw "${gm[1]}=\"{{ ... }}\"" on an SVG geometry element — the browser's SVG parser will eagerly parse the literal template text as geometry before JavaScript runs, producing a console error and a broken shape; use "sc-camel-${gm[1]}" instead`);
  }
}

if (failures.length) {
  console.error("Template placeholder leak check FAILED:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}

console.log(`Template placeholder leak check passed (${SURFACES.length} surfaces scanned).`);
