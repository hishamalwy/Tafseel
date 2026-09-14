/* Design Lab geometry gate — catches overflow / clipping / contrast-free states
   across the whole responsive matrix so screenshots can be reviewed for design
   rather than for defects. DEVELOPMENT ONLY.

   usage: node design-lab-audit.mjs [file...]        (defaults to the winners)
*/
import { chromium } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(process.cwd(), "..", "..");
const LAB = path.join(ROOT, "design-lab", "marketplace");
const files = process.argv.slice(2).length ? process.argv.slice(2) : ["browse-w.html", "profile-w.html"];

const WIDTHS = [375, 390, 768, 1024, 1280, 1440, 1680];
const MODES = [["ar", "light"], ["ar", "dark"], ["en", "light"], ["en", "dark"]];

const browser = await chromium.launch();
const page = await browser.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push({ kind: "pageerror", detail: e.message }));

for (const file of files) {
  for (const w of WIDTHS) {
    for (const [lang, theme] of MODES) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto(pathToFileURL(path.join(LAB, file)).href + `?lang=${lang}&theme=${theme}`,
        { waitUntil: "load", timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      const found = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const out = [];
        // 1. document-level horizontal overflow
        if (document.documentElement.scrollWidth > vw + 1)
          out.push({ type: "page-overflow", el: "html", detail: document.documentElement.scrollWidth + " > " + vw });
        // 2. content escaping a clipping ancestor (a clipped CTA is invisible, not just ugly)
        document.querySelectorAll("*").forEach((el) => {
          const cs = getComputedStyle(el);
          if (cs.overflow === "visible" || cs.display === "none" || cs.position === "fixed") return;
          const pb = el.getBoundingClientRect();
          if (!pb.width) return;
          for (const child of el.children) {
            const cb = child.getBoundingClientRect();
            if (!cb.width) continue;
            const over = Math.max(pb.left - cb.left, cb.right - pb.right);
            if (over > 2) out.push({
              type: "clipped", el: (el.className || el.tagName).toString().slice(0, 44),
              child: (child.className || child.tagName).toString().slice(0, 44), detail: Math.round(over) + "px"
            });
          }
        });
        // 3. tap targets below 40px on touch widths
        if (vw <= 820) {
          document.querySelectorAll("button, a.mk-btn, .mk-chip, select").forEach((el) => {
            const b = el.getBoundingClientRect();
            if (b.height > 0 && b.height < 36) out.push({
              type: "tap-target", el: (el.className || el.tagName).toString().slice(0, 44),
              detail: Math.round(b.height) + "px"
            });
          });
        }
        return out;
      });
      found.forEach((f) => problems.push({ file, w, lang, theme, ...f }));
    }
  }
}
await browser.close();

const uniq = new Map();
for (const p of problems) {
  const key = [p.file, p.type, p.el, p.child].join("|");
  if (!uniq.has(key)) uniq.set(key, { ...p, at: [] });
  uniq.get(key).at.push(`${p.w}-${p.lang}-${p.theme}`);
}
if (!uniq.size) {
  console.log("PASS — no overflow, clipping or undersized tap targets across " +
    files.length * WIDTHS.length * MODES.length + " cells");
} else {
  console.log("FINDINGS (" + uniq.size + " distinct):");
  for (const v of uniq.values())
    console.log(` [${v.type}] ${v.file} ${v.el}${v.child ? " > " + v.child : ""} — ${v.detail} @ ${v.at.slice(0, 4).join(", ")}${v.at.length > 4 ? " …(" + v.at.length + ")" : ""}`);
  process.exitCode = 1;
}
